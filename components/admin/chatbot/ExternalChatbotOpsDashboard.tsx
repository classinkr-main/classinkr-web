"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  Gauge,
  Headset,
  MessageSquare,
  RefreshCcw,
  Send,
} from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"

// 공개 챗봇 운영 대시보드 — CS 콘솔 외부 축의 첫 화면(/admin/chatbot).
// 정본: docs/active/cs-admin-console-ia-2026-07-27.md §2 · §7.
//
// 이 화면은 "운영 지표 + 미해결 최신 목록"의 행동 허브다(2026-08-18 가시성 라운드).
//  - 알파 준비도·품질 평가는 DocsGapsPanel과 두 벌로 중복돼 있었고, AI 품질 검수
//    (/admin/docs?tab=quality, components/admin/docs/DocsQualityPanel.tsx)로 통합됐다(§7).
//  - 바로가기 카드 3개와 "내부 CS 챗봇 열기" 링크는 콘솔 가로 메뉴(CsConsoleNav)가 대체한다.
//  - 지표 카드는 그 숫자를 만든 화면으로 가는 딥링크다 — 숫자만 있고 행동 경로가 없어
//    "미해결 8건"을 보고도 큐로 갈 수 없던 문제를 카드 자체의 이동으로 푼다.
//  - 미해결 최신 목록은 읽기 전용 프리뷰다. 초안 생성·게시 같은 처리 액션은 전부
//    미해결 큐(/admin/docs?tab=gaps)에만 있다 — §7의 "진입점 단일화"를 유지한다.

interface ChatbotStatsSummary {
  totals: {
    questionCount: number
    unresolvedCount: number
    handoffCount: number
  }
  latency: {
    avgMs: number | null
  }
  avgConfidence: number | null
  channelHandoffs: {
    total: number
    sent: number
  }
  warning?: string
}

// /api/admin/docs/gaps 응답 중 이 화면이 소비하는 최소 형태 —
// 전체 계약은 lib/chatbot/doc-gaps.ts(DocGapBacklog)가 정본이다.
interface GapClusterPreview {
  id: string
  question: string
  sampleCount: number
  lastSeenAt: string
  metadata?: { source?: string }
}

interface GapBacklogPreview {
  gapClusters: GapClusterPreview[]
}

// 마운트 시 1회 자동 로드 → 실패하면 수동 "다시 시도"로만 재조회한다(무한 재시도 금지).
// components/admin/cs-chat/InternalCsChatWorkspace.tsx의 지표 카드 로드 관례를 그대로 따른다.
type AsyncLoadState = "loading" | "loaded" | "failed"

// 사이드바·콘솔 hover-warmup의 캐시 키와 byte-동일해야 적중한다(warmAdminRequestCache).
const CHATBOT_STATS_URL = "/api/admin/chatbot/stats"
const STATS_CACHE_TTL_MS = 60_000
// 미해결 프리뷰 — 처리 화면(DocsGapsPanel)은 전량을 직페치하지만 여기는 상위 5건만 쓴다.
const GAPS_PREVIEW_URL = "/api/admin/docs/gaps?limit=5"
const GAPS_PREVIEW_ROWS = 5

