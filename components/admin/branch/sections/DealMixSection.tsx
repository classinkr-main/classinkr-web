"use client"
import type { BranchDealMixMeta, BranchDealMixSlice, BranchSummaryResponse } from "../types"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import MoneyValue from "../MoneyValue"

const LABELS: Record<string, string> = {
  Software: "SW",
  Hardware: "HW",
  New: "New",
  Renew: "Renew",
  Direct: "Direct",
  Channel: "Channel",
  KA: "KA",
  SME: "SME",
}

// 팀 아이덴티티 올리브(#7B8B36, lib/branch/team-colors.ts SSOT)는 여기 쓰지 않는다 —
// 이 카드들의 A/B는 팀이 아니라 제품/신규갱신/채널/규모 "카테고리" 비교라 팀 색과
// 무관해야 한다. 대신 이미 있는 캐논 그린/Warning앰버/뉴트럴 3색을 재조합해 쓴다.
const COLORS = {
  green: "#084734",
  amber: "#A8741A",
  // KA/SME는 확도 신호가 아닌 순수 카테고리 구분이라 확도 전용 예외 파랑(#1E5DA8)을
  // 쓰지 않는다(DESIGN.md §확도 신호 토큰 오용 금지 규칙) — 웜 뉴트럴로 대체.
  neutral: "#615D59",
}

function pickPair(rows: BranchDealMixSlice[], aKey: string, bKey: string): { a: BranchDealMixSlice; b: BranchDealMixSlice } | null {
  const a = rows.find((r) => r.name === aKey)
  const b = rows.find((r) => r.name === bKey)
  if (!a || !b) return null
  return { a, b }
}

// 전기 대비 증감률 — prev_actual이 null/undefined(전기 데이터 미가용)이거나 0(분모
// 0 나눗셈 방지)이면 계산하지 않고 렌더 생략을 신호하는 null을 반환한다.
function prevDeltaPct(actual: number, prevActual: number | null | undefined): number | null {
  if (prevActual == null || prevActual === 0) return null
  return ((actual - prevActual) / prevActual) * 100
}

