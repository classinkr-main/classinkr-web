"use client"

// 장부 건별 시트(2026-11-23, 기획 W2·W3) — 장부를 열면 바로 보이는 표.
//
// 시트 '2. REV' 처럼 건별 한 줄(28px)이고, 기준 달과 다음 달만 [계 · W1~W5]로 편다. 카드 테두리·좌우 여백 없이
// 부모가 준 영역을 꽉 채우고 안에서 스크롤한다(머리 3줄 = 월 띠 · 열 이름 · 합계가 위에, # · 고객 열이 왼쪽에 고정).
// 주차 칸은 주차 검수 표(RevMatrix)의 칸 컴포넌트를 그대로 쓴다 — 선택·숫자 입력·Enter 저장·잠금·대기 표시가 같은 코드다.
// 행 구성·필터·합계는 ledger-sheet-logic.ts(순수 함수) 가 정한다.
//
// 2026-11-25 필터 기획 P0(docs/active/ledger-filter-plan-2026-11-24.md):
//  - C-2(가) 금액은 원 그대로, 칸을 넓히고(주 72 · 월 계 80 · 묶음 80 · FY 88, 금액 칸 여백 4px) 안 들어가면 글자를 줄인다
//    — 앞자리를 숨기지 않는다. 1920(패널 접힘, 표 영역 1680px)에서 비고까지 가로 스크롤 없이 들어가는 합(1678px)에 맞췄다.
//  - C-1 `#` = 시트 행 번호(필터·정렬과 무관). 시트에 없는 행은 "새".
//  - F-1 열 머리를 누르면 그 열 아래에 필터 메뉴(값 있음 · 확도 · 값 없음, 여러 개 = OR, 적용 · 이 열만 보기 · 풀기).
//  - D-1 걸린 열 머리는 초록 바탕 + 조건 요약(빈 머리의 필터 아이콘 자리), 그 열의 빈 칸은 옅은 초록 띠. D-3 이번 주 열 머리에 초록 점.
//  - 메뉴로 건 열이 화면 끝에 걸려 있었으면 그 달 묶음이 보이게 가로로 민다(revealSheetColumn).
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Filter, Lock, Pencil, X } from "lucide-react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { getBusinessDateParts } from "@/lib/business-time"
import { branchManagerLabel } from "@/lib/branch/personal-scope"
import {
  clearSheetFilter,
  objectParticle,
  onlySheetFilter,
  parseSheetFilterKey,
  previewSheetFilter,
  setSheetFilter,
  SHEET_FILTER_OPTIONS,
  SHEET_SUM_STEPS,
  sheetAmountFontClass,
  sheetCurrentWeekKey,
  sheetFilterColumnLabel,
  sheetFilterDraft,
  sheetFilterRelaxHint,
  sheetFilterSetLabel,
  sheetFiltersApply,
  sheetMenuAnchorSpan,
  sheetRevealScrollDelta,
  sheetRowNumberCell,
  toggleSheetFilterCondition,
  type SheetColumnFilters,
  type SheetColumns,
  type SheetFilterCondition,
  type SheetRect,
  type SheetRowView,
  type SheetTotals,
} from "./ledger-sheet-logic"
import { buildRevMatrixEditContext, RevMatrixWeekCells, SHEET_WEEK_W } from "./RevMatrix"
import { dominantCellConfidence, type MatrixCellCoord, type MatrixEditorActions, type MatrixPendingDraft } from "./rev-matrix-logic"
import { formatWeekAmount, type DraftConfidence, type LedgerRevenueRow, type RevMonthlyBucket } from "./shared"

// 열 폭(px). 주차 칸 폭은 칸 컴포넌트와 같은 값(SHEET_WEEK_W)이어야 한다. 비고만 남는 폭을 가져간다.
// `#` 30 → 40(시트 행 번호 네 자리), 월 계 72 → 80, 지난달·이후 묶음 80 · FY 88(원 단위 8~10자리 — 필터 기획 C-2 가).
// 금액 칸은 주차 칸처럼 좌우 여백을 4px 로 둬 글자 영역(월 계 · 묶음 71 · FY 79)을 지키면서 칸 합을 줄였다 — 주 칸을 72 로
// 넓힌 뒤 1920(빠른 작업 접힘, 표 영역 1680px)에서 표가 1714px 가 돼 비고가 오른쪽에 잘리고 가로 스크롤이 생겼다.
// 고객 열 172 → 156 이 나머지를 맡는다(합 1678px). 열을 더 넓히려면 이 합이 1680 을 넘지 않는지 함께 본다.
const W = { num: 40, customer: 156, manager: 50, product: 34, region: 42, contract: 38, channel: 38, item: 88, past: 80, total: 80, later: 80, fy: 88, note: 64 } as const

