"use client"

import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Copy,
  ExternalLink,
  FileCheck2,
  Headphones,
  HelpCircle,
  History,
  ImageIcon,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  PanelRightOpen,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react"
import {
  Suspense,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"

import { adminFetchJson } from "@/lib/admin-client"
import { cn } from "@/lib/utils"

type WorkspaceTab = "chat" | "queue" | "archive" | "tools"
type ModelMode = "auto" | "fast" | "deep"
type ConversationStatus = "queue" | "active" | "waiting_review" | "resolved" | "archived"
type ConversationPriority = "low" | "normal" | "high" | "urgent"
type ReviewState = "not_required" | "pending" | "approved" | "changes_requested" | "rejected"

interface InternalCsConversation {
  id: string
  title: string
  status: ConversationStatus
  priority: ConversationPriority
  assignee_user_id: string | null
  assignee_name: string | null
  tags: string[]
  customer_context: Record<string, unknown>
  last_message_at: string | null
  updated_at: string
  archive_reason: string | null
}

interface InternalCsSourceRef {
  id: string
  label?: string
  kind?: "public_doc" | "internal_guide" | "curated_knowledge" | "internal_asset"
  verificationStatus?: "confirmed" | "conditional" | "conflicting_sources" | "hq_confirmation_required"
  externalUse?: "reviewed_summary_allowed" | "internal_only" | "confirmation_required"
  reviewState?: "pending" | "approved" | "changes_requested" | "rejected"
}

interface InternalCsMessage {
  id: string
  conversation_id: string
  role: "user" | "assistant" | "internal_note" | "system"
  content: string
  model_name: string | null
  model_mode: "fast" | "deep" | "backup" | null
  source_refs: unknown[]
  metadata: Record<string, unknown>
  review_state: ReviewState
  corrected_content: string | null
  review_note: string | null
  feedback_labels: string[]
  regression_candidate: boolean
  regression_outcome: "not_evaluated" | "pass" | "needs_fix" | "promoted" | "excluded"
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

interface InternalCsAsset {
  id: string
  file_name?: string | null
  original_file_name?: string | null
  name?: string | null
  mime_type?: string | null
  thumbnail_url?: string | null
  preview_url?: string | null
  signed_url?: string | null
  url?: string | null
  instruction?: string | null
  analysis_summary?: string | null
  analysis_payload?: unknown
  analysis?: string | null
  analysis_text?: string | null
  analysis_json?: unknown
  analysis_status?: string | null
  status?: string | null
  review_state?: string | null
  analysis_review_state?: string | null
  human_review_required?: boolean | null
  created_at?: string | null
}

interface InternalCsIntegrationEvent {
  id: string
  direction?: string | null
  transport?: string | null
  event_type?: string | null
  source_system?: string | null
  destination?: string | null
  integration?: string | null
  status?: string | null
  result?: unknown
  include_original?: boolean | null
  includeOriginal?: boolean | null
  summary?: string | null
  error_message?: string | null
  errorMessage?: string | null
  created_at?: string | null
  createdAt?: string | null
}

interface ConversationListResponse {
  conversations: InternalCsConversation[]
  pagination: { total: number }
}

// GET /api/admin/docs/gaps — 클러스터별 metadata.source로 챗봇/내부CS 유입을 구분한다.
// 이 컴포넌트는 카운트 집계에만 쓰므로 필요한 필드만 취한다.
interface DocGapClusterSummaryItem {
  metadata?: { source?: string } | null
}

interface DocGapsSummaryResponse {
  gapClusters: DocGapClusterSummaryItem[]
}

interface DocsGapsWidgetSummary {
  chatbot: number
  internalCs: number
  capped: boolean
}

// GET /api/admin/cs-chat/regression-candidates — 회귀 후보(미판정 우선) 메시지 목록.
type RegressionOutcome = "not_evaluated" | "pass" | "needs_fix" | "promoted" | "excluded"

interface RegressionCandidateItem {
  id: string
  conversationId: string
  excerpt: string
  capturedAt: string
  outcome: RegressionOutcome
  reviewState: string
}

interface RegressionCandidatesResponse {
  items: RegressionCandidateItem[]
}

// 회귀 위젯과 지표 카드 행이 함께 쓰는 4단계 로드 상태 — idle→loading은 탭 진입 시 1회만 자동,
// failed 이후에는 수동 "다시 시도"로만 재조회한다(무한 재시도 루프 금지).
type AsyncLoadState = "idle" | "loading" | "loaded" | "failed"

// GET /api/admin/cs-chat/metrics?days=7|30 — 계약 1. 분모 0이면 rate는 null.
interface InternalCsMetricsResponse {
  range: { days: number; from: string; to: string }
  volume: { questions: number; conversations: number }
  fallbackRate: number | null
  evidenceMix: { knowledge: number; docs: number; channel: number; none: number }
  review: { approved: number; changesRequested: number; pending: number; approvalRate: number | null }
  regression: { notEvaluated: number; pass: number; needsFix: number; promoted: number; excluded: number }
  leadTimeHours: { median: number | null; p90: number | null }
}

// POST /api/admin/cs-chat/regression-eval — 계약 2. 제안만 반환하며 DB의 regression_outcome은
// 이 호출만으로는 절대 바뀌지 않는다(확정은 기존 judgeRegressionCandidate 판정 버튼으로만).
interface RegressionEvalItem {
  messageId: string
  conversationId: string
  suggestedOutcome: "pass" | "needs_fix"
  rationale: string
  regeneratedExcerpt: string
  judgeModel: string
}

interface RegressionEvalSkippedItem {
  messageId: string
  reason: string
}

interface RegressionEvalResponse {
  items: RegressionEvalItem[]
  skipped: RegressionEvalSkippedItem[]
}

type RegressionEvalRunState = "idle" | "running" | "done" | "failed"

// POST /api/admin/cs-chat/messages/[messageId]/promote-knowledge — 계약 3.
// 대상: review_state=approved && corrected_content 존재. 멱등 — 재승격 시 reused:true.
interface PromoteKnowledgeResponse {
  articleId: string
  slug: string
  reused: boolean
}

// 회귀 패널 항목과 대화 스레드의 승인된 메시지, 두 노출 지점이 messageId로 결과를 공유한다.
type PromotionResult =
  | { status: "success"; articleId: string; slug: string; reused: boolean }
  | { status: "error"; error: string }

interface ConversationDetailResponse {
  conversation: InternalCsConversation
  messages: InternalCsMessage[]
  assets?: InternalCsAsset[]
  integrationEvents?: InternalCsIntegrationEvent[]
}

interface IntegrationStatusResponse {
  configured?: boolean
  status?: string
  provider?: string
  label?: string
  message?: string
  lastCheckedAt?: string | null
  bridge?: {
    configured?: boolean
    status?: string
    provider?: string
    label?: string
    message?: string
    lastCheckedAt?: string | null
  }
}

interface GenerateResponse {
  message: InternalCsMessage
  result: {
    mode: "fast" | "deep"
    model: string | null
    fallbackUsed: boolean
    userMessageSaved: boolean
    assistantMessageSaved: boolean
  }
}

interface ReviewChecks {
  customer: boolean
  evidence: boolean
  externalScope: boolean
}

const INITIAL_CHECKS: ReviewChecks = {
  customer: false,
  evidence: false,
  externalScope: false,
}

const MAX_PENDING_ASSETS = 3
const MAX_ASSET_BYTES = 8 * 1024 * 1024
const ACCEPTED_ASSET_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

// 딥링크 ?conversation= 값은 URL을 통해 들어오는 유일한 미신뢰 id다.
// fetch 경로에 그대로 꽂히므로 UUID 형태가 아니면 요청조차 만들지 않는다.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const WORKSPACE_TABS: Array<{ value: WorkspaceTab; label: string }> = [
  { value: "chat", label: "대화" },
  { value: "queue", label: "대기열" },
  { value: "archive", label: "아카이브" },
  { value: "tools", label: "운영 도구" },
]

// "문서 보강 · 회귀 검수"는 라이브 위젯(DOCS_GAPS_FALLBACK_TOOL)으로 별도 렌더링한다 — 정적 카드 제거.
const DOCS_GAPS_FALLBACK_TOOL = {
  href: "/admin/docs?tab=gaps",
  title: "문서 보강 · 회귀 검수",
  description: "반복·미해결 질문을 문서 초안과 회귀 평가로 연결합니다.",
  icon: Search,
  priority: "먼저 확인",
} as const

const OPERATING_TOOLS = [
  {
    href: "/admin/docs?tab=recommended",
    title: "추천 질문 승인",
    description: "초안 질문을 검토하고 공개 여부와 노출 순서를 결정합니다.",
    icon: ClipboardCheck,
    priority: "담당자 승인",
  },
  {
    href: "/admin/channel-talk",
    title: "상담 동기화 · FAQ 후보",
    description: "채널톡 상담을 동기화하고 자주 묻는 미커버 질문을 확인합니다.",
    icon: Headphones,
    priority: "상담 원문",
  },
  {
    href: "/admin/docs?tab=gaps",
    title: "챗봇 운영 현황",
    description: "질문량, 미해결률, 상담 이관과 응답 속도를 확인합니다.",
    icon: Bot,
    priority: "운영 지표",
  },
  {
    href: "/admin/docs",
    title: "가이드 정본 관리",
    description: "본사 확인이 끝난 정보를 정본 문서에 반영하고 게시합니다.",
    icon: BookOpen,
    priority: "SSOT",
  },
  {
    href: "/admin/settings?tab=integrations",
    title: "연동 상태 확인",
    description: "Gemini, Channel Talk, WeCom 등 운영 연동 상태를 점검합니다.",
    icon: Settings2,
    priority: "설정",
  },
] as const

const REGRESSION_OUTCOME_ACTIONS: Array<{ value: Exclude<RegressionOutcome, "not_evaluated">; label: string }> = [
  { value: "pass", label: "통과" },
  { value: "needs_fix", label: "수정 필요" },
  { value: "promoted", label: "반영됨" },
  { value: "excluded", label: "제외" },
]

const STATUS_META: Record<ConversationStatus, { label: string; className: string }> = {
  queue: { label: "대기", className: "border-black/10 bg-[#F6F5F4] text-[#615D59]" },
  active: { label: "진행중", className: "border-[#084734]/15 bg-[#ECFDF5] text-[#084734]" },
  waiting_review: { label: "검토 필요", className: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]" },
  resolved: { label: "승인 완료", className: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]" },
  archived: { label: "아카이브", className: "border-black/10 bg-white text-[#615D59]" },
}

const PRIORITY_META: Record<ConversationPriority, { label: string; dot: string }> = {
  low: { label: "낮음", dot: "bg-[#A39E98]" },
  normal: { label: "보통", dot: "bg-[#A8741A]" },
  high: { label: "높음", dot: "bg-[#B43E3E]" },
  urgent: { label: "긴급", dot: "bg-[#8F2C2C]" },
}

const REVIEW_META: Record<ReviewState, { label: string; className: string }> = {
  not_required: { label: "기록", className: "bg-[#F6F5F4] text-[#615D59]" },
  pending: { label: "검토 전 초안", className: "bg-[#FBF1E0] text-[#7A520F]" },
  approved: { label: "승인됨", className: "bg-[#ECFDF5] text-[#084734]" },
  changes_requested: { label: "수정 요청", className: "bg-[#FCE9E9] text-[#8F2C2C]" },
  rejected: { label: "사용 안 함", className: "bg-[#F6F5F4] text-[#615D59]" },
}

const DEMO_CONVERSATION: InternalCsConversation = {
  id: "preview-internal-cs",
  title: "환불 정책 확인",
  status: "waiting_review",
  priority: "high",
  assignee_user_id: null,
  assignee_name: "CS 담당자",
  tags: ["area:billing", "intent:hq_confirmation", "evidence:hq_pending"],
  customer_context: {},
  last_message_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  archive_reason: null,
}

const DEMO_MESSAGES: InternalCsMessage[] = [
  {
    id: "preview-user-message",
    conversation_id: DEMO_CONVERSATION.id,
    role: "user",
    content: "결제 후 수업을 한 번도 듣지 않았고, 7일 이내 환불을 요청했습니다. 환불 가능 여부와 본사 확인이 필요한지 검토하고 답변 초안을 작성해 주세요.",
    model_name: null,
    model_mode: null,
    source_refs: [],
    metadata: {},
    review_state: "not_required",
    corrected_content: null,
    review_note: null,
    feedback_labels: [],
    regression_candidate: false,
    regression_outcome: "not_evaluated",
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "preview-assistant-message",
    conversation_id: DEMO_CONVERSATION.id,
    role: "assistant",
    content: "검토 전 내부 초안\n\n환불 조건은 결제·계약 방식에 따라 달라질 수 있어 현재 정보만으로 확정할 수 없습니다. 고객의 계약서 또는 주문 조건을 먼저 확인하고, 프로모션 코드가 적용된 건이라면 본사 확인 후 안내하는 것이 안전합니다.\n\n고객에게는 ‘계약 조건과 결제 내역을 확인한 뒤 담당자가 환불 가능 여부와 처리 일정을 안내하겠다’고 우선 답변해 주세요.",
    model_name: "gemini-3.1-pro-preview",
    model_mode: "deep",
    source_refs: [
      { id: "/docs/getting-started/pre-adoption-checklist", label: "도입 전 확인 기준", kind: "public_doc" },
      { id: "docs/active/classin-operating-canon-2026-07-02.md", label: "Classin 운영 정본", kind: "internal_guide" },
      {
        id: "docs/active/internal-cs-content-arrangement-2026-07-15.md#가격계약환불보증",
        label: "가격·계약·환불의 한국 적용 범위",
        kind: "curated_knowledge",
        verificationStatus: "hq_confirmation_required",
        externalUse: "confirmation_required",
      },
    ],
    metadata: { origin: "model", fallbackUsed: false },
    review_state: "pending",
    corrected_content: null,
    review_note: null,
    feedback_labels: [],
    regression_candidate: false,
    regression_outcome: "not_evaluated",
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
  },
]

const DEMO_DETAIL: ConversationDetailResponse = {
  conversation: DEMO_CONVERSATION,
  messages: DEMO_MESSAGES,
  assets: [],
  integrationEvents: [],
}

function assetFileName(asset: InternalCsAsset) {
  return asset.original_file_name ?? asset.file_name ?? asset.name ?? "첨부 이미지"
}

function assetPreviewUrl(asset: InternalCsAsset) {
  return asset.signed_url ?? asset.thumbnail_url ?? asset.preview_url ?? asset.url ?? null
}

function assetAnalysis(asset: InternalCsAsset) {
  if (asset.analysis_summary) return asset.analysis_summary
  if (asset.analysis_text) return asset.analysis_text
  if (asset.analysis) return asset.analysis
  if (asset.analysis_payload && typeof asset.analysis_payload === "object") {
    return JSON.stringify(asset.analysis_payload, null, 2)
  }
  if (asset.analysis_json && typeof asset.analysis_json === "object") {
    return JSON.stringify(asset.analysis_json, null, 2)
  }
  return "분석 결과가 아직 준비되지 않았습니다."
}

function assetAnalysisStatus(asset: InternalCsAsset) {
  return asset.analysis_status ?? asset.status ?? "completed"
}

function assetNeedsHumanReview(asset: InternalCsAsset) {
  if (asset.human_review_required != null) return asset.human_review_required
  return (asset.analysis_review_state ?? asset.review_state) !== "approved"
}

function integrationState(response: IntegrationStatusResponse | null) {
  const bridge = response?.bridge ?? response
  const configured = bridge?.configured ?? response?.configured ?? false
  const status = bridge?.status ?? response?.status ?? (configured ? "ready" : "unconfigured")
  const ready = configured && ["ready", "connected", "ok", "healthy", "active"].includes(status.toLowerCase())
  return {
    configured,
    ready,
    status,
    label: bridge?.label ?? bridge?.provider ?? response?.label ?? response?.provider ?? "AI 브리지",
    message: bridge?.message ?? response?.message ?? (ready ? "현재 대화를 안전하게 전달할 수 있습니다." : "연동 설정과 상태를 확인해 주세요."),
    lastCheckedAt: bridge?.lastCheckedAt ?? response?.lastCheckedAt ?? null,
  }
}

function integrationEventWhen(event: InternalCsIntegrationEvent) {
  return event.created_at ?? event.createdAt ?? null
}

function integrationEventSummary(event: InternalCsIntegrationEvent) {
  if (event.summary) return event.summary
  if (typeof event.result === "string") return event.result
  if (event.error_message ?? event.errorMessage) return event.error_message ?? event.errorMessage ?? ""
  return event.event_type ?? "내부 분석 요청"
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function formatTime(value: string | null) {
  if (!value) return "방금"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function formatDay(value: string | null) {
  if (!value) return "오늘"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date)
}

// 지표 카드 행(계약 1) 전용 포맷터 — 분모 0으로 rate가 null이면 "—"로 표시한다.
function formatMetricRate(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

function formatMetricHours(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Number.isInteger(value) ? value : value.toFixed(1)}h`
}

function normalizeSourceRefs(values: unknown[]): InternalCsSourceRef[] {
  return values.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    const source = value as Record<string, unknown>
    if (typeof source.id !== "string" || !source.id.trim()) return []
    const kind = typeof source.kind === "string" ? source.kind : undefined
    const verificationStatus = typeof source.verificationStatus === "string"
      ? source.verificationStatus
      : undefined
    const externalUse = typeof source.externalUse === "string" ? source.externalUse : undefined
    const reviewState = typeof source.reviewState === "string" ? source.reviewState : undefined
    return [{
      id: source.id,
      label: typeof source.label === "string" ? source.label : undefined,
      kind: kind as InternalCsSourceRef["kind"],
      verificationStatus: verificationStatus as InternalCsSourceRef["verificationStatus"],
      externalUse: externalUse as InternalCsSourceRef["externalUse"],
      reviewState: reviewState as InternalCsSourceRef["reviewState"],
    }]
  })
}

function sourceStatus(source: InternalCsSourceRef) {
  if (source.kind === "internal_asset") {
    if (source.reviewState === "approved") return { label: "담당자 확인", tone: "confirmed" as const }
    return { label: "이미지 미검토", tone: "pending" as const }
  }
  if (source.verificationStatus === "confirmed") {
    return { label: "확정", tone: "confirmed" as const }
  }
  if (source.verificationStatus === "conditional") {
    return { label: "조건부", tone: "conditional" as const }
  }
  if (source.verificationStatus === "conflicting_sources") {
    return { label: "자료 충돌", tone: "pending" as const }
  }
  if (source.verificationStatus === "hq_confirmation_required") {
    return { label: "본사 확인", tone: "pending" as const }
  }
  return null
}

function sourceHref(source: InternalCsSourceRef) {
  if (source.id.startsWith("/")) return source.id.split("#")[0]
  if (source.id.startsWith("docs/")) return null
  return null
}

function getLastQuestion(detail: ConversationDetailResponse) {
  return [...detail.messages].reverse().find((message) => message.role === "user")?.content
}

function buildCustomerHoldingTemplate(detail: ConversationDetailResponse | null) {
  if (!detail) return ""
  return [
    "안녕하세요.",
    "현재 확인된 범위: [확인된 내용 입력]",
    "추가 확인 중인 항목: [모델·세대·버전·계약 등 입력]",
    "확정 전 안내하지 않는 항목: [가격·환불·보증·원인 등 해당 시 입력]",
    `다음 안내: ${detail.conversation.assignee_name ?? "담당자 지정 필요"} · [회신 예정 시각]`,
  ].join("\n")
}

function buildInternalHandoffTemplate(detail: ConversationDetailResponse | null) {
  if (!detail) return ""
  return [
    `[CS-${detail.conversation.id}] ${detail.conversation.title}`,
    `우선순위 / 상태: ${detail.conversation.priority} / ${detail.conversation.status}`,
    `담당자: ${detail.conversation.assignee_name ?? "지정 필요"}`,
    `분류 태그: ${detail.conversation.tags.join(", ") || "분류 필요"}`,
    "제품·모델·세대·앱 버전: 확인 필요",
    `문의 / 현상: ${getLastQuestion(detail) ?? "입력 필요"}`,
    "영향·긴급도: 입력 필요",
    "확인한 내용 / 시도 결과: 입력 필요",
    "고객에게 안내한 내용: 입력 필요",
    "미확정·충돌·리스크: 입력 필요",
    "다음 액션 / 담당자 / 기한: 입력 필요",
    `관련 근거·첨부: 이미지 ${detail.assets?.length ?? 0}건 / 근거 링크 입력 필요`,
  ].join("\n")
}

function buildHqTemplate(detail: ConversationDetailResponse | null) {
  if (!detail) return ""
  const area = detail.conversation.tags
    .find((tag) => tag.startsWith("area:"))
    ?.slice("area:".length) || "AREA"
  const lastQuestion = getLastQuestion(detail)
  return [
    `[KR-CS][${detail.conversation.priority.toUpperCase()}][${area}][${detail.conversation.id}] ${detail.conversation.title}`,
    "",
    "1. Case",
    `- 내부 케이스 ID: ${detail.conversation.id}`,
    `- 한국 담당자: ${detail.conversation.assignee_name ?? "지정 필요"}`,
    "- 발생 시각(KST) / 기관·계정 식별자: 입력 필요 (개인정보 최소화)",
    "- 제품·모델·세대·앱 버전: 확인 필요",
    "",
    "2. Impact",
    "- 영향 사용자·수업·기기 수: 확인 필요",
    "- 수업 차단 여부 / 고객 요구 시한: 확인 필요",
    "",
    "3. Question / Reproduction",
    `- 현상: ${lastQuestion ?? "질문과 현상을 입력해 주세요."}`,
    "- 재현 절차 / Expected / Actual / Frequency: 입력 필요",
    "",
    "4. Korea checks",
    "- 이미 확인한 항목 / 시도한 조치 / 임시 우회 결과: 입력 필요",
    "",
    "5. Evidence",
    `- 개인정보 제거 첨부 ${detail.assets?.length ?? 0}건 / 내부 근거 링크: 입력 필요`,
    "",
    "6. Request to HQ",
    "- 답변이 필요한 질문 1~3개: 입력 필요",
    "- 원인 / 조치 / 버그 여부 / ETA 중 필요한 항목: 입력 필요",
    "- Reply needed by (KST): 입력 필요",
    "- Please include applicable market/models, generation, effective date, and source document/version.",
  ].join("\n")
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative h-16 px-4 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]",
        active ? "text-[#111110]" : "text-[#615D59] hover:text-[#111110]"
      )}
    >
      {children}
      {active ? <span className="absolute inset-x-3 bottom-0 h-0.5 bg-[#111110]" /> : null}
    </button>
  )
}

function StatusBadge({ status }: { status: ConversationStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className={cn("inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-semibold", meta.className)}>
      {meta.label}
    </span>
  )
}

// tools 탭 지표 카드 행(계약 1)의 셀 — 값 정규화(null→"—")는 호출부(metricCards)에서 이미 끝낸다.
function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-black/[0.08] bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#F6F5F4] text-[#615D59]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-[11px] font-medium text-[#615D59]">{label}</p>
      </div>
      <p className="mt-2.5 text-[20px] font-semibold tracking-[-0.02em] text-[#31302E]">{value}</p>
      {sub ? <p className="mt-1 text-[10px] leading-4 text-[#A39E98]">{sub}</p> : null}
    </div>
  )
}

// 계약 3 "지식으로 승격" 제어 — 회귀 패널 항목과 대화 스레드의 승인된 메시지 두 곳에서 공유한다.
// 성공하면 버튼 대신 articleId 링크를 보여준다. 실패해도 버튼을 남겨 재시도할 수 있게 한다.
function PromoteKnowledgeControl({
  pending,
  result,
  onPromote,
}: {
  pending: boolean
  result: PromotionResult | undefined
  onPromote: () => void
}) {
  if (result?.status === "success") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-[#ECFDF5] px-2 py-1 text-[10px] font-semibold text-[#084734]">
          <CheckCircle2 className="h-3 w-3" />
          {result.reused ? "기존 문서 갱신됨" : "지식으로 승격됨"}
        </span>
        <Link
          href={`/admin/docs/${result.articleId}/edit`}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#084734] hover:underline"
        >
          문서 열기
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={onPromote}
        disabled={pending}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-black/[0.08] px-2.5 text-[10px] font-semibold text-[#084734] hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
        {pending ? "승격 중" : "지식으로 승격"}
      </button>
      {result?.status === "error" ? (
        <p className="flex items-start gap-1 text-[10px] leading-4 text-[#8F2C2C]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {result.error}
        </p>
      ) : null}
    </div>
  )
}

function Disclosure({
  icon,
  label,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="border-b border-black/[0.08] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[14px] font-medium text-[#31302E] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-black/[0.06] bg-[#FAFAF8] px-4 py-4">{children}</div> : null}
    </div>
  )
}

function ConversationTable({
  conversations,
  emptyLabel,
  onSelect,
}: {
  conversations: InternalCsConversation[]
  emptyLabel: string
  onSelect: (conversation: InternalCsConversation) => void
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
        <Archive className="h-8 w-8 text-[#A39E98]" />
        <p className="mt-4 text-[14px] font-semibold text-[#31302E]">{emptyLabel}</p>
        <p className="mt-1 text-[12px] text-[#615D59]">새 상담을 시작하면 이곳에 기록됩니다.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border-t border-black/[0.08]">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead className="bg-[#F6F5F4] text-[11px] font-semibold text-[#615D59]">
          <tr>
            <th className="px-5 py-3">상태</th>
            <th className="px-5 py-3">대화</th>
            <th className="px-5 py-3">우선순위</th>
            <th className="px-5 py-3">담당자</th>
            <th className="px-5 py-3">업데이트</th>
            <th className="w-12 px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {conversations.map((conversation) => {
            const priority = PRIORITY_META[conversation.priority]
            return (
              <tr
                key={conversation.id}
                className="cursor-pointer border-b border-black/[0.08] bg-white transition-colors hover:bg-[#FAFAF8]"
                onClick={() => onSelect(conversation)}
              >
                <td className="px-5 py-4"><StatusBadge status={conversation.status} /></td>
                <td className="px-5 py-4">
                  <p className="max-w-[360px] truncate text-[14px] font-semibold text-[#111110]">{conversation.title}</p>
                  <p className="mt-1 max-w-[360px] truncate text-[11px] text-[#615D59]">
                    {conversation.tags.length > 0 ? conversation.tags.join(" · ") : "분류 전"}
                  </p>
                </td>
                <td className="px-5 py-4 text-[12px] text-[#615D59]">
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", priority.dot)} />
                    {priority.label}
                  </span>
                </td>
                <td className="px-5 py-4 text-[12px] text-[#615D59]">{conversation.assignee_name ?? "미지정"}</td>
                <td className="px-5 py-4 text-[12px] text-[#615D59]">{formatDay(conversation.last_message_at)}</td>
                <td className="px-3 py-4"><ChevronRight className="h-4 w-4 text-[#A39E98]" /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function InternalCsChatWorkspaceInner() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("chat")
  const [conversations, setConversations] = useState<InternalCsConversation[]>([])
  const [detail, setDetail] = useState<ConversationDetailResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composer, setComposer] = useState("")
  const [modelMode, setModelMode] = useState<ModelMode>("auto")
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewChecks, setReviewChecks] = useState<ReviewChecks>(INITIAL_CHECKS)
  const [finalDraft, setFinalDraft] = useState("")
  const [reviewNote, setReviewNote] = useState("")
  const [regressionCandidate, setRegressionCandidate] = useState(false)
  const [excludeFromGapQueue, setExcludeFromGapQueue] = useState(false)
  const [expanded, setExpanded] = useState<"sources" | "hq" | "regression" | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [assetError, setAssetError] = useState<string | null>(null)
  const [uploadingAssets, setUploadingAssets] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [assetReviewingId, setAssetReviewingId] = useState<string | null>(null)
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null)
  const [integrationLoading, setIntegrationLoading] = useState(false)
  const [integrationAttempted, setIntegrationAttempted] = useState(false)
  const [integrationError, setIntegrationError] = useState<string | null>(null)
  const [includeOriginal, setIncludeOriginal] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [docsGapsSummary, setDocsGapsSummary] = useState<DocsGapsWidgetSummary | null>(null)
  const [docsGapsAttempted, setDocsGapsAttempted] = useState(false)
  const [regressionCandidates, setRegressionCandidates] = useState<RegressionCandidateItem[]>([])
  const [regressionLoadState, setRegressionLoadState] = useState<AsyncLoadState>("idle")
  const [regressionError, setRegressionError] = useState<string | null>(null)
  // 계약 1 — tools 탭 지표 카드 행.
  const [csMetrics, setCsMetrics] = useState<InternalCsMetricsResponse | null>(null)
  const [metricsLoadState, setMetricsLoadState] = useState<AsyncLoadState>("idle")
  // 계약 2 — 회귀 자동 평가는 제안만 저장한다(messageId로 색인, DB 미변경).
  const [regressionEvalRunState, setRegressionEvalRunState] = useState<RegressionEvalRunState>("idle")
  const [regressionEvalError, setRegressionEvalError] = useState<string | null>(null)
  const [regressionSuggestions, setRegressionSuggestions] = useState<Record<string, RegressionEvalItem>>({})
  const [regressionEvalSkipped, setRegressionEvalSkipped] = useState<RegressionEvalSkippedItem[]>([])
  // 계약 3 — 지식 승격. 회귀 패널 항목·대화 스레드 두 노출 지점이 messageId로 결과를 공유한다.
  const [promotingMessageId, setPromotingMessageId] = useState<string | null>(null)
  const [promotionResults, setPromotionResults] = useState<Record<string, PromotionResult>>({})
  const [deepLinkChecked, setDeepLinkChecked] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const loadConversation = useCallback(async (id: string) => {
    if (demoMode && id === DEMO_CONVERSATION.id) {
      setDetail(DEMO_DETAIL)
      setSelectedId(id)
      setFinalDraft(DEMO_MESSAGES[1].content)
      setReviewChecks(INITIAL_CHECKS)
      setReviewNote("")
      setExcludeFromGapQueue(false)
      return DEMO_DETAIL
    }
    const loaded = await adminFetchJson<ConversationDetailResponse>(`/api/admin/cs-chat/conversations/${id}`)
    setDetail(loaded)
    setSelectedId(id)
    const pending = [...loaded.messages].reverse().find(
      (message) => message.role === "assistant" && message.review_state === "pending"
    )
    setFinalDraft(pending?.corrected_content ?? pending?.content ?? "")
    setReviewChecks(INITIAL_CHECKS)
    setReviewNote("")
    setRegressionCandidate(pending?.regression_candidate ?? false)
    setExcludeFromGapQueue(false)
    return loaded
  }, [demoMode])

  const loadIntegrationStatus = useCallback(async () => {
    setIntegrationAttempted(true)
    if (demoMode) {
      setIntegrationStatus({
        configured: true,
        status: "ready",
        label: "AI 브리지 미리보기",
        message: "현재 대화와 이미지 분석을 내부 AI 협업 채널로 전달할 수 있습니다.",
      })
      setIntegrationError(null)
      return
    }
    setIntegrationLoading(true)
    setIntegrationError(null)
    try {
      const response = await adminFetchJson<IntegrationStatusResponse>("/api/admin/cs-chat/integrations/status")
      setIntegrationStatus(response)
    } catch (statusError) {
      setIntegrationError(statusError instanceof Error ? statusError.message : "AI 브리지 상태를 불러오지 못했습니다.")
    } finally {
      setIntegrationLoading(false)
    }
  }, [demoMode])

  // tools 탭 라이브 위젯 — 기존 GET /api/admin/docs/gaps 응답을 소스별로 집계한다(신규 API 없음).
  // 실패 시 null을 유지해 정적 카드(DOCS_GAPS_FALLBACK_TOOL) 형태로 폴백한다.
  const loadDocsGapsSummary = useCallback(async () => {
    setDocsGapsAttempted(true)
    if (demoMode) {
      setDocsGapsSummary(null)
      return
    }
    try {
      const response = await adminFetchJson<DocGapsSummaryResponse>("/api/admin/docs/gaps")
      const clusters = Array.isArray(response.gapClusters) ? response.gapClusters : []
      const internalCs = clusters.filter((cluster) => {
        const source = cluster.metadata?.source
        return source === "internal_cs_fallback" || source === "internal_cs_review"
      }).length
      setDocsGapsSummary({
        chatbot: clusters.length - internalCs,
        internalCs,
        capped: clusters.length >= 30,
      })
    } catch {
      setDocsGapsSummary(null)
    }
  }, [demoMode])

  // 회귀 검수 미니 패널 — 미판정 우선 목록. 실패 시 섹션 자체에 재시도 폴백을 보여준다.
  // demoMode는 "다시 시도" 루프 대신 깨끗한 빈 상태로 처리한다.
  const loadRegressionCandidates = useCallback(async () => {
    if (demoMode) {
      setRegressionCandidates([])
      setRegressionLoadState("loaded")
      return
    }
    setRegressionLoadState("loading")
    try {
      const response = await adminFetchJson<RegressionCandidatesResponse>("/api/admin/cs-chat/regression-candidates")
      setRegressionCandidates(Array.isArray(response.items) ? response.items : [])
      setRegressionLoadState("loaded")
    } catch {
      setRegressionCandidates([])
      setRegressionLoadState("failed")
    }
  }, [demoMode])

  // tools 탭 지표 카드 행(계약 1). regressionLoadState와 동일한 idle→loading→loaded/failed
  // 상태기계를 공유해 실패 시 자동 재시도 루프 없이 수동 "다시 시도"만 제공한다.
  const loadCsMetrics = useCallback(async () => {
    if (demoMode) {
      setCsMetrics(null)
      setMetricsLoadState("loaded")
      return
    }
    setMetricsLoadState("loading")
    try {
      const response = await adminFetchJson<InternalCsMetricsResponse>("/api/admin/cs-chat/metrics?days=7")
      setCsMetrics(response)
      setMetricsLoadState("loaded")
    } catch {
      setCsMetrics(null)
      setMetricsLoadState("failed")
    }
  }, [demoMode])

  const loadConversations = useCallback(async (preferredId?: string | null) => {
    setLoading(true)
    try {
      const response = await adminFetchJson<ConversationListResponse>(
        "/api/admin/cs-chat/conversations?status=all&limit=100"
      )
      setConversations(response.conversations)
      const nextId = preferredId ?? selectedId ?? response.conversations.find((item) => item.status !== "archived")?.id
      if (nextId) await loadConversation(nextId)
      setError(null)
    } catch (loadError) {
      if (process.env.NODE_ENV === "development") {
        setDemoMode(true)
        setConversations([DEMO_CONVERSATION])
        setDetail(DEMO_DETAIL)
        setSelectedId(DEMO_CONVERSATION.id)
        setFinalDraft(DEMO_MESSAGES[1].content)
        setError(null)
        setNotice(null)
      } else {
        setError(loadError instanceof Error ? loadError.message : "내부 CS 대화를 불러오지 못했습니다.")
      }
    } finally {
      setLoading(false)
    }
  }, [loadConversation, selectedId])

  useEffect(() => {
    if (loading && conversations.length === 0 && !detail && !error) {
      void loadConversations()
    }
  }, [conversations.length, detail, error, loadConversations, loading])

  // 딥링크 수신 — ?conversation=<uuid>. 최초 목록 부트스트랩(loading→false)이 끝난 뒤
  // 한 번만 시도해 기본 선택과의 경합을 피한다. 없는/접근 불가한 id는 조용히 무시하고
  // 부트스트랩이 이미 고른 기본 화면을 그대로 둔다.
  useEffect(() => {
    if (deepLinkChecked || loading) return
    setDeepLinkChecked(true)
    const deepLinkId = searchParams.get("conversation")
    // UUID 형태가 아니면(오타·조작된 값) fetch 경로에 꽂지 않고 조용히 무시한다.
    if (!deepLinkId || !UUID_PATTERN.test(deepLinkId)) return
    loadConversation(deepLinkId)
      .then(() => setActiveTab("chat"))
      .catch(() => {
        // 존재하지 않거나 조회 실패한 대화 id — 기본 화면 유지
      })
  }, [deepLinkChecked, loading, loadConversation, searchParams])

  useEffect(() => {
    if (activeTab === "tools" && !integrationAttempted && !integrationLoading) {
      void loadIntegrationStatus()
    }
  }, [activeTab, integrationAttempted, integrationLoading, loadIntegrationStatus])

  useEffect(() => {
    if (activeTab === "tools" && !docsGapsAttempted) {
      void loadDocsGapsSummary()
    }
  }, [activeTab, docsGapsAttempted, loadDocsGapsSummary])

  useEffect(() => {
    if (activeTab === "tools" && regressionLoadState === "idle") {
      void loadRegressionCandidates()
    }
  }, [activeTab, regressionLoadState, loadRegressionCandidates])

  useEffect(() => {
    if (activeTab === "tools" && metricsLoadState === "idle") {
      void loadCsMetrics()
    }
  }, [activeTab, metricsLoadState, loadCsMetrics])

  const assets = useMemo(() => detail?.assets ?? [], [detail?.assets])
  const integrationEvents = useMemo(() => detail?.integrationEvents ?? [], [detail?.integrationEvents])

  useEffect(() => {
    setSelectedAssetId((current) => {
      if (current && assets.some((asset) => asset.id === current)) return current
      return assets.at(-1)?.id ?? null
    })
  }, [assets])

  const queueConversations = useMemo(
    () => conversations.filter((conversation) => conversation.status !== "archived"),
    [conversations]
  )
  const archivedConversations = useMemo(
    () => conversations.filter((conversation) => conversation.status === "archived"),
    [conversations]
  )
  const pendingMessage = useMemo(
    () => [...(detail?.messages ?? [])].reverse().find(
      (message) => message.role === "assistant" && message.review_state === "pending"
    ) ?? null,
    [detail?.messages]
  )
  const latestAssistant = useMemo(
    () => [...(detail?.messages ?? [])].reverse().find((message) => message.role === "assistant") ?? null,
    [detail?.messages]
  )
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets.at(-1) ?? null
  const bridgeState = integrationState(integrationStatus)
  const hasDispatchContext = Boolean(detail && (detail.messages.length > 0 || assets.length > 0))
  const communicationTemplates = useMemo(() => [
    {
      id: "customer",
      label: "고객 임시 안내",
      content: buildCustomerHoldingTemplate(detail),
    },
    {
      id: "handoff",
      label: "내부 인수인계",
      content: buildInternalHandoffTemplate(detail),
    },
    {
      id: "hq",
      label: "본사 확인",
      content: buildHqTemplate(detail),
    },
  ], [detail])
  const canApprove = Object.values(reviewChecks).every(Boolean) && Boolean(pendingMessage) && finalDraft.trim().length > 0

  // 지표 카드 행(계약 1) — csMetrics가 없으면(idle/loading/failed/demoMode) 전 카드를 "—"로 조용히 표시한다.
  const metricCards = useMemo(() => {
    const m = csMetrics
    return [
      {
        key: "volume",
        icon: MessageSquare,
        label: "질문량",
        value: m ? String(m.volume.questions) : "—",
        sub: m ? `대화 ${m.volume.conversations}건` : undefined,
      },
      {
        key: "fallback",
        icon: Search,
        label: "폴백률",
        value: formatMetricRate(m?.fallbackRate),
        sub: "라이브 검색 실패 비율",
      },
      {
        key: "evidence",
        icon: BookOpen,
        label: "근거 믹스",
        value: m
          ? String(m.evidenceMix.knowledge + m.evidenceMix.docs + m.evidenceMix.channel + m.evidenceMix.none)
          : "—",
        sub: m
          ? `정본 ${m.evidenceMix.knowledge} · 문서 ${m.evidenceMix.docs} · 상담이관 ${m.evidenceMix.channel} · 근거없음 ${m.evidenceMix.none}`
          : undefined,
      },
      {
        key: "approval",
        icon: CheckCircle2,
        label: "승인율",
        value: formatMetricRate(m?.review.approvalRate),
        sub: m ? `승인 ${m.review.approved} · 수정요청 ${m.review.changesRequested} · 대기 ${m.review.pending}` : undefined,
      },
      {
        key: "regression",
        icon: History,
        label: "회귀 분포",
        value: m
          ? String(m.regression.pass + m.regression.needsFix + m.regression.promoted + m.regression.excluded)
          : "—",
        sub: m
          ? `통과 ${m.regression.pass} · 수정필요 ${m.regression.needsFix} · 반영 ${m.regression.promoted} · 제외 ${m.regression.excluded} · 미판정 ${m.regression.notEvaluated}`
          : undefined,
      },
      {
        key: "leadTime",
        icon: Clock,
        label: "리드타임",
        value: formatMetricHours(m?.leadTimeHours.median),
        sub: m ? `P90 ${formatMetricHours(m.leadTimeHours.p90)}` : undefined,
      },
    ]
  }, [csMetrics])

  // 자동 평가(계약 2) skipped 요약 — 회귀 패널 하단 경고 1줄. 사유는 중복 제거 후 최대 3개만 노출한다.
  const regressionEvalSkippedSummary = useMemo(() => {
    if (regressionEvalSkipped.length === 0) return null
    const reasons = Array.from(new Set(regressionEvalSkipped.map((item) => item.reason))).slice(0, 3)
    return `자동 평가에서 ${regressionEvalSkipped.length}건을 건너뛰었습니다 (${reasons.join(" · ")})`
  }, [regressionEvalSkipped])

  async function handleSelect(conversation: InternalCsConversation) {
    if (demoMode && conversation.id === DEMO_CONVERSATION.id) {
      setDetail((current) => current ?? DEMO_DETAIL)
      setSelectedId(conversation.id)
      setActiveTab("chat")
      return
    }
    setLoading(true)
    try {
      await loadConversation(conversation.id)
      setActiveTab("chat")
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "대화를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }

  function startNewConversation() {
    setDetail(null)
    setSelectedId(null)
    setComposer("")
    setPendingFiles([])
    setAssetError(null)
    setSelectedAssetId(null)
    setReviewOpen(false)
    setExpanded(null)
    setNotice(null)
    setActiveTab("chat")
  }

  function handleAssetFiles(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? [])
    event.target.value = ""
    const validTypes = incoming.filter((file) => ACCEPTED_ASSET_TYPES.has(file.type))
    const valid = validTypes.filter((file) => file.size > 0 && file.size <= MAX_ASSET_BYTES)
    if (validTypes.length !== incoming.length) {
      setAssetError("JPG, PNG, WebP 이미지만 첨부할 수 있습니다.")
    } else if (valid.length !== validTypes.length) {
      setAssetError("이미지는 장당 8MB 이하여야 합니다.")
    }

    setPendingFiles((current) => {
      const existingKeys = new Set(current.map(fileKey))
      const unique = valid.filter((file) => !existingKeys.has(fileKey(file)))
      const next = [...current, ...unique]
      if (next.length > MAX_PENDING_ASSETS) {
        setAssetError(`한 번에 최대 ${MAX_PENDING_ASSETS}장까지 첨부할 수 있습니다.`)
      } else if (valid.length === incoming.length) {
        setAssetError(null)
      }
      return next.slice(0, MAX_PENDING_ASSETS)
    })
  }

  function removePendingFile(file: File) {
    const key = fileKey(file)
    setPendingFiles((current) => current.filter((item) => fileKey(item) !== key))
    setAssetError(null)
  }

  async function uploadFiles(conversationId: string, files: File[], instruction: string) {
    if (files.length === 0) return 0
    setUploadingAssets(true)
    setUploadProgress({ current: 0, total: files.length })
    const failed: string[] = []
    let uploaded = 0

    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress({ current: index + 1, total: files.length })
        const formData = new FormData()
        formData.append("file", file)
        formData.append("instruction", instruction)
        formData.append("requestedMode", modelMode)
        try {
          await adminFetchJson<unknown>(`/api/admin/cs-chat/conversations/${conversationId}/assets`, {
            method: "POST",
            body: formData,
          })
          uploaded += 1
        } catch {
          failed.push(file.name)
        }
      }
    } finally {
      setUploadingAssets(false)
      setUploadProgress({ current: 0, total: 0 })
    }

    if (failed.length > 0) {
      setAssetError(`분석하지 못한 이미지: ${failed.join(", ")}`)
    } else {
      setAssetError(null)
    }
    return uploaded
  }

  async function dispatchCurrentConversation() {
    if (!detail || !hasDispatchContext || dispatching) {
      setIntegrationError("전송할 현재 대화 또는 이미지 분석이 없습니다.")
      return
    }
    if (!bridgeState.ready && !demoMode) {
      setIntegrationError("AI 브리지가 준비되지 않았습니다. 연동 상태를 먼저 확인해 주세요.")
      return
    }

    setDispatching(true)
    setIntegrationError(null)
    try {
      if (demoMode) {
        const event: InternalCsIntegrationEvent = {
          id: `preview-dispatch-${Date.now()}`,
          integration: bridgeState.label,
          status: "sent",
          include_original: includeOriginal,
          summary: "현재 대화와 분석 맥락을 내부 AI 브리지로 전송했습니다.",
          created_at: new Date().toISOString(),
        }
        setDetail((current) => current
          ? { ...current, integrationEvents: [event, ...(current.integrationEvents ?? [])] }
          : current)
      } else {
        await adminFetchJson<unknown>(`/api/admin/cs-chat/conversations/${detail.conversation.id}/dispatch`, {
          method: "POST",
          body: JSON.stringify({
            includeOriginalAssets: includeOriginal,
            acknowledgeSensitiveData: includeOriginal,
          }),
        })
        await loadConversation(detail.conversation.id)
      }
      setNotice(includeOriginal
        ? "현재 대화·분석과 확인한 원본 이미지를 내부 AI 브리지로 전송했습니다."
        : "현재 대화와 분석 맥락을 내부 AI 브리지로 전송했습니다.")
    } catch (dispatchError) {
      setIntegrationError(dispatchError instanceof Error ? dispatchError.message : "현재 대화를 전송하지 못했습니다.")
    } finally {
      setDispatching(false)
    }
  }

  async function approveSelectedAsset() {
    if (!detail || !selectedAsset || assetReviewingId) return
    setAssetReviewingId(selectedAsset.id)
    setAssetError(null)
    try {
      if (demoMode) {
        setDetail((current) => current
          ? {
              ...current,
              assets: (current.assets ?? []).map((asset) => asset.id === selectedAsset.id
                ? { ...asset, review_state: "approved", human_review_required: false }
                : asset),
            }
          : current)
      } else {
        await adminFetchJson<unknown>(
          `/api/admin/cs-chat/conversations/${detail.conversation.id}/assets/${selectedAsset.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ decision: "approved" }),
          }
        )
        await loadConversation(detail.conversation.id)
      }
      setNotice("이미지 분석을 CS 담당자 확인 완료로 기록했습니다.")
    } catch (reviewError) {
      setAssetError(reviewError instanceof Error ? reviewError.message : "이미지 분석 확인을 저장하지 못했습니다.")
    } finally {
      setAssetReviewingId(null)
    }
  }

  async function submitQuestion(event: FormEvent) {
    event.preventDefault()
    const filesToUpload = [...pendingFiles]
    const question = composer.trim() || (filesToUpload.length > 0
      ? "첨부 이미지의 내용과 CS 대응에 필요한 사항을 분석해 주세요."
      : "")
    if (!question || isPending || uploadingAssets) return

    setError(null)
    setNotice(null)
    setComposer("")
    if (demoMode) {
      const now = new Date().toISOString()
      const previewAssets: InternalCsAsset[] = filesToUpload.map((file, index) => ({
        id: `preview-asset-${Date.now()}-${index}`,
        file_name: file.name,
        mime_type: file.type,
        preview_url: URL.createObjectURL(file),
        instruction: question,
        analysis: "화면 또는 사진의 핵심 요소를 추출한 미리보기 분석입니다. 실제 환경에서는 모델 분석 결과와 추가 확인 항목이 누적됩니다.",
        analysis_status: "completed",
        human_review_required: true,
        created_at: now,
      }))
      const nextUser: InternalCsMessage = {
        ...DEMO_MESSAGES[0],
        id: `preview-user-${Date.now()}`,
        content: question,
        created_at: now,
      }
      const nextAssistant: InternalCsMessage = {
        ...DEMO_MESSAGES[1],
        id: `preview-assistant-${Date.now()}`,
        content: "검토 전 내부 초안\n\n현재 미리보기에서는 입력 흐름만 확인할 수 있습니다. 실제 환경에서는 공개 가이드와 내부 운영 기준을 검색한 뒤 Gemini 초안을 생성하며, 담당자 승인 전에는 외부로 전달되지 않습니다.",
        model_name: modelMode === "deep" ? "gemini-3.1-pro-preview" : "gemini-3.5-flash",
        model_mode: modelMode === "deep" ? "deep" : "fast",
        created_at: now,
      }
      const nextDetail = {
        conversation: { ...DEMO_CONVERSATION, status: "waiting_review" as const, last_message_at: now },
        messages: [...(detail?.messages ?? DEMO_MESSAGES), nextUser, nextAssistant],
        assets: [...(detail?.assets ?? []), ...previewAssets],
        integrationEvents: detail?.integrationEvents ?? [],
      }
      setDetail(nextDetail)
      setPendingFiles([])
      setSelectedAssetId(previewAssets.at(-1)?.id ?? selectedAssetId)
      setFinalDraft(nextAssistant.content)
      setReviewChecks(INITIAL_CHECKS)
      setNotice("미리보기 초안을 생성했습니다. 실제 환경에서는 Gemini와 내부 근거 검색을 사용합니다.")
      return
    }
    startTransition(async () => {
      try {
        let conversationId = selectedId
        if (!conversationId) {
          const created = await adminFetchJson<{ conversation: InternalCsConversation }>(
            "/api/admin/cs-chat/conversations",
            {
              method: "POST",
              body: JSON.stringify({
                title: question.slice(0, 60),
                priority: "normal",
                tags: ["internal_cs"],
              }),
            }
          )
          conversationId = created.conversation.id
          setSelectedId(conversationId)
        }

        await uploadFiles(conversationId, filesToUpload, question)

        await adminFetchJson<GenerateResponse>(
          `/api/admin/cs-chat/conversations/${conversationId}/generate`,
          {
            method: "POST",
            body: JSON.stringify({
              question,
              requestedMode: modelMode,
              requiresEvidenceReview: modelMode === "deep",
            }),
          }
        )
        setPendingFiles([])
        await loadConversations(conversationId)
        setNotice("AI 초안이 생성되었습니다. 외부 전달 전 담당자 검토가 필요합니다.")
      } catch (submitError) {
        setComposer(question)
        setError(submitError instanceof Error ? submitError.message : "답변 초안을 생성하지 못했습니다.")
      }
    })
  }

  function rerunWithPro() {
    const question = [...(detail?.messages ?? [])].reverse().find((message) => message.role === "user")?.content
    if (!question || !selectedId || isPending) return
    if (demoMode) {
      const now = new Date().toISOString()
      const proMessage: InternalCsMessage = {
        ...DEMO_MESSAGES[1],
        id: `preview-pro-${Date.now()}`,
        content: "검토 전 심층 초안\n\n정책·계약·프로모션 조건이 서로 다를 수 있으므로 환불을 확정하지 않습니다. 결제 원장, 계약 조건, 프로모션 적용 여부를 대조하고 본사에는 적용 시장과 효력일을 포함해 확인을 요청해 주세요.",
        model_name: "gemini-3.1-pro-preview",
        model_mode: "deep",
        created_at: now,
      }
      setDetail((current) => current ? { ...current, messages: [...current.messages, proMessage] } : current)
      setFinalDraft(proMessage.content)
      setReviewChecks(INITIAL_CHECKS)
      setNotice("Pro 심층 검토 미리보기를 추가했습니다.")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await adminFetchJson<GenerateResponse>(
          `/api/admin/cs-chat/conversations/${selectedId}/generate`,
          {
            method: "POST",
            body: JSON.stringify({ question, requestedMode: "deep", requiresEvidenceReview: true }),
          }
        )
        await loadConversations(selectedId)
        setNotice("Pro 심층 검토 초안을 추가했습니다. 최신 초안을 확인해 주세요.")
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "Pro 심층 검토에 실패했습니다.")
      }
    })
  }

  async function copyText(text: string, success: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice(success)
    } catch {
      setError("클립보드 복사에 실패했습니다.")
    }
  }

  function submitReview(decision: "approved" | "changes_requested") {
    if (!detail || !pendingMessage || isPending) return
    if (decision === "approved" && !canApprove) {
      setError("고객 맥락, 정본 근거, 외부 전달 범위를 모두 확인해 주세요.")
      return
    }
    if (decision === "changes_requested" && !reviewNote.trim()) {
      setError("수정 요청 사유를 입력해 주세요.")
      return
    }

    if (demoMode) {
      const now = new Date().toISOString()
      const nextStatus: ConversationStatus = decision === "approved" ? "resolved" : "active"
      setDetail((current) => {
        if (!current) return current
        return {
          conversation: {
            ...current.conversation,
            status: nextStatus,
          },
          messages: current.messages.map((message) => message.id === pendingMessage.id
            ? {
                ...message,
                review_state: decision,
                corrected_content: finalDraft,
                review_note: reviewNote || null,
                regression_candidate: decision === "changes_requested" || regressionCandidate,
                regression_outcome: decision === "changes_requested" ? "needs_fix" : "not_evaluated",
                reviewed_by: "CS 담당자",
                reviewed_at: now,
              }
            : message),
        }
      })
      setConversations((current) => current.map((conversation) => conversation.id === detail.conversation.id
        ? { ...conversation, status: nextStatus, updated_at: now, last_message_at: now }
        : conversation))
      if (decision === "approved") {
        void copyText(finalDraft, "승인된 최종 답변을 복사했습니다.")
        setReviewOpen(false)
      } else {
        setNotice("수정 요청을 기록하고 회귀 개선 후보로 남겼습니다.")
      }
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await adminFetchJson<{ message: InternalCsMessage }>(
          `/api/admin/cs-chat/conversations/${detail.conversation.id}/messages/${pendingMessage.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              decision,
              correctedContent: finalDraft,
              reviewNote: reviewNote || undefined,
              feedbackLabels: decision === "changes_requested" ? ["human_revision_requested"] : ["human_approved"],
              regressionCandidate: decision === "changes_requested" || regressionCandidate,
              regressionOutcome: decision === "changes_requested" ? "needs_fix" : "not_evaluated",
              conversationAction: decision === "approved" ? "resolve" : "keep_open",
              excludeFromGapQueue: decision === "changes_requested" && excludeFromGapQueue ? true : undefined,
            }),
          }
        )
        if (decision === "approved") {
          await copyText(finalDraft, "승인된 최종 답변을 복사했습니다.")
          setReviewOpen(false)
        } else {
          setNotice("수정 요청을 기록하고 회귀 개선 후보로 남겼습니다.")
        }
        await loadConversations(detail.conversation.id)
      } catch (reviewError) {
        setError(reviewError instanceof Error ? reviewError.message : "검토 결과를 저장하지 못했습니다.")
      }
    })
  }

  // 회귀 패널의 "대화 보기" — 대화 탭으로 전환하고 해당 대화를 직접 로드한다(사이드바 목록 의존 없음).
  function openConversationById(conversationId: string) {
    setActiveTab("chat")
    loadConversation(conversationId).catch((openError) => {
      setError(openError instanceof Error ? openError.message : "대화를 불러오지 못했습니다.")
    })
  }

  // 회귀 판정 버튼 — 기존 메시지 PATCH(regressionOutcome)를 재사용한다. 옵티미스틱 제거 후
  // 실패하면 목록 맨 앞에 복원하고 에러를 보여준다.
  async function judgeRegressionCandidate(
    item: RegressionCandidateItem,
    outcome: Exclude<RegressionOutcome, "not_evaluated">
  ) {
    setRegressionError(null)
    setRegressionCandidates((current) => current.filter((candidate) => candidate.id !== item.id))
    try {
      await adminFetchJson(`/api/admin/cs-chat/conversations/${item.conversationId}/messages/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ regressionOutcome: outcome }),
      })
    } catch (judgeError) {
      setRegressionCandidates((current) => [item, ...current])
      setRegressionError(judgeError instanceof Error ? judgeError.message : "회귀 판정을 저장하지 못했습니다.")
    }
  }

  // 계약 2 "자동 평가 실행" — 제안만 받아온다. DB의 regression_outcome은 이 함수로 절대 바뀌지 않으며,
  // 확정은 위 judgeRegressionCandidate(기존 판정 버튼)로만 이뤄진다.
  async function runRegressionAutoEval() {
    if (regressionEvalRunState === "running") return // 이중 클릭 방지
    if (demoMode) {
      setRegressionEvalRunState("done")
      setRegressionEvalSkipped([])
      setNotice("미리보기에는 평가할 회귀 후보가 없습니다. 실제 환경에서는 미판정 후보를 Gemini가 재평가해 제안합니다.")
      return
    }
    setRegressionEvalRunState("running")
    setRegressionEvalError(null)
    try {
      const response = await adminFetchJson<RegressionEvalResponse>("/api/admin/cs-chat/regression-eval", {
        method: "POST",
        body: JSON.stringify({}),
      })
      setRegressionSuggestions((current) => {
        const next = { ...current }
        for (const item of response.items ?? []) {
          next[item.messageId] = item
        }
        return next
      })
      setRegressionEvalSkipped(Array.isArray(response.skipped) ? response.skipped : [])
      setRegressionEvalRunState("done")
    } catch (evalError) {
      setRegressionEvalRunState("failed")
      setRegressionEvalError(evalError instanceof Error ? evalError.message : "자동 평가를 실행하지 못했습니다.")
    }
  }

  // 계약 3 "지식으로 승격" — 대상은 review_state=approved && corrected_content 존재.
  // 멱등(같은 메시지 재승격 시 reused:true로 기존 문서 갱신). 회귀 패널 항목과 대화 스레드의
  // 승인된 메시지 두 노출 지점이 이 함수 하나를 공유한다.
  async function promoteMessageToKnowledge(messageId: string) {
    if (promotingMessageId) return // 이중 클릭 방지(동시 승격 1건으로 제한)
    setPromotingMessageId(messageId)
    // 이전 실패 결과가 남아 있으면 재시도 스피너와 함께 잔상처럼 보이므로 시작 시 지운다.
    setPromotionResults((current) => {
      if (!(messageId in current)) return current
      const next = { ...current }
      delete next[messageId]
      return next
    })
    if (demoMode) {
      setPromotionResults((current) => ({
        ...current,
        [messageId]: { status: "error", error: "미리보기에서는 지식 승격을 실행할 수 없습니다. 실제 환경에서 시도해 주세요." },
      }))
      setPromotingMessageId(null)
      return
    }
    try {
      const response = await adminFetchJson<PromoteKnowledgeResponse>(
        `/api/admin/cs-chat/messages/${messageId}/promote-knowledge`,
        { method: "POST" }
      )
      setPromotionResults((current) => ({
        ...current,
        [messageId]: { status: "success", articleId: response.articleId, slug: response.slug, reused: response.reused },
      }))
    } catch (promoteError) {
      setPromotionResults((current) => ({
        ...current,
        [messageId]: {
          status: "error",
          error: promoteError instanceof Error ? promoteError.message : "지식 승격에 실패했습니다.",
        },
      }))
    } finally {
      setPromotingMessageId(null)
    }
  }

  function archiveConversation() {
    if (!detail || isPending) return
    if (demoMode) {
      setDetail((current) => current ? { ...current, conversation: { ...current.conversation, status: "archived" } } : current)
      setConversations((current) => current.map((item) => item.id === detail.conversation.id ? { ...item, status: "archived" } : item))
      setActiveTab("archive")
      setNotice("미리보기 대화를 아카이브했습니다.")
      return
    }
    startTransition(async () => {
      try {
        await adminFetchJson(`/api/admin/cs-chat/conversations/${detail.conversation.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "archive", archiveReason: "CS 담당자 수동 아카이브" }),
        })
        await loadConversations(null)
        setActiveTab("archive")
        setNotice("대화를 아카이브했습니다.")
      } catch (archiveError) {
        setError(archiveError instanceof Error ? archiveError.message : "아카이브하지 못했습니다.")
      }
    })
  }

  function reopenConversation() {
    if (!detail || isPending) return
    if (demoMode) {
      setDetail((current) => current ? { ...current, conversation: { ...current.conversation, status: "queue" } } : current)
      setConversations((current) => current.map((item) => item.id === detail.conversation.id ? { ...item, status: "queue" } : item))
      setActiveTab("chat")
      setNotice("미리보기 대화를 다시 열었습니다.")
      return
    }
    startTransition(async () => {
      try {
        await adminFetchJson(`/api/admin/cs-chat/conversations/${detail.conversation.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "reopen" }),
        })
        await loadConversations(detail.conversation.id)
        setActiveTab("chat")
        setNotice("대화를 다시 대기열로 이동했습니다.")
      } catch (reopenError) {
        setError(reopenError instanceof Error ? reopenError.message : "대화를 다시 열지 못했습니다.")
      }
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white font-sans text-[#111110]">
      <header className="flex h-16 shrink-0 items-center justify-between bg-[#31302E] px-5 text-white sm:px-7">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-[#6EE7B7]" />
            <h1 className="whitespace-nowrap text-[19px] font-semibold tracking-[-0.02em]">CS 코파일럿</h1>
          </div>
          <span className="hidden h-6 w-px bg-white/20 sm:block" />
          <p className="hidden truncate text-[12px] text-white/65 sm:block">
            내부 정보와 본사 소통 기준을 함께 확인합니다
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/admin/overview"
            className="mr-1 inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 px-2.5 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:px-3 sm:text-[12px]"
            aria-label="어드민으로 돌아가기"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            어드민
          </Link>
          <button
            type="button"
            onClick={() => setActiveTab("tools")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="운영 도구 열기"
          >
            <HelpCircle className="h-4.5 w-4.5" />
          </button>
          <span className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold">CS</span>
        </div>
      </header>

      <nav className="flex h-16 shrink-0 items-center justify-between border-b border-black/[0.08] bg-white px-3 sm:px-5">
        <div className="flex min-w-0 items-center overflow-x-auto">
          {WORKSPACE_TABS.map((tab) => (
            <TabButton key={tab.value} active={activeTab === tab.value} onClick={() => setActiveTab(tab.value)}>
              {tab.label}
            </TabButton>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void loadConversations(selectedId)}
          disabled={loading || isPending}
          className="mr-2 hidden h-9 items-center gap-2 rounded-md px-3 text-[12px] font-medium text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] disabled:opacity-40 sm:inline-flex"
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          새로고침
        </button>
      </nav>

      {error ? (
        <div className="border-b border-[#F2B8B8] bg-[#FCE9E9] px-5 py-2.5 text-[12px] text-[#8F2C2C]">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="border-b border-[#BDEFD8] bg-[#ECFDF5] px-5 py-2.5 text-[12px] text-[#084734]">
          {notice}
        </div>
      ) : null}

      {activeTab === "chat" ? (
        <div className={cn("flex min-h-0 flex-1 flex-col", reviewOpen && "xl:pr-[438px]")}>
          <div className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] px-5 py-3 sm:px-7">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={startNewConversation}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/[0.08] bg-white transition-colors hover:bg-[#F6F5F4]"
                aria-label="새 대화"
                title="새 대화"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <select
                value={selectedId ?? ""}
                onChange={(event) => {
                  const conversation = conversations.find((item) => item.id === event.target.value)
                  if (conversation) void handleSelect(conversation)
                }}
                className="h-9 max-w-[260px] rounded-md border border-black/[0.08] bg-white px-3 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-[#084734]/30"
              >
                <option value="">새 내부 CS 상담</option>
                {queueConversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
                ))}
              </select>
              {detail ? <StatusBadge status={detail.conversation.status} /> : null}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={modelMode}
                onChange={(event) => setModelMode(event.target.value as ModelMode)}
                className="h-9 rounded-md border border-black/[0.08] bg-white px-3 text-[12px] outline-none focus:ring-2 focus:ring-[#084734]/30"
                aria-label="Gemini 모델 모드"
              >
                <option value="auto">Flash · 자동</option>
                <option value="fast">Flash · 빠르게</option>
                <option value="deep">Pro · 심층</option>
              </select>
              <button
                type="button"
                onClick={rerunWithPro}
                disabled={!detail || isPending}
                className="hidden h-9 items-center gap-2 rounded-md px-3 text-[12px] font-medium text-[#31302E] transition-colors hover:bg-[#F6F5F4] disabled:opacity-40 sm:inline-flex"
              >
                <FileCheck2 className="h-4 w-4" />
                Pro로 심층 검토
              </button>
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                disabled={!pendingMessage}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 text-[12px] font-semibold transition-colors hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PanelRightOpen className="h-4 w-4" />
                검토 열기
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#FFFFFF] px-5 py-7 sm:px-8">
            <div className={cn("w-full max-w-[820px] space-y-8", reviewOpen ? "xl:mr-auto xl:ml-0" : "mx-auto")}>
              {loading && !detail ? (
                <div className="flex min-h-[360px] items-center justify-center text-[#615D59]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  내부 CS 대화를 불러오는 중입니다.
                </div>
              ) : detail?.messages.length ? (
                detail.messages.map((message) => {
                  const review = REVIEW_META[message.review_state]
                  const sources = normalizeSourceRefs(message.source_refs)
                  const isLatestAssistant = latestAssistant?.id === message.id
                  const visibleContent = message.corrected_content && message.review_state === "approved"
                    ? message.corrected_content
                    : message.content

                  return (
                    <article key={message.id} className="flex gap-3 sm:gap-4">
                      <span className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        message.role === "assistant" ? "bg-[#084734] text-white" : "bg-[#F0EFED] text-[#31302E]"
                      )}>
                        {message.role === "assistant" ? <Sparkles className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-semibold text-[#31302E]">
                            {message.role === "assistant" ? "AI 답변" : "사용자 질문"}
                          </p>
                          <span className="text-[11px] text-[#A39E98]">{formatTime(message.created_at)}</span>
                          {message.role === "assistant" ? (
                            <span className={cn("rounded-md px-2 py-1 text-[10px] font-semibold", review.className)}>
                              {review.label}
                            </span>
                          ) : null}
                        </div>

                        {message.role === "user" ? (
                          <div className="max-w-[580px] whitespace-pre-wrap rounded-lg border border-black/[0.08] bg-[#FAFAF8] px-4 py-3 text-[14px] leading-6 text-[#31302E]">
                            {message.content}
                          </div>
                        ) : (
                          <div className="overflow-hidden rounded-lg border border-black/[0.08] bg-white">
                            <div className="whitespace-pre-wrap px-5 py-4 text-[14px] leading-7 text-[#31302E]">
                              {visibleContent}
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#A39E98]">
                                {message.model_name ? <span>{message.model_name}</span> : <span>결정론적 안전 초안</span>}
                                {message.model_mode ? <span>· {message.model_mode}</span> : null}
                              </div>
                              {message.review_state === "approved" && message.corrected_content ? (
                                <div className="mt-3 border-t border-black/[0.06] pt-3">
                                  <PromoteKnowledgeControl
                                    pending={promotingMessageId === message.id}
                                    result={promotionResults[message.id]}
                                    onPromote={() => void promoteMessageToKnowledge(message.id)}
                                  />
                                </div>
                              ) : null}
                            </div>

                            {isLatestAssistant ? (
                              <div className="border-t border-black/[0.08]">
                                <Disclosure
                                  icon={<BookOpen className="h-4 w-4" />}
                                  label={`근거 ${sources.length}건`}
                                  open={expanded === "sources"}
                                  onToggle={() => setExpanded(expanded === "sources" ? null : "sources")}
                                >
                                  {sources.length > 0 ? (
                                    <div className="space-y-2">
                                      {sources.map((source) => {
                                        const href = sourceHref(source)
                                        const status = sourceStatus(source)
                                        const content = (
                                          <>
                                            <span className="min-w-0 flex-1 truncate">{source.label ?? source.id}</span>
                                            {status ? (
                                              <span
                                                className={cn(
                                                  "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold",
                                                  status.tone === "confirmed"
                                                    ? "bg-[#ECFDF5] text-[#084734]"
                                                    : status.tone === "conditional"
                                                      ? "bg-[#F6F5F4] text-[#615D59]"
                                                      : "bg-[#FBF1E0] text-[#7A520F]"
                                                )}
                                              >
                                                {status.label}
                                              </span>
                                            ) : null}
                                            {href ? <ExternalLink className="h-3.5 w-3.5 shrink-0" /> : <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-[#A39E98]" />}
                                          </>
                                        )
                                        return href ? (
                                          <Link
                                            key={source.id}
                                            href={href}
                                            className="flex items-center gap-3 rounded-md border border-black/[0.08] bg-white px-3 py-2.5 text-[12px] text-[#31302E] hover:border-[#084734]/20 hover:text-[#084734]"
                                          >
                                            {content}
                                          </Link>
                                        ) : (
                                          <div key={source.id} className="flex items-center gap-3 rounded-md border border-black/[0.08] bg-white px-3 py-2.5 text-[12px] text-[#31302E]">
                                            {content}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <p className="text-[12px] leading-5 text-[#615D59]">직접 일치하는 문서 근거가 없습니다. 담당자 확인이 필요합니다.</p>
                                  )}
                                </Disclosure>
                                <Disclosure
                                  icon={<MessageSquare className="h-4 w-4" />}
                                  label="소통 초안 3종"
                                  open={expanded === "hq"}
                                  onToggle={() => setExpanded(expanded === "hq" ? null : "hq")}
                                >
                                  <div className="space-y-3">
                                    {communicationTemplates.map((template) => (
                                      <section key={template.id} className="rounded-md border border-black/[0.08] bg-white p-3">
                                        <div className="flex items-center justify-between gap-3">
                                          <h4 className="text-[11px] font-semibold text-[#31302E]">{template.label}</h4>
                                          <button
                                            type="button"
                                            onClick={() => void copyText(template.content, `${template.label} 초안을 복사했습니다.`)}
                                            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[10px] font-semibold hover:bg-[#F6F5F4]"
                                          >
                                            <Copy className="h-3 w-3" />
                                            복사
                                          </button>
                                        </div>
                                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-sans text-[11px] leading-5 text-[#615D59]">
                                          {template.content}
                                        </pre>
                                      </section>
                                    ))}
                                  </div>
                                </Disclosure>
                                <Disclosure
                                  icon={<History className="h-4 w-4" />}
                                  label="회귀 개선에 추가"
                                  open={expanded === "regression"}
                                  onToggle={() => setExpanded(expanded === "regression" ? null : "regression")}
                                >
                                  <label className="flex cursor-pointer items-start gap-3 text-[12px] leading-5 text-[#31302E]">
                                    <input
                                      type="checkbox"
                                      checked={regressionCandidate}
                                      onChange={(event) => setRegressionCandidate(event.target.checked)}
                                      className="mt-0.5 h-4 w-4 accent-[#084734]"
                                    />
                                    <span>
                                      이 답변을 회귀 개선 후보로 표시합니다.
                                      <span className="mt-1 block text-[#615D59]">승인 또는 수정 요청 시 담당자 판단과 함께 저장됩니다.</span>
                                    </span>
                                  </label>
                                </Disclosure>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })
              ) : (
                <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <h2 className="mt-5 text-[18px] font-semibold tracking-[-0.02em] text-[#31302E]">내부 CS 질문을 시작하세요</h2>
                  <p className="mt-2 max-w-md text-[13px] leading-6 text-[#615D59]">
                    공개 가이드와 내부 운영 기준을 함께 확인하고, 필요한 경우 본사 소통 초안까지 만듭니다.
                  </p>
                </div>
              )}

              {assets.length > 0 ? (
                <section className="border-t border-black/[0.08] pt-6" aria-label="누적 이미지 분석">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-[13px] font-semibold text-[#31302E]">누적 이미지 분석</h2>
                      <p className="mt-1 text-[11px] text-[#615D59]">같은 대화의 사진과 분석 결과를 순서대로 보관합니다.</p>
                    </div>
                    <span className="text-[10px] font-medium text-[#A39E98]">{assets.length}개</span>
                  </div>

                  <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                    {assets.map((asset) => {
                      const preview = assetPreviewUrl(asset)
                      const status = assetAnalysisStatus(asset).toLowerCase()
                      const analyzing = ["pending", "processing", "analyzing", "queued"].includes(status)
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => setSelectedAssetId(asset.id)}
                          className={cn(
                            "group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md border bg-[#F6F5F4] text-[#615D59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
                            selectedAsset?.id === asset.id ? "border-[#084734]" : "border-black/[0.08] hover:border-black/20"
                          )}
                          aria-label={`${assetFileName(asset)} 분석 보기`}
                        >
                          {preview ? (
                            <Image
                              src={preview}
                              alt=""
                              fill
                              unoptimized
                              sizes="72px"
                              className="object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">
                              <ImageIcon className="h-5 w-5" />
                            </span>
                          )}
                          {analyzing ? (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/80">
                              <Loader2 className="h-4 w-4 animate-spin text-[#084734]" />
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>

                  {selectedAsset ? (
                    <div className="mt-2 overflow-hidden rounded-lg border border-black/[0.08] bg-[#FAFAF8]">
                      <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.08] bg-white px-4 py-3">
                        <ImageIcon className="h-4 w-4 text-[#084734]" />
                        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#31302E]">
                          {assetFileName(selectedAsset)}
                        </p>
                        {["pending", "processing", "analyzing", "queued"].includes(assetAnalysisStatus(selectedAsset).toLowerCase()) ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#F6F5F4] px-2 py-1 text-[10px] font-semibold text-[#615D59]">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            분석 중
                          </span>
                        ) : ["failed", "error"].includes(assetAnalysisStatus(selectedAsset).toLowerCase()) ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#FCE9E9] px-2 py-1 text-[10px] font-semibold text-[#8F2C2C]">
                            <AlertTriangle className="h-3 w-3" />
                            분석 실패
                          </span>
                        ) : assetNeedsHumanReview(selectedAsset) ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#FBF1E0] px-2 py-1 text-[10px] font-semibold text-[#7A520F]">
                            <ShieldCheck className="h-3 w-3" />
                            담당자 확인 필요
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#ECFDF5] px-2 py-1 text-[10px] font-semibold text-[#084734]">
                            <CheckCircle2 className="h-3 w-3" />
                            확인 완료
                          </span>
                        )}
                      </div>
                      <div className="grid gap-4 p-4 sm:grid-cols-[120px_minmax(0,1fr)]">
                        <div className="relative aspect-square overflow-hidden rounded-md border border-black/[0.08] bg-white">
                          {assetPreviewUrl(selectedAsset) ? (
                            <Image
                              src={assetPreviewUrl(selectedAsset) ?? ""}
                              alt={assetFileName(selectedAsset)}
                              fill
                              unoptimized
                              sizes="120px"
                              className="object-cover"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center text-[#A39E98]">
                              <ImageIcon className="h-6 w-6" />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A39E98]">AI 분석</p>
                          <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[#31302E]">
                            {assetAnalysis(selectedAsset)}
                          </p>
                          {selectedAsset.instruction ? (
                            <p className="mt-3 border-t border-black/[0.08] pt-3 text-[10px] leading-4 text-[#615D59]">
                              분석 요청 · {selectedAsset.instruction}
                            </p>
                          ) : null}
                          {assetNeedsHumanReview(selectedAsset)
                            && ["ready", "completed"].includes(assetAnalysisStatus(selectedAsset).toLowerCase()) ? (
                            <button
                              type="button"
                              onClick={() => void approveSelectedAsset()}
                              disabled={assetReviewingId === selectedAsset.id}
                              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-[#084734] px-3 text-[11px] font-semibold text-white hover:bg-[#065C41] disabled:opacity-50"
                            >
                              {assetReviewingId === selectedAsset.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              분석 확인
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </div>

          <form onSubmit={submitQuestion} className="shrink-0 border-t border-black/[0.08] bg-white px-5 py-4 sm:px-7">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={handleAssetFiles}
              aria-label="CS 분석 이미지 첨부"
            />
            {pendingFiles.length > 0 || uploadingAssets || assetError ? (
              <div className={cn("mb-3", reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]")}>
                {pendingFiles.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {pendingFiles.map((file) => (
                      <div
                        key={fileKey(file)}
                        className="flex h-10 max-w-[220px] shrink-0 items-center gap-2 rounded-md border border-black/[0.08] bg-[#FAFAF8] px-2.5"
                      >
                        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-[#084734]" />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#31302E]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removePendingFile(file)}
                          disabled={uploadingAssets || isPending}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#A39E98] hover:bg-[#FCE9E9] hover:text-[#8F2C2C] disabled:opacity-40"
                          aria-label={`${file.name} 첨부 제거`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {uploadingAssets ? (
                  <p className="mt-2 flex items-center gap-2 text-[11px] text-[#084734]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    사진 분석 중 · {uploadProgress.current}/{uploadProgress.total}
                  </p>
                ) : null}
                {assetError ? (
                  <p className="mt-2 flex items-start gap-2 text-[11px] text-[#8F2C2C]" role="alert">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {assetError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className={cn(
              "flex items-end gap-3 rounded-lg border border-black/[0.16] bg-white px-4 py-3 focus-within:border-[#084734]/50 focus-within:ring-2 focus-within:ring-[#084734]/10",
              reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]"
            )}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={pendingFiles.length >= MAX_PENDING_ASSETS || uploadingAssets || isPending}
                className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#084734] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="사진 첨부 또는 촬영"
                title={`JPG, PNG, WebP · 최대 ${MAX_PENDING_ASSETS}장`}
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                rows={2}
                maxLength={1000}
                placeholder="내부 자료와 상담 맥락을 함께 질문하세요"
                className="max-h-32 min-h-12 flex-1 resize-none bg-transparent text-[14px] leading-6 text-[#31302E] outline-none placeholder:text-[#A39E98]"
              />
              <button
                type="submit"
                disabled={(!composer.trim() && pendingFiles.length === 0) || isPending || uploadingAssets}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#31302E] text-white transition-colors hover:bg-[#111110] disabled:cursor-not-allowed disabled:bg-[#D8D5D1]"
                aria-label="질문 보내기"
              >
                {isPending || uploadingAssets ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className={cn("mt-2 text-[10px] text-[#A39E98]", reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]")}>
              사진은 JPG·PNG·WebP 최대 3장 · AI 답변과 이미지 분석은 CS 담당자 승인 전 외부로 전달되지 않습니다.
            </p>
          </form>
        </div>
      ) : null}

      {activeTab === "queue" ? (
        <section className="min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="flex items-center justify-between px-5 py-6 sm:px-7">
            <div>
              <h2 className="text-[20px] font-semibold tracking-[-0.02em]">대기열</h2>
              <p className="mt-1 text-[12px] text-[#615D59]">검토와 담당자 판단이 필요한 내부 CS 대화입니다.</p>
            </div>
            <button
              type="button"
              onClick={startNewConversation}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#31302E] px-4 text-[12px] font-semibold text-white hover:bg-[#111110]"
            >
              <MessageSquare className="h-4 w-4" />
              새 대화
            </button>
          </div>
          <ConversationTable conversations={queueConversations} emptyLabel="대기 중인 대화가 없습니다." onSelect={(item) => void handleSelect(item)} />
        </section>
      ) : null}

      {activeTab === "archive" ? (
        <section className="min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="px-5 py-6 sm:px-7">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">아카이브</h2>
            <p className="mt-1 text-[12px] text-[#615D59]">종료 후 보관한 상담과 승인 이력을 다시 확인합니다.</p>
          </div>
          <ConversationTable conversations={archivedConversations} emptyLabel="아카이브한 대화가 없습니다." onSelect={(item) => void handleSelect(item)} />
        </section>
      ) : null}

      {activeTab === "tools" ? (
        <section className="min-h-0 flex-1 overflow-y-auto bg-[#FAFAF8] px-5 py-7 sm:px-8">
          <div className="mx-auto max-w-[900px]">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">기존 챗봇 운영 도구</h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#615D59]">
              게시·동기화·재색인 같은 변경 작업은 기존 관리자 화면에서 CS 담당자가 최종 실행합니다.
              코파일럿은 운영 화면을 복제하지 않고 정확한 경로로 연결합니다.
            </p>

            <div className="mt-7 flex items-center justify-between gap-3">
              <h3 className="text-[12px] font-semibold text-[#31302E]">
                코파일럿 운영 지표 <span className="font-normal text-[#A39E98]">최근 7일</span>
              </h3>
              {metricsLoadState === "failed" ? (
                <button
                  type="button"
                  onClick={() => void loadCsMetrics()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-black/[0.08] px-2.5 text-[10px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
                >
                  <RefreshCcw className="h-3 w-3" />
                  다시 시도
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {metricCards.map((card) => (
                <MetricCard key={card.key} icon={card.icon} label={card.label} value={card.value} sub={card.sub} />
              ))}
            </div>

            <div className="mt-8 overflow-hidden rounded-lg border border-black/[0.08] bg-white">
              <div className="flex flex-wrap items-start gap-3 border-b border-black/[0.08] px-5 py-4">
                <span className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                  bridgeState.ready ? "bg-[#ECFDF5] text-[#084734]" : "bg-[#F6F5F4] text-[#615D59]"
                )}>
                  {integrationLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : bridgeState.ready ? (
                    <Wifi className="h-4 w-4" />
                  ) : (
                    <WifiOff className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-[#31302E]">{bridgeState.label}</h3>
                    <span className={cn(
                      "rounded-md px-2 py-1 text-[10px] font-semibold",
                      bridgeState.ready ? "bg-[#ECFDF5] text-[#084734]" : "bg-[#FBF1E0] text-[#7A520F]"
                    )}>
                      {integrationLoading ? "확인 중" : bridgeState.ready ? "연결됨" : bridgeState.configured ? bridgeState.status : "설정 필요"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-[#615D59]">{bridgeState.message}</p>
                  {bridgeState.lastCheckedAt ? (
                    <p className="mt-1 text-[10px] text-[#A39E98]">마지막 확인 {formatDay(bridgeState.lastCheckedAt)} {formatTime(bridgeState.lastCheckedAt)}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void loadIntegrationStatus()}
                  disabled={integrationLoading}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.08] px-2.5 text-[11px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E] disabled:opacity-40"
                >
                  <RefreshCcw className={cn("h-3.5 w-3.5", integrationLoading && "animate-spin")} />
                  상태 확인
                </button>
              </div>

              <div className="px-5 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-xl">
                    <p className="text-[12px] font-semibold text-[#31302E]">현재 대화를 내부 AI/MCP 분석으로 보내기</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#615D59]">
                      기본 전송은 메시지 맥락과 이미지 분석 텍스트만 포함합니다. 분석 결과는 검토 전 초안으로 돌아옵니다.
                    </p>
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] leading-5 text-[#615D59]">
                      <input
                        type="checkbox"
                        checked={includeOriginal}
                        onChange={(event) => setIncludeOriginal(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[#084734]"
                      />
                      <span>
                        원본 이미지도 포함
                        <span className="block text-[10px] text-[#A39E98]">민감정보 포함 가능성을 확인했으며 내부 분석 범위로 전송합니다.</span>
                      </span>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => void dispatchCurrentConversation()}
                    disabled={!hasDispatchContext || !bridgeState.ready || integrationLoading || dispatching}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#084734] px-4 text-[12px] font-semibold text-white hover:bg-[#065C41] disabled:cursor-not-allowed disabled:bg-[#A39E98]"
                  >
                    {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {dispatching ? "전송 중" : "현재 대화 보내기"}
                  </button>
                </div>
                {integrationError ? (
                  <p className="mt-3 flex items-start gap-2 rounded-md bg-[#FCE9E9] px-3 py-2 text-[11px] text-[#8F2C2C]" role="alert">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {integrationError}
                  </p>
                ) : null}
              </div>

              {integrationEvents.length > 0 ? (
                <div className="border-t border-black/[0.08] bg-[#FAFAF8] px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold text-[#31302E]">최근 연동 기록</p>
                    <span className="text-[10px] text-[#A39E98]">{integrationEvents.length}건</span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {integrationEvents.slice(0, 5).map((event) => {
                      const successful = ["sent", "success", "completed", "ok"].includes((event.status ?? "").toLowerCase())
                      return (
                        <li key={event.id} className="flex items-start gap-3 rounded-md border border-black/[0.08] bg-white px-3 py-2.5">
                          {successful ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#A8741A]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-semibold text-[#31302E]">
                              {event.transport ?? event.integration ?? event.source_system ?? "AI 브리지"} · {event.status ?? "처리 중"}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[#615D59]">{integrationEventSummary(event)}</p>
                          </div>
                          <span className="shrink-0 text-[10px] text-[#A39E98]">{formatTime(integrationEventWhen(event))}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
            </div>

            <h3 className="mt-8 text-[12px] font-semibold text-[#31302E]">운영 화면 바로가기</h3>
            <div className="mt-3 overflow-hidden rounded-lg border border-black/[0.08] bg-white">
              <Link
                href={DOCS_GAPS_FALLBACK_TOOL.href}
                className="group flex items-center gap-4 border-b border-black/[0.08] px-5 py-4 last:border-b-0 hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F6F5F4] text-[#31302E] group-hover:bg-[#ECFDF5] group-hover:text-[#084734]">
                  <DOCS_GAPS_FALLBACK_TOOL.icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-[#31302E]">{DOCS_GAPS_FALLBACK_TOOL.title}</span>
                    <span className="text-[10px] font-medium text-[#A39E98]">{DOCS_GAPS_FALLBACK_TOOL.priority}</span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-5 text-[#615D59]">
                    {docsGapsSummary
                      ? `챗봇 ${docsGapsSummary.chatbot} · 내부CS ${docsGapsSummary.internalCs}${docsGapsSummary.capped ? "+" : ""}`
                      : DOCS_GAPS_FALLBACK_TOOL.description}
                  </span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-[#A39E98] group-hover:text-[#084734]" />
              </Link>
              {OPERATING_TOOLS.map((tool) => {
                const Icon = tool.icon
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className="group flex items-center gap-4 border-b border-black/[0.08] px-5 py-4 last:border-b-0 hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F6F5F4] text-[#31302E] group-hover:bg-[#ECFDF5] group-hover:text-[#084734]">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#31302E]">{tool.title}</span>
                        <span className="text-[10px] font-medium text-[#A39E98]">{tool.priority}</span>
                      </span>
                      <span className="mt-1 block text-[12px] leading-5 text-[#615D59]">{tool.description}</span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-[#A39E98] group-hover:text-[#084734]" />
                  </Link>
                )
              })}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-[12px] font-semibold text-[#31302E]">
                <span>회귀 검수 대기</span>
                {regressionLoadState === "loaded" ? (
                  <span className="text-[10px] font-medium text-[#A39E98]">{regressionCandidates.length}건</span>
                ) : null}
              </h3>
              <button
                type="button"
                onClick={() => void runRegressionAutoEval()}
                disabled={
                  regressionEvalRunState === "running" || regressionLoadState !== "loaded" || regressionCandidates.length === 0
                }
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-black/[0.08] px-2.5 text-[10px] font-semibold text-[#084734] hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:text-[#A39E98] disabled:hover:bg-transparent"
              >
                {regressionEvalRunState === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {regressionEvalRunState === "running" ? "평가 중" : "자동 평가 실행"}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-[#A39E98]">
              AI가 통과 / 수정 필요를 참고용으로만 제안합니다. 실제 판정은 아래 버튼으로 직접 확정해야 저장됩니다.
            </p>
            {regressionEvalError ? (
              <p className="mt-1.5 flex items-start gap-2 text-[11px] text-[#8F2C2C]" role="alert">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {regressionEvalError}
              </p>
            ) : null}
            <div className="mt-3 overflow-hidden rounded-lg border border-black/[0.08] bg-white">
              {regressionLoadState === "idle" || regressionLoadState === "loading" ? (
                <div className="flex items-center justify-center gap-2 px-5 py-8 text-[12px] text-[#615D59]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  회귀 후보를 불러오는 중입니다.
                </div>
              ) : regressionLoadState === "failed" ? (
                <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
                  <p className="text-[12px] text-[#615D59]">회귀 후보 목록을 불러오지 못했습니다.</p>
                  <button
                    type="button"
                    onClick={() => void loadRegressionCandidates()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.08] px-3 text-[11px] font-semibold text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#31302E]"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    다시 시도
                  </button>
                </div>
              ) : regressionCandidates.length === 0 ? (
                <p className="px-5 py-8 text-center text-[12px] text-[#615D59]">판정이 필요한 회귀 후보가 없습니다.</p>
              ) : (
                <ul>
                  {regressionCandidates.map((item) => {
                    const suggestion = regressionSuggestions[item.id]
                    return (
                      <li
                        key={item.id}
                        className="flex flex-col gap-3 border-b border-black/[0.08] px-5 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[12px] leading-5 text-[#31302E]">{item.excerpt}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-[#A39E98]">
                            <span>{formatDay(item.capturedAt)} {formatTime(item.capturedAt)}</span>
                            <button
                              type="button"
                              onClick={() => openConversationById(item.conversationId)}
                              className="inline-flex items-center gap-1 font-semibold text-[#084734] hover:underline"
                            >
                              대화 보기
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </div>
                          {suggestion ? (
                            <div className="mt-2">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                  suggestion.suggestedOutcome === "pass"
                                    ? "bg-[#ECFDF5] text-[#084734]"
                                    : "bg-[#FBF1E0] text-[#7A520F]"
                                )}
                              >
                                {suggestion.suggestedOutcome === "pass" ? "제안: 통과" : "제안: 수정 필요"}
                              </span>
                              <details className="mt-1">
                                <summary className="cursor-pointer text-[10px] font-medium text-[#084734] hover:underline">
                                  AI 판단 근거
                                </summary>
                                <p className="mt-1 max-w-[420px] text-[10px] leading-4 text-[#615D59]">
                                  {suggestion.rationale}
                                </p>
                              </details>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                          <div className="flex flex-wrap gap-1.5">
                            {REGRESSION_OUTCOME_ACTIONS.map((action) => (
                              <button
                                key={action.value}
                                type="button"
                                onClick={() => void judgeRegressionCandidate(item, action.value)}
                                className="inline-flex h-7 items-center rounded-md border border-black/[0.08] px-2.5 text-[10px] font-semibold text-[#31302E] hover:bg-[#F6F5F4]"
                                aria-label={`${action.label}: ${item.excerpt}`}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                          {item.reviewState === "approved" ? (
                            <PromoteKnowledgeControl
                              pending={promotingMessageId === item.id}
                              result={promotionResults[item.id]}
                              onPromote={() => void promoteMessageToKnowledge(item.id)}
                            />
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            {regressionEvalSkippedSummary ? (
              <p className="mt-2 flex items-start gap-2 text-[11px] text-[#7A520F]" role="status">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {regressionEvalSkippedSummary}
              </p>
            ) : null}
            {regressionError ? (
              <p className="mt-2 flex items-start gap-2 text-[11px] text-[#8F2C2C]" role="alert">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {regressionError}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {reviewOpen ? (
        <>
          <button
            type="button"
            className="absolute inset-x-0 top-32 bottom-0 z-30 bg-black/10 xl:hidden"
            onClick={() => setReviewOpen(false)}
            aria-label="검토 패널 닫기"
          />
          <aside className="absolute top-16 right-0 bottom-0 z-40 flex w-full max-w-[438px] flex-col border-l border-black/[0.08] bg-white shadow-[-14px_0_36px_rgba(0,0,0,0.06)]">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-black/[0.08] px-5">
              <div>
                <h2 className="text-[16px] font-semibold">검토</h2>
                <p className="mt-0.5 text-[10px] text-[#A39E98]">최종 판단은 CS 담당자에게 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#F6F5F4]"
                aria-label="검토 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="divide-y divide-black/[0.08] border-b border-black/[0.08]">
                {([
                  ["customer", "고객 맥락 확인", "요청 내용과 계정·계약·장비 조건을 확인했습니다.", UserRound],
                  ["evidence", "정본 근거 확인", "공개 가이드와 내부 정본의 적용 범위를 확인했습니다.", BookOpen],
                  ["externalScope", "외부 전달 범위 확인", "본사 확인 필요 여부와 공개 가능한 범위를 판단했습니다.", ExternalLink],
                ] as const).map(([key, title, description, Icon]) => (
                  <label key={key} className="flex cursor-pointer items-start gap-3 px-5 py-4 hover:bg-[#FAFAF8]">
                    <input
                      type="checkbox"
                      checked={reviewChecks[key]}
                      onChange={(event) => setReviewChecks((current) => ({ ...current, [key]: event.target.checked }))}
                      className="mt-1 h-4 w-4 shrink-0 accent-[#084734]"
                    />
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F6F5F4] text-[#615D59]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-[13px] font-semibold text-[#31302E]">{title}</span>
                      <span className="mt-1 block text-[11px] leading-4 text-[#615D59]">{description}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="internal-cs-final-answer" className="text-[13px] font-semibold">최종 답변</label>
                  <span className="text-[10px] text-[#A39E98]">외부 전달용</span>
                </div>
                <textarea
                  id="internal-cs-final-answer"
                  value={finalDraft}
                  onChange={(event) => setFinalDraft(event.target.value)}
                  rows={12}
                  className="mt-3 w-full resize-y rounded-md border border-black/[0.16] bg-white px-3 py-3 text-[12px] leading-5 text-[#31302E] outline-none focus:border-[#084734]/50 focus:ring-2 focus:ring-[#084734]/10"
                  placeholder="AI 초안을 검토하고 최종 답변으로 다듬어 주세요."
                />
                <div className="mt-4">
                  <label htmlFor="internal-cs-review-note" className="text-[12px] font-semibold text-[#31302E]">검토 메모</label>
                  <textarea
                    id="internal-cs-review-note"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-md border border-black/[0.12] px-3 py-2 text-[12px] leading-5 outline-none focus:border-[#084734]/50 focus:ring-2 focus:ring-[#084734]/10"
                    placeholder="수정 이유나 본사 확인 항목을 남기세요."
                  />
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-2 text-[11px] leading-4 text-[#615D59]">
                  <input
                    type="checkbox"
                    checked={regressionCandidate}
                    onChange={(event) => setRegressionCandidate(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#084734]"
                  />
                  수정 결과를 회귀 개선 후보에 포함합니다.
                </label>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] leading-4 text-[#615D59]">
                  <input
                    type="checkbox"
                    checked={excludeFromGapQueue}
                    onChange={(event) => setExcludeFromGapQueue(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#084734]"
                  />
                  <span>
                    보강 큐 제외
                    <span className="mt-1 block text-[#A39E98]">체크하면 수정 요청 시 이 질문을 문서 보강 큐로 자동 유입하지 않습니다.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="shrink-0 border-t border-black/[0.08] bg-white p-5">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => submitReview("changes_requested")}
                  disabled={!pendingMessage || isPending}
                  className="h-10 rounded-md border border-black/[0.16] bg-white text-[12px] font-semibold hover:bg-[#F6F5F4] disabled:opacity-40"
                >
                  수정 요청
                </button>
                <button
                  type="button"
                  onClick={() => submitReview("approved")}
                  disabled={!canApprove || isPending}
                  className="h-10 rounded-md bg-[#084734] text-[12px] font-semibold text-white hover:bg-[#065C41] disabled:cursor-not-allowed disabled:bg-[#A39E98]"
                >
                  승인하고 복사
                </button>
              </div>
              <p className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-[#615D59]">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                승인하면 최종 답변으로 고정되고 클립보드에 복사됩니다. 자동 외부 전송은 하지 않습니다.
              </p>
            </div>
          </aside>
        </>
      ) : null}

      {detail ? (
        <div className="pointer-events-none absolute right-4 bottom-4 z-20 hidden gap-2 sm:flex">
          {detail.conversation.status === "archived" ? (
            <button
              type="button"
              onClick={reopenConversation}
              className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 text-[11px] font-semibold shadow-sm hover:bg-[#F6F5F4]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              다시 열기
            </button>
          ) : (
            <button
              type="button"
              onClick={archiveConversation}
              className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 text-[11px] font-semibold text-[#615D59] shadow-sm hover:bg-[#F6F5F4] hover:text-[#31302E]"
            >
              <Archive className="h-3.5 w-3.5" />
              아카이브
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

// useSearchParams()는 정적 렌더링 시 Suspense 경계를 요구한다. 페이지(app/admin/cs-chatbot/page.tsx)를
// 바꾸지 않고 이 컴포넌트 내부에서 해결한다.
function WorkspaceLoadingShell() {
  return (
    <div className="fixed inset-0 z-[80] flex h-[100dvh] items-center justify-center bg-white">
      <Loader2 className="h-5 w-5 animate-spin text-[#084734]" />
    </div>
  )
}

export default function InternalCsChatWorkspace() {
  return (
    <Suspense fallback={<WorkspaceLoadingShell />}>
      <InternalCsChatWorkspaceInner />
    </Suspense>
  )
}
