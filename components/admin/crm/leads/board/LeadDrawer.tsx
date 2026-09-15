"use client"

// ─── 리드 상세 드로어 ──────────────────────────────────────────
// LeadsBoardClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Activity, Bell, Building2, Calendar, Check, Clock, Download, ExternalLink,
  Link2, Loader2, LogIn, Mail, MapPin, MousePointerClick, Phone, PhoneCall,
  Plus, Save, ShieldCheck, Tag, Trash2, UserPlus, Users, X,
} from "lucide-react"
import LeadMessageCard from "@/components/admin/crm/LeadMessageCard"
import SaveStateCaption, { type SaveState } from "@/components/admin/crm/SaveStateCaption"
import DeleteConfirmDialog from "@/components/admin/DeleteConfirmDialog"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import type { CrmOwnerOption } from "@/components/admin/crm/useCrmOwners"
import type { LeadActivity } from "@/lib/repositories/lead-activity"
import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"
import type { ContactLogRecord, ContactLogType, ContactLogResult } from "@/lib/repositories/contact-logs"
import type { PublicEvent } from "@/lib/types/public-events"
import { parseEventToken, setEventToken } from "@/lib/types/event-metrics"
import { deriveLeadRegionLabel } from "@/lib/crm/lead-message"
import {
  STATUS_LABEL,
  STATUS_COLOR,
  SOURCE_LABEL,
  LOG_TYPE_LABEL,
  LOG_RESULT_LABEL,
  LOG_RESULT_COLOR,
  calcScore,
  ScoreBadge,
  isUnconfirmedLead,
  isUnrespondedLead,
  hoursBetween,
  formatResponseAge,
  getMetaAdInfo,
  getLeadMagnetLabel,
  getLeadDisplayName,
  CopyButton,
} from "../shared"
import { ACTIVITY_EVENT_LABEL, formatActivityTime, providerLabel } from "./shared"
import ContactLogForm from "./ContactLogForm"
import {
  ASSIGNED_TO_COMMIT_DELAY_MS,
  createLatestRequestGuard,
  listUnsavedDrawerFields,
  nextLogIdAfterRemoval,
  resolveStatusButtonAction,
} from "./lead-drawer-save"

// 부모(LeadsBoardClient.handleStatus)는 실패를 toast 로만 알리고 reject 하지 않는다. 성공은 lead.status
// (부모 상태)가 시도한 값으로 따라왔는지로 판정하는데, 부모의 setLeads → selected 동기화 effect 를 거쳐
// 한 렌더 뒤에 도착하므로 응답이 끝난 직후 잠깐은 옛 값이 보인다. 그 사이를 실패로 오판하지 않도록 유예한다.
const STATUS_SETTLE_GRACE_MS = 200
const SAVED_BADGE_MS = 2000

