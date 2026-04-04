"use client"

import { useEffect, useState } from "react"
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  FileText,
  FileClock,
  LayoutDashboard,
  Layers3,
  MapPinned,
  ReceiptText,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react"

import { PortalNav } from "@/components/partner-portal/PortalNav"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type PartnerReadMode = "v2" | "legacy" | "demo"

type OverviewMetrics = {
  customer_count: number
  active_deal_count: number
  installation_deal_count: number
  unpaid_deal_count: number
  contracted_amount: number
  installed_amount: number
  paid_amount: number
  outstanding_amount: number
}

type ActivityLog = {
  id: string
  summary: string
  action_type: string
  created_at: string
}

type InstallationEvent = {
  id: string
  title: string
  location: string | null
  scheduled_start_at: string
  scheduled_end_at: string
}

type PaymentRecord = {
  id: string
  amount: number
  paid_at: string
  payment_method: string
}

type CalendarEvent = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  source_type: string
}

type CustomerItem = {
  customer: {
    id: string
    name: string
    campus_name: string | null
    region_label: string | null
  }
  summary: {
    active_deals: number
    unpaid_deals: number
    outstanding_amount: number
    last_deal_updated_at: string | null
  } | null
}

type DealItem = {
  id: string
  title: string
  deal_code: string
  current_stage: string
  customer_name: string | null
  customer_campus_name: string | null
  expected_amount: number
  contracted_amount: number
  paid_amount: number
  outstanding_amount: number
}

type PartnerOverviewPayload = {
  mode: PartnerReadMode
  metrics: OverviewMetrics
  customers: CustomerItem[]
  deals: DealItem[]
  recent_activity: ActivityLog[]
  upcoming_installations: InstallationEvent[]
  recent_payments: PaymentRecord[]
  recent_calendar_events: CalendarEvent[]
}

const DEMO_OVERVIEW: PartnerOverviewPayload = {
  mode: "demo",
  metrics: {
    customer_count: 3,
    active_deal_count: 6,
    installation_deal_count: 2,
    unpaid_deal_count: 2,
    contracted_amount: 76500000,
    installed_amount: 41200000,
    paid_amount: 29800000,
    outstanding_amount: 46700000,
  },
  customers: [
    {
      customer: {
        id: "demo-customer-1",
        name: "강남메가스터디학원",
        campus_name: "본관",
        region_label: "강남",
      },
      summary: {
        active_deals: 3,
        unpaid_deals: 1,
        outstanding_amount: 31000000,
        last_deal_updated_at: "2026-04-04T02:00:00Z",
      },
    },
    {
      customer: {
        id: "demo-customer-2",
        name: "리더스입시학원",
        campus_name: "3층",
        region_label: "분당",
      },
      summary: {
        active_deals: 2,
        unpaid_deals: 1,
        outstanding_amount: 15600000,
        last_deal_updated_at: "2026-04-03T12:00:00Z",
      },
    },
  ],
  deals: [
    {
      id: "demo-deal-1",
      title: "본관 전자칠판 4대 설치",
      deal_code: "D-2026-001",
      current_stage: "installation",
      customer_name: "강남메가스터디학원",
      customer_campus_name: "본관",
      expected_amount: 29000000,
      contracted_amount: 29000000,
      paid_amount: 12000000,
      outstanding_amount: 17000000,
    },
    {
      id: "demo-deal-2",
      title: "추가 교실 계약",
      deal_code: "D-2026-011",
      current_stage: "quote",
      customer_name: "강남메가스터디학원",
      customer_campus_name: "본관",
      expected_amount: 14000000,
      contracted_amount: 14000000,
      paid_amount: 0,
      outstanding_amount: 14000000,
    },
  ],
  recent_activity: [
    { id: "a1", summary: "견적서 v3 링크 발송", action_type: "document", created_at: "2026-04-04T02:10:00Z" },
    { id: "a2", summary: "설치 일정 4/20-4/21 확정", action_type: "schedule", created_at: "2026-04-04T01:30:00Z" },
    { id: "a3", summary: "분할 수납 300만원 입금 확인", action_type: "payment", created_at: "2026-04-03T10:30:00Z" },
  ],
  upcoming_installations: [
    { id: "i1", title: "강남메가스터디학원 설치", location: "서울 강남구", scheduled_start_at: "2026-04-20T09:00:00+09:00", scheduled_end_at: "2026-04-21T17:00:00+09:00" },
  ],
  recent_payments: [
    { id: "p1", amount: 3000000, paid_at: "2026-04-03T10:30:00Z", payment_method: "bank_transfer" },
    { id: "p2", amount: 9000000, paid_at: "2026-04-01T09:10:00Z", payment_method: "bank_transfer" },
  ],
  recent_calendar_events: [
    { id: "c1", title: "견적 링크 만료 전 확인", starts_at: "2026-04-12T10:00:00+09:00", ends_at: "2026-04-12T11:00:00+09:00", source_type: "document_due" },
    { id: "c2", title: "추가 계약 조정 미팅", starts_at: "2026-04-16T14:00:00+09:00", ends_at: "2026-04-16T15:00:00+09:00", source_type: "meeting" },
  ],
}