// 금액 글자 영역 폭 — 칸 폭 − 왼쪽 선 1 − 좌우 여백(px-1) 8. 데이터 칸(AMOUNT_CELL) · 합계 행(SUM) · 주차 칸이 같다.
const textW = (width: number) => width - 9
// 월 계 칸의 불일치 경고 아이콘(10px) + 간격 2px.
const MISMATCH_ICON_W = 12

// 선 — 칸 사이는 옅게(#F0F0EC), 묶음 경계는 한 단계 진하게(#E8E8E4), 월 묶음이 끊기는 "계" 왼쪽은 진한 선(#A39E98).
const CELL = "box-border h-7 overflow-hidden text-ellipsis whitespace-nowrap border-b border-b-[#F0F0EC] px-1.5 py-0 align-middle"
// 금액 칸(지난달 묶음 · 월 계 · 이후 묶음 · FY) — 여백만 px-1(주차 칸 · 합계 행과 같다).
const AMOUNT_CELL = "box-border h-7 overflow-hidden text-ellipsis whitespace-nowrap border-b border-b-[#F0F0EC] px-1 py-0 align-middle"
const HEAD = "box-border h-[26px] overflow-hidden whitespace-nowrap border-b border-b-[#E8E8E4] px-1.5 py-0 align-middle text-[11.5px]"
// 합계 행은 자릿수가 하나 더 길다 — 글자·여백을 한 단계 줄여 시작하고, 그래도 넘치면 금액마다 한 단계씩 더 줄인다(SHEET_SUM_STEPS).
const SUM_BASE = "box-border h-7 overflow-hidden text-ellipsis whitespace-nowrap border-b border-b-[#E8E8E4] px-1 py-0 align-middle font-bold tracking-[-0.01em] text-[#111110]"
const SUM = `${SUM_BASE} bg-[#FAFAF8]`
const SUM_TOTAL = `${SUM_BASE} bg-[#E8E8E4]`
// 필터가 걸린 열의 빈 칸 — 옅은 초록 세로 띠(D-1). 값 칸은 제 바탕(확도 틴트 · 월 계 회색)을 그대로 둔다.
const BAND_BG = "bg-[#ECFDF5]"

/** 툴팁 금액 — 칸은 글자를 줄이거나 끝을 자를 수 있어, 툴팁에는 늘 원 단위 전체 금액을 싣는다. */
const exactMoney = (value: number) => `¥${formatWeekAmount(value)}`

