"use client"
import { useEffect, useMemo, useState } from "react"
import type { Team } from "../types"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function cny(n: number) {
  if (!Number.isFinite(n)) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`
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

const STAGES = [
  { key: "discovery",   label: "발견",   color: "#A8741A", probability: 25 },
  { key: "qualified",   label: "적격",   color: "#7B8B36", probability: 50 },
  { key: "proposal",    label: "제안",   color: "#1E5DA8", probability: 70 },
  { key: "negotiation", label: "협의",   color: "#084734", probability: 90 },
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

function PipelineCard({ deal, onClick }: { deal: Row; onClick?: () => void }) {
  const teamColor = (deal.team && TEAM_COLOR[deal.team]) || "#615D59"
  const stageIdx = hashStageIndex(deal.id)
  const stage = STAGES[stageIdx]
  return (
    <button type="button" onClick={onClick}
      className="block w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition hover:-translate-y-px hover:shadow-md"
      style={{ borderLeft: `3px solid ${teamColor}` }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[0.04em]" style={{ color: teamColor }}>{deal.team ?? "-"}</span>
        <span className="text-[10px] text-[#615D59]">{deal.id}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] font-bold leading-tight text-[#111110]">{deal.customer}</p>
      <p className="mt-0.5 text-[10.5px] text-[#615D59]">
        {deal.region ?? "-"} · {deal.manager ?? "-"}
      </p>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[14px] font-bold tracking-[-0.01em]" style={{ color: stageIdx >= 2 ? "#B43E3E" : "#1E5DA8" }}>
          ¥{cny(deal.revenue)}
        </span>
        <span className="text-[10.5px] font-bold" style={{ color: stage.color }}>
          {stage.probability}%
        </span>
      </div>
    </button>
  )
}

function PipelineColumn({ stage, deals, onCardClick }: { stage: typeof STAGES[number]; deals: Row[]; onCardClick?: (d: Row) => void }) {
  const total = deals.reduce((s, d) => s + d.revenue, 0)
  const weighted = deals.reduce((s, d) => s + d.revenue * (stage.probability / 100), 0)
  return (
    <div className="flex min-w-[240px] flex-1 flex-col gap-2.5 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3.5"
      style={{ borderTop: `3px solid ${stage.color}` }}>
      <div>
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#111110]">{stage.label}</span>
            <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2 py-0.5 text-[10.5px] font-bold text-[#111110]">
              {deals.length}
            </span>
          </div>
          <span className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: stage.color }}>
            ¥{cny(total)}
          </span>
        </div>
        <p className="mt-1 text-[10.5px] text-[#615D59]">
          가중 가치 <span className="font-semibold text-[#111110]">¥{cny(weighted)}</span> · 확률 {stage.probability}%
        </p>
      </div>
      <div className="flex max-h-[600px] flex-col gap-2 overflow-y-auto">
        {deals.length === 0 ? (
          <p className="py-5 text-center text-[11px] text-[#615D59]">딜 없음</p>
        ) : deals.map((d) => <PipelineCard key={d.id} deal={d} onClick={() => onCardClick?.(d)} />)}
      </div>
    </div>
  )
}

export default function BranchPipelineKanban({ team, refreshKey, onDealClick }: { team: Team; refreshKey: number; onDealClick?: (d: Row & { stageLabel: string; stageColor: string; probability: number }) => void }) {
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
    const out: Record<string, Row[]> = {}
    STAGES.forEach((s) => { out[s.key] = [] })
    if (rows) for (const r of rows) {
      const k = STAGES[hashStageIndex(r.id)].key
      out[k].push(r)
    }
    return out
  }, [rows])

  if (!rows) return <div className="h-72 animate-pulse rounded-xl bg-[#f0f0ec]" />

  const totalAll = rows.reduce((s, r) => s + r.revenue, 0)
  const totalWeighted = STAGES.reduce((s, st) => s + grouped[st.key].reduce((a, d) => a + d.revenue * (st.probability / 100), 0), 0)

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">파이프라인 칸반 (MVP)</h2>
          <p className="mt-0.5 text-[11px] text-[#615D59]">
            단계별 분포는 임시 매핑 — 실제 stage 필드 연동 전까지 시각 확인용. <span className="font-semibold text-[#1E5DA8]">파랑 = 가능성</span> · <span className="font-semibold text-[#B43E3E]">빨강 = 확정 임박</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[16px] font-bold leading-none tracking-[-0.01em] text-[#111110]">¥{cny(totalAll)}</p>
          <p className="mt-0.5 text-[10.5px] text-[#615D59]">총 합 · 가중 ¥{cny(totalWeighted)}</p>
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        <div className="flex gap-3" style={{ minWidth: 240 * STAGES.length }}>
          {STAGES.map((s) => (
            <PipelineColumn key={s.key} stage={s} deals={grouped[s.key]}
              onCardClick={(d) => onDealClick?.({ ...d, stageLabel: s.label, stageColor: s.color, probability: s.probability })} />
          ))}
        </div>
      </div>
    </section>
  )
}
