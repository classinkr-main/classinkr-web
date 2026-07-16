"use client"

import { Activity, CalendarDays, ChevronRight, Mail } from "lucide-react"
import { Skeleton } from "@/components/admin/viz"

const KRW = new Intl.NumberFormat("ko-KR")
const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
const won = (n: number | null | undefined) => (n == null ? "—" : KRW_CURRENCY.format(Math.round(n)))
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`)

function money(value: number | null | undefined, currency = "USD") {
  if (value == null) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export interface ChannelHubAggregateProps {
  totalSpend: number
  totalRevenue: number
  totalLeads: number
  totalDeals: number
  totalAttendees: number
  avgCpl: number | null
  overallRoi: number | null
  dealConversionRate: number | null
}

export interface ChannelHubMetaProps {
  summary: {
    spend: number
    leads: number
    impressions: number
    clicks: number
    ctr: number | null
    cpc: number | null
    activeCount: number
    campaignCount: number
  }
  account: { currency?: string }
}

export interface ChannelHubEmailProps {
  totalSubscribers: number
  activeSubscribers: number
  sentCampaigns: number
  newThisMonth: number
}

interface StatCell {
  label: string
  value: string
  accent?: boolean
  loading?: boolean
}

// 4칸을 각각 rounded 박스로 중첩하지 않고, 2x2를 divide-x/divide-y로만 구분한다
// (design-taste Rule4: elevation이 불필요한 미니 통계 셀은 카드-속-카드 대신 구분선으로 위계화).
function MiniStatGrid({ cells }: { cells: StatCell[] }) {
  const rows: StatCell[][] = []
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2))
  return (
    <div className="divide-y divide-[#f0f0ec] border-t border-[#f0f0ec]">
      {rows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-2 divide-x divide-[#f0f0ec]">
          {row.map((cell) => (
            <div key={cell.label} className="px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.15em] text-[#1a1a1a]/35">{cell.label}</p>
              {cell.loading ? (
                <Skeleton className="mt-1 h-4 w-14" />
              ) : (
                <p
                  className={`mt-0.5 text-[15px] font-bold leading-tight tabular-nums ${
                    cell.accent ? "text-[#084734]" : "text-[#111110]"
                  }`}
                >
                  {cell.value}
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function ChannelCard({
  icon,
  iconBg,
  title,
  subtitle,
  cells,
  placeholder,
  onDetail,
}: {
  icon: React.ReactNode
  iconBg: string
  title: string
  subtitle: string
  cells?: StatCell[]
  placeholder?: string
  onDetail: () => void
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex rounded-xl p-2 ${iconBg}`}>{icon}</span>
          <div>
            <p className="text-[13px] font-bold text-[#111110]">{title}</p>
            <p className="text-[11px] text-[#1a1a1a]/40">{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDetail}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#084734] hover:underline"
        >
          자세히
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      {cells ? (
        <MiniStatGrid cells={cells} />
      ) : (
        <p className="py-4 text-center text-[12px] text-[#1a1a1a]/30">{placeholder}</p>
      )}
    </div>
  )
}

export function ChannelHubCards({
  aggregate,
  metaDashboard,
  emailStats,
  loading,
  metaLoading,
  onGoTo,
}: {
  aggregate: ChannelHubAggregateProps
  metaDashboard: ChannelHubMetaProps | null
  emailStats: ChannelHubEmailProps | null
  loading: boolean
  metaLoading: boolean
  onGoTo: (tab: "events" | "meta" | "email") => void
}) {
  const currency = metaDashboard?.account.currency ?? "USD"

  const eventCells: StatCell[] = [
    { label: "리드", value: KRW.format(aggregate.totalLeads), accent: true, loading },
    { label: "딜", value: KRW.format(aggregate.totalDeals), loading },
    { label: "광고비", value: won(aggregate.totalSpend), loading },
    {
      label: "ROI",
      value: pct(aggregate.overallRoi),
      accent: aggregate.overallRoi != null && aggregate.overallRoi >= 0,
      loading,
    },
  ]

  const metaCpl =
    metaDashboard && metaDashboard.summary.leads > 0
      ? money(metaDashboard.summary.spend / metaDashboard.summary.leads, currency)
      : "—"

  const metaCells: StatCell[] | undefined = metaDashboard
    ? [
        { label: "광고비", value: money(metaDashboard.summary.spend, currency) },
        { label: "리드", value: KRW.format(metaDashboard.summary.leads), accent: true },
        {
          label: "CTR",
          value: metaDashboard.summary.ctr != null ? `${metaDashboard.summary.ctr.toFixed(2)}%` : "—",
        },
        { label: "CPL", value: metaCpl },
      ]
    : undefined

  const emailCells: StatCell[] | undefined = emailStats
    ? [
        { label: "구독자", value: KRW.format(emailStats.totalSubscribers) },
        { label: "활성", value: KRW.format(emailStats.activeSubscribers), accent: true },
        { label: "발송 캠페인", value: `${emailStats.sentCampaigns}건` },
        { label: "이번달 신규", value: `+${emailStats.newThisMonth}` },
      ]
    : undefined

  return (
    <div className="mb-5 grid gap-3 lg:grid-cols-3">
      <ChannelCard
        icon={<CalendarDays className="h-4 w-4" />}
        iconBg="bg-[#ECFDF5] text-[#084734]"
        title="행사 마케팅"
        subtitle="세미나 · 웨비나 · 설명회"
        cells={eventCells}
        onDetail={() => onGoTo("events")}
      />
      <ChannelCard
        icon={<Activity className="h-4 w-4" />}
        iconBg="bg-[#EEF2FF] text-[#3730a3]"
        title="Meta 광고"
        subtitle="Facebook · Instagram · 라이브"
        cells={metaLoading && !metaDashboard ? undefined : metaCells}
        placeholder={metaLoading ? "불러오는 중…" : "Meta 연동 정보 없음"}
        onDetail={() => onGoTo("meta")}
      />
      <ChannelCard
        icon={<Mail className="h-4 w-4" />}
        iconBg="bg-[#FFF7ED] text-[#B85C33]"
        title="이메일"
        subtitle="뉴스레터 · 타겟 발송"
        cells={emailCells}
        placeholder="이메일 통계 불러오는 중…"
        onDetail={() => onGoTo("email")}
      />
      {metaDashboard && (
        <p className="lg:col-span-3 px-1 text-[10.5px] leading-relaxed text-[#1a1a1a]/35">
          * 행사 광고비(₩ 직접 입력)와 Meta 라이브 광고비({currency})는 별개 소스입니다. 통화가 달라 단순 합산하지 마세요.
        </p>
      )}
    </div>
  )
}
