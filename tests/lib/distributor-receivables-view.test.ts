import { describe, expect, it } from "vitest"

import {
  DEFAULT_RECEIVABLE_VIEW_STATE,
  RECEIVABLE_AGE_BUCKETS,
  ageBucketOf,
  buildReceivableMonthlyFlow,
  buildReceivableViewRows,
  buildReceivablesCsvRows,
  diffDays,
  filterReceivableRows,
  groupReceivableRows,
  parseReceivableViewState,
  sortReceivableRows,
  summarizeReceivables,
  writeReceivableViewState,
  type ReceivableFilters,
  type ReceivableViewState,
} from "@/lib/distributor-receivables-view"
import type { DistributorReceivablePayment } from "@/lib/distributor-settlements"
import type { DistributorReceivableRow } from "@/lib/repositories/distributor-settlements"

const TODAY = "2026-11-20"

function makeRow(overrides: Partial<DistributorReceivableRow> = {}): DistributorReceivableRow {
  return {
    id: "s1",
    quoteDocumentId: "q1",
    dealId: null,
    fulfillmentMode: "C",
    sourceVersionId: null,
    issuedVersionId: null,
    distributorName: "퀴드러닝",
    distributorContactName: null,
    distributorEmail: null,
    distributorPhone: null,
    issueTrigger: "on_accept",
    autoEmail: true,
    priceTemplateId: null,
    lines: [],
    vatIncluded: true,
    subtotalAmount: 1_000_000,
    vatAmount: 0,
    totalAmount: 1_000_000,
    customerTotalAmount: 1_200_000,
    status: "issued",
    paidAmount: 0,
    dueDate: "2026-12-01",
    issuedAt: "2026-11-10T03:00:00.000Z",
    issueReason: "customer_accepted",
    shareToken: null,
    emailStatus: "not_sent",
    emailedAt: null,
    emailError: null,
    reviewRequiredReason: null,
    notes: null,
    cancelledAt: null,
    installedAt: null,
    createdAt: "2026-11-10T03:00:00.000Z",
    updatedAt: "2026-11-10T03:00:00.000Z",
    quoteNumber: "Q-001",
    customerName: "성남여고",
    dealTitle: "전자칠판 도입",
    ...overrides,
  }
}

function view(overrides: Partial<DistributorReceivableRow> = {}, today = TODAY) {
  return buildReceivableViewRows([makeRow(overrides)], [], today)[0]
}

describe("diffDays / ageBucketOf", () => {
  it("diffs dates by UTC midnight, across month, year and leap boundaries", () => {
    expect(diffDays("2026-11-20", "2026-11-20")).toBe(0)
    expect(diffDays("2026-11-10", "2026-11-20")).toBe(10)
    expect(diffDays("2025-12-31", "2026-01-01")).toBe(1)
    expect(diffDays("2028-02-28", "2028-03-01")).toBe(2)
    expect(diffDays("2026-11-20", "2026-11-10")).toBe(-10)
    // DST 가 있는 달에도 정확히 일수 차.
    expect(diffDays("2026-03-01", "2026-04-01")).toBe(31)
  })

  it("buckets at the 30/31, 60/61, 90/91 boundaries", () => {
    expect(ageBucketOf(0)).toBe("d0_30")
    expect(ageBucketOf(30)).toBe("d0_30")
    expect(ageBucketOf(31)).toBe("d31_60")
    expect(ageBucketOf(60)).toBe("d31_60")
    expect(ageBucketOf(61)).toBe("d61_90")
    expect(ageBucketOf(90)).toBe("d61_90")
    expect(ageBucketOf(91)).toBe("d91_plus")
    expect(ageBucketOf(400)).toBe("d91_plus")
  })
})

