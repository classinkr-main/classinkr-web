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

import { Fragment, memo, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronRight, Info, Link2Off, Lock } from "lucide-react"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { useDialogFocus } from "../../use-dialog-focus"
import {
  DRAFT_CONFIDENCE_OPTIONS,
  formatMoney,
  formatMonthLabel,
  formatPercent,
  formatWeekAmount,
  ledgerMonthWeekCount,
  productCategoryMeta,
  ProductCategoryPill,
  REFUND_CELL_LABEL,
  rowMonthNet,
  rowProductCategory,
  rowSignedWeeks,
  rowWeeklyMismatch,
  rowWeeklySplit,
  type DraftConfidence,
  type LedgerRevenueRow,
  type RevCustomerGroup,
  type RevMonthlyBucket,
  type RevProductCategory,
  type RevRowView,
} from "./shared"
import { addMonthlyBucket, emptyMonthlyBucket } from "./workbench-shared"
import { sheetAmountFontClass } from "./ledger-sheet-logic"
import { cellSavingKey } from "./ledger-cell-flight"
import {
  computeWeekCellStates,
  EMPTY_BUCKET,
  isMatrixCellEditable,
  isMatrixCellLocked,
  isWholeMonthLock,
  matrixCellLockKind,
  matrixCoordKey,
  pendingCellAmount,
  pendingMatchesKind,
  rowCommitKind,
  type MatrixCellLockKind,
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

// 그룹 소계행·딜행 높이 클래스 (사용자 요청: 행별 높이 ~15% 증가로 가독성 및 클릭성 향상)
const MATRIX_GROUP_ROW_HEIGHT: Record<MatrixDensity, string> = {
  condensed: "h-7",
  regular: "h-[38px]", // 기존 h-8(32px) 대비 약 18% 증가 (38px)
  relaxed: "h-10",
}
const MATRIX_DEAL_ROW_HEIGHT: Record<MatrixDensity, string> = {
  condensed: "h-7",
  regular: "h-[33px]", // 기존 h-7(28px) 대비 약 18% 증가 (33px)
  relaxed: "h-10",
}
// 장부 건별 시트의 주차 칸 폭(px) — ledger/LedgerSheet.tsx 의 열 폭과 같은 값이어야 한다.
// 60 → 72(2026-11-25, 필터 기획 C-2 가 · D1): 원 단위 7자리(1,660,000)가 글자를 줄이지 않고 들어가는 폭.
export const SHEET_WEEK_W = 72
// 시트 주차 칸의 글자 영역 폭 — 칸 폭 − 왼쪽 선 1px − 좌우 여백(px-1) 8px. 여백을 4px 로 둬서 굵은 7자리가 12px 그대로 든다.
const SHEET_WEEK_TEXT_W = SHEET_WEEK_W - 9
// isMatrixDensity는 ledger/rev-matrix-logic.ts로 이동(위 export * 재수출로 이 파일에서도 계속 사용 가능).

// 확도 = 숫자 글자색(셀 안 아이콘 없음). 장부 렌즈(LedgerSimpleView)와 같은 표시이고,
// 전액 확정 칸만 확정 틴트 배경을 깐다. 확도 3색은 CONFIDENCE_TOKENS SSOT 소비 — 리터럴 재정의 금지.
const MATRIX_TONE = {
  confirmed: `font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`,
  high: `font-bold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`,
  open: `font-semibold ${CONFIDENCE_TOKENS.expected.textStrongClass}`,
  mixed: `font-semibold ${CONFIDENCE_TOKENS.expected.textStrongClass}`,
  // 불일치: 확정(크림슨)과 헷갈리지 않게 숫자는 먹색, 신호는 빨간 ⚠ 아이콘·왼쪽 빨간 선·회색 배경.
  mismatch: "font-bold text-[#111110]",
  // 환불·차감(합계 < 0, D2): 부호를 붙인 중립 먹색 — 확정 크림슨으로 칠하지 않는다(빨강 환불을 '확정 매출'로 오독하지 않게).
  refund: "font-semibold text-[#31302E]",
  empty: "text-[#DDD9D3]",
} as const

// 셀 단일 금액의 확도 톤. 혼재(여러 확도 합산)면 mixed — 예정 톤(월합계 요약 성격).
// 확도 색은 합계가 0 보다 클 때만(D2) — 0 은 빈 칸, 음수(환불)는 중립 refund 톤.
function matrixBucketTone(bucket: RevMonthlyBucket): keyof typeof MATRIX_TONE {
  if (bucket.total === 0) return "empty"
  if (bucket.total < 0) return "refund"
  if (bucket.confirmed === bucket.total) return "confirmed"
  if (bucket.confirmed === 0 && bucket.high === bucket.total) return "high"
  if (bucket.confirmed === 0 && bucket.high === 0) return "open"
  return "mixed"
}

// 매트릭스 확도 범례 — 셀 숫자 글자색·전액 확정 틴트·불일치와 1:1. 단계 목록은 CONFIDENCE_TOKENS 를 돌린다(5단계로 바뀌면
// 토큰 맵만 고친다 — F-52).
const MATRIX_TONE_LEGEND_ITEMS = Object.keys(CONFIDENCE_TOKENS) as DraftConfidence[]

// 원 단위 정확 금액(툴팁) — 부호는 ¥ 앞("-¥30,000"). 칸 글자는 formatWeekAmount("-30,000")로 쓴다.
function exactYen(value: number): string {
  const rounded = Math.round(value)
  return `${rounded < 0 ? "-" : ""}¥${Math.abs(rounded).toLocaleString("ko-KR")}`
}
export function MatrixToneLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-[#615D59]">
      {MATRIX_TONE_LEGEND_ITEMS.map((kind) => (
        <span key={kind} className={`font-bold ${CONFIDENCE_TOKENS[kind].textStrongClass}`}>
          {CONFIDENCE_TOKENS[kind].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-[2px] border border-[rgba(0,0,0,0.08)]" style={{ backgroundColor: CONFIDENCE_TOKENS.confirmed.tintBg }} />
        전액 확정
      </span>
      <span className="inline-flex items-center gap-1">
        <AlertTriangle aria-hidden className="h-2.5 w-2.5 text-[#B43E3E]" />
        불일치
      </span>
      <span>· 잠금=시트확정/장부반영</span>
      <span className={MATRIX_TONE.refund}>· -1,000=환불(시트 값)</span>
      <span className="hidden lg:inline">· 합산 셀 주황=확도 혼합 포함</span>
      {/* 13인치(lg~xl) 랩탑에서도 단축키 힌트가 보이도록 xl→lg 하향. 편집 진입 시엔 팝오버가 셀 인근 힌트를 재노출한다. */}
      <span className="hidden text-[#A39E98] lg:inline">· Enter 편집 · Tab 이동 · Ctrl+D 아래 복사 · Ctrl+V 엑셀 붙여넣기 · E/H/C 확도(예정·고확도·확정) · Esc 취소</span>
    </span>
  )
}

/**
 * 매출 확도 및 스프레드시트 단축키 안내 팝오버 (호버 및 클릭 지원)
 * 사용자 요청: "확정 고확도 예정 이런것들 오른쪽이나 i 상단 호버로 (도움말 st)"
 */
export function MatrixHelpPopover() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setOpen(true)
  }

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setOpen(false)
    }, 120)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="장부 확도 및 단축키 안내"
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[12px] font-semibold transition ${
          open
            ? "border-[#084734]/40 text-[#084734]"
            : "border-[rgba(0,0,0,0.08)] text-[#615D59] hover:border-[#084734]/30 hover:text-[#084734]"
        }`}
      >
        <Info className="h-4 w-4 text-[#084734]" />
        <span>가이드</span>
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-full z-50 pt-1.5 w-84 text-left"
        >
          <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.08)] pb-2.5 mb-3">
            <span className="text-[13px] font-bold text-[#111110]">REV 장부 가이드 & 단축키</span>
            <span className="text-[10px] font-semibold text-[#A39E98]">도움말</span>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-bold text-[#615D59] uppercase tracking-wider mb-2">매출 확도 구분</p>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                {MATRIX_TONE_LEGEND_ITEMS.map((kind) => (
                  <div key={kind} className="flex items-center gap-2">
                    <span className={`font-bold tabular-nums ${CONFIDENCE_TOKENS[kind].textStrongClass}`}>¥12.3만</span>
                    <span className="font-semibold text-[#111110]">{CONFIDENCE_TOKENS[kind].label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-[3px] border border-[rgba(0,0,0,0.08)]" style={{ backgroundColor: CONFIDENCE_TOKENS.confirmed.tintBg }} />
                  <span className="font-semibold text-[#111110]">전액 확정</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle aria-hidden className="h-3 w-3 shrink-0 text-[#B43E3E]" />
                  <span className="font-semibold text-[#111110]">불일치</span>
                </div>
              </div>
              <div className="mt-2.5 space-y-1.5 text-[11px] text-[#615D59] bg-[#FAFAF8] p-2 rounded-md">
                <p className="flex items-center gap-1.5">
                  <Lock className="h-3 w-3 text-[#A39E98] shrink-0" />
                  <span><b>잠금 셀</b>: 시트 확정 / 장부 반영 완료 (수정 불가)</span>
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#D97706] shrink-0" />
                  <span><b>합산 셀 주황</b>: 여러 확도가 혼합된 요약 셀</span>
                </p>
              </div>
            </div>

            <div className="border-t border-[rgba(0,0,0,0.08)] pt-2.5">
              <p className="text-[11px] font-bold text-[#615D59] uppercase tracking-wider mb-2">스프레드시트 단축키</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                <div className="flex items-center justify-between bg-[#F6F5F4] rounded px-2 py-1">
                  <span className="text-[#615D59]">셀 편집</span>
                  <kbd className="font-mono font-bold text-[#111110]">Enter</kbd>
                </div>
                <div className="flex items-center justify-between bg-[#F6F5F4] rounded px-2 py-1">
                  <span className="text-[#615D59]">다음 셀</span>
                  <kbd className="font-mono font-bold text-[#111110]">Tab</kbd>
                </div>
                <div className="flex items-center justify-between bg-[#F6F5F4] rounded px-2 py-1">
                  <span className="text-[#615D59]">아래 복사</span>
                  <kbd className="font-mono font-bold text-[#111110]">Ctrl+D</kbd>
                </div>
                <div className="flex items-center justify-between bg-[#F6F5F4] rounded px-2 py-1">
                  <span className="text-[#615D59]">붙여넣기</span>
                  <kbd className="font-mono font-bold text-[#111110]">Ctrl+V</kbd>
                </div>
                <div className="flex items-center justify-between bg-[#F6F5F4] rounded px-2 py-1 col-span-2">
                  <span className="text-[#615D59]">원클릭 확도</span>
                  <span className="font-mono font-bold text-[#084734]">E(예정) · H(고확도) · C(확정)</span>
                </div>
                <div className="flex items-center justify-between bg-[#F6F5F4] rounded px-2 py-1 col-span-2">
                  <span className="text-[#615D59]">편집 취소</span>
                  <kbd className="font-mono font-bold text-[#111110]">Esc</kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
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
      {/* 작은 확도 띠 — 확도색 글자 한 자(예·고·확) 버튼(28px, WCAG 2.5.8 최소 24px 이상)만. 색만으로
          상태를 전하지 않도록 radiogroup/radio 시맨틱과 aria-label(확도 이름·단축키)을 둔다. */}
      <div className="flex items-center gap-0.5" role="radiogroup" aria-label="확도">
        {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
          const active = option.id === confidence
          const key = option.id === "expected" ? "E" : option.id === "high-confidence" ? "H" : "C"
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`확도 ${option.label} (${key})`}
              title={`${option.label} · ${key}`}
              onClick={() => onPickConfidence(option.id)}
              className={`grid h-7 w-7 place-items-center rounded text-[12px] font-bold transition ${CONFIDENCE_TOKENS[option.id].textStrongClass} ${active ? "ring-1 ring-current" : "opacity-60 hover:opacity-100"}`}
              style={active ? { backgroundColor: CONFIDENCE_TOKENS[option.id].tintBg } : undefined}
            >
              {option.label.slice(0, 1)}
            </button>
          )
        })}
      </div>
      {/* 편집 진입 시 셀 인근 단축키 힌트 — 치트시트가 안 보이는 좁은 화면에서도 조작법이 손끝에 남게. */}
      <p className="px-1 pb-0.5 text-left text-[9px] font-semibold leading-none text-[#A39E98]">
        ↵ 저장 · Esc · E/H/C
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
  lockKind = null,
  pending = null,
  // 대기 초안이 적용되면 될 그 달 금액(F-19 — 같은 종류 초안만, buildRevMatrixEditContext.pendingTotalOf). null 이면 대기 금액 없음.
  pendingTotal = null,
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
  lockKind?: MatrixCellLockKind | null
  pending?: MatrixPendingDraft | null
  pendingTotal?: number | null
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
  // 대기 중(F-19)이면 '미입력' 대신 대기 금액과 지금 장부 값을 말한다. 환불 달은 합계에 부호를 붙이고 '환불 — 시트 값'.
  const baseTitle =
    pendingTotal != null
      ? `대기 중 변경 ${exactYen(pendingTotal)} (지금 장부 ${exactYen(bucket.total)})`
      : bucket.total !== 0
        ? `합계 ${formatMoney(bucket.total)} · 확정 ${formatMoney(bucket.confirmed)} · 고확도 ${formatMoney(bucket.high)} · 예정 ${formatMoney(bucket.open)}${mismatch ? " · 주차·월 불일치(허용오차 ±¥1)" : ""}`
        : "미입력"
  const title = locked
    ? lockKind === "refund"
      ? `${baseTitle} · ${REFUND_CELL_LABEL}`
      : `${baseTitle} · 🔒 ${lockLabel} 값이라 잠금(실수 방지) — 수정은 우측 패널에서 정정 초안으로`
    : pending && pendingTotal == null
      ? `${baseTitle} · 미검수 초안 ${formatMoney(pending.amount)} (${confidenceLabel(pending.confidence)})`
      : editable
        ? `${baseTitle} · 클릭·Enter로 편집`
        : baseTitle
  // 칸에 보이는 금액 — 대기 금액이 있으면 그것(대기 스타일), 아니면 그 달 합계(부호 그대로).
  const shown = pendingTotal ?? bucket.total

  // 편집 진입 셀: input + 확도 팝오버.
  if (isEditingCell && interactive) {
    return (
      <td
        className={`relative px-0.5 text-right align-middle ${mismatch ? "bg-[#F1EFEA]" : bgClass} ring-2 ring-inset ring-[#084734]/40`}
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
          aria-label={`${formatMonthLabel(month!)} 금액(원 단위) · 확도 ${confidenceLabel(editConfidence)}`}
          // UX 감사 2026-09-20: 편집 중 확도를 바꿔도 input이 무색이라 "골랐는데 확인할 길이 없다" —
          // 테두리를 현재 확도색으로 즉시 반영한다(색만으로 답하지 않도록 aria-label도 함께 보강).
          className="h-6 w-full rounded-sm border-2 bg-transparent px-1 text-right text-[11px] font-bold tabular-nums text-[#111110] outline-none"
          style={{ borderColor: CONFIDENCE_TOKENS[editConfidence].color }}
        />
        <RevMatrixEditPopover confidence={editConfidence} onPickConfidence={actions!.setEditConfidence} />
      </td>
    )
  }

  // 전액 확정(입금 끝) 칸만 확정 틴트 배경 — 장부 렌즈와 같은 규칙. 색은 CONFIDENCE_TOKENS.confirmed.tintBg SSOT.
  // 불일치(빨강)·미검수 초안은 운영상 더 급한 신호라 틴트보다 우선한다.
  const settled = !mismatch && !pending && tone === "confirmed"
  const bg = mismatch ? "bg-[#F1EFEA]" : settled ? "" : bgClass
  const cellClassName = `relative px-2 py-1.5 text-right align-middle tabular-nums border-l border-[#EDECE8] ${
    mismatch
      ? "border-l-2 border-l-[#EF4444]"
      : periodHighlighted
        ? "border-l-2 border-l-[#084734]/30"
        : ""
  } ${bg} ${interactive && editable ? "cursor-cell" : ""} ${
    selected ? "ring-2 ring-inset ring-[#084734] z-10 shadow-[0_0_0_1px_#084734]" : ""
  } focus-visible:outline-none transition-colors`

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
      style={{
        width: MATRIX_MONTH_W,
        minWidth: MATRIX_MONTH_W,
        maxWidth: MATRIX_MONTH_W,
        ...(settled ? { backgroundColor: CONFIDENCE_TOKENS.confirmed.tintBg } : {}),
        // 미검수 밑줄도 확도별 색 — 확도 무관 앰버 고정(UX 감사 2026-09-20)이던 것을 CONFIDENCE_TOKENS로.
        ...(pending ? { boxShadow: `inset 0 -2px 0 0 ${CONFIDENCE_TOKENS[pending.confidence].color}` } : {}),
      }}
      {...interactiveHandlers}
    >
      {pending && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: CONFIDENCE_TOKENS[pending.confidence].color }}
        />
      )}
      {shown !== 0 || pendingTotal != null ? (
        <div className="flex items-center justify-between w-full leading-none">
          <span className="text-[9.5px] font-medium text-[#A39E98] select-none pl-0.5">¥</span>
          <span
            className={`inline-flex items-center gap-1 tabular-nums text-[11.5px] ${
              pending ? `font-bold ${CONFIDENCE_TOKENS[pending.confidence].textStrongClass}` : MATRIX_TONE[tone]
            }`}
          >
            {locked && lockKind !== "refund" && <Lock className="h-2.5 w-2.5 shrink-0 text-[#9CA3AF]" aria-label={lockLabel} />}
            {mismatch && !locked && <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-[#EF4444]" />}
            {formatWeekAmount(shown)}
          </span>
        </div>
      ) : (
        <span className={`text-[11px] leading-none select-none ${editable ? "text-[#D1D5DB]" : MATRIX_TONE.empty}`}>·</span>
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
  // 장부 건별 시트(ledger/LedgerSheet.tsx, 2026-11-23): 28px 행에 맞춘 좁은 칸. 값 있는 칸은 그 칸의 확도
  // (sheetConfidence)로 글자색 + 옅은 바탕(CONFIDENCE_TOKENS 틴트)을 칠하고, 빈 칸은 점 없이 비운다.
  // 선택·편집·잠금·대기 표시와 키보드 조작은 매트릭스 칸 그대로다. 기본값이면 기존 매트릭스 렌더와 같다.
  compact = false,
  sheetConfidence = null,
  // 시트에서 이 열에 필터가 걸렸다(필터 기획 D-1) — 빈 칸만 옅은 초록 세로 띠, 값 칸은 확도 바탕을 그대로 둔다.
  sheetBand = false,
  // 시트 음수(환불·차감, ≤ 0) — 부호를 붙인 중립색으로 보이고 고치지 않는다(D2 '환불 — 시트 값').
  refund = 0,
  // 그 달에 없는 주차(2월 W5, F-31) — 비활성 칸(포커스·편집 없음).
  absent = false,
  // 잠긴 까닭(matrixCellLockKind) — 정정 대체 · 환불 달은 빈 칸까지 잠기고 툴팁이 그 까닭을 말한다.
  lockKind = null,
  // 대기 초안이 이 칸을 바꾸면 그 금액(F-19) — 칸이 대기 스타일(확도색 밑줄·점·굵은 확도색 글자)로 이 금액을 보인다.
  pendingAmount = null,
  // 대기 금액의 확도(밑줄·점 색). 없으면 pending 초안의 그 주차 확도.
  pendingAmountConfidence = null,
  // 툴팁을 부르는 쪽이 정했으면(시트 보기 sheetWeekCellsForRender) 그대로 쓴다.
  titleOverride,
  // 이 칸 저장이 서버 응답을 기다리는 중(F-05) — aria-busy · '저장 중…' 툴팁 · 옅은 글자.
  saving = false,
}: {
  display: number
  isMonthOnly: boolean
  inferred: boolean
  weekIndex: number
  bgClass: string
  compact?: boolean
  sheetConfidence?: DraftConfidence | null
  sheetBand?: boolean
  refund?: number
  absent?: boolean
  lockKind?: MatrixCellLockKind | null
  pendingAmount?: number | null
  pendingAmountConfidence?: DraftConfidence | null
  titleOverride?: string
  saving?: boolean
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
  const interactive = Boolean(actions && month && rowId) && !absent
  const cellRef = useRef<HTMLTableCellElement | null>(null)
  useEffect(() => {
    if (interactive && editable && selected && !isEditingCell) cellRef.current?.focus()
  }, [interactive, editable, selected, isEditingCell])

  const cellWidth = compact ? SHEET_WEEK_W : MATRIX_WEEK_W
  const confidenceLabel = (v: DraftConfidence) => DRAFT_CONFIDENCE_OPTIONS.find((option) => option.id === v)?.label ?? v
  const label = `W${weekIndex + 1}`
  // 지금 장부 값(보이는 양수 + 환불) — 대기 표시 툴팁의 '지금 장부'.
  const current = display + refund
  // 시트 칸은 글자를 줄이거나 끝을 자를 수 있어 툴팁에 원 단위 전체 금액을 싣는다(매트릭스는 만 단위 요약 그대로).
  const baseTitle = absent
    ? `${label} · ${month ? `${Number(month.slice(5, 7))}월은 ` : ""}시트에 W${month ? ledgerMonthWeekCount(month) : 4}까지만 있습니다`
    : pendingAmount != null
      ? `${label} 대기 중 변경 ${exactYen(pendingAmount)} (지금 장부 ${exactYen(current)})`
      : display > 0
        ? `${label} ${compact ? exactYen(display) : formatMoney(display)}${compact && sheetConfidence ? ` · ${confidenceLabel(sheetConfidence)}` : ""}${isMonthOnly ? " · 월합계만" : ""}`
        : refund < 0
          ? `${label} ${compact ? exactYen(refund) : formatMoney(refund)}${isMonthOnly ? " · 월합계만" : ""}`
          : `${label} 미입력`
  const restingTitle = titleOverride
    ? titleOverride
    : absent
      ? baseTitle
      : lockKind === "refund" || (refund < 0 && !editable)
        ? `${baseTitle} · ${REFUND_CELL_LABEL}`
        : lockKind === "corrected" && !editable
          ? `${baseTitle} · 장부 정정으로 대체된 달이라 잠금 — 정정 행에서 확인합니다`
          : locked
            ? `${baseTitle} · 🔒 ${lockLabel} 값이라 잠금(실수 방지) — 수정은 우측 패널에서 정정 초안으로`
            : pending && pendingAmount == null
              ? `${baseTitle} · 미검수 초안 ${formatMoney(pendingCellAmount(pending, weekIndex))} (${confidenceLabel(pending.confidence)})`
              : editable
                ? `${baseTitle} · 클릭·Enter로 편집`
                : baseTitle
  const title = saving ? `저장 중… · ${restingTitle}` : restingTitle

  // 편집 진입: input + 확도 팝오버. 폭 34px라 px 여백 없이 칸을 꽉 채운다.
  if (isEditingCell && interactive) {
    return (
      <td
        className={`relative px-0 text-right align-middle ${bgClass} ring-2 ring-inset ring-[#084734]/40`}
        style={{ width: cellWidth, minWidth: cellWidth, maxWidth: cellWidth }}
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
          aria-label={`${formatMonthLabel(month!)} W${weekIndex + 1} 금액(원 단위) · 확도 ${confidenceLabel(editConfidence)}`}
          // UX 감사 2026-09-20: 월 셀과 동일 — 편집 중 확도 변경이 즉시 테두리색으로 보이게 한다.
          className="h-6 w-full rounded-sm border-2 bg-transparent px-1 text-right text-[11.5px] font-bold tabular-nums text-[#111110] outline-none"
          style={{ borderColor: CONFIDENCE_TOKENS[editConfidence].color }}
        />
        <RevMatrixEditPopover
          confidence={editConfidence}
          onPickConfidence={actions!.setEditConfidence}
          warning={editWarning}
        />
      </td>
    )
  }

  // 미검수 표시(점·텍스트·밑줄)는 확도별 색 — 주차 슬롯(metadata.weeklyConfidence)이 있으면 그 값을
  // 우선한다(월 우세 확도로 뭉개면 같은 달 안 다른 주차의 확도가 묻힌다 — UX 감사 2026-09-20).
  const pendingConfidence = pendingAmount != null && pendingAmountConfidence
    ? pendingAmountConfidence
    : pending
      ? pending.weeklyConfidence?.[weekIndex] ?? pending.confidence
      : null
  // 칸에 보이는 금액 — 대기 금액(F-19) → 양수 표시 → 환불(음수) 순.
  const shown = pendingAmount ?? (display > 0 ? display : refund < 0 ? refund : 0)
  const refundShown = pendingAmount == null && display <= 0 && refund < 0

  const cellClassName = `relative ${compact ? "h-7 overflow-hidden border-b border-b-[#F0F0EC] px-1 py-0" : "px-1 py-1.5"} text-right align-middle tabular-nums border-l border-[#EDECE8] ${
    periodHighlighted ? "border-l-2 border-l-[#084734]/30" : ""
  } ${absent ? "bg-[#F6F5F4]" : compact && sheetBand && shown === 0 ? "bg-[#ECFDF5]" : bgClass} ${
    interactive && editable ? "cursor-cell" : ""
  } ${selected ? "ring-2 ring-inset ring-[#084734] z-10 shadow-[0_0_0_1px_#084734]" : ""} ${saving ? "opacity-60" : ""} focus-visible:outline-none transition-colors`

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

  // 대기 금액이 있는 칸 — 밑줄·점에 더해 점선 테두리(기관별 보기와 같은 대기 표시)로 "아직 장부에 안 들어간 값"임을 보인다.
  const pendingStyle = pendingAmount != null && pendingConfidence
    ? { boxShadow: `inset 0 -2px 0 0 ${CONFIDENCE_TOKENS[pendingConfidence].color}`, outline: `1px dashed ${CONFIDENCE_TOKENS[pendingConfidence].color}`, outlineOffset: "-3px" }
    : pendingConfidence
      ? { boxShadow: `inset 0 -2px 0 0 ${CONFIDENCE_TOKENS[pendingConfidence].color}` }
      : {}

  return (
    <td
      ref={cellRef}
      title={title}
      aria-label={interactive || absent ? title : undefined}
      aria-disabled={absent || undefined}
      aria-busy={saving || undefined}
      className={cellClassName}
      style={{
        width: cellWidth,
        minWidth: cellWidth,
        maxWidth: cellWidth,
        // 시트 칸: 값 있는 칸의 옅은 바탕 = 그 칸 확도의 틴트(토큰 값 그대로). 대기 중인 칸은 밑줄·점이 우선이라 칠하지 않는다.
        ...(compact && sheetConfidence && display > 0 && !pendingConfidence ? { backgroundColor: CONFIDENCE_TOKENS[sheetConfidence].tintBg } : {}),
        ...pendingStyle,
      }}
      {...interactiveHandlers}
    >
      {pendingConfidence && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: CONFIDENCE_TOKENS[pendingConfidence].color }}
        />
      )}
      {absent ? null : (shown !== 0 || pendingAmount != null) && compact ? (
        // 앞자리가 잘리지 않게(필터 기획 F1): 예전 inline-flex + justify-end 는 넘친 앞자리를 칸 왼쪽 밖으로 밀었다.
        // 블록 글자는 넘치면 왼쪽부터 놓이고 끝이 줄임표가 된다 — 그 전에 자릿수에 맞춰 글자를 한 단계씩 줄인다.
        <span
          className={`block truncate leading-none ${sheetAmountFontClass(formatWeekAmount(shown), SHEET_WEEK_TEXT_W)} ${
            pendingAmount != null && pendingConfidence
              ? `font-bold ${CONFIDENCE_TOKENS[pendingConfidence].textStrongClass}`
              : refundShown
                ? MATRIX_TONE.refund
                : pendingConfidence
                  ? `font-bold ${CONFIDENCE_TOKENS[pendingConfidence].textStrongClass}`
                  : sheetConfidence
                    ? `${sheetConfidence === "expected" ? "font-medium" : sheetConfidence === "confirmed" ? "font-bold" : "font-semibold"} ${CONFIDENCE_TOKENS[sheetConfidence].textStrongClass}`
                    : "font-medium text-[#31302E]"
          }`}
        >
          {/* 시트 칸에는 칸마다 자물쇠를 찍지 않는다(확정 칸 대부분이 잠겨 있어 소음) — 잠금 사유는 툴팁에, 행 전체 잠금은 고객명 옆 자물쇠에 있다. */}
          {formatWeekAmount(shown)}
        </span>
      ) : shown !== 0 || pendingAmount != null ? (
        <div className="flex items-center justify-between w-full leading-none">
          <span className="text-[9.5px] font-medium text-[#A39E98] select-none pl-0.5">¥</span>
          <span
            className={`inline-flex items-center gap-0.5 tabular-nums text-[11.5px] ${
              pendingConfidence
                ? `font-bold ${CONFIDENCE_TOKENS[pendingConfidence].textStrongClass}`
                : refundShown
                  ? MATRIX_TONE.refund
                  : isMonthOnly
                    ? "font-semibold text-[#7A520F]"
                    : inferred
                      ? "font-semibold text-[#6B7280]"
                      : "font-bold text-[#111827]"
            }`}
          >
            {locked && !refundShown && pendingAmount == null && <Lock className="h-2.5 w-2.5 shrink-0 text-[#9CA3AF]" aria-label={lockLabel} />}
            {formatWeekAmount(shown)}
          </span>
        </div>
      ) : compact ? null : (
        <span className="select-none text-[#D1D5DB]">·</span>
      )}
    </td>
  )
})

