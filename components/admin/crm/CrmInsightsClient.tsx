"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CalendarClock, ChevronDown, ExternalLink, FileText, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react"

import { EmptyState } from "@/components/admin/viz"
import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import type { CustomerHealthBand } from "@/lib/crm/customer-health"
import { stageDistributionCounts, type StageFunnelResult } from "@/lib/crm/stage-funnel"
import type {
  CrmInsightListItem,
  CrmInsights,
  CrmInsightSourceKey,
  CrmInsightTone,
} from "@/lib/repositories/crm-insights"
import type {
  CrmHealthDistributionOwnerRow,
  CrmHealthDistributionWithOwners,
} from "@/lib/repositories/crm-unified-customers"
import CompassPipelineSection from "./insights/CompassPipelineSection"
import CrmManagerReportPanel from "./CrmManagerReportPanel"
import { useVisibleInterval } from "@/components/admin/branch/use-visible-interval"
import { ScoreKindTable } from "./ScoreKind"

const INSIGHTS_URL = "/api/admin/crm/insights"
// 코크핏 도넛(CrmHealthDonut)과 같은 cacheKey — 같은 키는 같은 TTL/SWR(SSOT)로만 부른다(H8).
const HEALTH_DISTRIBUTION_URL = "/api/admin/crm/health-distribution"

interface HealthDistributionResponse {
  distribution: CrmHealthDistributionWithOwners
  generatedAt: string
}

// 건강도 밴드 상태색(DESIGN.md 운영 상태 스케일). 상태색은 항상 텍스트 라벨과 함께 쓴다 —
// 범례는 색+텍스트, 세그먼트는 건수 직접 표기, 좁으면 title로 보강.
const HEALTH_BANDS: ReadonlyArray<{
  key: CustomerHealthBand
  label: string
  bg: string
  fg: string
  border: string
}> = [
  { key: "safe", label: "안전", bg: "#084734", fg: "#FFFFFF", border: "#084734" },
  { key: "watch", label: "주의", bg: "#ECD29C", fg: "#7A520F", border: "#7A520F" },
  { key: "risk", label: "위험", bg: "#F2B8B8", fg: "#8F2C2C", border: "#8F2C2C" },
]

function formatClock(iso: string | null | undefined) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
}

// 리드 3단계만 통합 고객 leads 보드 필터로 딥링크한다. 딜 6단계는 /admin/crm/deals가
// stage 쿼리 파라미터를 받지 않아(조사 결과 — 그 경로는 매출 대시보드다) 링크를 생략한다.
const STAGE_FUNNEL_HREF: Record<string, string> = {
  lead_new: "/admin/crm/customers/leads?filter=new",
  lead_contacted: "/admin/crm/customers/leads?filter=contacted",
  lead_converted: "/admin/crm/customers/leads?filter=converted",
}

/** 원천별 현재 단계의 건수. 서로 다른 리드·딜 집단을 한 전환 퍼널로 연결하지 않는다. */
export function CrmStageFunnelSection({
  stageFunnel,
  generatedAt,
  loading,
}: {
  stageFunnel: StageFunnelResult | null
  generatedAt: string | null
  loading: boolean
}) {
  const clock = formatClock(generatedAt)
  const distribution = stageFunnel ? stageDistributionCounts(stageFunnel) : []

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4" aria-labelledby="crm-stage-funnel-title">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="crm-stage-funnel-title" className="text-[15px] font-bold text-[#111110]">
            현재 단계 분포 · 리드·딜
          </h2>
          <p className="mt-0.5 text-[11px] text-[#615D59]">
            현재 상태 기준 · 리드와 딜을 각각 집계
            {clock ? ` · 기준 ${clock}` : ""}
          </p>
        </div>
      </div>

      {stageFunnel ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {(["lead", "deal"] as const).map(group => {
              const rows = distribution.filter(stage => stage.group === group)
              const max = Math.max(1, ...rows.map(stage => stage.value))
              return <section key={group} aria-label={group === "lead" ? "리드 상태 건수" : "딜 단계 건수"}>
                <h3 className="mb-3 text-[13px] font-semibold text-[#615D59]">{group === "lead" ? "리드 상태" : "딜 단계"}</h3>
                <ul className="space-y-3">{rows.map(stage => {
                  const content = <><div className="mb-1 flex items-center justify-between gap-2 text-[12px]"><span className="text-[#111110]">{stage.label}</span><span data-stage={stage.key} data-count={stage.value} className="font-semibold tabular-nums text-[#111110]">{stage.value.toLocaleString("ko-KR")}건</span></div><div className="h-2 overflow-hidden rounded-sm bg-[#F6F5F4]"><div className="h-full bg-[#084734]" style={{ width: `${stage.value / max * 100}%` }} /></div></>
                  return <li key={stage.key}>{STAGE_FUNNEL_HREF[stage.key] ? <Link href={STAGE_FUNNEL_HREF[stage.key]} className="block min-h-11 rounded-md hover:bg-[#F6F5F4]">{content}</Link> : <div>{content}</div>}</li>
                })}</ul>
              </section>
            })}
          </div>
          <p className="mt-3 text-[10px] text-[#615D59]">
            리드 종료 <span className="tabular-nums">{stageFunnel.closed.toLocaleString("ko-KR")}</span>건 · 딜
            이탈 <span className="tabular-nums">{stageFunnel.lost.toLocaleString("ko-KR")}</span>건 · 종료 상태 별도 집계
          </p>
        </>
      ) : loading ? (
        <div className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[13px] text-[#615D59]">계산 중입니다...</div>
      ) : (
        <EmptyState
          title="딜 단계 집계를 가져오지 못했습니다."
          description="CRM deal 마이그레이션 적용 여부와 조회 상태를 확인하세요."
        />
      )}
    </section>
  )
}