describe("buildReceivableViewRows", () => {
  it("computes age, bucket, due days and payment info", () => {
    const rows = [makeRow({ id: "a", paidAmount: 400_000, status: "partial", dueDate: "2026-11-15" })]
    const payments: DistributorReceivablePayment[] = [
      { settlementId: "a", amount: 100_000, paidOn: "2026-11-12" },
      { settlementId: "a", amount: 300_000, paidOn: "2026-11-18" },
      { settlementId: "other", amount: 999, paidOn: "2026-11-19" },
    ]
    const [v] = buildReceivableViewRows(rows, payments, TODAY)
    expect(v.outstanding).toBe(600_000)
    expect(v.overdue).toBe(true)
    expect(v.issuedDate).toBe("2026-11-10")
    expect(v.issuedMonth).toBe("2026-11")
    expect(v.ageDays).toBe(10)
    expect(v.ageBucket).toBe("d0_30")
    expect(v.daysUntilDue).toBe(-5)
    expect(v.dueMissing).toBe(false)
    expect(v.lastPaidOn).toBe("2026-11-18")
    expect(v.paymentCount).toBe(2)
  })

  it("uses the KST date near midnight (UTC 15:00 is the next KST day)", () => {
    expect(view({ issuedAt: "2026-11-09T14:59:59.000Z" }).issuedDate).toBe("2026-11-09")
    expect(view({ issuedAt: "2026-11-09T15:00:00.000Z" }).issuedDate).toBe("2026-11-10")
    expect(view({ issuedAt: "2026-10-31T15:00:00.000Z" }).issuedMonth).toBe("2026-11")
    expect(view({ issuedAt: "2026-10-31T14:00:00.000Z" }).issuedMonth).toBe("2026-10")
  })

  it("keeps input order and handles missing issuedAt / future issue dates", () => {
    const rows = [makeRow({ id: "x", issuedAt: null }), makeRow({ id: "y", issuedAt: "2026-12-25T00:00:00.000Z" })]
    const views = buildReceivableViewRows(rows, [], TODAY)
    expect(views.map((v) => v.row.id)).toEqual(["x", "y"])
    expect(views[0]).toMatchObject({ issuedDate: null, issuedMonth: null, ageDays: null, ageBucket: null })
    expect(views[1].ageDays).toBe(0)
    expect(views[1].ageBucket).toBe("d0_30")
  })

  it("flags a missing due date only while money is outstanding", () => {
    expect(view({ dueDate: null }).dueMissing).toBe(true)
    expect(view({ dueDate: null }).daysUntilDue).toBeNull()
    expect(view({ dueDate: null, status: "paid", paidAmount: 1_000_000 }).dueMissing).toBe(false)
  })

  it("has no outstanding, bucket or due flag for paid, draft and cancelled", () => {
    const paid = view({ status: "paid", paidAmount: 1_000_000, dueDate: null })
    expect(paid).toMatchObject({ outstanding: 0, ageBucket: null, dueMissing: false, overdue: false })
    for (const status of ["draft", "cancelled"] as const) {
      const v = view({ status, dueDate: null, issuedAt: "2026-01-01T00:00:00.000Z" })
      expect(v).toMatchObject({ outstanding: 0, ageBucket: null, dueMissing: false, overdue: false })
      expect(v.ageDays).toBeGreaterThan(300)
    }
  })
})

describe("filterReceivableRows", () => {
  const rows = buildReceivableViewRows(
    [
      makeRow({ id: "a", customerName: "성남여고", quoteNumber: "Q-001", dueDate: "2026-11-01" }),
      makeRow({ id: "b", customerName: "대전고", quoteNumber: "Q-002", dueDate: null, distributorName: "다른총판" }),
      makeRow({ id: "c", status: "partial", paidAmount: 100, issuedAt: "2026-08-01T00:00:00.000Z" }),
      makeRow({ id: "d", status: "paid", paidAmount: 1_000_000 }),
    ],
    [],
    TODAY
  )
  const base: ReceivableFilters = { ...DEFAULT_RECEIVABLE_VIEW_STATE.filters, status: "all" }
  const ids = (f: Partial<ReceivableFilters>) => filterReceivableRows(rows, { ...base, ...f }).map((v) => v.row.id)

  it("filters by status", () => {
    expect(ids({ status: "all" })).toEqual(["a", "b", "c", "d"])
    expect(ids({ status: "open" })).toEqual(["a", "b", "c"])
    expect(ids({ status: "overdue" })).toEqual(["a"])
    expect(ids({ status: "due_missing" })).toEqual(["b"])
    expect(ids({ status: "partial" })).toEqual(["c"])
    expect(ids({ status: "paid" })).toEqual(["d"])
  })

  it("filters by distributor, bucket and month", () => {
    expect(ids({ distributor: "다른총판" })).toEqual(["b"])
    expect(ids({ bucket: "d91_plus" })).toEqual(["c"])
    expect(ids({ month: "2026-08" })).toEqual(["c"])
  })

  it("matches the query case/space-insensitively across the four fields", () => {
    expect(ids({ query: "  성남 여고 " })).toEqual(["a", "c", "d"])
    expect(ids({ query: "q-002" })).toEqual(["b"])
    expect(ids({ query: "다른" })).toEqual(["b"])
    expect(ids({ query: "전자 칠판" })).toEqual(["a", "b", "c", "d"])
    expect(ids({ query: "없는검색어" })).toEqual([])
  })
})

