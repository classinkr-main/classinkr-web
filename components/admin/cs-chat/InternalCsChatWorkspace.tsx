"use client"

import Link from "next/link"
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileCheck2,
  Headphones,
  HelpCircle,
  History,
  Loader2,
  LockKeyhole,
  MessageSquare,
  PanelRightOpen,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  UserRound,
  X,
} from "lucide-react"
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
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

interface ConversationListResponse {
  conversations: InternalCsConversation[]
  pagination: { total: number }
}

interface ConversationDetailResponse {
  conversation: InternalCsConversation
  messages: InternalCsMessage[]
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

const WORKSPACE_TABS: Array<{ value: WorkspaceTab; label: string }> = [
  { value: "chat", label: "대화" },
  { value: "queue", label: "대기열" },
  { value: "archive", label: "아카이브" },
  { value: "tools", label: "운영 도구" },
]

const OPERATING_TOOLS = [
  {
    href: "/admin/docs?tab=gaps",
    title: "문서 보강 · 회귀 검수",
    description: "반복·미해결 질문을 문서 초안과 회귀 평가로 연결합니다.",
    icon: Search,
    priority: "먼저 확인",
  },
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
    href: "/admin/chatbot",
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
  tags: ["billing", "hq_confirmation"],
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
    model_name: "gemini-3.5-flash",
    model_mode: "fast",
    source_refs: [
      { id: "/docs/getting-started/pre-adoption-checklist", label: "도입 전 확인 기준" },
      { id: "docs/active/classin-operating-canon-2026-07-02.md", label: "Classin 운영 정본" },
      { id: "docs/active/classin-pre-adoption-question-matrix-2026-06-18.md", label: "도입 전 질문·확인 단계" },
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

function normalizeSourceRefs(values: unknown[]): InternalCsSourceRef[] {
  return values.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    const source = value as Record<string, unknown>
    if (typeof source.id !== "string" || !source.id.trim()) return []
    return [{ id: source.id, label: typeof source.label === "string" ? source.label : undefined }]
  })
}

function sourceHref(source: InternalCsSourceRef) {
  if (source.id.startsWith("/")) return source.id.split("#")[0]
  if (source.id.startsWith("docs/")) return null
  return null
}

function buildHqTemplate(detail: ConversationDetailResponse | null) {
  if (!detail) return ""
  const lastQuestion = [...detail.messages].reverse().find((message) => message.role === "user")?.content
  return [
    `[KR-CS][${detail.conversation.priority.toUpperCase()}] ${detail.conversation.title}`,
    "",
    "1. Case",
    `- 내부 케이스 ID: ${detail.conversation.id}`,
    "- 제품·모델·세대·앱 버전: 확인 필요",
    "",
    "2. Impact",
    "- 영향 사용자·수업·기기 수: 확인 필요",
    "- 수업 차단 여부 / 고객 요구 시한: 확인 필요",
    "",
    "3. Question / Reproduction",
    `- ${lastQuestion ?? "질문과 재현 절차를 입력해 주세요."}`,
    "",
    "4. Korea checks",
    "- 이미 확인한 항목과 시도한 조치: 입력 필요",
    "",
    "5. Request to HQ",
    "- 적용 모델·시장·효력 발생일·근거 문서 버전을 포함해 확인 부탁드립니다.",
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

export default function InternalCsChatWorkspace() {
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
  const [expanded, setExpanded] = useState<"sources" | "hq" | "regression" | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [isPending, startTransition] = useTransition()

  const loadConversation = useCallback(async (id: string) => {
    if (demoMode && id === DEMO_CONVERSATION.id) {
      setDetail(DEMO_DETAIL)
      setSelectedId(id)
      setFinalDraft(DEMO_MESSAGES[1].content)
      setReviewChecks(INITIAL_CHECKS)
      setReviewNote("")
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
    return loaded
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
  const hqTemplate = useMemo(() => buildHqTemplate(detail), [detail])
  const canApprove = Object.values(reviewChecks).every(Boolean) && Boolean(pendingMessage) && finalDraft.trim().length > 0

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
    setReviewOpen(false)
    setExpanded(null)
    setNotice(null)
    setActiveTab("chat")
  }

  async function submitQuestion(event: FormEvent) {
    event.preventDefault()
    const question = composer.trim()
    if (!question || isPending) return

    setError(null)
    setNotice(null)
    setComposer("")
    if (demoMode) {
      const now = new Date().toISOString()
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
      }
      setDetail(nextDetail)
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
                                        const content = (
                                          <>
                                            <span className="min-w-0 flex-1 truncate">{source.label ?? source.id}</span>
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
                                  label="본사 확인 템플릿"
                                  open={expanded === "hq"}
                                  onToggle={() => setExpanded(expanded === "hq" ? null : "hq")}
                                >
                                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-black/[0.08] bg-white p-3 font-sans text-[12px] leading-5 text-[#31302E]">
                                    {hqTemplate}
                                  </pre>
                                  <button
                                    type="button"
                                    onClick={() => void copyText(hqTemplate, "본사 확인 템플릿을 복사했습니다.")}
                                    className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 text-[11px] font-semibold hover:bg-[#F6F5F4]"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                    템플릿 복사
                                  </button>
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
            </div>
          </div>

          <form onSubmit={submitQuestion} className="shrink-0 border-t border-black/[0.08] bg-white px-5 py-4 sm:px-7">
            <div className={cn(
              "flex items-end gap-3 rounded-lg border border-black/[0.16] bg-white px-4 py-3 focus-within:border-[#084734]/50 focus-within:ring-2 focus-within:ring-[#084734]/10",
              reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]"
            )}>
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
                disabled={!composer.trim() || isPending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#31302E] text-white transition-colors hover:bg-[#111110] disabled:cursor-not-allowed disabled:bg-[#D8D5D1]"
                aria-label="질문 보내기"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className={cn("mt-2 text-[10px] text-[#A39E98]", reviewOpen ? "max-w-none" : "mx-auto max-w-[980px]")}>
              AI 답변은 내부 검토용 초안이며 CS 담당자 승인 전에는 외부로 전달되지 않습니다.
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
            <div className="mt-7 overflow-hidden rounded-lg border border-black/[0.08] bg-white">
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
                  승인 후 전달
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
