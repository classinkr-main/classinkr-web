// 세그먼트 8주 추이 스파크라인(인라인 SVG, 라이브러리 없음).
//  - 주 끝(KST)마다 그 주 마지막 일별 기록 한 점. 기록이 없는 주는 비운다(선이 그 주를 건너면 점선).
//  - 지금 조건과 다른 조건(spec_hash)으로 잰 점·선은 흐리게 — 조건을 바꾸면 추이가 끊긴다는 사실을 숨기지 않는다.
//  - 품질 플래그(Compass 끊김·원천 미완성·NEO 오래됨·절단)가 있던 점에 닿는 선은 점선.
//  - 끝점(가장 최근 기록)만 Classin Green 으로 강조한다. 숫자는 aria-label·점마다 <title>(호버)로 준다.
//  - 기록이 아직 없으면 그림 대신 "기록 N일째 쌓는 중"(추이는 저장한 날부터만 쌓인다 — 소급 불가).
// 순수 기하 계산(buildTrendSparkGeometry)을 분리해 테스트가 DOM 없이 고정한다.

import type { SegmentTrendPoint } from "@/lib/crm/saved-segment-api"

import { formatDelta, trendDelta } from "./segment-hub-api"

export const SPARK_LINE_COLOR = "#A39E98"
export const SPARK_END_COLOR = "#084734"
export const SPARK_FADED_OPACITY = 0.35

export interface TrendSparkPoint {
  index: number
  x: number
  y: number
  total: number
  weekEnd: string
  specChanged: boolean
  degraded: boolean
  isEnd: boolean
}

export interface TrendSparkSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  /** 품질 플래그 날에 닿거나 기록 없는 주를 건너는 선 */
  dashed: boolean
  /** 조건 변경 전 점에 닿는 선 */
  faded: boolean
}

export interface TrendSparkGeometry {
  width: number
  height: number
  points: TrendSparkPoint[]
  segments: TrendSparkSegment[]
  first: TrendSparkPoint | null
  end: TrendSparkPoint | null
}

const round = (value: number) => Math.round(value * 10) / 10

export function buildTrendSparkGeometry(
  trend: readonly SegmentTrendPoint[],
  options: { width?: number; height?: number; pad?: number } = {}
): TrendSparkGeometry {
  const width = options.width ?? 88
  const height = options.height ?? 26
  const pad = options.pad ?? 3
  const slots = Math.max(trend.length, 2)
  const present = trend
    .map((point, index) => ({ point, index }))
    .filter((entry): entry is { point: SegmentTrendPoint & { total: number }; index: number } => entry.point.total != null)
  if (present.length === 0) return { width, height, points: [], segments: [], first: null, end: null }

  const values = present.map((entry) => entry.point.total)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const flat = max === min
  const lastIndex = present[present.length - 1].index

  const points: TrendSparkPoint[] = present.map(({ point, index }) => ({
    index,
    x: round(pad + (index * (width - 2 * pad)) / (slots - 1)),
    // 값이 모두 같으면 가운데 한 줄 — 위아래 끝에 붙여 "급변"처럼 보이지 않게.
    y: round(flat ? height / 2 : height - pad - ((point.total - min) / range) * (height - 2 * pad)),
    total: point.total,
    weekEnd: point.weekEnd,
    specChanged: point.specChanged,
    degraded: point.degraded,
    isEnd: index === lastIndex,
  }))

  const segments: TrendSparkSegment[] = []
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]
    const to = points[i]
    segments.push({
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      dashed: from.degraded || to.degraded || to.index - from.index > 1,
      faded: from.specChanged || to.specChanged,
    })
  }
  return { width, height, points, segments, first: points[0], end: points[points.length - 1] }
}

function shortWeek(weekEnd: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(weekEnd) ? weekEnd.slice(5) : weekEnd
}

