"use client"
import Link from "next/link"
import { RotateCcw, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useBranchJson } from "../client-api"
import { matchesTokens, tokenize } from "../search-tokens"
import MultiSelect from "../MultiSelect"
import type { BranchPipelineResponse, BranchPipelineRow, Period, Team } from "../types"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { CONFIDENCE_TOKENS, type ConfidenceKey } from "@/lib/branch/confidence-tokens"
import { ledgerMonthSplit } from "@/lib/branch/computations/revenue-core"
import { teamColorOf } from "@/lib/branch/team-colors"
import MoneyValue from "../MoneyValue"

type Row = BranchPipelineRow

interface MergedRow extends Row {
  count: number  // number of deals merged under this customer
}

// 확도 기반 칸반 컬럼 — 이전에는 딜 id 해시로 발견/적격/제안/협의 4단계를 무작위
// 배정했다(실데이터와 무관한 가짜 단계). 파이프라인 행이 실제로 갖고 있는 필드는
// 월별 확도 3분해(monthlyPayments/monthlyConfirmed/monthlyHighConfidence/monthlyRed —
// DealModal의 월별 매출 로그가 쓰는 그 필드들)뿐이라, 그걸 rev-confirmed 캐논
// (revenue-core.ledgerMonthSplit)에 그대로 넣어 딜 전체를 확정/고확도/예정 중 하나로
// 분류한다. 색 데이터가 전혀 없는 딜(월별 데이터 자체가 없거나 3분해가 모두 0)은
// "미분류"로 정직하게 남긴다 — 존재하지 않는 확률·단계를 발명하지 않는다.
type ConfidenceColumnKey = ConfidenceKey | "unclassified"

const CONFIDENCE_COLUMNS: ReadonlyArray<{
  key: ConfidenceColumnKey
  label: string
  description: string
  color: string
  bg: string
}> = [
  {
    key: "confirmed",
    label: CONFIDENCE_TOKENS.confirmed.label,
    description: "월별 확도 3분해 기준 확정분이 가장 큰 딜",
    color: CONFIDENCE_TOKENS.confirmed.color,
    bg: CONFIDENCE_TOKENS.confirmed.tintBg,
  },
  {
    key: "high-confidence",
    label: CONFIDENCE_TOKENS["high-confidence"].label,
    description: "확정은 아니지만 클로징 임박 신호가 가장 큰 딜",
    color: CONFIDENCE_TOKENS["high-confidence"].color,
    bg: CONFIDENCE_TOKENS["high-confidence"].tintBg,
  },
  {
    key: "expected",
    label: CONFIDENCE_TOKENS.expected.label,
    description: "확정·고확도 신호 없이 예상 금액만 있는 딜",
    color: CONFIDENCE_TOKENS.expected.color,
    bg: CONFIDENCE_TOKENS.expected.tintBg,
  },
  {
    key: "unclassified",
    label: "미분류",
    description: "월별 매출 데이터 없음(확도 판정 불가)",
    color: "#615D59",
    bg: "#F6F5F4",
  },
]

/** 딜 하나의 월별 납부액을 rev-confirmed 캐논으로 확정/고확도/예정 3분해한 뒤,
 *  가장 큰 값의 버킷으로 분류한다. 계산 로직(캐논)은 건드리지 않고 소비만 한다. */
function rowConfidenceBucket(row: Row): ConfidenceColumnKey {
  const entries = Object.entries(row.monthlyPayments ?? {})
  if (entries.length === 0) return "unclassified"
  let confirmed = 0
  let highConfidence = 0
  let expected = 0
  for (const [ym, raw] of entries) {
    const total = Number(raw)
    if (total === 0) continue
    const split = ledgerMonthSplit(row, ym, total)
    confirmed += split.confirmed
    highConfidence += split.highConfidence
    expected += split.expected
  }
  if (confirmed === 0 && highConfidence === 0 && expected === 0) return "unclassified"
  if (confirmed >= highConfidence && confirmed >= expected) return "confirmed"
  if (highConfidence >= expected) return "high-confidence"
  return "expected"
}

