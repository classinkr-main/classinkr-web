"use client";

import { useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatMoney, formatPercent } from "@/lib/branch/ledger-format"
import type { BranchKpiMemberRow, BranchSummaryResponse } from "./types"
import type { KpiMemberView, KpiMetricView, RevWeekPoint } from "./SalesLedgerWorkbench"

// SalesLedgerWorkbench.tsx의 compareText와 동일한 로직의 로컬 사본 — KpiGapChart 정렬 전용.
// (값 import를 피해 SalesLedgerWorkbench와의 실제 순환 의존을 만들지 않기 위한 의도적 중복.)
function compareText(a: string | null | undefined, b: string | null | undefined) {
  return String(a ?? "").localeCompare(String(b ?? ""), "ko", { numeric: true, sensitivity: "base" })
}

export function PacingChart({ summary }: { summary: BranchSummaryResponse | null }) {
  const data = useMemo(() => {
    const months = summary?.monthly_series?.months ?? []
    const goals = summary?.monthly_series?.goal_cum ?? []
    const actuals = summary?.monthly_series?.revenue_cum ?? []
    const trends = summary?.monthly_series?.revenue_trend_cum ?? []
    return months.map((month, index) => ({
      month: `${Number(month.slice(5, 7))}월`,
      goal: goals[index] ?? 0,
      actual: actuals[index] ?? 0,
      trend: trends[index] ?? 0,
    }))
  }, [summary])

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] text-[#615D59]">
        월별 누적 데이터가 아직 없습니다.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={238}>
      <AreaChart data={data} margin={{ top: 10, right: 18, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="ledgerActual" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#084734" stopOpacity={0.22} />
            <stop offset="95%" stopColor="#084734" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="ledgerTrend" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#A8741A" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#A8741A" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(Number(v))} width={58} />
        <Tooltip
          formatter={(value) => formatMoney(Number(value))}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Area type="monotone" dataKey="goal" name="목표" stroke="#A39E98" strokeWidth={2} fill="transparent" strokeDasharray="4 4" />
        <Area type="monotone" dataKey="trend" name="예상 포함" stroke="#A8741A" strokeWidth={2} fill="url(#ledgerTrend)" />
        <Area type="monotone" dataKey="actual" name="실적" stroke="#084734" strokeWidth={2.4} fill="url(#ledgerActual)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function MemberBarChart({ rows }: { rows: BranchKpiMemberRow[] }) {
  const data = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => b.goal - a.goal)
        .slice(0, 8)
        .map((row) => ({
          name: row.member,
          목표: row.goal,
          실적: row.status,
        })),
    [rows],
  )

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 31)}>
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 18, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="name" type="category" width={72} tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value) => formatMoney(Number(value))}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="목표" fill="#D9D6D0" radius={[0, 4, 4, 0]} barSize={8} />
        <Bar dataKey="실적" fill="#084734" radius={[0, 4, 4, 0]} barSize={8} />
      </BarChart>
    </ResponsiveContainer>
  )
}

const WEEK_SERIES: Array<{
  key: "confirmed" | "highConfidence" | "open" | "inferred" | "monthlyOnly"
  label: string
  color: string
}> = [
  { key: "confirmed", label: "확정", color: "#084734" },
  { key: "highConfidence", label: "고확도", color: "#1E5DA8" },
  { key: "open", label: "예정", color: "#A8741A" },
  { key: "inferred", label: "일자 추정", color: "#6B7280" },
  { key: "monthlyOnly", label: "월합계만", color: "#D9D6D0" },
]

// SVG 텍스트는 DOM 측정 없이 폭을 알 수 없어 근사치를 쓴다 — 한글/CJK 글리프는 라틴 문자보다 넓으므로 가중치를 분리.
function estimateTextWidth(text: string, fontSize: number) {
  let width = 0
  for (const ch of text) {
    const isWide = /[ㄱ-힝一-鿿]/.test(ch)
    width += isWide ? fontSize * 1.05 : fontSize * 0.62
  }
  return width
}

// 스택 순서(아래→위) 단일 소스 — WEEK_SERIES와 동일 순서라 Bar JSX 나열 순서와도 일치해야 한다.
const STACK_KEYS_BOTTOM_TO_TOP: Array<"confirmed" | "highConfidence" | "open" | "inferred" | "monthlyOnly"> = [
  "confirmed",
  "highConfidence",
  "open",
  "inferred",
  "monthlyOnly",
]

