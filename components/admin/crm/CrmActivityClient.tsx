"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  FileAudio,
  FileText,
  Filter,
  Loader2,
  Mic,
  NotebookPen,
  Paperclip,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react"

import { adminFetch, adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import { Toast } from "@/components/admin/crm/leads/shared"
import { useCrmOwners } from "./useCrmOwners"
import CrmCustomerPicker from "./CrmCustomerPicker"

type TargetType = "all" | "lead" | "neo_account" | "customer" | "deal" | "unknown"
type SourceType =
  | "all"
  | "manual_note"
  | "meeting_minutes"
  | "recording"
  | "calendar_event"
  | "lead_contact_log"
  | "external_crm"
  | "sheet"
type Sentiment = "all" | "positive" | "neutral" | "risk"
type FormMode = "manual_note" | "meeting_minutes" | "recording"

interface CrmEventNextAction {
  title: string
  ownerName: string | null
  dueAt: string | null
  done: boolean
}

interface CrmEventRecord {
  id: string
  targetType: Exclude<TargetType, "all">
  targetId: string | null
  targetLabel: string | null
  sourceType: Exclude<SourceType, "all">
  sourceId: string | null
  occurredAt: string
  title: string
  summary: string | null
  body: string | null
  meetingPurpose: string | null
  ownerName: string | null
  attendees: string[]
  decisions: string[]
  blockers: string[]
  nextActions: CrmEventNextAction[]
  sentiment: Exclude<Sentiment, "all">
  stageSignal: string | null
  tags: string[]
  recording: {
    storagePath: string | null
    fileName: string | null
    mimeType: string | null
    sizeBytes: number | null
    signedUrl: string | null
  } | null
  createdAt: string
  updatedAt: string
}

interface CrmEventsResponse {
  generatedAt: string
  health: {
    ok: boolean
    message: string | null
  }
  summary: {
    total: number
    returned: number
    recordings: number
    risks: number
    openNextActions: number
  }
  pagination: {
    limit: number
    offset: number
    returned: number
    total: number
    hasMore: boolean
    nextOffset: number | null
  }
  rows: CrmEventRecord[]
}

const EVENTS_URL = "/api/admin/crm/events"
const CACHE_TTL_MS = 30_000
const PAGE_LIMIT = 50

const MODE_OPTIONS: Array<{
  key: FormMode
  label: string
  description: string
  icon: typeof NotebookPen
}> = [
  { key: "manual_note", label: "간단 메모", description: "통화·카톡·내부 코멘트", icon: NotebookPen },
  { key: "meeting_minutes", label: "회의록", description: "요약·합의·리스크", icon: FileText },
  { key: "recording", label: "녹음", description: "음성 파일 + 요약", icon: Mic },
]

const TARGET_OPTIONS: Array<{ key: TargetType; label: string }> = [
  { key: "all", label: "대상 전체" },
  { key: "lead", label: "리드" },
  { key: "neo_account", label: "고객" },
  { key: "customer", label: "고객 V2" },
  { key: "deal", label: "딜" },
  { key: "unknown", label: "미연결" },
]

const SOURCE_FILTERS: Array<{ key: SourceType; label: string }> = [
  { key: "all", label: "전체" },
  { key: "manual_note", label: "메모" },
  { key: "meeting_minutes", label: "회의록" },
  { key: "recording", label: "녹음" },
  { key: "calendar_event", label: "캘린더" },
  { key: "external_crm", label: "외부 CRM" },
  { key: "sheet", label: "시트" },
]

const SENTIMENT_FILTERS: Array<{ key: Sentiment; label: string }> = [
  { key: "all", label: "분위기 전체" },
  { key: "positive", label: "긍정" },
  { key: "neutral", label: "중립" },
  { key: "risk", label: "리스크" },
]

const STAGE_SIGNALS = [
  { value: "", label: "단계 신호 없음" },
  { value: "new_interest", label: "신규 관심" },
  { value: "demo_done", label: "데모 완료" },
  { value: "quote_requested", label: "견적 요청" },
  { value: "pricing_objection", label: "가격 이견" },
  { value: "decision_pending", label: "의사결정 대기" },
  { value: "renewal_risk", label: "갱신 리스크" },
  { value: "closed_won", label: "계약 가능성 높음" },
  { value: "closed_lost", label: "실패/보류" },
]

function toLocalDateTimeInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function localInputToIso(value: string) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatFileSize(value: number | null | undefined) {
  const size = Number(value ?? 0)
  if (!size) return "-"
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}MB`
  return `${Math.max(1, Math.round(size / 1024)).toLocaleString("ko-KR")}KB`
}

function sourceLabel(source: CrmEventRecord["sourceType"]) {
  if (source === "meeting_minutes") return "회의록"
  if (source === "recording") return "녹음"
  if (source === "calendar_event") return "캘린더"
  if (source === "lead_contact_log") return "연락 로그"
  if (source === "external_crm") return "외부 CRM"
  if (source === "sheet") return "시트"
  return "메모"
}

function sentimentTone(sentiment: CrmEventRecord["sentiment"]) {
  if (sentiment === "positive") return "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
  if (sentiment === "risk") return "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
  return "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55"
}

function sentimentLabel(sentiment: CrmEventRecord["sentiment"]) {
  if (sentiment === "positive") return "긍정"
  if (sentiment === "risk") return "리스크"
  return "중립"
}

function listUrl(input: {
  query: string
  targetType: TargetType
  sourceType: SourceType
  sentiment: Sentiment
  offset: number
}) {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(input.offset) })
  if (input.query.trim()) params.set("q", input.query.trim())
  if (input.targetType !== "all") params.set("targetType", input.targetType)
  if (input.sourceType !== "all") params.set("sourceType", input.sourceType)
  if (input.sentiment !== "all") params.set("sentiment", input.sentiment)
  return `${EVENTS_URL}?${params.toString()}`
}

function mergePage(current: CrmEventsResponse | null, next: CrmEventsResponse, append: boolean): CrmEventsResponse {
  if (!append || !current) return next
  const seen = new Set(current.rows.map((row) => row.id))
  const rows = [...current.rows, ...next.rows.filter((row) => !seen.has(row.id))]
  return {
    ...next,
    rows,
    pagination: {
      ...next.pagination,
      offset: 0,
      returned: rows.length,
    },
  }
}

function appendFormValue(formData: FormData, key: string, value: string) {
  const trimmed = value.trim()
  if (trimmed) formData.append(key, trimmed)
}

function RecordingPlayer({ event }: { event: CrmEventRecord }) {
  if (!event.recording) return null
  const { signedUrl, mimeType, fileName, sizeBytes } = event.recording
  return (
    <div className="mt-3 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileAudio className="h-4 w-4 shrink-0 text-[#084734]" />
          <p className="truncate text-[12px] font-semibold text-[#111110]">{fileName ?? "녹음파일"}</p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-[#1a1a1a]/40">{formatFileSize(sizeBytes)}</span>
      </div>
      {signedUrl ? (
        mimeType?.startsWith("video/") ? (
          <video src={signedUrl} controls className="max-h-52 w-full rounded-lg bg-black" />
        ) : (
          <audio src={signedUrl} controls className="w-full" />
        )
      ) : (
        <p className="text-[12px] text-[#B85C33]">녹음 재생 링크를 만들지 못했습니다.</p>
      )}
    </div>
  )
}

export default function CrmActivityClient() {
  const [mode, setMode] = useState<FormMode>("manual_note")
  const [targetType, setTargetType] = useState<TargetType>("unknown")
  const [targetLabel, setTargetLabel] = useState("")
  const [targetId, setTargetId] = useState("")
  const [title, setTitle] = useState("")
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateTimeInput(new Date()))
  const [ownerName, setOwnerName] = useState("")
  const [attendees, setAttendees] = useState("")
  const [meetingPurpose, setMeetingPurpose] = useState("")
  const [summary, setSummary] = useState("")
  const [body, setBody] = useState("")
  const [decisions, setDecisions] = useState("")
  const [blockers, setBlockers] = useState("")
  const [nextActionTitle, setNextActionTitle] = useState("")
  const [nextActionOwner, setNextActionOwner] = useState("")
  const [nextActionDueAt, setNextActionDueAt] = useState("")
  const [sentiment, setSentiment] = useState<Exclude<Sentiment, "all">>("neutral")
  const [stageSignal, setStageSignal] = useState("")
  const [tags, setTags] = useState("")
  const [query, setQuery] = useState("")
  const [filterTarget, setFilterTarget] = useState<TargetType>("all")
  const [filterSource, setFilterSource] = useState<SourceType>("all")
  const [filterSentiment, setFilterSentiment] = useState<Sentiment>("all")
  const [data, setData] = useState<CrmEventsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const requestSeq = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { owners: crmOwners, health: ownerHealth } = useCrmOwners()

  const loadEvents = useCallback(
    async (offset: number, options?: { force?: boolean; append?: boolean }) => {
      const append = Boolean(options?.append)
      const url = listUrl({ query, targetType: filterTarget, sourceType: filterSource, sentiment: filterSentiment, offset })
      const cached = !append && !options?.force ? getCachedAdminJson<CrmEventsResponse>(url, { cacheKey: url }) : null
      const requestId = ++requestSeq.current

      if (cached) setData(cached)
      setLoading(!append && !cached)
      setLoadingMore(append)
      setRefreshing(Boolean(options?.force))
      setError(null)

      try {
        const next = await adminFetchJsonCached<CrmEventsResponse>(
          options?.force ? `${url}&force=1` : url,
          undefined,
          {
            cacheKey: url,
            ttlMs: CACHE_TTL_MS,
            staleWhileRevalidateMs: 2 * 60_000,
            force: options?.force,
          }
        )
        if (requestId !== requestSeq.current) return
        setData((current) => mergePage(current, next, append))
      } catch (err) {
        if (requestId !== requestSeq.current) return
        setError(err instanceof Error ? err.message : "CRM 기록을 불러오지 못했습니다.")
      } finally {
        if (requestId === requestSeq.current) {
          setLoading(false)
          setLoadingMore(false)
          setRefreshing(false)
        }
      }
    },
    [filterSentiment, filterSource, filterTarget, query]
  )

  useEffect(() => {
    void loadEvents(0)
  }, [loadEvents])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const resetForm = () => {
    setMode("manual_note")
    setTargetType("unknown")
    setTargetLabel("")
    setTargetId("")
    setTitle("")
    setOccurredAt(toLocalDateTimeInput(new Date()))
    setOwnerName("")
    setAttendees("")
    setMeetingPurpose("")
    setSummary("")
    setBody("")
    setDecisions("")
    setBlockers("")
    setNextActionTitle("")
    setNextActionOwner("")
    setNextActionDueAt("")
    setSentiment("neutral")
    setStageSignal("")
    setTags("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = async () => {
    const file = fileInputRef.current?.files?.[0] ?? null
    if (!title.trim() && !summary.trim() && !body.trim() && !nextActionTitle.trim() && !file) {
      setToast({ msg: "제목, 요약, 메모, 다음 액션 또는 녹음파일 중 하나는 필요합니다.", type: "error" })
      return
    }

    const formData = new FormData()
    formData.append("sourceType", mode)
    formData.append("targetType", targetType)
    appendFormValue(formData, "targetLabel", targetLabel)
    appendFormValue(formData, "targetId", targetId)
    appendFormValue(formData, "title", title)
    appendFormValue(formData, "occurredAt", localInputToIso(occurredAt))
    appendFormValue(formData, "ownerName", ownerName)
    appendFormValue(formData, "attendees", attendees)
    appendFormValue(formData, "meetingPurpose", meetingPurpose)
    appendFormValue(formData, "summary", summary)
    appendFormValue(formData, "body", body)
    appendFormValue(formData, "decisions", decisions)
    appendFormValue(formData, "blockers", blockers)
    appendFormValue(formData, "nextActionTitle", nextActionTitle)
    appendFormValue(formData, "nextActionOwner", nextActionOwner)
    appendFormValue(formData, "nextActionDueAt", localInputToIso(nextActionDueAt))
    formData.append("sentiment", sentiment)
    appendFormValue(formData, "stageSignal", stageSignal)
    appendFormValue(formData, "tags", tags)
    if (file) formData.append("recording", file)

    setSaving(true)
    try {
      const response = await adminFetch(EVENTS_URL, { method: "POST", body: formData })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "CRM 기록 저장에 실패했습니다.")
      const tasksCreated = typeof payload?.tasksCreated === "number" ? payload.tasksCreated : 0
      setToast({
        msg: tasksCreated > 0 ? `CRM 기록 저장 · 할 일 ${tasksCreated}건 생성` : "CRM 기록을 저장했습니다.",
        type: "success",
      })
      resetForm()
      void loadEvents(0, { force: true })
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "CRM 기록 저장에 실패했습니다.", type: "error" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {toast ? <Toast msg={toast.msg} type={toast.type} /> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">
            Admin · CRM · Activity
          </p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">회의·녹음 기록</h1>
          <p className="mt-1 text-[13px] text-[#1a1a1a]/45">
            녹음파일, 간단 회의록, 고객 메모를 ClassIn 고객 DB의 운영 기록으로 모읍니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadEvents(0, { force: true })}
          disabled={refreshing}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:text-[#1a1a1a]/30"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-[#111110]">빠른 입력</h2>
              <p className="mt-0.5 text-[12px] text-[#1a1a1a]/42">원문은 짧게 붙이고, 액션만 빠뜨리지 않게 남깁니다.</p>
            </div>
            <Paperclip className="h-4 w-4 text-[#1a1a1a]/30" />
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            {MODE_OPTIONS.map((option) => {
              const Icon = option.icon
              const active = mode === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMode(option.key)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? "border-[#084734] bg-[#ECFDF5]"
                      : "border-[#e8e8e4] bg-[#fafaf8] hover:border-[#c8c8c4]"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      active ? "bg-[#084734] text-white" : "bg-white text-[#1a1a1a]/45"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-[#111110]">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] text-[#1a1a1a]/42">{option.description}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-4 grid gap-3">
            <datalist id="crm-owner-options">
              {crmOwners.map((owner) => (
                <option
                  key={owner.ownerKey}
                  value={owner.ownerKey}
                  label={`${owner.displayName} · ${owner.teamRoleLabel}${owner.branchName ? ` · ${owner.branchName}` : ""}`}
                />
              ))}
            </datalist>

            {ownerHealth?.ok === false && ownerHealth.message ? (
              <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
                {ownerHealth.message}
              </div>
            ) : null}

            <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                대상
                <select
                  value={targetType}
                  onChange={(event) => setTargetType(event.target.value as TargetType)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
                >
                  {TARGET_OPTIONS.filter((option) => option.key !== "all").map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                고객/리드
                <CrmCustomerPicker
                  label={targetLabel}
                  linkedId={targetId}
                  onPick={(pick) => {
                    setTargetType(pick.targetType)
                    setTargetId(pick.targetId)
                    setTargetLabel(pick.targetLabel)
                  }}
                  onFreeText={(text) => {
                    setTargetLabel(text)
                    setTargetId("")
                  }}
                  onClear={() => {
                    setTargetLabel("")
                    setTargetId("")
                  }}
                />
              </label>
            </div>

            {targetId ? (
              <p className="text-[11px] text-[#1a1a1a]/40">
                연결된 대상에 기록이 저장되어 고객 360 타임라인에 바로 표시됩니다.
              </p>
            ) : (
              <p className="text-[11px] text-[#1a1a1a]/40">
                고객을 선택하면 360 타임라인에 연결됩니다. 직접 입력하면 미연결 기록으로 저장됩니다.
              </p>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                기록 시각
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none focus:border-[#084734]"
                />
              </label>
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                담당자
                <input
                  list="crm-owner-options"
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                  placeholder="담당자 이름 또는 계정 선택"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
              </label>
            </div>

            <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
              제목
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={mode === "recording" ? "녹음 요약 제목" : "미팅/메모 제목"}
                className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
              />
            </label>

            <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
              한 줄 요약
              <input
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="예: 7월 도입 검토, 하드웨어 견적 요청"
                className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
              />
            </label>

            <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
              원문 메모 / 회의록
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                placeholder="회의록, 카톡 요약, 통화 메모를 그대로 붙여넣기"
                className="mt-1 w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] font-medium leading-5 text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                참석자
                <input
                  value={attendees}
                  onChange={(event) => setAttendees(event.target.value)}
                  placeholder="쉼표 또는 줄바꿈"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
              </label>
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                미팅 목적
                <input
                  value={meetingPurpose}
                  onChange={(event) => setMeetingPurpose(event.target.value)}
                  placeholder="상담, 데모, 견적, 갱신"
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                결정/합의
                <textarea
                  value={decisions}
                  onChange={(event) => setDecisions(event.target.value)}
                  rows={2}
                  placeholder="줄바꿈으로 입력"
                  className="mt-1 w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] font-medium leading-5 text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
              </label>
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                리스크/이견
                <textarea
                  value={blockers}
                  onChange={(event) => setBlockers(event.target.value)}
                  rows={2}
                  placeholder="가격, 일정, 의사결정자 등"
                  className="mt-1 w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] font-medium leading-5 text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
              </label>
            </div>

            <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
              <p className="mb-2 text-[12px] font-bold text-[#111110]">다음 액션</p>
              <div className="grid gap-2">
                <input
                  value={nextActionTitle}
                  onChange={(event) => setNextActionTitle(event.target.value)}
                  placeholder="예: 견적서 발송, 데모 일정 확정"
                  className="h-10 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    list="crm-owner-options"
                    value={nextActionOwner}
                    onChange={(event) => setNextActionOwner(event.target.value)}
                    placeholder="담당자"
                    className="h-10 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                  />
                  <input
                    type="datetime-local"
                    value={nextActionDueAt}
                    onChange={(event) => setNextActionDueAt(event.target.value)}
                    className="h-10 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none focus:border-[#084734]"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                분위기
                <select
                  value={sentiment}
                  onChange={(event) => setSentiment(event.target.value as Exclude<Sentiment, "all">)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
                >
                  <option value="neutral">중립</option>
                  <option value="positive">긍정</option>
                  <option value="risk">리스크</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
                단계 신호
                <select
                  value={stageSignal}
                  onChange={(event) => setStageSignal(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
                >
                  {STAGE_SIGNALS.map((signal) => (
                    <option key={signal.value || "none"} value={signal.value}>
                      {signal.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
              태그
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="견적, 갱신, 하드웨어"
                className="mt-1 h-10 w-full rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
              />
            </label>

            <label className="text-[11px] font-semibold text-[#1a1a1a]/45">
              녹음파일
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/mp4,video/quicktime"
                className="mt-1 block w-full rounded-lg border border-dashed border-[#d8d8d2] bg-[#fafaf8] px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/60 file:mr-3 file:rounded-md file:border-0 file:bg-[#111110] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-white"
              />
              <span className="mt-1 block text-[11px] font-medium text-[#1a1a1a]/35">mp3, m4a, wav, webm, ogg, mp4 · 최대 50MB</span>
            </label>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={resetForm}
                className="h-10 flex-1 rounded-lg border border-[#e8e8e4] bg-white text-[13px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#fafaf8]"
              >
                초기화
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={saving}
                className="inline-flex h-10 flex-[1.4] items-center justify-center gap-2 rounded-lg bg-[#084734] text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-45"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                저장
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(200px,1fr)_auto_auto_auto] lg:items-center">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3">
                <Search className="h-4 w-4 text-[#1a1a1a]/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="고객명, 요약, 담당자 검색"
                  className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[#111110] outline-none placeholder:text-[#1a1a1a]/30"
                />
              </label>

              <label className="flex h-10 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={filterTarget}
                  onChange={(event) => setFilterTarget(event.target.value as TargetType)}
                  className="h-full bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
                  aria-label="대상 필터"
                >
                  {TARGET_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex h-10 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={filterSource}
                  onChange={(event) => setFilterSource(event.target.value as SourceType)}
                  className="h-full bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
                  aria-label="기록 종류 필터"
                >
                  {SOURCE_FILTERS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex h-10 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#1a1a1a]/50">
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={filterSentiment}
                  onChange={(event) => setFilterSentiment(event.target.value as Sentiment)}
                  className="h-full bg-transparent text-[12px] font-semibold text-[#111110] outline-none"
                  aria-label="분위기 필터"
                >
                  {SENTIMENT_FILTERS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {data ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-[#fafaf8] p-3">
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">총 기록</p>
                  <p className="mt-1 text-xl font-bold text-[#111110]">{data.summary.total.toLocaleString("ko-KR")}</p>
                </div>
                <div className="rounded-xl bg-[#fafaf8] p-3">
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">현재 녹음</p>
                  <p className="mt-1 text-xl font-bold text-[#084734]">{data.summary.recordings.toLocaleString("ko-KR")}</p>
                </div>
                <div className="rounded-xl bg-[#fafaf8] p-3">
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">미처리 액션</p>
                  <p className="mt-1 text-xl font-bold text-[#111110]">
                    {data.summary.openNextActions.toLocaleString("ko-KR")}
                  </p>
                </div>
                <div className="rounded-xl bg-[#FEF3EE] p-3">
                  <p className="text-[11px] font-semibold text-[#B85C33]/70">리스크</p>
                  <p className="mt-1 text-xl font-bold text-[#B85C33]">{data.summary.risks.toLocaleString("ko-KR")}</p>
                </div>
              </div>
            ) : null}
          </section>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {!error && data?.health.ok === false && data.health.message ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{data.health.message}</span>
            </div>
          ) : null}

          <section className="space-y-3">
            {data?.rows.map((event) => (
              <article key={event.id} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-[#D7EBDD] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#084734]">
                        {sourceLabel(event.sourceType)}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${sentimentTone(event.sentiment)}`}>
                        {sentimentLabel(event.sentiment)}
                      </span>
                      {event.stageSignal ? (
                        <span className="rounded-full border border-[#e8e8e4] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a]/50">
                          {event.stageSignal}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-[15px] font-bold text-[#111110]">{event.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#1a1a1a]/42">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDateTime(event.occurredAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3.5 w-3.5" />
                        {event.ownerName ?? "담당 미지정"}
                      </span>
                      <span>{event.targetLabel ?? "미연결 고객"}</span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-[#fafaf8] px-2.5 py-1 text-[11px] font-semibold text-[#1a1a1a]/40">
                    {event.targetType}
                  </span>
                </div>

                {event.summary ? <p className="mt-3 text-[13px] font-semibold text-[#111110]">{event.summary}</p> : null}
                {event.body ? (
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-[#1a1a1a]/58">{event.body}</p>
                ) : null}

                <RecordingPlayer event={event} />

                {event.attendees.length || event.meetingPurpose ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-[#1a1a1a]/45">
                    {event.meetingPurpose ? <span>목적: {event.meetingPurpose}</span> : null}
                    {event.attendees.length ? <span>참석: {event.attendees.join(", ")}</span> : null}
                  </div>
                ) : null}

                {event.decisions.length || event.blockers.length || event.nextActions.length ? (
                  <div className="mt-3 grid gap-2 lg:grid-cols-3">
                    {event.decisions.length ? (
                      <div className="rounded-xl bg-[#fafaf8] p-3">
                        <p className="mb-1 text-[11px] font-bold text-[#1a1a1a]/40">결정/합의</p>
                        <ul className="space-y-1 text-[12px] text-[#111110]">
                          {event.decisions.map((decision) => (
                            <li key={decision}>- {decision}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {event.blockers.length ? (
                      <div className="rounded-xl bg-[#FEF3EE] p-3">
                        <p className="mb-1 text-[11px] font-bold text-[#B85C33]/70">리스크/이견</p>
                        <ul className="space-y-1 text-[12px] text-[#B85C33]">
                          {event.blockers.map((blocker) => (
                            <li key={blocker}>- {blocker}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {event.nextActions.length ? (
                      <div className="rounded-xl bg-[#ECFDF5] p-3">
                        <p className="mb-1 text-[11px] font-bold text-[#084734]/70">다음 액션</p>
                        <ul className="space-y-1 text-[12px] text-[#084734]">
                          {event.nextActions.map((action) => (
                            <li key={`${event.id}-${action.title}`} className="flex items-start gap-1.5">
                              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>
                                {action.title}
                                {action.ownerName ? ` · ${action.ownerName}` : ""}
                                {action.dueAt ? ` · ${formatDateTime(action.dueAt)}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {event.tags.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {event.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-[#fafaf8] px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a]/45">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}

            {loading && !data ? (
              <div className="rounded-2xl border border-[#e8e8e4] bg-white p-8 text-center text-[13px] text-[#1a1a1a]/40">
                CRM 기록을 불러오는 중입니다...
              </div>
            ) : data && data.rows.length === 0 ? (
              <div className="rounded-2xl border border-[#e8e8e4] bg-white p-8 text-center text-[13px] text-[#1a1a1a]/40">
                조건에 맞는 회의·녹음 기록이 없습니다.
              </div>
            ) : null}

            {data && data.rows.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12px] font-medium text-[#1a1a1a]/45">
                  {data.rows.length.toLocaleString("ko-KR")} / {data.pagination.total.toLocaleString("ko-KR")}개 기록 표시
                </p>
                {data.pagination.hasMore && data.pagination.nextOffset !== null ? (
                  <button
                    type="button"
                    onClick={() => void loadEvents(data.pagination.nextOffset ?? data.rows.length, { append: true })}
                    disabled={loadingMore || refreshing}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:text-[#1a1a1a]/30"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingMore ? "animate-spin" : ""}`} />
                    더 보기
                  </button>
                ) : (
                  <span className="text-[12px] font-semibold text-[#1a1a1a]/35">전체 기록을 표시 중입니다.</span>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  )
}
