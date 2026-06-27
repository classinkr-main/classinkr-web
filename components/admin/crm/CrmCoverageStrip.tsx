"use client"

import { useEffect, useState } from "react"
import { ShieldCheck } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import { coverageTone, COVERAGE_TONE_CLASS } from "@/lib/crm/coverage"

type CoverageHealthState = "ready" | "partial" | "no_data"
type Coverage = {
  total: number
  linked: number
  needsReview: number
  coveragePct: number
  health?: {
    state: CoverageHealthState
    label: string
    detail: string
  }
}

type DisplayState = CoverageHealthState | "loading" | "failed"

function getCoverageState(data: Coverage | null, loading: boolean, failed: boolean): DisplayState {
  if (failed && !data) return "failed"
  if (loading && !data) return "loading"
  if (!data) return "failed"
  if (data.health?.state) return data.health.state
  return data.total > 0 ? "ready" : "no_data"
}

function statusCopy(state: DisplayState) {
  if (state === "loading") return { label: "계산 중", detail: "ClassIn 고객 DB 연결 상태를 확인 중입니다." }
  if (state === "failed") return { label: "확인 실패", detail: "CRM 동기화 상태를 불러오지 못했습니다." }
  if (state === "no_data") return { label: "연동 데이터 없음", detail: "ClassIn 고객 DB와 연결된 외부 원천이 아직 없습니다." }
  if (state === "partial") return { label: "검토 필요", detail: "외부 원천은 참고용이며 ClassIn 고객 DB 연결 확정이 필요합니다." }
  return { label: "정상", detail: "ClassIn 고객 DB 기준 연결 상태입니다." }
}

function valueLabel(value: number | undefined, state: DisplayState, format: (n: number) => string, suffix = "") {
  if (state === "loading") return "..."
  if (state === "failed") return "미확인"
  if (state === "no_data") return "없음"
  return `${format(value ?? 0)}${suffix}`
}

export default function CrmCoverageStrip() {
  const [data, setData] = useState<Coverage | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<Coverage>("/api/admin/crm/coverage", undefined, {
      cacheKey: "/api/admin/crm/coverage",
      ttlMs: 90_000,
      staleWhileRevalidateMs: 5 * 60_000,
    })
      .then((d: Coverage | null) => {
        if (!alive) return
        setData(d)
        setFailed(false)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setFailed(true)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const pct = data?.coveragePct ?? 0
  const tone = coverageTone(pct)
  const fmt = (n: number) => n.toLocaleString("ko-KR")
  const state = getCoverageState(data, loading, failed)
  const copy = statusCopy(state)
  const pctLabel = valueLabel(data?.coveragePct, state, fmt, "%")
  const showMetrics = state === "ready" || state === "partial"

  // 보조 진단 밴드 — 작업대(우선순위 큐) 아래에 한 줄로 최소화한다.
  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">
          Sync
        </span>
        <span className="text-[13px] font-semibold text-[#111110]">동기화 정합성</span>
        <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
          {data?.health?.label ?? copy.label}
        </span>

        {showMetrics ? (
          <span className="flex items-center gap-1.5 text-[12px] text-[#1a1a1a]/45">
            <span className="text-[#1a1a1a]/20">·</span>
            커버리지 <b className={`font-semibold ${COVERAGE_TONE_CLASS[tone]}`}>{pctLabel}</b>
            <span className="text-[#1a1a1a]/20">·</span>
            확정 <b className="font-semibold text-[#1a1a1a]/70">{valueLabel(data?.linked, state, fmt)}</b>
            <span className="text-[#1a1a1a]/20">·</span>
            검토 <b className="font-semibold text-[#1a1a1a]/70">{valueLabel(data?.needsReview, state, fmt)}</b>
          </span>
        ) : (
          <span className="text-[12px] text-[#1a1a1a]/42">{copy.detail}</span>
        )}
      </div>
    </section>
  )
}