function CompareCard({ title, desc, a, b, aTone, bTone, prevMeta }: {
  title: string; desc: string; a: BranchDealMixSlice; b: BranchDealMixSlice; aTone: string; bTone: string
  prevMeta?: BranchDealMixMeta
}) {
  const sum = a.actual + b.actual
  // 품질 웨이브 4 — 항목 6. 두 슬라이스 모두 실적 0이면 aPct/bPct는 "0%/100%"라는
  // 거짓 신호가 된다(A가 0이 아니라 "데이터가 없다"는 뜻인데 B가 100% 우위처럼 보임).
  // hasData=false일 땐 % 계산 자체를 렌더에 쓰지 않고 "데이터 없음" 상태로 명시한다.
  const hasData = sum > 0
  const aPct = hasData ? (a.actual / sum) * 100 : 0
  const bPct = hasData ? 100 - aPct : 0

  // Goal mix marker — where A's share would be if both sides hit goal exactly
  const goalSum = a.goal + b.goal
  const aGoalPct = goalSum ? (a.goal / goalSum) * 100 : 0
  const mixShift = aPct - aGoalPct // %p vs goal mix

  // 전기 대비 칩 — 서버가 prev_period_available=false(예: 연간 스코프는 전년 데이터
  // 미로딩)를 보내거나 두 슬라이스 중 하나라도 prev_actual이 없으면 렌더 자체를
  // 생략한다(초기 상태에서 "0%"로 오표시하지 않기 위한 가드).
  const prevAvailable = prevMeta?.prev_period_available === true && a.prev_actual != null && b.prev_actual != null
  const prevDelta = prevAvailable ? prevDeltaPct(a.actual + b.actual, (a.prev_actual ?? 0) + (b.prev_actual ?? 0)) : null

  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[14px]">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="text-[12.5px] font-bold tracking-[-0.005em] text-[#111110]">{title}</p>
          <p className="mt-0.5 text-[10.5px] text-[#615D59]">{desc}</p>
        </div>
        <div className="text-right">
          {hasData ? (
            <p className="whitespace-nowrap text-[10px] font-bold tracking-[0.04em] text-[#615D59]">
              믹스 {mixShift >= 0 ? "+" : ""}{mixShift.toFixed(1)}%p
            </p>
          ) : (
            <p className="whitespace-nowrap text-[10px] font-bold tracking-[0.04em] text-[#9B9690]">데이터 없음</p>
          )}
          {hasData && prevDelta != null && (
            <p className="mt-0.5 whitespace-nowrap text-[10px] font-bold tracking-[0.04em] text-[#615D59]">
              {prevMeta?.prev_period_label} 대비 {prevDelta >= 0 ? "+" : ""}{prevDelta.toFixed(0)}%
            </p>
          )}
        </div>
      </div>

      {/* Stacked compare bar with goal-mix marker — 데이터 없을 땐 0%/100% 막대 대신
          중립 placeholder만 보여준다. */}
      {hasData ? (
        <div className="relative mb-1.5 flex h-[22px] overflow-hidden rounded-md bg-[rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-end pr-1.5 text-[10px] font-bold text-white transition-[width] duration-700"
            style={{ width: `${aPct}%`, background: aTone }}>
            {aPct >= 18 && `${aPct.toFixed(0)}%`}
          </div>
          <div className="flex items-center justify-start pl-1.5 text-[10px] font-bold text-white transition-[width] duration-700"
            style={{ width: `${bPct}%`, background: bTone }}>
            {bPct >= 18 && `${bPct.toFixed(0)}%`}
          </div>
          {/* Goal mix marker — dashed vertical line at goal split */}
          <div title={`목표 믹스 ${aGoalPct.toFixed(0)}% / ${(100 - aGoalPct).toFixed(0)}%`}
            className="pointer-events-none absolute -top-1 -bottom-1 w-px"
            style={{
              left: `${aGoalPct}%`,
              backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.5) 50%, transparent 50%)",
              backgroundSize: "1px 3px",
              backgroundRepeat: "repeat-y",
            }} />
        </div>
      ) : (
        <div className="mb-1.5 flex h-[22px] items-center justify-center rounded-md bg-[rgba(0,0,0,0.04)] text-[10px] font-semibold text-[#9B9690]">
          데이터 없음
        </div>
      )}

      {[{ side: a, tone: aTone }, { side: b, tone: bTone }].map((row, idx) => (
        <div key={row.side.name}
          className={`grid grid-cols-[1fr_auto] items-center gap-2.5 py-1.5 ${idx === 0 ? "border-t border-[rgba(0,0,0,0.05)]" : ""}`}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="block h-2 w-2 shrink-0 rounded-sm" style={{ background: row.tone }} />
            <span className="truncate text-[11.5px] font-semibold text-[#111110]">{LABELS[row.side.name] ?? row.side.name}</span>
          </div>
          <div className="text-right">
            {/* 확정 매출 = 캐논 그린(CONFIDENCE_TOKENS.confirmed) — 빨강이 아니다.
                시트 상 "빨간 글자=확정"은 입력 관례일 뿐 앱 표시 캐논은 그린. */}
            <p className="text-[13px] font-bold leading-none tracking-[-0.01em]" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}>
              <MoneyValue value={row.side.actual} />
            </p>
            <p className="mt-0.5 text-[9.5px] text-[#615D59]">목표 <MoneyValue value={row.side.goal} /></p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DealMixSection({ summary, loading, error }: { summary: BranchSummaryResponse | null; loading: boolean; error?: string | null }) {
  const data = summary?.deal_mix ?? null
  // 에러를 빈 상태로 위장하지 않는다(품질 웨이브 5 — 항목 2) — fetch 실패 시 !data가
  // 참이 되어 그냥 null(무표시)로 사라졌다.
  if (error && !summary) return (
    <div role="alert" className="rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] p-4 text-[12px] font-semibold text-[#8F2C2C]">
      {error}
    </div>
  )
  if (loading && !summary) return <div className="h-40 animate-pulse rounded-xl bg-[#f0f0ec]" />
  if (!data) return (
    <div role="status" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 text-[12px] text-[#615D59]">
      표시할 매출 분해 데이터가 없습니다.
    </div>
  )

  const hwSw = pickPair(data.by_category, "Hardware", "Software")
  const newRenew = pickPair(data.by_status_type, "New", "Renew")
  const channel = pickPair(data.by_channel, "Direct", "Channel")
  const kaSme = data.by_segment ? pickPair(data.by_segment, "KA", "SME") : null

  const slices = [hwSw, newRenew, channel].filter(Boolean) as Array<{ a: BranchDealMixSlice; b: BranchDealMixSlice }>
  if (slices.length === 0) return (
    <div role="status" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 text-[12px] text-[#615D59]">
      매출 분해 항목이 비어 있습니다.
    </div>
  )

  const totalActual = slices.reduce((s, p) => s + p.a.actual + p.b.actual, 0) / slices.length
  const totalGoal = slices.reduce((s, p) => s + p.a.goal + p.b.goal, 0) / slices.length
  const gap = Math.max(0, totalGoal - totalActual)

  const cardCount = slices.length + (kaSme ? 1 : 0)

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">매출 분해 · 전체팀</h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#615D59]">제품 · 신규/갱신 · 채널 · 고객규모 — <span className={`font-semibold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>그린 = 확정 매출</span></p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-bold leading-none tracking-[-0.01em] text-[#111110]"><MoneyValue value={totalActual} /></p>
          <p className="mt-1 text-[10.5px] text-[#615D59]">확정 평균 · 잔량 <MoneyValue value={gap} /></p>
        </div>
      </div>
      <div className={`grid gap-[18px] p-5 md:grid-cols-2 ${cardCount >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
        {hwSw && <CompareCard title="HW / SW" desc="제품 라인 구분" a={hwSw.a} b={hwSw.b} aTone={COLORS.green} bTone={COLORS.amber} prevMeta={data.meta?.by_category} />}
        {newRenew && <CompareCard title="New / Renew" desc="신규 계약 vs 갱신" a={newRenew.a} b={newRenew.b} aTone={COLORS.green} bTone={COLORS.neutral} prevMeta={data.meta?.by_status_type} />}
        {channel && <CompareCard title="Direct / Channel" desc="직판 vs 파트너 경유" a={channel.a} b={channel.b} aTone={COLORS.green} bTone={COLORS.amber} prevMeta={data.meta?.by_channel} />}
        {kaSme && <CompareCard title="KA / SME" desc="고객 규모별 매출" a={kaSme.a} b={kaSme.b} aTone={COLORS.neutral} bTone={COLORS.amber} prevMeta={data.meta?.by_segment} />}
      </div>
    </section>
  )
}
