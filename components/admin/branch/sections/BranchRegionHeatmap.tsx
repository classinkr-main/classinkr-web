"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, ArrowUpRight, MapPin, MapPinned, Minus, Plus, RotateCcw } from "lucide-react"
import {
  KOREA_PROVINCE_BY_LABEL,
  KOREA_PROVINCE_HEIGHT,
  KOREA_PROVINCE_LABEL_NUDGE as LABEL_NUDGE,
  KOREA_PROVINCE_SHAPES,
  KOREA_PROVINCE_WIDTH,
} from "@/lib/branch/korea-province-map"
import { useBranchJson } from "../client-api"
import { cny } from "@/lib/branch/money-format"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { normalizeRegionLabel } from "@/lib/regions/korea-regions"
import type {
  NaverMapCountSummary,
  NaverMapRegionSummaryRow,
} from "@/lib/crm/naver-map-region-summary"
import {
  isOffMapRegion,
  rankRegions,
  regionGoalCoverage,
  regionSelectionKey,
  type RegionMetric,
} from "@/lib/branch/region-heatmap"
import type { Period, Team } from "../types"

interface TopCustomer {
  customer: string
  manager: string | null
  team: string | null
  status: string | null
  first_payment: string | null
  target: number
  revenue: number
}

interface Row {
  region: string
  target: number
  revenue: number
  // Future-month estimate (not yet confirmed). API returns this separately so
  // the panel can break out 확정 vs 추정 instead of lumping them together.
  projected: number
  expected: number
  progress: number
  status: "good" | "warning" | "critical"
  velocity: number
  deals_count: number
  confirmed_count: number
  open_target: number
  top_customers: TopCustomer[]
}

interface MapRow extends Row {
  label: string
  path: string
  x: number
  y: number
  regions: string[]
}

interface HeatmapMapSource {
  status: "ready" | "unavailable"
  latestSyncedAt: string | null
  isStale: boolean
  summary: NaverMapCountSummary | null
  warnings: string[]
}

// 지역 정규화는 SSOT(lib/regions)를 쓴다 — 이전의 자체 23행 별칭 표는 시군구를 몰라서
// "수원"·"강남" 같은 행이 전부 "기타"로 새어 지도에서 사라졌다.

function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

function formatMapSourceDate(value: string | null) {
  if (!value) return "수집 이력 없음"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "수집 시각 확인 필요"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

// Heat ramp — premium business palette, 4-stop gradient from terracotta to
// deep forest. Every stop is desaturated and mid-dark so it reads as a
// professional dashboard rather than a primary-color alert chart.
const HEAT_STOPS: Array<{ t: number; rgb: [number, number, number] }> = [
  { t: 0,    rgb: [168, 89,  82]  }, // #A85952 muted terracotta — low / critical
  { t: 0.34, rgb: [192, 148, 96]  }, // #C09460 warm tan — needs attention
  { t: 0.67, rgb: [127, 154, 130] }, // #7F9A82 sage — on track
  { t: 1,    rgb: [62,  95,  77]  }, // #3E5F4D deep forest — strong
]
const HEAT_LOW = `rgb(${HEAT_STOPS[0].rgb.join(",")})`
const HEAT_HIGH = `rgb(${HEAT_STOPS[HEAT_STOPS.length - 1].rgb.join(",")})`

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function heatColorRamp(value: number, max: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return HEAT_LOW
  const t = Math.max(0, Math.min(1, value / max))
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1]
    if (t <= b.t) {
      const local = (t - a.t) / (b.t - a.t)
      const r = Math.round(lerp(a.rgb[0], b.rgb[0], local))
      const g = Math.round(lerp(a.rgb[1], b.rgb[1], local))
      const bb = Math.round(lerp(a.rgb[2], b.rgb[2], local))
      return `rgb(${r}, ${g}, ${bb})`
    }
  }
  return HEAT_HIGH
}
// Mild opacity range — the gradient hue already carries the signal, so we
// only nudge opacity to keep weak regions slightly recessed.
function rampOpacity(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0.78
  const t = Math.max(0, Math.min(1, value / max))
  return 0.78 + t * 0.14
}
function statusOf(p: number): Row["status"] {
  if (p >= 95) return "good"
  if (p >= 75) return "warning"
  return "critical"
}
function canonicalRegion(region: string) {
  return normalizeRegionLabel(region)
}

