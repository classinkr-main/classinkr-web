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

function consentRequest(body: unknown, origin: string | null = "https://classin.co.kr") {
  return new NextRequest("https://classin.co.kr/api/consent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
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

  it("동의를 저장하고 읽을 수 있는 쿠키를 내려준다", async () => {
    const res = await POST(consentRequest(grantAll))
    expect(res.status).toBe(200)

    const cookie = readSetCookie(res, "cln_consent")
    expect(cookie).not.toBeNull()
    // 클라이언트 파서가 그대로 읽을 수 있어야 한다(인코딩 왕복 회귀 방지).
    expect(parseConsent(cookie!.value)).toMatchObject({
      v: CONSENT_POLICY_VERSION,
      analytics: true,
      marketing: true,
      s: 1,
    })
    expect(cookie!.attributes).toContain("path=/")
    expect(cookie!.attributes).toContain("secure")
    expect(from).toHaveBeenCalledWith("consent_logs")
  })

  it("정책 버전이 어긋나도 거부하지 않고 서버 정본으로 저장한다", async () => {
    // 회귀 방지: 예전에는 400을 반환해 동의가 영영 저장되지 않고 배너가 무한 재노출됐다.
    const res = await POST(consentRequest({ ...grantAll, policy_version: "2020-01-01" }))
    expect(res.status).toBe(200)
    expect(parseConsent(readSetCookie(res, "cln_consent")!.value)).not.toBeNull()
  })

  it("레이트리밋에 걸려도 쿠키는 내려주고 감사 로그만 건너뛴다", async () => {
    checkRateLimitDistributed.mockResolvedValue({ allowed: false, remaining: 0, resetAt: 0 })

    const res = await POST(consentRequest(grantAll))
    expect(res.status).toBe(200)
    expect(from).not.toHaveBeenCalled()
    // 동기화되지 않았으므로 s:0 — 클라이언트가 다음 방문에 재시도한다.
    expect(parseConsent(readSetCookie(res, "cln_consent")!.value)?.s).toBe(0)
  })

  it("감사 로그 insert가 실패해도 동의 쿠키는 저장된다", async () => {
    insert.mockResolvedValue({ error: { message: "boom" } })

    const res = await POST(consentRequest(grantAll))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, stored: false })
    expect(parseConsent(readSetCookie(res, "cln_consent")!.value)?.s).toBe(0)
  })

  it("분석 동의 시 익명 식별자를 발급한다", async () => {
    const res = await POST(consentRequest(grantAll))
    expect(readSetCookie(res, "cln_aid")?.value).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("분석을 거부하면 익명 식별자를 만료시킨다", async () => {
    const res = await POST(
      consentRequest({ analytics: false, marketing: false, policy_version: CONSENT_POLICY_VERSION })
    )
    const aid = readSetCookie(res, "cln_aid")
    expect(aid?.value).toBe("")
    expect(aid?.attributes).toContain("max-age=0")
  })

  it("cross-origin 요청은 계속 차단한다", async () => {
    const res = await POST(consentRequest(grantAll, "https://evil.example"))
    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it("깨진 본문은 400", async () => {
    const req = new NextRequest("https://classin.co.kr/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://classin.co.kr" },
      body: "{not json",
    })
    expect((await POST(req)).status).toBe(400)
  })
})