// computeWeekCellStates/weeklyEditLockMask는 ledger/rev-matrix-logic.ts로 이동(로직 무변경) —
// RevMatrixWeekCells가 위 named import로 그대로 호출한다.

/**
 * 시트 보기(ledger/LedgerSheet)가 칸마다 미리 정한 주차 칸(ledger-sheet-logic sheetWeekCellsForRender 의 모양과 같다) —
 * 넘기면 RevMatrixWeekCells 가 보이는 값·환불·없는 주차·편집 가능·대기 금액·툴팁을 그대로 쓴다.
 */
export interface RevMatrixSheetCell {
  /** 보이는 양수 금액(월합계만은 마지막 주차). */
  display: number
  isMonthOnly: boolean
  /** 값 있는 칸의 확도(표시) — 합계가 0 이하인 달은 null. */
  confidence: DraftConfidence | null
  /** 시트 음수(환불) — 0 이하. */
  refund: number
  /** 그 달에 없는 주차(2월 W5). */
  absent: boolean
  /** 장부에서 고칠 수 있는 칸. */
  editable: boolean
  /** 대기 초안이 이 칸을 바꾸면 그 금액. */
  pendingAmount: number | null
  pendingConfidence: DraftConfidence | null
  /** 툴팁 · aria-label. */
  title: string
}

