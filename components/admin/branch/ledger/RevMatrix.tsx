"use client"

// SalesLedgerWorkbench에서 물리 이동(웨이브 7 2단 F5 — 기계적 분할, 로직 무변경): REV 다중월
// 밀도 매트릭스 클러스터 — 행/셀/팝오버/붙여넣기 다이얼로그 프레젠테이션(memo) 일체.
//
// 품질 감사 2026-09-10 — #2 번들 다이어트: 셀 좌표/pending·dedup·잠금·붙여넣기 계획 순수 로직 +
// 인라인 편집 상태기계(useMatrixEditor)는 ledger/rev-matrix-logic.ts로 다시 물리 이동했다.
// 이 파일(컴포넌트)만 SalesLedgerWorkbench에서 next/dynamic으로 지연 로드하기 위해서다 — 순수
// 로직이 같은 모듈에 남아 있으면 그 정적 import 하나만으로 이 파일 전체(아이콘·행/셀 JSX 포함
// 2,000줄 이상)가 다시 메인 청크에 딸려 들어가 분리가 무효화된다. 이 파일은 rev-matrix-logic의
// 결과만 가져다 쓰고, 기존 "ledger/RevMatrix에서 전부 import 가능" 표면은 재수출로 유지한다.
export * from "./rev-matrix-logic"

import { Fragment, memo, useEffect, useRef } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronRight, Link2Off, Lock } from "lucide-react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { useDialogFocus } from "../../use-dialog-focus"
import {
  DRAFT_CONFIDENCE_OPTIONS,
  formatMoney,
  formatMonthLabel,
  formatPercent,
  formatWeekAmount,
  productCategoryMeta,
  ProductCategoryPill,
  rowWeeklyMismatch,
  rowWeeklySplit,
  type DraftConfidence,
  type LedgerRevenueRow,
  type RevCustomerGroup,
  type RevMonthlyBucket,
  type RevProductCategory,
  type RevRowView,
} from "./shared"
import {
  computeWeekCellStates,
  EMPTY_BUCKET,
  isMatrixCellEditable,
  isMatrixCellLocked,
  MATRIX_ANNUAL_W,
  MATRIX_CUSTOMER_W,
  MATRIX_MONTH_W,
  MATRIX_PRODUCT_W,
  MATRIX_WEEK_W,
  type MatrixCellCoord,
  type MatrixDensity,
  type MatrixEditorActions,
  // RevMatrixPasteDialog(아래)의 statusMeta 타입에만 쓰인다 — export *로는 이 파일 자기 자신의
  // 타입 주석에서 못 쓰므로(재수출은 "밖으로"만 전달) named import가 별도로 필요하다.
  type MatrixPasteCellPlan,
  type MatrixPastePlan,
  type MatrixPendingDraft,
  type RevMatrixColumn,
} from "./rev-matrix-logic"

// 그룹 소계행(기본 h-8)·딜행(기본 h-7) 높이 클래스. 셀 내부 폰트 크기·패딩·sticky 배경은 그대로 둔다.
const MATRIX_GROUP_ROW_HEIGHT: Record<MatrixDensity, string> = {
  condensed: "h-6",
  regular: "h-8",
  relaxed: "h-9",
}
const MATRIX_DEAL_ROW_HEIGHT: Record<MatrixDensity, string> = {
  condensed: "h-6",
  regular: "h-7",
  relaxed: "h-9",
}
// isMatrixDensity는 ledger/rev-matrix-logic.ts로 이동(위 export * 재수출로 이 파일에서도 계속 사용 가능).

// 확도 = 글자색(배경 아님). 셀 배경은 흰색 고정, 확정/고확도/불일치는 bold.
// 확도 3색은 CONFIDENCE_TOKENS SSOT 소비 — 리터럴 재정의 금지(불일치·빈 셀은 확도 아님).
const MATRIX_TONE = {
  confirmed: `font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`,
  high: `font-bold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`,
  open: `font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`,
  mixed: `font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`,
  mismatch: "font-bold text-[#B43E3E]",
  empty: "text-[#DDD9D3]",
} as const

// 셀 단일 금액의 지배 확도로 글자색을 고른다. 혼재(여러 확도 합산)면 예정 톤(월합계 요약 성격).
function matrixBucketTone(bucket: RevMonthlyBucket): keyof typeof MATRIX_TONE {
  if (bucket.total <= 0) return "empty"
  if (bucket.confirmed === bucket.total) return "confirmed"
  if (bucket.confirmed === 0 && bucket.high === bucket.total) return "high"
  if (bucket.confirmed === 0 && bucket.high === 0) return "open"
  return "mixed"
}

// 매트릭스 확도 색 레전드. 셀 글자색(MATRIX_TONE)과 1:1 대응 — 값 자체는 바꾸지 않는다.
// tint가 있는 항목은 셀에도 같은 배경이 깔린다는 뜻 — 범례 스와치를 그 틴트 위에 얹어 대응을 보여준다.
const MATRIX_TONE_LEGEND_ITEMS: Array<{ label: string; color: string; tint?: string }> = [
  { label: CONFIDENCE_TOKENS.confirmed.label, color: CONFIDENCE_TOKENS.confirmed.color },
  {
    label: CONFIDENCE_TOKENS["high-confidence"].label,
    color: CONFIDENCE_TOKENS["high-confidence"].color,
    tint: CONFIDENCE_TOKENS["high-confidence"].tintBg,
  },
  { label: CONFIDENCE_TOKENS.expected.label, color: CONFIDENCE_TOKENS.expected.color },
  { label: "불일치", color: "#B43E3E" },
]
export function MatrixToneLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#615D59]">
      {MATRIX_TONE_LEGEND_ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1">
          {item.tint ? (
            <span
              aria-hidden
              className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px]"
              style={{ backgroundColor: item.tint }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
            </span>
          ) : (
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          )}
          {item.label}
        </span>
      ))}
      <span>· 잠금=시트확정/장부반영</span>
      <span className="hidden lg:inline">· 합산 셀 주황=확도 혼합 포함</span>
      {/* 13인치(lg~xl) 랩탑에서도 단축키 힌트가 보이도록 xl→lg 하향. 편집 진입 시엔 팝오버가 셀 인근 힌트를 재노출한다. */}
      <span className="hidden text-[#A39E98] lg:inline">· Enter 편집 · Tab 이동 · Ctrl+D 아래 복사 · Ctrl+V 엑셀 붙여넣기 · Esc 취소</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 다중월 밀도 매트릭스 (REV Phase 1 읽기 전용 → Phase 2 딜행 월 셀 인라인 편집)
// 열: [고객 200 sticky-left] [상품 56] [월 12칸×64 요약 / 확장 시 5×34] [연간 96 sticky-right]
// sticky 3방향(좌·우·하단 합계행) — 각 상태별 불투명 배경으로 비침 방지.
//
// Phase 2 인라인 편집 인프라(셀 좌표·pending·잠금 판정·붙여넣기 계획·useMatrixEditor)는
// 전부 ledger/rev-matrix-logic.ts로 이동했다(위 export * 재수출 + 상단 named import 참고).
// ─────────────────────────────────────────────────────────────────────────

