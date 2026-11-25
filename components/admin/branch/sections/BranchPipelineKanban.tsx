"use client"
import { branchTeamLabel } from "@/lib/branch/current-organization"
import Link from "next/link"
import { RotateCcw, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useBranchJson } from "../client-api"
import { matchesTokens, tokenize } from "../search-tokens"
import MultiSelect from "../MultiSelect"
import { type BranchPipelineResponse, type BranchPipelineRow, type Period, type Team } from "../types"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import {
  groupPipelineByConfidence,
  type MergedPipelineRow,
  type PipelineConfidenceGroupKey,
  type PipelineSortValue,
} from "@/lib/branch/pipeline-confidence-groups"
import { teamColorOf } from "@/lib/branch/team-colors"
import MoneyValue from "../MoneyValue"

type Row = BranchPipelineRow
type MergedRow = MergedPipelineRow<Row>

// 확도 기반 칸반 컬럼 — 분류·고객 합치기·정렬은 lib/branch/pipeline-confidence-groups.ts가 정본이다
// (파이프라인 탭 위쪽 '이번에 닫을 것 / 확도를 올릴 것' 목록과 같은 함수). 색 데이터가 없는 딜은
// "미분류"로 정직하게 남긴다 — 존재하지 않는 확률·단계를 발명하지 않는다.
type ConfidenceColumnKey = PipelineConfidenceGroupKey

/** 열마다 처음에 보여 줄 카드 수. 나머지는 '더 보기'로 펼친다(열 안 스크롤 없음). */
const COLUMN_PAGE_SIZE = 6

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

function PipelineCard({ deal, onClick, ledgerHref, amountColor }: {
  deal: MergedRow
  onClick?: () => void
  /** 금액 글자색 — 그 카드가 놓인 확도 열의 색(확도 토큰). 미분류는 웜 그레이. */
  amountColor: string
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
              {branchTeamLabel(deal.team)}
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
        {/* 원천 행 id(UUID)는 사람이 읽는 값이 아니라 카드에 싣지 않는다 — 상세는 카드를 눌러 연다. */}
        <span className="cursor-help text-[13px] font-bold tracking-[-0.01em]" style={{ color: amountColor }}
          title={`¥${cnyExact(deal.revenue)} · 시트 원값 · 반올림 없음`}>
          ¥{cny(deal.revenue)}
        </span>
      </div>
    </div>
  )
}

function PipelineColumn({ column, deals, onCardClick, ledgerHref, skipLeading = 0 }: {
  column: typeof CONFIDENCE_COLUMNS[number]
  deals: MergedRow[]
  onCardClick?: (d: MergedRow) => void
  ledgerHref?: (extra?: Record<string, string>) => string
  /** 위쪽 할 일 목록이 이미 보여 준 상위 카드 수 — 같은 딜을 두 번 싣지 않으려고 건너뛴다.
   *  열 합계·건수는 건너뛴 카드까지 포함한 전체 값이다. */
  skipLeading?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const total = deals.reduce((s, d) => s + d.revenue, 0)
  const rest = deals.slice(skipLeading)
  const visible = expanded ? rest : rest.slice(0, COLUMN_PAGE_SIZE)
  const hidden = rest.length - visible.length
  const amountColor = column.key === "unclassified" ? "#615D59" : CONFIDENCE_TOKENS[column.key].strongColor

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
        {skipLeading > 0 && deals.length > 0 ? (
          <p className="mt-1 text-[10.5px] font-semibold text-[#615D59]">상위 {Math.min(skipLeading, deals.length)}곳은 위 목록에 있음</p>
        ) : null}
      </div>
      {/* Card list — 정렬은 사용자가 고른 sortValue 기준(grouped 단계에서 정렬 완료, 기본 매출 desc).
          열 안 스크롤 대신 처음 COLUMN_PAGE_SIZE장만 보이고 '더 보기'로 펼친다. */}
      <div className="flex flex-col gap-2 px-3 pb-4">
        {deals.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-[11px] text-[#615D59]">딜 없음</p>
          </div>
        ) : visible.map((d) => (
          <PipelineCard key={d.id} deal={d} amountColor={amountColor} onClick={() => onCardClick?.(d)} ledgerHref={ledgerHref} />
        ))}
        {hidden > 0 || expanded ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="inline-flex min-h-11 items-center justify-center rounded-md px-2 text-[11.5px] font-semibold text-[#084734] hover:underline md:min-h-8"
          >
            {expanded ? "접기" : `${hidden}곳 더 보기`}
          </button>
        ) : null}
      </div>
    </div>
  )
}

