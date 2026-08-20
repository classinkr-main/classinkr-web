"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { PeriodToggle } from "@/components/admin/PeriodToggle"
import { EmptyState } from "@/components/admin/viz"
import { ComparisonBarChart } from "@/components/admin/viz/ComparisonBarChart"
import { CHART, gridProps } from "@/components/admin/viz/theme"
import { money } from "@/components/admin/campaigns/event-format"
import {
  SOURCE_GROUP_DOT,
  SOURCE_GROUP_LABEL,
  SOURCE_GROUP_ORDER,
  type LeadSourceGroup,
} from "@/lib/crm/lead-attribution"
import {
  shiftDays,
  type DailyPoint,
  type LeadDailyBySourcePoint,
  type PerfPeriod,
} from "@/lib/marketing/perf"

// 일자별 추이 카드 — 보기 토글 2모드.
//  [광고비·리드] = ComparisonBarChart(막대 spend USD 좌축 + 선 리드 우축, 둘 다 Meta 스냅샷 축)
//  [소스별 유입] = 소스 그룹 스택 막대(리드 테이블 축, SOURCE_GROUP_DOT 색 — 차트 한정 사용)
// Recharts 를 끌고 오므로 소비처(SummaryTab)는 next/dynamic(ssr:false)으로 로드한다.

type TrendMode = "spend" | "source"

const TREND_MODES = [
  { id: "spend", label: "광고비·리드" },
  { id: "source", label: "소스별 유입" },
] as const

const COUNT = new Intl.NumberFormat("ko-KR")
const USD_COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

// ComparisonBarChart 의 다크 툴팁과 동일한 시각(viz 토큰) — 스택 차트 쪽 기본 Tooltip 에 적용.
const DARK_TOOLTIP_STYLE = {
  backgroundColor: CHART.tooltipBg,
  border: "none",
  borderRadius: 12,
  color: "white",
  fontSize: 12,
} as const

// "YYYY-MM-DD" → "M/D" 축 라벨. interval=0 축에서 과밀을 피하려 step 간격으로만 라벨을 남긴다.
function shortDate(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
}

function labelStep(length: number): number {
  return Math.max(1, Math.ceil(length / 12))
}

export function DailyTrendSection({
  daily,
  leadDailyBySource,
  period,
  snapshotAt,
  leadsMeasured,
}: {
  daily: DailyPoint[]
  leadDailyBySource: LeadDailyBySourcePoint[]
  period: PerfPeriod
  snapshotAt: string | null
  /** 리드 소스 조회 성공 여부(kpis.leads.value != null) — 실패를 "유입 0"으로 위장하지 않는다. */
  leadsMeasured: boolean
}) {
  const [mode, setMode] = useState<TrendMode>("spend")

  const spendData = useMemo(() => {
    const step = labelStep(daily.length)
    return daily.map((point, i) => ({
      ...point,
      label: i % step === 0 ? shortDate(point.date) : "",
    }))
  }, [daily])

  // 소스별 스택 — 응답은 리드 있는 날만 담는다(0 채움 없음 계약). 리드 소스가 "성공"한 경우에
  // 한해, 표시층에서 기간 전체 날짜로 축을 채운다(성공했는데 행이 없는 날 = 실측 0건이므로 날조 아님).
  const source = useMemo(() => {
    const byDate = new Map(leadDailyBySource.map((point) => [point.date, point]))
    const dates: string[] = []
    let cursor = period.since
    let guard = 0
    while (cursor <= period.until && guard < 400) {
      dates.push(cursor)
      cursor = shiftDays(cursor, 1)
      guard += 1
    }
    const step = labelStep(dates.length)
    const rows = dates.map((date, i) => ({
      ...(byDate.get(date) ?? {}),
      date,
      label: i % step === 0 ? shortDate(date) : "",
    }))
    const groups = SOURCE_GROUP_ORDER.filter((group) =>
      leadDailyBySource.some((point) => (point[group] ?? 0) > 0)
    )
    return { rows, groups }
  }, [leadDailyBySource, period])

  function renderBody() {
    if (mode === "spend") {
      if (daily.length === 0) {
        return snapshotAt == null ? (
          <EmptyState
            title="스냅샷 미적재 — 크론/백필 적용 전"
            description="Meta 일자 인사이트 스냅샷이 아직 수집되지 않아 광고비·리드 추이를 그릴 수 없습니다."
          />
        ) : (
          <p className="rounded-xl bg-[#fafaf8] py-10 text-center text-[12px] text-[#A39E98]">
            기간 내 집행 기록이 없습니다.
          </p>
        )
      }
      return (
        <ComparisonBarChart
          data={spendData}
          xKey="label"
          bars={[
            {
              key: "spend",
              label: "광고비(USD)",
              color: CHART.neutral,
              formatValue: (value) => money(value, "USD"),
            },
          ]}
          line={{
            key: "leads",
            label: "리드",
            color: CHART.brand,
            formatValue: (value) => `${COUNT.format(value)}건`,
          }}
          height={280}
          formatLeftTick={(value) => `$${USD_COMPACT.format(value)}`}
          formatRightTick={(value) => COUNT.format(value)}
          labelFormatter={(_, payload) =>
            (payload?.[0]?.payload as DailyPoint | undefined)?.date ?? ""
          }
          showLegend
        />
      )
    }

    if (!leadsMeasured) {
      return (
        <EmptyState
          title="리드 소스 조회 실패"
          description="리드 저장소 조회가 실패해 소스별 유입을 표시할 수 없습니다 — 유입 0건과 구분됩니다."
        />
      )
    }
    if (source.groups.length === 0) {
      return (
        <p className="rounded-xl bg-[#fafaf8] py-10 text-center text-[12px] text-[#A39E98]">
          기간 내 리드 유입이 없습니다.
        </p>
      )
    }
    return (
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={source.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" tickLine={false} interval={0} fontSize={11} stroke={CHART.warmGray} />
            <YAxis tickLine={false} width={36} allowDecimals={false} fontSize={11} stroke={CHART.warmGray} />
            <Tooltip
              cursor={{ fill: "rgba(17,17,16,0.04)" }}
              contentStyle={DARK_TOOLTIP_STYLE}
              labelFormatter={(_, payload) =>
                (payload?.[0]?.payload as { date?: string } | undefined)?.date ?? ""
              }
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => <span className="text-[11px] text-[#1a1a1a]/55">{value}</span>}
              wrapperStyle={{ paddingTop: 8 }}
            />
            {source.groups.map((group: LeadSourceGroup) => (
              <Bar
                key={group}
                dataKey={group}
                stackId="src"
                name={SOURCE_GROUP_LABEL[group]}
                fill={SOURCE_GROUP_DOT[group]}
                maxBarSize={22}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5" aria-label="일자별 추이">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">일자별 추이</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            {mode === "spend"
              ? "Meta 일자 스냅샷 기준 — 광고비(USD)와 리드"
              : "리드 테이블 기준 — 소스 그룹별 유입(테스트 리드 제외)"}
          </p>
        </div>
        <PeriodToggle options={TREND_MODES} value={mode} onChange={setMode} ariaLabel="추이 보기 방식" />
      </div>
      {renderBody()}
    </section>
  )
}