// 셀 아래 붙는 3버튼 확도 팝오버 + 커밋/취소. input은 부모 셀이 렌더(포커스 관리), 여기는 확도만.
// warning: 주차 셀 편집처럼 커밋 결과가 파괴적일 때 팝오버 안에 한 줄 경고를 붙인다.
const RevMatrixEditPopover = memo(function RevMatrixEditPopover({
  confidence,
  onPickConfidence,
  warning,
}: {
  confidence: DraftConfidence
  onPickConfidence: (next: DraftConfidence) => void
  warning?: string
}) {
  return (
    <div
      className="absolute left-0 top-full z-40 mt-0.5 flex flex-col gap-0.5 rounded-md border border-[rgba(0,0,0,0.12)] bg-white p-0.5 shadow-lg"
      onMouseDown={(event) => event.preventDefault()} // input 포커스 유지(blur 커밋 방지)
    >
      <div className="flex items-center gap-0.5">
        {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
          const activeColor = CONFIDENCE_TOKENS[option.id].color
          const active = option.id === confidence
          return (
            <button
              key={option.id}
              type="button"
              title={`확도: ${option.label}`}
              onClick={() => onPickConfidence(option.id)}
              className="rounded px-1.5 py-0.5 text-[10px] font-bold leading-none transition"
              style={
                active
                  ? { backgroundColor: activeColor, color: "#FFFFFF" }
                  : { color: activeColor, backgroundColor: "transparent" }
              }
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {/* 편집 진입 시 셀 인근 단축키 힌트 — 치트시트가 안 보이는 좁은 화면에서도 조작법이 손끝에 남게. */}
      <p className="px-1 pb-0.5 text-left text-[9px] font-semibold leading-none text-[#A39E98]">
        Enter 저장 · Tab 다음 칸 · Esc 취소
      </p>
      {warning && (
        <p className="max-w-[168px] whitespace-normal rounded bg-[#FBF1E0] px-1.5 py-1 text-left text-[9px] font-bold leading-snug text-[#7A520F]">
          {warning}
        </p>
      )}
    </div>
  )
})

// 매트릭스 셀 편집 상태기계(useMatrixEditor, 반환 타입 MatrixEditor/MatrixEditorActions)는
// ledger/rev-matrix-logic.ts로 물리 이동했다(로직 무변경) — 위 export *와 상단 named import로
// 이 파일에서도 그대로 쓴다. 이동 이유는 파일 최상단 헤더 코멘트 참고.

// 매트릭스 셀 본문 숫자. ¥ 없이 축약(formatWeekAmount) — 밀도 우선, 툴팁에 정확 금액.
// Phase 2: edit* props가 오면 딜행 편집 셀(잠금/미검수/셀렉트/편집 4상태). 없으면(그룹 소계) 읽기전용.
const RevMatrixMonthCell = memo(function RevMatrixMonthCell({
  bucket,
  mismatch = false,
  bgClass,
  month,
  rowId,
  editable = false,
  locked = false,
  lockLabel = "시트 확정",
  pending = null,
  actions = null,
  // 선택/편집/버퍼는 부모(스트립)가 이 셀 기준으로 계산해 원시값으로 내린다 — memo가 셀 단위로
  // 얕은비교되도록. 비편집·비선택 셀은 아래 값들이 상수라 선택·타이핑 리렌더에서 스킵된다.
  selected = false,
  isEditingCell = false,
  editBuffer = "",
  editConfidence = "expected",
  // 웨이브 5 — 항목 1(b): 이 셀의 달이 현재 M/Q 선택 기간에 속하는지. 행 배경(bgClass)은 그대로
  // 두고 좌측 보더만 옅은 그린 accent로 바꿔 세로로 훑었을 때 "이 열들이 선택 기간"임이 읽히게
  // 한다 — bgClass를 덮어쓰지 않아 selected/draft/hover 등 기존 행 상태 표시와 충돌하지 않는다.
  periodHighlighted = false,
}: {
  bucket: RevMonthlyBucket
  mismatch?: boolean
  bgClass: string
  month?: string
  rowId?: string
  editable?: boolean
  locked?: boolean
  lockLabel?: string
  pending?: MatrixPendingDraft | null
  actions?: MatrixEditorActions | null
  selected?: boolean
  isEditingCell?: boolean
  editBuffer?: string
  editConfidence?: DraftConfidence
  periodHighlighted?: boolean
}) {
  const tone = mismatch ? "mismatch" : matrixBucketTone(bucket)
  const interactive = Boolean(actions && month && rowId)
  // 방향키 이동은 selected 상태만 바꾸므로 DOM 포커스를 직접 옮겨야 다음 keydown이 새 셀에서 잡힌다.
  // (클릭은 native focus가 되지만 키보드 이동은 안 됨.) 편집 중이 아닐 때만 셀 자체에 포커스.
  const cellRef = useRef<HTMLTableCellElement | null>(null)
  useEffect(() => {
    if (interactive && editable && selected && !isEditingCell) {
      cellRef.current?.focus()
    }
  }, [interactive, editable, selected, isEditingCell])
  const confidenceLabel = (value: DraftConfidence) =>
    DRAFT_CONFIDENCE_OPTIONS.find((option) => option.id === value)?.label ?? value
  const baseTitle =
    bucket.total > 0
      ? `합계 ${formatMoney(bucket.total)} · 확정 ${formatMoney(bucket.confirmed)} · 고확도 ${formatMoney(bucket.high)} · 예정 ${formatMoney(bucket.open)}${mismatch ? " · 주차·월 불일치(허용오차 ±¥1)" : ""}`
      : "미입력"
  const title = locked
    ? `${baseTitle} · 🔒 ${lockLabel} 값이라 잠금(실수 방지) — 수정은 우측 패널에서 정정 초안으로`
    : pending
      ? `${baseTitle} · 미검수 초안 ${formatMoney(pending.amount)} (${confidenceLabel(pending.confidence)})`
      : editable
        ? `${baseTitle} · 클릭·Enter로 편집`
        : baseTitle

  // 편집 진입 셀: input + 확도 팝오버.
  if (isEditingCell && interactive) {
    return (
      <td
        className={`relative px-0.5 text-right align-middle ${mismatch ? "bg-[#FCE9E9]" : bgClass} ring-2 ring-inset ring-[#084734]/40`}
        style={{ width: MATRIX_MONTH_W, minWidth: MATRIX_MONTH_W, maxWidth: MATRIX_MONTH_W }}
      >
        <input
          autoFocus
          inputMode="numeric"
          value={editBuffer}
          onChange={(event) => actions!.setBuffer(event.target.value)}
          onKeyDown={(event) => actions!.onEditingKeyDown(event, { rowId: rowId!, month: month! })}
          onBlur={() => {
            actions!.commitBuffer({ rowId: rowId!, month: month! }, editConfidence)
            actions!.cancelEdit()
          }}
          aria-label={`${formatMonthLabel(month!)} 금액(원 단위)`}
          className="h-6 w-full bg-transparent px-1 text-right text-[11px] font-bold tabular-nums text-[#111110] outline-none"
        />
        <RevMatrixEditPopover confidence={editConfidence} onPickConfidence={actions!.setEditConfidence} />
      </td>
    )
  }

  // 고확도(90%+ 마감임박) 셀만 은은한 파란 틴트를 깐다 — 확정(그린)·예정(앰버)은 글자색만 유지해
  // "강조는 한 곳만" 위계를 지킨다. 색은 CONFIDENCE_TOKENS['high-confidence'].tintBg(#EFF6FF) SSOT.
  // 불일치(빨강)·미검수 초안은 운영상 더 급한 신호라 틴트보다 우선한다.
  const highTint = !mismatch && !pending && tone === "high"
  const bg = mismatch ? "bg-[#FCE9E9]" : highTint ? "bg-[#EFF6FF]" : bgClass
  const cellClassName = `relative px-1.5 text-right align-middle tabular-nums ${
    mismatch
      ? "border-l-2 border-l-[#B43E3E]"
      : periodHighlighted
        ? "border-l-2 border-l-[#084734]/25"
        : "border-l border-[#F2F1EE]"
  } ${bg} ${interactive && editable ? "cursor-cell" : ""} ${selected ? "ring-2 ring-inset ring-[#084734]/40" : ""} ${
    pending ? "shadow-[inset_0_-2px_0_0_#A8741A]" : ""
  } focus-visible:outline-none`

  const interactiveHandlers = interactive
    ? {
        tabIndex: editable ? 0 : -1,
        role: "gridcell" as const,
        onClick: () => {
          if (editable) actions!.selectCell(rowId!, month!)
        },
        onDoubleClick: () => {
          if (editable) actions!.beginEdit(rowId!, month!)
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLTableCellElement>) => {
          if (!editable) return
          if (!selected) {
            // Tab 포커스만 된 셀도 Enter/F2로 선택 진입 — 마우스 클릭 없이 키보드만으로 편집 가능.
            if (event.key === "Enter" || event.key === "F2") {
              event.preventDefault()
              actions!.selectCell(rowId!, month!)
            }
            return
          }
          actions!.onSelectedKeyDown(event, { rowId: rowId!, month: month! })
        },
      }
    : {}

  return (
    <td
      ref={cellRef}
      title={title}
      aria-label={interactive ? title : undefined}
      className={cellClassName}
      style={{ width: MATRIX_MONTH_W, minWidth: MATRIX_MONTH_W, maxWidth: MATRIX_MONTH_W }}
      {...interactiveHandlers}
    >
      {pending && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#A8741A]"
        />
      )}
      {bucket.total > 0 ? (
        <span
          className={`inline-flex items-center justify-end gap-0.5 leading-none ${
            bucket.total < 10000 ? "text-[10px] opacity-75" : "text-[11px]"
          } ${pending ? "font-bold text-[#7A520F]" : MATRIX_TONE[tone]}`}
        >
          {locked && <Lock className="h-2.5 w-2.5 shrink-0 text-[#A39E98]" aria-label={lockLabel} />}
          {mismatch && !locked && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
          {formatWeekAmount(bucket.total)}
        </span>
      ) : (
        <span className={`text-[11px] leading-none ${editable ? "text-[#C9C5BF]" : MATRIX_TONE.empty}`}>·</span>
      )}
    </td>
  )
})

// 확장된 월의 주차(W1~W5) 칸 1개. 34px. editor가 오면(딜행·비잠금) 월 셀과 동일한
// 잠금/미검수/셀렉트/편집 4상태 + 키보드 순회를 지원한다. 없으면(그룹 소계·잠금) 읽기전용.
// display 규약은 기존 읽기전용 버전 계승: explicit=진한 숫자, inferred=회색, month-only는 W5에 금액.
const RevMatrixWeekCell = memo(function RevMatrixWeekCell({
  display,
  isMonthOnly,
  inferred,
  weekIndex,
  bgClass,
  month,
  rowId,
  editable = false,
  locked = false,
  lockLabel = "시트 확정",
  editWarning,
  pending = null,
  actions = null,
  // 월 셀과 동일: 선택/편집/버퍼는 부모(스트립)가 이 칸 기준으로 계산해 원시값으로 내린다.
  selected = false,
  isEditingCell = false,
  editBuffer = "",
  editConfidence = "expected",
  // 웨이브 5 — 항목 1(b): 이 칸이 속한 달이 현재 M/Q 선택 기간이면 월 셀과 동일한 좌측 accent.
  periodHighlighted = false,
}: {
  display: number
  isMonthOnly: boolean
  inferred: boolean
  weekIndex: number
  bgClass: string
  month?: string
  rowId?: string
  editable?: boolean
  locked?: boolean
  lockLabel?: string
  editWarning?: string
  pending?: MatrixPendingDraft | null
  actions?: MatrixEditorActions | null
  selected?: boolean
  isEditingCell?: boolean
  editBuffer?: string
  editConfidence?: DraftConfidence
  periodHighlighted?: boolean
}) {
  const interactive = Boolean(actions && month && rowId)
  const cellRef = useRef<HTMLTableCellElement | null>(null)
  useEffect(() => {
    if (interactive && editable && selected && !isEditingCell) cellRef.current?.focus()
  }, [interactive, editable, selected, isEditingCell])

  const confidenceLabel = (v: DraftConfidence) => DRAFT_CONFIDENCE_OPTIONS.find((option) => option.id === v)?.label ?? v
  const baseTitle = display > 0 ? `W${weekIndex + 1} ${formatMoney(display)}${isMonthOnly ? " · 월합계만" : ""}` : `W${weekIndex + 1} 미입력`
  const title = locked
    ? `${baseTitle} · 🔒 ${lockLabel} 값이라 잠금(실수 방지) — 수정은 우측 패널에서 정정 초안으로`
    : pending
      ? `${baseTitle} · 미검수 초안 ${formatMoney(pending.amount)} (${confidenceLabel(pending.confidence)})`
      : editable
        ? `${baseTitle} · 클릭·Enter로 편집`
        : baseTitle

  // 편집 진입: input + 확도 팝오버. 폭 34px라 px 여백 없이 칸을 꽉 채운다.
  if (isEditingCell && interactive) {
    return (
      <td
        className={`relative px-0 text-right align-middle ${bgClass} ring-2 ring-inset ring-[#084734]/40`}
        style={{ width: MATRIX_WEEK_W, minWidth: MATRIX_WEEK_W, maxWidth: MATRIX_WEEK_W }}
      >
        <input
          autoFocus
          inputMode="numeric"
          value={editBuffer}
          onChange={(event) => actions!.setBuffer(event.target.value)}
          onKeyDown={(event) => actions!.onEditingKeyDown(event, { rowId: rowId!, month: month!, week: weekIndex })}
          onBlur={() => {
            actions!.commitBuffer({ rowId: rowId!, month: month!, week: weekIndex }, editConfidence)
            actions!.cancelEdit()
          }}
          aria-label={`${formatMonthLabel(month!)} W${weekIndex + 1} 금액(원 단위)`}
          className="h-6 w-full bg-transparent px-1 text-right text-[11.5px] font-bold tabular-nums text-[#111110] outline-none"
        />
        <RevMatrixEditPopover
          confidence={editConfidence}
          onPickConfidence={actions!.setEditConfidence}
          warning={editWarning}
        />
      </td>
    )
  }

  const cellClassName = `relative px-1.5 text-right align-middle tabular-nums ${
    periodHighlighted ? "border-l-2 border-l-[#084734]/25" : "border-l border-[#F2F1EE]"
  } ${bgClass} ${
    interactive && editable ? "cursor-cell" : ""
  } ${selected ? "ring-2 ring-inset ring-[#084734]/40" : ""} ${pending ? "shadow-[inset_0_-2px_0_0_#A8741A]" : ""} focus-visible:outline-none`

  const interactiveHandlers = interactive
    ? {
        tabIndex: editable ? 0 : -1,
        role: "gridcell" as const,
        onClick: () => {
          if (editable) actions!.selectCell(rowId!, month!, weekIndex)
        },
        onDoubleClick: () => {
          if (editable) actions!.beginEdit(rowId!, month!, undefined, weekIndex)
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLTableCellElement>) => {
          if (!editable) return
          if (!selected) {
            // Tab 포커스만 된 칸도 Enter/F2로 선택 진입 — 마우스 클릭 없이 키보드만으로 편집 가능.
            if (event.key === "Enter" || event.key === "F2") {
              event.preventDefault()
              actions!.selectCell(rowId!, month!, weekIndex)
            }
            return
          }
          actions!.onSelectedKeyDown(event, { rowId: rowId!, month: month!, week: weekIndex })
        },
      }
    : {}

  return (
    <td
      ref={cellRef}
      title={title}
      aria-label={interactive ? title : undefined}
      className={cellClassName}
      style={{ width: MATRIX_WEEK_W, minWidth: MATRIX_WEEK_W, maxWidth: MATRIX_WEEK_W }}
      {...interactiveHandlers}
    >
      {pending && <span aria-hidden className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#A8741A]" />}
      {/* 1만 미만(원시 위안) 값은 저대비·소형으로 강등 — 월 셀(RevMatrixMonthCell)과 동일 규약(SL-7). */}
      <span
        className={`inline-flex items-center gap-0.5 leading-none tabular-nums ${
          display > 0 && display < 10000 ? "text-[10px] opacity-75" : "text-[11.5px]"
        } ${
          pending
            ? "font-bold text-[#7A520F]"
            : display > 0
              ? isMonthOnly
                ? "font-semibold text-[#7A520F]"
                : inferred
                  ? "font-semibold text-[#615D59]"
                  : "font-bold text-[#111110]"
              : editable
                ? "text-[#C9C5BF]"
                : "text-[#DDD9D3]"
        }`}
      >
        {locked && display > 0 && <Lock className="h-2.5 w-2.5 shrink-0 text-[#A39E98]" aria-label={lockLabel} />}
        {display > 0 ? formatWeekAmount(display) : "·"}
      </span>
    </td>
  )
})

// computeWeekCellStates/weeklyEditLockMask는 ledger/rev-matrix-logic.ts로 이동(로직 무변경) —
// RevMatrixWeekCells가 위 named import로 그대로 호출한다.

// 확장된 월의 w1~w5 5칸. editContext가 오면(딜행·비잠금월) 각 칸이 편집 셀이 된다.
// month-only 행은 W5에 월합계를 얹어 시트 검수 감각을 유지(기존 읽기전용 규약 계승).
function RevMatrixWeekCells({
  weeks,
  inferred,
  monthOnlyAmount,
  bgClass,
  month,
  editContext = null,
  periodHighlighted = false,
}: {
  weeks: number[]
  inferred: boolean
  monthOnlyAmount: number
  bgClass: string
  month?: string
  editContext?: RevMatrixEditContext | null
  periodHighlighted?: boolean
}) {
  // 월 단위 잠금은 주차 인덱스와 무관(monthLockedOf) — 한 번만 조회해 순수 함수에 넘긴다.
  // 칸별 잠금(빈 칸은 열림)·표시 금액은 computeWeekCellStates가 결정한다(회귀 테스트가 검증하는 그 함수).
  const monthLocked = editContext ? editContext.monthLockedOf(month ?? "") : true
  const cellStates = computeWeekCellStates(weeks, monthOnlyAmount, monthLocked)
  const cells: React.ReactNode[] = []
  for (let index = 0; index < 5; index += 1) {
    const { display, isMonthOnly, locked: cellLocked } = cellStates[index]
    // 잠금 "표시"(🔒 아이콘·"시트 확정 잠금" 툴팁)는 편집 가능한 딜행에만 — 읽기전용 경로(카테고리
    // 합산행 등, editContext 없음)는 애초에 편집 대상이 아니라 잠금 신호가 오표기가 된다(9e8f1fc5
    // 순수 함수화 때 `: false`였던 읽기전용 분기가 `: true` 폴백으로 바뀌며 합산 주차칸마다 🔒가
    // 찍히던 회귀 — 리팩터 이전 렌더로 복원). 편집 판정(weekEditable)은 기존 그대로다.
    const weekLocked = Boolean(editContext) && cellLocked
    const weekEditable = Boolean(editContext) && !cellLocked
    // 선택/편집은 이 칸 기준으로 계산해 원시값으로 내린다 — 비선택·비편집 칸은 memo 스킵.
    const weekSelected = Boolean(editContext) && editContext!.isSelectedCell(month ?? "", index)
    const weekEditing = Boolean(editContext) && editContext!.isEditingCell(month ?? "", index)
    cells.push(
      <RevMatrixWeekCell
        key={index}
        display={display}
        isMonthOnly={isMonthOnly}
        inferred={inferred}
        weekIndex={index}
        bgClass={bgClass}
        month={editContext ? month : undefined}
        rowId={editContext?.rowId}
        editable={weekEditable}
        locked={weekLocked}
        lockLabel={editContext ? editContext.lockLabelOf(month ?? "") : undefined}
        editWarning={editContext ? editContext.weekEditNotice(month ?? "") : undefined}
        pending={editContext ? editContext.weekPendingOf(month ?? "", index) : null}
        actions={editContext?.actions ?? null}
        selected={weekSelected}
        isEditingCell={weekEditing}
        editBuffer={weekEditing ? editContext!.editBuffer : ""}
        editConfidence={weekEditing ? editContext!.editConfidence : "expected"}
        periodHighlighted={periodHighlighted}
      />,
    )
  }
  return <>{cells}</>
}

// 딜행 스트립에만 주입되는 편집 컨텍스트. 그룹 소계행은 이 값을 넘기지 않아 읽기전용 유지.
// 선택/편집 상태는 이 행 스코프로 좁혀(selected/editing 좌표가 이 행일 때만 non-null) 내려온다 —
// 각 셀의 선택·편집 여부는 스트립이 여기서 계산해 memo 셀에 원시 boolean으로 전달한다.
interface RevMatrixEditContext {
  rowId: string
  actions: MatrixEditorActions // identity 안정 — 셀 핸들러(선택/편집 시작/커밋/버퍼)용
  isSelectedCell: (month: string, week?: number) => boolean // 이 행 기준 셀 선택 판정
  isEditingCell: (month: string, week?: number) => boolean // 이 행 기준 셀 편집 판정
  editBuffer: string // 편집 중 버퍼 값(편집 셀에만 의미)
  editConfidence: DraftConfidence // 편집 중 확도(편집 셀에만 의미)
  // 잠금 아이콘·툴팁 라벨(월별) — 시트 원천은 "시트 확정", 적용 초안은 "장부 반영", 정정 적용으로
  // 재잠긴 원본 달은 "장부 반영(정정)"(품질 웨이브 4 — 항목 1: 정정이 셀을 지운 게 아니라 대체했음을
  // 구분해 보여준다 — 재편집을 시도하면 우측 패널 정정 초안으로 유도).
  lockLabelOf: (month: string) => string
  editableOf: (month: string) => boolean
  lockedOf: (month: string) => boolean
  pendingOf: (month: string) => MatrixPendingDraft | null
  // 주차(확장월) 칸의 월 단위 잠금 판정. 시트 확정/장부반영 등으로 그 "달"이 잠겼는지만 본다 —
  // 개별 주차 칸의 잠금(확정액이 찍힌 칸만 잠그고 빈 칸은 열기)은 computeWeekCellStates가 결정하므로
  // week 인자를 받지 않는다(이전 weekLockedOf(month, week)는 week를 무시해 5칸을 통째로 잠그는 함정이었다).
  monthLockedOf: (month: string) => boolean
  weekPendingOf: (month: string, week: number) => MatrixPendingDraft | null
  // 주차 셀 편집 팝오버 고지문 — explicit 행(주차 병합 보존) vs 그 외(월 전체 대체) 구분.
  weekEditNotice: (month: string) => string
}

// 12개월(요약/확장 혼재)에 걸친 월 셀 스트립 — 그룹행·딜행이 공유한다.
// editContext가 오면(딜행) 비확장 월 셀이 편집 셀이 된다. 확장(주차) 칸은 Phase 3 전까지 읽기전용.
function RevMatrixMonthStrip({
  monthlyByRowOrGroup,
  weeklyByMonth,
  months,
  expandedMonths,
  bgClass,
  editContext = null,
  // 웨이브 5 — 항목 1(b): "선택 기간"(M/Q) 달 집합. undefined/빈 Set이면 아무 셀도 강조하지 않는다
  // (period === "Y"거나 아직 계산 전인 초기 렌더 등) — 부모(그룹/딜/카테고리 행)가 안정 참조로 내려준다.
  periodMonths,
}: {
  monthlyByRowOrGroup: Record<string, RevMonthlyBucket>
  weeklyByMonth: (month: string) => { weeks: number[]; inferred: boolean; monthOnlyAmount: number; mismatch: boolean } | null
  months: string[]
  expandedMonths: Set<string>
  bgClass: string
  editContext?: RevMatrixEditContext | null
  periodMonths?: Set<string>
}) {
  return (
    <>
      {months.map((month) => {
        const bucket = monthlyByRowOrGroup[month] ?? EMPTY_BUCKET
        const periodHighlighted = periodMonths?.has(month) ?? false
        if (expandedMonths.has(month)) {
          const weekly = weeklyByMonth(month)
          return (
            <Fragment key={month}>
              <RevMatrixWeekCells
                weeks={weekly?.weeks ?? [0, 0, 0, 0, 0]}
                inferred={weekly?.inferred ?? false}
                monthOnlyAmount={weekly?.monthOnlyAmount ?? 0}
                bgClass={bgClass}
                month={month}
                editContext={editContext}
                periodHighlighted={periodHighlighted}
              />
              {/* 확장 중에도 그 달 총액을 잃지 않도록 주차 5칸 뒤에 읽기전용 월계 셀을 유지한다 */}
              <RevMatrixMonthCell bucket={bucket} mismatch={weekly?.mismatch ?? false} bgClass={bgClass} periodHighlighted={periodHighlighted} />
            </Fragment>
          )
        }
        const monthSelected = Boolean(editContext) && editContext!.isSelectedCell(month)
        const monthEditing = Boolean(editContext) && editContext!.isEditingCell(month)
        return (
          <RevMatrixMonthCell
            key={month}
            bucket={bucket}
            mismatch={weeklyByMonth(month)?.mismatch ?? false}
            bgClass={bgClass}
            month={editContext ? month : undefined}
            rowId={editContext?.rowId}
            editable={editContext ? editContext.editableOf(month) : false}
            locked={editContext ? editContext.lockedOf(month) : false}
            lockLabel={editContext ? editContext.lockLabelOf(month) : undefined}
            pending={editContext ? editContext.pendingOf(month) : null}
            actions={editContext?.actions ?? null}
            selected={monthSelected}
            isEditingCell={monthEditing}
            editBuffer={monthEditing ? editContext!.editBuffer : ""}
            editConfidence={monthEditing ? editContext!.editConfidence : "expected"}
            periodHighlighted={periodHighlighted}
          />
        )
      })}
    </>
  )
}

// EMPTY_BUCKET은 ledger/rev-matrix-logic.ts로 이동(로직 무변경) — 위 named import로 그대로 쓴다.

// SL-4 → 1열 다이어트(2026-07-18): 매트릭스 1열의 미연결 표시는 "직행 링크 칩"에서
// "2단계 공개"로 바꾼다 — 대부분 행이 미연결이라 amber 칩 반복이 소음이었다(운영자 피드백).
// 트리거는 톤 다운된 컴팩트 칩(아이콘+연결), 클릭 시 팝오버(간단 설명 + 매칭 인박스 딥링크).
// open 상태는 부모(워크벤치)가 그룹키/행ID 단위로 1개만 들고 내려준다(동시 다중 열림 금지).
// account-master의 unmatched 판정과 1:1이라 연결됨/드리프트 행에는 렌더되지 않는다(기존 규약 유지).
export function NeedsLinkChip({
  customer,
  open,
  onToggle,
  onClose,
}: {
  customer: string
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // 외부 클릭·Escape 닫기 — 문서 리스너는 열려 있을 때만 부착한다(MultiSelect 관례).
  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) onClose()
    }
    const onDocKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("mousedown", onDocMouseDown)
    document.addEventListener("keydown", onDocKeyDown)
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown)
      document.removeEventListener("keydown", onDocKeyDown)
    }
  }, [open, onClose])
  return (
    // 행 onClick(그룹 선택/상세 열기)과 분리 — 칩·팝오버 내부 클릭은 행 선택으로 전파하지 않는다.
    <span ref={wrapRef} className="relative inline-flex shrink-0" onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${customer} — CRM 미연결`}
        title={`${customer} — CRM 미연결 · 클릭하면 연결 안내가 열립니다`}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[#A8741A] transition hover:bg-[#FBF1E0] hover:text-[#7A520F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
      >
        <Link2Off className="h-3 w-3 shrink-0" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${customer} CRM 연결 안내`}
          className="absolute left-0 top-full z-40 mt-1 w-60 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-2.5 text-left shadow-lg"
        >
          <p className="truncate text-[11.5px] font-bold text-[#111110]">{customer}</p>
          <p className="mt-1 text-[10.5px] font-semibold leading-relaxed text-[#615D59]">
            CRM 미연결 — 매출·활동이 CRM 고객과 이어져 있지 않습니다.
          </p>
          <Link
            href={`/admin/crm/matching?name=${encodeURIComponent(customer)}`}
            className="mt-2 flex items-center justify-center rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-2 py-1 text-[10.5px] font-bold text-[#7A520F] transition hover:bg-[#ECD29C]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            매칭 인박스에서 연결 ↗
          </Link>
        </div>
      )}
    </span>
  )
}

