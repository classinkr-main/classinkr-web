"use client"

import * as React from "react"
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  Info,
  TimerReset,
  Users,
  Video,
  WalletCards,
} from "lucide-react"

import { Slider } from "@/components/ui/slider"

type Quality = "SD" | "HD" | "FHD"
type RecordingMode = "none" | "single" | "dual"
type SubscriptionTier = "Standard" | "Plus" | "Enterprise"
type PricingDisplayMode = "native" | "krw"

const DEFAULT_EXCHANGE_RATES = {
  cnyToKrw: 190,
  usdToKrw: 1440,
} as const
const MIN_INITIAL_RECHARGE_CNY = 10_000
const RECHARGE_STEP_CNY = 2_000
const BUSINESS_FREE_STORAGE_GB = 30
const BUSINESS_STORAGE_CNY_PER_GB = 3
const BUSINESS_WEBLIVE_CNY_PER_GB = 3

interface PricingCalculatorProps {
  displayMode?: PricingDisplayMode
  exchangeRates?: {
    cnyToKrw: number
    usdToKrw: number
  }
}

const QUALITY_LABEL: Record<Quality, string> = {
  SD: "SD",
  HD: "HD",
  FHD: "FHD",
}

const RECORDING_LABEL: Record<RecordingMode, string> = {
  none: "사용 안 함",
  single: "단일 녹화",
  dual: "듀얼 녹화",
}

const RECORDING_RATE_CNY: Record<RecordingMode, number> = {
  none: 0,
  single: 2,
  dual: 4,
}

const SUBSCRIPTION_TIERS: Record<
  SubscriptionTier,
  {
    priceUsd: number
    onStageMax: number
    courseMax: number
    lessonMaxMinutes: number
    assistantMax: number
    qualities: Quality[]
    baseStorageGb: number
    storagePerTeacherGb: number
  }
> = {
  Standard: {
    priceUsd: 99,
    onStageMax: 6,
    courseMax: 50,
    lessonMaxMinutes: 240,
    assistantMax: 1,
    qualities: ["SD"],
    baseStorageGb: 50,
    storagePerTeacherGb: 10,
  },
  Plus: {
    priceUsd: 199,
    onStageMax: 12,
    courseMax: 1000,
    lessonMaxMinutes: 720,
    assistantMax: 6,
    qualities: ["SD", "HD"],
    baseStorageGb: 500,
    storagePerTeacherGb: 20,
  },
  Enterprise: {
    priceUsd: 299,
    onStageMax: 12,
    courseMax: 2000,
    lessonMaxMinutes: 1440,
    assistantMax: 6,
    qualities: ["SD", "HD", "FHD"],
    baseStorageGb: 1024,
    storagePerTeacherGb: 100,
  },
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function readNumber(value: string, min: number, max: number) {
  return clampNumber(Number.parseFloat(value), min, max)
}

function roundUpToStep(value: number, step: number) {
  if (value <= 0) return 0
  return Math.ceil(value / step) * step
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("ko-KR")
}

function formatKrw(value: number) {
  return `${formatNumber(value)}원`
}

function formatDecimal(value: number, digits = 1) {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value % 1 === 0 ? 0 : digits,
  })
}