function roundedRectPath(x: number, y: number, width: number, height: number, corner: { tl: number; tr: number; bl: number; br: number }) {
  const w = Math.max(width, 0.01)
  const h = Math.max(height, 0.01)
  const cap = Math.min(w / 2, h / 2)
  const tl = Math.max(0, Math.min(corner.tl, cap))
  const tr = Math.max(0, Math.min(corner.tr, cap))
  const bl = Math.max(0, Math.min(corner.bl, cap))
  const br = Math.max(0, Math.min(corner.br, cap))
  return [
    `M${x + tl},${y}`,
    `H${x + w - tr}`,
    tr ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : "",
    `V${y + h - br}`,
    br ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : "",
    `H${x + bl}`,
    bl ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : "",
    `V${y + tl}`,
    tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : "",
    "Z",
  ]
    .filter(Boolean)
    .join(" ")
}

// 주차별로 실제 값이 있는 세그먼트만 놓고 맨 아래/맨 위를 판정해 그때그때 둥근 모서리를 준다.
// (예: 확정 없이 고확도만 있는 주는 고확도 세그먼트가 아래쪽 둥근 모서리를 대신 받는다 — 항상 알약 모양 유지.)
// 세그먼트 사이 흰 스트로크는 확정(그린)·고확도(블루)처럼 인접한 색이 맞닿아 흐려 보이는 것을 막는 가독성 장치.
function makeStackSegmentShape(seriesKey: (typeof STACK_KEYS_BOTTOM_TO_TOP)[number]) {
  const RADIUS = 6
  return function StackSegmentShape(props: { x?: unknown; y?: unknown; width?: unknown; height?: unknown; payload?: RevWeekPoint; fill?: string }) {
    const x = Number(props.x ?? 0)
    const y = Number(props.y ?? 0)
    const width = Number(props.width ?? 0)
    const height = Number(props.height ?? 0)
    if (!Number.isFinite(height) || height <= 0.5 || !Number.isFinite(width) || width <= 0) return <g />
    const presentKeys = STACK_KEYS_BOTTOM_TO_TOP.filter((key) => Number(props.payload?.[key] ?? 0) > 0)
    const isBottom = presentKeys[0] === seriesKey
    const isTop = presentKeys[presentKeys.length - 1] === seriesKey
    const d = roundedRectPath(x, y, width, height, {
      tl: isTop ? RADIUS : 0,
      tr: isTop ? RADIUS : 0,
      bl: isBottom ? RADIUS : 0,
      br: isBottom ? RADIUS : 0,
    })
    return <path d={d} fill={props.fill} stroke="#FFFFFF" strokeWidth={1.5} strokeLinejoin="round" />
  }
}

function RevWeekChartTooltip({
  active,
  payload,
  label,
  weeklyTarget,
}: {
  active?: boolean
  payload?: Array<{ payload?: RevWeekPoint }>
  label?: string | number
  weeklyTarget?: number | null
}) {
  const point = payload?.[0]?.payload
  if (!active || !point || point.total <= 0) return null
  const paceDelta = weeklyTarget != null && weeklyTarget > 0 ? point.total - weeklyTarget : null
  return (
    <div className="min-w-[204px] rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5 text-[11px] shadow-[0_16px_40px_rgba(17,17,16,0.16)]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-[#111110]">{label} 합계</span>
        <span className="font-bold tabular-nums text-[#111110]">{formatMoney(point.total)}</span>
      </div>
      <div className="mt-2 space-y-1">
        {WEEK_SERIES.map((series) => {
          const value = point[series.key]
          if (value <= 0) return null
          return (
            <div key={series.key} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#615D59]">
                <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: series.color }} />
                {series.label}
              </span>
              <span className="font-bold tabular-nums text-[#111110]">
                {formatMoney(value)}
                <span className="ml-1 font-semibold text-[#A39E98]">{formatPercent((value / point.total) * 100)}</span>
              </span>
            </div>
          )
        })}
      </div>
      {paceDelta != null && (
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#F0F0EC] pt-1.5">
          <span className="font-semibold text-[#615D59]">주 평균 목표 대비</span>
          <span className={`font-bold tabular-nums ${paceDelta >= 0 ? "text-[#084734]" : "text-[#B43E3E]"}`}>
            {paceDelta >= 0 ? "+" : "-"}
            {formatMoney(Math.abs(paceDelta))}
          </span>
        </div>
      )}
      <p className="mt-2 border-t border-[#F0F0EC] pt-1.5 text-[10px] font-semibold text-[#A39E98]">입력 행 {point.rows}건</p>
    </div>
  )
}

