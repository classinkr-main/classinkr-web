// RevMatrixWeekCells 렌더(주차 검수 매트릭스 · 장부 건별 시트가 같은 칸 컴포넌트를 쓴다).
//  - F-19: 대기 초안이 칸 값을 바꾸면 그 금액을 대기 스타일로 보이고 '미입력'을 말하지 않는다.
//  - D2: 시트 환불 주차는 부호 붙은 중립색 · '환불 — 시트 값' · 고칠 수 없다.
//  - F-04: 정정이 대체한 달은 빈 칸까지 잠근다 — 확정 달은 빈 주차가 열린다(2026-07-20 회귀 방지).
//  - F-31: 2월 W5 는 비활성 칸.
// vitest 는 node 환경이라 renderToStaticMarkup 으로 마크업을 본다.
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  buildRevMatrixEditContext,
  RevMatrixWeekCells,
  type MatrixEditorActions,
  type MatrixPendingDraft,
  type RevMatrixSheetCell,
} from "@/components/admin/branch/ledger/RevMatrix"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

const MONTH = "2026-12"
const noop = () => {}
const actions = {
  setBuffer: noop,
  setEditConfidence: noop,
  selectCell: noop,
  beginEdit: noop,
  cancelEdit: noop,
  commitBuffer: () => false,
  onEditingKeyDown: noop,
  onSelectedKeyDown: noop,
} as unknown as MatrixEditorActions

function row(partial: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "deal-1",
    customer: "예시학원",
    manager: "예시A",
    team: "BD",
    region: null,
    revenue: 0,
    ledgerOrigin: "sheet",
    confidenceColorHint: true,
    ...partial,
  } as LedgerRevenueRow
}

function render(target: LedgerRevenueRow, weeks: number[], options: { month?: string; corrected?: Set<string>; pendingByCell?: Map<string, MatrixPendingDraft>; monthOnlyAmount?: number; compact?: boolean } = {}) {
  const month = options.month ?? MONTH
  const editContext = buildRevMatrixEditContext({
    row: target,
    correctedMonths: options.corrected ?? null,
    actions,
    selectedCoord: null,
    editingCoord: null,
    editBuffer: "",
    editConfidence: "expected",
    pendingByCell: options.pendingByCell ?? null,
  })
  return renderToStaticMarkup(
    <table>
      <tbody>
        <tr>
          <RevMatrixWeekCells weeks={weeks} inferred={false} monthOnlyAmount={options.monthOnlyAmount ?? 0} bgClass="" month={month} editContext={editContext} compact={options.compact} />
        </tr>
      </tbody>
    </table>,
  )
}

function cells(markup: string): string[] {
  return markup.split("<td").slice(1).map((cell) => `<td${cell}`)
}

describe("RevMatrixWeekCells — 대기 금액(F-19)", () => {
  it("빈 칸에 대기 초안 금액을 대기 스타일로 보이고 '미입력'을 말하지 않는다", () => {
    const target = row()
    const pendingDraft: MatrixPendingDraft = { id: "d-1", kind: "edit-row", amount: 1_234_567, confidence: "expected", weekly: [0, 0, 1_234_567, 0, 0], weeklyConfidence: [null, null, "expected", null, null] }
    const markup = render(target, [0, 0, 0, 0, 0], { pendingByCell: new Map([[`${target.id}::${MONTH}`, pendingDraft]]), compact: true })
    const w3 = cells(markup)[2]
    expect(w3).toContain("1,234,567")
    expect(w3).toContain("W3 대기 중 변경 ¥1,234,567 (지금 장부 ¥0)")
    expect(w3).not.toContain("미입력")
    expect(w3).toContain("dashed")
  })

  it("고친 칸은 새 대기 값을, 바뀌지 않은 칸은 시트 값을 그대로 보인다", () => {
    const target = row({ monthlyPayments: { [MONTH]: 2_430_000 }, weeklyPayments: { [MONTH]: [0, 2_430_000, 0, 0, 0] } })
    const pendingDraft: MatrixPendingDraft = { id: "d-1", kind: "edit-row", amount: 3_000_000, confidence: "expected", weekly: [0, 3_000_000, 0, 0, 0], weeklyConfidence: null }
    const all = cells(render(target, [0, 2_430_000, 0, 0, 0], { pendingByCell: new Map([[`${target.id}::${MONTH}`, pendingDraft]]) }))
    expect(all[1]).toContain("W2 대기 중 변경 ¥3,000,000 (지금 장부 ¥2,430,000)")
    expect(all[1]).toContain("3,000,000")
    expect(all[1]).not.toContain(">2,430,000<")
  })
})