function formatMinutes(minutes: number) {
  if (minutes === 0) return "0분"
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`
}

function resolveBusinessClassRate({
  onStageStudents,
  quality,
  hasDualCamera,
}: {
  onStageStudents: number
  quality: Quality
  hasDualCamera: boolean
}) {
  if (onStageStudents === 0) return { rate: 1, label: "1v0 기본" }
  if (onStageStudents === 1 && hasDualCamera) return { rate: 8, label: "1v1 듀얼 카메라" }
  if (onStageStudents === 1) {
    if (quality === "FHD") return { rate: 8, label: "1v1 FHD" }
    if (quality === "HD") return { rate: 4, label: "1v1 HD" }
    return { rate: 2, label: "1v1 SD" }
  }
  if (quality === "FHD") return { rate: 20, label: "그룹 FHD" }
  if (quality === "HD") return { rate: 12, label: "그룹 HD" }
  return { rate: 4, label: "1v2-12 SD" }
}

function resolveAssistantRate(quality: Quality) {
  if (quality === "FHD") return 20
  if (quality === "HD") return 10
  return 6
}

function resolveBillableMinutes(durationMinutes: number) {
  if (durationMinutes <= 10) return 0
  return Math.max(30, roundUpToStep(durationMinutes, 30))
}

function resolveSubscriptionTier({
  onStageStudents,
  courseStudents,
  lessonMinutes,
  quality,
  assistantCount,
  webLiveTrafficGb,
  hasDualCamera,
}: {
  onStageStudents: number
  courseStudents: number
  lessonMinutes: number
  quality: Quality
  assistantCount: number
  webLiveTrafficGb: number
  hasDualCamera: boolean
}) {
  const reasons: string[] = []
  let tier: SubscriptionTier = "Standard"

  if (
    onStageStudents > SUBSCRIPTION_TIERS.Standard.onStageMax ||
    courseStudents > SUBSCRIPTION_TIERS.Standard.courseMax ||
    lessonMinutes > SUBSCRIPTION_TIERS.Standard.lessonMaxMinutes ||
    quality !== "SD" ||
    assistantCount > SUBSCRIPTION_TIERS.Standard.assistantMax
  ) {
    tier = "Plus"
  }

  if (
    onStageStudents > SUBSCRIPTION_TIERS.Plus.onStageMax ||
    courseStudents > SUBSCRIPTION_TIERS.Plus.courseMax ||
    lessonMinutes > SUBSCRIPTION_TIERS.Plus.lessonMaxMinutes ||
    quality === "FHD" ||
    webLiveTrafficGb > 0 ||
    hasDualCamera
  ) {
    tier = "Enterprise"
  }

  const config = SUBSCRIPTION_TIERS[tier]
  if (onStageStudents > config.onStageMax) reasons.push(`온스테이지 ${config.onStageMax}명 초과`)
  if (courseStudents > config.courseMax) reasons.push(`코스 ${config.courseMax}명 초과`)
  if (lessonMinutes > config.lessonMaxMinutes) reasons.push(`1회 ${formatMinutes(config.lessonMaxMinutes)} 초과`)
  if (!config.qualities.includes(quality)) reasons.push(`${quality} 화질`)
  if (assistantCount > config.assistantMax) reasons.push(`조교 ${config.assistantMax}명 초과`)
  if (webLiveTrafficGb > 0 && tier === "Enterprise") reasons.push("웹라이브")
  if (hasDualCamera && tier === "Enterprise") reasons.push("듀얼 카메라")

  const outOfRange =
    onStageStudents > SUBSCRIPTION_TIERS.Enterprise.onStageMax ||
    courseStudents > SUBSCRIPTION_TIERS.Enterprise.courseMax ||
    lessonMinutes > SUBSCRIPTION_TIERS.Enterprise.lessonMaxMinutes

  return {
    tier,
    reasons,
    outOfRange,
    config,
  }
}

function FieldGroup({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-[17px] font-semibold tracking-tight text-[#111110]">{title}</h3>
        {description ? (
          <p className="mt-1 text-[13px] leading-5 text-[#615D59]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function NumberInput({
  id,
  label,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
}: {
  id: string
  label: string
  value: number
  unit: string
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label htmlFor={id} className="block space-y-2">
      <span className="text-[13px] font-semibold text-[#31302E]">{label}</span>
      <span className="relative block">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(readNumber(event.target.value, min, max))}
          className="h-12 w-full rounded-lg border border-black/[0.08] bg-white px-3 pr-12 text-[15px] font-semibold text-[#111110] outline-none transition focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[#A39E98]">
          {unit}
        </span>
      </span>
    </label>
  )
}

function SegmentButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-[13px] font-semibold transition ${
        active
          ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
          : "border-black/[0.08] bg-white text-[#615D59] hover:border-black/[0.16] hover:text-[#111110]"
      }`}
    >
      {children}
    </button>
  )
}

