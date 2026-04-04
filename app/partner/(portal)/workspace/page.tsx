"use client"

import { startTransition, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Layers3,
  MapPinned,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  CalendarEvent,
  CustomerListItem,
  DealDetailPayload,
  DealListItem,
} from "@/lib/partner-portal/types"
import type { PartnerReadMode } from "@/lib/partner-portal/repositories/partner-read"

type WorkspaceOverview = {
  mode: PartnerReadMode
  metrics: { customer_count: number; active_deal_count: number; outstanding_amount: number }
  customers: CustomerListItem[]
  deals: DealListItem[]
  recent_calendar_events: CalendarEvent[]
}

const DEMO_OVERVIEW: WorkspaceOverview = {
  mode: "demo",
  metrics: { customer_count: 2, active_deal_count: 3, outstanding_amount: 17000000 },
  customers: [
    {
      customer: {
        id: "demo-customer-1",
        partner_account_id: "demo-account",
        name: "강남메가수학학원",
        contact_name: "이준호",
        email: null,
        phone: "02-1234-5678",
        address: null,
        business_number: null,
        campus_name: "본관",
        region_label: "강남",
        notes: null,
        created_by: null,
        created_at: "2026-02-20T00:00:00Z",
        updated_at: "2026-04-04T00:00:00Z",
      } as CustomerListItem["customer"],
      summary: {
        customer_id: "demo-customer-1",
        partner_account_id: "demo-account",
        customer_name: "강남메가수학학원",
        total_deals: 2,
        active_deals: 2,
        installation_deals: 1,
        unpaid_deals: 1,
        contracted_amount: 43000000,
        installed_amount: 18000000,
        paid_amount: 12000000,
        outstanding_amount: 31000000,
        last_deal_updated_at: "2026-04-04T00:00:00Z",
      },
    },
    {
      customer: {
        id: "demo-customer-2",
        partner_account_id: "demo-account",
        name: "리더스입시학원",
        contact_name: "최민서",
        email: null,
        phone: "031-123-4567",
        address: null,
        business_number: null,
        campus_name: "3층관",
        region_label: "분당",
        notes: null,
        created_by: null,
        created_at: "2026-02-10T00:00:00Z",
        updated_at: "2026-04-04T00:00:00Z",
      } as CustomerListItem["customer"],
      summary: {
        customer_id: "demo-customer-2",
        partner_account_id: "demo-account",
        customer_name: "리더스입시학원",
        total_deals: 1,
        active_deals: 1,
        installation_deals: 1,
        unpaid_deals: 0,
        contracted_amount: 24200000,
        installed_amount: 24200000,
        paid_amount: 24200000,
        outstanding_amount: 0,
        last_deal_updated_at: "2026-04-04T00:00:00Z",
      },
    },
  ],
  deals: [
    {
      id: "demo-deal-1",
      partner_account_id: "demo-account",
      customer_id: "demo-customer-1",
      deal_code: "D-2026-001",
      title: "본관 2~4층 전자칠판 설치",
      status: "active",
      current_stage: "installation",
      expected_amount: 29000000,
      contracted_amount: 29000000,
      installed_amount: 18000000,
      paid_amount: 12000000,
      outstanding_amount: 17000000,
      payment_status: "partial",
      starts_at: "2026-02-22T00:00:00Z",
      closed_at: null,
      notes: null,
      created_by: null,
      created_at: "2026-02-22T00:00:00Z",
      updated_at: "2026-04-03T00:00:00Z",
      customer_name: "강남메가수학학원",
      customer_contact_name: "이준호",
      customer_region_label: "강남",
      customer_campus_name: "본관",
    } as DealListItem,
    {
      id: "demo-deal-2",
      partner_account_id: "demo-account",
      customer_id: "demo-customer-1",
      deal_code: "D-2026-011",
      title: "별관 추가 계약",
      status: "active",
      current_stage: "quote",
      expected_amount: 14000000,
      contracted_amount: 14000000,
      installed_amount: 0,
      paid_amount: 0,
      outstanding_amount: 14000000,
      payment_status: "unpaid",
      starts_at: "2026-03-28T00:00:00Z",
      closed_at: null,
      notes: null,
      created_by: null,
      created_at: "2026-03-28T00:00:00Z",
      updated_at: "2026-04-02T00:00:00Z",
      customer_name: "강남메가수학학원",
      customer_contact_name: "이준호",
      customer_region_label: "강남",
      customer_campus_name: "본관",
    } as DealListItem,
    {
      id: "demo-deal-3",
      partner_account_id: "demo-account",
      customer_id: "demo-customer-2",
      deal_code: "D-2026-004",
      title: "3층 전체 전자칠판 교체",
      status: "active",
      current_stage: "payment",
      expected_amount: 24200000,
      contracted_amount: 24200000,
      installed_amount: 24200000,
      paid_amount: 24200000,
      outstanding_amount: 0,
      payment_status: "paid",
      starts_at: "2026-02-12T00:00:00Z",
      closed_at: null,
      notes: null,
      created_by: null,
      created_at: "2026-02-12T00:00:00Z",
      updated_at: "2026-04-04T00:00:00Z",
      customer_name: "리더스입시학원",
      customer_contact_name: "최민서",
      customer_region_label: "분당",
      customer_campus_name: "3층관",
    } as DealListItem,
  ],
  recent_calendar_events: [
    {
      id: "demo-calendar-1",
      partner_account_id: "demo-account",
      customer_id: "demo-customer-1",
      deal_id: "demo-deal-1",
      source_type: "installation",
      source_id: "demo-install-1",
      starts_at: "2026-04-20T09:00:00+09:00",
      ends_at: "2026-04-20T17:00:00+09:00",
      timezone: "Asia/Seoul",
      title: "강남메가수학학원 설치",
      description: "서울시 강남구 역삼로 123",
      status: "active",
      created_by: null,
      created_at: "2026-04-03T09:00:00Z",
      updated_at: "2026-04-03T09:00:00Z",
    },
  ],
}

