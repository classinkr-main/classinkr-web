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

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#1a1a1a]/35" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">
              Sync Health
            </p>
            <h2 className="mt-0.5 text-[15px] font-bold text-[#111110]">동기화 정합성</h2>
          </div>
        </div>
        <span className="rounded-full bg-[#f0f0ec] px-3 py-1 text-[12px] font-medium text-[#1a1a1a]/55">
          {data?.health?.label ?? copy.label}
        </span>
      </div>

      <div className="grid gap-8 border-t border-[#f0f0ec] pt-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">커버리지</p>
          <p
            className={`mt-2 font-bold tracking-[-0.04em] ${
              state === "failed"
                ? "text-xl text-[#B85C33]"
                : state === "no_data"
                  ? "text-xl text-[#8D6C1F]"
                  : `text-2xl ${COVERAGE_TONE_CLASS[tone]}`
            }`}
          >
            {pctLabel}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/42">
            {copy.detail}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">확정 연결</p>
          <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[#111110]">
            {valueLabel(data?.linked, state, fmt)}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/42">운영 DB에 확정 연결됨</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">검토 대기</p>
          <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[#111110]">
            {valueLabel(data?.needsReview, state, fmt)}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/42">연동 탭에서 확인 필요</p>
        </div>
      </div>
    </section>
  )
}