// 총액 라벨: 피크 주차는 그린 필 뱃지(헤더 '피크' 칩과 시각 연결), 나머지는 담백한 다크 텍스트.
function makeWeekTotalLabel(peakValue: number) {
  return function WeekTotalLabel(props: { x?: unknown; y?: unknown; value?: unknown }) {
    const value = Number(props.value ?? 0)
    const x = Number(props.x ?? 0)
    const y = Number(props.y ?? 0)
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return <g />
    const text = formatMoney(value)
    const isPeak = peakValue > 0 && value >= peakValue
    if (isPeak) {
      const pillW = estimateTextWidth(text, 10.5) + 16
      const pillH = 16
      const pillY = y - 23
      return (
        <g>
          <rect x={x - pillW / 2} y={pillY} width={pillW} height={pillH} rx={8} fill="#ECFDF5" stroke="#BDEFD8" />
          <text
            x={x}
            y={pillY + pillH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10.5}
            fontWeight={700}
            fill="#084734"
          >
            {text}
          </text>
        </g>
      )
    }
    return (
      <text x={x} y={y - 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#111110">
        {text}
      </text>
    )
  }
}

// 주 평균 목표선 라벨: 플롯 우측 끝에 고정된 다크 칩 — 어떤 세그먼트색 위에 걸쳐도 대비가 유지된다.
function makeWeeklyTargetLabel(value: number) {
  return function WeeklyTargetLabel(props: { viewBox?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } }) {
    const viewBox = props.viewBox ?? {}
    const x = Number(viewBox.x ?? NaN)
    const y = Number(viewBox.y ?? NaN)
    const width = Number(viewBox.width ?? NaN)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width)) return <g />
    const text = `주 평균 ${formatMoney(value)}`
    const pillW = estimateTextWidth(text, 9.5) + 14
    const pillH = 18
    const pillRight = x + width
    const pillX = pillRight - pillW
    return (
      <g>
        <rect x={pillX} y={y - pillH / 2} width={pillW} height={pillH} rx={9} fill="#31302E" />
        <text
          x={pillX + pillW / 2}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={9.5}
          fontWeight={700}
          fill="#FFFFFF"
        >
          {text}
        </text>
      </g>
    )
  }
}

