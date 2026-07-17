"use client"
import Link from "next/link"
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useBranchJson } from "../client-api"
import { matchesTokens, tokenize } from "../search-tokens"
import MultiSelect from "../MultiSelect"
import { TEAMS, type BranchPipelineResponse, type BranchPipelineRow, type Team, type Period } from "../types"

const SELECTABLE_TEAMS = TEAMS.filter((t) => t !== "ALL") as Exclude<Team, "ALL">[]

function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

type Row = BranchPipelineRow

type SortKey = "customer" | "manager" | "team" | "region" | "revenue"
type SortDir = "asc" | "desc"

// 컬럼을 새로 클릭했을 때 적용할 기본 방향 — 매출은 desc(높은순 먼저), 텍스트 컬럼은
// asc(가나다순)가 자연스러운 기본값이다. 같은 컬럼을 다시 클릭하면 토글.
const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  customer: "asc",
  manager: "asc",
  team: "asc",
  region: "asc",
  revenue: "desc",
}

function compareRows(a: Row, b: Row, key: SortKey, dir: SortDir): number {
  const mul = dir === "asc" ? 1 : -1
  const diff = key === "revenue" ? a.revenue - b.revenue : String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "ko")
  if (diff !== 0) return diff * mul
  return a.customer.localeCompare(b.customer, "ko")
}