function mergeForMap(rows: Row[]) {
  const mapped = new Map<string, MapRow>()
  const others: Row[] = []
  for (const row of rows) {
    const canonical = canonicalRegion(row.region)
    const shape = canonical ? KOREA_PROVINCE_BY_LABEL.get(canonical) : null
    if (!canonical || !shape) { others.push(row); continue }
    const current = mapped.get(canonical)
    if (!current) {
      mapped.set(canonical, {
        ...row, label: shape.label, path: shape.path, x: shape.x, y: shape.y, regions: [row.region],
      })
      continue
    }
    const target = current.target + row.target
    const revenue = current.revenue + row.revenue
    const projected = current.projected + row.projected
    const expected = revenue + projected
    const progress = target > 0 ? (expected / target) * 100 : 0
    mapped.set(canonical, {
      ...current,
      target, revenue, projected, expected, progress,
      status: statusOf(progress),
      deals_count: current.deals_count + row.deals_count,
      confirmed_count: current.confirmed_count + row.confirmed_count,
      open_target: current.open_target + row.open_target,
      top_customers: [...current.top_customers, ...row.top_customers]
        .sort((a, b) => b.revenue - a.revenue || b.target - a.target).slice(0, 5),
      regions: [...current.regions, row.region],
    })
  }
  return {
    mappedRows: [...mapped.values()].sort((a, b) => b.target - a.target),
    otherRows: others.sort((a, b) => b.target - a.target),
  }
}

// Fill swapped to neutral gray for non-hovered regions when something IS
// hovered — hue separation reads faster than opacity alone.
const DIMMED_FILL = "#D5D2CB"

// Manual offsets for metropolitan-city labels that would otherwise collide
// with their surrounding province (e.g., 서울 sits inside 경기, 대전 inside 충남).
// Values are in SVG units (viewBox 130×121.52).
const ZOOM_MIN = 1
const ZOOM_MAX = 4
const ZOOM_STEP = 1.4

type Metric = RegionMetric

const EMPTY_ROWS: Row[] = []

