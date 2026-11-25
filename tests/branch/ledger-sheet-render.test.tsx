import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import LedgerSheet, { type LedgerSheetProps } from "@/components/admin/branch/ledger/LedgerSheet"
import LedgerSimpleView from "@/components/admin/branch/ledger/LedgerSimpleView"
import type { LedgerCellEditApi } from "@/components/admin/branch/ledger/LedgerSimpleEdit"
import {
  buildSheetColumns,
  buildSheetRowView,
  filterSheetRows,
  SHEET_PARTIAL_NOTICE,
  sumSheetRows,
  type SheetColumns,
} from "@/components/admin/branch/ledger/ledger-sheet-logic"
import type { MatrixPendingDraft } from "@/components/admin/branch/ledger/rev-matrix-logic"
import type { LedgerDraft, LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"

// 건별 시트 · 기관별 보기 렌더(잠금 전 정리 2026-11-25). vitest 는 node 환경이라 renderToStaticMarkup 으로 본다.
//  - F-13 불러오는 중이면 몸통 · 합계 · 빈 문구 · [모두 풀기]를 감추고, 일부만이면 표 위 한 줄과 "일부 합계".
//  - D2 환불은 "-30,000" 중립색, 툴팁 '환불 — 시트 값'.
//  - F-19 대기 초안이 걸린 달의 계는 적용되면 될 금액(대기 표시).
//  - F-32 정정 행 # "342*", F-31 2월 W5 머리는 필터 메뉴가 없다.

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
const NOV = "2026-11"
const TODAY = "2026-11-25"

function row(partial: Partial<LedgerRevenueRow>): LedgerRevenueRow {
  return { id: partial.id ?? "x", customer: partial.id ?? "x", manager: "예시A", team: "BD", region: null, revenue: 0, ledgerOrigin: "sheet", ...partial }
}

const refund = row({ id: "refund", customer: "예시학원B", sheetRow: 4, monthlyPayments: { [NOV]: -30_000 }, monthlyConfirmed: { [NOV]: -30_000 }, monthlyRed: { [NOV]: true } })
const mixed = row({
  id: "mixed", customer: "예시학원M", sheetRow: 5, monthlyPayments: { [NOV]: -30_000 }, monthlyConfirmed: { [NOV]: -30_000 }, monthlyRed: { [NOV]: true },
  weeklyPayments: { [NOV]: [100_000, -130_000, 0, 0, 0] }, weeklyColors: { [NOV]: "rr---" },
})
const plain = row({
  id: "plain", customer: "예시학원A", sheetRow: 7, monthlyPayments: { [NOV]: 50_000 }, monthlyConfirmed: { [NOV]: 50_000 }, monthlyHighConfidence: { [NOV]: 0 },
  weeklyPayments: { [NOV]: [0, 50_000, 0, 0, 0] }, weeklyColors: { [NOV]: "-r---" },
})
const correction = row({
  id: "ledger-e1", customer: "예시학원A", sheetRow: 342, ledgerOrigin: "draft", draftKind: "edit-row", draftMonth: NOV, revenue: 60_000,
  monthlyPayments: { [NOV]: 60_000 }, monthlyConfirmed: { [NOV]: 60_000 },
})

function sheetProps(rows: LedgerRevenueRow[], overrides: Partial<LedgerSheetProps> = {}, columns: SheetColumns = buildSheetColumns(MONTHS, NOV)): LedgerSheetProps {
  const allViews = rows.map((item) => buildSheetRowView(item, columns, null, TODAY))
  const views = filterSheetRows(allViews, {})
  return {
    columns,
    views,
    allViews,
    totals: sumSheetRows(views, columns),
    filters: {},
    onFiltersChange: () => {},
    currentMonth: NOV,
    loading: false,
    emptyText: "걸린 필터에 맞는 행이 없습니다.",
    onClearFilters: () => {},
    activeRowId: null,
    onOpenRow: () => {},
    editor: null,
    pendingByCell: null,
    ...overrides,
  }
}

const render = (props: LedgerSheetProps) => renderToStaticMarkup(<LedgerSheet {...props} />)
/** title 로 찾은 칸 하나(여는 태그부터 닫는 </td> 까지). */
function cellByTitle(html: string, title: string): string {
  const start = html.indexOf(`title="${title}`)
  expect(start, title).toBeGreaterThan(-1)
  const open = html.lastIndexOf("<td", start)
  return html.slice(open, html.indexOf("</td>", start) + 5)
}

describe("F-13 — 불러오는 중 · 일부만", () => {
  it("불러오는 중이면 장부 입력분이 먼저 와도 행 · 합계 · [모두 풀기]를 보이지 않는다", () => {
    const html = render(sheetProps([correction, plain], { loading: true }))
    expect(html).toContain("장부를 불러오는 중입니다.")
    expect(html).toContain("불러오는 중")
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain("예시학원A")
    expect(html).not.toContain("110,000")
    expect(html).not.toContain("모두 풀기")
    expect(html).not.toContain("행</span>")
  })

  it("일부만 불러왔으면 표 위 한 줄과 '일부 합계', 0행이어도 [모두 풀기] · 빈 문구를 보이지 않는다", () => {
    const html = render(sheetProps([correction], { partialNotice: SHEET_PARTIAL_NOTICE, onRetry: () => {} }))
    expect(html).toContain("data-sheet-partial")
    expect(html).toContain(SHEET_PARTIAL_NOTICE)
    expect(html).toContain("다시 시도")
    expect(html).toContain("일부 합계")
    expect(html).toContain("예시학원A")
    const empty = render(sheetProps([], { partialNotice: SHEET_PARTIAL_NOTICE }))
    expect(empty).toContain("장부에서 넣은 행도 이 범위에는 없습니다.")
    expect(empty).not.toContain("모두 풀기")
    expect(empty).not.toContain("걸린 필터에 맞는 행이 없습니다.")
    expect(empty).not.toContain("다시 시도")
  })

  it("다 불러왔으면 예전처럼 — 합계 · 행 수 · 빈 문구 · [모두 풀기]", () => {
    expect(render(sheetProps([plain]))).toContain("합계 <span")
    const empty = render(sheetProps([]))
    expect(empty).toContain("걸린 필터에 맞는 행이 없습니다.")
    expect(empty).toContain("모두 풀기")
    expect(empty).not.toContain('aria-busy="true"')
  })
})

describe("D2 — 환불은 음수 그대로, 중립색", () => {
  const html = render(sheetProps([refund, mixed, plain]))

  it("월 계 · FY 칸에 '-30,000', 툴팁에 '환불 — 시트 값'(부호는 ¥ 앞)", () => {
    const cell = cellByTitle(html, "11월 계 -¥30,000 · 확정 -¥30,000 · 고확도 ¥0 · 예정 ¥0 · 환불 — 시트 값")
    expect(cell).toContain("-30,000")
    // 확정 크림슨으로 칠하지 않는다(E-14 혼동 방지).
    expect(cell).not.toContain(CONFIDENCE_TOKENS.confirmed.textStrongClass)
    expect(html).toContain('title="FY 합계 -¥30,000')
  })

  it("합계 행 — 부호 그대로 더하고, 주차 칸에 환불 주차가 들어 W1~W5 합이 계와 맞는다", () => {
    // 계: −30,000 − 30,000 + 50,000 = −10,000. W2: −130,000 + 50,000 = −80,000.
    expect(html).toContain('title="11월 계 -¥10,000')
    expect(html).toContain('title="W2 -¥80,000"')
    expect(html).toContain('title="W5 -¥30,000"')
    expect(html).toContain('title="W1 ¥100,000"')
  })

  it("데이터 행 주차 칸 — 환불 주차는 '-130,000' 중립색, 그 달 다른 주차도 잠금 툴팁(시트 보기가 정한 칸이 이긴다)", () => {
    const only = render(sheetProps([mixed]))
    const cell = cellByTitle(only, "W2 -¥130,000 · 환불 — 시트 값")
    expect(cell).toContain(">-130,000</span>")
    expect(cell).toContain("text-[#31302E]")
    expect(only).toContain('title="W3 미입력 · 환불이 든 달 — 시트 값이라 장부에서 고치지 않습니다"')
  })
})

describe("F-19 — 대기 초안이 걸린 달의 계", () => {
  it("적용되면 될 금액을 대기 표시(밑줄 · 점 · 확도 글자색)로, 툴팁은 지금 장부 값과 함께", () => {
    const pending: MatrixPendingDraft = { id: "p1", kind: "edit-row", amount: 80_000, confidence: "expected", weekly: [0, 50_000, 30_000, 0, 0], weeklyConfidence: null }
    const html = render(sheetProps([plain], { pendingByCell: new Map([["plain::2026-11", pending], ["plain::2026-11::w3", pending]]) }))
    const cell = cellByTitle(html, "11월 계 대기 포함 ¥80,000 (지금 장부 ¥50,000)")
    expect(cell).toContain("80,000")
    expect(cell).toContain(CONFIDENCE_TOKENS.expected.textStrongClass)
    expect(cell).toContain("box-shadow:inset 0 -2px 0 0")
    // 합계 행은 적용분만(D1).
    expect(html).toContain('title="11월 계 ¥50,000')
  })
})

describe("F-32 · F-31 — 정정 행 # 와 2월 W5 머리", () => {
  it("정정 행은 흐린 '342*' 와 대체 툴팁, 연필도 정정이라고 말한다", () => {
    const html = render(sheetProps([correction]))
    expect(html).toContain('title="장부 정정 · 시트 342행의 11월을 대체"')
    expect(html).toContain(">342*</td>")
    expect(html).toContain('aria-label="장부에서 정정한 행"')
    expect(html).not.toContain("장부에서 입력한 행(시트에 없는 행)")
  })

  it("2월 W5 는 필터 메뉴가 없는 흐린 머리 — W4 까지는 그대로 메뉴", () => {
    const html = render(sheetProps([plain], {}, buildSheetColumns(MONTHS, "2027-02")))
    expect(html).toContain('data-sheet-filter-key="m0.w4"')
    expect(html).not.toContain('data-sheet-filter-key="m0.w5"')
    expect(html).toContain('title="2월은 시트에 W4까지만 있습니다"')
    // 3월(다음 달)은 W5 가 있다.
    expect(html).toContain('data-sheet-filter-key="m1.w5"')
  })
})

describe("기관별 보기 — 환불 칸 · 만 단위 하나 · applyBusy", () => {
  const edit: LedgerCellEditApi = {
    editable: () => true,
    value: () => 0,
    confidence: () => "expected",
    pending: () => null,
    commit: async () => true,
  }
  const base = {
    months: MONTHS,
    currentMonth: NOV,
    monthlyGoals: null,
    personal: true,
    managerGoals: [],
    loading: false,
    pendingDrafts: [] as LedgerDraft[],
    serverQueue: true,
    onCheckDrafts: async () => ({ done: 0, failed: 0 }),
    onApplyDrafts: async () => ({ done: 0, failed: 0 }),
    onShowQueue: () => {},
    onOpenRow: () => {},
    onOpenManager: () => {},
  }

  it("환불만 있는 줄은 '-3만'(부호는 숫자 앞), 고칠 수 없고 툴팁에 '환불 — 시트 값'", () => {
    const html = renderToStaticMarkup(<LedgerSimpleView {...base} rows={[refund]} edit={edit} view="accounts" />)
    expect(html).toContain("예시학원B")
    expect(html).toContain("-3만")
    expect(html).toContain("-¥3만")
    expect(html).toContain("환불 — 시트 값")
    // 환불이 든 11월 칸은 고치지 않는다(다른 달의 빈 칸은 그대로 고칠 수 있다).
    expect(html).not.toContain("예시학원B 11월")
    expect(html).toContain("예시학원B 12월 비어 있음 — 수정")
    // KR Team 식 축약(cny "3.0만")이 아니다.
    expect(html).not.toContain("3.0만")
    // 음수 확정은 확정 크림슨이 아니고, 막대 비율은 음수로 그리지 않는다.
    expect(html).not.toMatch(new RegExp(`${CONFIDENCE_TOKENS.confirmed.textClass.replace(/[[\]#]/g, "\\$&")}" title="확정 -`))
    expect(html).not.toContain("width:-")
  })

  it("양수 칸은 그대로 고칠 수 있다", () => {
    const html = renderToStaticMarkup(<LedgerSimpleView {...base} rows={[plain]} edit={edit} view="accounts" />)
    expect(html).toContain("예시학원A 11월 ¥5만 — 수정")
  })

  it("applyBusy 를 변경 대기 줄에 넘긴다", () => {
    const draft = { id: "d1", status: "checked", amount: 1_000, customer: "예시학원A", manager: "예시A", team: "BD", month: NOV, kind: "edit-row", note: "", metadata: {} } as unknown as LedgerDraft
    const busy = renderToStaticMarkup(<LedgerSimpleView {...base} rows={[plain]} edit={null} pendingDrafts={[draft]} applyBusy view="accounts" />)
    const idle = renderToStaticMarkup(<LedgerSimpleView {...base} rows={[plain]} edit={null} pendingDrafts={[draft]} view="accounts" />)
    expect(busy).toContain("반영 중…")
    expect(idle).not.toContain("반영 중…")
  })
})
