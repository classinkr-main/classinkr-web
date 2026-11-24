"use client"

// 장부 건별 시트(2026-11-23, 기획 W2·W3) — 장부를 열면 바로 보이는 표.
//
// 시트 '2. REV' 처럼 건별 한 줄(28px)이고, 기준 달과 다음 달만 [계 · W1~W5]로 편다. 카드 테두리·좌우 여백 없이
// 부모가 준 영역을 꽉 채우고 안에서 스크롤한다(머리 3줄 = 월 띠 · 열 이름 · 합계가 위에, # · 고객 열이 왼쪽에 고정).
// 주차 칸은 주차 검수 표(RevMatrix)의 칸 컴포넌트를 그대로 쓴다 — 선택·숫자 입력·Enter 저장·잠금·대기 표시가 같은 코드다.
// 행 구성·필터·합계는 ledger-sheet-logic.ts(순수 함수) 가 정한다.
import { memo } from "react"
import { AlertTriangle, Filter, Lock, Pencil } from "lucide-react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { branchManagerLabel } from "@/lib/branch/personal-scope"
import {
  sheetFilterColumnLabel,
  sheetFilterModeLabel,
  type SheetColumnFilters,
  type SheetColumns,
  type SheetRowView,
  type SheetTotals,
} from "./ledger-sheet-logic"
import { buildRevMatrixEditContext, RevMatrixWeekCells, SHEET_WEEK_W } from "./RevMatrix"
import { dominantCellConfidence, type MatrixCellCoord, type MatrixEditorActions, type MatrixPendingDraft } from "./rev-matrix-logic"
import { formatMoney, formatWeekAmount, type DraftConfidence, type LedgerRevenueRow, type RevMonthlyBucket } from "./shared"

// 열 폭(px). 주차 칸 폭은 칸 컴포넌트와 같은 값(SHEET_WEEK_W)이어야 한다. 비고만 남는 폭을 가져간다.
const W = { num: 30, customer: 172, manager: 50, product: 34, region: 42, contract: 38, channel: 38, item: 88, past: 72, total: 72, later: 68, fy: 80, note: 64 } as const

// 선 — 칸 사이는 옅게(#F0F0EC), 묶음 경계는 한 단계 진하게(#E8E8E4), 월 묶음이 끊기는 "계" 왼쪽은 진한 선(#A39E98).
const CELL = "box-border h-7 overflow-hidden text-ellipsis whitespace-nowrap border-b border-b-[#F0F0EC] px-1.5 py-0 align-middle"
const HEAD = "box-border h-[26px] overflow-hidden whitespace-nowrap border-b border-b-[#E8E8E4] px-1.5 py-0 align-middle text-[11.5px]"
// 합계 행은 자릿수가 하나 더 길다 — 주차 칸(60px)에 7자리 합계가 들어가게 글자·여백을 한 단계 줄인다(잘리면 title 로 전체).
const SUM_BASE = "box-border h-7 overflow-hidden whitespace-nowrap border-b border-b-[#E8E8E4] px-1 py-0 align-middle text-[11px] font-bold tracking-[-0.01em] text-[#111110]"
const SUM = `${SUM_BASE} bg-[#FAFAF8]`
const SUM_TOTAL = `${SUM_BASE} bg-[#E8E8E4]`

function bucketTitle(label: string, bucket: RevMonthlyBucket) {
  if (bucket.total <= 0) return undefined
  return `${label} ${formatMoney(bucket.total)} · 확정 ${formatMoney(bucket.confirmed)} · 고확도 ${formatMoney(bucket.high)} · 예정 ${formatMoney(bucket.open)}`
}

/** 한 가지 확도뿐인 금액이면 그 확도 글자색, 섞였으면 먹색. */
function bucketTextClass(bucket: RevMonthlyBucket) {
  if (bucket.total <= 0) return ""
  const single = bucket.confirmed >= bucket.total || (bucket.confirmed <= 0 && (bucket.high <= 0 || bucket.open <= 0))
  if (!single) return "text-[#31302E]"
  const kind: DraftConfidence = dominantCellConfidence(bucket)
  return `${kind === "confirmed" ? "font-bold" : kind === "high-confidence" ? "font-semibold" : ""} ${CONFIDENCE_TOKENS[kind].textStrongClass}`
}

