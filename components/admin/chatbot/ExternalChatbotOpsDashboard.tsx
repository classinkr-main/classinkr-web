"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
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
// 이 화면은 운영 지표 6카드만 남긴 순수 대시보드다.
//  - 알파 준비도·품질 평가는 DocsGapsPanel과 두 벌로 중복돼 있었고, AI 품질 검수
//    (/admin/docs?tab=quality, components/admin/docs/DocsQualityPanel.tsx)로 통합됐다(§7).
//  - 바로가기 카드 3개와 "내부 CS 챗봇 열기" 링크는 콘솔 가로 메뉴(CsConsoleNav)가 대체한다.
//    보강 큐 source 프리셋 딥링크(?tab=gaps&source=chatbot)는 계약으로 살아 있고(§11),
//    같은 상태는 미해결 큐 화면의 소스 칩(전체/챗봇/내부CS)으로도 도달한다.
// 상세 화면(질문 패턴·문서 없는 질문·초안 생성)은 그대로 미해결 큐(/admin/docs?tab=gaps)에 있다.

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

// 마운트 시 1회 자동 로드 → 실패하면 수동 "다시 시도"로만 재조회한다(무한 재시도 금지).
// components/admin/cs-chat/InternalCsChatWorkspace.tsx의 지표 카드 로드 관례를 그대로 따른다.
type AsyncLoadState = "loading" | "loaded" | "failed"

// 사이드바·콘솔 hover-warmup의 캐시 키와 byte-동일해야 적중한다(warmAdminRequestCache).
const CHATBOT_STATS_URL = "/api/admin/chatbot/stats"
const STATS_CACHE_TTL_MS = 60_000

function pct(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

function ms(value: number | null | undefined) {
  if (value == null) return "—"
  if (value >= 1000) return `${(value / 1000).toFixed(1)}초`
  return `${value}ms`
}

export default function ExternalChatbotOpsDashboard() {
  const [stats, setStats] = useState<ChatbotStatsSummary | null>(null)
  const [statsState, setStatsState] = useState<AsyncLoadState>("loading")

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
    return () => {
      cancelled = true
    }
  }, [])

  const totals = stats?.totals ?? { questionCount: 0, unresolvedCount: 0, handoffCount: 0 }
  const questionCount = totals.questionCount || 0
  const unresolvedRate = questionCount === 0 ? 0 : totals.unresolvedCount / questionCount
  const handoffRate = questionCount === 0 ? 0 : totals.handoffCount / questionCount
  const statsReady = statsState === "loaded"

  const metricCards = [
    { key: "questions", icon: MessageSquare, label: "질문량", value: `${totals.questionCount}건` },
    { key: "unresolved", icon: AlertTriangle, label: "미해결률", value: `${totals.unresolvedCount}건 · ${pct(unresolvedRate)}` },
    { key: "handoff", icon: Headset, label: "상담 이관", value: `${totals.handoffCount}건 · ${pct(handoffRate)}` },
    { key: "latency", icon: Clock3, label: "응답 속도", value: ms(stats?.latency.avgMs) },
    { key: "confidence", icon: Gauge, label: "평균 신뢰도", value: pct(stats?.avgConfidence) },
    { key: "channel", icon: Send, label: "채널톡 전송", value: `${stats?.channelHandoffs?.sent ?? 0}/${stats?.channelHandoffs?.total ?? 0}` },
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
            공개 챗봇의 질문 흐름과 상담 이관 신호를 확인합니다.
          </p>
        </header>

        {/* 2. 지표 카드 행 */}
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
                <div key={card.key} className="rounded-[14px] border border-black/[0.06] bg-[#FAFAF8] p-3">
                  <div className="flex items-center gap-1.5 text-[#615D59]">
                    <Icon className="h-3.5 w-3.5" />
                    <p className="text-[11px] font-medium">{card.label}</p>
                  </div>
                  <p className="mt-2 text-lg font-bold tabular-nums">{statsReady ? card.value : "—"}</p>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
