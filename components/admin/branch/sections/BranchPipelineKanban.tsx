"use client"
import { Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useBranchJson } from "../client-api"
import type { BranchPipelineResponse, BranchPipelineRow, Period, Team } from "../types"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { CONFIDENCE_TOKENS, type ConfidenceKey } from "@/lib/branch/confidence-tokens"
import { ledgerMonthSplit } from "@/lib/branch/computations/revenue-core"
import MoneyValue from "../MoneyValue"

type Row = BranchPipelineRow

// 공백으로 나뉜 다중 토큰 AND 매칭 — PipelineTable(sections/PipelineTable.tsx)의
// tokenize/matchesTokens와 동일한 규약. 파일 간 공유 유틸로 빼지 않고 각자 소유
// 범위 안에서 인라인 유지(두 파일 모두 이 세션의 소유 스코프).
function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

function matchesTokens(tokens: string[], fields: Array<string | null | undefined>): boolean {
  if (tokens.length === 0) return true
  return tokens.every((token) => fields.some((f) => String(f ?? "").toLowerCase().includes(token)))
}

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

const TEAM_COLOR: Record<string, string> = {
  BD: "#084734",
  MKT: "#7B8B36",
  CSM: "#A8741A",
}

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

function PipelineCard({ deal, onClick }: { deal: MergedRow; onClick?: () => void }) {
  const teamColor = (deal.team && TEAM_COLOR[deal.team]) || "#615D59"
  return (
    <button type="button" onClick={onClick}
      className="group block w-full rounded-xl border border-[rgba(0,0,0,0.07)] bg-white px-3.5 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.09)]">
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 text-[12.5px] font-bold leading-snug text-[#111110]">{deal.customer}</p>
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
    </button>
  )
}

function PipelineColumn({ column, deals, onCardClick }: {
  column: typeof CONFIDENCE_COLUMNS[number]
  deals: MergedRow[]
  onCardClick?: (d: MergedRow) => void
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
      {/* Card list — 컬럼 내 정렬은 매출 desc(grouped 단계에서 정렬 완료) */}
      <div className="flex flex-col gap-2 overflow-y-auto px-3 pb-4" style={{ maxHeight: 520 }}>
        {deals.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-[11px] text-[#9B9690]">딜 없음</p>
          </div>
        ) : deals.map((d) => (
          <PipelineCard key={d.id} deal={d} onClick={() => onCardClick?.(d)} />
        ))}
      </div>
    </div>
  )
}

export default function BranchPipelineKanban({ team, period, selectedMonth, refreshKey, onDealClick }: {
  team: Team
  period: Period
  selectedMonth: string
  refreshKey: number
  onDealClick?: (d: Row & { stageLabel: string; stageColor: string; probability?: number }) => void
}) {
  const [selectedManager, setSelectedManager] = useState("")
  const [query, setQuery] = useState("")
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const pipeline = useBranchJson<BranchPipelineResponse>(`/api/admin/branch/pipeline?team=${team}&period=${period}${monthQuery}`, refreshKey)
  const pipelineRows = pipeline.data?.rows
  const rows = useMemo(() => pipeline.loading ? null : (pipelineRows ?? []), [pipeline.loading, pipelineRows])

  const managerOptions = useMemo(() => {
    if (!rows) return []
    return Array.from(new Set(rows.map((r) => r.manager).filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  const filteredRows = useMemo(() => {
    if (!rows) return null
    const tokens = tokenize(query)
    return rows
      .filter((r) => !selectedManager || r.manager === selectedManager)
      .filter((r) => matchesTokens(tokens, [r.customer, r.manager]))
  }, [rows, selectedManager, query])

  const grouped = useMemo(() => {
    const byColumn: Record<ConfidenceColumnKey, Row[]> = {
      confirmed: [], "high-confidence": [], expected: [], unclassified: [],
    }
    if (filteredRows) for (const r of filteredRows) {
      byColumn[rowConfidenceBucket(r)].push(r)
    }
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
      out[columnKey] = Array.from(mergeMap.values()).sort((a, b) => b.revenue - a.revenue || a.customer.localeCompare(b.customer, "ko"))
    }
    return out
  }, [filteredRows])

  if (!rows) return <div className="h-72 animate-pulse rounded-xl bg-[#f0f0ec]" />

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
        <div className="ml-auto flex items-center gap-1.5">
          <label className="relative">
            <span className="sr-only">칸반 검색</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#111110]/35" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="고객, 담당 검색"
              className="h-7 w-40 rounded-full border border-[rgba(0,0,0,0.08)] bg-white pl-8 pr-3 text-[11px] outline-none transition focus:border-[#111110]/30"
            />
          </label>
          <label htmlFor="kanban-manager-filter" className="text-[11px] text-[#615D59]">담당자</label>
          <select
            id="kanban-manager-filter"
            value={selectedManager}
            onChange={(e) => setSelectedManager(e.target.value)}
            disabled={managerOptions.length === 0}
            className="h-7 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[11px] font-medium text-[#111110] outline-none transition hover:border-[#111110]/25 focus:border-[#111110]/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">전체</option>
            {managerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      {/* Kanban grid — 1-col on mobile, 2-col on md, 4-col on xl */}
      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        {CONFIDENCE_COLUMNS.map((c) => (
          <PipelineColumn key={c.key} column={c} deals={grouped[c.key]}
            onCardClick={(d) => onDealClick?.({ ...d, stageLabel: c.label, stageColor: c.color })} />
        ))}
      </div>
    </>
  )
}
