"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Info,
  LineChart,
  Link2,
  Loader2,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  UserPlus,
  X,
} from "lucide-react"

import AdminTabs from "@/components/admin/AdminTabs"
import ChannelCauseReviewPanel from "@/components/admin/channel-talk/ChannelCauseReviewPanel"
import CsConsoleNav from "@/components/admin/cs/CsConsoleNav"
import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import {
  aggregateConversationTags,
  aggregateDailyActivity,
} from "@/lib/channel-talk-insights"
import {
  buildLeadPayloadFromConversation,
  buildPromotionPayload,
  isQuestionAlreadyPromoted,
  leadBoardDeepLink,
} from "@/lib/channel-talk-loop"
import { useUrlState } from "@/lib/use-url-state"
import { cn } from "@/lib/utils"

// 상담 목록 무한스크롤 대체 — 초기 50건, "더보기"로 50건씩 확장
const CONVERSATION_LIST_STEP = 50

const INBOX_SUBTABS = [
  { value: "conversations", label: "상담 대화", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { value: "trends", label: "유형 · 추이", icon: <LineChart className="h-3.5 w-3.5" /> },
  { value: "faq", label: "FAQ 후보", icon: <Sparkles className="h-3.5 w-3.5" /> },
] as const

type InboxSub = (typeof INBOX_SUBTABS)[number]["value"]

const DEFAULT_INBOX_SUB: InboxSub = "conversations"

type ConvState = "opened" | "closed" | "snoozed" | "unknown"

interface Conversation {
  id: string
  name?: string
  email?: string
  phone?: string
  state: ConvState
  tags: string[]
  messageCount: number
  firstQuestion?: string
  lastMessageText?: string
  lastMessageAt?: string
  matchedLeadId?: string
  matchedLeadOrg?: string
}

interface Stats {
  total: number
  byState: Record<ConvState, number>
  matchedLeads: number
  unmatched: number
  last7Days: number
}

interface ChannelData {
  configured: boolean
  conversations: Conversation[]
  stats: Stats
  lastSyncedAt?: string | null
  source?: "supabase" | "local_json"
}

interface FaqSuggestion {
  question: string
  count: number
  category?: string
  coveredByGoldenSet: boolean
  lastAskedAt?: string
  sampleConversationIds: string[]
  sampleQuestions?: string[]
}

const FAQ_CATEGORY_LABELS: Record<string, string> = {
  billing: "결제·요금",
  hardware: "하드웨어",
  troubleshooting: "장애·오류",
  onboarding: "도입·온보딩",
  admin: "관리자",
  classroom: "수업·운영",
  consultation: "상담",
  general: "일반",
}

function faqCategoryLabel(category?: string) {
  if (!category) return "일반"
  return FAQ_CATEGORY_LABELS[category] ?? "일반"
}

interface SyncResult {
  ok: boolean
  configured: boolean
  cached?: boolean
  locked?: boolean
  fetchedChats: number
  newConversations: number
  matchedLeads: number
  lastSyncedAt?: string | null
  messageFetches?: number
  reusedTranscripts?: number
  warning?: string
}

const STATE_LABEL: Record<ConvState, string> = {
  opened: "진행 중",
  closed: "종료",
  snoozed: "보류",
  unknown: "미상",
}

const STATE_BADGE: Record<ConvState, string> = {
  opened: "bg-[#ECFDF5] text-[#084734] border border-[#084734]/20",
  closed: "bg-[#F6F5F4] text-[#615D59] border border-black/[0.06]",
  snoozed: "bg-[#FBF1E0] text-[#7A520F] border border-[#A8741A]/20",
  unknown: "bg-[#F6F5F4] text-[#A39E98] border border-black/[0.06]",
}

function formatWhen(iso?: string | null) {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "방금 전"
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return date.toISOString().slice(0, 10)
}

function getInitialLetter(name?: string, fallback = "고"): string {
  if (!name || !name.trim()) return fallback
  const trimmed = name.trim()
  return trimmed[0] || fallback
}

/** 대화 상세 조회를 위한 메시지 타입 */
interface TranscriptMessage {
  id: string
  author: "customer" | "agent" | "bot"
  text: string
  at: string
}

function ChannelTalkInbox() {
  const [subParam, setSubParam] = useUrlState("sub", DEFAULT_INBOX_SUB)
  const activeSub: InboxSub = INBOX_SUBTABS.some((item) => item.value === subParam)
    ? (subParam as InboxSub)
    : DEFAULT_INBOX_SUB

  const searchParams = useSearchParams()
  const committedSearch = searchParams.toString()
  const lastCommittedSearch = useRef(committedSearch)
  useEffect(() => {
    if (lastCommittedSearch.current === committedSearch) return
    lastCommittedSearch.current = committedSearch
    if (new URLSearchParams(committedSearch).get("sub") === null) setSubParam(DEFAULT_INBOX_SUB)
  }, [committedSearch, setSubParam])

  const [data, setData] = useState<ChannelData | null>(null)
  const [suggestions, setSuggestions] = useState<FaqSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [existingPrompts, setExistingPrompts] = useState<string[]>([])
  const [promotingQuestion, setPromotingQuestion] = useState<string | null>(null)
  const [promoteErrors, setPromoteErrors] = useState<Record<string, string>>({})
  const [registeredLeads, setRegisteredLeads] = useState<Record<string, string>>({})
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({})
  const [expandedCauseReviewId, setExpandedCauseReviewId] = useState<string | null>(null)

  // Filters for conversation list
  const [searchQuery, setSearchQuery] = useState("")
  const [stateFilter, setStateFilter] = useState<"all" | ConvState>("all")
  const [tagFilter, setTagFilter] = useState<string | "all">("all")

  // Split View / Quick Chat Dialog State (대화 전문 보기)
  const [selectedChatConversation, setSelectedChatConversation] = useState<Conversation | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptMessages, setTranscriptMessages] = useState<TranscriptMessage[]>([])
  const [transcriptError, setTranscriptError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    setLoadError(null)
    const [main, mined, recommended] = await Promise.allSettled([
      adminFetchJsonCached<ChannelData>("/api/admin/channel-talk", undefined, {
        ttlMs: 60_000,
        force,
      }),
      adminFetchJsonCached<{ suggestions?: FaqSuggestion[] }>(
        "/api/admin/channel-talk/mine",
        undefined,
        { ttlMs: 60_000, force }
      ),
      adminFetchJsonCached<{ questions?: { prompt?: string }[] }>(
        "/api/admin/chatbot/recommended-questions?placement=starter&status=all",
        undefined,
        { ttlMs: 60_000, force }
      ),
    ])

    if (main.status === "fulfilled") setData(main.value)
    else setLoadError(main.reason instanceof Error ? main.reason.message : "상담 데이터를 불러오지 못했습니다.")
    if (mined.status === "fulfilled") setSuggestions(mined.value.suggestions ?? [])
    if (recommended.status === "fulfilled") {
      setExistingPrompts(
        (recommended.value.questions ?? [])
          .map((question) => question.prompt)
          .filter((prompt): prompt is string => typeof prompt === "string")
      )
    }
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // Load transcript messages when a conversation is selected for quick view
  const openChatModal = useCallback(async (conversation: Conversation) => {
    setSelectedChatConversation(conversation)
    setTranscriptLoading(true)
    setTranscriptError(null)
    setTranscriptMessages([])
    try {
      const res = await adminFetchJson<{ transcript?: TranscriptMessage[] }>(
        `/api/admin/channel-talk/conversations/${encodeURIComponent(conversation.id)}/cases`
      )
      setTranscriptMessages(res.transcript ?? [])
    } catch (err) {
      console.error("[ChannelTalkInbox] Failed to load transcript:", err)
      setTranscriptError(err instanceof Error ? err.message : "대화 내역을 불러오지 못했습니다.")
    } finally {
      setTranscriptLoading(false)
    }
  }, [])

  // FAQ 후보 → 챗봇 추천 질문 승격
  async function promoteSuggestion(suggestion: FaqSuggestion) {
    const key = suggestion.question
    setPromotingQuestion(key)
    setPromoteErrors((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    try {
      await adminFetchJson("/api/admin/chatbot/recommended-questions", {
        method: "POST",
        body: JSON.stringify(buildPromotionPayload(suggestion)),
      })
      setExistingPrompts((prev) => [...prev, suggestion.question])
    } catch (error) {
      setPromoteErrors((prev) => ({
        ...prev,
        [key]: error instanceof Error ? error.message : "추천 질문 승격에 실패했습니다.",
      }))
    } finally {
      setPromotingQuestion(null)
    }
  }

  // 미매칭 상담 → CRM 리드 등록
  async function registerConversationAsLead(conversation: Conversation) {
    const payload = buildLeadPayloadFromConversation(conversation)
    if (!payload) {
      setRegisterErrors((prev) => ({
        ...prev,
        [conversation.id]: "이름·이메일·전화 중 하나는 있어야 리드로 등록할 수 있습니다.",
      }))
      return
    }
    setRegisteringId(conversation.id)
    setRegisterErrors((prev) => {
      if (!(conversation.id in prev)) return prev
      const next = { ...prev }
      delete next[conversation.id]
      return next
    })
    try {
      const result = await adminFetchJson<{ created: number; firstId: string | null }>(
        "/api/admin/leads",
        { method: "POST", body: JSON.stringify(payload) }
      )
      const firstId = result.created > 0 ? result.firstId : null
      if (!firstId) {
        throw new Error("리드 등록에 실패했습니다.")
      }
      setRegisteredLeads((prev) => ({ ...prev, [conversation.id]: firstId }))
    } catch (error) {
      setRegisterErrors((prev) => ({
        ...prev,
        [conversation.id]: error instanceof Error ? error.message : "리드 등록에 실패했습니다.",
      }))
    } finally {
      setRegisteringId(null)
    }
  }

  const isUnconfigured = data?.configured === false

  async function runSync(force = false) {
    if (isUnconfigured) {
      setNotice("채널톡 Open API 키 설정 후 동기화할 수 있습니다.")
      return
    }

    setSyncing(true)
    setNotice(null)
    try {
      const result = await adminFetchJson<SyncResult>("/api/admin/channel-talk/sync", {
        method: "POST",
        body: JSON.stringify({ force, limit: 50 }),
      })
      if (!result.configured) {
        setNotice(result.warning ?? "채널톡 Open API 키가 설정되지 않았습니다.")
      } else if (!result.ok) {
        setNotice(result.warning ?? "동기화에 실패했습니다.")
      } else if (result.cached) {
        setNotice(
          result.warning ??
            `최근 동기화 결과를 사용했습니다. 마지막 동기화: ${formatWhen(result.lastSyncedAt ?? undefined)}`
        )
      } else {
        setNotice(
          `동기화 완료 · 대화 ${result.fetchedChats}건 · 신규 ${result.newConversations}건 · CRM 매칭 ${result.matchedLeads}건 · 메시지 요청 ${result.messageFetches ?? result.fetchedChats}건 · 재사용 ${result.reusedTranscripts ?? 0}건`
        )
      }
      await load(true)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "동기화 요청 실패")
    } finally {
      setSyncing(false)
    }
  }

  const stats = data?.stats
  const rawConversations = useMemo(() => data?.conversations ?? [], [data?.conversations])

  // Extract all unique tags (민재님 CS 태그 포함)
  const uniqueTags = useMemo(() => {
    const set = new Set<string>()
    rawConversations.forEach((c) => {
      ;(c.tags ?? []).forEach((t) => set.add(t))
    })
    return Array.from(set)
  }, [rawConversations])

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return rawConversations.filter((c) => {
      if (stateFilter !== "all" && c.state !== stateFilter) return false
      if (tagFilter !== "all" && !(c.tags ?? []).includes(tagFilter)) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = c.name?.toLowerCase().includes(q)
        const matchPhone = c.phone?.toLowerCase().includes(q)
        const matchEmail = c.email?.toLowerCase().includes(q)
        const matchOrg = c.matchedLeadOrg?.toLowerCase().includes(q)
        const matchFirstQ = c.firstQuestion?.toLowerCase().includes(q)
        const matchLastM = c.lastMessageText?.toLowerCase().includes(q)
        const matchTag = (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
        if (!matchName && !matchPhone && !matchEmail && !matchOrg && !matchFirstQ && !matchLastM && !matchTag) {
          return false
        }
      }
      return true
    })
  }, [rawConversations, stateFilter, tagFilter, searchQuery])

  const {
    visible: visibleConversations,
    showMore: showMoreConversations,
    collapse: collapseConversations,
    canMore: canMoreConversations,
    canCollapse: canCollapseConversations,
  } = useVisibleCount(filteredConversations.length, CONVERSATION_LIST_STEP)

  // 통계 패널 — 유형(태그) 분포와 최근 14일 응답 추이
  const tagDistribution = useMemo(() => aggregateConversationTags(rawConversations, 8), [rawConversations])
  const untaggedCount = useMemo(
    () => rawConversations.filter((conversation) => (conversation.tags ?? []).length === 0).length,
    [rawConversations]
  )
  const dailyActivity = useMemo(() => aggregateDailyActivity(rawConversations, 14), [rawConversations])
  const activityTotals = useMemo(
    () =>
      dailyActivity.reduce(
        (acc, day) => ({
          conversations: acc.conversations + day.conversations,
          messages: acc.messages + day.messages,
        }),
        { conversations: 0, messages: 0 }
      ),
    [dailyActivity]
  )
  const maxTagCount = tagDistribution[0]?.count ?? 0
  const maxDailyConversations = Math.max(1, ...dailyActivity.map((day) => day.conversations))

  // CRM Match percentage
  const matchRate = stats?.total && stats.total > 0
    ? Math.round((stats.matchedLeads / stats.total) * 100)
    : 0

  return (
    <>
      <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-24 lg:px-8">
        {/* =========================================================================
            HEADER: 채널톡 실시간 상담 관리 & 액션 툴바
            ========================================================================= */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-black/[0.06] pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#111110]">채널톡 상담 Inbox</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#084734]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#084734]" />
                실시간 동기화
              </span>
              <span className="text-xs text-[#A39E98] tabular-nums">
                마지막 동기화: {formatWhen(data?.lastSyncedAt)}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#615D59]">
              민재님 CS 태그 분류 및 AI 자동 분류 · CRM 리드 파이프라인 연계 · 챗봇 FAQ 플라이휠
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runSync()}
              disabled={syncing || loading || isUnconfigured}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#084734] px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#065c41] disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              <span>{syncing ? "동기화 중…" : isUnconfigured ? "설정 필요" : "지금 동기화"}</span>
            </button>

            <button
              type="button"
              onClick={() => void runSync(true)}
              disabled={syncing || loading || isUnconfigured}
              className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-[#615D59] shadow-2xs transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] disabled:opacity-50"
              title="강제 갱신"
            >
              <RefreshCw className="h-3 w-3" />
              <span>강제 갱신</span>
            </button>

            <a
              href="https://desk.channel.io"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-[#111110] shadow-2xs transition-colors hover:bg-[#F6F5F4]"
            >
              <span>채널톡 데스크</span>
              <ExternalLink className="h-3 w-3 text-[#A39E98]" />
            </a>
          </div>
        </div>

        {/* Notices & Alerts */}
        {isUnconfigured ? (
          <div className="mb-6 flex items-start gap-3 rounded-[12px] border border-[#ECD29C] bg-[#FBF1E0] px-4 py-3 text-xs text-[#7A520F]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              채널톡 Open API 키(CHANNEL_TALK_ACCESS_KEY)가 없어 인바운드 동기화가 비활성 상태입니다. 서버 <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px]">.env.local</code>에 키를 추가하세요.
            </p>
          </div>
        ) : null}

        {loadError ? (
          <div className="mb-6 flex items-start gap-3 rounded-[12px] border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-xs text-[#8F2C2C]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>상담 데이터를 불러오지 못했습니다. {loadError}</p>
          </div>
        ) : null}

        {notice ? (
          <div className="mb-6 flex items-center justify-between rounded-[12px] border border-black/[0.08] bg-[#F6F5F4] px-4 py-3 text-xs text-[#31302E]">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-[#084734]" />
              <p>{notice}</p>
            </div>
            <button type="button" onClick={() => setNotice(null)} className="text-[11px] font-semibold underline">
              닫기
            </button>
          </div>
        ) : null}

        {/* =========================================================================
            KPI METRIC STRIP (4대 현대적 지표 카드)
            ========================================================================= */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
          {/* Card 1: 전체 상담 */}
          <div className="rounded-[16px] border border-black/[0.08] bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between text-[#615D59]">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#A39E98]">
                전체 상담
              </span>
              <MessageSquare className="h-4 w-4 text-[#FF6B00]" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[#111110] tabular-nums">
              {stats?.total ?? 0}건
            </p>
            <p className="mt-1 text-[11px] text-[#615D59]">
              최근 7일 유입: <span className="font-semibold text-[#111110] tabular-nums">{stats?.last7Days ?? 0}건</span>
            </p>
          </div>

          {/* Card 2: 진행 중 */}
          <div className="rounded-[16px] border border-[#084734]/20 bg-[#ECFDF5]/30 p-4 shadow-2xs">
            <div className="flex items-center justify-between text-[#084734]">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#084734]">
                진행 중 상담
              </span>
              <Clock className="h-4 w-4 text-[#084734]" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[#084734] tabular-nums">
              {stats?.byState.opened ?? 0}건
            </p>
            <p className="mt-1 text-[11px] text-[#615D59]">
              종료 {stats?.byState.closed ?? 0}건 · 보류 {stats?.byState.snoozed ?? 0}건
            </p>
          </div>

          {/* Card 3: CRM 리드 매칭 */}
          <div className="rounded-[16px] border border-black/[0.08] bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between text-[#615D59]">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#A39E98]">
                CRM 리드 매칭
              </span>
              <Link2 className="h-4 w-4 text-[#084734]" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[#111110] tabular-nums">
              {stats?.matchedLeads ?? 0}건
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                <div className="h-full rounded-full bg-[#084734]" style={{ width: `${matchRate}%` }} />
              </div>
              <span className="text-[10.5px] font-bold text-[#084734] tabular-nums">{matchRate}%</span>
            </div>
          </div>

          {/* Card 4: 챗봇 FAQ 후보 */}
          <div className="rounded-[16px] border border-black/[0.08] bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between text-[#615D59]">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#A39E98]">
                챗봇 FAQ 후보
              </span>
              <Sparkles className="h-4 w-4 text-[#D4537E]" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[#111110] tabular-nums">
              {suggestions.length}건
            </p>
            <p className="mt-1 text-[11px] text-[#615D59]">
              골든셋 미커버 반복 질문 승격 대기
            </p>
          </div>
        </div>

        {/* =========================================================================
            SUBTABS: 상담 대화 | 유형 · 추이 | FAQ 후보
            ========================================================================= */}
        <div className="mb-5">
          <AdminTabs
            items={INBOX_SUBTABS.map((item) => ({
              ...item,
              badge:
                item.value === "faq" && suggestions.length > 0 ? suggestions.length : undefined,
            }))}
            value={activeSub}
            onValueChange={(next) => setSubParam(next)}
            label="상담 Inbox 하위 화면"
            variant="subtle"
          />
        </div>

        {/* =========================================================================
            TAB 1. sub=conversations (상담 대화 피드 & 멀티 필터)
            ========================================================================= */}
        {activeSub === "conversations" ? (
          <div>
            {/* Filter Toolbar: Search + State Pills + Tag Pills */}
            <div className="mb-4 rounded-[16px] border border-black/[0.08] bg-white p-4 shadow-2xs space-y-3">
              {/* Top Row: Search & Status Filter */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Search Box */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="고객명, 연락처, 기관, 대화 내용, 태그 검색..."
                    className="w-full rounded-full border border-black/[0.08] bg-[#FAFAF8] py-1.5 pl-8 pr-3 text-xs text-[#111110] placeholder:text-[#A39E98] focus:border-[#084734] focus:bg-white focus:outline-hidden"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A39E98] hover:text-[#111110]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                {/* State Filter Pills */}
                <div className="flex items-center gap-1 rounded-full border border-black/[0.08] bg-[#F6F5F4] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setStateFilter("all")}
                    className={cn(
                      "rounded-full px-3 py-1 font-semibold transition-colors",
                      stateFilter === "all"
                        ? "bg-white text-[#111110] shadow-2xs"
                        : "text-[#615D59] hover:text-[#111110]"
                    )}
                  >
                    전체 ({rawConversations.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStateFilter("opened")}
                    className={cn(
                      "rounded-full px-3 py-1 font-semibold transition-colors",
                      stateFilter === "opened"
                        ? "bg-[#084734] text-white"
                        : "text-[#615D59] hover:text-[#111110]"
                    )}
                  >
                    진행 중 ({stats?.byState.opened ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStateFilter("closed")}
                    className={cn(
                      "rounded-full px-3 py-1 font-semibold transition-colors",
                      stateFilter === "closed"
                        ? "bg-white text-[#111110] shadow-2xs"
                        : "text-[#615D59] hover:text-[#111110]"
                    )}
                  >
                    종료 ({stats?.byState.closed ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStateFilter("snoozed")}
                    className={cn(
                      "rounded-full px-3 py-1 font-semibold transition-colors",
                      stateFilter === "snoozed"
                        ? "bg-[#A8741A] text-white"
                        : "text-[#615D59] hover:text-[#111110]"
                    )}
                  >
                    보류 ({stats?.byState.snoozed ?? 0})
                  </button>
                </div>
              </div>

              {/* Bottom Row: 민재님 CS 태그 필터 알약 밴드 */}
              {uniqueTags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-black/[0.04] pt-3 text-xs">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-[#A39E98] mr-1">
                    <Tag className="h-3 w-3" />
                    <span>CS 태그:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTagFilter("all")}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                      tagFilter === "all"
                        ? "bg-[#111110] text-white"
                        : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
                    )}
                  >
                    전체
                  </button>
                  {uniqueTags.map((tag) => {
                    const count = rawConversations.filter((c) => (c.tags ?? []).includes(tag)).length
                    const isSelected = tagFilter === tag
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setTagFilter(isSelected ? "all" : tag)}
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                          isSelected
                            ? "bg-[#084734] text-white"
                            : "bg-[#FAFAF8] text-[#615D59] border border-black/[0.06] hover:bg-[#F6F5F4] hover:text-[#111110]"
                        )}
                      >
                        {tag} <span className="text-[10px] opacity-70">({count})</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>

            {/* Conversation Feed List */}
            {loading ? (
              <div className="rounded-[16px] border border-black/[0.08] bg-white p-12 text-center text-xs text-[#A39E98]">
                상담 대화 데이터를 불러오는 중입니다...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="rounded-[16px] border border-black/[0.08] bg-white p-12 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-[#084734]" />
                <p className="mt-2 text-sm font-bold text-[#111110]">해당 조건의 상담 대화가 없습니다.</p>
                <p className="mt-0.5 text-xs text-[#615D59]">검색어나 필터 조건을 변경해 보세요.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredConversations.slice(0, visibleConversations).map((conversation) => {
                  const registeredLeadId = registeredLeads[conversation.id]
                  const canRegister = Boolean(conversation.name || conversation.email || conversation.phone)
                  const registerBusy = registeringId === conversation.id
                  const registerError = registerErrors[conversation.id]
                  const causeReviewOpen = expandedCauseReviewId === conversation.id

                  return (
                    <div
                      key={conversation.id}
                      className="rounded-[16px] border border-black/[0.08] bg-white p-4 shadow-2xs transition-all hover:border-black/[0.16]"
                    >
                      {/* Top Header Row */}
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2.5">
                          {/* Avatar Initials */}
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ECFDF5] font-bold text-[#084734] text-xs">
                            {getInitialLetter(conversation.name)}
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-bold text-[#111110]">
                                {conversation.name || "익명 고객"}
                              </span>
                              {conversation.matchedLeadOrg ? (
                                <span className="text-xs font-medium text-[#615D59]">
                                  ({conversation.matchedLeadOrg})
                                </span>
                              ) : null}

                              {/* State Badge */}
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", STATE_BADGE[conversation.state])}>
                                {STATE_LABEL[conversation.state]}
                              </span>

                              {/* 민재님 CS 태그 칩들 */}
                              {(conversation.tags ?? []).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-[#FAFAF8] px-2 py-0.5 text-[10.5px] font-semibold text-[#615D59] border border-black/[0.06]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>

                            {/* Contact Sub-info */}
                            <div className="flex items-center gap-2 text-[11px] text-[#A39E98] mt-0.5">
                              {conversation.phone ? <span>{conversation.phone}</span> : null}
                              {conversation.email ? <span>• {conversation.email}</span> : null}
                            </div>
                          </div>
                        </div>

                        {/* Right Action & Timing */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-[11px] text-[#A39E98] tabular-nums">
                            {conversation.messageCount}개 메시지 · {formatWhen(conversation.lastMessageAt)}
                          </span>

                          {/* Quick Chat View Modal Trigger */}
                          <button
                            type="button"
                            onClick={() => void openChatModal(conversation)}
                            className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111110] shadow-2xs hover:bg-[#F6F5F4]"
                          >
                            <MessageCircle className="h-3 w-3 text-[#084734]" />
                            <span>대화 전문</span>
                          </button>

                          {/* Cause Review Toggle */}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCauseReviewId((current) =>
                                current === conversation.id ? null : conversation.id
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#615D59] shadow-2xs hover:bg-[#F6F5F4] hover:text-[#111110]"
                          >
                            <span>원인 검토</span>
                            {causeReviewOpen ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Conversation Bubble Excerpt */}
                      <div className="mt-3 space-y-1.5 rounded-[12px] bg-[#FAFAF8] p-3 text-xs border border-black/[0.04]">
                        {conversation.firstQuestion ? (
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 font-semibold text-[#084734]">고객:</span>
                            <p className="line-clamp-2 text-[#31302E]">
                              “{conversation.firstQuestion}”
                            </p>
                          </div>
                        ) : null}

                        {conversation.lastMessageText ? (
                          <div className="flex items-start gap-2 border-t border-black/[0.04] pt-1.5 text-[11.5px] text-[#615D59]">
                            <span className="shrink-0 font-semibold text-[#A39E98]">최근:</span>
                            <p className="line-clamp-1">{conversation.lastMessageText}</p>
                          </div>
                        ) : null}
                      </div>

                      {/* Bottom CRM Registration Row */}
                      <div className="mt-3 flex items-center justify-between border-t border-black/[0.04] pt-2.5 text-xs">
                        <div className="text-[11px] text-[#A39E98]">
                          담당자 배정: <span className="font-semibold text-[#111110]">김민재 매니저 (CS/Ops)</span>
                        </div>

                        <div>
                          {conversation.matchedLeadId ? (
                            <a
                              href={leadBoardDeepLink(conversation.matchedLeadId)}
                              className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#084734] hover:underline"
                            >
                              <Link2 className="h-3 w-3" />
                              <span>CRM 매칭: {conversation.matchedLeadOrg || "리드 보드 보기"} ↗</span>
                            </a>
                          ) : registeredLeadId ? (
                            <a
                              href={leadBoardDeepLink(registeredLeadId)}
                              className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#084734] hover:underline"
                            >
                              <Check className="h-3 w-3" />
                              <span>리드 등록 완료 · 보드에서 보기</span>
                            </a>
                          ) : canRegister ? (
                            <button
                              type="button"
                              onClick={() => void registerConversationAsLead(conversation)}
                              disabled={registerBusy}
                              className="inline-flex items-center gap-1 rounded-full bg-[#084734] px-3 py-1 text-[11px] font-bold text-white shadow-2xs transition-colors hover:bg-[#065c41] disabled:opacity-50"
                            >
                              {registerBusy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <UserPlus className="h-3 w-3" />
                              )}
                              <span>+ CRM 리드로 등록</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#A39E98]">연락처 미등록 (리드 전환 불가)</span>
                          )}

                          {registerError ? (
                            <span className="ml-2 text-[11px] text-[#8F2C2C]">{registerError}</span>
                          ) : null}
                        </div>
                      </div>

                      {/* Expandable Cause Review Panel */}
                      {causeReviewOpen ? (
                        <div className="mt-4 border-t border-black/[0.08] pt-3">
                          <ChannelCauseReviewPanel conversationId={conversation.id} />
                        </div>
                      ) : null}
                    </div>
                  )
                })}

                {/* Show More Pagination */}
                {(canMoreConversations || canCollapseConversations) && (
                  <div className="flex flex-col items-center gap-2 rounded-[16px] border border-black/[0.08] bg-white p-4">
                    <p className="text-[11px] font-medium tabular-nums text-[#A39E98]">
                      {visibleConversations.toLocaleString("ko-KR")} / 총{" "}
                      {filteredConversations.length.toLocaleString("ko-KR")}건 표시
                    </p>
                    <ShowMore
                      visible={visibleConversations}
                      total={filteredConversations.length}
                      step={CONVERSATION_LIST_STEP}
                      onMore={showMoreConversations}
                      onCollapse={canCollapseConversations ? collapseConversations : undefined}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* =========================================================================
            TAB 2. sub=trends (유형 · 추이 비주얼 분석 대시보드)
            ========================================================================= */}
        {activeSub === "trends" ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Tag / Category Distribution */}
            <div className="rounded-[18px] border border-black/[0.08] bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#111110]">민재님 CS 태그 분류 분포</h2>
                  <p className="mt-0.5 text-xs text-[#615D59]">채널톡 유입 상담 유형 및 주요 태그 점유율</p>
                </div>
                <span className="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#084734]">
                  분류율 {rawConversations.length > 0 ? Math.round(((rawConversations.length - untaggedCount) / rawConversations.length) * 100) : 0}%
                </span>
              </div>

              {tagDistribution.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#A39E98]">
                  태그가 지정된 상담이 없습니다.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {tagDistribution.map((row) => {
                    const pct = maxTagCount ? Math.round((row.count / rawConversations.length) * 100) : 0
                    return (
                      <div key={row.tag} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#111110]">{row.tag}</span>
                          <span className="font-bold tabular-nums text-[#084734]">
                            {row.count}건 <span className="text-[11px] font-normal text-[#A39E98]">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.04]">
                          <div
                            className="h-full rounded-full bg-[#084734] transition-all duration-500"
                            style={{
                              width: `${maxTagCount ? Math.max(6, Math.round((row.count / maxTagCount) * 100)) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {untaggedCount > 0 ? (
                <p className="mt-4 border-t border-black/[0.04] pt-2 text-[11px] text-[#A39E98]">
                  태그 미지정 {untaggedCount}건은 AI 자동 분류(Fallback) 대상에 해당합니다.
                </p>
              ) : null}
            </div>

            {/* 14-Day Activity Histogram */}
            <div className="rounded-[18px] border border-black/[0.08] bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#111110]">최근 14일 일별 상담 활동 추이</h2>
                  <p className="mt-0.5 text-xs text-[#615D59]">일별 인바운드 접수량 및 메시지 교환량</p>
                </div>
                <span className="text-xs text-[#615D59] tabular-nums">
                  상담 {activityTotals.conversations}건 · 메시지 {activityTotals.messages}개
                </span>
              </div>

              <div className="mt-6 flex h-[160px] items-end gap-1.5 pt-4" role="img" aria-label="최근 14일 일별 상담 활동">
                {dailyActivity.map((day, index) => {
                  const isToday = index === dailyActivity.length - 1
                  const height = day.conversations > 0
                    ? Math.max(10, Math.round((day.conversations / maxDailyConversations) * 100))
                    : 4
                  return (
                    <div
                      key={day.date}
                      className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 h-full justify-end"
                      title={`${day.label} (${day.date}): 상담 ${day.conversations}건 · 메시지 ${day.messages}개`}
                    >
                      <span className="text-[10px] font-bold tabular-nums text-[#111110] opacity-0 group-hover:opacity-100 transition-opacity">
                        {day.conversations}
                      </span>
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className={cn(
                            "w-full rounded-t-[4px] transition-all",
                            day.conversations === 0
                              ? "bg-black/[0.04]"
                              : isToday
                                ? "bg-[#084734]"
                                : "bg-[#084734]/70 group-hover:bg-[#084734]"
                          )}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span className={cn("text-[10px] tabular-nums", isToday ? "font-bold text-[#084734]" : "text-[#A39E98]")}>
                        {isToday ? "오늘" : day.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-black/[0.04] pt-2 text-[11px] text-[#A39E98]">
                <span>일평균 인바운드: {Math.round((activityTotals.conversations / 14) * 10) / 10}건/일</span>
                <span>담당 매니저: 김민재</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* =========================================================================
            TAB 3. sub=faq (챗봇 FAQ 후보 승격 플라이휠)
            ========================================================================= */}
        {activeSub === "faq" ? (
          <div>
            {suggestions.length === 0 ? (
              <div className="rounded-[18px] border border-black/[0.08] bg-white p-12 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-[#A39E98]" />
                <p className="mt-2 text-sm font-bold text-[#111110]">
                  현재 챗봇 골든셋이 아직 다루지 않는 신규 반복 질문이 없습니다.
                </p>
                <p className="mt-0.5 text-xs text-[#615D59]">
                  새로운 상담이 누적되면 질문 빈도와 패턴을 분석하여 자동으로 FAQ 후보를 추천합니다.
                </p>
              </div>
            ) : (
              <div className="rounded-[18px] border border-black/[0.08] bg-white overflow-hidden shadow-2xs">
                <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#084734]" />
                    <h2 className="text-sm font-bold text-[#111110]">챗봇 FAQ 학습 후보</h2>
                    <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-xs font-bold text-[#084734] tabular-nums">
                      {suggestions.length}건 대기
                    </span>
                  </div>
                  <p className="text-xs text-[#615D59]">
                    1-클릭으로 챗봇 추천 질문(draft)에 등록되어 AI 응대율이 향상됩니다.
                  </p>
                </div>

                <div className="divide-y divide-black/[0.06]">
                  {suggestions.map((suggestion) => {
                    const extraSamples = (suggestion.sampleQuestions ?? []).filter(
                      (sample) => sample.trim() !== suggestion.question.trim()
                    )
                    const alreadyPromoted = isQuestionAlreadyPromoted(suggestion.question, existingPrompts)
                    const promoteBusy = promotingQuestion === suggestion.question
                    const promoteError = promoteErrors[suggestion.question]

                    return (
                      <div key={suggestion.question} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[#FAFAF8] px-2 py-0.5 text-[10.5px] font-semibold text-[#084734] border border-black/[0.06]">
                              {faqCategoryLabel(suggestion.category)}
                            </span>
                            <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-bold text-[#084734] tabular-nums">
                              {suggestion.count}회 반복
                            </span>
                            <span className="text-[11px] text-[#A39E98]">
                              최근 질문: {formatWhen(suggestion.lastAskedAt)}
                            </span>
                          </div>

                          <h3 className="mt-2 text-sm font-bold text-[#111110]">
                            {suggestion.question}
                          </h3>

                          {extraSamples.length > 0 ? (
                            <p className="mt-1 text-xs text-[#615D59]">
                              유사 표현: {extraSamples.join(" · ")}
                            </p>
                          ) : null}

                          {promoteError ? (
                            <p className="mt-1 text-xs text-[#8F2C2C]">{promoteError}</p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {alreadyPromoted ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-3 py-1.5 text-xs font-bold text-[#084734]">
                              <Check className="h-3.5 w-3.5" />
                              추천 질문 등록됨
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void promoteSuggestion(suggestion)}
                              disabled={promoteBusy}
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#084734] px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#065c41] disabled:opacity-50"
                            >
                              {promoteBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                              )}
                              <span>추천 질문으로 1-클릭 승격</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* =========================================================================
            SPLIT/MODAL: 실제 채널톡 대화 전문 뷰어 (Quick Messenger Studio Modal)
            ========================================================================= */}
        {selectedChatConversation ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
            onClick={() => setSelectedChatConversation(null)}
          >
            <div
              className="flex flex-col h-[85vh] w-full max-w-2xl rounded-[20px] border border-black/[0.08] bg-white shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Profile Bar */}
              <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-3.5 bg-[#FAFAF8]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#084734] font-bold text-white text-xs">
                    {getInitialLetter(selectedChatConversation.name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#111110]">
                        {selectedChatConversation.name || "익명 고객"}
                      </h3>
                      {selectedChatConversation.matchedLeadOrg ? (
                        <span className="text-xs text-[#615D59]">({selectedChatConversation.matchedLeadOrg})</span>
                      ) : null}
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", STATE_BADGE[selectedChatConversation.state])}>
                        {STATE_LABEL[selectedChatConversation.state]}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A39E98]">
                      {selectedChatConversation.phone || "연락처 미등록"} · 담당: 김민재 매니저 (CS/Ops)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedChatConversation(null)}
                    className="rounded-full p-1.5 text-[#A39E98] hover:bg-[#F6F5F4] hover:text-[#111110]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Modal Chat Bubble Stream */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-[#F6F5F4]/40">
                {transcriptLoading ? (
                  <div className="flex h-full items-center justify-center text-xs text-[#A39E98]">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#084734]" />
                    대화 전문을 불러오는 중...
                  </div>
                ) : transcriptError ? (
                  <div className="rounded-[12px] bg-[#FCE9E9] p-4 text-xs text-[#8F2C2C]">
                    {transcriptError}
                  </div>
                ) : transcriptMessages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-xs text-[#A39E98]">
                    <p className="font-semibold text-[#111110]">저장된 대화 메시지가 없습니다.</p>
                    <p className="mt-1">첫 질문: “{selectedChatConversation.firstQuestion || "질문 없음"}”</p>
                  </div>
                ) : (
                  transcriptMessages.map((msg) => {
                    const isCustomer = msg.author === "customer"
                    const isAgent = msg.author === "agent"
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex flex-col max-w-[80%]",
                          isAgent ? "ml-auto items-end" : isCustomer ? "mr-auto items-start" : "mx-auto items-center"
                        )}
                      >
                        <span className="text-[10px] text-[#A39E98] mb-1">
                          {isCustomer ? "고객" : isAgent ? "담당 매니저 (민재)" : "봇 안내"}
                        </span>
                        <div
                          className={cn(
                            "rounded-[16px] px-4 py-2.5 text-xs leading-relaxed shadow-2xs whitespace-pre-wrap",
                            isAgent
                              ? "bg-[#084734] text-white rounded-tr-xs"
                              : isCustomer
                                ? "bg-white text-[#111110] border border-black/[0.08] rounded-tl-xs"
                                : "bg-[#FAFAF8] text-[#615D59] border border-black/[0.06] text-center text-[11px]"
                          )}
                        >
                          {msg.text}
                        </div>
                        <span className="text-[9.5px] text-[#A39E98] mt-1 tabular-nums">
                          {formatWhen(msg.at)}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Modal Bottom Action Footer */}
              <div className="flex items-center justify-between border-t border-black/[0.08] px-5 py-3.5 bg-white">
                <div className="flex items-center gap-1.5 text-xs text-[#615D59]">
                  <span>태그:</span>
                  {(selectedChatConversation.tags ?? []).map((t) => (
                    <span key={t} className="rounded-full bg-[#FAFAF8] px-2 py-0.5 text-[10.5px] font-semibold text-[#111110] border border-black/[0.06]">
                      {t}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href="https://desk.channel.io"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] px-3 py-1.5 text-xs font-semibold text-[#111110] hover:bg-[#F6F5F4]"
                  >
                    <span>채널톡 데스크 열기</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  {!selectedChatConversation.matchedLeadId && !registeredLeads[selectedChatConversation.id] && (
                    <button
                      type="button"
                      onClick={() => void registerConversationAsLead(selectedChatConversation)}
                      disabled={registeringId === selectedChatConversation.id}
                      className="inline-flex items-center gap-1 rounded-full bg-[#084734] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#065c41] disabled:opacity-50"
                    >
                      <UserPlus className="h-3 w-3" />
                      <span>CRM 리드로 등록</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

export default function ChannelTalkPage() {
  return (
    <>
      <CsConsoleNav contentClassName="w-full max-w-[1240px] px-4 sm:px-6 lg:px-8" />
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8">
            <p className="text-xs text-[#A39E98]">채널톡 상담 데이터를 불러오는 중…</p>
          </div>
        }
      >
        <ChannelTalkInbox />
      </Suspense>
    </>
  )
}