function PipelineCard({ deal, onClick, ledgerHref }: {
  deal: MergedRow
  onClick?: () => void
  /** 품질 웨이브 4 — 항목 2. PipelineTable 행의 "장부에서 열기" 딥링크와 동일 컨텍스트
   *  보존 규약(lens=rev&team=&period=&month=&mgr=)으로 이 카드의 고객만 필터해 연다. */
  ledgerHref?: (extra?: Record<string, string>) => string
}) {
  // 팀 아이덴티티 색 SSOT(lib/branch/team-colors.ts) 소비로 전환 — 로컬 TEAM_COLOR
  // 리터럴 재정의 제거(품질 웨이브 4 — 항목 2, check-design-tokens.mjs ALLOWLIST 축소).
  const teamColor = teamColorOf(deal.team)
  // 루트를 <button>이 아니라 role="button" <div>로 둔 것은 ledgerHref 링크(<a>)를
  // PipelineTable과 동일하게 고객명 옆 인라인 형제로 배치하기 위함 — <a>를 <button>
  // 안에 중첩하면 잘못된 HTML이라 카드 전체 클릭은 이 div의 role/tabIndex/onKeyDown으로
  // 대체한다(접근성은 동일하게 유지, Enter/Space로도 열림).
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.() } }}
      className="group block w-full cursor-pointer rounded-xl border border-[rgba(0,0,0,0.07)] bg-white px-3.5 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.09)] focus-visible:ring-2 focus-visible:ring-[#084734]/40"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
          <p className="truncate text-[12.5px] font-bold leading-snug text-[#111110]">{deal.customer}</p>
          {ledgerHref && (
            <Link
              href={ledgerHref({ q: deal.customer })}
              onClick={(e) => e.stopPropagation()}
              title="매출 장부에서 열기"
              className="shrink-0 text-[11px] font-medium text-[#084734] opacity-0 transition hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-60"
            >
              ↗
            </Link>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {deal.count > 1 && (
            <span className="rounded-md bg-[rgba(0,0,0,0.06)] px-1.5 py-0.5 text-[9.5px] font-bold text-[#615D59]">
              {deal.count}건
            </span>
          )}
          {deal.team && (
            <span className="rounded-md px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.02em]"
              style={{ background: `${teamColor}1A`, color: teamColor }}>
              {deal.team}
            </span>
          )}
        </div>
      </div>
      {(deal.manager || deal.region) && (
        <p className="mt-1 text-[10.5px] text-[#615D59]">
          {[deal.manager, deal.region].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-between border-t border-[rgba(0,0,0,0.05)] pt-2">
        <span className="cursor-help text-[13px] font-bold tracking-[-0.01em] text-[#B43E3E]"
          title={`¥${cnyExact(deal.revenue)} · 시트 원값 · 반올림 없음`}>
          ¥{cny(deal.revenue)}
        </span>
        {deal.count === 1 && (
          <span className="text-[9.5px] font-medium text-[#9B9690]">{deal.id}</span>
        )}
      </div>
    </div>
  )
}

function PipelineColumn({ column, deals, onCardClick, ledgerHref }: {
  column: typeof CONFIDENCE_COLUMNS[number]
  deals: MergedRow[]
  onCardClick?: (d: MergedRow) => void
  ledgerHref?: (extra?: Record<string, string>) => string
}) {
  const total = deals.reduce((s, d) => s + d.revenue, 0)

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-[rgba(0,0,0,0.08)]"
      style={{ borderTop: `3px solid ${column.color}` }}>
      {/* Column header */}
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold text-[#111110]">{column.label}</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-1.5 text-[10.5px] font-bold text-[#111110]">
              {deals.length}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[17px] font-bold tracking-[-0.02em] text-[#111110]">
          <MoneyValue value={total} />
        </p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-[#615D59]">{column.description}</p>
      </div>
      {/* Card list — 정렬은 사용자가 고른 sortValue 기준(grouped 단계에서 정렬 완료, 기본 매출 desc) */}
      <div className="flex flex-col gap-2 overflow-y-auto px-3 pb-4" style={{ maxHeight: 520 }}>
        {deals.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-[11px] text-[#9B9690]">딜 없음</p>
          </div>
        ) : deals.map((d) => (
          <PipelineCard key={d.id} deal={d} onClick={() => onCardClick?.(d)} ledgerHref={ledgerHref} />
        ))}
      </div>
    </div>
  )
}

// 매출/고객명 정렬 옵션 — PipelineTable의 컬럼 헤더 클릭 정렬(항목 SortableTh)과
// 동등한 두 축(revenue/customer)을 칸반 컬럼 내 카드 순서에도 제공한다(품질 웨이브
// 4 — 항목 2). 컬럼이 카드 목록이라 헤더 클릭 대신 단일 셀렉트로 축약.
const SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "revenue-desc", label: "매출 높은순" },
  { value: "revenue-asc", label: "매출 낮은순" },
  { value: "customer-asc", label: "고객명 가나다순" },
  { value: "customer-desc", label: "고객명 역순" },
]

export default function BranchPipelineKanban({
  team, period, selectedMonth, refreshKey, onDealClick, initialQuery, initialManager, onFilterChange,
}: {
  team: Team
  period: Period
  selectedMonth: string
  refreshKey: number
  onDealClick?: (d: Row & { stageLabel: string; stageColor: string; probability?: number }) => void
  /** 품질 웨이브 5 — 항목 6. PipelineTable과 동일 규약 — 마운트 시 1회 초기값으로만
   *  쓰이고, 이후 변경은 onFilterChange로 부모(BranchDashboardClient)에 통지한다. */
  initialQuery?: string
  initialManager?: string
  onFilterChange?: (next: { query: string; manager: string }) => void
}) {
  // 담당 필터 — PipelineTable과 동일 멀티선택(품질 웨이브 4 — 항목 2, 이전엔 단일 select).
  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(() => initialManager ? new Set([initialManager]) : new Set())
  const [query, setQuery] = useState(initialQuery ?? "")
  const [sortValue, setSortValue] = useState<string>("revenue-desc")

  // PipelineTable.tsx와 동일 패턴 — 검색어/담당 변경을 부모에 통지해 URL(q/mgr) 동기화.
  useEffect(() => {
    onFilterChange?.({ query, manager: Array.from(selectedManagers)[0] ?? "" })
  }, [query, selectedManagers, onFilterChange])
  // 로컬 재시도 넛지 — BranchRegionHeatmap/PipelineTable과 동일 패턴(refreshKey에
  // 더해 로컬 카운터를 얹어 useBranchJson의 캐시키를 바꿔 재요청을 트리거).
  const [localRetry, setLocalRetry] = useState(0)
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const pipeline = useBranchJson<BranchPipelineResponse>(`/api/admin/branch/pipeline?team=${team}&period=${period}${monthQuery}`, refreshKey + localRetry)
  const pipelineRows = pipeline.data?.rows
  const rows = useMemo(() => pipeline.loading ? null : (pipelineRows ?? []), [pipeline.loading, pipelineRows])

  const managerOptions = useMemo(() => {
    if (!rows) return []
    return Array.from(new Set(rows.map((r) => r.manager).filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  // 장부 크로스링크 — PipelineTable.ledgerHref와 동일 컨텍스트 보존 규약(lens=rev&team=
  // &period=&month=&mgr=). 칸반엔 지역 필터가 없어 그 파라미터만 생략한다.
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
    return (extra?: Record<string, string>) => {
      const params = new URLSearchParams(base)
      if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v)
      return `/admin/branch/ledger?${params.toString()}`
    }
  }, [team, period, selectedMonth, query, selectedManagers])

  // 담당 멀티선택 중 장부로 전달되지 않는 나머지 선택값을 링크 title로 고지
  // (PipelineTable.crossLinkNotice와 동일 패턴).
  const crossLinkNotice = useMemo(() => {
    if (selectedManagers.size > 1) {
      return `담당 ${selectedManagers.size}명 중 "${Array.from(selectedManagers)[0]}"만 장부에 전달(장부는 단일 선택)`
    }
    return undefined
  }, [selectedManagers])

  const filteredRows = useMemo(() => {
    if (!rows) return null
    const tokens = tokenize(query)
    // PipelineTable(sections/PipelineTable.tsx)과 동일 4필드(고객/담당/팀/지역) AND
    // 매칭 — 두 화면(테이블·칸반)의 검색 결과가 어긋나지 않도록 필드 세트를 통일한다.
    return rows
      .filter((r) => selectedManagers.size === 0 || (r.manager !== null && selectedManagers.has(r.manager)))
      .filter((r) => matchesTokens(tokens, [r.customer, r.manager, r.team, r.region]))
  }, [rows, selectedManagers, query])

  const grouped = useMemo(() => {
    const byColumn: Record<ConfidenceColumnKey, Row[]> = {
      confirmed: [], "high-confidence": [], expected: [], unclassified: [],
    }
    if (filteredRows) for (const r of filteredRows) {
      byColumn[rowConfidenceBucket(r)].push(r)
    }
    const [sortField, sortDir] = sortValue.split("-") as ["revenue" | "customer", "asc" | "desc"]
    const out = {} as Record<ConfidenceColumnKey, MergedRow[]>
    for (const [columnKey, columnRows] of Object.entries(byColumn) as [ConfidenceColumnKey, Row[]][]) {
      const mergeMap = new Map<string, MergedRow>()
      for (const r of columnRows) {
        const key = r.customer.trim().toLowerCase()
        const existing = mergeMap.get(key)
        if (existing) {
          existing.revenue += r.revenue
          existing.count += 1
        } else {
          mergeMap.set(key, { ...r, count: 1 })
        }
      }
      // 정렬 셀렉트(sortValue) 기준 — 기본값(매출 높은순)은 이전 하드코딩 동작과 동일,
      // 사용자가 고객명 asc/desc로 바꾸면 그 축으로 정렬한다. 동률은 항상 고객명으로 타이브레이크.
      out[columnKey] = Array.from(mergeMap.values()).sort((a, b) => {
        const primary = sortField === "revenue"
          ? (sortDir === "desc" ? b.revenue - a.revenue : a.revenue - b.revenue)
          : (sortDir === "desc" ? b.customer.localeCompare(a.customer, "ko") : a.customer.localeCompare(b.customer, "ko"))
        return primary !== 0 ? primary : a.customer.localeCompare(b.customer, "ko")
      })
    }
    return out
  }, [filteredRows, sortValue])

  if (!rows) return <div className="h-72 animate-pulse rounded-xl bg-[#f0f0ec]" />
  // 에러를 빈 상태("딜 없음" 4컬럼)로 위장하지 않는다 — pipeline.error가 있으면
  // 에러 배너 + 재시도로 명시한다(PipelineTable/BranchRegionHeatmap과 동일 원칙).
  if (pipeline.error) return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] p-4 text-[12px] font-semibold text-[#8F2C2C]"
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
  )

  const totalAll = (filteredRows ?? []).reduce((s, r) => s + r.revenue, 0)
  const confirmedTotal = grouped.confirmed.reduce((s, d) => s + d.revenue, 0)
  const dealCount = filteredRows?.length ?? 0

  return (
    <>
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-b border-[rgba(0,0,0,0.06)] px-5 py-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-[#615D59]">총 파이프라인</span>
          <span className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]"><MoneyValue value={totalAll} /></span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-[#615D59]">확정 합계</span>
          <span className="text-[13px] font-bold" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}><MoneyValue value={confirmedTotal} /></span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-[#615D59]">딜</span>
          <span className="text-[13px] font-bold text-[#111110]">{dealCount}건</span>
        </div>
        {(() => {
          const merged = CONFIDENCE_COLUMNS.reduce((s, c) => s + grouped[c.key].length, 0)
          return dealCount !== merged ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-[#615D59]">고객</span>
              <span className="text-[13px] font-bold text-[#111110]">{merged}개사</span>
            </div>
          ) : null
        })()}
        {/* 장부 크로스링크 — PipelineTable "장부에서 열기 ↗"와 동일 컨텍스트 보존 규약
            (품질 웨이브 4 — 항목 2, 테이블·칸반 기능 동등화). */}
        <Link
          href={ledgerHref()}
          title={crossLinkNotice}
          className="text-[11px] font-medium text-[#084734] underline-offset-2 hover:underline"
        >
          장부에서 열기 ↗
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <label className="relative">
            <span className="sr-only">칸반 검색</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#111110]/35" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="고객, 담당, 팀, 지역 검색"
              className="h-7 w-40 rounded-full border border-[rgba(0,0,0,0.08)] bg-white pl-8 pr-3 text-[11px] outline-none transition focus:border-[#111110]/30"
            />
          </label>
          <label htmlFor="kanban-sort" className="text-[11px] text-[#615D59]">정렬</label>
          <select
            id="kanban-sort"
            value={sortValue}
            onChange={(e) => setSortValue(e.target.value)}
            className="h-7 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[11px] font-medium text-[#111110] outline-none transition hover:border-[#111110]/25 focus:border-[#111110]/30"
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <MultiSelect
            label="담당"
            options={managerOptions}
            selected={selectedManagers}
            onChange={setSelectedManagers}
            placeholder="전체"
            align="right"
            width="w-44"
          />
        </div>
      </div>
      {/* Kanban grid — 1-col on mobile, 2-col on md, 4-col on xl */}
      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        {CONFIDENCE_COLUMNS.map((c) => (
          <PipelineColumn key={c.key} column={c} deals={grouped[c.key]} ledgerHref={ledgerHref}
            onCardClick={(d) => onDealClick?.({ ...d, stageLabel: c.label, stageColor: c.color })} />
        ))}
      </div>
    </>
  )
}
