"use client"

import type { ReactNode } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { ArrowUpRight, RotateCw } from "lucide-react"
import { Skeleton } from "@/components/admin/viz"
import type {
  CumulativeMonthPoint,
  CumulativeSection,
  OverviewCumulativeSummary,
} from "@/lib/admin/overview/cumulative-summary"

// Recharts는 초기 번들에서 분리한다(OverviewCharts 모듈 규약).
const CumulativeTrendChart = dynamic(
  () => import("@/components/admin/overview/OverviewCharts").then((m) => m.CumulativeTrendChart),
  { ssr: false, loading: () => <div className="h-[120px]" aria-hidden="true" /> }
)
const MonthlyHighlightBarChart = dynamic(
  () => import("@/components/admin/overview/OverviewCharts").then((m) => m.MonthlyHighlightBarChart),
  { ssr: false, loading: () => <div className="h-[150px]" aria-hidden="true" /> }
)

const BORDER = "border-[rgba(0,0,0,0.08)]"

function ymLabel(ym: string) {
  const [year, month] = ym.split("-")
  return `${year}.${month}`
}

function monthLabel(ym: string) {
  return `${Number(ym.split("-")[1])}월`
}

function fyLabel(fiscalYear: number) {
  return `FY${String(fiscalYear).slice(-2)}`
}

function formatAsOf(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
}

type SectionState = "loading" | "ready" | "error" | "forbidden"

function sectionState<T>(section: CumulativeSection<T> | undefined, loading: boolean): SectionState {
  if (!section) return loading ? "loading" : "error"
  return section.status
}

function SourceRetry({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      aria-label={`${label} 다시 시도`}
      className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#B43E3E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
    >
      <RotateCw className="h-3 w-3" aria-hidden="true" />
      다시 시도
    </button>
  )
}