describe("sortReceivableRows", () => {
  const rows = buildReceivableViewRows(
    [
      makeRow({ id: "a", totalAmount: 300, dueDate: "2026-12-05", customerName: "나", issuedAt: "2026-11-01T00:00:00.000Z" }),
      makeRow({ id: "b", totalAmount: 100, dueDate: null, customerName: null, issuedAt: null }),
      makeRow({ id: "c", totalAmount: 300, dueDate: "2026-12-01", customerName: "가", issuedAt: "2026-11-05T00:00:00.000Z" }),
      makeRow({ id: "d", totalAmount: 200, dueDate: "2026-12-01", customerName: "다", issuedAt: "2026-11-05T00:00:00.000Z" }),
    ],
    [],
    TODAY
  )
  const ids = (key: Parameters<typeof sortReceivableRows>[1]["key"], dir: "asc" | "desc") =>
    sortReceivableRows(rows, { key, dir }).map((v) => v.row.id)

  it("puts null values last in both directions", () => {
    expect(ids("issued", "desc")).toEqual(["c", "d", "a", "b"])
    expect(ids("issued", "asc")).toEqual(["a", "c", "d", "b"])
    expect(ids("due", "asc")).toEqual(["c", "d", "a", "b"])
    expect(ids("due", "desc")).toEqual(["a", "c", "d", "b"])
    expect(ids("customer", "asc")).toEqual(["c", "a", "d", "b"])
    expect(ids("customer", "desc")).toEqual(["d", "a", "c", "b"])
    expect(ids("age", "asc").at(-1)).toBe("b")
    expect(ids("age", "desc").at(-1)).toBe("b")
  })

  it("breaks ties by issue time descending, then id", () => {
    // total 300 동점: a(11-01) vs c(11-05) → 발행이 늦은 c 먼저(방향과 무관).
    expect(ids("total", "desc")).toEqual(["c", "a", "d", "b"])
    expect(ids("total", "asc")).toEqual(["b", "d", "c", "a"])
    // due 동점 c,d 는 발행 시각이 같아 id 순.
    expect(ids("due", "asc").slice(0, 2)).toEqual(["c", "d"])
  })

  it("does not mutate the input", () => {
    const before = rows.map((v) => v.row.id)
    sortReceivableRows(rows, { key: "total", dir: "asc" })
    expect(rows.map((v) => v.row.id)).toEqual(before)
  })
})

