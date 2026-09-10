"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  LineChart,
  MessageSquare,
  RefreshCw,
  Sparkles,
  UserPlus,
} from "lucide-react"

import AdminTabs from "@/components/admin/AdminTabs"
import ChannelCauseReviewPanel from "@/components/admin/channel-talk/ChannelCauseReviewPanel"
import CsConsoleNav from "@/components/admin/cs/CsConsoleNav"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { useUrlState } from "@/lib/use-url-state"
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
import { cn } from "@/lib/utils"
import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"

// 상담 목록 무한스크롤 대체 — 초기 50건, "더보기"로 50건씩 확장(계획 문서 Phase W1).
const CONVERSATION_LIST_STEP = 50

// 상담 Inbox 하위탭(`sub`) — 이 화면이 실제로 하는 독립적인 일은 세 가지다.
//   conversations : 상담 → CRM 리드 등록 (기본값 · 이 화면의 본업)
//   trends        : 유형 분포 · 응답 추이 (위 목록에서 파생된 집계, 서버 왕복 없음)
//   faq           : FAQ 후보 → 챗봇 추천 질문 승격
// 동기화(헤더)와 스탯 4셀은 세 탭 전부에 걸리는 신호라 탭 바깥 상시 노출이다.
//
// URL 키는 `sub` — 콘솔 메뉴 층인 `tab`과 2단 계약을 이룬다
// (docs/active/cs-admin-console-ia-2026-07-27.md §5는 `tab`을 메뉴 층으로 규약한다).
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
  opened: "bg-[#ECFDF5] text-[#084734]",
  closed: "bg-[#F6F5F4] text-[#615D59]",
  snoozed: "bg-[#FBF1E0] text-[#7A520F]",
  unknown: "bg-[#F6F5F4] text-[#A39E98]",
}

function formatWhen(iso?: string | null) {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const diffMs = Date.now() - date.getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return "방금"
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return date.toISOString().slice(0, 10)
}

// 데스크 스탯 스트립 셀 — 큰 라이닝 숫자 + 대문자 마이크로 라벨 (CS 코파일럿과 동일 문법).
function StatCell({
  label,
  value,
  context,
  divider,
}: {
  label: string
  value: number
  context: string
  divider?: boolean
}) {
  return (
    <div className={cn("px-5 py-4", divider && "border-l border-black/[0.08]")}>
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#A39E98]">{label}</p>
      <p className="mt-2 text-[27px] font-bold leading-none tracking-[-0.02em] text-[#111110] tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 truncate text-[10.5px] text-[#A39E98]">{context}</p>
    </div>
  )
}

