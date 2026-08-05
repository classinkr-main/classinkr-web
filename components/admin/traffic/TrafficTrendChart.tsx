"use client"

import { useId, useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CHART, axisTick, cursorLine, gridProps } from "../viz/theme"

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR")
const HOME_SERIES_COLOR = "#615D59"
const INITIAL_CHART_DIMENSION = { width: 320, height: 260 }

export interface TrafficTrendRow {
  date: string
  visitors: number
  homeVisitors: number
}

export interface TrafficTrendChartProps {
  rows: TrafficTrendRow[]
}

function formatShortDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return `${Number(match[2])}.${Number(match[3])}.`
}

function formatFullDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`
}

function TrafficTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: TrafficTrendRow }>
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null

  return (
    <div className="min-w-[164px] rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5 text-[12px] shadow-[0_16px_40px_rgba(17,17,16,0.16)]">
      <p className="mb-2 font-bold text-[#111110]">{formatFullDate(row.date)}</p>
      <div className="space-y-1.5">
        <p className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#615D59]">
            <span className="h-0 w-4 border-t-2 border-[#084734]" aria-hidden="true" />
            전체 방문자
          </span>
          <span className="font-bold tabular-nums text-[#111110]">
            {NUMBER_FORMATTER.format(row.visitors)}명
          </span>
        </p>
        <p className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#615D59]">
            <span
              className="h-0 w-4 border-t-2 border-dashed border-[#615D59]"
              aria-hidden="true"
            />
            홈 방문자
          </span>
          <span className="font-bold tabular-nums text-[#111110]">
            {NUMBER_FORMATTER.format(row.homeVisitors)}명
          </span>
        </p>
      </div>
    </div>
  )
}

export function TrafficTrendChart({ rows }: TrafficTrendChartProps) {
  const [showTable, setShowTable] = useState(false)
  const id = useId()
  const summaryId = `${id}-summary`
  const tableRegionId = `${id}-table`

  const summary = useMemo(() => {
    if (rows.length === 0) {
      return "표시할 트래픽 데이터가 없습니다."
    }

    const first = rows[0]
    const last = rows[rows.length - 1]
    const visitorTotal = rows.reduce((sum, row) => sum + row.visitors, 0)
    const homeVisitorTotal = rows.reduce((sum, row) => sum + row.homeVisitors, 0)
    const period =
      first.date === last.date
        ? formatFullDate(first.date)
        : `${formatFullDate(first.date)}부터 ${formatFullDate(last.date)}까지`

    return `${period} ${rows.length}일의 트래픽 추이입니다. 전체 방문자 합계 ${NUMBER_FORMATTER.format(visitorTotal)}명, 홈 방문자 합계 ${NUMBER_FORMATTER.format(homeVisitorTotal)}명입니다. 날짜별 정확한 값은 표로 보기 버튼을 눌러 확인할 수 있습니다.`
  }, [rows])

  return (
    <figure className="min-w-0" aria-describedby={summaryId}>
      <figcaption id={summaryId} className="sr-only">
        {summary}
      </figcaption>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <ul
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-semibold text-[#615D59]"
          aria-label="차트 범례"
        >
          <li className="inline-flex items-center gap-2">
            <span className="h-0 w-7 border-t-2 border-[#084734]" aria-hidden="true" />
            전체 방문자
          </li>
          <li className="inline-flex items-center gap-2">
            <span
              className="h-0 w-7 border-t-2 border-dashed border-[#615D59]"
              aria-hidden="true"
            />
            홈 방문자
          </li>
        </ul>

        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] font-semibold text-[#31302E] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
          aria-controls={tableRegionId}
          aria-expanded={showTable}
          onClick={() => setShowTable((current) => !current)}
        >
          {showTable ? "표 닫기" : "표로 보기"}
        </button>
      </div>

      {rows.length > 0 ? (
        <div className="h-[260px] w-full min-w-0 sm:h-[300px]">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={INITIAL_CHART_DIMENSION}
          >
            <LineChart
              data={rows}
              accessibilityLayer
              margin={{ top: 8, right: 10, bottom: 0, left: -10 }}
            >
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="date"
                tick={axisTick}
                tickFormatter={formatShortDate}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={46}
              />
              <Tooltip content={<TrafficTooltip />} cursor={cursorLine} />
              <Line
                type="monotone"
                dataKey="visitors"
                name="전체 방문자"
                stroke={CHART.brand}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: CHART.brand, stroke: "#FFFFFF", strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="homeVisitors"
                name="홈 방문자"
                stroke={HOME_SERIES_COLOR}
                strokeWidth={2}
                strokeDasharray="7 5"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: HOME_SERIES_COLOR,
                  stroke: "#FFFFFF",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[260px] items-center justify-center rounded-xl bg-[#F6F5F4] px-6 text-center text-[14px] font-medium text-[#615D59] sm:h-[300px]">
          표시할 트래픽 데이터가 없습니다.
        </div>
      )}

      <div
        id={tableRegionId}
        hidden={!showTable}
        className="mt-5 overflow-x-auto rounded-xl border border-[rgba(0,0,0,0.08)]"
      >
        <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
          <caption className="sr-only">날짜별 전체 방문자와 홈 방문자</caption>
          <thead className="bg-[#F6F5F4] text-[#31302E]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                날짜
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                전체 방문자
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                홈 방문자
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(0,0,0,0.08)] bg-white text-[#111110]">
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.date}>
                  <th scope="row" className="whitespace-nowrap px-4 py-3 font-medium">
                    <time dateTime={row.date}>{formatFullDate(row.date)}</time>
                  </th>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {NUMBER_FORMATTER.format(row.visitors)}명
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {NUMBER_FORMATTER.format(row.homeVisitors)}명
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[#615D59]">
                  표시할 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
