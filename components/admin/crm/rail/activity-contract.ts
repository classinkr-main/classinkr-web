// CRM 기록(/api/admin/crm/events) API 계약 SSOT.
// CrmActivityClient(기록 표면)와 rail/ActivityQuickForm(빠른 생성)이 같은
// 타입·필드 구성·직렬화 규칙을 공유한다 — 폼 필드를 바꾸면 여기 한 곳만 고친다.

import { FileText, MessageSquare, Mic, NotebookPen, PhoneCall } from "lucide-react"

/**
 * 녹음 업로드 상한. 서버(lib/storage/crm-recordings.ts)와 폼이 같은 값을 봐야
 * "업로드를 끝까지 기다린 뒤 거절"이 아니라 고르는 즉시 막을 수 있다.
 */
export const CRM_RECORDING_MAX_BYTES = 50 * 1024 * 1024

export type TargetType = "all" | "lead" | "neo_account" | "customer" | "deal" | "unknown"
export type ActivityTargetType = Exclude<TargetType, "all">
export type SourceType =
  | "all"
  | "manual_note"
  | "meeting_minutes"
  | "recording"
  | "calendar_event"
  | "lead_contact_log"
  | "external_crm"
  | "sheet"
  | "call"
  | "sms"
  | "site_inflow"
export type Sentiment = "all" | "positive" | "neutral" | "risk"
export type FormMode = "manual_note" | "call" | "sms" | "meeting_minutes" | "recording"
export type OptionalFieldKey =
  | "body"
  | "attendees"
  | "meetingPurpose"
  | "decisions"
  | "blockers"
  | "nextAction"
  | "sentiment"
  | "stageSignal"
  | "tags"
  | "recording"

export interface CrmEventNextAction {
  title: string
  ownerName: string | null
  dueAt: string | null
  done: boolean
}

export interface CrmEventRecord {
  id: string
  targetType: ActivityTargetType
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

export interface CrmEventsResponse {
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

export const EVENTS_URL = "/api/admin/crm/events"

export const MODE_OPTIONS: Array<{
  key: FormMode
  label: string
  description: string
  icon: typeof NotebookPen
}> = [
  { key: "manual_note", label: "간단 메모", description: "내부 코멘트·기타 기록", icon: NotebookPen },
  { key: "call", label: "콜", description: "통화 내용·결과", icon: PhoneCall },
  { key: "sms", label: "문자", description: "문자·카톡 발신/회신", icon: MessageSquare },
  { key: "meeting_minutes", label: "회의록", description: "요약·합의·리스크", icon: FileText },
  { key: "recording", label: "녹음", description: "음성 파일 + 요약", icon: Mic },
]

// 모드별 노출 필드: primary = 항상 노출, advanced = "상세 입력" 토글 안, 그 외 = 값이 있을 때만 노출
export const MODE_FIELDS: Record<FormMode, { primary: OptionalFieldKey[]; advanced: OptionalFieldKey[] }> = {
  manual_note: {
    primary: ["body"],
    advanced: ["nextAction", "sentiment", "tags"],
  },
  // 콜/문자 — 간단 메모와 같은 컴팩트 계약(본문만 필수 노출). 서버(CRM_EVENT_SOURCE_TYPES)·
  // DB CHECK는 이미 call/sms를 허용한다 — 폼 SSOT만 여기서 따라붙는다.
  call: {
    primary: ["body"],
    advanced: ["nextAction", "sentiment", "tags"],
  },
  sms: {
    primary: ["body"],
    advanced: ["nextAction", "sentiment", "tags"],
  },
  meeting_minutes: {
    primary: [
      "body",
      "attendees",
      "meetingPurpose",
      "decisions",
      "blockers",
      "nextAction",
      "sentiment",
      "stageSignal",
      "tags",
    ],
    advanced: [],
  },
  recording: {
    primary: ["recording"],
    advanced: ["decisions", "nextAction"],
  },
}

export const TARGET_OPTIONS: Array<{ key: TargetType; label: string }> = [
  { key: "all", label: "대상 전체" },
  { key: "lead", label: "리드" },
  { key: "neo_account", label: "고객" },
  { key: "customer", label: "고객 V2" },
  { key: "deal", label: "딜" },
  { key: "unknown", label: "미연결" },
]

export const SOURCE_FILTERS: Array<{ key: SourceType; label: string }> = [
  { key: "all", label: "전체" },
  { key: "manual_note", label: "메모" },
  { key: "call", label: "콜" },
  { key: "sms", label: "문자" },
  { key: "meeting_minutes", label: "회의록" },
  { key: "recording", label: "녹음" },
  { key: "calendar_event", label: "캘린더" },
  { key: "external_crm", label: "외부 CRM" },
  { key: "sheet", label: "시트" },
  { key: "site_inflow", label: "홈페이지 유입" },
]

export const SENTIMENT_FILTERS: Array<{ key: Sentiment; label: string }> = [
  { key: "all", label: "분위기 전체" },
  { key: "positive", label: "긍정" },
  { key: "neutral", label: "중립" },
  { key: "risk", label: "리스크" },
]

export const STAGE_SIGNALS = [
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

export function toLocalDateTimeInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function localInputToIso(value: string) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

export function formatDateTime(value: string | null | undefined) {
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

export function formatFileSize(value: number | null | undefined) {
  const size = Number(value ?? 0)
  if (!size) return "-"
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}MB`
  return `${Math.max(1, Math.round(size / 1024)).toLocaleString("ko-KR")}KB`
}

export function sourceLabel(source: CrmEventRecord["sourceType"]) {
  if (source === "meeting_minutes") return "회의록"
  if (source === "call") return "콜"
  if (source === "sms") return "문자"
  if (source === "recording") return "녹음"
  if (source === "calendar_event") return "캘린더"
  if (source === "lead_contact_log") return "연락 로그"
  if (source === "external_crm") return "외부 CRM"
  if (source === "sheet") return "시트"
  if (source === "site_inflow") return "홈페이지 유입"
  return "메모"
}

export function sentimentTone(sentiment: CrmEventRecord["sentiment"]) {
  if (sentiment === "positive") return "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
  if (sentiment === "risk") return "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
  return "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55"
}

export function sentimentLabel(sentiment: CrmEventRecord["sentiment"]) {
  if (sentiment === "positive") return "긍정"
  if (sentiment === "risk") return "리스크"
  return "중립"
}

export function appendFormValue(formData: FormData, key: string, value: string) {
  const trimmed = value.trim()
  if (trimmed) formData.append(key, trimmed)
}

export function isActivityTargetType(value: string): value is ActivityTargetType {
  return TARGET_OPTIONS.some((option) => option.key !== "all" && option.key === value)
}