function CumulativeFigure({
  label,
  unit,
  state,
  value,
  accent,
  delta,
  series,
  caption,
  href,
  hrefLabel,
  onRetry,
}: {
  label: string
  unit: string
  state: SectionState
  value: number | null
  accent: boolean
  delta: ReactNode
  series: CumulativeMonthPoint[] | null
  caption: ReactNode
  href: string
  hrefLabel: string
  onRetry: () => void
}) {
  return (
    <div className="min-w-0" aria-busy={state === "loading"}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[#31302E]">{label}</p>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-[#084734] hover:text-[#065c41]">
          {hrefLabel}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      {state === "loading" ? (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-14 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-[120px] w-full" />
        </div>
      ) : state === "ready" && value !== null ? (
        <>
          <p className={`mt-2 text-[52px] font-bold leading-none tracking-[-0.04em] sm:text-[64px] ${accent ? "text-[#084734]" : "text-[#111110]"}`}>
            {value.toLocaleString("ko-KR")}
            <span className="ml-1.5 text-2xl font-semibold tracking-normal text-[#111110]">{unit}</span>
          </p>
          <p className="mt-3 text-sm text-[#31302E]">{delta}</p>
          {series && series.length > 1 ? (
            <div className="mt-4" role="img" aria-label={`${label} 월말 누적 추이, ${ymLabel(series[0].ym)} ${series[0].cumulative.toLocaleString("ko-KR")}${unit}에서 ${ymLabel(series[series.length - 1].ym)} ${series[series.length - 1].cumulative.toLocaleString("ko-KR")}${unit}`}>
              <CumulativeTrendChart data={series.map((point) => ({ label: ymLabel(point.ym), count: point.cumulative }))} suffix={unit} />
              <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[#615D59]" aria-hidden="true">
                <span>{ymLabel(series[0].ym)}</span>
                <span>{ymLabel(series[series.length - 1].ym)}</span>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-3">
          <p className="text-[40px] font-bold leading-none tracking-[-0.04em] text-[#111110]">{state === "forbidden" ? "—" : "확인 필요"}</p>
          <p className="mt-3 text-xs text-[#615D59]">{state === "forbidden" ? "이 원천을 볼 권한이 없습니다." : "조회 실패 · 0이 아닙니다"}</p>
          {state === "error" ? <SourceRetry label={label} onRetry={onRetry} /> : null}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[#615D59]">{caption}</p>
    </div>
  )
}

/**
 * Overview 히어로 — 누적 고객(REV 장부) · 누적 판매 대수(하드웨어 재고 원장). 두 숫자는 원천이 달라
 * 더하거나 나누지 않고, 한쪽이 실패해도 다른 쪽은 그대로 보인다. 정의: docs/active/admin-overview-workspace.md.
 */
export function OverviewCumulativeHero({
  summary,
  loading,
  onRetry,
}: {
  summary: OverviewCumulativeSummary | null
  loading: boolean
  onRetry: () => void
}) {
  const customers = summary?.customers.status === "ready" ? summary.customers : null
  const units = summary?.units.status === "ready" ? summary.units : null
  const customerData = customers?.data ?? null
  const unitData = units?.data ?? null
  const customersAsOf = formatAsOf(customers?.asOf)
  const fy = customerData ? fyLabel(customerData.ledgerFiscalYear) : "이번 FY"

  return (
    <section aria-labelledby="overview-cumulative-heading" className={`mb-6 rounded-2xl border ${BORDER} bg-white px-5 py-7 sm:px-9 sm:py-8`}>
      <h2 id="overview-cumulative-heading" className="text-xs font-semibold text-[#615D59]">지금까지 · 누적</h2>
      <div className="mt-5 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-0">
        <CumulativeFigure
          label="누적 고객"
          unit="곳"
          state={sectionState(summary?.customers, loading)}
          value={customerData?.total ?? null}
          accent
          delta={customerData ? <>이번 회계연도 <b className="font-semibold text-[#084734]">+{customerData.fyAdded.toLocaleString("ko-KR")}곳</b> · 이번 달 +{customerData.monthAdded.toLocaleString("ko-KR")}곳</> : null}
          series={customerData?.series ?? null}
          href="/admin/branch/ledger?period=Y"
          hrefLabel="매출 장부"
          onRetry={onRetry}
          caption={<>
            기준: 결제 이력이 있는 기관(첫 결제일 또는 확정 매출 월) · 기관 키로 중복 제거 · 취소·해지 제외 · {fy} 장부에 남은 기관만
            {customerData && customerData.undatedCount > 0 ? <> · 첫 결제 월 미상 {customerData.undatedCount}곳은 합계에만</> : null}
            <br />원천: REV 매출 장부{customers?.sourceKind === "mirror" ? "(시트 미러)" : ""}{customersAsOf ? ` · ${customersAsOf} 기준` : ""}
          </>}
        />
        <div className={`lg:border-l ${BORDER} lg:pl-10`}>
          <CumulativeFigure
            label="누적 판매"
            unit="대"
            state={sectionState(summary?.units, loading)}
            value={unitData?.total ?? null}
            accent={false}
            delta={unitData ? <>이번 회계연도 <b className="font-semibold text-[#084734]">+{unitData.fyAdded.toLocaleString("ko-KR")}대</b> · 이번 달 +{unitData.monthAdded.toLocaleString("ko-KR")}대 · 배송 예정 {unitData.planned.toLocaleString("ko-KR")}대 별도</> : null}
            series={unitData?.series ?? null}
            href="/admin/hardware"
            hrefLabel="하드웨어 재고"
            onRetry={onRetry}
            caption={<>
              기준: 전자칠판 실판매 출고 수량 · 예정·프로모션·샘플·A/S·내부 이동·무효 제외
              {unitData && unitData.returned > 0 ? <> · 회수 {unitData.returned.toLocaleString("ko-KR")}대는 빼지 않고 별도</> : null}
              {unitData && unitData.undated > 0 ? <> · 출고일 미상 {unitData.undated}대는 합계에만</> : null}
              <br />원천: 하드웨어 재고 원장{unitData?.firstYm ? ` · ${ymLabel(unitData.firstYm)} 기록부터` : ""}
            </>}
          />
        </div>
      </div>
    </section>
  )
}

function MonthlyCard({ title, unit, state, series, note, onRetry }: {
  title: string
  unit: string
  state: SectionState
  series: CumulativeMonthPoint[] | null
  note: string
  onRetry: () => void
}) {
  const last12 = series ? series.slice(-12) : null
  return (
    <section className={`min-w-0 rounded-2xl border ${BORDER} bg-white p-5 sm:p-6`} aria-busy={state === "loading"}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-[#111110]">{title} <span className="text-[11px] font-normal text-[#615D59]">최근 12개월</span></h2>
        <span className="text-[11px] text-[#615D59]">이번 달 진하게</span>
      </div>
      {state === "loading" ? (
        <Skeleton className="h-[150px] w-full" />
      ) : state === "ready" && last12 ? (
        <div role="img" aria-label={`${title} 최근 12개월 막대, 이번 달 ${last12[last12.length - 1].added}${unit}`}>
          <MonthlyHighlightBarChart data={last12.map((point) => ({ label: monthLabel(point.ym), count: point.added }))} suffix={unit} />
        </div>
      ) : (
        <div className="flex h-[150px] flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold text-[#111110]">{state === "forbidden" ? "권한 없음" : "조회 실패 · 0이 아닙니다"}</p>
          {state === "error" ? <SourceRetry label={title} onRetry={onRetry} /> : null}
        </div>
      )}
      <p className={`mt-4 border-t ${BORDER} pt-3 text-[11px] leading-relaxed text-[#615D59]`}>{note}</p>
    </section>
  )
}

/** 히어로의 월별 짝 — 같은 응답(series.added)을 막대로 본다. */
export function OverviewCumulativeMonthly({
  summary,
  loading,
  onRetry,
}: {
  summary: OverviewCumulativeSummary | null
  loading: boolean
  onRetry: () => void
}) {
  return (
    <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <MonthlyCard
        title="월별 신규 고객"
        unit="곳"
        state={sectionState(summary?.customers, loading)}
        series={summary?.customers.status === "ready" ? summary.customers.data.series : null}
        note="처음 결제가 잡힌 달 기준 · 원천: REV 매출 장부"
        onRetry={onRetry}
      />
      <MonthlyCard
        title="월별 전자칠판 출고"
        unit="대"
        state={sectionState(summary?.units, loading)}
        series={summary?.units.status === "ready" ? summary.units.data.series : null}
        note="실판매 출고 수량 · 예정 제외 · 원천: 하드웨어 재고 원장"
        onRetry={onRetry}
      />
    </div>
  )
}