function HeatMap({ rows, selectedLabel, onSelect, metric }: {
  rows: MapRow[]
  selectedLabel: string | null
  /** null = 선택 해제(지도 빈 곳 클릭). */
  onSelect: (row: MapRow | null) => void
  metric: Metric
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const rowsByLabel = useMemo(() => new Map(rows.map((r) => [r.label, r])), [rows])
  const hoveredRow = hovered ? rowsByLabel.get(hovered) ?? null : null
  // For revenue mode the visual must scale by absolute money. We use
  // `expected` (확정 + 추정) so future-weighted regions still register.
  const maxExpected = useMemo(
    () => Math.max(1, ...rows.map((r) => r.expected || 0)),
    [rows],
  )
  // Hovered region last → its scale + shadow paints above neighbor strokes.
  const orderedShapes = useMemo(() => {
    if (!hovered) return KOREA_PROVINCE_SHAPES
    return [...KOREA_PROVINCE_SHAPES].sort((a, b) =>
      a.label === hovered ? 1 : b.label === hovered ? -1 : 0,
    )
  }, [hovered])

  // Sequential N→S reveal. Sort by centroid Y (smaller y = north in our SVG
  // coord space) and stagger reveal so the eye follows the peninsula down.
  const revealOrder = useMemo(
    () => [...rows].sort((a, b) => a.y - b.y).map((r) => r.label),
    [rows],
  )
  const [revealedCount, setRevealedCount] = useState(0)
  useEffect(() => {
    setRevealedCount(0)
    if (revealOrder.length === 0) return
    const timers: number[] = []
    for (let i = 0; i < revealOrder.length; i++) {
      timers.push(
        window.setTimeout(() => setRevealedCount((c) => Math.max(c, i + 1)), i * 55),
      )
    }
    return () => { timers.forEach((t) => window.clearTimeout(t)) }
  }, [revealOrder])
  const revealedSet = useMemo(
    () => new Set(revealOrder.slice(0, revealedCount)),
    [revealOrder, revealedCount],
  )

  // Zoom + pan state. Pan is in SVG coordinate units, capped so the user
  // can't drag the peninsula off-screen.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const visibleW = KOREA_PROVINCE_WIDTH / zoom
  const visibleH = KOREA_PROVINCE_HEIGHT / zoom
  const maxPanX = (KOREA_PROVINCE_WIDTH - visibleW) / 2
  const maxPanY = (KOREA_PROVINCE_HEIGHT - visibleH) / 2
  const clampedPan = {
    x: Math.max(-maxPanX, Math.min(maxPanX, pan.x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, pan.y)),
  }
  const viewX = (KOREA_PROVINCE_WIDTH - visibleW) / 2 + clampedPan.x
  const viewY = (KOREA_PROVINCE_HEIGHT - visibleH) / 2 + clampedPan.y
  const viewBox = `${viewX.toFixed(2)} ${viewY.toFixed(2)} ${visibleW.toFixed(2)} ${visibleH.toFixed(2)}`

  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  // 드래그(팬) 끝의 click이 선택 해제로 번지지 않게 이동 여부를 기억한다.
  const dragMovedRef = useRef(false)
  // Pixels-to-SVG-units conversion uses the rendered svg width vs the viewBox
  // width — independent of zoom, since viewBox adjusts with zoom.
  function pxToSvg(dx: number, dy: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return { x: 0, y: 0 }
    const ratio = visibleW / rect.width
    return { x: dx * ratio, y: dy * ratio }
  }

  function applyZoom(next: number) {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next))
    if (clamped === 1) setPan({ x: 0, y: 0 })
    setZoom(clamped)
  }

  return (
    <div className="relative w-full overflow-hidden rounded-md"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }}
      onMouseLeave={() => { setHovered(null); dragRef.current = null }}>
      <svg ref={svgRef} viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className={`block h-auto w-full ${zoom > 1 ? (dragRef.current ? "cursor-grabbing" : "cursor-grab") : ""}`}
        role="group" aria-label="대한민국 지역별 매출 달성률 히트맵"
        onMouseDown={(e) => {
          if (zoom <= 1) return
          dragMovedRef.current = false
          dragRef.current = { startX: e.clientX, startY: e.clientY, panX: clampedPan.x, panY: clampedPan.y }
        }}
        onClick={() => {
          if (dragMovedRef.current) { dragMovedRef.current = false; return }
          onSelect(null)
        }}
        onMouseMoveCapture={(e) => {
          const drag = dragRef.current
          if (!drag) return
          if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 4) dragMovedRef.current = true
          const { x: dx, y: dy } = pxToSvg(e.clientX - drag.startX, e.clientY - drag.startY)
          setPan({ x: drag.panX - dx, y: drag.panY - dy })
        }}
        onMouseUp={() => { dragRef.current = null }}>
        {/* Province base — quiet background shapes */}
        <g>
          {KOREA_PROVINCE_SHAPES.map((s) => (
            <path key={`base-${s.label}`} d={s.path}
              fill="#F0EFEC" stroke="#E2DFD8" strokeWidth={0.18} />
          ))}
        </g>

        {/* Heat fills — color/opacity scale by the active metric. The hovered
            region is rendered last so its scale-up + drop-shadow draw above
            neighboring strokes instead of getting clipped by them. */}
        <g>
          {orderedShapes.map((s) => {
            const row = rowsByLabel.get(s.label)
            if (!row) return null
            const sel = selectedLabel === row.label
            const hov = hovered === row.label
            const someoneElseHovered = hovered !== null && !hov
            const isRevealed = revealedSet.has(row.label)
            const metricValue = metric === "revenue" ? row.expected : row.progress
            const metricMax = metric === "revenue" ? maxExpected : 100
            const baseOpacity = Math.min(1, rampOpacity(metricValue, metricMax) * (sel ? 1.08 : 1))
            const visibleOpacity = isRevealed
              ? (someoneElseHovered ? 0.35 : (hov ? 1 : baseOpacity))
              : 0
            const fillColor = someoneElseHovered
              ? DIMMED_FILL
              : heatColorRamp(metricValue, metricMax)
            const aria = metric === "revenue"
              ? `${row.label} 매출 ${cny(row.expected)}원`
              : `${row.label} ${row.progress.toFixed(0)}%`
            return (
              <path key={`fill-${s.label}`} d={row.path}
                fill={fillColor}
                stroke="#ffffff"
                strokeWidth={sel ? 0.225 : 0.15}
                opacity={visibleOpacity}
                className="cursor-pointer focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]"
                style={{
                  outline: "none",
                  transition: "opacity 280ms ease-out, fill 180ms ease-out, stroke-width 180ms ease-out, transform 200ms ease-out, filter 200ms ease-out",
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  transform: hov ? "scale(1.025)" : "scale(1)",
                  filter: hov ? "drop-shadow(0 1.6px 1.6px rgba(0,0,0,0.32))" : "none",
                }}
                role="button" tabIndex={0}
                aria-label={aria}
                onClick={(e) => { e.stopPropagation(); onSelect(row) }}
                onMouseEnter={() => setHovered(row.label)}
                onFocus={() => setHovered(row.label)}
                onBlur={() => setHovered(null)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onSelect(row) } }}
              >
                <title>{aria}</title>
              </path>
            )
          })}
        </g>

        {/* Centroid labels — small, only province name. Metropolitan cities
            embedded inside larger provinces get nudged off their centroid so
            they don't collide with the surrounding province's label. */}
        <g className="pointer-events-none">
          {rows.map((r) => {
            const isRevealed = revealedSet.has(r.label)
            const someoneElseHovered = hovered !== null && hovered !== r.label
            const nudge = LABEL_NUDGE[r.label] ?? { dx: 0, dy: 0 }
            const fontSize = Math.max(1.6, 2.5 / Math.sqrt(zoom))
            // Every stop on the ramp is mid-dark, so white text reads cleanly
            // throughout. A subtle dark stroke (paint-order trick) keeps the
            // text legible against the lighter "needs attention" stops.
            return (
              <text key={`label-${r.label}`} x={r.x + nudge.dx} y={r.y + 1 + nudge.dy}
                textAnchor="middle"
                style={{
                  fontSize, fontWeight: 700,
                  fill: someoneElseHovered ? "#8C8884" : "#fff",
                  opacity: isRevealed ? (someoneElseHovered ? 0.55 : 0.95) : 0,
                  paintOrder: "stroke",
                  stroke: someoneElseHovered ? "transparent" : "rgba(0,0,0,0.32)",
                  strokeWidth: 0.175,
                  transition: "opacity 280ms ease-out, fill 180ms ease-out",
                }}>
                {r.label}
              </text>
            )
          })}
        </g>
      </svg>

      {/* Minimal floating tooltip */}
      {hoveredRow && (
        <div
          className="pointer-events-none absolute z-30 w-[170px] rounded-md border border-[rgba(0,0,0,0.08)] bg-white p-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
          style={{
            left: mousePos.x + 12,
            top: Math.max(4, mousePos.y - 108),
            transform: mousePos.x > 240 ? "translateX(calc(-100% - 24px))" : undefined,
          }}>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-bold text-[#111110]">{hoveredRow.label}</span>
            {metric === "revenue" ? (
              <span className="text-[12px] font-bold tabular-nums" style={{ color: heatColorRamp(hoveredRow.expected, maxExpected) }}>
                ¥{cny(hoveredRow.expected)}
              </span>
            ) : (
              <span className="text-[12px] font-bold tabular-nums" style={{ color: heatColorRamp(hoveredRow.progress, 100) }}>
                {hoveredRow.progress.toFixed(0)}%
              </span>
            )}
          </div>
          <p className="mt-1 text-[10.5px] text-[#615D59]">
            {/* :508 DetailPanel과 동일 캐논 — 확정=그린. */}
            <span className="font-semibold" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>확정 ¥{cny(hoveredRow.revenue)}</span>
            {hoveredRow.projected > 0 && (
              <span className="ml-1 text-[#615D59]">+ 추정 ¥{cny(hoveredRow.projected)}</span>
            )}
          </p>
          <p className="mt-0.5 text-[10px] text-[#615D59]">
            목표 ¥{cny(hoveredRow.target)} · {hoveredRow.progress.toFixed(0)}% · {hoveredRow.confirmed_count}/{hoveredRow.deals_count}건
          </p>
        </div>
      )}

      {/* Zoom controls — top-right floating cluster */}
      <div onClick={(e) => e.stopPropagation()} className="absolute right-2 top-2 z-20 flex flex-col gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white/90 p-0.5 shadow-[0_2px_6px_rgba(0,0,0,0.06)] backdrop-blur">
        <button type="button" aria-label="확대"
          disabled={zoom >= ZOOM_MAX}
          onClick={() => applyZoom(zoom * ZOOM_STEP)}
          className="flex h-11 w-11 items-center justify-center rounded text-[#111110] md:h-7 md:w-7 transition hover:bg-[#F0EFEC] disabled:opacity-30">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="축소"
          disabled={zoom <= ZOOM_MIN}
          onClick={() => applyZoom(zoom / ZOOM_STEP)}
          className="flex h-11 w-11 items-center justify-center rounded text-[#111110] md:h-7 md:w-7 transition hover:bg-[#F0EFEC] disabled:opacity-30">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="원래 크기"
          disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
          className="flex h-11 w-11 items-center justify-center rounded text-[#615D59] md:h-7 md:w-7 transition hover:bg-[#F0EFEC] disabled:opacity-30">
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      {/* 범례 — 램프의 4단계 색을 그대로 구획으로 보여준다(연속 그라디언트 아님). */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] text-[#615D59]">
        <span>{metric === "revenue" ? "매출" : "달성률"} 낮음</span>
        <span className="flex h-2 w-40 overflow-hidden rounded-full" aria-hidden="true">
          {HEAT_STOPS.map((stop) => (
            <i key={stop.t} className="flex-1" style={{ background: `rgb(${stop.rgb.join(",")})` }} />
          ))}
        </span>
        <span>높음</span>
        <span className="ml-3 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DIMMED_FILL }} aria-hidden="true" />
        <span>데이터 없음</span>
        <span className="ml-auto text-[#A39E98]">빈 곳 클릭 = 선택 해제</span>
      </div>
    </div>
  )
}

