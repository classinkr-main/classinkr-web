"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CalendarClock, ExternalLink, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react"

import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import type {
  CrmInsightListItem,
  CrmInsights,
  CrmInsightSourceKey,
  CrmInsightTone,
} from "@/lib/repositories/crm-insights"

const INSIGHTS_URL = "/api/admin/crm/insights"
const CACHE_TTL_MS = 90_000

function toneClass(tone: CrmInsightTone) {
  if (tone === "risk") return "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
  if (tone === "warn") return "border-[#F1E2B8] bg-[#FFF8E6] text-[#8D6C1F]"
  if (tone === "ok") return "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
  return "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55"
}

function InsightList({
  title,
  icon,
  items,
  emptyLabel,
  loading,
}: {
  title: string
  icon: React.ReactNode
  items: CrmInsightListItem[]
  emptyLabel: string
  loading: boolean
}) {
  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fafaf8] text-[#1a1a1a]/45">
          {icon}
        </span>
        <h2 className="text-[15px] font-bold text-[#111110]">{title}</h2>
      </div>
      {items.length > 0 ? (
        <div className="divide-y divide-[#f0f0ec]">
          {items.map((item) => (
            <Link key={item.id} href={item.href} className="group flex items-start gap-3 py-3">
              <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border ${toneClass(item.tone)}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-[#111110]">{item.title}</span>
                <span className="mt-0.5 block truncate text-[12px] text-[#1a1a1a]/45">{item.detail}</span>
              </span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[13px] text-[#1a1a1a]/40">
          {loading ? "계산 중입니다..." : emptyLabel}
        </div>
      )}
    </section>
  )
}

function hasUnavailableSource(data: CrmInsights | null, source: CrmInsightSourceKey) {
  return data?.health.unavailableSources.includes(source) ?? false
}

function formatCount(value: number | undefined) {
  return (value ?? 0).toLocaleString("ko-KR")
}

function kpiValue({
  data,
  loading,
  source,
  value,
  suffix = "",
}: {
  data: CrmInsights | null
  loading: boolean
  source: CrmInsightSourceKey
  value: number | undefined
  suffix?: string
}) {
  if (loading && !data) return "..."
  if (hasUnavailableSource(data, source)) return "미확인"
  if (source === "coverage") {
    const coverageState = data?.health.coverage.state
    if (coverageState === "failed") return "미확인"
    if (coverageState === "no_data") return "없음"
  }
  return `${formatCount(value)}${suffix}`
}

export default function CrmInsightsClient() {
  const [data, setData] = useState<CrmInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (options?: { force?: boolean }) => {
    const cached = getCachedAdminJson<CrmInsights>(INSIGHTS_URL, { cacheKey: INSIGHTS_URL })
    if (cached && !options?.force) setData(cached)

    setLoading(!cached)
    setRefreshing(Boolean(options?.force))
    setError(null)
    try {
      const next = await adminFetchJsonCached<CrmInsights>(
        options?.force ? `${INSIGHTS_URL}?force=1` : INSIGHTS_URL,
        undefined,
        {
          cacheKey: INSIGHTS_URL,
          ttlMs: CACHE_TTL_MS,
          staleWhileRevalidateMs: 5 * 60_000,
          force: options?.force,
        }
      )
      setData(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "CRM 인사이트를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const initialLoading = loading && !data
  const partialWarnings = data?.health.status === "partial" ? data.health.warnings : []
  const coverageState = data?.health.coverage.state
  const priorityUnavailable = hasUnavailableSource(data, "priority")
  const businessUnavailable = hasUnavailableSource(data, "business")

  return (
    <div className="min-h-screen bg-[#F6F5F4] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">
              Admin · CRM · Insights
            </p>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">CRM 인사이트</h1>
            <p className="mt-1 text-[13px] text-[#1a1a1a]/42">
              ClassIn 고객 DB 기준 리스크와 기회를 운영 액션으로 묶어 봅니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load({ force: true })}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] lg:w-auto"
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
            {error}
          </div>
        ) : null}
        {!error && partialWarnings.length > 0 ? (
          <div className="mb-4 rounded-xl border border-[#F1E2B8] bg-[#FFF8E6] px-3 py-2 text-[12px] font-medium text-[#8D6C1F]">
            일부 CRM 원천 확인이 제한됩니다. {partialWarnings[0]}
          </div>
        ) : null}
        {!error && coverageState === "no_data" ? (
          <div className="mb-4 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/55">
            연결 데이터가 없어 동기화 정합성을 0%로 표시하지 않습니다.
          </div>
        ) : null}

        <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-[#fafaf8] p-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">우선 연락</p>
              <p className="mt-1 text-2xl font-bold text-[#111110]">
                {kpiValue({ data, loading, source: "priority", value: data?.kpis.priorityTotal })}
              </p>
              <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
                {priorityUnavailable
                  ? "우선 연락 확인 필요"
                  : `긴급 ${formatCount(data?.kpis.criticalPriorityCount)}건`}
              </p>
            </div>
            <div className="rounded-xl bg-[#fafaf8] p-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">미수 리스크</p>
              <p className="mt-1 text-2xl font-bold text-[#B85C33]">
                {kpiValue({ data, loading, source: "business", value: data?.kpis.paymentRiskCount })}
              </p>
              <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
                {businessUnavailable ? "고객 DB 집계 확인 필요" : "돈흐름 확인 필요"}
              </p>
            </div>
            <div className="rounded-xl bg-[#fafaf8] p-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">동기화 정합성</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  coverageState === "failed"
                    ? "text-[#B85C33]"
                    : coverageState === "no_data"
                      ? "text-[#8D6C1F]"
                      : "text-[#084734]"
                }`}
              >
                {kpiValue({ data, loading, source: "coverage", value: data?.kpis.coveragePct, suffix: "%" })}
              </p>
              <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
                {coverageState === "no_data"
                  ? "연결 원천 없음"
                  : coverageState === "failed"
                    ? "정합성 확인 필요"
                    : `검토 대기 ${formatCount(data?.kpis.needsReviewCount)}건`}
              </p>
            </div>
            <div className="rounded-xl bg-[#fafaf8] p-3">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">이번 주 일정</p>
              <p className="mt-1 text-2xl font-bold text-[#111110]">
                {kpiValue({ data, loading, source: "business", value: data?.kpis.upcomingThisWeekCount })}
              </p>
              <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
                {businessUnavailable ? "일정 집계 확인 필요" : "설치·방문 예정"}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <InsightList
            title="리스크"
            icon={<AlertTriangle className="h-4 w-4" />}
            items={data?.risks ?? []}
            emptyLabel="현재 표시할 주요 리스크가 없습니다."
            loading={initialLoading}
          />
          <InsightList
            title="기회"
            icon={<TrendingUp className="h-4 w-4" />}
            items={data?.opportunities ?? []}
            emptyLabel="최근 오더나 접촉 기회가 없습니다."
            loading={initialLoading}
          />
          <InsightList
            title="운영"
            icon={<ShieldCheck className="h-4 w-4" />}
            items={data?.operations ?? []}
            emptyLabel="운영 점검 항목이 없습니다."
            loading={initialLoading}
          />
        </div>

        {initialLoading ? (
          <div className="mt-4 rounded-xl border border-[#e8e8e4] bg-white p-6 text-center text-[13px] text-[#1a1a1a]/40">
            인사이트를 계산 중입니다...
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <Link
            href="/admin/calendar"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            일정 보기
          </Link>
        </div>
      </div>
    </div>
  )
}
