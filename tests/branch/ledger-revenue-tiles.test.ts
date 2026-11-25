import { describe, expect, it } from "vitest"
import {
  buildLedgerRevenueTiles,
  ledgerOverlayNotices,
  ledgerPrevPeriodChip,
  ledgerSheetLoadState,
  type LedgerRevenueTileInput,
} from "@/components/admin/branch/ledger/ledger-revenue-tiles"
import type { BranchSummaryRevenue } from "@/components/admin/branch/types"

// 장부 머리 타일 — 숫자는 서버 요약(D1: 시트 행 + 적용 장부 항목)에서 오고, 화면은 더하지 않는다(D3 · F-23 · F-40).
// 예시(design-0 worked example, 11월 · 전체 담당자 · 목표 ¥20만): 시트만 확정 40,000 + 장부 신규 확정 40,000 = 80,000,
// 10월 확정 100,000 → 전월 대비 −20%.

const FY26 = [
  "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
]

const REVENUE: BranchSummaryRevenue = {
  confirmed: 80_000,
  goal: 200_000,
  pacing_pct: 40,
  sheet_only_confirmed: 40_000,
  prev_confirmed: 100_000,
  ledger_included: true,
}

function input(overrides: Partial<LedgerRevenueTileInput> = {}): LedgerRevenueTileInput {
  return {
    revenue: REVENUE,
    pending: false,
    period: "M",
    periodLabel: "2026.11",
    matrixMonths: FY26,
    periodMonths: ["2026-11"],
    added: 1,
    corrected: 0,
    ...overrides,
  }
}

describe("buildLedgerRevenueTiles — 서버 요약 한 정의(D1)", () => {
  it("확정 매출 · 장부 가감 · Gap · 전월 대비(예시)", () => {
    const tiles = buildLedgerRevenueTiles(input())
    expect(tiles.goal).toMatchObject({ value: "¥20만", hint: "2026.11 목표 매출" })
    expect(tiles.confirmed).toMatchObject({ value: "¥8만", hint: "시트 + 장부 반영 · 2026.11 달성률 40%", tone: "text-[#084734]" })
    // 장부 가감 = 같은 기간 · 범위의 (장부 포함 확정 − 시트만 확정) — "장부 합계"는 없다(D3 · F-23).
    expect(tiles.ledgerDelta).toMatchObject({ value: "+¥4만", hint: "2026.11 확정 · 시트 대비 · 신규 1건 · 수정 0건" })
    expect(tiles.ledgerDelta.hint).not.toContain("장부 합계")
    expect(tiles.gap).toMatchObject({ value: "-¥12만", hint: "목표 대비 부족", tone: "text-[#B43E3E]", reached: false })
    expect(tiles.prev).toEqual({ label: "2026.10 대비", deltaPct: -20 })
  })

  it("장부가 확정을 줄이면(정정 감액) 가감은 빼기 부호 · 앰버", () => {
    const tiles = buildLedgerRevenueTiles(input({ revenue: { ...REVENUE, confirmed: 30_000, sheet_only_confirmed: 70_000 }, added: 0, corrected: 2 }))
    expect(tiles.ledgerDelta).toMatchObject({ value: "-¥4만", tone: "text-[#A8741A]", hint: "2026.11 확정 · 시트 대비 · 신규 0건 · 수정 2건" })
  })

  it("목표를 넘으면 Gap 은 목표 초과 · 초록", () => {
    const tiles = buildLedgerRevenueTiles(input({ revenue: { ...REVENUE, confirmed: 250_000, pacing_pct: 125 } }))
    expect(tiles.gap).toMatchObject({ value: "¥5만", hint: "목표 초과", tone: "text-[#084734]", reached: true })
  })

  it("장부 반영값을 못 읽었으면 확정은 시트만이라고 알리고 가감은 셀 수 없다(–)", () => {
    const tiles = buildLedgerRevenueTiles(input({ revenue: { ...REVENUE, confirmed: 40_000, sheet_only_confirmed: 40_000, ledger_included: false, pacing_pct: 20 } }))
    expect(tiles.confirmed.hint).toBe("시트만(장부 반영값 못 읽음) · 2026.11 달성률 20%")
    expect(tiles.ledgerDelta.value).toBe("–")
    expect(tiles.ledgerDelta.hint).toContain("셀 수 없습니다")
  })

  it("시트만 확정이 없는 응답이면 가감은 –(예전 서버)", () => {
    const { sheet_only_confirmed: _omit, ...older } = REVENUE
    void _omit
    expect(buildLedgerRevenueTiles(input({ revenue: older })).ledgerDelta.value).toBe("–")
  })

  it("환불이 더 큰 기간의 음수 확정은 빼기 부호 · 중립 글자색(D2 — 빨강 · 초록 아님)", () => {
    const tiles = buildLedgerRevenueTiles(input({ revenue: { ...REVENUE, confirmed: -30_000, sheet_only_confirmed: -30_000 } }))
    expect(tiles.confirmed).toMatchObject({ value: "-¥3만", tone: "text-[#31302E]" })
  })

  it("요약을 아직 못 받았으면 값은 –, 힌트는 불러오는 중, 칩 없음", () => {
    const tiles = buildLedgerRevenueTiles(input({ pending: true }))
    for (const tile of [tiles.goal, tiles.confirmed, tiles.ledgerDelta, tiles.gap]) {
      expect(tile).toMatchObject({ value: "–", hint: "불러오는 중" })
    }
    expect(tiles.prev).toBeNull()
    expect(buildLedgerRevenueTiles(input({ revenue: null })).confirmed.value).toBe("–")
  })
})

