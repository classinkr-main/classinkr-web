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
      "PMax 'Campaign #1'(하루 ₩10,000) · 유튜브 '유튜브 채널 광고(쇼츠+메타영상)_261030' — 11/6 둘 다 일시중지",
      "서비스 계정에 권한이 없어 API 로 못 읽는다 — 이 계정에서 온 리드는 DB 의 gclid·랜딩 주소로만 센다",
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

/** 계획상 상태 — 운영 여부는 광고 스냅샷이 따로 정한다(lib/marketing/ad-board.ts). */
export type AdPlanStatus = "running" | "paused" | "planned" | "held"

/**
 * 광고 탭 채널 카드의 계획표 한 줄. 예정·보류·기간·일 예산처럼 API 가 모르는 것만 여기 적는다 —
 * 집행·운영 여부는 google_ads_daily 가 정한다. 상태가 바뀌면 이 표와 정본 문서를 같이 고친다.
 */
export interface AdCampaignRecord {
  /** 광고 계정 — 395 는 API 로 읽고, 924 는 권한이 없어 집행을 못 읽는다. */
  account: "395" | "924"
  /** 계획 번호(C1~C4)·시험(T1). 없으면 null. */
  key: string | null
  /** 플랫폼 캠페인 이름(있으면) 또는 계획 이름. */
  name: string
  type: string
  /** 플랫폼 캠페인 ID — 스냅샷·랜딩 gad_campaignid 와 잇는 키. 아직 안 만들었으면 null. */
  campaignId: string | null
  status: AdPlanStatus
  start: string | null
  end: string | null
  /** 일 예산(KRW). 모르면 null. */
  dailyBudget: number | null
  note: string | null
}

export interface GoogleAdsPlannedCampaign extends AdCampaignRecord {
  key: string
  goal: string
  settings: string
  /** 일 예산(KRW). */
  dailyBudget: number
  /** 시작·종료일(YYYY-MM-DD, 양 끝 포함). */
  start: string
  end: string
}

/** 395 캠페인 계획(쿠폰 조건 C1~C4). C1 은 기존 캠페인 수정, C2·C3 는 예정, C4 검색은 11/6 보류. */
export const GOOGLE_ADS_CAMPAIGN_PLAN: readonly GoogleAdsPlannedCampaign[] = [
  {
    account: "395",
    key: "C1",
    name: "유튜브 전반성장_1102",
    campaignId: "24421437785",
    status: "running",
    note: null,
    goal: "인지",
    type: "동영상 조회 (기존 캠페인 수정)",
    settings: "타깃 CPV ₩40 · 맞춤 세그먼트 3개 · 동영상 파트너 제외 · 게재빈도 7일 3회",
    dailyBudget: 8_000,
    start: "2026-11-03",
    end: "2026-12-31",
  },
  {
    account: "395",
    key: "C2",
    name: "리드 · 디맨드젠",
    campaignId: null,
    status: "planned",
    note: null,
    goal: "리드",
    type: "디맨드젠",
    settings: "맞춤 목표 'C2 리드' — 자료 신청 ₩5,000 · 도입 상담 신청 ₩50,000 · 쇼룸 예약 완료 ₩100,000 · 전환 가치 극대화 · #52·#57 배포 뒤 시작",
    dailyBudget: 14_000,
    start: "2026-11-09",
    end: "2026-12-31",
  },
  {
    account: "395",
    key: "C3",
    name: "리타게팅 · 디맨드젠",
    campaignId: null,
    status: "planned",
    note: null,
    goal: "리타게팅",
    type: "디맨드젠",
    settings: "GA4 잠재고객 활용",
    dailyBudget: 5_000,
    start: "2026-11-23",
    end: "2026-12-31",
  },
  {
    account: "395",
    key: "C4",
    name: "검색",
    campaignId: null,
    status: "held",
    note: "11/6 보류 — 계획만, 착지 문구 정리 뒤 재검토",
    goal: "검색",
    type: "검색",
    settings: "—",
    dailyBudget: 7_000,
    start: "2026-11-03",
    end: "2026-12-31",
  },
]