// SL-4: 미연결(needs link) 행 전용 매칭 인박스 딥링크 — /admin/crm/matching?name= 프리필로 착지.
// 우측 레일(상세 단계) 전용 — 매트릭스 1열은 NeedsLinkChip(2단계 팝오버)을 쓰고, 이미 "상세"인
// 레일에서만 원클릭 직행을 유지한다. 링크 확정은 매칭 인박스에서만 한다(장부=분석·검수, 매칭=링크 확정).
export function NeedsLinkBadge({ customer }: { customer: string }) {
  return (
    <Link
      href={`/admin/crm/matching?name=${encodeURIComponent(customer)}`}
      onClick={(event) => event.stopPropagation()}
      title={`${customer} — CRM 미연결(needs link) · 매칭 인박스에서 연결`}
      className="inline-flex shrink-0 items-center rounded-full border border-[#ECD29C] bg-[#FFFCF5] px-1.5 text-[9px] font-bold leading-4 text-[#7A520F] underline-offset-2 transition hover:bg-[#FBF1E0] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
    >
      매칭 인박스에서 연결 ↗
    </Link>
  )
}

// P0-2(호환성 기획 2026-07-18 §4): 연결 확정(linked) 계정 전용 CRM 진입 링크 — NeedsLinkBadge의
// 대칭짝. href는 커버리지 확장(revAccounts.linkedTargets)의 우세 확정 링크 target을
// lib/crm/rev-sync-health.ts revLinkedTargetHref 규칙으로 만든 값을 그대로 받는다(여기서 재판정
// 없음). 우측 레일 전용 — 매트릭스 1열은 무변경(미연결 NeedsLinkChip/팝오버 현행 유지).
export function CrmLinkedBadge({
  customer,
  link,
  variant = "badge",
}: {
  customer: string
  /** null이면 미렌더(미연결·로딩·deal 등 href 없음) — 호출부가 조회값을 그대로 넘긴다. */
  link: { href: string; label: string } | null
  /** badge=그룹 요약(NeedsLinkBadge 자리 대칭 필), inline=행 상세('하드웨어 ↗'와 같은 톤/크기). */
  variant?: "badge" | "inline"
}) {
  if (!link) return null
  return (
    <Link
      href={link.href}
      onClick={(event) => event.stopPropagation()}
      title={`${customer} — CRM 연결됨(${link.label}) · CRM에서 보기`}
      className={
        variant === "inline"
          ? "shrink-0 text-[10px] font-bold text-[#7A520F] underline-offset-2 transition hover:text-[#A8741A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          : "inline-flex shrink-0 items-center rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-1.5 text-[9px] font-bold leading-4 text-[#084734] underline-offset-2 transition hover:bg-[#BDEFD8]/40 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
      }
    >
      CRM ↗
    </Link>
  )
}

// SL-2: 붙여넣기 프리뷰 다이얼로그 — 셀 매핑(고객·상품군·월·현재→새 값)과 일괄 확도를 확인한 뒤에만
// 초안을 만든다. 여기서 만드는 것은 어디까지나 "검토 초안"이며 장부 반영은 체크 큐(2단 게이트)에서만.
const MATRIX_PASTE_PREVIEW_LIMIT = 40

export function RevMatrixPasteDialog({
  plan,
  confidence,
  onPickConfidence,
  onCancel,
  onConfirm,
}: {
  plan: MatrixPastePlan
  confidence: DraftConfidence
  onPickConfidence: (next: DraftConfidence) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const shown = plan.cells.slice(0, MATRIX_PASTE_PREVIEW_LIMIT)
  const hidden = plan.cells.length - shown.length
  // 다이얼로그 포커스 캡처/복귀·Escape 닫기·Tab 트랩 = 공용 훅(use-dialog-focus)에 위임(품질
  // 웨이브 6 — 항목 1). 이 컴포넌트는 부모가 plan이 있을 때만 마운트하므로(조건부 렌더) 마운트
  // = 열림, 언마운트 = 닫힘 — openKey는 "이 마운트 동안 어느 버튼이 기본 포커스인가"를 그대로
  // 나타내는 값("apply"/"review")을 쓴다: 항상 truthy라 열림 판정은 그대로 유지되면서, 기존
  // autoFocus 분기(취소 vs 확인, applyCount 유무)가 바뀌면(이론상) 재포커스도 함께 일어난다.
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const hasApplyCells = plan.applyCount > 0
  useDialogFocus(hasApplyCells ? "apply" : "review", onCancel, hasApplyCells ? confirmButtonRef : cancelButtonRef)
  const statusMeta: Record<MatrixPasteCellPlan["status"], { label: string; className: string }> = {
    apply: { label: "초안 생성", className: "text-[#084734]" },
    locked: { label: "잠금 제외", className: "text-[#A39E98]" },
    unchanged: { label: "동일 값", className: "text-[#A39E98]" },
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="엑셀 붙여넣기 미리보기"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#111110]/40 p-4 sm:items-center"
    >
      <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_24px_70px_rgba(17,17,16,0.22)]">
        <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
          <p className="text-[13px] font-bold text-[#111110]">엑셀 붙여넣기 미리보기</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
            {plan.anchorCustomer} 선택 셀 기준 아래·오른쪽으로 매핑됩니다. 확인 시{" "}
            <span className="font-bold text-[#7A520F]">검토 초안 {plan.applyCount.toLocaleString("ko-KR")}건</span>이 생성되고,
            장부 반영은 체크 큐에서 체크 → 적용을 거쳐야만 이뤄집니다.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            <span className="rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2 py-0.5 text-[#084734]">
              생성 {plan.applyCount.toLocaleString("ko-KR")}
            </span>
            {plan.lockedCount > 0 && (
              <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-0.5 text-[#615D59]">
                잠금 제외 {plan.lockedCount.toLocaleString("ko-KR")}
              </span>
            )}
            {plan.unchangedCount > 0 && (
              <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-0.5 text-[#615D59]">
                동일 값 {plan.unchangedCount.toLocaleString("ko-KR")}
              </span>
            )}
            {plan.outOfRangeCount > 0 && (
              <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[#7A520F]">
                범위 밖 {plan.outOfRangeCount.toLocaleString("ko-KR")}
              </span>
            )}
            {plan.nonNumericCount > 0 && (
              <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[#7A520F]">
                비숫자 제외 {plan.nonNumericCount.toLocaleString("ko-KR")}
              </span>
            )}
          </div>
        </div>
        {/* 일괄 확도 — 커밋 전 3버튼 필수 노출(SL-6과 같은 규약). 붙여넣기 전체에 하나의 확도가 기록된다. */}
        <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[#615D59]">확도(전체 적용)</span>
            <div className="flex items-center gap-1">
              {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
                const activeColor = CONFIDENCE_TOKENS[option.id].color
                const active = option.id === confidence
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onPickConfidence(option.id)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-bold transition"
                    style={
                      active
                        ? { backgroundColor: activeColor, color: "#FFFFFF" }
                        : { color: activeColor, backgroundColor: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)" }
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <span className="text-[10px] font-semibold text-[#A39E98]">확도별로 나눠 넣으려면 범위를 나눠 붙여넣으세요</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="text-[9.5px] uppercase tracking-[0.06em] text-[#A39E98]">
              <tr className="border-b border-[rgba(0,0,0,0.08)]">
                <th className="py-1.5 pr-2 font-bold">고객</th>
                <th className="py-1.5 pr-2 font-bold">상품군</th>
                <th className="py-1.5 pr-2 font-bold">월</th>
                <th className="py-1.5 pr-2 text-right font-bold">현재 → 새 값</th>
                <th className="py-1.5 text-right font-bold">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F1EE]">
              {shown.map((cell, index) => (
                <tr key={`${cell.rowId}-${cell.month}-${index}`} className={cell.status === "apply" ? "" : "opacity-60"}>
                  <td className="max-w-[180px] truncate py-1.5 pr-2 font-semibold text-[#111110]">{cell.customer}</td>
                  <td className="py-1.5 pr-2 text-[#615D59]">{productCategoryMeta(cell.productCategory).shortLabel}</td>
                  <td className="py-1.5 pr-2 font-semibold text-[#615D59]">{formatMonthLabel(cell.month)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    <span className="text-[#615D59]">{cell.current > 0 ? formatMoney(cell.current) : "·"}</span>
                    <span className="mx-1 text-[#A39E98]">→</span>
                    <span className="font-bold text-[#111110]">{formatMoney(cell.next)}</span>
                  </td>
                  <td className={`py-1.5 text-right text-[10px] font-bold ${statusMeta[cell.status].className}`}>
                    {cell.status === "locked" && <Lock className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" aria-hidden />}
                    {statusMeta[cell.status].label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 && (
            <p className="py-2 text-center text-[10.5px] font-semibold text-[#A39E98]">외 {hidden.toLocaleString("ko-KR")}칸 — 전체가 동일 규칙으로 처리됩니다</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            // applyCount=0이면 확인 버튼이 disabled라 취소 버튼이 초기 포커스를 받는다(위 useEffect) —
            // 그러지 않으면 포커스가 모달 뒤 그리드 셀에 남아 숫자 키가 편집을 시작해버린다.
            className="inline-flex h-9 items-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
          >
            취소
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={plan.applyCount === 0}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
          >
            검토 초안 {plan.applyCount.toLocaleString("ko-KR")}건 생성
          </button>
        </div>
      </div>
    </div>
  )
}

// 고객 그룹 소계행(접힘 기본). ▸ 토글은 기존 UX 계승(ChevronRight rotate-90).
export const RevMatrixGroupRow = memo(function RevMatrixGroupRow({
  group,
  months,
  expandedMonths,
  expanded,
  selected,
  needsLink = false,
  linkPopoverOpen = false,
  onLinkPopoverToggle,
  onLinkPopoverClose,
  onSelect,
  onToggle,
  density = "regular",
  periodMonths,
}: {
  group: RevCustomerGroup
  months: string[]
  expandedMonths: Set<string>
  expanded: boolean
  selected: boolean
  needsLink?: boolean // account-master unmatched 판정 — 미연결 고객만 NeedsLinkChip 트리거(SL-4)
  linkPopoverOpen?: boolean // 미연결 팝오버 열림 — 부모가 그룹키 단위 1개만 열어준다
  onLinkPopoverToggle?: (key: string) => void
  onLinkPopoverClose?: () => void
  onSelect: (key: string) => void
  onToggle: (key: string) => void
  density?: MatrixDensity
  periodMonths?: Set<string> // 웨이브 5 — 항목 1(b): 선택 기간 열 accent
}) {
  const rowBg = selected ? "bg-[#ECFDF5]" : "bg-white group-hover:bg-[#FAFAF8]"
  const annual = group.annualTotal
  const annualTone = matrixBucketTone(annual)
  const weeklyByMonth = (month: string) => {
    // 그룹 소계는 주차 상세를 다시 합산하지 않는다(성능). 확장 시 그룹행은 요약만, 하위 딜행에서 주차 노출.
    void month
    return null
  }
  const monthlyByGroup = group.monthlyTotals
  return (
    <tr
      onClick={() => onSelect(group.key)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect(group.key)
        }
      }}
      tabIndex={0}
      role="row"
      title="클릭: 우측 요약 · ▸ 펼치기: 하위 딜행"
      aria-label={`${group.customer} ${group.rows.length}건 — 우측 요약 열기`}
      className={`group ${MATRIX_GROUP_ROW_HEIGHT[density]} cursor-pointer border-t border-[#EDECE8] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 ${
        selected ? "bg-[#ECFDF5]" : "hover:bg-[#FAFAF8]"
      }`}
    >
      {/* 1열 다이어트(Ledger-1a): 항상 보이는 것 = 셰브론 + 고객명 + 서브라인 + 미연결 트리거뿐.
          건수·장부 필·불일치 아이콘은 1열에서 뺀다 — 건수·불일치는 우측 레일 그룹 요약이, 불일치는
          펼친 딜행 월 셀(빨강 배경+삼각형)이 이미 보여준다. 팝오버가 열린 셀만 z-30으로 승격해
          sticky 1열(z-10)·sticky 푸터(z-20) 위에 뜨게 한다(헤더 코너 z-40 아래). */}
      <td
        className={`sticky left-0 ${linkPopoverOpen ? "z-30" : "z-10"} border-r border-[rgba(0,0,0,0.08)] px-2 ${rowBg}`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggle(group.key)
            }}
            aria-expanded={expanded}
            aria-label={`${group.customer} 하위 ${group.rows.length}건 ${expanded ? "접기" : "펼치기"}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#615D59] transition hover:bg-[#F0F0EC] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-bold text-[#111110]">{group.customer}</span>
            {(group.managers.length > 0 || group.regions.length > 0) && (
              <span
                title={[group.managers.join(", "), group.teams.join(", "), group.regions.join(", ")].filter(Boolean).join(" · ")}
                className="block truncate text-[9.5px] font-semibold text-[#A39E98]"
              >
                {[group.managers.join("·"), group.regions.join("·")].filter(Boolean).join(" · ") || "-"}
              </span>
            )}
          </div>
          {/* 칩을 이름 옆이 아니라 행 우측 끝에 고정 — 이름 길이와 무관하게 열 우측 정렬(단독 딜행과 동일 규약). */}
          {needsLink && onLinkPopoverToggle && onLinkPopoverClose && (
            <NeedsLinkChip
              customer={group.customer}
              open={linkPopoverOpen}
              onToggle={() => onLinkPopoverToggle(group.key)}
              onClose={onLinkPopoverClose}
            />
          )}
        </div>
      </td>
      <td className="border-l border-[#F2F1EE] px-1.5 text-right" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        <div className="flex flex-wrap items-center justify-end gap-x-1">
          {/* 접힌 고객 헤더에는 링크를 걸지 않는다 — ▸로 펼친 뒤 카테고리/품목 행에서 하드웨어로 이동. */}
          {group.categories.map((category) => (
            <span
              key={category}
              title={`${productCategoryMeta(category).label} ${formatMoney(group.categoryTotals[category])}`}
              className={`text-[10px] font-semibold ${category === "hardware" ? "text-[#7A520F]" : "text-[#615D59]"}`}
            >
              {productCategoryMeta(category).shortLabel}
            </span>
          ))}
        </div>
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByGroup}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
        periodMonths={periodMonths}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] px-2 text-right align-middle tabular-nums ${rowBg}`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total > 0 ? (
          <>
            <span className={`block text-[11.5px] leading-tight ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
            {annual.confirmed > 0 && (
              <span className="block text-[9px] font-semibold leading-tight text-[#084734]">확정 {formatWeekAmount(annual.confirmed)}</span>
            )}
          </>
        ) : (
          <span className="text-[11px] font-semibold text-[#C9C5BF]">–</span>
        )}
      </td>
    </tr>
  )
})

// 개별 딜행. 고객명 아래 서브라인에 담당자/팀/지역 이관. 확장된 달만 주차 5칸.
export const RevMatrixDealRow = memo(function RevMatrixDealRow({
  view,
  grouped,
  nested = false,
  needsLink = false,
  linkPopoverOpen = false,
  onLinkPopoverToggle,
  onLinkPopoverClose,
  months,
  expandedMonths,
  active,
  selectedMonth,
  onOpen,
  actions = null,
  // 선택/편집 좌표는 이 행 스코프로 좁혀서 온다(다른 행 선택이면 null) — 부모가 행별로 계산.
  // 덕분에 memo가 이 행이 선택/편집에 관여할 때만 리렌더되고, 나머지 행은 스킵된다.
  selectedCoord = null,
  editingCoord = null,
  editBuffer = "",
  editConfidence = "expected",
  pendingByCell = null,
  density = "regular",
  periodMonths,
}: {
  view: RevRowView
  grouped: boolean
  nested?: boolean // 카테고리(HW/SW) 합산행 아래 품목 잎 행 — 한 단계 더 들여쓰기
  needsLink?: boolean // account-master unmatched 판정 — 단독 딜행(비그룹)에만 NeedsLinkChip 트리거(SL-4)
  linkPopoverOpen?: boolean // 미연결 팝오버 열림 — 부모가 행ID 단위 1개만 열어준다
  onLinkPopoverToggle?: (key: string) => void
  onLinkPopoverClose?: () => void
  months: string[]
  expandedMonths: Set<string>
  active: boolean
  selectedMonth: string
  onOpen: (row: LedgerRevenueRow) => void
  actions?: MatrixEditorActions | null
  selectedCoord?: MatrixCellCoord | null
  editingCoord?: MatrixCellCoord | null
  editBuffer?: string
  editConfidence?: DraftConfidence
  pendingByCell?: Map<string, MatrixPendingDraft> | null
  density?: MatrixDensity
  periodMonths?: Set<string> // 웨이브 5 — 항목 1(b): 선택 기간 열 accent
}) {
  const { row, draftRow, monthlyByMonth } = view
  const rowBg = active
    ? "bg-[#ECFDF5]"
    : draftRow
      ? "bg-[#FFFCF5] group-hover:bg-[#FBF1E0]"
      : grouped
        ? "bg-[#FBFBFA] group-hover:bg-[#FAFAF8]"
        : "bg-white group-hover:bg-[#FAFAF8]"
  const subLine = draftRow
    ? `${row.draftKind === "edit-row" ? "수정" : "신규"} · ${formatMonthLabel(row.draftMonth ?? selectedMonth)}${row.draftNote ? ` · ${row.draftNote}` : ""}`
    : [row.manager, row.team, row.region].filter(Boolean).join(" · ")
  const annual = view.annual
  const annualTone = matrixBucketTone(annual)
  const weeklyByMonth = (month: string) => {
    const split = rowWeeklySplit(row, month)
    if (split.source === "empty") return null
    return {
      weeks: split.source === "explicit" || split.source === "inferred" ? split.weeks : [0, 0, 0, 0, 0],
      inferred: split.source === "inferred",
      monthOnlyAmount: split.source === "month-only" ? split.total : 0,
      mismatch: rowWeeklyMismatch(row, month) !== null,
    }
  }
  // 편집 컨텍스트는 actions가 주입될 때만(딜행) — 그룹 소계행에는 이 컴포넌트를 쓰지 않으므로 항상 딜행.
  // isSelectedCell/isEditingCell는 행 스코프 좌표(selectedCoord/editingCoord)와 month·week를 비교한다 —
  // 원 isSelected/isEditing 규약과 동일(행 rowId 일치는 좌표가 이미 이 행일 때만 non-null이라 내포).
  const editContext: RevMatrixEditContext | null = actions
    ? {
        rowId: row.id,
        actions,
        isSelectedCell: (month, week) =>
          selectedCoord != null && selectedCoord.month === month && (selectedCoord.week ?? -1) === (week ?? -1),
        isEditingCell: (month, week) =>
          editingCoord != null && editingCoord.month === month && (editingCoord.week ?? -1) === (week ?? -1),
        editBuffer,
        editConfidence,
        // 품질 웨이브 4 — 항목 1: 정정으로 재잠긴 달만 "장부 반영(정정)"으로 구분 — 나머지는 기존 규약.
        lockLabelOf: (month) =>
          view.correctedMonths?.has(month) ? "장부 반영(정정)" : row.ledgerOrigin === "draft" ? "장부 반영" : "시트 확정",
        editableOf: (month) => isMatrixCellEditable(row, month, view.correctedMonths),
        lockedOf: (month) => isMatrixCellLocked(row, month, view.correctedMonths),
        pendingOf: (month) => pendingByCell?.get(`${row.id}::${month}`) ?? null,
        // 월 단위 잠금 = 그 달 시트 확정 여부. 칸별 잠금은 computeWeekCellStates가 display>0로 좁힌다.
        // 주차 pending = `rowId::month::wN` 키.
        monthLockedOf: (month) => isMatrixCellLocked(row, month, view.correctedMonths),
        weekPendingOf: (month, week) => pendingByCell?.get(`${row.id}::${month}::w${week + 1}`) ?? null,
        weekEditNotice: (month) =>
          rowWeeklySplit(row, month).source === "explicit"
            ? "커밋 시 이 달 금액이 주차 합계로 재기재됩니다 (기존 주차 병합 보존)"
            : "적용 시 이 달 전체가 이 값으로 대체됩니다 (주차 분해 없음)",
      }
    : null
  return (
    <tr role="row" className={`group ${MATRIX_DEAL_ROW_HEIGHT[density]} border-t border-[#F2F1EE] transition ${active ? "bg-[#ECFDF5]" : draftRow ? "bg-[#FFFCF5] hover:bg-[#FBF1E0]" : grouped ? "bg-[#FBFBFA] hover:bg-[#FAFAF8]" : "hover:bg-[#FAFAF8]"}`}>
      {/* 1열 다이어트(Ledger-1a): 이름 + 서브라인 + (단독 미연결 행만) 트리거뿐. ⓘ 계보는 우측
          레일 행 상세 헤더 아래 뮤트 라인으로 이동, SW/HW 라벨·HW ↗ 링크는 제거(상품 칼럼이
          SW/HW를 이미 말하고, 하드웨어 ↗는 레일 상세·카테고리 합산행에 있다). 팝오버가 열린
          셀만 z-30 승격 — 그룹 소계행과 동일 규약. */}
      <td
        className={`sticky left-0 ${linkPopoverOpen ? "z-30" : "z-10"} border-r border-[rgba(0,0,0,0.08)] pr-2 ${nested ? "border-l-2 border-l-[#CBD9D2] pl-12" : grouped ? "border-l-2 border-l-[#DDE7E2] pl-7" : "pl-2"} ${rowBg}`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1">
          {/* 단독 딜행(비그룹·비중첩)은 그룹 소계행의 셰브론 폭(h-6 w-6)을 빈 자리로 예약한다 —
              토글 유무로 고객명 시작 위치가 흔들리지 않도록 1열 정렬을 고정한다. */}
          {!grouped && !nested && <span className="h-6 w-6 shrink-0" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => void onOpen(row)}
              title={`${row.customer} 상세 열기`}
              className="block max-w-full truncate text-left text-[11.5px] font-bold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
              aria-label={`${row.customer} 상세 열기`}
            >
              {grouped ? row.productVersion || row.customer : row.customer}
            </button>
            {subLine && (
              <span title={subLine} className={`block truncate text-[9.5px] font-semibold ${draftRow ? "text-[#7A520F]" : "text-[#A39E98]"}`}>
                {subLine}
              </span>
            )}
          </div>
          {/* 그룹 고객은 그룹 소계행이 트리거를 가진다 — 단독 딜행에만(중복 노출 방지). */}
          {!grouped && needsLink && onLinkPopoverToggle && onLinkPopoverClose && (
            <NeedsLinkChip
              customer={row.customer}
              open={linkPopoverOpen}
              onToggle={() => onLinkPopoverToggle(row.id)}
              onClose={onLinkPopoverClose}
            />
          )}
        </div>
      </td>
      <td className="border-l border-[#F2F1EE] px-1.5 text-right align-middle" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        {/* 품질 웨이브 4 — 항목 8: "시트/장부" 원천 라벨도 실데이터라 #615D59로 승격. */}
        <span className={`text-[10px] font-semibold ${draftRow ? "text-[#A8741A]" : "text-[#615D59]"}`}>
          {draftRow ? "장부" : "시트"}
        </span>
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByMonth}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
        editContext={editContext}
        periodMonths={periodMonths}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] px-2 text-right align-middle tabular-nums ${rowBg}`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total > 0 ? (
          <span className={`block text-[11px] leading-tight ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
        ) : (
          <span className="text-[11px] font-semibold text-[#C9C5BF]">–</span>
        )}
      </td>
    </tr>
  )
})

// 고객 펼침 시 카테고리(HW/SW) 합산 1행. 그 카테고리 품목들의 12개월 소계를 한 줄로 보여준다.
// 개별 품목행 대신 "HW 쭉 하나로, SW 하나로" 구조 — 품목명은 서브라인에, 상세/편집은 우측 rail에서.
export const RevMatrixCategoryRow = memo(function RevMatrixCategoryRow({
  category,
  customer,
  products,
  monthlyByMonth,
  annual,
  rows,
  months,
  expandedMonths,
  expanded,
  editable,
  hardwareLinked,
  onToggle,
  onOpen,
  density = "regular",
  periodMonths,
}: {
  category: Exclude<RevProductCategory, "all">
  customer: string
  products: string[]
  monthlyByMonth: Record<string, RevMonthlyBucket>
  annual: RevMonthlyBucket
  rows: LedgerRevenueRow[]
  months: string[]
  expandedMonths: Set<string>
  expanded: boolean
  editable: boolean // 이 카테고리에 편집 가능한 품목이 있는지(전부 잠금이면 ▸ 대신 잠금 표시)
  hardwareLinked: boolean // 하드웨어 원장에 출고 이력이 있어 역링크 걸어도 되는 고객인지
  onToggle: () => void
  onOpen: () => void
  density?: MatrixDensity
  periodMonths?: Set<string> // 웨이브 5 — 항목 1(b): 선택 기간 열 accent
}) {
  const rowBg = category === "hardware" ? "bg-[#FFFCF5] group-hover:bg-[#FBF6EC]" : "bg-[#FBFBFA] group-hover:bg-[#FAFAF8]"
  const annualTone = matrixBucketTone(annual)
  const subLine = products.slice(0, 3).join(" · ") + (products.length > 3 ? ` +${products.length - 3}` : "")
  // 확장월 주차 5칸: 이 카테고리 품목들의 주차 분해를 합산한다.
  const weeklyByMonth = (month: string) => {
    const weeks = [0, 0, 0, 0, 0]
    let hasExplicit = false
    let hasInferred = false
    let monthOnlyAmount = 0
    for (const row of rows) {
      const split = rowWeeklySplit(row, month)
      if (split.source === "explicit" || split.source === "inferred") {
        split.weeks.forEach((value, index) => { weeks[index] += value })
        if (split.source === "explicit") hasExplicit = true
        else hasInferred = true
      } else if (split.source === "month-only") {
        monthOnlyAmount += split.total
      }
    }
    if (!weeks.some((value) => value > 0) && monthOnlyAmount === 0) return null
    return { weeks, inferred: !hasExplicit && hasInferred, monthOnlyAmount, mismatch: false }
  }
  return (
    <tr role="row" className={`group ${MATRIX_DEAL_ROW_HEIGHT[density]} border-t border-[#F2F1EE] transition ${
      category === "hardware" ? "bg-[#FFFCF5] hover:bg-[#FBF6EC]" : "bg-[#FBFBFA] hover:bg-[#FAFAF8]"
    }`}>
      <td
        className={`sticky left-0 z-10 border-l-2 border-l-[#DDE7E2] border-r border-[rgba(0,0,0,0.08)] pl-5 pr-2 ${rowBg}`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            title={expanded ? "품목 접기" : editable ? "품목 펼쳐 엑셀식 편집" : "품목 보기 (전부 확정·잠금)"}
            aria-label={`${productCategoryMeta(category).label} 품목 ${expanded ? "접기" : "펼치기"}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#615D59] transition hover:bg-[#F0F0EC] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onOpen}
            title={`${productCategoryMeta(category).label} 합산 · ${products.join(", ") || "-"} · 상세 열기`}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/30"
          >
            <ProductCategoryPill category={category} compact />
            <span className="min-w-0 truncate text-[11px] font-semibold text-[#615D59]">{subLine || productCategoryMeta(category).label}</span>
          </button>
        </div>
      </td>
      <td className="border-l border-[#F2F1EE] px-1.5 text-right align-middle" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        {category === "hardware" && hardwareLinked ? (
          // 펼친 뒤 나오는 HW 합산행 → 하드웨어 원장 역링크(연결된 고객만).
          <Link
            href={`/admin/hardware?customer=${encodeURIComponent(customer)}`}
            title={`${customer} 하드웨어 거래이력 열기`}
            className="text-[10px] font-semibold text-[#7A520F] underline-offset-2 transition hover:text-[#A8741A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            HW ↗
          </Link>
        ) : (
          // 품질 웨이브 4 — 항목 8: "합산"도 실데이터 라벨이라 #615D59로 승격.
          <span className="text-[10px] font-semibold text-[#615D59]">합산</span>
        )}
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByMonth}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
        periodMonths={periodMonths}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] px-2 text-right align-middle tabular-nums ${rowBg}`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total > 0 ? (
          <span className={`block text-[11px] leading-tight ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
        ) : (
          <span className="text-[11px] font-semibold text-[#C9C5BF]">–</span>
        )}
      </td>
    </tr>
  )
})

// 하단 sticky 합계행: 월별 확정/고확도/예정 스택 + 월 목표 대비 %.
export const RevMatrixFooter = memo(function RevMatrixFooter({
  columns,
  grand,
  months,
  expandedMonths,
  periodMonths,
}: {
  columns: RevMatrixColumn[]
  grand: RevMonthlyBucket
  months: string[]
  expandedMonths: Set<string>
  periodMonths?: Set<string> // 웨이브 5 — 항목 1(b): 선택 기간 열 accent(본문·헤더와 동일한 시각 언어)
}) {
  const columnByMonth = new Map(columns.map((column) => [column.month, column]))
  const hasAnyGoal = columns.some((column) => column.goal !== null)
  return (
    <tfoot className="sticky bottom-0 z-20">
      {/* 월별 확정/고확도/예정 스택 */}
      <tr role="row" className="h-9 border-t-2 border-[#111110]/15 bg-[#F6F5F4]">
        <td
          className="sticky left-0 z-10 border-r border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[#615D59]"
          style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
        >
          월 합계 (확정·고확도·예정)
        </td>
        <td className="border-l border-[#E7E5E1] bg-[#F6F5F4]" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }} />
        {months.map((month) => {
          const column = columnByMonth.get(month) ?? null
          const bucket = column ?? EMPTY_BUCKET
          const span = expandedMonths.has(month) ? 6 : 1
          const width = span === 6 ? MATRIX_WEEK_W * 5 + MATRIX_MONTH_W : MATRIX_MONTH_W
          const periodHighlighted = periodMonths?.has(month) ?? false
          return (
            <td
              key={month}
              colSpan={span}
              title={column ? `${formatMonthLabel(month)} 합계 ${formatMoney(bucket.total)} · 확정 ${formatMoney(bucket.confirmed)} · 고확도 ${formatMoney(bucket.high)} · 예정 ${formatMoney(bucket.open)}` : undefined}
              className={`px-1.5 py-1 text-right align-middle tabular-nums bg-[#F6F5F4] ${
                periodHighlighted ? "border-l-2 border-l-[#084734]/25" : "border-l border-[#E7E5E1]"
              }`}
              style={{ width, minWidth: width }}
            >
              {bucket.total > 0 ? (
                <span className="flex flex-col items-end leading-none">
                  <span className={`text-[10.5px] font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>{formatWeekAmount(bucket.confirmed)}</span>
                  <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatWeekAmount(bucket.high)}</span>
                  <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`}>{formatWeekAmount(bucket.open)}</span>
                </span>
              ) : (
                <span className="text-[11px] text-[#DDD9D3]">·</span>
              )}
            </td>
          )
        })}
        <td
          className="sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-1 text-right align-middle tabular-nums"
          style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
        >
          <span className="flex flex-col items-end leading-none">
            <span className={`text-[11px] font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>{formatWeekAmount(grand.confirmed)}</span>
            <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatWeekAmount(grand.high)}</span>
            <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`}>{formatWeekAmount(grand.open)}</span>
          </span>
        </td>
      </tr>
      {/* 월 목표 대비 % (DSH 월 목표 시리즈가 있을 때만) */}
      {hasAnyGoal && (
        <tr role="row" className="h-7 border-t border-[#E7E5E1] bg-[#FAFAF8]">
          <td
            className="sticky left-0 z-10 border-r border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[#615D59]"
            style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
          >
            월 목표 대비 (확정)
          </td>
          <td className="border-l border-[#E7E5E1] bg-[#FAFAF8]" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }} />
          {months.map((month) => {
            const column = columnByMonth.get(month) ?? null
            const span = expandedMonths.has(month) ? 6 : 1
            const width = span === 6 ? MATRIX_WEEK_W * 5 + MATRIX_MONTH_W : MATRIX_MONTH_W
            const pct = column && column.goal ? (column.confirmed / column.goal) * 100 : null
            const tone = pct === null ? "text-[#C9C5BF]" : pct >= 100 ? "text-[#084734]" : pct >= 60 ? "text-[#A8741A]" : "text-[#B43E3E]"
            const periodHighlighted = periodMonths?.has(month) ?? false
            return (
              <td
                key={month}
                colSpan={span}
                title={column && column.goal ? `${formatMonthLabel(month)} 목표 ${formatMoney(column.goal)} · 확정 ${formatMoney(column.confirmed)}` : "월 목표 미설정"}
                className={`px-1.5 text-right align-middle tabular-nums bg-[#FAFAF8] ${
                  periodHighlighted ? "border-l-2 border-l-[#084734]/25" : "border-l border-[#E7E5E1]"
                }`}
                style={{ width, minWidth: width }}
              >
                {/* % 자리수는 formatPercent SSOT(최대 1자리) — 보조 분석·레일 KPI 달성률과 동일 규칙. */}
                <span className={`text-[10px] font-bold ${tone}`}>{pct === null ? "·" : formatPercent(pct)}</span>
              </td>
            )
          })}
          <td
            className="sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-right align-middle tabular-nums"
            style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
          >
            {(() => {
              const goalSum = columns.reduce((sum, column) => sum + (column.goal ?? 0), 0)
              const goalMonths = columns.filter((column) => column.goal !== null).length
              const pct = goalSum > 0 ? (grand.confirmed / goalSum) * 100 : null
              const tone = pct === null ? "text-[#C9C5BF]" : pct >= 100 ? "text-[#084734]" : pct >= 60 ? "text-[#A8741A]" : "text-[#B43E3E]"
              // 분모는 '목표가 설정된 달'만 — 부분 목표일 때 연간 순항으로 오독하지 않게 표기한다.
              return (
                <span
                  title={pct === null ? undefined : `목표 설정 ${goalMonths}/${columns.length}개월 합계 대비 확정${goalMonths < columns.length ? " — 부분 목표 기준" : ""}`}
                  className={`text-[10.5px] font-bold ${tone}`}
                >
                  {pct === null ? "·" : `${formatPercent(pct)}${goalMonths < columns.length ? "*" : ""}`}
                </span>
              )
            })()}
          </td>
        </tr>
      )}
    </tfoot>
  )
})
