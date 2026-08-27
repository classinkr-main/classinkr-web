"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { TONE, type Tone } from "./theme"

// 어드민 공용 프리미티브 — overview·analytics·traffic에서 각자 재선언하던 카드/패널/리스트를 단일화.

// ── Panel (= 기존 overview SectionCard / analytics Panel) ──────────────
export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

// overview 호출부가 SectionCard 이름을 그대로 쓰도록 별칭 export.
export const SectionCard = Panel

// ── TrendBadge ─────────────────────────────────────────────────────────
export function TrendBadge({
  value,
  format,
  invert,
}: {
  value: number
  format?: "count" | "percent"
  invert?: boolean
}) {
  const positive = invert ? value < 0 : value > 0
  const neutral = value === 0
  const cls = neutral
    ? "bg-[#f0f0ec] text-[#1a1a1a]/40"
    : positive
      ? "bg-green-50 text-green-600"
      : "bg-[#FEF3EE] text-[#B85C33]"
  const text =
    format === "percent" ? `${value > 0 ? "+" : ""}${Math.round(value * 100)}%` : String(Math.abs(value))
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {neutral ? (
        <Minus className="h-3 w-3" />
      ) : value > 0 ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {text}
    </span>
  )
}

// ── StatTile (= 기존 analytics/traffic SummaryCard + components/admin/StatCard 통합) ──
// trend는 두 형태를 모두 받는다: 단순 number(기존 StatTile 호출부) 또는
// { value, label, format, invert } 상세 객체(기존 StatCard 호출부).
export interface StatTileTrend {
  value: number
  label?: string
  // 배지 표기 방식: "count"=절대 증감(기본), "percent"=퍼센트(value는 0.12 같은 비율).
  format?: "count" | "percent"
  // 증가가 나쁜 지표(예: 미응대, 이탈)는 invert로 색상을 뒤집는다.
  invert?: boolean
}

function trendBadgeText(trend: StatTileTrend) {
  if (trend.format === "percent") {
    return `${trend.value > 0 ? "+" : ""}${Math.round(trend.value * 100)}%`
  }
  return String(Math.abs(trend.value))
}

