// 내부 CS 코파일럿 워크스페이스의 타입 정의.
// 이 파일은 아무것도 import하지 않는다 — 순환 import를 만들지 않기 위한 최하단 레이어다.

export type WorkspaceTab = "chat" | "queue" | "hq" | "tools"
export type ModelMode = "auto" | "fast" | "deep"
export type ConversationStatus = "queue" | "active" | "waiting_review" | "resolved" | "archived"
export type ConversationPriority = "low" | "normal" | "high" | "urgent"
export type ReviewState = "not_required" | "pending" | "approved" | "changes_requested" | "rejected"

export interface InternalCsConversation {
  id: string
  title: string
  status: ConversationStatus
  priority: ConversationPriority
  assignee_user_id: string | null
  assignee_name: string | null
  tags: string[]
  customer_context: Record<string, unknown>
  last_message_at: string | null
  // 목록 API는 select("*")라 두 시각이 모두 온다. 본사 확인 화면이 등록 시각(created_at)과
  // 대기 경과 근사(updated_at)를 각각 쓴다 — hq-desk.ts hqWaitingSince 주석 참조.
  created_at: string
  updated_at: string
  archive_reason: string | null
}

export interface InternalCsSourceRef {
  id: string
  label?: string
  kind?: "public_doc" | "internal_guide" | "curated_knowledge" | "internal_asset"
  verificationStatus?: "confirmed" | "conditional" | "conflicting_sources" | "hq_confirmation_required"
  externalUse?: "reviewed_summary_allowed" | "internal_only" | "confirmation_required"
  reviewState?: "pending" | "approved" | "changes_requested" | "rejected"
}

export interface InternalCsMessage {
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

export interface InternalCsAsset {
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

export interface InternalCsIntegrationEvent {
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

export interface ConversationListResponse {
  conversations: InternalCsConversation[]
  pagination: { total: number }
}

// GET /api/admin/docs/gaps — 클러스터별 metadata.source로 챗봇/내부CS 유입을 구분한다.
// 스탯 스트립 집계(summarizeDocsGaps)에 필요한 필드만 취한다.
export interface DocGapsSummaryResponse {
  gapClusters?: Array<{ metadata?: { source?: string } | null }> | null
  zeroResultSearches?: unknown[] | null
}

// GET /api/admin/cs-chat/regression-candidates — 회귀 후보(미판정 우선) 메시지 목록.
export type RegressionOutcome = "not_evaluated" | "pass" | "needs_fix" | "promoted" | "excluded"

export interface RegressionCandidateItem {
  id: string
  conversationId: string
  excerpt: string
  capturedAt: string
  outcome: RegressionOutcome
  reviewState: string
  // additive 필드 — 승격 자격(corrected_content 존재). 구응답에는 없을 수 있어 optional,
  // 부재 시(?? true) approved 휴리스틱만으로 승격 버튼을 노출해 하위호환한다.
  hasCorrectedContent?: boolean
}

export interface RegressionCandidatesResponse {
  items: RegressionCandidateItem[]
}

// 회귀 위젯과 지표 카드 행이 함께 쓰는 4단계 로드 상태 — idle→loading은 탭 진입 시 1회만 자동,
// failed 이후에는 수동 "다시 시도"로만 재조회한다(무한 재시도 루프 금지).
export type AsyncLoadState = "idle" | "loading" | "loaded" | "failed"

// GET /api/admin/cs-chat/metrics?days=7|30 — 계약 1. 분모 0이면 rate는 null.
export interface InternalCsMetricsResponse {
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
export interface RegressionEvalItem {
  messageId: string
  conversationId: string
  suggestedOutcome: "pass" | "needs_fix"
  rationale: string
  regeneratedExcerpt: string
  judgeModel: string
}

export interface RegressionEvalSkippedItem {
  messageId: string
  reason: string
}

export interface RegressionEvalResponse {
  items: RegressionEvalItem[]
  skipped: RegressionEvalSkippedItem[]
}

export type RegressionEvalRunState = "idle" | "running" | "done" | "failed"

// POST /api/admin/cs-chat/messages/[messageId]/promote-knowledge — 계약 3.
// 대상: review_state=approved && corrected_content 존재. 멱등 — 재승격 시 reused:true.
export interface PromoteKnowledgeResponse {
  articleId: string
  slug: string
  reused: boolean
  // additive — false면 문서는 저장됐지만 임베딩 실패로 검색 색인 대기 상태. true/부재는 정상.
  searchable?: boolean
}

// 회귀 패널 항목과 대화 스레드의 승인된 메시지, 두 노출 지점이 messageId로 결과를 공유한다.
export type PromotionResult =
  | { status: "success"; articleId: string; slug: string; reused: boolean; searchable?: boolean }
  | { status: "error"; error: string }

export interface ConversationDetailResponse {
  conversation: InternalCsConversation
  messages: InternalCsMessage[]
  assets?: InternalCsAsset[]
  integrationEvents?: InternalCsIntegrationEvent[]
}

export interface IntegrationStatusResponse {
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

export interface GenerateResponse {
  message: InternalCsMessage
  result: {
    mode: "fast" | "deep"
    model: string | null
    fallbackUsed: boolean
    userMessageSaved: boolean
    assistantMessageSaved: boolean
  }
}

export interface ReviewChecks {
  customer: boolean
  evidence: boolean
  externalScope: boolean
}
