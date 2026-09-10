"use client"

// CRM 홈 — 매출 상세 / 수납·로그 참조 블록. app/admin/crm/page.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { type ReactNode } from "react"
import Link from "next/link"
import {
  BarChart3, Building2, CircleDollarSign, ExternalLink, FileText, Handshake, ReceiptText, TrendingUp,
} from "lucide-react"
import { StatTile } from "@/components/admin/viz"
import { formatCNY, formatKRWAbbrev } from "@/lib/crm/money-format"
import {
  CustomerLogIcon,
  formatLogAmount,
  formatNumber,
  formatOverviewDate,
  formatUSD,
  getCustomerLogKindLabel,
  getCustomerLogTone,
  ValueSkeleton,
  type AdminCrmOverview,
} from "./shared"

// KPI 타일 로컬 재구현 금지(W2-2b) — 마크업은 viz StatTile(bare 변형)에 위임하는 어댑터.
// tone은 값 색만 바꾸는 기존 계약을 유지한다(값·라벨·캡션 불변).
function CrmMetricTile({
  icon,
  label,
  value,
  hint,
  tone = "text-[#111110]",
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  hint: string
  tone?: string
}) {
  return (
    <StatTile
      icon={icon}
      iconLayout="inline"
      variant="bare"
      compact
      label={label}
      value={tone === "text-[#111110]" ? value : <span className={tone}>{value}</span>}
      hint={hint}
    />
  )
}

