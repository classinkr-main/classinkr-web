"use client"
import { useEffect, useState, useCallback } from "react"
import type { Team } from "../types"
import { RefreshCw, History, AlertTriangle } from "lucide-react"

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

interface NextAction { title: string; why: string; owner: string; due?: string }

interface InsightPayload {
  id: string
  one_liner: string | null
  next_actions: NextAction[]
  generated_at: string
  fiscal_period?: string
  raw_response?: { _model?: string; _mode?: string; _retried?: boolean; _warnings?: unknown[] } | null
}

interface InsightResp {
  from: "cache" | "fresh" | "stale" | "error"
  insight?: InsightPayload
  error?: string
  numerical_warnings?: Array<{ field: string; value: number; representation: string; reason: string }>
  retried?: boolean
}

interface HistoryItem {
  id: string
  generated_at: string
  one_liner: string | null
  next_actions: NextAction[]
  fiscal_period: string
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diffMs = Date.now() - t
  if (!Number.isFinite(diffMs) || diffMs < 0) return new Date(iso).toLocaleString("ko-KR")
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}일 전`
  return new Date(iso).toLocaleDateString("ko-KR")
}

export default function InsightCard({ team, refreshKey }: { team: Team; refreshKey: number }) {
  const [data, setData] = useState<InsightResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)

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

  const loadHistory = useCallback(async () => {
    try {
      const r = await adminFetch(`/api/admin/branch/insights/history?team=${team}&limit=10`)
      const json = await r.json() as { items?: HistoryItem[]; error?: string }
      if (json.items) setHistory(json.items)
    } catch {
      setHistory([])
    }
  }, [team])

  useEffect(() => { void load(false) }, [load, refreshKey])

  const insight = data?.insight
  const warnings = data?.numerical_warnings ?? []
  const stale = data?.from === "stale"
  const meta = insight?.raw_response
  const isFast = meta?._mode === "fast"

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-[#ECFDF5] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-medium uppercase text-[#084734]/70">AI 인사이트</p>
            {insight?.fiscal_period && (
              <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] text-[#084734]/70">{insight.fiscal_period}</span>
            )}
            {meta?._model && (
              <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] text-[#084734]/55">{isFast ? "⚡ " : ""}{meta._model}</span>
            )}
            {data?.retried && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">재시도됨</span>
            )}
            {warnings.length > 0 && (
              <span title={warnings.map((w) => w.reason).join("\n")} className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-800">
                <AlertTriangle className="h-3 w-3" /> 수치 검증 {warnings.length}건
              </span>
            )}
            {stale && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">stale 캐시</span>}
          </div>
          <p className="mt-2 text-[15px] font-semibold leading-snug text-[#084734]">
            {insight?.one_liner ?? (data?.error ? `오류: ${data.error}` : busy ? "분석 중..." : "데이터 없음")}
          </p>
          {insight && (
            <p className="mt-1 text-[10px] text-[#084734]/55">
              {relativeTime(insight.generated_at)} 생성
              {data?.from === "cache" && " · 캐시"}
              {data?.from === "fresh" && " · 방금 생성"}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load(true)}
          className="inline-flex items-center gap-1 rounded-full bg-[#084734] px-3 py-1.5 text-[11px] text-white disabled:opacity-50"
          title="가까운 모델로 빠르게 다시 분석"
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
        {!insight && !busy && !data?.error && (
          <li className="rounded-xl border border-dashed border-[#084734]/20 bg-white/50 p-4 text-center text-[11px] text-[#084734]/55">
            아직 생성된 인사이트가 없습니다. &quot;다시 분석&quot; 버튼을 눌러 시작하세요.
          </li>
        )}
      </ol>

      <div className="mt-4 border-t border-[#084734]/10 pt-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#084734]/70 hover:text-[#084734]"
          onClick={() => {
            const next = !showHistory
            setShowHistory(next)
            if (next && !history) void loadHistory()
          }}
        >
          <History className="h-3.5 w-3.5" />
          {showHistory ? "이전 분석 숨기기" : "이전 분석 보기"}
        </button>
        {showHistory && (
          <div className="mt-3 space-y-2">
            {history === null && <div className="text-[11px] text-[#084734]/40">불러오는 중...</div>}
            {history?.length === 0 && <div className="text-[11px] text-[#084734]/40">이전 분석 기록 없음</div>}
            {history?.map((h) => (
              <details key={h.id} className="rounded-lg bg-white/50 p-2.5 text-[11px]">
                <summary className="cursor-pointer">
                  <span className="font-medium text-[#084734]/80">{relativeTime(h.generated_at)}</span>
                  <span className="ml-2 text-[#084734]/55">· {h.fiscal_period}</span>
                  <span className="ml-2 text-[#084734]">{h.one_liner}</span>
                </summary>
                <ol className="mt-2 space-y-1 pl-4 text-[10px] text-[#084734]/70">
                  {h.next_actions?.slice(0, 5).map((a, i) => (
                    <li key={i}>· <span className="font-medium">{a.title}</span> ({a.owner})</li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
