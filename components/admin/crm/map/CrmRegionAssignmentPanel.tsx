"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2, MapPinned } from "lucide-react"

import { adminFetchJson, adminFetchJsonCached, clearAdminRequestCache } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import { useCrmOwners } from "@/components/admin/crm/useCrmOwners"
import type { CrmRegionAssignmentList } from "@/lib/repositories/crm-region-assignments"
import type { CrmRegionMap } from "@/lib/repositories/crm-region-map"

const ASSIGNMENTS_URL = "/api/admin/crm/region-assignments"
const REGION_MAP_URL = "/api/admin/crm/region-map"

/**
 * 지역 분배 — 시도 하나에 담당자 하나.
 *
 * 리드·거래 건수를 같은 줄에 두는 이유: 배정의 목적은 지도를 칠하는 게 아니라 "일이 있는
 * 지역에 사람이 있는가"를 보는 것이다. 리드가 있는데 담당이 없는 줄이 이 화면의 결론이다.
 *
 * 지역 건수는 지도 패널과 **같은 cacheKey**로 읽는다 — 같은 화면에서 같은 집계를 두 번
 * 요청하지 않고, 지도와 표가 어긋난 숫자를 보여줄 일도 없다.
 */
export default function CrmRegionAssignmentPanel() {
  const { owners } = useCrmOwners()
  const [data, setData] = useState<CrmRegionAssignmentList | null>(null)
  const [counts, setCounts] = useState<CrmRegionMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingRegion, setSavingRegion] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await adminFetchJsonCached<CrmRegionAssignmentList>(ASSIGNMENTS_URL, undefined, {
        cacheKey: ASSIGNMENTS_URL,
        ttlMs: CRM_CACHE_TTL_MS,
        staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
        onRevalidated: ({ data: fresh }) => {
          if (fresh) setData(fresh)
        },
      })
      setData(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "지역 분배를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<CrmRegionMap>(REGION_MAP_URL, undefined, {
      cacheKey: REGION_MAP_URL,
      ttlMs: CRM_CACHE_TTL_MS,
      staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
      onRevalidated: ({ data: fresh }) => {
        if (alive && fresh) setCounts(fresh)
      },
    })
      .then((next) => {
        if (alive) setCounts(next)
      })
      .catch(() => {
        /* 건수는 보조 정보다 — 실패해도 배정 자체는 계속 편집할 수 있어야 한다. */
      })
    return () => {
      alive = false
    }
  }, [])

  const countsByRegion = useMemo(() => {
    const lead = counts?.layers.find((layer) => layer.key === "lead")?.regions ?? {}
    const deal = counts?.layers.find((layer) => layer.key === "deal")?.regions ?? {}
    return { lead, deal }
  }, [counts])

  const assign = useCallback(
    async (regionLabel: string, ownerKey: string) => {
      const owner = owners.find((item) => item.ownerKey === ownerKey) ?? null
      setSavingRegion(regionLabel)
      setError(null)
      try {
        await adminFetchJson(ASSIGNMENTS_URL, {
          method: "PUT",
          body: JSON.stringify({
            regionLabel,
            ownerKey: ownerKey || null,
            ownerName: owner?.displayName ?? null,
          }),
        })
        clearAdminRequestCache(ASSIGNMENTS_URL)
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : "지역 분배를 저장하지 못했습니다.")
      } finally {
        setSavingRegion(null)
      }
    },
    [load, owners]
  )

  if (loading && !data) {
    return <div className="mb-4 h-72 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  }
  if (!data) {
    return (
      <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <p className="text-[13px] text-[#1a1a1a]/60">{error ?? "지역 분배를 불러오지 못했습니다."}</p>
      </section>
    )
  }

  // 이 화면의 결론 — 일은 있는데 사람이 없는 지역.
  const uncoveredLeads = data.regions
    .filter((row) => !row.assignment)
    .reduce((sum, row) => sum + (countsByRegion.lead[row.label] ?? 0), 0)

  return (
    <section className="mb-5 rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">Territory</p>
          <h2 className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] text-[#111110]">지역 분배</h2>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
            시도 하나에 담당자 하나 · 교체해도 이전 담당 이력은 남습니다
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-[#111110]">
            배정 {data.assignedCount} / {data.totalRegions}
          </span>
          {uncoveredLeads > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#E9D8B4] bg-[#FFF9ED] px-2.5 py-1 text-[11.5px] font-semibold text-[#8B5E14]">
              <AlertTriangle className="h-3 w-3" />
              담당 없는 지역 리드 {uncoveredLeads.toLocaleString("ko-KR")}건
            </span>
          ) : null}
        </div>
      </div>

      {!data.available ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#E9D8B4] bg-[#FFF9ED] px-3 py-2.5 text-[12px] text-[#8B5E14]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{data.warning}</span>
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-xl border border-[#E9D8B4] bg-[#FFF9ED] px-3 py-2 text-[12px] text-[#8B5E14]">{error}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-[#f0f0ec] text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/30">
              <th className="px-2 py-2">시도</th>
              <th className="px-2 py-2 text-right">리드</th>
              <th className="px-2 py-2 text-right">거래</th>
              <th className="px-2 py-2">담당자</th>
            </tr>
          </thead>
          <tbody>
            {data.regions.map((row) => {
              const leads = countsByRegion.lead[row.label] ?? 0
              const deals = countsByRegion.deal[row.label] ?? 0
              const uncovered = !row.assignment && leads > 0
              return (
                <tr
                  key={row.label}
                  className={`border-b border-[#f7f7f4] ${uncovered ? "bg-[#FFF9ED]" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#111110]">
                      {uncovered ? <MapPinned className="h-3 w-3 text-[#8B5E14]" /> : null}
                      {row.label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-[#1a1a1a]/70">
                    {leads > 0 ? leads.toLocaleString("ko-KR") : <span className="text-[#1a1a1a]/25">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-[#1a1a1a]/70">
                    {deals > 0 ? deals.toLocaleString("ko-KR") : <span className="text-[#1a1a1a]/25">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label={`${row.label} 담당자`}
                        value={row.assignment?.ownerKey ?? ""}
                        disabled={!data.available || savingRegion === row.label}
                        onChange={(event) => void assign(row.label, event.target.value)}
                        className="h-8 min-w-[140px] rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] disabled:opacity-50"
                      >
                        <option value="">미배정</option>
                        {owners.map((owner) => (
                          <option key={owner.ownerKey} value={owner.ownerKey}>
                            {owner.displayName}
                          </option>
                        ))}
                        {/* 명부에서 사라진 담당자가 배정돼 있으면 값을 잃지 않게 그대로 남긴다. */}
                        {row.assignment && !owners.some((owner) => owner.ownerKey === row.assignment?.ownerKey) ? (
                          <option value={row.assignment.ownerKey}>
                            {row.assignment.ownerName ?? row.assignment.ownerKey} (명부 밖)
                          </option>
                        ) : null}
                      </select>
                      {savingRegion === row.label ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1a1a1a]/35" />
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {data.workload.length > 0 ? (
        <div className="mt-4 border-t border-[#f0f0ec] pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1a1a1a]/30">담당자별 부하</p>
          <ul className="flex flex-wrap gap-2">
            {data.workload.map((owner) => {
              const leads = owner.regions.reduce((sum, label) => sum + (countsByRegion.lead[label] ?? 0), 0)
              return (
                <li
                  key={owner.ownerKey}
                  className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 text-[12px]"
                  title={owner.regions.join(", ")}
                >
                  <span className="font-semibold text-[#111110]">{owner.ownerName ?? owner.ownerKey}</span>
                  <span className="ml-2 tabular-nums text-[#1a1a1a]/55">
                    {owner.regions.length}개 지역 · 리드 {leads.toLocaleString("ko-KR")}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
