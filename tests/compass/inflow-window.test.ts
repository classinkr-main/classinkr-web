import { describe, expect, it } from "vitest"

import { compassInflowInWindow, compassInflowWindowFilter } from "@/lib/compass/inflow-window"

// 2026-09-14 R2 F12 — Compass 신규 리드는 last_inflow_at 이 비어 있다. 기간 유입은 created_at 과 함께 봐야 한다.

describe("compassInflowWindowFilter", () => {
  it("생성 또는 최신 재유입이 [from, to] 안인 OR 필터를 만든다", () => {
    expect(compassInflowWindowFilter("2026-09-12T15:00:00.000Z", "2026-09-14T05:30:00.000Z")).toBe(
      "and(created_at.gte.2026-09-12T15:00:00.000Z,created_at.lte.2026-09-14T05:30:00.000Z)," +
        "and(last_inflow_at.gte.2026-09-12T15:00:00.000Z,last_inflow_at.lte.2026-09-14T05:30:00.000Z)"
    )
  })

  it("to 가 없으면 하한만 건다", () => {
    expect(compassInflowWindowFilter("2026-09-12T15:00:00.000Z")).toBe(
      "created_at.gte.2026-09-12T15:00:00.000Z,last_inflow_at.gte.2026-09-12T15:00:00.000Z"
    )
  })

  it("시각은 Date 로 정규화해 싣는다 — 오프셋 표기도 UTC ISO 로", () => {
    expect(compassInflowWindowFilter("2026-09-13T00:00:00+09:00")).toBe(
      "created_at.gte.2026-09-12T15:00:00.000Z,last_inflow_at.gte.2026-09-12T15:00:00.000Z"
    )
  })

  it("깨진 시각·필터 구문을 끼우려는 값은 던진다(원문을 필터에 싣지 않는다)", () => {
    expect(() => compassInflowWindowFilter("not-a-date")).toThrow(RangeError)
    expect(() => compassInflowWindowFilter("2026-09-12T15:00:00.000Z", "x),id.gt.(0")).toThrow(RangeError)
    expect(() => compassInflowWindowFilter("")).toThrow(RangeError)
  })
})

describe("compassInflowInWindow", () => {
  const from = Date.parse("2026-09-13T15:00:00.000Z") // 9/14 00:00 KST
  const to = Date.parse("2026-09-14T05:30:00.000Z") // 9/14 14:30 KST

  it("F12 회귀: 오늘 생성되고 last_inflow_at 이 비어 있는 신규 리드를 센다", () => {
    expect(compassInflowInWindow({ created_at: "2026-09-14T01:00:00.000Z", last_inflow_at: null }, from, to)).toEqual({
      kind: "new",
      at: "2026-09-14T01:00:00.000Z",
      atMs: Date.parse("2026-09-14T01:00:00.000Z"),
    })
  })

  it("생성은 창 밖, 최신 재유입이 창 안이면 재유입(시각은 재유입 시각)", () => {
    expect(
      compassInflowInWindow({ created_at: "2026-07-01T00:00:00.000Z", last_inflow_at: "2026-09-14T02:00:00.000Z" }, from, to)
    ).toMatchObject({ kind: "reinflow", at: "2026-09-14T02:00:00.000Z" })
  })

  it("같은 창 안에서 생성 뒤 다시 들어오면 신규 1건 — 최초 유입 시각", () => {
    expect(
      compassInflowInWindow({ created_at: "2026-09-14T01:00:00.000Z", last_inflow_at: "2026-09-14T04:00:00.000Z" }, from, to)
    ).toMatchObject({ kind: "new", at: "2026-09-14T01:00:00.000Z" })
  })

  it("둘 다 창 밖이면 null — 경계는 포함", () => {
    expect(compassInflowInWindow({ created_at: "2026-09-13T14:59:59.999Z", last_inflow_at: null }, from, to)).toBeNull()
    expect(
      compassInflowInWindow({ created_at: "2026-07-01T00:00:00.000Z", last_inflow_at: "2026-09-14T05:30:00.001Z" }, from, to)
    ).toBeNull()
    expect(compassInflowInWindow({ created_at: "2026-09-13T15:00:00.000Z", last_inflow_at: null }, from, to)).toMatchObject({
      kind: "new",
    })
    expect(
      compassInflowInWindow({ created_at: "2026-07-01T00:00:00.000Z", last_inflow_at: "2026-09-14T05:30:00.000Z" }, from, to)
    ).toMatchObject({ kind: "reinflow" })
  })

  it("깨진 시각은 창에 넣지 않는다", () => {
    expect(compassInflowInWindow({ created_at: "nonsense", last_inflow_at: null }, from, to)).toBeNull()
    expect(compassInflowInWindow({ created_at: null, last_inflow_at: "nonsense" }, from, to)).toBeNull()
    // 생성 시각이 깨져도 재유입 시각이 멀쩡하면 재유입으로 센다
    expect(compassInflowInWindow({ created_at: "nonsense", last_inflow_at: "2026-09-14T02:00:00.000Z" }, from, to)).toMatchObject({
      kind: "reinflow",
    })
  })
})
