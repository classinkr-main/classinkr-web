"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { MapPin, Minus, Plus, RotateCcw } from "lucide-react"
import {
  KOREA_PROVINCE_BY_LABEL,
  KOREA_PROVINCE_HEIGHT,
  KOREA_PROVINCE_SHAPES,
  KOREA_PROVINCE_WIDTH,
} from "@/lib/branch/korea-province-map"
import { useBranchJson } from "../client-api"
import { cny } from "@/lib/branch/money-format"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
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

const REGION_ALIASES: Array<[string, string]> = [
  ["서울", "서울"], ["인천", "인천"], ["경기", "경기"], ["강원", "강원"],
  ["충북", "충북"], ["충청북", "충북"], ["충남", "충남"], ["충청남", "충남"],
  ["세종", "세종"], ["대전", "대전"],
  ["경북", "경북"], ["경상북", "경북"], ["대구", "대구"], ["울산", "울산"],
  ["부산", "부산"], ["경남", "경남"], ["경상남", "경남"],
  ["전북", "전북"], ["전라북", "전북"], ["광주", "광주"], ["전남", "전남"], ["전라남", "전남"],
  ["제주", "제주"],
]

function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

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
  const text = region.trim()
  const match = REGION_ALIASES.find(([needle]) => text.includes(needle))
  return match?.[1] ?? null
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
const LABEL_NUDGE: Record<string, { dx: number; dy: number }> = {
  "서울": { dx: -3.5, dy: -2 },
  "인천": { dx: -4, dy: -1.5 },
  "세종": { dx: -1, dy: -3 },
  "대전": { dx: 0, dy: 3 },
  "광주": { dx: -3, dy: 0 },
  "대구": { dx: 0, dy: -1.5 },
  "울산": { dx: 2.5, dy: -1 },
  "부산": { dx: 1.5, dy: 2 },
}

const ZOOM_MIN = 1
const ZOOM_MAX = 4
const ZOOM_STEP = 1.4

type Metric = "revenue" | "progress"

const EMPTY_ROWS: Row[] = []

function HeatMap({ rows, selectedLabel, onSelect, metric }: {
  rows: MapRow[]
  selectedLabel: string | null
  onSelect: (row: MapRow) => void
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
          dragRef.current = { startX: e.clientX, startY: e.clientY, panX: clampedPan.x, panY: clampedPan.y }
        }}
        onMouseMoveCapture={(e) => {
          const drag = dragRef.current
          if (!drag) return
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
                onClick={() => onSelect(row)}
                onMouseEnter={() => setHovered(row.label)}
                onFocus={() => setHovered(row.label)}
                onBlur={() => setHovered(null)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row) } }}
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
      <div className="absolute right-2 top-2 z-20 flex flex-col gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white/90 p-0.5 shadow-[0_2px_6px_rgba(0,0,0,0.06)] backdrop-blur">
        <button type="button" aria-label="확대"
          disabled={zoom >= ZOOM_MAX}
          onClick={() => applyZoom(zoom * ZOOM_STEP)}
          className="flex h-6 w-6 items-center justify-center rounded text-[#111110] transition hover:bg-[#F0EFEC] disabled:opacity-30">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="축소"
          disabled={zoom <= ZOOM_MIN}
          onClick={() => applyZoom(zoom / ZOOM_STEP)}
          className="flex h-6 w-6 items-center justify-center rounded text-[#111110] transition hover:bg-[#F0EFEC] disabled:opacity-30">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="원래 크기"
          disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
          className="flex h-6 w-6 items-center justify-center rounded text-[#615D59] transition hover:bg-[#F0EFEC] disabled:opacity-30">
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      {/* Tiny legend — mirrors the active ramp so the user reads the map and
          legend with the same visual vocabulary. */}
      <div className="mt-2 flex items-center gap-2 px-1 text-[10px] text-[#615D59]">
        <span>{metric === "revenue" ? "매출" : "달성률"}</span>
        <div className="h-[3px] w-28 rounded-full"
          style={{ background: `linear-gradient(90deg, ${HEAT_STOPS.map((s) => `rgb(${s.rgb.join(",")}) ${(s.t * 100).toFixed(0)}%`).join(", ")})` }} />
        <span className="text-[#A39E98]">낮음</span>
        <span className="ml-auto text-[#A39E98]">높음</span>
      </div>
    </div>
  )
}

