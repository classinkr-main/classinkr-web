"use client"

// CRM 홈 — 코크핏 KPI 히어로 밴드. app/admin/crm/page.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import Link from "next/link"
import { AlertCircle, BarChart3, CircleDollarSign, TrendingUp } from "lucide-react"
import { formatCNY, formatKRWAbbrev } from "@/lib/crm/money-format"
import { CurrencyChip, formatNumber, formatUSD, ValueSkeleton, type AdminCrmOverview } from "./shared"

// 코크핏 KPI 히어로 — 흩어진 핵심 지표를 상단 한 밴드로 합성(B 코크핏 이식). snapshot 필드만 재배치(추가 fetch 0).
// 통화 3종이 인접하므로 카드마다 통화 칩을 강제: 인식매출·미수=₩(자체집계), 오더=$(USD), 동기화=¥(CNY).
// 아침 지휘대 재배치(H3) — 우선순위 큐가 첫 화면 주인공이 되도록 컴팩트 밴드로 축소(값·캡션 불변).
export default function CrmCockpitHero({
  overview,
  loading,
  error,
  onRetry,
}: {
  overview: AdminCrmOverview | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const revenue = overview?.business.revenue
  const kpis = overview?.business.kpis
  const neoKpis = overview?.neoCrm?.kpis
  // 콜드 로드 — '...' 텍스트 대신 값 자리 크기의 스켈레톤(CRM-5).
  const pending = loading && !overview
  const riskCount = kpis?.paymentRiskCount ?? 0
  const hasRisk = riskCount > 0 || (revenue?.outstandingAmount ?? 0) > 0

  if (error && !overview) {
    return (
      <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[12px] text-[#B85C33]">
        <span>매출·수금 현황을 확인하지 못했습니다. 의사결정용 수치를 0으로 대체하지 않았습니다.</span>
        <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-2">
          다시 확인
        </button>
      </div>
    )
  }

  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
      {/* 1. 이번 달 인식 매출 — 다크 히어로 (자체집계 ₩) */}
      <div className="rounded-2xl bg-[#084734] p-3.5 text-white shadow-[0_8px_22px_rgba(8,71,52,0.18)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 opacity-80">
            <CircleDollarSign className="h-3.5 w-3.5" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">이번 달 인식 매출</span>
          </div>
          <CurrencyChip currency="KRW" tone="dark" />
        </div>
        <p className="mt-2 text-[30px] font-extrabold leading-none tracking-[-0.045em]">
          {pending ? <ValueSkeleton className="h-8 w-32 bg-white/15" /> : formatKRWAbbrev(revenue?.deliveryTotalAmount)}
        </p>
        <p className="mt-1 text-[11px] opacity-75">
          견적 {pending ? <ValueSkeleton className="h-3 w-10 bg-white/15" /> : formatKRWAbbrev(revenue?.acceptedQuoteAmount)} · 계약{" "}
          {pending ? <ValueSkeleton className="h-3 w-10 bg-white/15" /> : formatKRWAbbrev(revenue?.contractedAmount)}
        </p>
        {/* 산정 기준 캡션(CRM-6) — 여기 '확정'은 V2 딜리버리 인식, 시트 '확정 표시'(¥)와 다른 기준 */}
        <p className="mt-1 text-[10px] leading-relaxed text-white/55">
          V2 딜리버리(출고) 인식 합계 · 시트 &lsquo;확정 표시&rsquo;(¥)와 다른 기준
        </p>
      </div>

      {/* 2. 오더 · 확정 임박 (USD) */}
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[#1a1a1a]/40">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">오더 · 확정 임박</span>
          </div>
          <CurrencyChip currency="USD" />
        </div>
        <p className="mt-2 text-[30px] font-extrabold leading-none tracking-[-0.045em] text-[#111110]">
          {pending ? <ValueSkeleton className="h-8 w-28" /> : formatUSD(neoKpis?.opportunityAmount)}
        </p>
        <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
          이번 달 {pending ? <ValueSkeleton className="h-3 w-6" /> : formatNumber(neoKpis?.opportunityCountMonth)}건
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-[#1a1a1a]/35">
          Neo CRM 오더(Opportunity) 합계 · 시트 &lsquo;확정 임박&rsquo;(¥)과 다른 기준
        </p>
      </div>

      {/* 3. 동기화 매출 · 수금 (CNY) */}
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[#1a1a1a]/40">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">동기화 매출 · 수금</span>
          </div>
          <CurrencyChip currency="CNY" />
        </div>
        <p className="mt-2 text-[30px] font-extrabold leading-none tracking-[-0.045em] text-[#084734]">
          {pending ? <ValueSkeleton className="h-8 w-28" /> : formatCNY(neoKpis?.salesAmountMonth)}
        </p>
        <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
          수금 {pending ? <ValueSkeleton className="h-3 w-10" /> : formatCNY(neoKpis?.collectionAmountMonth)}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-[#1a1a1a]/35">
          Neo CRM 동기화 · 이번 달
        </p>
      </div>

      {/* 4. 미수 · 이탈 위험 (자체집계 ₩ + 건수) */}
      <Link
        href="/admin/crm/deals"
        className={`group rounded-2xl border p-3.5 transition-colors ${
          hasRisk ? "border-[#F6D5C5] bg-[#FEF3EE] hover:bg-[#FCE9E0]" : "border-[#e8e8e4] bg-white hover:bg-[#fafaf8]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1.5 ${hasRisk ? "text-[#B85C33]" : "text-[#1a1a1a]/40"}`}>
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">미수 · 이탈 위험</span>
          </div>
          <CurrencyChip currency="KRW" />
        </div>
        <p className={`mt-2 text-[30px] font-extrabold leading-none tracking-[-0.045em] ${hasRisk ? "text-[#B85C33]" : "text-[#111110]"}`}>
          {pending ? (
            <ValueSkeleton className="h-8 w-16" />
          ) : (
            <>
              {formatNumber(riskCount)}
              <span className="ml-1 text-[16px] font-bold">곳</span>
            </>
          )}
        </p>
        <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
          미수 합계 {pending ? <ValueSkeleton className="h-3 w-10" /> : formatKRWAbbrev(revenue?.outstandingAmount)} · Deals에서 처리
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-[#1a1a1a]/35">V2 계약·수납 대비 미수 거래 수 · 자체 집계 ₩</p>
      </Link>
    </div>
  )
}
