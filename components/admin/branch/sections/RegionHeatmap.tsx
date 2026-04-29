"use client"
import { ArrowDownRight, ArrowUpRight, Map as MapIcon, Maximize2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  KOREA_PROVINCE_BY_LABEL,
  KOREA_PROVINCE_HEIGHT,
  KOREA_PROVINCE_SHAPES,
  KOREA_PROVINCE_VIEWBOX,
  KOREA_PROVINCE_WIDTH,
} from "@/lib/branch/korea-province-map"
import type { Team, Period } from "../types"

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

interface TopCustomer {
  customer: string
  manager: string | null
  team: string | null
  status: string | null
  first_payment: string | null
  target: number
  revenue: number
}

interface MapRow extends Row {
  label: string
  path: string
  x: number
  y: number
  regions: string[]
}

const STATUS_STYLE = {
  good: {
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    fill: "#059669",
  },
  warning: {
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    fill: "#d97706",
  },
  critical: {
    text: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
    fill: "#e11d48",
  },
} as const

const REGION_ALIASES: Array<[string, string]> = [
  ["서울", "서울"],
  ["인천", "인천"],
  ["경기", "경기"],
  ["강원", "강원"],
  ["충북", "충북"],
  ["충청북", "충북"],
  ["충남", "충남"],
  ["충청남", "충남"],
  ["세종", "세종"],
  ["대전", "대전"],
  ["경북", "경북"],
  ["경상북", "경북"],
  ["대구", "대구"],
  ["울산", "울산"],
  ["부산", "부산"],
  ["경남", "경남"],
  ["경상남", "경남"],
  ["전북", "전북"],
  ["전라북", "전북"],
  ["광주", "광주"],
  ["전남", "전남"],
  ["전라남", "전남"],
  ["제주", "제주"],
]

function fmt(n: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n)
}

function statusOf(progress: number): Row["status"] {
  if (progress >= 95) return "good"
  if (progress >= 75) return "warning"
  return "critical"
}

function heatColor(progress: number) {
  if (progress >= 100) return "#047857"
  if (progress >= 85) return "#059669"
  if (progress >= 70) return "#d97706"
  if (progress >= 45) return "#f97316"
  return "#e11d48"
}

function pct(value: number, max: number) {
  return (value / max) * 100
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
    if (!canonical || !shape) {
      others.push(row)
      continue
    }

    const current = mapped.get(canonical)
    if (!current) {
      mapped.set(canonical, {
        ...row,
        label: shape.label,
        path: shape.path,
        x: shape.x,
        y: shape.y,
        regions: [row.region],
      })
      continue
    }

    const target = current.target + row.target
    const revenue = current.revenue + row.revenue
    const progress = target > 0 ? (revenue / target) * 100 : 0
    mapped.set(canonical, {
      ...current,
      target,
      revenue,
      progress,
      status: statusOf(progress),
      deals_count: current.deals_count + row.deals_count,
      confirmed_count: current.confirmed_count + row.confirmed_count,
      open_target: current.open_target + row.open_target,
      top_customers: [...current.top_customers, ...row.top_customers]
        .sort((a, b) => b.revenue - a.revenue || b.target - a.target)
        .slice(0, 5),
      regions: [...current.regions, row.region],
    })
  }

  return {
    mappedRows: [...mapped.values()].sort((a, b) => b.target - a.target),
    otherRows: others.sort((a, b) => b.target - a.target),
  }
}