/** "11월" */
const monthKo = (month: string) => `${Number(month.slice(5, 7))}월`

const amount = (value: number) => (value > 0 ? formatWeekAmount(value) : "")

export interface LedgerSheetEditorState {
  actions: MatrixEditorActions
  selected: MatrixCellCoord | null
  editing: MatrixCellCoord | null
  buffer: string
  editConfidence: DraftConfidence
}

const SheetRow = memo(function SheetRow({
  view,
  index,
  columns,
  active,
  onOpen,
  actions,
  selectedCoord,
  editingCoord,
  editBuffer,
  editConfidence,
  pendingByCell,
}: {
  view: SheetRowView
  index: number
  columns: SheetColumns
  active: boolean
  onOpen: (row: LedgerRevenueRow) => void
  actions: MatrixEditorActions | null
  // 선택·편집 좌표는 이 행일 때만 온다(다른 행이면 null) — 관여하지 않는 행은 memo 로 건너뛴다.
  selectedCoord: MatrixCellCoord | null
  editingCoord: MatrixCellCoord | null
  editBuffer: string
  editConfidence: DraftConfidence
  pendingByCell: Map<string, MatrixPendingDraft> | null
}) {
  const { row } = view
  const draftRow = row.ledgerOrigin === "draft"
  const rowBg = active ? "[--row-bg:#EAF6F0]" : draftRow ? "[--row-bg:#FFFCF5] hover:[--row-bg:#FBF1E0]" : "[--row-bg:#FFFFFF] hover:[--row-bg:#FAFAF8]"
  const editContext = actions
    ? buildRevMatrixEditContext({ row, correctedMonths: view.correctedMonths, actions, selectedCoord, editingCoord, editBuffer, editConfidence, pendingByCell })
    : null
  const manager = row.manager ? branchManagerLabel(row.manager) : ""
  const mismatchTitle = view.mismatchMonths.length > 0
    ? `주차 합계와 월 금액이 다릅니다 — ${view.mismatchMonths.map(monthKo).join(", ")}`
    : ""
  return (
    <tr className={`group bg-(--row-bg) text-[12px] text-[#31302E] ${rowBg}`}>
      <td className={`${CELL} sticky left-0 z-10 bg-(--row-bg) text-right text-[11px] text-[#615D59]`} title={row.sheetRow != null ? `시트 ${row.sheetRow}행` : undefined}>
        {index + 1}
      </td>
      <th scope="row" className={`${CELL} sticky z-10 border-l border-l-[#F0F0EC] border-r border-r-[#E8E8E4] bg-(--row-bg) text-left font-medium`} style={{ left: W.num }}>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpen(row)}
            title={`${row.customer} — 상세 열기`}
            className="min-w-0 flex-1 truncate text-left text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]"
          >
            {row.customer}
          </button>
          {draftRow ? (
            <span role="img" aria-label="장부에서 입력한 행" title="장부에서 입력한 행(시트에 없는 행)" className="shrink-0 text-[#615D59]"><Pencil aria-hidden className="h-3 w-3" /></span>
          ) : null}
          {view.mismatchMonths.length > 0 ? (
            <span role="img" aria-label="정합 불일치" title={mismatchTitle} className="shrink-0 text-[#B43E3E]"><AlertTriangle aria-hidden className="h-3 w-3" /></span>
          ) : null}
          {view.lockedConfirmed ? (
            <span role="img" aria-label="전액 확정 · 잠금" title="전액 확정이라 잠긴 행입니다 — 고치려면 고객명을 눌러 정정 입력을 씁니다." className="shrink-0 text-[#615D59]"><Lock aria-hidden className="h-3 w-3" /></span>
          ) : null}
        </span>
      </th>
      <td className={`${CELL} border-l border-l-[#F0F0EC]`} title={manager || undefined}>{manager}</td>
      <td className={`${CELL} border-l border-l-[#F0F0EC] ${view.product === "HW" ? "font-bold text-[#111110]" : "text-[#615D59]"}`}>{view.product}</td>
      <td className={`${CELL} border-l border-l-[#F0F0EC]`} title={row.region ?? undefined}>{row.region ?? ""}</td>
      <td className={`${CELL} border-l border-l-[#F0F0EC] ${view.contract === "신규" ? "font-bold text-[#084734]" : ""}`}>{view.contract}</td>
      <td className={`${CELL} border-l border-l-[#F0F0EC] ${view.channel === "채널" ? "font-bold text-[#111110]" : ""}`}>{view.channel}</td>
      <td className={`${CELL} border-l border-l-[#F0F0EC]`} title={row.productVersion ?? undefined}>{row.productVersion ?? ""}</td>
      {columns.pastMonths.length === 0 ? null : columns.pastPinned ? (
        <td className={`${CELL} border-l border-l-[#E8E8E4] bg-[#F0F0EC] text-right tabular-nums text-[#31302E]`} title={bucketTitle(columns.pastLabel ?? "", view.past)}>
          {amount(view.past.total)}
        </td>
      ) : (
        view.pastByMonth.map((bucket, monthIndex) => (
          <td key={columns.pastMonths[monthIndex]} className={`${CELL} border-l border-l-[#F0F0EC] text-right tabular-nums ${bucketTextClass(bucket)}`} title={bucketTitle(monthKo(columns.pastMonths[monthIndex]), bucket)}>
            {amount(bucket.total)}
          </td>
        ))
      )}
      {view.blocks.map((block) => (
        <SheetBlockCells key={block.month} block={block} editContext={editContext} />
      ))}
      {columns.laterMonths.length > 0 ? (
        <td className={`${CELL} border-l border-l-[#E8E8E4] text-right tabular-nums ${bucketTextClass(view.later)}`} title={bucketTitle(columns.laterLabel ?? "", view.later)}>
          {amount(view.later.total)}
        </td>
      ) : null}
      <td className={`${CELL} border-l border-l-[#A39E98] bg-[#F0F0EC] text-right font-bold tabular-nums text-[#111110]`} title={bucketTitle("FY 합계", view.annual)}>
        {amount(view.annual.total)}
      </td>
      <td className={`${CELL} border-l border-l-[#E8E8E4] text-left text-[#615D59]`} title={view.note || undefined}>{view.note}</td>
    </tr>
  )
})

