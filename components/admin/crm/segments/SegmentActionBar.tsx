"use client"

// 세그먼트 허브 — 결과 행동 바(저장된 조건 전체가 대상). 선택 행이 아니라 세그먼트 회원(서버 추천순 키)에 건다.
//  - 태그: GET [id]/members?limit=500 → POST /api/admin/crm/tags/bulk
//  - 오늘 연락에 넣기: members(200) → POST /api/admin/crm/tasks/bulk — 제목 "[세그먼트] <이름>", 기한 오늘 18:00 KST,
//    담당은 비운다(오늘 연락 목록은 대상 고객의 담당으로 보여 준다 — 2026-09-25 결정).
//  - CSV: 통합 고객 내보내기(관리자만 — 서버가 최종 판단, 세션 역할이 확실히 다르면 버튼을 막는다).
//  - 담당 배정: 리드만(leads/assignment-preview → leads/bulk-assign, 리드 보드와 같은 안전 미리보기 토큰).
//    NEO 계정 담당은 외부 CRM 소유라 다루지 않는다. Home 의 담당은 Compass 담당과 따로다(교차 쓰기 0).
// 메시지 발송은 이 바에 두지 않는다(발송 흐름은 별도 작업이 이 화면에 붙인다).
// 저장 안 된 변경이 있으면 행동을 막는다 — 서버가 저장된 조건으로 회원을 고르므로 화면과 대상이 어긋나지 않게.
// 결과 알림: 태그·오늘 연락·담당 배정 결과는 이 바 바로 아래에 인라인으로 남긴다(SegmentActionResult — 성공은
//   role=status, 일부 실패는 role=alert). 상세는 목록·미리보기 아래라 페이지 맨 위 배너로만 보내면 지금 보는 화면에
//   아무 피드백이 없다. 확인 링크: 태그 → "목록에서 보기"(통합 목록 ?tag=)·"태그 관리"(기본 숨김 탭 — 주소로 열린다),
//   오늘 연락 → "현황에서 보기". CSV 는 내려받기 자체가 피드백이라 위 배너(onNotice)를 그대로 쓴다.

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { ArrowUpRight, CalendarPlus, Download, Loader2, Tag, UserPlus } from "lucide-react"

import type { SavedSegmentListItem, SavedSegmentMembersResponse } from "@/lib/crm/saved-segment-api"
import type { CrmUnifiedCustomerSource } from "@/lib/crm/unified-view-rules"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"

import CrmNoticeBanner from "../CrmNoticeBanner"
import { useCrmOwners } from "../useCrmOwners"
import {
  BULK_TAG_MAX_LENGTH,
  bulkResultTone,
  normalizeBulkTagLabel,
  postBulkTags,
  postBulkTasks,
  summarizeBulkTagResult,
  summarizeBulkTaskResult,
  validateBulkTagLabel,
} from "../unified/bulk-actions"
import {
  CSV_EXPORT_FORBIDDEN_MESSAGE,
  canExportUnifiedCsv,
  describeCsvExport,
  downloadUnifiedCustomersCsv,
  readSessionAdminRole,
} from "../unified/export-csv"
import { unifiedCustomersTagHref } from "../unified/shared"
import {
  CRM_TAG_ADMIN_PATH,
  CRM_TODAY_CONTACTS_PATH,
  SEGMENT_ASSIGN_MEMBER_LIMIT,
  SEGMENT_TAG_MEMBER_LIMIT,
  SEGMENT_TASK_DUE_KST_HOUR,
  SEGMENT_TASK_MEMBER_LIMIT,
  applyLeadAssignment,
  describeAssignmentBlockers,
  describeBySource,
  fetchSegmentMembers,
  kstTodayAtIso,
  memberTruncationNote,
  previewLeadAssignment,
  segmentExportUrl,
  segmentTaskTitle,
  splitMemberKeys,
  type LeadAssignmentPreview,
  type MemberKeySplit,
} from "./segment-hub-api"

export const SEGMENT_ASSIGN_NEO_REASON = "NEO 계정 담당은 외부 CRM 소유라 여기서 바꾸지 않습니다."