const DEMO_DETAIL: DealDetailPayload = {
  deal: {
    id: "demo-deal-1",
    partner_account_id: "demo-account",
    customer_id: "demo-customer-1",
    deal_code: "D-2026-001",
    title: "본관 2~4층 전자칠판 설치",
    status: "active",
    current_stage: "installation",
    expected_amount: 29000000,
    contracted_amount: 29000000,
    installed_amount: 18000000,
    paid_amount: 12000000,
    outstanding_amount: 17000000,
    payment_status: "partial",
    starts_at: "2026-02-22T00:00:00Z",
    closed_at: null,
    notes: "CB-86 4대, 스탠드 4대, T1 카메라 2대",
    created_by: null,
    created_at: "2026-02-22T00:00:00Z",
    updated_at: "2026-04-03T00:00:00Z",
  },
  customer: DEMO_OVERVIEW.customers[0].customer as DealDetailPayload["customer"],
  line_items: [],
  quote_documents: [],
  contract_documents: [],
  installations: [],
  payments: [],
  receipts: [],
  activity_logs: [],
  calendar_events: DEMO_OVERVIEW.recent_calendar_events,
}

function formatMoney(value: number | null | undefined) {
  if (value == null) return "-"
  return `${value.toLocaleString("ko-KR")}원`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function stageLabel(stage: DealListItem["current_stage"]) {
  return {
    contact: "컨택",
    quote: "견적",
    contract: "계약",
    confirmed: "확정",
    installation: "설치",
    payment: "수납",
    closed: "종결",
    cancelled: "취소",
  }[stage]
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const payload = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? "Failed to fetch")
  return payload
}