describe("RevMatrixWeekCells — 환불 · 정정 · 없는 주차", () => {
  it("환불 주차는 '-130,000' 중립색 · '환불 — 시트 값' · 편집 불가", () => {
    const target = row({ monthlyPayments: { [MONTH]: -30_000 }, weeklyPayments: { [MONTH]: [100_000, -130_000, 0, 0, 0] } })
    const all = cells(render(target, [100_000, -130_000, 0, 0, 0], { compact: true }))
    expect(all[1]).toContain("-130,000")
    expect(all[1]).toContain("환불 — 시트 값")
    expect(all[1]).toContain("text-[#31302E]")
    expect(all[1]).not.toContain("text-[#B43E3E]")
    // 환불 달은 빈 칸까지 잠근다.
    for (const cell of all) expect(cell).toContain('tabindex="-1"')
  })

  it("정정이 대체한 달은 빈 칸도 잠근다", () => {
    const target = row({ monthlyPayments: { [MONTH]: 0 } })
    const all = cells(render(target, [0, 0, 0, 0, 0], { corrected: new Set([MONTH]) }))
    for (const cell of all) {
      expect(cell).toContain('tabindex="-1"')
      expect(cell).toContain("장부 정정으로 대체된 달이라 잠금")
    }
  })

  it("확정으로 잠긴 달은 값 있는 칸만 잠그고 빈 칸은 열어 둔다(2026-07-20)", () => {
    const target = row({ monthlyPayments: { [MONTH]: 16_000 }, weeklyPayments: { [MONTH]: [16_000, 0, 0, 0, 0] }, monthlyRed: { [MONTH]: true } })
    const all = cells(render(target, [16_000, 0, 0, 0, 0]))
    expect(all[0]).toContain('tabindex="-1"')
    expect(all[2]).toContain('tabindex="0"')
  })

  it("2월 W5 는 비활성 칸 · 'W4까지만'", () => {
    const feb = "2027-02"
    const all = cells(render(row(), [0, 0, 0, 0, 0], { month: feb }))
    expect(all[4]).toContain('aria-disabled="true"')
    expect(all[4]).toContain("2월은 시트에 W4까지만 있습니다")
    expect(all[4]).not.toContain("tabindex")
    expect(all[3]).toContain('tabindex="0"')
  })
})

describe("RevMatrixWeekCells — 시트 보기가 미리 정한 칸(sheetCells)", () => {
  it("sheetCells 를 주면 그 표시·편집 가능·툴팁을 그대로 쓴다", () => {
    const target = row()
    const editContext = buildRevMatrixEditContext({ row: target, actions, selectedCoord: null, editingCoord: null, editBuffer: "", editConfidence: "expected", pendingByCell: null })
    const sheetCells: RevMatrixSheetCell[] = [
      { display: 0, isMonthOnly: false, confidence: null, refund: -30_000, absent: false, editable: false, pendingAmount: null, pendingConfidence: null, title: "W1 -¥30,000 · 환불 — 시트 값" },
      { display: 5_000, isMonthOnly: false, confidence: "confirmed", refund: 0, absent: false, editable: true, pendingAmount: null, pendingConfidence: null, title: "W2 ¥5,000 · 확정 · 클릭·Enter로 편집" },
      { display: 0, isMonthOnly: false, confidence: null, refund: 0, absent: false, editable: true, pendingAmount: 7_000, pendingConfidence: "high-confidence", title: "W3 대기 중 변경 ¥7,000 (지금 장부 ¥0)" },
      { display: 0, isMonthOnly: false, confidence: null, refund: 0, absent: false, editable: true, pendingAmount: null, pendingConfidence: null, title: "W4 미입력 · 클릭·Enter로 편집" },
      { display: 0, isMonthOnly: false, confidence: null, refund: 0, absent: true, editable: false, pendingAmount: null, pendingConfidence: null, title: "W5 · 2월은 시트에 W4까지만 있습니다" },
    ]
    const markup = renderToStaticMarkup(
      <table><tbody><tr>
        <RevMatrixWeekCells weeks={[0, 5_000, 0, 0, 0]} inferred={false} monthOnlyAmount={0} bgClass="" month={MONTH} editContext={editContext} compact sheetCells={sheetCells} />
      </tr></tbody></table>,
    )
    const all = cells(markup)
    expect(all[0]).toContain('title="W1 -¥30,000 · 환불 — 시트 값"')
    expect(all[0]).toContain('tabindex="-1"')
    expect(all[1]).toContain('tabindex="0"')
    expect(all[2]).toContain("7,000")
    expect(all[4]).toContain('aria-disabled="true"')
  })
})
