"use client"

import { memo } from "react"
import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

import { summarizeStockAttention, summarizeStockTotals } from "@/lib/hardware/stock-attention"
import { judgeImportFreshness } from "./ImportFreshnessStrip"
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
  // 창고·가용 헤드라인은 실판매 라인 합이다 — 판촉 라인은 아래 줄에 따로(하드웨어 라운드 3 H-10, 카테고리 카드와 같은 기준).
  // 예전엔 서버 totals(판촉 포함)라 판촉 원장 이상(음수)이 헤드라인을 깎았다.
  const stockTotals = summarizeStockTotals(data?.stock ?? [])
  const plannedCount = data?.plannedMovements.length ?? 0
  // 부족과 주문 검토의 합집합(품목당 한 번) — 알림 목록과 같은 규칙(하드웨어 라운드 2 H-2). 예전엔 부족 품목이
  // 주문 검토에도 걸려 두 번 세졌다.
  const attention = summarizeStockAttention(data?.stock ?? [])
  const shortageCount = attention.total
  // 이관 신선도 임계값은 ImportFreshnessStrip이 이미 갖고 있다 — 여기서 새로 발명하지 않고
  // 그 판정 함수를 그대로 불러 같은 결과를 보장한다(두 곳이 다른 기준으로 어긋나는 사고 방지).
  const freshness = judgeImportFreshness(data?.importRun ?? null, { lastSuccess: data?.importRunLastSuccess ?? null })

  const freshnessHeadline =
    freshness.level === "none"
      ? "기록 없음"
      : freshness.state === "running"
        ? "진행 중"
        : freshness.state === "stalled"
          ? "중단됨"
          : freshness.failed
            ? "이관 실패"
            : freshness.daysAgo == null
            ? "-"
            : freshness.daysAgo === 0
              ? "오늘"
              : `${formatNumber(freshness.daysAgo)}일 전`
  const freshnessDetail =
    freshness.state === "running"
      ? "끝나면 새로고침으로 확인하세요"
      : freshness.state !== "success" && freshness.basisKey
        ? `원장은 ${freshness.basisKey} 성공 이관 기준`
        : freshness.level === "danger"
          ? "재고 수치가 실물과 다를 수 있습니다"
          : freshness.level === "warning"
            ? "갱신 검토가 필요합니다"
            : freshness.level === "none"
              ? "시트 이관을 시작하세요"
              : "정상 범위입니다"
  const freshnessToneClass =
    freshness.level === "danger" ? "text-[#B43E3E]" : freshness.level === "warning" ? "text-[#A8741A]" : "text-[#111110]"

  return (
    <section aria-label="하드웨어 재고 요약" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <SummaryTile href="#hardware-section-stock" label="창고 재고" title="현재 재고 섹션으로 이동">
        <Headline value={formatNumber(stockTotals.warehouse)} unit="대" negative={stockTotals.warehouse < 0} />
        {stockTotals.promoted && <PromotedLine value={stockTotals.promoted.warehouse} />}
      </SummaryTile>

      <SummaryTile href="#hardware-section-stock" label="가용 재고" title="현재 재고 섹션으로 이동">
        <Headline value={formatNumber(stockTotals.available)} unit="대" negative={stockTotals.available < 0} />
        {stockTotals.promoted && <PromotedLine value={stockTotals.promoted.available} />}
      </SummaryTile>

      <SummaryTile href="#hardware-section-planned" label="예정 출고 대기" title="예상 출고 섹션으로 이동">
        <Headline value={formatNumber(plannedCount)} unit={`건 · ${formatNumber(plannedMovementQuantity)}대`} />
        {/* 30일+ 방치 — PlannedOutboundPanel 헤더 배지와 같은 수치(plannedStaleGroupCount)를
            재사용한다. 큐가 묵으면 판매 요약이 0으로 보이는 원인이라 여기서도 놓치면 안 된다. */}
        {plannedStaleGroupCount > 0 && (
          <span className="mt-2 inline-flex w-fit items-center rounded-full bg-[#FCE9E9] px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-[#8F2C2C]">
            30일+ 방치 {formatNumber(plannedStaleGroupCount)}건
          </span>
        )}
      </SummaryTile>

      <SummaryTile href="#hardware-section-stock" label="부족 · 주문 검토" title="현재 재고 섹션으로 이동">
        <Headline value={formatNumber(shortageCount)} unit="품목" negative={shortageCount > 0} />
        <p className="mt-2 text-[11px] font-semibold tabular-nums text-[#615D59]">
          부족 {formatNumber(attention.low)} · 주문 검토 {formatNumber(attention.orderOnly)}
          {attention.ledgerCheck > 0 ? ` · 원장 점검 ${formatNumber(attention.ledgerCheck)}` : ""}
        </p>
      </SummaryTile>

      <SummaryTile href="#hardware-section-freshness" label="시트 이관 신선도" title="이관 신선도 안내로 이동">
        <p className="mt-2 flex items-center gap-1.5">
          {/* 아이콘은 danger일 때만 — 평소엔 소음, 정말 오래 묵었을 때만 시선을 끈다(요청사항 ③.2). */}
          {freshness.level === "danger" && <AlertTriangle aria-hidden className="h-[18px] w-[18px] shrink-0 text-[#B43E3E]" />}
          <span className={`text-[22px] font-bold leading-none tracking-[-0.02em] tabular-nums ${freshnessToneClass}`}>
            {freshnessHeadline}
          </span>
        </p>
        <p className={`mt-2 text-[11px] font-semibold ${freshness.level === "ok" ? "text-[#615D59]" : freshnessToneClass}`}>
          {freshnessDetail}
        </p>
      </SummaryTile>
    </section>
  )
}

// 판촉(promoted) 라인 합 — 헤드라인에서 뺀 값을 숨기지 않고 한 줄로 말한다. 음수면 원장 점검 신호(Danger 텍스트).
function PromotedLine({ value }: { value: number }) {
  return (
    <p
      className={`mt-2 text-[11px] font-semibold tabular-nums ${value < 0 ? "text-[#B43E3E]" : "text-[#615D59]"}`}
      title="판촉(promoted) 라인은 실판매 합계와 따로 셉니다 — 카테고리 카드와 같은 기준"
    >
      판촉 별도 {formatNumber(value)}대{value < 0 ? " · 원장 점검" : ""}
    </p>
  )
}

function Headline({ value, unit, negative }: { value: string; unit: string; negative?: boolean }) {
  return (
    <p className="mt-2 flex items-baseline gap-1.5">
      {/* 음수 = 원장 이상 신호 — CategoryCardsSection·StockLevelsSection과 같은 규칙(Danger 텍스트만). */}
      <span className={`text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums ${negative ? "text-[#B43E3E]" : "text-[#111110]"}`}>
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
      className="group flex min-w-0 flex-col rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition hover:border-[#084734]/30 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
    >
      <p className="text-[11px] font-bold tracking-[0.04em] text-[#615D59]">{label}</p>
      {children}
    </a>
  )
}

export default memo(SummaryBand)
