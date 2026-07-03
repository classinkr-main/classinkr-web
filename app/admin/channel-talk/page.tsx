"use client"

import { useCallback, useEffect, useState } from "react"
import {
  MessageSquare,
  Inbox,
  Link2,
  RefreshCw,
  Sparkles,
  Info,
  ExternalLink,
  Check,
  Loader2,
  UserPlus,
} from "lucide-react"

import { StatCard } from "@/components/admin/StatCard"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import {
  buildLeadPayloadFromConversation,
  buildPromotionPayload,
  isQuestionAlreadyPromoted,
  leadBoardDeepLink,
} from "@/lib/channel-talk-loop"

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
  closed: "bg-[#f0f0ec] text-[#1a1a1a]/55",
  snoozed: "bg-[#FEF3EE] text-[#B85C33]",
  unknown: "bg-[#f0f0ec] text-[#1a1a1a]/45",
}

function formatWhen(iso?: string) {
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

export default function ChannelTalkPage() {
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

  const load = useCallback(async (force = false) => {
    setLoadError(null)
    const [main, mined, recommended] = await Promise.allSettled([
      adminFetchJson<ChannelData>("/api/admin/channel-talk", { cache: "no-cache" }),
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
  const conversations = data?.conversations ?? []

  return (
    <div className="max-w-5xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">
            Admin
          </p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">채널톡 상담</h1>
          <p className="mt-1 text-[13px] text-[#1a1a1a]/50">
            상담 대화를 CRM 리드와 매칭하고, 자주 묻는 질문을 챗봇 학습 후보로 끌어옵니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={syncing || loading || isUnconfigured}
            title={isUnconfigured ? "채널톡 Open API 키 설정 후 동기화할 수 있습니다." : undefined}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#111110] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2a2a28] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "동기화 중…" : isUnconfigured ? "설정 필요" : "지금 동기화"}
          </button>
          <button
            type="button"
            onClick={() => void runSync(true)}
            disabled={syncing || loading || isUnconfigured}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            강제 갱신
          </button>
        </div>
      </div>

      {isUnconfigured ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-[#FEF3EE] px-4 py-3.5 text-[13px] text-[#B85C33]">
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
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-[#FEF3EE] px-4 py-3.5 text-[13px] text-[#B85C33]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>상담 데이터를 불러오지 못했습니다. {loadError}</p>
        </div>
      ) : null}

      {notice ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-[#f0f0ec] px-4 py-3.5 text-[13px] text-[#1a1a1a]/65">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a1a]/40" />
          <p>{notice}</p>
        </div>
      ) : null}

      {loading ? (
        <p className="text-[13px] text-[#1a1a1a]/30">불러오는 중…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={<MessageSquare className="h-4 w-4" />}
              label="전체 상담"
              value={stats?.total ?? 0}
              sub={`최근 7일 ${stats?.last7Days ?? 0}건`}
            />
            <StatCard
              icon={<Inbox className="h-4 w-4" />}
              label="진행 중"
              value={stats?.byState.opened ?? 0}
              sub={`종료 ${stats?.byState.closed ?? 0}건`}
              accent="bg-[#ECFDF5]"
              iconColor="text-[#084734]"
            />
            <StatCard
              icon={<Link2 className="h-4 w-4" />}
              label="CRM 매칭"
              value={stats?.matchedLeads ?? 0}
              sub={`미매칭 ${stats?.unmatched ?? 0}건`}
            />
            <StatCard
              icon={<Sparkles className="h-4 w-4" />}
              label="FAQ 후보"
              value={suggestions.length}
              sub="챗봇 미커버 질문"
              accent="bg-[#ECFDF5]"
              iconColor="text-[#084734]"
            />
          </div>

          {suggestions.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
              <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-5 py-4">
                <Sparkles className="h-4 w-4 text-[#084734]" />
                <h2 className="text-[13px] font-semibold text-[#111110]">챗봇 학습 후보 (FAQ 플라이휠)</h2>
                <span className="ml-auto text-[12px] text-[#1a1a1a]/40">{suggestions.length}건</span>
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
                      className="flex items-start gap-3 border-b border-[#e8e8e4] px-5 py-3.5 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[#111110]">
                          {suggestion.question}
                        </p>
                        {extraSamples.length > 0 ? (
                          <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/50">
                            유사 질문: {extraSamples.join(" · ")}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
                          최근 질문 {formatWhen(suggestion.lastAskedAt)}
                        </p>
                        {promoteError ? (
                          <p className="mt-1 text-[11px] text-[#B85C33]">{promoteError}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-semibold text-[#084734]">
                          {suggestion.count}회
                        </span>
                        <span className="rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55">
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
                            className="mt-1 inline-flex items-center gap-1 rounded-lg border border-[#084734] px-2.5 py-1 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#084734] hover:text-white disabled:opacity-50"
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
              <p className="border-t border-[#e8e8e4] bg-[#fafaf8] px-5 py-3 text-[11px] text-[#1a1a1a]/45">
                자주 묻는데 챗봇 골든셋에 없는 질문입니다. “추천질문으로 승격”은 챗봇 시작 화면 추천 질문(draft)으로
                등록하며, <a href="/admin/docs" className="underline hover:text-[#111110]">/admin/docs 추천 질문 관리</a>에서
                검토 후 발행합니다. 답변 자체는{" "}
                <code className="rounded bg-white px-1 py-0.5 font-mono">data/chatbot-golden-set.json</code>{" "}
                또는 가이드 문서에 반영하면 챗봇이 다음부터 자동 응대합니다.
              </p>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-5 py-4">
              <MessageSquare className="h-4 w-4 text-[#1a1a1a]/40" />
              <h2 className="text-[13px] font-semibold text-[#111110]">상담 대화</h2>
              <span className="ml-auto text-[12px] text-[#1a1a1a]/40">{conversations.length}건</span>
            </div>

            {conversations.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-[#1a1a1a]/30">
                {isUnconfigured
                  ? "채널톡 Open API 키 설정 후 상담을 동기화할 수 있습니다."
                  : loadError
                    ? "상담 데이터를 불러오지 못했습니다. 잠시 뒤 다시 시도하세요."
                    : "동기화된 상담이 없습니다. 우측 상단 “지금 동기화”를 눌러 채널톡에서 가져오세요."}
              </p>
            ) : (
              <ul>
                {conversations.map((conversation) => {
                  const registeredLeadId = registeredLeads[conversation.id]
                  const canRegister = Boolean(
                    conversation.name || conversation.email || conversation.phone
                  )
                  const registerBusy = registeringId === conversation.id
                  const registerError = registerErrors[conversation.id]
                  return (
                    <li
                      key={conversation.id}
                      className="flex flex-col gap-2 border-b border-[#e8e8e4] px-5 py-4 last:border-0 sm:flex-row sm:items-start sm:gap-4"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-[#111110]">
                            {conversation.name || conversation.email || conversation.phone || "익명 고객"}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_BADGE[conversation.state]}`}
                          >
                            {STATE_LABEL[conversation.state]}
                          </span>
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
                              className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e4] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55 transition-colors hover:border-[#084734] hover:text-[#084734] disabled:opacity-50"
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
                          <p className="line-clamp-2 text-[12px] text-[#1a1a1a]/60">
                            “{conversation.firstQuestion}”
                          </p>
                        ) : null}
                        {conversation.lastMessageText ? (
                          <p className="line-clamp-1 text-[11px] text-[#1a1a1a]/40">
                            최근: {conversation.lastMessageText}
                          </p>
                        ) : null}
                        {registerError ? (
                          <p className="text-[11px] text-[#B85C33]">{registerError}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-[11px] text-[#1a1a1a]/40 sm:flex-col sm:items-end sm:gap-1">
                        <span>{conversation.messageCount}개 메시지</span>
                        <span>{formatWhen(conversation.lastMessageAt)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <a
              href="https://desk.channel.io"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 border-t border-[#e8e8e4] bg-[#fafaf8] px-5 py-3 text-[12px] font-medium text-[#1a1a1a]/55 transition-colors hover:text-[#111110]"
            >
              채널톡 데스크에서 열기
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </section>
        </div>
      )}
    </div>
  )
}