type DetailRow = Row & { label: string; regions: string[] }

function CompactRow({ row, rank, selected, onSelect, metric, maxExpected }: {
  row: Row; rank: number; selected: boolean; onSelect: () => void
  metric: Metric; maxExpected: number
}) {
  const metricValue = metric === "revenue" ? row.expected : row.progress
  const metricMax = metric === "revenue" ? maxExpected : 100
  const barPct = metric === "revenue"
    ? (maxExpected > 0 ? Math.min(100, (row.expected / maxExpected) * 100) : 0)
    : Math.min(100, row.progress)
  const empty = metricValue <= 0
  const barColor = empty ? DIMMED_FILL : heatColorRamp(metricValue, metricMax)
  const barOpacity = rampOpacity(metricValue, metricMax)
  const offMap = isOffMapRegion(row.region)
  const selectable = regionSelectionKey(row.region) !== null
  // 값 텍스트는 항상 캐논 잉크(#111110) — 색 신호는 진행 바와 도트로만 전달한다(저대비 방지).
  return (
    <button type="button" onClick={onSelect} disabled={!selectable}
      aria-pressed={selected}
      className={`grid min-h-11 w-full grid-cols-[22px_minmax(0,auto)_minmax(0,1fr)_72px] items-center gap-2 rounded px-2 text-left text-[12.5px] tabular-nums transition md:min-h-7 ${
        selected ? "bg-[#F0EFEC]" : "hover:bg-[#F6F5F4]"
      }`}>
      <span className="text-[11px] text-[#A39E98]">{String(rank).padStart(2, "0")}</span>
      <span className={`flex min-w-[52px] items-baseline gap-1.5 truncate text-[#111110] ${selected ? "font-bold" : ""}`}>
        {row.region}
        {offMap && <span className="shrink-0 text-[10.5px] font-medium text-[#615D59]">지도 밖</span>}
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#F0F0EC]">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${barPct}%`, background: barColor, opacity: empty ? 1 : barOpacity }} />
      </div>
      <span className={`text-right font-semibold ${empty ? "text-[#615D59]" : "text-[#111110]"}`}>
        {metric === "revenue" ? `¥${cny(row.expected)}` : `${row.progress.toFixed(0)}%`}
      </span>
    </button>
  )
}

