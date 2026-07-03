"use client"

import { useEffect, useState } from "react"
import { Users, UserCheck, UserMinus, TrendingUp } from "lucide-react"
import { adminFetchJson } from "@/lib/admin-client"

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface StatsData {
  subscribers: {
    total: number
    active: number
    unsubscribed: number
    newThisMonth: number
  }
  campaigns: {
    total: number
    recentCampaigns: Array<{
      id: string | number
      subject: string
      sentAt: string | null
      recipientCount: number
      status: "draft" | "sent" | "failed"
      tags: string[]
    }>
  }
  automation: {
    totalRules: number
    activeRules: number
    recentLogs: Array<{
      id: string
      ruleName: string
      triggeredAt: string
      recipientCount: number
      status: "pending" | "sent" | "failed"
    }>
  }
  tagDistribution: Array<{ tag: string; count: number }>
}

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

function CampaignStatusBadge({ status }: { status: "draft" | "sent" | "failed" }) {
  if (status === "sent") {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide"
        style={{ background: "#ECFDF5", color: "#084734" }}
      >
        발송 완료
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide bg-red-50 text-red-700">
        실패
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide bg-[#F6F5F4] text-[#615D59]">
      임시저장
    </span>
  )
}

function LogStatusBadge({ status }: { status: "pending" | "sent" | "failed" }) {
  if (status === "sent") {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide"
        style={{ background: "#ECFDF5", color: "#084734" }}
      >
        발송
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide bg-red-50 text-red-700">
        실패
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide bg-[#F6F5F4] text-[#615D59]">
      대기
    </span>
  )
}

// ─── 스켈레톤 ──────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-black/[0.06] ${className ?? ""}`} />
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-black/[0.08] bg-white p-5"
            style={{
              boxShadow:
                "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px",
            }}
          >
            <Skeleton className="mb-3 h-8 w-8" />
            <Skeleton className="mb-2 h-7 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>

      {/* 테이블 */}
      <div className="rounded-xl border border-black/[0.08] bg-white p-6">
        <Skeleton className="mb-4 h-5 w-28" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>

      {/* 자동화 */}
      <div className="rounded-xl border border-black/[0.08] bg-white p-6">
        <Skeleton className="mb-4 h-5 w-24" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>

      {/* 태그 분포 */}
      <div className="rounded-xl border border-black/[0.08] bg-white p-6">
        <Skeleton className="mb-4 h-5 w-20" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-6" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── 섹션 헤딩 ─────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-black/[0.06] pb-2 mb-4 text-sm font-semibold text-[#111110] tracking-tight">
      {children}
    </h2>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────

export default function MarketingDashboard() {
  const [data, setData] = useState<StatsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminFetchJson<StatsData>("/api/admin/marketing/stats")
      .then((json) => {
        setData(json)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSkeleton />

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-6 py-5 text-sm text-red-700">
        데이터를 불러오지 못했습니다: {error}
      </div>
    )
  }

  if (!data) return null

  const { subscribers, campaigns, automation, tagDistribution } = data
  const maxTagCount = tagDistribution[0]?.count ?? 1

  const kpiCards = [
    {
      icon: <Users size={20} strokeWidth={1.8} className="text-[#084734]" />,
      value: subscribers.total.toLocaleString("ko-KR"),
      label: "총 구독자",
    },
    {
      icon: <UserCheck size={20} strokeWidth={1.8} className="text-[#084734]" />,
      value: subscribers.active.toLocaleString("ko-KR"),
      label: "활성 구독자",
    },
    {
      icon: <UserMinus size={20} strokeWidth={1.8} className="text-[#615D59]" />,
      value: subscribers.unsubscribed.toLocaleString("ko-KR"),
      label: "수신 거부",
    },
    {
      icon: <TrendingUp size={20} strokeWidth={1.8} className="text-[#084734]" />,
      value: subscribers.newThisMonth.toLocaleString("ko-KR"),
      label: "이번달 신규",
    },
  ]

  return (
    <div className="space-y-8">
      {/* ── KPI 카드 ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-black/[0.08] bg-white p-5"
            style={{
              boxShadow:
                "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px, rgba(0,0,0,0.01) 0px 0.175px 1px",
            }}
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#ECFDF5]">
              {card.icon}
            </div>
            <p
              className="mb-0.5 text-[28px] font-bold leading-none text-[#111110]"
              style={{ letterSpacing: "-0.625px" }}
            >
              {card.value}
            </p>
            <p className="text-sm font-500 text-[#615D59]">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ── 최근 캠페인 ───────────────────────────────────────── */}
      <div
        className="rounded-xl border border-black/[0.08] bg-white p-6"
        style={{
          boxShadow:
            "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px",
        }}
      >
        <SectionHeading>최근 캠페인 (총 {campaigns.total}건)</SectionHeading>

        {campaigns.recentCampaigns.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#A39E98]">발송된 캠페인이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-[#A39E98]">
                    제목
                  </th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-[#A39E98]">
                    발송 수
                  </th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-[#A39E98]">
                    상태
                  </th>
                  <th className="pb-2 text-left text-xs font-semibold text-[#A39E98]">
                    발송일
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.recentCampaigns.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-black/[0.04] last:border-0"
                  >
                    <td className="py-3 pr-4 font-medium text-[#111110]">
                      <span className="line-clamp-1 max-w-[260px]">{c.subject}</span>
                    </td>
                    <td className="py-3 pr-4 text-[#615D59]">
                      {c.recipientCount.toLocaleString("ko-KR")}명
                    </td>
                    <td className="py-3 pr-4">
                      <CampaignStatusBadge status={c.status} />
                    </td>
                    <td className="py-3 text-[#615D59]">{formatDate(c.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 자동화 현황 ───────────────────────────────────────── */}
      <div
        className="rounded-xl border border-black/[0.08] bg-white p-6"
        style={{
          boxShadow:
            "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px",
        }}
      >
        <SectionHeading>자동화 현황</SectionHeading>

        {/* 요약 배지 행 */}
        <div className="mb-5 flex flex-wrap gap-3">
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-2.5"
            style={{ background: "#ECFDF5" }}
          >
            <span className="text-xs font-semibold text-[#A39E98]">전체 규칙</span>
            <span className="text-base font-bold text-[#111110]">
              {automation.totalRules}
            </span>
          </div>
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-2.5"
            style={{ background: "#ECFDF5" }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "#084734" }}
            />
            <span className="text-xs font-semibold text-[#A39E98]">활성</span>
            <span className="text-base font-bold text-[#084734]">
              {automation.activeRules}
            </span>
          </div>
        </div>

        {automation.recentLogs.length === 0 ? (
          <p className="py-4 text-center text-sm text-[#A39E98]">
            최근 실행 로그가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-[#A39E98]">
                    규칙명
                  </th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-[#A39E98]">
                    발송 수
                  </th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-[#A39E98]">
                    상태
                  </th>
                  <th className="pb-2 text-left text-xs font-semibold text-[#A39E98]">
                    실행일
                  </th>
                </tr>
              </thead>
              <tbody>
                {automation.recentLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-black/[0.04] last:border-0"
                  >
                    <td className="py-3 pr-4 font-medium text-[#111110]">
                      <span className="line-clamp-1 max-w-[220px]">
                        {log.ruleName || "—"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-[#615D59]">
                      {log.recipientCount.toLocaleString("ko-KR")}명
                    </td>
                    <td className="py-3 pr-4">
                      <LogStatusBadge status={log.status} />
                    </td>
                    <td className="py-3 text-[#615D59]">
                      {formatDate(log.triggeredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 태그 분포 ──────────────────────────────────────────── */}
      <div
        className="rounded-xl border border-black/[0.08] bg-white p-6"
        style={{
          boxShadow:
            "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px",
        }}
      >
        <SectionHeading>태그 분포 (상위 10개)</SectionHeading>

        {tagDistribution.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#A39E98]">
            태그 데이터가 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {tagDistribution.map(({ tag, count }) => {
              const pct = Math.round((count / maxTagCount) * 100)
              return (
                <div key={tag} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-right text-xs font-semibold text-[#615D59]">
                    {tag}
                  </span>
                  <div className="flex-1 rounded-full bg-[#F6F5F4]" style={{ height: 8 }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: "#084734",
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-semibold text-[#111110]">
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
