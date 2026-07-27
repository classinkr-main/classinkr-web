// 캠페인 허브(app/admin/campaigns)와 탭 패널(tabs/*)이 공유하는 타입 모음.
// 페이지 본체에 있던 정의를 코드 분할 시점에 이동한 것 — 런타임 코드 없이 타입만 둔다
// (탭 청크가 타입 때문에 페이지 모듈을 되끌어오는 순환을 막는다).
import type { EventEconomics, EventFunnel, EventMetrics, AdChannel } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"

export type CampaignTab = "summary" | "events" | "meta" | "email"

export type MetaDatePreset = "last_7d" | "last_30d" | "last_90d" | "this_month"

export interface MetaCampaignRow {
  id: string
  name: string
  status: string
  effectiveStatus?: string
  objective?: string
  updatedTime?: string
  insights: {
    spend: number
    impressions: number
    reach: number
    clicks: number
    ctr: number | null
    cpc: number | null
    cpm: number | null
    leads: number
  }
}

export interface MetaCampaignDashboard {
  account: {
    id: string
    name?: string
    accountStatus?: number
    currency?: string
    timezone?: string
    businessName?: string
  }
  datePreset: string
  campaigns: MetaCampaignRow[]
  summary: {
    campaignCount: number
    activeCount: number
    pausedCount: number
    spend: number
    impressions: number
    reach: number
    clicks: number
    leads: number
    ctr: number | null
    cpc: number | null
    cpm: number | null
  }
}

export interface MarketingStatsData {
  subscribers: { total: number; active: number; unsubscribed: number; newThisMonth: number }
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
  automation: { totalRules: number; activeRules: number }
  tagDistribution: Array<{ tag: string; count: number }>
}

export type Period = "active" | "30d" | "90d" | "all"

export type EventSortKey = "date" | "leads" | "deals" | "roi"

// 행사 ↔ 리드 귀속 집계(페이지의 assignEventLeads 결과 셀)
export type EventLeadStats = { attributed: number; during: number }

// 페이지의 perEventEcon 한 행 — 행사별 funnel+economics 단일 소스
export interface PerEventEconRow {
  event: PublicEvent
  metrics: EventMetrics
  funnel: EventFunnel
  econ: EventEconomics
}

// 페이지의 aggregate 메모 반환 형태 — 요약 KPI·광고 탭 예산 대조가 함께 읽는다
export interface CampaignAggregate {
  totalSpend: number
  totalRevenue: number
  totalLeads: number
  totalDeals: number
  totalAttendees: number
  avgCpl: number | null
  overallRoi: number | null
  dealConversionRate: number | null
  attendanceToDealRate: number | null
  channelTotals: Record<AdChannel, number>
}
