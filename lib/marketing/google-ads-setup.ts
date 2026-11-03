// lib/marketing/google-ads-setup.ts
// Google Ads·GA4 세팅 기록 — 정적 데이터(순수 모듈). 마케팅 허브 데이터 › Google Ads 섹션이 읽는다.
//
// Meta 섹션은 Graph API 라이브지만 Google Ads 는 API 자격증명이 아직 없다
// (docs/active/ad-channel-activation-runbook-2026-09-14.md §3). 그래서 계정 화면을 직접 점검한
// 기록을 싣는다 — 숫자는 GOOGLE_ADS_SETUP_AS_OF 기준값이지 라이브가 아니다.
// 정본 문서: docs/active/google-ads-accounts-2026-11-03.md — 계정·쿠폰·캠페인이 바뀌면 둘을 같이 고친다.

export const GOOGLE_ADS_SETUP_AS_OF = "2026-11-03"

export interface GoogleAdsAccount {
  id: string
  login: string | null
  role: string
  primary: boolean
  notes: readonly string[]
}

export const GOOGLE_ADS_ACCOUNTS: readonly GoogleAdsAccount[] = [
  {
    id: "395-174-3288",
    login: "classinkorea@gmail.com",
    role: "주 계정",
    primary: true,
    notes: [
      "프로모션 쿠폰이 이 계정에 묶여 있어 계속 쓴다 — 계정은 합칠 수 없다",
      "선불 결제 · 유튜브 채널 연결 · 유튜브 스튜디오 프로모션 2개도 이 선불 잔액에서 빠진다",
      "스튜디오 프로모션 랜딩을 classin.co.kr/contact 로 고쳤다 (11/2)",
    ],
  },
  {
    id: "924-032-2833",
    login: "classinkr@classin.com",
    role: "기존 계정 · '클래스인'",
    primary: false,
    notes: [
      "PMax 'Campaign #1' 하루 ₩10,000 집행 중 — 전환은 페이지 조회 2건뿐",
      "유튜브 '유튜브 채널 광고(쇼츠+메타영상)_261030' — 395와 같은 영상을 중복 집행",
      "Visa 후불 · 전환 '도입문의 제출(submit_demo_request)' 운영 중",
    ],
  },
  {
    id: "145-679-4327",
    login: null,
    role: "미사용",
    primary: false,
    notes: ["설정만 해 둔 빈 계정"],
  },
]

/** 395 프로모션 쿠폰 — ₩180만을 쓰면 ₩120만 크레딧. */
export const GOOGLE_ADS_COUPON = {
  spendTarget: 1_800_000,
  credit: 1_200_000,
  reservedSpend: 347_777,
  daysLeft: 59,
  /** 남은 기간 하루 필요 지출(점검 기록의 값 그대로, 약). */
  dailyNeeded: 30_500,
} as const

/** 395 결제 상태 — 선불이라 충전 전에는 광고가 나가지 않는다. */
export const GOOGLE_ADS_BILLING = {
  balance: 0,
  autoRecharge: false,
  cardRegistered: false,
  minTopUp: 347_777,
} as const

export interface GoogleAdsPlannedCampaign {
  key: string
  goal: string
  type: string
  settings: string
  /** 일 예산(KRW). */
  dailyBudget: number
  /** 시작·종료일(YYYY-MM-DD, 양 끝 포함). */
  start: string
  end: string
}

