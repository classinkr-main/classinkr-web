"use client"
import { useEffect, useState, useCallback } from "react"
import type { Team } from "../BranchDashboardClient"
import { RefreshCw } from "lucide-react"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

interface NextAction { title: string; why: string; owner: string; due?: string }
interface InsightResp {
  from: "cache" | "fresh" | "stale" | "error"
  insight?: {
    one_liner: string | null
    next_actions: NextAction[]
    generated_at: string
  }
  error?: string
}

export default function InsightCard({ team, refreshKey }: { team: Team; refreshKey: number }) {
  const [data, setData] = useState<InsightResp | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (force: boolean) => {
    setBusy(true)
    try {
      const r = await adminFetch(`/api/admin/branch/insights?team=${team}${force ? "&force=1" : ""}`)
      setData(await r.json() as InsightResp)
    } catch (e) {
      setData({ from: "error", error: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }, [team])
  useEffect(() => { load(false) }, [load, refreshKey])
  const insight = data?.insight
  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-[#ECFDF5] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase text-[#084734]/70">AI 인사이트</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-[#084734]">
            {insight?.one_liner ?? (data?.error ? `오류: ${data.error}` : "분석 중...")}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => load(true)}
          className="inline-flex items-center gap-1 rounded-full bg-[#084734] px-3 py-1.5 text-[11px] text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "분석 중..." : "다시 분석"}
        </button>
      </div>
      <ol className="mt-4 space-y-2 text-[12px] leading-5 text-[#084734]">
        {insight?.next_actions?.map((a, i) => (
          <li key={i} className="rounded-xl bg-white/70 p-3">
            <p className="font-semibold">{i + 1}. {a.title}</p>
            <p className="mt-1 text-[11px] text-[#084734]/75">{a.why}</p>
            <p className="mt-1 text-[10px] text-[#084734]/55">담당 {a.owner}{a.due ? ` · 기한 ${a.due}` : ""}</p>
          </li>
        ))}
      </ol>
      {data?.from === "stale" && <p className="mt-2 text-[10px] text-amber-700">stale 캐시 (LLM 호출 실패)</p>}
    </section>
  )
}
