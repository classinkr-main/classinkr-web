"use client"

// CRM 홈 — "리드 요약" 밴드. app/admin/crm/page.tsx 분해(2026-08-28)로 이동.
// 2026-09-15(home-05): 타일 큰 값과 힌트 줄이 같은 3분기(metricValue)를 쓴다 — 실패 상태에서
// '48h 이상 0건' 같은 0 이 새어 나오지 않는다.

import Link from "next/link"
import { AlertCircle, ExternalLink, PhoneCall, Target, UserPlus } from "lucide-react"
import { StatTile } from "@/components/admin/viz"
import CrmNoticeBanner from "@/components/admin/crm/CrmNoticeBanner"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import { METRIC_UNAVAILABLE_LABEL, metricValue, resolveMetricState } from "./metric-value"
import { formatNumber, type LeadActionKpis } from "./shared"

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
  const state = resolveMetricState({ loading, hasData: Boolean(leadKpis) })
  const failed = state === "unavailable"

  const valueOrSkeleton = (value: number | null | undefined, tone?: string) =>
    metricValue(
      state,
      () => (
        <span className={`text-[34px] font-extrabold leading-none tracking-[-0.045em] ${tone ?? "text-[#111110]"}`}>
          {formatNumber(value)}
        </span>
      ),
      {
        skeletonClassName: "h-9 w-16",
        unavailableClassName: "text-[34px] font-extrabold leading-none tracking-[-0.045em]",
      }
    )

  // 힌트 줄의 작은 숫자도 같은 3분기 — loading→스켈레톤, unavailable→'확인 불가', ready→formatNumber.
  const hintValue = (value: number | null | undefined) =>
    metricValue(state, () => formatNumber(value), {
      skeletonClassName: "h-3 w-6",
      unavailableText: METRIC_UNAVAILABLE_LABEL,
      unavailableClassName: "font-semibold",
    })

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

      {failed ? (
        <CrmNoticeBanner
          tone="danger"
          className="mb-3"
          title="리드 현황을 확인하지 못했습니다"
          message={`${error ?? "응답이 없습니다."} · 아래 숫자는 0이 아니라 확인 불가 상태입니다.`}
          action={{ label: "다시 확인", onClick: onRetry, pending: loading }}
        />
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
            (leadKpis?.unconfirmedCount ?? 0) > 0 ? STATUS_TONE_TEXT_CLASS.warning : undefined
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
            (leadKpis?.unrespondedCount ?? 0) > 0 ? STATUS_TONE_TEXT_CLASS.danger : undefined
          )}
          hint={
            failed ? (
              <>48h 이상 {hintValue(leadKpis?.unresponded48hCount)} · 테스트 제외</>
            ) : (
              <>48h 이상 {hintValue(leadKpis?.unresponded48hCount)}건 · 테스트 제외</>
            )
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
            (leadKpis?.overdueFollowUpCount ?? 0) > 0 ? STATUS_TONE_TEXT_CLASS.danger : undefined
          )}
          hint={failed ? <>오늘 예정 {hintValue(leadKpis?.todayFollowUpCount)}</> : <>오늘 예정 {hintValue(leadKpis?.todayFollowUpCount)}건</>}
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
