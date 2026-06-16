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
} from "lucide-react"

import { StatCard } from "@/components/admin/StatCard"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"

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
  coveredByGoldenSet: boolean
  lastAskedAt?: string
  sampleConversationIds: string[]
}

interface SyncResult {
  ok: boolean
  configured: boolean
  fetchedChats: number
  newConversations: number
  matchedLeads: number
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

  const load = useCallback(async (force = false) => {
    const [main, mined] = await Promise.allSettled([
      adminFetchJsonCached<ChannelData>("/api/admin/channel-talk", undefined, {
        ttlMs: 30_000,
        force,
      }),
      adminFetchJsonCached<{ suggestions?: FaqSuggestion[] }>(
        "/api/admin/channel-talk/mine",
        undefined,
        { ttlMs: 60_000, force }
      ),
    ])
    if (main.status === "fulfilled") setData(main.value)
    if (mined.status === "fulfilled") setSuggestions(mined.value.suggestions ?? [])
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function runSync() {
    setSyncing(true)
    setNotice(null)
    try {
      const result = await adminFetchJson<SyncResult>("/api/admin/channel-talk/sync", {
        method: "POST",
        body: JSON.stringify({ limit: 50 }),
      })
      if (!result.configured) {
        setNotice(result.warning ?? "채널톡 Open API 키가 설정되지 않았습니다.")
      } else if (!result.ok) {
        setNotice(result.warning ?? "동기화에 실패했습니다.")
      } else {
        setNotice(
          `동기화 완료 · 대화 ${result.fetchedChats}건 · 신규 ${result.newConversations}건 · CRM 매칭 ${result.matchedLeads}건`
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
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#111110] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2a2a28] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "동기화 중…" : "지금 동기화"}
        </button>
      </div>

      {data && !data.configured ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-[#FEF3EE] px-4 py-3.5 text-[13px] text-[#B85C33]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            채널톡 Open API 키가 없어 인바운드 동기화가 비활성 상태입니다. 서버{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">.env.local</code> 에{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">CHANNEL_ACCESS_KEY</code>{" "}
            / <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">CHANNEL_ACCESS_SECRET</code>{" "}
            를 추가하세요. (채널톡 &gt; 설정 &gt; 보안 &gt; API)
          </p>
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
              accent="bg-[#EEF2FF]"
              iconColor="text-[#3730A3]"
            />
          </div>

          {suggestions.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
              <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-5 py-4">
                <Sparkles className="h-4 w-4 text-[#3730A3]" />
                <h2 className="text-[13px] font-semibold text-[#111110]">챗봇 학습 후보 (FAQ 플라이휠)</h2>
                <span className="ml-auto text-[12px] text-[#1a1a1a]/40">{suggestions.length}건</span>
              </div>
              <ul>
                {suggestions.map((suggestion) => (
                  <li
                    key={suggestion.question}
                    className="flex items-center gap-3 border-b border-[#e8e8e4] px-5 py-3.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[#111110]">
                        {suggestion.question}
                      </p>
                      <p className="text-[11px] text-[#1a1a1a]/40">
                        최근 질문 {formatWhen(suggestion.lastAskedAt)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-semibold text-[#3730A3]">
                      {suggestion.count}회
                    </span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-[#e8e8e4] bg-[#fafaf8] px-5 py-3 text-[11px] text-[#1a1a1a]/45">
                자주 묻는데 챗봇 골든셋에 없는 질문입니다.{" "}
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
                동기화된 상담이 없습니다. 우측 상단 “지금 동기화”를 눌러 채널톡에서 가져오세요.
              </p>
            ) : (
              <ul>
                {conversations.map((conversation) => (
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
                            href="/admin/crm"
                            className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-medium text-[#084734] hover:underline"
                          >
                            <Link2 className="h-3 w-3" />
                            {conversation.matchedLeadOrg || "CRM 매칭"}
                          </a>
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
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-[11px] text-[#1a1a1a]/40 sm:flex-col sm:items-end sm:gap-1">
                      <span>{conversation.messageCount}개 메시지</span>
                      <span>{formatWhen(conversation.lastMessageAt)}</span>
                    </div>
                  </li>
                ))}
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