// 확장된 월의 w1~w5 5칸. editContext가 오면(딜행·비잠금월) 각 칸이 편집 셀이 된다.
// month-only 행은 마지막 주차(W5, 2월은 W4)에 월합계를 얹어 시트 검수 감각을 유지(기존 읽기전용 규약 계승).
// 2026-11-25(시트 고정 전):
//  - 정정이 대체한 달(F-04) · 환불 달(D2)은 빈 칸까지 전부 잠근다(editContext.lockKindOf). 확정으로 잠긴 달은 예전처럼 값 있는
//    칸만 잠그고 빈 칸은 열어 둔다(2026-07-20 회귀 방지 — editableOf 로 5칸을 통째로 잠그지 않는다).
//  - 시트 음수 주차는 부호를 붙인 중립색으로 보이고 고치지 않는다('환불 — 시트 값').
//  - 그 달에 없는 주차(2월 W5, F-31)는 비활성 칸이다.
//  - 대기 초안이 칸 값을 바꾸면 그 금액을 대기 스타일로 보인다(F-19 — editContext.weekPendingAmountsOf).
export function RevMatrixWeekCells({
  weeks,
  inferred,
  monthOnlyAmount,
  bgClass,
  month,
  editContext = null,
  periodHighlighted = false,
  compact = false,
  sheetConfidences = null,
  sheetBands = null,
  sheetCells = null,
}: {
  weeks: number[]
  inferred: boolean
  monthOnlyAmount: number
  bgClass: string
  month?: string
  editContext?: RevMatrixEditContext | null
  periodHighlighted?: boolean
  /** 장부 건별 시트 전용(RevMatrixWeekCell 주석 참조). */
  compact?: boolean
  sheetConfidences?: Array<DraftConfidence | null> | null
  /** 장부 건별 시트 전용 — 주차별로 그 열에 필터가 걸렸는지(빈 칸 띠). */
  sheetBands?: ReadonlyArray<boolean> | null
  /** 장부 건별 시트 전용 — 칸마다 미리 정한 표시(RevMatrixSheetCell). 주면 weeks·monthOnlyAmount·sheetConfidences 대신 이것을 쓴다. */
  sheetCells?: ReadonlyArray<RevMatrixSheetCell> | null
}) {
  const monthKey = month ?? ""
  // 월 단위 잠금은 주차 인덱스와 무관(monthLockedOf) — 한 번만 조회해 순수 함수에 넘긴다.
  // 칸별 잠금(빈 칸은 열림)·표시 금액은 computeWeekCellStates가 결정한다(회귀 테스트가 검증하는 그 함수).
  const monthLocked = editContext ? editContext.monthLockedOf(monthKey) : true
  const lockKind = editContext ? editContext.lockKindOf(monthKey) : null
  const wholeMonthLocked = isWholeMonthLock(lockKind)
  const weekCount = month ? ledgerMonthWeekCount(month) : 5
  const cellStates = computeWeekCellStates(weeks, monthOnlyAmount, monthLocked, weekCount)
  // 대기 금액(F-19) — 지금 칸 값(보이는 양수 + 환불)과 다를 때만.
  const pendingAmounts = !sheetCells && editContext
    ? editContext.weekPendingAmountsOf(monthKey, cellStates.map((state) => state.display + (state.refund ?? 0)))
    : null
  const cells: React.ReactNode[] = []
  for (let index = 0; index < 5; index += 1) {
    const sheetCell = sheetCells?.[index] ?? null
    const state = cellStates[index]
    const display = sheetCell ? sheetCell.display : state.display
    const isMonthOnly = sheetCell ? sheetCell.isMonthOnly : state.isMonthOnly
    const refund = sheetCell ? sheetCell.refund : state.refund ?? 0
    const absent = sheetCell ? sheetCell.absent : state.absent ?? false
    const cellLocked = sheetCell ? !sheetCell.editable : state.locked || wholeMonthLocked
    // 잠금 "표시"(🔒 아이콘·"시트 확정 잠금" 툴팁)는 편집 가능한 딜행에만 — 읽기전용 경로(카테고리
    // 합산행 등, editContext 없음)는 애초에 편집 대상이 아니라 잠금 신호가 오표기가 된다(9e8f1fc5
    // 순수 함수화 때 `: false`였던 읽기전용 분기가 `: true` 폴백으로 바뀌며 합산 주차칸마다 🔒가
    // 찍히던 회귀 — 리팩터 이전 렌더로 복원).
    const weekLocked = Boolean(editContext) && cellLocked && !absent
    const weekEditable = Boolean(editContext) && !cellLocked && !absent
    const pendingWeek = sheetCell
      ? (sheetCell.pendingAmount != null ? { amount: sheetCell.pendingAmount, confidence: sheetCell.pendingConfidence } : null)
      : pendingAmounts?.[index] ?? null
    // 선택/편집은 이 칸 기준으로 계산해 원시값으로 내린다 — 비선택·비편집 칸은 memo 스킵.
    const weekSelected = Boolean(editContext) && editContext!.isSelectedCell(monthKey, index)
    const weekEditing = Boolean(editContext) && weekEditable && editContext!.isEditingCell(monthKey, index)
    cells.push(
      <RevMatrixWeekCell
        key={index}
        display={display}
        isMonthOnly={isMonthOnly}
        inferred={inferred}
        weekIndex={index}
        bgClass={bgClass}
        month={editContext || absent ? month : undefined}
        rowId={editContext?.rowId}
        editable={weekEditable}
        locked={weekLocked}
        lockLabel={editContext ? editContext.lockLabelOf(monthKey) : undefined}
        lockKind={lockKind}
        editWarning={editContext ? editContext.weekEditNotice(monthKey) : undefined}
        pending={editContext ? editContext.weekPendingOf(monthKey, index) : null}
        pendingAmount={pendingWeek?.amount ?? null}
        pendingAmountConfidence={pendingWeek?.confidence ?? null}
        actions={editContext?.actions ?? null}
        selected={weekSelected}
        isEditingCell={weekEditing}
        editBuffer={weekEditing ? editContext!.editBuffer : ""}
        editConfidence={weekEditing ? editContext!.editConfidence : "expected"}
        periodHighlighted={periodHighlighted}
        compact={compact}
        sheetConfidence={sheetCell ? sheetCell.confidence : sheetConfidences?.[index] ?? null}
        sheetBand={sheetBands?.[index] ?? false}
        refund={refund}
        absent={absent}
        titleOverride={sheetCell?.title}
        saving={Boolean(editContext?.savingOf?.(monthKey, index))}
      />,
    )
  }
  return <>{cells}</>
}

