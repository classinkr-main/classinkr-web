"use client"
import { useEffect, useMemo, useState } from "react"
import type { Team } from "../types"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function cny(n: number) {
  if (!Number.isFinite(n)) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`
  return n.toLocaleString()
}

interface Row {
  id: string
  customer: string
  manager: string | null
  team: string | null
  region: string | null
  revenue: number
}

interface MergedRow extends Row {
  count: number  // number of deals merged under this customer
}

const STAGES = [
  { key: "discovery",   label: "발견",   color: "#A8741A", bg: "rgba(168,116,26,0.08)",  probability: 25 },
  { key: "qualified",   label: "적격",   color: "#7B8B36", bg: "rgba(123,139,54,0.08)",  probability: 50 },
  { key: "proposal",    label: "제안",   color: "#1E5DA8", bg: "rgba(30,93,168,0.08)",   probability: 70 },
  { key: "negotiation", label: "협의",   color: "#084734", bg: "rgba(8,71,52,0.08)",     probability: 90 },
] as const

const TEAM_COLOR: Record<string, string> = {
  BD: "#084734",
  MKT: "#7B8B36",
  CSM: "#A8741A",
}

function hashStageIndex(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
  return Math.abs(h) % STAGES.length
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
        <span className="text-[13px] font-bold tracking-[-0.01em] text-[#B43E3E]">
          ₩{cny(deal.revenue)}
        </span>
        {deal.count === 1 && (
          <span className="text-[9.5px] font-medium text-[#9B9690]">{deal.id}</span>
        )}
      </div>
    </button>
  )
}

function PipelineColumn({ stage, deals, onCardClick }: {
  stage: typeof STAGES[number]
  deals: MergedRow[]
  onCardClick?: (d: MergedRow) => void
}) {
  const total = deals.reduce((s, d) => s + d.revenue, 0)
  const weighted = Math.round(total * (stage.probability / 100))

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-[rgba(0,0,0,0.08)]"
      style={{ borderTop: `3px solid ${stage.color}` }}>
      {/* Column header */}
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold text-[#111110]">{stage.label}</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-1.5 text-[10.5px] font-bold text-[#111110]">
              {deals.length}
            </span>
          </div>
          <span className="rounded-md px-2 py-0.5 text-[10px] font-bold"
            style={{ background: stage.bg, color: stage.color }}>
            {stage.probability}%
          </span>
        </div>
        <p className="mt-2.5 text-[17px] font-bold tracking-[-0.02em] text-[#111110]">
          ₩{cny(total)}
        </p>
        <p className="mt-0.5 text-[10.5px] text-[#615D59]">
          가중 <span className="font-semibold text-[#111110]">₩{cny(weighted)}</span>
        </p>
        {/* Probability fill bar */}
        <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[rgba(0,0,0,0.06)]">
          <div className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${stage.probability}%`, background: stage.color }} />
        </div>
      </div>
      {/* Card list */}
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

export default function BranchPipelineKanban({ team, refreshKey, onDealClick }: {
  team: Team
  refreshKey: number
  onDealClick?: (d: Row & { stageLabel: string; stageColor: string; probability: number }) => void
}) {
  const requestKey = `${refreshKey}:${team}`
  const [state, setState] = useState<{ key: string; rows: Row[] | null }>({ key: requestKey, rows: null })
  const rows = state.key === requestKey ? state.rows : null

  useEffect(() => {
    let active = true
    void adminFetch(`/api/admin/branch/pipeline?team=${team}`)
      .then((r) => r.json())
      .then((d) => { if (active) setState({ key: requestKey, rows: d.rows ?? [] }) })
      .catch(() => { if (active) setState({ key: requestKey, rows: [] }) })
    return () => { active = false }
  }, [requestKey, team])

  const grouped = useMemo(() => {
    const byStage: Record<string, Row[]> = {}
    STAGES.forEach((s) => { byStage[s.key] = [] })
    if (rows) for (const r of rows) {
      byStage[STAGES[hashStageIndex(r.id)].key].push(r)
    }
    const out: Record<string, MergedRow[]> = {}
    for (const [stageKey, stageRows] of Object.entries(byStage)) {
      const mergeMap = new Map<string, MergedRow>()
      for (const r of stageRows) {
        const key = r.customer.trim().toLowerCase()
        const existing = mergeMap.get(key)
        if (existing) {
          existing.revenue += r.revenue
          existing.count += 1
        } else {
          mergeMap.set(key, { ...r, count: 1 })
        }
      }
      out[stageKey] = Array.from(mergeMap.values())
    }
    return out
  }, [rows])

  if (!rows) return <div className="h-72 animate-pulse rounded-xl bg-[#f0f0ec]" />

  const totalAll = rows.reduce((s, r) => s + r.revenue, 0)
  const totalWeighted = STAGES.reduce(
    (s, st) => s + grouped[st.key].reduce((a, d) => a + d.revenue * (st.probability / 100), 0), 0
  )

  return (
    <>
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-b border-[rgba(0,0,0,0.06)] px-5 py-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-[#615D59]">총 파이프라인</span>
          <span className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">₩{cny(totalAll)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-[#615D59]">가중 합산</span>
          <span className="text-[13px] font-bold text-[#084734]">₩{cny(Math.round(totalWeighted))}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-[#615D59]">딜</span>
          <span className="text-[13px] font-bold text-[#111110]">{rows.length}건</span>
        </div>
        {(() => {
          const merged = STAGES.reduce((s, st) => s + grouped[st.key].length, 0)
          return rows.length !== merged ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-[#615D59]">고객</span>
              <span className="text-[13px] font-bold text-[#111110]">{merged}개사</span>
            </div>
          ) : null
        })()}
      </div>
      {/* Kanban grid — 2-col on md, 4-col on xl */}
      <div className="grid grid-cols-2 gap-4 p-5 xl:grid-cols-4">
        {STAGES.map((s) => (
          <PipelineColumn key={s.key} stage={s} deals={grouped[s.key]}
            onCardClick={(d) => onDealClick?.({ ...d, stageLabel: s.label, stageColor: s.color, probability: s.probability })} />
        ))}
      </div>
    </>
  )
}