/** 쿠폰 계획 밖 캠페인 — 395 시험 캠페인과 924(옛 계정) 캠페인. */
export const GOOGLE_ADS_OTHER_CAMPAIGNS: readonly AdCampaignRecord[] = [
  {
    account: "395",
    key: "T1",
    name: "G_DG_[SW]_AI강의분석",
    type: "디맨드젠 시험",
    campaignId: "24423930843",
    status: "running",
    start: "2026-11-05",
    end: "2026-11-18",
    dailyBudget: 20_000,
    note: "11/18 판정",
  },
  {
    account: "924",
    key: null,
    name: "Campaign #1",
    type: "실적 최대화",
    campaignId: "23951572935",
    status: "paused",
    start: null,
    end: null,
    dailyBudget: 10_000,
    note: "11/6 일시중지",
  },
  {
    account: "924",
    key: null,
    name: "유튜브 채널 광고(쇼츠+메타영상)_261030",
    type: "동영상",
    campaignId: null,
    status: "paused",
    start: "2026-10-30",
    end: null,
    dailyBudget: null,
    note: "11/6 일시중지",
  },
]

/** 광고 탭 Google 카드의 계획표 전체 — 쿠폰 계획 + 그 밖. */
export const GOOGLE_ADS_CAMPAIGNS: readonly AdCampaignRecord[] = [...GOOGLE_ADS_CAMPAIGN_PLAN, ...GOOGLE_ADS_OTHER_CAMPAIGNS]

/** 유튜브 스튜디오 프로모션 — API 밖이라 기록만. 395 API 에 캠페인으로 잡히면 Google 카드에 함께 집계된다. */
export const YOUTUBE_STUDIO_RECORD = {
  promotions: 2,
  notes: ["395 선불 잔액에서 차감", "랜딩 classin.co.kr/contact (11/2 수정)"],
} as const

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
    value: "generate_lead (lead_type: demo_request · newsletter) — 최근 7일 0건 · lead_magnet_signup(자료 신청) 11/3 추가, PR #57 배포 뒤부터 집계",
  },
  {
    label: "395 연결",
    value: "11/3 GA4 연결 · 맞춤 광고·자동 태그 추가 켬 · classinkorea@gmail.com 을 GA4 편집자로 추가",
    tone: "ok",
  },
  {
    label: "기본 전환",
    value: "'ClassIn KR Web (web) generate_lead'(GA4 가져오기) — 리드 양식 제출 · 1회 집계 · 클릭 후 90일 · 데이터 기반 기여. #52 배포 때 보조로 내린다",
    tone: "ok",
  },
  {
    label: "전환 상태",
    value: "최근 전환 없음 — 다음 리드부터 24시간 안에 반영",
    tone: "warn",
  },
  {
    label: "사이트 태그",
    value: "지금은 924 태그 AW-18252550128 — 상담 폼 성공 시 924로 전환 발송. PR #52 배포 때 395 태그로 바꾼다 (11/3 결정)",
  },
  {
    label: "395 태그",
    value: "AW-18551599540 — PR #52 배포 후 '도입 상담 신청'·'쇼룸 예약 완료' 전환이 들어온다. 그 전까지 두 전환은 0",
    tone: "warn",
  },
]

export const GOOGLE_ADS_TRACKING_RULES: readonly string[] = [
  "기본 전환은 하나만 — #52 배포 때 GA4 가져오기 generate_lead 를 보조로 내린다. 둘 다 기본이면 같은 문의가 입찰에 두 번 잡힌다",
  "뉴스레터 구독도 generate_lead 로 잡힌다 — 문의만 세는 이벤트로 나누는 일은 나중 과제",
]

/**
 * Google Ads API 를 켜는 남은 사용자 단계 — 화면은 API 가 미연동일 때만 보여 준다. 근거: 문서 §5.
 * 콘솔 작업(API 사용 설정·Explorer 승인·395에 서비스 계정 읽기 전용 추가)은 11/3 끝났다.
 */
export const GOOGLE_ADS_API_STEPS: readonly string[] = [
  "API 연동: Vercel 에 GOOGLE_ADS_CUSTOMER_ID=3951743288 넣고 재배포 (콘솔 작업은 11/3 완료)",
]

/** 사용자가 직접 해야 남은 일 — 근거: 문서 §6. */
export const GOOGLE_ADS_TODO: readonly string[] = [
  "395에 카드 등록 + 충전 (최소 ₩347,777)",
  "395 GA4 가져오기 전환(generate_lead)을 보조로 — 924 캠페인 일시중지는 11/6 완료",
  "C2·C3 생성 진행 승인 (C1 운영 중 · C4 검색은 11/6 보류)",
]