/**
 * 담당별 건강도 스택바(T2). 담당 한 줄 = 안전/주의/위험 순서의 수평 스택, 막대 길이는 담당 중 최대
 * 건수 대비, 세그먼트 폭은 그 담당 안의 비율. 담당 클릭 링크는 두지 않는다 — 통합 고객 화면이
 * ?owner= 딥링크를 받지 않아(view=my_owner만) 링크가 착지해도 필터가 걸리지 않는다.
 */
export function CrmHealthByOwnerSection({
  distribution,
  generatedAt,
  loading,
}: {
  distribution: CrmHealthDistributionWithOwners | null
  generatedAt: string | null
  loading: boolean
}) {
  const rows: CrmHealthDistributionOwnerRow[] = distribution?.byOwner ?? []
  const maxTotal = rows.reduce((max, row) => Math.max(max, row.total), 0)
  const clock = formatClock(generatedAt)

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4" aria-labelledby="crm-health-by-owner-title">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="crm-health-by-owner-title" className="text-[15px] font-bold text-[#111110]">
            담당별 건강도
          </h2>
          <p className="mt-0.5 text-[11px] text-[#615D59]">
            활성 고객(NEO) 건강도 밴드 · 담당자별 건수
            {distribution ? (
              <>
                {" · 전체 "}
                <span className="tabular-nums">{distribution.total.toLocaleString("ko-KR")}</span>건
              </>
            ) : null}
            {clock ? ` · 기준 ${clock}` : ""}
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="범례">
          {HEALTH_BANDS.map((band) => (
            <li key={band.key} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#31302E]">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-[3px] border"
                style={{ backgroundColor: band.bg, borderColor: band.border }}
              />
              {band.label}
              {distribution ? (
                <span className="font-normal tabular-nums text-[#615D59]">
                  {distribution[band.key].toLocaleString("ko-KR")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {rows.length > 0 ? (
        <ol className="space-y-2" data-testid="crm-health-by-owner-rows">
          {rows.map((row) => {
            const widthPct = maxTotal > 0 ? (row.total / maxTotal) * 100 : 0
            const summary = HEALTH_BANDS.map((band) => `${band.label} ${row[band.key].toLocaleString("ko-KR")}건`).join(" · ")
            return (
              <li
                key={row.ownerId ?? `name:${row.ownerName}`}
                className="flex items-center gap-3"
                data-owner-id={row.ownerId ?? undefined}
              >
                <span className="w-24 shrink-0 truncate text-[12px] font-semibold text-[#111110]" title={row.ownerName}>
                  {row.ownerName}
                </span>
                <div className="h-7 flex-1 rounded-lg bg-[#F6F5F4]">
                  <div
                    className="flex h-full gap-[2px]"
                    style={{ width: `${Math.max(widthPct, 4)}%` }}
                    role="img"
                    aria-label={`${row.ownerName} · ${summary} · 합계 ${row.total.toLocaleString("ko-KR")}건`}
                  >
                    {HEALTH_BANDS.map((band) => {
                      const count = row[band.key]
                      if (count <= 0) return null
                      const label = `${band.label} ${count.toLocaleString("ko-KR")}건`
                      return (
                        <span
                          key={band.key}
                          data-band={band.key}
                          title={label}
                          className="flex min-w-0 items-center justify-center overflow-hidden rounded-[4px] border px-1 text-[11px] font-bold tabular-nums"
                          style={{ flex: `${count} 1 0%`, backgroundColor: band.bg, color: band.fg, borderColor: band.border }}
                        >
                          <span className="truncate">{count.toLocaleString("ko-KR")}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
                <span className="w-12 shrink-0 text-right text-[12px] font-semibold tabular-nums text-[#31302E]">
                  {row.total.toLocaleString("ko-KR")}
                </span>
              </li>
            )
          })}
        </ol>
      ) : loading && !distribution ? (
        <div className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[13px] text-[#615D59]">계산 중입니다...</div>
      ) : (
        <EmptyState title="담당자별 건강도를 표시할 활성 고객이 없습니다." description="NEO 활성 고객이 동기화되면 담당자별 안전·주의·위험 건수가 여기에 쌓입니다." />
      )}
      <p className="mt-2 text-[10px] text-[#615D59]">
        건강도 = 100 감점식(75 이상 안전 · 55 이상 주의 · 그 아래 위험) · 막대 길이는 담당 중 최다 건수 대비 · 금액 합산 없음
      </p>
    </section>
  )
}

/** 점수 3종 정의(T3) — 건강도 차트 바로 아래, 접을 수 있고 기본 열림. */
export function CrmScoreKindDefinitionsSection() {
  return (
    <details open className="group mb-4 rounded-2xl border border-[#e8e8e4] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[13px] font-bold text-[#111110] [&::-webkit-details-marker]:hidden">
        <span>점수 3종 정의</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[#615D59] transition-transform group-open:rotate-0 -rotate-90" />
      </summary>
      <div className="border-t border-[#e8e8e4] px-4 pb-4 pt-3">
        <p className="mb-2 text-[11px] text-[#615D59]">
          건강도·리드 점수·우선순위는 서로 다른 산식이다. 화면의 숫자 옆에는 항상 어떤 점수인지 붙인다.
        </p>
        <ScoreKindTable />
      </div>
    </details>
  )
}

function toneClass(tone: CrmInsightTone) {
  if (tone === "risk") return "border-[#F2B8B8] bg-[#FCE9E9] text-[#B43E3E]"
  if (tone === "warn") return "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"
  if (tone === "ok") return "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
  return "border-[#e8e8e4] bg-[#fafaf8] text-[#615D59]"
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
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fafaf8] text-[#615D59]">
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
                <span className="mt-0.5 block truncate text-[12px] text-[#615D59]">{item.detail}</span>
              </span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[13px] text-[#615D59]">
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

interface LeadChannelStat {
  source: string
  total: number
  converted: number
  rate: number
}

export default function CrmInsightsClient() {
  const [data, setData] = useState<CrmInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [channelError, setChannelError] = useState<string | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [channels, setChannels] = useState<LeadChannelStat[]>([])
  const [healthDistribution, setHealthDistribution] = useState<HealthDistributionResponse | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  /** 새로고침이 퍼널·채널 블록까지 닿게 하는 키(0이면 첫 로드 — 캐시 사용). */
  const [secondaryRefreshKey, setSecondaryRefreshKey] = useState(0)
  // 주간 리포트(narrative)는 보고성 — 기본 접힘으로 스캔 지표(퍼널·채널·KPI)를 먼저.
  const [reportOpen, setReportOpen] = useState(false)

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
          ttlMs: CRM_CACHE_TTL_MS,
          staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
          force: options?.force,
          onRevalidated: ({ data: fresh }) => {
            if (fresh) setData(fresh)
          },
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

  // 단계 퍼널(T1)은 getCrmInsights 응답의 additive stageFunnel을 그대로 쓴다 — 별도 fetch가
  // 필요 없다(과거엔 action-kpis를 로컬로 다시 불러 리드 3단계만 그렸다).
  //
  // 채널별 전환율 — lead-channels 집계. 새로고침이 이 블록에 닿지 않아, 리드를 등록하고
  // 새로고침해도 채널은 첫 로드 값 그대로였다(빈 의존성 배열이라 effect가 다시 돌지 않는다).
  // refreshKey로 함께 강제 재조회한다.
  useEffect(() => {
    let alive = true
    adminFetchJsonCached<{ channels: LeadChannelStat[] }>("/api/admin/crm/lead-channels", undefined, {
      cacheKey: "/api/admin/crm/lead-channels",
      ttlMs: 120_000,
      staleWhileRevalidateMs: 300_000,
      force: secondaryRefreshKey > 0,
    })
      .then((d) => {
        if (alive) { setChannels(d?.channels ?? []); setChannelError(null) }
      })
      .catch(() => { if (alive) setChannelError("채널별 집계를 확인하지 못했습니다.") })
    return () => {
      alive = false
    }
  }, [secondaryRefreshKey])

  // 담당별 건강도(T2) — 코크핏 도넛과 같은 라우트·cacheKey·TTL/SWR(SSOT). 새로고침 키를 공유한다.
  useEffect(() => {
    let alive = true
    setHealthLoading(true)
    adminFetchJsonCached<HealthDistributionResponse>(HEALTH_DISTRIBUTION_URL, undefined, {
      cacheKey: HEALTH_DISTRIBUTION_URL,
      ttlMs: CRM_CACHE_TTL_MS,
      staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
      force: secondaryRefreshKey > 0,
      onRevalidated: ({ data: fresh }) => {
        if (alive && fresh) setHealthDistribution(fresh)
      },
    })
      .then((d) => {
        if (alive) { setHealthDistribution(d ?? null); setHealthError(null) }
      })
      .catch(() => { if (alive) setHealthError("고객 건강도 집계를 확인하지 못했습니다.") })
      .finally(() => {
        if (alive) setHealthLoading(false)
      })
    return () => {
      alive = false
    }
  }, [secondaryRefreshKey])

  useVisibleInterval(() => { if (!refreshing) { void load({ force: true }); setSecondaryRefreshKey(value => value + 1) } }, 60_000)

  const initialLoading = loading && !data
  const partialWarnings = data?.health.status === "partial" ? data.health.warnings : []
  const coverageState = data?.health.coverage.state
  const priorityUnavailable = hasUnavailableSource(data, "priority")
  const businessUnavailable = hasUnavailableSource(data, "business")

  return (
    // 바깥 패딩·배경은 app/admin/crm/layout.tsx가 책임진다 — 형제 클라이언트(홈·통합 고객)와
    // 같은 래퍼만 두어 이중 패딩을 없앤다(H8).
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">전체 분석</h1>
          <p className="mt-1 text-[13px] text-[#615D59]">
            영업 흐름·고객 건강도·Compass·지역 현황을 비교합니다. · 1분 자동 갱신
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void load({ force: true })
            setSecondaryRefreshKey((value) => value + 1)
          }}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] lg:w-auto"
          disabled={refreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[12px] font-medium text-[#B43E3E]">
          {error}
        </div>
      ) : null}
      {!error && partialWarnings.length > 0 ? (
        <div className="mb-4 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] font-medium text-[#7A520F]">
          일부 CRM 원천 확인이 제한됩니다. {partialWarnings[0]}
        </div>
      ) : null}
      {!error && coverageState === "no_data" ? (
        <div className="mb-4 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#615D59]">
          연결 데이터가 없어 동기화 정합성을 0%로 표시하지 않습니다.
        </div>
      ) : null}

      <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <p className="text-[11px] font-semibold text-[#615D59]">우선 연락</p>
            <p className="mt-1 text-2xl font-bold text-[#111110]">
              {kpiValue({ data, loading, source: "priority", value: data?.kpis.priorityTotal })}
            </p>
            <p className="mt-1 text-[11px] text-[#615D59]">
              {priorityUnavailable
                ? "우선 연락 확인 필요"
                : `긴급 ${formatCount(data?.kpis.criticalPriorityCount)}건`}
            </p>
          </div>
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <p className="text-[11px] font-semibold text-[#615D59]">미수 리스크</p>
            <p className="mt-1 text-2xl font-bold text-[#B43E3E]">
              {kpiValue({ data, loading, source: "business", value: data?.kpis.paymentRiskCount })}
            </p>
            <p className="mt-1 text-[11px] text-[#615D59]">
              {businessUnavailable ? "고객 DB 집계 확인 필요" : "돈흐름 확인 필요"}
            </p>
          </div>
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <p className="text-[11px] font-semibold text-[#615D59]">링크 확정률</p>
            <p
              className={`mt-1 text-2xl font-bold ${
                coverageState === "failed"
                  ? "text-[#B43E3E]"
                  : coverageState === "no_data"
                    ? "text-[#7A520F]"
                    : "text-[#084734]"
              }`}
            >
              {kpiValue({ data, loading, source: "coverage", value: data?.kpis.coveragePct, suffix: "%" })}
            </p>
            <p className="mt-1 text-[11px] text-[#615D59]">
              {coverageState === "no_data"
                ? "연결 원천 없음"
                : coverageState === "failed"
                  ? "정합성 확인 필요"
                  : `검토 대기 ${formatCount(data?.kpis.needsReviewCount)}건`}
            </p>
          </div>
          <div className="rounded-xl bg-[#fafaf8] p-3">
            <p className="text-[11px] font-semibold text-[#615D59]">이번 주 일정</p>
            <p className="mt-1 text-2xl font-bold text-[#111110]">
              {kpiValue({ data, loading, source: "business", value: data?.kpis.upcomingThisWeekCount })}
            </p>
            <p className="mt-1 text-[11px] text-[#615D59]">
              {businessUnavailable ? "일정 집계 확인 필요" : "설치·방문 예정"}
            </p>
          </div>
        </div>
      </section>

      <nav aria-label="분석 바로 가기" className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-[#084734]">
        <a href="#crm-stage-funnel-title" className="inline-flex min-h-11 items-center">영업 흐름</a>
        <a href="#crm-health-by-owner-title" className="inline-flex min-h-11 items-center">담당별 고객 건강도</a>
        <a href="#crm-compass-pipeline-title" className="inline-flex min-h-11 items-center">Compass 분석</a>
        <Link href="/admin/crm/customers/map?layer=compass" className="inline-flex min-h-11 items-center">Compass 지역 비교 →</Link>
      </nav>
      <button
        type="button"
        onClick={() => setReportOpen((value) => !value)}
        className="mb-4 flex w-full items-center justify-between gap-2 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-2.5 transition-colors hover:bg-[#fafaf8]"
        aria-expanded={reportOpen}
      >
        <span className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
          <FileText className="h-4 w-4 text-[#615D59]" />
          지사장 주간 점검 · 리포트
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#615D59] transition-transform ${reportOpen ? "" : "-rotate-90"}`}
        />
      </button>
      {reportOpen ? <CrmManagerReportPanel /> : null}

      <div className="grid items-start gap-4 xl:grid-cols-2">
      <CrmStageFunnelSection
        stageFunnel={data?.stageFunnel ?? null}
        generatedAt={data?.stageFunnelGeneratedAt ?? null}
        loading={initialLoading}
      />

      {channels.length > 0 ? (
        <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-[#111110]">채널별 전환율</h2>
            <span className="text-[11px] text-[#615D59]">유입 경로 · 전환 / 전체</span>
          </div>
          <div className="space-y-2">
            {channels.map((ch) => (
              <Link
                key={ch.source}
                href={`/admin/crm/customers/leads?source=${encodeURIComponent(ch.source)}`}
                className="-mx-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 py-2 sm:grid-cols-[100px_minmax(0,1fr)_120px] transition-colors hover:bg-[#fafaf8]"
              >
                <span className="min-w-0 truncate text-[12px] font-semibold text-[#111110]" title={ch.source}>
                  {ch.source}
                </span>
                <div className="col-span-2 row-start-2 h-3 overflow-hidden rounded-md bg-[#F6F5F4] sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:h-5">
                  <div
                    className="h-full rounded-md bg-[#084734]"
                    style={{ width: `${Math.min(100, Math.max(0, ch.rate * 100))}%` }}
                  />
                </div>
                <span className="text-right text-[12px] tabular-nums text-[#615D59]">
                  <b className="text-[#084734]">{Math.round(ch.rate * 100)}%</b> ·{" "}
                  {ch.converted.toLocaleString("ko-KR")}/{ch.total.toLocaleString("ko-KR")}
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-[#615D59]">전환율 = 전환 리드 / 전체 리드(채널별) · 건수 상위 8개</p>
        </section>
      ) : null}

      </div>
      {channelError || healthError ? <p role="status" className="mb-4 text-[13px] text-[#B43E3E]">{[channelError, healthError].filter(Boolean).join(" · ")} 최근 확인한 값이 있으면 유지합니다.</p> : null}
      <CrmHealthByOwnerSection
        distribution={healthDistribution?.distribution ?? null}
        generatedAt={healthDistribution?.generatedAt ?? null}
        loading={healthLoading}
      />
      <CompassPipelineSection />
      <CrmScoreKindDefinitionsSection />

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
        <div className="mt-4 rounded-xl border border-[#e8e8e4] bg-white p-6 text-center text-[13px] text-[#615D59]">
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
  )
}
