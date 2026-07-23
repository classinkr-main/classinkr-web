"use client"

// 공용 주차 그리드(M9-1) — CockpitEditor(콕핏 편집기)와 InputRailSection(REV/보드 플로팅 레일)이
// 각자 렌더하던 W1~W5 주차 입력 그리드(~90% 중복, 드리프트 진행 중)를 하나로 합친 프레젠테이션
// 컴포넌트. 각 행은 [주 라벨 · ¥ 금액 입력 · 주차별 3단 확도 토글(예정/고확도/확정)]로 구성되며,
// 금액이 0인 주차(zeroWeek)는 확도 토글이 비활성 톤으로 잠긴다(금액을 넣으면 풀린다 —
// draftWeeklySaveContract가 금액>0 주차의 확도만 기록하는 저장 계약과 대칭).
//
// variant로 두 소비처의 시각 차이를 흡수한다(렌더 결과는 리팩터 전과 byte-identical):
//   - "rail":    축약 라벨(예/고/확)·소형 버튼, 열 순서 [라벨·확도·금액], 컴팩트 간격(현 InputRailSection).
//   - "cockpit": 전체 라벨(예정/고확도/확정)·큰 입력, 열 순서 [라벨·금액·확도], 넉넉한 간격(현 CockpitEditor).
// 확도 활성색은 CONFIDENCE_TOKENS bgClass만 사용(색 리터럴 재정의 금지).
//
// 그 밖의 UI(확도 일괄 적용·월 합·저장 확도 미리보기·저장 버튼·M1(a) 월 장부금액 참조 등)는
// 각 소비처가 그대로 소유한다 — 이 컴포넌트는 "주차 행 5줄"만 그린다.

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { DRAFT_CONFIDENCE_OPTIONS, FORECAST_WEEK_RANGE_LABELS, draftWeeklyAmounts, type DraftConfidence } from "./shared"

interface WeeklyAmountGridProps {
  /** W1~W5 문자열 입력 버퍼 5칸(빈 칸 허용) — 부모의 draftForm.weekly. */
  weekly: string[]
  /** W1~W5 주차별 확도 버퍼 5칸(weekly와 병렬) — 부모의 draftForm.weeklyConfidence. */
  weeklyConfidence: DraftConfidence[]
  /** 주차 금액 변경 — rawValue는 이미 숫자만 남긴 값(그리드에서 [^\d] 제거). 부모는 해당 칸만 세팅한다. */
  onAmountChange: (index: number, rawValue: string) => void
  /** 주차 확도 변경 — 부모는 해당 칸만 세팅한다. */
  onConfidenceChange: (index: number, key: DraftConfidence) => void
  variant: "rail" | "cockpit"
}

export function WeeklyAmountGrid({
  weekly,
  weeklyConfidence,
  onAmountChange,
  onConfidenceChange,
  variant,
}: WeeklyAmountGridProps) {
  const isCockpit = variant === "cockpit"
  // zeroWeek 판정은 두 소비처가 쓰던 draftWeeklyAmounts(음수/비숫자 0 정규화)와 동일 산식.
  const weeklyAmounts = draftWeeklyAmounts(weekly)

  return (
    <div className={isCockpit ? "space-y-2" : "space-y-1.5"}>
      {FORECAST_WEEK_RANGE_LABELS.map((rangeLabel, index) => {
        const zeroWeek = weeklyAmounts[index] <= 0

        const label = isCockpit ? (
          <span className="text-[12px] font-bold text-[#111110]">
            W{index + 1}
            <span className="ml-1 text-[10px] font-semibold text-[#A39E98]">{rangeLabel}</span>
          </span>
        ) : (
          <span className="truncate text-[11px] font-bold text-[#111110]">
            W{index + 1} <span className="ml-0.5 font-semibold text-[#A39E98]">{rangeLabel}</span>
          </span>
        )

        const amountField = (
          <span className="relative block">
            <span
              aria-hidden
              className={
                isCockpit
                  ? "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[#A39E98]"
                  : "pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#A39E98]"
              }
            >
              ¥
            </span>
            <input
              value={weekly[index] ?? ""}
              onChange={(event) => onAmountChange(index, event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              aria-label={`W${index + 1} 금액`}
              className={
                isCockpit
                  ? "h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white pl-7 pr-3 text-right text-[13px] font-semibold tabular-nums text-[#111110] outline-none focus:border-[#084734]"
                  : "h-8 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white pl-6 pr-2 text-right text-[12px] font-semibold tabular-nums text-[#111110] outline-none focus:border-[#084734]"
              }
            />
          </span>
        )

        const confidenceGroup = (
          <div role="group" aria-label={`W${index + 1} 확도`} className={isCockpit ? "flex gap-1" : "flex gap-0.5"}>
            {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
              const active = !zeroWeek && weeklyConfidence[index] === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={zeroWeek}
                  aria-pressed={active}
                  title={`W${index + 1} ${option.label}`}
                  // rail은 축약 라벨이라 스크린리더용 전체 라벨을 aria-label로 보강한다(cockpit은 전체 라벨이라 불필요).
                  {...(isCockpit ? {} : { "aria-label": `W${index + 1} ${option.label}` })}
                  onClick={() => onConfidenceChange(index, option.id)}
                  className={`${
                    isCockpit
                      ? "h-10 rounded-md px-2.5 text-[11px] font-bold transition"
                      : "h-8 w-6 rounded text-[10px] font-bold transition"
                  } ${
                    zeroWeek
                      ? "cursor-not-allowed border border-[rgba(0,0,0,0.06)] bg-white text-[#DDD9D3]"
                      : active
                        ? `${CONFIDENCE_TOKENS[option.id].bgClass} text-white`
                        : "border border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:text-[#111110]"
                  }`}
                >
                  {isCockpit ? option.label : option.label.slice(0, 1)}
                </button>
              )
            })}
          </div>
        )

        return isCockpit ? (
          <div key={rangeLabel} className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-2">
            {label}
            {amountField}
            {confidenceGroup}
          </div>
        ) : (
          <div key={rangeLabel} className="grid grid-cols-[minmax(0,1fr)_auto_104px] items-center gap-1.5">
            {label}
            {confidenceGroup}
            {amountField}
          </div>
        )
      })}
    </div>
  )
}