function bucketTitle(label: string, bucket: RevMonthlyBucket) {
  if (bucket.total <= 0) return undefined
  return `${label} ${exactMoney(bucket.total)} · 확정 ${exactMoney(bucket.confirmed)} · 고확도 ${exactMoney(bucket.high)} · 예정 ${exactMoney(bucket.open)}`
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

/**
 * 금액 글자 — 0 이면 비운다. 칸에 안 들어가면 글자를 한 단계씩 줄이고(sheetAmountFontClass), 마지막 단계에서도
 * 넘치면 블록 글자가 왼쪽부터 놓여 끝이 줄임표가 된다(앞자리는 늘 보인다).
 */
function Amount({ value, width, steps }: { value: number; width: number; steps?: readonly number[] }) {
  if (value <= 0) return null
  const text = formatWeekAmount(value)
  return <span className={`block truncate ${sheetAmountFontClass(text, width, steps)}`}>{text}</span>
}

export interface LedgerSheetEditorState {
  actions: MatrixEditorActions
  selected: MatrixCellCoord | null
  editing: MatrixCellCoord | null
  buffer: string
  editConfidence: DraftConfidence
}

const hasFilter = (filters: SheetColumnFilters, key: string) => (filters[key]?.length ?? 0) > 0

const SheetRow = memo(function SheetRow({
  view,
  columns,
  filters,
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
  columns: SheetColumns
  /** 걸린 열 필터 — 빈 칸 띠(D-1)만 칠한다. */
  filters: SheetColumnFilters
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
  // `#` = 시트 행 번호(동기화 시점, 필터·정렬과 무관 — 필터 기획 C-1 · D4). 장부에서 넣은 행은 "새", 시트에서 왔는데
  // 번호가 없는 행은 "–"(sheetRowNumberCell — 툴팁 문구도 거기서 정한다).
  const rowNo = sheetRowNumberCell(row)
  return (
    <tr className={`group bg-(--row-bg) text-[12px] text-[#31302E] ${rowBg}`}>
      <td
        className={`${CELL} sticky left-0 z-10 bg-(--row-bg) text-right text-[11px] tabular-nums ${rowNo.kind === "ledger" ? "font-semibold text-[#084734]" : "text-[#615D59]"}`}
        title={rowNo.title}
      >
        {rowNo.text}
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
        <td className={`${AMOUNT_CELL} border-l border-l-[#E8E8E4] bg-[#F0F0EC] text-right tabular-nums text-[#31302E]`} title={bucketTitle(columns.pastLabel ?? "", view.past)}>
          <Amount value={view.past.total} width={textW(W.past)} />
        </td>
      ) : (
        view.pastByMonth.map((bucket, monthIndex) => (
          <td key={columns.pastMonths[monthIndex]} className={`${AMOUNT_CELL} border-l border-l-[#F0F0EC] text-right tabular-nums ${bucketTextClass(bucket)}`} title={bucketTitle(monthKo(columns.pastMonths[monthIndex]), bucket)}>
            <Amount value={bucket.total} width={textW(W.past)} />
          </td>
        ))
      )}
      {view.blocks.map((block) => (
        <SheetBlockCells
          key={block.month}
          block={block}
          editContext={editContext}
          monthBand={hasFilter(filters, `m${block.slot}`)}
          weekBands={[1, 2, 3, 4, 5].map((week) => hasFilter(filters, `m${block.slot}.w${week}`))}
        />
      ))}
      {columns.laterMonths.length > 0 ? (
        <td className={`${AMOUNT_CELL} border-l border-l-[#E8E8E4] text-right tabular-nums ${bucketTextClass(view.later)}`} title={bucketTitle(columns.laterLabel ?? "", view.later)}>
          <Amount value={view.later.total} width={textW(W.later)} />
        </td>
      ) : null}
      <td className={`${AMOUNT_CELL} border-l border-l-[#A39E98] bg-[#F0F0EC] text-right font-bold tabular-nums text-[#111110]`} title={bucketTitle("FY 합계", view.annual)}>
        <Amount value={view.annual.total} width={textW(W.fy)} />
      </td>
      <td className={`${CELL} border-l border-l-[#E8E8E4] text-left text-[#615D59]`} title={view.note || undefined}>{view.note}</td>
    </tr>
  )
})

function SheetBlockCells({
  block,
  editContext,
  monthBand,
  weekBands,
}: {
  block: SheetRowView["blocks"][number]
  editContext: ReturnType<typeof buildRevMatrixEditContext> | null
  monthBand: boolean
  weekBands: boolean[]
}) {
  const total = block.bucket.total
  return (
    <>
      <td
        className={`${AMOUNT_CELL} border-l border-l-[#A39E98] ${monthBand && total <= 0 ? BAND_BG : "bg-[#F0F0EC]"} text-right font-bold tabular-nums text-[#111110]`}
        title={`${bucketTitle(`${monthKo(block.month)} 계`, block.bucket) ?? ""}${block.mismatch ? " · 주차 합계와 다릅니다" : ""}` || undefined}
      >
        {/* 앞자리가 잘리지 않게(F1) — 금액 글자가 줄어들 수 있는 칸(min-w-0)이고, 넘치면 왼쪽부터 놓여 끝이 잘린다. */}
        <span className="flex items-center justify-end gap-0.5">
          {block.mismatch ? <AlertTriangle aria-label="주차·월 불일치" className="h-2.5 w-2.5 shrink-0 text-[#B43E3E]" /> : null}
          {total > 0 ? (
            <span className={`min-w-0 truncate ${sheetAmountFontClass(formatWeekAmount(total), textW(W.total) - (block.mismatch ? MISMATCH_ICON_W : 0))}`}>
              {formatWeekAmount(total)}
            </span>
          ) : null}
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
        sheetBands={weekBands}
      />
    </>
  )
}

// ── 열 머리 필터 메뉴(F-1) ──────────────────────────────────────────────────────────────────────
//
// 모양: 머리 칸 바로 아래에 뜨는 작은 대화상자(모달 아님) — 진짜 체크박스 + 버튼. 머리 버튼은 aria-haspopup="dialog"
// · aria-expanded. 표 스크롤 상자(overflow)와 sticky 머리에 잘리지 않게 body 포털 + fixed 위치(머리 칸 사각형에서 계산).
// 키: 열면 첫 체크된 칸에 포커스 · ↑↓ Home End 로 칸 이동 · Space 체크 · Enter 적용 · Esc 닫기(머리 버튼으로 포커스) ·
// Tab 은 메뉴 안에서 돈다. 바깥을 누르면 닫는다.

