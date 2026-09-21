"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { ArrowDownRight, ArrowUpRight, Minus, Target, TrendingUp, Users, Wallet } from "lucide-react"
import { StatTile } from "@/components/admin/viz"
import { COUNT, PCT1, money } from "@/components/admin/campaigns/event-format"
import { SOURCE_GROUP_ORDER } from "@/lib/crm/lead-attribution"
import { campaignHubHref } from "@/lib/marketing/hub-tabs"
import {
  prevBasisLabel,
  shiftDays,
  type DailyPoint,
  type LeadDailyBySourcePoint,
  type MarketingPerfResponse,
  type PerfKpi,
  type PerfPeriod,
} from "@/lib/marketing/perf"
import { foldSourceGroups } from "@/lib/marketing/source-fold"

// 한눈에 층 히어로 4칸 — 리드(전 소스) · 광고비 USD · CPL USD · 전환율. 값 44px, 패널 하나.
//
// 2026-09-14 재구성: 5칸(예산 집행률 포함)·카드 5개 → 4칸·패널 1개. 예산 집행률(KRW 수기)은
// 상세 › 퍼널·채널로 내렸다. 4개는 Overview 의 MarketingPerfStrip 과 같은 정의·같은 순서다 —
// 두 화면이 같은 cacheKey 의 같은 응답을 읽으므로 숫자가 어긋날 여지가 없다.
// 카드 4개가 아니라 세로선으로 나눈 패널 1개인 이유: 첫 스크린의 박스 수를 줄여 판정 밴드와
// 추이 카드 사이에서 숫자가 "면"이 아니라 "글자"로 읽히게 한다(기획 §3.4 박스 예산).
//
// 통화 분리 엄수: USD 지표(광고비·CPL)에 ₩ 금지. 값/델타는 전부 null 가능 — null 은 "—" 로
// 정직 표기하고 0 으로 지어내지 않는다.
//
// 스파크라인 규칙(정직 축 일치): 타일 값과 "같은 모집단·같은 정의"의 시계열만 붙인다.
//  · 광고비 = Meta 일자 스냅샷 spend 합 → daily[].spend 그대로(분자 동일).
//  · 리드   = 우리 leads 테이블(전 소스, 테스트 제외) → leadDailyBySource 를 접어 쓴다.
//  · CPL·전환율 = 같은 정의의 일자 시계열이 없다 — 선을 지어내지 않고 분모·분자를 글로 쓴다.

// Sparkline 은 Recharts 의존이라 viz 배럴 밖에 있고, StatTile 은 "Recharts-free 유지" 계약이다 —
// 호출부가 next/dynamic(ssr:false)으로 감싼 노드를 sparkline 슬롯에 넘기는 것이 저장소 규약.
const Sparkline = dynamic(
  () => import("@/components/admin/viz/Sparkline").then((m) => m.Sparkline),
  { ssr: false, loading: () => <div className="h-[28px]" /> }
)

const SPARK_HEIGHT = 28

/** 리드 보드 — 이 타일은 "전 소스 리드"라 광고 그룹 필터를 붙이지 않는다(타일 숫자와 착지 수 일치). */
const LEADS_BOARD_HREF = "/admin/crm/customers/leads"

// 지표 방향 — 델타 색이 "좋아짐/나빠짐"을 말한다. CPL 은 감소=좋음, 광고비는 방향 가치판단 없음(중립).
type DeltaValence = "up-good" | "down-good" | "none"

