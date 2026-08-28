"use client"

// 머니 — 제품 매출(REV/HW 원장 계정키 조인) + NEO 수금·성과 상세.
// 합계 파생값은 부모(드로어 본체)가 계산해 내려준다(헤더 플래그·LTV와 공유).
// Customer360Drawer.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import Link from "next/link"
import { ArrowUpRight, Coins, Sparkles } from "lucide-react"
import { formatCNY, formatUSD } from "@/lib/crm/money-format"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import { formatDay, ProductTile, SectionTitle } from "./shared"

export default function DrawerMoneySection({
  data,
  displayName,
  moneyVisible,
  orderTotal,
  collectionTotal,
  performanceTotal,
  recentPerformances,
}: {
  data: Customer360
  displayName: string
  moneyVisible: boolean
  orderTotal: number | null
  collectionTotal: number | null
  performanceTotal: number | null
  recentPerformances: NonNullable<Customer360["money"]>["performances"]
}) {
  const money = data.money
  // 제품 매출 요약(REV/HW 원장 계정키 조인) — SW·HW 결제 누적(¥), 칠판 대수, 매칭 여부.
  const productSummary = data.productSummary
  const productMatched = productSummary?.matched ?? false

  return (
    <section id="c360-money" className="scroll-mt-2 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <SectionTitle icon={<Coins className="h-3.5 w-3.5" />}>머니 · 제품 매출</SectionTitle>
      {/* SW 결제 누적 · HW 결제 누적(¥ CNY) · HW 대수(칠판, 대) */}
      <div className="grid grid-cols-3 gap-2">
        <ProductTile
          label="SW 결제 누적"
          chip="¥"
          display={formatCNY(productSummary?.swCumulativeCNY ?? null)}
          matched={productMatched}
        />
        <ProductTile
          label="HW 결제 누적"
          chip="¥"
          display={formatCNY(productSummary?.hwCumulativeCNY ?? null)}
          matched={productMatched}
        />
        <ProductTile
          label="HW 대수 · 칠판"
          chip="대"
          display={`${(productSummary?.hwBoardCount ?? 0).toLocaleString("ko-KR")}대`}
          matched={productMatched}
        />
      </div>
      {productMatched ? (
        <p className="mt-1.5 text-[10px] text-[#1a1a1a]/35">
          REV 원장 결제 누적 · 칠판 대수는 HW 출고(배송예정 제외) · 계정키 조인
        </p>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[#fafaf8] px-2.5 py-1.5">
          <span className="text-[11px] text-[#1a1a1a]/45">REV/HW 원장과 매칭된 기록이 없습니다.</span>
          <Link
            href={`/admin/crm/matching?name=${encodeURIComponent(displayName)}`}
            className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[#084734] hover:underline"
          >
            매칭 연결
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* NEO 수금·성과 상세(공식 원천, ¥ CNY) — 데이터 있을 때만 유지 */}
      {moneyVisible ? (
        <div className="mt-3 space-y-3 border-t border-[#f0f0ec] pt-3">
          {(data.serviceRisk?.level === "urgent" || data.serviceRisk?.level === "soon") &&
          orderTotal != null &&
          orderTotal > 0 ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-[#FBF1E0] px-2.5 py-1.5 text-[11px] font-medium text-[#7A520F]">
              <Sparkles className="h-3 w-3 shrink-0" />
              갱신 예상 {formatUSD(orderTotal)} · 직전 계약 기준 추정(만료 임박)
            </div>
          ) : null}

          {/* 수금 · 성과 합계 — 둘 다 CNY(¥). */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/35">수금 합계</p>
              <p className="text-[15px] font-bold text-[#111110]">{formatCNY(collectionTotal)}</p>
            </div>
            <div className="rounded-xl bg-[#ECFDF5] px-3 py-2">
              <p className="text-[11px] font-semibold text-[#084734]/70">성과 합계</p>
              <p className="text-[15px] font-bold text-[#084734]">{formatCNY(performanceTotal)}</p>
            </div>
          </div>
          {recentPerformances.length ? (
            <div className="space-y-1.5">
              {recentPerformances.map((perf) => (
                <div key={perf.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="min-w-0 truncate font-medium text-[#111110]">{perf.title}</span>
                  <span className="shrink-0 text-[#1a1a1a]/45">
                    {formatCNY(perf.amount)}
                    {perf.occurredAt ? ` · ${formatDay(perf.occurredAt)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {money?.eeoAccounts.length ? (
            <div className="space-y-1.5 border-t border-[#f0f0ec] pt-3">
              {money.eeoAccounts.slice(0, 4).map((eeo) => (
                <div key={eeo.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate font-medium text-[#111110]">{eeo.name}</span>
                  <span className="shrink-0 text-[#1a1a1a]/45">
                    잔액 {formatCNY(eeo.balance)} · 만료 {formatDay(eeo.expireAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