const MENU_W = 264

/**
 * 필터를 건 열을 보이는 자리로 가로 스크롤한다 — 그 달 묶음(계 · W1~W5)이 들어가면 묶음째, 아니면 그 열만(이미 보이면
 * 그대로). 얼마나 밀지는 sheetRevealScrollDelta(순수 함수)가 정하고 여기서는 머리 칸 사각형만 잰다.
 * 머리 버튼은 열 키로 그린 같은 노드라 필터가 바뀌어도 그대로 붙어 있다 — 떨어졌으면(열 구성이 바뀜) 아무것도 안 한다.
 */
function revealSheetColumn(anchor: HTMLButtonElement, filterKey: string) {
  const scroller = anchor.closest<HTMLElement>("[data-ledger-sheet-scroll]")
  const parsed = parseSheetFilterKey(filterKey)
  if (!anchor.isConnected || !scroller || !parsed) return
  const span = (element: Element | null | undefined) => {
    const rect = (element?.closest("th") ?? element)?.getBoundingClientRect()
    return rect ? { left: rect.left, right: rect.right } : null
  }
  const column = span(anchor)
  if (!column) return
  const head = (key: string) => scroller.querySelector(`[data-sheet-filter-key="${key}"]`)
  const first = span(head(`m${parsed.slot}`))
  const last = span(head(`m${parsed.slot}.w5`))
  const outer = scroller.getBoundingClientRect()
  const left = outer.left + scroller.clientLeft
  const delta = sheetRevealScrollDelta(
    column,
    first && last ? { left: first.left, right: last.right } : null,
    { left: left + W.num + W.customer, right: left + scroller.clientWidth },
  )
  if (delta !== 0) scroller.scrollBy({ left: delta })
}

