import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import type { BranchPipelineRow } from "@/components/admin/branch/types"
import { listRevRevenue } from "@/lib/branch/computations/pipeline"
import { splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"
import { ledgerMonthSplit } from "@/lib/branch/computations/revenue-core"
import {
  buildLedgerOverlay,
  createSheetRowResolver,
  mergeLedgerIntoDeals,
  type LedgerOverlayDraft,
  type LedgerOverlayEntry,
  type LedgerOverlayInput,
  type LedgerRevenueRow,
} from "@/lib/branch/ledger-overlay"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

// 장부 오버레이(D1) — 12/1 잠금 뒤 새 매출의 원본이 되는 "시트 행 + 적용 장부 행" 합성의 동작 테스트(F-30).
// 예전엔 SalesLedgerWorkbench 의 useMemo 라 소스 문자열로만 지켰다. 모든 데이터는 가명(예시학원N · 예시A~D).

const TODAY_YM = "2026-11"
const ROW_ID_1 = "r_000000000001"
const ROW_ID_2 = "r_000000000002"
const ROW_ID_3 = "r_000000000003"

function sheetRow(overrides: Partial<BranchPipelineRow> = {}): BranchPipelineRow {
  return {
    id: "line-1",
    sheetRow: 12,
    customer: "예시학원1",
    manager: "예시A",
    team: "BD",
    region: "서울",
    status: "Renew",
    dealType: "Direct",
    productVersion: "ClassIn 연간",
    firstPayment: "2025-05-01",
    contractTarget: 120_000,
    revenue: 0,
    monthlyPayments: { "2026-11": 30_000 },
    monthlyConfirmed: { "2026-11": 10_000 },
    monthlyHighConfidence: { "2026-11": 20_000 },
    monthlyRed: { "2026-11": true },
    weeklyPayments: { "2026-11": [10_000, 20_000, 0, 0, 0] },
    rowId: ROW_ID_1,
    syncedAt: "2026-11-24T12:00:00.000Z",
    ...overrides,
  }
}

function entry(overrides: Partial<LedgerOverlayEntry> = {}): LedgerOverlayEntry {
  return {
    id: "e-1",
    draftId: "d-1",
    entryType: "manual-edit",
    entryStatus: "active",
    sourceDealId: "line-1",
    sourceSheetRow: 12,
    sourceSnapshot: {},
    customer: "예시학원1",
    manager: "예시A",
    team: "BD",
    month: "2026-11",
    amount: 35_000,
    note: "",
    appliedAt: "2026-11-20T01:00:00.000Z",
    metadata: { confidence: "confirmed", week: "month" },
    ...overrides,
  }
}

function draft(overrides: Partial<LedgerOverlayDraft> = {}): LedgerOverlayDraft {
  return {
    id: "d-9",
    kind: "new-row",
    status: "applied",
    sourceSheetRow: null,
    sourceSnapshot: {},
    customer: "예시학원9",
    manager: "예시B",
    team: "BD",
    month: "2026-11",
    amount: 4_000,
    note: "",
    metadata: { confidence: "expected", week: "w2" },
    appliedAt: "2026-11-21T01:00:00.000Z",
    updatedAt: "2026-11-21T01:00:00.000Z",
    ...overrides,
  }
}

function baseline(month: string, weeks: number[], rowId: string | null = ROW_ID_1) {
  return {
    v: 1,
    rowId,
    sheetRow: 12,
    customer: "예시학원1",
    month,
    weeks: weeks.map((value) => ({ value, color: "k" })),
    capturedAt: "2026-11-19T00:00:00.000Z",
  }
}

function overlay(input: Partial<LedgerOverlayInput> & Pick<LedgerOverlayInput, "sheetRows">) {
  return buildLedgerOverlay({ ledgerEntries: [], ...input })
}

function monthSum(rows: LedgerRevenueRow[], month: string) {
  return rows.reduce((sum, row) => sum + (Number(row.monthlyPayments?.[month]) || 0), 0)
}

describe("원본 시트 행 찾기 — 재동기화로 행 id 가 바뀌어도 같은 칸을 대체한다", () => {
  it("1순위 Row ID: 번호·id·고객이 모두 바뀌어도 초안 baseline 의 Row ID 로 찾는다", () => {
    const moved = sheetRow({ id: "line-NEW", sheetRow: 40, customer: "예시학원1(본원)", rowId: ROW_ID_1 })
    const decoy = sheetRow({ id: "line-X", sheetRow: 12, rowId: ROW_ID_2 })
    const result = overlay({
      sheetRows: [moved, decoy],
      ledgerEntries: [entry({ sourceDealId: "line-OLD", sourceSnapshot: { sheetBaseline: baseline("2026-11", [10_000, 20_000], ROW_ID_1) } })],
    })
    expect(result.overrides.get("line-NEW")).toEqual(new Set(["2026-11"]))
    expect(result.overrides.has("line-X")).toBe(false)
    expect(result.unresolved).toEqual([])
    expect(result.adjustedSheetRows.find((row) => row.id === "line-NEW")?.monthlyPayments).toEqual({})
  })

  it("Row ID 는 초안 목록의 스냅샷에서도 읽는다(항목 스냅샷에 없을 때)", () => {
    const moved = sheetRow({ id: "line-NEW", sheetRow: 40, rowId: ROW_ID_3 })
    const result = overlay({
      sheetRows: [moved, sheetRow({ id: "line-X", sheetRow: 41, rowId: ROW_ID_2 })],
      ledgerEntries: [entry({ sourceDealId: "line-OLD", sourceSheetRow: 99 })],
      drafts: [draft({ id: "d-1", kind: "edit-row", status: "applied", sourceSnapshot: { sheetBaseline: baseline("2026-11", [], ROW_ID_3) } })],
    })
    expect(result.overrides.get("line-NEW")).toEqual(new Set(["2026-11"]))
  })

  it("2·3순위: Row ID 가 없으면 같은 id → 같은 시트 행 번호 + 같은 고객으로 찾는다", () => {
    const reimported = sheetRow({ id: "line-NEW", rowId: null })
    const result = overlay({ sheetRows: [reimported], ledgerEntries: [entry({ sourceDealId: "line-OLD" })] })
    expect(result.overrides.get("line-NEW")).toEqual(new Set(["2026-11"]))
    // 원본 30,000 은 빠지고 정정 35,000 만 남는다(이중 계상 없음).
    expect(monthSum(result.rows, "2026-11")).toBe(35_000)
  })

  it("4순위: 행 번호까지 바뀌면 같은 고객 + 같은 상품인 행이 하나일 때만 찾는다", () => {
    const moved = sheetRow({ id: "line-NEW", sheetRow: 15, rowId: null, customer: "예시 학원1" })
    const other = sheetRow({ id: "line-Y", sheetRow: 16, rowId: null, customer: "예시학원2" })
    const correction = entry({ sourceDealId: "line-OLD", sourceSnapshot: { productVersion: "ClassIn 연간" } })
    const one = overlay({ sheetRows: [moved, other], ledgerEntries: [correction] })
    expect(one.overrides.get("line-NEW")).toEqual(new Set(["2026-11"]))

    const twin = sheetRow({ id: "line-TWIN", sheetRow: 17, rowId: null, customer: "예시학원1" })
    const ambiguous = overlay({ sheetRows: [moved, twin], ledgerEntries: [correction] })
    expect(ambiguous.overrides.size).toBe(0)
    expect(ambiguous.unresolved.map((row) => row.id)).toEqual(["ledger-e-1"])
    // 못 찾은 정정은 따로 더해진다(화면이 경고한다).
    expect(monthSum(ambiguous.rows, "2026-11")).toBe(30_000 + 30_000 + 35_000)
  })

  it("createSheetRowResolver 는 서버 행(listRevRevenue 결과)에도 그대로 쓴다", () => {
    const resolve = createSheetRowResolver([{ id: "deal-1", customer: "예시학원1", sheetRow: 12, rowId: ROW_ID_1, productVersion: null }])
    expect(resolve({ sheetRowId: ROW_ID_1, customer: "아무개" })?.id).toBe("deal-1")
  })
})

describe("상쇄 — reversed 항목과 상쇄된 초안은 어느 경로로도 되살아나지 않는다", () => {
  it("활성 항목만 행이 되고, 상쇄된 항목은 빠진다", () => {
    const result = overlay({
      sheetRows: [sheetRow()],
      ledgerEntries: [entry({ entryStatus: "reversed" }), entry({ id: "e-2", draftId: "d-2", entryType: "manual-new", customer: "예시학원9", amount: 1_000 })],
    })
    expect(result.entryRows.map((row) => row.id)).toEqual(["ledger-e-2"])
    expect(result.overrides.size).toBe(0)
    expect(monthSum(result.rows, "2026-11")).toBe(30_000 + 1_000)
  })

  it("항목이 없을 때 안전망(적용 초안)도 reversedDraftIds 의 초안은 되살리지 않는다", () => {
    const result = overlay({
      sheetRows: [sheetRow()],
      ledgerEntries: [],
      drafts: [draft({ id: "d-rev" }), draft({ id: "d-ok", amount: 2_000 })],
      reversedDraftIds: new Set(["d-rev"]),
    })
    expect(result.appliedRows.map((row) => row.id)).toEqual(["draft-d-ok"])
  })

  it("항목이 있으면 항목 없는 적용 초안만 덧붙이고, 같은 draftId 는 한 번만 센다", () => {
    const result = overlay({
      sheetRows: [sheetRow()],
      ledgerEntries: [entry({ id: "e-2", draftId: "d-2", entryType: "manual-new", customer: "예시학원9", amount: 1_000 })],
      drafts: [draft({ id: "d-2", amount: 1_000 }), draft({ id: "d-3", amount: 2_000 })],
    })
    expect(result.appliedRows.map((row) => row.id)).toEqual(["ledger-e-2", "draft-d-3"])
    expect(result.fallbackRows.map((row) => row.id)).toEqual(["draft-d-2", "draft-d-3"])
  })
})

describe("시트 쓰기 흡수(ADR-011) — 시트가 이미 읽은 정정은 오버레이에서 뺀다", () => {
  const sheetWrites = { "d-1": { status: "written", writtenAt: "2026-11-29T10:00:00.000Z" } }
  const synced = sheetRow({ syncedAt: "2026-11-29T21:05:00.000Z", monthlyPayments: { "2026-11": 35_000 } })

  it("항목이 있는 갈래: 쓴 뒤 시작한 동기화가 성공했고 가진 행도 그 뒤 것이면 시트 값만 센다", () => {
    const result = overlay({ sheetRows: [synced], ledgerEntries: [entry()], sheetWrites, lastRevSyncStartedAt: "2026-11-29T21:00:00.000Z" })
    expect([...result.absorbedDraftIds]).toEqual(["d-1"])
    expect(result.appliedRows).toEqual([])
    expect(result.overrides.size).toBe(0)
    expect(monthSum(result.rows, "2026-11")).toBe(35_000)
  })

  it("항목이 없는 갈래(안전망)도 같은 제외를 거친다", () => {
    const result = overlay({
      sheetRows: [synced],
      drafts: [draft({ id: "d-1", kind: "edit-row", customer: "예시학원1", sourceDealId: "line-1", amount: 35_000 })],
      sheetWrites,
      lastRevSyncStartedAt: "2026-11-29T21:00:00.000Z",
    })
    expect(result.appliedRows).toEqual([])
    expect(monthSum(result.rows, "2026-11")).toBe(35_000)
  })

  it("가진 시트 행이 쓰기보다 오래됐으면(동기화 전 행) 정정을 빼지 않는다", () => {
    const stale = sheetRow({ syncedAt: "2026-11-29T09:00:00.000Z" })
    const result = overlay({ sheetRows: [stale], ledgerEntries: [entry()], sheetWrites, lastRevSyncStartedAt: "2026-11-29T21:00:00.000Z" })
    expect(result.absorbedDraftIds.size).toBe(0)
    expect(monthSum(result.rows, "2026-11")).toBe(35_000)
    expect(result.overrides.get("line-1")).toEqual(new Set(["2026-11"]))
  })
})

describe("로컬 초안 · 범위(months · team)", () => {
  it("local- 초안은 적용 상태여도 더하지 않는다", () => {
    const result = overlay({ sheetRows: [], drafts: [draft({ id: "local-1" }), draft({ id: "d-ok" })] })
    expect(result.additiveRows.map((row) => row.id)).toEqual(["draft-d-ok"])
    expect(result.rows.map((row) => row.id)).toEqual(["draft-d-ok"])
  })

  it("표시 달 밖·다른 팀 항목은 얹지 않는다 — team 이 ALL 이거나 없으면 전부", () => {
    const entries = [
      entry({ id: "e-in", draftId: "d-in", entryType: "manual-new", customer: "예시학원7", month: "2026-11" }),
      entry({ id: "e-out", draftId: "d-out", entryType: "manual-new", customer: "예시학원7", month: "2027-04" }),
      entry({ id: "e-mkt", draftId: "d-mkt", entryType: "manual-new", customer: "예시학원8", team: "MKT" }),
    ]
    const bd = overlay({ sheetRows: [], ledgerEntries: entries, months: ["2026-11", "2026-12"], team: "BD" })
    expect(bd.appliedRows.map((row) => row.id)).toEqual(["ledger-e-in"])
    const all = overlay({ sheetRows: [], ledgerEntries: entries, months: ["2026-11"], team: "ALL" })
    expect(all.appliedRows.map((row) => row.id)).toEqual(["ledger-e-in", "ledger-e-mkt"])
    const unscoped = overlay({ sheetRows: [], ledgerEntries: entries })
    expect(unscoped.appliedRows).toHaveLength(3)
  })
})

describe("음수(환불) 달은 그대로 통과한다(D2 — 어디서도 0으로 자르지 않는다)", () => {
  it("시트 행의 음수 달은 다른 달 정정 뒤에도 남고, 음수 장부 행도 그대로 더해진다", () => {
    const refundRow = sheetRow({
      monthlyPayments: { "2026-11": 30_000, "2026-12": -3_000 },
      weeklyPayments: { "2026-11": [10_000, 20_000, 0, 0, 0], "2026-12": [-3_000, 0, 0, 0, 0] },
    })
    const result = overlay({
      sheetRows: [refundRow],
      ledgerEntries: [
        entry(),
        entry({ id: "e-ref", draftId: "d-ref", entryType: "manual-new", customer: "예시학원5", month: "2026-12", amount: -2_000, metadata: { confidence: "expected" } }),
      ],
    })
    const adjusted = result.adjustedSheetRows[0]
    expect(adjusted.monthlyPayments).toEqual({ "2026-12": -3_000 })
    expect(adjusted.weeklyPayments).toEqual({ "2026-12": [-3_000, 0, 0, 0, 0] })
    expect(monthSum(result.rows, "2026-12")).toBe(-5_000)
    const refund = result.rows.find((row) => row.id === "ledger-e-ref")!
    expect(ledgerMonthSplit(refund, "2026-12", -2_000, TODAY_YM)).toEqual({ confirmed: 0, highConfidence: 0, expected: -2_000 })
  })

  it("음수 달을 정정하면 그 달이 정정 값으로 바뀐다(음수 정정도 그대로)", () => {
    const refundRow = sheetRow({ monthlyPayments: { "2026-12": -3_000 }, monthlyConfirmed: {}, monthlyHighConfidence: {}, monthlyRed: {}, weeklyPayments: {} })
    const result = overlay({ sheetRows: [refundRow], ledgerEntries: [entry({ month: "2026-12", amount: -1_000 })] })
    expect(monthSum(result.rows, "2026-12")).toBe(-1_000)
  })
})

describe("F-04 — 같은 칸 정정이 둘이면 가장 늦게 반영한 것만 센다", () => {
  it("재동기화 전후로 다른 id 를 가리킨 두 정정이 같은 행·같은 달로 풀리면 쌓지 않고 최신만 남긴다", () => {
    const result = overlay({
      sheetRows: [sheetRow({ id: "line-NEW", rowId: null })],
      ledgerEntries: [
        entry({ id: "e-new", draftId: "d-new", sourceDealId: "line-NEW", amount: 65_000, appliedAt: "2026-11-22T01:00:00.000Z" }),
        entry({ id: "e-old", draftId: "d-old", sourceDealId: "line-OLD", amount: 60_000, appliedAt: "2026-11-20T01:00:00.000Z" }),
      ],
    })
    expect(monthSum(result.rows, "2026-11")).toBe(65_000)
    expect(result.superseded).toEqual([
      expect.objectContaining({ targetId: "line-NEW", month: "2026-11", winnerId: "ledger-e-new" }),
    ])
    expect(result.superseded[0].row.id).toBe("ledger-e-old")
    expect(result.replacementRows.map((row) => row.id)).toEqual(["ledger-e-new"])
    expect(result.appliedRows.map((row) => row.id)).toEqual(["ledger-e-new"])
  })

  it("반영 시각이 같으면 id 순으로 뒤의 것이 이긴다 · 다른 달 정정은 서로 겹치지 않는다", () => {
    const result = overlay({
      sheetRows: [sheetRow({ monthlyPayments: { "2026-11": 30_000, "2026-12": 5_000 } })],
      ledgerEntries: [
        entry({ id: "e-b", draftId: "d-b", amount: 2_000 }),
        entry({ id: "e-a", draftId: "d-a", amount: 1_000 }),
        entry({ id: "e-dec", draftId: "d-dec", month: "2026-12", amount: 7_000 }),
      ],
    })
    expect(result.superseded.map((item) => item.row.id)).toEqual(["ledger-e-a"])
    expect(monthSum(result.rows, "2026-11")).toBe(2_000)
    expect(monthSum(result.rows, "2026-12")).toBe(7_000)
    expect(result.overrides.get("line-1")).toEqual(new Set(["2026-11", "2026-12"]))
  })
})

describe("F-16 — 정정 뒤 시트 변경(drift) · 장부 신규 이중 입력 의심(duplicates)", () => {
  it("정정을 만들 때 본 주차 칸 합과 지금 시트 칸 합이 다르면 drift 로 알린다(값은 고르지 않는다)", () => {
    const changed = sheetRow({ monthlyPayments: { "2026-11": 35_000 }, weeklyPayments: { "2026-11": [10_000, 25_000, 0, 0, 0] } })
    const result = overlay({
      sheetRows: [changed],
      ledgerEntries: [entry({ amount: 32_000, sourceSnapshot: { sheetBaseline: baseline("2026-11", [10_000, 20_000, 0, 0, 0]) } })],
    })
    expect(result.drift).toEqual([
      expect.objectContaining({ targetId: "line-1", month: "2026-11", baselineTotal: 30_000, currentTotal: 35_000, correctionAmount: 32_000 }),
    ])
    // 화면 값은 그대로 정정 값(잠금 뒤엔 장부가 이긴다).
    expect(monthSum(result.rows, "2026-11")).toBe(32_000)
  })

  it("시트가 그대로이거나, 정정 값으로 다시 쳐 넣었거나, baseline 이 없으면 drift 가 아니다", () => {
    const sameSheet = overlay({
      sheetRows: [sheetRow()],
      ledgerEntries: [entry({ amount: 32_000, sourceSnapshot: { sheetBaseline: baseline("2026-11", [10_000, 20_000, 0, 0, 0]) } })],
    })
    expect(sameSheet.drift).toEqual([])
    const retyped = overlay({
      sheetRows: [sheetRow({ weeklyPayments: { "2026-11": [12_000, 20_000, 0, 0, 0] } })],
      ledgerEntries: [entry({ amount: 32_000, sourceSnapshot: { sheetBaseline: baseline("2026-11", [10_000, 20_000]) } })],
    })
    expect(retyped.drift).toEqual([])
    const noBaseline = overlay({
      sheetRows: [sheetRow({ weeklyPayments: { "2026-11": [99_000, 0, 0, 0, 0] } })],
      ledgerEntries: [entry({ amount: 32_000 })],
    })
    expect(noBaseline.drift).toEqual([])
  })

  it("장부 신규 행과 같은 고객(정규화 키)·같은 달에 시트 금액이 있으면 duplicates 로 알린다", () => {
    const result = overlay({
      sheetRows: [sheetRow(), sheetRow({ id: "line-2", customer: "예시학원2", rowId: ROW_ID_2, monthlyPayments: { "2026-11": 0 } })],
      ledgerEntries: [
        entry({ id: "e-dup", draftId: "d-dup", entryType: "manual-new", customer: "예시 학원1", amount: 4_000 }),
        entry({ id: "e-other-month", draftId: "d-om", entryType: "manual-new", customer: "예시학원1", month: "2026-12", amount: 4_000 }),
        entry({ id: "e-zero", draftId: "d-zero", entryType: "manual-new", customer: "예시학원2", amount: 4_000 }),
      ],
      drafts: [draft({ id: "d-fallback", customer: "예시학원1(본원)", amount: 1_000 })],
    })
    expect(result.duplicates.map((item) => [item.row.id, item.month, item.sheetRowIds, item.sheetAmount])).toEqual([
      ["ledger-e-dup", "2026-11", ["line-1"], 30_000],
    ])
    // 중복이어도 합계는 건드리지 않는다(경고만 — 둘 다 맞을 수 있다).
    expect(monthSum(result.rows, "2026-11")).toBe(30_000 + 4_000 + 4_000 + 1_000)
  })
})

describe("F-17 — 정정 행은 자기 스냅샷에 없는 계약·경로·목표·중요도·상품을 원본 시트 행에서 가져온다", () => {
  it("셀 편집 스냅샷(row 에 status·dealType 없음) → 원본의 Renew/Direct 를 쓴다", () => {
    const target = { ...sheetRow({ status: "Renew", dealType: "Channel", productVersion: "ClassIn 연간", contractTarget: 120_000 }), importance: "KA" }
    const result = overlay({
      sheetRows: [target],
      ledgerEntries: [entry({ sourceSnapshot: { row: { id: "line-1", customer: "예시학원1", manager: "예시A", region: "서울" } } })],
    })
    const correction = result.appliedRows[0]
    expect(correction).toMatchObject({ status: "Renew", dealType: "Channel", productVersion: "ClassIn 연간", contractTarget: 120_000, importance: "KA", region: "서울" })
    expect(result.rows[0]).toBe(correction)
  })

  it("자기 스냅샷에 값이 있으면 그 값을 지킨다 · 원본을 못 찾은 정정은 그대로", () => {
    const own = overlay({
      sheetRows: [sheetRow()],
      ledgerEntries: [entry({ sourceSnapshot: { status: "New", dealType: "Direct", contractTarget: 0 } })],
    })
    expect(own.appliedRows[0]).toMatchObject({ status: "New", dealType: "Direct", contractTarget: 0 })
    const lost = overlay({ sheetRows: [], ledgerEntries: [entry({ sourceDealId: "gone" })] })
    expect(lost.unresolved[0]).toMatchObject({ status: null, dealType: null })
  })
})

// ── 서버: REV 딜 단위(mergeLedgerIntoDeals) ────────────────────────────────────────────

function deal(overrides: Partial<BranchRevDeal>): BranchRevDeal {
  return {
    id: "line-1",
    sheet_row: 12,
    customer_name: "예시학원1",
    branch_contact: null,
    team: "BD",
    manager: "예시A",
    deal_type: "Direct",
    status: "Renew",
    first_payment: "2025-05-01",
    product_version: "ClassIn 연간",
    region: "서울",
    importance: null,
    note: null,
    contract_target: 120_000,
    monthly_payments: {},
    monthly_red: {},
    monthly_confirmed: {},
    monthly_high_conf: {},
    raw: {},
    synced_at: "2026-11-24T12:00:00.000Z",
    ...overrides,
  }
}

// 색 있는 딜(정정 대상) · 무색상 딜(정정 대상 — 나머지 달 폴백 보존) · 담당이 바뀐 딜 · 신규·못 찾은 정정·겹친 정정·
// 상쇄·흡수·음수·로컬·상쇄 초안·중복 신규를 한 번에 담은 가명 장부.
const PARITY_DEALS: BranchRevDeal[] = [
  deal({
    id: "line-1",
    monthly_payments: { "2026-10": 20_000, "2026-11": 35_000, "2026-12": -3_000 },
    monthly_confirmed: { "2026-10": 20_000, "2026-11": 10_000 },
    monthly_high_conf: { "2026-11": 25_000 },
    monthly_red: { "2026-10": true, "2026-11": true },
    raw: {
      rowId: ROW_ID_1,
      weeklyPayments: { "2026-10": [20_000, 0, 0, 0, 0], "2026-11": [10_000, 25_000, 0, 0, 0], "2026-12": [-3_000, 0, 0, 0, 0] },
      weeklyColors: { "2026-10": "r----", "2026-11": "rb---" },
    },
  }),
  deal({
    id: "line-2",
    sheet_row: 13,
    customer_name: "예시학원2",
    manager: "예시B",
    status: "New",
    deal_type: "Channel",
    monthly_payments: { "2026-09": 15_000, "2026-11": 8_000, "2027-01": 9_000 },
    raw: { rowId: ROW_ID_2, weeklyPayments: { "2026-09": [15_000, 0, 0, 0, 0], "2026-11": [0, 8_000, 0, 0, 0], "2027-01": [9_000, 0, 0, 0, 0] } },
  }),
  deal({
    id: "line-3",
    sheet_row: 14,
    customer_name: "예시학원3",
    manager: "예시C",
    team: "MKT",
    monthly_payments: { "2026-11": 5_000 },
    monthly_confirmed: { "2026-11": 5_000 },
    monthly_red: { "2026-11": true },
    raw: { rowId: ROW_ID_3, weeklyPayments: { "2026-11": [5_000, 0, 0, 0, 0] } },
  }),
]

const PARITY_ENTRIES: LedgerOverlayEntry[] = [
  // 색 있는 딜 11월 정정 — 재동기화 전 id, Row ID 로 찾는다. 주차별 확도. 그 뒤 시트가 바뀌어 drift.
  entry({
    id: "e-a",
    draftId: "d-a",
    sourceDealId: "line-OLD",
    amount: 32_000,
    metadata: { weekly: [12_000, 20_000, 0, 0, 0], weeklyConfidence: ["confirmed", "high-confidence", null, null, null] },
    sourceSnapshot: { sheetBaseline: baseline("2026-11", [10_000, 20_000, 0, 0, 0]) },
  }),
  // 같은 칸(색 있는 딜 10월) 정정 두 건 — 최신(예정 22,000)만.
  entry({ id: "e-f-old", draftId: "d-f-old", month: "2026-10", amount: 21_000, appliedAt: "2026-11-10T01:00:00.000Z" }),
  entry({ id: "e-f-new", draftId: "d-f-new", month: "2026-10", amount: 22_000, appliedAt: "2026-11-15T01:00:00.000Z", metadata: { confidence: "expected" } }),
  // 무색상 딜 11월 정정(확정 9,000) — 9월(과거)은 폴백 확정, 1월(미래)은 예정으로 남아야 한다.
  entry({ id: "e-b", draftId: "d-b", sourceDealId: "line-2", sourceSheetRow: 13, customer: "예시학원2", manager: "예시B", amount: 9_000 }),
  // 담당이 바뀐 딜 정정 — 화면처럼 항목 담당(예시B · BD)으로 센다.
  entry({ id: "e-c", draftId: "d-c", sourceDealId: "line-3", sourceSheetRow: 14, customer: "예시학원3", manager: "예시B", team: "BD", amount: 6_000, metadata: { confidence: "expected" } }),
  // 신규(확정) — 스냅샷에 분류.
  entry({
    id: "e-d",
    draftId: "d-d",
    entryType: "manual-new",
    sourceDealId: undefined,
    sourceSheetRow: null,
    customer: "예시학원9",
    month: "2026-12",
    amount: 7_000,
    sourceSnapshot: { status: "New", dealType: "Channel", productVersion: "ClassIn 연간", firstPayment: "2026-12-01", region: "부산" },
  }),
  // 원본을 못 찾은 정정 — 따로 더한다.
  entry({ id: "e-e", draftId: "d-e", sourceDealId: "gone", sourceSheetRow: 99, customer: "없는학원", manager: "예시C", team: "MKT", amount: 1_000, metadata: { confidence: "expected" } }),
  // 상쇄된 항목 — 빠진다.
  entry({ id: "e-g", draftId: "d-g", entryStatus: "reversed", entryType: "manual-new", customer: "예시학원6", amount: 50_000 }),
  // 시트 쓰기로 흡수된 정정 — 빠진다(시트 값이 정본).
  entry({ id: "e-j", draftId: "d-abs", sourceDealId: "line-2", customer: "예시학원2", manager: "예시B", month: "2026-09", amount: 99_000 }),
  // 무색상 딜 고객의 9월 신규 — 이중 입력 의심.
  entry({ id: "e-h", draftId: "d-h", entryType: "manual-new", sourceDealId: undefined, customer: "예시학원2", manager: "예시B", month: "2026-09", amount: 4_000, metadata: { confidence: "high-confidence" } }),
  // 음수 신규(환불) — 그대로.
  entry({ id: "e-i", draftId: "d-i", entryType: "manual-new", sourceDealId: undefined, customer: "예시학원5", month: "2026-12", amount: -2_000, metadata: { confidence: "expected" } }),
]

const PARITY_DRAFTS: LedgerOverlayDraft[] = [
  draft({ id: "d-x", customer: "예시학원7", manager: "예시C", team: "MKT", month: "2027-01", amount: 3_000, metadata: { confidence: "high-confidence" } }),
  draft({ id: "local-1", amount: 8_888 }),
  draft({ id: "d-rev", amount: 7_777 }),
]

const PARITY_SOURCES = {
  ledgerEntries: PARITY_ENTRIES,
  drafts: PARITY_DRAFTS,
  reversedDraftIds: new Set(["d-rev", "d-g"]),
  sheetWrites: { "d-abs": { status: "written", writtenAt: "2026-11-23T00:00:00.000Z" } },
  lastRevSyncStartedAt: "2026-11-24T11:00:00.000Z",
  months: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"],
  team: "ALL",
}

type Split = { total: number; confirmed: number; highConfidence: number; expected: number }

function totalsByManagerMonth(rows: ReadonlyArray<LedgerRevenueRow | BranchPipelineRow>): Record<string, Split> {
  const out: Record<string, Split> = {}
  for (const row of rows) {
    const manager = normalizeBranchMemberName(row.manager)?.toLowerCase() ?? "(미지정)"
    for (const [month, raw] of Object.entries(row.monthlyPayments ?? {})) {
      const total = Number(raw) || 0
      const split = ledgerMonthSplit(row as LedgerRevenueRow, month, total, TODAY_YM)
      const key = `${manager}|${month}`
      const cell = (out[key] ??= { total: 0, confirmed: 0, highConfidence: 0, expected: 0 })
      cell.total += total
      cell.confirmed += split.confirmed
      cell.highConfidence += split.highConfidence
      cell.expected += split.expected
    }
  }
  for (const [key, cell] of Object.entries(out)) {
    if (cell.total === 0 && cell.confirmed === 0 && cell.highConfidence === 0 && cell.expected === 0) delete out[key]
  }
  return out
}

describe("mergeLedgerIntoDeals — 서버 딜 단위가 화면 행 단위와 같은 수를 낸다", () => {
  const rowLevel = buildLedgerOverlay({ sheetRows: listRevRevenue(PARITY_DEALS), ...PARITY_SOURCES })
  const dealLevel = mergeLedgerIntoDeals(PARITY_DEALS, { ...PARITY_SOURCES, todayYm: TODAY_YM })

  it("담당자 × 달 × 확도 합이 buildLedgerOverlay(...).rows 와 같다", () => {
    const fromRows = totalsByManagerMonth(rowLevel.rows)
    const fromDeals = totalsByManagerMonth(listRevRevenue(dealLevel.deals))
    expect(fromDeals).toEqual(fromRows)
    // 손으로 적은 기대값 — 규칙이 몰래 바뀌면 둘이 같이 틀려도 여기서 잡힌다.
    expect(fromRows["예시a|2026-11"]).toEqual({ total: 32_000, confirmed: 12_000, highConfidence: 20_000, expected: 0 })
    expect(fromRows["예시a|2026-10"]).toEqual({ total: 22_000, confirmed: 0, highConfidence: 0, expected: 22_000 })
    // 12월: 시트 환불 −3,000 + 장부 신규 확정 7,000 + 장부 환불 −2,000(예정 몫 음수 그대로).
    expect(fromRows["예시a|2026-12"]).toEqual({ total: 2_000, confirmed: 7_000, highConfidence: 0, expected: -5_000 })
    expect(fromRows["예시b|2026-09"]).toEqual({ total: 19_000, confirmed: 15_000, highConfidence: 4_000, expected: 0 })
    expect(fromRows["예시b|2026-11"]).toEqual({ total: 15_000, confirmed: 9_000, highConfidence: 0, expected: 6_000 })
    expect(fromRows["예시b|2027-01"]).toEqual({ total: 9_000, confirmed: 0, highConfidence: 0, expected: 9_000 })
    expect(fromRows["예시c|2026-11"]).toEqual({ total: 1_000, confirmed: 0, highConfidence: 0, expected: 1_000 })
    expect(fromRows["예시c|2027-01"]).toEqual({ total: 3_000, confirmed: 0, highConfidence: 3_000, expected: 0 })
    expect(fromRows["예시b|2026-12"]).toBeUndefined()
  })

  it("경고 목록(superseded · drift · duplicates · unresolved)도 같다", () => {
    const ids = (items: Array<{ row: LedgerRevenueRow }>) => items.map((item) => item.row.id)
    expect(ids(dealLevel.superseded)).toEqual(ids(rowLevel.superseded))
    expect(ids(rowLevel.superseded)).toEqual(["ledger-e-f-old"])
    expect(ids(dealLevel.drift)).toEqual(["ledger-e-a"])
    expect(ids(rowLevel.drift)).toEqual(["ledger-e-a"])
    expect(ids(dealLevel.duplicates)).toEqual(["ledger-e-h"])
    expect(ids(rowLevel.duplicates)).toEqual(["ledger-e-h"])
    expect(dealLevel.unresolved.map((row) => row.id)).toEqual(["ledger-e-e"])
  })

  it("정정은 원본 딜의 그 달을 제자리에서 바꾼다(딜 id·딜 수 유지) — 금액·확도·색·주차 맵", () => {
    const merged = dealLevel.deals.find((item) => item.id === "line-1")!
    expect(merged.monthly_payments).toEqual({ "2026-10": 22_000, "2026-11": 32_000, "2026-12": -3_000 })
    expect(merged.monthly_confirmed).toEqual({ "2026-11": 12_000 })
    expect(merged.monthly_high_conf).toEqual({ "2026-11": 20_000 })
    expect(merged.monthly_red).toEqual({ "2026-10": false, "2026-11": false })
    expect((merged.raw.weeklyPayments as Record<string, number[]>)["2026-11"]).toEqual([12_000, 20_000, 0, 0, 0])
    expect((merged.raw.weeklyPayments as Record<string, number[]>)["2026-10"]).toBeUndefined()
    expect(merged.raw.weeklyColors).toEqual({})
    expect(merged.raw.rowId).toBe(ROW_ID_1)
    // 입력 딜은 건드리지 않는다.
    expect(PARITY_DEALS[0].monthly_payments["2026-11"]).toBe(35_000)
  })

  it("무색상 딜의 제자리 정정은 나머지 달의 폴백을 todayYm 기준 확정 맵으로 옮겨 적는다", () => {
    const merged = dealLevel.deals.find((item) => item.id === "line-2")!
    expect(merged.monthly_confirmed).toEqual({ "2026-09": 15_000, "2026-11": 9_000, "2027-01": 0 })
    expect(merged.monthly_red).toEqual({ "2026-09": true, "2026-11": true })
    expect(merged.raw.ledgerOverlay).toEqual({ correctedMonths: ["2026-11"], detachedMonths: [], materializedFallback: true })
  })

  it("담당이 다른 정정은 원본에서 그 달을 떼고 장부 딜로 둔다 · 신규는 스냅샷 분류를 실은 장부 딜", () => {
    const detachedFrom = dealLevel.deals.find((item) => item.id === "line-3")!
    expect(detachedFrom.monthly_payments).toEqual({})
    expect(detachedFrom.monthly_red).toEqual({ "2026-11": false })
    const detached = dealLevel.deals.find((item) => item.id === "ledger-e-c")!
    expect(detached).toMatchObject({ manager: "예시B", team: "BD", contract_target: null, monthly_payments: { "2026-11": 6_000 } })

    const created = dealLevel.deals.find((item) => item.id === "ledger-e-d")!
    expect(created).toMatchObject({
      manager: "예시A",
      team: "BD",
      status: "New",
      deal_type: "Channel",
      product_version: "ClassIn 연간",
      first_payment: "2026-12-01",
      region: "부산",
      monthly_payments: { "2026-12": 7_000 },
      monthly_confirmed: { "2026-12": 7_000 },
      monthly_red: { "2026-12": true },
    })
    expect(created.raw.ledgerDeal).toMatchObject({ origin: "entry", kind: "new-row", entryId: "e-d", draftId: "d-d" })

    const ids = dealLevel.deals.map((item) => item.id)
    expect(ids).toEqual([
      "line-1", "line-2", "line-3",
      "ledger-e-c",
      "ledger-e-d", "ledger-e-e", "ledger-e-h", "ledger-e-i", "draft-d-x",
    ])
  })

  it("월 합계만 있는 정정으로 주차 맵이 비면 옛 시트 원문 칸(raw.row)에서 주차를 되살리지 않는다", () => {
    const legacyRow = Array.from({ length: 84 }, () => null as number | null)
    legacyRow[13 + 7 * 6 + 1] = 30_000 // 11월 w1 자리(레거시 고정 오프셋)
    const only = deal({
      monthly_payments: { "2026-11": 30_000 },
      monthly_red: { "2026-11": true },
      monthly_confirmed: { "2026-11": 30_000 },
      raw: { rowId: ROW_ID_1, row: legacyRow, weeklyPayments: { "2026-11": [30_000, 0, 0, 0, 0] } },
    })
    const merged = mergeLedgerIntoDeals([only], { ledgerEntries: [entry({ amount: 31_000 })] }).deals[0]
    const [row] = listRevRevenue([merged])
    expect(row.monthlyPayments).toEqual({ "2026-11": 31_000 })
    expect(row.weeklyPayments).toEqual({})
    // 원래 딜에는 그대로 남아 있다.
    expect(Array.isArray(only.raw.row)).toBe(true)
  })

  it("정정한 달의 읽는 시점 확도 재료(빨간 예정 칸·월≠주 합 표시)를 지운다 — 다른 달은 그대로", () => {
    const only = deal({
      monthly_payments: { "2026-11": 30_000, "2026-12": 8_000 },
      monthly_red: { "2026-11": true, "2026-12": true },
      monthly_confirmed: { "2026-11": 0, "2026-12": 0 },
      raw: {
        rowId: ROW_ID_1,
        weeklyPayments: { "2026-11": [30_000, 0, 0, 0, 0], "2026-12": [8_000, 0, 0, 0, 0] },
        pendingCells: { "2026-11": [{ week: 1, start: "2026-11-02", amount: 30_000 }], "2026-12": [{ week: 1, start: "2026-11-30", amount: 8_000 }] },
        monthWeekMismatch: { "2026-11": { month: 25_000, weeks: 30_000 } },
      },
    })
    // 고확도 정정 — 시트의 빨간 예정 칸(30,000)은 정정한 달의 재료가 아니다(캐논도 확정 키 없는 달은 올리지 않지만 재료째 뺀다).
    const correction = entry({ amount: 31_000, metadata: { confidence: "high-confidence", week: "month" } })
    const merged = mergeLedgerIntoDeals([only], { ledgerEntries: [correction] }).deals[0]
    expect(merged.raw.pendingCells).toEqual({ "2026-12": [{ week: 1, start: "2026-11-30", amount: 8_000 }] })
    expect(merged.raw.monthWeekMismatch).toBeUndefined()
    expect(splitMonthConfidence(merged, "2026-11", 31_000, true, "2026-11-25")).toEqual({ confirmed: 0, highConfidence: 31_000, expected: 0 })
    // 다른 달의 예정 칸은 그대로 읽힌다(12월 칸은 11/30 시작).
    expect(splitMonthConfidence(merged, "2026-12", 8_000, true, "2026-11-30").confirmed).toBe(8_000)
    // 원래 딜에는 그대로 남아 있다.
    expect(Object.keys(only.raw.pendingCells as object)).toEqual(["2026-11", "2026-12"])
  })

  it("장부 항목이 없으면 같은 딜 배열 내용(같은 객체)을 돌려준다", () => {
    const result = mergeLedgerIntoDeals(PARITY_DEALS, { ledgerEntries: [] })
    expect(result.deals).toHaveLength(PARITY_DEALS.length)
    result.deals.forEach((item, index) => expect(item).toBe(PARITY_DEALS[index]))
  })
})

describe("워크벤치 배선 — 오버레이를 다시 짜지 않고 lib 함수 하나를 부른다", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8").replace(/\r\n/g, "\n")

  it("buildLedgerOverlay( 를 시트 쓰기 흡수 기준·표시 달·팀과 함께 부른다", () => {
    const start = source.indexOf("const ledgerOverlay = useMemo(")
    expect(start).toBeGreaterThan(-1)
    const body = source.slice(start, source.indexOf("const rows = ledgerOverlay.rows", start))
    expect(body).toContain("buildLedgerOverlay({")
    expect(body).toContain("sheetWrites,")
    expect(body).toContain("lastRevSyncStartedAt: sheetWrite.lastRevSyncStartedAt,")
    expect(body).toContain("months: matrixMonths,")
    expect(body).toContain("const editRowOverrideMonths = ledgerOverlay.overrides")
  })

  it("워크벤치에 옛 인라인 합성(항목 필터·정정 달 삭제)이 남아 있지 않다", () => {
    expect(source).not.toContain('.filter((entry) => entry.entryStatus === "active")')
    expect(source).not.toContain("const appliedDraftFallbackRows = useMemo")
    expect(source).not.toContain("confidenceColorHint: ledgerRowHasColor(row)")
  })
})
