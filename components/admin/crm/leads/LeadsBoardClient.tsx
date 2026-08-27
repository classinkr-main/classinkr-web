"use client"

import { useState, useEffect, useCallback, useDeferredValue, useMemo, useRef } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  RefreshCw, X, Trash2,
  Phone, Mail, Building2, Users, Calendar,
  MapPin, Tag, Save, Loader2, Plus,
  PhoneCall, Bell, UserPlus, Link2, ExternalLink,
  Clock, Search, Check,
  Activity, Download, LogIn, MousePointerClick, ShieldCheck,
  FileText, Flame, Layers, Megaphone, ArrowUpDown,
  Columns3, List as ListIcon,
} from "lucide-react"
import LeadRegisterModal from "@/components/admin/crm/LeadRegisterModal"
import LeadTrackingPanel from "@/components/admin/crm/leads/LeadTrackingPanel"
import { useCrmOwners, type CrmOwnerOption } from "@/components/admin/crm/useCrmOwners"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import LeadMessageCard from "@/components/admin/crm/LeadMessageCard"
import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"

import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"
import { Button } from "@/components/ui/button"
import type { LeadActivity, LeadActivityBadge } from "@/lib/repositories/lead-activity"
import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"
import type { ContactLogRecord, ContactLogType, ContactLogResult } from "@/lib/repositories/contact-logs"
import type { PublicEvent } from "@/lib/types/public-events"
import { parseEventToken, setEventToken } from "@/lib/types/event-metrics"
import {
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_COLOR,
  StatusPill,
  SOURCE_LABEL,
  LOG_TYPE_LABEL,
  LOG_RESULT_LABEL,
  LOG_RESULT_COLOR,
  LEAD_FILTER_KEYS,
  CONFIRMATION_GATE_EXEMPT_FILTERS,
  type LeadFilter,
  calcScore,
  ScoreBadge,
  readAdminResponse,
  toLocalDateKey,
  toFollowUpTimestamp,
  daysBetween,
  isActiveLead,
  isResponseTargetLead,
  isUnrespondedLead,
  isUnconfirmedLead,
  hoursBetween,
  formatResponseAge,
  getLeadOwner,
  getLeadSourceDetail,
  getMetaAdInfo,
  getLeadMagnetLabel,
  getLeadDisplayName,
  getLeadSourceGroup,
  SOURCE_GROUP_ORDER,
  SOURCE_GROUP_LABEL,
  SourceGroupDot,
  type LeadSourceGroup,
  CopyButton,
  Toast,
} from "@/components/admin/crm/leads/shared"
import {
  isMarketingLead,
  isTestLead,
  getLeadTrackingKey,
  TRACKING_DIMENSIONS,
  type TrackingDimension,
} from "@/lib/crm/lead-attribution"
import {
  LEAD_SORT_OPTIONS,
  calcLeadPriority,
  getEngagement,
  isLeadSortKey,
  matchesLeadSearch,
  sortLeads,
  tokenizeLeadSearch,
  type LeadPriority,
  type LeadSortKey,
} from "@/lib/crm/lead-ranking"
import { deriveLeadRegionLabel } from "@/lib/crm/lead-message"
import {
  buildLeadAssignmentProfile,
  formatLeadAssignmentProfile,
} from "@/lib/crm/lead-assignment-profile"
import type { LeadAssignmentPolicyPreview } from "@/lib/crm/lead-assignment-policy"
import { buildContactLogEntry, channelCarriesResult } from "@/lib/crm/contact-log"
import {
  applyLeadsViewParam,
  appliesAcrossBoardColumns,
  partitionLeadsToBoardColumns,
  readLeadsView,
  resolveBoardColumnFocus,
  type BoardColumnKey,
  type LeadsView,
} from "@/lib/crm/leads-board-state"
import LeadsBoardView from "./LeadsBoardView"

// 리드 보드 목록 무한스크롤 대체 — 초기 50건, "더보기"로 50건씩 확장(계획 문서 Phase W1).
// 모바일 카드·데스크톱 테이블이 같은 filtered를 그리므로 visible 상한을 공유한다.
const LEAD_BOARD_LIST_STEP = 50
// 담당자 패널에 그리는 행 상한. 넘치는 인원·건수는 각주로 드러낸다(조용히 자르지 않는다).
const OWNER_ROW_CAP = 6

interface LeadAssignmentPreviewResponse extends LeadAssignmentPolicyPreview {
  snapshotToken: string
  rosterHealthy: boolean
  rosterMessage: string | null
}

// 유입 셀의 보조 세그먼트 — 그룹 라벨과 사실상 같은 말이면 생략해 "메타 · Meta 리드" 같은
// 중복 표기를 막는다(메타는 광고명 칩이 세부를 담당). 그룹 내 소스가 여럿인 경우(홈페이지의
// 데모/문의/CTA 등)에만 구분값으로 노출한다.
function getLeadSourceSegment(lead: LeadRecord): string | null {
  if (lead.source === "meta_lead_ads") return null
  const label = SOURCE_LABEL[lead.source] ?? lead.source
  return label === SOURCE_GROUP_LABEL[getLeadSourceGroup(lead)] ? null : label
}

// ─── 모아보기 렌즈 ─────────────────────────────────────────────
// 리드를 담는 두 그릇. 렌즈는 목록의 모집단 자체를 바꾸고, 아래 상태·유입 필터와 AND로 겹친다.
//  - 전체: 모든 리드 + 단계별/담당자 운영 패널
//  - 마케팅: 마케팅 귀속 리드만 + 트래킹 롤업 패널(채널·캠페인·광고·마그넷·랜딩)
type LeadLens = "all" | "marketing"

const LENS_OPTIONS: Array<{ key: LeadLens; label: string; hint: string }> = [
  { key: "all", label: "전체 리드", hint: "모든 유입 · 단계와 담당자 중심" },
  { key: "marketing", label: "마케팅 리드", hint: "트래킹이 붙은 유입 · 채널 성과 중심" },
]

function isLeadLens(value: string | null | undefined): value is LeadLens {
  return value === "all" || value === "marketing"
}

// 우선순위 점수 밴드 — 70+ 는 오늘 손대야 하는 리드, 45+ 는 살아있는 리드, 그 아래는 배경.
function priorityToneClass(total: number) {
  if (total >= 70) return "bg-[#ECFDF5] text-[#084734]"
  if (total >= 45) return "bg-[#f0f0ec] text-[#1a1a1a]/60"
  return "bg-[#fafaf8] text-[#1a1a1a]/35"
}

function priorityBreakdownTitle(priority: LeadPriority) {
  return `주요 ${priority.value} · 반응 ${priority.response} · 최근 ${priority.recency} · 자주 ${priority.frequency} · 긴급 ${priority.urgency}`
}

function PriorityCell({ priority }: { priority: LeadPriority }) {
  return (
    <div className="flex max-w-[230px] flex-col items-start gap-1">
      <span
        title={priorityBreakdownTitle(priority)}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${priorityToneClass(priority.total)}`}
      >
        <Flame className="h-3 w-3" />
        {priority.total}
      </span>
      {priority.reasons.length > 0 ? (
        <span className="max-w-full truncate text-[11px] text-[#1a1a1a]/45">
          {priority.reasons.join(" · ")}
        </span>
      ) : null}
    </div>
  )
}

type ConvertLeadResponse = {
  customer: {
    id?: string
    name: string
  }
  deal: {
    id?: string
    deal_code?: string | null
  }
  lead: LeadRecord
  reusedExisting?: { customer: boolean; deal: boolean }
  links?: { deal?: string; customer?: string }
}

type ConvertResultState = {
  customerName: string
  dealCode: string | null
  reused: boolean
  dealUrl: string | null
  customerUrl: string
  quoteUrl: string | null
}

// ─── 활동 인텔리전스 헬퍼 ──────────────────────────────────────
const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  naver: "네이버",
  kakao: "카카오",
  email: "이메일",
}

const ACTIVITY_EVENT_LABEL: Record<string, string> = {
  view_demo_video: "데모 영상 시청",
  click_cta: "CTA 클릭",
  begin_checkout: "결제 시작",
  page_view: "페이지 조회",
  submit_contact: "문의 제출",
  submit_demo: "데모 신청",
  newsletter_subscribe: "뉴스레터 구독",
}

function providerLabel(provider: string | null) {
  if (!provider) return "로그인"
  return PROVIDER_LABEL[provider] ?? provider
}

function formatActivityTime(iso: string) {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "방금"
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
}

// 리스트 행 한눈 배지 — 로그인 공급자 + 다운로드 수. 신호 없으면 렌더 안 함.
function LeadActivityChip({ badge }: { badge?: LeadActivityBadge }) {
  if (!badge || (!badge.authenticated && badge.downloadCount === 0)) return null
  const providerText = badge.providers.map(providerLabel).join(", ") || "로그인"
  return (
    <span className="inline-flex items-center gap-1">
      {badge.authenticated && (
        <span
          title={`${providerText} 로그인`}
          className="inline-flex items-center rounded-full bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] font-medium text-[#084734]"
        >
          <LogIn className="h-2.5 w-2.5" />
        </span>
      )}
      {badge.downloadCount > 0 && (
        <span
          title={`자료 ${badge.downloadCount}건 다운로드`}
          className="inline-flex items-center gap-0.5 rounded-full bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55"
        >
          <Download className="h-2.5 w-2.5" />
          {badge.downloadCount}
        </span>
      )}
    </span>
  )
}

// ─── 연락 로그 폼 ──────────────────────────────────────────────
function ContactLogForm({
  onSave,
  onCancel,
  initialType = "call",
}: {
  onSave: (entry: { type: ContactLogType; result?: ContactLogResult; notes?: string; contacted_by?: string }) => Promise<void>
  onCancel: () => void
  initialType?: ContactLogType
}) {
  const [type, setType] = useState<ContactLogType>(initialType)
  const [result, setResult] = useState<ContactLogResult>("answered")
  const [notes, setNotes] = useState("")
  const [by, setBy] = useState("")
  const [saving, setSaving] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => notesRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      // 채널↔결과 규약은 lib/crm/contact-log가 단일 진실원 — 카카오·이메일은 결과 칩이 숨겨져도
      // 직전에 고른 result가 state에 남아 있어 그대로 전송되던 경로를 여기서 막는다.
      await onSave(buildContactLogEntry({ type, result, notes, contacted_by: by }))
    } catch {
      // 상위 핸들러가 오류 토스트를 맡는다. 폼 값은 유지해 사용자가 바로 재시도할 수 있게 한다.
    } finally {
      // 저장 실패 시에도 폼을 다시 조작·재시도할 수 있어야 한다.
      setSaving(false)
    }
  }

  return (
    <div className="bg-[#fafaf8] border border-[#e8e8e4] rounded-xl p-3 space-y-2.5" aria-busy={saving}>
      {/* 채널 */}
      <div className="flex gap-1.5">
        {(["call", "sms", "kakao", "email"] as ContactLogType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
              type === t ? "bg-[#111110] text-white border-[#111110]" : "border-[#e8e8e4] text-[#1a1a1a]/50 hover:border-[#c8c8c4]"
            }`}
          >
            {LOG_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {/* 결과 (전화/문자만) — 표시 조건도 저장 규약과 같은 표를 본다 */}
      {channelCarriesResult(type) && (
        <div className="flex gap-1.5">
          {(["answered", "no_answer", "callback", "meeting_set"] as ContactLogResult[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResult(r)}
              aria-pressed={result === r}
              className={`flex-1 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                result === r ? "bg-[#084734] text-white border-[#084734]" : "border-[#e8e8e4] text-[#1a1a1a]/40 hover:border-[#c8c8c4]"
              }`}
            >
              {LOG_RESULT_LABEL[r]}
            </button>
          ))}
        </div>
      )}

      {/* 담당자 */}
      <input
        value={by}
        aria-label="연락 담당자"
        onChange={(e) => setBy(e.target.value)}
        placeholder="담당자 이름"
        className="w-full text-[12px] bg-white border border-[#e8e8e4] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c8c8c4] placeholder:text-[#1a1a1a]/40"
      />

      {/* 메모 */}
      <textarea
        ref={notesRef}
        value={notes}
        aria-label="연락 메모"
        onChange={(e) => setNotes(e.target.value)}
        placeholder="메모 (선택)"
        rows={2}
        autoFocus
        className="w-full text-[12px] bg-white border border-[#e8e8e4] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c8c8c4] resize-none placeholder:text-[#1a1a1a]/40"
      />

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-[12px] text-[#1a1a1a]/40 hover:text-[#1a1a1a]/60 px-2 py-1">취소</button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          aria-label={saving ? "연락 기록 저장 중" : "연락 기록 저장"}
          className="flex items-center gap-1 text-[12px] font-medium bg-[#111110] text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          저장
        </button>
      </div>
    </div>
  )
}

