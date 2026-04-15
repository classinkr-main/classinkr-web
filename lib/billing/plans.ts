export type BillingCycle = "monthly" | "yearly"
export type SelfServePlanId = "standard" | "plus"
export type SoftwarePlanId = SelfServePlanId | "enterprise"
export type BillingCurrency = "USD" | "KRW" | "CNY"

export interface SoftwarePlanPrice {
  amount: number // USD 정수. per-account per-cycle 단가
  currency: BillingCurrency
  label: string
  badge?: string
  unitSuffix: string
}

export interface SoftwarePlan {
  id: SoftwarePlanId
  title: string
  summary: string
  eyebrow: string
  selfServe: boolean
  features: string[]
  monthly?: SoftwarePlanPrice
  yearly?: SoftwarePlanPrice
  limits?: string[]
}

function readPublicIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

// PDF 기준 기본 단가 (USD). env 로 override 가능하지만 기본값은 요금표와 일치.
const STANDARD_MONTHLY_USD = readPublicIntegerEnv("NEXT_PUBLIC_BILLING_STANDARD_MONTHLY_USD", 99)
const STANDARD_YEARLY_USD = readPublicIntegerEnv("NEXT_PUBLIC_BILLING_STANDARD_YEARLY_USD", 990)
const PLUS_MONTHLY_USD = readPublicIntegerEnv("NEXT_PUBLIC_BILLING_PLUS_MONTHLY_USD", 199)
const PLUS_YEARLY_USD = readPublicIntegerEnv("NEXT_PUBLIC_BILLING_PLUS_YEARLY_USD", 1990)
const ENTERPRISE_MONTHLY_USD = readPublicIntegerEnv("NEXT_PUBLIC_BILLING_ENTERPRISE_MONTHLY_USD", 299)
const ENTERPRISE_YEARLY_USD = readPublicIntegerEnv("NEXT_PUBLIC_BILLING_ENTERPRISE_YEARLY_USD", 2990)

export const ACCOUNT_COUNT_MIN = 1
export const ACCOUNT_COUNT_MAX = 999
export const DEFAULT_ACCOUNT_COUNT = 1

export const SOFTWARE_PLANS: SoftwarePlan[] = [
  {
    id: "standard",
    title: "Standard",
    eyebrow: "빠른 시작",
    summary: "소규모 운영팀이 바로 도입할 수 있는 기본 플랜",
    selfServe: true,
    monthly: {
      amount: STANDARD_MONTHLY_USD,
      currency: "USD",
      label: "월 결제",
      unitSuffix: "/ 계정 / 월",
    },
    yearly: {
      amount: STANDARD_YEARLY_USD,
      currency: "USD",
      label: "연 결제",
      unitSuffix: "/ 계정 / 연",
      badge: "약 2개월 절감",
    },
    limits: [
      "온스테이지 1v0 ~ 1v6",
      "반(코스)별 최대 50명",
      "1회 수업 최대 4시간",
      "조교 1명 · SD 화질",
    ],
    features: [
      "실시간 라이브 수업",
      "기본 수업 도구와 활동",
      "운영팀용 기본 대시보드",
      "이메일 기반 고객 지원",
    ],
  },
  {
    id: "plus",
    title: "Plus",
    eyebrow: "운영 확장",
    summary: "다수 강사와 팀 운영에 맞춘 확장형 플랜",
    selfServe: true,
    monthly: {
      amount: PLUS_MONTHLY_USD,
      currency: "USD",
      label: "월 결제",
      unitSuffix: "/ 계정 / 월",
    },
    yearly: {
      amount: PLUS_YEARLY_USD,
      currency: "USD",
      label: "연 결제",
      unitSuffix: "/ 계정 / 연",
      badge: "약 2개월 절감",
    },
    limits: [
      "온스테이지 1v0 ~ 1v12",
      "반(코스)별 최대 1,000명",
      "1회 수업 최대 12시간",
      "조교 6명 · SD / HD 화질",
    ],
    features: [
      "고급 수업 활동과 리포트",
      "강사/운영자 협업 기능",
      "우선 기술 지원",
      "도입 온보딩 가이드",
    ],
  },
  {
    id: "enterprise",
    title: "Enterprise",
    eyebrow: "맞춤 설계",
    summary: "대형 기관과 하드웨어 결합형 고객을 위한 맞춤 계약",
    selfServe: false,
    monthly: {
      amount: ENTERPRISE_MONTHLY_USD,
      currency: "USD",
      label: "월 결제",
      unitSuffix: "/ 계정 / 월",
    },
    yearly: {
      amount: ENTERPRISE_YEARLY_USD,
      currency: "USD",
      label: "연 결제",
      unitSuffix: "/ 계정 / 연",
      badge: "약 2개월 절감",
    },
    features: [
      "전담 CSM과 구축 지원",
      "하드웨어/설치 연계",
      "보안·권한 맞춤 설정",
      "계약 기반 청구",
    ],
  },
]

export function formatUsd(amount: number) {
  return `$${amount.toLocaleString("en-US")}`
}

export function formatKrw(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`
}

export function getBillingCycleLabel(cycle: BillingCycle) {
  return cycle === "monthly" ? "월간" : "연간"
}

export function getSoftwarePlan(planId: SoftwarePlanId) {
  const plan = SOFTWARE_PLANS.find((candidate) => candidate.id === planId)
  if (!plan) {
    throw new Error(`Unknown software plan: ${planId}`)
  }
  return plan
}

export function getSelfServeSoftwarePlan(planId: SelfServePlanId) {
  const plan = getSoftwarePlan(planId)
  if (!plan.selfServe || !plan.monthly || !plan.yearly) {
    throw new Error(`Plan is not self-serve: ${planId}`)
  }
  return plan as SoftwarePlan & {
    id: SelfServePlanId
    monthly: SoftwarePlanPrice
    yearly: SoftwarePlanPrice
    selfServe: true
  }
}

export function getSelfServePlans() {
  return SOFTWARE_PLANS.filter(
    (plan): plan is ReturnType<typeof getSelfServeSoftwarePlan> => plan.selfServe
  )
}

export function resolvePlanPrice(planId: SelfServePlanId, billingCycle: BillingCycle) {
  const plan = getSelfServeSoftwarePlan(planId)
  return billingCycle === "monthly" ? plan.monthly : plan.yearly
}

export function clampAccountCount(value: number | undefined | null) {
  if (!Number.isFinite(value as number)) return DEFAULT_ACCOUNT_COUNT
  const n = Math.round(value as number)
  if (n < ACCOUNT_COUNT_MIN) return ACCOUNT_COUNT_MIN
  if (n > ACCOUNT_COUNT_MAX) return ACCOUNT_COUNT_MAX
  return n
}

export function computeSubscriptionAmountUsd(
  planId: SelfServePlanId,
  billingCycle: BillingCycle,
  accountCount: number
) {
  const price = resolvePlanPrice(planId, billingCycle)
  return price.amount * clampAccountCount(accountCount)
}