function CompactRow({ row, rank, selected, onSelect, metric, maxExpected }: {
  row: Row; rank: number; selected: boolean; onSelect: () => void
  metric: Metric; maxExpected: number
}) {
  const metricValue = metric === "revenue" ? row.expected : row.progress
  const metricMax = metric === "revenue" ? maxExpected : 100
  const barPct = metric === "revenue"
    ? (maxExpected > 0 ? Math.min(100, (row.expected / maxExpected) * 100) : 0)
    : Math.min(100, row.progress)
  const barColor = heatColorRamp(metricValue, metricMax)
  const barOpacity = rampOpacity(metricValue, metricMax)
  // 저대비 수정 — 이전에는 이 값 텍스트 색을 heatColorRamp 보간값으로 직접 칠해
  // 중간 구간(예: 태닝 톤 #C09460)에서 흰 배경 대비 ~2.75:1까지 떨어졌다. 이제
  // 텍스트는 항상 캐논 잉크(#111110)로 고정하고, 색 신호는 옆의 진행 바 + 작은
  // 도트(칩)로만 전달한다.
  return (
    <button type="button" onClick={onSelect}
      className={`grid w-full grid-cols-[18px_56px_minmax(0,1fr)_56px] items-center gap-2 rounded px-1.5 py-1.5 text-left transition ${
        selected ? "bg-[#F0EFEC]" : "hover:bg-[#F6F5F4]"
      }`}>
      <span className="text-[10px] tabular-nums text-[#A39E98]">{String(rank).padStart(2, "0")}</span>
      <span className="truncate text-[11.5px] font-semibold text-[#111110]">{row.region}</span>
      <div className="h-1 overflow-hidden rounded-full bg-[#EFEDE7]">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${barPct}%`, background: barColor, opacity: barOpacity }} />
      </div>
      <span className="flex items-center justify-end gap-1.5 text-right text-[11px] font-bold tabular-nums text-[#111110]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: barColor }} aria-hidden="true" />
        {metric === "revenue" ? `¥${cny(row.expected)}` : `${row.progress.toFixed(0)}%`}
      </span>
    </button>
  )
}

function DetailPanel({ row, metric }: { row: MapRow | null; metric: Metric }) {
  if (!row) {
    return (
      <div className="px-1 py-2 text-[12px] text-[#A39E98]">
        지역을 선택하거나 호버하면 상세가 표시됩니다.
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] pb-3">
        <div>
          <p className="text-[16px] font-bold tracking-[-0.01em] text-[#111110]">{row.label}</p>
          {row.regions.length > 1 && (
            <p className="mt-0.5 text-[10px] text-[#A39E98]">{row.regions.join(", ")}</p>
          )}
        </div>
        {(() => {
          // DetailPanel doesn't know maxExpected, but it can derive a sane
          // ramp by using the region's progress for the progress mode and the
          // ratio of expected to its own target for the revenue mode (since
          // we want "this region is X% of max" coloring; without maxExpected
          // here we fall back to progress as the secondary indicator).
          const progressColor = heatColorRamp(row.progress, 100)
          return metric === "revenue" ? (
            <div className="text-right">
              <span className="text-[18px] font-bold tabular-nums" style={{ color: progressColor }}>
                ¥{cny(row.expected)}
              </span>
              <p className="mt-0.5 text-[10px] tabular-nums text-[#A39E98]">{row.progress.toFixed(0)}%</p>
            </div>
          ) : (
            <div className="text-right">
              <span className="text-[18px] font-bold tabular-nums" style={{ color: progressColor }}>
                {row.progress.toFixed(0)}%
              </span>
              <p className="mt-0.5 text-[10px] tabular-nums text-[#A39E98]">¥{cny(row.expected)}</p>
            </div>
          )
        })()}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px]">
        <div>
          <p className="text-[10px] text-[#A39E98]">확정 (당월·이전)</p>
          {/* 확정 매출 = 캐논 그린 — 빨강 아님(시트 "빨간 글자=확정"은 입력 관례일 뿐). */}
          <p className="mt-0.5 text-[13px] font-bold tracking-[-0.01em]" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>
            ¥{cny(row.revenue)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">추정 (미래)</p>
          <p className="mt-0.5 text-[13px] font-semibold text-[#615D59]">¥{cny(row.projected)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">합계 (확정+추정)</p>
          <p className="mt-0.5 text-[13px] font-bold tracking-[-0.01em]" style={{ color: heatColorRamp(row.progress, 100) }}>
            ¥{cny(row.expected)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">목표 (계약가 합)</p>
          <p className="mt-0.5 text-[13px] font-semibold text-[#111110]">¥{cny(row.target)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">딜</p>
          <p className="mt-0.5 text-[13px] font-semibold text-[#111110]">
            {row.confirmed_count} / {row.deals_count}건
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">미시작 잔량</p>
          {/* 확도 예외 파랑(#1E5DA8)은 REV 3단 확도 맥락 전용 — 여기 open_target은
              "첫 납부가 아직 없는 딜의 목표 합"이라 확도 신호가 아니다. 아직 손도
              안 댄 목표라는 뜻이라 Warning 축(캐논 #A8741A)으로 표시한다. */}
          <p className="mt-0.5 text-[13px] font-bold" style={{ color: "#A8741A" }}>
            ¥{cny(row.open_target)}
          </p>
        </div>
      </div>
      {row.top_customers.length > 0 && (
        <div className="mt-3 border-t border-[rgba(0,0,0,0.06)] pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#A39E98]">주요 고객</p>
          <ul className="flex flex-col gap-1">
            {row.top_customers.slice(0, 3).map((c) => (
              <li key={`${c.customer}-${c.manager ?? ""}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-0.5">
                <span className="truncate text-[11.5px] text-[#111110]">{c.customer}</span>
                <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>¥{cny(c.revenue)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function BranchRegionHeatmap({ team, period, selectedMonth, refreshKey }: { team: Team; period: Period; selectedMonth: string; refreshKey: number }) {
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  // 로컬 재시도 넛지 — 상위 refreshKey(전역 새로고침, 강제 스크롤 동반)에 기대지 않고
  // 이 섹션만 useBranchJson의 기존 캐시키 재계산 경로(refreshKey:url)를 재사용해 다시 요청한다.
  const [localRetry, setLocalRetry] = useState(0)
  const heatmap = useBranchJson<{ rows?: Row[] }>(`/api/admin/branch/heatmap?team=${team}&period=${period}${monthQuery}`, refreshKey + localRetry)
  const rows = heatmap.loading ? null : (heatmap.data?.rows ?? EMPTY_ROWS)
  const error = heatmap.error
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  // Default to revenue — magnitude tells the operator where the money is,
  // which is more actionable than achievement %.
  const [metric, setMetric] = useState<Metric>("revenue")

  // Ranking sort follows the active metric so the list and the map agree.
  const sortedRanking = useMemo(() => {
    const list = [...(rows ?? [])]
    if (metric === "revenue") {
      return list.sort((a, b) => b.expected - a.expected || b.progress - a.progress)
    }
    return list.sort((a, b) => b.progress - a.progress || b.expected - a.expected)
  }, [rows, metric])
  const { mappedRows, otherRows } = useMemo(() => mergeForMap(rows ?? []), [rows])
  const maxExpected = useMemo(
    () => Math.max(1, ...(rows ?? []).map((r) => r.expected || 0)),
    [rows],
  )
  const selected = mappedRows.find((r) => r.label === selectedLabel) ?? mappedRows[0] ?? null

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
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#B43E3E] bg-white px-2.5 text-[11px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
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
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#084734]" />
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">KR 지역 히트맵</h2>
        </div>
        <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[2px]" role="group" aria-label="히트맵 지표 선택">
          {(["revenue", "progress"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMetric(m)}
              aria-pressed={metric === m}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                metric === m ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
              }`}>
              {m === "revenue" ? "매출" : "달성률"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid w-full gap-6 p-5 lg:grid-cols-[minmax(520px,1fr)_minmax(280px,360px)]">
        <HeatMap rows={mappedRows} selectedLabel={selected?.label ?? null}
          onSelect={(r) => setSelectedLabel(r.label)} metric={metric} />

        <div className="flex w-full max-w-[360px] flex-col gap-4 lg:ml-auto">
          <DetailPanel row={selected} metric={metric} />

          <div>
            <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#615D59]">
              지역 순위 · {sortedRanking.length}개 ({metric === "revenue" ? "매출 순" : "달성률 순"})
            </p>
            <div className="max-h-[280px] overflow-y-auto">
              {sortedRanking.map((r, i) => {
                const canon = canonicalRegion(r.region)
                const sel = canon ? selected?.label === canon : false
                return (
                  <CompactRow key={r.region} row={r} rank={i + 1} selected={sel}
                    metric={metric} maxExpected={maxExpected}
                    onSelect={() => { if (canon) setSelectedLabel(canon) }} />
                )
              })}
            </div>
          </div>

          {otherRows.length > 0 && (
            <div className="px-1">
              <p className="mb-1.5 text-[10px] font-semibold text-[#A39E98]">지도 외</p>
              <div className="flex flex-wrap gap-1">
                {otherRows.map((r) => (
                  <span key={r.region} className="rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[10px] text-[#615D59]">
                    {r.region} {metric === "revenue" ? `¥${cny(r.expected)}` : `${r.progress.toFixed(0)}%`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export { fmt as fmtNumber }
