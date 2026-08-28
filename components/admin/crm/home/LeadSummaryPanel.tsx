"use client"

// CRM 홈 — "리드 요약" 밴드. app/admin/crm/page.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import Link from "next/link"
import { AlertCircle, ExternalLink, PhoneCall, Target, UserPlus } from "lucide-react"
import { StatTile } from "@/components/admin/viz"
import { formatNumber, ValueSkeleton, type LeadActionKpis } from "./shared"

export default function LeadSummaryPanel({
  leadKpis,
  loading,
  error,
  onRetry,
}: {
  leadKpis: LeadActionKpis | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const valueOrSkeleton = (value: number | null | undefined, tone?: string) =>
    loading && !leadKpis ? (
      <ValueSkeleton className="h-9 w-16" />
    ) : error && !leadKpis ? (
      <span className="text-[34px] font-extrabold leading-none tracking-[-0.045em] text-[#B85C33]">—</span>
    ) : (
      <span className={`text-[34px] font-extrabold leading-none tracking-[-0.045em] ${tone ?? "text-[#111110]"}`}>
        {formatNumber(value)}
      </span>
    )

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">New Sales</p>
          <h2 className="mt-1 text-[18px] font-bold text-[#111110]">리드 요약</h2>
        </div>
        <Link
          href="/admin/crm/customers/leads"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] underline-offset-2 hover:underline"
        >
          구매 전 리드
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {error && !leadKpis ? (
        <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
          <span>리드 현황을 확인하지 못했습니다. 아래 숫자는 0이 아니라 확인 불가 상태입니다.</span>
          <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-2">
            다시 확인
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<UserPlus className="h-4 w-4" />}
          iconLayout="inline"
          variant="bare"
          compact
          href="/admin/crm/customers/leads?filter=unconfirmed"
          label="미확인 유입"
          value={valueOrSkeleton(
            leadKpis?.unconfirmedCount,
            (leadKpis?.unconfirmedCount ?? 0) > 0 ? "text-[#8D6C1F]" : undefined
          )}
          hint="문의·데모·뉴스레터 · 확인 전"
        />

        <StatTile
          icon={<PhoneCall className="h-4 w-4" />}
          iconLayout="inline"
          variant="bare"
          compact
          href="/admin/crm/customers/leads?filter=unresponded"
          label="신규 상태 리드"
          value={valueOrSkeleton(
            leadKpis?.unrespondedCount,
            (leadKpis?.unrespondedCount ?? 0) > 0 ? "text-[#B85C33]" : undefined
          )}
          hint={
            <>
              48h 이상 {loading && !leadKpis ? <ValueSkeleton className="h-3 w-6" /> : formatNumber(leadKpis?.unresponded48hCount)}건 · 테스트 제외
            </>
          }
        />

        <StatTile
          icon={<AlertCircle className="h-4 w-4" />}
          iconLayout="inline"
          variant="bare"
          compact
          href="/admin/crm/customers/leads?focus=risk"
          label="오버듀 팔로업"
          value={valueOrSkeleton(
            leadKpis?.overdueFollowUpCount,
            (leadKpis?.overdueFollowUpCount ?? 0) > 0 ? "text-[#B85C33]" : undefined
          )}
          hint={
            <>
              오늘 예정 {loading && !leadKpis ? <ValueSkeleton className="h-3 w-6" /> : formatNumber(leadKpis?.todayFollowUpCount)}건
            </>
          }
        />

        <StatTile
          icon={<Target className="h-4 w-4" />}
          iconLayout="inline"
          variant="bare"
          compact
          href="/admin/crm/customers/leads?filter=contacted"
          label="컨택 중"
          value={valueOrSkeleton(leadKpis?.byStatus.contacted, "text-[#084734]")}
          hint="구매 전 영업 진행 리드"
        />
      </div>
    </section>
  )
}
