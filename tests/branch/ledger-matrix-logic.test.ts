import { describe, expect, it } from "vitest"

import {
  MATRIX_FROZEN_WIDTH,
  MATRIX_WIDTH,
  bucketTone,
  buildMatrixLedger,
  buildMatrixLeaves,
  filterMatrixLines,
  lineLeafBucket,
  rowWeekBuckets,
  sortMatrixLines,
  sumMatrixLeaf,
  weekIndexOfDate,
} from "@/components/admin/branch/ledger/ledger-matrix-logic"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

const FY = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]

function row(partial: Partial<LedgerRevenueRow>): LedgerRevenueRow {
  return { id: partial.customer ?? "x", customer: "x", manager: "A", team: "BD", region: null, revenue: 0, ledgerOrigin: "sheet", ...partial }
}

describe("matrix leaves", () => {
  it("11월 기준 — 지난달 7개 중 뒤 4개만 고정, left 누적 276·348·420·492", () => {
    const leaves = buildMatrixLeaves({ months: FY, currentMonth: "2026-11", currentWeek: 2, expanded: new Set(["2026-11"]), pinPast: true })
    expect(leaves[0]).toMatchObject({ key: "fy", width: 88, pinned: false })
    const past = leaves.filter((leaf) => leaf.past)
    expect(past).toHaveLength(7)
    const pinned = leaves.filter((leaf) => leaf.pinned)
    expect(pinned.map((leaf) => leaf.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"])
    expect(pinned.map((leaf) => leaf.left)).toEqual([276, 348, 420, 492])
    expect(MATRIX_FROZEN_WIDTH).toBe(276)
    expect(leaves.filter((leaf) => leaf.lastPast).map((leaf) => leaf.key)).toEqual(["m:2026-10"])
    const cur = leaves.filter((leaf) => leaf.month === "2026-11")
    expect(cur.map((leaf) => leaf.kind)).toEqual(["month-total", "week", "week", "week", "week", "week"])
    expect(cur[0]).toMatchObject({ label: "11 합계", width: MATRIX_WIDTH.monthTotal, currentMonth: true, start: true })
    expect(cur[3]).toMatchObject({ key: "w:2026-11:2", label: "w3", width: 58, currentWeek: true })
    expect(cur.filter((leaf) => leaf.currentWeek)).toHaveLength(1)
    expect(leaves.find((leaf) => leaf.key === "m:2026-12")?.band).toBe(true)
    expect(leaves.find((leaf) => leaf.key === "m:2027-01")?.band).toBe(false)
    expect(leaves.find((leaf) => leaf.key === "m:2027-02")?.band).toBe(true)
  })

  it("펼친 지난달은 합계·주 잎 전부 pinned, pinPast 끄면 없음", () => {
    const leaves = buildMatrixLeaves({ months: FY, currentMonth: "2026-06", currentWeek: 0, expanded: new Set(["2026-05"]), pinPast: true })
    expect(leaves.filter((leaf) => leaf.month === "2026-05").every((leaf) => leaf.pinned)).toBe(true)
    expect(leaves.find((leaf) => leaf.key === "w:2026-05:4")?.left).toBe(276 + 72 + 84 + 58 * 4)
    expect(leaves.find((leaf) => leaf.key === "w:2026-05:4")?.lastPast).toBe(true)
    const off = buildMatrixLeaves({ months: FY, currentMonth: "2026-06", currentWeek: 0, expanded: new Set(), pinPast: false })
    expect(off.some((leaf) => leaf.pinned)).toBe(false)
    expect(off.filter((leaf) => leaf.past)).toHaveLength(2)
  })

  it("currentMonth 가 FY 밖이면 past·current·band·pinned 없음", () => {
    const leaves = buildMatrixLeaves({ months: FY, currentMonth: "2027-05", currentWeek: 1, expanded: new Set(), pinPast: true })
    expect(leaves).toHaveLength(13)
    expect(leaves.some((leaf) => leaf.past || leaf.currentMonth || leaf.band || leaf.pinned || leaf.lastPast)).toBe(false)
  })

  it("주차 인덱스는 UTC 일 기준", () => {
    expect(weekIndexOfDate(new Date("2026-11-01T00:00:00Z"))).toBe(0)
    expect(weekIndexOfDate(new Date("2026-11-08T00:00:00Z"))).toBe(1)
    expect(weekIndexOfDate(new Date("2026-11-20T00:00:00Z"))).toBe(2)
    expect(weekIndexOfDate(new Date("2026-11-30T00:00:00Z"))).toBe(4)
  })
})

describe("주차 확도 4규칙", () => {
  const M = "2026-11"
  it("월합계만이면 주차는 비고 monthOnly", () => {
    const r = row({ monthlyPayments: { [M]: 100 }, monthlyConfirmed: { [M]: 100 } })
    const result = rowWeekBuckets(r, M)
    expect(result.monthOnly).toBe(true)
    expect(result.weeks.every((week) => week.total === 0)).toBe(true)
  })
  it("ⓐ 월이 한 확도뿐이면 주차도 그 확도(색 글자보다 우선)", () => {
    const r = row({ monthlyPayments: { [M]: 100 }, monthlyConfirmed: { [M]: 100 }, weeklyPayments: { [M]: [0, 0, 60, 40, 0] }, weeklyColors: { [M]: "--kk-" } })
    const { weeks } = rowWeekBuckets(r, M)
    expect(weeks[2]).toMatchObject({ total: 60, confirmed: 60, open: 0 })
    expect(weeks[3]).toMatchObject({ total: 40, confirmed: 40 })
  })
  it("ⓒ 섞여 있으면 시트 주차 색 글자", () => {
    const r = row({ monthlyPayments: { [M]: 100 }, monthlyConfirmed: { [M]: 60 }, monthlyHighConfidence: { [M]: 0 }, weeklyPayments: { [M]: [0, 60, 40, 0, 0] }, weeklyColors: { [M]: "-rk--" } })
    const { weeks } = rowWeekBuckets(r, M)
    expect(weeks[1]).toMatchObject({ confirmed: 60, open: 0 })
    expect(weeks[2]).toMatchObject({ open: 40, confirmed: 0 })
  })
  it("ⓑ 섞여 있고 초안이면 주차별 상태, null 은 예정", () => {
    const r = row({
      ledgerOrigin: "draft", draftMonth: M, revenue: 100, monthlyPayments: { [M]: 100 }, monthlyConfirmed: { [M]: 60 },
      weeklyPayments: { [M]: [60, 40, 0, 0, 0] },
      draftMetadata: { weeklyConfidence: ["confirmed", null, null, null, null], weekly: [60, 40, 0, 0, 0] },
    })
    const { weeks } = rowWeekBuckets(r, M)
    expect(weeks[0].confirmed).toBe(60)
    expect(weeks[1].open).toBe(40)
  })
  it("ⓓ 색도 없으면 월 비율대로 비례 배분", () => {
    const r = row({ monthlyPayments: { [M]: 100 }, monthlyConfirmed: { [M]: 50 }, monthlyHighConfidence: { [M]: 0 }, weeklyPayments: { [M]: [0, 100, 0, 0, 0] } })
    const { weeks } = rowWeekBuckets(r, M)
    expect(weeks[1].confirmed).toBeCloseTo(50)
    expect(weeks[1].open).toBeCloseTo(50)
  })
})

describe("buildMatrixLedger·필터·정렬", () => {
  const rows = [
    row({ id: "sw", customer: "가온어학원", region: "서울", productVersion: "ClassIn 라이선스", status: "Renew", dealType: "Direct", monthlyPayments: { "2026-10": 50 }, monthlyConfirmed: { "2026-10": 50 }, weeklyPayments: { "2026-10": [0, 50, 0, 0, 0] } }),
    row({ id: "hw", customer: "가온어학원", region: "서울", productVersion: "전자칠판", status: "New", dealType: "Channel", monthlyPayments: { "2026-11": 30 }, monthlyConfirmed: { "2026-11": 0 } }),
    row({ id: "b", customer: "한빛수학", manager: "B", productVersion: "ClassIn", status: "Renew", dealType: "Direct", monthlyPayments: { "2026-10": 200 }, monthlyConfirmed: { "2026-10": 200 } }),
    row({ id: "zero", customer: "빈곳", monthlyPayments: {} }),
  ]
  const ledger = buildMatrixLedger(rows, FY, "none")

  it("고객 1줄·FY 0 제외·큰 순, 라벨 합침·rare", () => {
    expect(ledger.lines.map((line) => line.label)).toEqual(["한빛수학", "가온어학원"])
    const kaon = ledger.lines[1]
    expect(kaon.product).toBe("SW·HW")
    expect(kaon.contract).toBe("갱신·신규")
    expect(kaon.channel).toBe("직접·채널")
    expect(kaon.region).toBe("서울")
    expect(kaon.productRare && kaon.contractRare && kaon.channelRare).toBe(true)
    expect(ledger.lines[0].productRare).toBe(false)
    expect(ledger.lines[0].region).toBe("")
    expect(kaon.locked).toBe(false)
    expect(ledger.lines[0].locked).toBe(true)
    expect(kaon.byMonth["2026-10"].weeks[1].total).toBe(50)
    expect(kaon.byMonth["2026-11"].monthOnly).toBe(true)
    expect(kaon.monthOnlyMonths).toContain("2026-11")
  })

  it("filterMatrixLines — 검색 + 키 AND(접힌 달 주 키도)", () => {
    const [b, kaon] = ledger.lines
    expect(filterMatrixLines(ledger.lines, { query: "가온", valueKeys: [] })).toEqual([kaon])
    expect(filterMatrixLines(ledger.lines, { query: "", valueKeys: ["m:2026-10"] })).toEqual([b, kaon])
    expect(filterMatrixLines(ledger.lines, { query: "", valueKeys: ["m:2026-10", "m:2026-11"] })).toEqual([kaon])
    expect(filterMatrixLines(ledger.lines, { query: "", valueKeys: ["w:2026-10:1"] })).toEqual([kaon])
  })

  it("sortMatrixLines — 글자/금액/기본", () => {
    expect(sortMatrixLines(ledger.lines, null)).toBe(ledger.lines)
    expect(sortMatrixLines(ledger.lines, { key: "customer", dir: "asc" }).map((l) => l.label)).toEqual(["가온어학원", "한빛수학"])
    expect(sortMatrixLines(ledger.lines, { key: "m:2026-11", dir: "desc" }).map((l) => l.label)).toEqual(["가온어학원", "한빛수학"])
    expect(sortMatrixLines(ledger.lines, { key: "fy", dir: "asc" }).map((l) => l.label)).toEqual(["가온어학원", "한빛수학"])
  })

  it("sumMatrixLeaf·lineLeafBucket·bucketTone", () => {
    expect(sumMatrixLeaf(ledger.lines, { key: "m:2026-10" }).total).toBe(250)
    expect(sumMatrixLeaf(ledger.lines, { key: "fy" }).total).toBe(280)
    expect(lineLeafBucket(ledger.lines[1], { key: "w:2026-10:1" }).total).toBe(50)
    expect(bucketTone({ total: 0, confirmed: 0, high: 0, open: 0 })).toBe("empty")
    expect(bucketTone({ total: 10, confirmed: 10, high: 0, open: 0 })).toBe("confirmed")
    expect(bucketTone({ total: 10, confirmed: 0, high: 10, open: 0 })).toBe("high-confidence")
    expect(bucketTone({ total: 10, confirmed: 0, high: 0, open: 10 })).toBe("expected")
    expect(bucketTone({ total: 10, confirmed: 5, high: 0, open: 5 })).toBe("mixed")
  })

  it("묶기 — 제품 섹션", () => {
    const grouped = buildMatrixLedger(rows, FY, "product")
    expect(grouped.sections.map((s) => s.label).sort()).toEqual(["HW", "SW"])
  })
})