function CompactRegionRow({ row, rank, onSelect }: { row: Row; rank: number; onSelect?: () => void }) {
  const tone = STATUS_STYLE[row.status]
  return (
    <button
      type="button"
      onClick={onSelect}
      className="grid w-full grid-cols-[32px_minmax(0,1fr)_72px] items-center gap-3 border-t border-[#f0f0ec] py-2 text-left first:border-t-0 hover:bg-[#fafaf8]"
    >
      <span className="text-[11px] text-[#1a1a1a]/35">{String(rank).padStart(2, "0")}</span>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-[#111110]">{row.region}</p>
        <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/40">¥{fmt(row.revenue)} / ¥{fmt(row.target)}</p>
      </div>
      <span className={`rounded-full px-2 py-1 text-right text-[11px] font-semibold ${tone.bg} ${tone.text}`}>
        {row.progress.toFixed(0)}%
      </span>
    </button>
  )
}

function RegionHoverCard({ row }: { row: MapRow }) {
  return (
    <div
      className="pointer-events-none absolute z-30 w-44 -translate-x-1/2 rounded-xl border border-[#e8e8e4] bg-white/95 p-3 shadow-[0_12px_30px_rgba(17,17,16,0.12)]"
      style={{
        left: `${pct(row.x, KOREA_PROVINCE_WIDTH)}%`,
        top: `${Math.max(3, pct(row.y, KOREA_PROVINCE_HEIGHT) - 8)}%`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-[#111110]">{row.label}</p>
        <span className="text-[12px] font-bold text-[#111110]">{row.progress.toFixed(0)}%</span>
      </div>
      <p className="mt-1 text-[11px] text-[#1a1a1a]/50">매출 ¥{fmt(row.revenue)} / 목표 ¥{fmt(row.target)}</p>
      <p className="mt-1 truncate text-[11px] text-[#1a1a1a]/50">
        주요 고객 {row.top_customers[0]?.customer ?? "-"}
      </p>
    </div>
  )
}

function RegionDetailPanel({ row }: { row: MapRow | null }) {
  if (!row) {
    return <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 text-[12px] text-[#1a1a1a]/45">지역을 선택하면 상세가 표시됩니다.</div>
  }

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold text-[#111110]">{row.label}</p>
          <p className="mt-1 text-[11px] text-[#1a1a1a]/45">포함 지역 {row.regions.join(", ")}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${STATUS_STYLE[row.status].bg} ${STATUS_STYLE[row.status].text}`}>
          {row.progress.toFixed(0)}%
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-xl bg-[#fafaf8] p-3">
          <p className="text-[#1a1a1a]/40">확정 매출</p>
          <p className="mt-1 text-[13px] font-semibold text-[#111110]">¥{fmt(row.revenue)}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] p-3">
          <p className="text-[#1a1a1a]/40">목표 금액</p>
          <p className="mt-1 text-[13px] font-semibold text-[#111110]">¥{fmt(row.target)}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] p-3">
          <p className="text-[#1a1a1a]/40">딜</p>
          <p className="mt-1 text-[13px] font-semibold text-[#111110]">{row.deals_count}건 · 확정 {row.confirmed_count}건</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] p-3">
          <p className="text-[#1a1a1a]/40">미확정 목표</p>
          <p className="mt-1 text-[13px] font-semibold text-[#111110]">¥{fmt(row.open_target)}</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-[12px] font-semibold text-[#111110]">주요 매출 고객</p>
        <div className="space-y-2">
          {row.top_customers.length === 0 && <p className="text-[12px] text-[#1a1a1a]/40">표시할 고객이 없습니다.</p>}
          {row.top_customers.map((customer) => (
            <div key={`${customer.customer}-${customer.manager ?? ""}`} className="rounded-xl border border-[#f0f0ec] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-[#111110]">{customer.customer}</p>
                  <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{customer.manager ?? "-"} · {customer.status ?? "-"}</p>
                </div>
                <p className="shrink-0 text-right text-[11px] font-semibold text-[#111110]">¥{fmt(customer.revenue)}</p>
              </div>
              <p className="mt-1 text-[11px] text-[#1a1a1a]/40">목표 ¥{fmt(customer.target)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KoreaMapHeatmap({
  rows,
  selectedLabel,
  onSelect,
}: {
  rows: MapRow[]
  selectedLabel: string | null
  onSelect: (row: MapRow) => void
}) {
  const maxTarget = Math.max(1, ...rows.map((row) => row.target))
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null)
  const rowsByLabel = useMemo(() => new Map(rows.map((row) => [row.label, row])), [rows])
  const hoveredRow = rows.find((row) => row.label === hoveredLabel) ?? null

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-[#fbfbf8] p-3">
      <div className="relative mx-auto aspect-[130/204] max-h-[68vh] w-full max-w-[480px] overflow-hidden rounded-xl bg-[#fbfbf8]">
        <svg
          viewBox={KOREA_PROVINCE_VIEWBOX}
          className="absolute inset-0 h-full w-full"
          role="group"
          aria-label="대한민국 지역별 매출 달성률 히트맵"
        >
          <g>
            {KOREA_PROVINCE_SHAPES.map((shape) => (
              <path
                key={`base-${shape.label}`}
                d={shape.path}
                fill="#efeee8"
                stroke="#d8d5cb"
                strokeWidth={0.45}
              />
            ))}
          </g>
          <g>
            {KOREA_PROVINCE_SHAPES.map((shape) => {
              const row = rowsByLabel.get(shape.label)
              if (!row) return null
              const selected = selectedLabel === row.label
              const hovered = hoveredLabel === row.label
              return (
                <path
                  key={`region-${row.label}`}
                  d={row.path}
                  role="button"
                  tabIndex={0}
                  aria-label={`${row.label} ${row.progress.toFixed(0)}%`}
                  fill={heatColor(row.progress)}
                  stroke="#ffffff"
                  strokeWidth={selected ? 1.25 : 0.75}
                  opacity={selected ? 0.98 : hovered ? 0.9 : 0.78}
                  className="cursor-pointer transition"
                  onClick={() => onSelect(row)}
                  onFocus={() => setHoveredLabel(row.label)}
                  onBlur={() => setHoveredLabel(null)}
                  onMouseEnter={() => setHoveredLabel(row.label)}
                  onMouseLeave={() => setHoveredLabel(null)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    onSelect(row)
                  }}
                >
                  <title>{`${row.label}: ${row.progress.toFixed(0)}%`}</title>
                </path>
              )
            })}
          </g>
          <g className="pointer-events-none">
            {KOREA_PROVINCE_SHAPES.map((shape) => {
              const row = rowsByLabel.get(shape.label)
              if (!row) return null
              const tone = STATUS_STYLE[row.status]
              const selected = selectedLabel === row.label
              const radius = 4.4 + Math.sqrt(row.target / maxTarget) * 3.2
              return (
                <g key={`marker-${row.label}`} transform={`translate(${row.x} ${row.y})`}>
                  <circle
                    r={radius}
                    fill={tone.fill}
                    stroke={selected ? "#111110" : "#ffffff"}
                    strokeWidth={selected ? 1.25 : 0.85}
                    opacity={0.96}
                  />
                  <text
                    y="1.25"
                    textAnchor="middle"
                    fontSize="3.6"
                    fontWeight="700"
                    fill="#ffffff"
                  >
                    {row.progress.toFixed(0)}
                  </text>
                  <text
                    y={radius + 4.3}
                    textAnchor="middle"
                    fontSize="4"
                    fontWeight="700"
                    fill="#111110"
                    stroke="#ffffff"
                    strokeWidth="0.6"
                    paintOrder="stroke"
                  >
                    {row.label}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
        {hoveredRow && <RegionHoverCard row={hoveredRow} />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 px-1 text-[11px] text-[#1a1a1a]/45">
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-emerald-600" />95% 이상</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-600" />75-94%</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-rose-600" />75% 미만</span>
        <span>지역 색 = 진척도</span>
      </div>
    </div>
  )
}

export default function RegionHeatmap({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRegionLabel, setSelectedRegionLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.resolve()
      .then(() => { if (!cancelled) { setRows(null) } })
      .then(() => adminFetch(`/api/admin/branch/heatmap?team=${team}&period=${period}`))
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d.error) { setError(d.error); setRows(null) }
        else { setError(null); setRows(d.rows) }
      })
      .catch((e) => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [team, period, refreshKey])

  const sortedByProgress = useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.progress - a.progress || b.revenue - a.revenue),
    [rows],
  )
  const topRows = sortedByProgress.slice(0, 3)
  const bottomRows = [...sortedByProgress].reverse().slice(0, 3)
  const { mappedRows, otherRows } = useMemo(() => mergeForMap(rows ?? []), [rows])
  const selectedRegion = mappedRows.find((row) => row.label === selectedRegionLabel) ?? mappedRows[0] ?? null

  function openRegionDetail(row?: Row) {
    const canonical = row ? canonicalRegion(row.region) : null
    setSelectedRegionLabel(canonical ?? mappedRows[0]?.label ?? null)
    setDetailOpen(true)
  }

  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
  if (!rows) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (rows.length === 0) return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">지역 히트맵</h2>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6 text-[12px] text-[#1a1a1a]/40">표시할 지역 데이터가 없습니다.</div>
    </section>
  )

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-[#111110]/70">지역 히트맵</h2>
          <p className="mt-1 text-[11px] text-[#1a1a1a]/40">REV 기준 · 상위/하위 요약</p>
        </div>
        <button
          type="button"
          onClick={() => openRegionDetail()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e8e8e4] bg-white px-3 text-[12px] font-medium text-[#111110]/70 transition hover:border-[#111110]/25"
        >
          <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
          자세히 보기
          <Maximize2 className="h-3.5 w-3.5 text-[#1a1a1a]/35" aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <p className="text-[12px] font-semibold text-[#111110]">상위 지역</p>
          </div>
          {topRows.map((row, index) => (
            <CompactRegionRow key={`top-${row.region}`} row={row} rank={index + 1} onSelect={() => openRegionDetail(row)} />
          ))}
        </div>
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-rose-700" aria-hidden="true" />
            <p className="text-[12px] font-semibold text-[#111110]">관리 필요 지역</p>
          </div>
          {bottomRows.map((row, index) => (
            <CompactRegionRow key={`bottom-${row.region}`} row={row} rank={index + 1} onSelect={() => openRegionDetail(row)} />
          ))}
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="bg-white sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[17px]">
              <MapIcon className="h-4 w-4" aria-hidden="true" />
              대한민국 지역 히트맵
            </DialogTitle>
            <DialogDescription>
              지역별 목표 금액과 확정 매출 달성률을 지도 위에서 확인합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <KoreaMapHeatmap
              rows={mappedRows}
              selectedLabel={selectedRegion?.label ?? null}
              onSelect={(row) => setSelectedRegionLabel(row.label)}
            />
            <div className="space-y-3">
              <RegionDetailPanel row={selectedRegion} />
              <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                <p className="mb-2 text-[12px] font-semibold text-[#111110]">전체 순위</p>
                <div className="max-h-[340px] overflow-y-auto pr-1">
                  {sortedByProgress.map((row, index) => (
                    <CompactRegionRow key={`detail-${row.region}`} row={row} rank={index + 1} onSelect={() => openRegionDetail(row)} />
                  ))}
                </div>
              </div>
              {otherRows.length > 0 && (
                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                  <p className="mb-2 text-[12px] font-semibold text-[#111110]">지도 외 지역</p>
                  <div className="flex flex-wrap gap-2">
                    {otherRows.map((row) => (
                      <span key={row.region} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[#1a1a1a]/60">
                        {row.region} {row.progress.toFixed(0)}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
