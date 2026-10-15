"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useVisibleInterval } from "@/components/admin/branch/use-visible-interval"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react"

import { adminFetchJsonCached, clearAdminRequestCache } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import {
  KOREA_PROVINCE_LABEL_NUDGE,
  KOREA_PROVINCE_SHAPES,
  KOREA_PROVINCE_VIEWBOX,
} from "@/lib/branch/korea-province-map"
import { scopeRegionLayer } from "@/lib/crm/region-map-summary"
import { useCrmOwners } from "@/components/admin/crm/useCrmOwners"
import type {
  CrmRegionCustomerItem,
  CrmRegionLayer,
  CrmRegionLayerKey,
  CrmRegionMap,
} from "@/lib/repositories/crm-region-map"

const ENDPOINT = "/api/admin/crm/region-map"
const CACHE_KEY = `${ENDPOINT}:owner-scope-v1`
const CURRENT_OWNER_VALUE = "__me"

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
    fill: dark ? "#FFFFFF" : "rgba(26,26,26,0.78)",
    paintOrder: "stroke" as const,
    stroke: dark ? "rgba(0,0,0,0.32)" : "rgba(255,255,255,0.92)",
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
  const { currentOwner, owners: crmOwners } = useCrmOwners()

  const [data, setData] = useState<CrmRegionMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [layerKey, setLayerKey] = useState<CrmRegionLayerKey>(() =>
    ["deal", "target", "lead", "customer", "compass"].includes(params.get("layer") ?? "")
      ? (params.get("layer") as CrmRegionLayerKey)
      : "deal"
  )
  const [selectedRegion, setSelectedRegion] = useState<string | null>(params.get("region"))
  const [hovered, setHovered] = useState<string | null>(null)

  // 담당자 필터: URL에 없으면 로그인한 사용자(CURRENT_OWNER_VALUE)를 디폴트로 잡는다
  const ownerParam = params.get("owner")?.trim()
  const [owner, setOwner] = useState<string>(() => ownerParam ?? "")
  const defaultOwnerAppliedRef = useRef(false)

  useEffect(() => {
    if (defaultOwnerAppliedRef.current) return
    if (!params.has("owner") && currentOwner && !owner) {
      defaultOwnerAppliedRef.current = true
      setOwner(CURRENT_OWNER_VALUE)
    }
  }, [currentOwner, params, owner])

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<CrmRegionMap>(ENDPOINT, undefined, {
      cacheKey: CACHE_KEY,
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
        cacheKey: CACHE_KEY,
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

  useVisibleInterval(() => {
    if (!refreshing) void refresh()
  }, 60_000)

  const select = (nextLayer: CrmRegionLayerKey, region: string | null, nextOwner = owner) => {
    setLayerKey(nextLayer)
    setSelectedRegion(region)
    const next = new URLSearchParams(window.location.search)
    next.set("layer", nextLayer)
    if (region) next.set("region", region)
    else next.delete("region")
    if (nextOwner) next.set("owner", nextOwner)
    else next.delete("owner")
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`)
  }

  const handleOwnerChange = (newOwner: string) => {
    setOwner(newOwner)
    select(layerKey, selectedRegion, newOwner)
  }

  useEffect(() => {
    const nextLayer = params.get("layer")
    if (["deal", "target", "lead", "customer", "compass"].includes(nextLayer ?? "")) {
      setLayerKey(nextLayer as CrmRegionLayerKey)
    } else {
      setLayerKey("deal")
    }
    setSelectedRegion(params.get("region"))
    const pOwner = params.get("owner")
    if (pOwner != null) setOwner(pOwner)
  }, [params])

  const sourceLayer = useMemo(
    () => data?.layers.find((item) => item.key === layerKey) ?? data?.layers[0] ?? null,
    [data, layerKey]
  )

  // 현재 활성 담당자 키/이름 계산
  const effectiveOwnerName = useMemo(() => {
    if (!owner || owner === "all") return null
    if (owner === CURRENT_OWNER_VALUE) {
      return currentOwner?.displayName ?? null
    }
    return owner
  }, [owner, currentOwner])

  const ownerNames = useMemo(() => {
    if (!effectiveOwnerName) return null
    const profile = owner === CURRENT_OWNER_VALUE ? currentOwner : crmOwners.find(item =>
      [item.displayName, item.ownerKey, ...item.ownerAliases].some(name => name.trim().toLowerCase() === effectiveOwnerName.trim().toLowerCase()))
    return profile ? [profile.displayName, profile.ownerKey, ...profile.ownerAliases, ...(profile.neoOwnerId ? [profile.neoOwnerId] : [])] : [effectiveOwnerName]
  }, [effectiveOwnerName, owner, currentOwner, crmOwners])
  const layer = useMemo(() => sourceLayer ? scopeRegionLayer(sourceLayer, ownerNames) : null, [sourceLayer, ownerNames])
  const displayRegions = useMemo(() => layer?.regions ?? {}, [layer])

  // 순위 목록
  const ranked = useMemo(() => {
    if (!data?.provinces) return []
    return data.provinces
      .map((label) => ({
        label,
        count: displayRegions[label] ?? 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"))
  }, [data?.provinces, displayRegions])

  const max = ranked[0]?.count ?? 0
  const totalLocated = useMemo(
    () => Object.values(displayRegions).reduce((acc, v) => acc + v, 0),
    [displayRegions]
  )

  const selected =
    selectedRegion && data?.provinces.includes(selectedRegion) ? selectedRegion : null
  const focusRegion = hovered ?? selected

  // 지도·커버리지·고객 목록은 같은 원천과 담당자 범위를 사용한다.
  const topCustomers = useMemo<CrmRegionCustomerItem[]>(() =>
    selected ? layer?.topCustomersByRegion?.[selected] ?? [] : [], [selected, layer])
  const nationalTopCustomers = useMemo<CrmRegionCustomerItem[]>(() =>
    Object.values(layer?.topCustomersByRegion ?? {}).flat()
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"))
      .slice(0, 5), [layer])

  // 선택된 시도의 순위와 비중
  const selectedRankInfo = useMemo(() => {
    if (!selected) return null
    const index = ranked.findIndex((item) => item.label === selected)
    const count = displayRegions[selected] ?? 0
    const rank = index >= 0 ? index + 1 : null
    const share = totalLocated > 0 ? count / totalLocated : 0
    return { rank, count, share }
  }, [selected, ranked, displayRegions, totalLocated])

  if (loading && !data) {
    return <div className="mb-4 h-[520px] animate-pulse rounded-2xl bg-[#f0f0ec]" />
  }

  if (error && !data) {
    return (
      <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-5">
        <p className="text-[13px] text-[#615D59]">{error}</p>
        <button
          type="button"
          onClick={refresh}
          className="mt-3 inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] px-3 text-[12px] font-semibold text-[#111110] hover:bg-[#f5f5f2]"
        >
          다시 시도
        </button>
      </section>
    )
  }

  if (!data || !layer) return null

  return (
    <section className="mb-6 rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-6 shadow-sm">
      {/* ─── 상단 헤더: 타이틀, 담당자 필터, 새로고침 ─── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[19px] font-bold tracking-[-0.02em] text-[#111110]">
              지역별 고객·영업 분석
            </h2>
            <span className="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-semibold text-[#084734]">
              17개 시도 실시간
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-[#615D59]">
            {effectiveOwnerName
              ? `${effectiveOwnerName} 담당 · ${layer.label} · 지역 확인 ${totalLocated.toLocaleString("ko-KR")}건`
              : `전국 ${layer.label} 기준 · ${layer.unit} · 지역을 클릭하면 상세 고객 순위를 확인합니다`}
          </p>
        </div>

        {/* 담당자 필터 & 새로고침 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 내 담당 칩 (디폴트) */}
          {currentOwner ? (
            <button
              type="button"
              onClick={() => handleOwnerChange(owner === CURRENT_OWNER_VALUE ? "all" : CURRENT_OWNER_VALUE)}
              aria-pressed={owner === CURRENT_OWNER_VALUE}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition-all ${
                owner === CURRENT_OWNER_VALUE
                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734] shadow-xs"
                  : "border-[#e8e8e4] bg-white text-[#615D59] hover:border-[#c8c8c4] hover:bg-[#fafaf8]"
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>내 담당</span>
              <span className="text-[11px] opacity-75">({currentOwner.displayName})</span>
            </button>
          ) : null}

          {/* 전체 담당자 칩 */}
          <button
            type="button"
            onClick={() => handleOwnerChange("all")}
            aria-pressed={!owner || owner === "all"}
            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[12px] font-semibold transition-all ${
              !owner || owner === "all"
                ? "border-[#084734] bg-[#084734] text-white"
                : "border-[#e8e8e4] bg-white text-[#615D59] hover:border-[#c8c8c4] hover:bg-[#fafaf8]"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>전체 담당자</span>
          </button>

          {/* 담당자 드롭다운 */}
          {crmOwners.length > 0 ? (
            <select
              aria-label="담당자 선택"
              value={owner === CURRENT_OWNER_VALUE ? CURRENT_OWNER_VALUE : owner}
              onChange={(e) => handleOwnerChange(e.target.value)}
              className="h-8 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-medium text-[#111110] focus-visible:outline-2 focus-visible:outline-[#084734]"
            >
              <option value="all">전체 담당자</option>
              {currentOwner ? (
                <option value={CURRENT_OWNER_VALUE}>
                  내 담당 · {currentOwner.displayName}
                </option>
              ) : null}
              {crmOwners.map((opt) => (
                <option key={opt.ownerKey} value={opt.displayName}>
                  {opt.displayName} ({opt.teamRoleLabel})
                </option>
              ))}
            </select>
          ) : null}

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
      </div>

      {/* ─── 레이어 탭 (거래, 타깃, 리드, 고객, Compass) ─── */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {data.layers.map((item) => (
          <LayerTab
            key={item.key}
            layer={scopeRegionLayer(item, ownerNames)}
            active={item.key === layer.key}
            onSelect={() => select(item.key, selected)}
          />
        ))}
      </div>

      {/* ─── 커버리지 정보 바 ─── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-xl border border-[#f0f0ec] bg-[#fafaf8] px-3.5 py-2.5 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#615D59]">
          <span>
            지역 확인 <strong className="font-semibold tabular-nums text-[#111110]">{layer.located.toLocaleString("ko-KR")}</strong>건
          </span>
          <span>
            지역 미상 <strong className="font-semibold tabular-nums text-[#111110]">{layer.unknown.toLocaleString("ko-KR")}</strong>건
          </span>
          {layer.nonGeo > 0 ? (
            <span>
              비지역(온라인·해외) <strong className="font-semibold tabular-nums text-[#111110]">{layer.nonGeo.toLocaleString("ko-KR")}</strong>건
            </span>
          ) : null}
        </div>

        {layer.coverage < 0.5 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2.5 py-0.5 text-[11px] font-semibold text-[#7A520F]">
            <AlertTriangle className="h-3 w-3" />
            커버리지 {pct(layer.coverage)} — 표본 데이터
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#084734]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            지역 커버리지 {pct(layer.coverage)}
          </span>
        )}
      </div>

      {/* ─── 메인 뷰: 대형 지도 (좌) + 순위 & 해당 고객 순위 (우) ─── */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(380px,1fr)] xl:grid-cols-[minmax(0,1.4fr)_minmax(420px,1fr)]">
        {/* [좌측] 대형 인터랙티브 한반도 지도 */}
        <div className="relative flex flex-col items-center justify-center rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4 sm:p-6 min-h-[500px]">
          {/* 플로팅 인터랙티브 헤더 배너 */}
          {focusRegion ? (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 z-10 flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white/95 px-3.5 py-1.5 shadow-md backdrop-blur-sm">
              <MapPin className="h-4 w-4 text-[#084734]" />
              <span className="font-bold text-[#111110]">{focusRegion}</span>
              <span className="font-bold tabular-nums text-[#084734]">
                {(displayRegions[focusRegion] ?? 0).toLocaleString("ko-KR")}
              </span>
              <span className="text-[11px] text-[#615D59]">
                {effectiveOwnerName ? "건 (선택 담당자)" : layer.unit}
              </span>
              {selected === focusRegion ? (
                <span className="ml-1 rounded-sm bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] font-semibold text-[#084734]">
                  선택됨
                </span>
              ) : null}
            </div>
          ) : (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 z-10 rounded-xl border border-[#e8e8e4]/60 bg-white/80 px-3 py-1 text-[11.5px] text-[#615D59] shadow-xs">
              지도의 시도를 클릭하여 지역별 고객 순위를 확인하세요
            </div>
          )}

          {/* 대형 지도 SVG (충분한 너비와 선명한 가독성) */}
          <div className="w-full flex justify-center py-2">
            <svg
              viewBox={KOREA_PROVINCE_VIEWBOX}
              role="group"
              aria-label={`${layer.label} 시도별 분포 지도`}
              className="h-auto w-full max-w-[580px] max-h-[640px] drop-shadow-sm select-none"
            >
              {KOREA_PROVINCE_SHAPES.map((shape) => {
                const count = displayRegions[shape.label] ?? 0
                const t = max > 0 ? count / max : 0
                const isHovered = focusRegion === shape.label
                const isSelected = selected === shape.label

                return (
                  <path
                    key={shape.label}
                    d={shape.path}
                    fill={rampColor(t)}
                    stroke={isSelected ? "#084734" : isHovered ? "#111110" : "#FFFFFF"}
                    strokeWidth={isSelected ? 1.4 : isHovered ? 0.8 : 0.35}
                    role="button"
                    tabIndex={0}
                    aria-label={`${shape.label} ${count.toLocaleString("ko-KR")}건 비교`}
                    aria-pressed={isSelected}
                    className="cursor-pointer transition-all duration-150 hover:opacity-95"
                    onClick={() => select(layer.key, isSelected ? null : shape.label)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        select(layer.key, isSelected ? null : shape.label)
                      }
                    }}
                    onFocus={() => setHovered(shape.label)}
                    onBlur={() => setHovered(null)}
                    onMouseEnter={() => setHovered(shape.label)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <title>{`${shape.label} · ${count.toLocaleString("ko-KR")}건`}</title>
                  </path>
                )
              })}

              {/* 시도 라벨 */}
              <g pointerEvents="none">
                {KOREA_PROVINCE_SHAPES.map((shape) => {
                  const count = displayRegions[shape.label] ?? 0
                  const t = max > 0 ? count / max : 0
                  const nudge = KOREA_PROVINCE_LABEL_NUDGE[shape.label] ?? { dx: 0, dy: 0 }
                  const isSelected = selected === shape.label
                  const isHovered = focusRegion === shape.label

                  return (
                    <text
                      key={shape.label}
                      x={shape.x + nudge.dx}
                      y={shape.y + nudge.dy}
                      textAnchor="middle"
                      fontSize={isSelected ? 3.3 : 2.9}
                      fontWeight={isSelected || isHovered ? 800 : 700}
                      opacity={focusRegion && focusRegion !== shape.label ? 0.6 : 1}
                      style={labelStyle(t)}
                    >
                      {shape.label}
                    </text>
                  )
                })}
              </g>
            </svg>
          </div>

          {/* 지도 하단: 범례 및 팁 */}
          <div className="mt-2 flex w-full flex-wrap items-center justify-between gap-2 border-t border-[#f0f0ec] pt-3 text-[11px] text-[#615D59]">
            <div className="flex items-center gap-1.5">
              <span>적음</span>
              <div className="flex h-2.5 w-24 overflow-hidden rounded-md border border-[#e8e8e4]">
                <div className="flex-1 bg-[#F6F5F4]" />
                <div className="flex-1 bg-[#C8D6CB]" />
                <div className="flex-1 bg-[#789E85]" />
                <div className="flex-1 bg-[#084734]" />
              </div>
              <span>많음</span>
            </div>
            {selected ? (
              <button
                type="button"
                onClick={() => select(layer.key, null)}
                className="inline-flex items-center gap-1 font-medium text-[#084734] hover:underline"
              >
                <X className="h-3 w-3" />
                선택 해제 (전체 시도 보기)
              </button>
            ) : (
              <span>시도를 선택하면 해당 고객 순위가 우측에 표시됩니다</span>
            )}
          </div>
        </div>

        {/* [우측] 시도 순위 및 해당 고객 순위 패널 */}
        <div className="flex flex-col gap-4">
          {/* ─── (A) 특정 시도 선택 상태 ─── */}
          {selected ? (
            <div className="space-y-4">
              {/* 시도 히어로 카드 */}
              <div className="rounded-2xl border border-[#084734]/20 bg-[#ECFDF5]/50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[#084734] px-2 py-0.5 text-[11px] font-bold text-white">
                        {selectedRankInfo?.rank ? `전국 ${selectedRankInfo.rank}위` : "선택됨"}
                      </span>
                      <h3 className="text-[18px] font-bold text-[#111110]">{selected}</h3>
                    </div>
                    <p className="mt-1 text-[13px] text-[#084734] font-medium">
                      총 <strong className="text-[17px] font-bold tabular-nums">{(displayRegions[selected] ?? 0).toLocaleString("ko-KR")}</strong>건
                      <span className="ml-1 text-[12px] opacity-80">
                        (전체의 {pct(selectedRankInfo?.share ?? 0)})
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => select(layer.key, null)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-medium text-[#615D59] hover:bg-[#fafaf8]"
                  >
                    <X className="h-3.5 w-3.5" />
                    전체 보기
                  </button>
                </div>

                {/* 5대 원천별 건수 미니 비교 */}
                <div role="group" aria-label="선택 지역 원천별 건수" className="mt-3 grid grid-cols-2 gap-2 border-t border-[#084734]/10 pt-3 sm:grid-cols-3">
                  {data.layers.map((item) => (
                    <div key={item.key} className="rounded-lg bg-white/80 p-2 text-left border border-black/5">
                      <p className="text-[11px] text-[#615D59]">{item.label}</p>
                      <p className="text-[15px] font-bold tabular-nums text-[#111110]">
                        {(scopeRegionLayer(item, ownerNames).regions[selected] ?? 0).toLocaleString("ko-KR")}
                        <span className="ml-0.5 text-[11px] font-normal text-[#615D59]">건</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ★ 핵심: 해당 지역 고객 순위 (Top Customers) ★ */}
              <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-[#084734]" />
                    <h4 className="text-[14px] font-bold text-[#111110]">
                      {selected} 주요 고객 순위
                    </h4>
                  </div>
                  <span className="text-[11px] text-[#615D59]">
                    {topCustomers.length > 0 ? `상위 ${topCustomers.length}곳` : "기록 없음"}
                  </span>
                </div>

                {topCustomers.length === 0 ? (
                  <div className="rounded-xl bg-[#fafaf8] py-8 text-center text-[12.5px] text-[#615D59]">
                    <Building2 className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    {effectiveOwnerName
                      ? `${effectiveOwnerName} 담당으로 확인된 ${selected} 지역 고객이 없습니다.`
                      : `${selected} 지역에 확인된 주요 고객 정보가 없습니다.`}
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                    {topCustomers.map((cust, idx) => (
                      <Link
                        key={`${cust.id}-${idx}`}
                        href={`/admin/crm/customers/unified?q=${encodeURIComponent(cust.name)}`}
                        className="group flex items-center justify-between rounded-xl border border-[#f0f0ec] bg-[#fafaf8] p-2.5 transition-all hover:border-[#084734]/30 hover:bg-white hover:shadow-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* 순위 배지 */}
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                              idx === 0
                                ? "bg-[#084734] text-white"
                                : idx < 3
                                ? "bg-[#ECFDF5] text-[#084734]"
                                : "bg-[#f0f0ec] text-[#615D59]"
                            }`}
                          >
                            {idx + 1}
                          </span>

                          {/* 고객사명 & 담당자 */}
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[#111110] group-hover:text-[#084734]">
                              {cust.name}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#615D59]">
                              {cust.manager ? (
                                <span className="inline-flex items-center gap-0.5 rounded-sm bg-white px-1.5 py-0.2 border border-[#e8e8e4]">
                                  <User className="h-2.5 w-2.5" />
                                  {cust.manager}
                                </span>
                              ) : null}
                              {cust.status ? <span>· {cust.status}</span> : null}
                              {cust.detail ? <span>· {cust.detail}</span> : null}
                            </div>
                          </div>
                        </div>

                        {/* 우측: 건수 칩 & 화살표 */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded-md bg-white border border-[#e8e8e4] px-2 py-0.5 text-[12px] font-bold tabular-nums text-[#084734]">
                            {cust.count}건
                          </span>
                          <ChevronRight className="h-4 w-4 text-[#A39E98] group-hover:text-[#084734]" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* 하단 통합 바로가기 액션 */}
                <div className="mt-3.5 flex flex-wrap gap-2 border-t border-[#f0f0ec] pt-3">
                  <Link
                    href={`/admin/crm/customers/unified?q=${encodeURIComponent(selected)}`}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-white"
                  >
                    <Search className="h-3.5 w-3.5 text-[#084734]" />
                    고객DB에서 {selected} 검색
                  </Link>
                  <Link
                    href={`/admin/crm/customers/leads?branch=${encodeURIComponent(selected)}`}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3 text-[12px] font-semibold text-[#615D59] transition-colors hover:bg-white"
                  >
                    리드 보드 보기 →
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            /* ─── (B) 시도 미선택 상태: 시도별 순위표 ─── */
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-[#084734]" />
                    <h3 className="text-[14px] font-bold text-[#111110]">
                      시도별 순위 (전국 17개 시도)
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#615D59]">
                    {effectiveOwnerName ? `${effectiveOwnerName} 기준` : layer.unit}
                  </span>
                </div>

                {ranked.length === 0 ? (
                  <p className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[12px] text-[#615D59]">
                    지역이 확인된 건이 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                    {ranked.map((row, index) => {
                      const share = totalLocated > 0 ? (row.count / totalLocated) * 100 : 0
                      const isFocused = focusRegion === row.label

                      return (
                        <li
                          key={row.label}
                          onMouseEnter={() => setHovered(row.label)}
                          onMouseLeave={() => setHovered(null)}
                          className={`relative overflow-hidden rounded-xl transition-all ${
                            isFocused ? "ring-2 ring-[#084734]/30" : ""
                          }`}
                        >
                          <button
                            type="button"
                            aria-pressed={selected === row.label}
                            onClick={() => select(layer.key, row.label)}
                            className="relative block min-h-10 w-full px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-[#084734]"
                          >
                            {/* 막대 그래프 프로그레스 배경 */}
                            <span
                              aria-hidden
                              className="absolute inset-y-0 left-0 rounded-xl bg-[#ECFDF5] transition-all"
                              style={{ width: `${max > 0 ? (row.count / max) * 100 : 0}%` }}
                            />

                            <span className="relative flex items-center justify-between text-[13px]">
                              <span className="flex items-center gap-2">
                                <span
                                  className={`flex h-5 w-5 items-center justify-center rounded-md text-[10.5px] font-bold ${
                                    index === 0
                                      ? "bg-[#084734] text-white"
                                      : index < 3
                                      ? "bg-[#084734]/15 text-[#084734]"
                                      : "bg-[#f0f0ec] text-[#615D59]"
                                  }`}
                                >
                                  {index + 1}
                                </span>
                                <span className="font-semibold text-[#111110]">{row.label}</span>
                              </span>

                              <span className="flex items-center gap-2 font-semibold tabular-nums text-[#111110]">
                                <span>{row.count.toLocaleString("ko-KR")}건</span>
                                <span className="text-[11px] font-normal text-[#615D59] w-12 text-right">
                                  {share.toFixed(1)}%
                                </span>
                                <ChevronRight className="h-3.5 w-3.5 text-[#A39E98]" />
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* 전국 상위 고객 Top 5 미리보기 */}
              {nationalTopCustomers.length > 0 ? (
                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[12.5px] font-bold text-[#111110]">
                      전국 주요 상위 고객 미리보기
                    </span>
                    <span className="text-[11px] text-[#615D59]">대표 5곳</span>
                  </div>
                  <div className="space-y-1">
                    {nationalTopCustomers.map((cust, idx) => (
                      <Link
                        key={`nat-${cust.id}-${idx}`}
                        href={`/admin/crm/customers/unified?q=${encodeURIComponent(cust.name)}`}
                        className="flex items-center justify-between rounded-lg bg-white p-2 text-[12px] border border-[#f0f0ec] hover:border-[#084734]/30"
                      >
                        <span className="font-medium text-[#111110] truncate max-w-[200px]">
                          {cust.name}
                        </span>
                        <span className="text-[11px] text-[#615D59] flex items-center gap-1.5">
                          <span className="rounded-xs bg-[#f0f0ec] px-1.5 py-0.2 text-[10px]">
                            {cust.region}
                          </span>
                          <strong className="font-semibold text-[#084734]">
                            {cust.count}건
                          </strong>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {error ? (
        <p role="status" className="mt-3 text-[13px] text-[#B43E3E]">
          {error} · 최근 확인한 분포를 유지합니다.
        </p>
      ) : null}

      {layer.notes.length > 0 ? (
        <ul className="mt-5 space-y-1 border-t border-[#f0f0ec] pt-3">
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
