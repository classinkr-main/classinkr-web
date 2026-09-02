import { describe, expect, it, vi } from "vitest"

// lib/google.ts는 콜드 스타트 비용 때문에 googleapis를 top-level import하지 않고,
// sheets/calendar/gmail/drive를 "실제 메서드가 처음 호출되는 시점에만 googleapis를
// 동적 import하는" 지연 프록시로 노출한다. vitest.config.ts는 "@/lib/google"을 테스트용
// 더미 모크(tests/__mocks__/lib-google.ts)로 전역 별칭 처리하므로, 이 지연 프록시 자체를
// 검증하려면 별칭을 우회하는 상대 경로로 실제 모듈을 불러와야 한다.
const mocks = vi.hoisted(() => {
  let authConstructCount = 0
  class GoogleAuthStub {
    opts: unknown
    constructor(opts: unknown) {
      authConstructCount++
      this.opts = opts
    }
  }
  const listFn = vi.fn(async (params: { range: string }) => ({
    data: { values: [["ok", params.range]] },
  }))
  const eventsListFn = vi.fn(async (params: { calendarId: string }) => ({
    data: { items: [{ id: "ev1", calendarId: params.calendarId }] },
  }))
  const sheetsFactory = vi.fn(() => ({
    spreadsheets: { values: { get: listFn } },
  }))
  const calendarFactory = vi.fn(() => ({
    events: { list: eventsListFn },
  }))
  return {
    GoogleAuthStub,
    authConstructCount: () => authConstructCount,
    listFn,
    eventsListFn,
    sheetsFactory,
    calendarFactory,
  }
})

vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: mocks.GoogleAuthStub },
    sheets: mocks.sheetsFactory,
    calendar: mocks.calendarFactory,
    gmail: vi.fn(),
    drive: vi.fn(),
  },
}))

describe("lib/google — googleapis 지연 프록시", () => {
  it("import만으로는 googleapis 클라이언트를 만들지 않고, 첫 메서드 호출 시에만 로드해 재사용한다", async () => {
    const { sheets } = await import("../../lib/google")

    // 모듈을 불러온 시점(top-level 평가)에는 아직 아무 것도 만들어지지 않아야 한다.
    expect(mocks.sheetsFactory).not.toHaveBeenCalled()
    expect(mocks.authConstructCount()).toBe(0)

    const res1 = await sheets.spreadsheets.values.get({ spreadsheetId: "s1", range: "A1" })
    expect(res1.data.values).toEqual([["ok", "A1"]])
    expect(mocks.sheetsFactory).toHaveBeenCalledTimes(1)
    expect(mocks.authConstructCount()).toBe(1)

    const res2 = await sheets.spreadsheets.values.get({ spreadsheetId: "s1", range: "A2" })
    expect(res2.data.values).toEqual([["ok", "A2"]])
    // 클라이언트·인증 생성은 인스턴스당 1회만 — 두 번째 호출은 캐시된 인스턴스를 재사용한다.
    expect(mocks.sheetsFactory).toHaveBeenCalledTimes(1)
    expect(mocks.authConstructCount()).toBe(1)
    expect(mocks.listFn).toHaveBeenCalledTimes(2)
  })

  it("sheets와 calendar는 서로 독립된 클라이언트로 지연 생성된다", async () => {
    const { calendar } = await import("../../lib/google")

    expect(mocks.calendarFactory).not.toHaveBeenCalled()

    const res = await calendar.events.list({ calendarId: "primary" })
    expect(res.data.items).toEqual([{ id: "ev1", calendarId: "primary" }])
    expect(mocks.calendarFactory).toHaveBeenCalledTimes(1)
  })
})
