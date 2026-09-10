"use client"

// CRM 홈 — 고객 건강도 도넛. app/admin/crm/page.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { adminFetchJsonCached } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import { formatNumber } from "./shared"

// 고객 건강도 도넛 — 활성 고객(neo_account)의 안전/주의/위험 실분포(computeCustomerHealth SSOT).
// 데이터 없으면(또는 환경상 미적용) 렌더 안 함(가짜 분포 금지).
interface CrmHealthDist {
  total: number
  safe: number
  watch: number
  risk: number
}

export default function CrmHealthDonut() {
  const [dist, setDist] = useState<CrmHealthDist | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<{ distribution: CrmHealthDist }>("/api/admin/crm/health-distribution", undefined, {
      cacheKey: "/api/admin/crm/health-distribution",
      ttlMs: CRM_CACHE_TTL_MS,
      staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
      onRevalidated: ({ data: fresh }) => {
        if (alive && fresh) setDist(fresh.distribution)
      },
    })
      .then((res) => {
        if (alive) {
          setDist(res.distribution)
          setLoading(false)
        }
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  if (loading) return <div className="h-24 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (!dist || dist.total === 0) return null

  const pct = (value: number) => Math.round((value / dist.total) * 100)
  const safePct = pct(dist.safe)
  const watchPct = pct(dist.watch)
  const gradient = `conic-gradient(#084734 0 ${safePct}%, #A8741A ${safePct}% ${safePct + watchPct}%, #B85C33 ${safePct + watchPct}% 100%)`
  const legend = [
    { label: "안전", value: dist.safe, color: "#084734" },
    { label: "주의", value: dist.watch, color: "#A8741A" },
    { label: "위험", value: dist.risk, color: "#B85C33" },
  ]

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a]/40">고객 건강도</p>
        <p className="text-[10px] text-[#1a1a1a]/35">활성 고객 {formatNumber(dist.total)} · 규칙 기반</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: gradient }}>
          <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white">
            <span className="text-[24px] font-extrabold leading-none tracking-[-0.035em] text-[#111110]">{safePct}%</span>
            <span className="text-[9px] font-semibold text-[#1a1a1a]/45">안전</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="flex-1 text-[12px] font-medium text-[#111110]">{item.label}</span>
              <span
                className="text-[12px] font-bold tabular-nums"
                style={{ color: item.label === "위험" && item.value > 0 ? "#B85C33" : "#111110" }}
              >
                {pct(item.value)}%
              </span>
            </div>
          ))}
        </div>
      </div>
      {dist.risk > 0 ? (
        <Link
          href="/admin/crm/customers/unified?view=needs_care"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] py-2 text-[12px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FCE9E0]"
        >
          위험 고객 {formatNumber(dist.risk)}곳 보기
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </section>
  )
}