// ─── 드로어 ────────────────────────────────────────────────────
function LeadDrawer({
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
  onStatusChange: (id: string, status: LeadStatus) => void
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
  const savedFollowUp = lead.follow_up_at ? lead.follow_up_at.slice(0, 10) : ""
  const [followUp, setFollowUp] = useState(savedFollowUp)
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

  // 닫기 공통 경로(Escape·백드롭·X) — onBlur 저장(담당자·팔로업)이 언마운트로 조용히
  // 유실되지 않게 활성 입력을 먼저 blur로 흘려보내고, 저장 안 된 메모는 확인을 받는다.
  const guardedClose = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
    if (dirty && !window.confirm("저장하지 않은 메모·행사 연결이 있습니다. 닫으면 사라집니다. 닫을까요?")) return
    onClose()
  }, [dirty, onClose])

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
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      if (s === "contacted" && lead.status === "new") {
                        setShowLogForm(true)
                        return
                      }
                      onStatusChange(lead.id, s)
                    }}
                    title={
                      s === "contacted" && lead.status === "new"
                        ? "연락 기록을 저장하면 자동으로 연락중 상태가 됩니다."
                        : undefined
                    }
                    aria-pressed={lead.status === s}
                    className={`py-2 px-3 rounded-xl text-[12px] font-medium border transition-all ${
                      lead.status === s
                        ? `${STATUS_COLOR[s]} border-current`
                        : "border-[#e8e8e4] text-[#1a1a1a]/40 hover:border-[#c8c8c4] hover:text-[#1a1a1a]/70"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* 담당자 */}
            <div>
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-2">담당자</p>
              <select
                value={assignedTo}
                aria-label="리드 담당자"
                disabled={crmOwnerHealth?.ok !== true || crmOwners.length === 0}
                onChange={(event) => {
                  const previous = assignedTo
                  const next = event.target.value
                  setAssignedTo(next)
                  void onAssignedToChange(lead.id, next).catch(() => setAssignedTo(previous))
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
              {crmOwnerHealth?.ok !== true ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#B85C33]">
                  {crmOwnerHealth?.message ?? "담당자 정본 명단을 확인하는 중입니다."}
                </p>
              ) : null}
            </div>

            {/* 팔로업 날짜 */}
            <div>
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Bell className="w-3 h-3" />다음 팔로업
              </p>
              <input
                type="date"
                value={followUp}
                aria-label="다음 팔로업 날짜"
                onChange={(e) => setFollowUp(e.target.value)}
                // native date 입력은 "2026-08-"처럼 미완성 상태에서 value로 ""를 돌려준다.
                // 그걸 그대로 흘려보내면 PATCH가 follow_up_at을 null로 덮어 기존 팔로업이
                // 무음으로 사라진다(닫기 경로의 강제 blur 때문에 닫을 때마다 재현됐다).
                // badInput이 그 미완성 상태를 정확히 가리키고, 값이 그대로면 쓰기 자체를 생략한다.
                onBlur={(event) => {
                  if (event.currentTarget.validity.badInput) return
                  if (followUp === savedFollowUp) return
                  void onFollowUpChange(lead.id, followUp)
                }}
                className="w-full text-[13px] bg-[#fafaf8] border border-[#e8e8e4] rounded-xl px-3 py-2 outline-none focus:border-[#c8c8c4] focus:bg-white transition-all"
              />
              {followUp && new Date(followUp) <= new Date() && (
                <p className="text-[11px] text-[#7A520F] mt-1">⚠ 팔로업 날짜가 지났습니다</p>
              )}
            </div>
          </div>

          {/* 연락 로그 */}
          <div className="px-6 py-4 border-b border-[#e8e8e4]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wide">
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
                      type="button"
                      onClick={() => onDeleteLog(log.id)}
                      aria-label={`${formatActivityTime(log.contacted_at)} 연락 기록 삭제`}
                      className="shrink-0 p-1 text-[#1a1a1a]/25 opacity-100 transition-all hover:text-[#B85C33] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <X className="w-3 h-3" />
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
            className="flex items-center gap-2 text-[12px] text-[#B85C33] hover:text-[#9A4A27] transition-colors"
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
    </>
  )
}

// ─── 리드 보드 ─────────────────────────────────────────────────
// 현황(/admin/crm)에서 추출한 리드 관리 보드 전체. ?filter=·?focus=risk 딥링크 지원.
export default function LeadsBoardClient() {
  const searchParams = useSearchParams()
  const initialFilter = ((): LeadFilter => {
    const raw = searchParams.get("filter")
    return raw && (LEAD_FILTER_KEYS as string[]).includes(raw) ? (raw as LeadFilter) : "all"
  })()
  const focusRisk = searchParams.get("focus") === "risk"
  const deepLinkedLeadId = searchParams.get("lead")?.trim() ?? ""
  const deepLinkedContactAction = searchParams.get("action") === "contact"
  const initialLens: LeadLens = isLeadLens(searchParams.get("lens")) ? (searchParams.get("lens") as LeadLens) : "all"
  const initialSort: LeadSortKey = isLeadSortKey(searchParams.get("sort"))
    ? (searchParams.get("sort") as LeadSortKey)
    : "priority"
  // 뷰 축 — 콘솔이 기본이라 URL에서 생략된다. 전환은 어떤 상태도 리셋하지 않는다(설계 §2).
  const initialView: LeadsView = readLeadsView(searchParams.get("view"))

  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [leadModalOpen, setLeadModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<LeadFilter>(initialFilter)
  const [view, setView] = useState<LeadsView>(initialView)
  // 모아보기 렌즈 · 정렬 — URL에 남겨 공유·뒤로가기가 같은 화면을 재현하게 한다.
  const [lens, setLens] = useState<LeadLens>(initialLens)
  const [sortKey, setSortKey] = useState<LeadSortKey>(initialSort)
  // 확인 게이트 우회 토글. 기본은 기존 규칙(미확인 숨김) 그대로 두되, 한 번의 클릭으로
  // "정말 전부" 볼 수 있게 한다 — 모아보기의 전제.
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(false)
  const [trackingDimension, setTrackingDimension] = useState<TrackingDimension>("channel")
  const [trackingKey, setTrackingKey] = useState<string | null>(null)
  // 검색어·유입 그룹도 URL에서 복원한다 — 렌즈·정렬처럼 공유·새로고침에서 같은 화면.
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q")?.trim() ?? "")
  const [sourceDetailFilter, setSourceDetailFilter] = useState("all")
  // 인사이트 '채널별 전환율'에서 ?source=로 진입하는 유입경로(source) 필터.
  const [channelSource, setChannelSource] = useState(searchParams.get("source")?.trim() ?? "")
  const [leadMagnetFilter, setLeadMagnetFilter] = useState("all")
  // 상단 유입 칩 필터 — source를 7묶음으로 접어 거른다(상태/SLA 필터와 직교 AND 결합).
  const [sourceGroup, setSourceGroup] = useState<LeadSourceGroup | "all">(() => {
    const raw = searchParams.get("group")
    return raw && (SOURCE_GROUP_ORDER as readonly string[]).includes(raw) ? (raw as LeadSourceGroup) : "all"
  })
  const [selected, setSelected] = useState<LeadRecord | null>(null)
  const [contactDraft, setContactDraft] = useState<{ leadId: string; type: ContactLogType } | null>(null)
  const [logs, setLogs] = useState<ContactLogRecord[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [activity, setActivity] = useState<LeadActivity | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  // CRM 전환 직후 동선 — 딜/고객 딥링크 패널 (토스트와 달리 닫기 전까지 유지).
  const [convertResult, setConvertResult] = useState<ConvertResultState | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [activitySummary, setActivitySummary] = useState<Record<string, LeadActivityBadge>>({})
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(() => new Set())
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Set<string>>(() => new Set())
  const [convertingIds, setConvertingIds] = useState<Set<string>>(() => new Set())
  const [bulkWorking, setBulkWorking] = useState(false)
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const [bulkOwnerKey, setBulkOwnerKey] = useState("")
  const [assignmentPreview, setAssignmentPreview] = useState<LeadAssignmentPreviewResponse | null>(null)
  const [assignmentPreviewLoading, setAssignmentPreviewLoading] = useState(false)
  const [assignmentPreviewError, setAssignmentPreviewError] = useState<string | null>(null)
  // 목록 로드 실패를 빈 목록과 구분한다 — 장애 중에 "등록된 리드가 없습니다"로 오인되면 안 된다.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)
  const [dismissedDeepLinkedLeadId, setDismissedDeepLinkedLeadId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { owners: crmOwners, health: crmOwnerHealth } = useCrmOwners()

  // "/" 로 검색창 포커스 — 목록을 훑다가 손을 옮기지 않고 바로 좁힐 수 있게.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await adminFetchJsonCached<PublicEvent[]>("/api/admin/events", undefined, { ttlMs: 60_000 })
        if (!cancelled) setEvents(Array.isArray(data) ? data : [])
      } catch {
        /* noop — 행사 연결 UI는 events 없어도 동작 */
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 리드별 활동 배지 맵 — 1회 로드, 실패해도 배지만 비운다.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await adminFetchJsonCached<{ summary: Record<string, LeadActivityBadge> }>(
          "/api/admin/leads/activity-summary",
          undefined,
          { ttlMs: 60_000 }
        )
        if (!cancelled) setActivitySummary(data?.summary ?? {})
      } catch {
        /* noop — 배지는 보조 정보 */
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 언마운트 후 setState(경고) 방지 + 토스트가 연달아 뜰 때 이전 타이머가 새 토스트를 지우지 않게.
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  const fetchLeads = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true)
    try {
      const data = await adminFetchJsonCached<{ leads: LeadRecord[] }>("/api/admin/leads", undefined, {
        ttlMs: 0,
        force: options?.force,
        persist: false,
        staleIfError: false,
        staleWhileRevalidateMs: 0,
      })
      setLeads(data.leads)
      setLoadError(null)
      setLastLoadedAt(new Date())
    } catch (err) {
      const message = err instanceof Error ? err.message : "리드를 불러오지 못했습니다."
      setLoadError(message)
      showToast(message, "error")
    } finally { setLoading(false) }
  }, [])

  const fetchLogs = useCallback(async (leadId: string) => {
    setLogsLoading(true)
    try {
      const res = await adminFetch(`/api/admin/leads/${leadId}/logs`)
      const data = await readAdminResponse<{ logs: ContactLogRecord[] }>(res, "연락 기록을 불러오지 못했습니다.")
      setLogs(data.logs)
    } catch (err) {
      setLogs([])
      showToast(err instanceof Error ? err.message : "연락 기록을 불러오지 못했습니다.", "error")
    } finally { setLogsLoading(false) }
  }, [])

  // 활동 인텔리전스는 보조 정보 — 실패해도 토스트로 방해하지 않고 빈 상태로 둔다.
  const fetchActivity = useCallback(async (leadId: string) => {
    setActivityLoading(true)
    try {
      const res = await adminFetch(`/api/admin/leads/${leadId}/activity`)
      const data = await readAdminResponse<LeadActivity>(res, "활동 데이터를 불러오지 못했습니다.")
      setActivity(data)
    } catch {
      setActivity(null)
    } finally { setActivityLoading(false) }
  }, [])

  useEffect(() => {
    void fetchLeads()
  }, [fetchLeads])

  // ?focus=risk 딥링크 — 데이터 로드 후 리스크 밴드로 스크롤
  useEffect(() => {
    if (!focusRisk || loading || leads.length === 0) return
    document.getElementById("pipeline-risk")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [focusRisk, loading, leads.length])

  useEffect(() => {
    if (selected) {
      const updated = leads.find((l) => l.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [leads]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !deepLinkedLeadId ||
      loading ||
      leads.length === 0 ||
      selected?.id === deepLinkedLeadId ||
      dismissedDeepLinkedLeadId === deepLinkedLeadId
    )
      return
    const match = leads.find((lead) => lead.id === deepLinkedLeadId)
    if (match) {
      setSelected(match)
      if (deepLinkedContactAction) setContactDraft({ leadId: match.id, type: "call" })
    }
  }, [deepLinkedContactAction, deepLinkedLeadId, dismissedDeepLinkedLeadId, leads, loading, selected?.id])

  useEffect(() => {
    if (!selected || !deepLinkedContactAction) return
    const url = new URL(window.location.href)
    url.searchParams.delete("action")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [deepLinkedContactAction, selected])

  const closeSelectedLead = useCallback(() => {
    setSelected(null)
    setContactDraft(null)
    if (deepLinkedLeadId) setDismissedDeepLinkedLeadId(deepLinkedLeadId)
    const url = new URL(window.location.href)
    if (!url.searchParams.has("lead")) return
    url.searchParams.delete("lead")
    url.searchParams.delete("action")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [deepLinkedLeadId])

  // 검색어만 300ms 눌러서 URL에 반영한다 — 나머지 축은 클릭 단위라 즉시 반영해도 되지만,
  // 검색은 키 입력마다 replaceState를 불러 타이핑 중 히스토리 API를 초당 수십 번 두드렸다.
  const [urlSearchQuery, setUrlSearchQuery] = useState(searchQuery)
  useEffect(() => {
    const timer = window.setTimeout(() => setUrlSearchQuery(searchQuery), 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  // 렌즈·정렬·상태 필터·검색어·유입 그룹을 URL에 반영한다(히스토리를 늘리지 않는 replace) —
  // 링크 공유·새로고침에서 같은 화면. 읽기 쪽(useState 초기값)과 키가 짝을 이룬다.
  useEffect(() => {
    const url = new URL(window.location.href)
    const apply = (key: string, value: string, fallback: string) => {
      if (value === fallback) url.searchParams.delete(key)
      else url.searchParams.set(key, value)
    }
    applyLeadsViewParam(url, view)
    apply("lens", lens, "all")
    apply("sort", sortKey, "priority")
    apply("filter", filter, "all")
    apply("q", urlSearchQuery.trim(), "")
    apply("group", sourceGroup, "all")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [view, lens, sortKey, filter, urlSearchQuery, sourceGroup])

  // 렌즈나 축이 바뀌면 이전 축의 트래킹 선택은 의미를 잃는다 — 조용히 남겨두면 빈 목록이 된다.
  useEffect(() => {
    setTrackingKey(null)
  }, [lens, trackingDimension])

  // 드로어 열릴 때 로그 + 활동 인텔리전스 로드
  useEffect(() => {
    if (selected) {
      fetchLogs(selected.id)
      fetchActivity(selected.id)
    } else {
      setLogs([])
      setActivity(null)
    }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const requestAssignmentPreview = useCallback(async (ids: string[]) => {
    const res = await adminFetch("/api/admin/leads/assignment-preview", {
      method: "POST",
      adminReadOnly: true,
      body: JSON.stringify({ ids }),
    })
    return readAdminResponse<LeadAssignmentPreviewResponse>(
      res,
      "배정 안전성을 확인하지 못했습니다."
    )
  }, [])

  useEffect(() => {
    if (!bulkAssignOpen || selectedLeadIds.size === 0) {
      setAssignmentPreview(null)
      setAssignmentPreviewError(null)
      setAssignmentPreviewLoading(false)
      return
    }

    let cancelled = false
    setAssignmentPreviewLoading(true)
    setAssignmentPreviewError(null)
    void requestAssignmentPreview(Array.from(selectedLeadIds))
      .then((preview) => {
        if (!cancelled) setAssignmentPreview(preview)
      })
      .catch((error) => {
        if (cancelled) return
        setAssignmentPreview(null)
        setAssignmentPreviewError(error instanceof Error ? error.message : "배정 안전성을 확인하지 못했습니다.")
      })
      .finally(() => {
        if (!cancelled) setAssignmentPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bulkAssignOpen, requestAssignmentPreview, selectedLeadIds])

  const applyLeadAssignment = async (
    ids: string[],
    ownerKey: string | null,
    preview?: LeadAssignmentPreviewResponse
  ) => {
    const res = await adminFetch("/api/admin/leads/bulk-assign", {
      method: "PATCH",
      body: JSON.stringify(
        ownerKey
          ? {
              ids,
              assigned_to: ownerKey,
              snapshotToken: preview?.snapshotToken,
              mode: "manual_reviewed",
              reasonCode: "operator_reviewed",
            }
          : { ids, assigned_to: null }
      ),
    })
    const data = await readAdminResponse<{
      leads: LeadRecord[]
      updated: number
      missing: number
      assignedTo: string | null
    }>(res, "담당자를 저장하지 못했습니다.")
    const updated = new Map(data.leads.map((lead) => [lead.id, lead]))
    setLeads((prev) => prev.map((lead) => updated.get(lead.id) ?? lead))
    setSelected((prev) => (prev ? updated.get(prev.id) ?? prev : prev))
    return data
  }

  const handleStatus = async (id: string, status: LeadStatus, options?: { silent?: boolean }) => {
    setStatusUpdatingIds((prev) => new Set(prev).add(id))
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
      // 서버 응답 리드를 그대로 반영한다 — 상태 전이 때 서버가 함께 채우는 confirmed_at을
      // 버리면 "미확인" 배지·수신함 카운트가 새로고침 전까지 어긋난다.
      const data = await readAdminResponse<{ lead: LeadRecord }>(res, "상태를 변경하지 못했습니다.")
      setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)))
      if (!options?.silent) showToast(`"${STATUS_LABEL[status]}" 상태로 변경했습니다.`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "상태를 변경하지 못했습니다.", "error")
    } finally {
      setStatusUpdatingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleNotes = async (id: string, notes: string) => {
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ notes }) })
      await readAdminResponse(res, "메모를 저장하지 못했습니다.")
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, notes } : l))
    } catch (err) {
      const error = err instanceof Error ? err : new Error("메모를 저장하지 못했습니다.")
      showToast(error.message, "error")
      throw error
    }
  }

  const handleFollowUp = async (id: string, date: string) => {
    const follow_up_at = date ? toFollowUpTimestamp(date) : null
    try {
      const res = await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify({ follow_up_at }) })
      await readAdminResponse(res, "팔로업 일정을 저장하지 못했습니다.")
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, follow_up_at: follow_up_at ?? undefined } : l))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "팔로업 일정을 저장하지 못했습니다.", "error")
    }
  }

  const handleAssignedTo = async (id: string, name: string) => {
    try {
      const preview = name ? await requestAssignmentPreview([id]) : undefined
      if (preview && preview.blockedLeadIds.length > 0) {
        throw new Error("이 리드는 확인·테스트·중복·최근성 조건 중 하나를 충족하지 않아 바로 배정할 수 없습니다.")
      }
      await applyLeadAssignment([id], name || null, preview)
      showToast(name ? "담당자를 배정했습니다." : "담당자 배정을 해제했습니다.")
    } catch (err) {
      const error = err instanceof Error ? err : new Error("담당자를 저장하지 못했습니다.")
      showToast(error.message, "error")
      throw error
    }
  }

  const handleAddLog = async (entry: { type: ContactLogType; result?: ContactLogResult; notes?: string; contacted_by?: string }) => {
    if (!selected) return
    try {
      const res = await adminFetch(`/api/admin/leads/${selected.id}/logs`, {
        method: "POST",
        body: JSON.stringify(entry),
      })
      const data = await readAdminResponse<{
        statusSync: "updated" | "unchanged" | "failed"
        warning?: string
      }>(res, "연락 기록을 저장하지 못했습니다.")
      await fetchLogs(selected.id)
      if (selected.status === "new" && data.statusSync === "updated") {
        const next = { ...selected, status: "contacted" as const, confirmed_at: new Date().toISOString() }
        setLeads((prev) => prev.map((lead) => (lead.id === selected.id ? next : lead)))
        setSelected(next)
      }
      showToast(data.warning ?? "연락 기록이 저장되었습니다.", data.warning ? "error" : undefined)
    } catch (err) {
      const error = err instanceof Error ? err : new Error("연락 기록을 저장하지 못했습니다.")
      showToast(error.message, "error")
      throw error
    }
  }

  const handleDeleteLog = async (logId: string) => {
    if (!selected) return
    try {
      const res = await adminFetch(`/api/admin/leads/${selected.id}/logs?logId=${logId}`, { method: "DELETE" })
      await readAdminResponse(res, "연락 기록을 삭제하지 못했습니다.")
      setLogs((prev) => prev.filter((l) => l.id !== logId))
    } catch (err) {
      showToast(err instanceof Error ? err.message : "연락 기록을 삭제하지 못했습니다.", "error")
    }
  }

  const handleConvert = async (lead: LeadRecord) => {
    if (convertingIds.has(lead.id)) return
    setConvertingIds((prev) => new Set(prev).add(lead.id))
    try {
      const res = await adminFetch(`/api/admin/leads/${lead.id}/convert-v2`, { method: "POST" })
      const { customer, deal, lead: updatedLead, links, reusedExisting } = await readAdminResponse<ConvertLeadResponse>(
        res,
        "V2 고객사·거래 등록에 실패했습니다."
      )

      setLeads((prev) => prev.map((l) => l.id === lead.id ? updatedLead : l))
      setConvertResult({
        customerName: customer.name,
        dealCode: deal.deal_code ?? null,
        reused: Boolean(reusedExisting?.customer || reusedExisting?.deal),
        dealUrl:
          links?.deal ??
          (deal.id ? `/admin/crm/deals/orders?deal=${encodeURIComponent(deal.id)}` : null),
        customerUrl:
          links?.customer ?? `/admin/crm/customers/unified?q=${encodeURIComponent(customer.name)}`,
        // 딜 컨텍스트를 견적 작성기로 프리필 — 고객 재입력 없이 견적 생성으로 이어짐.
        quoteUrl: deal.id
          ? `/admin/quotes?tab=hardware&action=new&dealId=${encodeURIComponent(deal.id)}`
          : null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "고객사·거래 등록에 실패했습니다."
      showToast(message, "error")
    } finally {
      setConvertingIds((prev) => {
        const next = new Set(prev)
        next.delete(lead.id)
        return next
      })
    }
  }

  // 벌크 PATCH 공통기 — 8건씩 끊어 보낸다. 수백 건을 한 번에 발사하면 브라우저 연결 한도와
  // 서버가 같이 밀리고, 부분 실패 시 어디까지 갔는지도 알기 어렵다. 성공 행은 서버 응답
  // 리드로 병합한다(낙관적 덮어쓰기 금지 — confirmed_at 등 서버 산출 필드 보존).
  const patchLeadsInChunks = async (ids: string[], body: Record<string, unknown>, fallbackMessage: string) => {
    const succeeded: LeadRecord[] = []
    let firstError: Error | null = null
    const CHUNK = 8
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const settled = await Promise.allSettled(
        chunk.map(async (id) => {
          const res = await adminFetch(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) })
          const data = await readAdminResponse<{ lead: LeadRecord }>(res, fallbackMessage)
          return data.lead
        })
      )
      for (const result of settled) {
        if (result.status === "fulfilled") succeeded.push(result.value)
        else if (!firstError) firstError = result.reason instanceof Error ? result.reason : new Error(fallbackMessage)
      }
    }
    if (succeeded.length > 0) {
      const merged = new Map(succeeded.map((lead) => [lead.id, lead]))
      setLeads((prev) => prev.map((lead) => merged.get(lead.id) ?? lead))
    }
    return { succeeded, failedCount: ids.length - succeeded.length, firstError }
  }

  // "확인" — 공개 채널 리드를 기본 리드 화면으로 승격한다. 단건(드로어) · 다건(수신함 배너·벌크 바) 공용.
  const handleConfirmMany = async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return
    // 다건은 실행 전에 묻는다 — "전체 확인"은 수백 건이 한 번에 승격될 수 있고 되돌리기가 없다.
    if (uniqueIds.length > 1 && !confirm(`${uniqueIds.length}건을 모두 확인 처리할까요? 확인된 리드는 기본 목록에 합류합니다.`)) return

    setConfirmingIds((prev) => {
      const next = new Set(prev)
      uniqueIds.forEach((id) => next.add(id))
      return next
    })
    try {
      const { succeeded, failedCount, firstError } = await patchLeadsInChunks(
        uniqueIds,
        { confirmed: true },
        "리드를 확인 처리하지 못했습니다."
      )
      if (failedCount > 0) {
        showToast(
          succeeded.length > 0
            ? `${succeeded.length}건 확인, ${failedCount}건 실패: ${firstError?.message ?? ""}`
            : firstError?.message ?? "리드를 확인 처리하지 못했습니다.",
          "error"
        )
        return
      }
      showToast(`${succeeded.length}건 확인 처리했습니다.`)
    } finally {
      setConfirmingIds((prev) => {
        const next = new Set(prev)
        uniqueIds.forEach((id) => next.delete(id))
        return next
      })
    }
  }

  // 벌크 상태 변경 — 선택한 신규 리드를 "연락중"으로 넘기거나 선택 전체를 "종료"로 정리한다.
  const handleBulkStatus = async (ids: string[], status: LeadStatus) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return
    if (
      status === "closed" &&
      !confirm(`${uniqueIds.length}건을 "종료" 상태로 변경할까요? 활성 파이프라인에서 빠집니다.`)
    )
      return
    setBulkWorking(true)
    try {
      const { succeeded, failedCount, firstError } = await patchLeadsInChunks(
        uniqueIds,
        { status },
        "상태를 변경하지 못했습니다."
      )
      if (failedCount > 0) {
        showToast(
          succeeded.length > 0
            ? `${succeeded.length}건 변경, ${failedCount}건 실패: ${firstError?.message ?? ""}`
            : firstError?.message ?? "상태를 변경하지 못했습니다.",
          "error"
        )
        return
      }
      showToast(`${succeeded.length}건을 "${STATUS_LABEL[status]}" 상태로 변경했습니다.`)
    } finally {
      setBulkWorking(false)
    }
  }

  // 벌크 담당자 지정 — 검증된 CRM 담당자를 서버 한 번의 UPDATE로 배정한다.
  // 수백 건을 리드별 PATCH로 보내던 흐름은 부분 실패·긴 대기·비정규 이름 입력을 만들었다.
  const handleBulkAssign = async (ids: string[], ownerKey: string | null) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return
    let preview: LeadAssignmentPreviewResponse | undefined
    if (ownerKey) {
      try {
        preview = await requestAssignmentPreview(uniqueIds)
      } catch (err) {
        showToast(err instanceof Error ? err.message : "배정 안전성을 확인하지 못했습니다.", "error")
        return
      }
      if (preview.blockedLeadIds.length > 0) {
        showToast(
          `안전 조건을 충족하지 않은 ${preview.blockedLeadIds.length}건이 포함되어 있습니다. 안전 대상만 다시 선택해 주세요.`,
          "error"
        )
        setAssignmentPreview(preview)
        return
      }
      const selectedIds = new Set(uniqueIds)
      const profile = buildLeadAssignmentProfile(leads.filter((lead) => selectedIds.has(lead.id)))
      const ownerLabel = crmOwners.find((owner) => owner.ownerKey === ownerKey)?.displayName ?? ownerKey
      if (
        !confirm(
          `${uniqueIds.length}건을 "${ownerLabel}" 담당자에게 배정할까요?\n${formatLeadAssignmentProfile(profile)}`
        )
      )
        return
    }
    setBulkWorking(true)
    try {
      const data = await applyLeadAssignment(uniqueIds, ownerKey, preview)
      setSelectedLeadIds(new Set())
      setBulkAssignOpen(false)
      setBulkOwnerKey("")

      const ownerLabel = crmOwners.find((owner) => owner.ownerKey === data.assignedTo)?.displayName ?? data.assignedTo
      showToast(
        data.assignedTo
          ? `${data.updated}건을 "${ownerLabel}" 담당자에게 배정했습니다.`
          : `${data.updated}건의 담당자 배정을 해제했습니다.`
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : "담당자를 저장하지 못했습니다.", "error")
    } finally {
      setBulkWorking(false)
    }
  }

  const handleDeleteMany = async (
    ids: string[],
    options?: { confirmMessage?: string; successMessage?: string }
  ) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return

    const confirmMessage =
      options?.confirmMessage ??
      `${uniqueIds.length}개 리드를 완전히 삭제할까요? 실수/스팸 리드 정리용이며 되돌릴 수 없습니다.`

    if (!confirm(confirmMessage)) return

    setDeletingIds((prev) => {
      const next = new Set(prev)
      uniqueIds.forEach((id) => next.add(id))
      return next
    })

    try {
      const results = await Promise.allSettled(
        uniqueIds.map(async (id) => {
          const res = await adminFetch(`/api/admin/leads/${id}`, { method: "DELETE" })
          await readAdminResponse<{ ok: true }>(res, "리드를 삭제하지 못했습니다.")
          return id
        })
      )
      const deletedIds = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
        .map((result) => result.value)
      const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected")
      const failedCount = uniqueIds.length - deletedIds.length

      if (deletedIds.length > 0) {
        const deletedIdSet = new Set(deletedIds)
        setLeads((prev) => prev.filter((lead) => !deletedIdSet.has(lead.id)))
        setSelected((prev) => (prev && deletedIdSet.has(prev.id) ? null : prev))
        setSelectedLeadIds((prev) => {
          const next = new Set(prev)
          deletedIds.forEach((id) => next.delete(id))
          return next
        })
      }

      if (failedCount > 0) {
        const message = failed?.reason instanceof Error ? failed.reason.message : "리드를 삭제하지 못했습니다."
        showToast(
          deletedIds.length > 0 ? `${deletedIds.length}개 삭제, ${failedCount}개 실패: ${message}` : message,
          "error"
        )
        return
      }

      showToast(options?.successMessage ?? `${deletedIds.length}개 리드를 삭제했습니다.`)
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        uniqueIds.forEach((id) => next.delete(id))
        return next
      })
    }
  }

  const handleDelete = async (id: string) => {
    const lead = leads.find((item) => item.id === id)
    await handleDeleteMany([id], {
      confirmMessage: `"${getLeadDisplayName(lead)}" 리드를 완전히 삭제할까요? 연락 기록도 함께 정리되며 되돌릴 수 없습니다.`,
      successMessage: "리드가 삭제되었습니다.",
    })
  }

  const deferredSearch = useDeferredValue(searchQuery)

  // 시간 버킷(24h/48h·오늘/지연 판정)이 렌더마다 흔들리지 않도록 now를 60초 틱으로 고정한다.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // 리드 파생 집계 — 렌더마다 재계산하지 않도록 입력(리드·필터·지연검색·now틱)에만 반응해 memo한다.
  // 계산 내용·필터 의미·유입 패싯 카운트 규칙은 이전과 동일. 선택(selectedLeadIds)·삭제중(deletingIds)
  // 상태 의존 값만 memo 밖에서 계산해, 체크박스 토글이 보드 전체 재계산을 유발하지 않게 한다.
  const {
    now,
    today,
    unconfirmedLeads,
    activeLeads,
    sourceDetailOptions,
    leadMagnetOptions,
    sourceGroupChips,
    sourceChipTotal,
    filtered,
    filteredIds,
    overdueFollowUps,
    stalledLeads,
    pipelineRiskLeads,
    stageSummaries,
    stageTotal,
    ownerSummaries,
    filterCards,
    todayFollowUpCount,
    priorityMap,
    lensCounts,
    trackingScopeLeads,
    hiddenUnconfirmedCount,
    boardColumns,
    boardTotals,
    boardFocus,
    boardCrossFilter,
  } = useMemo(() => {
    const now = new Date(nowMs)
    const today = toLocalDateKey(now)
    // 우선순위는 리드 전체에 대해 한 번만 계산하고 정렬·행 표시·요약이 같은 Map을 본다.
    // (activitySummary가 늦게 도착하면 그때 한 번 더 계산 — 그 사이에도 유입 신호만으로 순서가 선다.)
    const priorityMap = new Map<string, LeadPriority>()
    for (const lead of leads) {
      priorityMap.set(lead.id, calcLeadPriority(lead, getEngagement(activitySummary, lead.id), nowMs))
    }
    // 렌즈가 모집단을 먼저 자른다 — 아래 상태·유입·검색 필터는 전부 이 집합 위에서 돈다.
    const marketingLeads = leads.filter(isMarketingLead)
    const lensCounts = { all: leads.length, marketing: marketingLeads.length }
    const lensLeads = lens === "marketing" ? marketingLeads : leads
    // 미확인(공개 채널, 검토 전) 리드는 별도 수신함으로 취급 — "활성/단계별" 집계에서 제외해
    // 실제로 다루고 있는 리드 수만 반영한다. 응대 SLA(미응답 큐)는 확인 여부와 무관하게 잡는다.
    const unconfirmedLeads = lensLeads.filter(isUnconfirmedLead)
    const confirmedLeads = lensLeads.filter((l) => !isUnconfirmedLead(l))
    const activeLeads = confirmedLeads.filter((l) => isActiveLead(l.status))
    const sourceDetailOptions = Array.from(
      new Set(lensLeads.map((lead) => getLeadSourceDetail(lead)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "ko"))
    const leadMagnetOptions = Array.from(
      new Set(lensLeads.map((lead) => lead.lead_magnet?.trim()).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b, "ko"))
    const searchTokens = tokenizeLeadSearch(deferredSearch)
    // 상태별 필터 술어 — 목록·필터 카드 카운트가 같은 판정을 공유한다(카운트≠목록 어긋남 방지).
    const matchesStatusFilter = (lead: LeadRecord, key: LeadFilter) => {
      if (key === "all") return true
      if (key === "unconfirmed") return isUnconfirmedLead(lead)
      if (key === "unresponded") return isUnrespondedLead(lead)
      if (key === "unresponded_24h") return isUnrespondedLead(lead) && hoursBetween(lead.timestamp, now) >= 24
      if (key === "unresponded_48h") return isUnrespondedLead(lead) && hoursBetween(lead.timestamp, now) >= 48
      if (key === "unassigned") return isActiveLead(lead.status) && !lead.assigned_to?.trim()
      return lead.status === key
    }
    // 상태 외 필터(유입·세부유입·채널·마그넷·트래킹·검색) 술어 — 필터 카드·유입 칩 카운트가
    // "그 카드를 눌렀을 때 실제로 보게 될 건수"를 보여주기 위해 공유한다.
    const matchesSubFilters = (lead: LeadRecord, options?: { skipSourceGroup?: boolean }) => {
      if (!options?.skipSourceGroup && sourceGroup !== "all" && getLeadSourceGroup(lead) !== sourceGroup) return false
      if (sourceDetailFilter !== "all" && getLeadSourceDetail(lead) !== sourceDetailFilter) return false
      if (channelSource && lead.source !== channelSource) return false
      if (leadMagnetFilter !== "all" && lead.lead_magnet !== leadMagnetFilter) return false
      if (trackingKey && getLeadTrackingKey(lead, trackingDimension) !== trackingKey) return false
      return matchesLeadSearch(lead, searchTokens)
    }
    // 상태/SLA 필터까지만 적용한 중간 집합 — 아래 유입·검색 필터는 이 집합 위에서 돈다.
    const statusFiltered = lensLeads.filter((lead) => {
      // 응대 SLA 큐·미확인 큐가 아니면 검토 전 리드는 기본 화면에서 숨긴다("미확인 포함"으로 해제).
      if (!includeUnconfirmed && !CONFIRMATION_GATE_EXEMPT_FILTERS.has(filter) && isUnconfirmedLead(lead))
        return false
      return matchesStatusFilter(lead, filter)
    })
    // 유입 칩 — 자신(유입 그룹)을 뺀 나머지 활성 필터를 모두 적용한 패싯 카운트.
    // 칩 숫자와 "그 칩을 눌렀을 때의 목록 건수"가 일치한다(검색 중 과대 집계 방지).
    const chipScope = statusFiltered.filter((lead) => matchesSubFilters(lead, { skipSourceGroup: true }))
    const sourceGroupCounts = new Map<LeadSourceGroup, number>()
    for (const lead of chipScope) {
      const group = getLeadSourceGroup(lead)
      sourceGroupCounts.set(group, (sourceGroupCounts.get(group) ?? 0) + 1)
    }
    const sourceChipTotal = chipScope.length
    const sourceGroupChips = SOURCE_GROUP_ORDER
      .map((group) => ({ group, label: SOURCE_GROUP_LABEL[group], count: sourceGroupCounts.get(group) ?? 0 }))
      // 현재 상태 뷰에 존재하는 묶음만 노출하되, 이미 선택한 그룹은 0건이어도 남겨 해제할 수 있게 한다.
      .filter((chip) => chip.count > 0 || chip.group === sourceGroup)
    // 트래킹 롤업이 보는 집합 — 렌즈+상태+유입+검색까지. 롤업 행을 고르면 여기서 한 겹 더 좁힌다.
    // (트래킹 키 자체는 제외 — 롤업 표가 키별 건수를 보여주는 모집단이므로.)
    const trackingScopeLeads = statusFiltered.filter((lead) => {
      if (sourceGroup !== "all" && getLeadSourceGroup(lead) !== sourceGroup) return false
      if (sourceDetailFilter !== "all" && getLeadSourceDetail(lead) !== sourceDetailFilter) return false
      if (channelSource && lead.source !== channelSource) return false
      if (leadMagnetFilter !== "all" && lead.lead_magnet !== leadMagnetFilter) return false
      return matchesLeadSearch(lead, searchTokens)
    })
    const filtered = sortLeads(
      trackingKey
        ? trackingScopeLeads.filter(
            (lead) => getLeadTrackingKey(lead, trackingDimension) === trackingKey
          )
        : trackingScopeLeads,
      sortKey,
      { engagements: activitySummary, priorities: priorityMap, nowMs }
    )
    const todayFollowUps = lensLeads.filter((l) =>
      l.follow_up_at && toLocalDateKey(l.follow_up_at) === today && isActiveLead(l.status)
    )
    const overdueFollowUps = lensLeads.filter((l) =>
      l.follow_up_at && toLocalDateKey(l.follow_up_at) < today && isActiveLead(l.status)
    )
    const stalledLeads = activeLeads.filter((lead) => {
      const createdDays = daysBetween(lead.timestamp)
      const followUpKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
      return createdDays >= 7 && (!followUpKey || followUpKey < today)
    })
    // 두 배열을 매 리드마다 선형 탐색하면 활성 리드 수의 제곱으로 늘어난다(3천 건이면 수백만 비교).
    // 이 memo는 60초 틱과 모든 필터 변경마다 다시 도므로 id Set으로 한 번만 색인한다.
    const riskIds = new Set<string>()
    for (const lead of stalledLeads) riskIds.add(lead.id)
    for (const lead of overdueFollowUps) riskIds.add(lead.id)
    const pipelineRiskLeads = [...activeLeads]
      .filter((lead) => riskIds.has(lead.id))
      .sort((a, b) => {
        const aFollowUp = a.follow_up_at ? toLocalDateKey(a.follow_up_at) : null
        const bFollowUp = b.follow_up_at ? toLocalDateKey(b.follow_up_at) : null
        const aOverdueDays = aFollowUp && aFollowUp < today ? daysBetween(a.follow_up_at!) : 0
        const bOverdueDays = bFollowUp && bFollowUp < today ? daysBetween(b.follow_up_at!) : 0
        return bOverdueDays - aOverdueDays || daysBetween(b.timestamp) - daysBetween(a.timestamp)
      })
      .slice(0, 5)
    const stageSummaries = (Object.keys(STATUS_LABEL) as LeadStatus[]).map((status) => {
      const stageLeads = confirmedLeads.filter((lead) => lead.status === status)
      const stageOverdue = stageLeads.filter((lead) => lead.follow_up_at && toLocalDateKey(lead.follow_up_at) < today && isActiveLead(lead.status)).length
      const highScore = stageLeads.filter((lead) => calcScore(lead) >= 70).length
      return { status, count: stageLeads.length, stageOverdue, highScore }
    })
    const ownerSummaries = Array.from(
      activeLeads.reduce((acc, lead) => {
        const owner = getLeadOwner(lead)
        const current = acc.get(owner) ?? { owner, total: 0, newCount: 0, contactedCount: 0, unrespondedCount: 0, overdueCount: 0, highScoreCount: 0 }
        current.total += 1
        if (lead.status === "new") current.newCount += 1
        if (lead.status === "contacted") current.contactedCount += 1
        if (isUnrespondedLead(lead)) current.unrespondedCount += 1
        if (lead.follow_up_at && toLocalDateKey(lead.follow_up_at) < today) current.overdueCount += 1
        if (calcScore(lead) >= 70) current.highScoreCount += 1
        acc.set(owner, current)
        return acc
      }, new Map<string, { owner: string; total: number; newCount: number; contactedCount: number; unrespondedCount: number; overdueCount: number; highScoreCount: number }>())
        .values()
    ).sort((a, b) => b.total - a.total || b.overdueCount - a.overdueCount)
    // 카드 숫자는 "그 카드를 눌렀을 때 목록에 실제로 뜨는 건수" — 검색어·유입·마그넷 등
    // 나머지 활성 필터를 그대로 얹어 센다. 카드별 확인 게이트도 클릭 후와 같은 규칙을 쓴다.
    const countForFilter = (key: LeadFilter) =>
      lensLeads.filter((lead) => {
        if (!includeUnconfirmed && !CONFIRMATION_GATE_EXEMPT_FILTERS.has(key) && isUnconfirmedLead(lead)) return false
        return matchesStatusFilter(lead, key) && matchesSubFilters(lead)
      }).length
    const filterCards: Array<{ key: LeadFilter; label: string; count: number }> = [
      { key: "all", label: "전체", count: countForFilter("all") },
      { key: "unconfirmed", label: "미확인", count: countForFilter("unconfirmed") },
      { key: "new", label: "신규", count: countForFilter("new") },
      { key: "unresponded", label: "응대 전", count: countForFilter("unresponded") },
      { key: "unresponded_24h", label: "24h+", count: countForFilter("unresponded_24h") },
      { key: "unresponded_48h", label: "48h+", count: countForFilter("unresponded_48h") },
      { key: "unassigned", label: "미배정", count: countForFilter("unassigned") },
      { key: "contacted", label: "연락중", count: countForFilter("contacted") },
      { key: "converted", label: "전환", count: countForFilter("converted") },
      { key: "closed", label: "종료", count: countForFilter("closed") },
    ]
    // ─── 보드 뷰 ────────────────────────────────────────────────
    // 상태 축 필터(신규·연락중·전환·종료·미확인)는 보드에서 행을 지우지 않고 컬럼 포커스로
    // 강등한다 — 그대로 AND로 걸면 5컬럼 중 4개가 설명 없이 빈다(설계 §2).
    // 그래서 컬럼 모집단은 상태 필터를 뺀 집합이고, 직교 필터(시간·배정)만 그 위에 AND로 걸린다.
    //
    // 확인 게이트는 여기서 걸지 않는다. 미확인 리드는 resolveBoardColumn 이 '미확인' 컬럼으로
    // 보내고 그 컬럼만 게이트 밖이라는 배지를 단다 — 콘솔의 includeUnconfirmed 토글은 건드리지 않는다.
    const boardPopulation = lensLeads.filter((lead) => matchesSubFilters(lead))
    const boardCrossFilter = appliesAcrossBoardColumns(filter)
    const boardTotals = (() => {
      const partitioned = partitionLeadsToBoardColumns(boardPopulation)
      return Object.fromEntries(
        (Object.keys(partitioned) as BoardColumnKey[]).map((key) => [key, partitioned[key].length])
      ) as Record<BoardColumnKey, number>
    })()
    const boardColumns = partitionLeadsToBoardColumns(
      sortLeads(
        boardCrossFilter
          ? boardPopulation.filter((lead) => matchesStatusFilter(lead, filter))
          : boardPopulation,
        sortKey,
        { engagements: activitySummary, priorities: priorityMap, nowMs }
      )
    )
    const boardFocus = resolveBoardColumnFocus(filter)

    // 숫자 진입점은 아래 필터 카운트 카드로 단일화 — 여기서 별도 카드 배열을 만들지 않는다.
    // 필터 카드에 없는 "오늘 예정"(팔로업)만 큐 패널 헤더 배지로 노출한다.
    // 비율 바의 분모 — 네 단계 합(= 확인 완료 리드 수). activeLeads 는 전환·종료를 빼므로 분모가 아니다.
    const stageTotal = stageSummaries.reduce((sum, stage) => sum + stage.count, 0)
    const todayFollowUpCount = todayFollowUps.length
    const filteredIds = filtered.map((lead) => lead.id)
    // 지금 게이트에 걸려 안 보이는 미확인 리드 수 — 숫자를 숨기지 않고 토글 옆에 그대로 붙인다.
    const hiddenUnconfirmedCount =
      !includeUnconfirmed && !CONFIRMATION_GATE_EXEMPT_FILTERS.has(filter)
        ? unconfirmedLeads.length
        : 0
    return {
      now,
      today,
      unconfirmedLeads,
      activeLeads,
      sourceDetailOptions,
      leadMagnetOptions,
      sourceGroupChips,
      sourceChipTotal,
      filtered,
      filteredIds,
      overdueFollowUps,
      stalledLeads,
      pipelineRiskLeads,
      stageSummaries,
      stageTotal,
      ownerSummaries,
      filterCards,
      todayFollowUpCount,
      priorityMap,
      lensCounts,
      trackingScopeLeads,
      hiddenUnconfirmedCount,
      boardColumns,
      boardTotals,
      boardFocus,
      boardCrossFilter,
    }
  }, [
    leads,
    activitySummary,
    lens,
    sortKey,
    includeUnconfirmed,
    trackingDimension,
    trackingKey,
    filter,
    sourceGroup,
    sourceDetailFilter,
    channelSource,
    leadMagnetFilter,
    deferredSearch,
    nowMs,
  ])

  // 더보기(클라 배열 슬라이싱) — 모바일 카드·데스크톱 테이블이 공유한다.
  const {
    visible: visibleLeadCount,
    showMore: showMoreLeads,
    collapse: collapseLeads,
    canMore: canMoreLeads,
    canCollapse: canCollapseLeads,
  } = useVisibleCount(filtered.length, LEAD_BOARD_LIST_STEP)

  // 필터(응대 큐/소스/채널/리드마그넷/검색어)가 바뀌면 새 결과셋의 맨 위(초기 50건)부터
  // 다시 보여준다 — 이전 필터에서 펼친 범위가 무관한 결과에 남지 않도록.
  useEffect(() => {
    collapseLeads()
  }, [
    lens,
    includeUnconfirmed,
    trackingKey,
    filter,
    sourceGroup,
    sourceDetailFilter,
    channelSource,
    leadMagnetFilter,
    searchQuery,
    collapseLeads,
  ])

  // 벌크 선택은 전량 초기화 대신 "현재 결과에 남아 있는 것"만 남긴다 — 검색으로 좁혀 몇 건
  // 고른 뒤 조건을 되돌려도 선택이 살아남되, 필터 밖으로 사라진 리드가 벌크 삭제/전환 대상에
  // 남는 일(데이터 손실 위험)은 없다. next ⊆ prev이므로 크기가 같으면 내용도 같다.
  useEffect(() => {
    setSelectedLeadIds((prev) => {
      if (prev.size === 0) return prev
      const allowed = new Set(filteredIds)
      const next = new Set(Array.from(prev).filter((id) => allowed.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [filteredIds])

  // 헤더 체크박스는 "화면에 그려진 행"만 다룬다 — 더보기로 잘린 화면 밖 수백 건이
  // 보이지 않게 선택되는 함정을 막는다. 결과 전체 선택은 벌크 바의 명시 버튼으로만.
  const visibleIds = useMemo(
    () => filtered.slice(0, visibleLeadCount).map((lead) => lead.id),
    [filtered, visibleLeadCount]
  )
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedLeadIds.has(id))
  const selectedVisibleCount = visibleIds.filter((id) => selectedLeadIds.has(id)).length
  const selectedFilteredCount = filteredIds.filter((id) => selectedLeadIds.has(id)).length
  const selectedAssignmentProfile = useMemo(() => {
    if (selectedLeadIds.size === 0) return null
    return buildLeadAssignmentProfile(
      filtered.filter((lead) => selectedLeadIds.has(lead.id)),
      nowMs
    )
  }, [filtered, nowMs, selectedLeadIds])
  const assignmentPreviewOtherBlockers = assignmentPreview
    ? assignmentPreview.blockerCounts.test_lead +
      assignmentPreview.blockerCounts.partial_duplicate_cohort +
      assignmentPreview.blockerCounts.stale_30d +
      assignmentPreview.blockerCounts.missing_contact +
      assignmentPreview.blockerCounts.already_assigned +
      assignmentPreview.blockerCounts.inactive +
      assignmentPreview.blockerCounts.missing
    : 0
  const assignmentApplyReady = Boolean(
    assignmentPreview &&
      assignmentPreview.rosterHealthy &&
      assignmentPreview.requested === selectedLeadIds.size &&
      assignmentPreview.blockedLeadIds.length === 0 &&
      crmOwnerHealth?.ok === true
  )
  // 선택됐지만 현재 화면(더보기 상한) 밖에 있는 건수 — 벌크 바에 그대로 드러낸다.
  const selectedBeyondVisibleCount = selectedFilteredCount - selectedVisibleCount
  const selectedDeleting = Array.from(selectedLeadIds).some((id) => deletingIds.has(id))
  const selectedUnconfirmedIds = useMemo(() => {
    if (selectedLeadIds.size === 0) return [] as string[]
    const byId = new Map(filtered.map((lead) => [lead.id, lead]))
    return Array.from(selectedLeadIds).filter((id) => {
      const lead = byId.get(id)
      return lead ? isUnconfirmedLead(lead) : false
    })
  }, [selectedLeadIds, filtered])
  const handleToggleLeadSelection = (id: string, checked: boolean) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleToggleVisibleSelection = (checked: boolean) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      visibleIds.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }

  const handleToggleFilteredSelection = (checked: boolean) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      filteredIds.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }

  // 현재 필터·검색 결과를 CSV로 — 시트로 옮겨 돌리던 수작업(전화 리스트, 캠페인 보고)의 출구.
  const handleExportCsv = () => {
    if (filtered.length === 0) {
      showToast("내보낼 리드가 없습니다.", "error")
      return
    }
    const headers = ["이름", "기관", "전화", "이메일", "상태", "유입 그룹", "세부 유입", "리드마그넷", "담당자", "등록일", "팔로업", "점수", "메모"]
    const escapeCsv = (value: unknown) => {
      const text = value == null ? "" : String(value)
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    const lines = [headers.join(",")]
    for (const lead of filtered) {
      lines.push(
        [
          lead.name,
          lead.org,
          lead.phone,
          lead.email,
          STATUS_LABEL[lead.status],
          SOURCE_GROUP_LABEL[getLeadSourceGroup(lead)],
          getLeadSourceDetail(lead),
          lead.lead_magnet ? getLeadMagnetLabel(lead.lead_magnet) : "",
          lead.assigned_to,
          new Date(lead.timestamp).toLocaleString("ko-KR"),
          lead.follow_up_at ? new Date(lead.follow_up_at).toLocaleDateString("ko-KR") : "",
          calcScore(lead),
          lead.notes,
        ]
          .map(escapeCsv)
          .join(",")
      )
    }
    // BOM — 한글 헤더가 Excel에서 깨지지 않게.
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `leads-${toLocalDateKey(new Date())}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    showToast(`${filtered.length}건을 CSV로 내보냈습니다.`)
  }

  // 보드에서는 상태 축 카드(미확인·신규·연락중·전환·종료)를 내린다 — 바로 아래 컬럼이 같은 축을
  // 이미 그리고 있어 한 화면에 두 번 나온다. 그 자리는 컬럼 헤더 클릭(포커스)이 대신하고,
  // 카드로 남는 건 컬럼을 가로지르는 직교 축(응대·배정)뿐이다.
  const visibleFilterCards =
    view === "console"
      ? filterCards
      : filterCards.filter((item) => item.key === "all" || appliesAcrossBoardColumns(item.key))

  return (
    <div
      data-admin-crm
      aria-busy={
        loading ||
        bulkWorking ||
        deletingIds.size > 0 ||
        confirmingIds.size > 0 ||
        statusUpdatingIds.size > 0 ||
        convertingIds.size > 0
      }
      className="[&_a]:min-h-11 [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-[#084734] [&_a]:focus-visible:ring-offset-2 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734] [&_button]:focus-visible:ring-offset-2 [&_input:not([type=checkbox])]:min-h-11 [&_input]:focus-visible:outline-none [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-[#084734] [&_input]:focus-visible:ring-offset-1 [&_select]:min-h-11 [&_select]:focus-visible:outline-none [&_select]:focus-visible:ring-2 [&_select]:focus-visible:ring-[#084734] [&_select]:focus-visible:ring-offset-1 [&_textarea]:min-h-11 [&_textarea]:focus-visible:outline-none [&_textarea]:focus-visible:ring-2 [&_textarea]:focus-visible:ring-[#084734] [&_textarea]:focus-visible:ring-offset-1 sm:[&_a]:min-h-0 sm:[&_button]:min-h-0 sm:[&_button]:min-w-0 sm:[&_input:not([type=checkbox])]:min-h-0 sm:[&_select]:min-h-0"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {loading
          ? "리드 목록을 불러오는 중입니다."
          : bulkWorking ||
              deletingIds.size > 0 ||
              confirmingIds.size > 0 ||
              statusUpdatingIds.size > 0 ||
              convertingIds.size > 0
            ? "리드 변경사항을 저장하는 중입니다."
            : ""}
      </div>
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">리드</h1>
          <p className="mt-1 text-[13px] text-[#1a1a1a]/42">신규 유입 → 응대 → 전환 파이프라인</p>
          {/* 뷰 축은 제목 아래 — 액션 줄에 섞으면 CSV·새로고침과 같은 무게가 된다.
              전환은 어떤 상태도 리셋하지 않고, 같은 filter 를 뷰마다 다르게 해석할 뿐이다. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="리드 보기 방식"
            className="inline-flex rounded-lg border border-[#e8e8e4] bg-white p-0.5"
          >
            {([
              { key: "console", label: "콘솔", icon: <ListIcon className="h-3.5 w-3.5" /> },
              { key: "board", label: "보드", icon: <Columns3 className="h-3.5 w-3.5" /> },
            ] as const).map((option) => (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={view === option.key}
                onClick={() => setView(option.key)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                  view === option.key ? "bg-[#111110] text-white" : "text-[#1a1a1a]/55 hover:text-[#111110]"
                }`}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
          {/* 보드에서만: 모집단 축(전체/마케팅)을 헤더로 끌어올린다. */}
          {view === "board" ? (
            <div className="inline-flex rounded-lg border border-[#e8e8e4] bg-white p-0.5">
              {LENS_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  title={option.hint}
                  aria-pressed={lens === option.key}
                  onClick={() => setLens(option.key)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                    lens === option.key ? "bg-[#f0f0ec] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
                  }`}
                >
                  {option.label}
                  <span className="tabular-nums text-[#1a1a1a]/40">
                  {lensCounts[option.key].toLocaleString("ko-KR")}
                  </span>
                  </button>
              ))}
            </div>
          ) : null}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* 지금 보는 숫자가 언제 것인지 — 캐시본/이전 로드와 혼동하지 않게 갱신 시각을 남긴다. */}
          {lastLoadedAt ? (
            <span className="text-[11px] tabular-nums text-[#1a1a1a]/40">
              {lastLoadedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 갱신
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setLeadModalOpen(true)}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 sm:flex-none"
          >
            <UserPlus className="h-3.5 w-3.5" />
            리드 등록
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            title="현재 필터·검색 조건의 결과를 CSV 파일로 내려받습니다."
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:border-[#c8c8c4] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchLeads({ force: true })}
            disabled={loading}
            className="h-9 flex-1 gap-1.5 rounded-lg text-[12px] sm:flex-none"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />새로고침
          </Button>
        </div>
      </div>

      {/* 로드 실패 배너 — 이전 데이터가 화면에 남아 있어도 지금 실패했음을 숨기지 않는다. */}
      {loadError && leads.length > 0 ? (
        <div role="alert" aria-live="assertive" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-2.5">
          <p className="text-[12px] font-medium text-[#B85C33]">
            새로고침 실패 — 표시 중인 목록은 이전에 불러온 데이터입니다. ({loadError})
          </p>
          <button
            type="button"
            onClick={() => void fetchLeads({ force: true })}
            className="rounded-lg border border-[#F6D5C5] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FEF8F5]"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {/* 모아보기 렌즈 — 목록의 모집단을 정하는 최상위 축. 아래 상태·유입·검색 필터가 이 위에서 돈다.
          보드에서는 전폭 바 대신 헤더의 컴팩트 컨트롤이 같은 일을 한다 — 넓은 면을 채우는 요소를
          컬럼과 경쟁시키지 않는다(DESIGN.md: 넓은 면은 뉴트럴, 채움은 액센트에만). */}
      {view === "console" && (
      <div className="mb-4 flex flex-col gap-1.5 rounded-2xl border border-[#e8e8e4] bg-white p-2 sm:flex-row sm:items-stretch">
        {LENS_OPTIONS.map((option) => {
          const active = lens === option.key
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setLens(option.key)}
              aria-pressed={active}
              className={`flex flex-1 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-colors ${
                active ? "bg-[#111110] text-white" : "hover:bg-[#fafaf8]"
              }`}
            >
              <span className={active ? "text-white" : "text-[#1a1a1a]/35"}>
                {option.key === "all" ? <Layers className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold">{option.label}</span>
                  <span className="text-[14px] font-bold tabular-nums">
                    {lensCounts[option.key].toLocaleString("ko-KR")}
                  </span>
                </span>
                <span className={`mt-0.5 block truncate text-[11px] ${active ? "text-white/55" : "text-[#1a1a1a]/40"}`}>
                  {option.hint}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      )}

      {/* 마케팅 렌즈에서는 단계·담당자 카드 자리를 트래킹 롤업이 대신한다(패널을 더하지 않고 바꿔 끼운다). */}
      {/* 보드 뷰에서는 단계가 컬럼으로 서므로 이 패널들을 내린다 — 같은 축을 두 번 그리지 않는다. */}
      {view !== "console" ? null : lens === "marketing" ? (
        <LeadTrackingPanel
          leads={trackingScopeLeads}
          dimension={trackingDimension}
          onDimensionChange={setTrackingDimension}
          activeKey={trackingKey}
          onSelectKey={setTrackingKey}
        />
      ) : (
      /* 파이프라인 단계 + 담당자 — 숫자·필터 진입은 아래 카운트 카드가 단일 창구.
         여기는 카드에 없는 부가 정보(단계별 고득점·지연, 오늘 예정, 담당자 분포)만 남긴다. */
      <div id="lead-queue" className="mb-4 grid gap-3 lg:grid-cols-2 scroll-mt-24">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Pipeline</p>
              <h2 className="mt-1 text-[17px] font-bold text-[#111110]">단계별 현황</h2>
            </div>
            <div className="flex items-center gap-2">
              {todayFollowUpCount > 0 && (
                <span className="rounded-full border border-[#D7EBDD] px-3 py-1 text-[12px] font-medium text-[#084734]">
                  오늘 예정 {todayFollowUpCount}
                </span>
              )}
              <span
                title="아래 비율 바의 분모 — 확인 완료 리드를 네 단계가 남김없이 나눈 수입니다. '활성'은 여기서 전환·종료를 뺀 수입니다."
                className="rounded-full bg-[#f0f0ec] px-3 py-1 text-[12px] font-medium text-[#1a1a1a]/55"
              >
                활성 {activeLeads.length} / 전체 {stageTotal.toLocaleString("ko-KR")}건
              </span>
            </div>
          </div>
          <div className="divide-y divide-[#f0f0ec]">
            {stageSummaries.map((stage) => {
              // 네 단계는 확인 완료 리드를 남김없이 나눈다 — 그래서 비율의 합이 정확히 100%다.
              // (필터 카드는 게이트 면제 때문에 분모가 갈려 바를 못 그린다. 여기만 성립한다.)
              const share = stageTotal > 0 ? (stage.count / stageTotal) * 100 : 0
              return (
                <button
                  key={stage.status}
                  type="button"
                  onClick={() => setFilter(stage.status)}
                  title={`${STATUS_LABEL[stage.status]} ${stage.count.toLocaleString("ko-KR")}건 · 전체의 ${share.toFixed(1)}%`}
                  className="block w-full px-1 py-2.5 text-left transition-colors hover:bg-[#fafaf8]"
                >
                  <span className="flex items-center justify-between gap-3">
                    <StatusPill status={stage.status} />
                    <span className="flex items-center gap-3 text-[11px] text-[#1a1a1a]/40">
                      <span>고득점 {stage.highScore}</span>
                      {stage.stageOverdue > 0 && <span className="font-medium text-[#B85C33]">지연 {stage.stageOverdue}</span>}
                      <span className="min-w-[3rem] text-right text-[19px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#111110]">
                        {stage.count.toLocaleString("ko-KR")}
                      </span>
                    </span>
                  </span>
                  {/* 비중 — 색축은 상태점(STATUS_DOT)과 같은 것을 쓴다. 새 색을 들이지 않는다. */}
                  <span aria-hidden className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-[#f0f0ec]">
                    <span
                      className="block h-full rounded-full transition-[width]"
                      style={{ width: `${share}%`, backgroundColor: STATUS_DOT[stage.status] }}
                    />
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Owners</p>
              <h2 className="mt-1 text-[17px] font-bold text-[#111110]">담당자별 보유 리드</h2>
            </div>
            <span
              title="아래 비율 바의 분모 — 활성 리드를 담당자가 남김없이 나눈 수입니다(미배정 포함)."
              className="text-[12px] font-medium text-[#1a1a1a]/40"
            >
              {ownerSummaries.length}명 · 활성 {activeLeads.length.toLocaleString("ko-KR")}건
            </span>
          </div>
          {ownerSummaries.length === 0 ? (
            <p className="rounded-xl bg-[#fafaf8] px-3 py-8 text-center text-[13px] text-[#1a1a1a]/30">활성 리드가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {ownerSummaries.slice(0, OWNER_ROW_CAP).map((owner) => {
                // 담당자는 활성 리드를 남김없이 나눈다(미배정도 한 칸) — 그래서 비율의 합이 100%다.
                const share = activeLeads.length > 0 ? (owner.total / activeLeads.length) * 100 : 0
                const unassigned = owner.owner === "미배정"
                return (
                <div
                  key={owner.owner}
                  title={`${owner.owner} ${owner.total.toLocaleString("ko-KR")}건 · 활성의 ${share.toFixed(1)}%`}
                  className="rounded-xl border border-[#f0f0ec] px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className={`truncate text-[13px] font-semibold ${unassigned ? "text-[#B85C33]" : "text-[#111110]"}`}>
                      {owner.owner}
                    </p>
                    <p className={`text-[19px] font-bold leading-none tracking-[-0.02em] tabular-nums ${unassigned ? "text-[#B85C33]" : "text-[#111110]"}`}>
                      {owner.total.toLocaleString("ko-KR")}
                    </p>
                  </div>
                  {/* 비중 — 담당자는 상태 축이 아니라 중립색을 쓰고, 배분 공백(미배정)만 위험색으로 든다. */}
                  <span aria-hidden className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-[#f0f0ec]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${share}%`, backgroundColor: unassigned ? "#B85C33" : "#111110" }}
                    />
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-[#1a1a1a]/40">
                    <span>신규 {owner.newCount}</span>
                    {owner.unrespondedCount > 0 && <span className="font-medium text-[#B85C33]">응대 전 {owner.unrespondedCount}</span>}
                    <span>연락중 {owner.contactedCount}</span>
                    <span>고득점 {owner.highScoreCount}</span>
                    {owner.overdueCount > 0 && <span className="font-medium text-[#B85C33]">지연 {owner.overdueCount}</span>}
                  </div>
                </div>
                )
              })}
              {/* 가려진 담당자를 각주로 드러낸다 — 보이는 바의 합이 100%가 아닌 이유다. */}
              {ownerSummaries.length > OWNER_ROW_CAP ? (
                <p className="pt-0.5 text-center text-[11px] text-[#1a1a1a]/40">
                  +{(ownerSummaries.length - OWNER_ROW_CAP).toLocaleString("ko-KR")}명 ·{" "}
                  {ownerSummaries
                    .slice(OWNER_ROW_CAP)
                    .reduce((sum, owner) => sum + owner.total, 0)
                    .toLocaleString("ko-KR")}
                  건 숨김
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
      )}

      {/* 미확인 수신함 — 공개 폼(문의·데모·뉴스레터 등) 원본 유입. 확인해야 아래 리드 목록에 반영된다. */}
      {view === "console" && unconfirmedLeads.length > 0 && (
        <div id="unconfirmed-inbox" className="mb-6 scroll-mt-24 rounded-2xl border-[1.15px] border-[#ECD29C] bg-transparent p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A520F]/80">Unconfirmed Inbox</p>
              <h2 className="text-[16px] font-bold text-[#111110]">새 유입 · 미확인 {unconfirmedLeads.length}건</h2>
              <p className="mt-0.5 text-[12px] text-[#1a1a1a]/45">
                공개 폼(문의·데모·뉴스레터 등)으로 들어온 리드 — 확인하면 아래 리드 목록·집계에 반영됩니다.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setFilter("unconfirmed")}
                className="text-[12px] font-medium text-[#7A520F] hover:underline"
              >
                전체 보기
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmMany(unconfirmedLeads.map((lead) => lead.id))}
                disabled={confirmingIds.size > 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#7A520F] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {confirmingIds.size > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                전체 확인
              </button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {unconfirmedLeads.slice(0, 5).map((lead) => (
              <div key={lead.id} className="rounded-xl border border-[#ECD29C] bg-white px-3 py-3">
                <button type="button" onClick={() => setSelected(lead)} className="block w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-[#111110]">{lead.name ?? lead.org ?? "이름 없음"}</p>
                    <ScoreBadge score={calcScore(lead)} />
                  </div>
                  {/* 세부 유입(메타는 광고명)이 있으면 그쪽이 더 정보값 — 없을 때만 소스 라벨 */}
                  <p className="mt-1 truncate text-[12px] text-[#1a1a1a]/45">
                    {getLeadSourceDetail(lead) || (SOURCE_LABEL[lead.source] ?? lead.source)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmMany([lead.id])}
                  disabled={confirmingIds.has(lead.id)}
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#FBF1E0] px-2 py-1 text-[11px] font-semibold text-[#7A520F] transition-colors hover:bg-[#ECD29C] disabled:opacity-40"
                >
                  {confirmingIds.has(lead.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  확인
                </button>
              </div>
            ))}
          </div>
          {unconfirmedLeads.length > 5 && (
            <button
              type="button"
              onClick={() => setFilter("unconfirmed")}
              className="mt-3 text-[12px] font-medium text-[#7A520F] hover:underline"
            >
              +{unconfirmedLeads.length - 5}건 더 보기
            </button>
          )}
        </div>
      )}

      {view === "console" && pipelineRiskLeads.length > 0 && (
        <div id="pipeline-risk" className="mb-6 scroll-mt-24 rounded-2xl border-[1.15px] border-[#F6D5C5] bg-transparent p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B85C33]/70">Pipeline Risk</p>
              <h2 className="text-[16px] font-bold text-[#111110]">오래 멈춘 리드 / 지연 리드</h2>
            </div>
            <button
              onClick={() => setFilter("contacted")}
              className="text-left text-[12px] font-medium text-[#B85C33] hover:text-[#9A4A27]"
            >
              지연 {overdueFollowUps.length}건 · 7일 이상 정체 {stalledLeads.length}건
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {pipelineRiskLeads.map((lead) => {
              const followUpKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
              const overdueDays = followUpKey && followUpKey < today ? daysBetween(lead.follow_up_at!) : 0
              const ageDays = daysBetween(lead.timestamp)
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setSelected(lead)}
                  className="rounded-xl border border-[#F6D5C5] bg-white px-3 py-3 text-left transition-colors hover:bg-[#fffaf7]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-[#111110]">{lead.name ?? lead.org ?? "이름 없음"}</p>
                    <ScoreBadge score={calcScore(lead)} />
                  </div>
                  <p className="mt-1 truncate text-[12px] text-[#1a1a1a]/45">{lead.org ?? getLeadOwner(lead)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-md bg-[#FEF3EE] px-2 py-0.5 font-medium text-[#B85C33]">
                      {overdueDays > 0 ? `${overdueDays}일 지연` : `${ageDays}일 정체`}
                    </span>
                    <span className="rounded-md bg-[#f0f0ec] px-2 py-0.5 text-[#1a1a1a]/45">{getLeadOwner(lead)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 필터 카운트 카드 — 숫자로 들어가는 단일 창구 */}
      <div
        className={
          view === "console"
            ? "mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5 xl:grid-cols-10"
            : // 보드에서는 5분할이라 셀 하나가 콘솔의 두 배 폭이 된다 — 활성 셀의 검은 채움이
              // 컬럼보다 넓어지므로, 늘리지 않고 내용 폭(140px)에 맞춘 스트립으로 둔다.
              "mb-4 flex flex-wrap gap-2"
        }
      >
        {visibleFilterCards.map((item) => {
          const isActive = filter === item.key
          // 게이트 면제 필터는 미확인 리드까지 세므로 '전체'와 분모가 다르다 — 그래서
          // 전체 107 옆에 응대 전 188 이 설 수 있다. 숫자만 키우면 고장으로 읽히니 표식을 단다.
          // '미확인 포함'이 켜지면 모든 카드가 같은 모집단을 세므로 표식도 사라진다.
          const offGate = !includeUnconfirmed && CONFIRMATION_GATE_EXEMPT_FILTERS.has(item.key)
          // 숫자 색이 곧 위계 — 응대 지연은 붉게, 미검토는 노랗게, 나머지는 중립.
          const tone =
            item.count === 0
              ? "text-[#1a1a1a]/30"
              : item.key === "unresponded" || item.key === "unresponded_24h" || item.key === "unresponded_48h"
                ? "text-[#B85C33]"
                : item.key === "unconfirmed"
                  ? "text-[#7A520F]"
                  : "text-[#111110]"
          return (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              aria-pressed={isActive}
              title={offGate ? `${item.label} — 확인 게이트 밖(미확인) 리드까지 포함한 수` : undefined}
              className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                view === "console" ? "min-h-[72px]" : "min-h-[64px] w-[140px]"
              } ${
                isActive ? "border-[#111110] bg-[#111110] text-white" : "border-[#e8e8e4] bg-white hover:border-[#c8c8c4] hover:shadow-sm"
              }`}
            >
              <p className={`text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums ${isActive ? "text-white" : tone}`}>
                {item.count.toLocaleString("ko-KR")}
              </p>
              <p className={`mt-1.5 flex items-center gap-1 text-[11px] font-medium ${isActive ? "text-white/60" : "text-[#1a1a1a]/45"}`}>
                {item.label}
                {offGate ? (
                  <span
                    aria-hidden
                    className="inline-block h-[5px] w-[5px] shrink-0 rounded-full"
                    style={{ backgroundColor: isActive ? "rgba(255,255,255,0.55)" : "#ECD29C" }}
                  />
                ) : null}
              </p>
            </button>
          )
        })}
      </div>

      {/* 유입 칩 + 검색/정렬 — 보드에서는 박스 크롬을 걷어 컬럼과 상자가 겹쳐 보이지 않게 한다. */}
      <div
        className={`mb-4 ${
          view === "console" ? "rounded-2xl border border-[#e8e8e4] bg-white p-3" : "border-b border-[#e8e8e4] pb-3"
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {sourceGroupChips.length > 0 && (
          <>
            <span className="mr-1 text-[11px] font-medium text-[#1a1a1a]/40">유입</span>
            <button
              type="button"
              onClick={() => setSourceGroup("all")}
              aria-pressed={sourceGroup === "all"}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${
                sourceGroup === "all"
                  ? "bg-[#111110] text-white"
                  : "border border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
              }`}
            >
              전체
              <span className={`tabular-nums ${sourceGroup === "all" ? "text-white/55" : "text-[#1a1a1a]/40"}`}>
                {sourceChipTotal}
              </span>
            </button>
            {sourceGroupChips.map((chip) => {
              const active = sourceGroup === chip.group
              return (
                <button
                  key={chip.group}
                  type="button"
                  onClick={() => setSourceGroup(active ? "all" : chip.group)}
                  aria-pressed={active}
                  className={`inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${
                    active
                      ? "bg-[#111110] text-white"
                      : "border border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
                  }`}
                >
                  <SourceGroupDot group={chip.group} />
                  {chip.label}
                  <span className={`tabular-nums ${active ? "text-white/55" : "text-[#1a1a1a]/40"}`}>{chip.count}</span>
                </button>
              )
            })}
          </>
        )}
          {/* 확인 게이트 우회 — 기본은 규칙대로 숨기되, 가려진 건수를 옆에 붙여 한 번에 열 수 있게 한다. */}
          <button
            type="button"
            onClick={() => setIncludeUnconfirmed((prev) => !prev)}
            aria-pressed={includeUnconfirmed}
            title="공개 폼에서 들어와 아직 확인하지 않은 리드를 목록에 함께 표시합니다."
            className={`ml-auto inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${
              includeUnconfirmed
                ? "bg-[#7A520F] text-white"
                : "border border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:border-[#c8c8c4]"
            }`}
          >
            <Check className="h-3 w-3" />
            미확인 포함
            {hiddenUnconfirmedCount > 0 ? (
              <span className="tabular-nums text-[#1a1a1a]/40">{hiddenUnconfirmedCount}</span>
            ) : null}
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_200px_200px_200px]">
          <label className="relative block md:col-span-2 xl:col-span-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/35" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              aria-label="리드 검색"
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && searchQuery) {
                  event.preventDefault()
                  setSearchQuery("")
                }
              }}
              placeholder="이름·기관·연락처·캠페인 검색 (띄어쓰기로 조건 AND, / 로 포커스)"
              className="h-11 w-full rounded-xl border border-[#e8e8e4] bg-[#fafaf8] pl-10 pr-16 text-[13px] text-[#111110] outline-none transition-colors placeholder:text-[#1a1a1a]/30 focus:border-[#c8c8c4] focus:bg-white"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  searchInputRef.current?.focus()
                }}
                aria-label="검색어 지우기"
                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#1a1a1a]/35 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
          <div
            title={LEAD_SORT_OPTIONS.find((option) => option.key === sortKey)?.hint}
            className="flex h-11 items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 transition-colors focus-within:border-[#c8c8c4] focus-within:bg-white"
          >
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/35" />
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as LeadSortKey)}
              aria-label="정렬 기준"
              className="h-full w-full bg-transparent text-[13px] text-[#111110] outline-none"
            >
              {LEAD_SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </div>
          <select
            value={sourceDetailFilter}
            aria-label="세부 유입 필터"
            onChange={(event) => setSourceDetailFilter(event.target.value)}
            className="h-11 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#c8c8c4] focus:bg-white"
          >
            <option value="all">세부 유입 전체</option>
            {sourceDetailOptions.map((sourceDetail) => (
              <option key={sourceDetail} value={sourceDetail}>{sourceDetail}</option>
            ))}
          </select>
          <select
            value={leadMagnetFilter}
            aria-label="리드마그넷 필터"
            onChange={(event) => setLeadMagnetFilter(event.target.value)}
            className="h-11 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#c8c8c4] focus:bg-white"
          >
            <option value="all">리드마그넷 전체</option>
            {leadMagnetOptions.map((leadMagnet) => (
              <option key={leadMagnet} value={leadMagnet}>{getLeadMagnetLabel(leadMagnet) || leadMagnet}</option>
            ))}
          </select>
        </div>
        {(sourceGroup !== "all" ||
          sourceDetailFilter !== "all" ||
          leadMagnetFilter !== "all" ||
          channelSource ||
          trackingKey ||
          searchQuery.trim()) && (
          <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-[#1a1a1a]/45">
            <span>
              현재 조건 {filtered.length}건
              {sourceGroup !== "all" ? ` · 유입 ‘${SOURCE_GROUP_LABEL[sourceGroup]}’` : ""}
              {channelSource ? ` · 채널 ‘${channelSource}’` : ""}
              {trackingKey
                ? ` · ${TRACKING_DIMENSIONS.find((item) => item.key === trackingDimension)?.label} ‘${trackingKey}’`
                : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("")
                setSourceGroup("all")
                setSourceDetailFilter("all")
                setLeadMagnetFilter("all")
                setChannelSource("")
                setTrackingKey(null)
              }}
              className="font-medium text-[#084734] hover:text-[#065c41]"
            >
              필터 초기화
            </button>
          </div>
        )}
      </div>

      {view === "console" && selectedLeadIds.size > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#F6D5C5] bg-[#FEF8F5] px-4 py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#111110]">
                {selectedFilteredCount}건 선택됨
                {selectedBeyondVisibleCount > 0 ? (
                  <span className="ml-1.5 font-medium text-[#B85C33]">
                    (화면 밖 {selectedBeyondVisibleCount}건 포함)
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
                선택한 리드에 상태 변경·담당자 배정·확인·삭제를 일괄 적용합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedFilteredCount < filtered.length && filtered.length > 0 ? (
                <button
                  type="button"
                  onClick={() => handleToggleFilteredSelection(true)}
                  title="더보기로 아직 화면에 그리지 않은 리드까지 포함해 현재 조건의 결과 전체를 선택합니다."
                  className="rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#111110] transition-colors hover:border-[#c8c8c4]"
                >
                  결과 전체 {filtered.length}건 선택
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedLeadIds(new Set())}
                className="rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/55 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
              >
                선택 해제
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#F6D5C5]/60 pt-2.5">
            {selectedUnconfirmedIds.length > 0 ? (
              <button
                type="button"
                onClick={() => void handleConfirmMany(selectedUnconfirmedIds)}
                disabled={bulkWorking}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#084734] px-3 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                미확인 {selectedUnconfirmedIds.length}건 확인
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setBulkAssignOpen((open) => !open)}
              disabled={bulkWorking}
              aria-expanded={bulkAssignOpen}
              aria-controls="bulk-lead-assignment"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#111110] transition-colors hover:border-[#c8c8c4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Users className="h-3.5 w-3.5" />
              담당자 지정
            </button>
            <button
              type="button"
              onClick={() => void handleBulkStatus(Array.from(selectedLeadIds), "closed")}
              disabled={bulkWorking}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-50"
            >
              종료 처리
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteMany(Array.from(selectedLeadIds))}
              disabled={selectedDeleting || bulkWorking}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#B85C33] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#9A4A27] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selectedDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              선택 삭제
            </button>
          </div>
          {bulkAssignOpen ? (
            <div
              id="bulk-lead-assignment"
              className="grid gap-3 border-t border-[#F6D5C5]/60 pt-3 lg:grid-cols-[minmax(220px,360px)_auto_1fr] lg:items-end"
            >
              <label className="grid gap-1.5 text-[12px] font-semibold text-[#111110]">
                배정할 담당자
                <select
                  value={bulkOwnerKey}
                  onChange={(event) => setBulkOwnerKey(event.target.value)}
                  disabled={bulkWorking || crmOwnerHealth?.ok !== true || crmOwners.length === 0}
                  className="h-11 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:bg-[#F6F5F4]"
                >
                  <option value="">담당자를 선택하세요</option>
                  {crmOwners.map((owner) => (
                    <option key={owner.ownerKey} value={owner.ownerKey}>
                      {owner.displayName} · {owner.teamRoleLabel}{owner.branchName ? ` · ${owner.branchName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleBulkAssign(Array.from(selectedLeadIds), bulkOwnerKey)}
                  disabled={bulkWorking || assignmentPreviewLoading || !bulkOwnerKey || !assignmentApplyReady}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {bulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  {selectedFilteredCount}건 배정
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`선택한 ${selectedFilteredCount}건의 담당자 배정을 해제할까요?`)) return
                    void handleBulkAssign(Array.from(selectedLeadIds), null)
                  }}
                  disabled={bulkWorking}
                  className="min-h-11 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-medium text-[#1a1a1a]/60 hover:border-[#c8c8c4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  배정 해제
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-[#1a1a1a]/50 lg:pb-3">
                {crmOwnerHealth?.ok === false
                  ? crmOwnerHealth.message ?? "담당자 정본 명단 상태를 확인해 주세요."
                  : crmOwners.length > 0
                  ? `활성 CRM 담당자 ${crmOwners.length}명 중 선택합니다. 한 번의 서버 요청으로 적용됩니다.`
                  : crmOwnerHealth?.message ?? "CRM 담당자 명단을 불러오는 중입니다."}
              </p>
              <div className="grid grid-cols-2 gap-2 lg:col-span-3 lg:grid-cols-4" aria-busy={assignmentPreviewLoading}>
                {[
                  ["자동 근거 있음", assignmentPreview?.automaticEvidenceReady ?? 0, "현재 권위 있는 owner 연결 없음"],
                  ["검토 후 지정 가능", assignmentPreview?.manualReviewReady ?? 0, "확인·최근성·중복 조건 통과"],
                  ["확인 필요", assignmentPreview?.blockerCounts.unconfirmed ?? 0, "확인 전에는 배정 차단"],
                  ["기타 차단", assignmentPreviewOtherBlockers, "테스트·부분 중복·30일+ 등"],
                ].map(([label, value, hint]) => (
                  <div key={String(label)} className="rounded-xl border border-black/[0.08] bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-[#1a1a1a]/45">{label}</p>
                    <p className="mt-1 text-[20px] font-semibold tabular-nums text-[#111110]">
                      {assignmentPreviewLoading ? "…" : value}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-[#1a1a1a]/40">{hint}</p>
                  </div>
                ))}
              </div>
              {assignmentPreviewError ? (
                <p role="alert" className="rounded-lg border border-[#F6D5C5] bg-white px-3 py-2 text-[11px] text-[#B85C33] lg:col-span-3">
                  {assignmentPreviewError}
                </p>
              ) : null}
              {assignmentPreview && assignmentPreview.blockedLeadIds.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F6D5C5] bg-white px-3 py-2 lg:col-span-3">
                  <p className="text-[11px] leading-relaxed text-[#8A4529]">
                    선택 중 {assignmentPreview.blockedLeadIds.length}건은 안전 조건을 통과하지 못해 전체 배정이 차단됩니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedLeadIds(new Set(assignmentPreview.safeLeadIds))}
                    disabled={assignmentPreview.safeLeadIds.length === 0 || bulkWorking}
                    className="min-h-9 rounded-lg border border-[#F6D5C5] bg-[#FFF9F5] px-3 text-[11px] font-semibold text-[#8A4529] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    안전 대상 {assignmentPreview.safeLeadIds.length}건만 선택
                  </button>
                </div>
              ) : assignmentPreview && assignmentApplyReady ? (
                <p role="status" className="rounded-lg border border-[#DDEBE5] bg-[#F7FBF9] px-3 py-2 text-[11px] text-[#084734] lg:col-span-3">
                  선택한 {assignmentPreview.manualReviewReady}건이 수동 검토 배정 조건을 통과했습니다. 적용 직전에 서버가 다시 검증합니다.
                </p>
              ) : null}
              {selectedAssignmentProfile ? (
                <div
                  role={selectedAssignmentProfile.duplicateClusters > 0 ? "alert" : "status"}
                  className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed lg:col-span-3 ${
                    selectedAssignmentProfile.duplicateClusters > 0
                      ? "border-[#F6D5C5] bg-[#FFF9F5] text-[#8A4529]"
                      : "border-[#DDEBE5] bg-[#F7FBF9] text-[#084734]"
                  }`}
                >
                  <span className="font-semibold">배정 전 선택 구성</span>
                  <span className="ml-1.5">{formatLeadAssignmentProfile(selectedAssignmentProfile)}</span>
                  {selectedAssignmentProfile.duplicateClusters > 0 ? (
                    <span className="ml-1.5 font-medium">선택 밖 중복 상대까지 서버가 다시 확인합니다.</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* 목록(콘솔) ↔ 보드 — 같은 모집단을 다른 축으로 눕힌다. */}
      {view === "console" ? (
      <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
        {loading && leads.length === 0 ? (
          // 콜드로드 스켈레톤 — 리스트 행 골격과 일치(텍스트 로더 대신).
          <div className="divide-y divide-[#f0f0ec] px-5" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`sk-${index}`} className="flex items-center gap-4 py-4">
                <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-[#f0f0ec]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-[#f0f0ec]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[#f5f5f2]" />
                </div>
                <div className="hidden h-5 w-16 shrink-0 animate-pulse rounded-full bg-[#f0f0ec] sm:block" />
                <div className="hidden h-5 w-14 shrink-0 animate-pulse rounded-full bg-[#f5f5f2] sm:block" />
              </div>
            ))}
          </div>
        ) : loadError && leads.length === 0 ? (
          // 장애 상태 — 빈 목록과 구분해 "등록된 리드가 없습니다"로 오인되지 않게 한다.
          <div role="alert" aria-live="assertive" className="px-6 py-14 text-center">
            <p className="text-[13px] font-semibold text-[#B85C33]">리드를 불러오지 못했습니다.</p>
            <p className="mt-1 text-[12px] text-[#1a1a1a]/45">{loadError}</p>
            <button
              type="button"
              onClick={() => void fetchLeads({ force: true })}
              className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#F6D5C5] bg-white px-3 text-[12px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FEF3EE]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              다시 시도
            </button>
          </div>
        ) : filtered.length === 0 ? (
          // 빈 상태 — 다음 행동 안내(리드 등록 / 조건 초기화).
          <div className="px-6 py-14 text-center">
            <p className="text-[13px] font-semibold text-[#111110]">
              {leads.length === 0 ? "등록된 리드가 없습니다." : "조건에 맞는 리드가 없습니다."}
            </p>
            <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
              {leads.length === 0
                ? "리드를 등록하면 응대 큐와 파이프라인 집계가 시작됩니다."
                : "필터를 조정하거나 전체 리드에서 다시 확인하세요."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {leads.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setLens("all")
                    setFilter("all")
                    setSearchQuery("")
                    setSourceGroup("all")
                    setSourceDetailFilter("all")
                    setLeadMagnetFilter("all")
                    setChannelSource("")
                    setTrackingKey(null)
                  }}
                  className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
                >
                  전체 리드 보기
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setLeadModalOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <UserPlus className="h-3.5 w-3.5" />
                리드 등록
              </button>
            </div>
          </div>
        ) : (
          <>
          <div className="divide-y divide-[#f0f0ec] sm:hidden">
            {filtered.slice(0, visibleLeadCount).map((lead) => {
              const followUpDateKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
              const isOverdue = Boolean(followUpDateKey && followUpDateKey < today && lead.status !== "converted" && lead.status !== "closed")
              const isTodayFollowUp = followUpDateKey === today
              const ageDays = daysBetween(lead.timestamp)
              const unrespondedHours = isUnrespondedLead(lead) ? hoursBetween(lead.timestamp, now) : null
              const sourceDetail = getLeadSourceDetail(lead)
              const sourceSegment = getLeadSourceSegment(lead)
              const priority = priorityMap.get(lead.id)

              return (
                <div
                  key={`mobile-${lead.id}`}
                  className={`block w-full px-4 py-4 text-left transition-colors ${
                    selected?.id === lead.id ? "bg-[#f0f0ec]" : "hover:bg-[#fafaf8]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label
                      className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white sm:h-8 sm:w-8"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.has(lead.id)}
                        onChange={(event) => handleToggleLeadSelection(lead.id, event.target.checked)}
                        aria-label={`${getLeadDisplayName(lead)} 선택`}
                        className="h-4 w-4 accent-[#084734]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setSelected(lead)}
                      aria-label={`${getLeadDisplayName(lead)} 상세 열기`}
                      className="min-w-0 flex-1 rounded-lg text-left"
                    >
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[14px] font-semibold text-[#111110]">
                          {lead.name ?? "No name"}
                        </p>
                        {priority ? (
                          <span
                            title={priorityBreakdownTitle(priority)}
                            className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${priorityToneClass(priority.total)}`}
                          >
                            <Flame className="h-2.5 w-2.5" />
                            {priority.total}
                          </span>
                        ) : null}
                        <LeadActivityChip badge={activitySummary[lead.id]} />
                      </div>
                      <p className="mt-1 truncate text-[12px] text-[#1a1a1a]/50">
                        {lead.org ?? lead.phone ?? lead.email ?? "-"}
                      </p>
                      {priority && priority.reasons.length > 0 ? (
                        <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/40">
                          {priority.reasons.join(" · ")}
                        </p>
                      ) : null}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {isUnconfirmedLead(lead) && (
                        <span className="rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[11px] font-medium text-[#7A520F]">
                          미확인
                        </span>
                      )}
                      <StatusPill status={lead.status} />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleDelete(lead.id)
                        }}
                        disabled={deletingIds.has(lead.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#F6D5C5] bg-white text-[#B85C33] transition-colors hover:bg-[#FEF3EE] disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`${getLeadDisplayName(lead)} 삭제`}
                        title="삭제"
                      >
                        {deletingIds.has(lead.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#1a1a1a]/45">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f0f0ec] px-2 py-1">
                      <SourceGroupDot group={getLeadSourceGroup(lead)} size={6} />
                      {SOURCE_GROUP_LABEL[getLeadSourceGroup(lead)]}
                      {sourceSegment ? ` · ${sourceSegment}` : ""}
                    </span>
                    {sourceDetail ? (
                      <span className="rounded-md bg-[#ECFDF5] px-2 py-1 text-[#084734]">
                        {sourceDetail}
                      </span>
                    ) : null}
                    {lead.lead_magnet ? (
                      <span className="rounded-md bg-[#FBF1E0] px-2 py-1 text-[#7A520F]">
                        {getLeadMagnetLabel(lead.lead_magnet)}
                      </span>
                    ) : null}
                    {unrespondedHours !== null ? (
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                        unrespondedHours >= 48
                          ? "bg-[#FEF3EE] text-[#B85C33]"
                          : unrespondedHours >= 24
                            ? "bg-[#FBF1E0] text-[#7A520F]"
                            : "bg-[#f0f0ec] text-[#1a1a1a]/45"
                      }`}>
                        <Clock className="h-3 w-3" />
                        미응대 {formatResponseAge(unrespondedHours)}
                      </span>
                    ) : null}
                    <span>
                      {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                    </span>
                    {lead.follow_up_at ? (
                      <span className={isOverdue ? "font-medium text-[#B85C33]" : isTodayFollowUp ? "font-medium text-[#084734]" : ""}>
                        {isOverdue ? "지연 " : isTodayFollowUp ? "오늘 " : ""}
                        {new Date(lead.follow_up_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                      </span>
                    ) : null}
                    {lead.assigned_to ? <span>{lead.assigned_to}</span> : null}
                    {ageDays >= 7 && isActiveLead(lead.status) ? (
                      <span className="font-medium text-[#B85C33]">{ageDays}일 정체</span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(lead)}
                      className="inline-flex items-center justify-center rounded-md border border-[#D7EBDD] bg-[#ECFDF5] px-3 text-[12px] font-medium text-[#084734]"
                    >
                      상세 보기
                    </button>
                    {lead.phone ? (
                      <a
                        href={`tel:${lead.phone}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setContactDraft({ leadId: lead.id, type: "call" })
                          setSelected(lead)
                        }}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3 text-[12px] font-medium text-white"
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        Call
                      </a>
                    ) : null}
                    {lead.email ? (
                      <a
                        href={`mailto:${lead.email}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setContactDraft({ leadId: lead.id, type: "email" })
                          setSelected(lead)
                        }}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-[12px] font-medium text-[#111110]"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Email
                      </a>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-[1400px] w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#e8e8e4] bg-[#fafaf8]">
                <th scope="col" className="w-12 px-5 py-3.5">
                  <input
                    type="checkbox"
                    // 일부만 선택된 상태를 "선택 안 됨"으로 그리면, 클릭이 전체 선택인지 전체 해제인지
                    // 예측할 수 없다. 부분 선택은 indeterminate로 드러낸다.
                    // 범위는 "화면에 그려진 행"만 — 더보기 밖 리드까지 조용히 선택되지 않는다.
                    ref={(node) => {
                      if (node) node.indeterminate = !allVisibleSelected && selectedVisibleCount > 0
                    }}
                    checked={allVisibleSelected}
                    disabled={visibleIds.length === 0}
                    onChange={(event) => handleToggleVisibleSelection(event.target.checked)}
                    aria-label={
                      allVisibleSelected
                        ? "화면에 표시된 리드 전체 선택 해제"
                        : `화면에 표시된 ${visibleIds.length}건 전체 선택 (현재 ${selectedVisibleCount}건 선택됨)`
                    }
                    className="h-4 w-4 accent-[#084734] disabled:opacity-30"
                  />
                </th>
                {["우선순위", "시간", "응대", "유입", "이름", "기관", "담당자", "연락처", "팔로업", "정체", "상태"].map((h) => (
                  <th key={h} scope="col" className="text-left px-5 py-3.5 font-medium text-[#1a1a1a]/40 whitespace-nowrap text-[12px]">{h}</th>
                ))}
                <th scope="col" className="w-16 px-5 py-3.5 text-right text-[12px] font-medium text-[#1a1a1a]/40">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, visibleLeadCount).map((lead) => {
                const followUpDateKey = lead.follow_up_at ? toLocalDateKey(lead.follow_up_at) : null
                const isOverdue = Boolean(followUpDateKey && followUpDateKey < today && lead.status !== "converted" && lead.status !== "closed")
                const isTodayFollowUp = followUpDateKey === today
                const ageDays = daysBetween(lead.timestamp)
                const unrespondedHours = isUnrespondedLead(lead) ? hoursBetween(lead.timestamp, now) : null
                const sourceDetail = getLeadSourceDetail(lead)
                const sourceSegment = getLeadSourceSegment(lead)
                const priority = priorityMap.get(lead.id)
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelected(lead)}
                    // 행 자체가 상세 진입점이므로 키보드로도 열 수 있어야 한다(모바일 카드와 동일 규약).
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        setSelected(lead)
                      }
                    }}
                    aria-label={`${getLeadDisplayName(lead)} 상세 열기`}
                    className={`border-b border-[#e8e8e4] last:border-0 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-[#084734] focus-visible:-outline-offset-2 ${
                      selected?.id === lead.id ? "bg-[#f0f0ec]" : "hover:bg-[#fafaf8]"
                    }`}
                  >
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.has(lead.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => handleToggleLeadSelection(lead.id, event.target.checked)}
                        aria-label={`${getLeadDisplayName(lead)} 선택`}
                        className="h-4 w-4 accent-[#084734]"
                      />
                    </td>
                    <td className="px-5 py-4">
                      {priority ? <PriorityCell priority={priority} /> : <span className="text-[#1a1a1a]/30">—</span>}
                    </td>
                    <td className="px-5 py-4 text-[#1a1a1a]/40 whitespace-nowrap text-[12px] tabular-nums">
                      {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-[12px]">
                      {unrespondedHours !== null ? (
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${
                          unrespondedHours >= 48
                            ? "bg-[#FEF3EE] text-[#B85C33]"
                            : unrespondedHours >= 24
                              ? "bg-[#FBF1E0] text-[#7A520F]"
                              : "bg-[#f0f0ec] text-[#1a1a1a]/45"
                        }`}>
                          <Clock className="h-3 w-3" />
                          {formatResponseAge(unrespondedHours)}
                        </span>
                      ) : isResponseTargetLead(lead) ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#ECFDF5] px-2 py-0.5 font-medium text-[#084734]">
                          <Check className="h-3 w-3" />
                          완료
                        </span>
                      ) : (
                        <span className="text-[#1a1a1a]/30">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex max-w-[240px] flex-col items-start gap-1">
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-[#111110]">
                          <SourceGroupDot group={getLeadSourceGroup(lead)} />
                          {SOURCE_GROUP_LABEL[getLeadSourceGroup(lead)]}
                          {sourceSegment ? (
                            <>
                              <span className="text-[#1a1a1a]/30">·</span>
                              <span className="max-w-[120px] truncate text-[#1a1a1a]/45">{sourceSegment}</span>
                            </>
                          ) : null}
                        </span>
                        {sourceDetail ? (
                          <span className="max-w-full truncate rounded-md bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-medium text-[#084734]">
                            {sourceDetail}
                          </span>
                        ) : null}
                        {lead.lead_magnet ? (
                          <span className="max-w-full truncate rounded-md bg-[#FBF1E0] px-2 py-0.5 text-[11px] font-medium text-[#7A520F]">
                            {getLeadMagnetLabel(lead.lead_magnet)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-medium text-[#111110]">
                      <div className="flex items-center gap-1.5">
                        {lead.name ?? "—"}
                        <LeadActivityChip badge={activitySummary[lead.id]} />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#1a1a1a]/55">{lead.org ?? "—"}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-[#1a1a1a]/55">
                      {lead.assigned_to ? (
                        <span className="rounded-md bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
                          {lead.assigned_to}
                        </span>
                      ) : (
                        <span className="rounded-md bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-medium text-[#B85C33]">미배정</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-[#1a1a1a]/55">{lead.phone ?? lead.email ?? "—"}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-[12px]">
                      {lead.follow_up_at ? (
                        <span className={isOverdue ? "text-[#B85C33] font-medium" : isTodayFollowUp ? "text-[#084734] font-medium" : "text-[#1a1a1a]/40"}>
                          {isOverdue ? "지연 " : isTodayFollowUp ? "오늘 " : ""}
                          {new Date(lead.follow_up_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                        </span>
                      ) : (
                        <span className="text-[#1a1a1a]/30">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-[12px] tabular-nums">
                      {isActiveLead(lead.status) && ageDays >= 7 ? (
                        <span className="font-medium text-[#B85C33]">{ageDays}일</span>
                      ) : (
                        <span className="text-[#1a1a1a]/40">{ageDays}일</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isUnconfirmedLead(lead) && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-[#FBF1E0] text-[#7A520F]">
                            미확인
                          </span>
                        )}
                        <StatusPill status={lead.status} />
                        {/*
                          상태 전환은 드로어를 열고 스크롤해야만 가능했다. 그래서 리드
                          115건이 전부 new 로 남아 있었고(2026-08-05 실측), 컨택 신호가
                          우선순위에서 아무 일도 하지 못했다. 목록에서 한 번에 넘긴다.
                        */}
                        {lead.status === "new" && !isTestLead(lead) && (
                          <button
                            type="button"
                             onClick={(event) => {
                               event.stopPropagation()
                               setContactDraft({ leadId: lead.id, type: "call" })
                               setSelected(lead)
                             }}
                            title="상세에서 연락 기록 남기기"
                            className="inline-flex items-center gap-1 rounded-full border border-[#D7EBDD] bg-white px-2 py-0.5 text-[11px] font-medium text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <PhoneCall className="h-3 w-3" />
                            연락 기록
                          </button>
                        )}
                        {lead.status === "converted" && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-[#ECFDF5] text-[#084734] border border-[#D7EBDD]">
                            CRM 전환
                          </span>
                        )}
                        {lead.notes && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]/20 shrink-0" title="메모 있음" />
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {/* 전환도 삭제처럼 목록에서 바로 — 드로어를 열고 스크롤하는 3단계 동선을 없앤다.
                            고객·딜이 실제로 생성되므로 실행 전에 확인을 받는다. */}
                        {lead.status !== "converted" && !isUnconfirmedLead(lead) && !isTestLead(lead) && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              if (
                                confirm(
                                  `"${getLeadDisplayName(lead)}" 리드를 고객·거래로 전환할까요? CRM에 고객사와 딜이 생성됩니다.`
                                )
                              )
                                void handleConvert(lead)
                            }}
                            disabled={convertingIds.has(lead.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D7EBDD] bg-white text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`${getLeadDisplayName(lead)} 고객·거래로 전환`}
                            title="고객·거래 등록"
                          >
                            {convertingIds.has(lead.id) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserPlus className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleDelete(lead.id)
                          }}
                          disabled={deletingIds.has(lead.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#F6D5C5] bg-white text-[#B85C33] transition-colors hover:bg-[#FEF3EE] disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`${getLeadDisplayName(lead)} 삭제`}
                          title="삭제"
                        >
                          {deletingIds.has(lead.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          {(canMoreLeads || canCollapseLeads) && (
            <div className="flex flex-col items-center gap-2 border-t border-[#e8e8e4] bg-[#fafaf8] px-5 py-4">
              <p role="status" className="text-[11px] font-medium tabular-nums text-[#1a1a1a]/45">
                {visibleLeadCount.toLocaleString("ko-KR")} / 총{" "}
                {filtered.length.toLocaleString("ko-KR")}건 표시
              </p>
              <ShowMore
                visible={visibleLeadCount}
                total={filtered.length}
                step={LEAD_BOARD_LIST_STEP}
                onMore={showMoreLeads}
                onCollapse={canCollapseLeads ? collapseLeads : undefined}
              />
            </div>
          )}
          </>
        )}
      </div>
      ) : (
        <LeadsBoardView
          columns={boardColumns}
          totals={boardTotals}
          focus={boardFocus}
          crossColumnFilter={boardCrossFilter}
          selectedId={selected?.id}
          onSelect={setSelected}
          onFocusColumn={(key) => setFilter(key ?? "all")}
          now={now}
        />
      )}

      {/* 드로어 */}
      {selected && (
        <LeadDrawer
          // 드로어가 열린 채로 다른 행을 클릭하면 인스턴스가 재사용된다 — 메모·담당자·팔로업이
          // useState 초기값으로만 시드되므로 A의 값이 B에 남고, 닫기 경로의 강제 blur가
          // 그 값을 B에 저장해 버린다. 리드 id를 key로 걸어 리드마다 상태를 격리한다.
          key={selected.id}
          lead={selected}
          logs={logs}
          logsLoading={logsLoading}
          events={events}
          activity={activity}
          activityLoading={activityLoading}
          initialContactForm={contactDraft?.leadId === selected.id}
          initialContactType={contactDraft?.leadId === selected.id ? contactDraft.type : undefined}
          crmOwners={crmOwners}
          crmOwnerHealth={crmOwnerHealth}
          onClose={closeSelectedLead}
          onStatusChange={handleStatus}
          onNotesChange={handleNotes}
          onFollowUpChange={handleFollowUp}
          onAssignedToChange={handleAssignedTo}
          onDelete={handleDelete}
          onAddLog={handleAddLog}
          onDeleteLog={handleDeleteLog}
          onConvert={handleConvert}
          onConfirm={(lead) => handleConfirmMany([lead.id])}
        />
      )}

      <LeadRegisterModal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        onDone={() => void fetchLeads({ force: true })}
      />

      {/* 전환 완료 패널 — 생성/재사용된 딜·고객으로 바로 이동 */}
      {convertResult && (
        <div className="fixed bottom-6 right-6 z-[60] w-[320px] rounded-xl border border-black/[0.08] bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1a1a1a]">
                {convertResult.reused ? "이미 전환된 리드 — 기존 기록 재사용" : "CRM 전환 완료"}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/60">
                {convertResult.customerName} 고객사
                {convertResult.dealCode ? ` · ${convertResult.dealCode}` : ""}
                {convertResult.reused ? "에 연결되었습니다." : "가 등록되었습니다."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConvertResult(null)}
              aria-label="전환 결과 닫기"
              className="shrink-0 rounded-md p-1 text-[#1a1a1a]/40 transition-colors hover:bg-[#f0f0ec] hover:text-[#1a1a1a]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {convertResult.quoteUrl && (
              <Link
                href={convertResult.quoteUrl}
                onClick={() => setConvertResult(null)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#065c41]"
              >
                <FileText className="h-3 w-3" />
                견적 만들기
              </Link>
            )}
            <div className="flex gap-2">
              {convertResult.dealUrl && (
                <Link
                  href={convertResult.dealUrl}
                  onClick={() => setConvertResult(null)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[12px] font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f6f5f4]"
                >
                  <ExternalLink className="h-3 w-3" />
                  딜 열기
                </Link>
              )}
              <Link
                href={convertResult.customerUrl}
                onClick={() => setConvertResult(null)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[12px] font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f6f5f4]"
              >
                <Building2 className="h-3 w-3" />
                고객 보기
              </Link>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} raised={Boolean(convertResult)} />}
    </div>
  )
}