function pct(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

function ms(value: number | null | undefined) {
  if (value == null) return "—"
  if (value >= 1000) return `${(value / 1000).toFixed(1)}초`
  return `${value}ms`
}

// 목록 프리뷰용 상대 시각 — SyncStatusBar 등과 같은 로컬 헬퍼 관례(공용 모듈 없음).
function relativeTime(iso: string): string {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return ""
  const diffMs = Date.now() - time
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "방금"
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

// 소스 그룹만 판별한다 — 배지 문안·색의 정본은 DocsGapsPanel(GAP_SOURCE_BADGES)이고,
// 여기서는 행이 착지할 큐의 source 프리셋(?source=chatbot|internal_cs)만 고르면 된다.
function gapSourceGroup(source: string | undefined): "chatbot" | "internal_cs" {
  return source?.startsWith("internal_cs") ? "internal_cs" : "chatbot"
}

export default function ExternalChatbotOpsDashboard() {
  const [stats, setStats] = useState<ChatbotStatsSummary | null>(null)
  const [statsState, setStatsState] = useState<AsyncLoadState>("loading")
  const [gaps, setGaps] = useState<GapClusterPreview[] | null>(null)
  const [gapsState, setGapsState] = useState<AsyncLoadState>("loading")

  // 캐시 소비 — 사이드바·콘솔 hover-warmup(warmAdminRequestCache, ttlMs 60초)이 같은 URL 키로
  // 데운 캐시를 그대로 소비한다. "다시 시도"는 force로 캐시를 우회해 신선 조회한다.
  // 이건 이벤트 핸들러 경로라 동기 setState가 자유롭다.
  const retryStats = useCallback(async () => {
    setStatsState("loading")
    try {
      const data = await adminFetchJsonCached<ChatbotStatsSummary>(CHATBOT_STATS_URL, undefined, {
        ttlMs: STATS_CACHE_TTL_MS,
        force: true,
      })
      setStats(data)
      setStatsState("loaded")
    } catch {
      setStats(null)
      setStatsState("failed")
    }
  }, [])

  const retryGaps = useCallback(async () => {
    setGapsState("loading")
    try {
      const data = await adminFetchJsonCached<GapBacklogPreview>(GAPS_PREVIEW_URL, undefined, {
        ttlMs: STATS_CACHE_TTL_MS,
        force: true,
      })
      setGaps(data.gapClusters ?? [])
      setGapsState("loaded")
    } catch {
      setGaps(null)
      setGapsState("failed")
    }
  }, [])

  // 마운트 1회 로드. 상태 갱신은 프로미스 콜백 안에서만 한다 — 이펙트 본문에서 동기적으로
  // setState하는(또는 그런 함수를 부르는) 형태는 연쇄 렌더를 만들고
  // react-hooks/set-state-in-effect에 걸린다.
  useEffect(() => {
    let cancelled = false
    void adminFetchJsonCached<ChatbotStatsSummary>(CHATBOT_STATS_URL, undefined, {
      ttlMs: STATS_CACHE_TTL_MS,
    }).then(
      (data) => {
        if (cancelled) return
        setStats(data)
        setStatsState("loaded")
      },
      () => {
        if (cancelled) return
        setStats(null)
        setStatsState("failed")
      }
    )
    void adminFetchJsonCached<GapBacklogPreview>(GAPS_PREVIEW_URL, undefined, {
      ttlMs: STATS_CACHE_TTL_MS,
    }).then(
      (data) => {
        if (cancelled) return
        setGaps(data.gapClusters ?? [])
        setGapsState("loaded")
      },
      () => {
        if (cancelled) return
        setGaps(null)
        setGapsState("failed")
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  const totals = stats?.totals ?? { questionCount: 0, unresolvedCount: 0, handoffCount: 0 }
  const questionCount = totals.questionCount || 0
  const unresolvedRate = questionCount === 0 ? 0 : totals.unresolvedCount / questionCount
  const handoffRate = questionCount === 0 ? 0 : totals.handoffCount / questionCount
  const statsReady = statsState === "loaded"

  // href = 그 숫자를 만든 화면. hint는 카드에 상시 노출한다 — hover에만 보이면
  // "카드가 이동인지"를 발견할 수 없어 가시성 개선이 되지 않는다.
  const metricCards = [
    { key: "questions", icon: MessageSquare, label: "질문량", value: `${totals.questionCount}건`, href: "/admin/docs?tab=gaps&sub=patterns", hint: "질문 패턴" },
    { key: "unresolved", icon: AlertTriangle, label: "미해결률", value: `${totals.unresolvedCount}건 · ${pct(unresolvedRate)}`, href: "/admin/docs?tab=gaps&source=chatbot", hint: "미해결 큐" },
    { key: "handoff", icon: Headset, label: "상담 이관", value: `${totals.handoffCount}건 · ${pct(handoffRate)}`, href: "/admin/channel-talk", hint: "상담 Inbox" },
    { key: "latency", icon: Clock3, label: "응답 속도", value: ms(stats?.latency.avgMs), href: "/admin/docs?tab=quality", hint: "AI 품질 검수" },
    { key: "confidence", icon: Gauge, label: "평균 신뢰도", value: pct(stats?.avgConfidence), href: "/admin/docs?tab=quality", hint: "AI 품질 검수" },
    { key: "channel", icon: Send, label: "채널톡 전송", value: `${stats?.channelHandoffs?.sent ?? 0}/${stats?.channelHandoffs?.total ?? 0}`, href: "/admin/channel-talk", hint: "상담 Inbox" },
  ]

  // 폭·거터를 CsConsoleNav의 기본 컨테이너(DEFAULT_CONTENT_CLASS)와 문자 그대로 맞춘다 —
  // 패딩이 max-width 안쪽에 있어야 내비와 본문의 좌우 끝이 일치한다.
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
      <div className="text-[#111110]">
        {/* 1. 헤더 */}
        <header>
          <h1 className="text-2xl font-bold tracking-[-0.02em]">챗봇 운영 (외부)</h1>
          <p className="mt-1.5 text-sm text-[#615D59]">
            공개 챗봇의 질문 흐름과 상담 이관 신호를 확인합니다. 카드를 누르면 해당 화면으로 이동합니다.
          </p>
        </header>

        {/* 2. 지표 카드 행 — 각 카드는 그 숫자를 처리하는 화면으로 가는 딥링크 */}
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">운영 지표</h2>
            {statsState === "failed" ? (
              <button
                type="button"
                onClick={() => void retryStats()}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] px-3 py-1.5 text-[12px] font-semibold text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#31302E]"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                다시 시도
              </button>
            ) : null}
          </div>
          {stats?.warning ? (
            <p className="mt-2 rounded-[12px] border border-[#B85C33]/20 bg-[#FBEAE2] px-3 py-2 text-[12px] text-[#B85C33]">
              {stats.warning}
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {metricCards.map((card) => {
              const Icon = card.icon
              return (
                <Link
                  key={card.key}
                  href={card.href}
                  aria-label={`${card.label} — ${card.hint} 열기`}
                  className="group rounded-[14px] border border-black/[0.06] bg-[#FAFAF8] p-3 transition-colors hover:border-black/[0.16] hover:bg-white"
                >
                  <div className="flex items-center gap-1.5 text-[#615D59]">
                    <Icon className="h-3.5 w-3.5" />
                    <p className="text-[11px] font-medium">{card.label}</p>
                  </div>
                  {statsReady ? (
                    <p className="mt-2 text-lg font-bold tabular-nums">{card.value}</p>
                  ) : statsState === "loading" ? (
                    /* 로딩은 값 자리 스켈레톤, 실패만 "—" — 못 불러온 것을 0/빈값처럼 위장하지 않는다. */
                    <div className="mt-2.5 h-6 w-16 animate-pulse rounded-md bg-black/[0.06]" aria-hidden />
                  ) : (
                    <p className="mt-2 text-lg font-bold tabular-nums text-[#615D59]">—</p>
                  )}
                  <p className="mt-1.5 flex items-center gap-0.5 text-[11px] text-[#1a1a1a]/35 transition-colors group-hover:text-[#084734]">
                    {card.hint}
                    <ArrowUpRight className="h-3 w-3" />
                  </p>
                </Link>
              )
            })}
          </div>
        </section>

        {/* 3. 미해결 최신 프리뷰 — 읽기 전용. 처리 액션은 미해결 큐에만 둔다(§7 진입점 단일화). */}
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">미해결 최신 {GAPS_PREVIEW_ROWS}건</h2>
            <div className="flex items-center gap-2">
              {gapsState === "failed" ? (
                <button
                  type="button"
                  onClick={() => void retryGaps()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] px-3 py-1.5 text-[12px] font-semibold text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#31302E]"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  다시 시도
                </button>
              ) : null}
              <Link
                href="/admin/docs?tab=gaps"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] transition-colors hover:text-[#065c41]"
              >
                미해결 큐 전체
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {gapsState === "loading" ? (
            <ul className="mt-3 space-y-2" aria-hidden>
              {Array.from({ length: 3 }).map((_, index) => (
                <li key={index} className="h-[54px] animate-pulse rounded-[14px] border border-black/[0.05] bg-black/[0.03]" />
              ))}
            </ul>
          ) : gapsState === "failed" ? (
            /* 실패를 "없음"으로 위장하지 않는다 — 빈 상태와 문구를 분리한다. */
            <p className="mt-3 rounded-[14px] border border-[#B85C33]/20 bg-[#FBEAE2] px-3.5 py-3 text-[13px] text-[#B85C33]">
              미해결 목록을 불러오지 못했습니다. 다시 시도를 눌러 주세요.
            </p>
          ) : (gaps?.length ?? 0) === 0 ? (
            <p className="mt-3 rounded-[14px] border border-black/[0.06] bg-[#FAFAF8] px-3.5 py-3 text-[13px] text-[#615D59]">
              지금 문서 없는 미해결 질문이 없습니다.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(gaps ?? []).slice(0, GAPS_PREVIEW_ROWS).map((cluster) => {
                const group = gapSourceGroup(cluster.metadata?.source)
                return (
                  <li key={cluster.id}>
                    <Link
                      href={`/admin/docs?tab=gaps&source=${group}`}
                      className="group flex items-center gap-3 rounded-[14px] border border-black/[0.08] bg-white px-3.5 py-3 transition-colors hover:border-black/[0.16]"
                    >
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-[#111110]">
                        {cluster.question}
                      </p>
                      <span className="shrink-0 rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[11px] font-semibold text-[#615D59]">
                        {group === "internal_cs" ? "내부CS" : "챗봇"}
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-[#615D59]">
                        샘플 {cluster.sampleCount}건
                      </span>
                      <span className="hidden shrink-0 text-[12px] text-[#1a1a1a]/40 sm:inline">
                        {relativeTime(cluster.lastSeenAt)}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 transition-colors group-hover:text-[#084734]" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
