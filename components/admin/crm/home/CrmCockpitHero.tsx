"use client"

// CRM 홈 — 코크핏 KPI 히어로 밴드. app/admin/crm/page.tsx 분해(2026-08-28)로 이동.
// 2026-09-15(home-01): overview 상태 메타(business.ok·neoCrm.ok·snapshot)를 읽어 부분 실패를
// '—'로, 스냅샷·갱신 지연을 캡션·칩으로 드러낸다. 실패를 "$0"·"¥0"으로 그리지 않는다.

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { AlertCircle, BarChart3, CircleDollarSign, RefreshCw, TrendingUp } from "lucide-react"
import CrmNoticeBanner from "@/components/admin/crm/CrmNoticeBanner"
import { formatCNY, formatKRWAbbrev } from "@/lib/crm/money-format"
import { STATUS_TONE_CLASS, STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import { metricValue, resolveMetricState, type MetricState } from "./metric-value"
import {
  CurrencyChip,
  formatNumber,
  formatOverviewDate,
  formatUSD,
  SECONDARY_TEXT_CLASS,
  ValueSkeleton,
  type AdminCrmOverview,
} from "./shared"

const BUSINESS_FALLBACK_ERROR = "자체 집계(매출·미수)를 불러오지 못했습니다."
const NEO_FALLBACK_ERROR = "Neo CRM 팀 리포트를 불러오지 못했습니다."

type DismissedBanners = { all: boolean; business: boolean; neo: boolean }
const NONE_DISMISSED: DismissedBanners = { all: false, business: false, neo: false }

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
  // 카드 1·4(자체 집계)와 카드 2·3(Neo CRM)은 실패 원천이 다르다 — 각각 판정한다.
  const businessState: MetricState = resolveMetricState({
    loading,
    hasData: Boolean(overview),
    partialFailure: overview ? overview.business.ok === false : false,
  })
  const neoState: MetricState = resolveMetricState({
    loading,
    hasData: Boolean(overview),
    partialFailure: overview ? overview.neoCrm?.ok === false : false,
  })
  const businessError = overview && overview.business.ok === false ? overview.business.error ?? BUSINESS_FALLBACK_ERROR : null
  const neoError = overview && overview.neoCrm?.ok === false ? overview.neoCrm.error ?? NEO_FALLBACK_ERROR : null
  const snapshot = overview?.business.snapshot
  const isSnapshot = snapshot?.source === "db_snapshot"
  const stale = Boolean(snapshot?.stale)

  // 실패 배너 닫기(UX 규약 3: 재시도 + 닫기) — 원천별로 닫고, 재조회가 시작되면(loading=true) 다시 연다.
  // 이전 렌더의 loading 을 state 로 기억해 렌더 중에 되돌리는 React 공식 패턴(effect 없이 1회 재렌더).
  const [dismissed, setDismissed] = useState<DismissedBanners>(NONE_DISMISSED)
  const [prevLoading, setPrevLoading] = useState(loading)
  if (loading !== prevLoading) {
    setPrevLoading(loading)
    if (loading) setDismissed(NONE_DISMISSED)
  }
  const dismiss = (key: keyof DismissedBanners) => setDismissed((prev) => ({ ...prev, [key]: true }))

  const riskCount = kpis?.paymentRiskCount ?? 0
  // 실패로 0이 된 값은 위험 판정에 쓰지 않는다(카드 4 강조 색은 ready 일 때만).
  const hasRisk = businessState === "ready" && (riskCount > 0 || (revenue?.outstandingAmount ?? 0) > 0)

  const totalFailure = Boolean(error) && !overview
  if (totalFailure && !dismissed.all) {
    return (
      <CrmNoticeBanner
        tone="danger"
        className="mb-4"
        title="매출·수금 현황을 확인하지 못했습니다"
        message={`${error} · 의사결정용 수치를 0으로 대체하지 않았습니다.`}
        action={{ label: "다시 확인", onClick: onRetry, pending: loading }}
        onDismiss={() => dismiss("all")}
      />
    )
  }

  const bigValue = (state: MetricState, format: () => ReactNode, skeleton = "h-8 w-28") =>
    metricValue(state, format, { skeletonClassName: skeleton, unavailableClassName: "font-extrabold" })
  const smallValue = (state: MetricState, format: () => ReactNode, skeleton = "h-3 w-10") =>
    metricValue(state, format, { skeletonClassName: skeleton })

  return (
    <div className="mb-4">
      {/* 기준 시각·출처 캡션(UX 규약 4) — 우선순위 큐의 `기준 {generatedAt}` 캡션과 같은 포맷. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className={totalFailure ? STATUS_TONE_TEXT_CLASS.danger : SECONDARY_TEXT_CLASS}>
          {pending ? (
            <ValueSkeleton className="h-3 w-28" />
          ) : totalFailure ? (
            // 전체 실패 배너를 닫은 뒤 — 기준 시각을 '-'로 그리지 않고 실패임을 캡션에 남긴다.
            <>기준 시각 확인 불가 · 불러오기 실패</>
          ) : (
            <>
              기준 {formatOverviewDate(overview?.generatedAt)} · {isSnapshot ? "스냅샷" : "실시간"}
              {isSnapshot && snapshot?.refreshedAt ? ` (갱신 ${formatOverviewDate(snapshot.refreshedAt)})` : ""}
            </>
          )}
        </span>
        {/* 항상 마운트된 SR 상태 영역(UX 규약 7) — 갱신 지연·실패 전환을 텍스트 교체로 통지한다.
            (role=status 는 새로 삽입된 노드를 건너뛰는 SR 구현이 있어 칩 자체를 조건부 마운트하지 않는다.) */}
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {pending ? "" : totalFailure ? "매출·수금 현황을 불러오지 못했습니다." : stale ? "스냅샷 갱신이 지연되고 있습니다." : ""}
        </span>
        {stale || totalFailure ? (
          <span
            data-tone={totalFailure ? "danger" : "warning"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
              totalFailure ? STATUS_TONE_CLASS.danger : STATUS_TONE_CLASS.warning
            }`}
          >
            {totalFailure ? "확인 불가" : "갱신 지연"}
            <button
              type="button"
              onClick={onRetry}
              disabled={loading}
              aria-busy={loading ? true : undefined}
              className="inline-flex items-center gap-0.5 underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden />
              {totalFailure ? "다시 확인" : "새로고침"}
            </button>
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
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
            {businessState === "unavailable" ? (
              // 다크 배경에서는 danger 텍스트가 묻히므로 흰 글자로 '—' — SR 라벨은 헬퍼와 동일.
              <span role="img" aria-label="확인 불가" title="확인 불가" data-metric-state="unavailable">
                —
              </span>
            ) : (
              bigValue(businessState, () => formatKRWAbbrev(revenue?.deliveryTotalAmount), "h-8 w-32 bg-white/15")
            )}
          </p>
          <p className="mt-1 text-[11px] opacity-80">
            견적 {pending ? <ValueSkeleton className="h-3 w-10 bg-white/15" /> : businessState === "ready" ? formatKRWAbbrev(revenue?.acceptedQuoteAmount) : "—"} · 계약{" "}
            {pending ? <ValueSkeleton className="h-3 w-10 bg-white/15" /> : businessState === "ready" ? formatKRWAbbrev(revenue?.contractedAmount) : "—"}
          </p>
          {/* 산정 기준 캡션(CRM-6) — 여기 '확정'은 V2 딜리버리 인식, 시트 '확정 표시'(¥)와 다른 기준 */}
          {businessError ? (
            <p className="mt-1 text-[10px] leading-relaxed text-white/90">확인 불가 · {businessError}</p>
          ) : (
            <p className="mt-1 text-[10px] leading-relaxed text-white/80">
              V2 딜리버리(출고) 인식 합계 · 시트 &lsquo;확정 표시&rsquo;(¥)와 다른 기준
            </p>
          )}
        </div>

        {/* 2. 오더 · 확정 임박 (USD) */}
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className={`flex items-center gap-1.5 ${SECONDARY_TEXT_CLASS}`}>
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">오더 · 확정 임박</span>
            </div>
            <CurrencyChip currency="USD" />
          </div>
          <p className="mt-2 text-[30px] font-extrabold leading-none tracking-[-0.045em] text-[#111110]">
            {bigValue(neoState, () => formatUSD(neoKpis?.opportunityAmount))}
          </p>
          <p className={`mt-1 text-[11px] ${SECONDARY_TEXT_CLASS}`}>
            이번 달 {smallValue(neoState, () => formatNumber(neoKpis?.opportunityCountMonth), "h-3 w-6")}건
          </p>
          {neoError ? (
            <p className={`mt-1 text-[10px] leading-relaxed ${STATUS_TONE_TEXT_CLASS.danger}`}>확인 불가 · {neoError}</p>
          ) : (
            <p className={`mt-1 text-[10px] leading-relaxed ${SECONDARY_TEXT_CLASS}`}>
              Neo CRM 오더(Opportunity) 합계 · 시트 &lsquo;확정 임박&rsquo;(¥)과 다른 기준
            </p>
          )}
        </div>

        {/* 3. 동기화 매출 · 수금 (CNY) */}
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className={`flex items-center gap-1.5 ${SECONDARY_TEXT_CLASS}`}>
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">동기화 매출 · 수금</span>
            </div>
            <CurrencyChip currency="CNY" />
          </div>
          <p className="mt-2 text-[30px] font-extrabold leading-none tracking-[-0.045em] text-[#084734]">
            {bigValue(neoState, () => formatCNY(neoKpis?.salesAmountMonth))}
          </p>
          <p className={`mt-1 text-[11px] ${SECONDARY_TEXT_CLASS}`}>
            수금 {smallValue(neoState, () => formatCNY(neoKpis?.collectionAmountMonth))}
          </p>
          {neoError ? (
            <p className={`mt-1 text-[10px] leading-relaxed ${STATUS_TONE_TEXT_CLASS.danger}`}>확인 불가 · {neoError}</p>
          ) : (
            <p className={`mt-1 text-[10px] leading-relaxed ${SECONDARY_TEXT_CLASS}`}>
              Neo CRM 동기화 · 이번 달
              {overview?.neoCrm?.latestSyncedAt ? ` · 동기화 ${formatOverviewDate(overview.neoCrm.latestSyncedAt)}` : ""}
            </p>
          )}
        </div>

        {/* 4. 미수 · 이탈 위험 (자체집계 ₩ + 건수) */}
        <Link
          href="/admin/crm/deals"
          className={`group rounded-2xl border p-3.5 transition-colors ${
            hasRisk ? `${STATUS_TONE_CLASS.danger} hover:brightness-[0.98]` : "border-[#e8e8e4] bg-white hover:bg-[#fafaf8]"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className={`flex items-center gap-1.5 ${hasRisk ? STATUS_TONE_TEXT_CLASS.danger : SECONDARY_TEXT_CLASS}`}>
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">미수 · 이탈 위험</span>
            </div>
            <CurrencyChip currency="KRW" />
          </div>
          <p
            className={`mt-2 text-[30px] font-extrabold leading-none tracking-[-0.045em] ${
              hasRisk ? STATUS_TONE_TEXT_CLASS.danger : "text-[#111110]"
            }`}
          >
            {bigValue(
              businessState,
              () => (
                <>
                  {formatNumber(riskCount)}
                  <span className="ml-1 text-[16px] font-bold">곳</span>
                </>
              ),
              "h-8 w-16"
            )}
          </p>
          <p className={`mt-1 text-[11px] ${hasRisk ? STATUS_TONE_TEXT_CLASS.danger : SECONDARY_TEXT_CLASS}`}>
            미수 합계 {smallValue(businessState, () => formatKRWAbbrev(revenue?.outstandingAmount))} · Deals에서 처리
          </p>
          {businessError ? (
            <p className={`mt-1 text-[10px] leading-relaxed ${STATUS_TONE_TEXT_CLASS.danger}`}>확인 불가 · {businessError}</p>
          ) : (
            <p className={`mt-1 text-[10px] leading-relaxed ${hasRisk ? STATUS_TONE_TEXT_CLASS.danger : SECONDARY_TEXT_CLASS}`}>
              V2 계약·수납 대비 미수 거래 수 · 자체 집계 ₩
            </p>
          )}
        </Link>
      </div>

      {/* 부분 실패 배너 — 카드마다 role=alert 를 반복하지 않고 원천별로 한 번만 통지·재시도(UX 규약 3). */}
      {businessError && !dismissed.business ? (
        <CrmNoticeBanner
          tone="danger"
          className="mt-2"
          title="자체 집계(인식 매출·미수)를 확인하지 못했습니다"
          message={`${businessError} · 카드 1·4의 값은 0이 아니라 확인 불가입니다.`}
          action={{ label: "다시 확인", onClick: onRetry, pending: loading }}
          onDismiss={() => dismiss("business")}
        />
      ) : null}
      {neoError && !dismissed.neo ? (
        <CrmNoticeBanner
          tone="danger"
          className="mt-2"
          title="Neo CRM 팀 리포트를 확인하지 못했습니다"
          message={`${neoError} · 오더·동기화 매출 카드의 값은 0이 아니라 확인 불가입니다.`}
          action={{ label: "다시 확인", onClick: onRetry, pending: loading }}
          onDismiss={() => dismiss("neo")}
        />
      ) : null}
    </div>
  )
}