export function StatTile({
  icon,
  label,
  value,
  hint,
  hintMono,
  trend,
  tone,
  accent,
  iconColor,
  sparkline,
  href,
  lift,
  compact,
  valueSize,
  variant = "card",
  iconLayout = "badge",
}: {
  icon: ReactNode
  label: string
  // string|number 외에 ReactNode도 받는다(로딩 스켈레톤 노드·breach 색 인라인 span 등
  // 호출부가 값 자리에 조건부 마크업을 꽂는 유스케이스 수용 — CRM quick-stats류).
  value: ReactNode
  hint?: ReactNode
  // true면 hint를 mono 유틸로 렌더(이벤트명·경로 등 계측 메타 표기용 — traffic conversionCards).
  hintMono?: boolean
  trend?: number | StatTileTrend
  // tone을 주면 4톤(neutral·brand·caution·danger)에서 accent/iconColor를 도출한다.
  // 레거시 accent/iconColor는 tone 미지정 시 폴백으로 유지(기존 StatCard 호출부 무손상).
  tone?: Tone
  accent?: string
  iconColor?: string
  // KPI 카드 아래 미니 추이. <Sparkline/>을 next/dynamic으로 감싼 노드를 슬롯으로 받는다
  // (StatTile 자체는 Recharts-free 유지).
  sparkline?: ReactNode
  // 주면 카드 전체가 해당 경로로 이동하는 드릴다운 링크가 된다.
  href?: string
  // true면 href 유무와 무관하게 hover-lift+shadow 카드 스타일(구 StatCard 시각) 적용.
  // 일반 StatTile 호출부는 생략 시 기존 flat 카드 스타일을 유지한다.
  lift?: boolean
  // 밀도 높은 대시보드용 컴팩트 변형(p-4 · 라벨 10px) — 구 campaigns KpiCard 시각.
  // 값은 md와 같은 28px다(2026-08-27: 대표 숫자를 키우면서 22→28). compact가 좁히는 것은
  // 이제 패딩과 라벨이지 숫자가 아니다 — 스트립이 섞여 있어도 값 열의 크기가 어긋나지 않는다.
  compact?: boolean
  // 값 타이포 스케일 옵트인. "lg"=34px — '숫자를 화면의 주어로' 스트립(overview 상단)용.
  // 생략 시 28px 그대로 — 다른 호출부 무손상. lg만 34px로 키운다(compact는 lg를 받지 않는다).
  valueSize?: "md" | "lg"
  // 박스 처리(기본 "card" — 기존 시각과 완전 동일):
  //   card = 흰 배경 + rounded-2xl 테두리(기존 flat/lift 그대로)
  //   soft = 테두리 없는 rounded-xl 틴트 배경(bg-[#fafaf8]) — 구 CRM MeasureTile류 소형 지표 박스
  //   bare = 박스 없이 border-t 구분선만(장식 없는 위계, designPrinciples §7) — 구 CRM MetricCard(deals/rev-sheet/matching 3중복)류 그리드 내부 슬롯
  variant?: "card" | "soft" | "bare"
  // 아이콘 배치(기본 "badge" — 기존 시각과 완전 동일):
  //   badge = 색 배지 안 아이콘이 별도 행(기존 그대로)
  //   inline = 아이콘이 라벨과 같은 행에 저대비로 붙는 헤더(구 CRM MeasureTile/quick-stats 헤더 패턴)
  iconLayout?: "badge" | "inline"
}) {
  const resolvedTrend: StatTileTrend | null =
    typeof trend === "number" ? { value: trend } : trend ?? null
  const positive = resolvedTrend ? (resolvedTrend.invert ? resolvedTrend.value < 0 : resolvedTrend.value > 0) : false
  const neutral = resolvedTrend ? resolvedTrend.value === 0 : false

  // tone 우선 → 없으면 레거시 accent/iconColor → 없으면 neutral 톤.
  const resolvedAccent = tone ? TONE[tone].surfaceClass : accent ?? TONE.neutral.surfaceClass
  const resolvedIcon = tone ? TONE[tone].iconClass : iconColor ?? TONE.neutral.iconClass

  const trendNode = resolvedTrend && (
    <span
      className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
        neutral
          ? "bg-[#f0f0ec] text-[#1a1a1a]/40"
          : positive
            ? "bg-green-50 text-green-600"
            : "bg-[#FEF3EE] text-[#B85C33]"
      }`}
    >
      {neutral ? (
        <Minus className="h-3 w-3" />
      ) : resolvedTrend.value > 0 ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {trendBadgeText(resolvedTrend)}
    </span>
  )

  // iconLayout="badge"(기본)는 기존 DOM·클래스와 완전히 동일 — 회귀 없음.
  const header =
    iconLayout === "inline" ? (
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[#1a1a1a]/40">
          {/* icon=null 어댑터(구 MetricCard)에서 빈 span이 gap 6px 라벨 인셋을 만들지 않도록 조건부 렌더 */}
          {icon != null && <span className="shrink-0">{icon}</span>}
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em]">{label}</p>
        </div>
        {trendNode}
      </div>
    ) : (
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className={`inline-flex rounded-xl p-2 ${resolvedAccent} ${resolvedIcon}`}>{icon}</div>
        {trendNode}
      </div>
    )

  const body = (
    <>
      {header}
      {iconLayout !== "inline" && (
        <p className={compact ? "mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35" : "mb-1 text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/40"}>{label}</p>
      )}
      {/* tabular-nums: 스트립에서 카드끼리 자릿수 폭이 같아야 값 열이 정렬된다(숫자 아닌 값엔 무영향). */}
      <p
        className={
          compact
            ? "text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#111110]"
            : valueSize === "lg"
              ? "text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#111110]"
              : "text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#111110]"
        }
      >
        {value}
      </p>
      {hint && (
        <p className={hintMono ? "mt-1.5 font-mono text-[11px] text-[#1a1a1a]/40" : "mt-1.5 text-[11px] text-[#1a1a1a]/40"}>{hint}</p>
      )}
      {resolvedTrend?.label && <p className="mt-0.5 text-[11px] text-[#1a1a1a]/30">{resolvedTrend.label}</p>}
      {sparkline && <div className="mt-3 -mb-1">{sparkline}</div>}
    </>
  )

  const pad = compact ? "p-4" : "p-5"
  const liftClass = `bg-white rounded-2xl border border-[#e8e8e4] ${pad} shadow-[0_1px_0_rgba(17,17,16,0.02)] transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_12px_30px_rgba(17,17,16,0.04)]`
  const flatClass = `rounded-2xl border border-[#e8e8e4] bg-white ${pad}`
  const softPad = compact ? "p-3" : "p-4"
  // soft/bare는 href일 때만 hover 어포던스를 붙인다(정적 지표 슬롯에 불필요한 인터랙션 신호 금지).
  const softClass = `rounded-xl bg-[#fafaf8] ${softPad}${href ? " transition-colors hover:bg-white" : ""}`
  const bareClass = `border-t border-[#f0f0ec] pt-4${href ? " transition-opacity hover:opacity-70" : ""}`

  const innerClass =
    variant === "bare" ? bareClass : variant === "soft" ? softClass : href ? liftClass : lift ? liftClass : flatClass
  const cardClass = href ? `block ${innerClass}` : innerClass

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {body}
      </Link>
    )
  }
  return <div className={cardClass}>{body}</div>
}