function DeltaHint({
  kpi,
  valence,
  basis,
  note,
}: {
  kpi: PerfKpi
  valence: DeltaValence
  /** 비교 축 문구 — 기간마다 다르다(롤링=직전 동일 길이, QTD/MTD=같은 일수). */
  basis: string
  note?: string
}) {
  const title = `이전 기간(${basis}) 대비`
  let body: React.ReactNode
  if (kpi.deltaPct == null) {
    body = (
      <span title={title} className="text-[#1a1a1a]/35">
        이전 기간 대비 —
      </span>
    )
  } else {
    const improved =
      valence === "none" ? null : valence === "up-good" ? kpi.deltaPct > 0 : kpi.deltaPct < 0
    const toneClass =
      kpi.deltaPct === 0 || improved == null
        ? "text-[#1a1a1a]/55"
        : improved
          ? "text-[#084734]"
          : "text-[#B85C33]"
    const Icon = kpi.deltaPct === 0 ? Minus : kpi.deltaPct > 0 ? ArrowUpRight : ArrowDownRight
    body = (
      <span title={title} className="inline-flex items-center gap-1">
        <span className={`inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums ${toneClass}`}>
          <Icon className="h-3 w-3" />
          {kpi.deltaPct > 0 ? "+" : ""}
          {kpi.deltaPct}%
        </span>
        <span className="text-[#1a1a1a]/40">이전 기간 대비</span>
      </span>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {body}
      {note && <span className="text-[#1a1a1a]/35">{note}</span>}
    </span>
  )
}

/**
 * 리드 타일 스파크라인용 일자 시계열 — 소스 그룹별 일자 유입을 하루 한 숫자로 접는다.
 * 응답 계약상 leadDailyBySource 는 "리드가 있는 날"만 담는다(0 채움 없음). 리드 소스 조회가
 * 성공한 경우에 한해 표시층에서 기간 전체 날짜로 0 을 채운다 — 성공했는데 행이 없는 날은
 * 실측 0건이므로 날조가 아니다.
 */
function foldLeadDaily(rows: LeadDailyBySourcePoint[], period: PerfPeriod): number[] {
  const byDate = new Map(rows.map((row) => [row.date, row]))
  const out: number[] = []
  let cursor = period.since
  let guard = 0
  while (cursor <= period.until && guard < 400) {
    const row = byDate.get(cursor)
    out.push(row ? SOURCE_GROUP_ORDER.reduce((acc, group) => acc + (row[group] ?? 0), 0) : 0)
    cursor = shiftDays(cursor, 1)
    guard += 1
  }
  return out
}

/** 전 구간 0 인 시계열은 빈 차트와 다를 바 없는 납작한 선만 남긴다 — 슬롯 자체를 비운다. */
function hasShape(series: number[]): boolean {
  return series.some((value) => value > 0)
}

/** 리드 타일 발치의 소스 분해 — 전 소스 리드 안에서 광고 리드가 얼마인지 한 줄로 읽힌다. */
function SourceSplit({ rows }: { rows: LeadDailyBySourcePoint[] }) {
  const fold = useMemo(() => foldSourceGroups(rows), [rows])
  if (fold.total === 0) return null
  return (
    <div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {fold.series.map((item) => (
          <span
            key={item.key}
            className="block h-full"
            style={{ width: `${(item.total / fold.total) * 100}%`, backgroundColor: item.color }}
          />
        ))}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10.5px] tabular-nums text-[#615D59]">
        {fold.series.map((item) => (
          <span
            key={item.key}
            className="inline-flex items-center gap-1"
            title={item.members.length > 0 ? item.members.join(" · ") : undefined}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label} {COUNT.format(item.total)}
          </span>
        ))}
      </p>
    </div>
  )
}

/** 패널 안 4칸의 구분선 — 1열(모바일)은 가로선, 2열은 격자, 4열은 세로선만. */
const CELL_CLASS = [
  "py-4 min-w-0 sm:pr-5",
  "py-4 min-w-0 border-t border-[#f0f0ec] sm:border-t-0 sm:border-l sm:pl-5 xl:px-5",
  "py-4 min-w-0 border-t border-[#f0f0ec] sm:pr-5 xl:border-t-0 xl:border-l xl:px-5",
  "py-4 min-w-0 border-t border-[#f0f0ec] sm:border-l sm:pl-5 xl:border-t-0",
] as const

