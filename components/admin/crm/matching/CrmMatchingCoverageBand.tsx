"use client"

import { useEffect, useState } from "react"
import { Layers } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import { coverageTone, COVERAGE_TONE_CLASS } from "@/lib/crm/coverage"
import { formatCNY } from "@/lib/crm/money-format"

// server-only 모듈(rev-account-coverage)은 import 금지 — 응답 shape만 로컬 선언.
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
type CoverageResponse = {
  revAccounts?: RevAccountsCoverage | null
}

interface CrmMatchingCoverageBandProps {
  /** 미연결 톱 계정 칩 클릭 → 인박스를 해당 이름으로 프리필한다. */
  onSelectAccount?: (name: string) => void
  /** 현재 활성화된 이름 필터(칩 강조용). */
  activeName?: string
}

function fmt(value: number) {
  return value.toLocaleString("ko-KR")
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1a1a1a]/35">{label}</span>
      <span className={`text-[15px] font-bold tracking-[-0.02em] ${tone ?? "text-[#111110]"}`}>{value}</span>
    </div>
  )
}

export default function CrmMatchingCoverageBand({ onSelectAccount, activeName }: CrmMatchingCoverageBandProps) {
  const [rev, setRev] = useState<RevAccountsCoverage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<CoverageResponse>("/api/admin/crm/coverage", undefined, {
      cacheKey: "/api/admin/crm/coverage",
      ttlMs: 90_000,
      staleWhileRevalidateMs: 5 * 60_000,
    })
      .then((data) => {
        if (!alive) return
        setRev(data?.revAccounts ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // 실패 격리(null)거나 집계 행이 0이면 밴드 자체를 숨긴다 — 인박스 흐름을 막지 않는다.
  if (loading || !rev || rev.scannedRows <= 0) return null

  const { accounts, revenue, topUnlinked } = rev
  const revTone = coverageTone(revenue.coveragePct)

  return (
    <section className="mb-6 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">Revenue Coverage</span>
        <span className="text-[13px] font-semibold text-[#111110]">매출보유 계정 기준 커버리지</span>
        <span className="text-[11px] text-[#1a1a1a]/40">활성 {fmt(rev.scannedRows)}행 스캔</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCell label="전체 계정" value={fmt(accounts.total)} />
        <StatCell label="연결" value={fmt(accounts.linked)} tone="text-[#084734]" />
        <StatCell label="부분" value={fmt(accounts.partial)} />
        <StatCell label="검토" value={fmt(accounts.needsReview)} />
        <StatCell
          label="미연결"
          value={`${fmt(accounts.unlinked)}곳`}
          tone={accounts.unlinked > 0 ? "text-[#B43E3E]" : "text-[#111110]"}
        />
        <StatCell label="매출 커버리지" value={`${revenue.coveragePct}%`} tone={COVERAGE_TONE_CLASS[revTone]} />
      </div>

      {topUnlinked.length > 0 ? (
        <div className="mt-4 border-t border-[rgba(0,0,0,0.08)] pt-3">
          <p className="text-[11px] font-semibold text-[#1a1a1a]/45">
            미연결 매출 톱 계정 <span className="text-[#1a1a1a]/30">— 칩을 눌러 인박스에서 좁혀 보세요</span>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {topUnlinked.map((account) => {
              const active = !!activeName && activeName === account.name
              return (
                <button
                  key={account.accountKey}
                  type="button"
                  onClick={() => onSelectAccount?.(account.name)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    active
                      ? "border-[#084734]/30 bg-[#ECFDF5] text-[#084734]"
                      : "border-[rgba(0,0,0,0.08)] bg-white text-[#111110] hover:bg-[#f5f5f2]"
                  }`}
                  title={`${account.name} · 계정 ${account.rows}행 · 미연결 매출 ${formatCNY(account.unlinkedRevenue)}`}
                >
                  <span className="max-w-[180px] truncate">{account.name}</span>
                  <span className="text-[#A8741A]">{formatCNY(account.unlinkedRevenue)}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </section>
  )
}
