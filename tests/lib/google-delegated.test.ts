import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 팀원 캘린더 대행(도메인 전체 위임) 클라이언트.
 *
 * 지키는 것: ①범위가 calendar.readonly **하나뿐**이다(위임은 전사에 걸리므로 쓰기 범위가
 * 섞이면 서비스 계정이 전 직원 캘린더를 쓸 수 있게 된다) ②subject 마다 한 번만 만든다
 * ③공용 lib/google.ts 의 인증을 건드리지 않는다.
 */

const gapi = vi.hoisted(() => ({
  GoogleAuth: vi.fn(),
  calendar: vi.fn(() => ({ events: { list: vi.fn() } })),
}))

vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: gapi.GoogleAuth },
    calendar: gapi.calendar,
  },
}))

const ENV = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@project.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
}
const saved: Record<string, string | undefined> = {}

beforeEach(async () => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  gapi.GoogleAuth.mockClear()
  gapi.calendar.mockClear()
  const mod = await import("@/lib/google-delegated")
  mod.resetDelegatedClients()
})

afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("calendarAs", () => {
  it("범위가 calendar.readonly 하나뿐이다 — 쓰기 범위가 섞이면 위임이 전 직원 캘린더 쓰기를 연다", async () => {
    const { calendarAs } = await import("@/lib/google-delegated")
    await calendarAs("heesung.shin@classin.com")

    expect(gapi.GoogleAuth).toHaveBeenCalledTimes(1)
    const opts = gapi.GoogleAuth.mock.calls[0][0]
    expect(opts.scopes).toEqual(["https://www.googleapis.com/auth/calendar.readonly"])
  })

  it("subject 를 그 팀원으로 세워 대행한다", async () => {
    const { calendarAs } = await import("@/lib/google-delegated")
    await calendarAs("somang.jin@classin.com")
    expect(gapi.GoogleAuth.mock.calls[0][0].clientOptions).toEqual({
      subject: "somang.jin@classin.com",
    })
  })

  it("같은 subject 는 한 번만 만든다 — 요청마다 새로 만들면 토큰 교환이 그만큼 늘어난다", async () => {
    const { calendarAs } = await import("@/lib/google-delegated")
    await calendarAs("a@classin.com")
    await calendarAs("a@classin.com")
    await calendarAs("a@classin.com")
    expect(gapi.GoogleAuth).toHaveBeenCalledTimes(1)
    expect(gapi.calendar).toHaveBeenCalledTimes(1)
  })

  it("subject 가 다르면 따로 만든다", async () => {
    const { calendarAs } = await import("@/lib/google-delegated")
    await calendarAs("a@classin.com")
    await calendarAs("b@classin.com")
    expect(gapi.GoogleAuth).toHaveBeenCalledTimes(2)
  })

  it("줄바꿈이 이스케이프된 개인키를 되돌려 넘긴다", async () => {
    const { calendarAs } = await import("@/lib/google-delegated")
    await calendarAs("a@classin.com")
    expect(gapi.GoogleAuth.mock.calls[0][0].credentials.private_key).toContain("\n")
    expect(gapi.GoogleAuth.mock.calls[0][0].credentials.private_key).not.toContain("\\n")
  })
})

describe("calendarForMember — 두 길을 다 살려 둔다", () => {
  it("기본은 대행이다", async () => {
    const { calendarForMember } = await import("@/lib/google-delegated")
    await calendarForMember("a@classin.com")
    expect(gapi.GoogleAuth.mock.calls[0][0].clientOptions).toEqual({ subject: "a@classin.com" })
  })

  it("위임이 거부된 뒤에는 대행을 건너뛰고 공유 방식으로 읽는다 — 실패할 토큰 교환을 반복하지 않는다", async () => {
    const { calendarForMember, noteDelegationDenied } = await import("@/lib/google-delegated")
    noteDelegationDenied(0)
    await calendarForMember("a@classin.com", 1_000)
    // 공유 클라이언트에는 subject 가 없다
    expect(gapi.GoogleAuth.mock.calls[0][0].clientOptions).toBeUndefined()
    expect(gapi.GoogleAuth.mock.calls[0][0].scopes).toEqual([
      "https://www.googleapis.com/auth/calendar.readonly",
    ])
  })

  it("한 시간이 지나면 저절로 다시 대행을 시도한다 — 하드 비활성이 아니다", async () => {
    const { calendarForMember, noteDelegationDenied } = await import("@/lib/google-delegated")
    noteDelegationDenied(0)
    await calendarForMember("a@classin.com", 60 * 60_000 + 1)
    expect(gapi.GoogleAuth.mock.calls[0][0].clientOptions).toEqual({ subject: "a@classin.com" })
  })
})

describe("isDelegationDenied", () => {
  it("실측된 위임 미부여 오류를 잡는다 — code 는 401 이라 숫자로는 못 잡는다", async () => {
    const { isDelegationDenied } = await import("@/lib/google-delegated")
    const real = Object.assign(
      new Error(
        "unauthorized_client: Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested.",
      ),
      { code: 401 },
    )
    expect(isDelegationDenied(real)).toBe(true)
  })

  it("평범한 미공유(404)는 위임 문제가 아니다", async () => {
    const { isDelegationDenied } = await import("@/lib/google-delegated")
    expect(isDelegationDenied(Object.assign(new Error("Not Found"), { code: 404 }))).toBe(false)
  })
})

describe("hasDelegationCredentials", () => {
  it("자격이 다 있으면 true", async () => {
    const { hasDelegationCredentials } = await import("@/lib/google-delegated")
    expect(hasDelegationCredentials()).toBe(true)
  })

  it("하나라도 없으면 false — 호출부가 조용히 건너뛴다", async () => {
    delete process.env.GOOGLE_PRIVATE_KEY
    const { hasDelegationCredentials } = await import("@/lib/google-delegated")
    expect(hasDelegationCredentials()).toBe(false)
  })
})
