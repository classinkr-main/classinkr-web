"use client"
import { ArrowDownRight, ArrowUpRight, Map as MapIcon, Maximize2 } from "lucide-react"
import Image from "next/image"
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
  xPct: number
  yPct: number
}

interface MapRow extends Row {
  label: string
  xPct: number
  yPct: number
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
  서울: { label: "서울", xPct: 34.8, yPct: 21.6 },
  인천: { label: "인천", xPct: 28.2, yPct: 22.8 },
  경기: { label: "경기", xPct: 38.3, yPct: 24.2 },
  강원: { label: "강원", xPct: 59.8, yPct: 19.8 },
  충북: { label: "충북", xPct: 48.4, yPct: 34.9 },
  충남: { label: "충남", xPct: 35.7, yPct: 38.7 },
  세종: { label: "세종", xPct: 41.2, yPct: 39.5 },
  대전: { label: "대전", xPct: 42.0, yPct: 43.1 },
  경북: { label: "경북", xPct: 63.0, yPct: 44.2 },
  대구: { label: "대구", xPct: 61.2, yPct: 54.1 },
  울산: { label: "울산", xPct: 78.5, yPct: 61.2 },
  부산: { label: "부산", xPct: 72.8, yPct: 67.2 },
  경남: { label: "경남", xPct: 57.7, yPct: 63.4 },
  전북: { label: "전북", xPct: 41.4, yPct: 55.8 },
  광주: { label: "광주", xPct: 34.9, yPct: 66.7 },
  전남: { label: "전남", xPct: 36.6, yPct: 73.8 },
  제주: { label: "제주", xPct: 29.7, yPct: 91.2 },
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
        xPct: point.xPct,
        yPct: point.yPct,
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
      <div className="relative mx-auto aspect-[947/1660] max-h-[70vh] w-full max-w-[520px] overflow-hidden rounded-xl bg-[#fbfbf8]" role="img" aria-label="대한민국 지역별 매출 달성률 히트맵">
        {/* Generated dashboard map asset. Heatmap layers stay code-rendered for data accuracy. */}
        <Image
          src="/images/admin/south-korea-heatmap-base.png"
          alt=""
          aria-hidden
          fill
          sizes="(min-width: 1024px) 560px, 100vw"
          className="absolute inset-0 h-full w-full object-contain"
        />
        {rows.map((row) => {
          const tone = STATUS_STYLE[row.status]
          const heatSize = 78 + Math.sqrt(row.target / maxTarget) * 110
          const heatOpacity = row.status === "good" ? 0.24 : row.status === "warning" ? 0.3 : 0.34
          return (
            <div
              key={`heat-${row.label}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${row.xPct}%`,
                top: `${row.yPct}%`,
                width: heatSize,
                height: heatSize,
                background: `radial-gradient(circle, ${tone.fill} 0%, ${tone.fill} 42%, transparent 72%)`,
                filter: "blur(8px)",
                mixBlendMode: "multiply",
                opacity: heatOpacity,
              }}
            />
          )
        })}
        {rows.map((row) => {
          const tone = STATUS_STYLE[row.status]
          const size = 18 + Math.sqrt(row.target / maxTarget) * 28
          return (
            <div
              key={`marker-${row.label}`}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${row.xPct}%`, top: `${row.yPct}%` }}
            >
              <div
                className="flex items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-[0_8px_18px_rgba(17,17,16,0.16)]"
                style={{ width: size, height: size, backgroundColor: tone.fill }}
                title={`${row.label}: ${row.progress.toFixed(0)}%`}
              >
                {row.progress.toFixed(0)}
              </div>
              <span className="mt-1 rounded-full bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-[#111110] shadow-sm">
                {row.label}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 px-1 text-[11px] text-[#1a1a1a]/45">
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-emerald-600" />95% 이상</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-600" />75-94%</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-rose-600" />75% 미만</span>
        <span>열감 크기 = 목표 금액</span>
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
