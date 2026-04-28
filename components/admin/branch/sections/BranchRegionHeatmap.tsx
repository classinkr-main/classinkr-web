"use client"
import { useEffect, useMemo, useState } from "react"
import { MapPin } from "lucide-react"
import {
  KOREA_PROVINCE_BY_LABEL,
  KOREA_PROVINCE_SHAPES,
  KOREA_PROVINCE_VIEWBOX,
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
function krw(n: number) {
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
    const progress = target > 0 ? (revenue / target) * 100 : 0
    mapped.set(canonical, {
      ...current,
      target, revenue, progress,
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

function HeatMap({ rows, selectedLabel, onSelect }: {
  rows: MapRow[]
  selectedLabel: string | null
  onSelect: (row: MapRow) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const rowsByLabel = useMemo(() => new Map(rows.map((r) => [r.label, r])), [rows])
  const hoveredRow = hovered ? rowsByLabel.get(hovered) ?? null : null

  return (
    <div className="relative w-full"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }}
      onMouseLeave={() => setHovered(null)}>
      <svg viewBox={KOREA_PROVINCE_VIEWBOX} className="block h-auto w-full" role="group" aria-label="대한민국 지역별 매출 달성률 히트맵">
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
            const dimmed = hovered !== null && !hov
            return (
              <path key={`fill-${s.label}`} d={row.path}
                fill={heatColor(row.progress)}
                stroke="#ffffff"
                strokeWidth={sel ? 0.6 : 0.4}
                opacity={dimmed ? 0.18 : Math.min(1, heatOpacity(row.progress) * (sel ? 1.2 : hov ? 1.1 : 1))}
                className="cursor-pointer transition-opacity focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]"
                style={{ outline: "none" }}
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

        {/* Centroid labels — small, only province name */}
        <g className="pointer-events-none">
          {rows.map((r) => (
            <text key={`label-${r.label}`} x={r.x} y={r.y + 1}
              textAnchor="middle"
              style={{
                fontSize: 3.6, fontWeight: 700,
                fill: r.progress >= 50 ? "#fff" : "#111110",
                opacity: hovered && hovered !== r.label ? 0.25 : 0.95,
              }}>
              {r.label}
            </text>
          ))}
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
            <span className="font-semibold" style={{ color: "#B43E3E" }}>₩{krw(hoveredRow.revenue)}</span>
            <span className="mx-1">/</span>
            ₩{krw(hoveredRow.target)}
          </p>
          <p className="mt-0.5 text-[10px] text-[#615D59]">
            {hoveredRow.confirmed_count} / {hoveredRow.deals_count}건 · {statusLabel(hoveredRow.progress)}
          </p>
        </div>
      )}

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
  // Mini bar showing relative achievement
  const barWidth = `${Math.min(100, row.progress)}%`
  return (
    <button type="button" onClick={onSelect}
      className={`grid w-full grid-cols-[24px_minmax(0,1fr)_60px_44px] items-center gap-2 rounded px-1.5 py-1.5 text-left transition ${
        selected ? "bg-[#F0EFEC]" : "hover:bg-[#F6F5F4]"
      }`}>
      <span className="text-[10px] tabular-nums text-[#A39E98]">{String(rank).padStart(2, "0")}</span>
      <span className="truncate text-[11.5px] font-semibold text-[#111110]">{row.region}</span>
      <div className="h-[3px] overflow-hidden rounded-full bg-[#EFEDE7]">
        <div className="h-full rounded-full" style={{ width: barWidth, background: heatColor(row.progress), opacity: heatOpacity(row.progress) }} />
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
          <p className="text-[10px] text-[#A39E98]">확정</p>
          <p className="mt-0.5 text-[13px] font-bold tracking-[-0.01em]" style={{ color: "#B43E3E" }}>
            ₩{krw(row.revenue)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">목표</p>
          <p className="mt-0.5 text-[13px] font-semibold text-[#111110]">₩{krw(row.target)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">딜</p>
          <p className="mt-0.5 text-[13px] font-semibold text-[#111110]">
            {row.confirmed_count} / {row.deals_count}건
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#A39E98]">잔량</p>
          <p className="mt-0.5 text-[13px] font-bold" style={{ color: "#1E5DA8" }}>
            ₩{krw(row.open_target)}
          </p>
        </div>
      </div>
      {row.top_customers.length > 0 && (
        <div className="mt-3 border-t border-[rgba(0,0,0,0.06)] pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#A39E98]">주요 고객</p>
          <ul className="flex flex-col gap-1">
            {row.top_customers.slice(0, 3).map((c) => (
              <li key={`${c.customer}-${c.manager ?? ""}`} className="flex items-baseline justify-between gap-2 py-0.5">
                <span className="truncate text-[11.5px] text-[#111110]">{c.customer}</span>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: "#B43E3E" }}>₩{krw(c.revenue)}</span>
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

      <div className="grid w-full gap-6 p-5 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <HeatMap rows={mappedRows} selectedLabel={selected?.label ?? null}
          onSelect={(r) => setSelectedLabel(r.label)} />

        <div className="flex flex-col gap-4">
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
