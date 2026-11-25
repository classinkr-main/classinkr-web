"use client"

// SalesLedgerWorkbench에서 물리 이동(웨이브 7 2단 F5 — 기계적 분할, 로직 무변경): 검토 초안
// 체크 큐(검색/상태 필터 탭·체크 토글·적용/삭제/되돌리기 확인 다이얼로그·레코드별 에러 배지)와
// 상태 배지 SSOT 소비 헬퍼(draftStatusMeta·draftMatchesFilter/Query·DRAFT_STATUS_FILTERS).
// 회귀 테스트(tests/branch/draft-status-labels-ssot·ledger-record-error-isolation·
// ledger-entry-reverse-action)가 이 파일을 소스 스캔한다.
//
// 체크 큐 컴팩트(P0-5 · C-4, docs/active/ledger-filter-plan-2026-11-24.md): 초안 한 건이 카드 한 장(약 140px)에
// 배지 4~5개 · 버튼 6개라 900px 패널에 3건 남짓만 보였다. 표시만 바꿨다 — 한 건 = 한 줄(약 40px, 카드 상자
// 없음), 금액 밑에 다음 단계 버튼 하나(체크 또는 적용), 나머지 동작은 줄을 펼치면 나오는 글자 링크로 옮겼다.
// 동작 · 활성 조건 · 확인 다이얼로그 · 상태 계산은 그대로다.
//
// 2026-11-25 시트 고정 전 정비:
//  - F-20: 반영 요청이 나가 있는 초안(훅 applyingIds)은 줄 적용·일괄 반영을 잠그고 "반영 중…"으로 보인다(applyBusy).
//  - F-21: 일괄 체크·반영은 화면 범위(bulkScope — 결재 바와 같은 담당자·팀)만 센다. 담당자가 여럿이면 "전체 담당자 N건"으로
//    말하고 확인 문구에 담당자별 건수를 붙인다.
//  - F-39: 체크·적용 알약은 진행 중에 disabled 대신 aria-disabled — 누른 알약이 포커스를 잃지 않는다. 누른 글자 링크가
//    사라지면(체크 해제) 그 줄의 알약으로 포커스를 돌린다.
//  - F-46: 활성 회계연도 밖의 달은 "26년 4월"처럼 해를 붙인다(fiscalMonths).
//  - 시트 고정(sheetLock)이 적용 중이면 되돌리기 막힘 사유가 "장부에서 원래 값으로 다시 입력"으로 바뀐다(F-22).

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { AlertTriangle, Loader2, RefreshCw, RotateCcw, Search, Send, Trash2, XCircle } from "lucide-react"

import { matchesTokens, tokenize } from "../search-tokens"
import { useDialogFocus } from "../../use-dialog-focus"
import { planBulkApply, planBulkCheck } from "./draft-bulk-plan"
import type { RevSheetLockView } from "@/lib/branch/rev-sheet-lock"
import { isSelfCheckedDraft, SELF_CHECK_BADGE_LABEL, SELF_CHECK_BADGE_TITLE } from "./self-check"
import {
  blocksLedgerDelete,
  blocksLedgerReverse,
  SHEET_WRITE_HISTORY_DELETE_MESSAGE,
  sheetWriteBadge,
  sheetWrittenReverseMessage,
  summarizeApplyOutcomes,
  APPLY_SKIPPED_IN_FLIGHT_MESSAGE,
  type ApplySheetOutcome,
  type SheetWriteBadgeTone,
  type SheetWriteMode,
  type SheetWriteView,
} from "./sheet-write-view"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import {
  DRAFT_STATUS_LABELS,
  draftConfidenceFromMetadata,
  draftStatusLabel,
  dominantWeeklyConfidence,
  formatMoney,
  formatMonthLabel,
  mergedWeeklyFromMetadata,
  metadataString,
  weeklyConfidenceFromMetadata,
  type DraftConfidence,
  type DraftQueueMode,
  type DraftStatus,
  type LedgerDraft,
} from "./shared"

// 결정 D5(2026-11-24, P0-5): 상태 탭 6개 → 3개. 검토중 · 체크완료는 "대기" 안에서 줄 왼쪽 점 색으로 가르고,
// 취소된 초안은 "전체" 안에서만 보인다(전용 탭 없음). 기한 지남 탭은 C-10이 들어올 때 붙인다.
// 라벨은 품질 웨이브 7 — 항목 4 그대로 DRAFT_STATUS_LABELS(ledger/shared.tsx) SSOT를 쓴다. "대기"(open — draft+checked
// 묶음 필터)와 "전체"(all)는 단일 상태가 아니라 SSOT 밖에 둔다.
type DraftStatusFilter = "open" | "applied" | "all"

export const DRAFT_STATUS_FILTERS: Array<{ id: DraftStatusFilter; label: string }> = [
  { id: "open", label: "대기" },
  { id: "applied", label: DRAFT_STATUS_LABELS.applied },
  { id: "all", label: "전체" },
]

// export: 웨이브 5 회귀 테스트(tests/branch)가 "적용완료(상쇄)" 배지 분기를 직접 검증한다.
// reversed는 draft.status와 무관한 별도 신호(연결된 entry가 상쇄됐는지) — draft.status
// 자체는 "applied"로 불변이라(백엔드가 감사 추적을 위해 건드리지 않는다) 여기서 라벨만 분기한다.
// 라벨 문구 자체는 품질 웨이브 7 — 항목 4로 DRAFT_STATUS_LABELS(ledger/shared.tsx) SSOT로
// 통일했다(톤/className은 이 함수 소관, 라벨 텍스트만 draftStatusLabel에 위임).
export function draftStatusMeta(status: DraftStatus, reversed = false) {
  if (status === "checked") {
    return { label: draftStatusLabel(status), className: "border-[#084734]/15 bg-gradient-to-b from-[#F2FAF6] to-[#E6F5ED] text-[#084734] shadow-xs" }
  }
  if (status === "applied") {
    if (reversed) {
      return { label: draftStatusLabel(status, true), className: "border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] text-[#615D59]" }
    }
    return { label: draftStatusLabel(status), className: "border-[#084734]/15 bg-gradient-to-b from-[#F2FAF6] to-[#E6F5ED] text-[#084734] shadow-xs" }
  }
  if (status === "cancelled") {
    // (미사용) — DB CHECK 제약(20260630_branch_sales_ledger_drafts.sql)엔 유효 상태지만
    // 이 워크벤치 어느 동작도 초안을 cancelled로 전이시키지 않는다(직접 DB 조작 등으로만 도달).
    // 배지는 그런 행이 조회될 가능성에 대비한 방어적 렌더 — DraftStatus 타입은 DB 계약과 맞춰 유지.
    return { label: draftStatusLabel(status), className: "border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] text-[#615D59]" }
  }
  return { label: draftStatusLabel(status), className: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]" }
}

// REV 시트 쓰기(ADR-011) 상태 글자 — DESIGN.md 운영 상태 스케일(Success·Warning·Danger)과 중립.
// 컴팩트 줄(P0-5)에서는 정상(시트 반영 · 장부에만)은 둘째 줄 글자로만 두고, 막힘 · 확인 중만 테두리 없는
// 작은 틴트 배지로 띄운다 — 무엇이 문제인지가 한눈에 보이게.
const SHEET_WRITE_BADGE_CLASS: Record<SheetWriteBadgeTone, string> = {
  success: "text-[#084734]",
  warning: "rounded-sm bg-[#FBF1E0] px-1 font-semibold text-[#7A520F]",
  danger: "rounded-sm bg-[#FCE9E9] px-1 font-semibold text-[#8F2C2C]",
  neutral: "text-[#615D59]",
}

function draftMatchesFilter(draft: LedgerDraft, filter: DraftStatusFilter) {
  if (filter === "all") return true
  if (filter === "open") return draft.status === "draft" || draft.status === "checked"
  return draft.status === filter
}

// 펼친 줄의 시트 쓰기 사유 — 막힘(danger) · 확인 중(warning)만 그린다. 글자색 · 아이콘색만 톤을 따른다(상자 없음).
type SheetAlertTone = Extract<SheetWriteBadgeTone, "warning" | "danger">
const SHEET_WRITE_REASON_CLASS: Record<SheetAlertTone, string> = {
  warning: "text-[#7A520F]",
  danger: "text-[#8F2C2C]",
}
const SHEET_WRITE_ICON_CLASS: Record<SheetAlertTone, string> = {
  warning: "text-[#A8741A]",
  danger: "text-[#B43E3E]",
}

