"use client"

// 장부 DSH 렌즈 상단 지표 밴드(2026-07-27 DSH 디벨롭 B) — 수치 그리드(DshNumericGrid) 위에
// 배치하는 조밀한 타일 8개 + 실적 구성비 라인. 파생 규칙은 ledger/dsh-derive.ts(최대-annual
// 채택, 3중 계상 방지) 단일 소스를 쓴다. 차트가 아니라 숫자 타일이다 — 이 렌즈의 정체성
// (숫자가 정본인 검수용 원장)을 따른다.
//
// 기간 토글(2026-07-27 후속): 주/월/분기/연도.
// - 연도(기본)·분기·월: summary dsh_breakdown에서 클라이언트 파생(전사 고정, 오늘 기준).
// - 주: DSH 시트에 주 단위 목표/실적이 없다 — summary deal_mix의 week_actual(REV 딜
//   first_payment 기준, 월요일 시작 캘린더 주)로 "실적만" 보여준다. 주 목표·달성률은
//   존재하지 않으므로 합성하지 않고, 팀 필터를 따른다는 것도 캡션에 명시한다.

import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { BranchDataSourceInfo, BranchDealMix, BranchDshBreakdownRow, Team } from "../types"
import { cnyExact } from "@/lib/branch/money-format"
import { formatMoney } from "@/lib/branch/ledger-format"
import {
  deriveDshMetricsBand,
  deriveDshScopedMetrics,
  deriveDshWeeklyFromDealMix,
  dshExactTitle,
  dshFiscalYearLabel,
  dshMonthLabel,
  dshRateTitle,
  dshRateToneClass,
  formatDshRate,
  type DshBandScope,
  type DshCompositionSegment,
  type DshMetricTriple,
  type DshWeeklyDimension,
} from "./dsh-derive"
import { dshSourceLabel } from "./DshNumericGrid"
import { formatSignedMoney, LoadingPanel } from "./shared"

// 구성비 세그먼트 색 — 첫 항목만 그린 액센트, 나머지는 뉴트럴 단계(그린 넓은 면 금지,
// 파스텔 채움 지양 — 얇은 바에 솔리드 잉크 톤만 쓴다). 항목 순서 기준 고정 매핑이라
// 값이 0이어도 색이 밀리지 않는다(SW=그린, HW=회색 항상 유지).
// 순서는 인접 대비 우선(2026-07-27 피드백 "게이지 색 차이 뚜렷하게"): 다크 그린 →
// 라이트 그레이 → 다크 그레이. #615D59를 2번째에 두면 다크 그린과 명도가 비슷해
// 얇은 바에서 경계가 사라진다 — 밝기 교차 배치가 핵심이다.
const SEGMENT_COLORS = ["#084734", "#C9C5BF", "#615D59"] as const

const SCOPE_OPTIONS: Array<{ id: DshBandScope; label: string }> = [
  { id: "W", label: "주" },
  { id: "M", label: "월" },
  { id: "Q", label: "분기" },
  { id: "Y", label: "연도" },
]