describe("groupReceivableRows", () => {
  const rows = buildReceivableViewRows(
    [
      makeRow({ id: "a", distributorName: "A총판", totalAmount: 100, issuedAt: "2026-11-10T00:00:00.000Z" }),
      makeRow({ id: "b", distributorName: "B총판", totalAmount: 900, issuedAt: "2026-09-10T00:00:00.000Z" }),
      makeRow({ id: "c", distributorName: "A총판", totalAmount: 200, issuedAt: null }),
      makeRow({ id: "d", distributorName: "B총판", totalAmount: 50, status: "paid", paidAmount: 50, issuedAt: "2026-11-02T00:00:00.000Z" }),
      makeRow({ id: "e", distributorName: "A총판", totalAmount: 500, dueDate: "2026-11-01", issuedAt: "2026-06-01T00:00:00.000Z" }),
    ],
    [],
    TODAY
  )

  it("returns [] for no rows and one group for none", () => {
    expect(groupReceivableRows([], "distributor")).toEqual([])
    expect(groupReceivableRows([], "none")).toEqual([])
    const [all] = groupReceivableRows(rows, "none")
    expect(all).toMatchObject({ key: "all", label: "전체", count: 5 })
  })

  it("groups by distributor, largest outstanding first, with subtotals", () => {
    const groups = groupReceivableRows(rows, "distributor")
    expect(groups.map((g) => g.label)).toEqual(["B총판", "A총판"])
    const b = groups[0]
    expect(b).toMatchObject({ count: 2, totalAmount: 950, paidAmount: 50, outstandingAmount: 900, overdueCount: 0, overdueAmount: 0 })
    const a = groups[1]
    expect(a).toMatchObject({ count: 3, totalAmount: 800, outstandingAmount: 800, overdueCount: 1, overdueAmount: 500 })
    // 그룹 안의 순서는 입력 순서.
    expect(a.rows.map((v) => v.row.id)).toEqual(["a", "c", "e"])
  })

  it("groups by issued month, newest first, no-date last", () => {
    expect(groupReceivableRows(rows, "issued_month").map((g) => g.label)).toEqual([
      "2026-11",
      "2026-09",
      "2026-06",
      "발행일 없음",
    ])
  })

  it("groups by age bucket, oldest first, no-outstanding last", () => {
    const groups = groupReceivableRows(rows, "age_bucket")
    expect(groups.map((g) => g.label)).toEqual(["91일 이상", "61~90일", "30일 이내", "미수 없음"])
    expect(groups[3].rows.map((v) => v.row.id)).toEqual(["c", "d"])
  })
})

describe("summarizeReceivables", () => {
  it("returns null rate and four fixed zero buckets for empty input", () => {
    const s = summarizeReceivables([])
    expect(s.collectionRate).toBeNull()
    expect(s.oldestAgeDays).toBeNull()
    expect(s.count).toBe(0)
    expect(s.buckets.map((b) => b.bucket)).toEqual([...RECEIVABLE_AGE_BUCKETS])
    expect(s.buckets.every((b) => b.count === 0 && b.amount === 0)).toBe(true)
  })

  it("totals open, overdue, due-missing and bucket amounts", () => {
    const rows = buildReceivableViewRows(
      [
        makeRow({ id: "a", totalAmount: 1000, paidAmount: 250, status: "partial", dueDate: "2026-11-01", issuedAt: "2026-11-10T00:00:00.000Z" }),
        makeRow({ id: "b", totalAmount: 500, dueDate: null, issuedAt: "2026-07-01T00:00:00.000Z" }),
        makeRow({ id: "c", totalAmount: 500, paidAmount: 500, status: "paid", issuedAt: "2026-01-01T00:00:00.000Z" }),
      ],
      [],
      TODAY
    )
    const s = summarizeReceivables(rows)
    expect(s).toMatchObject({
      count: 3,
      totalAmount: 2000,
      paidAmount: 750,
      openCount: 2,
      openAmount: 1250,
      overdueCount: 1,
      overdueAmount: 750,
      dueMissingCount: 1,
      dueMissingAmount: 500,
    })
    expect(s.collectionRate).toBeCloseTo(0.375)
    // 완납 건(c, 323일)은 oldest 에 들어가지 않는다.
    expect(s.oldestAgeDays).toBe(diffDays("2026-07-01", TODAY))
    expect(s.buckets.map((b) => [b.count, b.amount])).toEqual([
      [1, 750],
      [0, 0],
      [0, 0],
      [1, 500],
    ])
    expect(s.buckets[0].label).toBe("30일 이내")
  })
})

describe("buildReceivableMonthlyFlow", () => {
  it("spans a year boundary and fills empty months with zero", () => {
    const rows = buildReceivableViewRows(
      [
        makeRow({ id: "a", totalAmount: 100, issuedAt: "2026-01-05T00:00:00.000Z" }),
        makeRow({ id: "b", totalAmount: 50, issuedAt: "2025-12-20T00:00:00.000Z" }),
        makeRow({ id: "old", totalAmount: 999, issuedAt: "2025-01-01T00:00:00.000Z" }),
      ],
      [],
      "2026-01-15"
    )
    const payments: DistributorReceivablePayment[] = [
      { settlementId: "a", amount: 30, paidOn: "2026-01-10" },
      { settlementId: "b", amount: 20, paidOn: "2025-12-31" },
      { settlementId: "b", amount: 5, paidOn: "2026-01-02" },
      { settlementId: "missing", amount: 777, paidOn: "2026-01-03" },
    ]
    expect(buildReceivableMonthlyFlow(rows, payments, { months: 3, today: "2026-01-15" })).toEqual([
      { month: "2025-11", issuedAmount: 0, collectedAmount: 0 },
      { month: "2025-12", issuedAmount: 50, collectedAmount: 20 },
      { month: "2026-01", issuedAmount: 100, collectedAmount: 35 },
    ])
  })
})

