"use client"
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { TEAMS, type Team, type Period } from "../types"

const SELECTABLE_TEAMS = TEAMS.filter((t) => t !== "ALL") as Exclude<Team, "ALL">[]

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

type RevenueSort = "desc" | "asc"

interface Row {
  id: string; customer: string; manager: string|null; team: string|null
  region: string|null; revenue: number
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "전체",
  align = "left",
  width = "w-44",
}: {
  label: string
  options: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  placeholder?: string
  align?: "left" | "right"
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  const summary = options.length === 0 || selected.size === 0
    ? placeholder
    : selected.size === 1
    ? Array.from(selected)[0]
    : `${Array.from(selected)[0]} 외 ${selected.size - 1}`

  function toggle(option: string) {
    const next = new Set(selected)
    if (next.has(option)) next.delete(option)
    else next.add(option)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-[#1a1a1a]/50">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={options.length === 0}
        className="inline-flex h-8 min-w-[7rem] items-center justify-between gap-2 rounded-full border border-[#e8e8e4] bg-white px-3 text-[12px] outline-none transition hover:border-[#111110]/25 focus:border-[#111110]/30 disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected.size === 0 ? "text-[#1a1a1a]/55" : "text-[#111110]"}>{summary}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-[#1a1a1a]/40 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute top-9 z-30 max-h-64 ${width} overflow-auto rounded-xl border border-[#e8e8e4] bg-white p-1 shadow-[0_10px_30px_rgba(0,0,0,0.08)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition ${
              selected.size === 0 ? "bg-[#ECFDF5] text-[#0f5132]" : "text-[#1a1a1a]/65 hover:bg-[#fafaf8]"
            }`}
          >
            <span>전체 보기</span>
          </button>
          <div className="my-1 h-px bg-[#f0f0ec]" />
          {options.map((opt) => {
            const checked = selected.has(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition ${
                  checked ? "bg-[#ECFDF5] text-[#0f5132]" : "text-[#1a1a1a]/75 hover:bg-[#fafaf8]"
                }`}
              >
                <span className="truncate">{opt}</span>
                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                  checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-[#d8d8d4] bg-white"
                }`}>
                  {checked && <span className="text-[10px] font-bold leading-none">✓</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PipelineTable({
  team,
  refreshKey,
  pageSize = 20,
  onRowClick,
}: {
  team: Team
  period: Period
  refreshKey: number
  pageSize?: number
  onRowClick?: (row: Row) => void
}) {
  const initialTeams: Set<string> = team === "ALL" ? new Set() : new Set([team])
  const [rowsState, setRowsState] = useState<{ key: string; rows: Row[] | null }>({ key: String(refreshKey), rows: null })
  const [query, setQuery] = useState("")
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(initialTeams)
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set())
  const [revenueSort, setRevenueSort] = useState<RevenueSort>("desc")
  const [page, setPage] = useState(1)
  const requestKey = String(refreshKey)
  const rows = rowsState.key === requestKey ? rowsState.rows : null

  useEffect(() => {
    let active = true
    adminFetch(`/api/admin/branch/pipeline?team=ALL`)
      .then((r) => r.json())
      .then((d) => { if (active) setRowsState({ key: requestKey, rows: d.rows ?? [] }) })
      .catch(() => { if (active) setRowsState({ key: requestKey, rows: [] }) })
    return () => { active = false }
  }, [requestKey])

  const regionOptions = useMemo(() => {
    if (!rows) return []
    return Array.from(new Set(rows.map((row) => row.region).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  const filteredRows = useMemo(() => {
    if (!rows) return []
    const trimmed = query.trim().toLowerCase()
    return rows
      .filter((row) => selectedTeams.size === 0 || (row.team !== null && selectedTeams.has(row.team)))
      .filter((row) => selectedRegions.size === 0 || (row.region !== null && selectedRegions.has(row.region)))
      .filter((row) => {
        if (!trimmed) return true
        return [row.customer, row.manager, row.team, row.region].some((value) =>
          String(value ?? "").toLowerCase().includes(trimmed),
        )
      })
      .sort((a, b) => {
        const diff = revenueSort === "desc" ? b.revenue - a.revenue : a.revenue - b.revenue
        if (diff !== 0) return diff
        return a.customer.localeCompare(b.customer, "ko")
      })
  }, [query, revenueSort, rows, selectedRegions, selectedTeams])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const pageStart = filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const pageEnd = Math.min(safePage * pageSize, filteredRows.length)

  const baseTeamSet: Set<string> = team === "ALL" ? new Set() : new Set([team])
  const teamsAtBaseline =
    selectedTeams.size === baseTeamSet.size && Array.from(selectedTeams).every((t) => baseTeamSet.has(t))
  const filtersActive =
    query.trim().length > 0 ||
    selectedRegions.size > 0 ||
    !teamsAtBaseline ||
    revenueSort !== "desc"

  function resetFilters() {
    setQuery("")
    setSelectedTeams(team === "ALL" ? new Set() : new Set([team]))
    setSelectedRegions(new Set())
    setRevenueSort("desc")
    setPage(1)
  }

  if (!rows) return <div className="h-64 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (rows.length === 0) return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">REV 고객별 매출</h2>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6 text-[12px] text-[#1a1a1a]/40">표시할 매출 데이터가 없습니다.</div>
    </section>
  )

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-[#111110]/70">REV 고객별 매출</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[#1a1a1a]/40">{filteredRows.length}건 · {pageSize}개씩</span>
          <span className="mx-1 h-3 w-px bg-[#e8e8e4]" aria-hidden="true" />
          <button
            type="button"
            onClick={() => { setRevenueSort((v) => (v === "desc" ? "asc" : "desc")); setPage(1) }}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2.5 text-[11px] font-medium text-[#1a1a1a]/65 transition hover:border-[#111110]/25 hover:text-[#111110]"
            title="매출 정렬 토글"
          >
            {revenueSort === "desc"
              ? <ArrowDownNarrowWide className="h-3 w-3" aria-hidden="true" />
              : <ArrowUpNarrowWide className="h-3 w-3" aria-hidden="true" />}
            <span>매출 {revenueSort === "desc" ? "높은순" : "낮은순"}</span>
          </button>
          <button
            type="button"
            onClick={resetFilters}
            disabled={!filtersActive}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2.5 text-[11px] font-medium text-[#1a1a1a]/65 transition hover:border-[#111110]/25 hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-40"
            title="필터 초기화"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>초기화</span>
          </button>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-md">
          <span className="sr-only">REV 고객별 매출 검색</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/35" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="고객사, 매니저, 지역 검색"
            className="h-8 w-full rounded-full border border-[#e8e8e4] bg-white pl-9 pr-3 text-[12px] outline-none transition focus:border-[#111110]/30"
          />
        </label>
        <MultiSelect
          label="팀"
          options={SELECTABLE_TEAMS}
          selected={selectedTeams}
          onChange={(next) => { setSelectedTeams(next); setPage(1) }}
          placeholder="전체"
          width="w-32"
        />
        <MultiSelect
          label="지역"
          options={regionOptions}
          selected={selectedRegions}
          onChange={(next) => { setSelectedRegions(next); setPage(1) }}
          placeholder="전체 지역"
          align="right"
          width="w-44"
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
        <table className="w-full text-[12px]">
          <colgroup>
            <col style={{ width: "34%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "26%" }} />
          </colgroup>
          <thead className="bg-[#fafaf8] text-[#1a1a1a]/60">
            <tr>
              <th className="px-5 py-1 text-left">고객사</th>
              <th className="px-3 py-1">담당 매니저</th>
              <th className="px-3 py-1">팀</th>
              <th className="px-3 py-1">지역</th>
              <th className="px-5 py-1 text-right">매출</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td className="px-5 py-10 text-center text-[#1a1a1a]/40" colSpan={5}>검색 결과가 없습니다.</td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr key={r.id}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`border-t border-[#f0f0ec] ${onRowClick ? "cursor-pointer transition hover:bg-[#FAFAF8]" : ""}`}>
                <td className="px-5 py-1 font-medium">
                  {onRowClick ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRowClick(r) }}
                      className="text-left font-medium text-[#111110] underline-offset-2 hover:underline"
                      title="세부 내역 로그 보기"
                    >
                      {r.customer}
                    </button>
                  ) : (
                    r.customer
                  )}
                </td>
                <td className="px-3 py-1 text-center">{r.manager ?? "-"}</td>
                <td className="px-3 py-1 text-center">{r.team ?? "-"}</td>
                <td className="px-3 py-1 text-center">{r.region ?? "-"}</td>
                <td className="px-5 py-1 text-right font-semibold">¥{fmt(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0f0ec] px-5 py-1">
          <p className="text-[11px] text-[#1a1a1a]/45">
            {pageStart}-{pageEnd} / {filteredRows.length}건
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#e8e8e4] text-[#1a1a1a]/65 disabled:cursor-not-allowed disabled:opacity-35"
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#e8e8e4] text-[#1a1a1a]/65 disabled:cursor-not-allowed disabled:opacity-35"
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
