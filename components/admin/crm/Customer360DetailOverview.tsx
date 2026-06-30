"use client"

import { useMemo, type ReactNode } from "react"
import {
  CalendarClock,
  Coins,
  Gauge,
  GraduationCap,
  Hourglass,
  Receipt,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { MiniFunnel, Panel, StatTile, type FunnelStage } from "@/components/admin/viz"
import CrmContactValue from "@/components/admin/crm/CrmContactValue"
import { formatCNY, formatUSD } from "@/lib/crm/money-format"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"

import {
  CONFIDENCE_LABEL,
  expireDdayLabel,
  FieldCell,
  formatDay,
  latestIso,
  SERVICE_RISK_CLASS,
  SERVICE_RISK_LABEL,
  SEVERITY_CLASS,
  SEVERITY_LABEL,
  sumAmounts,
} from "./Customer360DetailShared"

// 스탯 묶음 위에 붙는 작은 그룹 라벨 — 재무 / 라이프사이클을 시각적으로 분리한다.
function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a]/35">{children}</p>
}

export default function Customer360DetailOverview({ data }: { data: Customer360 }) {
  const header = data.header
  const money = data.money
  const isLead = data.source !== "neo_account"
  const serviceRisk = data.serviceRisk

  const collectionTotal = useMemo(() => sumAmounts(money.collections.map((c) => c.amount)), [money.collections])
  const performanceTotal = useMemo(() => sumAmounts(money.performances.map((p) => p.amount)), [money.performances])
  const lastClassAt = useMemo(() => latestIso(money.eeoAccounts.map((a) => a.lastClassAt)), [money.eeoAccounts])

  // 견적(Deal Lite) → 오더(NEO) → 수납(NEO). 통화가 단계별로 달라 막대값은 "건수", 금액은 각 탭에서 확인.
  const funnelStages: FunnelStage[] = useMemo(
    () => [
      { label: "견적", value: data.deals.summary.total, tone: "neutral" },
      { label: "오더", value: money.orders.length, tone: "brand" },
      { label: "수납", value: money.collections.length, tone: "brand" },
    ],
    [data.deals.summary.total, money.orders.length, money.collections.length]
  )

  const hasRiskBanner = data.risk.reasons.length > 0
  const showFunnel = money.available || data.deals.summary.total > 0

  return (
    <div className="space-y-4">
      {/* 리스크 신호 — 헤더의 심각도 칩을 보완하는 상세 사유. */}
      {hasRiskBanner || serviceRisk ? (
        <section className="space-y-3">
          {hasRiskBanner ? (
            <div className={`rounded-2xl border px-4 py-3 ${SEVERITY_CLASS[data.risk.severity]}`}>
              <p className="text-[12px] font-bold">리스크 {SEVERITY_LABEL[data.risk.severity]}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {data.risk.reasons.map((reason) => (
                  <li key={reason} className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {serviceRisk ? (
            <div className="rounded-2xl border border-[#f0f0ec] bg-[#fafaf8] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-[#1a1a1a]/45">서비스(NEO)</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      SERVICE_RISK_CLASS[serviceRisk.level] ?? SERVICE_RISK_CLASS.normal
                    }`}
                  >
                    {SERVICE_RISK_LABEL[serviceRisk.level] ?? serviceRisk.level}
                  </span>
                </div>
                <span className="text-[10px] text-[#1a1a1a]/35">
                  {serviceRisk.freshnessLabel ?? "NEO 정보 없음"} · {CONFIDENCE_LABEL[serviceRisk.confidence]}
                </span>
              </div>
              {serviceRisk.reasons.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {serviceRisk.reasons.map((reason) => (
                    <li key={reason.code} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#7A520F]">
                      {reason.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 리드 다음 액션 */}
      {isLead && (header?.nextActionLabel || header?.priorityReason) ? (
        <section className="rounded-2xl border border-[#D7EBDD] bg-[#ECFDF5] p-4">
          <div className="mb-1 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[#084734]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#084734]">다음 액션</span>
          </div>
          {header?.nextActionLabel ? (
            <h3 className="text-[15px] font-bold text-[#111110]">{header.nextActionLabel}</h3>
          ) : null}
          {header?.priorityReason ? (
            <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/55">{header.priorityReason}</p>
          ) : null}
        </section>
      ) : null}

      {/* 연락처 */}
      <Panel title="연락처">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <FieldCell label="전화" value={<CrmContactValue value={data.contacts?.phone} />} />
          <FieldCell
            label="이메일"
            value={
              data.contacts?.email ? (
                <a href={`mailto:${data.contacts.email}`} className="text-[#084734] hover:underline">
                  {data.contacts.email}
                </a>
              ) : (
                <span className="text-[#1a1a1a]/35">이메일 미확인</span>
              )
            }
          />
          {data.contacts?.extra.map((field) => (
            <FieldCell key={`${field.label}:${field.value}`} label={field.label} value={field.value} />
          ))}
        </div>
      </Panel>

      {/* 재무 현황 (NEO 고객만) */}
      {money.available ? (
        <section>
          <GroupLabel>재무 현황</GroupLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={<Wallet className="h-4 w-4" />} label="잔액" value={formatCNY(money.totalBalance)} tone="brand" />
            <StatTile icon={<Receipt className="h-4 w-4" />} label="오더 합계" value={formatUSD(money.totalOrderAmount)} tone="neutral" />
            <StatTile icon={<Coins className="h-4 w-4" />} label="수금 합계" value={formatCNY(collectionTotal)} tone="neutral" />
            <StatTile icon={<TrendingUp className="h-4 w-4" />} label="성과 합계" value={formatCNY(performanceTotal)} tone="neutral" />
          </div>
        </section>
      ) : null}

      {/* 라이프사이클 / 리드 현황 */}
      <section>
        <GroupLabel>{money.available ? "라이프사이클" : "리드 현황"}</GroupLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {money.available ? (
            <>
              <StatTile
                icon={<Hourglass className="h-4 w-4" />}
                label="만료 D-day"
                value={expireDdayLabel(data.risk.nearestExpireAt)}
                hint={data.risk.nearestExpireAt ? formatDay(data.risk.nearestExpireAt) : undefined}
                tone="caution"
              />
              <StatTile
                icon={<GraduationCap className="h-4 w-4" />}
                label="최근 수업일"
                value={formatDay(lastClassAt)}
                tone="neutral"
              />
            </>
          ) : null}
          <StatTile icon={<Gauge className="h-4 w-4" />} label="점수" value={header?.score ?? "-"} tone="neutral" />
          <StatTile
            icon={<CalendarClock className="h-4 w-4" />}
            label="최근 업데이트"
            value={formatDay(header?.updatedAt)}
            hint={header?.createdAt ? `생성 ${formatDay(header.createdAt)}` : undefined}
            tone="neutral"
          />
        </div>
      </section>

      {/* 세일즈 퍼널 */}
      {showFunnel ? (
        <Panel title="세일즈 퍼널" description="견적 → 오더 → 수납 (단계별 건수 · 통화가 달라 금액은 각 탭에서 확인)">
          <MiniFunnel stages={funnelStages} />
        </Panel>
      ) : null}
    </div>
  )
}
