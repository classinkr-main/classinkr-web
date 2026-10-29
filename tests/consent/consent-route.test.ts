import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const insert = vi.fn()
const from = vi.fn(() => ({ insert }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

const { checkRateLimitDistributed } = vi.hoisted(() => ({
  checkRateLimitDistributed: vi.fn(),
}))
vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimitDistributed,
  getClientIp: () => "203.0.113.9",
}))

import { CONSENT_POLICY_VERSION, parseConsent } from "@/lib/consent/consent"
import { POST } from "@/app/api/consent/route"

function consentRequest(body: unknown, origin: string | null = "https://classin.co.kr", clientCommit = true) {
  return new NextRequest("https://classin.co.kr/api/consent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      ...(clientCommit ? { "x-consent-client-commit": "1" } : {}),
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify(body),
  })
}

/** Set-Cookie 헤더에서 쿠키 값을 꺼내 실제 브라우저처럼 디코딩한다. */
function readSetCookie(res: Response, name: string) {
  const header = res.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`))
  if (!header) return null
  const value = header.slice(name.length + 1).split(";")[0]
  return { value: decodeURIComponent(value), attributes: header.toLowerCase() }
}

const grantAll = {
  analytics: true,
  marketing: true,
  policy_version: CONSENT_POLICY_VERSION,
}

describe("POST /api/consent", () => {
  beforeEach(() => {
    from.mockClear()
    insert.mockReset()
    insert.mockResolvedValue({ error: null })
    checkRateLimitDistributed.mockReset()
    checkRateLimitDistributed.mockResolvedValue({ allowed: true, remaining: 59, resetAt: 0 })
  })

  it("동의를 저장하고 클라이언트 커밋용 기록을 내려준다", async () => {
    const res = await POST(consentRequest(grantAll))
    expect(res.status).toBe(200)
    expect(readSetCookie(res, "cln_consent")).toBeNull()
    expect((await res.json()).record).toMatchObject({
      v: CONSENT_POLICY_VERSION,
      analytics: true,
      marketing: true,
      s: 1,
    })
    expect(from).toHaveBeenCalledWith("consent_logs")
  })

  it("정책 버전이 어긋나면 저장하지 않는다", async () => {
    const res = await POST(consentRequest({ ...grantAll, policy_version: "2020-01-01" }))
    expect(res.status).toBe(400)
    expect(readSetCookie(res, "cln_consent")).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it.each([
    null,
    [],
    "true",
    0,
    {},
    { ...grantAll, analytics: "false" },
    { ...grantAll, marketing: "false" },
    { ...grantAll, analytics: 1 },
    { ...grantAll, marketing: null },
    { analytics: true, policy_version: CONSENT_POLICY_VERSION },
    { marketing: false, policy_version: CONSENT_POLICY_VERSION },
  ])("객체와 두 boolean 선택이 아닌 입력(%j)은 400으로 거부한다", async (body) => {
    const res = await POST(consentRequest(body))
    expect(res.status).toBe(400)
    expect(readSetCookie(res, "cln_consent")).toBeNull()
    expect(readSetCookie(res, "cln_aid")).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it.each([
    { analytics: false, marketing: false },
    { analytics: false, marketing: true },
    { analytics: true, marketing: false },
    { analytics: true, marketing: true },
  ])("명시적인 boolean 선택은 기록에 그대로 반영한다: %j", async (choice) => {
    const res = await POST(consentRequest({ ...choice, policy_version: CONSENT_POLICY_VERSION }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, record: choice })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ categories: { necessary: true, ...choice } }))
  })

  it("레이트리밋에 걸리면 저장과 쿠키 발급을 거부한다", async () => {
    checkRateLimitDistributed.mockResolvedValue({ allowed: false, remaining: 0, resetAt: 0 })

    const res = await POST(consentRequest(grantAll))
    expect(res.status).toBe(429)
    expect(from).not.toHaveBeenCalled()
    expect(readSetCookie(res, "cln_consent")).toBeNull()
  })

  it("클라이언트 커밋 프로토콜은 쿠키를 보내지 않고 결정과 익명 ID를 반환한다", async () => {
    const res = await POST(consentRequest(grantAll, "https://classin.co.kr", true))
    expect(res.status).toBe(200)
    expect(res.headers.get("x-consent-client-commit")).toBe("1")
    expect(readSetCookie(res, "cln_consent")).toBeNull()
    expect(readSetCookie(res, "cln_aid")).toBeNull()
    expect(readSetCookie(res, "cln_revoke_a")).toBeNull()
    expect(readSetCookie(res, "cln_revoke_m")).toBeNull()
    expect(await res.json()).toMatchObject({ ok: true, stored: true, record: { v: CONSENT_POLICY_VERSION, analytics: true, marketing: true } })
  })

  it("감사 로그 insert가 실패하면 서버는 미동기화 기록을 반환한다", async () => {
    insert.mockResolvedValue({ error: { message: "boom" } })

    const res = await POST(consentRequest(grantAll))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, stored: false, record: { s: 0 } })
    expect(readSetCookie(res, "cln_consent")).toBeNull()
  })

  it("분석 동의 시 익명 식별자를 발급한다", async () => {
    const res = await POST(consentRequest(grantAll))
    expect((await res.json()).anonymous_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(readSetCookie(res, "cln_aid")).toBeNull()
  })

  it("분석을 거부하면 익명 식별자를 만료시킨다", async () => {
    const res = await POST(
      consentRequest({ analytics: false, marketing: false, policy_version: CONSENT_POLICY_VERSION })
    )
    expect((await res.json()).anonymous_id).toBeNull()
    expect(readSetCookie(res, "cln_aid")).toBeNull()
  })

  it("구버전 허용 요청에는 성공 형태의 거절 기록과 새로고침 안내만 반환한다", async () => {
    const res = await POST(consentRequest(grantAll, "https://classin.co.kr", false))
    expect(res.status).toBe(200)
    expect(res.headers.get("x-consent-refresh-required")).toBe("1")
    expect(await res.json()).toMatchObject({ ok: true, record: { analytics: false, marketing: false }, message: expect.stringContaining("새로고침") })
    expect(parseConsent(readSetCookie(res, "cln_consent")!.value)).toMatchObject({ analytics: false, marketing: false, s: 0 })
    expect(readSetCookie(res, "cln_aid")?.attributes).toContain("max-age=0")
    for (const name of ["cln_revoke_a", "cln_revoke_m"]) {
      const marker = readSetCookie(res, name)
      expect(marker?.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(marker?.attributes).toContain("path=/")
      expect(marker?.attributes).toContain("samesite=lax")
      expect(marker?.attributes).toContain("secure")
      expect(marker?.attributes).toContain("max-age=33782400")
    }
    expect(from).not.toHaveBeenCalled()
  })

  it("구버전 거절은 rate limit과 무관하게 즉시 거절 쿠키를 내려준다", async () => {
    checkRateLimitDistributed.mockResolvedValue({ allowed: false })
    const res = await POST(consentRequest({ analytics: false, marketing: false }, "https://classin.co.kr", false))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, stored: false })
    expect(parseConsent(readSetCookie(res, "cln_consent")!.value)).toMatchObject({ analytics: false, marketing: false, s: 0 })
    expect(readSetCookie(res, "cln_aid")?.attributes).toContain("max-age=0")
  })

  it("구버전 거절 응답마다 두 철회 마커가 모두 바뀐다", async () => {
    const body = { analytics: false, marketing: false }
    const first = await POST(consentRequest(body, "https://classin.co.kr", false))
    const second = await POST(consentRequest(body, "https://classin.co.kr", false))
    for (const name of ["cln_revoke_a", "cln_revoke_m"]) {
      expect(readSetCookie(first, name)?.value).toBeTruthy()
      expect(readSetCookie(second, name)?.value).not.toBe(readSetCookie(first, name)?.value)
    }
  })

  it.each([null, [], {}, { analytics: "false", marketing: false }, { analytics: false, marketing: null }])(
    "구버전의 잘못된 입력(%j)은 400과 거절 쿠키를 반환한다",
    async (body) => {
      const res = await POST(consentRequest(body, "https://classin.co.kr", false))
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ ok: false })
      expect(parseConsent(readSetCookie(res, "cln_consent")!.value)).toMatchObject({ analytics: false, marketing: false, s: 0 })
      expect(readSetCookie(res, "cln_aid")?.attributes).toContain("max-age=0")
      expect(readSetCookie(res, "cln_revoke_a")?.value).toBeTruthy()
      expect(readSetCookie(res, "cln_revoke_m")?.value).toBeTruthy()
      expect(from).not.toHaveBeenCalled()
    },
  )

  it("cross-origin 요청은 계속 차단한다", async () => {
    const res = await POST(consentRequest(grantAll, "https://evil.example"))
    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it("깨진 본문은 400", async () => {
    const req = new NextRequest("https://classin.co.kr/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://classin.co.kr", "x-consent-client-commit": "1" },
      body: "{not json",
    })
    expect((await POST(req)).status).toBe(400)
  })
})