export function KpiStrip({
  kpis,
  daily,
  leadDailyBySource,
  period,
  funnel,
}: {
  kpis: MarketingPerfResponse["kpis"]
  /** Meta 일자 스냅샷 — 광고비 스파크라인 전용(리드 열은 리포트 축이라 쓰지 않는다). */
  daily: DailyPoint[]
  /** 우리 leads 테이블의 소스 그룹별 일자 유입 — 리드 스파크라인·소스 분해 원천. */
  leadDailyBySource: LeadDailyBySourcePoint[]
  period: PerfPeriod
  /** 기간 내 광고 리드·전환 수 — CPL 분모, 전환율 분자·분모를 글로 쓰기 위해. */
  funnel: MarketingPerfResponse["funnel"]
}) {
  // 광고비 — daily 는 0 채움을 하지 않는다(그래야 정직하다). Meta 스냅샷은 동기화 지연이 있어
  // 기간 끝까지 0 을 채우면 "아직 안 들어온 날"이 "0달러 집행한 날"로 둔갑한다.
  const spendSeries = useMemo(() => daily.map((point) => point.spend), [daily])

  // 리드 조회가 실패하면 KPI 가 null 로 무너진다 — 그때는 0 채움이 실측 0 이라는 근거가 없으므로
  // 시계열 자체를 만들지 않는다(실패를 "유입 0"으로 위장하지 않음).
  const leadsMeasured = kpis.leads.value != null
  const leadSeries = useMemo(
    () => (leadsMeasured ? foldLeadDaily(leadDailyBySource, period) : []),
    [leadsMeasured, leadDailyBySource, period]
  )

  // 델타 툴팁이 말할 비교 축 — 기간 계약(period.prevBasis)에서 그대로 파생한다(SSOT: perf.ts).
  const deltaBasis = prevBasisLabel(period)

  const perf = period.key
  const campaignsHref = campaignHubHref({ tab: "detail", section: "campaigns", perf })
  const adLeadsHref = campaignHubHref({ tab: "data", section: "ad-leads", perf })

  // 전환율 0% 경고 — "측정 안 됨"이 아니라 "광고 리드가 실제로 들어왔는데 아직 한 건도 전환되지
  // 않음"일 때만 danger(실측이 참일 때만 물들인다).
  const conversionStalled = kpis.leadConversionRate.value === 0 && funnel.adLeads > 0

  const tiles = [
    <StatTile
      key="leads"
      variant="plain"
      iconLayout="inline"
      valueSize="xl"
      icon={<Users className="h-3.5 w-3.5" />}
      label="리드 · 전 소스"
      value={
        kpis.leads.value != null ? (
          <span className="text-[#084734]">{COUNT.format(kpis.leads.value)}</span>
        ) : (
          "—"
        )
      }
      hint={
        <DeltaHint
          kpi={kpis.leads}
          valence="up-good"
          basis={deltaBasis}
          note={kpis.leads.previous != null ? `이전 ${COUNT.format(kpis.leads.previous)}건` : undefined}
        />
      }
      href={LEADS_BOARD_HREF}
      sparkline={
        hasShape(leadSeries) ? <Sparkline data={leadSeries} tone="brand" height={SPARK_HEIGHT} /> : undefined
      }
      footer={leadsMeasured ? <SourceSplit rows={leadDailyBySource} /> : undefined}
    />,
    <StatTile
      key="spend"
      variant="plain"
      iconLayout="inline"
      valueSize="xl"
      icon={<Wallet className="h-3.5 w-3.5" />}
      label="광고비 · Meta USD"
      value={kpis.spendUsd.value != null ? money(kpis.spendUsd.value, "USD") : "—"}
      hint={<DeltaHint kpi={kpis.spendUsd} valence="none" basis={deltaBasis} note="원화 환산 없음" />}
      href={campaignsHref}
      sparkline={
        hasShape(spendSeries) ? (
          // 광고비는 맥락일 뿐 강조 대상이 아니다 — 중립 톤으로 뒤에 둔다.
          <Sparkline data={spendSeries} tone="neutral" height={SPARK_HEIGHT} />
        ) : undefined
      }
      footer={<p className="text-[10.5px] text-[#A39E98]">일자 스냅샷 합 · 계정 통화 그대로</p>}
    />,
    <StatTile
      key="cpl"
      variant="plain"
      iconLayout="inline"
      valueSize="xl"
      icon={<Target className="h-3.5 w-3.5" />}
      label="CPL 실측 · USD"
      value={kpis.cplUsd.value != null ? money(kpis.cplUsd.value, "USD") : "—"}
      // 델타가 개선(감소)이면 힌트가 이미 그린이다. 타일 톤까지 물들이지는 않는다(과함).
      hint={
        <DeltaHint
          kpi={kpis.cplUsd}
          valence="down-good"
          basis={deltaBasis}
          note={kpis.cplUsd.previous != null ? `이전 ${money(kpis.cplUsd.previous, "USD")}` : undefined}
        />
      }
      href={campaignsHref}
      // 스파크라인 없음(파일 상단 정직 규칙) — 같은 높이에 분모를 글로 쓴다.
      sparkline={
        <p className="flex h-[28px] items-end text-[10.5px] tabular-nums leading-tight text-[#615D59]">
          광고비 ÷ 광고 리드 {COUNT.format(funnel.adLeads)}
        </p>
      }
      footer={<p className="text-[10.5px] text-[#A39E98]">일자 추이 없음 · 분모 정의 불일치</p>}
    />,
    <StatTile
      key="conversion"
      variant="plain"
      iconLayout="inline"
      valueSize="xl"
      icon={<TrendingUp className="h-3.5 w-3.5" />}
      label="리드 전환율"
      value={
        kpis.leadConversionRate.value != null ? (
          <>
            {PCT1.format(kpis.leadConversionRate.value)}
            <span className="ml-0.5 text-[18px] font-semibold tracking-[-0.01em] text-[#615D59]">%</span>
          </>
        ) : (
          "—"
        )
      }
      hint={<DeltaHint kpi={kpis.leadConversionRate} valence="up-good" basis={deltaBasis} note="광고 리드 기준" />}
      href={adLeadsHref}
      sparkline={
        <p
          className={`flex h-[28px] items-end text-[10.5px] tabular-nums leading-tight ${
            conversionStalled ? "font-semibold text-[#B85C33]" : "text-[#615D59]"
          }`}
        >
          {kpis.leadConversionRate.value != null
            ? `광고 리드 ${COUNT.format(funnel.adLeads)} 중 전환 ${COUNT.format(funnel.convertedLeads)}${
                conversionStalled ? " — 아직 없음" : ""
              }`
            : "광고 리드 미측정"}
        </p>
      }
      footer={<p className="text-[10.5px] text-[#A39E98]">누적 비율 · 일자 추이 없음</p>}
    />,
  ]

  return (
    <section aria-label="핵심 지표" className="rounded-2xl border border-[#e8e8e4] bg-white px-5 py-1 sm:px-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile, index) => (
          <div key={tile.key} className={CELL_CLASS[index]}>
            {tile}
          </div>
        ))}
      </div>
    </section>
  )
}