// 상태 점(P0-5) — 상태 배지 대신 줄 왼쪽 점 하나로 가른다(D5). 검토중은 Warning 앰버, 체크완료는 Classin Green,
// 적용 · 취소는 흐린 장식색. 로컬 임시(local-*) 초안은 아직 서버 큐에 오르지 않은 초안이라 속 빈 회색 고리로 둔다.
// 점은 장식이다 — 상태 글자는 줄 버튼의 sr-only 문구 · 금액 밑 상태 글자 · 펼친 줄 상세가 전한다.
function draftStatusDotClass(draft: LedgerDraft, reversed: boolean): string {
  if (draft.status === "checked") return "bg-[#084734]"
  if (draft.status === "applied") return reversed ? "border-[1.5px] border-[#A39E98] bg-white" : "bg-[#A39E98]"
  if (draft.status === "cancelled") return "border-[1.5px] border-[#A39E98] bg-white"
  if (draft.id.startsWith("local-")) return "border-[1.5px] border-[#8A857F] bg-white"
  return "bg-[#A8741A]"
}

// 금액 글자색 = 초안 확도(CONFIDENCE_TOKENS). 주차별 확도가 있으면 금액이 가장 큰 확도(dominantWeeklyConfidence —
// 동률은 낮은 확도), 없으면 초안 단위 확도(metadata.confidence, 없으면 예정) — 매트릭스 pending과 같은 판독이다.
function draftAmountConfidence(metadata: Record<string, unknown> | null | undefined): DraftConfidence {
  const weekly = mergedWeeklyFromMetadata(metadata)
  const states = weekly ? weeklyConfidenceFromMetadata(metadata) : null
  return weekly && states ? dominantWeeklyConfidence(weekly, states) : draftConfidenceFromMetadata(metadata)
}

// 금액 밑 다음 단계 버튼 하나(P0-5) — 검토중이면 체크, 체크완료면 적용, 그 밖(적용 · 취소)은 버튼 없음.
// 어느 버튼을 그릴지만 정한다 — 활성 조건(disabled)은 각 버튼에 예전 체크/적용 버튼 식 그대로 둔다.
function nextStepForStatus(status: DraftStatus): "check" | "apply" | null {
  if (status === "draft") return "check"
  if (status === "checked") return "apply"
  return null
}

// 펼친 줄에 보일 글자 링크(P0-5) — 상태상 애초에 못 쓰는 동작은 숨긴다. 활성 조건(disabled)은 링크마다 예전
// 네모 버튼 식 그대로라, 시트 쓰기 가드 · 서버 큐 아님 · 진행 중처럼 그때그때 막히는 경우는 흐린 링크 + title로 보인다.
function rowLinksForStatus(status: DraftStatus) {
  return {
    edit: status === "draft",
    uncheck: status === "checked",
    reverse: status === "applied",
    cancel: status === "draft" || status === "checked",
    remove: status === "draft",
  }
}

// 키보드 포커스 링 — 어드민 공통(#084734 · 2px · offset 2px). 줄 버튼 · 알약 · 글자 링크가 같은 링을 쓴다.
const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
// 펼친 줄의 글자 링크(P0-5) — 네모 아이콘 버튼 대신 상자 없는 밑줄 글자. 꺼진 링크는 밑줄을 빼고 흐리게 두되
// title로 이유를 보인다(시트 쓰기 가드 · 서버 큐 아님 등). 진행 중(aria-disabled — 포커스를 지키려고 disabled 대신, F-39)도
// 같은 모양으로 흐리게.
const ROW_LINK_DISABLED = "disabled:cursor-not-allowed disabled:no-underline disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:no-underline aria-disabled:opacity-45"
const ROW_LINK_CLASS = `inline-flex items-center gap-1 rounded-sm text-[11.5px] font-semibold text-[#31302E] underline decoration-[rgba(0,0,0,0.28)] underline-offset-2 transition hover:text-[#111110] hover:decoration-current ${ROW_LINK_DISABLED} ${FOCUS_RING}`
const ROW_LINK_DANGER_CLASS = `inline-flex items-center gap-1 rounded-sm text-[11.5px] font-semibold text-[#B43E3E] underline decoration-[#B43E3E]/40 underline-offset-2 transition hover:text-[#8F2C2C] hover:decoration-current ${ROW_LINK_DISABLED} ${FOCUS_RING}`

// 라운드 3(P1) — 주차 병합 초안의 주차별 확도 도트: metadata.weekly + weeklyConfidence가 둘 다
// 유효할 때만 금액>0 주차를 W라벨+3px 원(CONFIDENCE_TOKENS color)으로 한 줄 표기한다.
// 확도 미기록(null) 주차는 도트 없이 건너뛴다 — 과밀 방지, 상세는 title/aria-label로 보강.
function WeeklyConfidenceDots({ metadata }: { metadata: Record<string, unknown> | null | undefined }) {
  const weekly = mergedWeeklyFromMetadata(metadata)
  const states = weekly ? weeklyConfidenceFromMetadata(metadata) : null
  if (!weekly || !states) return null
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px] font-semibold text-[#615D59]">
      {weekly.map((value, index) => {
        if (value <= 0) return null
        const state = states[index]
        if (!state) return null
        const token = CONFIDENCE_TOKENS[state]
        const description = `W${index + 1} ${token.label} ${formatMoney(value)}`
        return (
          <span key={index} className="inline-flex items-center gap-1" title={description} aria-label={description}>
            <span aria-hidden className="h-[3px] w-[3px] rounded-full" style={{ backgroundColor: token.color }} />
            W{index + 1}
          </span>
        )
      })}
    </p>
  )
}

// 다중 토큰 AND 매칭(품질 웨이브 3, 항목 1) — search-tokens.ts SSOT 소비. "김민 BD"처럼
// 서로 다른 필드에 걸친 복합 검색을 지원한다(기존엔 공백 포함 쿼리를 단일 문자열로만 비교해
// 실패했다).
function draftMatchesQuery(draft: LedgerDraft, query: string) {
  return matchesTokens(tokenize(query), [
    draft.customer,
    draft.manager,
    draft.team,
    draft.month,
    draft.note,
    draft.sourceDealId,
    draft.sourceSheetRow ? String(draft.sourceSheetRow) : "",
  ])
}

/**
 * 줄 둘째 줄의 달(F-46) — 활성 회계연도의 달이면 장부 월 머리와 같은 "11월", 밖이면 "26년 4월"(같은 "4월"이 두 해를 가리키지
 * 않게). fiscalMonths 가 없으면 지금처럼 달만.
 */
export function queueMonthLabel(month: string, fiscalMonths?: readonly string[] | null): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  const monthNumber = match ? Number(match[2]) : 0
  if (!match || !monthNumber) return formatMonthLabel(month)
  if (!fiscalMonths || fiscalMonths.length === 0 || fiscalMonths.includes(month)) return `${monthNumber}월`
  return `${match[1].slice(2)}년 ${monthNumber}월`
}

/**
 * 일괄 반영 대상의 담당자별 건수(F-21) — 많은 순(같으면 이름순) "예시A 2건 · 예시B 1건". owners 는 담당자 수(빈 담당자는
 * "담당자 없음" 하나로 센다).
 */