// 매출/고객명 정렬 옵션 — PipelineTable의 컬럼 헤더 클릭 정렬(항목 SortableTh)과
// 동등한 두 축(revenue/customer)을 칸반 컬럼 내 카드 순서에도 제공한다(품질 웨이브
// 4 — 항목 2). 컬럼이 카드 목록이라 헤더 클릭 대신 단일 셀렉트로 축약.
const SORT_OPTIONS: ReadonlyArray<{ value: PipelineSortValue; label: string }> = [
  { value: "revenue-desc", label: "매출 높은순" },
  { value: "revenue-asc", label: "매출 낮은순" },
  { value: "customer-asc", label: "고객명 가나다순" },
  { value: "customer-desc", label: "고객명 역순" },
]

export default function BranchPipelineKanban({
  scopeManager, team, period, selectedMonth, refreshKey, onDealClick, initialQuery, initialManager, onFilterChange, coveredLeading,
}: {
  scopeManager?: string
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
  /** 위쪽 할 일 목록(PipelineActionBoard)이 열마다 이미 보여 준 상위 카드 수. 기본 정렬(매출 높은순)·
   *  검색어 없음·담당 1명 이하일 때만 건너뛴다 — 그 밖에는 목록과 순서가 달라 건너뛰면 빠지는 딜이 생긴다. */
  coveredLeading?: Partial<Record<ConfidenceColumnKey, number>>
}) {
  // 담당 필터 — PipelineTable과 동일 멀티선택(품질 웨이브 4 — 항목 2, 이전엔 단일 select).
  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(() => initialManager ? new Set([initialManager]) : new Set())
  const [query, setQuery] = useState(initialQuery ?? "")
  const [sortValue, setSortValue] = useState<PipelineSortValue>("revenue-desc")

  // PipelineTable.tsx와 동일 패턴 — 검색어/담당 변경을 부모에 통지해 URL(q/mgr) 동기화.
  useEffect(() => {
    onFilterChange?.({ query, manager: Array.from(selectedManagers)[0] ?? "" })
  }, [query, selectedManagers, onFilterChange])
  // 로컬 재시도 넛지 — BranchRegionHeatmap/PipelineTable과 동일 패턴(refreshKey에
  // 더해 로컬 카운터를 얹어 useBranchJson의 캐시키를 바꿔 재요청을 트리거).
  const [localRetry, setLocalRetry] = useState(0)
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const pipeline = useBranchJson<BranchPipelineResponse>(`/api/admin/branch/pipeline?team=${team}&period=${period}${monthQuery}${scopeManager ? `&manager=${encodeURIComponent(scopeManager)}` : ""}`, refreshKey + localRetry)
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

  const grouped = useMemo(
    () => groupPipelineByConfidence(filteredRows ?? [], sortValue),
    [filteredRows, sortValue],
  )
  const skipCovered = sortValue === "revenue-desc" && query.trim() === "" && selectedManagers.size <= 1

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
            onChange={(e) => setSortValue(e.target.value as PipelineSortValue)}
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
      {/* Kanban grid — 1-col on mobile, 2-col on md, xl는 확정·고확도·예정 3열 + 좁은 미분류 열 */}
      <div className="grid grid-cols-1 items-start gap-4 p-5 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(200px,0.6fr)]">
        {CONFIDENCE_COLUMNS.map((c) => (
          <PipelineColumn key={c.key} column={c} deals={grouped[c.key]} ledgerHref={ledgerHref}
            skipLeading={skipCovered ? coveredLeading?.[c.key] ?? 0 : 0}
            onCardClick={(d) => onDealClick?.({ ...d, stageLabel: c.label, stageColor: c.color })} />
        ))}
      </div>
    </>
  )
}
