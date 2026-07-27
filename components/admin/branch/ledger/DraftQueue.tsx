"use client"

// SalesLedgerWorkbench에서 물리 이동(웨이브 7 2단 F5 — 기계적 분할, 로직 무변경): 검토 초안
// 체크 큐(검색/상태 필터 탭·체크 토글·적용/삭제/되돌리기 확인 다이얼로그·레코드별 에러 배지)와
// 상태 배지 SSOT 소비 헬퍼(draftStatusMeta·draftMatchesFilter/Query·DRAFT_STATUS_FILTERS).
// 회귀 테스트(tests/branch/draft-status-labels-ssot·ledger-record-error-isolation·
// ledger-entry-reverse-action)가 이 파일을 소스 스캔한다.

import { useMemo, useRef, useState } from "react"
import { CheckCircle2, Loader2, Pencil, RefreshCw, RotateCcw, Search, Send, Trash2 } from "lucide-react"

import { matchesTokens, tokenize } from "../search-tokens"
import { useDialogFocus } from "../../use-dialog-focus"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import {
  DRAFT_STATUS_LABELS,
  draftStatusLabel,
  formatMoney,
  formatMonthLabel,
  mergedWeeklyFromMetadata,
  metadataString,
  weeklyConfidenceFromMetadata,
  type DraftQueueMode,
  type DraftStatus,
  type LedgerDraft,
} from "./shared"

type DraftStatusFilter = DraftStatus | "open" | "all"

// 품질 웨이브 7 — 항목 4: draft/checked/applied 라벨은 DRAFT_STATUS_LABELS(ledger/shared.tsx)
// SSOT를 그대로 쓴다 — 예전엔 이 탭이 "검토"/"체크"/"적용"으로, 배지(draftStatusMeta)는
// "검토 필요"/"체크 완료"/"적용됨"으로 서로 다르게 불렀다. "대기"(open — draft+checked 묶음
// 필터)와 "전체"(all)는 단일 상태가 아니라 그대로 유지.
export const DRAFT_STATUS_FILTERS: Array<{ id: DraftStatusFilter; label: string }> = [
  { id: "open", label: "대기" },
  { id: "draft", label: DRAFT_STATUS_LABELS.draft },
  { id: "checked", label: DRAFT_STATUS_LABELS.checked },
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
    return { label: draftStatusLabel(status), className: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]" }
  }
  if (status === "applied") {
    if (reversed) {
      return { label: draftStatusLabel(status, true), className: "border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] text-[#615D59]" }
    }
    return { label: draftStatusLabel(status), className: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]" }
  }
  if (status === "cancelled") {
    // (미사용) — DB CHECK 제약(20260630_branch_sales_ledger_drafts.sql)엔 유효 상태지만
    // 이 워크벤치 어느 동작도 초안을 cancelled로 전이시키지 않는다(직접 DB 조작 등으로만 도달).
    // 배지는 그런 행이 조회될 가능성에 대비한 방어적 렌더 — DraftStatus 타입은 DB 계약과 맞춰 유지.
    return { label: draftStatusLabel(status), className: "border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] text-[#615D59]" }
  }
  return { label: draftStatusLabel(status), className: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]" }
}

function draftMatchesFilter(draft: LedgerDraft, filter: DraftStatusFilter) {
  if (filter === "all") return true
  if (filter === "open") return draft.status === "draft" || draft.status === "checked"
  return draft.status === filter
}

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