export function bulkOwnerBreakdown(drafts: ReadonlyArray<Pick<LedgerDraft, "manager">>): { owners: number; text: string } {
  const counts = new Map<string, number>()
  for (const draft of drafts) {
    const owner = draft.manager?.trim() || "담당자 없음"
    counts.set(owner, (counts.get(owner) ?? 0) + 1)
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
  return { owners: counts.size, text: ordered.map(([owner, count]) => `${owner} ${count}건`).join(" · ") }
}

export function DraftQueue({
  drafts,
  mode,
  loading,
  error,
  reversedDraftIds,
  recordErrors,
  sheetWrites,
  sheetWriteMode = "off",
  sheetLock = null,
  applyingIds,
  applyBusy = false,
  bulkScope = null,
  fiscalMonths = null,
  onReload,
  onEdit,
  onToggle,
  onApply,
  onCancel,
  onDelete,
  onReverse,
  onBulkCheck,
  onBulkApply,
}: {
  drafts: LedgerDraft[]
  mode: DraftQueueMode
  loading: boolean
  error: string | null
  // 웨이브 5 — "되돌리기": applied 초안 중 연결 entry가 상쇄된 것의 id 집합. draft.status는
  // 불변이라("applied" 그대로) 이 Set으로만 "적용됨" vs "적용됨(상쇄)" 배지를 구분한다.
  reversedDraftIds: Set<string>
  // 품질 웨이브 7 — 항목 2: draft id → 그 행에 국한된 에러 메시지(404 레코드 소실 등). 전역
  // queueError/mode와 별개 — 큐 전체를 로컬로 내리지 않고 그 행에만 배지+새로고침 유도를 낸다.
  recordErrors: Map<string, string>
  // REV 시트 쓰기(ADR-011) — draft id → 가장 최근 시트 쓰기 시도(GET sheetWrites). 행 배지(시트 반영됨·충돌·
  // 확인 중·실패·장부에만)와 실패 사유 한 줄(messages.ts 문구)에 쓴다. 없으면 배지 없음.
  sheetWrites?: Record<string, SheetWriteView>
  // REV 시트 쓰기 스위치(ADR-011) — 켜짐이면 일괄 적용이 시트(2. REV)에도 쓴다. 일괄 띠 버튼 · 확인 문구는 표 아래
  // 변경 대기 줄(ApprovalBar)과 같은 말("N건 시트·장부에 반영")을 쓴다 — 둘은 같은 일괄 함수(applyDrafts)이고 큐를 열면
  // 함께 보인다. 곳("장부에" · "시트·장부에")이든 동사("적용" · "반영")든 한쪽만 다르면 다른 동작으로 읽힌다(최종 검증
  // 라운드 2: "4건 시트·장부에 적용" 바로 아래 "4건 시트·장부에 반영"). 줄 알약 "적용" · 상태 "적용완료"는 초안 한 건의
  // 단계 이름(SSOT)이라 그대로 둔다 — "적용하면 장부에 반영된다"(자가 체크 저장 안내)와 같은 짝이다. 없으면 꺼짐(장부에만).
  sheetWriteMode?: SheetWriteMode
  // 시트 고정(GET sheetWrite.lock) — 적용 중이면 되돌리기 막힘 사유를 고정 뒤 문구로(F-22). 없으면 지금 문구.
  sheetLock?: RevSheetLockView | null
  // F-20: 훅의 반영 진행 중 초안 id(결재 바·큐 일괄·줄 적용 공통)와 그 여부. 진행 중이면 줄 적용·일괄 반영을 잠근다.
  applyingIds?: ReadonlySet<string>
  applyBusy?: boolean
  // F-21: 일괄 체크·반영이 세는 범위 — 결재 바(pendingDrafts)와 같은 담당자·팀 조건. 없으면 보이는 목록 전체(담당자가 여럿이면
  // "전체 담당자 N건"으로 말한다). 목록 자체는 거르지 않는다.
  bulkScope?: ((draft: LedgerDraft) => boolean) | null
  // F-46: 활성 회계연도의 달(YYYY-MM) — 밖의 달은 줄에 해를 붙인다. 없으면 지금처럼 달만.
  fiscalMonths?: readonly string[] | null
  onReload: () => void
  onEdit: (draft: LedgerDraft) => void
  onToggle: (id: string) => void | Promise<void>
  // REV 시트 쓰기: 훅의 applyDraft 가 결과(ApplySheetOutcome)를 돌려준다 — 큐 카드는 쓰지 않는다(상태는 drafts·
  // sheetWrites 재조회로 반영). onCancel 과 같은 이유로 반환 타입을 넓힌다.
  onApply: (id: string) => void | Promise<unknown>
  // 품질 감사 2026-09-10 — #8: draft/checked → cancelled 전이. 삭제(onDelete, 하드 DELETE·감사
  // 추적 없음)와 달리 행이 DB에 그대로 남는다 — "취소했다"는 사실 자체가 감사 대상일 때 이걸 쓴다.
  // 라운드 4 P1-6: 훅의 cancelDraft가 성공 여부(boolean)를 돌려주게 되면서 반환 타입을 넓힌다 —
  // 큐 카드는 결과를 쓰지 않으므로(상태는 drafts로 반영) 어떤 값이든 무시한다.
  onCancel: (id: string) => void | Promise<unknown>
  onDelete: (id: string) => void | Promise<void>
  onReverse: (id: string, reason?: string) => Promise<unknown> | void
  // 일괄 체크·적용(2026-09-14) — 지금 보이는 목록 기준. 3단계는 그대로이고 누르는 횟수만 줄인다.
  onBulkCheck?: (ids: string[]) => Promise<{ done: number; failed: number }>
  onBulkApply?: (ids: string[]) => Promise<{ done: number; failed: number; sheetResults?: ApplySheetOutcome[] }>
}) {
  const modeLabel = mode === "server" ? "서버 큐" : "로컬 fallback"
  const baseId = useId()
  const searchInputId = `${baseId}-search`
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<DraftStatusFilter>("open")
  // 검색칸은 머리 줄 아이콘을 눌러야 펼친다(P0-5). 닫으면 검색어도 지운다 — 걸린 조건이 안 보이는 채로 남지 않게.
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchButtonRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])
  const toggleSearch = () => {
    if (searchOpen) {
      setQuery("")
      setSearchOpen(false)
      return
    }
    setSearchOpen(true)
  }
  // 빈 큐(불러오는 중 포함)에는 검색칸이 없다 — 머리 줄의 검색 아이콘도 숨긴다(누르면 아무것도 안 열리고 aria-controls 가
  // 없는 칸을 가리킨다). 열어 둔 채 목록이 비면 접고 검색어도 지운다 — 초안이 다시 들어올 때 포커스 없이 펼쳐진 칸과
  // 안 보이던 검색어가 목록을 거르지 않게. effect 가 아니라 렌더 중에 맞춘다(set-state-in-effect 회피 — 조건이 풀리면 멈춘다).
  const searchable = drafts.length > 0
  if (!searchable && (searchOpen || query)) {
    setSearchOpen(false)
    setQuery("")
  }
  // 줄 펼침(P0-5) — 한 번에 한 줄만 펼친다(경고 전문 · 메모 · 주차 확도 · 글자 링크).
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const queryMatchedDrafts = useMemo(() => drafts.filter((draft) => draftMatchesQuery(draft, query)), [drafts, query])
  const visibleDrafts = useMemo(() => {
    return queryMatchedDrafts.filter((draft) => draftMatchesFilter(draft, statusFilter))
  }, [queryMatchedDrafts, statusFilter])
  // 탭 알약의 건수 — 검색어가 걸려 있으면 검색 결과 안에서 센다(누르면 보일 건수와 같게).
  const filterCounts = useMemo(() => {
    const counts: Record<DraftStatusFilter, number> = { open: 0, applied: 0, all: 0 }
    for (const draft of queryMatchedDrafts) {
      for (const item of DRAFT_STATUS_FILTERS) {
        if (draftMatchesFilter(draft, item.id)) counts[item.id] += 1
      }
    }
    return counts
  }, [queryMatchedDrafts])
  // 머리 줄 "체크 큐 N"은 검색과 무관한 대기(draft+checked) 건수 — 빠른 작업 탭 배지와 같은 값.
  const openCount = useMemo(() => drafts.filter((draft) => draftMatchesFilter(draft, "open")).length, [drafts])
  // F-21: 일괄은 화면 범위(bulkScope)만 — 결재 바와 같은 건수가 되게. 범위 밖 체크완료는 건수만 조용히 알린다.
  const scopedDrafts = useMemo(() => (bulkScope ? visibleDrafts.filter(bulkScope) : visibleDrafts), [bulkScope, visibleDrafts])
  const bulkCheckPlan = useMemo(() => planBulkCheck(scopedDrafts), [scopedDrafts])
  const bulkApplyPlan = useMemo(() => planBulkApply(scopedDrafts), [scopedDrafts])
  const bulkApplyOwners = useMemo(
    () => bulkOwnerBreakdown(scopedDrafts.filter((draft) => draft.status === "checked" && !draft.id.startsWith("local-"))),
    [scopedDrafts],
  )
  const bulkApplyMultiOwner = bulkApplyOwners.owners > 1
  const outOfScopeChecked = useMemo(
    () => (bulkScope ? visibleDrafts.filter((draft) => draft.status === "checked" && !bulkScope(draft)).length : 0),
    [bulkScope, visibleDrafts],
  )
  // 일괄 적용은 DB 장부에 기록하는 동작이라 한 번 더 확인한다(단건 적용 다이얼로그와 같은 원칙, 인라인).
  const [bulkApplyConfirm, setBulkApplyConfirm] = useState(false)
  const [bulkBusy, setBulkBusy] = useState<"check" | "apply" | null>(null)
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const runBulkCheck = async () => {
    if (!onBulkCheck || bulkCheckPlan.count === 0) return
    setBulkBusy("check")
    try {
      const result = await onBulkCheck(bulkCheckPlan.ids)
      setBulkResult(`체크 ${result.done}건${result.failed ? ` · 실패 ${result.failed}건` : ""}`)
    } finally {
      setBulkBusy(null)
    }
  }
  const runBulkApply = async () => {
    if (!onBulkApply || bulkApplyPlan.count === 0) return
    setBulkBusy("apply")
    try {
      const result = await onBulkApply(bulkApplyPlan.ids)
      // 시트 쓰기 결과가 있으면 코드별 건수로(ApprovalBar 결과 줄과 같은 문구), 꺼짐이면 지금 문구. 보낸 것이 없으면(전부
      // 다른 곳에서 반영 중 — F-20) 그렇게 말한다.
      const sheet = summarizeApplyOutcomes(result.sheetResults ?? [])
      setBulkResult(
        sheet
          ? sheet.text
          : result.done === 0 && result.failed === 0
            ? APPLY_SKIPPED_IN_FLIGHT_MESSAGE
            : `반영 ${result.done}건${result.failed ? ` · 실패 ${result.failed}건` : ""}`,
      )
    } finally {
      setBulkBusy(null)
      setBulkApplyConfirm(false)
    }
  }
  // "적용"은 큐에서 유일하게 비가역인 동작(DB 장부에 실제로 기록) — 확인 다이얼로그를 거친다.
  const [confirmApplyDraft, setConfirmApplyDraft] = useState<LedgerDraft | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  // 다이얼로그 포커스 캡처/복귀·Escape 닫기·Tab 트랩 = 공용 훅(use-dialog-focus, DealModal.tsx와
  // 동일 패턴)에 위임(품질 웨이브 6 — 항목 1). "적용"은 비가역 동작이라 autoFocus 기본값을
  // 파괴적 버튼에 두지 않는다 — 초기 포커스는 "취소"(confirmApplyCancelRef).
  const confirmApplyCancelRef = useRef<HTMLButtonElement | null>(null)
  const confirmApplyDraftId = confirmApplyDraft?.id ?? null
  const confirmAndApply = async (id: string) => {
    setApplyingId(id)
    try {
      await onApply(id)
    } finally {
      setApplyingId(null)
      setConfirmApplyDraft(null)
    }
  }
  // "삭제"도 초안 자체가 사라져 되돌릴 수 없다 — 적용 확인과 같은 다이얼로그 셸(포커스 관리 포함)을
  // 재사용해 확인을 거친다(품질 웨이브 4 — 항목 3). 오조작 방지가 목적이라 초기 포커스도 "취소".
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState<LedgerDraft | null>(null)
  const confirmDeleteCancelRef = useRef<HTMLButtonElement | null>(null)
  const confirmDeleteDraftId = confirmDeleteDraft?.id ?? null
  // "되돌리기"(웨이브 5) — 적용을 상쇄하는 동작이라 danger는 아니지만(초안 기록은 감사용으로
  // 유지된다) 장부 반영을 되돌리는 부수효과가 있어 적용/삭제와 동일한 확인 다이얼로그 셸을
  // 재사용한다. 톤만 warning(#ECD29C/#FBF1E0/#7A520F)으로 danger(#B43E3E)와 구분.
  const [confirmReverseDraft, setConfirmReverseDraft] = useState<LedgerDraft | null>(null)
  const [reverseReason, setReverseReason] = useState("")
  const [reversingId, setReversingId] = useState<string | null>(null)
  const confirmReverseCancelRef = useRef<HTMLButtonElement | null>(null)
  const confirmReverseDraftId = confirmReverseDraft?.id ?? null
  const closeReverseDialog = () => {
    setConfirmReverseDraft(null)
    setReverseReason("")
  }
  const confirmAndReverse = async (id: string) => {
    setReversingId(id)
    try {
      await onReverse(id, reverseReason.trim() || undefined)
    } catch {
      // 에러 토스트는 onReverse를 감싼 부모(handleReverseEntry)가 이미 띄운다 — 여기선 상태만 정리.
    } finally {
      setReversingId(null)
      closeReverseDialog()
    }
  }
  // 체크토글·삭제 in-flight 표시 — InputRailSection의 draftSaving+Loader2 패턴 재사용.
  // 한 초안에 동시에 한 동작만(토글 중 삭제 클릭 등 이중 요청 방지) 진행되게 버튼도 함께 잠근다.
  const [rowActionBusy, setRowActionBusy] = useState<{ id: string; action: "toggle" | "cancel" | "delete" } | null>(null)
  // F-20: 훅이 반영 요청을 보내고 있는 초안(다른 화면의 일괄 반영 포함)도 그 줄의 동작을 잠근다.
  const isRowBusy = (id: string) => rowActionBusy?.id === id || applyingId === id || reversingId === id || Boolean(applyingIds?.has(id))
  // REV 시트 쓰기(ADR-011): 시트에도 쓴 정정은 장부에서만 상쇄하지 않는다(서버가 409 로 막는 조건과 같다).
  const sheetBlocksReverse = (id: string) => blocksLedgerReverse(sheetWrites?.[id])
  // 반영을 한 번이라도 시도한 초안(감사 행 있음)은 서버가 삭제를 막는다(감사 기록 보존) — 삭제 대신 취소로 정리한다.
  const sheetBlocksDelete = (id: string) => blocksLedgerDelete(sheetWrites?.[id])
  // F-39: 줄의 다음 단계 알약 · 줄 버튼 DOM. 토글 뒤 포커스가 문서 몸통으로 떨어졌으면(누른 "체크 해제" 링크가 사라짐) 그 줄의
  // 알약(없으면 줄 버튼)으로 되돌린다. 알약 자체는 같은 요소로 남고(글자만 바뀜) 진행 중에도 disabled 가 아니라 포커스를 지킨다.
  const pillRefs = useRef(new Map<string, HTMLButtonElement>())
  const rowButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocusRef = useRef<string | null>(null)
  const registerPill = (id: string) => (node: HTMLButtonElement | null) => {
    if (node) pillRefs.current.set(id, node)
    else pillRefs.current.delete(id)
  }
  useEffect(() => {
    const id = pendingFocusRef.current
    if (!id || rowActionBusy) return
    pendingFocusRef.current = null
    if (typeof document === "undefined") return
    const active = document.activeElement
    if (active && active !== document.body) return
    const target = pillRefs.current.get(id) ?? rowButtonRefs.current.get(id)
    target?.focus()
  })
  const runToggle = async (id: string) => {
    // 진행 중 이중 요청 방지 — 버튼은 aria-disabled 라 눌리기는 한다(포커스를 지키려고 disabled 를 쓰지 않는다).
    if (isRowBusy(id)) return
    setRowActionBusy({ id, action: "toggle" })
    try {
      await onToggle(id)
    } finally {
      pendingFocusRef.current = id
      setRowActionBusy(null)
    }
  }
  const runCancel = async (id: string) => {
    setRowActionBusy({ id, action: "cancel" })
    try {
      await onCancel(id)
    } finally {
      setRowActionBusy(null)
    }
  }
  const runDelete = async (id: string) => {
    setRowActionBusy({ id, action: "delete" })
    try {
      await onDelete(id)
    } finally {
      setRowActionBusy(null)
    }
  }
  // 품질 감사 2026-09-10 — #8: "취소"는 삭제(하드 DELETE)와 달리 되돌리기 확인 다이얼로그와 같은
  // 셸을 재사용한다(danger 아닌 warning 톤) — 사유 입력은 없다(DB에 취소 사유 컬럼 없음, buildUpdate
  // 참고). draft/checked에서만 활성화(아래 버튼 disabled 조건).
  const [confirmCancelDraft, setConfirmCancelDraft] = useState<LedgerDraft | null>(null)
  const confirmCancelCancelRef = useRef<HTMLButtonElement | null>(null)
  const confirmCancelDraftId = confirmCancelDraft?.id ?? null
  const confirmAndCancel = async (id: string) => {
    await runCancel(id)
    setConfirmCancelDraft(null)
  }
  const cancellingConfirmed = confirmCancelDraft != null && rowActionBusy?.id === confirmCancelDraft.id && rowActionBusy.action === "cancel"
  // 확인 다이얼로그의 "삭제" 클릭 → 기존 runDelete(rowActionBusy 추적) 그대로 실행 후 다이얼로그를 닫는다.
  const confirmAndDelete = async (id: string) => {
    await runDelete(id)
    setConfirmDeleteDraft(null)
  }
  const deletingConfirmed = confirmDeleteDraft != null && rowActionBusy?.id === confirmDeleteDraft.id && rowActionBusy.action === "delete"
  // 세 확인 다이얼로그(적용·되돌리기·삭제)의 포커스 캡처/복귀·Escape 닫기·Tab 트랩을 공용 훅에
  // 위임(품질 웨이브 6 — 항목 1). 기존에는 각자 role="dialog" div의 onKeyDown에서 Escape만
  // 개별 처리하고(Tab 트랩 없음) 포커스 이동은 별도 useEffect 3개로 중복 구현했다. onClose
  // 클로저 안에서 in-flight(적용/되돌리기/삭제 진행 중) 가드를 그대로 유지해 작업 중 Escape로
  // 다이얼로그가 닫혀버리는 회귀를 막는다.
  useDialogFocus(
    confirmApplyDraftId,
    () => {
      if (confirmApplyDraft && applyingId === confirmApplyDraft.id) return
      setConfirmApplyDraft(null)
    },
    confirmApplyCancelRef
  )
  useDialogFocus(
    confirmReverseDraftId,
    () => {
      if (confirmReverseDraft && reversingId === confirmReverseDraft.id) return
      closeReverseDialog()
    },
    confirmReverseCancelRef
  )
  useDialogFocus(
    confirmDeleteDraftId,
    () => {
      if (deletingConfirmed) return
      setConfirmDeleteDraft(null)
    },
    confirmDeleteCancelRef
  )
  useDialogFocus(
    confirmCancelDraftId,
    () => {
      if (cancellingConfirmed) return
      setConfirmCancelDraft(null)
    },
    confirmCancelCancelRef
  )

  // 머리 한 줄(P0-5): "체크 큐 N" · 검색 아이콘(누르면 검색칸 펼침) · 새로고침 아이콘. 서버 큐가 정상일 때는
  // 모드 배지를 숨기고, 로컬 fallback일 때만 아래 경고 띠로 알린다.
  const header = (
    <div className="flex items-center gap-0.5 px-3 pb-1 pt-2">
      <p className="text-[12.5px] font-bold text-[#111110]">
        체크 큐{" "}
        <span className="tabular-nums text-[#084734]">
          <span className="sr-only">대기 </span>
          {openCount}
          <span className="sr-only">건</span>
        </span>
      </p>
      <span className="flex-1" />
      {searchable ? (
        <button
          ref={searchButtonRef}
          type="button"
          onClick={toggleSearch}
          aria-expanded={searchOpen}
          aria-controls={searchInputId}
          aria-label={searchOpen ? "체크 큐 검색 닫기" : "체크 큐 검색"}
          title={searchOpen ? "검색 닫기" : "검색"}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[#F6F5F4] hover:text-[#111110] ${
            searchOpen ? "bg-[#F6F5F4] text-[#111110]" : "text-[#615D59]"
          } ${FOCUS_RING}`}
        >
          <Search aria-hidden className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onReload}
        aria-label="체크 큐 새로고침"
        title="새로고침"
        className={`flex h-7 w-7 items-center justify-center rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] ${FOCUS_RING}`}
      >
        <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  )

  // 경고 띠 — 로컬 fallback 안내(지금 문구 그대로: 로컬 임시 초안은 장부에 적용할 수 없다)와 큐 오류 문구를 한 띠에 모은다.
  const notice =
    mode !== "server" || error ? (
      <div className="mx-3 mb-1.5 flex items-start gap-1.5 rounded-md bg-[#FBF1E0] px-2 py-1.5 text-[11px] leading-relaxed text-[#7A520F]">
        <AlertTriangle aria-hidden className="mt-[3px] h-3 w-3 shrink-0 text-[#A8741A]" />
        <div className="min-w-0 space-y-0.5">
          {mode !== "server" && (
            <p className="font-bold">
              {modeLabel} — 로컬 임시 초안은 DB 장부에 적용할 수 없습니다. 서버 큐가 복구된 뒤 적용하세요.
            </p>
          )}
          {error && <p className="font-semibold">{error}</p>}
        </div>
      </div>
    ) : null

  if (loading && drafts.length === 0) {
    return (
      <div>
        {header}
        <div className="flex min-h-[96px] items-center justify-center text-[12px] font-semibold text-[#615D59]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          입력 큐를 불러오는 중
        </div>
      </div>
    )
  }

  if (drafts.length === 0) {
    return (
      <div>
        {header}
        {notice}
        <p className="px-3 pb-4 pt-1 text-[12px] leading-relaxed text-[#615D59]">
          아직 초안이 없습니다. 장부에서 칸을 고치거나 입력 탭에서 새 초안을 만들면 여기에 쌓입니다.
        </p>
      </div>
    )
  }

  // 스크롤은 목록(ul) 혼자 한다 — 머리 줄 · 경고 띠 · 검색칸 · 상태 탭은 위에, 일괄 띠는 아래에 늘 보인다.
  // 예전에는 레일(aside) 전체가 스크롤해 긴 목록에서 머리 · 탭이 위로 사라지고, sticky 일괄 띠는 레일 안쪽 여백만큼
  // 떠서 그 틈으로 지나가는 줄이 비쳤다. 부모(빠른 작업 레일의 큐 패널)가 높이를 주는 flex 열이라 min-h-0 으로 줄어든다.
  return (
    <>
    <div className="flex min-h-0 flex-col">
      <div className="shrink-0">
        {header}
        {notice}
      </div>
      <div hidden={!searchOpen} className="shrink-0 px-3 pb-1.5">
        <label className="relative block">
          <span className="sr-only">체크 큐 검색</span>
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
          <input
            ref={searchInputRef}
            id={searchInputId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Esc — 검색어를 지우고 칸을 접은 뒤 검색 아이콘으로 포커스를 돌린다.
              if (event.key !== "Escape") return
              event.preventDefault()
              event.stopPropagation()
              setQuery("")
              setSearchOpen(false)
              searchButtonRef.current?.focus()
            }}
            placeholder="고객, 담당자, 메모, 시트 행 검색"
            className="h-7 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white pl-7 pr-2 text-[11.5px] font-semibold text-[#111110] outline-none placeholder:font-normal placeholder:text-[#78736D] focus:border-[#084734]"
          />
        </label>
      </div>
      {/* 상태 탭(D5) — 테두리 없는 알약 3개. 건수는 검색 결과 기준. */}
      <div role="group" aria-label="상태로 거르기" className="flex shrink-0 items-center gap-0.5 px-3 pb-1.5">
        {DRAFT_STATUS_FILTERS.map((item) => {
          const active = statusFilter === item.id
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(item.id)}
              className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11.5px] transition ${FOCUS_RING} ${
                active ? "bg-[#111110] font-bold text-white" : "font-semibold text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110]"
              }`}
            >
              {item.label}
              <span className="tabular-nums">{filterCounts[item.id]}</span>
            </button>
          )
        })}
      </div>
      {visibleDrafts.length === 0 ? (
        <p className="shrink-0 border-t border-[#F0F0EC] px-3 py-6 text-center text-[12px] text-[#615D59]">
          {statusFilter === "open" && !query ? "대기 중인 초안이 없습니다." : "조건에 맞는 초안이 없습니다."}
        </p>
      ) : (
        // relative — 줄 안의 sr-only(절대 위치) 글자가 목록을 기준으로 놓이게 한다. 아니면 가장 가까운 위치 지정 조상인
        // 레일(sticky)에 붙어, 목록 밖으로 내려간 줄의 sr-only 가 레일을 다시 스크롤 가능하게 만든다(머리 · 탭이 밀려 올라간다).
        <ul aria-label="체크 큐 초안" className="relative min-h-0 overflow-y-auto overscroll-contain border-t border-[#F0F0EC]">
          {visibleDrafts.map((draft) => {
            const reversed = reversedDraftIds.has(draft.id)
            const statusLabel = draftStatusMeta(draft.status, reversed).label
            const localOnly = draft.id.startsWith("local-")
            const customerName = draft.customer || "초안"
            const expanded = expandedId === draft.id
            const panelId = `${baseId}-row-${draft.id}`
            const weekMatch = /^w([1-5])$/.exec(metadataString(draft.metadata, "week") ?? "")
            const mergedWeekly = mergedWeeklyFromMetadata(draft.metadata)
            // 주차 셀 초안 고지: 병합(metadata.weekly 보존) vs 레거시 단일값(월 전체 대체) 구분 — 판정은 예전 카드와 같다.
            // 레거시(월 전체 대체)는 "다른 주차 값 소멸"을 놓치면 안 되는 경고라 줄 배경을 Warning 틴트로 칠한다.
            const weekCellNotice = draft.kind === "edit-row" && weekMatch !== null && draft.status !== "applied" && draft.status !== "cancelled"
            const legacyWeekReplace = weekCellNotice && !mergedWeekly
            const sheetWrite = sheetWrites?.[draft.id]
            const sheetBadge = sheetWrite ? sheetWriteBadge(sheetWrite) : null
            const sheetAlertTone: SheetAlertTone | null =
              sheetBadge && (sheetBadge.tone === "danger" || sheetBadge.tone === "warning") ? sheetBadge.tone : null
            const confidence = CONFIDENCE_TOKENS[draftAmountConfidence(draft.metadata)]
            const nextStep = nextStepForStatus(draft.status)
            const rowLinks = rowLinksForStatus(draft.status)
            // 둘째 줄 — "11월 W2 · 담당자 · 시트 342행 · 수정". 시트 행 번호는 장부 `#` 열과 같은 번호(sourceSheetRow).
            const metaText = [
              // 장부 월 머리("11월")와 같은 꼴 — 활성 회계연도 밖이면 해를 붙인다(F-46). 연도까지 필요한 곳(펼침 경고·확인 창)은
              // formatMonthLabel 그대로.
              `${queueMonthLabel(draft.month, fiscalMonths)}${weekMatch ? ` W${weekMatch[1]}` : ""}`,
              draft.manager || "-",
              draft.sourceSheetRow ? `시트 ${draft.sourceSheetRow}행` : "새 행",
              draft.kind === "edit-row" ? "수정" : "신규",
            ].join(" · ")
            const detailText = [
              localOnly ? `${statusLabel}(로컬 임시)` : statusLabel,
              `확도 ${confidence.label}`,
              draft.team,
            ]
              .filter(Boolean)
              .join(" · ")
            return (
              <li
                key={draft.id}
                className={`border-b border-[#F0F0EC] last:border-b-0 ${
                  legacyWeekReplace ? "bg-[#FBF1E0]" : expanded ? "bg-[#FAFAF8]" : ""
                }`}
              >
                <div className="flex items-start gap-2 px-3 py-[3px]">
                  <span
                    aria-hidden
                    title={statusLabel}
                    className={`mt-[4.5px] h-2 w-2 shrink-0 rounded-full ${draftStatusDotClass(draft, reversed)}`}
                  />
                  {/* 줄 본문 = 펼침 버튼. 고객명(굵게) + 둘째 줄 글자(배지 대신 — 수정 · 신규 · 자가 체크 · 시트 쓰기). */}
                  <button
                    ref={(node) => {
                      if (node) rowButtonRefs.current.set(draft.id, node)
                      else rowButtonRefs.current.delete(draft.id)
                    }}
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : draft.id)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className={`min-w-0 flex-1 rounded-sm text-left ${FOCUS_RING}`}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      {legacyWeekReplace && <AlertTriangle aria-hidden className="h-3 w-3 shrink-0 text-[#A8741A]" />}
                      <span className="truncate text-[12.5px] font-bold leading-[17px] text-[#111110]">
                        {draft.customer || "고객명 미입력"}
                      </span>
                      {/* 시트 쓰기가 막혔거나(실패 · 충돌) 결과를 모르면(확인 중) 고객명 바로 옆 작은 틴트 배지 — 둘째 줄 끝에
                          두면 긴 줄에서 잘려 안 보인다. 고객명이 대신 줄어든다. 사유 전문은 펼친 줄에. */}
                      {sheetBadge && sheetAlertTone && (
                        <span
                          data-sheet-write-badge={sheetBadge.tone}
                          title={sheetBadge.message}
                          aria-label={`시트 쓰기 ${sheetBadge.label} — ${sheetBadge.message}`}
                          className={`shrink-0 text-[10.5px] leading-4 ${SHEET_WRITE_BADGE_CLASS[sheetBadge.tone]}`}
                        >
                          {sheetBadge.label}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] leading-4 text-[#615D59]">
                      {metaText}
                      {/* 자가 체크(입력 속도 라운드 4 P0-2): 매트릭스 셀 커밋은 저장 시점에 체크까지 끝난다 —
                          남(검수자)의 체크와 구분되게 created_by===checked_by 파생 표시를 둘째 줄 글자로 단다. */}
                      {isSelfCheckedDraft(draft) && <span title={SELF_CHECK_BADGE_TITLE}> · {SELF_CHECK_BADGE_LABEL}</span>}
                      {sheetBadge && !sheetAlertTone && (
                        <>
                          {" · "}
                          <span
                            data-sheet-write-badge={sheetBadge.tone}
                            title={sheetBadge.message}
                            aria-label={`시트 쓰기 ${sheetBadge.label} — ${sheetBadge.message}`}
                            className={SHEET_WRITE_BADGE_CLASS[sheetBadge.tone]}
                          >
                            {sheetBadge.label}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="sr-only">
                      {` · ${statusLabel}`}
                      {legacyWeekReplace ? " · 주의: 적용하면 월 금액 전체가 바뀝니다" : ""}
                    </span>
                  </button>
                  {/* 오른쪽: 금액(확도 색) 밑에 다음 단계 버튼 하나만 — 검토중이면 체크, 체크완료면 적용. 적용 · 취소된
                      초안은 버튼 없이 상태 글자만. 활성 조건 · 확인 다이얼로그는 예전 체크/적용 버튼과 같다. */}
                  <div className="flex shrink-0 flex-col items-end">
                    <span
                      title={`확도 ${confidence.label}`}
                      className={`text-[12.5px] font-bold leading-4 tabular-nums ${
                        draft.status === "cancelled" || reversed ? "text-[#615D59]" : confidence.textStrongClass
                      }`}
                    >
                      {formatMoney(draft.amount)}
                    </span>
                    {nextStep === "check" ? (
                      <button
                        key={`next-step-${draft.id}`}
                        ref={registerPill(draft.id)}
                        type="button"
                        onClick={() => void runToggle(draft.id)}
                        disabled={draft.status === "applied" || draft.status === "cancelled"}
                        aria-disabled={isRowBusy(draft.id) || undefined}
                        className={`inline-flex h-[18px] min-w-[40px] items-center justify-center gap-1 rounded-full bg-[#ECFDF5] px-2 text-[11px] font-bold text-[#084734] transition hover:bg-[#BDEFD8] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${FOCUS_RING}`}
                        aria-label={`${customerName} 체크`}
                        title="초안 체크"
                      >
                        {rowActionBusy?.id === draft.id && rowActionBusy.action === "toggle" ? (
                          <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
                        ) : null}
                        체크
                      </button>
                    ) : nextStep === "apply" ? (
                      <button
                        key={`next-step-${draft.id}`}
                        ref={registerPill(draft.id)}
                        type="button"
                        onClick={() => {
                          if (isRowBusy(draft.id) || applyBusy) return
                          setConfirmApplyDraft(draft)
                        }}
                        disabled={draft.status !== "checked" || mode !== "server" || draft.id.startsWith("local-")}
                        aria-disabled={isRowBusy(draft.id) || applyBusy || undefined}
                        className={`inline-flex h-[18px] min-w-[40px] items-center justify-center gap-1 rounded-full bg-[#084734] px-2 text-[11px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${FOCUS_RING}`}
                        aria-label={`${customerName} 적용`}
                        title={
                          mode !== "server" || localOnly
                            ? "로컬 임시 초안은 DB 장부에 적용할 수 없습니다"
                            : applyBusy && !applyingIds?.has(draft.id)
                              ? "다른 반영이 끝난 뒤 적용할 수 있습니다"
                              : "체크 완료 초안 적용"
                        }
                      >
                        {applyingId === draft.id || applyingIds?.has(draft.id) ? <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> : null}
                        {applyingIds?.has(draft.id) ? "반영 중…" : "적용"}
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold leading-[18px] text-[#615D59]">{statusLabel}</span>
                    )}
                  </div>
                </div>

                {/* 품질 웨이브 7 — 항목 2: 레코드별 에러(404 등) — 큐 전체를 로컬로 강등하지 않고 이
                    행에만 문구+새로고침 유도를 낸다. 접어 두지 않는다(바로 보여야 하는 오류). */}
                {recordErrors.get(draft.id) && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 pb-1.5 pl-7 pr-3 text-[11px] font-semibold leading-snug text-[#8F2C2C]"
                  >
                    <span className="min-w-0 flex-1">{recordErrors.get(draft.id)}</span>
                    <button
                      type="button"
                      onClick={onReload}
                      className={`shrink-0 rounded-sm text-[11px] font-bold text-[#B43E3E] underline underline-offset-2 transition hover:text-[#8F2C2C] ${FOCUS_RING}`}
                    >
                      새로고침
                    </button>
                  </div>
                )}

                {/* 펼친 줄 — 경고 전문 · 메모 · 주차 확도 · 상세 한 줄 · 글자 링크. 접힌 동안에도 DOM에 두고 hidden으로만
                    가린다(aria-controls 대상 유지). */}
                <div id={panelId} hidden={!expanded} className="space-y-1 pb-2 pl-7 pr-3 text-[11.5px] leading-relaxed text-[#31302E]">
                  {legacyWeekReplace && (
                    <p className="flex items-start gap-1 font-semibold text-[#7A520F]">
                      <AlertTriangle aria-hidden className="mt-[3px] h-3 w-3 shrink-0 text-[#A8741A]" />
                      <span>
                        주차 셀 초안 — 적용 시 {formatMonthLabel(draft.month)} 금액 전체가 이 값으로 대체됩니다 (다른 주차 값 소멸)
                      </span>
                    </p>
                  )}
                  {weekCellNotice && mergedWeekly && (
                    <p className="text-[#615D59]">
                      주차 병합 초안 — 적용 시 {formatMonthLabel(draft.month)} 금액이 주차 합계 {formatMoney(draft.amount)}로 재기재됩니다 (기존 주차 보존)
                    </p>
                  )}
                  {/* 시트 쓰기가 막혔거나 결과를 모를 때는 무엇을 하면 되는지(messages.ts 문구)를 한 줄로 보인다.
                      목록 전체에 남는 기록이라 alert 로 읽히게 하지 않는다(방금 누른 반영의 결과는 결과 줄·배너가 알린다). */}
                  {sheetBadge && sheetAlertTone && (
                    <div className="flex items-start gap-1">
                      <AlertTriangle aria-hidden className={`mt-[3px] h-3 w-3 shrink-0 ${SHEET_WRITE_ICON_CLASS[sheetAlertTone]}`} />
                      <p data-sheet-write-reason className={`font-semibold ${SHEET_WRITE_REASON_CLASS[sheetAlertTone]}`}>
                        {sheetBadge.message}
                      </p>
                    </div>
                  )}
                  {draft.note && <p className="whitespace-pre-wrap break-words">{draft.note}</p>}
                  <WeeklyConfidenceDots metadata={draft.metadata} />
                  <p className="text-[11px] text-[#615D59]">{detailText}</p>
                  {/* 글자 링크 — 예전 네모 아이콘 버튼 4개 + 체크 해제. 활성 조건 · 확인 다이얼로그는 그대로이고, 상태상
                      애초에 못 쓰는 링크는 숨긴다(검토중: 편집 · 초안 취소 · 삭제, 체크완료: 체크 해제 · 초안 취소, 적용: 되돌리기). */}
                  {Object.values(rowLinks).some(Boolean) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                      {rowLinks.edit && (
                        <button
                          type="button"
                          onClick={() => onEdit(draft)}
                          disabled={draft.status === "checked" || draft.status === "applied" || draft.status === "cancelled"}
                          className={ROW_LINK_CLASS}
                          aria-label={`${customerName} 편집`}
                          title="초안 편집"
                        >
                          편집
                        </button>
                      )}
                      {rowLinks.uncheck && (
                        <button
                          type="button"
                          onClick={() => void runToggle(draft.id)}
                          disabled={draft.status === "applied" || draft.status === "cancelled"}
                          aria-disabled={isRowBusy(draft.id) || undefined}
                          className={ROW_LINK_CLASS}
                          aria-label={`${customerName} 체크 해제`}
                          title="체크를 풀면 다시 편집할 수 있습니다"
                        >
                          {rowActionBusy?.id === draft.id && rowActionBusy.action === "toggle" ? (
                            <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
                          ) : null}
                          체크 해제
                        </button>
                      )}
                      {rowLinks.reverse && (
                        <button
                          type="button"
                          onClick={() => setConfirmReverseDraft(draft)}
                          disabled={
                            draft.status !== "applied" ||
                            mode !== "server" ||
                            draft.id.startsWith("local-") ||
                            reversedDraftIds.has(draft.id) ||
                            isRowBusy(draft.id) ||
                            sheetBlocksReverse(draft.id)
                          }
                          className={ROW_LINK_CLASS}
                          aria-label={`${customerName} 적용 되돌리기`}
                          title={reversedDraftIds.has(draft.id) ? "이미 상쇄된 적용입니다" : sheetBlocksReverse(draft.id) ? sheetWrittenReverseMessage(sheetLock) : "적용 되돌리기"}
                        >
                          {reversingId === draft.id ? <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> : null}
                          적용 되돌리기
                        </button>
                      )}
                      {rowLinks.cancel && (
                        <button
                          type="button"
                          onClick={() => setConfirmCancelDraft(draft)}
                          disabled={draft.status === "applied" || draft.status === "cancelled" || isRowBusy(draft.id)}
                          className={ROW_LINK_CLASS}
                          aria-label={`${customerName} 초안 취소`}
                          title="초안 취소(감사 기록 보존)"
                        >
                          {rowActionBusy?.id === draft.id && rowActionBusy.action === "cancel" ? (
                            <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
                          ) : null}
                          초안 취소
                        </button>
                      )}
                      {rowLinks.remove && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDraft(draft)}
                          disabled={
                            draft.status === "checked" ||
                            draft.status === "applied" ||
                            draft.status === "cancelled" ||
                            isRowBusy(draft.id) ||
                            sheetBlocksDelete(draft.id)
                          }
                          className={ROW_LINK_DANGER_CLASS}
                          aria-label={`${customerName} 삭제`}
                          title={sheetBlocksDelete(draft.id) ? SHEET_WRITE_HISTORY_DELETE_MESSAGE : "초안 삭제"}
                        >
                          {rowActionBusy?.id === draft.id && rowActionBusy.action === "delete" ? (
                            <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
                          ) : null}
                          삭제
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {/* 일괄 동작(2026-09-14) — 목록 아래 고정 띠(P0-5). 왼쪽 "보이는 초안 N건 체크", 오른쪽 "체크완료 N건 · ¥합계
          [N건 (시트·)장부에 반영]"(인라인 확인을 한 번 더 거친다 — 표 아래 변경 대기 줄과 같은 말). 할 일이 없으면 띠 자체를 숨긴다. 목록만 스크롤하므로
          sticky 가 아니라 흐름 안의 마지막 줄이다(줄어들지 않는다). */}
      {(onBulkCheck || onBulkApply) && (bulkCheckPlan.count > 0 || bulkApplyPlan.count > 0 || bulkResult || outOfScopeChecked > 0) && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-b-lg border-t border-[#F0F0EC] bg-white px-3 py-2">
          {onBulkCheck && bulkCheckPlan.count > 0 && (
            <button
              type="button"
              onClick={() => void runBulkCheck()}
              disabled={bulkBusy !== null}
              className={ROW_LINK_CLASS}
            >
              {bulkBusy === "check" ? <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> : null}
              보이는 초안 {bulkCheckPlan.count}건 체크
            </button>
          )}
          {bulkResult && !bulkApplyConfirm && (
            <span role="status" className="text-[11px] font-semibold text-[#615D59]">{bulkResult}</span>
          )}
          {outOfScopeChecked > 0 && !bulkApplyConfirm && (
            // F-21: 화면 범위 밖(다른 담당자·팀)의 체크완료는 여기서 반영하지 않는다 — 건수만 조용히.
            <span className="text-[11px] text-[#615D59]">다른 담당자 체크완료 {outOfScopeChecked}건 제외</span>
          )}
          <span className="flex-1" />
          {onBulkApply && bulkApplyPlan.count > 0 && !bulkApplyConfirm && (
            // 누르기 전에 장부에 쓰일 건수 · 합계를 보인다(C-4 "체크된 2건 · ¥합계 [적용]"). 요약과 버튼은 한 묶음 —
            // 좁으면 함께 다음 줄 오른쪽으로 내려간다. 건수 · 합계는 확인 문구와 같은 값(로컬 임시 초안 제외).
            <span className="ml-auto inline-flex shrink-0 items-center gap-2">
              <span className="text-[11.5px] text-[#31302E]">
                {DRAFT_STATUS_LABELS.checked} <b className="tabular-nums">{bulkApplyPlan.count}</b>건 ·{" "}
                <b className="tabular-nums">{formatMoney(bulkApplyPlan.total)}</b>
              </span>
              <button
                type="button"
                onClick={() => setBulkApplyConfirm(true)}
                disabled={bulkBusy !== null || applyBusy}
                className={`inline-flex h-7 items-center gap-1 rounded-md bg-[#084734] px-3 text-[11.5px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
              >
                {applyBusy ? (
                  <>
                    <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
                    반영 중…
                  </>
                ) : (
                  <>
                    {bulkApplyMultiOwner ? "전체 담당자 " : ""}
                    {bulkApplyPlan.count}건 {sheetWriteMode === "on" ? "시트·장부에" : "장부에"} 반영
                  </>
                )}
              </button>
            </span>
          )}
          {bulkApplyConfirm && (
            <span role="alert" className="flex basis-full flex-wrap items-center gap-1.5 text-[11px] font-bold text-[#111110]">
              <span className="min-w-0 flex-1">
                {bulkApplyMultiOwner ? "전체 담당자 " : ""}
                {bulkApplyPlan.count}건 · {formatMoney(bulkApplyPlan.total)}을 {sheetWriteMode === "on" ? "시트(2. REV)와 DB 장부에" : "DB 장부에"} 반영합니다
                {bulkApplyPlan.skippedLocal > 0 ? ` (로컬 임시 ${bulkApplyPlan.skippedLocal}건 제외)` : ""}
                {/* F-21: 담당자가 여럿이면 누구의 초안을 반영하는지 확인 문구에 담당자별 건수를 붙인다. */}
                {bulkApplyMultiOwner ? <span className="block font-semibold text-[#615D59]">{bulkApplyOwners.text}</span> : null}
              </span>
              <button
                type="button"
                onClick={() => void runBulkApply()}
                disabled={bulkBusy !== null || applyBusy}
                className={`inline-flex h-7 items-center gap-1 rounded-md bg-[#084734] px-3 text-white transition hover:bg-[#065c41] disabled:opacity-50 ${FOCUS_RING}`}
              >
                {bulkBusy === "apply" ? <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> : null}
                반영
              </button>
              <button
                type="button"
                onClick={() => setBulkApplyConfirm(false)}
                disabled={bulkBusy === "apply"}
                className={`inline-flex h-7 items-center rounded-md px-2 text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] ${FOCUS_RING}`}
              >
                취소
              </button>
            </span>
          )}
        </div>
      )}
    </div>
    {/* 적용 확인 다이얼로그 — TSV 붙여넣기 미리보기(RevMatrixPasteDialog)와 동일 셸 스타일 재사용. */}
    {confirmApplyDraft && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="초안 적용 확인"
        className="fixed inset-0 z-[60] flex items-end justify-center bg-[#111110]/40 p-4 sm:items-center"
      >
        <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_24px_70px_rgba(17,17,16,0.22)]">
          <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
            <p className="text-[13px] font-bold text-[#111110]">초안 적용 확인</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
              {confirmApplyDraft.customer || "초안"} · {formatMonthLabel(confirmApplyDraft.month)} · {formatMoney(confirmApplyDraft.amount)}
            </p>
          </div>
          <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FBF1E0] px-4 py-3 text-[11.5px] font-semibold leading-relaxed text-[#7A520F]">
            적용하면 장부 원본에 기록됩니다 — 초안 1건. 이 작업은 되돌릴 수 없습니다.
          </div>
          <div className="flex items-center justify-end gap-2 bg-[#FAFAF8] px-4 py-3">
            <button
              ref={confirmApplyCancelRef}
              type="button"
              onClick={() => setConfirmApplyDraft(null)}
              disabled={applyingId === confirmApplyDraft.id}
              className="inline-flex h-9 items-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-45"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void confirmAndApply(confirmApplyDraft.id)}
              disabled={applyingId === confirmApplyDraft.id || Boolean(applyingIds?.has(confirmApplyDraft.id))}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {applyingId === confirmApplyDraft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              적용
            </button>
          </div>
        </div>
      </div>
    )}
    {/* 되돌리기 확인 다이얼로그(웨이브 5) — 적용 확인 다이얼로그와 동일 셸 재사용. danger는 아니다
        (초안 기록은 감사용으로 그대로 남는다) — warning 톤(#ECD29C/#FBF1E0/#7A520F)으로 구분. */}
    {confirmReverseDraft && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="적용 되돌리기 확인"
        className="fixed inset-0 z-[60] flex items-end justify-center bg-[#111110]/40 p-4 sm:items-center"
      >
        <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_24px_70px_rgba(17,17,16,0.22)]">
          <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
            <p className="text-[13px] font-bold text-[#111110]">적용 되돌리기 확인</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
              {confirmReverseDraft.customer || "초안"} · {formatMonthLabel(confirmReverseDraft.month)} · {formatMoney(confirmReverseDraft.amount)}
            </p>
          </div>
          <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FBF1E0] px-4 py-3 text-[11.5px] font-semibold leading-relaxed text-[#7A520F]">
            적용을 상쇄합니다. 초안 기록은 감사용으로 유지됩니다.
          </div>
          <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
            <label className="block text-[10.5px] font-bold text-[#615D59]">
              사유(선택)
              <input
                value={reverseReason}
                onChange={(event) => setReverseReason(event.target.value)}
                disabled={reversingId === confirmReverseDraft.id}
                placeholder="예: 고객 요청으로 취소"
                className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 bg-[#FAFAF8] px-4 py-3">
            <button
              ref={confirmReverseCancelRef}
              type="button"
              onClick={closeReverseDialog}
              disabled={reversingId === confirmReverseDraft.id}
              className="inline-flex h-9 items-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-45"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void confirmAndReverse(confirmReverseDraft.id)}
              disabled={reversingId === confirmReverseDraft.id}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-3 text-[12px] font-bold text-[#7A520F] transition hover:bg-[#F5E4C3] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {reversingId === confirmReverseDraft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              되돌리기
            </button>
          </div>
        </div>
      </div>
    )}
    {/* 삭제 확인 다이얼로그(품질 웨이브 4 — 항목 3) — 적용 확인 다이얼로그와 동일 셸 재사용,
        danger 톤(삭제 버튼과 동일 캐논 #B43E3E/#FCE9E9)만 다르다. */}
    {confirmDeleteDraft && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="초안 삭제 확인"
        className="fixed inset-0 z-[60] flex items-end justify-center bg-[#111110]/40 p-4 sm:items-center"
      >
        <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_24px_70px_rgba(17,17,16,0.22)]">
          <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
            <p className="text-[13px] font-bold text-[#111110]">초안 삭제 확인</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
              {confirmDeleteDraft.customer || "초안"} · {formatMonthLabel(confirmDeleteDraft.month)} · {formatMoney(confirmDeleteDraft.amount)}
            </p>
          </div>
          <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FCE9E9] px-4 py-3 text-[11.5px] font-semibold leading-relaxed text-[#8F2C2C]">
            삭제하면 이 초안이 완전히 사라집니다. 이 작업은 되돌릴 수 없습니다.
          </div>
          <div className="flex items-center justify-end gap-2 bg-[#FAFAF8] px-4 py-3">
            <button
              ref={confirmDeleteCancelRef}
              type="button"
              onClick={() => setConfirmDeleteDraft(null)}
              disabled={deletingConfirmed}
              className="inline-flex h-9 items-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-45"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void confirmAndDelete(confirmDeleteDraft.id)}
              disabled={deletingConfirmed}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[#B43E3E] bg-white px-3 text-[12px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {deletingConfirmed ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              삭제
            </button>
          </div>
        </div>
      </div>
    )}
    {/* 취소 확인 다이얼로그(품질 감사 2026-09-10 — #8) — 삭제 확인과 동일 셸, danger 아닌 warning
        톤(되돌리기 다이얼로그와 동일 배색) — 행이 사라지지 않고 cancelled로 남는다는 차이를
        문구로 명시한다. */}
    {confirmCancelDraft && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="초안 취소 확인"
        className="fixed inset-0 z-[60] flex items-end justify-center bg-[#111110]/40 p-4 sm:items-center"
      >
        <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_24px_70px_rgba(17,17,16,0.22)]">
          <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
            <p className="text-[13px] font-bold text-[#111110]">초안 취소 확인</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
              {confirmCancelDraft.customer || "초안"} · {formatMonthLabel(confirmCancelDraft.month)} · {formatMoney(confirmCancelDraft.amount)}
            </p>
          </div>
          <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FBF1E0] px-4 py-3 text-[11.5px] font-semibold leading-relaxed text-[#7A520F]">
            취소하면 체크·적용 대상에서 빠집니다. 삭제와 달리 기록은 감사용으로 남습니다.
          </div>
          <div className="flex items-center justify-end gap-2 bg-[#FAFAF8] px-4 py-3">
            <button
              ref={confirmCancelCancelRef}
              type="button"
              onClick={() => setConfirmCancelDraft(null)}
              disabled={cancellingConfirmed}
              className="inline-flex h-9 items-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-45"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => void confirmAndCancel(confirmCancelDraft.id)}
              disabled={cancellingConfirmed}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-3 text-[12px] font-bold text-[#7A520F] transition hover:bg-[#F5E4C3] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {cancellingConfirmed ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              초안 취소
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