function DetailPanel({ row, metric, selected, onClear }: {
  row: DetailRow | null; metric: Metric; selected: boolean; onClear: () => void
}) {
  if (!row) {
    return (
      <div className="px-1 py-2 text-[12px] text-[#615D59]">
        지도나 순위에서 지역을 고르면 상세가 표시됩니다.
      </div>
    )
  }
  const hasGoal = row.target > 0
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-[#615D59]">{selected ? "선택 지역" : "상위 지역(선택 전)"}</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[20px] font-bold tracking-[-0.01em] text-[#111110]">{row.label}</p>
            {isOffMapRegion(row.label) && (
              <span className="rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[10.5px] font-medium text-[#615D59]">지도 밖</span>
            )}
            {selected && (
              <button type="button" onClick={onClear}
                className="inline-flex min-h-11 items-center rounded-md px-2 text-[11.5px] font-semibold text-[#084734] hover:underline md:min-h-7">
                선택 해제
              </button>
            )}
          </div>
          {row.regions.length > 1 && (
            <p className="mt-0.5 text-[11px] text-[#615D59]">{row.regions.join(", ")}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11.5px] font-medium text-[#615D59]">{metric === "revenue" ? "합계(확정+추정)" : "달성률"}</p>
          <p className="text-[20px] font-bold tabular-nums text-[#111110]">
            {metric === "revenue" ? `¥${cny(row.expected)}` : `${row.progress.toFixed(0)}%`}
          </p>
          {metric === "progress" && <p className="text-[11px] tabular-nums text-[#615D59]">¥{cny(row.expected)}</p>}
          {metric === "revenue" && hasGoal && <p className="text-[11px] tabular-nums text-[#615D59]">달성률 {row.progress.toFixed(0)}%</p>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-5">
        <div>
          <p className="text-[11.5px] font-medium text-[#615D59]">확정(당월·이전)</p>
          {/* 확정 매출 = 캐논 그린 — 빨강 아님(시트 "빨간 글자=확정"은 입력 관례일 뿐). */}
          <p className="mt-0.5 text-[14px] font-bold tabular-nums" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>¥{cny(row.revenue)}</p>
        </div>
        <div>
          <p className="text-[11.5px] font-medium text-[#615D59]">추정(미래)</p>
          <p className="mt-0.5 text-[14px] font-bold tabular-nums text-[#111110]">¥{cny(row.projected)}</p>
        </div>
        <div>
          <p className="text-[11.5px] font-medium text-[#615D59]">딜</p>
          <p className="mt-0.5 text-[14px] font-bold tabular-nums text-[#111110]">{row.confirmed_count} / {row.deals_count}건</p>
        </div>
        <div>
          <p className="text-[11.5px] font-medium text-[#615D59]">목표(계약가 합)</p>
          {hasGoal
            ? <p className="mt-0.5 text-[14px] font-bold tabular-nums text-[#111110]">¥{cny(row.target)}</p>
            : <p className="mt-0.5 text-[12px] text-[#615D59]">없음</p>}
        </div>
        <div>
          <p className="text-[11.5px] font-medium text-[#615D59]">미시작 잔량</p>
          {/* open_target은 확도 신호가 아니라 "첫 납부가 아직 없는 딜의 목표 합" — Warning 축(#A8741A). */}
          <p className="mt-0.5 text-[14px] font-bold tabular-nums" style={{ color: "#A8741A" }}>¥{cny(row.open_target)}</p>
        </div>
      </div>
    </div>
  )
}

// 원천 전체 상태는 카드 맨 아래 한 줄로 내렸다(지도·순위보다 먼저 눈에 띄지 않게).
function MapSourceStrip({ source, href, loading }: { source: HeatmapMapSource | null; href: string; loading: boolean }) {
  if (loading && !source) {
    return (
      <div className="flex min-h-11 items-center gap-2 border-t border-[#E8E8E4] px-5 py-2.5 text-[11.5px] font-medium text-[#615D59]">
        <MapPinned className="h-4 w-4 shrink-0 text-[#084734]" aria-hidden="true" />
        CRM 지도 기회를 병렬로 불러오는 중입니다.
      </div>
    )
  }
  if (!source) return null
  const summary = source.summary
  const unavailable = source.status === "unavailable" || !summary
  const warn = unavailable || source.isStale

  return (
    <div className="flex flex-col gap-1 border-t border-[#E8E8E4] px-5 py-2.5 text-[11.5px] text-[#615D59] sm:flex-row sm:items-center sm:gap-3">
      <span className="flex min-w-0 items-start gap-2">
        {warn
          ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A8741A]" aria-hidden="true" />
          : <MapPinned className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#084734]" aria-hidden="true" />}
        <span className="min-w-0">
          {unavailable
            ? `CRM 지도 원천 연결 확인 필요${source.warnings[0] ? ` · ${source.warnings[0]}` : ""}`
            : `CRM 지도 원천 · 전사 공용 기회 ${fmt(summary.active)}곳 · ${summary.regions.length}개 지역 · ${formatMapSourceDate(source.latestSyncedAt)} 갱신${source.isStale ? " · 7일 이상 갱신되지 않음" : ""}`}
        </span>
      </span>
      <a href={href}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold text-[#084734] hover:underline sm:ml-auto md:min-h-7">
        지도 원천 검수
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  )
}

// 선택 지역의 CRM 지도 기회 — 상세 아래 한 줄.
function RegionMapSourcePanel({
  region,
  source,
  href,
}: {
  region: string | null
  source: HeatmapMapSource | null
  href: string
}) {
  if (!region || !source || source.status === "unavailable" || !source.summary) return null
  const row: NaverMapRegionSummaryRow | null =
    source.summary.regions.find((candidate) => candidate.label === region) ?? null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E8E8E4] pt-3 text-[12px]">
      <span className="text-[11.5px] font-medium text-[#615D59]">CRM 지도 기회</span>
      <span className="tabular-nums text-[#111110]">
        <b>{fmt(row?.count ?? 0)}곳</b> · 연결 {fmt(row?.linked ?? 0)} · 유력 {fmt(row?.prelinked ?? 0)} · 검토 {fmt(row?.review ?? 0)} · 미매칭 {fmt(row?.unmatched ?? 0)}
      </span>
      <span className="text-[11px] text-[#A39E98]">팀 필터와 무관</span>
      <a href={href} className="inline-flex min-h-11 items-center gap-1 font-semibold text-[#084734] hover:underline sm:ml-auto md:min-h-7">
        {region} 검수
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  )
}

export default function BranchRegionHeatmap({ team, period, selectedMonth, refreshKey, manager, selectedKey, onSelectedKeyChange }: {
  manager?: string
  team: Team
  period: Period
  selectedMonth: string
  refreshKey: number
  /** 선택 지역 키(표준 라벨, 지도 밖은 원문). 상위 표 거르기와 공유하려고 부모가 소유한다. */
  selectedKey: string | null
  onSelectedKeyChange: (key: string | null) => void
}) {
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  // 로컬 재시도 넛지 — 상위 refreshKey(전역 새로고침, 강제 스크롤 동반)에 기대지 않고
  // 이 섹션만 useBranchJson의 기존 캐시키 재계산 경로(refreshKey:url)를 재사용해 다시 요청한다.
  const [localRetry, setLocalRetry] = useState(0)
  const requestKey = refreshKey + localRetry
  const heatmap = useBranchJson<{ rows?: Row[] }>(`/api/admin/branch/heatmap?team=${team}&period=${period}${monthQuery}${manager ? `&manager=${encodeURIComponent(manager)}` : ""}`, requestKey)
  // REV와 독립 요청으로 시작한다. 지도 199곳 전체 매칭이 느려도 히트맵 본체는 먼저 렌더된다.
  const mapSourceRequest = useBranchJson<HeatmapMapSource>(
    "/api/admin/branch/heatmap/map-source",
    requestKey
  )
  const rows = heatmap.loading ? null : (heatmap.data?.rows ?? EMPTY_ROWS)
  const mapSource = mapSourceRequest.data ?? (mapSourceRequest.error ? {
    status: "unavailable" as const,
    latestSyncedAt: null,
    isStale: true,
    summary: null,
    warnings: [mapSourceRequest.error],
  } : null)
  const error = heatmap.error
  // Default to revenue — magnitude tells the operator where the money is,
  // which is more actionable than achievement %.
  const [metric, setMetric] = useState<Metric>("revenue")

  const { mappedRows, otherRows } = useMemo(() => mergeForMap(rows ?? []), [rows])
  // 지역 목표가 거의 없으면 달성률 보기는 전부 0%만 그린다 — 끄고 이유를 보여준다.
  const coverage = useMemo(() => regionGoalCoverage(mappedRows), [mappedRows])
  const effectiveMetric: Metric = coverage.progressViewUsable ? metric : "revenue"
  const sortedRanking = useMemo(() => rankRegions(rows ?? [], effectiveMetric), [rows, effectiveMetric])
  const maxExpected = useMemo(
    () => Math.max(1, ...(rows ?? []).map((r) => r.expected || 0)),
    [rows],
  )
  const selectedMap = selectedKey ? mappedRows.find((r) => r.label === selectedKey) ?? null : null
  const selectedOther = selectedKey && !selectedMap
    ? otherRows.find((r) => regionSelectionKey(r.region) === selectedKey) ?? null
    : null
  const selectedDetail: DetailRow | null = selectedMap
    ?? (selectedOther ? { ...selectedOther, label: selectedOther.region, regions: [selectedOther.region] } : null)
  const detailRow: DetailRow | null = selectedDetail ?? mappedRows[0] ?? null
  const crmRegion = detailRow && !isOffMapRegion(detailRow.label) ? detailRow.label : null

  const selectKey = useCallback((key: string | null) => {
    onSelectedKeyChange(key)
    const url = new URL(window.location.href)
    if (key) {
      const label = key
      url.searchParams.set("region", label)
    } else {
      url.searchParams.delete("region")
    }
    window.history.replaceState(null, "", url.toString())
  }, [onSelectedKeyChange])
  const mapSourceHref = crmRegion
    ? `/admin/crm/customers/map?region=${encodeURIComponent(crmRegion)}`
    : "/admin/crm/customers/map"

  // 품질 웨이브 4 — 항목 7. Tailwind 기본 rose-* 팔레트 유출을 캐논 Danger(#B43E3E 계열)로
  // 치환 — PipelineTable/BranchPipelineKanban의 동일 에러 배너 패턴과 통일.
  if (error) return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] p-4 text-[12px] font-semibold text-[#8F2C2C]"
    >
      <span>{error}</span>
      <button
        type="button"
        onClick={() => setLocalRetry((v) => v + 1)}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-[#B43E3E] bg-white px-2.5 text-[11px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9] md:h-8 md:min-h-0"
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        다시 시도
      </button>
    </div>
  )
  if (!rows) return <div className="h-96 animate-pulse rounded-xl bg-[#f0f0ec]" />
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-6 text-[12px] text-[#615D59]">
        표시할 지역 데이터가 없습니다.
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#E8E8E4] px-5 py-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#084734]" aria-hidden="true" />
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">KR 지역 히트맵</h2>
        </div>
        <span className="text-[11.5px] text-[#615D59]">
          합계 = 확정 + 추정 · 지역 {sortedRanking.length}개(지도 {mappedRows.length} + 지도 밖 {otherRows.length})
        </span>
        <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">
          {!coverage.progressViewUsable && (
            <span className="text-[11.5px] text-[#615D59]">
              달성률 보기는 지역 목표가 있는 곳이 {coverage.withGoal}/{coverage.total}이라 꺼 둠
            </span>
          )}
          <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] p-[2px]" role="group" aria-label="히트맵 지표 선택">
            {(["revenue", "progress"] as const).map((m) => {
              const disabled = m === "progress" && !coverage.progressViewUsable
              return (
                <button key={m} type="button" onClick={() => setMetric(m)}
                  aria-pressed={effectiveMetric === m}
                  disabled={disabled}
                  className={`min-h-11 rounded px-3 text-[12px] font-semibold transition md:min-h-7 ${
                    effectiveMetric === m ? "bg-[#F6F5F4] font-bold text-[#111110]" : "text-[#615D59]"
                  } ${disabled ? "cursor-not-allowed text-[#A39E98]" : ""}`}>
                  {m === "revenue" ? "매출" : "달성률"}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid w-full lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
        <div className="min-w-0 p-5 lg:border-r lg:border-[#E8E8E4]">
          <HeatMap rows={mappedRows} selectedLabel={selectedMap?.label ?? null}
            onSelect={(r) => selectKey(r ? r.label : null)} metric={effectiveMetric} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 border-t border-[#E8E8E4] p-5 lg:border-t-0">
          <DetailPanel row={detailRow} metric={effectiveMetric} selected={selectedDetail !== null}
            onClear={() => selectKey(null)} />
          <RegionMapSourcePanel region={crmRegion} source={mapSource} href={mapSourceHref} />

          <div className="border-t border-[#E8E8E4] pt-3">
            <div className="mb-1 flex items-baseline justify-between px-2">
              <p className="text-[11.5px] font-semibold text-[#615D59]">지역 순위 · {sortedRanking.length}개</p>
              <p className="text-[11.5px] text-[#615D59]">{effectiveMetric === "revenue" ? "합계 순" : "달성률 순"}</p>
            </div>
            <div>
              {sortedRanking.map((r, i) => (
                <CompactRow key={r.region} row={r} rank={i + 1}
                  selected={selectedKey !== null && regionSelectionKey(r.region) === selectedKey}
                  metric={effectiveMetric} maxExpected={maxExpected}
                  onSelect={() => selectKey(regionSelectionKey(r.region))} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <MapSourceStrip source={mapSource} href={mapSourceHref} loading={mapSourceRequest.loading} />
    </section>
  )
}
