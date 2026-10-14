"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useVisibleInterval } from "@/components/admin/branch/use-visible-interval"
import { AlertTriangle, RefreshCw } from "lucide-react"

import { adminFetchJsonCached, clearAdminRequestCache } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import {
  KOREA_PROVINCE_LABEL_NUDGE,
  KOREA_PROVINCE_SHAPES,
  KOREA_PROVINCE_VIEWBOX,
} from "@/lib/branch/korea-province-map"
import type { CrmRegionLayer, CrmRegionLayerKey, CrmRegionMap } from "@/lib/repositories/crm-region-map"

const ENDPOINT = "/api/admin/crm/region-map"

// 뉴트럴 → 딥 포레스트 단색 램프. 넓은 면은 뉴트럴로 두고 진한 쪽에만 그린을 준다
// (파스텔 채움 지양 — DESIGN 규약). 0건 시도는 램프에 들어가지 않고 빈 칸으로 남긴다.
const RAMP: Array<[number, number, number]> = [
  [240, 240, 236],
  [200, 214, 203],
  [120, 158, 133],
  [8, 71, 52],
]

function rampColor(t: number) {
  if (!Number.isFinite(t) || t <= 0) return "#F6F5F4"
  const clamped = Math.min(1, t)
  const span = RAMP.length - 1
  const pos = clamped * span
  const i = Math.min(span - 1, Math.floor(pos))
  const f = pos - i
  const [r1, g1, b1] = RAMP[i]
  const [r2, g2, b2] = RAMP[i + 1]
  const mix = (a: number, b: number) => Math.round(a + (b - a) * f)
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`
}

/**
 * 라벨은 이름만 싣는다. 수도권은 서울·인천·경기가 붙어 있어 이름과 숫자를 겹쳐 놓으면
 * 그 구역만 읽을 수 없게 된다 — 정확한 건수는 오른쪽 순위표와 호버 툴팁이 책임진다.
 * 진한 칸 위에서는 흰색으로 뒤집고, 두 경우 모두 반대색 얇은 외곽선(paint-order)으로
 * 경계에 걸친 글자를 살린다.
 */
function labelStyle(t: number) {
  const dark = t >= 0.5
  return {
    fill: dark ? "#FFFFFF" : "rgba(26,26,26,0.72)",
    paintOrder: "stroke" as const,
    stroke: dark ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.9)",
    strokeWidth: 0.5,
  }
}

function pct(value: number) {
  return `${Math.round(value * 1000) / 10}%`
}

function LayerTab({
  layer,
  active,
  onSelect,
}: {
  layer: CrmRegionLayer
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex min-h-11 flex-1 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors sm:min-h-0 ${
        active
          ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
          : "border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4] hover:bg-[#fafaf8]"
      }`}
    >
      <span className="text-[12px] font-semibold">{layer.label}</span>
      <span className={`text-[11px] tabular-nums ${active ? "text-[#084734]" : "text-[#615D59]"}`}>
        {layer.located.toLocaleString("ko-KR")} / {layer.total.toLocaleString("ko-KR")}
        <span className="ml-1">· {pct(layer.coverage)}</span>
      </span>
    </button>
  )
}