/** 칸 대기 금액 한 칸(F-19) — 대기 초안이 적용되면 그 칸에 들어갈 금액과 그 확도. */
export interface RevMatrixPendingAmount {
  amount: number
  confidence: DraftConfidence | null
}

// 딜행 스트립에만 주입되는 편집 컨텍스트. 그룹 소계행은 이 값을 넘기지 않아 읽기전용 유지.
// 선택/편집 상태는 이 행 스코프로 좁혀(selected/editing 좌표가 이 행일 때만 non-null) 내려온다 —
// 각 셀의 선택·편집 여부는 스트립이 여기서 계산해 memo 셀에 원시 boolean으로 전달한다.
export interface RevMatrixEditContext {
  rowId: string
  actions: MatrixEditorActions // identity 안정 — 셀 핸들러(선택/편집 시작/커밋/버퍼)용
  isSelectedCell: (month: string, week?: number) => boolean // 이 행 기준 셀 선택 판정
  isEditingCell: (month: string, week?: number) => boolean // 이 행 기준 셀 편집 판정
  editBuffer: string // 편집 중 버퍼 값(편집 셀에만 의미)
  editConfidence: DraftConfidence // 편집 중 확도(편집 셀에만 의미)
  // 잠금 아이콘·툴팁 라벨(월별) — 시트 원천은 "시트 확정", 적용 초안은 "장부 반영", 정정 적용으로
  // 재잠긴 원본 달은 "장부 반영(정정)"(품질 웨이브 4 — 항목 1: 정정이 셀을 지운 게 아니라 대체했음을
  // 구분해 보여준다 — 재편집을 시도하면 우측 패널 정정 초안으로 유도), 환불 달은 "환불 — 시트 값".
  lockLabelOf: (month: string) => string
  /** 잠긴 까닭(matrixCellLockKind) — 정정 대체 · 환불 달은 주차 칸 전부 잠금. 잠기지 않았으면 null. */
  lockKindOf: (month: string) => MatrixCellLockKind | null
  editableOf: (month: string) => boolean
  lockedOf: (month: string) => boolean
  pendingOf: (month: string) => MatrixPendingDraft | null
  /**
   * 대기 초안이 적용되면 될 그 달 금액(F-19) — 이 행 커밋과 같은 종류 초안만(고객 이름으로만 걸린 신규 초안은 시트 행 금액처럼
   * 보이지 않는다). 수정 초안은 그 달을 대체, 장부 행의 칸에 건 신규 초안은 더한다. 없으면 null.
   */
  pendingTotalOf: (month: string, current: number) => number | null
  // 주차(확장월) 칸의 월 단위 잠금 판정. 시트 확정/장부반영 등으로 그 "달"이 잠겼는지만 본다 —
  // 개별 주차 칸의 잠금(확정액이 찍힌 칸만 잠그고 빈 칸은 열기)은 computeWeekCellStates가 결정하므로
  // week 인자를 받지 않는다(이전 weekLockedOf(month, week)는 week를 무시해 5칸을 통째로 잠그는 함정이었다).
  monthLockedOf: (month: string) => boolean
  weekPendingOf: (month: string, week: number) => MatrixPendingDraft | null
  /** 주차 5칸의 대기 금액(F-19) — currents(지금 칸 값 5칸)와 다른 칸만. ledger-sheet-logic sheetBlockPending 과 같은 규칙. */
  weekPendingAmountsOf: (month: string, currents: readonly number[]) => Array<RevMatrixPendingAmount | null>
  // 주차 셀 편집 팝오버 고지문 — explicit 행(주차 병합 보존) vs 그 외(월 전체 대체) 구분.
  weekEditNotice: (month: string) => string | undefined
  /** 이 행의 그 주차 칸 저장이 서버 응답을 기다리는 중(F-05, 워크벤치 savingCellsByRow). 없으면 늘 아님. */
  savingOf?: (month: string, week: number) => boolean
}

