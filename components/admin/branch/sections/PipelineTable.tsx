"use client"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { TEAMS, type Team, type Period } from "../types"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

const PAGE_SIZE = 50
const ALL_REGIONS = "ALL"

type RevenueSort = "desc" | "asc"

interface Row {
  id: string; customer: string; manager: string|null; team: string|null
  region: string|null; revenue: number
}

export default function PipelineTable({ team, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [tableTeam, setTableTeam] = useState<Team>(team)
  const requestKey = `${refreshKey}:${tableTeam}`
  const [rowsState, setRowsState] = useState<{ key: string; rows: Row[] | null }>({ key: requestKey, rows: null })
  const [query, setQuery] = useState("")
  const [region, setRegion] = useState(ALL_REGIONS)
  const [revenueSort, setRevenueSort] = useState<RevenueSort>("desc")
  const [page, setPage] = useState(1)
  const rows = rowsState.key === requestKey ? rowsState.rows : null

  useEffect(() => {
    let active = true
    adminFetch(`/api/admin/branch/pipeline?team=${tableTeam}`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setRowsState({ key: requestKey, rows: d.rows ?? [] })
      })
      .catch(() => {
        if (active) setRowsState({ key: requestKey, rows: [] })
      })
    return () => { active = false }
  }, [requestKey, tableTeam])

  const regionOptions = useMemo(() => {
    if (!rows) return []
    return Array.from(new Set(rows.map((row) => row.region).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  const activeRegion = region === ALL_REGIONS || regionOptions.includes(region) ? region : ALL_REGIONS

  const filteredRows = useMemo(() => {
    if (!rows) return []
    const trimmed = query.trim().toLowerCase()
    return rows
      .filter((row) => activeRegion === ALL_REGIONS || row.region === activeRegion)
      .filter((row) => {
        if (!trimmed) return true
        return [
          row.customer,
          row.manager,
          row.team,
          row.region,
        ].some((value) => String(value ?? "").toLowerCase().includes(trimmed))
      })
      .sort((a, b) => {
        const revenueDiff = revenueSort === "desc" ? b.revenue - a.revenue : a.revenue - b.revenue
        if (revenueDiff !== 0) return revenueDiff
        return a.customer.localeCompare(b.customer, "ko")
      })
  }, [activeRegion, query, revenueSort, rows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pageStart = filteredRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(safePage * PAGE_SIZE, filteredRows.length)

  if (!rows) return <div className="h-64 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (rows.length === 0) return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">REV 고객별 매출</h2>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6 text-[12px] text-[#1a1a1a]/40">표시할 매출 데이터가 없습니다.</div>
    </section>
  )
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-[#111110]/70">REV 고객별 매출</h2>
        <p className="text-[11px] text-[#1a1a1a]/40">{filteredRows.length}건 · 50개씩 보기</p>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-md">
          <span className="sr-only">REV 고객별 매출 검색</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/35" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="고객사, 매니저, 지역 검색"
            className="h-9 w-full rounded-full border border-[#e8e8e4] bg-white pl-9 pr-3 text-[12px] outline-none transition focus:border-[#111110]/30"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[#1a1a1a]/50">팀</span>
          <select
            value={tableTeam}
            onChange={(e) => { setTableTeam(e.target.value as Team); setRegion(ALL_REGIONS); setPage(1) }}
            className="h-9 min-w-24 rounded-full border border-[#e8e8e4] bg-white px-3 text-[12px] outline-none transition focus:border-[#111110]/30"
          >
            {TEAMS.map((option) => (
              <option key={option} value={option}>{option === "ALL" ? "전체" : option}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[#1a1a1a]/50">지역</span>
          <select
            value={activeRegion}
            onChange={(e) => { setRegion(e.target.value); setPage(1) }}
            className="h-9 min-w-32 rounded-full border border-[#e8e8e4] bg-white px-3 text-[12px] outline-none transition focus:border-[#111110]/30 disabled:opacity-50"
            disabled={regionOptions.length === 0}
          >
            <option value={ALL_REGIONS}>전체 지역</option>
            {regionOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[#1a1a1a]/50">매출</span>
          <select
            value={revenueSort}
            onChange={(e) => { setRevenueSort(e.target.value as RevenueSort); setPage(1) }}
            className="h-9 min-w-28 rounded-full border border-[#e8e8e4] bg-white px-3 text-[12px] outline-none transition focus:border-[#111110]/30"
          >
            <option value="desc">높은순</option>
            <option value="asc">낮은순</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-[#fafaf8] text-[#1a1a1a]/60">
            <tr>
              <th className="px-3 py-2 text-left">고객사</th>
              <th className="px-3 py-2">담당 매니저</th>
              <th className="px-3 py-2">팀</th>
              <th className="px-3 py-2">지역</th>
              <th className="px-3 py-2 text-right">매출</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td className="px-3 py-10 text-center text-[#1a1a1a]/40" colSpan={5}>검색 결과가 없습니다.</td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr key={r.id} className="border-t border-[#f0f0ec]">
                <td className="px-3 py-2 font-medium">{r.customer}</td>
                <td className="px-3 py-2 text-center">{r.manager ?? "-"}</td>
                <td className="px-3 py-2 text-center">{r.team ?? "-"}</td>
                <td className="px-3 py-2 text-center">{r.region ?? "-"}</td>
                <td className="px-3 py-2 text-right font-semibold">₩{fmt(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0f0ec] px-3 py-3">
          <p className="text-[11px] text-[#1a1a1a]/45">
            {pageStart}-{pageEnd} / {filteredRows.length}건
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e8e8e4] text-[#1a1a1a]/65 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="이전 페이지"
              title="이전 페이지"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-14 text-center text-[12px] text-[#1a1a1a]/60">{safePage} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e8e8e4] text-[#1a1a1a]/65 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="다음 페이지"
              title="다음 페이지"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