/** 395 캠페인 계획 — 전부 승인 대기(C1 은 기존 캠페인 수정, C2~C4 는 새로 만든다). */
export const GOOGLE_ADS_CAMPAIGN_PLAN: readonly GoogleAdsPlannedCampaign[] = [
  {
    key: "C1",
    goal: "인지",
    type: "동영상 조회 (기존 캠페인 수정)",
    settings: "타깃 CPV ₩40 · 맞춤 세그먼트 3개 · 동영상 파트너 제외 · 게재빈도 7일 3회",
    dailyBudget: 8_000,
    start: "2026-11-03",
    end: "2026-12-31",
  },
  {
    key: "C2",
    goal: "리드",
    type: "디맨드젠",
    settings: "전환 목표 generate_lead",
    dailyBudget: 14_000,
    start: "2026-11-09",
    end: "2026-12-31",
  },
  {
    key: "C3",
    goal: "리타게팅",
    type: "디맨드젠",
    settings: "GA4 잠재고객 활용",
    dailyBudget: 5_000,
    start: "2026-11-23",
    end: "2026-12-31",
  },
  {
    key: "C4",
    goal: "검색",
    type: "검색",
    settings: "—",
    dailyBudget: 7_000,
    start: "2026-11-03",
    end: "2026-12-31",
  },
]

const DAY_MS = 86_400_000

/** 기간 일수 — 시작·종료일 모두 포함. */
export function planDays(campaign: Pick<GoogleAdsPlannedCampaign, "start" | "end">): number {
  return Math.round((Date.parse(`${campaign.end}T00:00:00Z`) - Date.parse(`${campaign.start}T00:00:00Z`)) / DAY_MS) + 1
}

/** 기간 예산 = 일 예산 × 일수. */
export function planBudget(campaign: GoogleAdsPlannedCampaign): number {
  return campaign.dailyBudget * planDays(campaign)
}

export function planTotal(plan: readonly GoogleAdsPlannedCampaign[] = GOOGLE_ADS_CAMPAIGN_PLAN): number {
  return plan.reduce((sum, campaign) => sum + planBudget(campaign), 0)
}

export interface GoogleAdsTrackingFact {
  label: string
  value: string
  tone?: "ok" | "warn"
}

export const GOOGLE_ADS_TRACKING: readonly GoogleAdsTrackingFact[] = [
  {
    label: "GA4 속성",
    value: "ClassIn KR Web · G-6MWTJ8C0L2 · 속성 543942005 · 웹 스트림 classin.co.kr",
  },
  {
    label: "주요 이벤트",
    value: "generate_lead (lead_type: demo_request · newsletter) — 최근 7일 0건",
  },
  {
    label: "395 연결",
    value: "11/3 GA4 연결 · 맞춤 광고·자동 태그 추가 켬 · classinkorea@gmail.com 을 GA4 편집자로 추가",
    tone: "ok",
  },
  {
    label: "기본 전환",
    value: "'ClassIn KR Web (web) generate_lead' — 리드 양식 제출 · 1회 집계 · 클릭 후 90일 · 데이터 기반 기여",
    tone: "ok",
  },
  {
    label: "전환 상태",
    value: "최근 전환 없음 — 다음 리드부터 24시간 안에 반영",
    tone: "warn",
  },
  {
    label: "사이트 태그",
    value: "AW-18252550128 (395 아님 · 924 추정) — 상담 폼 성공 시 generate_lead 와 함께 이 태그로 전환 발송",
  },
  {
    label: "395 태그",
    value: "AW-18551599540 은 사이트에 없다 — 395의 '도입 상담 신청'·'쇼룸 예약 완료' 전환은 작동하지 않는다",
    tone: "warn",
  },
]

export const GOOGLE_ADS_TRACKING_RULES: readonly string[] = [
  "395 태그나 전환 호출을 사이트에 넣지 않는다 — 395는 GA4 가져오기로 리드를 받으므로 중복 집계된다",
  "뉴스레터 구독도 generate_lead 로 잡힌다 — 문의만 세는 이벤트로 나누는 일은 나중 과제",
]

/** 사용자가 직접 해야 남은 일 — 이게 끝나야 395 캠페인이 돈다. */
export const GOOGLE_ADS_TODO: readonly string[] = [
  "395에 카드 등록 + 충전 (최소 ₩347,777)",
  "924 중복 유튜브 캠페인을 끌지 결정",
  "C1 수정 · C2~C4 생성 진행 승인",
]