function formatSharePct(value: number, total: number): string {
  return `${((value / total) * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
}

// 목표·실적·달성률 3숫자 타일 — 달성률을 시각 앵커(큰 숫자·판정 색)로 두고,
// 목표/실적은 ¥·만 축약(formatMoney — 워크벤치 상단 타일과 동일 규약) + 원값 title
// 병기로 아래에 깐다. 단위 천 표기는 아래 원장 표들의 규약 — 요약 타일은 통화 기호가
// 있는 축약이 읽기 빠르다(2026-07-27 피드백 "단위·기호 넣기").
function MetricStatTile({
  label,
  triple,
  extraLine,
}: {
  label: string
  triple: DshMetricTriple
  extraLine?: ReactNode
}) {
  return (
    <div className="bg-white px-3.5 py-3">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#615D59]">{label}</p>
      <p
        className={`mt-1.5 text-[20px] font-bold leading-none tabular-nums ${dshRateToneClass(triple.pct)}`}
        title={dshRateTitle(triple.status, triple.goal)}
      >
        {formatDshRate(triple.pct)}
      </p>
      <p className="mt-1.5 text-[11px] tabular-nums text-[#615D59]">
        목표{" "}
        <span className="cursor-help font-semibold text-[#111110]" title={dshExactTitle(triple.goal)}>
          {formatMoney(triple.goal)}
        </span>
        {" · "}실적{" "}
        <span className="cursor-help font-semibold text-[#111110]" title={dshExactTitle(triple.status)}>
          {formatMoney(triple.status)}
        </span>
      </p>
      {extraLine}
    </div>
  )
}

// 주간 차원 타일 — 주 목표가 없어 달성률 대신 실적 금액을 앵커로, 주간 합계 대비 구성비를
// 보조로 둔다(합성 달성률 금지).
function WeekMoneyTile({ label, dim }: { label: string; dim: DshWeeklyDimension }) {
  return (
    <div className="bg-white px-3.5 py-3">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#615D59]">{label}</p>
      <p className="mt-1.5 text-[20px] font-bold leading-none tabular-nums text-[#111110]" title={dshExactTitle(dim.actual)}>
        {formatMoney(dim.actual)}
      </p>
      <p className="mt-1.5 text-[11px] tabular-nums text-[#615D59]">
        주간 구성{" "}
        <span className="font-semibold text-[#111110]">
          {dim.share == null ? "–" : `${dim.share.toLocaleString("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`}
        </span>
      </p>
    </div>
  )
}

// 실적 구성비 한 줄 — 얇은 아웃라인 세그먼트 바 + 텍스트 비율. 값 0 세그먼트는 바·텍스트
// 모두 생략한다(빈 세그먼트로 폭만 차지하지 않게). title에 원값(¥)을 병기한다.
function CompositionRow({ title, segments }: { title: string; segments: DshCompositionSegment[] }) {
  const colored = segments.map((segment, index) => ({
    ...segment,
    color: SEGMENT_COLORS[index] ?? SEGMENT_COLORS[SEGMENT_COLORS.length - 1],
  }))
  const visible = colored.filter((segment) => segment.value > 0)
  const total = visible.reduce((sum, segment) => sum + segment.value, 0)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 md:flex-nowrap">
      <span className="w-[92px] shrink-0 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#615D59]">
        {title}
      </span>
      {total <= 0 ? (
        <span className="text-[10.5px] text-[#C9C5BF]">실적 없음</span>
      ) : (
        <>
          {/* 세그먼트 사이 2px 흰 간격 — 명도가 가까운 이웃(라이트/다크 그레이)도 경계가
              끊겨 보이게 한다. 높이도 8→10px로 키워 색 판독을 돕는다. */}
          <div className="flex h-[10px] min-w-[120px] flex-1 gap-[2px] overflow-hidden rounded-sm border border-[rgba(0,0,0,0.08)] bg-white p-[1px]">
            {visible.map((segment) => (
              <div
                key={segment.label}
                className="rounded-[1px]"
                style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
                title={`${segment.label} ¥${cnyExact(segment.value)} · ${formatSharePct(segment.value, total)}`}
              />
            ))}
          </div>
          <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-[#615D59]">
            {visible.map((segment, index) => (
              <span key={segment.label}>
                {index > 0 && <span className="text-[#C9C5BF]"> : </span>}
                <span
                  className="mr-0.5 inline-block h-[7px] w-[7px] rounded-[2px] align-baseline"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden
                />
                {segment.label} {formatSharePct(segment.value, total)}{" "}
                <span className="cursor-help font-normal text-[#A39E98]" title={`¥${cnyExact(segment.value)} · 시트 원값`}>
                  {formatMoney(segment.value)}
                </span>
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  )
}

interface DshMetricsBandProps {
  breakdown: BranchDshBreakdownRow[]
  loading?: boolean
  dataSource?: BranchDataSourceInfo | null
  // 주간 뷰 원천 — summary deal_mix(week_actual). 없으면 주 토글이 빈 상태 문구를 보인다.
  dealMix?: BranchDealMix | null
  // 주간 캡션용 — deal_mix는 summary 요청의 팀 필터를 따른다(전사 고정인 M/Q/Y와 다른 점).
  team?: Team
}

export function DshMetricsBand({ breakdown, loading = false, dataSource = null, dealMix = null, team = "ALL" }: DshMetricsBandProps) {
  // "오늘" 기준점 — ssr:false 지연 로드 전용 컴포넌트라 클라이언트에서 1회 고정하면 된다.
  // UTC 해석은 dsh-derive 규약(fiscal.ts·summary 라우트와 동일) 참조.
  const now = useMemo(() => new Date(), [])
  const band = useMemo(() => deriveDshMetricsBand(breakdown, now), [breakdown, now])
  const [scope, setScope] = useState<DshBandScope>("Y")
  const scoped = useMemo(
    () => (scope === "M" || scope === "Q" ? deriveDshScopedMetrics(breakdown, now, scope) : null),
    [breakdown, now, scope],
  )
  const weekly = useMemo(() => (scope === "W" ? deriveDshWeeklyFromDealMix(dealMix) : null), [dealMix, scope])

  // 남은 목표·필요 페이스 타일 — 연간 개념이라 어느 스코프에서도 동일하게 둔다(주/월/분기
  // 뷰에서는 라벨에 "연간"을 병기해 스코프 혼동을 막는다).
  const remainingTile = band && (
    <div
      className="bg-white px-3.5 py-3"
      title={`산식: (연간 목표 − 연간 실적) ÷ 잔여 회계월 수(당월 포함 ${band.remaining.monthsLeft}개월) = 월평균 필요액`}
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#615D59]">
        남은 목표 · 필요 페이스{scope !== "Y" && " (연간)"}
      </p>
      <p
        className={`mt-1.5 text-[20px] font-bold leading-none tabular-nums ${
          band.remaining.amount <= 0 ? "text-[#084734]" : "text-[#111110]"
        }`}
        {...(band.remaining.amount > 0 ? { title: dshExactTitle(band.remaining.amount) } : {})}
      >
        {band.remaining.amount <= 0 ? "달성 완료" : formatMoney(band.remaining.amount)}
      </p>
      <p className="mt-1.5 text-[11px] tabular-nums text-[#615D59]">
        {band.remaining.amount <= 0 ? (
          "연간 목표 이미 달성 — 추가 필요액 없음"
        ) : band.remaining.monthlyNeeded == null ? (
          "잔여 회계월 없음 — 페이스 산정 불가(회계연도 종료)"
        ) : (
          <>
            잔여 {band.remaining.monthsLeft}개월 · 월평균{" "}
            <span className="cursor-help font-semibold text-[#111110]" title={dshExactTitle(band.remaining.monthlyNeeded)}>
              {formatMoney(band.remaining.monthlyNeeded)}
            </span>{" "}
            필요
          </>
        )}
      </p>
    </div>
  )

  const weekDelta = weekly ? weekly.total.actual - weekly.total.prevActual : 0
  const composition =
    scope === "Y" ? band?.composition : scope === "W" ? weekly?.composition : scoped?.composition
  const compositionCaption =
    scope === "Y"
      ? "실적 구성비 — Status 연간 기준"
      : scope === "W"
        ? "확정 구성비 — 이번 주 기준 · 채널 미매핑 딜 제외"
        : `실적 구성비 — Status ${scoped?.scopeLabel ?? ""} 기준`

  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
        <div>
          <p className="text-[13px] font-bold text-[#111110]">
            DSH 핵심 지표 <span className="font-semibold text-[#615D59]">(금액 ¥ 만 단위 축약 · 달성률 %)</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[#615D59]">
            {scope === "W" ? (
              <>
                REV 딜 첫결제일 기준 확정 금액 · 월요일 시작 캘린더 주 · 팀 필터({team === "ALL" ? "KR 전체" : team}) 적용 —{" "}
                시트에 주 단위 목표가 없어 달성률은 없습니다
              </>
            ) : (
              <>
                시트 &lsquo;1. DSH&rsquo; 미러 · Team KR 전사 — 팀 필터와 무관 · 숫자가 정본
                {band && (
                  <>
                    {" "}· 오늘 기준 {dshFiscalYearLabel(band.fiscalYear)} Q{band.currentQuarter}
                    {band.currentMonthKey ? ` · ${dshMonthLabel(band.currentMonthKey)}` : " · 회계연도 범위 밖"}
                  </>
                )}
                {dataSource && <> · 원천 {dshSourceLabel(dataSource)}</>}
              </>
            )}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="지표 기간 전환">
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={scope === option.id}
              onClick={() => setScope(option.id)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition ${
                scope === option.id
                  ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-[#615D59] hover:text-[#111110]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading && breakdown.length === 0 ? (
        <div className="p-4">
          <LoadingPanel label="DSH 지표를 계산하는 중" />
        </div>
      ) : !band ? (
        <p className="px-4 py-10 text-center text-[12px] text-[#615D59]">
          DSH 지표를 계산할 데이터가 없습니다 — 시트 &lsquo;1. DSH&rsquo; 동기화 후 다시 확인하세요.
        </p>
      ) : scope === "W" && !weekly ? (
        <p className="px-4 py-10 text-center text-[12px] text-[#615D59]">
          이번 주·전주에 첫결제로 잡힌 확정 딜이 없거나 주간 집계를 사용할 수 없습니다 — 월/분기/연도 보기를 이용하세요.
        </p>
      ) : (
        <>
          {/* gap-px + 배경 헤어라인 — 타일 사이를 1px 라인으로만 구획하는 에디토리얼 그리드
              (파스텔 면 채움 없음). 모바일 2열 → md 4열. 어느 스코프든 8타일을 유지해
              헤어라인 그리드가 빈 칸 없이 닫히게 한다. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden bg-[rgba(0,0,0,0.08)] md:grid-cols-4">
            {scope === "Y" && (
              <>
                <MetricStatTile
                  label="연간 종합"
                  triple={band.annual}
                  extraLine={
                    <p className="mt-0.5 text-[11px] tabular-nums text-[#615D59]">
                      Gap{" "}
                      <span
                        className={`cursor-help font-semibold ${band.annual.gap < 0 ? "text-[#B43E3E]" : "text-[#084734]"}`}
                        title={dshExactTitle(band.annual.gap)}
                      >
                        {formatSignedMoney(band.annual.gap)}
                      </span>
                    </p>
                  }
                />
                <MetricStatTile label={`현재 분기 (Q${band.currentQuarter})`} triple={band.quarter} />
                <MetricStatTile
                  label={band.currentMonthKey ? `현재 월 (${dshMonthLabel(band.currentMonthKey)})` : "현재 월 (범위 밖)"}
                  triple={band.month}
                />
                <MetricStatTile label="Software 연간" triple={band.software} />
                <MetricStatTile label="Hardware 연간" triple={band.hardware} />
                <MetricStatTile label="New 연간" triple={band.newBiz} />
                <MetricStatTile label="Renew 연간" triple={band.renew} />
                {remainingTile}
              </>
            )}

            {(scope === "M" || scope === "Q") && scoped && (
              <>
                <MetricStatTile
                  label={`종합 (${scoped.scopeLabel})`}
                  triple={scoped.total}
                  extraLine={
                    <p className="mt-0.5 text-[11px] tabular-nums text-[#615D59]">
                      Gap{" "}
                      <span
                        className={`cursor-help font-semibold ${scoped.total.gap < 0 ? "text-[#B43E3E]" : "text-[#084734]"}`}
                        title={dshExactTitle(scoped.total.gap)}
                      >
                        {formatSignedMoney(scoped.total.gap)}
                      </span>
                    </p>
                  }
                />
                <MetricStatTile label="Software" triple={scoped.software} />
                <MetricStatTile label="Hardware" triple={scoped.hardware} />
                <MetricStatTile label="New" triple={scoped.newBiz} />
                <MetricStatTile label="Renew" triple={scoped.renew} />
                <MetricStatTile label="Direct" triple={scoped.direct} />
                <MetricStatTile label="Channel" triple={scoped.channel} />
                {remainingTile}
              </>
            )}

            {scope === "W" && weekly && (
              <>
                <div className="bg-white px-3.5 py-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#615D59]">이번 주 확정</p>
                  <p className="mt-1.5 text-[20px] font-bold leading-none tabular-nums text-[#111110]" title={dshExactTitle(weekly.total.actual)}>
                    {formatMoney(weekly.total.actual)}
                  </p>
                  <p className="mt-1.5 text-[11px] tabular-nums text-[#615D59]">
                    전주{" "}
                    <span className="cursor-help font-semibold text-[#111110]" title={dshExactTitle(weekly.total.prevActual)}>
                      {formatMoney(weekly.total.prevActual)}
                    </span>
                    {" · "}
                    <span
                      className={`cursor-help font-semibold ${weekDelta < 0 ? "text-[#B43E3E]" : "text-[#084734]"}`}
                      title={dshExactTitle(weekDelta)}
                    >
                      {formatSignedMoney(weekDelta)}
                    </span>
                  </p>
                </div>
                <WeekMoneyTile label="Software" dim={weekly.software} />
                <WeekMoneyTile label="Hardware" dim={weekly.hardware} />
                <WeekMoneyTile label="New" dim={weekly.newBiz} />
                <WeekMoneyTile label="Renew" dim={weekly.renew} />
                <WeekMoneyTile label="Direct" dim={weekly.direct} />
                <WeekMoneyTile label="Channel" dim={weekly.channel} />
                {remainingTile}
              </>
            )}
          </div>

          {composition && (
            <div className="space-y-1.5 border-t border-[rgba(0,0,0,0.08)] px-4 py-3">
              <p className="text-[10.5px] font-bold text-[#615D59]">{compositionCaption}</p>
              <CompositionRow title="SW : HW" segments={composition.swHw} />
              <CompositionRow title="New : Renew" segments={composition.newRenew} />
              <CompositionRow title="Direct : Channel" segments={composition.channel} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