// ── InsightCard ────────────────────────────────────────────────────────
const INSIGHT_SURFACE: Record<Tone, string> = {
  neutral: "bg-[#fafaf8] border-[#e8e8e4]",
  brand: "bg-[#ECFDF5]/70 border-[#D1FAE5]",
  caution: "bg-amber-50/70 border-amber-100",
  danger: "bg-[#FEF3EE]/70 border-[#F6D5C5]",
}

export function InsightCard({
  eyebrow,
  title,
  description,
  tone = "neutral",
}: {
  eyebrow: string
  title: string
  description: string
  tone?: Tone
}) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${INSIGHT_SURFACE[tone]}`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">{eyebrow}</p>
      <p className="mt-2 text-[14px] font-semibold tracking-[-0.01em] text-[#111110]">{title}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[#1a1a1a]/45">{description}</p>
    </div>
  )
}

// ── MetricRankList (제네릭) ─────────────────────────────────────────────
export function MetricRankList<T>({
  rows,
  empty,
  getLabel,
  getValue,
  getMeta,
  getMagnitude,
  keyOf,
}: {
  rows: T[]
  empty: string
  getLabel: (row: T) => string
  getValue: (row: T) => string
  getMeta: (row: T) => string
  getMagnitude: (row: T) => number
  keyOf?: (row: T, i: number) => string
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-[12px] text-[#1a1a1a]/45">{empty}</p>
  }
  const max = Math.max(1, ...rows.map((row) => getMagnitude(row)))
  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const width = Math.max(8, Math.round((getMagnitude(row) / max) * 100))
        return (
          <div key={keyOf ? keyOf(row, i) : `${getLabel(row)}-${i}`} className="space-y-1.5">
            <div className="flex items-start justify-between gap-3 text-[12px]">
              <div className="min-w-0">
                <p className="truncate font-mono text-[#111110]">{getLabel(row)}</p>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{getMeta(row)}</p>
              </div>
              <span className="shrink-0 font-semibold text-[#111110]">{getValue(row)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0ec]">
              <div className="h-full rounded-full bg-[#084734]" style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── EmptyState ─────────────────────────────────────────────────────────
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-4 py-10 text-center sm:py-12">
      <p className="text-[14px] font-medium text-[#111110]">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-[#1a1a1a]/40">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function TableEmpty({ message }: { message: string }) {
  return <p className="py-8 text-center text-[12px] text-[#1a1a1a]/30">{message}</p>
}

// ── Skeletons ──────────────────────────────────────────────────────────
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#f0f0ec] ${className}`} />
}

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function KpiSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-[#e8e8e4] bg-white p-5">
      <Skeleton className="h-8 w-8 rounded-xl" />
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-14" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

export function ChartSkeleton({ className = "h-[220px]" }: { className?: string }) {
  return <div className={`rounded-xl bg-[#f0f0ec] ${className}`} />
}
