"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { MapPin, Minus, Plus, RotateCcw } from "lucide-react"
import {
  KOREA_PROVINCE_BY_LABEL,
  KOREA_PROVINCE_HEIGHT,
  KOREA_PROVINCE_SHAPES,
  KOREA_PROVINCE_WIDTH,
} from "@/lib/branch/korea-province-map"
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
function cny(n: number) {
  if (!Number.isFinite(n)) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`
  return n.toLocaleString()
}

// Heat color — single green scale; progress determines opacity, not hue.
// Saturated green for strong regions, faint green for weak ones — the eye latches onto strong.
const HEAT_BASE = "#084734"
const HEAT_LOW  = "#B43E3E" // only the weakest tier shifts to red as a clear warning

function heatColor(p: number): string {
  // Three tiers: weak → warning red, mid → muted olive blend, strong → green
  if (p < 50) return HEAT_LOW
  return HEAT_BASE
}
// Opacity bound to progress — low progress fades into background, high progress pops.
function heatOpacity(p: number): number {
  const clamped = Math.max(0, Math.min(120, p))
  // 0% → 0.15 (barely visible), 100%+ → 0.92
  return 0.15 + (Math.min(100, clamped) / 100) * 0.77
}
function statusOf(p: number): Row["status"] {
  if (p >= 95) return "good"
  if (p >= 75) return "warning"
  return "critical"
}
function statusLabel(p: number) {
  if (p >= 100) return "초과달성"
  if (p >= 90) return "순조"
  if (p >= 70) return "주의"
  if (p >= 50) return "위험"
  return "심각"
}

function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
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

function HeatMap({ rows, selectedLabel, onSelect }: {
  rows: MapRow[]
  selectedLabel: string | null
  onSelect: (row: MapRow) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const rowsByLabel = useMemo(() => new Map(rows.map((r) => [r.label, r])), [rows])
  const hoveredRow = hovered ? rowsByLabel.get(hovered) ?? null : null

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
              fill="#F0EFEC" stroke="#E2DFD8" strokeWidth={0.35} />
          ))}
        </g>

        {/* Heat fills — opacity = progress, hue only flips below 50% */}
        <g>
          {KOREA_PROVINCE_SHAPES.map((s) => {
            const row = rowsByLabel.get(s.label)
            if (!row) return null
            const sel = selectedLabel === row.label
            const hov = hovered === row.label
            const someoneElseHovered = hovered !== null && !hov
            const isRevealed = revealedSet.has(row.label)
            const baseOpacity = Math.min(1, heatOpacity(row.progress) * (sel ? 1.15 : 1))
            // Reveal step gates opacity to 0 until the path's turn.
            const visibleOpacity = isRevealed
              ? (someoneElseHovered ? 0.35 : (hov ? 1 : baseOpacity))
              : 0
            return (
              <path key={`fill-${s.label}`} d={row.path}
                fill={someoneElseHovered ? DIMMED_FILL : heatColor(row.progress)}
                stroke="#ffffff"
                strokeWidth={sel ? 0.45 : 0.3}
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
                aria-label={`${row.label} ${row.progress.toFixed(0)}%`}
                onClick={() => onSelect(row)}
                onMouseEnter={() => setHovered(row.label)}
                onFocus={() => setHovered(row.label)}
                onBlur={() => setHovered(null)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row) } }}
              >
                <title>{`${row.label} ${row.progress.toFixed(0)}%`}</title>
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
            // Font scales inversely with zoom so labels stay readable but
            // don't blow up when the user zooms into a metro area.
            const fontSize = Math.max(1.6, 2.5 / Math.sqrt(zoom))
            return (
              <text key={`label-${r.label}`} x={r.x + nudge.dx} y={r.y + 1 + nudge.dy}
                textAnchor="middle"
                style={{
                  fontSize, fontWeight: 700,
                  fill: someoneElseHovered ? "#8C8884" : (r.progress >= 50 ? "#fff" : "#111110"),
                  opacity: isRevealed ? (someoneElseHovered ? 0.55 : 0.95) : 0,
                  paintOrder: "stroke",
                  stroke: someoneElseHovered ? "transparent" : (r.progress >= 50 ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.85)"),
                  strokeWidth: 0.35,
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
            <span className="text-[12px] font-bold" style={{ color: heatColor(hoveredRow.progress) }}>
              {hoveredRow.progress.toFixed(0)}%
            </span>
          </div>
          <p className="mt-1 text-[10.5px] text-[#615D59]">
            <span className="font-semibold" style={{ color: "#B43E3E" }}>¥{cny(hoveredRow.revenue)}</span>
            {hoveredRow.projected > 0 && (
              <span className="ml-1 text-[#615D59]">+ 추정 ¥{cny(hoveredRow.projected)}</span>
            )}
            <span className="mx-1">/</span>
            ¥{cny(hoveredRow.target)}
          </p>
          <p className="mt-0.5 text-[10px] text-[#615D59]">
            {hoveredRow.confirmed_count} / {hoveredRow.deals_count}건 · {statusLabel(hoveredRow.progress)}
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

      {/* Tiny legend */}
      <div className="mt-2 flex items-center gap-2 px-1 text-[10px] text-[#615D59]">
        <span>달성률</span>
        <div className="h-[3px] w-24 rounded-full"
          style={{ background: `linear-gradient(90deg, ${HEAT_LOW} 0%, rgba(8,71,52,0.18) 50%, ${HEAT_BASE} 100%)` }} />
        <span className="text-[#A39E98]">낮음</span>
        <span className="ml-auto text-[#A39E98]">높음</span>
      </div>
    </div>
  )
}

function CompactRow({ row, rank, selected, onSelect }: { row: Row; rank: number; selected: boolean; onSelect: () => void }) {
  const barWidth = `${Math.min(100, row.progress)}%`
  return (
    <button type="button" onClick={onSelect}
      className={`grid w-full grid-cols-[18px_60px_minmax(0,1fr)_36px] items-center gap-2 rounded px-1.5 py-1.5 text-left transition ${
        selected ? "bg-[#F0EFEC]" : "hover:bg-[#F6F5F4]"
      }`}>
      <span className="text-[10px] tabular-nums text-[#A39E98]">{String(rank).padStart(2, "0")}</span>
      <span className="truncate text-[11.5px] font-semibold text-[#111110]">{row.region}</span>
      <div className="h-1 overflow-hidden rounded-full bg-[#EFEDE7]">
        <div className="h-full rounded-full transition-[width]" style={{ width: barWidth, background: heatColor(row.progress), opacity: heatOpacity(row.progress) }} />
      </div>
      <span className="text-right text-[11px] font-bold tabular-nums" style={{ color: heatColor(row.progress) }}>
        {row.progress.toFixed(0)}%
      </span>
    </button>
  )
}

function DetailPanel({ row }: { row: MapRow | null }) {
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
        <span className="text-[16px] font-bold tabular-nums" style={{ color: heatColor(row.progress) }}>
          {row.progress.toFixed(0)}%
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px]">
        <div>
          <p className="text-[10px] text-[#A39E98]">확정 (당월·이전)</p>
          <p className="mt-0.5 text-[13px] font-bold tracking-[-0.01em]" style={{ color: "#B43E3E" }}>
            ¥{cny(row.revenue)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">추정 (미래)</p>
          <p className="mt-0.5 text-[13px] font-semibold text-[#615D59]">¥{cny(row.projected)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">합계 (확정+추정)</p>
          <p className="mt-0.5 text-[13px] font-bold tracking-[-0.01em]" style={{ color: heatColor(row.progress) }}>
            ¥{cny(row.expected)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">기간 목표</p>
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
          <p className="mt-0.5 text-[13px] font-bold" style={{ color: "#1E5DA8" }}>
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
                <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums" style={{ color: "#B43E3E" }}>¥{cny(c.revenue)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function BranchRegionHeatmap({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const requestKey = `${refreshKey}:${team}:${period}`
  const [state, setState] = useState<{ key: string; rows: Row[] | null; error: string | null }>({ key: requestKey, rows: null, error: null })
  const rows = state.key === requestKey ? state.rows : null
  const error = state.key === requestKey ? state.error : null
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void adminFetch(`/api/admin/branch/heatmap?team=${team}&period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d.error) setState({ key: requestKey, rows: null, error: String(d.error) })
        else setState({ key: requestKey, rows: d.rows, error: null })
      })
      .catch((e) => { if (!cancelled) setState({ key: requestKey, rows: null, error: String(e) }) })
    return () => { cancelled = true }
  }, [requestKey, team, period])

  // Ranking: revenue total first, then achievement %
  const sortedByProgress = useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.revenue - a.revenue || b.progress - a.progress),
    [rows],
  )
  const { mappedRows, otherRows } = useMemo(() => mergeForMap(rows ?? []), [rows])
  const selected = mappedRows.find((r) => r.label === selectedLabel) ?? mappedRows[0] ?? null

  if (error) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
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
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#084734]" />
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">KR 지역 히트맵</h2>
        </div>
        <p className="text-[10.5px] text-[#A39E98]">호버 시 지역 상세</p>
      </div>

      <div className="grid w-full gap-6 p-5 lg:grid-cols-[minmax(520px,1fr)_minmax(280px,360px)]">
        <HeatMap rows={mappedRows} selectedLabel={selected?.label ?? null}
          onSelect={(r) => setSelectedLabel(r.label)} />

        <div className="flex w-full max-w-[360px] flex-col gap-4 lg:ml-auto">
          <DetailPanel row={selected} />

          <div>
            <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#615D59]">
              지역 순위 · {sortedByProgress.length}개
            </p>
            <div className="max-h-[280px] overflow-y-auto">
              {sortedByProgress.map((r, i) => {
                const canon = canonicalRegion(r.region)
                const sel = canon ? selected?.label === canon : false
                return (
                  <CompactRow key={r.region} row={r} rank={i + 1} selected={sel}
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
                    {r.region} {r.progress.toFixed(0)}%
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
