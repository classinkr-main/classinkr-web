"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Gauge,
  Minus,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"
import { StatTile } from "@/components/admin/viz"
import { COUNT, PCT1, money } from "@/components/admin/campaigns/event-format"
import { SOURCE_GROUP_ORDER } from "@/lib/crm/lead-attribution"
import {
  prevBasisLabel,
  shiftDays,
  type DailyPoint,
  type LeadDailyBySourcePoint,
  type MarketingPerfResponse,
  type PerfKpi,
  type PerfPeriod,
} from "@/lib/marketing/perf"

// 퍼포먼스 대시보드 KPI 스트립 5칸 — perf 응답의 kpis 조각 + 타일별 맥락(스파크라인·상태 톤·드릴다운).
// 통화 분리 엄수: USD 지표(광고비·CPL)에 ₩ 금지, budgetExecutionPct 는 % 값(KRW "축"일 뿐 통화 기호 금지).
// 값/델타는 전부 null 가능 — null 은 "—" 로 정직 표기하고 0 으로 지어내지 않는다.
//
// 스파크라인 규칙(정직 축 일치): 타일 값과 "같은 모집단·같은 정의"의 시계열만 붙인다.
//  · 광고비 = Meta 일자 스냅샷 spend 합 → daily[].spend 그대로(분자 동일).
//  · 리드   = 우리 leads 테이블(전 소스, 테스트 제외) → leadDailyBySource 를 접어 쓴다.
//             daily[].leads 는 Meta 리포트 축이라 리드 KPI 와 모집단이 다르다 — 쓰지 않는다.
//  · CPL    = 시계열 없음. daily 로 만들 수 있는 일자별 CPL 은 분모가 Meta 리포트 리드라
//             KPI 의 CPL(분모 = 우리 leads 테이블의 광고 리드)과 정의가 다르다. 다른 정의의
//             선을 CPL 타일에 붙이면 타일 숫자와 선이 서로 다른 말을 하므로 넣지 않는다(델타 힌트로 대체).
//  · 전환율·예산 집행률 = 일자 시계열 자체가 없다(수기 누적·비율). 넣지 않는다.

// Sparkline 은 Recharts 의존이라 viz 배럴 밖에 있고, StatTile 은 "Recharts-free 유지" 계약이다 —
// 호출부가 next/dynamic(ssr:false)으로 감싼 노드를 sparkline 슬롯에 넘기는 것이 저장소 규약
// (app/admin/overview/page.tsx 와 동일 패턴).
const Sparkline = dynamic(
  () => import("@/components/admin/viz/Sparkline").then((m) => m.Sparkline),
  { ssr: false, loading: () => <div className="h-[28px]" /> }
)

const SPARK_HEIGHT = 28

/** 리드 보드 — app/admin/crm/customers/leads. 이 타일은 "전 소스 리드"라 광고 그룹 필터
 *  (보드의 ?group= 축)를 붙이지 않는다: 붙이면 타일 숫자와 착지 화면의 수가 어긋난다.
 *  뷰(?view=)도 지정하지 않는다 — 보드/콘솔 선택은 사용자 쪽 기본값에 맡긴다. */
const LEADS_BOARD_HREF = "/admin/crm/customers/leads"

// 지표 방향 — 델타 색이 "좋아짐/나빠짐"을 말한다. CPL 은 감소=좋음, 광고비는 방향 가치판단 없음(중립).
type DeltaValence = "up-good" | "down-good" | "none"

