"use client"

import { memo } from "react"
import type { ReactNode } from "react"

import { coreBoardTotals } from "./home-record-model"
import { formatNumber, type HardwareDashboard } from "./shared"

interface SummaryBandProps {
  data: HardwareDashboard | null
  // 부모(HardwareInventoryClient)가 이미 계산해 PlannedOutboundPanel에도 넘기는 파생값을
  // 그대로 재사용한다 — 같은 수치를 이 파일에서 다시 집계하면 두 곳이 갈라질 수 있다.
  plannedMovementQuantity: number
  plannedStaleGroupCount: number
}

// 홈 최상단 요약 밴드(감사 2026-09-14, 홈 가시성 개편) — "운영자가 화면을 연 지 3초 안에
// 지금 재고가 얼마, 오늘 처리할 게 뭐, 데이터를 믿어도 되나를 안다"가 유일한 목적이다.
// 칸마다 큰 숫자 + 작은 라벨(CategoryCardsSection과 같은 타이포 위계)이고, 클릭하면 근거
// 섹션으로 스크롤한다(각 섹션에 id="hardware-section-*" 앵커를 심어 뒀다 — PlannedOutboundPanel·
// StockLevelsSection·AlertsOutboundSections·ImportFreshnessStrip 참고). 새 필터 상태를
// 만들지 않고 순수 앵커 링크(<a href="#...">)로 구현해 부모의 기존 상태 계약을 건드리지
// 않는다 — 스크롤 그 이상(필터 연동)은 보고서에 위임 항목으로 남긴다.
function SummaryBand({ data, plannedMovementQuantity, plannedStaleGroupCount }: SummaryBandProps) {
  const totals = data?.totals ?? null
  const plannedCount = data?.plannedMovements.length ?? 0
  const shortageCount = data?.stock.filter(row => row.low || row.orderRecommended).length ?? 0
  // 창고·가용은 86" · 75" 전자칠판만 보인다(운영자 지정 2026-11-10) — 케이블·터치펜까지 더한 전 품목 합계는
  // 판단에 쓰이지 않는다. 판촉 라인은 빼고, 같은 크기 품목이 여럿이면 더한다(coreBoardTotals).
  const boards = coreBoardTotals(data?.stock ?? [])
  const unallocatedBoards = boards.ifp86.unallocated + boards.ifp75.unallocated

  return (
    <section aria-label="하드웨어 재고 요약" className="grid grid-cols-2 gap-y-4 bg-[#F6F5F4] py-5 xl:grid-cols-4">
      <SummaryTile href="#hardware-section-stock" label="창고 재고" title="제품별 재고로 이동">
        <BoardFigures ifp86={boards.ifp86.warehouse} ifp75={boards.ifp75.warehouse} />
      </SummaryTile>

      <SummaryTile href="#hardware-section-stock" label="가용 재고" title="제품별 재고로 이동">
        <BoardFigures ifp86={boards.ifp86.available} ifp75={boards.ifp75.available} />
        {/* 가용 = 창고 − 물류번호가 잡힌 배송 예정(시트 재고현황과 같은 기준). 물류번호 없는 예정은 빼지 않는다. */}
        {unallocatedBoards > 0 && (
          <p
            className="mt-2 text-[11px] font-semibold text-[#615D59]"
            title="시트에 물류번호 없이 적힌 배송 예정은 시트 재고현황처럼 가용에서 빼지 않습니다."
          >
            물류번호 없는 예정 {formatNumber(unallocatedBoards)}대 별도
          </p>
        )}
      </SummaryTile>

      <SummaryTile href="#hardware-section-planned" label="배송 예정" title="배송 예정 섹션으로 이동">
        <Headline value={formatNumber(plannedCount)} unit={`건 · ${formatNumber(plannedMovementQuantity)}대`} />
        {/* 30일+ 미확정 — PlannedOutboundPanel 헤더 배지와 같은 수치(plannedStaleGroupCount)를
            재사용한다. 큐가 묵으면 판매 요약이 0으로 보이는 원인이라 여기서도 놓치면 안 된다. */}
        {plannedStaleGroupCount > 0 && (
          <span className="mt-2 inline-flex w-fit items-center rounded-full bg-[#FCE9E9] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#8F2C2C]">
            30일+ 미확정 {formatNumber(plannedStaleGroupCount)}딜
          </span>
        )}
      </SummaryTile>

      <SummaryTile href="#hardware-section-stock" label="부족 · 주문 검토" title="현재 재고 섹션으로 이동">
        <Headline value={formatNumber(shortageCount)} unit="품목" negative={shortageCount > 0} />
        <p className="mt-2 text-[11px] font-semibold text-[#615D59]">
          부족 {formatNumber(totals?.lowItems ?? 0)} · 주문 검토 {formatNumber(totals?.orderRecommended ?? 0)}
        </p>
      </SummaryTile>

    </section>
  )
}

function BoardFigures({ ifp86, ifp75 }: { ifp86: number; ifp75: number }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-3">
      <BoardFigure label={'86"'} value={ifp86} />
      <BoardFigure label={'75"'} value={ifp75} />
    </dl>
  )
}

function BoardFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold text-[#615D59]">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1">
        {/* 음수 = 원장 이상 신호 — 다른 칸과 같은 규칙(Danger 텍스트만). */}
        <span className={`text-[28px] font-bold leading-none tracking-[-0.04em] tabular-nums ${value < 0 ? "text-[#B43E3E]" : "text-[#111110]"}`}>
          {formatNumber(value)}
        </span>
        <span className="text-[12px] font-semibold text-[#615D59]">대</span>
      </dd>
    </div>
  )
}

function Headline({ value, unit, negative }: { value: string; unit: string; negative?: boolean }) {
  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
      {/* 음수 = 원장 이상 신호 — CategoryCardsSection·StockLevelsSection과 같은 규칙(Danger 텍스트만). */}
      <span className={`text-[34px] font-bold leading-none tracking-[-0.04em] tabular-nums ${negative ? "text-[#B43E3E]" : "text-[#111110]"}`}>
        {value}
      </span>
      <span className="text-[12px] font-semibold text-[#615D59]">{unit}</span>
    </p>
  )
}

// 카드 배경은 항상 흰색·아웃라인 — 상태색은 안의 배지·숫자 텍스트에만 쓴다(DESIGN.md: 큰 카드
// 배경을 틴트로 칠하지 않는다). hover는 그린 보더로만 살짝 반응해 "클릭 가능"을 알린다.
function SummaryTile({ href, label, title, children }: { href: string; label: string; title: string; children: ReactNode }) {
  return (
    <a
      href={href}
      title={title}
      className="group flex min-w-0 flex-col border-l border-[rgba(0,0,0,0.08)] px-5 first:border-l-0 hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
    >
      <p className="text-[11px] font-bold tracking-[0.04em] text-[#615D59]">{label}</p>
      {children}
    </a>
  )
}

export default memo(SummaryBand)
