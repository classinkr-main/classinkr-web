"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, ShieldCheck } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS } from "@/lib/crm/client-cache"
import { coverageTone, COVERAGE_TONE_CLASS } from "@/lib/crm/coverage"
import { formatCNY } from "@/lib/crm/money-format"

type CoverageHealthState = "ready" | "partial" | "no_data"
// server-only 모듈(rev-account-coverage)은 import 금지 — shape만 로컬 선언.
type RevAccountsCoverage = {
  scannedRows: number
  accounts: {
    total: number
    linked: number
    partial: number
    needsReview: number
    unlinked: number
    placeholder: number
  }
  revenue: {
    total: number
    linked: number
    coveragePct: number
    placeholder: number
  }
  topUnlinked: Array<{ accountKey: string; name: string; rows: number; unlinkedRevenue: number }>
}
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
  revAccounts?: RevAccountsCoverage | null
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
  if (state === "partial") return { label: "검토 필요", detail: "현재 저장된 매칭 링크 중 검토와 확정이 필요합니다." }
  return { label: "정상", detail: "현재 저장된 매칭 링크가 모두 확정됐습니다." }
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
  // 실패 시 인라인 "다시 시도"가 올리는 refetch 트리거 — effect 의존성으로만 쓰인다.
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<Coverage>("/api/admin/crm/coverage", undefined, {
      cacheKey: "/api/admin/crm/coverage",
      ttlMs: 90_000,
      staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
      onRevalidated: ({ data: fresh }) => {
        if (!alive || !fresh) return
        setData(fresh)
        setFailed(false)
      },
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
  }, [retryKey])

  // 이벤트 핸들러에서 상태 전환 — 재시도 즉시 "계산 중" 카피로 돌아가게 한다.
  const retry = useCallback(() => {
    setFailed(false)
    setLoading(true)
    setRetryKey((key) => key + 1)
  }, [])

  const pct = data?.coveragePct ?? 0
  const tone = coverageTone(pct)
  const fmt = (n: number) => n.toLocaleString("ko-KR")
  const state = getCoverageState(data, loading, failed)
  const copy = statusCopy(state)
  const pctLabel = valueLabel(data?.coveragePct, state, fmt, "%")
  const showMetrics = state === "ready" || state === "partial"

  // 매출보유 계정 기준 세그먼트 — 실패 격리(null)거나 스캔 행 0이면 조용히 숨긴다.
  const rev = data?.revAccounts
  const showRev = !!rev && rev.scannedRows > 0
  const revTone = coverageTone(rev?.revenue.coveragePct ?? 0)
  const unlinkedCount = rev?.accounts.unlinked ?? 0
  // 미연결 매출 = 전체 − 연결(부분 계정의 미연결분 포함) — topUnlinked는 톱8 캡이라 합산에 쓰지 않는다.
  const unlinkedRevenue = rev ? Math.max(0, rev.revenue.total - rev.revenue.linked) : 0

  // 보조 진단 밴드 — 작업대(우선순위 큐) 아래에 한 줄로 최소화한다.
  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">
          Sync
        </span>
        <span className="text-[13px] font-semibold text-[#111110]">링크 정합성</span>
        <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
          {data?.health?.label ?? copy.label}
        </span>

        {showMetrics ? (
          <span className="flex items-center gap-1.5 text-[12px] text-[#1a1a1a]/45">
            <span className="text-[#1a1a1a]/20">·</span>
            링크 확정률 <b className={`font-semibold ${COVERAGE_TONE_CLASS[tone]}`}>{pctLabel}</b>
            <span className="text-[#1a1a1a]/20">·</span>
            확정 <b className="font-semibold text-[#1a1a1a]/70">{valueLabel(data?.linked, state, fmt)}</b>
            <span className="text-[#1a1a1a]/20">·</span>
            검토 <b className="font-semibold text-[#1a1a1a]/70">{valueLabel(data?.needsReview, state, fmt)}</b>
          </span>
        ) : (
          <span className="text-[12px] text-[#1a1a1a]/42">{copy.detail}</span>
        )}

        {/* 실패는 새로고침 강요 없이 스트립 자체에서 복구 — 매칭 인박스 칩과 동일 스타일. */}
        {state === "failed" ? (
          <button
            type="button"
            onClick={retry}
            className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-semibold text-[#111110] transition-colors hover:bg-[#e8e8e4]"
          >
            다시 시도
          </button>
        ) : null}

        {showRev && rev ? (
          <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-[#1a1a1a]/45">
            <span className="mx-0.5 h-3.5 w-px bg-[#e8e8e4]" />
            매출 커버리지{" "}
            <b className={`font-semibold ${COVERAGE_TONE_CLASS[revTone]}`}>{rev.revenue.coveragePct}%</b>
            {unlinkedCount > 0 ? (
              <>
                <span className="text-[#1a1a1a]/20">·</span>
                미연결 계정{" "}
                <b className="font-semibold text-[#1a1a1a]/70">{fmt(unlinkedCount)}곳</b>
                <span className="text-[#1a1a1a]/20">·</span>
                미연결 매출{" "}
                <b className="font-semibold text-[#1a1a1a]/70">{formatCNY(unlinkedRevenue)}</b>
                <Link
                  href="/admin/crm/matching"
                  className="inline-flex items-center gap-0.5 rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-semibold text-[#111110] transition-colors hover:bg-[#e8e8e4]"
                >
                  매칭 인박스
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </section>
  )
}
