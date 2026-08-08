import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { FunnelStage } from "./FunnelStage"
import { KRW, formatMetaDate, pct, previewText, won } from "./event-format"
import {
  computeEconomics,
  type EventFunnel,
  type EventMetrics,
} from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"

export function buildFunnel(
  event: PublicEvent,
  metrics: EventMetrics,
  attributedCount: number,
  duringCount: number
): EventFunnel {
  const leads = attributedCount + duringCount
  return {
    impressions: metrics.impressionsCount ?? 0,
    leads,
    applications: metrics.applicationsCount ?? 0,
    qualifiedLeads: metrics.qualifiedLeadsCount ?? 0,
    attendees: metrics.attendeesCount ?? 0,
    deals: metrics.dealsCount ?? 0,
  }
}

export function EventDetailContent({
  event,
  metrics,
  attributedLeadCount,
  duringLeadCount,
}: {
  event: PublicEvent
  metrics: EventMetrics
  attributedLeadCount: number
  duringLeadCount: number
}) {
  const funnel = buildFunnel(event, metrics, attributedLeadCount, duringLeadCount)
  const economics = computeEconomics(funnel, metrics)

  const targetProgress =
    metrics.targetLeads != null && metrics.targetLeads > 0
      ? Math.min(100, Math.round((funnel.leads / metrics.targetLeads) * 100))
      : null
  const detailPreview = previewText(event.description) ?? previewText(event.contentMarkdown)
  const publicHref = event.slug ? `/events/${event.slug}` : null
  const dealCustomersPreview = previewText(metrics.dealCustomers, 120)
  const retrospectivePreview = previewText(metrics.retrospective, 180)
  const shareMemoPreview = previewText(metrics.shareMemo, 180)
  const leadSourceLabel =
    attributedLeadCount > 0 && duringLeadCount > 0
      ? `명시 ${KRW.format(attributedLeadCount)} · 기간 ${KRW.format(duringLeadCount)}건`
      : attributedLeadCount > 0
        ? `명시 매칭 ${KRW.format(attributedLeadCount)}건`
        : duringLeadCount > 0
          ? `기간 fallback ${KRW.format(duringLeadCount)}건`
          : "집계 리드 없음"

  return (
    <>
      <div className="mb-3 border-y border-[#f0f0ec] py-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/35">
              행사 정보
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/60">
              {detailPreview ?? "설명 또는 상세 본문이 아직 입력되지 않았습니다."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#1a1a1a]/45">
              <span>CTA: {event.ctaLabel}</span>
              {event.ctaHref && <span className="max-w-[220px] truncate">링크: {event.ctaHref}</span>}
              {publicHref && (
                <Link
                  href={publicHref}
                  className="inline-flex items-center gap-1 font-medium text-[#084734] hover:underline"
                >
                  상세 페이지
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
          <dl className="grid gap-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">공개 상태</dt>
              <dd className="font-semibold text-[#111110]">
                {event.publicationStatus === "published" ? "공개" : "초안"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">리드 집계</dt>
              <dd className="font-semibold text-[#111110]">{leadSourceLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">성사 고객</dt>
              <dd className="font-semibold text-[#111110]">
                {metrics.closedCustomerCount != null ? `${KRW.format(metrics.closedCustomerCount)}곳` : "미입력"}
              </dd>
            </div>
            {dealCustomersPreview && (
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-[#1a1a1a]/40">고객</dt>
                <dd className="min-w-0 text-right font-semibold text-[#111110]">{dealCustomersPreview}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">성과 업데이트</dt>
              <dd className="font-semibold text-[#111110]">
                {metrics.updatedAt ? formatMetaDate(metrics.updatedAt) : "미입력"}
              </dd>
            </div>
          </dl>
        </div>
        {(metrics.notes || retrospectivePreview || shareMemoPreview) && (
          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            {metrics.notes && (
              <p className="rounded-lg bg-[#fafaf8] px-3 py-2 text-[11px] leading-relaxed text-[#1a1a1a]/55">
                <span className="font-semibold text-[#111110]">내부 메모</span>
                <span className="ml-2">{metrics.notes}</span>
              </p>
            )}
            {retrospectivePreview && (
              <p className="rounded-lg bg-[#fafaf8] px-3 py-2 text-[11px] leading-relaxed text-[#1a1a1a]/55">
                <span className="font-semibold text-[#111110]">회고</span>
                <span className="ml-2">{retrospectivePreview}</span>
              </p>
            )}
            {shareMemoPreview && (
              <p className="rounded-lg bg-[#ECFDF5] px-3 py-2 text-[11px] leading-relaxed text-[#084734]">
                <span className="font-semibold">공유 포인트</span>
                <span className="ml-2">{shareMemoPreview}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">광고비</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{won(economics.adSpendTotal)}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">매출</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{metrics.dealsRevenue != null ? won(economics.revenue) : "—"}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">CPL</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{economics.cpl != null ? won(economics.cpl) : "—"}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">ROI</p>
          <p
            className={`mt-0.5 text-[14px] font-bold ${
              economics.roi == null
                ? "text-[#1a1a1a]/30"
                : economics.roi >= 0
                  ? "text-[#084734]"
                  : "text-[#B85C33]"
            }`}
          >
            {pct(economics.roi)}
          </p>
        </div>
      </div>

      {targetProgress != null && (
        <div className="mb-3 rounded-xl bg-[#ECFDF5] px-3 py-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-[#084734]">리드 목표 달성</span>
            <span className="text-[#084734]">
              {KRW.format(funnel.leads)} / {KRW.format(metrics.targetLeads ?? 0)} · {targetProgress}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
            <div className="h-full bg-[#084734]" style={{ width: `${targetProgress}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        <FunnelStage label="노출" value={funnel.impressions} />
        <FunnelStage label="리드" value={funnel.leads} prevValue={funnel.impressions || null} tone="primary" />
        <FunnelStage label="신청" value={funnel.applications} prevValue={funnel.leads || null} />
        <FunnelStage label="유효 리드" value={funnel.qualifiedLeads} prevValue={funnel.applications || null} />
        <FunnelStage label="참석" value={funnel.attendees} prevValue={funnel.qualifiedLeads || null} />
        <FunnelStage label="딜" value={funnel.deals} prevValue={funnel.attendees || null} tone="primary" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">유효 전환</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.leadConversionRate)}</span>
        </div>
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">참석률</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.attendanceRate)}</span>
        </div>
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">딜 전환</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.dealConversionRate)}</span>
        </div>
      </div>

      {attributedLeadCount === 0 && duringLeadCount > 0 && (
        <p className="mt-3 text-[11px] text-[#1a1a1a]/40">
          ⓘ 행사 기간 내 리드 {duringLeadCount}건을 fallback 집계로 사용 중. 정확한 집계를 위해 리드의 source/notes에{" "}
          <code className="rounded bg-[#f0f0ec] px-1 font-mono text-[10px] text-[#111110]">
            event:{event.slug ?? event.id}
          </code>{" "}
          토큰을 추가하세요.
        </p>
      )}

      {metrics.relatedLinks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/35">
            관련 자료
          </span>
          {metrics.relatedLinks.map((link, idx) => (
            <a
              key={`${link.url}-${idx}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2.5 py-1 text-[11px] font-medium text-[#084734] hover:bg-[#ECFDF5]"
            >
              {link.label}
              <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      )}
    </>
  )
}