/** 스크린리더 문구 — "8주 추이 12명에서 30명(조건 변경 전 값 포함 · 품질 경고 주 포함)". */
export function trendSparkLabel(trend: readonly SegmentTrendPoint[], trendDays: number): string {
  const geometry = buildTrendSparkGeometry(trend)
  if (!geometry.first || !geometry.end) return trendEmptyCaption(trendDays)
  const notes: string[] = []
  if (geometry.points.some((point) => point.specChanged)) notes.push("조건 변경 전 값 포함")
  if (geometry.points.some((point) => point.degraded)) notes.push("품질 경고 주 포함")
  const head =
    geometry.first === geometry.end
      ? `8주 추이 기록 1주 ${geometry.end.total.toLocaleString("ko-KR")}명`
      : `8주 추이 ${geometry.first.total.toLocaleString("ko-KR")}명에서 ${geometry.end.total.toLocaleString("ko-KR")}명`
  return notes.length ? `${head}(${notes.join(" · ")})` : head
}

export function trendEmptyCaption(trendDays: number): string {
  return trendDays > 0 ? `기록 ${trendDays.toLocaleString("ko-KR")}일째 쌓는 중` : "내일 06시부터 기록"
}

function pointTitle(point: TrendSparkPoint) {
  const notes: string[] = []
  if (point.specChanged) notes.push("조건 변경 전")
  if (point.degraded) notes.push("품질 경고")
  return `${shortWeek(point.weekEnd)} 주 · ${point.total.toLocaleString("ko-KR")}명${notes.length ? ` (${notes.join(" · ")})` : ""}`
}

export default function SegmentTrendSpark({
  trend,
  trendDays,
  width = 88,
  height = 26,
  showDelta = true,
}: {
  trend: readonly SegmentTrendPoint[]
  trendDays: number
  width?: number
  height?: number
  showDelta?: boolean
}) {
  const geometry = buildTrendSparkGeometry(trend, { width, height })
  if (!geometry.end) {
    return <span className="text-[11px] font-medium text-[#1a1a1a]/40">{trendEmptyCaption(trendDays)}</span>
  }
  const delta = showDelta ? formatDelta(trendDelta(trend)) : null
  // 기록이 2주 미만이면 선 대신 점 하나 — 캡션으로 "쌓는 중"을 함께 알린다.
  const young = geometry.points.length < 2
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        width={geometry.width}
        height={geometry.height}
        role="img"
        aria-label={trendSparkLabel(trend, trendDays)}
        className="block shrink-0 overflow-visible"
      >
        {geometry.segments.map((segment, index) => (
          <line
            key={`s${index}`}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            stroke={SPARK_LINE_COLOR}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray={segment.dashed ? "2.5 2" : undefined}
            opacity={segment.faded ? SPARK_FADED_OPACITY : 1}
          />
        ))}
        {geometry.points.map((point) => (
          <g key={`p${point.index}`}>
            {point.isEnd ? (
              <circle cx={point.x} cy={point.y} r={3} fill={SPARK_END_COLOR} />
            ) : (
              <circle
                cx={point.x}
                cy={point.y}
                r={1.6}
                fill={SPARK_LINE_COLOR}
                opacity={point.specChanged ? SPARK_FADED_OPACITY : 1}
              />
            )}
            {/* 호버 영역은 점보다 크게(보이지 않는 원) — 브라우저 기본 툴팁으로 주·건수를 보여 준다. */}
            <circle cx={point.x} cy={point.y} r={6} fill="transparent">
              <title>{pointTitle(point)}</title>
            </circle>
          </g>
        ))}
      </svg>
      {young ? (
        <span className="text-[11px] font-medium text-[#1a1a1a]/40">{trendEmptyCaption(trendDays)}</span>
      ) : delta ? (
        <span className="text-[11px] font-semibold tabular-nums text-[#615D59]" aria-hidden>
          {delta}
        </span>
      ) : null}
    </span>
  )
}
