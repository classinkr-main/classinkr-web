// lib/types/marketing-campaign.ts
// 크로스채널 캠페인 개체(D1) — Approach A: 연결·롤업 레이어.
// 채널별 실행(email/sms/event/meta)을 링크로 묶는 우산 캠페인 + 읽기시점 롤업.
// 스키마: supabase/migrations/20260724_marketing_campaigns.sql

export type CampaignStatus = "planned" | "active" | "paused" | "done"
export type CampaignRefType = "email_campaign" | "sms_campaign" | "event" | "meta_campaign"

// 런타임 SSOT — sanitizer·API·UI 가 이 순서/목록을 공유한다(중복 리터럴 금지).
export const CAMPAIGN_STATUSES: CampaignStatus[] = ["planned", "active", "paused", "done"]
export const CAMPAIGN_REF_TYPES: CampaignRefType[] = ["email_campaign", "sms_campaign", "event", "meta_campaign"]

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  planned: "계획",
  active: "진행",
  paused: "일시중지",
  done: "완료",
}

export const CAMPAIGN_REF_TYPE_LABEL: Record<CampaignRefType, string> = {
  email_campaign: "이메일",
  sms_campaign: "문자",
  event: "행사",
  meta_campaign: "Meta 광고",
}

export interface MarketingCampaign {
  id: string
  name: string
  objective: string | null
  status: CampaignStatus
  channels: string[]
  startsAt: string | null   // ISO date (YYYY-MM-DD)
  endsAt: string | null
  budget: number | null     // KRW
  owner: string | null
  projectId: string | null  // D3에서 marketing_projects FK
  createdAt: string
  updatedAt: string
}

export interface CampaignLink {
  id: string
  campaignId: string
  refType: CampaignRefType
  refId: string
  createdAt: string
}

// 롤업은 링크된 실행에서 실제 가용한 값만 표기한다(정직 규칙).
// Meta 집행은 계정 통화(USD 등)·행사 매출은 "입력 기준"이라
// 채널·통화를 가로지르는 종합 ROAS 는 만들지 않는다.
export interface CampaignRollup {
  emailRecipients: number
  emailOpens: number
  smsRecipients: number
  eventLeads: number
  eventDeals: number
  eventRevenue: number | null   // KRW, "입력 기준" — 링크된 행사에 매출 입력이 없으면 null
  metaSpend: number | null      // 계정 통화 네이티브 — KRW 로 합산하지 않음
  metaCurrency: string | null
  metaLeads: number
  linkedCounts: { email: number; sms: number; event: number; meta: number }
}

export interface CampaignWithLinks extends MarketingCampaign {
  links: CampaignLink[]
  rollup?: CampaignRollup
}