function SheetBlockCells({ block, editContext }: { block: SheetRowView["blocks"][number]; editContext: ReturnType<typeof buildRevMatrixEditContext> | null }) {
  return (
    <>
      <td
        className={`${CELL} border-l border-l-[#A39E98] bg-[#F0F0EC] text-right font-bold tabular-nums text-[#111110]`}
        title={`${bucketTitle(`${monthKo(block.month)} 계`, block.bucket) ?? ""}${block.mismatch ? " · 주차 합계와 다릅니다" : ""}` || undefined}
      >
        <span className="inline-flex max-w-full items-center justify-end gap-0.5">
          {block.mismatch ? <AlertTriangle aria-label="주차·월 불일치" className="h-2.5 w-2.5 shrink-0 text-[#B43E3E]" /> : null}
          {amount(block.bucket.total)}
        </span>
      </td>
      <RevMatrixWeekCells
        weeks={block.rawWeeks}
        inferred={block.inferred}
        monthOnlyAmount={block.monthOnlyAmount}
        bgClass=""
        month={block.month}
        editContext={editContext}
        compact
        sheetConfidences={block.weeks.map((cell) => cell.confidence)}
      />
    </>
  )
}

export interface LedgerSheetProps {
  columns: SheetColumns
  /** 필터까지 반영한, 지금 보이는 행. */
  views: SheetRowView[]
  totals: SheetTotals
  filters: SheetColumnFilters
  /** 표 위 칩 줄이 지금 다루는 열. */
  selectedFilterKey: string
  /** 열 머리를 눌렀다 — 그 열을 고르고, 필터가 없으면 공백 제외를 걸고, 이미 고른 열이면 푼다(판단은 부모). */
  onPickFilterColumn: (key: string) => void
  /** 오늘이 속한 달 — 월 띠에 "이번 달"을 붙인다. */
  currentMonth: string
  loading: boolean
  /** 행이 없을 때 문구. */
  emptyText: string
  onClearFilters?: () => void
  activeRowId: string | null
  onOpenRow: (row: LedgerRevenueRow) => void
  /** 칸 편집 상태(없으면 읽기 전용). */
  editor: LedgerSheetEditorState | null
  pendingByCell: Map<string, MatrixPendingDraft> | null
}