/**
 * 행 × 달의 주차 대기 금액(F-19) — 순수 함수. 칸 편집과 같은 종류 판정(rowCommitKind · pendingMatchesKind).
 *  - 주차 키 초안(`행::달::wN`): 그 칸 = pendingCellAmount(주차 병합이면 그 주차 값, 아니면 초안 금액).
 *  - 월 키 초안에 주차 병합(weekly)이 있으면 지금 칸 값과 다른 주차만 대기 금액으로 보인다(바뀌지 않은 칸까지 칠하지 않는다).
 *  - 그 달에 없는 주차(2월 W5)는 늘 null.
 */
export function matrixWeekPendingAmounts(
  row: Pick<LedgerRevenueRow, "id" | "sourceDealId" | "ledgerOrigin">,
  month: string,
  currents: readonly number[],
  pendingByCell: ReadonlyMap<string, MatrixPendingDraft> | null | undefined,
): Array<RevMatrixPendingAmount | null> {
  const out: Array<RevMatrixPendingAmount | null> = [null, null, null, null, null]
  if (!pendingByCell || pendingByCell.size === 0) return out
  const kind = rowCommitKind(row)
  const accept = (pending: MatrixPendingDraft | undefined) => (pending && pendingMatchesKind(pending, kind) ? pending : null)
  const monthPending = accept(pendingByCell.get(matrixCoordKey({ rowId: row.id, month })))
  const weekCount = ledgerMonthWeekCount(month)
  for (let week = 0; week < weekCount; week += 1) {
    const own = accept(pendingByCell.get(matrixCoordKey({ rowId: row.id, month, week })))
    if (own) {
      out[week] = { amount: pendingCellAmount(own, week), confidence: own.weeklyConfidence?.[week] ?? own.confidence }
      continue
    }
    if (monthPending?.weekly) {
      const value = monthPending.weekly[week] ?? 0
      if (Math.abs(value - (currents[week] ?? 0)) > 0.5) {
        out[week] = { amount: value, confidence: monthPending.weeklyConfidence?.[week] ?? monthPending.confidence }
      }
    }
  }
  return out
}

/** 행 × 달의 대기 금액(그 달 계) — 수정 초안은 대체, 장부 행의 신규 초안은 더한다. 같은 종류 초안이 없으면 null. */
export function matrixMonthPendingTotal(
  row: Pick<LedgerRevenueRow, "id" | "sourceDealId" | "ledgerOrigin">,
  month: string,
  current: number,
  pendingByCell: ReadonlyMap<string, MatrixPendingDraft> | null | undefined,
): number | null {
  if (!pendingByCell || pendingByCell.size === 0) return null
  const kind = rowCommitKind(row)
  const pending = pendingByCell.get(matrixCoordKey({ rowId: row.id, month }))
  if (!pending || !pendingMatchesKind(pending, kind)) return null
  return kind === "new-row" ? current + pending.amount : pending.amount
}