export default function LeadDrawer({
  lead,
  logs,
  logsLoading,
  events,
  activity,
  activityLoading,
  initialContactForm,
  initialContactType,
  crmOwners,
  crmOwnerHealth,
  onClose,
  onStatusChange,
  onNotesChange,
  onFollowUpChange,
  onAssignedToChange,
  onDelete,
  onAddLog,
  onDeleteLog,
  onConvert,
  onConfirm,
}: {
  lead: LeadRecord
  logs: ContactLogRecord[]
  logsLoading: boolean
  events: PublicEvent[]
  activity: LeadActivity | null
  activityLoading: boolean
  initialContactForm?: boolean
  initialContactType?: ContactLogType
  crmOwners: CrmOwnerOption[]
  crmOwnerHealth: { ok: boolean; message: string | null } | null
  onClose: () => void
  onStatusChange: (id: string, status: LeadStatus) => Promise<void> | void
  onNotesChange: (id: string, notes: string) => Promise<void>
  onFollowUpChange: (id: string, date: string) => Promise<void>
  onAssignedToChange: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void> | void
  onAddLog: (entry: { type: ContactLogType; result?: ContactLogResult; notes?: string; contacted_by?: string }) => Promise<void>
  onDeleteLog: (logId: string) => Promise<void>
  onConvert: (lead: LeadRecord) => Promise<void>
  onConfirm: (lead: LeadRecord) => Promise<void>
}) {
  const initial = parseEventToken(lead.notes)
  const [notes, setNotes] = useState(initial.body)
  const [linkedEventId, setLinkedEventId] = useState<string>(initial.token ?? "")
  const linkedEvent = useMemo(() => {
    if (!linkedEventId) return null
    return events.find((e) => e.id === linkedEventId || e.slug === linkedEventId) ?? null
  }, [events, linkedEventId])
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [assignedTo, setAssignedTo] = useState(lead.assigned_to ?? "")
  const savedOwner = lead.assigned_to ?? ""
  // 담당자 저장 상태(leads-01·leads-08). change 는 로컬 값만 바꾸고, 커밋은 짧은 대기 뒤 마지막 값만 나간다.
  // 부모(onAssignedToChange)는 실패를 reject 하므로 3단(saving/saved/failed)을 직접 판정하되, 세대 토큰으로
  // "이 select 가 마지막으로 보낸 요청"의 결과만 반영한다 — 늦은 실패가 최신 성공값을 덮지 않는다.
  const [ownerSave, setOwnerSave] = useState<SaveState>("idle")
  const ownerGuardRef = useRef(createLatestRequestGuard())
  const ownerCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ownerSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingOwnerRef = useRef<string | null>(null)
  const ownerInFlightRef = useRef(false)
  const onAssignedToChangeRef = useRef(onAssignedToChange)
  onAssignedToChangeRef.current = onAssignedToChange
  // 상태 버튼 저장 상태(leads-01). 부모 handleStatus 는 reject 하지 않으므로 팔로업과 같은 "부모 상태가 따라왔는가"
  // 판정을 쓴다. target 은 지금 저장 중이거나 마지막으로 실패한 대상 상태.
  const [statusSave, setStatusSave] = useState<{ target: LeadStatus | null; state: SaveState }>({
    target: null,
    state: "idle",
  })
  const [statusSettled, setStatusSettled] = useState(0)
  const statusGuardRef = useRef(createLatestRequestGuard())
  // "종료" 단계 이탈 확인(UX 규약 1) — 부모의 벌크 종료와 같은 확인 다이얼로그를 드로어 안에서 연다.
  const [closeStatusRequest, setCloseStatusRequest] = useState(false)
  // 연락 기록 삭제 확인(leads-07). 물리 삭제라 되돌리기가 없으므로 다이얼로그로 막는다.
  const [deleteLogRequest, setDeleteLogRequest] = useState<ContactLogRecord | null>(null)
  const [deletingLog, setDeletingLog] = useState(false)
  const logDeleteButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const logsHeadingRef = useRef<HTMLParagraphElement | null>(null)
  const savedFollowUp = lead.follow_up_at ? lead.follow_up_at.slice(0, 10) : ""
  const [followUp, setFollowUp] = useState(savedFollowUp)
  const [savingFollowUp, setSavingFollowUp] = useState(false)
  const [followUpSaved, setFollowUpSaved] = useState(false)
  // 저장을 시도한 값 — 부모(onFollowUpChange)는 실패를 toast로만 알리고 reject하지 않으므로,
  // 성공 여부는 lead.follow_up_at(부모 상태)이 이 값으로 따라왔는지로 판정한다.
  const attemptedFollowUpRef = useRef<string | null>(null)
  const [showLogForm, setShowLogForm] = useState(Boolean(initialContactForm))
  const [contactLogInitialType, setContactLogInitialType] = useState<ContactLogType>(initialContactType ?? "call")
  const [converting, setConverting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const score = calcScore(lead)
  const unconfirmed = isUnconfirmedLead(lead)
  const unrespondedHours = isUnrespondedLead(lead) ? hoursBetween(lead.timestamp) : null
  const metaAdInfo = getMetaAdInfo(lead)
  const regionLabel = deriveLeadRegionLabel(lead)
  const attributionItems = [
    { label: "Source Detail", value: lead.source_detail },
    // 구버전 Meta 리드는 utm_term/content가 비어 광고가 안 보였다 — 파서 값으로 항상 노출.
    // (캠페인은 아래 UTM Campaign 줄이 이미 커버)
    { label: "Meta 광고", value: metaAdInfo?.ad },
    { label: "Meta 광고세트", value: metaAdInfo?.adset },
    { label: "Lead Magnet", value: getLeadMagnetLabel(lead.lead_magnet) || lead.lead_magnet },
    { label: "UTM Source", value: lead.utm_source },
    { label: "UTM Medium", value: lead.utm_medium },
    { label: "UTM Campaign", value: lead.utm_campaign },
    { label: "UTM Term", value: lead.utm_term },
    { label: "UTM Content", value: lead.utm_content },
    { label: "GCLID", value: lead.gclid },
    { label: "FBCLID", value: lead.fbclid },
    { label: "MSCLKID", value: lead.msclkid },
    { label: "TTCLID", value: lead.ttclid },
    { label: "Landing Page", value: lead.landing_page },
    { label: "Current Page", value: lead.current_page },
    { label: "Referrer", value: lead.referrer },
  ].filter((item) => item.value)

  const activityTimeline = useMemo(() => {
    if (!activity) return []
    const items: { kind: "download" | "event"; at: string; title: string; meta: string | null }[] = [
      ...activity.downloads.map((d) => ({
        kind: "download" as const,
        at: d.createdAt,
        title: getLeadMagnetLabel(d.slug) || d.slug,
        meta: d.source,
      })),
      ...activity.events
        .filter((e) => e.eventName !== "download_materials")
        .map((e) => ({
          kind: "event" as const,
          at: e.createdAt,
          title: ACTIVITY_EVENT_LABEL[e.eventName] ?? e.eventName,
          meta: e.page,
        })),
    ]
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14)
  }, [activity])

  const linkedTokenInLead = parseEventToken(lead.notes).token ?? ""
  const dirty = notes !== initial.body || linkedEventId !== linkedTokenInLead
  // 팔로업 미저장 — 즉시 저장이 실패한 상태(부모가 toast만 띄우고 reject하지 않음). 응답 대기 중은
  // 요청이 이미 나갔으므로(언마운트돼도 부모가 결과를 반영) 미저장으로 치지 않는다.
  const followUpUnsaved = !savingFollowUp && followUp !== savedFollowUp

  // 팔로업 저장 규약(설계 §4): 이산값이라 유효한 날짜로 바뀌는 즉시 저장한다. blur는 어떤
  // 경우에도 저장하지 않는다 — 닫기 경로의 강제 blur가 미완성 날짜를 null로 흘려보내던 사고의 원인.
  const saveFollowUp = useCallback(
    async (next: string) => {
      if (next === savedFollowUp) return
      attemptedFollowUpRef.current = next
      setFollowUpSaved(false)
      setSavingFollowUp(true)
      try {
        await onFollowUpChange(lead.id, next)
      } finally {
        setSavingFollowUp(false)
      }
    },
    [lead.id, onFollowUpChange, savedFollowUp]
  )

  // 성공 판정 — 부모 상태(lead.follow_up_at)가 시도한 값으로 따라오면 "저장됨" 배지를 2초 띄운다.
  useEffect(() => {
    if (attemptedFollowUpRef.current === null || attemptedFollowUpRef.current !== savedFollowUp) return
    attemptedFollowUpRef.current = null
    setFollowUpSaved(true)
    const timer = setTimeout(() => setFollowUpSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [savedFollowUp])

  // ── 상태 버튼 저장(leads-01) ─────────────────────────────────────────
  const commitStatus = useCallback(
    async (target: LeadStatus) => {
      const token = statusGuardRef.current.begin()
      setStatusSave({ target, state: "saving" })
      try {
        await onStatusChange(lead.id, target)
      } catch {
        // 부모가 toast 로 알린다. 아래 settle 판정이 failed 로 떨어진다.
      }
      if (!statusGuardRef.current.isLatest(token)) return
      setStatusSettled((n) => n + 1)
    },
    [lead.id, onStatusChange]
  )

  // settle 판정 — 요청이 끝난 뒤 lead.status 가 시도한 값이면 저장됨, 유예 시간 안에도 안 따라오면 실패.
  useEffect(() => {
    if (statusSettled === 0 || statusSave.state !== "saving" || !statusSave.target) return
    const target = statusSave.target
    if (lead.status === target) {
      setStatusSave({ target, state: "saved" })
      const timer = setTimeout(() => setStatusSave({ target: null, state: "idle" }), SAVED_BADGE_MS)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => setStatusSave({ target, state: "failed" }), STATUS_SETTLE_GRACE_MS)
    return () => clearTimeout(timer)
  }, [statusSettled, statusSave.state, statusSave.target, lead.status])

  // ── 담당자 저장(leads-01·leads-08) ───────────────────────────────────
  const clearOwnerCommitTimer = () => {
    if (ownerCommitTimerRef.current) {
      clearTimeout(ownerCommitTimerRef.current)
      ownerCommitTimerRef.current = null
    }
  }

  const commitOwner = useCallback(
    async (next: string) => {
      clearOwnerCommitTimer()
      pendingOwnerRef.current = null
      if (ownerSavedTimerRef.current) {
        clearTimeout(ownerSavedTimerRef.current)
        ownerSavedTimerRef.current = null
      }
      if (next === savedOwner) {
        // 저장된 값으로 되돌아온 선택 — 서버에 쓸 게 없다. 이전 실패 표시만 지운다.
        setOwnerSave("idle")
        return
      }
      const token = ownerGuardRef.current.begin()
      ownerInFlightRef.current = true
      setOwnerSave("saving")
      try {
        await onAssignedToChangeRef.current(lead.id, next)
        if (!ownerGuardRef.current.isLatest(token)) return
        ownerInFlightRef.current = false
        setOwnerSave("saved")
        ownerSavedTimerRef.current = setTimeout(() => setOwnerSave("idle"), SAVED_BADGE_MS)
      } catch {
        // 부모가 toast 로 원인을 알린다. 최신 요청이 아니면(그 뒤 다른 값이 나갔으면) 아무것도 되돌리지 않는다.
        if (!ownerGuardRef.current.isLatest(token)) return
        ownerInFlightRef.current = false
        // 선택값은 유지하고 실패 캡션 + 다시 시도로 남긴다 — 조용히 이전 값으로 되돌리지 않는다.
        setOwnerSave("failed")
      }
    },
    [lead.id, savedOwner]
  )

  // change 는 로컬 값만 바꾼다. 키보드 화살표로 옵션을 훑는 동안 change 가 연달아 나도 마지막 값만
  // ASSIGNED_TO_COMMIT_DELAY_MS 뒤에 커밋된다. Enter 는 즉시 커밋(명시 확정). blur 저장은 없다(설계 §4).
  const scheduleOwnerCommit = (next: string) => {
    setAssignedTo(next)
    pendingOwnerRef.current = next
    clearOwnerCommitTimer()
    ownerCommitTimerRef.current = setTimeout(() => {
      ownerCommitTimerRef.current = null
      const pending = pendingOwnerRef.current
      if (pending !== null) void commitOwner(pending)
    }, ASSIGNED_TO_COMMIT_DELAY_MS)
  }

  const flushOwnerCommit = () => {
    const pending = pendingOwnerRef.current
    if (pending === null) return
    void commitOwner(pending)
  }

  // 언마운트(닫기·다른 리드 선택) 시 대기 중인 담당자 값을 잃지 않는다 — 요청은 부모가 끝까지 처리한다.
  useEffect(() => {
    const leadId = lead.id
    return () => {
      clearOwnerCommitTimer()
      if (ownerSavedTimerRef.current) clearTimeout(ownerSavedTimerRef.current)
      const pending = pendingOwnerRef.current
      pendingOwnerRef.current = null
      if (pending !== null) void onAssignedToChangeRef.current(leadId, pending).catch(() => undefined)
    }
  }, [lead.id])

  // 서버 정본(lead.assigned_to)이 바뀌었는데 이 select 가 아무것도 보내는 중이 아니면 그 값으로 맞춘다.
  useEffect(() => {
    if (ownerInFlightRef.current || pendingOwnerRef.current !== null) return
    setAssignedTo(savedOwner)
  }, [savedOwner])

  const ownerUnsaved = ownerSave === "failed"

  // 드로어 위에 확인 다이얼로그가 떠 있는 동안은 Escape·백드롭이 드로어까지 닫지 않는다.
  const overlayOpenRef = useRef(false)
  overlayOpenRef.current = closeStatusRequest || deleteLogRequest !== null

  // 닫기 공통 경로(Escape·백드롭·X) — blur로 저장을 흘려보내지 않는다(설계 §4). 저장되지 않은
  // 값(메모·행사 연결·담당자·팔로업)이 있으면 조용히 버리지 않고 확인을 받는다; 취소하면 드로어에
  // 남아 명시 저장 버튼으로 다시 저장할 수 있다.
  const guardedClose = useCallback(() => {
    if (overlayOpenRef.current) return
    const unsaved = listUnsavedDrawerFields({ notesDirty: dirty, ownerUnsaved, followUpUnsaved })
    if (
      unsaved.length > 0 &&
      !window.confirm(`저장하지 않은 ${unsaved.join("·")}이(가) 있습니다. 닫으면 사라집니다. 닫을까요?`)
    ) {
      return
    }
    onClose()
  }, [dirty, ownerUnsaved, followUpUnsaved, onClose])

  // ── 연락 기록 삭제 확인(leads-07) ────────────────────────────────────
  const runDeleteLogRequest = async () => {
    if (!deleteLogRequest || deletingLog) return
    const target = deleteLogRequest
    const nextFocusId = nextLogIdAfterRemoval(logs.map((log) => log.id), target.id)
    setDeletingLog(true)
    try {
      await onDeleteLog(target.id)
    } finally {
      setDeletingLog(false)
      setDeleteLogRequest(null)
    }
    // 카드가 사라진 뒤 포커스를 다음 기록의 삭제 버튼, 없으면 섹션 heading 으로 옮긴다(UX 규약 7).
    // 다이얼로그가 닫히며 원래 트리거(이미 사라진 X)로 포커스를 돌리려 하므로 한 프레임 뒤에 잡는다.
    window.setTimeout(() => {
      // 삭제가 실패해(부모가 toast 로 알림) 기록이 남아 있으면 그 삭제 버튼으로 돌아간다.
      const own = logDeleteButtonRefs.current.get(target.id)
      const nextButton = nextFocusId ? logDeleteButtonRefs.current.get(nextFocusId) : null
      const focusTarget = own?.isConnected ? own : nextButton?.isConnected ? nextButton : null
      if (focusTarget) focusTarget.focus()
      else logsHeadingRef.current?.focus()
    }, 0)
  }

  // Escape·Tab 포커스 트랩·이전 포커스 복귀 — 등록 모달과 같은 다이얼로그 규약(useDialogFocus).
  const drawerCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(lead.id, guardedClose, drawerCloseButtonRef)

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      // 토큰은 공개 신청 리드와 같은 규약으로 slug 우선(없으면 id).
      // 과거 id 토큰은 읽기 측(lib/events/attribution.ts)이 같은 행사로 정규화한다.
      const token = linkedEvent ? (linkedEvent.slug ?? linkedEvent.id) : linkedEventId || null
      const combined = setEventToken(notes, token)
      await onNotesChange(lead.id, combined)
      setLinkedEventId(token ?? "")
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    } catch {
      // 상위 핸들러가 실패를 알린다. 성공 배지는 띄우지 않고 작성 내용은 유지한다.
    } finally {
      setSavingNotes(false)
    }
  }

  const handleSaveLog = async (entry: Parameters<typeof onAddLog>[0]) => {
    await onAddLog(entry)
    setShowLogForm(false)
  }

  const initials = (lead.name ?? lead.email ?? "?")[0]?.toUpperCase()

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={guardedClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${getLeadDisplayName(lead)} 리드 상세`}
        aria-busy={logsLoading || activityLoading || savingNotes || confirming || converting}
        data-admin-crm
        className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t border-[#e8e8e4] bg-white shadow-2xl sm:top-0 sm:right-0 sm:left-auto sm:w-[440px] sm:rounded-none sm:border-l sm:border-t-0"
      >

        {/* 헤더 */}
        <div className="flex items-start gap-4 border-b border-[#e8e8e4] px-4 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
          <div className="w-11 h-11 rounded-full bg-[#f0f0ec] flex items-center justify-center text-[16px] font-bold text-[#1a1a1a]/50 shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-bold text-[#111110] truncate">{lead.name ?? "이름 없음"}</p>
            {lead.org && <p className="text-[13px] text-[#1a1a1a]/50 mt-0.5 truncate">{lead.org}</p>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[lead.status]}`}>
                {STATUS_LABEL[lead.status]}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f0f0ec] text-[#1a1a1a]/50 font-medium">
                {SOURCE_LABEL[lead.source] ?? lead.source}
              </span>
              {unconfirmed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[11px] font-medium text-[#7A520F]">
                  미확인
                </span>
              )}
              {unrespondedHours !== null && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  unrespondedHours >= 48
                    ? "bg-[#FEF3EE] text-[#B85C33]"
                    : unrespondedHours >= 24
                      ? "bg-[#FBF1E0] text-[#7A520F]"
                      : "bg-[#f0f0ec] text-[#1a1a1a]/50"
                }`}>
                  <Clock className="h-3 w-3" />
                  미응대 {formatResponseAge(unrespondedHours)}
                </span>
              )}
              <ScoreBadge score={score} />
              {activity?.summary.authenticated && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-medium text-[#084734]">
                  <LogIn className="h-3 w-3" />
                  {providerLabel(activity.summary.providers[0] ?? null)} 로그인
                </span>
              )}
            </div>
          </div>
          <button
            ref={drawerCloseButtonRef}
            type="button"
            onClick={guardedClose}
            aria-label="리드 상세 닫기"
            className="p-1.5 rounded-lg text-[#1a1a1a]/40 hover:text-[#1a1a1a]/60 hover:bg-[#f0f0ec] transition-all shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 스크롤 컨텐츠 */}
        <div className="flex-1 overflow-y-auto">

          {/* 연락처 + 전화 버튼 */}
          <div className="border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide">연락처</p>
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  onClick={() => {
                    setContactLogInitialType("call")
                    setShowLogForm(true)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#084734] text-white text-[12px] font-medium hover:bg-[#065c41] transition-colors"
                >
                  <PhoneCall className="w-3.5 h-3.5" />전화걸기
                </a>
              )}
            </div>
            <div className="space-y-2">
              {lead.email && (
                <div className="flex items-center gap-2.5 group">
                  <Mail className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                  <a
                    href={`mailto:${lead.email}`}
                    onClick={() => {
                      setContactLogInitialType("email")
                      setShowLogForm(true)
                    }}
                    className="flex-1 truncate text-[13px] text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline"
                  >
                    {lead.email}
                  </a>
                  <CopyButton value={lead.email} />
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2.5 group">
                  <Phone className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                  <span className="text-[13px] text-[#111110] flex-1">{lead.phone}</span>
                  <CopyButton value={lead.phone} />
                </div>
              )}
              {lead.org && (
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                  <span className="text-[13px] text-[#111110]">{lead.org}</span>
                </div>
              )}
              {lead.role && (
                <div className="flex items-center gap-2.5">
                  <Tag className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                  <span className="text-[13px] text-[#111110]">{lead.role}</span>
                </div>
              )}
              {lead.size && (
                <div className="flex items-center gap-2.5">
                  <Users className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                  <span className="text-[13px] text-[#111110]">원생 {lead.size}명</span>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30" />
                <span className={`text-[13px] ${regionLabel ? "font-medium text-[#084734]" : "text-[#1a1a1a]/35"}`}>
                  {regionLabel ?? "지역 미지정"}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Calendar className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                <span className="text-[13px] text-[#1a1a1a]/50">
                  {new Date(lead.timestamp).toLocaleDateString("ko-KR", {
                    year: "numeric", month: "long", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* 활동 인텔리전스 — 로그인/다운로드/행동 신호 */}
          <div className="border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">
                <Activity className="h-3 w-3" />활동 인텔리전스
              </p>
              {activity?.summary.lastActivityAt && (
                <span className="text-[11px] text-[#1a1a1a]/40">
                  최근 {formatActivityTime(activity.summary.lastActivityAt)}
                </span>
              )}
            </div>

            {activityLoading ? (
              <div className="flex justify-center py-4" role="status" aria-live="polite">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin text-[#1a1a1a]/30" />
                <span className="sr-only">리드 활동을 불러오는 중입니다.</span>
              </div>
            ) : !activity ||
              (!activity.summary.authenticated &&
                activity.summary.downloadCount === 0 &&
                activity.summary.eventCount === 0) ? (
              <p className="py-2 text-[12px] text-[#1a1a1a]/45">
                연결된 로그인·행동 데이터가 없습니다. (폼 제출만)
              </p>
            ) : (
              <div className="space-y-3">
                {/* 신원 + 동의 */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {activity.summary.authenticated ? (
                    activity.summary.providers.length > 0 ? (
                      activity.summary.providers.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-medium text-[#084734]"
                        >
                          <LogIn className="h-3 w-3" />
                          {providerLabel(p)}
                        </span>
                      ))
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-medium text-[#084734]">
                        <LogIn className="h-3 w-3" />로그인됨
                      </span>
                    )
                  ) : (
                    <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/45">
                      비로그인
                    </span>
                  )}
                  {activity.summary.marketingConsent && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
                      <ShieldCheck className="h-3 w-3" />마케팅 동의
                    </span>
                  )}
                </div>

                {/* 카운트 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#1a1a1a]/35">
                      <Download className="h-3 w-3" />자료 다운로드
                    </div>
                    <p className="mt-0.5 text-[15px] font-bold text-[#111110]">
                      {activity.summary.downloadCount}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#1a1a1a]/35">
                      <MousePointerClick className="h-3 w-3" />행동 이벤트
                    </div>
                    <p className="mt-0.5 text-[15px] font-bold text-[#111110]">
                      {activity.summary.eventCount}
                    </p>
                  </div>
                </div>

                {/* 타임라인 */}
                {activityTimeline.length > 0 && (
                  <div className="space-y-2">
                    {activityTimeline.map((item, idx) => (
                      <div key={`${item.kind}-${item.at}-${idx}`} className="flex gap-2.5">
                        <div
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            item.kind === "download"
                              ? "bg-[#ECFDF5] text-[#084734]"
                              : "bg-[#f0f0ec] text-[#1a1a1a]/50"
                          }`}
                        >
                          {item.kind === "download" ? (
                            <Download className="h-3 w-3" />
                          ) : (
                            <MousePointerClick className="h-3 w-3" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium text-[#111110]">{item.title}</p>
                          {item.meta && (
                            <p className="truncate text-[11px] text-[#1a1a1a]/40">{item.meta}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] text-[#1a1a1a]/30">
                          {formatActivityTime(item.at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {attributionItems.length > 0 && (
            <div className="border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">
                Attribution
              </p>
              <div className="grid gap-2">
                {attributionItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-[#fafaf8] px-3 py-2">
                    <span className="text-[11px] font-medium text-[#1a1a1a]/35">{item.label}</span>
                    <span className="truncate text-right text-[12px] font-medium text-[#111110]">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 상태 + 담당자 + 팔로업 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4] space-y-4">
            {/* 상태 변경 */}
            <div>
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-2">상태</p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="리드 상태" aria-describedby="lead-drawer-status-save">
                {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => {
                  const action = resolveStatusButtonAction(s, lead.status)
                  const statusBusy = statusSave.state === "saving"
                  const thisSaving = statusBusy && statusSave.target === s
                  const thisConverting = action === "convert" && converting
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={async () => {
                        if (action === "noop" || statusBusy || converting) return
                        if (action === "contact-log") {
                          setShowLogForm(true)
                          return
                        }
                        if (action === "convert") {
                          // 전환은 convert-v2(고객·딜 생성)로만 — 부모 확인 다이얼로그를 거친다(leads-03).
                          setConverting(true)
                          try {
                            await onConvert(lead)
                          } finally {
                            setConverting(false)
                          }
                          return
                        }
                        if (action === "confirm-close") {
                          setCloseStatusRequest(true)
                          return
                        }
                        void commitStatus(s)
                      }}
                      title={
                        action === "contact-log"
                          ? "연락 기록을 저장하면 자동으로 연락중 상태가 됩니다."
                          : action === "convert"
                            ? "고객·거래 등록 절차로 전환합니다."
                            : undefined
                      }
                      aria-pressed={lead.status === s}
                      aria-busy={thisSaving || thisConverting ? true : undefined}
                      disabled={statusBusy || converting}
                      className={`inline-flex min-h-11 items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[12px] font-medium border transition-all disabled:cursor-not-allowed sm:min-h-0 ${
                        lead.status === s
                          ? `${STATUS_COLOR[s]} border-current`
                          : "border-[#e8e8e4] text-[#615D59] hover:border-[#c8c8c4] hover:text-[#31302E] disabled:opacity-60"
                      }`}
                    >
                      {thisSaving || thisConverting ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                      {STATUS_LABEL[s]}
                    </button>
                  )
                })}
              </div>
              <SaveStateCaption
                id="lead-drawer-status-save"
                className="mt-1.5"
                state={statusSave.state}
                failedText={
                  statusSave.target
                    ? `"${STATUS_LABEL[statusSave.target]}" 상태를 저장하지 못했습니다`
                    : "상태를 저장하지 못했습니다"
                }
                onRetry={statusSave.target ? () => void commitStatus(statusSave.target as LeadStatus) : undefined}
              />
            </div>

            {/* 담당자 */}
            <div>
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-2">담당자</p>
              <select
                value={assignedTo}
                aria-label="리드 담당자"
                aria-describedby="lead-drawer-owner-save"
                aria-busy={ownerSave === "saving" ? true : undefined}
                disabled={crmOwnerHealth?.ok !== true || crmOwners.length === 0}
                // change 는 로컬 값만 — 화살표로 목록을 훑는 동안 서버 배정이 나가지 않는다(leads-08).
                onChange={(event) => scheduleOwnerCommit(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return
                  flushOwnerCommit()
                }}
                className="h-11 w-full rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 text-[13px] text-[#111110] outline-none transition-all focus:border-[#084734] focus:bg-white focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <option value="">미배정</option>
                {assignedTo && !crmOwners.some((owner) => owner.ownerKey === assignedTo) ? (
                  <option value={assignedTo}>{assignedTo} · 기존 비정규 값</option>
                ) : null}
                {crmOwners.map((owner) => (
                  <option key={owner.ownerKey} value={owner.ownerKey}>
                    {owner.displayName} · {owner.teamRoleLabel}{owner.branchName ? ` · ${owner.branchName}` : ""}
                  </option>
                ))}
              </select>
              <SaveStateCaption
                id="lead-drawer-owner-save"
                className="mt-1.5"
                state={ownerSave}
                idleText={crmOwnerHealth?.ok === true && crmOwners.length > 0 ? "고르면 잠시 뒤 저장됩니다 · Enter로 바로 저장" : undefined}
                failedText="담당자를 저장하지 못했습니다"
                onRetry={() => void commitOwner(assignedTo)}
              />
              {crmOwnerHealth?.ok !== true ? (
                <p className={`mt-1.5 text-[11px] leading-relaxed ${STATUS_TONE_TEXT_CLASS.danger}`}>
                  {crmOwnerHealth?.message ?? "담당자 정본 명단을 확인하는 중입니다."}
                </p>
              ) : null}
            </div>

            {/* 팔로업 날짜 */}
            <div>
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Bell className="w-3 h-3" />다음 팔로업
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={followUp}
                  aria-label="다음 팔로업 날짜"
                  // native date 입력은 "2026-08-"처럼 미완성 상태에서 value로 ""를 돌려주고(badInput),
                  // 연도를 타이핑하는 동안 "0002-08-15" 같은 중간값으로도 change를 낸다(min 미달 → rangeUnderflow).
                  // 둘 다 사용자가 아직 고르는 중이므로 상태도 저장도 건드리지 않는다 — setState를 생략해야
                  // React가 입력 중인 DOM 값을 이전 값으로 되돌리지 않는다. 완성된 유효 날짜(또는 명시적 비움)만
                  // 상태에 반영하고 즉시 저장한다(이산값 규약). blur 저장은 없다.
                  min="2000-01-01"
                  onChange={(event) => {
                    if (!event.currentTarget.validity.valid) return
                    const next = event.currentTarget.value
                    setFollowUp(next)
                    void saveFollowUp(next)
                  }}
                  onKeyDown={(event) => {
                    // 실패 뒤 같은 값을 다시 저장하려는 Enter — 값이 그대로면 saveFollowUp이 생략한다.
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) return
                    event.preventDefault()
                    if (!event.currentTarget.validity.valid) return
                    void saveFollowUp(event.currentTarget.value)
                  }}
                  aria-describedby="lead-drawer-follow-up-status"
                  className="min-w-0 flex-1 text-[13px] bg-[#fafaf8] border border-[#e8e8e4] rounded-xl px-3 py-2 outline-none focus:border-[#c8c8c4] focus:bg-white transition-all"
                />
                {savingFollowUp ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#1a1a1a]/40" aria-hidden />
                ) : followUpSaved ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-[#084734]" aria-hidden />
                ) : followUpUnsaved ? (
                  // 즉시 저장이 실패한 값 — 버리지 않고 명시 저장 버튼으로 재시도한다.
                  <button
                    type="button"
                    onClick={() => void saveFollowUp(followUp)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#111110] px-3 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-[#1a1a1a]"
                  >
                    <Save className="h-3 w-3" />
                    저장
                  </button>
                ) : null}
              </div>
              <SaveStateCaption
                id="lead-drawer-follow-up-status"
                className="mt-1"
                state={savingFollowUp ? "saving" : followUpSaved ? "saved" : followUpUnsaved ? "failed" : "idle"}
                idleText="날짜를 고르면 바로 저장됩니다"
                failedText="저장되지 않았습니다 · 저장 버튼으로 다시 시도하세요"
              />
              {followUp && new Date(followUp) <= new Date() && (
                <p className="text-[11px] text-[#7A520F] mt-1">⚠ 팔로업 날짜가 지났습니다</p>
              )}
            </div>
          </div>

          {/* 연락 로그 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4]">
            <div className="flex items-center justify-between mb-3">
              <p
                ref={logsHeadingRef}
                tabIndex={-1}
                className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide outline-none"
              >
                연락 기록 {logs.length > 0 && <span className="text-[#084734]">({logs.length})</span>}
              </p>
              <button
                type="button"
                onClick={() => setShowLogForm((v) => !v)}
                aria-expanded={showLogForm}
                className="flex items-center gap-1 text-[11px] font-medium text-[#084734] hover:text-[#065c41] transition-colors"
              >
                <Plus className="w-3 h-3" />연락 추가
              </button>
            </div>

            {showLogForm && (
              <div className="mb-3">
                <ContactLogForm
                  key={contactLogInitialType}
                  initialType={contactLogInitialType}
                  onSave={handleSaveLog}
                  onCancel={() => setShowLogForm(false)}
                  // app/api/admin/leads/[id]/logs/route.ts가 status==="new"인 리드에만 저장 시점에
                  // confirmed_at을 채운다 — 그 조건과 정확히 맞춰야 경고가 과다·과소 노출되지 않는다.
                  willAutoConfirm={lead.status === "new" && unconfirmed}
                />
              </div>
            )}

            {logsLoading ? (
              <div className="flex justify-center py-4" role="status" aria-live="polite">
                <Loader2 aria-hidden className="w-4 h-4 animate-spin text-[#1a1a1a]/30" />
                <span className="sr-only">연락 기록을 불러오는 중입니다.</span>
              </div>
            ) : logs.length === 0 ? (
              <p className="text-[12px] text-[#1a1a1a]/45 py-2">연락 기록이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-2.5 group">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]/20 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-[#111110]">
                          {LOG_TYPE_LABEL[log.type]}
                        </span>
                        {log.result && (
                          <span className={`text-[11px] font-medium ${LOG_RESULT_COLOR[log.result]}`}>
                            — {LOG_RESULT_LABEL[log.result]}
                          </span>
                        )}
                        {log.contacted_by && (
                          <span className="text-[11px] text-[#1a1a1a]/40">{log.contacted_by}</span>
                        )}
                        <span className="text-[10px] text-[#1a1a1a]/30 ml-auto">
                          {new Date(log.contacted_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {log.notes && (
                        <p className="text-[12px] text-[#1a1a1a]/60 mt-0.5">{log.notes}</p>
                      )}
                    </div>
                    <button
                      ref={(node) => {
                        if (node) logDeleteButtonRefs.current.set(log.id, node)
                        else logDeleteButtonRefs.current.delete(log.id)
                      }}
                      type="button"
                      // 확인 없이 물리 삭제되던 경로(leads-07) — 다이얼로그를 거친다.
                      onClick={() => setDeleteLogRequest(log)}
                      disabled={deletingLog}
                      aria-label={`${formatActivityTime(log.contacted_at)} 연락 기록 삭제`}
                      className={"ml-3 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg p-1 text-[#615D59] opacity-100 transition-all disabled:opacity-40 sm:ml-0 sm:min-h-0 sm:min-w-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 hover:text-[#B43E3E]"}
                    >
                      <X className="w-3 h-3" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 제출 메시지 */}
          {lead.message && (
            <div className="px-6 py-4 border-b border-[#e8e8e4]">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-3">제출 메시지</p>
              <LeadMessageCard message={lead.message} />
            </div>
          )}

          {/* 행사 연결 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide">연결된 행사</p>
              {linkedEvent && (
                <Link
                  href="/admin/campaigns"
                  className="inline-flex items-center gap-1 text-[11px] text-[#1a1a1a]/40 hover:text-[#111110]"
                >
                  대시보드 보기
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
            {linkedEvent ? (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[#e8e8e4] bg-[#ECFDF5]/40 px-3 py-2">
                <div className="min-w-0 flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 shrink-0 text-[#084734]" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#111110]">{linkedEvent.title}</p>
                    <p className="text-[11px] text-[#1a1a1a]/40">{linkedEvent.category} · {linkedEvent.status}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLinkedEventId("")}
                  aria-label={`${linkedEvent.title} 행사 연결 해제`}
                  className="shrink-0 rounded-md p-1 text-[#1a1a1a]/40 hover:bg-white hover:text-[#B85C33]"
                  title="연결 해제"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : linkedEventId ? (
              <div className="mb-2 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] text-[#7A520F]">
                토큰 <code className="rounded bg-white px-1 font-mono text-[11px]">event:{linkedEventId}</code>에 해당하는 행사가 없습니다.
              </div>
            ) : null}
            <select
              value={linkedEvent?.id ?? linkedEventId}
              aria-label="연결할 행사"
              onChange={(e) => setLinkedEventId(e.target.value)}
              className="w-full text-[13px] text-[#111110] bg-[#fafaf8] border border-[#e8e8e4] rounded-xl px-3 py-2.5 outline-none focus:border-[#c8c8c4] focus:bg-white transition-all"
            >
              <option value="">— 행사 선택 (선택) —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  [{ev.status}] {ev.title} · {ev.category}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">
              선택 시 메모 첫 줄에 <code className="rounded bg-[#f0f0ec] px-1 font-mono text-[10px] text-[#111110]">[event:&lt;slug&gt;]</code> 토큰이 자동 저장됩니다.
            </p>
          </div>

          {/* 메모 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4]">
            <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-3">메모</p>
            <textarea
              value={notes}
              aria-label="리드 메모"
              onChange={(e) => setNotes(e.target.value)}
              // 자유 텍스트는 ⌘/Ctrl+Enter 또는 저장 버튼으로만 커밋한다(설계 §4). blur 저장 없음.
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.nativeEvent.isComposing) return
                e.preventDefault()
                if (dirty && !savingNotes) void handleSaveNotes()
              }}
              placeholder="담당자 메모를 입력하세요..."
              rows={3}
              className="w-full text-[13px] text-[#111110] placeholder:text-[#1a1a1a]/30 bg-[#fafaf8] border border-[#e8e8e4] rounded-xl px-3 py-2.5 resize-none outline-none focus:border-[#c8c8c4] focus:bg-white transition-all"
            />
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={savingNotes || !dirty}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#111110] text-white disabled:opacity-30 hover:bg-[#1a1a1a] transition-all"
            >
              {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : notesSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
              {savingNotes ? "저장 중..." : notesSaved ? "저장됨" : "메모·행사 저장"}
            </button>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-[#e8e8e4] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onDelete(lead.id)}
            className={`flex min-h-11 items-center gap-2 text-[12px] transition-colors hover:underline sm:min-h-0 ${STATUS_TONE_TEXT_CLASS.danger}`}
          >
            <Trash2 className="w-3.5 h-3.5" />이 리드 삭제
          </button>

          <div className="flex items-center gap-2">
            {unconfirmed && (
              <button
                type="button"
                onClick={async () => {
                  setConfirming(true)
                  try {
                    await onConfirm(lead)
                  } finally {
                    setConfirming(false)
                  }
                }}
                disabled={confirming}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#084734] text-white hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                확인
              </button>
            )}

            {lead.status !== "converted" && (
              <button
                type="button"
                onClick={async () => {
                  setConverting(true)
                  try {
                    await onConvert(lead)
                  } finally {
                    setConverting(false)
                  }
                }}
                disabled={converting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[#084734] text-[#084734] hover:bg-[#084734] hover:text-white disabled:opacity-40 transition-all"
              >
                {converting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                고객·거래 등록
              </button>
            )}
          </div>
        </div>
      </div>

      {/* "종료" 단계 이탈 확인 — 부모의 벌크 종료(requestBulkStatus)와 같은 다이얼로그 규약. */}
      <DeleteConfirmDialog
        open={closeStatusRequest}
        onClose={() => setCloseStatusRequest(false)}
        onConfirm={() => {
          setCloseStatusRequest(false)
          void commitStatus("closed")
        }}
        loading={statusSave.state === "saving"}
        destructive={false}
        title="리드를 종료할까요?"
        description={
          <>
            &ldquo;{getLeadDisplayName(lead)}&rdquo; 리드를 <strong>종료</strong> 상태로 바꿉니다. 활성 파이프라인·팔로업 큐에서
            빠지며, 필요하면 나중에 상태 버튼으로 다시 열 수 있습니다.
          </>
        }
        confirmLabel="종료로 변경"
        confirmLoadingLabel="변경 중..."
      />

      {/* 연락 기록 삭제 확인(leads-07) — 물리 삭제라 되돌리기가 없다. */}
      <DeleteConfirmDialog
        open={deleteLogRequest !== null}
        onClose={() => {
          if (!deletingLog) setDeleteLogRequest(null)
        }}
        onConfirm={() => void runDeleteLogRequest()}
        loading={deletingLog}
        title="이 연락 기록을 삭제할까요?"
        description={
          deleteLogRequest ? (
            <>
              {formatActivityTime(deleteLogRequest.contacted_at)} · {LOG_TYPE_LABEL[deleteLogRequest.type]}
              {deleteLogRequest.result ? ` — ${LOG_RESULT_LABEL[deleteLogRequest.result]}` : ""}
              {deleteLogRequest.contacted_by ? ` · ${deleteLogRequest.contacted_by}` : ""}
              {deleteLogRequest.notes ? (
                <>
                  <br />
                  <span className="text-[#615D59]">
                    {deleteLogRequest.notes.length > 80 ? `${deleteLogRequest.notes.slice(0, 80)}…` : deleteLogRequest.notes}
                  </span>
                </>
              ) : null}
            </>
          ) : null
        }
        irreversibleNote="되돌릴 수 없습니다 — 삭제된 연락 기록은 복구되지 않습니다."
        confirmLabel="삭제"
        confirmLoadingLabel="삭제 중..."
      />
    </>
  )
}