export default function LedgerSheet({
  columns,
  views,
  totals,
  filters,
  selectedFilterKey,
  onPickFilterColumn,
  currentMonth,
  loading,
  emptyText,
  onClearFilters,
  activeRowId,
  onOpenRow,
  editor,
  pendingByCell,
}: LedgerSheetProps) {
  const pastCols = columns.pastMonths.length === 0 ? 0 : columns.pastPinned ? 1 : columns.pastMonths.length
  const laterCols = columns.laterMonths.length > 0 ? 1 : 0
  const leadCols = 8
  const totalCols = leadCols + pastCols + columns.blocks.length * 6 + laterCols + 2
  const minWidth =
    W.num + W.customer + W.manager + W.product + W.region + W.contract + W.channel + W.item +
    pastCols * W.past + columns.blocks.length * (W.total + SHEET_WEEK_W * 5) + laterCols * W.later + W.fy + W.note

  const filterHead = (key: string, text: string, month: boolean) => {
    const mode = filters[key]
    const on = Boolean(mode)
    const picked = key === selectedFilterKey
    const label = sheetFilterColumnLabel(key, columns) ?? text
    return (
      <th
        key={key}
        scope="col"
        className={`box-border h-[26px] border-b border-b-[#E8E8E4] p-0 align-middle ${month ? "border-l border-l-[#A39E98]" : "border-l border-l-[#E8E8E4]"} ${on ? "bg-[#084734]" : month ? "bg-[#E8E8E4]" : "bg-[#F6F5F4]"}`}
      >
        <button
          type="button"
          aria-pressed={on}
          aria-label={on ? `${label} 필터 — ${sheetFilterModeLabel(mode)} 걸림` : `${label} 필터`}
          title={on ? `${label} · ${sheetFilterModeLabel(mode)} 걸림 — ${picked ? "다시 누르면 풉니다" : "누르면 이 열을 고릅니다"}` : `${label} — 누르면 값이 있는 행만 봅니다(공백 제외)`}
          onClick={() => onPickFilterColumn(key)}
          className={`flex h-[25px] w-full items-center justify-end gap-1 px-1.5 text-[11.5px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#084734] ${
            on ? "font-bold text-white focus-visible:outline-white" : month ? "font-bold text-[#111110] hover:bg-[#DDD9D3]" : "text-[#615D59] hover:bg-[#E8E8E4] hover:text-[#111110]"
          } ${picked ? "shadow-[inset_0_-3px_0_#A8741A]" : ""}`}
        >
          <span>{text}</span>
          <Filter aria-hidden className={`h-2.5 w-2.5 shrink-0 ${on ? "" : "opacity-60"}`} strokeWidth={2.4} />
        </button>
      </th>
    )
  }
  const plainHead = (key: string, text: string, className = "", title?: string) => (
    <th key={key} scope="col" title={title} className={`${HEAD} border-l border-l-[#E8E8E4] bg-[#F6F5F4] font-semibold text-[#31302E] ${className}`}>{text}</th>
  )

  return (
    <div
      role="region"
      aria-label="매출 장부 시트"
      data-ledger-sheet-scroll
      className="min-h-[240px] flex-1 overflow-auto border-t border-[#E8E8E4] bg-white max-lg:max-h-[calc(100dvh-13rem)]"
    >
      <table className="w-full border-separate border-spacing-0 tabular-nums" style={{ tableLayout: "fixed", minWidth }}>
        <caption className="sr-only">건별 매출 — 기준 달과 다음 달은 주차 칸, 그 밖의 달은 묶음</caption>
        <colgroup>
          <col style={{ width: W.num }} />
          <col style={{ width: W.customer }} />
          <col style={{ width: W.manager }} />
          <col style={{ width: W.product }} />
          <col style={{ width: W.region }} />
          <col style={{ width: W.contract }} />
          <col style={{ width: W.channel }} />
          <col style={{ width: W.item }} />
          {Array.from({ length: pastCols }, (_, index) => <col key={`past-${index}`} style={{ width: W.past }} />)}
          {columns.blocks.flatMap((block) => [
            <col key={`${block.month}-total`} style={{ width: W.total }} />,
            ...[0, 1, 2, 3, 4].map((week) => <col key={`${block.month}-w${week}`} style={{ width: SHEET_WEEK_W }} />),
          ])}
          {laterCols ? <col style={{ width: W.later }} /> : null}
          <col style={{ width: W.fy }} />
          <col />
        </colgroup>
        <thead className="sticky top-0 z-20">
          {/* 월 묶음 띠 */}
          <tr>
            <th className="sticky left-0 z-30 box-border h-6 border-b border-b-[#E8E8E4] bg-[#F6F5F4] p-0" />
            <th className="sticky z-30 box-border h-6 border-b border-b-[#E8E8E4] bg-[#F6F5F4] p-0" style={{ left: W.num }} />
            <th colSpan={leadCols - 2 + pastCols} className="box-border h-6 border-b border-b-[#E8E8E4] bg-[#F6F5F4] p-0" />
            {columns.blocks.map((block) => (
              <th
                key={block.month}
                scope="colgroup"
                colSpan={6}
                className={`box-border h-6 border-b border-b-[#E8E8E4] border-l border-l-[#A39E98] p-0 text-center text-[11.5px] font-bold ${block.slot === 0 ? "bg-[#ECFDF5] text-[#084734]" : "bg-[#F6F5F4] text-[#31302E]"}`}
              >
                {block.label}{block.month === currentMonth ? " · 이번 달" : ""}
              </th>
            ))}
            <th colSpan={laterCols + 2} className="box-border h-6 border-b border-b-[#E8E8E4] border-l border-l-[#A39E98] bg-[#F6F5F4] p-0" />
          </tr>
          {/* 열 이름 — 월 "계"와 주차 열은 필터 버튼 */}
          <tr>
            <th scope="col" className={`${HEAD} sticky left-0 z-30 bg-[#F6F5F4] text-right font-normal text-[#615D59]`}>#</th>
            <th scope="col" className={`${HEAD} sticky z-30 border-l border-l-[#E8E8E4] border-r border-r-[#E8E8E4] bg-[#F6F5F4] text-left font-semibold text-[#31302E]`} style={{ left: W.num }}>고객</th>
            {plainHead("manager", "담당", "text-left")}
            {plainHead("product", "제품", "text-left", "제품군 — SW · HW")}
            {plainHead("region", "지역", "text-left")}
            {plainHead("contract", "계약", "text-left", "계약 — 신규 · 갱신")}
            {plainHead("channel", "경로", "text-left", "경로 — 직접 · 채널")}
            {plainHead("item", "상품", "text-left")}
            {columns.pastMonths.length === 0
              ? null
              : columns.pastPinned
                ? plainHead("past", columns.pastLabel ?? "", "text-right", "지난달 묶음 — 고정 값")
                : columns.pastMonths.map((month) => plainHead(`past-${month}`, monthKo(month), "text-right"))}
            {columns.blocks.flatMap((block) => [
              filterHead(`m${block.slot}`, "계", true),
              ...[1, 2, 3, 4, 5].map((week) => filterHead(`m${block.slot}.w${week}`, `W${week}`, false)),
            ])}
            {laterCols ? plainHead("later", columns.laterLabel ?? "", "text-right", "이후 월 묶음") : null}
            <th scope="col" className={`${HEAD} border-l border-l-[#A39E98] bg-[#E8E8E4] text-right font-bold text-[#111110]`}>FY 합계</th>
            {plainHead("note", "비고", "text-left")}
          </tr>
          {/* 합계 — 지금 보이는 행만 */}
          <tr>
            <td className={`${SUM} sticky left-0 z-30`} />
            <th scope="row" className={`${SUM} sticky z-30 border-l border-l-[#F0F0EC] border-r border-r-[#E8E8E4] text-left`} style={{ left: W.num }}>
              합계 <span className="font-medium text-[#615D59]">{views.length.toLocaleString("ko-KR")}행</span>
            </th>
            <td colSpan={leadCols - 2} className={SUM} />
            {columns.pastMonths.length === 0 ? null : columns.pastPinned ? (
              <td className={`${SUM} border-l border-l-[#F0F0EC] text-right`} title={bucketTitle(columns.pastLabel ?? "", totals.past)}>{amount(totals.past.total)}</td>
            ) : (
              totals.pastByMonth.map((bucket, index) => (
                <td key={columns.pastMonths[index]} className={`${SUM} border-l border-l-[#F0F0EC] text-right`} title={bucketTitle(monthKo(columns.pastMonths[index]), bucket)}>{amount(bucket.total)}</td>
              ))
            )}
            {totals.blocks.flatMap((block) => [
              <td key={`${block.month}-total`} className={`${SUM_TOTAL} border-l border-l-[#A39E98] text-right`} title={bucketTitle(`${monthKo(block.month)} 계`, block.bucket)}>{amount(block.bucket.total)}</td>,
              ...block.weeks.map((value, week) => (
                <td key={`${block.month}-w${week}`} className={`${SUM} border-l border-l-[#F0F0EC] text-right`} title={value > 0 ? `W${week + 1} ${formatMoney(value)}` : undefined}>{amount(value)}</td>
              )),
            ])}
            {laterCols ? <td className={`${SUM} border-l border-l-[#E8E8E4] text-right`} title={bucketTitle(columns.laterLabel ?? "", totals.later)}>{amount(totals.later.total)}</td> : null}
            <td className={`${SUM_TOTAL} border-l border-l-[#A39E98] text-right`} title={bucketTitle("FY 합계", totals.annual)}>{amount(totals.annual.total)}</td>
            <td className={`${SUM} border-l border-l-[#E8E8E4]`} />
          </tr>
        </thead>
        <tbody>
          {views.length === 0 ? (
            <tr>
              <td colSpan={totalCols} className="px-4 py-10 text-[13px] text-[#615D59]">
                <div className="sticky left-4 inline-flex flex-wrap items-center gap-3" role="status">
                  <span>{loading ? "장부를 불러오는 중입니다." : emptyText}</span>
                  {!loading && onClearFilters ? (
                    <button type="button" onClick={onClearFilters} className="min-h-9 rounded-lg border border-[#084734] bg-white px-3 text-[12.5px] font-semibold text-[#084734] hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]">
                      필터 전부 풀기
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ) : (
            views.map((view, index) => {
              const rowId = view.row.id
              const isEditingRow = editor?.editing?.rowId === rowId
              return (
                <SheetRow
                  key={rowId}
                  view={view}
                  index={index}
                  columns={columns}
                  active={activeRowId === rowId}
                  onOpen={onOpenRow}
                  actions={editor?.actions ?? null}
                  selectedCoord={editor?.selected?.rowId === rowId ? editor.selected : null}
                  editingCoord={isEditingRow ? editor!.editing : null}
                  editBuffer={isEditingRow ? editor!.buffer : ""}
                  editConfidence={isEditingRow ? editor!.editConfidence : "expected"}
                  pendingByCell={pendingByCell}
                />
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
