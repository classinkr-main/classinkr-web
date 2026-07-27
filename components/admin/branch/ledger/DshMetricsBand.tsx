"use client"

// 장부 DSH 렌즈 상단 지표 밴드(2026-07-27 DSH 디벨롭 B) — 수치 그리드(DshNumericGrid) 위에
// 배치하는 조밀한 타일 8개(연간/현재 분기/현재 월/SW/HW/New/Renew/남은 목표·필요 페이스) +
// 실적 구성비 라인. 전부 summary의 dsh_breakdown에서 클라이언트 파생한다(신규 fetch 없음) —
// 파생 규칙은 ledger/dsh-derive.ts(최대-annual 채택, 3중 계상 방지) 단일 소스를 쓴다.
// 차트가 아니라 숫자 타일이다 — 이 렌즈의 정체성(숫자가 정본인 검수용 원장)을 따른다.

import { useMemo } from "react"
import type { ReactNode } from "react"
import type { BranchDataSourceInfo, BranchDshBreakdownRow } from "../types"
import { cnyExact } from "@/lib/branch/money-format"
import { formatMoney } from "@/lib/branch/ledger-format"
import {
  deriveDshMetricsBand,
  dshExactTitle,
  dshFiscalYearLabel,
  dshMonthLabel,
  dshRateTitle,
  dshRateToneClass,
  formatDshRate,
  type DshCompositionSegment,
  type DshMetricTriple,
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
}

export function DshMetricsBand({ breakdown, loading = false, dataSource = null }: DshMetricsBandProps) {
  // "오늘" 기준점 — ssr:false 지연 로드 전용 컴포넌트라 클라이언트에서 1회 고정하면 된다.
  // UTC 해석은 dsh-derive 규약(fiscal.ts·summary 라우트와 동일) 참조.
  const now = useMemo(() => new Date(), [])
  const band = useMemo(() => deriveDshMetricsBand(breakdown, now), [breakdown, now])

  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
        <p className="text-[13px] font-bold text-[#111110]">
          DSH 핵심 지표 <span className="font-semibold text-[#615D59]">(금액 ¥ 만 단위 축약 · 달성률 %)</span>
        </p>
        <p className="mt-0.5 text-[11px] text-[#615D59]">
          시트 &lsquo;1. DSH&rsquo; 미러 · Team KR 전사 — 팀 필터와 무관 · 숫자가 정본
          {band && (
            <>
              {" "}· 오늘 기준 {dshFiscalYearLabel(band.fiscalYear)} Q{band.currentQuarter}
              {band.currentMonthKey ? ` · ${dshMonthLabel(band.currentMonthKey)}` : " · 회계연도 범위 밖"}
            </>
          )}
          {dataSource && <> · 원천 {dshSourceLabel(dataSource)}</>}
        </p>
      </div>

      {loading && breakdown.length === 0 ? (
        <div className="p-4">
          <LoadingPanel label="DSH 지표를 계산하는 중" />
        </div>
      ) : !band ? (
        <p className="px-4 py-10 text-center text-[12px] text-[#615D59]">
          DSH 지표를 계산할 데이터가 없습니다 — 시트 &lsquo;1. DSH&rsquo; 동기화 후 다시 확인하세요.
        </p>
      ) : (
        <>
          {/* gap-px + 배경 헤어라인 — 타일 사이를 1px 라인으로만 구획하는 에디토리얼 그리드
              (파스텔 면 채움 없음). 모바일 2열 → md 4열. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden bg-[rgba(0,0,0,0.08)] md:grid-cols-4">
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
            {/* ⑧ 남은 목표·필요 페이스 — 산식은 title에 명시(연간 목표−실적을 당월 포함 잔여
                회계월 수로 나눈 월평균 필요액). */}
            <div
              className="bg-white px-3.5 py-3"
              title={`산식: (연간 목표 − 연간 실적) ÷ 잔여 회계월 수(당월 포함 ${band.remaining.monthsLeft}개월) = 월평균 필요액`}
            >
              <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#615D59]">남은 목표 · 필요 페이스</p>
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
          </div>

          <div className="space-y-1.5 border-t border-[rgba(0,0,0,0.08)] px-4 py-3">
            <p className="text-[10.5px] font-bold text-[#615D59]">실적 구성비 — Status 연간 기준</p>
            <CompositionRow title="SW : HW" segments={band.composition.swHw} />
            <CompositionRow title="New : Renew" segments={band.composition.newRenew} />
            <CompositionRow title="Direct : Channel" segments={band.composition.channel} />
          </div>
        </>
      )}
    </section>
  )
}