export default function CrmOperationsDashboard({
  overview,
  loading,
  error,
  part = "all",
}: {
  overview: AdminCrmOverview | null
  loading: boolean
  error: string | null
  part?: "all" | "revenue" | "risk"
}) {
  const showRevenue = part !== "risk"
  const showRisk = part !== "revenue"
  const revenue = overview?.business.revenue
  const kpis = overview?.business.kpis
  const neoCrm = overview?.neoCrm ?? null
  const neoKpis = neoCrm?.kpis
  const logs = overview?.business.customerLogs.recent ?? []
  const businessWarning = error ?? overview?.business.error ?? overview?.business.warning ?? null
  const neoSyncWarning = neoCrm?.error ?? overview?.externalSnapshots.error ?? null
  // 콜드 로드 — '...' 텍스트 대신 자리 크기별 스켈레톤(CRM-5). loadingText는 문자열 보간(hint) 전용.
  const pending = loading && !overview
  const loadingValue = pending ? <ValueSkeleton /> : null
  const loadingInline = pending ? <ValueSkeleton className="h-3 w-12" /> : null
  const loadingText = pending ? "—" : null

  return (
    <>
      {showRevenue ? (
      <div className="mb-4">
        {/* 참조 표면(분석·분해) — 행동 표면과의 톤차 위계(W2-6): 베이지로 한 단 가라앉힌다 */}
        <section className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Customer Revenue Scope</p>
              <h2 className="mt-1 text-[18px] font-bold text-[#111110]">고객 돈흐름 우선순위</h2>
            </div>
            <span className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/50">
              Sync {formatOverviewDate(neoCrm?.latestSyncedAt ?? overview?.externalSnapshots.latestSyncedAt)}
            </span>
            <Link
              href="/admin/crm/deals"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            >
              매출 상세
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
            <div className="border-t border-[#084734]/18 pt-4">
              <div className="flex items-center gap-2 text-[#084734]/70">
                <CircleDollarSign className="h-5 w-5" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">인식 매출</p>
              </div>
              <p className="mt-2 text-4xl font-bold tracking-[-0.045em] text-[#084734] sm:text-[42px]">
                {pending ? <ValueSkeleton className="h-9 w-36" /> : formatKRWAbbrev(revenue?.deliveryTotalAmount)}
              </p>
              {/* 오더는 거의 확정 매출 — Delivery와 같은 급의 서브 히어로 (USD 네이티브) */}
              <div className="mt-4 border-t border-[#084734]/10 pt-3">
                <div className="flex items-center gap-2 text-[#084734]/70">
                  <BarChart3 className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">오더 · 확정 임박 (USD)</p>
                </div>
                <p className="mt-1.5 flex flex-wrap items-end gap-x-2 gap-y-1">
                  <span className="text-3xl font-bold tracking-[-0.04em] text-[#111110]">
                    {pending ? <ValueSkeleton className="h-8 w-28" /> : formatUSD(neoKpis?.opportunityAmount)}
                  </span>
                  <span className="text-[12px] text-[#1a1a1a]/45">
                    이번 달 {loadingInline ?? formatNumber(neoKpis?.opportunityCountMonth)}건
                  </span>
                </p>
              </div>
              <div className="mt-3 grid gap-2 text-[12px] text-[#1a1a1a]/45 sm:grid-cols-2">
                <span>견적 {loadingInline ?? formatKRWAbbrev(revenue?.acceptedQuoteAmount)}</span>
                <span>동기화 매출 {loadingInline ?? formatCNY(neoKpis?.salesAmountMonth)}</span>
                <span>확정 임박 {loadingInline ?? formatUSD(neoKpis?.opportunityAmount)}</span>
                <span>계약 {loadingInline ?? formatKRWAbbrev(revenue?.contractedAmount)}</span>
                <span>인식 매출 {loadingInline ?? formatKRWAbbrev(revenue?.deliveryTotalAmount)}</span>
                <span>동기화 수금 {loadingInline ?? formatCNY(neoKpis?.collectionAmountMonth)}</span>
                <span className={(revenue?.outstandingAmount ?? 0) > 0 ? "font-semibold text-[#B85C33]" : ""}>
                  미수 {loadingInline ?? formatKRWAbbrev(revenue?.outstandingAmount)}
                </span>
                <span>수납 {loadingInline ?? formatKRWAbbrev(revenue?.paidAmount)}</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <CrmMetricTile
                icon={<FileText className="h-4 w-4" />}
                label="견적"
                value={loadingValue ?? formatKRWAbbrev(revenue?.acceptedQuoteAmount)}
                hint={`견적서 ${loadingText ?? formatNumber(kpis?.quoteDocumentCount)}건`}
              />
              <CrmMetricTile
                icon={<BarChart3 className="h-4 w-4" />}
                label="오더 (확정 임박)"
                value={loadingValue ?? formatUSD(neoKpis?.opportunityAmount)}
                hint={`외부 CRM ${loadingText ?? formatNumber(neoKpis?.opportunityCountMonth)}건 · USD`}
                tone="text-[#084734]"
              />
              <CrmMetricTile
                icon={<TrendingUp className="h-4 w-4" />}
                label="동기화 매출"
                value={loadingValue ?? formatCNY(neoKpis?.salesAmountMonth)}
                hint={`본사 CRM ${loadingText ?? formatNumber(neoKpis?.salesCountMonth)}건 · actual`}
                tone="text-[#084734]"
              />
              <CrmMetricTile
                icon={<ReceiptText className="h-4 w-4" />}
                label="동기화 수금"
                value={loadingValue ?? formatCNY(neoKpis?.collectionAmountMonth)}
                hint={`외부 CRM ${loadingText ?? formatNumber(neoKpis?.collectionCountMonth)}건 · current month`}
              />
              <CrmMetricTile
                icon={<Building2 className="h-4 w-4" />}
                label="동기화 고객"
                value={loadingValue ?? formatNumber(neoKpis?.accountCount)}
                hint={`이번 달 활성 ${loadingText ?? formatNumber(neoKpis?.activeAccountCountMonth)} · 외부 CRM 원천`}
              />
              <CrmMetricTile
                icon={<Handshake className="h-4 w-4" />}
                label="계약"
                value={loadingValue ?? formatKRWAbbrev(revenue?.contractedAmount)}
                hint={`활성 거래 ${loadingText ?? formatNumber(kpis?.activeDealCount)}건`}
              />
              <CrmMetricTile
                icon={<Building2 className="h-4 w-4" />}
                label="고객"
                value={loadingValue ?? formatNumber(kpis?.customerCount)}
                hint={`파트너 고객 ${formatNumber(kpis?.partnerAccountCount)}개`}
              />
            </div>
          </div>

          {businessWarning ? (
            <p className="mt-4 rounded-xl bg-[#FEF3EE] px-3 py-2 text-[12px] leading-relaxed text-[#B85C33]">
              {businessWarning}
            </p>
          ) : null}
          {neoSyncWarning ? (
            <p className="mt-3 rounded-xl bg-[#FEF3EE] px-3 py-2 text-[12px] leading-relaxed text-[#B85C33]">
              외부 CRM sync check: {neoSyncWarning}
            </p>
          ) : null}
        </section>
      </div>
      ) : null}

      {showRisk ? (
      <div className="mb-4 space-y-3">
        {/* 수납 리스크 — 슬림 한 줄 */}
        <section className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <div className="flex items-center gap-1.5">
                <ReceiptText className="h-4 w-4 text-[#1a1a1a]/30" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/30">수납 리스크</span>
              </div>
              <span className="text-[12px] text-[#1a1a1a]/45">
                미수 거래{" "}
                <b className={`text-[15px] font-bold ${(kpis?.paymentRiskCount ?? 0) > 0 ? "text-[#B85C33]" : "text-[#111110]"}`}>
                  {loadingInline ?? formatNumber(kpis?.paymentRiskCount)}
                </b>
              </span>
              <span className="text-[12px] text-[#1a1a1a]/45">
                미수 합계{" "}
                <b className={`text-[15px] font-bold ${(revenue?.outstandingAmount ?? 0) > 0 ? "text-[#B85C33]" : "text-[#111110]"}`}>
                  {loadingInline ?? formatKRWAbbrev(revenue?.outstandingAmount)}
                </b>
              </span>
            </div>
            <Link
              href="/admin/crm/deals"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            >
              Deals에서 처리
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* 최근 고객별 로그 — 간소화(6건, 요약줄 제거) */}
        <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold text-[#111110]">최근 고객별 로그</h2>
            <Link
              href="/admin/crm/customers/accounts"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
            >
              고객사 보기
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {logs.length === 0 ? (
            pending ? (
              // 콜드 로드 — 로그 행 레이아웃과 일치하는 스켈레톤(CRM-5)
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-xl bg-[#f0f0ec]" />
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[13px] text-[#1a1a1a]/30">
                최근 고객 로그가 없습니다.
              </p>
            )
          ) : (
            <div className="divide-y divide-[#f0f0ec]">
              {logs.slice(0, 6).map((log) => (
                <Link
                  key={log.id}
                  href={log.href}
                  className="flex items-center gap-2.5 py-2 transition-colors hover:bg-[#fafaf8]"
                >
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getCustomerLogTone(
                      log.kind
                    )}`}
                  >
                    <CustomerLogIcon kind={log.kind} />
                    {getCustomerLogKindLabel(log.kind)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-[#111110]">
                      {log.customerName ?? log.partnerAccountName ?? "고객 미지정"}
                    </p>
                    <p className="truncate text-[11px] text-[#1a1a1a]/45">{log.title}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12px] font-semibold text-[#111110]">
                      {log.amount == null ? log.status ?? "-" : formatLogAmount(log.kind, log.amount)}
                    </p>
                    <p className="text-[11px] text-[#1a1a1a]/35">{formatOverviewDate(log.occurredAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
      ) : null}
    </>
  )
}