function BreakdownRow({
  label,
  detail,
  amount,
}: {
  label: string
  detail: string
  amount: string
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-black/[0.06] py-3 last:border-b-0">
      <div>
        <p className="text-[13px] font-semibold text-[#111110]">{label}</p>
        <p className="mt-0.5 text-[12px] leading-5 text-[#615D59]">{detail}</p>
      </div>
      <div className="text-right text-[13px] font-semibold text-[#111110]">{amount}</div>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  helper,
  active = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  helper: string
  active?: boolean
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-4 ${
        active ? "border-[#084734] shadow-[0_16px_36px_rgba(8,71,52,0.10)]" : "border-black/[0.08]"
      }`}
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold text-[#615D59]">
        <span className={active ? "text-[#084734]" : "text-[#A39E98]"}>{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-[24px] font-semibold tracking-tight text-[#111110]">{value}</p>
      <p className="mt-1 text-[12px] leading-5 text-[#615D59]">{helper}</p>
    </div>
  )
}

export function PricingCalculator({
  displayMode = "native",
  exchangeRates = DEFAULT_EXCHANGE_RATES,
}: PricingCalculatorProps) {
  const [onStageStudents, setOnStageStudents] = React.useState([6])
  const [connectedStudents, setConnectedStudents] = React.useState(80)
  const [teachers, setTeachers] = React.useState([5])
  const [courseStudents, setCourseStudents] = React.useState(80)
  const [classCount, setClassCount] = React.useState(100)
  const [classDurationMinutes, setClassDurationMinutes] = React.useState(60)
  const [quality, setQuality] = React.useState<Quality>("SD")
  const [assistantCount, setAssistantCount] = React.useState(0)
  const [recordingMode, setRecordingMode] = React.useState<RecordingMode>("none")
  const [hasDualCamera, setHasDualCamera] = React.useState(false)
  const [storageGb, setStorageGb] = React.useState(30)
  const [webLiveTrafficGb, setWebLiveTrafficGb] = React.useState(0)
  const [isStudentHelpOpen, setIsStudentHelpOpen] = React.useState(false)

  const onStageStudentsNum = onStageStudents[0]
  const effectiveOnStageStudentsNum = Math.min(onStageStudentsNum, connectedStudents)
  const teachersNum = teachers[0]
  const isKrwMode = displayMode === "krw"
  const cnyToKrw = exchangeRates.cnyToKrw
  const usdToKrw = exchangeRates.usdToKrw

  const pricing = React.useMemo(() => {
    const billableMinutesPerClass = resolveBillableMinutes(classDurationMinutes)
    const totalBillableHours = (classCount * billableMinutesPerClass) / 60
    const billedStudents = Math.min(connectedStudents, 200)
    const billedPeople = billedStudents + 1
    const unbilledStudents = Math.max(connectedStudents - 200, 0)
    const classRate = resolveBusinessClassRate({
      onStageStudents: effectiveOnStageStudentsNum,
      quality,
      hasDualCamera,
    })
    const classCny = classRate.rate * billedPeople * totalBillableHours
    const assistantRate = resolveAssistantRate(quality)
    const assistantCny = assistantCount * assistantRate * totalBillableHours
    const recordingRate = RECORDING_RATE_CNY[recordingMode]
    const recordingCny = recordingRate * totalBillableHours
    const storageOverageGb = Math.max(storageGb - BUSINESS_FREE_STORAGE_GB, 0)
    const storageCny = storageOverageGb * BUSINESS_STORAGE_CNY_PER_GB
    const webLiveCny = webLiveTrafficGb * BUSINESS_WEBLIVE_CNY_PER_GB
    const totalBusinessCny = classCny + assistantCny + recordingCny + storageCny + webLiveCny
    const initialRechargeCny = Math.max(
      MIN_INITIAL_RECHARGE_CNY,
      roundUpToStep(totalBusinessCny, RECHARGE_STEP_CNY)
    )

    const subscription = resolveSubscriptionTier({
      onStageStudents: effectiveOnStageStudentsNum,
      courseStudents,
      lessonMinutes: classDurationMinutes,
      quality,
      assistantCount,
      webLiveTrafficGb,
      hasDualCamera,
    })
    const subscriptionUsd = subscription.config.priceUsd * teachersNum
    const subscriptionIncludedStorageGb =
      subscription.config.baseStorageGb + subscription.config.storagePerTeacherGb * teachersNum
    const subscriptionStorageOverageGb = Math.max(storageGb - subscriptionIncludedStorageGb, 0)
    const businessKrw = totalBusinessCny * cnyToKrw
    const subscriptionKrw = subscriptionUsd * usdToKrw
    const recommendation = subscription.outOfRange
      ? "consult"
      : businessKrw <= subscriptionKrw
        ? "business"
        : "subscription"

    return {
      billableMinutesPerClass,
      effectiveOnStageStudents: effectiveOnStageStudentsNum,
      totalBillableHours,
      billedStudents,
      billedPeople,
      unbilledStudents,
      classRate,
      classCny,
      assistantRate,
      assistantCny,
      recordingRate,
      recordingCny,
      storageOverageGb,
      storageCny,
      webLiveCny,
      totalBusinessCny,
      initialRechargeCny,
      businessKrw,
      subscription,
      subscriptionUsd,
      subscriptionKrw,
      subscriptionIncludedStorageGb,
      subscriptionStorageOverageGb,
      recommendation,
    }
  }, [
    assistantCount,
    classCount,
    classDurationMinutes,
    connectedStudents,
    courseStudents,
    cnyToKrw,
    effectiveOnStageStudentsNum,
    hasDualCamera,
    quality,
    recordingMode,
    storageGb,
    teachersNum,
    usdToKrw,
    webLiveTrafficGb,
  ])

  const businessRecommended = pricing.recommendation === "business"
  const subscriptionRecommended = pricing.recommendation === "subscription"
  const formatBusinessAmount = React.useCallback(
    (cny: number) => (isKrwMode ? formatKrw(cny * cnyToKrw) : `${formatNumber(cny)} CNY`),
    [cnyToKrw, isKrwMode]
  )
  const formatSubscriptionAmount = React.useCallback(
    (usd: number) => (isKrwMode ? formatKrw(usd * usdToKrw) : `$${formatNumber(usd)}`),
    [isKrwMode, usdToKrw]
  )

  return (
    <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-[0_18px_52px_rgba(0,0,0,0.05)]">
      <div className="border-b border-black/[0.08] bg-white px-5 py-6 sm:px-8 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-end">
          <div>
            <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-[#111110] sm:text-[34px]">
              {isKrwMode ? "월 예상 요금 시뮬레이터 (KRW)" : "월 예상 요금 시뮬레이터"}
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#615D59]">
              온스테이지 인원은 수업 단가를 정하고, 수업 접속 학생 수는 과금 인원을 정합니다. 수업
              시간은 10분 이하 무료, 이후 30분 단위로 청구됩니다.
            </p>
          </div>
          <div className="rounded-lg border border-[#D1FAE5] bg-[#ECFDF5] p-4 text-[13px] leading-6 text-[#084734]">
            <div className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                {isKrwMode
                  ? `원화 환산 기준: 1 CNY = ${formatNumber(cnyToKrw)}원, 1 USD = ${formatNumber(usdToKrw)}원. 실제 결제와 충전은 계약 및 결제일 조건에 따라 달라질 수 있습니다.`
                  : `환율 가정: 1 CNY = ${formatNumber(cnyToKrw)}원, 1 USD = ${formatNumber(usdToKrw)}원. 실제 결제 금액은 계약 및 결제일 환율에 따라 달라질 수 있습니다.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="space-y-9 border-b border-black/[0.08] bg-white p-5 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
          <FieldGroup
            title="수업 구조"
            description="온스테이지와 수업 접속 학생 수는 다른 값입니다. 온스테이지는 단가 기준이고, 접속 학생 수는 과금 인원 기준입니다."
          >
            <div className="space-y-7">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <details
                    className="relative"
                    open={isStudentHelpOpen}
                    onToggle={(event) => setIsStudentHelpOpen(event.currentTarget.open)}
                    onMouseEnter={() => setIsStudentHelpOpen(true)}
                    onMouseLeave={() => setIsStudentHelpOpen(false)}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-[#31302E] outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/20 [&::-webkit-details-marker]:hidden">
                      온스테이지 학생 수
                      <Info className="h-4 w-4 text-[#A39E98]" aria-hidden="true" />
                    </summary>
                    <div
                      role="tooltip"
                      className="absolute left-0 top-[calc(100%+0.65rem)] z-20 w-[280px] rounded-lg bg-[#31302E] p-4 text-[12px] leading-5 text-white shadow-xl"
                    >
                      한 수업에서 동시에 무대에 올라 비디오/오디오로 상호작용하는 학생 수입니다.
                      최대 12명까지만 선택하며, 이 값은 Business 수업 단가와 구독형 플랜 범위 판단에
                      사용됩니다.
                    </div>
                  </details>
                  <span className="rounded-lg bg-[#ECFDF5] px-3 py-1.5 text-[18px] font-semibold text-[#084734]">
                    {onStageStudentsNum}명
                  </span>
                </div>
                <Slider
                  aria-label="온스테이지 학생 수"
                  max={12}
                  step={1}
                  value={onStageStudents}
                  onValueChange={(value) => setOnStageStudents([Math.min(value[0] ?? 0, 12)])}
                  className="py-3 [&>span:first-child]:h-2.5 [&>span:first-child]:!bg-[#E5E5E0] [&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:border-[3px] [&_[role=slider]]:border-[#084734] [&_[role=slider]]:bg-white"
                />
                {onStageStudentsNum > connectedStudents ? (
                  <p className="text-[12px] leading-5 text-[#615D59]">
                    접속 학생 수보다 온스테이지 학생 수가 커서 계산에는{" "}
                    {formatNumber(pricing.effectiveOnStageStudents)}명을 반영합니다.
                  </p>
                ) : null}
              </div>

              <NumberInput
                id="connected-students"
                label="수업 접속 학생 수"
                value={connectedStudents}
                min={0}
                max={300}
                unit="명"
                onChange={setConnectedStudents}
              />
              <p className="text-[12px] leading-5 text-[#615D59]">
                Business 수업 진행 과금은 접속 학생 {formatNumber(pricing.billedStudents)}명과 강사
                1명을 기준으로 계산합니다.
                {pricing.unbilledStudents > 0
                  ? ` 학생 200명 초과 ${formatNumber(pricing.unbilledStudents)}명은 무료로 계산합니다.`
                  : ""}
              </p>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[13px] font-semibold text-[#31302E]">강사 계정 수</span>
                  <span className="rounded-lg bg-[#F6F5F4] px-3 py-1.5 text-[18px] font-semibold text-[#111110]">
                    {teachersNum}명
                  </span>
                </div>
                <Slider
                  aria-label="강사 계정 수"
                  max={50}
                  min={1}
                  step={1}
                  value={teachers}
                  onValueChange={setTeachers}
                  className="py-3 [&>span:first-child]:h-2.5 [&>span:first-child]:!bg-[#E5E5E0] [&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:border-[3px] [&_[role=slider]]:border-[#084734] [&_[role=slider]]:bg-white"
                />
              </div>

              <NumberInput
                id="course-students"
                label="반/코스 전체 인원 (구독형 기준)"
                value={courseStudents}
                min={1}
                max={3000}
                unit="명"
                onChange={setCourseStudents}
              />
            </div>
          </FieldGroup>

          <FieldGroup
            title="수업량과 청구 시간"
            description="Business는 실제 수업 시간이 아니라 청구 단위로 환산된 시간이 소모량에 반영됩니다."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput
                id="class-count"
                label="월 평균 수업 횟수"
                value={classCount}
                min={1}
                max={5000}
                unit="회"
                onChange={setClassCount}
              />
              <NumberInput
                id="class-duration"
                label="1회 평균 수업 시간"
                value={classDurationMinutes}
                min={5}
                max={1440}
                step={5}
                unit="분"
                onChange={setClassDurationMinutes}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[30, 50, 60, 90, 120, 180].map((minutes) => (
                <SegmentButton
                  key={minutes}
                  active={classDurationMinutes === minutes}
                  onClick={() => setClassDurationMinutes(minutes)}
                >
                  {formatMinutes(minutes)}
                </SegmentButton>
              ))}
            </div>

            <div className="rounded-lg border border-black/[0.08] bg-[#F6F5F4] p-4">
              <div className="flex items-start gap-3">
                <TimerReset className="mt-0.5 h-4 w-4 text-[#084734]" aria-hidden="true" />
                <div>
                  <p className="text-[13px] font-semibold text-[#111110]">
                    1회 {formatMinutes(classDurationMinutes)} → 청구 {formatMinutes(pricing.billableMinutesPerClass)}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-[#615D59]">
                    월 청구 수업 시간은 {formatDecimal(pricing.totalBillableHours)}시간입니다.
                    {classDurationMinutes <= 10 ? " 10분 이하 수업은 청구되지 않습니다." : null}
                  </p>
                </div>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup title="화질과 수업 옵션">
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {(["SD", "HD", "FHD"] as Quality[]).map((item) => (
                  <SegmentButton key={item} active={quality === item} onClick={() => setQuality(item)}>
                    {QUALITY_LABEL[item]}
                  </SegmentButton>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <NumberInput
                  id="assistant-count"
                  label="동석 조교 수"
                  value={assistantCount}
                  min={0}
                  max={6}
                  unit="명"
                  onChange={setAssistantCount}
                />
                <label className="flex min-h-12 items-center gap-3 rounded-lg border border-black/[0.08] bg-white px-3 py-3 text-[13px] font-semibold text-[#31302E]">
                  <input
                    type="checkbox"
                    checked={hasDualCamera}
                    onChange={(event) => setHasDualCamera(event.target.checked)}
                    className="h-4 w-4 accent-[#084734]"
                  />
                  1v1 듀얼 카메라 사용
                </label>
              </div>

              <div className="space-y-2">
                <span className="text-[13px] font-semibold text-[#31302E]">수업 녹화</span>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["none", "single", "dual"] as RecordingMode[]).map((mode) => (
                    <SegmentButton
                      key={mode}
                      active={recordingMode === mode}
                      onClick={() => setRecordingMode(mode)}
                    >
                      {RECORDING_LABEL[mode]}
                    </SegmentButton>
                  ))}
                </div>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup
            title="스토리지와 웹라이브 소모량"
            description="Business는 30GB까지 무료이고 초과 스토리지와 웹라이브 트래픽은 별도 소모량으로 계산합니다."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput
                id="storage-gb"
                label="예상 스토리지 사용량"
                value={storageGb}
                min={0}
                max={6000}
                unit="GB"
                onChange={setStorageGb}
              />
              <NumberInput
                id="web-live-gb"
                label="웹라이브 트래픽"
                value={webLiveTrafficGb}
                min={0}
                max={6000}
                unit="GB"
                onChange={setWebLiveTrafficGb}
              />
            </div>
          </FieldGroup>
        </div>

        <aside className="bg-[#F6F5F4] p-5 sm:p-8 lg:p-10">
          <div className="sticky top-24 space-y-5">
            <div className="grid gap-3">
              <SummaryCard
                icon={<WalletCards className="h-4 w-4" aria-hidden="true" />}
                label={isKrwMode ? "Business 월 환산액" : "Business 월 소모량"}
                value={isKrwMode ? formatKrw(pricing.businessKrw) : `${formatNumber(pricing.totalBusinessCny)} CNY`}
                helper={
                  isKrwMode
                    ? `${formatNumber(pricing.totalBusinessCny)} CNY 환산`
                    : `약 ${formatKrw(pricing.businessKrw)}`
                }
                active={businessRecommended}
              />
              <SummaryCard
                icon={<Users className="h-4 w-4" aria-hidden="true" />}
                label={isKrwMode ? "Learning Space 월 환산액" : "Learning Space 월 구독료"}
                value={isKrwMode ? formatKrw(pricing.subscriptionKrw) : `$${formatNumber(pricing.subscriptionUsd)}`}
                helper={
                  isKrwMode
                    ? `${pricing.subscription.tier} · $${formatNumber(pricing.subscriptionUsd)} 환산`
                    : `${pricing.subscription.tier} · 약 ${formatKrw(pricing.subscriptionKrw)}`
                }
                active={subscriptionRecommended}
              />
            </div>

            <div className="rounded-lg border border-black/[0.08] bg-white p-5">
              <div className="flex items-start gap-3">
                {pricing.recommendation === "consult" ? (
                  <AlertCircle className="mt-0.5 h-5 w-5 text-[#084734]" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#084734]" aria-hidden="true" />
                )}
                <div>
                  <p className="text-[15px] font-semibold text-[#111110]">
                    {pricing.recommendation === "consult"
                      ? "구독형 범위 확인 필요"
                      : businessRecommended
                        ? "현재 조건은 Business가 유리합니다"
                        : "현재 조건은 구독형이 유리합니다"}
                  </p>
                  <p className="mt-2 text-[13px] leading-6 text-[#615D59]">
                    {pricing.recommendation === "consult"
                      ? "입력값이 구독형 Enterprise 표준 범위를 넘습니다. Business 소모량 기준으로 검토하되 최종 조건은 상담으로 확정해야 합니다."
                      : businessRecommended
                        ? "초기 충전은 최소 10,000 CNY부터 가능하지만, 월 예상 소모량은 사용한 만큼 차감되는 방식입니다."
                        : "수업 시간이 많거나 고화질/부가 옵션이 포함될수록 정액형 구독이 예산 관리에 유리합니다."}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-black/[0.08] bg-white p-5">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-[#084734]" aria-hidden="true" />
                <h3 className="text-[15px] font-semibold text-[#111110]">Business 소모량 상세</h3>
              </div>
              <div className="mt-4">
                <BreakdownRow
                  label="수업 진행"
                  detail={`${pricing.classRate.label} · ${pricing.classRate.rate} CNY x ${formatNumber(pricing.billedPeople)}명(접속 학생 ${formatNumber(pricing.billedStudents)}명 + 강사 1명) x ${formatDecimal(pricing.totalBillableHours)}시간`}
                  amount={formatBusinessAmount(pricing.classCny)}
                />
                <BreakdownRow
                  label="조교 동석"
                  detail={
                    assistantCount > 0
                      ? `${formatNumber(assistantCount)}명 x ${pricing.assistantRate} CNY x ${formatDecimal(pricing.totalBillableHours)}시간`
                      : "선택 안 함"
                  }
                  amount={formatBusinessAmount(pricing.assistantCny)}
                />
                <BreakdownRow
                  label="수업 녹화"
                  detail={
                    recordingMode === "none"
                      ? "선택 안 함"
                      : `${RECORDING_LABEL[recordingMode]} · ${pricing.recordingRate} CNY x ${formatDecimal(pricing.totalBillableHours)}시간`
                  }
                  amount={formatBusinessAmount(pricing.recordingCny)}
                />
                <BreakdownRow
                  label="스토리지 초과"
                  detail={`${BUSINESS_FREE_STORAGE_GB}GB 무료 · 초과 ${formatNumber(pricing.storageOverageGb)}GB`}
                  amount={formatBusinessAmount(pricing.storageCny)}
                />
                <BreakdownRow
                  label="웹라이브 트래픽"
                  detail={`${formatNumber(webLiveTrafficGb)}GB x ${BUSINESS_WEBLIVE_CNY_PER_GB} CNY`}
                  amount={formatBusinessAmount(pricing.webLiveCny)}
                />
              </div>
              <div className="mt-4 rounded-lg bg-[#F6F5F4] p-4">
                <p className="text-[12px] font-semibold text-[#615D59]">초기 충전 권장액</p>
                <p className="mt-1 text-[22px] font-semibold tracking-tight text-[#111110]">
                  {isKrwMode
                    ? formatKrw(pricing.initialRechargeCny * cnyToKrw)
                    : `${formatNumber(pricing.initialRechargeCny)} CNY`}
                </p>
                <p className="mt-1 text-[12px] leading-5 text-[#615D59]">
                  {isKrwMode
                    ? `최소 충전 ${formatNumber(MIN_INITIAL_RECHARGE_CNY)} CNY (${formatKrw(MIN_INITIAL_RECHARGE_CNY * cnyToKrw)}), 이후 ${formatNumber(RECHARGE_STEP_CNY)} CNY 단위 충전 기준입니다.`
                    : "최소 충전 10,000 CNY, 이후 2,000 CNY 단위 충전 기준입니다."}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-black/[0.08] bg-white p-5">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-[#084734]" aria-hidden="true" />
                <h3 className="text-[15px] font-semibold text-[#111110]">구독형 판정</h3>
              </div>
              <div className="mt-4 grid gap-3 text-[13px] leading-6 text-[#615D59]">
                <p>
                  추천 플랜:{" "}
                  <span className="font-semibold text-[#111110]">{pricing.subscription.tier}</span>
                  {" · "}계정당 ${pricing.subscription.config.priceUsd}/월
                  {isKrwMode
                    ? ` (${formatSubscriptionAmount(pricing.subscription.config.priceUsd)} 환산)`
                    : ""}
                </p>
                <p>
                  포함 스토리지:{" "}
                  <span className="font-semibold text-[#111110]">
                    {formatNumber(pricing.subscriptionIncludedStorageGb)}GB
                  </span>
                  {pricing.subscriptionStorageOverageGb > 0
                    ? ` · 초과 ${formatNumber(pricing.subscriptionStorageOverageGb)}GB는 추가 구매 필요`
                    : ""}
                </p>
                {pricing.subscription.reasons.length > 0 ? (
                  <p>상향 사유: {pricing.subscription.reasons.join(", ")}</p>
                ) : (
                  <p>현재 조건은 Standard 범위에 들어옵니다.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-[#D1FAE5] bg-[#ECFDF5] p-4 text-[12px] leading-5 text-[#084734]">
              <div className="flex gap-2">
                <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  스토리지에는 스크린샷, 녹화본, 판서 파일 등이 포함됩니다. Business 저장 데이터는
                  수업일 기준 3개월 무료 보관 후 유료 청구될 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
