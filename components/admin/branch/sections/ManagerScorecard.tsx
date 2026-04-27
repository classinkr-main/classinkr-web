"use client"
import { useEffect, useState } from "react"
import { Sparkles, AlertTriangle } from "lucide-react"
import type { Team, Period } from "../types"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

interface MemberRow {
  member: string; team: string|null
  goal: number; status: number; achievement_pct: number
  confirmed: number; deals_total: number; deals_confirmed: number
  new_renew: { new: number; renew: number }
  kpi: Record<string, { goal: number; actual: number }>
}

interface ManagerInsightResp {
  manager: string
  team: string | null
  fiscalPeriod: string
  scope: string
  result: {
    summary: string
    strengths: string[]
    risks: string[]
    next_actions: Array<{ title: string; why: string; due?: string }>
  }
  model: string
  error?: string
}

function ManagerInsightPanel({ manager }: { manager: string }) {
  const [data, setData] = useState<ManagerInsightResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await adminFetch(`/api/admin/branch/insights/manager?name=${encodeURIComponent(manager)}`)
      const json = await r.json() as ManagerInsightResp
      if (!r.ok) { setErr(json.error ?? `${r.status}`); return }
      setData(json)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-3 border-t border-[#f0f0ec] pt-3">
      {!data && !busy && !err && (
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-full bg-[#084734] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#084734]/90"
        >
          <Sparkles className="h-3 w-3" /> 이 매니저 분석
        </button>
      )}
      {busy && (
        <div className="flex items-center gap-2 text-[10px] text-[#1a1a1a]/55">
          <Sparkles className="h-3 w-3 animate-pulse" /> 분석 중... (보통 5~10초)
        </div>
      )}
      {err && (
        <div className="flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1.5 text-[10px] text-rose-700">
          <AlertTriangle className="h-3 w-3" /> {err}
        </div>
      )}
      {data && (
        <div className="space-y-2 text-[11px]">
          <p className="font-semibold text-[#084734]">{data.result.summary}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-medium text-emerald-700">강점</p>
              <ul className="space-y-0.5 text-[10px] text-[#1a1a1a]/70">
                {data.result.strengths.map((s, i) => <li key={i}>· {s}</li>)}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium text-rose-700">리스크</p>
              <ul className="space-y-0.5 text-[10px] text-[#1a1a1a]/70">
                {data.result.risks.map((s, i) => <li key={i}>· {s}</li>)}
              </ul>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium text-[#084734]">다음 액션</p>
            <ol className="space-y-1 text-[10px] text-[#1a1a1a]/70">
              {data.result.next_actions.map((a, i) => (
                <li key={i} className="rounded bg-[#fafaf8] p-1.5">
                  <span className="font-medium text-[#111110]">{i + 1}. {a.title}</span>
                  <p className="mt-0.5 text-[#1a1a1a]/55">{a.why}</p>
                  {a.due && <p className="text-[#1a1a1a]/40">기한 {a.due}</p>}
                </li>
              ))}
            </ol>
          </div>
          <p className="text-right text-[9px] text-[#1a1a1a]/40">{data.model} · {data.fiscalPeriod}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[10px] text-[#084734]/60 underline hover:text-[#084734]"
          >다시 분석</button>
        </div>
      )}
    </div>
  )
}

export default function ManagerScorecard({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<MemberRow[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void adminFetch(`/api/admin/branch/kpi?team=${team}&period=${period}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setRows((d as { members?: MemberRow[] }).members ?? []) })
      .catch(() => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [team, period, refreshKey])
  if (!rows) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (rows.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">매니저 스코어카드</h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((m) => (
          <div key={m.member} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-semibold">{m.member}</p>
              <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px]">{m.team ?? "?"}</span>
            </div>
            <p className="mt-2 text-[18px] font-bold">{m.achievement_pct.toFixed(0)}%</p>
            <p className="mt-1 text-[11px] text-[#1a1a1a]/45">실적 ₩{fmt(m.confirmed)} / 목표 ₩{fmt(m.goal)}</p>
            <p className="mt-2 text-[11px] text-[#1a1a1a]/55">딜 {m.deals_total}건 (확정 {m.deals_confirmed}) · 신규 {m.new_renew.new} · 갱신 {m.new_renew.renew}</p>
            <div className="mt-2 grid grid-cols-5 gap-1 text-[10px]">
              {Object.entries(m.kpi).map(([k, v]) => {
                const pct = v.goal > 0 ? (v.actual / v.goal) * 100 : 0
                return (
                  <div key={k} className="rounded bg-[#fafaf8] px-1.5 py-1 text-center">
                    <div className="text-[#1a1a1a]/55">{k}</div>
                    <div className="font-medium">{pct.toFixed(0)}%</div>
                  </div>
                )
              })}
            </div>
            <ManagerInsightPanel manager={m.member} />
          </div>
        ))}
      </div>
    </section>
  )
}