function ChannelTalkInbox() {
  // 읽기는 useUrlState(window.location)만 쓴다 — useSearchParams와 합성하지 않는다.
  // 합성이 필요한 쪽은 `<Link>`가 값을 실어 나르는 키뿐이다(내부 축의 `tab`이 그렇다).
  // `sub`를 쓰는 창구는 아래 AdminTabs 하나뿐이고 그 쓰기는 replaceState라 location이 항상
  // 먼저 맞는다. 실측상 라우터가 replaceState를 따라잡는 데 개발 서버에서 ~1초가 걸렸으므로,
  // `searchParams.get("sub") ?? subParam`을 얹었다면 그동안 직전 탭이 다시 그려졌을 것이다.
  const [subParam, setSubParam] = useUrlState("sub", DEFAULT_INBOX_SUB)
  // 오타·미지원 값은 조용히 기본 탭으로 — 빈 화면을 만들지 않는다.
  const activeSub: InboxSub = INBOX_SUBTABS.some((item) => item.value === subParam)
    ? (subParam as InboxSub)
    : DEFAULT_INBOX_SUB

  // 반대 방향의 구멍 하나는 실측으로 재현됐다 — 콘솔 내비의 `상담 Inbox` href에는 `sub`가
  // 없어서, ?sub=trends 상태로 그 메뉴를 다시 누르면 주소에서 sub가 사라지는데 useUrlState는
  // 그걸 못 본다(Next <Link>는 pushState로 주소를 바꾸고 pushState는 popstate를 쏘지 않는다).
  // 그래서 searchParams는 읽기가 아니라 "라우터가 주소를 커밋했다"는 신호로만 쓴다:
  // 커밋된 쿼리가 실제로 바뀌었고 그 안에 sub가 없으면 기본 탭으로 되돌린다.
  // 우리 replaceState는 커밋 문자열을 바꾸지 않은 채 먼저 반영되므로 이 이펙트에 걸리지 않고,
  // 뒤늦게 커밋될 때는 sub가 들어 있어 되돌림 대상이 아니다 — 경합이 없다.
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
  // 이미 등록된 추천 질문 prompt들 — 중복 승격 차단용 (DB unique 제약 없음).
  const [existingPrompts, setExistingPrompts] = useState<string[]>([])
  const [promotingQuestion, setPromotingQuestion] = useState<string | null>(null)
  const [promoteErrors, setPromoteErrors] = useState<Record<string, string>>({})
  // 상담 id → 이번 세션에서 등록한 리드 id. matchedLeadId는 다음 동기화 때 채워진다.
  const [registeredLeads, setRegisteredLeads] = useState<Record<string, string>>({})
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({})
  // 상담 전문은 목록 응답에 싣지 않는다. 원인 검토 행을 펼칠 때 해당 패널이 상세 API를
  // lazy-load하고, 한 번에 한 대화만 열어 개인정보 노출 면적과 요청량을 제한한다.
  const [expandedCauseReviewId, setExpandedCauseReviewId] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    setLoadError(null)
    const [main, mined, recommended] = await Promise.allSettled([
      // 캐시 소비 — 사이드바·콘솔 hover-warm(NAV_WARMUP_REQUESTS["/admin/channel-talk"])이
      // 같은 URL 키로 데운 캐시를 그대로 읽는다(URL 문자열이 캐시 키라 warm 목록과 byte-동일해야 적중).
      // 이전에는 cache:"no-cache"로 항상 네트워크를 탔고, 그래서 warm 키가 죽어 있었다.
      // 신선도는 두 겹으로 보장된다 — 동기화 버튼은 force로 우회하고(아래 load(true)),
      // POST /api/admin/channel-talk/sync 성공 자체가 /api/admin/channel-talk 스코프 캐시를 비운다.
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

  // FAQ 후보 → 챗봇 추천 질문(draft) 승격. 발행은 /admin/docs 추천 질문 관리에서.
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

  // 미매칭 상담 → CRM 리드 등록. 성공하면 리드 보드 딥링크 배지로 바뀐다.
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

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

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
  const conversations = useMemo(() => data?.conversations ?? [], [data?.conversations])
  const {
    visible: visibleConversations,
    showMore: showMoreConversations,
    collapse: collapseConversations,
    canMore: canMoreConversations,
    canCollapse: canCollapseConversations,
  } = useVisibleCount(conversations.length, CONVERSATION_LIST_STEP)

  // 통계 패널 — 유형(태그) 분포와 최근 14일 응답 추이. 서버 왕복 없이 목록에서 집계한다.
  const tagDistribution = useMemo(() => aggregateConversationTags(conversations, 6), [conversations])
  const untaggedCount = useMemo(
    () => conversations.filter((conversation) => (conversation.tags ?? []).length === 0).length,
    [conversations]
  )
  const dailyActivity = useMemo(() => aggregateDailyActivity(conversations, 14), [conversations])
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

  return (
    <>
      {/* 본문 — 들여쓰기를 유지하려 fragment 자식으로 평평하게 둔다(diff 최소화). */}
      <div className="max-w-5xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-7">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#A39E98]">
            고객 지원 · 인바운드
          </p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">채널톡 상담</h1>
          <p className="mt-1 text-[13px] text-[#615D59]">
            상담 → CRM 매칭 · FAQ → 챗봇 학습 후보
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] text-[#A39E98] tabular-nums">
            마지막 동기화 {formatWhen(data?.lastSyncedAt)}
          </span>
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={syncing || loading || isUnconfigured}
            title={isUnconfigured ? "채널톡 Open API 키 설정 후 동기화할 수 있습니다." : undefined}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#31302E] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#111110] disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "동기화 중…" : isUnconfigured ? "설정 필요" : "지금 동기화"}
          </button>
          <button
            type="button"
            onClick={() => void runSync(true)}
            disabled={syncing || loading || isUnconfigured}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-black/[0.12] bg-white px-3 text-[12px] font-semibold text-[#31302E] transition-colors hover:bg-[#F6F5F4] disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            강제 갱신
          </button>
        </div>
      </div>

      {isUnconfigured ? (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-[#ECD29C] bg-[#FBF1E0] px-4 py-3.5 text-[13px] text-[#7A520F]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            채널톡 Open API 키가 없어 인바운드 동기화가 비활성 상태입니다. 서버{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">.env.local</code> 에{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">CHANNEL_TALK_ACCESS</code>{" "}
            / <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">CHANNEL_TALK_ACCESS_SECRET</code>{" "}
            를 추가하세요. (채널톡 &gt; 설정 &gt; 보안 &gt; API)
          </p>
        </div>
      ) : null}

      {loadError ? (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3.5 text-[13px] text-[#8F2C2C]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>상담 데이터를 불러오지 못했습니다. {loadError}</p>
        </div>
      ) : null}

      {notice ? (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-black/[0.08] bg-[#F6F5F4] px-4 py-3.5 text-[13px] text-[#31302E]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#A39E98]" />
          <p>{notice}</p>
        </div>
      ) : null}

      {loading ? (
        <p className="text-[13px] text-[#A39E98]">불러오는 중…</p>
      ) : (
        <div className="space-y-6">
          {/* 스탯 스트립 — 파스텔 채움 없이 흰 카드 + 헤어라인 분할 (운영 데스크 문법) */}
          <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-black/[0.08] bg-white sm:grid-cols-4">
            <StatCell
              label="전체 상담"
              value={stats?.total ?? 0}
              context={`최근 7일 ${stats?.last7Days ?? 0}건`}
            />
            <StatCell
              label="진행 중"
              value={stats?.byState.opened ?? 0}
              context={`종료 ${stats?.byState.closed ?? 0} · 보류 ${stats?.byState.snoozed ?? 0}`}
              divider
            />
            <StatCell
              label="CRM 매칭"
              value={stats?.matchedLeads ?? 0}
              context={`미매칭 ${stats?.unmatched ?? 0}건`}
            />
            <StatCell
              label="FAQ 후보"
              value={suggestions.length}
              context="챗봇 미커버 질문"
              divider
            />
          </div>

          {/* 하위탭 — 콘솔 가로 메뉴(`tab`) 아래 화면 안쪽 층(`sub`).
              공용 AdminTabs를 subtle로 재사용한다(전용 탭 컴포넌트를 새로 만들지 않는다). */}
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

          {/* sub=trends — 유형(태그) 분포 · 응답 추이. 둘 다 상담 목록에서 파생된 집계라
              탭을 옮겨도 서버 왕복이 생기지 않는다(같은 conversations 배열의 useMemo). */}
          {activeSub === "trends" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <section className="rounded-[10px] border border-black/[0.08] bg-white px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#31302E]">유형 분포</h2>
                <span className="text-[10px] text-[#A39E98]">채널톡 태그 기준</span>
              </div>
              {tagDistribution.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-[#A39E98]">태그가 붙은 상담이 없습니다.</p>
              ) : (
                <ul className="mt-3.5 space-y-2.5">
                  {tagDistribution.map((row) => (
                    <li key={row.tag} className="flex items-center gap-3">
                      <span className="w-[128px] shrink-0 truncate text-[11px] font-medium text-[#31302E]" title={row.tag}>
                        {row.tag}
                      </span>
                      <span className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-[#F0EFED]">
                        <span
                          className="block h-full rounded-full bg-[#084734]"
                          style={{ width: `${maxTagCount ? Math.max(6, Math.round((row.count / maxTagCount) * 100)) : 0}%` }}
                        />
                      </span>
                      <span className="w-6 shrink-0 text-right text-[11px] font-bold text-[#111110] tabular-nums">
                        {row.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {untaggedCount > 0 ? (
                <p className="mt-3 text-[10px] text-[#A39E98]">태그 없음 {untaggedCount}건은 집계에서 제외</p>
              ) : null}
            </section>

            <section className="rounded-[10px] border border-black/[0.08] bg-white px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#31302E]">응답 추이</h2>
                <span className="text-[10px] text-[#A39E98] tabular-nums">
                  14일 · 상담 {activityTotals.conversations} · 메시지 {activityTotals.messages}
                </span>
              </div>
              <div className="mt-4 flex h-[88px] items-end gap-[3px]" role="img" aria-label="최근 14일 일별 상담 활동">
                {dailyActivity.map((day, index) => {
                  const isToday = index === dailyActivity.length - 1
                  const height = day.conversations > 0
                    ? Math.max(8, Math.round((day.conversations / maxDailyConversations) * 100))
                    : 0
                  return (
                    <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${day.label} · 상담 ${day.conversations}건 · 메시지 ${day.messages}개`}>
                      <div className="flex w-full flex-1 items-end">
                        <span
                          className={cn(
                            "block w-full rounded-[3px] transition-colors",
                            day.conversations === 0
                              ? "h-[3px] bg-[#F0EFED]"
                              : isToday
                                ? "bg-[#084734]"
                                : "bg-[#31302E]/80 group-hover:bg-[#084734]"
                          )}
                          style={day.conversations > 0 ? { height: `${height}%` } : undefined}
                        />
                      </div>
                      {index === 0 || isToday || index === Math.floor(dailyActivity.length / 2) ? (
                        <span className="text-[9px] text-[#A39E98] tabular-nums">{isToday ? "오늘" : day.label}</span>
                      ) : (
                        <span className="text-[9px] text-transparent">·</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
          ) : null}

          {/* sub=faq — FAQ 후보 → 챗봇 추천 질문(draft) 승격.
              탭이 생기기 전에는 후보가 0건이면 섹션째 사라졌지만, 이제는 탭이 비어 보이면
              안 되므로 빈 상태 문구를 둔다(기능 손실 없음 · 노출만 명시적으로 바뀐다). */}
          {activeSub === "faq" ? (
            suggestions.length === 0 ? (
              <section className="rounded-[10px] border border-black/[0.08] bg-white px-5 py-10 text-center">
                <p className="text-[13px] text-[#A39E98]">
                  {isUnconfigured
                    ? "채널톡 Open API 키 설정 후 상담을 동기화하면 FAQ 후보가 채워집니다."
                    : "챗봇 골든셋이 아직 못 받는 반복 질문이 없습니다."}
                </p>
              </section>
            ) : (
            <section className="overflow-hidden rounded-[10px] border border-black/[0.08] bg-white">
              <div className="flex items-center gap-2 border-b border-black/[0.08] px-5 py-3.5">
                <Sparkles className="h-4 w-4 text-[#084734]" />
                <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#31302E]">챗봇 학습 후보</h2>
                <span className="ml-auto text-[11px] text-[#A39E98] tabular-nums">{suggestions.length}건</span>
              </div>
              <ul>
                {suggestions.map((suggestion) => {
                  const extraSamples = (suggestion.sampleQuestions ?? []).filter(
                    (sample) => sample.trim() !== suggestion.question.trim()
                  )
                  const alreadyPromoted = isQuestionAlreadyPromoted(suggestion.question, existingPrompts)
                  const promoteBusy = promotingQuestion === suggestion.question
                  const promoteError = promoteErrors[suggestion.question]
                  return (
                    <li
                      key={suggestion.question}
                      className="flex items-start gap-3 border-b border-black/[0.08] px-5 py-3.5 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[#111110]">
                          {suggestion.question}
                        </p>
                        {extraSamples.length > 0 ? (
                          <p className="mt-0.5 truncate text-[11px] text-[#615D59]">
                            유사 질문: {extraSamples.join(" · ")}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-[#A39E98]">
                          최근 질문 {formatWhen(suggestion.lastAskedAt)}
                        </p>
                        {promoteError ? (
                          <p className="mt-1 text-[11px] text-[#8F2C2C]">{promoteError}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-semibold text-[#084734] tabular-nums">
                          {suggestion.count}회
                        </span>
                        <span className="rounded-full border border-black/[0.10] px-2 py-0.5 text-[10px] font-medium text-[#615D59]">
                          {faqCategoryLabel(suggestion.category)}
                        </span>
                        {alreadyPromoted ? (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-1 text-[11px] font-medium text-[#084734]">
                            <Check className="h-3 w-3" />
                            추천질문 등록됨
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void promoteSuggestion(suggestion)}
                            disabled={promoteBusy}
                            className="mt-1 inline-flex items-center gap-1 rounded-md border border-[#084734] px-2.5 py-1 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#084734] hover:text-white disabled:opacity-50"
                          >
                            {promoteBusy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            추천질문으로 승격
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="border-t border-black/[0.08] bg-[#FAFAF8] px-5 py-3 text-[11px] text-[#615D59]">
                자주 묻는데 챗봇 골든셋에 없는 질문입니다. “추천질문으로 승격”은 챗봇 시작 화면 추천 질문(draft)으로
                등록하며, <a href="/admin/docs" className="underline hover:text-[#111110]">/admin/docs 추천 질문 관리</a>에서
                검토 후 발행합니다. 답변 자체는 골든셋 또는 가이드 문서에 반영하면 챗봇이 다음부터 자동 응대합니다.
              </p>
            </section>
            )
          ) : null}

          {/* sub=conversations(기본) — 상담 → CRM 리드 등록. 이 화면의 본업이라 첫 자리다. */}
          {activeSub === "conversations" ? (
          <section className="overflow-hidden rounded-[10px] border border-black/[0.08] bg-white">
            <div className="flex items-center gap-2 border-b border-black/[0.08] px-5 py-3.5">
              <MessageSquare className="h-4 w-4 text-[#A39E98]" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#31302E]">상담 대화</h2>
              <span className="ml-auto text-[11px] text-[#A39E98] tabular-nums">{conversations.length}건</span>
            </div>

            {conversations.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-[#A39E98]">
                {isUnconfigured
                  ? "채널톡 Open API 키 설정 후 상담을 동기화할 수 있습니다."
                  : loadError
                    ? "상담 데이터를 불러오지 못했습니다. 잠시 뒤 다시 시도하세요."
                    : "동기화된 상담이 없습니다. 우측 상단 “지금 동기화”를 눌러 채널톡에서 가져오세요."}
              </p>
            ) : (
              <ul>
                {conversations.slice(0, visibleConversations).map((conversation) => {
                  const registeredLeadId = registeredLeads[conversation.id]
                  const canRegister = Boolean(
                    conversation.name || conversation.email || conversation.phone
                  )
                  const registerBusy = registeringId === conversation.id
                  const registerError = registerErrors[conversation.id]
                  const causeReviewOpen = expandedCauseReviewId === conversation.id
                  return (
                    <li
                      key={conversation.id}
                      className="border-b border-black/[0.08] last:border-0"
                    >
                      <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-[#111110]">
                            {conversation.name || conversation.email || conversation.phone || "익명 고객"}
                          </span>
                          <span
                            className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATE_BADGE[conversation.state])}
                          >
                            {STATE_LABEL[conversation.state]}
                          </span>
                          {(conversation.tags ?? []).slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-black/[0.10] bg-white px-2 py-0.5 text-[10px] font-medium text-[#615D59]"
                            >
                              {tag}
                            </span>
                          ))}
                          {conversation.matchedLeadId ? (
                            <a
                              href={leadBoardDeepLink(conversation.matchedLeadId)}
                              className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-medium text-[#084734] hover:underline"
                            >
                              <Link2 className="h-3 w-3" />
                              {conversation.matchedLeadOrg || "CRM 매칭"}
                            </a>
                          ) : registeredLeadId ? (
                            <a
                              href={leadBoardDeepLink(registeredLeadId)}
                              className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-medium text-[#084734] hover:underline"
                            >
                              <Check className="h-3 w-3" />
                              리드 등록됨 · 보드에서 보기
                            </a>
                          ) : canRegister ? (
                            <button
                              type="button"
                              onClick={() => void registerConversationAsLead(conversation)}
                              disabled={registerBusy}
                              className="inline-flex items-center gap-1 rounded-full border border-black/[0.10] px-2 py-0.5 text-[10px] font-medium text-[#615D59] transition-colors hover:border-[#084734] hover:text-[#084734] disabled:opacity-50"
                            >
                              {registerBusy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <UserPlus className="h-3 w-3" />
                              )}
                              리드로 등록
                            </button>
                          ) : null}
                        </div>
                        {conversation.firstQuestion ? (
                          <p className="line-clamp-2 text-[12px] text-[#615D59]">
                            “{conversation.firstQuestion}”
                          </p>
                        ) : null}
                        {conversation.lastMessageText ? (
                          <p className="line-clamp-1 text-[11px] text-[#A39E98]">
                            최근: {conversation.lastMessageText}
                          </p>
                        ) : null}
                        {registerError ? (
                          <p className="text-[11px] text-[#8F2C2C]">{registerError}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-[#A39E98] tabular-nums sm:flex-col sm:items-end sm:gap-1.5">
                        <span>{conversation.messageCount}개 메시지 · {formatWhen(conversation.lastMessageAt)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCauseReviewId((current) =>
                              current === conversation.id ? null : conversation.id
                            )
                          }
                          aria-expanded={causeReviewOpen}
                          aria-controls={`channel-cause-review-${conversation.id}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.12] bg-white px-3 text-[11px] font-semibold text-[#31302E] transition-colors hover:border-[#084734]/40 hover:text-[#084734]"
                        >
                          원인 검토
                          {causeReviewOpen ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      </div>
                      {causeReviewOpen ? (
                        <div id={`channel-cause-review-${conversation.id}`}>
                          <ChannelCauseReviewPanel conversationId={conversation.id} />
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
            {(canMoreConversations || canCollapseConversations) && (
              <div className="flex flex-col items-center gap-2 border-t border-black/[0.08] px-5 py-4">
                <p role="status" className="text-[11px] font-medium tabular-nums text-[#A39E98]">
                  {visibleConversations.toLocaleString("ko-KR")} / 총{" "}
                  {conversations.length.toLocaleString("ko-KR")}건 표시
                </p>
                <ShowMore
                  visible={visibleConversations}
                  total={conversations.length}
                  step={CONVERSATION_LIST_STEP}
                  onMore={showMoreConversations}
                  onCollapse={canCollapseConversations ? collapseConversations : undefined}
                />
              </div>
            )}
            <a
              href="https://desk.channel.io"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 border-t border-black/[0.08] bg-[#FAFAF8] px-5 py-3 text-[12px] font-medium text-[#615D59] transition-colors hover:text-[#111110]"
            >
              채널톡 데스크에서 열기
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </section>
          ) : null}
        </div>
      )}
      </div>
    </>
  )
}

// useSearchParams()는 정적 렌더링 시 Suspense 경계를 요구한다(내부 축 워크스페이스와 같은 이유).
// 콘솔 내비는 경계 바깥에 둬서 본문이 스트리밍되는 동안에도 자리를 지킨다.
export default function ChannelTalkPage() {
  return (
    <>
      {/* CS 콘솔 2단 내비 — 최상단 풀블리드. contentClassName은 이 화면 본문 컨테이너(max-w-5xl,
          좌측 정렬)와 같은 폭·거터로 맞춰야 좌우 끝이 일치한다(§1 · §4).
          이 max-w-5xl은 콘솔 이전부터 있던 이 화면의 폭이다. */}
      <CsConsoleNav contentClassName="w-full max-w-5xl px-4 sm:px-6 lg:px-8" />
      <Suspense
        fallback={
          <div className="max-w-5xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
            <p className="text-[13px] text-[#A39E98]">불러오는 중…</p>
          </div>
        }
      >
        <ChannelTalkInbox />
      </Suspense>
    </>
  )
}
