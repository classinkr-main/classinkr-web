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
import type { Team, Period } from "../types"

interface Row {
  region: string
  target: number
  revenue: number
  progress: number
  status: "good" | "warning" | "critical"
  velocity: number
}

interface MapPoint {
  label: string
  x: number
  y: number
}

interface MapRow extends Row {
  label: string
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

const REGION_POINTS: Record<string, MapPoint> = {
  서울: { label: "서울", x: 92, y: 76 },
  인천: { label: "인천", x: 70, y: 84 },
  경기: { label: "경기", x: 96, y: 105 },
  강원: { label: "강원", x: 139, y: 76 },
  충북: { label: "충북", x: 117, y: 148 },
  충남: { label: "충남", x: 82, y: 176 },
  세종: { label: "세종", x: 98, y: 164 },
  대전: { label: "대전", x: 104, y: 192 },
  경북: { label: "경북", x: 151, y: 195 },
  대구: { label: "대구", x: 148, y: 231 },
  울산: { label: "울산", x: 171, y: 260 },
  부산: { label: "부산", x: 156, y: 288 },
  경남: { label: "경남", x: 133, y: 268 },
  전북: { label: "전북", x: 101, y: 226 },
  광주: { label: "광주", x: 86, y: 272 },
  전남: { label: "전남", x: 95, y: 292 },
  제주: { label: "제주", x: 73, y: 329 },
}

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
    const point = canonical ? REGION_POINTS[canonical] : null
    if (!canonical || !point) {
      others.push(row)
      continue
    }

    const current = mapped.get(canonical)
    if (!current) {
      mapped.set(canonical, {
        ...row,
        label: point.label,
        x: point.x,
        y: point.y,
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
      regions: [...current.regions, row.region],
    })
  }

  return {
    mappedRows: [...mapped.values()].sort((a, b) => b.target - a.target),
    otherRows: others.sort((a, b) => b.target - a.target),
  }
}

function CompactRegionRow({ row, rank }: { row: Row; rank: number }) {
  const tone = STATUS_STYLE[row.status]
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)_72px] items-center gap-3 border-t border-[#f0f0ec] py-2 first:border-t-0">
      <span className="text-[11px] text-[#1a1a1a]/35">{String(rank).padStart(2, "0")}</span>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-[#111110]">{row.region}</p>
        <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/40">₩{fmt(row.revenue)} / ₩{fmt(row.target)}</p>
      </div>
      <span className={`rounded-full px-2 py-1 text-right text-[11px] font-semibold ${tone.bg} ${tone.text}`}>
        {row.progress.toFixed(0)}%
      </span>
    </div>
  )
}

function KoreaMapHeatmap({ rows }: { rows: MapRow[] }) {
  const maxTarget = Math.max(1, ...rows.map((row) => row.target))

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-[#fbfbf8] p-3">
      <svg viewBox="0 0 240 360" className="h-[520px] w-full max-h-[70vh]" role="img" aria-label="대한민국 지역별 매출 달성률 히트맵">
        <path
          d="M111 21 C137 27 156 48 161 75 C166 100 146 114 155 136 C164 160 183 173 177 199 C171 225 153 232 158 252 C164 275 147 300 123 309 C101 317 81 304 88 282 C94 263 76 251 82 230 C88 209 104 202 100 181 C96 158 79 144 84 121 C89 99 73 88 80 67 C86 47 92 29 111 21 Z"
          fill="#eef0ea"
          stroke="#d9ddd2"
          strokeWidth="2"
        />
        <path
          d="M45 325 C61 309 94 307 112 319 C96 337 62 341 45 325 Z"
          fill="#eef0ea"
          stroke="#d9ddd2"
          strokeWidth="2"
        />
        <path d="M71 85 C91 74 113 72 132 83" fill="none" stroke="#d9ddd2" strokeWidth="1" />
        <path d="M84 136 C107 132 134 140 155 153" fill="none" stroke="#d9ddd2" strokeWidth="1" />
        <path d="M91 212 C116 207 145 214 166 228" fill="none" stroke="#d9ddd2" strokeWidth="1" />
        {rows.map((row) => {
          const tone = STATUS_STYLE[row.status]
          const radius = 8 + Math.sqrt(row.target / maxTarget) * 22
          return (
            <g key={row.label}>
              <circle cx={row.x} cy={row.y} r={radius + 5} fill={tone.fill} opacity="0.08" />
              <circle cx={row.x} cy={row.y} r={radius} fill={tone.fill} opacity="0.68" stroke="#fff" strokeWidth="2" />
              <text x={row.x} y={row.y + 4} textAnchor="middle" className="fill-white text-[10px] font-bold">
                {row.progress.toFixed(0)}
              </text>
              <text x={row.x} y={row.y + radius + 15} textAnchor="middle" className="fill-[#111110] text-[10px] font-semibold">
                {row.label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3 px-1 text-[11px] text-[#1a1a1a]/45">
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-emerald-600" />95% 이상</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-600" />75-94%</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-rose-600" />75% 미만</span>
        <span>원 크기 = 목표 금액</span>
      </div>
    </div>
  )
}

export default function RegionHeatmap({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

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
          onClick={() => setDetailOpen(true)}
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
          {topRows.map((row, index) => <CompactRegionRow key={`top-${row.region}`} row={row} rank={index + 1} />)}
        </div>
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-rose-700" aria-hidden="true" />
            <p className="text-[12px] font-semibold text-[#111110]">관리 필요 지역</p>
          </div>
          {bottomRows.map((row, index) => <CompactRegionRow key={`bottom-${row.region}`} row={row} rank={index + 1} />)}
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
            <KoreaMapHeatmap rows={mappedRows} />
            <div className="space-y-3">
              <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                <p className="mb-2 text-[12px] font-semibold text-[#111110]">전체 순위</p>
                <div className="max-h-[340px] overflow-y-auto pr-1">
                  {sortedByProgress.map((row, index) => <CompactRegionRow key={`detail-${row.region}`} row={row} rank={index + 1} />)}
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