describe("buildReceivablesCsvRows", () => {
  it("emits the header and numeric cells", () => {
    const rows = buildReceivableViewRows(
      [makeRow({ id: "a", status: "partial", paidAmount: 400_000, dueDate: "2026-11-15" }), makeRow({ id: "b", issuedAt: null, dueDate: null, customerName: null })],
      [{ settlementId: "a", amount: 400_000, paidOn: "2026-11-18" }],
      TODAY
    )
    const csv = buildReceivablesCsvRows(rows)
    expect(csv).toHaveLength(3)
    expect(csv[0]).toEqual([
      "고객", "견적번호", "딜", "총판", "상태", "발행일", "발행 사유", "청구액(원)", "입금액(원)",
      "남은 금액(원)", "입금 기한", "기한 경과", "발행 후 경과일", "경과 구간", "최근 입금일", "입금 횟수",
    ])
    expect(csv[1]).toEqual([
      "성남여고", "Q-001", "전자칠판 도입", "퀴드러닝", "일부 입금", "2026-11-10", "고객 동의",
      1_000_000, 400_000, 600_000, "2026-11-15", "Y", 10, "30일 이내", "2026-11-18", 1,
    ])
    expect(typeof csv[1][7]).toBe("number")
    expect(typeof csv[1][12]).toBe("number")
    expect(csv[2]).toEqual(["", "Q-001", "전자칠판 도입", "퀴드러닝", "입금 대기", "", "고객 동의", 1_000_000, 0, 1_000_000, "", "", "", "", "", 0])
  })
})

describe("view state URL", () => {
  it("writes no keys for the default state", () => {
    const params = new URLSearchParams()
    writeReceivableViewState(params, DEFAULT_RECEIVABLE_VIEW_STATE)
    expect(params.toString()).toBe("")
  })

  it("round-trips a non-default state", () => {
    const state: ReceivableViewState = {
      filters: { query: "성남 여고", status: "overdue", distributor: "퀴드러닝", bucket: "d61_90", month: "2026-09" },
      sort: { key: "outstanding", dir: "desc" },
      group: "age_bucket",
    }
    const params = new URLSearchParams()
    writeReceivableViewState(params, state)
    expect(params.get("rsort")).toBe("outstanding.desc")
    expect(parseReceivableViewState(new URLSearchParams(params.toString()))).toEqual(state)
    expect(parseReceivableViewState(new URLSearchParams())).toEqual(DEFAULT_RECEIVABLE_VIEW_STATE)
  })

  it("removes keys when values return to default and preserves unrelated keys", () => {
    const params = new URLSearchParams("tab=receivables&quote=abc&rq=old&rst=paid&rgroup=distributor")
    writeReceivableViewState(params, DEFAULT_RECEIVABLE_VIEW_STATE)
    expect(params.get("tab")).toBe("receivables")
    expect(params.get("quote")).toBe("abc")
    expect(params.has("rq")).toBe(false)
    expect(params.has("rst")).toBe(false)
    expect(params.has("rgroup")).toBe(false)
  })

  it("falls back to defaults for invalid values and trims/truncates the query", () => {
    const parsed = parseReceivableViewState(
      new URLSearchParams({ rst: "nope", rage: "d1", rmonth: "2026-9", rsort: "bogus.up", rgroup: "x", rq: `  ${"a".repeat(150)}  ` })
    )
    expect(parsed.filters).toMatchObject({ status: "open", bucket: null, month: null })
    expect(parsed.filters.query).toBe("a".repeat(100))
    expect(parsed.sort).toEqual({ key: "issued", dir: "desc" })
    expect(parsed.group).toBe("none")
    expect(parseReceivableViewState(new URLSearchParams("rsort=age")).sort).toEqual({ key: "issued", dir: "desc" })
  })
})