function SheetFilterMenu({
  id,
  filterKey,
  title,
  anchor,
  filters,
  allViews,
  onFiltersChange,
  onClose,
}: {
  id: string
  filterKey: string
  /** "11월 W2" */
  title: string
  anchor: HTMLButtonElement
  filters: SheetColumnFilters
  allViews: SheetRowView[]
  onFiltersChange: (update: (current: SheetColumnFilters) => SheetColumnFilters) => void
  onClose: () => void
}) {
  // 메뉴를 열 때의 체크 — 걸린 열이면 그 조건, 아니면 값 있음 하나(D2: 열고 Enter 한 번이면 예전 "공백 제외").
  const [draft, setDraft] = useState<SheetFilterCondition[]>(() => sheetFilterDraft(filters, filterKey))
  const boxRef = useRef<HTMLDivElement | null>(null)
  const columnFiltered = hasFilter(filters, filterKey)
  // 미리보기는 열 필터를 걸기 전 행(allViews)으로 센다 — "이 열만 보면"이 다른 열 필터에 줄어든 채로 세지지 않게.
  const preview = useMemo(() => previewSheetFilter(allViews, filters, filterKey, draft), [allViews, filters, filterKey, draft])
  // restoreFocus — 적용·Esc 처럼 메뉴 안에서 끝냈으면 머리 버튼으로 포커스를 돌려준다. 바깥 클릭은 누른 자리에 둔다.
  const close = useCallback((restoreFocus: boolean) => {
    if (restoreFocus && anchor.isConnected) anchor.focus()
    onClose()
  }, [anchor, onClose])

  // 위치 — 머리 칸 바로 아래, 왼쪽 끝을 맞추고 화면 오른쪽을 넘으면 오른쪽 끝을 맞춘다. 스크롤·창 크기에 따라 다시 잡고,
  // 머리 칸이 보이는 자리를 벗어나면(가로 스크롤 등) 닫는다 — 떨어진 메뉴가 엉뚱한 열을 가리키지 않게. 렌더 없이 style 만 고친다.
  // 보이는 자리는 창이 아니라 표 스크롤 상자 안쪽에서 고정 열(# · 고객)을 뺀 곳이다(sheetMenuAnchorSpan).
  useLayoutEffect(() => {
    const scroller = anchor.closest<HTMLElement>("[data-ledger-sheet-scroll]")
    const place = () => {
      const box = boxRef.current
      if (!box) return
      const viewportW = window.innerWidth
      const viewportH = window.innerHeight
      let scrollerRect: SheetRect | null = null
      if (scroller) {
        // 스크롤바를 뺀 안쪽(clientLeft · clientWidth …).
        const outer = scroller.getBoundingClientRect()
        const left = outer.left + scroller.clientLeft
        const top = outer.top + scroller.clientTop
        scrollerRect = { left, right: left + scroller.clientWidth, top, bottom: top + scroller.clientHeight }
      }
      const rect = anchor.getBoundingClientRect()
      const span = anchor.isConnected
        ? sheetMenuAnchorSpan(rect, { left: 0, right: viewportW, top: 0, bottom: viewportH }, scrollerRect, W.num + W.customer)
        : null
      if (!span) {
        close(false)
        return
      }
      const width = box.offsetWidth || MENU_W
      const height = box.offsetHeight
      // 반쯤 가려진 머리면 보이는 부분(span)에 맞춘다 — 고정 열 · 레일 위로 메뉴가 밀려 나가지 않게.
      let left = span.left + width > viewportW - 8 ? span.right - width : span.left
      left = Math.max(8, Math.min(left, viewportW - width - 8))
      let top = rect.bottom + 4
      if (top + height > viewportH - 8) top = Math.max(8, rect.top - height - 4)
      box.style.left = `${Math.round(left)}px`
      box.style.top = `${Math.round(top)}px`
      box.style.visibility = "visible"
    }
    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [anchor, close])

  // 열면 첫 체크된 칸(없으면 첫 칸)에 포커스 — 머리 클릭 → Enter 가 곧 적용이다.
  useEffect(() => {
    const inputs = boxRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    const first = Array.from(inputs ?? []).find((input) => input.checked) ?? inputs?.[0]
    first?.focus()
  }, [])

  // 바깥을 누르면 닫는다. 머리 버튼은 제 클릭(열고 닫기)이 처리한다.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || boxRef.current?.contains(target) || anchor.contains(target)) return
      close(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [anchor, close])

  // reveal — 건 열을 보이는 자리로 민다(적용 · 이 열만 보기). 풀기는 그 열을 볼 일이 끝났으니 표를 움직이지 않는다.
  const commit = (update: (current: SheetColumnFilters) => SheetColumnFilters, reveal: boolean) => {
    onFiltersChange(update)
    close(true)
    // 행이 바뀐 표가 그려진 뒤에 잰다(필터 변경은 다음 프레임 전에 커밋된다).
    if (reveal) requestAnimationFrame(() => revealSheetColumn(anchor, filterKey))
  }
  const apply = () => commit((current) => setSheetFilter(current, filterKey, draft), true)
  const only = () => commit((current) => onlySheetFilter(current, filterKey, draft), true)
  const clear = () => commit((current) => clearSheetFilter(current, filterKey), false)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // 메뉴 안의 키는 표로 올려 보내지 않는다(React 트리로는 머리 칸 → 표 — 칸 선택·편집 키보드가 받지 않게).
    event.stopPropagation()
    if (event.nativeEvent.isComposing) return
    const box = boxRef.current
    if (!box) return
    const target = event.target as HTMLElement
    if (event.key === "Escape") {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key === "Enter") {
      // 버튼 위의 Enter 는 그 버튼의 일(이 열만 보기 · 풀기 · 닫기)이다.
      if (target.tagName === "BUTTON") return
      event.preventDefault()
      apply()
      return
    }
    const options = Array.from(box.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    const index = options.indexOf(target as HTMLInputElement)
    if (index >= 0 && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End")) {
      event.preventDefault()
      const last = options.length - 1
      const next = event.key === "Home" ? 0 : event.key === "End" ? last : event.key === "ArrowDown" ? (index === last ? 0 : index + 1) : (index === 0 ? last : index - 1)
      options[next]?.focus()
      return
    }
    if (event.key === "Tab") {
      // 포커스를 메뉴 안에 둔다(포털이 body 끝에 있어 밖으로 나가면 갈 곳이 엉뚱하다).
      const focusables = Array.from(box.querySelectorAll<HTMLElement>("input, button:not(:disabled)"))
      if (focusables.length === 0) return
      const first = focusables[0]
      const lastItem = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <div
      ref={boxRef}
      id={id}
      role="dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`}
      onKeyDown={onKeyDown}
      style={{ position: "fixed", top: 0, left: 0, width: MENU_W, visibility: "hidden" }}
      className="z-50 rounded-[10px] border border-[#E8E8E4] bg-white text-left text-[12.5px] font-normal text-[#111110] shadow-[0_8px_24px_rgba(17,17,16,0.14)]"
    >
      <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
        <span id={`${id}-title`} className="text-[12.5px] font-bold text-[#111110]">{title} 필터</span>
        <button
          type="button"
          aria-label="필터 메뉴 닫기"
          onClick={() => close(true)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
      <p id={`${id}-hint`} className="px-3 pb-1 text-[11px] text-[#615D59]">여러 개를 고르면 하나라도 맞는 행</p>
      <fieldset className="flex flex-col px-1.5 py-1">
        <legend className="sr-only">조건</legend>
        {SHEET_FILTER_OPTIONS.map((option) => {
          const checked = draft.includes(option.id)
          const token = option.confidence ? CONFIDENCE_TOKENS[option.confidence] : null
          return (
            <label key={option.id} className="flex h-[30px] cursor-pointer items-center gap-2 rounded-md px-1.5 hover:bg-[#F6F5F4]">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => setDraft((current) => toggleSheetFilterCondition(current, option.id))}
                className="h-4 w-4 shrink-0 cursor-pointer accent-[#084734] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
              />
              {token ? (
                // 확도 견본 — 칸과 같은 토큰 칩 색(CONFIDENCE_TOKENS). 굵기도 칸과 같다(확정 700 · 고확도 600 · 예정 500).
                <span className={`rounded border px-1.5 text-[12px] leading-[18px] ${token.chipClass} ${option.confidence === "confirmed" ? "font-bold" : option.confidence === "high-confidence" ? "font-semibold" : "font-medium"}`}>
                  {option.label}
                </span>
              ) : (
                <span>{option.label}</span>
              )}
              {option.hint ? <span className="ml-auto text-[11px] text-[#615D59]">{option.hint}</span> : null}
            </label>
          )
        })}
      </fieldset>
      <p aria-live="polite" className="mx-3 border-t border-[#F0F0EC] pt-2 text-[11.5px] text-[#31302E]">
        적용하면 <b className="tabular-nums">{preview.apply.toLocaleString("ko-KR")}</b>행 · 이 열만 보면 <b className="tabular-nums">{preview.only.toLocaleString("ko-KR")}</b>행
      </p>
      <div className="flex gap-1.5 px-3 pb-3 pt-2">
        <button
          type="button"
          onClick={apply}
          title="다른 열 필터와 겹쳐 겁니다(Enter)"
          className="h-8 flex-1 rounded-md bg-[#084734] text-[12.5px] font-semibold text-white hover:bg-[#065c41] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
        >
          적용
        </button>
        <button
          type="button"
          onClick={only}
          title="다른 열 필터(기본 필터 포함)를 풀고 이 열만 남깁니다"
          className="h-8 flex-1 rounded-md border border-[#084734] bg-white text-[12.5px] font-semibold text-[#084734] hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
        >
          이 열만 보기
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!columnFiltered}
          aria-label="이 열 풀기"
          title={columnFiltered ? "이 열의 필터만 풉니다" : "이 열에 걸린 필터가 없습니다"}
          className="h-8 shrink-0 rounded-md border border-[#E8E8E4] bg-white px-2 text-[12px] text-[#31302E] hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
        >
          풀기
        </button>
      </div>
    </div>
  )
}

export interface LedgerSheetProps {
  columns: SheetColumns
  /** 필터까지 반영한, 지금 보이는 행. */
  views: SheetRowView[]
  /** 열 필터를 걸기 전의 행(범위·검색·속성 칩까지 반영) — 메뉴 미리보기 · 0행 안내가 센다. */
  allViews: SheetRowView[]
  totals: SheetTotals
  filters: SheetColumnFilters
  /** 열 필터를 바꾼다 — 메뉴의 적용 · 이 열만 보기 · 풀기, 0행 안내의 "…을 풀면". */
  onFiltersChange: (update: (current: SheetColumnFilters) => SheetColumnFilters) => void
  /** 오늘이 속한 달 — 월 띠에 "이번 달"을 붙인다. */
  currentMonth: string
  loading: boolean
  /** 행이 없을 때 문구. */
  emptyText: string
  /** 0행일 때 [모두 풀기] — 없으면 버튼을 숨긴다. */
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
  allViews,
  totals,
  filters,
  onFiltersChange,
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

  // 이번 주 열(D-3) — 기준 달이 오늘(업무일 KST)이 든 달일 때만. 시트 쓰기와 같은 주차 규칙(1·8·15·22·29일).
  const currentWeekKey = useMemo(() => sheetCurrentWeekKey(columns, getBusinessDateParts().date), [columns])
  const filtering = useMemo(() => sheetFiltersApply(filters, columns), [filters, columns])
  // 0행일 때 "어느 필터를 풀면 몇 행"(D-4) — 걸린 열 필터 하나씩 풀어 센다.
  const relaxHint = useMemo(
    () => (views.length === 0 && !loading ? sheetFilterRelaxHint(allViews, filters, columns) : null),
    [views.length, loading, allViews, filters, columns],
  )

  // 열린 메뉴 — 열 키와 그 머리 버튼(위치·포커스 복귀). 한 번에 하나만.
  const [menu, setMenu] = useState<{ key: string; anchor: HTMLButtonElement } | null>(null)
  const menuId = useId()
  const closeMenu = useCallback(() => setMenu(null), [])
  const toggleMenu = (key: string, anchor: HTMLButtonElement) => setMenu((current) => (current?.key === key ? null : { key, anchor }))

  const filterHead = (key: string, text: string, month: boolean) => {
    const on = hasFilter(filters, key)
    const setLabel = on ? sheetFilterSetLabel(filters[key]) : ""
    const label = sheetFilterColumnLabel(key, columns) ?? text
    const open = menu?.key === key
    const now = key === currentWeekKey
    return (
      <th
        key={key}
        scope="col"
        className={`box-border h-[26px] border-b border-b-[#E8E8E4] p-0 align-middle ${month ? "border-l border-l-[#A39E98]" : "border-l border-l-[#E8E8E4]"} ${on ? "bg-[#084734]" : month ? "bg-[#E8E8E4]" : "bg-[#F6F5F4]"}`}
      >
        <button
          type="button"
          data-sheet-filter-key={key}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`${label}${now ? " · 이번 주" : ""} 필터 메뉴${on ? ` — ${setLabel} 걸림` : ""}`}
          title={on ? `${label} · ${setLabel} 걸림 — 눌러서 바꾸거나 풉니다` : `${label} — 눌러서 필터를 겁니다(값 있음 · 확도 · 값 없음)`}
          onClick={(event) => toggleMenu(key, event.currentTarget)}
          className={`flex h-[25px] w-full items-center justify-end gap-1 overflow-hidden px-1 text-[11.5px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#084734] ${
            on ? "font-bold text-white focus-visible:outline-white" : month ? "font-bold text-[#111110] hover:bg-[#DDD9D3]" : "text-[#615D59] hover:bg-[#E8E8E4] hover:text-[#111110]"
          } ${open ? "shadow-[inset_0_-2px_0_#084734]" : ""}`}
        >
          {now ? <span aria-hidden title="이번 주" className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-white" : "bg-[#084734]"}`} /> : null}
          <span className="shrink-0">{text}</span>
          {/* 걸린 조건 요약(D-1) — 초록 바탕이 이미 "걸림"을 말하므로 필터 아이콘 자리를 요약에 준다. 72px 주 칸에서
              아이콘 · 여백 6px 와 함께 그리면 "W3 값 있음"이 "W3 값 …"으로 잘렸다(최종 검증 라운드 2). 여러 조건이라
              안 들어가면 줄임표, 전체는 title · aria-label 에 있다. 여백 px-1 은 아래 금액 칸과 같아 오른쪽 끝이 맞는다. */}
          {on ? (
            <span className="min-w-0 truncate text-[10px] font-semibold">{setLabel}</span>
          ) : (
            <Filter aria-hidden className="h-2.5 w-2.5 shrink-0 opacity-60" strokeWidth={2.4} />
          )}
        </button>
      </th>
    )
  }
  const plainHead = (key: string, text: string, className = "", title?: string) => (
    <th key={key} scope="col" title={title} className={`${HEAD} border-l border-l-[#E8E8E4] bg-[#F6F5F4] font-semibold text-[#31302E] ${className}`}>{text}</th>
  )

  const menuTitle = menu ? sheetFilterColumnLabel(menu.key, columns) : null

  return (
    <div
      role="region"
      aria-label="매출 장부 시트"
      data-ledger-sheet-scroll
      className="min-h-[240px] flex-1 overflow-auto border-t border-[#E8E8E4] bg-white max-lg:max-h-[calc(100dvh-13rem)]"
    >
      <table className="w-full border-separate border-spacing-0 tabular-nums" style={{ tableLayout: "fixed", minWidth }}>
        <caption className="sr-only">건별 매출 — 기준 달과 다음 달은 주차 칸, 그 밖의 달은 묶음. # 은 시트 행 번호</caption>
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
          {/* 열 이름 — 월 "계"와 주차 열은 필터 메뉴 버튼 */}
          <tr>
            <th scope="col" title="시트 '2. REV' 행 번호(동기화 시점)" className={`${HEAD} sticky left-0 z-30 bg-[#F6F5F4] text-right font-normal text-[#615D59]`}>#</th>
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
          {/* 합계 — 지금 보이는 행만. 열 필터가 걸려 있으면 "필터 결과"(D-4). */}
          <tr>
            <td className={`${SUM} sticky left-0 z-30 text-[11px]`} />
            <th scope="row" className={`${SUM} sticky z-30 border-l border-l-[#F0F0EC] border-r border-r-[#E8E8E4] text-left text-[11px]`} style={{ left: W.num }}>
              {filtering ? "필터 결과" : "합계"} <span className="font-medium text-[#615D59]">{views.length.toLocaleString("ko-KR")}행</span>
            </th>
            <td colSpan={leadCols - 2} className={SUM} />
            {columns.pastMonths.length === 0 ? null : columns.pastPinned ? (
              <td className={`${SUM} border-l border-l-[#F0F0EC] text-right`} title={bucketTitle(columns.pastLabel ?? "", totals.past)}>
                <Amount value={totals.past.total} width={textW(W.past)} steps={SHEET_SUM_STEPS} />
              </td>
            ) : (
              totals.pastByMonth.map((bucket, index) => (
                <td key={columns.pastMonths[index]} className={`${SUM} border-l border-l-[#F0F0EC] text-right`} title={bucketTitle(monthKo(columns.pastMonths[index]), bucket)}>
                  <Amount value={bucket.total} width={textW(W.past)} steps={SHEET_SUM_STEPS} />
                </td>
              ))
            )}
            {totals.blocks.flatMap((block) => [
              <td key={`${block.month}-total`} className={`${SUM_TOTAL} border-l border-l-[#A39E98] text-right`} title={bucketTitle(`${monthKo(block.month)} 계`, block.bucket)}>
                <Amount value={block.bucket.total} width={textW(W.total)} steps={SHEET_SUM_STEPS} />
              </td>,
              ...block.weeks.map((value, week) => (
                <td key={`${block.month}-w${week}`} className={`${SUM} border-l border-l-[#F0F0EC] text-right`} title={value > 0 ? `W${week + 1} ${exactMoney(value)}` : undefined}>
                  <Amount value={value} width={textW(SHEET_WEEK_W)} steps={SHEET_SUM_STEPS} />
                </td>
              )),
            ])}
            {laterCols ? (
              <td className={`${SUM} border-l border-l-[#E8E8E4] text-right`} title={bucketTitle(columns.laterLabel ?? "", totals.later)}>
                <Amount value={totals.later.total} width={textW(W.later)} steps={SHEET_SUM_STEPS} />
              </td>
            ) : null}
            <td className={`${SUM_TOTAL} border-l border-l-[#A39E98] text-right`} title={bucketTitle("FY 합계", totals.annual)}>
              <Amount value={totals.annual.total} width={textW(W.fy)} steps={SHEET_SUM_STEPS} />
            </td>
            <td className={`${SUM} border-l border-l-[#E8E8E4]`} />
          </tr>
        </thead>
        <tbody>
          {views.length === 0 ? (
            <tr>
              <td colSpan={totalCols} className="px-4 py-10 text-[13px] text-[#615D59]">
                <div className="sticky left-4 inline-flex flex-wrap items-center gap-3" role="status">
                  <span>{loading ? "장부를 불러오는 중입니다." : emptyText}</span>
                  {relaxHint ? (
                    // 어느 필터가 0을 만들었나(D-4) — 하나만 풀었을 때 가장 많이 남는 것. 누르면 그 열만 푼다.
                    <button
                      type="button"
                      onClick={() => onFiltersChange((current) => clearSheetFilter(current, relaxHint.key))}
                      className="text-[12.5px] font-semibold text-[#084734] underline underline-offset-2 hover:text-[#065c41] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]"
                    >
                      &ldquo;{relaxHint.label}&rdquo;{objectParticle(relaxHint.label)} 풀면 {relaxHint.count.toLocaleString("ko-KR")}행
                    </button>
                  ) : null}
                  {!loading && onClearFilters ? (
                    <button type="button" onClick={onClearFilters} className="min-h-9 rounded-lg border border-[#084734] bg-white px-3 text-[12.5px] font-semibold text-[#084734] hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]">
                      모두 풀기
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ) : (
            views.map((view) => {
              const rowId = view.row.id
              const isEditingRow = editor?.editing?.rowId === rowId
              return (
                <SheetRow
                  key={rowId}
                  view={view}
                  columns={columns}
                  filters={filters}
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
      {menu && menuTitle
        ? createPortal(
            <SheetFilterMenu
              key={menu.key}
              id={menuId}
              filterKey={menu.key}
              title={menuTitle}
              anchor={menu.anchor}
              filters={filters}
              allViews={allViews}
              onFiltersChange={onFiltersChange}
              onClose={closeMenu}
            />,
            document.body,
          )
        : null}
    </div>
  )
}