export function RevWeekForecastChart({ data, monthGoal }: { data: RevWeekPoint[]; monthGoal?: number | null }) {
  const hasData = data.some((item) => item.total > 0)
  if (!hasData) {
    return (
      <div className="flex min-h-[238px] items-center justify-center rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] leading-relaxed text-[#615D59]">
        선택 월에 표시할 주차별 REV 금액이 없습니다.
      </div>
    )
  }

  const seriesTotals = WEEK_SERIES.map((series) => ({
    ...series,
    total: data.reduce((sum, item) => sum + item[series.key], 0),
  }))
  const monthTotal = data.reduce((sum, item) => sum + item.total, 0)
  const confirmedTotal = seriesTotals.find((series) => series.key === "confirmed")?.total ?? 0
  const coveredTotal = confirmedTotal + (seriesTotals.find((series) => series.key === "highConfidence")?.total ?? 0)
  const peakValue = data.reduce((max, item) => Math.max(max, item.total), 0)
  // 주 평균 목표 = 월 목표 ÷ 표시 주차 수. 각 막대가 페이스를 넘겼는지 가늠하는 기준선.
  const weeklyTarget = monthGoal != null && monthGoal > 0 && data.length > 0 ? monthGoal / data.length : null
  const confirmedRemaining = monthGoal != null && monthGoal > 0 ? monthGoal - confirmedTotal : null

  return (
    <div>
      <ResponsiveContainer width="100%" height={264}>
        <ComposedChart data={data} margin={{ top: 30, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#ECEBE7" strokeDasharray="2 6" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} dy={2} />
          <YAxis tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(Number(v))} width={58} />
          <Tooltip content={<RevWeekChartTooltip weeklyTarget={weeklyTarget} />} cursor={{ fill: "rgba(8,71,52,0.045)" }} />
          {weeklyTarget != null && (
            <ReferenceLine
              y={weeklyTarget}
              stroke="#FFFFFF"
              strokeWidth={4.5}
              strokeOpacity={0.7}
              ifOverflow="extendDomain"
            />
          )}
          {weeklyTarget != null && (
            <ReferenceLine
              y={weeklyTarget}
              stroke="#31302E"
              strokeWidth={1.75}
              strokeOpacity={0.85}
              strokeDasharray="5 4"
              strokeLinecap="round"
              ifOverflow="extendDomain"
              label={makeWeeklyTargetLabel(weeklyTarget)}
            />
          )}
          <Bar dataKey="confirmed" name="확정" stackId="week" fill="#084734" shape={makeStackSegmentShape("confirmed")} maxBarSize={48} />
          <Bar dataKey="highConfidence" name="고확도" stackId="week" fill="#1E5DA8" shape={makeStackSegmentShape("highConfidence")} maxBarSize={48} />
          <Bar dataKey="open" name="예정" stackId="week" fill="#A8741A" shape={makeStackSegmentShape("open")} maxBarSize={48} />
          <Bar dataKey="inferred" name="일자 추정" stackId="week" fill="#6B7280" shape={makeStackSegmentShape("inferred")} maxBarSize={48} />
          <Bar dataKey="monthlyOnly" name="월합계만" stackId="week" fill="#D9D6D0" shape={makeStackSegmentShape("monthlyOnly")} maxBarSize={48} />
          <Line
            type="monotone"
            dataKey="total"
            stroke="transparent"
            strokeWidth={0}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            label={makeWeekTotalLabel(peakValue)}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
        {seriesTotals
          .filter((series) => series.total > 0)
          .map((series) => {
            const share = monthTotal > 0 ? (series.total / monthTotal) * 100 : 0
            return (
              <span key={series.key} className="inline-flex items-center gap-1.5">
                <span
                  className="h-3 w-3 rounded-[4px] ring-1 ring-inset ring-black/5"
                  style={{ backgroundColor: series.color }}
                />
                <span className="font-semibold text-[#615D59]">{series.label}</span>
                <span className="font-bold tabular-nums text-[#111110]">{formatMoney(series.total)}</span>
                <span className="font-semibold tabular-nums text-[#A39E98]">{formatPercent(share)}</span>
              </span>
            )
          })}
        {weeklyTarget != null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-3.5 border-t-2 border-dashed border-[#31302E]/70" />
            <span className="font-semibold text-[#615D59]">주 평균 목표</span>
            <span className="font-bold tabular-nums text-[#111110]">{formatMoney(weeklyTarget)}</span>
          </span>
        )}
      </div>
      {monthGoal != null && monthGoal > 0 && (
        <div className="mt-3.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-gradient-to-b from-white to-[#FAFAF8] p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[#111110]">월 목표 대비 진행</span>
            <span className="text-[10.5px] font-semibold tabular-nums text-[#615D59]">
              목표 <span className="font-bold text-[#111110]">{formatMoney(monthGoal)}</span>
            </span>
          </div>
          <div className="space-y-2.5">
            <CompactProgress
              label="확정 / 월 목표"
              value={confirmedTotal}
              max={monthGoal}
              color="#084734"
              meta={`${formatMoney(confirmedTotal)} · ${formatPercent((confirmedTotal / monthGoal) * 100)}`}
            />
            <CompactProgress
              label="확정+고확도 / 월 목표"
              value={coveredTotal}
              max={monthGoal}
              color="#1E5DA8"
              meta={`${formatMoney(coveredTotal)} · ${formatPercent((coveredTotal / monthGoal) * 100)}`}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.06)] pt-2 text-[10.5px] font-semibold text-[#A39E98]">
            <span>
              월 합계 <span className="font-bold text-[#615D59]">{formatMoney(monthTotal)}</span>
            </span>
            {confirmedRemaining != null &&
              (confirmedRemaining > 0 ? (
                <span>
                  확정까지 <span className="font-bold text-[#B43E3E]">{formatMoney(confirmedRemaining)}</span>
                </span>
              ) : (
                <span className="text-[#084734]">
                  확정 목표 달성 <span className="font-bold">+{formatMoney(Math.abs(confirmedRemaining))}</span>
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CompactProgress({
  label,
  value,
  max,
  color = "#084734",
  meta,
}: {
  label: string
  value: number
  max: number
  color?: string
  meta?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-bold text-[#111110]">{label}</span>
        <span className="font-semibold tabular-nums text-[#615D59]">{meta ?? formatMoney(value)}</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-[#EDEBE7] shadow-[inset_0_1px_2px_rgba(17,17,16,0.06)]">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export function KpiTeamChart({ rows }: { rows: Array<{ team: string; goal: number; status: number; pacing_pct: number }> }) {
  const data = rows.map((row) => ({
    team: row.team,
    목표: row.goal,
    실적: row.status,
    달성률: row.pacing_pct,
  }))
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="team" type="category" width={48} tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value, name) => name === "달성률" ? formatPercent(Number(value)) : formatMoney(Number(value))}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="목표" fill="#D9D6D0" radius={[0, 4, 4, 0]} barSize={9} />
        <Bar dataKey="실적" fill="#084734" radius={[0, 4, 4, 0]} barSize={9} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function KpiActivityChart({ rows }: { rows: KpiMetricView[] }) {
  const data = rows.map((row) => ({
    metric: row.metric,
    목표: row.goal,
    실적: row.actual,
    달성률: row.pct,
  }))
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={Math.max(190, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="metric" type="category" width={58} tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value, name) => name === "달성률" ? formatPercent(Number(value)) : Number(value).toLocaleString("ko-KR")}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="목표" fill="#D9D6D0" radius={[0, 4, 4, 0]} barSize={8} />
        <Bar dataKey="실적" fill="#1E5DA8" radius={[0, 4, 4, 0]} barSize={8} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function KpiGapChart({ rows }: { rows: KpiMemberView[] }) {
  const data = rows
    .map((item) => ({
      member: item.row.member,
      gap: item.row.status - item.row.goal,
      status: item.row.status,
      goal: item.row.goal,
    }))
    .sort((a, b) => a.gap - b.gap || compareText(a.member, b.member))
    .slice(0, 8)

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(190, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(Number(v))} />
        <YAxis dataKey="member" type="category" width={72} tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke="#A39E98" />
        <Tooltip
          formatter={(value, name) => name === "gap" ? formatMoney(Number(value)) : formatMoney(Number(value))}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="gap" name="Gap" radius={[0, 4, 4, 0]} barSize={10}>
          {data.map((item) => (
            <Cell key={item.member} fill={item.gap >= 0 ? "#084734" : "#B43E3E"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function KpiRevenueActivityScatter({ rows }: { rows: KpiMemberView[] }) {
  const data = rows.map((item) => ({
    member: item.row.member,
    activityPct: item.activityPct,
    revenuePct: item.row.achievement_pct,
    revenue: item.row.status,
    deals: item.row.deals_total,
  }))

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={252}>
      <ScatterChart margin={{ top: 10, right: 18, bottom: 10, left: -6 }}>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" />
        <XAxis
          dataKey="activityPct"
          name="활동 달성률"
          unit="%"
          type="number"
          tick={{ fontSize: 11, fill: "#615D59" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="revenuePct"
          name="매출 달성률"
          unit="%"
          type="number"
          tick={{ fontSize: 11, fill: "#615D59" }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine x={75} stroke="#ECD29C" strokeDasharray="4 4" />
        <ReferenceLine y={75} stroke="#ECD29C" strokeDasharray="4 4" />
        <Tooltip
          formatter={(value, name) => {
            if (name === "activityPct") return [formatPercent(Number(value)), "활동 달성률"]
            if (name === "revenuePct") return [formatPercent(Number(value)), "매출 달성률"]
            if (name === "revenue") return [formatMoney(Number(value)), "매출"]
            return [Number(value).toLocaleString("ko-KR"), String(name)]
          }}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.member ?? "담당자"}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Scatter name="담당자" data={data} fill="#084734" />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