export function DraftQueue({
  drafts,
  mode,
  loading,
  error,
  reversedDraftIds,
  recordErrors,
  onReload,
  onEdit,
  onToggle,
  onApply,
  onDelete,
  onReverse,
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
  onReload: () => void
  onEdit: (draft: LedgerDraft) => void
  onToggle: (id: string) => void | Promise<void>
  onApply: (id: string) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onReverse: (id: string, reason?: string) => Promise<unknown> | void
}) {
  const modeLabel = mode === "server" ? "서버 큐" : "로컬 fallback"
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<DraftStatusFilter>("open")
  const visibleDrafts = useMemo(() => {
    return drafts.filter((draft) => draftMatchesFilter(draft, statusFilter)).filter((draft) => draftMatchesQuery(draft, query))
  }, [drafts, query, statusFilter])
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
  const [rowActionBusy, setRowActionBusy] = useState<{ id: string; action: "toggle" | "delete" } | null>(null)
  const isRowBusy = (id: string) => rowActionBusy?.id === id || applyingId === id || reversingId === id
  const runToggle = async (id: string) => {
    setRowActionBusy({ id, action: "toggle" })
    try {
      await onToggle(id)
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

  if (loading && drafts.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[12px] font-semibold text-[#615D59]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        입력 큐를 불러오는 중
      </div>
    )
  }

  if (drafts.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 py-0.5 text-[10px] font-bold text-[#615D59]">
            {modeLabel}
          </span>
          <button
            type="button"
            onClick={onReload}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] px-2 text-[10px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4]"
          >
            <RefreshCw className="h-3 w-3" />
            새로고침
          </button>
        </div>
        {error && (
          <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] p-3 text-[11px] leading-relaxed text-[#7A520F]">
            {error}
          </div>
        )}
        <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-4 text-[12px] leading-relaxed text-[#615D59]">
          아직 저장된 입력/수정 초안이 없습니다. REV 행을 선택하거나 아래 입력 폼으로 새 장부 초안을 만들 수 있습니다.
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
          mode === "server" ? "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]" : "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"
        }`}>
          {modeLabel}
        </span>
        <button
          type="button"
          onClick={onReload}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] px-2 text-[10px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4]"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>
      {error && (
        <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] p-3 text-[11px] leading-relaxed text-[#7A520F]">
          {error}
        </div>
      )}
      <div className="space-y-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2">
        <label className="relative block">
          <span className="sr-only">체크 큐 검색</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="고객, 담당자, 메모 검색"
            className="h-8 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white pl-8 pr-2 text-[11px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {DRAFT_STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`rounded-md px-2 py-1 text-[10px] font-bold transition ${
                statusFilter === item.id
                  ? "bg-[#111110] text-white"
                  : "border border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:text-[#111110]"
              }`}
            >
              {item.label}
            </button>
          ))}
          <span className="ml-auto px-1 py-1 text-[10px] font-bold text-[#615D59]">
            {visibleDrafts.length}/{drafts.length}건
          </span>
        </div>
      </div>
      {visibleDrafts.length === 0 && (
        <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-4 text-[12px] leading-relaxed text-[#615D59]">
          현재 검색/상태 조건에 맞는 초안이 없습니다.
        </div>
      )}
      {visibleDrafts.map((draft) => (
        <div key={draft.id} className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${draftStatusMeta(draft.status, reversedDraftIds.has(draft.id)).className}`}>
                  {draftStatusMeta(draft.status, reversedDraftIds.has(draft.id)).label}
                </span>
                <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 py-0.5 text-[10px] font-bold text-[#615D59]">
                  {draft.kind === "edit-row" ? "수정" : "신규 입력"}
                </span>
                {draft.sourceSheetRow ? (
                  <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 py-0.5 text-[10px] font-bold text-[#615D59]">
                    REV row {draft.sourceSheetRow}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 truncate text-[13px] font-bold text-[#111110]">{draft.customer || "고객명 미입력"}</p>
              <p className="mt-1 text-[11px] text-[#615D59]">
                {formatMonthLabel(draft.month)} · {draft.manager || "-"} · {draft.team || "-"} · {formatMoney(draft.amount)}
              </p>
              <WeeklyConfidenceDots metadata={draft.metadata} />
              {/* 주차 셀 초안 고지: 병합(metadata.weekly 보존) vs 레거시 단일값(월 전체 대체) 구분 */}
              {draft.kind === "edit-row" &&
                /^w[1-5]$/.test(metadataString(draft.metadata, "week") ?? "") &&
                draft.status !== "applied" &&
                draft.status !== "cancelled" &&
                (mergedWeeklyFromMetadata(draft.metadata) ? (
                  <p className="mt-1.5 rounded border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 py-1 text-[10.5px] font-semibold leading-relaxed text-[#615D59]">
                    주차 병합 초안 — 적용 시 {formatMonthLabel(draft.month)} 금액이 주차 합계 {formatMoney(draft.amount)}로 재기재됩니다 (기존 주차 보존)
                  </p>
                ) : (
                  <p className="mt-1.5 rounded border border-[#ECD29C] bg-[#FBF1E0] px-2 py-1 text-[10.5px] font-bold leading-relaxed text-[#7A520F]">
                    주차 셀 초안 — 적용 시 {formatMonthLabel(draft.month)} 금액 전체가 이 값으로 대체됩니다 (다른 주차 값 소멸)
                  </p>
                ))}
              {draft.note && <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[#615D59]">{draft.note}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(draft)}
                disabled={draft.status === "checked" || draft.status === "applied" || draft.status === "cancelled"}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={`${draft.customer || "초안"} 편집`}
                title="초안 편집"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void runToggle(draft.id)}
                disabled={draft.status === "applied" || draft.status === "cancelled" || isRowBusy(draft.id)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#084734] transition hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="초안 체크 상태 변경"
                title="초안 체크 상태 변경"
              >
                {rowActionBusy?.id === draft.id && rowActionBusy.action === "toggle" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfirmApplyDraft(draft)}
                disabled={draft.status !== "checked" || mode !== "server" || draft.id.startsWith("local-") || isRowBusy(draft.id)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#BDEFD8] text-[#084734] transition hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={`${draft.customer || "초안"} 적용`}
                title="체크 완료 초안 적용"
              >
                {applyingId === draft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setConfirmReverseDraft(draft)}
                disabled={
                  draft.status !== "applied" ||
                  mode !== "server" ||
                  draft.id.startsWith("local-") ||
                  reversedDraftIds.has(draft.id) ||
                  isRowBusy(draft.id)
                }
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#ECD29C] text-[#7A520F] transition hover:bg-[#FBF1E0] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={`${draft.customer || "초안"} 적용 되돌리기`}
                title={reversedDraftIds.has(draft.id) ? "이미 상쇄된 적용입니다" : "적용 되돌리기"}
              >
                {reversingId === draft.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteDraft(draft)}
                disabled={draft.status === "checked" || draft.status === "applied" || draft.status === "cancelled" || isRowBusy(draft.id)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#B43E3E] transition hover:bg-[#FCE9E9] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="초안 삭제"
                title="초안 삭제"
              >
                {rowActionBusy?.id === draft.id && rowActionBusy.action === "delete" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          {/* 품질 웨이브 7 — 항목 2: 레코드별 에러(404 등) — 큐 전체를 로컬로 강등하지 않고 이
              행에만 배지+새로고침 유도를 낸다. */}
          {recordErrors.get(draft.id) && (
            <div
              role="alert"
              className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#F2B8B8] bg-[#FCE9E9] px-2.5 py-1.5 text-[10.5px] font-semibold leading-relaxed text-[#8F2C2C]"
            >
              <span className="min-w-0">{recordErrors.get(draft.id)}</span>
              <button
                type="button"
                onClick={onReload}
                className="shrink-0 rounded border border-[#B43E3E]/40 bg-white px-2 py-0.5 text-[10px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
              >
                새로고침
              </button>
            </div>
          )}
        </div>
      ))}
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
            적용하면 장부 원장에 기록됩니다 — 초안 1건. 이 작업은 되돌릴 수 없습니다.
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
              disabled={applyingId === confirmApplyDraft.id}
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
    </>
  )
}
