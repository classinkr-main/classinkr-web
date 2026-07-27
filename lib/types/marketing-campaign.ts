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
  // 링크된 실행의 사람이 읽는 이름(제목/본문 스니펫/행사명/Meta 캠페인명).
  // 저장 컬럼이 아니라 API 레이어의 읽기시점 enrichment 라 optional —
  // 저장소(marketing-campaigns.ts)는 채우지 않는다. 해석 실패(실행 삭제 · Meta 조회
  // 지평 밖)면 undefined 로 남겨 UI 가 raw refId 로 폴백한다(라벨 조작 금지).
  label?: string
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

/* ─────────────────────────────────────────────────────────────
   마케팅 프로젝트 묶음(D3) — marketing_campaigns 를 묶는 상위 개체.
   프로젝트는 멤버 캠페인들의 지표를 읽기시점에 롤업하는 우산이다.
   스키마: supabase/migrations/20260724_marketing_projects.sql
   ───────────────────────────────────────────────────────────── */

// 프로젝트 상태값 집합은 캠페인과 동일하다(planned/active/paused/done) —
// DRY 하게 CampaignStatus 를 재사용한다. 런타임 목록/라벨도 각각
// CAMPAIGN_STATUSES / CAMPAIGN_STATUS_LABEL 를 그대로 쓴다(중복 리터럴 금지).
export type ProjectStatus = CampaignStatus

export interface MarketingProject {
  id: string
  name: string
  objective: string | null
  status: ProjectStatus
  startsAt: string | null   // ISO date (YYYY-MM-DD)
  endsAt: string | null
  budget: number | null     // KRW — 프로젝트 배정 예산
  owner: string | null
  createdAt: string
  updatedAt: string
}

// 프로젝트 롤업은 멤버 캠페인에서 실제 가용한 값만 표기한다(정직 규칙).
// 예산 소진은 KRW 배정 대비 KRW 집행만 — Meta 집행(USD 등)은 통화가 달라
// 여기 budgetSpent 에 합산하지 않는다(채널·통화 가로지르는 조작 지표 금지).
export interface ProjectRollup {
  campaignCount: number
  channelCount: number            // 멤버 캠페인을 가로지르는 distinct 채널 수
  eventCount: number              // 멤버 캠페인의 event 링크 수
  budgetAllocated: number | null  // project.budget
  budgetSpent: number             // KRW 집행 합 — Meta USD 제외(정직)
  spentPct: number | null         // budgetSpent / budgetAllocated * 100, 예산 없으면 null
}

export interface ProjectWithRollup extends MarketingProject {
  rollup: ProjectRollup
}