// 딜행의 편집 컨텍스트 조립 — 매트릭스 딜행(RevMatrixDealRow)과 장부 건별 시트 행(ledger/LedgerSheet.tsx)이
// 같은 잠금·대기·고지 규약을 쓰도록 한 곳에 둔다(로직은 RevMatrixDealRow 에 있던 그대로다).
// isSelectedCell/isEditingCell는 행 스코프 좌표(selectedCoord/editingCoord)와 month·week를 비교한다 —
// 원 isSelected/isEditing 규약과 동일(행 rowId 일치는 좌표가 이미 이 행일 때만 non-null이라 내포).
export function buildRevMatrixEditContext({
  row,
  correctedMonths,
  actions,
  selectedCoord,
  editingCoord,
  editBuffer,
  editConfidence,
  pendingByCell,
  savingCells = null,
}: {
  row: LedgerRevenueRow
  correctedMonths?: Set<string> | null
  actions: MatrixEditorActions
  selectedCoord: MatrixCellCoord | null
  editingCoord: MatrixCellCoord | null
  editBuffer: string
  editConfidence: DraftConfidence
  pendingByCell: Map<string, MatrixPendingDraft> | null
  /** 이 행의 "저장 중" 칸(cellSavingKey — ledger-cell-flight.ts). 없으면 저장 중 칸 없음. */
  savingCells?: ReadonlySet<string> | null
}): RevMatrixEditContext {
  const lockKindOf = (month: string) => matrixCellLockKind(row, month, correctedMonths)
  return {
    rowId: row.id,
    actions,
    isSelectedCell: (month, week) =>
      selectedCoord != null && selectedCoord.month === month && (selectedCoord.week ?? -1) === (week ?? -1),
    isEditingCell: (month, week) =>
      editingCoord != null && editingCoord.month === month && (editingCoord.week ?? -1) === (week ?? -1),
    editBuffer,
    editConfidence,
    // 품질 웨이브 4 — 항목 1: 정정으로 재잠긴 달만 "장부 반영(정정)"으로 구분 — 나머지는 기존 규약.
    lockLabelOf: (month) => {
      const kind = lockKindOf(month)
      if (kind === "corrected") return "장부 반영(정정)"
      if (kind === "refund") return REFUND_CELL_LABEL
      return row.ledgerOrigin === "draft" ? "장부 반영" : "시트 확정"
    },
    lockKindOf,
    editableOf: (month) => isMatrixCellEditable(row, month, correctedMonths),
    lockedOf: (month) => isMatrixCellLocked(row, month, correctedMonths),
    pendingOf: (month) => pendingByCell?.get(`${row.id}::${month}`) ?? null,
    pendingTotalOf: (month, current) => matrixMonthPendingTotal(row, month, current, pendingByCell),
    // 월 단위 잠금 = 그 달 시트 확정 여부. 칸별 잠금은 computeWeekCellStates가 display>0로 좁힌다.
    // 주차 pending = `rowId::month::wN` 키.
    monthLockedOf: (month) => isMatrixCellLocked(row, month, correctedMonths),
    weekPendingOf: (month, week) => pendingByCell?.get(`${row.id}::${month}::w${week + 1}`) ?? null,
    weekPendingAmountsOf: (month, currents) => matrixWeekPendingAmounts(row, month, currents, pendingByCell),
    // 같은 달에 대기 초안이 있으면 그 초안의 주차 위에 얹는다(mergeWeekCellCommit, F-02) — 시트 주차가 있으면 지킨다.
    // 시트 주차가 없는 달(일자 추정 · 월합계만)은 그 달이 주차 합으로 바뀐다. 빈 달은 대체할 것이 없어 알리지 않는다.
    weekEditNotice: (month) => {
      const kind = rowCommitKind(row)
      const pending = pendingByCell?.get(`${row.id}::${month}`)
      if (pending && pendingMatchesKind(pending, kind)) {
        return pending.weekly || pending.week != null
          ? "같은 달 대기 초안의 다른 주차는 그대로 두고 이 주차를 바꿉니다 (월 금액 = 주차 합)"
          : "같은 달 대기 초안(월 금액)이 주차 합으로 바뀝니다"
      }
      const split = rowWeeklySplit(row, month)
      if (split.source === "explicit") return "커밋 시 이 달 금액이 주차 합계로 재기재됩니다 (기존 주차 병합 보존)"
      if (split.source === "empty") return undefined
      return "적용 시 이 달 전체가 이 값으로 대체됩니다 (주차 분해 없음)"
    },
    ...(savingCells && savingCells.size > 0 ? { savingOf: (month: string, week: number) => savingCells.has(cellSavingKey(month, week)) } : {}),
  }
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
  periodMonths,
  h1Expanded = false,
}: {
  monthlyByRowOrGroup: Record<string, RevMonthlyBucket>
  weeklyByMonth: (month: string) => { weeks: number[]; inferred: boolean; monthOnlyAmount: number; mismatch: boolean } | null
  months: string[]
  expandedMonths: Set<string>
  bgClass: string
  editContext?: RevMatrixEditContext | null
  periodMonths?: Set<string>
  h1Expanded?: boolean
}) {
  const isH1Month = (m: string) => {
    const mon = m.slice(5, 7)
    return mon >= "04" && mon <= "09"
  }
  const h1Months = months.filter(isH1Month)
  const displayMonths = h1Expanded ? months : months.filter((m) => !isH1Month(m))

  const h1Bucket = emptyMonthlyBucket()
  if (!h1Expanded && h1Months.length > 0) {
    for (const m of h1Months) {
      const b = monthlyByRowOrGroup[m]
      if (b) addMonthlyBucket(h1Bucket, b)
    }
  }

  return (
    <>
      {!h1Expanded && h1Months.length > 0 && (
        <td
          key="h1-summary"
          title={`4~9월 종합 합계 ${formatMoney(h1Bucket.total)} · 확정 ${formatMoney(h1Bucket.confirmed)} · 고확도 ${formatMoney(h1Bucket.high)} · 예정 ${formatMoney(h1Bucket.open)}`}
          className={`relative px-1.5 py-1 text-right align-middle tabular-nums border-l border-[#F2F1EE] ${bgClass}`}
          style={{ width: 80, minWidth: 80, maxWidth: 80 }}
        >
          {h1Bucket.total !== 0 ? (
            <div className="flex items-center justify-between w-full leading-none">
              <span className="text-[9.5px] font-medium text-[#A39E98] select-none pl-0.5">¥</span>
              <span className={`text-[11.5px] font-bold tabular-nums ${MATRIX_TONE[matrixBucketTone(h1Bucket)]}`}>
                {formatWeekAmount(h1Bucket.total)}
              </span>
            </div>
          ) : (
            <span className={`text-[11px] leading-none ${MATRIX_TONE.empty}`}>·</span>
          )}
        </td>
      )}
      {displayMonths.map((month) => {
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
              {/* 확장 중에도 그 달 총액을 잃지 않도록 주차 5칸 뒤에 읽기전용 월계 셀을 유지한다 — 대기 초안이 있으면 적용되면 될 금액(F-19). */}
              <RevMatrixMonthCell
                bucket={bucket}
                mismatch={weekly?.mismatch ?? false}
                bgClass={bgClass}
                periodHighlighted={periodHighlighted}
                pending={editContext ? editContext.pendingOf(month) : null}
                pendingTotal={editContext ? editContext.pendingTotalOf(month, bucket.total) : null}
              />
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
            lockKind={editContext ? editContext.lockKindOf(month) : null}
            pending={editContext ? editContext.pendingOf(month) : null}
            pendingTotal={editContext ? editContext.pendingTotalOf(month, bucket.total) : null}
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
        className="inline-flex h-4 items-center gap-0.5 rounded px-1 text-[9px] font-semibold text-[#B45309] bg-[#FEF3C7] border border-[#FDE68A] hover:bg-[#FDE68A] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#084734]"
      >
        <Link2Off className="h-2.5 w-2.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">미연결</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${customer} CRM 연결 안내`}
          className="absolute left-0 top-full z-40 mt-1 w-64 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-3 text-left shadow-xl"
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#D97706]" />
            <p className="truncate text-[12px] font-bold text-[#111110]">{customer}</p>
          </div>
          <p className="mt-1.5 text-[10.5px] font-medium leading-relaxed text-[#615D59]">
            CRM 미연결 상태입니다. 매출과 영업 활동이 CRM 고객과 자동 연동되도록 연결할 수 있습니다.
          </p>
          <Link
            href={`/admin/crm/matching?name=${encodeURIComponent(customer)}`}
            className="mt-2.5 flex items-center justify-center rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-2.5 py-1.5 text-[11px] font-bold text-[#7A520F] transition hover:bg-[#ECD29C]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            매칭 인박스에서 연결하기 ↗
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
          : "inline-flex shrink-0 items-center rounded-full border border-[#084734]/15 bg-gradient-to-b from-[#F2FAF6] to-[#E6F5ED] px-1.5 text-[9px] font-bold leading-4 text-[#084734] shadow-2xs underline-offset-2 transition hover:bg-[#E2F4EB] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
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
  // 라운드 4 P1-5 — 새 행(unmatched) 승인 선택을 함께 실어 보낸다. 워크벤치의 confirmMatrixPaste가
  // buildPasteNewRowInputs(plan, newRowNames, context)로 넘겨 new-row 초안을 만든다(배선은 상위에서).
  onConfirm: (options: { newRowNames: string[] }) => void | Promise<void>
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
  // 라운드 4 P1-5 — "시트에 없는 고객" 체크박스 선택(다이얼로그 로컬 state, 기본 전부 해제 —
  // 승인한 것만 new-row 초안이 된다는 스펙). onConfirm 계약이 이름 배열(newRowNames)이라 이름을
  // 키로 관리한다 — 같은 이름이 plan.unmatched에 중복될 일은 실무상 없다(한 붙여넣기 안에서
  // 같은 신규 고객명이 두 줄로 나뉘어 오는 경우는 없다고 본다).
  const [selectedNewRowNames, setSelectedNewRowNames] = useState<Set<string>>(new Set())
  const toggleNewRowName = (name: string) => {
    setSelectedNewRowNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }
  const allNewRowsSelected = plan.unmatched.length > 0 && plan.unmatched.every((row) => selectedNewRowNames.has(row.name))
  const toggleAllNewRows = () => {
    setSelectedNewRowNames(allNewRowsSelected ? new Set() : new Set(plan.unmatched.map((row) => row.name)))
  }
  const confirmLabel = `초안 ${plan.applyCount.toLocaleString("ko-KR")}건 생성${
    selectedNewRowNames.size > 0 ? ` · 새 행 ${selectedNewRowNames.size.toLocaleString("ko-KR")}명` : ""
  }`
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="엑셀 붙여넣기 미리보기"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#111110]/40 p-4 sm:items-center"
    >
      <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_24px_70px_rgba(17,17,16,0.22)]">
        <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-bold text-[#111110]">엑셀 붙여넣기 미리보기</p>
            {/* 라운드 4 P1-5 — 모드 배지: 이름 매칭이면 매칭 행수까지, 위치 투영이면 기존 앵커 규칙 안내. */}
            <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-0.5 text-[10px] font-bold text-[#615D59]">
              {plan.mode === "by-name"
                ? `이름 매칭 · ${plan.matchedRowCount.toLocaleString("ko-KR")}행 일치`
                : "위치 투영(앵커 행부터 아래로)"}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
            {plan.mode === "by-name"
              ? "고객명을 정규화 키로 매칭해 같은 고객의 행에 매핑됩니다."
              : `${plan.anchorCustomer} 선택 셀 기준 아래·오른쪽으로 매핑됩니다.`}{" "}
            확인 시{" "}
            <span className="font-bold text-[#7A520F]">검토 초안 {plan.applyCount.toLocaleString("ko-KR")}건</span>이 생성되고,
            장부 반영은 체크 큐에서 체크 → 적용을 거쳐야만 이뤄집니다.
          </p>
          {/* 라운드 4 P1-5 — 같은 정규화 키의 딜 행이 여럿이라 자동 투영이 불가능한 이름. 매트릭스
              직접 입력으로 유도한다(신규 초안 오생성보다 안전). */}
          {plan.ambiguousNames.length > 0 && (
            <p className="mt-2 rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-2.5 py-1.5 text-[10.5px] font-semibold leading-relaxed text-[#7A520F]">
              같은 이름의 행이 여러 개라 건너뜀: {plan.ambiguousNames.join(", ")} — 매트릭스에서 직접 입력하세요
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            <span className="rounded-full border border-[#084734]/15 bg-gradient-to-b from-[#F2FAF6] to-[#E6F5ED] px-2 py-0.5 text-[#084734] shadow-2xs">
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
                    // UX 감사 2026-09-20: 최소 타깃(WCAG 2.5.8 24px) 확보 — 색·로직은 그대로.
                    className="min-h-9 rounded-md px-3 py-1.5 text-[11px] font-bold transition"
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
          {/* 라운드 4 P1-5 — 매칭되는 딜 행이 없는 이름. 기본 전부 미선택(스펙) — 승인한 것만
              아래 onConfirm의 newRowNames로 실려 new-row 초안이 된다. */}
          {plan.unmatched.length > 0 && (
            <div className="mt-3 border-t border-[rgba(0,0,0,0.08)] pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11.5px] font-bold text-[#111110]">
                  시트에 없는 고객 {plan.unmatched.length.toLocaleString("ko-KR")}명
                </p>
                <button
                  type="button"
                  onClick={toggleAllNewRows}
                  className="text-[10.5px] font-bold text-[#7A520F] hover:underline"
                >
                  {allNewRowsSelected ? "모두 해제" : "모두 선택"}
                </button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {plan.unmatched.map((row, index) => {
                  const checked = selectedNewRowNames.has(row.name)
                  const summary = row.cells
                    .map((cell) => `${Number(cell.month.slice(5))}월 ${formatMoney(cell.amount)}`)
                    .join(" · ")
                  return (
                    // 접근성: label로 감싸 클릭 영역을 체크박스 밖까지 확보 + min-h-11(44px, WCAG
                    // 2.5.8)로 모바일 탭 타깃을 만족한다.
                    <li key={`${index}-${row.name}`}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2.5 py-1.5 transition hover:bg-[#F6F5F4]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNewRowName(row.name)}
                          className="h-4 w-4 shrink-0 accent-[#084734]"
                        />
                        <span className="flex-1 truncate text-[12px] font-semibold text-[#111110]">{row.name}</span>
                        <span className="shrink-0 text-[10.5px] font-semibold text-[#615D59]">{summary}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
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
            onClick={() => void onConfirm({ newRowNames: Array.from(selectedNewRowNames) })}
            disabled={plan.applyCount === 0 && selectedNewRowNames.size === 0}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {confirmLabel}
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
  h1Expanded = false,
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
  h1Expanded?: boolean
}) {
  const rowBg = selected ? "bg-[#EAF6F0]" : "bg-white group-hover:bg-[#F9F9F8]"
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
      className={`group ${MATRIX_GROUP_ROW_HEIGHT[density]} cursor-pointer border-t border-[#EDECE8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 ${
        selected ? "bg-[#EAF6F0]" : "hover:bg-[#F9F9F8]"
      }`}
    >
      <td
        className={`sticky left-0 ${linkPopoverOpen ? "z-30" : "z-10"} border-r border-[#E5E7EB] px-2.5 py-1.5 ${rowBg} shadow-[4px_0_12px_-2px_rgba(0,0,0,0.06)]`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggle(group.key)
            }}
            aria-expanded={expanded}
            aria-label={`${group.customer} 하위 ${group.rows.length}건 ${expanded ? "접기" : "펼치기"}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[#615D59] transition hover:bg-black/5 hover:text-[#111110] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#084734]"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-90 text-[#084734]" : ""}`} />
          </button>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-bold text-[#111110] group-hover:text-[#084734] transition-colors">{group.customer}</span>
            {(group.managers.length > 0 || group.regions.length > 0) && (
              <span
                title={[group.managers.join(", "), group.teams.join(", "), group.regions.join(", ")].filter(Boolean).join(" · ")}
                className="block truncate text-[10px] font-medium text-[#8C8782]"
              >
                {[group.managers.join("·"), group.regions.join("·")].filter(Boolean).join(" · ") || "-"}
              </span>
            )}
          </div>
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
      <td className="border-l border-[#EDECE8] px-2 py-1.5 text-right align-middle" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {group.categories.map((category) => {
            const isHw = category === "hardware"
            const isSw = category === "software"
            return (
              <span
                key={category}
                title={`${productCategoryMeta(category).label} ${formatMoney(group.categoryTotals[category])}`}
                className={`text-[10.5px] font-bold ${
                  isHw
                    ? "text-[#7A520F]"
                    : isSw
                      ? "text-[#084734]"
                      : "text-[#615D59]"
                }`}
              >
                {productCategoryMeta(category).shortLabel}
              </span>
            )
          })}
        </div>
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByGroup}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
        periodMonths={periodMonths}
        h1Expanded={h1Expanded}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[#E5E7EB] px-2.5 py-1.5 text-right align-middle tabular-nums ${rowBg} shadow-[-4px_0_12px_-2px_rgba(0,0,0,0.06)]`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total !== 0 ? (
          <>
            <div className="flex items-center justify-between w-full leading-tight">
              <span className="text-[9.5px] font-medium text-[#A39E98] select-none pl-0.5">¥</span>
              <span className={`text-[12px] font-bold ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
            </div>
            {/* 확도 비율·색은 합계가 0 보다 클 때만(D2). */}
            {annual.total > 0 && annual.confirmed > 0 && (
              <span className={`block text-[9.5px] font-semibold leading-tight ${CONFIDENCE_TOKENS.confirmed.textClass}`}>확정 {formatWeekAmount(annual.confirmed)}</span>
            )}
          </>
        ) : (
          <span className="text-[11px] font-medium text-[#C9C5BF]">–</span>
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
  savingCells = null,
  density = "regular",
  periodMonths,
  h1Expanded = false,
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
  /** 이 행의 "저장 중" 칸(F-05) — 워크벤치 savingCellsByRow 의 이 행 몫. */
  savingCells?: ReadonlySet<string> | null
  density?: MatrixDensity
  periodMonths?: Set<string> // 웨이브 5 — 항목 1(b): 선택 기간 열 accent
  h1Expanded?: boolean
}) {
  const { row, draftRow, monthlyByMonth } = view
  const rowBg = active
    ? "bg-[#EAF6F0]"
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
    // 환불(음수) 주차·환불 달도 칸에 보인다(D2) — 양수 주차가 없어 rowWeeklySplit 이 비었다고 해도 시트 음수 주차는 싣는다.
    const signed = rowSignedWeeks(row, month)
    const hasRefundWeek = signed?.some((value) => value < 0) ?? false
    const net = rowMonthNet(row, month)
    if (split.source === "empty" && !hasRefundWeek && net >= 0) return null
    const weeks = split.source === "explicit" || split.source === "inferred"
      ? split.weeks
      : hasRefundWeek && signed
        ? signed
        : [0, 0, 0, 0, 0]
    // 주차 값이 없는 환불 달(월 칸만 음수)은 순액을 마지막 주차의 환불로 둔다(computeWeekCellStates 의 음수 monthOnlyAmount).
    const monthOnlyAmount = split.source === "month-only" ? split.total : net < 0 && !(signed?.some((value) => value !== 0)) ? net : 0
    return {
      weeks,
      inferred: split.source === "inferred",
      monthOnlyAmount,
      mismatch: rowWeeklyMismatch(row, month) !== null,
    }
  }
  // 편집 컨텍스트는 actions가 주입될 때만(딜행) — 그룹 소계행에는 이 컴포넌트를 쓰지 않으므로 항상 딜행.
  // isSelectedCell/isEditingCell는 행 스코프 좌표(selectedCoord/editingCoord)와 month·week를 비교한다 —
  // 원 isSelected/isEditing 규약과 동일(행 rowId 일치는 좌표가 이미 이 행일 때만 non-null이라 내포).
  const editContext: RevMatrixEditContext | null = actions
    ? buildRevMatrixEditContext({ row, correctedMonths: view.correctedMonths, actions, selectedCoord, editingCoord, editBuffer, editConfidence, pendingByCell, savingCells })
    : null
  return (
    <tr role="row" className={`group ${MATRIX_DEAL_ROW_HEIGHT[density]} border-t border-[#EDECE8] transition-colors ${active ? "bg-[#EAF6F0]" : draftRow ? "bg-[#FFFCF5] hover:bg-[#FBF1E0]" : grouped ? "bg-[#FAFAF8] hover:bg-[#F4F4F2]" : "hover:bg-[#F9F9F8]"}`}>
      <td
        className={`sticky left-0 ${linkPopoverOpen ? "z-30" : "z-10"} border-r border-[#E5E7EB] pr-2.5 py-1.5 ${nested ? "border-l-2 border-l-[#CBD9D2] pl-10" : grouped ? "border-l-2 border-l-[#DDE7E2] pl-7" : "pl-2.5"} ${rowBg} shadow-[4px_0_12px_-2px_rgba(0,0,0,0.06)]`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1.5">
          {!grouped && !nested && <span className="h-5 w-5 shrink-0" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => void onOpen(row)}
              title={`${row.customer} 상세 열기`}
              className="block max-w-full truncate text-left text-[12px] font-bold text-[#111110] hover:text-[#084734] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#084734]"
              aria-label={`${row.customer} 상세 열기`}
            >
              {grouped ? row.productVersion || row.customer : row.customer}
            </button>
            {subLine && (
              <span title={subLine} className={`block truncate text-[10px] font-medium ${draftRow ? "text-[#92400E]" : "text-[#8C8782]"}`}>
                {subLine}
              </span>
            )}
          </div>
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
      <td className="border-l border-[#EDECE8] px-2 py-1.5 text-right align-middle" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        {(() => {
          const category = rowProductCategory(row)
          const shortLabel = category === "hardware" ? "HW" : category === "software" ? "SW" : ""
          if (!shortLabel) return null
          const isHw = category === "hardware"
          const isSw = category === "software"
          return (
            <span
              className={`text-[10.5px] font-bold ${
                isHw
                  ? "text-[#7A520F]"
                  : isSw
                    ? "text-[#084734]"
                    : "text-[#615D59]"
              }`}
            >
              {shortLabel}
            </span>
          )
        })()}
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByMonth}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
        editContext={editContext}
        periodMonths={periodMonths}
        h1Expanded={h1Expanded}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[#E5E7EB] px-2.5 py-1.5 text-right align-middle tabular-nums ${rowBg} shadow-[-4px_0_12px_-2px_rgba(0,0,0,0.06)]`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total !== 0 ? (
          <div className="flex items-center justify-between w-full leading-tight">
            <span className="text-[9.5px] font-medium text-[#A39E98] select-none pl-0.5">¥</span>
            <span className={`text-[12px] font-bold ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
          </div>
        ) : (
          <span className="text-[11px] font-medium text-[#C9C5BF]">–</span>
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
  h1Expanded = false,
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
  h1Expanded?: boolean
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
    if (!weeks.some((value) => value !== 0) && monthOnlyAmount === 0) return null
    return { weeks, inferred: !hasExplicit && hasInferred, monthOnlyAmount, mismatch: false }
  }
  return (
    <tr role="row" className={`group ${MATRIX_DEAL_ROW_HEIGHT[density]} border-t border-[#EDECE8] transition-colors ${
      category === "hardware" ? "bg-[#FFFDF7] hover:bg-[#FBF6EC]" : "bg-[#FBFBFA] hover:bg-[#F5F5F3]"
    }`}>
      <td
        className={`sticky left-0 z-10 border-l-2 border-l-[#DDE7E2] border-r border-[#E5E7EB] pl-5 pr-2.5 py-1.5 ${rowBg} shadow-[4px_0_12px_-2px_rgba(0,0,0,0.06)]`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1.5">
          {category !== "hardware" ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              title={expanded ? "품목 접기" : editable ? "품목 펼쳐 엑셀식 편집" : "품목 보기 (전부 확정·잠금)"}
              aria-label={`${productCategoryMeta(category).label} 품목 ${expanded ? "접기" : "펼치기"}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[#615D59] transition hover:bg-black/5 hover:text-[#111110] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#084734]"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-90 text-[#084734]" : ""}`} />
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={onOpen}
            title={`${productCategoryMeta(category).label} 합산 · ${products.join(", ") || "-"} · 상세 열기`}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#084734]"
          >
            <ProductCategoryPill category={category} compact />
            <span className="min-w-0 truncate text-[11px] font-semibold text-[#615D59]">{subLine || productCategoryMeta(category).label}</span>
          </button>
        </div>
      </td>
      <td className="border-l border-[#EDECE8] px-2 py-1.5 text-right align-middle" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        {category === "hardware" && hardwareLinked ? (
          <Link
            href={`/admin/hardware?customer=${encodeURIComponent(customer)}`}
            title={`${customer} 하드웨어 거래이력 열기`}
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[9.5px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] hover:bg-[#FDE68A] transition-colors"
          >
            HW ↗
          </Link>
        ) : (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9.5px] font-medium bg-[#F3F4F6] text-[#6B7280] border border-[#E5E7EB]">
            합산
          </span>
        )}
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByMonth}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
        periodMonths={periodMonths}
        h1Expanded={h1Expanded}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[#E5E7EB] px-2.5 py-1.5 text-right align-middle tabular-nums ${rowBg} shadow-[-4px_0_12px_-2px_rgba(0,0,0,0.06)]`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total !== 0 ? (
          <div className="flex items-center justify-between w-full leading-tight">
            <span className="text-[9.5px] font-medium text-[#A39E98] select-none pl-0.5">¥</span>
            <span className={`text-[12px] font-bold ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
          </div>
        ) : (
          <span className="text-[11px] font-medium text-[#C9C5BF]">–</span>
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
  h1Expanded = false,
}: {
  columns: RevMatrixColumn[]
  grand: RevMonthlyBucket
  months: string[]
  expandedMonths: Set<string>
  periodMonths?: Set<string> // 웨이브 5 — 항목 1(b): 선택 기간 열 accent(본문·헤더와 동일한 시각 언어)
  h1Expanded?: boolean
}) {
  const columnByMonth = new Map(columns.map((column) => [column.month, column]))
  const hasAnyGoal = columns.some((column) => column.goal !== null)

  const isH1Month = (m: string) => {
    const mon = m.slice(5, 7)
    return mon >= "04" && mon <= "09"
  }
  const h1Months = months.filter(isH1Month)
  const displayMonths = h1Expanded ? months : months.filter((m) => !isH1Month(m))

  const h1Total = emptyMonthlyBucket()
  for (const m of h1Months) {
    const col = columnByMonth.get(m)
    if (col) addMonthlyBucket(h1Total, col)
  }
  const h1Goal = h1Months.reduce((sum, m) => sum + (columnByMonth.get(m)?.goal ?? 0), 0)
  const h1Pct = h1Goal > 0 ? (h1Total.confirmed / h1Goal) * 100 : null
  const h1Tone = h1Pct === null ? "text-[#C9C5BF]" : h1Pct >= 100 ? "text-[#084734]" : h1Pct >= 60 ? "text-[#A8741A]" : "text-[#B43E3E]"

  return (
    <tfoot className="sticky bottom-0 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
      {/* 월별 확정/고확도/예정 스택 */}
      <tr role="row" className="h-10 border-t-2 border-[#D1D5DB] bg-[#F6F5F4]">
        <td
          className="sticky left-0 z-10 border-r border-[#E5E7EB] bg-[#F6F5F4] px-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[#374151] shadow-[4px_0_12px_-2px_rgba(0,0,0,0.06)]"
          style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
        >
          월 합계 (확정·고확도·예정)
        </td>
        <td className="border-l border-[#EDECE8] bg-[#F6F5F4]" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }} />
        {!h1Expanded && h1Months.length > 0 && (
          <td
            key="h1-summary"
            title={`4~9월 종합 합계 ${formatMoney(h1Total.total)} · 확정 ${formatMoney(h1Total.confirmed)} · 고확도 ${formatMoney(h1Total.high)} · 예정 ${formatMoney(h1Total.open)}`}
            className="px-1.5 py-1 text-right align-middle tabular-nums bg-[#F6F5F4] border-l border-[#EDECE8]"
            style={{ width: 80, minWidth: 80, maxWidth: 80 }}
          >
            {h1Total.total > 0 ? (
              <span className="flex flex-col items-end leading-none">
                <span className={`text-[10.5px] font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>{formatWeekAmount(h1Total.confirmed)}</span>
                <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatWeekAmount(h1Total.high)}</span>
                <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`}>{formatWeekAmount(h1Total.open)}</span>
              </span>
            ) : h1Total.total < 0 ? (
              // 합계가 음수(환불이 더 큰 달)면 확도 3단 대신 부호 붙은 중립 합계 하나(D2).
              <span className={`text-[10.5px] ${MATRIX_TONE.refund}`}>{formatWeekAmount(h1Total.total)}</span>
            ) : (
              <span className="text-[11px] text-[#DDD9D3]">·</span>
            )}
          </td>
        )}
        {displayMonths.map((month) => {
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
              className={`px-2 py-1.5 text-right align-middle tabular-nums bg-[#F6F5F4] ${
                periodHighlighted ? "border-l-2 border-l-[#084734]/30" : "border-l border-[#EDECE8]"
              }`}
              style={{ width, minWidth: width }}
            >
              {bucket.total > 0 ? (
                <span className="flex flex-col items-end gap-0.5 leading-none">
                  <span className={`text-[11px] font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>{formatWeekAmount(bucket.confirmed)}</span>
                  <span className={`text-[9.5px] font-semibold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatWeekAmount(bucket.high)}</span>
                  <span className={`text-[9.5px] font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`}>{formatWeekAmount(bucket.open)}</span>
                </span>
              ) : bucket.total < 0 ? (
                <span className={`text-[11px] ${MATRIX_TONE.refund}`}>{formatWeekAmount(bucket.total)}</span>
              ) : (
                <span className="text-[11px] text-[#D1D5DB]">·</span>
              )}
            </td>
          )
        })}
        <td
          className="sticky right-0 z-10 border-l border-[#E5E7EB] bg-[#F6F5F4] px-2.5 py-1.5 text-right align-middle tabular-nums shadow-[-4px_0_12px_-2px_rgba(0,0,0,0.06)]"
          style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
        >
          <span className="flex flex-col items-end gap-0.5 leading-none">
            <span className={`text-[12px] font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>{formatWeekAmount(grand.confirmed)}</span>
            <span className={`text-[9.5px] font-semibold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatWeekAmount(grand.high)}</span>
            <span className={`text-[9.5px] font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`}>{formatWeekAmount(grand.open)}</span>
          </span>
        </td>
      </tr>
      {/* 월 목표 대비 % (DSH 월 목표 시리즈가 있을 때만) */}
      {hasAnyGoal && (
        <tr role="row" className="h-8 border-t border-[#E5E7EB] bg-[#FAF9F8]">
          <td
            className="sticky left-0 z-10 border-r border-[#E5E7EB] bg-[#FAF9F8] px-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#615D59] shadow-[4px_0_12px_-2px_rgba(0,0,0,0.06)]"
            style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
          >
            월 목표 대비 (확정)
          </td>
          <td className="border-l border-[#EDECE8] bg-[#FAF9F8]" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }} />
          {!h1Expanded && h1Months.length > 0 && (
            <td
              key="h1-goal"
              className="px-2 py-1 text-right align-middle tabular-nums bg-[#FAF9F8] border-l border-[#EDECE8]"
              style={{ width: 80, minWidth: 80, maxWidth: 80 }}
            >
              <span className={`text-[10px] font-bold ${h1Tone}`}>
                {h1Pct !== null ? `${Math.round(h1Pct)}%` : "·"}
              </span>
            </td>
          )}
          {displayMonths.map((month) => {
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
                className={`px-2 py-1 text-right align-middle tabular-nums bg-[#FAF9F8] ${
                  periodHighlighted ? "border-l-2 border-l-[#084734]/30" : "border-l border-[#EDECE8]"
                }`}
                style={{ width, minWidth: width }}
              >
                {/* % 자리수는 formatPercent SSOT(최대 1자리) — 보조 분석·레일 KPI 달성률과 동일 규칙. */}
                <span className={`text-[10.5px] font-bold ${tone}`}>{pct === null ? "·" : formatPercent(pct)}</span>
              </td>
            )
          })}
          <td
            className="sticky right-0 z-10 border-l border-[#E5E7EB] bg-[#FAF9F8] px-2.5 py-1 text-right align-middle tabular-nums shadow-[-4px_0_12px_-2px_rgba(0,0,0,0.06)]"
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