/** 행동 바 전체를 막는 사유 — 막지 않으면 null. */
export function segmentActionsBlockReason(
  segment: Pick<SavedSegmentListItem, "specReadable" | "archivedAt">,
  options: { dirty: boolean; available: boolean }
): string | null {
  if (!options.available) return "세그먼트 표가 아직 적용되지 않아 저장된 조건으로 행동할 수 없습니다."
  if (options.dirty) return "바꾼 조건을 저장하거나 되돌린 뒤 실행하세요 — 행동은 저장된 조건의 고객에게 합니다."
  if (segment.archivedAt) return "보관된 세그먼트입니다 — 복구한 뒤 실행하세요."
  if (!segment.specReadable) return "새 조건 판으로 저장된 세그먼트라 이 화면에서 대상을 고를 수 없습니다."
  return null
}

/** 담당 배정 버튼 상태 — 리드가 없으면 막고 사유를 준다. 원천 건수를 모르면(null) 열어 두고 회원 키로 판단한다. */
export function segmentAssignBlockReason(bySource: Partial<Record<CrmUnifiedCustomerSource, number>> | null): string | null {
  if (!bySource) return null
  if ((bySource.lead ?? 0) > 0) return null
  if ((bySource.neo_account ?? 0) > 0) return `리드가 없습니다 — ${SEGMENT_ASSIGN_NEO_REASON}`
  return "배정할 리드가 없습니다."
}

/** 담당 배정 대상 안내 — "리드 40명 중 배정 가능 28명 · 차단 12명(이미 배정 12) · NEO 계정 30명 제외(외부 CRM 소유)". */
export function describeAssignScope(split: MemberKeySplit, preview: LeadAssignmentPreview | null): string {
  const parts: string[] = []
  if (preview) {
    parts.push(`리드 ${split.leadIds.length.toLocaleString("ko-KR")}명 중 배정 가능 ${preview.safeLeadIds.length.toLocaleString("ko-KR")}명`)
    if (preview.blockedLeadIds.length) {
      const blockers = describeAssignmentBlockers(preview.blockerCounts)
      parts.push(`차단 ${preview.blockedLeadIds.length.toLocaleString("ko-KR")}명${blockers ? `(${blockers})` : ""}`)
    }
  } else {
    parts.push(`리드 ${split.leadIds.length.toLocaleString("ko-KR")}명`)
  }
  if (split.neoCount) parts.push(`NEO 계정 ${split.neoCount.toLocaleString("ko-KR")}명 제외(외부 CRM 소유)`)
  if (split.customerCount) parts.push(`전환 고객 ${split.customerCount.toLocaleString("ko-KR")}명 제외`)
  return parts.join(" · ")
}

/** 행동 바 인라인 결과 한 건. */
export interface SegmentActionResultState {
  kind: "tag" | "task" | "assign"
  tone: "success" | "danger"
  message: string
  /** 태그 결과 — 붙인 라벨(통합 목록 ?tag= 확인 링크) */
  label?: string
}

/** 결과별 확인 링크 — 태그는 목록·태그 관리, 오늘 연락은 현황. 순수 함수(테스트용 export). */
export function segmentActionResultLinks(result: SegmentActionResultState): Array<{ label: string; href: string }> {
  if (result.kind === "tag") {
    const links: Array<{ label: string; href: string }> = []
    if (result.label) links.push({ label: "목록에서 보기", href: unifiedCustomersTagHref(result.label) })
    links.push({ label: "태그 관리", href: CRM_TAG_ADMIN_PATH })
    return links
  }
  if (result.kind === "task") return [{ label: "현황에서 보기", href: CRM_TODAY_CONTACTS_PATH }]
  return []
}

/** 행동 바 바로 아래 인라인 결과(성공 role=status · 일부 실패 role=alert) + 확인 링크. */
export function SegmentActionResult({ result, onDismiss }: { result: SegmentActionResultState; onDismiss?: () => void }) {
  const links = segmentActionResultLinks(result)
  return (
    <CrmNoticeBanner
      tone={result.tone}
      onDismiss={onDismiss}
      message={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="segment-action-result">
          <span>{result.message}</span>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-[#084734] underline-offset-2 hover:underline sm:min-h-0"
            >
              {link.label}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ))}
        </span>
      }
    />
  )
}

const noopSubscribe = () => () => {}

type Mode = "idle" | "tag" | "task" | "assign"

