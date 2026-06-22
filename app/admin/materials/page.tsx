"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Magnet,
  RefreshCw,
  Target,
  Users,
} from "lucide-react"

import AdminTabs from "@/components/admin/AdminTabs"
import { adminFetchJsonCached } from "@/lib/admin-client"
import {
  getLeadMagnetCategoryLabel,
  getLeadMagnetGateLabel,
  getLeadMagnetTierLabel,
  type LeadMagnet,
} from "@/lib/lead-magnets"

type PeriodValue = "14" | "30" | "90"

interface LeadMagnetsResponse {
  leadMagnets: LeadMagnet[]
}

interface LeadMagnetMetricRow {
  slug: string
  impressions: number
  views: number
  submissions: number
  downloads: number
  ctaClicks: number
  leads: number
  convertedLeads: number
  conversionRate: number
  leadConversionRate: number
  lastEventAt: string | null
}

interface LeadMagnetMetricsResponse {
  days: number
  since: string
  generatedAt: string
  truncated: boolean
  totals: {
    impressions: number
    views: number
    submissions: number
    downloads: number
    ctaClicks: number
    leads: number
    convertedLeads: number
    conversionRate: number
    leadConversionRate: number
  }
  byLeadMagnet: LeadMagnetMetricRow[]
  recentEvents: Array<{
    eventName: string
    leadMagnet: string
    createdAt: string
    page: string | null
    source: string | null
  }>
  warning?: string
}

const PERIODS = [
  { value: "14", label: "14일" },
  { value: "30", label: "30일" },
  { value: "90", label: "90일" },
] as const

const EVENT_LABELS: Record<string, string> = {
  view_resource_card: "카드 노출",
  view_resource: "상세 조회",
  submit_newsletter: "신청",
  download_materials: "다운로드",
  click_cta: "CTA 클릭",
}