describe("ledgerPrevPeriodChip — 같은 정의 · 같은 범위의 전기 확정(F-40)", () => {
  const base = { period: "M" as const, confirmed: 80_000, matrixMonths: FY26, periodMonths: ["2026-11"] }

  it("전기 확정이 0 · 음수 · 없음이면 칩을 그리지 않는다(거짓 0% · 무한대 % 금지)", () => {
    expect(ledgerPrevPeriodChip({ ...base, prevConfirmed: 0 })).toBeNull()
    expect(ledgerPrevPeriodChip({ ...base, prevConfirmed: -10_000 })).toBeNull()
    expect(ledgerPrevPeriodChip({ ...base, prevConfirmed: null })).toBeNull()
    expect(ledgerPrevPeriodChip({ ...base, prevConfirmed: undefined })).toBeNull()
  })

  it("4월의 전월 · 1분기의 전분기 · 연(Y)은 회계연도 밖이라 칩 없음", () => {
    expect(ledgerPrevPeriodChip({ ...base, periodMonths: ["2026-04"], prevConfirmed: 50_000 })).toBeNull()
    expect(ledgerPrevPeriodChip({ ...base, period: "Q", periodMonths: ["2026-04", "2026-05", "2026-06"], prevConfirmed: 50_000 })).toBeNull()
    expect(ledgerPrevPeriodChip({ ...base, period: "Y", periodMonths: FY26, prevConfirmed: 50_000 })).toBeNull()
  })

  it("분기(Q)는 전분기 라벨 — 3분기(10~12월) → Q2 대비", () => {
    const chip = ledgerPrevPeriodChip({ ...base, period: "Q", periodMonths: ["2026-10", "2026-11", "2026-12"], confirmed: 300_000, prevConfirmed: 200_000 })
    expect(chip).toEqual({ label: "Q2 대비", deltaPct: 50 })
  })

  it("분자와 분모가 같은 서버 값이라 다른 담당자의 장부 항목이 기준을 부풀리지 않는다 — 서버가 준 값 그대로 비교", () => {
    // F-40 재현: 예전엔 분자(서버, 담당 1명 · 시트만)와 분모(화면, 전 담당자 적용 항목 포함)가 달라 'Q2 대비 +421.4%'가 떴다.
    // 이제 둘 다 서버의 같은 범위 값이다 — 그 담당자의 전기 확정이 0 이면 칩 자체가 없다.
    expect(ledgerPrevPeriodChip({ ...base, period: "Q", periodMonths: ["2026-07", "2026-08", "2026-09"], confirmed: 365_000, prevConfirmed: 0 })).toBeNull()
  })
})

describe("ledgerOverlayNotices — 오버레이 경고는 0 이 아닐 때만 한 줄씩", () => {
  const zero = { unresolved: 0, superseded: 0, drift: 0, duplicates: 0, sheetRowsReady: true }

  it("모두 0 이면 줄이 없다", () => {
    expect(ledgerOverlayNotices(zero)).toEqual([])
  })

  it("겹친 정정 · 정정 뒤 시트 변경 · 신규 이중 입력 의심이 각각 한 줄", () => {
    const notices = ledgerOverlayNotices({ ...zero, superseded: 2, drift: 1, duplicates: 3 })
    expect(notices).toEqual([
      "같은 칸 장부 정정 2건 — 가장 최근 것만 셉니다.",
      "장부 정정 1건 — 정정한 뒤 시트 값이 바뀌었습니다. 정정이 아직 맞는지 확인하세요.",
      "장부 신규 3건이 같은 달 시트 행과 겹칩니다 — 이중 입력인지 확인하세요.",
    ])
  })

  it("원래 행을 못 찾은 정정은 예전 문구 그대로", () => {
    expect(ledgerOverlayNotices({ ...zero, unresolved: 1 })[0]).toContain("장부에서 반영한 수정 1건의 원래 시트 행을 찾지 못했습니다")
  })

  it("시트 행을 다 불러오기 전(불러오는 중 · 실패)에는 하나도 보이지 않는다 — 모든 정정이 '원래 행 못 찾음'으로 세지는 거짓 경고(F-13)", () => {
    expect(ledgerOverlayNotices({ unresolved: 4, superseded: 1, drift: 1, duplicates: 1, sheetRowsReady: false })).toEqual([])
  })
})

describe("ledgerSheetLoadState — 첫 불러오기(F-13)", () => {
  it("초안 목록은 왔는데 시트 행이 아직이면 불러오는 중(장부 입력분만 보이는 '1 / 2행'을 끝난 값으로 보이지 않게)", () => {
    expect(ledgerSheetLoadState({ pipelineLoaded: false, pipelineFailed: false, draftsSettledOnce: true })).toEqual({ pending: true, partial: false })
  })

  it("시트 행은 왔는데 초안 목록을 아직 한 번도 못 받았으면 불러오는 중", () => {
    expect(ledgerSheetLoadState({ pipelineLoaded: true, pipelineFailed: false, draftsSettledOnce: false })).toEqual({ pending: true, partial: false })
  })

  it("둘 다 오면 끝, 시트 행 실패면 일부만(장부 입력분만)", () => {
    expect(ledgerSheetLoadState({ pipelineLoaded: true, pipelineFailed: false, draftsSettledOnce: true })).toEqual({ pending: false, partial: false })
    expect(ledgerSheetLoadState({ pipelineLoaded: false, pipelineFailed: true, draftsSettledOnce: true })).toEqual({ pending: false, partial: true })
    // 실패해도 초안 목록이 처음 오기 전에는 아직 불러오는 중이다.
    expect(ledgerSheetLoadState({ pipelineLoaded: false, pipelineFailed: true, draftsSettledOnce: false })).toEqual({ pending: true, partial: true })
  })
})