function SortableTh({
  label, sortKeyValue, align, sortKey, sortDir, onSort, className,
}: {
  label: string
  sortKeyValue: SortKey
  align: "left" | "center" | "right"
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  className: string
}) {
  const active = sortKey === sortKeyValue
  return (
    <th aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKeyValue)}
        className={`inline-flex items-center gap-1 font-medium transition hover:text-[#111110] ${
          active ? "text-[#111110]" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        {active ? (
          sortDir === "asc"
            ? <ArrowUpNarrowWide className="h-3 w-3 shrink-0" aria-hidden="true" />
            : <ArrowDownNarrowWide className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <span className="h-3 w-3 shrink-0" aria-hidden="true" />
        )}
      </button>
    </th>
  )
}

export default function PipelineTable({
  team,
  period,
  selectedMonth,
  refreshKey,
  pageSize = 20,
  onRowClick,
  hideHeader = false,
  initialQuery,
  initialManager,
  onFilterChange,
}: {
  team: Team
  period: Period
  selectedMonth: string
  refreshKey: number
  pageSize?: number
  onRowClick?: (row: Row) => void
  /** 품질 웨이브 4 — 항목 4. true면 자체 "REV 고객별 매출" 제목(<h2>)만 숨긴다 — 장부
   *  링크·필터·표는 그대로 유지. 부모가 이미 카드 제목(예: "파이프라인")을 렌더하는
   *  컨텍스트(BranchDashboardClient 파이프라인 탭)에서 제목 이중화를 막는 용도. */
  hideHeader?: boolean
  /** 품질 웨이브 5 — 항목 6. 장부의 pipelineHref(향후 q/mgr 동봉 시)나 URL 딥링크로
   *  들어올 때 검색어/담당 필터의 초기값으로만 쓰인다(마운트 이후 재적용 안 됨 —
   *  team/period/month와 달리 이 두 필드는 사용자가 이 화면 안에서 계속 바꾸는
   *  값이라 부모가 다시 밀어넣지 않는다. 이후 변경은 onFilterChange로 부모에 통지). */
  initialQuery?: string
  initialManager?: string
  onFilterChange?: (next: { query: string; manager: string }) => void
}) {
  const initialTeams: Set<string> = team === "ALL" ? new Set() : new Set([team])
  const [query, setQuery] = useState(initialQuery ?? "")
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(initialTeams)
  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(() => initialManager ? new Set([initialManager]) : new Set())
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>("revenue")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [page, setPage] = useState(1)

  // 품질 웨이브 5 — 항목 6. 검색어/담당(첫 번째 선택값만 — 장부와 동일하게 단일)이
  // 바뀔 때마다 부모(BranchDashboardClient)에 통지해 URL(q/mgr)에 동기화한다.
  // tab/team/period/month와 동일한 "URL이 현재 화면 상태를 반영" 규약의 확장.
  useEffect(() => {
    onFilterChange?.({ query, manager: Array.from(selectedManagers)[0] ?? "" })
  }, [query, selectedManagers, onFilterChange])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir(SORT_DEFAULT_DIR[key]) }
    setPage(1)
  }
  // 로컬 재시도 넛지 — 상위 refreshKey(전역 새로고침)에 기대지 않고 이 섹션만
  // useBranchJson의 기존 캐시키 재계산 경로(refreshKey:url)를 재사용해 다시 요청한다.
  // (BranchRegionHeatmap의 동일 패턴 참조.)
  const [localRetry, setLocalRetry] = useState(0)
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const pipeline = useBranchJson<BranchPipelineResponse>(`/api/admin/branch/pipeline?team=${team}&period=${period}${monthQuery}`, refreshKey + localRetry)
  const pipelineRows = pipeline.data?.rows
  const rows = useMemo(() => pipeline.loading ? null : (pipelineRows ?? []), [pipeline.loading, pipelineRows])
  const teamOptions = team === "ALL" ? SELECTABLE_TEAMS : [team]

  // 장부 크로스링크 — 현재 team/period/selectedMonth를 그대로 동봉해 장부로 넘어가도
  // 컨텍스트가 끊기지 않게 한다(파라미터 이름은 SalesLedgerWorkbench의 URL 파싱부 기준:
  // q/mgr/region). 장부의 담당·지역 필터는 단일 select라 멀티선택 중 첫 번째 값만
  // 전달하고 나머지는 생략한다 — 정보 손실은 crossLinkNotice로 링크 title에 고지한다.
  const ledgerHref = useMemo(() => {
    const base = new URLSearchParams()
    base.set("lens", "rev")
    if (team !== "ALL") base.set("team", team)
    if (period !== "Q") base.set("period", period)
    if (period === "M") base.set("month", selectedMonth)
    const trimmedQuery = query.trim()
    if (trimmedQuery) base.set("q", trimmedQuery)
    const managerList = Array.from(selectedManagers)
    if (managerList.length > 0) base.set("mgr", managerList[0])
    const regionList = Array.from(selectedRegions)
    if (regionList.length > 0) base.set("region", regionList[0])
    return (extra?: Record<string, string>) => {
      const params = new URLSearchParams(base)
      if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v)
      return `/admin/branch/ledger?${params.toString()}`
    }
  }, [team, period, selectedMonth, query, selectedManagers, selectedRegions])

  // 멀티선택(담당/지역) 중 장부로 전달되지 않는 나머지 선택값을 링크 title로 고지.
  const crossLinkNotice = useMemo(() => {
    const notes: string[] = []
    if (selectedManagers.size > 1) {
      notes.push(`담당 ${selectedManagers.size}명 중 "${Array.from(selectedManagers)[0]}"만 장부에 전달(장부는 단일 선택)`)
    }
    if (selectedRegions.size > 1) {
      notes.push(`지역 ${selectedRegions.size}곳 중 "${Array.from(selectedRegions)[0]}"만 장부에 전달(장부는 단일 선택)`)
    }
    return notes.length > 0 ? notes.join(" · ") : undefined
  }, [selectedManagers, selectedRegions])

  const managerOptions = useMemo(() => {
    if (!rows) return []
    return Array.from(new Set(rows.map((row) => row.manager).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  const regionOptions = useMemo(() => {
    if (!rows) return []
    return Array.from(new Set(rows.map((row) => row.region).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  const filteredRows = useMemo(() => {
    if (!rows) return []
    const tokens = tokenize(query)
    return rows
      .filter((row) => selectedTeams.size === 0 || (row.team !== null && selectedTeams.has(row.team)))
      .filter((row) => selectedManagers.size === 0 || (row.manager !== null && selectedManagers.has(row.manager)))
      .filter((row) => selectedRegions.size === 0 || (row.region !== null && selectedRegions.has(row.region)))
      .filter((row) => matchesTokens(tokens, [row.customer, row.manager, row.team, row.region]))
      .sort((a, b) => compareRows(a, b, sortKey, sortDir))
  }, [query, sortKey, sortDir, rows, selectedManagers, selectedRegions, selectedTeams])

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
    selectedManagers.size > 0 ||
    selectedRegions.size > 0 ||
    !teamsAtBaseline ||
    !(sortKey === "revenue" && sortDir === "desc")

  function resetFilters() {
    setQuery("")
    setSelectedTeams(team === "ALL" ? new Set() : new Set([team]))
    setSelectedManagers(new Set())
    setSelectedRegions(new Set())
    setSortKey("revenue")
    setSortDir("desc")
    setPage(1)
  }

  if (!rows) return <div className="h-64 animate-pulse rounded-2xl bg-[#F6F5F4]" />
  // 에러를 빈 상태로 위장하지 않는다 — pipeline.error가 있으면(로딩 실패) "딜 없음"이
  // 아니라 에러 배너 + 재시도를 보여준다. loading이 끝나고 error가 있으면 data는
  // null이라 rows는 [](빈 배열)로 계산되므로 이 분기를 rows.length===0보다 먼저 둬야 한다.
  if (pipeline.error) return (
    <section>
      {!hideHeader && <h2 className="mb-3 text-[14px] font-bold tracking-[-0.01em] text-[#111110]">REV 고객별 매출</h2>}
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[12px] font-semibold text-[#8F2C2C]"
      >
        <span>{pipeline.error}</span>
        <button
          type="button"
          onClick={() => setLocalRetry((v) => v + 1)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#B43E3E] bg-white px-2.5 text-[11px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          다시 시도
        </button>
      </div>
    </section>
  )
  if (rows.length === 0) return (
    <section>
      {!hideHeader && <h2 className="mb-3 text-[14px] font-bold tracking-[-0.01em] text-[#111110]">REV 고객별 매출</h2>}
      <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6 text-[12px] text-[#615D59]">표시할 매출 데이터가 없습니다.</div>
    </section>
  )

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!hideHeader && <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">REV 고객별 매출</h2>}
          <Link
            href={ledgerHref()}
            title={crossLinkNotice}
            className="text-[11px] font-medium text-[#084734] underline-offset-2 hover:underline"
          >
            장부에서 열기 ↗
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[#615D59]">{filteredRows.length}건 · {pageSize}개씩</span>
          <span className="mx-1 h-3 w-px bg-[rgba(0,0,0,0.08)]" aria-hidden="true" />
          <button
            type="button"
            onClick={resetFilters}
            disabled={!filtersActive}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[11px] font-medium text-[#111110]/65 transition hover:border-[#111110]/25 hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-40"
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#615D59]" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="고객사, 매니저, 지역 검색"
            className="h-8 w-full rounded-full border border-[rgba(0,0,0,0.08)] bg-white pl-9 pr-3 text-[12px] outline-none transition focus:border-[#111110]/30"
          />
        </label>
        <MultiSelect
          label="팀"
          options={teamOptions}
          selected={selectedTeams}
          onChange={(next) => { setSelectedTeams(next); setPage(1) }}
          placeholder="전체"
          width="w-32"
        />
        <MultiSelect
          label="담당"
          options={managerOptions}
          selected={selectedManagers}
          onChange={(next) => { setSelectedManagers(next); setPage(1) }}
          placeholder="전체"
          width="w-44"
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
      <div className="overflow-x-auto rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white">
        <table className="w-full text-[12px]">
          <colgroup>
            <col style={{ width: "34%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "26%" }} />
          </colgroup>
          <thead className="bg-[#FAFAF8] text-[#111110]/60">
            <tr>
              <SortableTh label="고객사" sortKeyValue="customer" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-5 py-1 text-left" />
              <SortableTh label="담당 매니저" sortKeyValue="manager" align="center" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-1 text-center" />
              <SortableTh label="팀" sortKeyValue="team" align="center" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-1 text-center" />
              <SortableTh label="지역" sortKeyValue="region" align="center" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-1 text-center" />
              <SortableTh label="매출" sortKeyValue="revenue" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-5 py-1 text-right" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td className="px-5 py-10 text-center text-[#615D59]" colSpan={5}>검색 결과가 없습니다.</td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr key={r.id}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`border-t border-[#F6F5F4] ${onRowClick ? "cursor-pointer transition hover:bg-[#FAFAF8]" : ""}`}>
                <td className="px-5 py-1 font-medium">
                  <span
                    className="inline-flex max-w-full items-center gap-1.5"
                    title={r.sheetRow != null ? `시트 '2. REV' ${r.sheetRow}행` : undefined}
                  >
                    {onRowClick ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRowClick(r) }}
                        className="truncate text-left font-medium text-[#111110] underline-offset-2 hover:underline"
                        title="세부 내역 로그 보기"
                      >
                        {r.customer}
                      </button>
                    ) : (
                      <span className="truncate">{r.customer}</span>
                    )}
                    <Link
                      href={ledgerHref({ q: r.customer })}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-[11px] font-medium text-[#084734] opacity-50 transition hover:opacity-100"
                      title={crossLinkNotice ? `매출 장부에서 열기 · ${crossLinkNotice}` : "매출 장부에서 열기"}
                    >
                      ↗
                    </Link>
                  </span>
                </td>
                <td className="px-3 py-1 text-center">{r.manager ?? "-"}</td>
                <td className="px-3 py-1 text-center">{r.team ?? "-"}</td>
                <td className="px-3 py-1 text-center">{r.region ?? "-"}</td>
                <td className="px-5 py-1 text-right font-semibold tabular-nums">¥{fmt(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F6F5F4] px-5 py-1">
          <p className="text-[11px] text-[#615D59]">
            {pageStart}-{pageEnd} / {filteredRows.length}건
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(0,0,0,0.08)] text-[#111110]/65 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="이전 페이지"
              title="이전 페이지"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-14 text-center text-[12px] text-[#111110]/60">{safePage} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(0,0,0,0.08)] text-[#111110]/65 disabled:cursor-not-allowed disabled:opacity-35"
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