const EMPTY_ROW: Omit<LeadMagnetMetricRow, "slug"> = {
  impressions: 0,
  views: 0,
  submissions: 0,
  downloads: 0,
  ctaClicks: 0,
  leads: 0,
  convertedLeads: 0,
  conversionRate: 0,
  leadConversionRate: 0,
  lastEventAt: null,
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("ko-KR").format(value ?? 0)
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-"
  return `${value}%`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function metricScore(row: LeadMagnetMetricRow) {
  return row.leads * 8 + row.convertedLeads * 12 + row.downloads * 5 + row.ctaClicks * 3 + row.views
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <section className="rounded-2xl border border-black/[0.08] bg-white p-5">
      <div className="mb-4 inline-flex rounded-xl bg-[#ECFDF5] p-2 text-[#084734]">{icon}</div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#615D59]">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-[-0.02em] text-[#111110]">{value}</p>
      <p className="mt-2 text-[12px] leading-relaxed text-[#615D59]">{hint}</p>
    </section>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/[0.08] bg-[#FAFAF8] px-4 py-8 text-center text-[13px] text-[#615D59]">
      {label}
    </div>
  )
}

export default function AdminMaterialsPage() {
  const [period, setPeriod] = useState<PeriodValue>("30")
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([])
  const [metrics, setMetrics] = useState<LeadMagnetMetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const days = Number(period)
      const [leadMagnetData, metricData] = await Promise.all([
        adminFetchJsonCached<LeadMagnetsResponse>("/api/admin/lead-magnets", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
        adminFetchJsonCached<LeadMagnetMetricsResponse>(
          `/api/admin/lead-magnets/metrics?days=${days}`,
          undefined,
          { ttlMs: 60_000, force, staleIfError: !force }
        ),
      ])

      setLeadMagnets(leadMagnetData.leadMagnets ?? [])
      setMetrics(metricData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "자료 퍼널 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  const model = useMemo(() => {
    const metricsBySlug = new Map((metrics?.byLeadMagnet ?? []).map((row) => [row.slug, row]))
    const rows = leadMagnets.map((magnet) => ({
      magnet,
      metrics: metricsBySlug.get(magnet.slug) ?? { slug: magnet.slug, ...EMPTY_ROW },
    }))
    const published = rows.filter(({ magnet }) => magnet.published)
    const readyDownloads = published.filter(({ magnet }) => Boolean(magnet.storagePath || magnet.resourceUrl))
    const highIntent = rows
      .filter(({ magnet, metrics: row }) => (magnet.salesPlaybook?.intentScore ?? 0) >= 24 || row.leads > 0 || row.downloads > 0)
      .sort((left, right) => {
        const leftIntent = left.magnet.salesPlaybook?.intentScore ?? 0
        const rightIntent = right.magnet.salesPlaybook?.intentScore ?? 0
        return rightIntent + metricScore(right.metrics) - (leftIntent + metricScore(left.metrics))
      })
      .slice(0, 6)
    const topMaterials = [...rows]
      .sort((left, right) => metricScore(right.metrics) - metricScore(left.metrics))
      .slice(0, 8)
    const attention = rows
      .flatMap(({ magnet, metrics: row }) => {
        const items: Array<{ slug: string; title: string; reason: string; severity: "error" | "warning" | "info" }> = []
        if (magnet.published && !magnet.storagePath && !magnet.resourceUrl) {
          items.push({
            slug: magnet.slug,
            title: magnet.title,
            reason: "공개 자료인데 열람/다운로드 링크가 없습니다.",
            severity: "error",
          })
        }
        if (magnet.tier === "advanced" && magnet.gate === "login" && !magnet.storagePath) {
          items.push({
            slug: magnet.slug,
            title: magnet.title,
            reason: "고의도 로그인 게이트 자료에 Storage 파일이 연결되지 않았습니다.",
            severity: "warning",
          })
        }
        if (row.views >= 10 && row.leads === 0 && row.downloads === 0) {
          items.push({
            slug: magnet.slug,
            title: magnet.title,
            reason: "조회는 있지만 신청/다운로드가 없습니다. CTA와 게이트 문구를 점검하세요.",
            severity: "info",
          })
        }
        return items
      })
      .slice(0, 8)

    return {
      rows,
      published,
      readyDownloads,
      highIntent,
      topMaterials,
      attention,
      readyRate: published.length > 0 ? Math.round((readyDownloads.length / published.length) * 100) : 0,
    }
  }, [leadMagnets, metrics])

  const totals = metrics?.totals

  return (
    <div className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#615D59]">Admin</p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">자료 퍼널</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#615D59]">
            최근 추가된 자료를 리드·다운로드·상담 전환 기준으로 보고, 파일 연결과 후속 액션을 바로 정리합니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <AdminTabs
            label="자료 퍼널 기간"
            items={PERIODS}
            value={period}
            onValueChange={setPeriod}
            variant="subtle"
          />
          <button
            type="button"
            onClick={() => void load({ force: true })}
            disabled={refreshing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-6 flex items-start gap-2 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[13px] text-[#B85C33]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {metrics?.warning ? (
        <div className="mb-6 flex items-start gap-2 rounded-2xl border border-black/[0.08] bg-[#F6F5F4] px-4 py-3 text-[13px] text-[#615D59]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B85C33]" />
          <span>{metrics.warning}</span>
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={<Magnet className="h-5 w-5" />}
          label="공개 자료"
          value={loading ? "..." : formatNumber(model.published.length)}
          hint={`전체 ${formatNumber(model.rows.length)}개 중 공개 상태`}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="다운로드 준비율"
          value={loading ? "..." : `${model.readyRate}%`}
          hint={`${formatNumber(model.readyDownloads.length)}개 자료에 링크 또는 파일 연결`}
        />
        <MetricCard
          icon={<Users className="h-5 w-5" />}
          label="리드"
          value={loading ? "..." : formatNumber(totals?.leads)}
          hint={`전환 리드 ${formatNumber(totals?.convertedLeads)}건`}
        />
        <MetricCard
          icon={<Download className="h-5 w-5" />}
          label="다운로드"
          value={loading ? "..." : formatNumber(totals?.downloads)}
          hint={`상세 조회 ${formatNumber(totals?.views)}건`}
        />
        <MetricCard
          icon={<Target className="h-5 w-5" />}
          label="신청 전환율"
          value={loading ? "..." : formatPercent(totals?.conversionRate)}
          hint={`CTA 클릭 ${formatNumber(totals?.ctaClicks)}건`}
        />
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="flex flex-col gap-3 border-b border-black/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-[#111110]">오늘 먼저 볼 항목</h2>
              <p className="mt-1 text-[12px] text-[#615D59]">파일 누락, 고의도 자료, 조회 대비 무전환 자료를 모았습니다.</p>
            </div>
            <Link
              href="/admin/lead-magnets"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#111110] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2a2a28]"
            >
              편집 열기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-black/[0.08]">
            {model.attention.length === 0 ? (
              <div className="p-5">
                <EmptyState label="즉시 수정할 자료 이슈가 없습니다." />
              </div>
            ) : (
              model.attention.map((item) => (
                <div key={`${item.slug}-${item.reason}`} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[#111110]">{item.title}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">{item.reason}</p>
                      <p className="mt-2 text-[11px] text-[#615D59]">{item.slug}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                        item.severity === "error"
                          ? "bg-[#FEF3EE] text-[#B85C33]"
                          : item.severity === "warning"
                            ? "bg-[#F6F5F4] text-[#615D59]"
                            : "bg-[#ECFDF5] text-[#084734]"
                      }`}
                    >
                      {item.severity === "error" ? "필수" : item.severity === "warning" ? "점검" : "개선"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="border-b border-black/[0.08] px-5 py-4">
            <h2 className="text-[15px] font-bold text-[#111110]">고의도 후속 자료</h2>
            <p className="mt-1 text-[12px] text-[#615D59]">상담·데모 연결 가능성이 높은 자료와 담당자 응답 문구입니다.</p>
          </div>
          <div className="divide-y divide-black/[0.08]">
            {model.highIntent.length === 0 ? (
              <div className="p-5">
                <EmptyState label="고의도 자료 신호가 아직 없습니다." />
              </div>
            ) : (
              model.highIntent.map(({ magnet, metrics: row }) => (
                <div key={magnet.slug} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[#ECFDF5] p-2 text-[#084734]">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-[#111110]">{magnet.title}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">
                        {magnet.salesPlaybook?.firstResponse ?? magnet.summary}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-[#615D59]">
                        <span className="rounded-full bg-[#F6F5F4] px-2 py-1">
                          의도 {magnet.salesPlaybook?.intentScore ?? 0}
                        </span>
                        <span className="rounded-full bg-[#F6F5F4] px-2 py-1">리드 {formatNumber(row.leads)}</span>
                        <span className="rounded-full bg-[#F6F5F4] px-2 py-1">다운로드 {formatNumber(row.downloads)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-black/[0.08] bg-white">
        <div className="flex flex-col gap-3 border-b border-black/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-[#111110]">자료별 성과</h2>
            <p className="mt-1 text-[12px] text-[#615D59]">리드·전환·다운로드 순으로 운영 우선순위를 봅니다.</p>
          </div>
          <Link
            href="/admin/crm/customers/leads"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
          >
            CRM 리드 보기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-[13px]">
            <thead className="bg-[#F6F5F4] text-[11px] uppercase tracking-[0.12em] text-[#615D59]">
              <tr>
                <th className="px-5 py-3 font-semibold">자료</th>
                <th className="px-4 py-3 font-semibold">분류</th>
                <th className="px-4 py-3 text-right font-semibold">조회</th>
                <th className="px-4 py-3 text-right font-semibold">다운로드</th>
                <th className="px-4 py-3 text-right font-semibold">리드</th>
                <th className="px-4 py-3 text-right font-semibold">전환</th>
                <th className="px-5 py-3 font-semibold">최근 신호</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.08]">
              {model.topMaterials.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[#615D59]">
                    자료 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                model.topMaterials.map(({ magnet, metrics: row }) => (
                  <tr key={magnet.slug} className="align-top">
                    <td className="px-5 py-4">
                      <p className="max-w-[260px] font-semibold text-[#111110]">{magnet.title}</p>
                      <p className="mt-1 text-[11px] text-[#615D59]">{magnet.slug}</p>
                    </td>
                    <td className="px-4 py-4 text-[#615D59]">
                      <p>{getLeadMagnetCategoryLabel(magnet.category)}</p>
                      <p className="mt-1 text-[11px]">
                        {getLeadMagnetTierLabel(magnet.tier)} · {getLeadMagnetGateLabel(magnet.gate)}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-right text-[#111110]">{formatNumber(row.views)}</td>
                    <td className="px-4 py-4 text-right text-[#111110]">{formatNumber(row.downloads)}</td>
                    <td className="px-4 py-4 text-right text-[#111110]">{formatNumber(row.leads)}</td>
                    <td className="px-4 py-4 text-right text-[#111110]">{formatNumber(row.convertedLeads)}</td>
                    <td className="px-5 py-4 text-[#615D59]">{formatDateTime(row.lastEventAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="border-b border-black/[0.08] px-5 py-4">
            <h2 className="text-[15px] font-bold text-[#111110]">최근 자료 이벤트</h2>
          </div>
          <div className="divide-y divide-black/[0.08]">
            {(metrics?.recentEvents ?? []).length === 0 ? (
              <div className="p-5">
                <EmptyState label="최근 이벤트가 없습니다." />
              </div>
            ) : (
              (metrics?.recentEvents ?? []).slice(0, 8).map((event) => (
                <div key={`${event.createdAt}-${event.eventName}-${event.leadMagnet}`} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-semibold text-[#111110]">
                        {EVENT_LABELS[event.eventName] ?? event.eventName}
                      </p>
                      <p className="mt-1 text-[12px] text-[#615D59]">{event.leadMagnet}</p>
                    </div>
                    <p className="shrink-0 text-[11px] text-[#615D59]">{formatDateTime(event.createdAt)}</p>
                  </div>
                  {event.page || event.source ? (
                    <p className="mt-2 text-[11px] text-[#615D59]">
                      {event.page ?? "페이지 없음"} {event.source ? `· ${event.source}` : ""}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-[#ECFDF5] p-5">
          <h2 className="text-[15px] font-bold text-[#111110]">운영 기준</h2>
          <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-[#084734]">
            <p>1. 심화·로그인 게이트 자료는 Storage 파일 연결을 먼저 확인합니다.</p>
            <p>2. 조회 10회 이상인데 리드가 0건이면 CTA 문구와 폼 위치를 조정합니다.</p>
            <p>3. 다운로드 또는 리드가 생긴 자료는 CRM에서 24시간 안에 첫 응답을 남깁니다.</p>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/admin/docs?tab=gaps"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#084734] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41]"
            >
              문서 보강 큐
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/admin/analytics?tab=tracking"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
            >
              추적 상태 보기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