export default function PartnerWorkspacePage() {
  const router = useRouter()
  const [overview, setOverview] = useState<WorkspaceOverview>(DEMO_OVERVIEW)
  const [detail, setDetail] = useState<DealDetailPayload>(DEMO_DETAIL)
  const [mode, setMode] = useState<PartnerReadMode>("demo")
  const [selectedCustomerId, setSelectedCustomerId] = useState(DEMO_OVERVIEW.customers[0].customer.id)
  const [selectedDealId, setSelectedDealId] = useState(DEMO_OVERVIEW.deals[0].id)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const payload = await readJson<WorkspaceOverview>("/api/partner/overview")
        if (!alive) return
        setMode(payload.mode ?? "demo")
        setOverview(payload)
        setSelectedCustomerId(payload.customers[0]?.customer.id ?? "")
        setSelectedDealId(payload.deals[0]?.id ?? "")
      } catch {
        if (!alive) return
        setMode("demo")
        setOverview(DEMO_OVERVIEW)
        setSelectedCustomerId(DEMO_OVERVIEW.customers[0].customer.id)
        setSelectedDealId(DEMO_OVERVIEW.deals[0].id)
        setDetail(DEMO_DETAIL)
        setError("연결된 계정이 없어 데모 셸로 전환했습니다.")
      } finally {
        if (alive) setLoading(false)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true

    async function loadDetail() {
      if (!selectedDealId) return
      if (mode === "demo") {
        setDetail(DEMO_DETAIL)
        return
      }

      try {
        const payload = await readJson<{ deal: DealDetailPayload }>(`/api/partner/deals/${selectedDealId}`)
        if (!alive) return
        setDetail(payload.deal)
      } catch {
        if (!alive) return
        setDetail(DEMO_DETAIL)
      }
    }

    void loadDetail()
    return () => {
      alive = false
    }
  }, [mode, selectedDealId])

  const selectedCustomer = overview.customers.find((item) => item.customer.id === selectedCustomerId) ?? overview.customers[0]
  const selectedDeals = selectedCustomer
    ? overview.deals.filter((deal) => deal.customer_id === selectedCustomer.customer.id)
    : overview.deals
  const selectedDeal = selectedDeals.find((deal) => deal.id === selectedDealId) ?? selectedDeals[0]

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f2ea] px-6 py-10">
        <div className="mx-auto max-w-5xl rounded-3xl border border-[#e6e0d4] bg-white/80 p-8 shadow-[0_18px_40px_rgba(31,24,15,0.06)]">
          <p className="text-sm text-[#1a1a1a]/60">파트너 워크스페이스를 불러오는 중입니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f2ea] text-[#111110]">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#d8e8df]/60 blur-3xl" />
        <div className="absolute right-0 top-24 h-96 w-96 rounded-full bg-[#efe1c8]/60 blur-3xl" />
      </div>

      <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        <Card className="border-[#e6e0d4] bg-white/85 shadow-[0_18px_40px_rgba(31,24,15,0.08)] backdrop-blur">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-[#111110]/15 bg-[#111110] text-white">
                  {mode === "demo" ? "DEMO" : "LIVE"}
                </Badge>
                <Badge variant="outline" className="border-[#111110]/10 bg-white text-[#111110]/70">
                  Partner Workspace
                </Badge>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">
                거래 중심 파트너 워크스페이스
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1a1a1a]/60">
                기관 목록, 거래 상세, 문서, 설치, 수납, 활동을 하나의 셸에서 묶어 보는 진입점입니다.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#1a1a1a]/55">
                <Chip icon={<Users className="h-3.5 w-3.5" />} label={`기관 ${overview.metrics.customer_count}개`} />
                <Chip icon={<Layers3 className="h-3.5 w-3.5" />} label={`진행 거래 ${overview.metrics.active_deal_count}건`} />
                <Chip icon={<CircleDollarSign className="h-3.5 w-3.5" />} label={`미수금 ${formatMoney(overview.metrics.outstanding_amount)}`} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#111110] bg-[#111110] px-4 py-2 text-sm font-medium text-white">
                새 워크스페이스 기본 진입
                <ArrowRight className="h-4 w-4" />
              </div>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex items-center gap-2 rounded-full border border-[#e7e7e2] bg-white px-4 py-2 text-sm font-medium text-[#111110] transition-colors hover:border-[#111110]/30"
              >
                새로고침
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_320px]">
          <Card className="border-[#e6e0d4] bg-white/90 shadow-[0_18px_40px_rgba(31,24,15,0.06)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">기관 / 거래 목록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.customers.map((item) => {
                const isSelected = item.customer.id === selectedCustomer?.customer.id
                const customerDeals = overview.deals.filter((deal) => deal.customer_id === item.customer.id)
                return (
                  <button
                    key={item.customer.id}
                    type="button"
                    onClick={() =>
                      startTransition(() => {
                        setSelectedCustomerId(item.customer.id)
                        setSelectedDealId(customerDeals[0]?.id ?? overview.deals[0]?.id ?? "")
                      })
                    }
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                      isSelected
                        ? "border-[#111110] bg-[#111110] text-white"
                        : "border-[#ece8dc] bg-[#fbf9f3] hover:border-[#111110]/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.customer.name}</p>
                        <p className={`mt-1 text-xs ${isSelected ? "text-white/65" : "text-[#1a1a1a]/50"}`}>
                          {item.customer.region_label ?? "지역 미지정"}
                          {item.customer.campus_name ? ` · ${item.customer.campus_name}` : ""}
                        </p>
                      </div>
                      <ArrowRight className={`h-4 w-4 ${isSelected ? "text-white/80" : "text-[#1a1a1a]/25"}`} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <MiniStat label="거래" value={`${customerDeals.length}건`} inverted={isSelected} />
                      <MiniStat label="미수금" value={formatMoney(item.summary?.outstanding_amount ?? 0)} inverted={isSelected} />
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card className="border-[#e6e0d4] bg-white/90 shadow-[0_18px_40px_rgba(31,24,15,0.06)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">거래 워크스페이스</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDeal ? (
                <EmptyText text="선택된 거래가 없습니다." />
              ) : (
                <Tabs defaultValue="overview" className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <TabsList className="h-auto bg-[#f4f1ea] p-1">
                      <TabsTrigger value="overview">개요</TabsTrigger>
                      <TabsTrigger value="documents">문서</TabsTrigger>
                      <TabsTrigger value="install">설치</TabsTrigger>
                      <TabsTrigger value="payments">수납</TabsTrigger>
                      <TabsTrigger value="activity">활동</TabsTrigger>
                    </TabsList>
                    <Badge variant="outline" className="border-[#111110]/10 bg-white text-[#111110]/70">
                      {selectedDeal.payment_status}
                    </Badge>
                  </div>

                  <TabsContent value="overview" className="mt-0 space-y-4">
                    <div className="rounded-3xl border border-[#ece8dc] bg-[#fbf9f3] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#1a1a1a]/35">
                            {stageLabel(selectedDeal.current_stage)}
                          </p>
                          <h3 className="mt-2 text-2xl font-semibold tracking-tight">{selectedDeal.title}</h3>
                          <p className="mt-2 text-sm text-[#1a1a1a]/55">
                            {selectedDeal.customer_name ?? selectedCustomer?.customer.name ?? "-"} · {selectedDeal.deal_code}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <InfoChip label="계약" value={formatMoney(selectedDeal.contracted_amount)} />
                          <InfoChip label="미수금" value={formatMoney(selectedDeal.outstanding_amount)} />
                          <InfoChip label="설치 완료" value={formatMoney(selectedDeal.installed_amount)} />
                          <InfoChip label="실수납" value={formatMoney(selectedDeal.paid_amount)} />
                        </div>
                      </div>
                    </div>

                    <SectionBox icon={<FileText className="h-4 w-4" />} title="다음 액션">
                      <ActionLine text={`현재 단계: ${stageLabel(selectedDeal.current_stage)}`} />
                      <ActionLine text="문서 버전 링크 확인" />
                      <ActionLine text="설치 일정 충돌 확인" />
                      <ActionLine text="미수금 / 수납 상태 확인" />
                    </SectionBox>
                  </TabsContent>

                  <TabsContent value="documents" className="mt-0 space-y-4">
                    <SectionBox icon={<FileText className="h-4 w-4" />} title="문서">
                      {detail.quote_documents.length === 0 ? (
                        <p className="text-sm text-[#1a1a1a]/45">견적 문서가 없습니다.</p>
                      ) : (
                        detail.quote_documents.map((doc) => (
                          <DocRow
                            key={doc.id}
                            label={doc.quote_number}
                            meta={`견적서 · ${doc.versions.length}개 버전`}
                            detail={
                              doc.versions[0]
                                ? `최신 v${doc.versions[0].version_number} · ${formatMoney(doc.versions[0].total_amount)}`
                                : "버전 없음"
                            }
                          />
                        ))
                      )}
                      {detail.contract_documents.length === 0 ? (
                        <p className="text-sm text-[#1a1a1a]/45">계약 문서가 없습니다.</p>
                      ) : (
                        detail.contract_documents.map((doc) => (
                          <DocRow
                            key={doc.id}
                            label={doc.contract_number}
                            meta={`계약서 · ${doc.versions.length}개 버전`}
                            detail={
                              doc.versions[0]
                                ? `최신 v${doc.versions[0].version_number} · ${formatMoney(doc.versions[0].total_amount)}`
                                : "버전 없음"
                            }
                          />
                        ))
                      )}
                    </SectionBox>
                  </TabsContent>

                  <TabsContent value="install" className="mt-0 space-y-4">
                    <SectionBox icon={<CalendarDays className="h-4 w-4" />} title="설치 일정">
                      {detail.installations.length === 0 ? (
                        <p className="text-sm text-[#1a1a1a]/45">설치 일정이 없습니다.</p>
                      ) : (
                        detail.installations.map((event) => (
                          <div key={event.id} className="rounded-2xl border border-[#ece8dc] bg-[#faf8f2] p-4">
                            <p className="text-sm font-semibold">{event.location ?? "설치 위치 미지정"}</p>
                            <p className="mt-1 text-xs text-[#1a1a1a]/50">
                              {formatDate(event.scheduled_start_at)} - {formatDate(event.scheduled_end_at)}
                            </p>
                          </div>
                        ))
                      )}
                    </SectionBox>
                  </TabsContent>

                  <TabsContent value="payments" className="mt-0 space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <InfoCard icon={<CircleDollarSign className="h-4 w-4" />} label="실수납" value={formatMoney(selectedDeal.paid_amount)} />
                      <InfoCard icon={<ReceiptText className="h-4 w-4" />} label="영수증" value={`${detail.receipts.length}건`} />
                      <InfoCard icon={<Layers3 className="h-4 w-4" />} label="미수금" value={formatMoney(selectedDeal.outstanding_amount)} />
                    </div>
                    {detail.payments.length === 0 ? (
                      <p className="text-sm text-[#1a1a1a]/45">수납 내역이 없습니다.</p>
                    ) : (
                      <div className="space-y-3">
                        {detail.payments.map((payment) => (
                          <div key={payment.id} className="rounded-2xl border border-[#ece8dc] bg-[#faf8f2] p-4">
                            <p className="text-sm font-semibold">{formatMoney(payment.amount)}</p>
                            <p className="mt-1 text-xs text-[#1a1a1a]/50">
                              {payment.payment_method} · {formatDate(payment.paid_at)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="activity" className="mt-0 space-y-4">
                    <SectionBox icon={<Activity className="h-4 w-4" />} title="활동 로그">
                      {detail.activity_logs.length === 0 ? (
                        <p className="text-sm text-[#1a1a1a]/45">활동 로그가 없습니다.</p>
                      ) : (
                        detail.activity_logs.map((log) => (
                          <div key={log.id} className="rounded-2xl border border-[#ece8dc] bg-[#faf8f2] p-4">
                            <p className="text-sm font-semibold">{log.summary}</p>
                            <p className="mt-1 text-xs text-[#1a1a1a]/50">
                              {log.action_type} · {formatDate(log.created_at)}
                            </p>
                          </div>
                        ))
                      )}
                    </SectionBox>

                    <SectionBox icon={<MapPinned className="h-4 w-4" />} title="캘린더">
                      {detail.calendar_events.length === 0 ? (
                        <p className="text-sm text-[#1a1a1a]/45">캘린더 이벤트가 없습니다.</p>
                      ) : (
                        detail.calendar_events.map((event) => (
                          <div key={event.id} className="rounded-2xl border border-[#ece8dc] bg-[#faf8f2] p-4">
                            <p className="text-sm font-semibold">{event.title}</p>
                            <p className="mt-1 text-xs text-[#1a1a1a]/50">
                              {formatDate(event.starts_at)} - {formatDate(event.ends_at)}
                            </p>
                          </div>
                        ))
                      )}
                    </SectionBox>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#e6e0d4] bg-white/90 shadow-[0_18px_40px_rgba(31,24,15,0.06)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">운영 노트</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-[#ece8dc] bg-[#fbf9f3] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1a1a1a]/35">현재 선택</p>
                <p className="mt-2 text-sm font-semibold">{selectedCustomer.customer.name}</p>
                <p className="mt-1 text-sm text-[#1a1a1a]/55">{selectedDeal.title}</p>
              </div>
              <div className="rounded-2xl border border-dashed border-[#d9d3c5] bg-[#faf8f2] p-4 text-sm text-[#1a1a1a]/55">
                {mode === "demo"
                  ? "데모 셸입니다. 로그인하면 실데이터가 연결됩니다."
                  : "실데이터가 연결된 상태입니다. 카드와 탭으로 거래 흐름을 바로 확인할 수 있습니다."}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e7e2] bg-[#fafaf8] px-3 py-1">
      {icon}
      {label}
    </span>
  )
}

function MiniStat({ label, value, inverted = false }: { label: string; value: string; inverted?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${inverted ? "bg-white/10" : "bg-white"}`}>
      <p className={`text-[11px] ${inverted ? "text-white/60" : "text-[#1a1a1a]/35"}`}>{label}</p>
      <p className={`mt-1 text-xs font-semibold ${inverted ? "text-white" : "text-[#111110]"}`}>{value}</p>
    </div>
  )
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e7e2d5] bg-white px-3 py-2.5">
      <p className="text-[11px] text-[#1a1a1a]/40">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  )
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#ece8dc] bg-[#fbf9f3] p-4">
      <div className="flex items-center gap-2 text-[#1a1a1a]/45">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  )
}

function SectionBox({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-3xl border border-[#ece8dc] bg-[#fbf9f3] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  )
}

function ActionLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[#faf8f2] px-3 py-2 text-sm text-[#1a1a1a]/65">
      <Sparkles className="h-4 w-4 text-[#111110]/45" />
      {text}
    </div>
  )
}

function DocRow({ label, meta, detail }: { label: string; meta: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#ece8dc] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs text-[#1a1a1a]/50">{meta}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-[#1a1a1a]/25" />
      </div>
      <p className="mt-3 text-sm text-[#1a1a1a]/65">{detail}</p>
    </div>
  )
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-[#d9d3c5] bg-white/70 px-4 py-8 text-center text-sm text-[#1a1a1a]/45">{text}</p>
}