export default function CrmRegionMapPanel() {
  const params = useSearchParams()
  const [data, setData] = useState<CrmRegionMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [layerKey, setLayerKey] = useState<CrmRegionLayerKey>(() => ["deal", "target", "lead", "customer", "compass"].includes(params.get("layer") ?? "") ? params.get("layer") as CrmRegionLayerKey : "deal")
  const [selectedRegion, setSelectedRegion] = useState<string | null>(params.get("region"))
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<CrmRegionMap>(ENDPOINT, undefined, {
      cacheKey: ENDPOINT,
      ttlMs: CRM_CACHE_TTL_MS,
      staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
      onRevalidated: ({ data: fresh }) => {
        if (alive && fresh) setData(fresh)
      },
    })
      .then((next) => {
        if (!alive) return
        setData(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "지역 분포를 불러오지 못했습니다.")
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    clearAdminRequestCache(ENDPOINT)
    try {
      const next = await adminFetchJsonCached<CrmRegionMap>(`${ENDPOINT}?force=1`, undefined, {
        cacheKey: ENDPOINT,
        ttlMs: CRM_CACHE_TTL_MS,
        force: true,
      })
      setData(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "지역 분포를 새로 계산하지 못했습니다.")
    } finally {
      setRefreshing(false)
    }
  }

  useVisibleInterval(() => { if (!refreshing) void refresh() }, 60_000)
  const select = (nextLayer: CrmRegionLayerKey, region: string | null) => {
    setLayerKey(nextLayer)
    setSelectedRegion(region)
    const next = new URLSearchParams(window.location.search)
    next.set("layer", nextLayer)
    if (region) next.set("region", region)
    else next.delete("region")
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`)
  }
  useEffect(() => {
    const nextLayer = params.get("layer")
    if (["deal", "target", "lead", "customer", "compass"].includes(nextLayer ?? "")) setLayerKey(nextLayer as CrmRegionLayerKey)
    else setLayerKey("deal")
    setSelectedRegion(params.get("region"))
  }, [params])

  const layer = useMemo(
    () => data?.layers.find((item) => item.key === layerKey) ?? data?.layers[0] ?? null,
    [data, layerKey]
  )

  const ranked = useMemo(() => {
    if (!layer) return []
    return Object.entries(layer.regions)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"))
  }, [layer])

  const max = ranked[0]?.count ?? 0
  const selected = selectedRegion && data?.provinces.includes(selectedRegion) ? selectedRegion : null
  const focusRegion = hovered ?? selected

  if (loading && !data) {
    return <div className="mb-4 h-[420px] animate-pulse rounded-2xl bg-[#f0f0ec]" />
  }

  if (error && !data) {
    return (
      <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <p className="text-[13px] text-[#615D59]">{error}</p>
        <button
          type="button"
          onClick={refresh}
          className="mt-2 inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] px-3 text-[12px] font-semibold text-[#111110] hover:bg-[#f5f5f2]"
        >
          다시 시도
        </button>
      </section>
    )
  }

  if (!data || !layer) return null

  return (
    <section className="mb-5 rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] text-[#111110]">지역별 고객·영업 분석</h2>
          <p className="mt-1 text-[12px] text-[#615D59]">
            17개 시도 · {layer.unit} · 1분 자동 갱신 · 지역을 선택해 원천별 건수를 비교하세요
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {data.layers.map((item) => (
          <LayerTab
            key={item.key}
            layer={item}
            active={item.key === layer.key}
            onSelect={() => select(item.key, selected)}
          />
        ))}
      </div>

      {/* 분모를 숨기지 않는다 — 커버리지가 낮은 레이어는 '분포'가 아니라 '표본'이다. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[#f0f0ec] bg-[#fafaf8] px-3 py-2 text-[12px]">
        <span className="text-[#615D59]">
          지역 확인 <strong className="font-semibold tabular-nums text-[#111110]">{layer.located.toLocaleString("ko-KR")}</strong>
        </span>
        <span className="text-[#615D59]">
          지역 미상 <strong className="font-semibold tabular-nums text-[#111110]">{layer.unknown.toLocaleString("ko-KR")}</strong>
        </span>
        {layer.nonGeo > 0 ? (
          <span className="text-[#615D59]">
            비지역(온라인·해외) <strong className="font-semibold tabular-nums text-[#111110]">{layer.nonGeo.toLocaleString("ko-KR")}</strong>
          </span>
        ) : null}
        {layer.coverage < 0.5 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[11px] font-semibold text-[#7A520F]">
            <AlertTriangle className="h-3 w-3" />
            커버리지 {pct(layer.coverage)} — 분포가 아니라 표본입니다
          </span>
        ) : null}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        {/* items-start가 없으면 그리드가 오른쪽 순위표 높이에 맞춰 SVG를 늘여
            (preserveAspectRatio 기본값 탓에) 지도가 위아래로 레터박스된 채 작아진다. */}
        <div className="relative flex justify-center">
          <svg
            viewBox={KOREA_PROVINCE_VIEWBOX}
            role="group"
            aria-label={`${layer.label} 시도별 분포 지도`}
            className="h-auto w-full max-w-[460px]"
          >
            {KOREA_PROVINCE_SHAPES.map((shape) => {
              const count = layer.regions[shape.label] ?? 0
              const t = max > 0 ? count / max : 0
              const isHovered = focusRegion === shape.label
              return (
                <path
                  key={shape.label}
                  d={shape.path}
                  fill={rampColor(t)}
                  stroke={isHovered ? "#111110" : "#FFFFFF"}
                  strokeWidth={isHovered ? 0.6 : 0.3}
                  role="button"
                  tabIndex={0}
                  aria-label={`${shape.label} ${count.toLocaleString("ko-KR")}건 비교`}
                  aria-pressed={selected === shape.label}
                  onClick={() => select(layer.key, shape.label === selected ? null : shape.label)}
                  onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(layer.key, shape.label === selected ? null : shape.label) } }}
                  onFocus={() => setHovered(shape.label)}
                  onBlur={() => setHovered(null)}
                  onMouseEnter={() => setHovered(shape.label)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <title>{`${shape.label} · ${count.toLocaleString("ko-KR")}`}</title>
                </path>
              )
            })}
            {/* 라벨은 도형 전체를 그린 뒤 한 층 위에 올린다 — 인접 도형이 나중에 그려지며
                라벨을 덮는 일이 없게 한다. */}
            <g pointerEvents="none">
              {KOREA_PROVINCE_SHAPES.map((shape) => {
                const count = layer.regions[shape.label] ?? 0
                const t = max > 0 ? count / max : 0
                const nudge = KOREA_PROVINCE_LABEL_NUDGE[shape.label] ?? { dx: 0, dy: 0 }
                return (
                  <text
                    key={shape.label}
                    x={shape.x + nudge.dx}
                    y={shape.y + nudge.dy}
                    textAnchor="middle"
                    fontSize={2.9}
                    fontWeight={700}
                    opacity={focusRegion && focusRegion !== shape.label ? 0.5 : 1}
                    style={labelStyle(t)}
                  >
                    {shape.label}
                  </text>
                )
              })}
            </g>
          </svg>
          {focusRegion ? (
            <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[12px] shadow-sm">
              <span className="font-semibold text-[#111110]">{focusRegion}</span>
              <span className="ml-2 font-semibold tabular-nums text-[#084734]">
                {(layer.regions[focusRegion] ?? 0).toLocaleString("ko-KR")}
              </span>
              <span className="ml-1 text-[#615D59]">{layer.unit}</span>
            </div>
          ) : null}
        </div>

        <div>
      {selected ? (
        <section aria-label={`${selected} 원천별 비교`} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-[#111110]">{selected} · 원천별 비교</h3>
            <button type="button" onClick={() => select(layer.key, null)} className="min-h-11 text-[12px] font-medium text-[#615D59] underline">선택 해제</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {data.layers.map(item => <div key={item.key} className="border-t border-[#e8e8e4] py-3"><p className="text-[12px] text-[#615D59]">{item.label}</p><p className="mt-1 text-[24px] font-semibold tabular-nums text-[#111110]">{(item.regions[selected] ?? 0).toLocaleString("ko-KR")}<span className="ml-1 text-[12px]">건</span></p><p className="mt-1 text-[12px] text-[#615D59]">확인된 지역 중 {pct(item.located ? (item.regions[selected] ?? 0) / item.located : 0)}</p></div>)}
          </div>
          <p className="text-[12px] text-[#615D59]">원천 간 같은 고객이 겹칠 수 있어 건수를 합산하지 않습니다.</p>
          <Link href={`/admin/crm/customers/unified?q=${encodeURIComponent(selected)}`} className="mt-2 inline-flex min-h-11 items-center text-[13px] font-semibold text-[#084734]">고객DB에서 {selected} 검색 →</Link>
        </section>
      ) : null}

          <div hidden={Boolean(selected)}>
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-[#615D59]">
            <span>시도</span>
            <span>{layer.unit}</span>
          </div>
          {ranked.length === 0 ? (
            <p className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[12px] text-[#615D59]">
              지역이 확인된 건이 없습니다.
            </p>
          ) : (
            <ul className="space-y-1">
              {ranked.map((row) => (
                <li
                  key={row.label}
                  onMouseEnter={() => setHovered(row.label)}
                  onMouseLeave={() => setHovered(null)}
                  className={`relative overflow-hidden rounded-lg  transition-colors ${
                    focusRegion === row.label ? "bg-[#f0f0ec]" : ""
                  }`}
                >
                  <button type="button" aria-pressed={selected === row.label} onClick={() => select(layer.key, selected === row.label ? null : row.label)} className="relative block min-h-11 w-full px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-[#084734]">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-lg bg-[#ECFDF5]"
                    style={{ width: `${max > 0 ? (row.count / max) * 100 : 0}%` }}
                  />
                  <span className="relative flex items-center justify-between text-[12.5px]">
                    <span className="font-medium text-[#111110]">{row.label}</span>
                    <span className="font-semibold tabular-nums text-[#111110]">
                      {row.count.toLocaleString("ko-KR")}
                    </span>
                  </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>
      </div>

      {error ? <p role="status" className="mt-3 text-[13px] text-[#B43E3E]">{error} · 최근 확인한 분포를 유지합니다.</p> : null}
      {layer.notes.length > 0 ? (
        <ul className="mt-4 space-y-1 border-t border-[#f0f0ec] pt-3">
          {layer.notes.map((note) => (
            <li key={note} className="text-[11.5px] leading-relaxed text-[#615D59]">
              · {note}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