interface AssignState {
  members: SavedSegmentMembersResponse
  split: MemberKeySplit
  preview: LeadAssignmentPreview | null
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

const ACTION_BUTTON_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:border-[#c8c8c4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-[#084734] aria-pressed:text-[#084734] sm:min-h-9"
const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9"

export default function SegmentActionBar({
  segment,
  dirty,
  available,
  total,
  bySource,
  onNotice,
}: {
  segment: SavedSegmentListItem
  dirty: boolean
  available: boolean
  /** 저장된 조건의 현재 건수(모르면 null). */
  total: number | null
  /** 저장된 조건의 원천별 건수(상세 응답) — 모르면 null. */
  bySource: Partial<Record<CrmUnifiedCustomerSource, number>> | null
  onNotice: (message: string, tone: "success" | "danger") => void
}) {
  const [mode, setMode] = useState<Mode>("idle")
  const [tagLabel, setTagLabel] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [assign, setAssign] = useState<AssignState | null>(null)
  const [ownerKey, setOwnerKey] = useState("")
  const [result, setResult] = useState<SegmentActionResultState | null>(null)
  // 세션 역할은 브라우저 저장소 값이라 서버 렌더에서는 모른다(null = 허용, 서버가 최종 판단) — 하이드레이션 불일치 없이 읽는다.
  const role = useSyncExternalStore(noopSubscribe, readSessionAdminRole, () => null)
  const canExport = canExportUnifiedCsv(role)
  const { owners, health } = useCrmOwners()

  const block = segmentActionsBlockReason(segment, { dirty, available })
  const assignBlock = segmentAssignBlockReason(bySource)
  const sources = describeBySource(bySource)
  const taskTitle = segmentTaskTitle(segment.name)
  const busy = pending !== null

  const switchMode = (next: Mode) => {
    setError(null)
    setResult(null)
    setMode(mode === next ? "idle" : next)
    if (next === "assign" && mode !== "assign") void openAssign()
  }

  const submitTag = async () => {
    const label = normalizeBulkTagLabel(tagLabel)
    const invalid = validateBulkTagLabel(label)
    if (invalid) {
      setError(invalid)
      return
    }
    setPending("tag")
    setError(null)
    setResult(null)
    try {
      const members = await fetchSegmentMembers(segment.id, SEGMENT_TAG_MEMBER_LIMIT)
      if (members.keys.length === 0) {
        setError("지금 이 조건에 맞는 고객이 없습니다.")
        return
      }
      const outcome = await postBulkTags(members.keys, label)
      const note = memberTruncationNote(members)
      setResult({
        kind: "tag",
        tone: bulkResultTone(outcome) === "error" ? "danger" : "success",
        message: `${summarizeBulkTagResult(outcome, label)}${note ? ` · ${note}` : ""}`,
        label,
      })
      setMode("idle")
      setTagLabel("")
    } catch (cause) {
      setError(errorMessage(cause, "태그를 붙이지 못했습니다."))
    } finally {
      setPending(null)
    }
  }

  const submitTask = async () => {
    setPending("task")
    setError(null)
    setResult(null)
    try {
      const members = await fetchSegmentMembers(segment.id, SEGMENT_TASK_MEMBER_LIMIT)
      if (members.keys.length === 0) {
        setError("지금 이 조건에 맞는 고객이 없습니다.")
        return
      }
      const dueAt = kstTodayAtIso(SEGMENT_TASK_DUE_KST_HOUR, Date.now())
      const outcome = await postBulkTasks(members.keys, { title: taskTitle, dueAt })
      const note = memberTruncationNote(members)
      setResult({
        kind: "task",
        tone: bulkResultTone(outcome) === "error" ? "danger" : "success",
        message: `오늘 연락에 넣음 — ${summarizeBulkTaskResult(outcome, taskTitle)}${note ? ` · ${note}` : ""}`,
      })
      setMode("idle")
    } catch (cause) {
      setError(errorMessage(cause, "할 일을 만들지 못했습니다."))
    } finally {
      setPending(null)
    }
  }

  const exportCsv = async () => {
    setPending("csv")
    setError(null)
    setResult(null)
    try {
      const exported = await downloadUnifiedCustomersCsv(segmentExportUrl(segment.spec))
      onNotice(describeCsvExport(exported), "success")
    } catch (cause) {
      setError(errorMessage(cause, "CSV를 만들지 못했습니다."))
    } finally {
      setPending(null)
    }
  }

  async function openAssign() {
    setAssign(null)
    setPending("assign-load")
    setError(null)
    try {
      const members = await fetchSegmentMembers(segment.id, SEGMENT_ASSIGN_MEMBER_LIMIT)
      const split = splitMemberKeys(members.keys)
      if (split.leadIds.length === 0) {
        setAssign({ members, split, preview: null })
        return
      }
      const preview = await previewLeadAssignment(split.leadIds)
      setAssign({ members, split, preview })
    } catch (cause) {
      setError(errorMessage(cause, "배정 대상을 확인하지 못했습니다."))
    } finally {
      setPending(null)
    }
  }

  const submitAssign = async () => {
    if (!assign?.preview || !ownerKey) return
    const safeIds = assign.preview.safeLeadIds
    if (safeIds.length === 0) return
    setPending("assign")
    setError(null)
    try {
      // 차단된 리드가 섞였으면 배정 가능한 리드만으로 토큰을 새로 받는다(서버가 토큰을 id 목록과 함께 검증한다).
      let token = assign.preview.snapshotToken
      if (assign.preview.blockedLeadIds.length > 0 || assign.preview.safeLeadIds.length !== assign.split.leadIds.length) {
        const recheck = await previewLeadAssignment(safeIds)
        if (recheck.blockedLeadIds.length > 0) {
          setAssign({ ...assign, preview: recheck })
          setError("그사이 리드 상태가 바뀌었습니다 — 배정 가능 인원을 다시 확인하세요.")
          return
        }
        token = recheck.snapshotToken
      }
      const applied = await applyLeadAssignment(safeIds, ownerKey, token)
      const owner = owners.find((candidate) => candidate.ownerKey === ownerKey)
      setResult({
        kind: "assign",
        tone: "success",
        message: `리드 ${applied.updated.toLocaleString("ko-KR")}명을 ${owner?.displayName ?? ownerKey}에게 배정했습니다.`,
      })
      setMode("idle")
      setAssign(null)
      setOwnerKey("")
    } catch (cause) {
      setError(errorMessage(cause, "담당을 배정하지 못했습니다."))
    } finally {
      setPending(null)
    }
  }

  return (
    <section aria-label="세그먼트 행동" className="grid gap-2 border-t border-[#e8e8e4] px-4 py-3" data-testid="segment-actions">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-1 text-[12px] text-[#615D59]">
          대상 <b className="tabular-nums text-[#111110]">{total == null ? "…" : `${total.toLocaleString("ko-KR")}명`}</b>
          <span className="text-[#1a1a1a]/40"> · 저장된 조건{sources ? ` · ${sources}` : ""}</span>
        </p>
        <button
          type="button"
          className={ACTION_BUTTON_CLASS}
          aria-pressed={mode === "tag"}
          onClick={() => switchMode("tag")}
          disabled={Boolean(block) || busy}
        >
          <Tag className="h-3.5 w-3.5" aria-hidden />
          태그 붙이기
        </button>
        <button
          type="button"
          className={ACTION_BUTTON_CLASS}
          aria-pressed={mode === "task"}
          onClick={() => switchMode("task")}
          disabled={Boolean(block) || busy}
        >
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
          오늘 연락에 넣기
        </button>
        <button
          type="button"
          className={ACTION_BUTTON_CLASS}
          onClick={() => void exportCsv()}
          disabled={Boolean(block) || busy || !canExport}
          title={canExport ? "저장된 조건의 고객을 CSV로 내려받습니다(연락처 포함 — 관리자만)." : CSV_EXPORT_FORBIDDEN_MESSAGE}
          aria-busy={pending === "csv" || undefined}
        >
          {pending === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
          CSV
        </button>
        <button
          type="button"
          className={ACTION_BUTTON_CLASS}
          aria-pressed={mode === "assign"}
          onClick={() => switchMode("assign")}
          disabled={Boolean(block) || Boolean(assignBlock) || busy}
          title={assignBlock ?? `리드만 배정합니다. ${SEGMENT_ASSIGN_NEO_REASON}`}
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden />
          담당 배정(리드)
        </button>
      </div>

      {block ? <p className="text-[12px] text-[#615D59]">{block}</p> : null}
      {!block && assignBlock ? <p className="text-[11px] text-[#1a1a1a]/45">담당 배정: {assignBlock}</p> : null}
      {!block && !canExport ? <p className="text-[11px] text-[#1a1a1a]/45">CSV: {CSV_EXPORT_FORBIDDEN_MESSAGE}</p> : null}

      {mode === "tag" && !block ? (
        <form
          className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submitTag()
          }}
        >
          <label htmlFor="segment-bulk-tag" className="sr-only">
            붙일 태그
          </label>
          <input
            id="segment-bulk-tag"
            value={tagLabel}
            onChange={(event) => setTagLabel(event.target.value)}
            maxLength={BULK_TAG_MAX_LENGTH}
            placeholder="붙일 태그(예: 재계약 안내)"
            disabled={busy}
            className="h-11 min-w-[200px] flex-1 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] sm:h-9"
          />
          <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy || !tagLabel.trim()} aria-busy={pending === "tag" || undefined}>
            {pending === "tag" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            붙이기
          </button>
          <p className="w-full text-[11px] text-[#615D59]">
            한 번에 추천순 앞 {SEGMENT_TAG_MEMBER_LIMIT.toLocaleString("ko-KR")}명까지 붙입니다. 이미 같은 태그가 있는 고객은 건너뜁니다.
          </p>
        </form>
      ) : null}

      {mode === "task" && !block ? (
        <div className="grid gap-2 rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-3">
          <p className="text-[12px] text-[#31302E]">
            할 일 <b className="text-[#111110]">&ldquo;{taskTitle}&rdquo;</b> · 기한 오늘 18:00 · 담당은 비워 둡니다(오늘 연락 목록은 고객의 담당으로
            보여 줍니다).
          </p>
          <p className="text-[11px] text-[#615D59]">
            한 번에 추천순 앞 {SEGMENT_TASK_MEMBER_LIMIT.toLocaleString("ko-KR")}명까지 넣습니다. 같은 제목의 열린 할 일이 이미 있으면 건너뜁니다.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => void submitTask()} disabled={busy} aria-busy={pending === "task" || undefined}>
              {pending === "task" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CalendarPlus className="h-3.5 w-3.5" aria-hidden />}
              오늘 연락에 넣기
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              disabled={busy}
              className="inline-flex min-h-11 items-center px-2 text-[12px] font-semibold text-[#615D59] hover:text-[#111110] sm:min-h-9"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {mode === "assign" && !block ? (
        <div className="grid gap-2 rounded-xl border border-[#e8e8e4] bg-[#FAFAF8] p-3" aria-busy={pending === "assign-load"}>
          {pending === "assign-load" ? (
            <p className="inline-flex items-center gap-1.5 text-[12px] text-[#615D59]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              배정 대상과 안전 조건을 확인하는 중…
            </p>
          ) : assign ? (
            <>
              <p className="text-[12px] text-[#31302E]" data-testid="segment-assign-scope">
                {describeAssignScope(assign.split, assign.preview)}
              </p>
              {memberTruncationNote(assign.members) ? (
                <p className="text-[11px] text-[#615D59]">{memberTruncationNote(assign.members)}</p>
              ) : null}
              <p className="text-[11px] text-[#615D59]">
                Home 의 리드 담당만 바꿉니다 — Compass 담당과는 따로 관리됩니다(Compass 에는 쓰지 않음). 미확인·이미 배정된
                리드는 리드 보드와 같은 안전 규칙으로 뺍니다.
              </p>
              {assign.preview && assign.preview.safeLeadIds.length > 0 ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label htmlFor="segment-assign-owner" className="grid gap-1 text-[12px] font-semibold text-[#111110]">
                    배정할 담당자
                    <select
                      id="segment-assign-owner"
                      value={ownerKey}
                      onChange={(event) => setOwnerKey(event.target.value)}
                      disabled={busy || health?.ok !== true || owners.length === 0}
                      className="h-11 min-w-[220px] rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] text-[#111110] focus:border-[#084734] focus:outline-none sm:h-9"
                    >
                      <option value="">담당자를 선택하세요</option>
                      {owners.map((owner) => (
                        <option key={owner.ownerKey} value={owner.ownerKey}>
                          {owner.displayName} · {owner.teamRoleLabel}
                          {owner.branchName ? ` · ${owner.branchName}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    onClick={() => void submitAssign()}
                    disabled={busy || !ownerKey}
                    aria-busy={pending === "assign" || undefined}
                  >
                    {pending === "assign" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <UserPlus className="h-3.5 w-3.5" aria-hidden />}
                    {assign.preview.safeLeadIds.length.toLocaleString("ko-KR")}명 배정
                  </button>
                  {health?.ok === false ? (
                    <p className={`w-full text-[11px] ${STATUS_TONE_TEXT_CLASS.warning}`}>{health.message ?? "담당자 명단 상태를 확인해 주세요."}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-[12px] text-[#615D59]">
                  {assign.split.leadIds.length === 0 ? `이 세그먼트에는 리드가 없습니다. ${SEGMENT_ASSIGN_NEO_REASON}` : "지금 안전하게 배정할 수 있는 리드가 없습니다."}
                </p>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className={`text-[12px] ${STATUS_TONE_TEXT_CLASS.danger}`} role="alert">
          {error}
        </p>
      ) : null}

      {result ? <SegmentActionResult result={result} onDismiss={() => setResult(null)} /> : null}
    </section>
  )
}