function DeltaHint({
  kpi,
  valence,
  basis,
}: {
  kpi: PerfKpi
  valence: DeltaValence
  /** 비교 축 문구 — 기간마다 다르다(롤링=직전 동일 길이, QTD=전분기 같은 일수). */
  basis: string
}) {
  // 화면 문구는 "이전 기간 대비"로 짧게 두되, 툴팁은 어느 창과 견줬는지를 정확히 말한다 —
  // quarter 는 직전 창이 아니라 전분기의 같은 일수와 비교한다(resolvePerfPeriod 참조).
  const title = `이전 기간(${basis}) 대비`
  if (kpi.deltaPct == null) {
    return (
      <span title={title} className="text-[#1a1a1a]/35">
        이전 기간 대비 —
      </span>
    )
  }
  const improved =
    valence === "none" ? null : valence === "up-good" ? kpi.deltaPct > 0 : kpi.deltaPct < 0
  const toneClass =
    kpi.deltaPct === 0 || improved == null
      ? "text-[#1a1a1a]/55"
      : improved
        ? "text-[#084734]"
        : "text-[#B85C33]"
  const Icon = kpi.deltaPct === 0 ? Minus : kpi.deltaPct > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span title={title} className="inline-flex items-center gap-1">
      <span className="text-[#1a1a1a]/40">이전 기간 대비</span>
      <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${toneClass}`}>
        <Icon className="h-3 w-3" />
        {kpi.deltaPct > 0 ? "+" : ""}
        {kpi.deltaPct}%
      </span>
    </span>
  )
}

/**
 * 리드 타일 스파크라인용 일자 시계열 — 소스 그룹별 일자 유입을 하루 한 숫자로 접는다.
 *
 * 응답 계약상 leadDailyBySource 는 "리드가 있는 날"만 담는다(0 채움 없음). 리드 소스 조회가
 * 성공한 경우에 한해 표시층에서 기간 전체 날짜로 0 을 채운다 — 성공했는데 행이 없는 날은
 * 실측 0건이므로 날조가 아니다(DailyTrendSection 의 소스 스택과 동일한 판단·동일한 guard).
 * 0 을 안 채우면 30일 중 8일만 유입된 기간이 8칸짜리 선으로 압축돼 "매일 들어온 것"처럼 보인다.
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

/**
 * 예산 집행률 미입력 타일 — 값이 null 이면 "—" 만 두지 않고 "채워야 할 자리"로 보이게 한다.
 * 점선 테두리 + 광고 탭(채널 예산·집행 표) 드릴다운 CTA. StatTile 은 점선 변형을 노출하지 않고
 * primitives 는 이번 작업 범위 밖이라, 이 한 곳에만 필요한 빈 상태를 여기서 지역 렌더한다
 * (시각은 StatTile compact 카드와 동일: rounded-2xl · p-4 · 라벨 10px · 값 34px).
 */
function BudgetEmptyTile({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-dashed border-[#d8d6cf] bg-white p-4 transition-colors hover:border-[#A39E98] hover:bg-[#fafaf8]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="inline-flex rounded-xl bg-[#f0f0ec] p-2 text-[#1a1a1a]/55">
          <Gauge className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">
        예산 집행률 · KRW 축
      </p>
      <p className="text-[34px] font-bold leading-none tracking-[-0.03em] text-[#A39E98]">—</p>
      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#084734]">
        예산 채우기
        <ArrowRight className="h-3 w-3" />
      </p>
    </Link>
  )
}

export function KpiStrip({
  kpis,
  daily,
  leadDailyBySource,
  period,
  adLeads,
}: {
  kpis: MarketingPerfResponse["kpis"]
  /** Meta 일자 스냅샷 — 광고비 스파크라인 전용(리드 열은 리포트 축이라 쓰지 않는다). */
  daily: DailyPoint[]
  /** 우리 leads 테이블의 소스 그룹별 일자 유입 — 리드 스파크라인 원천. */
  leadDailyBySource: LeadDailyBySourcePoint[]
  period: PerfPeriod
  /** 기간 내 광고 리드 수(funnel.adLeads) — 전환율 0% 를 경고로 볼지 가르는 모집단. */
  adLeads: number
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

  // 광고 탭(?tab=meta) — 탭 축은 app/admin/campaigns/page.tsx 의 useUrlState("tab","meta").
  // 요약 기간(?perf=)은 탭과 직교하는 별개 축이라 같이 실어 보낸다: Link 는 쿼리를 통째로
  // 갈아끼우므로 안 실으면 탭 이동만으로 사용자의 기간 선택이 기본값(30d)으로 리셋된다.
  // 채널 예산표에는 스크롤 앵커가 없어(광고 탭의 앵커는 성과 입력용 #event-metrics-input 뿐)
  // 탭 이동까지만 한다 — 앵커를 새로 만들지 않는다.
  const metaTabHref =
    period.key === "30d"
      ? "/admin/campaigns?tab=meta"
      : `/admin/campaigns?tab=meta&perf=${period.key}`

  // 전환율 0% 경고 — "측정 안 됨"이 아니라 "광고 리드가 실제로 들어왔는데 아직 한 건도 전환되지
  // 않음"일 때만 danger(실측이 참일 때만 물들인다). funnel.adLeads 는 소스 실패 시 0 으로
  // 강등되는 계약 필드지만, 그때는 전환율이 0 이 아니라 null 이라 이 조건이 먼저 걸러진다.
  const conversionStalled = kpis.leadConversionRate.value === 0 && adLeads > 0

  // 델타 툴팁이 말할 비교 축 — 기간 계약(period.prevBasis)에서 그대로 파생한다(SSOT: perf.ts).
  const deltaBasis = prevBasisLabel(period)

  // 콕핏 레이아웃(2026-08)에서 xl 이상은 우측 384px 레일과 폭을 나눠 쓴다 — 5칸이 그 좁아진
  // 폭에서 부러지지 않도록 5열 전환을 2xl(레일 뺀 폭도 충분히 넓어지는 지점)로 늦췄다.
  //
  // 정렬(2026-08-26): 5는 1·5 외의 어떤 열 수로도 나눠떨어지지 않는다. 3열에 두면 2행에 빈 칸이
  // 남고 행 높이까지 갈렸다(실측 176px vs 141px). 6열 그리드에 span 을 줘 두 행을 각각 꽉 채운다 —
  // 위 3칸 = 핵심 성과(광고비·리드·CPL), 아래 2칸 = 보조(전환율·예산). 2xl 부터는 한 줄 5칸.
  // 타일은 span 래퍼 안에서 [&>*]:h-full 로 행 높이를 채운다 — StatTile 은 className 을 받지
  // 않는다(공용 프리미티브의 시각 규율을 깨지 않으려고 래퍼로 처리).
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 2xl:grid-cols-5">
      {/* href 를 주면 StatTile 이 카드 전체를 Link 로 감싸며 hover-lift 시각을 자동 적용한다
          (lift prop 은 href 가 있을 때 중복이라 넘기지 않는다). */}
      <div className="sm:col-span-2 2xl:col-span-1 [&>*]:h-full">
        <StatTile
          compact
          valueSize="lg"
          icon={<Wallet className="h-3.5 w-3.5" />}
          label="광고비 · Meta USD"
          value={kpis.spendUsd.value != null ? money(kpis.spendUsd.value, "USD") : "—"}
          hint={<DeltaHint kpi={kpis.spendUsd} valence="none" basis={deltaBasis} />}
          href={metaTabHref}
          sparkline={
            hasShape(spendSeries) ? (
              // 광고비는 맥락일 뿐 강조 대상이 아니다 — 중립 톤으로 뒤에 둔다.
              <Sparkline data={spendSeries} tone="neutral" height={SPARK_HEIGHT} />
            ) : undefined
          }
        />
      </div>

      <div className="sm:col-span-2 2xl:col-span-1 [&>*]:h-full">
        <StatTile
          compact
          valueSize="lg"
          icon={<Users className="h-3.5 w-3.5" />}
          label="리드"
          value={kpis.leads.value != null ? COUNT.format(kpis.leads.value) : "—"}
          hint={<DeltaHint kpi={kpis.leads} valence="up-good" basis={deltaBasis} />}
          tone="brand"
          href={LEADS_BOARD_HREF}
          sparkline={
            hasShape(leadSeries) ? (
              <Sparkline data={leadSeries} tone="brand" height={SPARK_HEIGHT} />
            ) : undefined
          }
        />
      </div>

      {/* 3번째 칸만 base(2열)에서 col-span-2 다 — 1·2번이 첫 줄을 채우고 나면 혼자 남아
          모바일에서 구멍이 생긴다. 전폭으로 눕혀 어느 폭에서도 빈 칸이 없게 한다. */}
      <div className="col-span-2 2xl:col-span-1 [&>*]:h-full">
        <StatTile
          compact
          valueSize="lg"
          icon={<Target className="h-3.5 w-3.5" />}
          label="CPL 실측 · USD"
          value={kpis.cplUsd.value != null ? money(kpis.cplUsd.value, "USD") : "—"}
          // 스파크라인 없음(파일 상단 정직 규칙) — 개선/악화는 델타 힌트가 말한다.
          // 델타가 개선(감소)이면 힌트가 이미 그린이다. 타일 톤까지 물들이지는 않는다(과함).
          hint={<DeltaHint kpi={kpis.cplUsd} valence="down-good" basis={deltaBasis} />}
          // 슬롯을 비우면 스파크라인 있는 옆 타일과 높이가 갈려 35px 죽은 공간이 남았다.
          // 채우되 없는 선을 지어내지 않는다 — 같은 자리에 "왜 없는지"를 둔다(상단 정직 규칙).
          sparkline={
            <p className="flex h-[28px] items-end text-[10px] leading-tight text-[#1a1a1a]/30">
              일자별 추이 없음 · 분모 정의 불일치
            </p>
          }
        />
      </div>

      <div className="col-span-2 sm:col-span-3 2xl:col-span-1 [&>*]:h-full">
        <StatTile
          compact
          valueSize="lg"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="리드 전환율"
          value={
            kpis.leadConversionRate.value != null
              ? `${PCT1.format(kpis.leadConversionRate.value)}%`
              : "—"
          }
          tone={conversionStalled ? "danger" : undefined}
          hint={
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              <DeltaHint kpi={kpis.leadConversionRate} valence="up-good" basis={deltaBasis} />
              <span className="text-[#1a1a1a]/35">광고 리드 기준</span>
            </span>
          }
        />
      </div>

      <div className="col-span-2 sm:col-span-3 2xl:col-span-1 [&>*]:h-full">
        {kpis.budgetExecutionPct.value != null ? (
          <StatTile
            compact
            valueSize="lg"
            icon={<Gauge className="h-3.5 w-3.5" />}
            label="예산 집행률 · KRW 축"
            value={`${PCT1.format(kpis.budgetExecutionPct.value)}%`}
            // 배정·집행이 기간 개념 없는 수기 누적값이라 delta 는 계약상 항상 null — 비교를 시도하지 않는다.
            hint="KRW 배정 대비 수기 집행 · 기간 비교 없음"
          />
        ) : (
          <BudgetEmptyTile href={metaTabHref} />
        )}
      </div>

    </div>
  )
}