function readJson<T>(url: string) {
  return fetch(url, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    return (await response.json()) as T
  })
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ko-KR")}원`
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  })
}

function formatTimeRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`
}

const QUICK_ACTIONS = [
  { label: "워크스페이스 열기", href: "/partner/workspace", icon: LayoutDashboard },
  { label: "캘린더 보기", href: "/partner/calendar", icon: CalendarDays },
  { label: "문서 확인", href: "/partner/documents", icon: FileText },
]

export function PartnerPortalHome() {
  const [overview, setOverview] = useState<PartnerOverviewPayload>(DEMO_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<PartnerReadMode>("demo")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const payload = await readJson<PartnerOverviewPayload>("/api/partner/overview")
        if (!alive) return

        setMode(payload.mode ?? "demo")
        setOverview(payload)
      } catch {
        if (!alive) return

        setMode("demo")
        setOverview(DEMO_OVERVIEW)
        setError("연결된 계정이 없어 데모 홈으로 전환했습니다.")
      } finally {
        if (alive) setLoading(false)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [])

  const latestCustomers = overview.customers.slice(0, 3)
  const latestDeals = overview.deals.slice(0, 4)
  const latestActivities = overview.recent_activity.slice(0, 4)

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#1a1a1a]">
      <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        <Card className="border-[#e8e8e4] bg-white shadow-none">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-[#1a1a1a]/15 bg-[#1a1a1a] text-white">
                  {mode === "demo" ? "DEMO" : "LIVE"}
                </Badge>
                <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/50">
                  {loading ? "SYNCING" : "Partner Home"}
                </Badge>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl text-[#1a1a1a]">
                파트너 포털 홈
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1a1a1a]/50">
                오늘의 설치, 문서, 수납, 다음 액션을 한 화면에서 보고 바로 작업 화면으로 넘어갑니다.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#1a1a1a]/50">
                <Chip icon={<Users className="h-3.5 w-3.5" />} label={`기관 ${overview.metrics.customer_count}개`} />
                <Chip icon={<Layers3 className="h-3.5 w-3.5" />} label={`진행 거래 ${overview.metrics.active_deal_count}건`} />
                <Chip icon={<CircleDollarSign className="h-3.5 w-3.5" />} label={`미수금 ${formatMoney(overview.metrics.outstanding_amount)}`} />
              </div>
            </div>

            <div className="space-y-3">
              <PortalNav />
              <div className="flex flex-wrap justify-end gap-2">
                <div className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-2.5 text-sm text-[#1a1a1a]/60">
                  <Sparkles className="h-4 w-4" />
                  오늘 바로 해야 할 일만 모아봤습니다
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="계약 총액" value={formatMoney(overview.metrics.contracted_amount)} />
                <MetricCard label="실수납" value={formatMoney(overview.metrics.paid_amount)} />
                <MetricCard label="설치 완료액" value={formatMoney(overview.metrics.installed_amount)} />
                <MetricCard label="미수 기관" value={`${overview.metrics.unpaid_deal_count}건`} />
              </CardContent>
            </Card>

            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon
                  return (
                    <a
                      key={action.href}
                      href={action.href}
                      className="group rounded-2xl border border-[#e8e8e4] bg-[#f7f7f5] p-4 transition-colors hover:bg-white"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#1a1a1a]">{action.label}</p>
                          <p className="mt-1 text-xs text-[#1a1a1a]/45">
                            {action.href.includes("calendar") ? "일정, 미팅, 설치를 달력으로" : "문서와 거래로 바로 이동"}
                          </p>
                        </div>
                        <Icon className="h-5 w-5 text-[#1a1a1a]/30 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </a>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {latestDeals.slice(0, 3).map((deal) => (
                  <div key={deal.id} className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a1a]">{deal.title}</p>
                        <p className="mt-1 text-xs text-[#1a1a1a]/45">{deal.deal_code}</p>
                      </div>
                      <span className="rounded-full bg-[#f0f0ec] px-2 py-1 text-[10px] font-medium text-[#1a1a1a]/55">
                        {deal.current_stage}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-[#1a1a1a]/45">{deal.customer_name}</p>
                    <p className="mt-2 text-sm font-semibold text-[#1a1a1a]">{formatMoney(deal.outstanding_amount)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardContent className="grid gap-6 p-5 xl:grid-cols-2">
                <section>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#1a1a1a]">최근 활동</h2>
                    <span className="text-xs text-[#1a1a1a]/40">업데이트 로그</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {latestActivities.map((item) => (
                      <div key={item.id} className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                        <p className="text-sm font-medium text-[#1a1a1a]">{item.summary}</p>
                        <p className="mt-1 text-xs text-[#1a1a1a]/45">
                          {item.action_type} · {formatShortDate(item.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#1a1a1a]">다가오는 일정</h2>
                    <a href="/partner/calendar" className="text-xs font-medium text-[#1a1a1a]/45 hover:text-[#1a1a1a]">
                      캘린더 열기
                    </a>
                  </div>
                  <div className="mt-4 space-y-3">
                    {overview.recent_calendar_events.slice(0, 3).map((event) => (
                      <div key={event.id} className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#1a1a1a]/40" />
                          <p className="text-sm font-medium text-[#1a1a1a]">{event.title}</p>
                        </div>
                        <p className="mt-2 text-xs text-[#1a1a1a]/45">
                          {formatShortDate(event.starts_at)} · {formatTimeRange(event.starts_at, event.ends_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardContent className="space-y-3 p-4">
                <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1a1a1a]/40">현재 상태</p>
                  <p className="mt-2 text-sm font-semibold text-[#1a1a1a]">
                    {overview.metrics.unpaid_deal_count > 0 ? "미수 확인 필요" : "수납 안정"}
                  </p>
                  <p className="mt-1 text-xs text-[#1a1a1a]/45">
                    설치 예정 {overview.metrics.installation_deal_count}건 · 고객 {overview.metrics.customer_count}개
                  </p>
                </div>

                <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1a1a1a]">
                    <Wrench className="h-4 w-4 text-amber-600" />
                    설치 예정
                  </div>
                  {overview.upcoming_installations[0] ? (
                    <>
                      <p className="mt-2 text-sm font-medium text-[#1a1a1a]">
                        {overview.upcoming_installations[0].title}
                      </p>
                      <p className="mt-1 text-xs text-[#1a1a1a]/45">
                        {overview.upcoming_installations[0].location ?? "장소 미지정"} · {formatShortDate(overview.upcoming_installations[0].scheduled_start_at)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-[#1a1a1a]/45">예정된 설치가 없습니다.</p>
                  )}
                </div>

                <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1a1a1a]">
                    <FileClock className="h-4 w-4 text-violet-600" />
                    문서 기한
                  </div>
                  {overview.recent_calendar_events.find((item) => item.source_type === "document_due") ? (
                    (() => {
                      const due = overview.recent_calendar_events.find((item) => item.source_type === "document_due")
                      return due ? (
                        <>
                          <p className="mt-2 text-sm font-medium text-[#1a1a1a]">{due.title}</p>
                          <p className="mt-1 text-xs text-[#1a1a1a]/45">{formatShortDate(due.starts_at)}</p>
                        </>
                      ) : null
                    })()
                  ) : (
                    <p className="mt-2 text-sm text-[#1a1a1a]/45">문서 기한 일정이 없습니다.</p>
                  )}
                </div>

                {latestCustomers.map((item) => (
                  <div key={item.customer.id} className="rounded-xl border border-[#e8e8e4] bg-white p-4">
                    <p className="text-sm font-semibold text-[#1a1a1a]">{item.customer.name}</p>
                    <p className="mt-1 text-xs text-[#1a1a1a]/45">
                      {item.customer.region_label ?? "지역 미지정"}
                      {item.customer.campus_name ? ` · ${item.customer.campus_name}` : ""}
                    </p>
                    <p className="mt-3 text-sm text-[#1a1a1a]/60">
                      진행 거래 {item.summary?.active_deals ?? 0}건 · 미수금 {formatMoney(item.summary?.outstanding_amount ?? 0)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#1a1a1a]">빠른 진입</h2>
                  <span className="text-xs text-[#1a1a1a]/40">작업 허브</span>
                </div>
                <QuickLink href="/partner/workspace" icon={<ClipboardList className="h-4 w-4" />} label="거래 작업" />
                <QuickLink href="/partner/calendar" icon={<MapPinned className="h-4 w-4" />} label="일정 확인" />
                <QuickLink href="/partner/documents" icon={<ReceiptText className="h-4 w-4" />} label="문서 확인" />
              </CardContent>
            </Card>

            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-sm font-semibold text-[#1a1a1a]">최근 수납</h2>
                {overview.recent_payments.slice(0, 3).map((payment) => (
                  <div key={payment.id} className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    <p className="text-sm font-semibold text-[#1a1a1a]">{formatMoney(payment.amount)}</p>
                    <p className="mt-1 text-xs text-[#1a1a1a]/45">
                      {payment.payment_method} · {formatShortDate(payment.paid_at)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-sm font-semibold text-[#1a1a1a]">문서 바로가기</h2>
                <QuickLink href="/partner/documents" icon={<FileText className="h-4 w-4" />} label="견적/계약 문서 열기" />
                <QuickLink href="/partner/calendar" icon={<CalendarDays className="h-4 w-4" />} label="캘린더에서 일정 보기" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[#e8e8e4] bg-white px-3 py-1.5">
      {icon}
      {label}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1a1a1a]/40">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#1a1a1a]">{value}</p>
    </div>
  )
}

function QuickLink({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-3 text-sm text-[#1a1a1a]/60 transition-colors hover:bg-white hover:text-[#1a1a1a]"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ArrowRight className="h-4 w-4" />
    </a>
  )
}
