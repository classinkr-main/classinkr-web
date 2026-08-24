"use client"

// 공용 주차 그리드(M9-1) — CockpitEditor(콕핏 편집기)와 InputRailSection(REV/보드 플로팅 레일)이
// 각자 렌더하던 W1~W5 주차 입력 그리드(~90% 중복, 드리프트 진행 중)를 하나로 합친 프레젠테이션
// 컴포넌트. 각 행은 [주 라벨 · ¥ 금액 입력 · 주차별 3단 확도 토글(예정/고확도/확정)]로 구성되며,
// 금액이 0인 주차(zeroWeek)는 확도 토글이 비활성 톤으로 잠긴다(금액을 넣으면 풀린다 —
// draftWeeklySaveContract가 금액>0 주차의 확도만 기록하는 저장 계약과 대칭).
//
// variant로 두 소비처의 시각 차이를 흡수한다(금액 칸을 공용 AdminMoneyInput으로 바꾼 것 외에는
// M9-1 통합 당시의 렌더 결과 그대로):
//   - "rail":    축약 라벨(예/고/확)·소형 버튼, 열 순서 [라벨·확도·금액], 컴팩트 간격(현 InputRailSection).
//   - "cockpit": 전체 라벨(예정/고확도/확정)·큰 입력, 열 순서 [라벨·금액·확도], 넉넉한 간격(현 CockpitEditor).
// 확도 활성색은 CONFIDENCE_TOKENS bgClass만 사용(색 리터럴 재정의 금지).
//
// 그 밖의 UI(확도 일괄 적용·월 합·저장 확도 미리보기·저장 버튼·M1(a) 월 장부금액 참조 등)는
// 각 소비처가 그대로 소유한다 — 이 컴포넌트는 "주차 행 5줄"만 그린다.

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react"

import { AdminMoneyInput, parseMoneyInput } from "@/components/admin/AdminMoneyInput"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { DRAFT_CONFIDENCE_OPTIONS, FORECAST_WEEK_RANGE_LABELS, draftWeeklyAmounts, type DraftConfidence } from "./shared"

interface WeeklyAmountGridProps {
  /** W1~W5 문자열 입력 버퍼 5칸(빈 칸 허용) — 부모의 draftForm.weekly. */
  weekly: string[]
  /** W1~W5 주차별 확도 버퍼 5칸(weekly와 병렬) — 부모의 draftForm.weeklyConfidence. */
  weeklyConfidence: DraftConfidence[]
  /** 주차 금액 변경 — rawValue는 이미 숫자만 남긴 값(공용 금액 입력이 정규화). 부모는 해당 칸만 세팅한다. */
  onAmountChange: (index: number, rawValue: string) => void
  /** 주차 확도 변경 — 부모는 해당 칸만 세팅한다. */
  onConfidenceChange: (index: number, key: DraftConfidence) => void
  /** Task B(2026-07-23): 확정으로 잠긴 달의 explicit 주차 중 값이 있는 칸(5칸 boolean). true면 그 주차는
   *  읽기전용(🔒)으로 렌더해 확정값 덮어쓰기를 막고, 빈 칸에만 아직 안 지난 주차를 새로 넣게 한다. */
  lockedWeeks?: boolean[]
  variant: "rail" | "cockpit"
}

export function WeeklyAmountGrid({
  weekly,
  weeklyConfidence,
  onAmountChange,
  onConfidenceChange,
  lockedWeeks,
  variant,
}: WeeklyAmountGridProps) {
  const isCockpit = variant === "cockpit"
  // zeroWeek 판정은 두 소비처가 쓰던 draftWeeklyAmounts(음수/비숫자 0 정규화)와 동일 산식.
  const weeklyAmounts = draftWeeklyAmounts(weekly)

  // ↑/↓로 주차 금액 칸 사이를 바로 오간다 — Tab은 확도 seg 3버튼을 거치므로 연속 금액 입력에는
  // 세로 이동이 빠르다(매트릭스 셀 순회와 같은 스프레드시트 감각). 잠금(readOnly) 칸도 포커스는
  // 허용해 건너뛰지 않는다(읽기 확인 가능, 입력은 readOnly가 막는다). Enter는 기존 계약(M7:
  // form submit = 저장) 그대로 — 여기서 가로채지 않는다.
  const amountRefs = useRef<Array<HTMLInputElement | null>>([])
  const onAmountKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const nextIndex = event.key === "ArrowDown" ? Math.min(index + 1, 4) : Math.max(index - 1, 0)
    if (nextIndex === index) return
    event.preventDefault()
    const next = amountRefs.current[nextIndex]
    next?.focus()
    next?.select()
  }

  return (
    <div className={isCockpit ? "space-y-2" : "space-y-1.5"}>
      {FORECAST_WEEK_RANGE_LABELS.map((rangeLabel, index) => {
        const zeroWeek = weeklyAmounts[index] <= 0
        // Task B: 확정으로 잠긴 주차칸(값 있는 explicit 주차) — 읽기전용·확도 고정. 빈 칸은 잠기지 않는다.
        const locked = lockedWeeks?.[index] ?? false

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

        // 금액 칸은 공용 AdminMoneyInput — 예전 인라인 input은 매 keystroke마다 [^\d]를 지워
        // 한글 IME 조합을 통째로 삼켰다(입력이 빈 문자열이 되고 아무 안내도 없음). 공용 입력은
        // 조합이 끝난 뒤에만 정규화하고, 걸러낸 입력은 "숫자만 입력할 수 있습니다"로 알린다.
        // 장부 고유 요건 3가지는 그대로 살린다:
        //   - locked → readOnly(disabled 아님: 확정 칸도 포커스로 읽고 지나갈 수 있어야 ↑/↓ 순회가 안 끊긴다)
        //   - inputRef/onKeyDown → 기존 amountRefs + ↑/↓ 세로 이동 그대로
        //   - blurOnEnter={false} → Enter는 여전히 form submit(M7 저장 계약), 여기서 가로채지 않는다
        // 부모 버퍼는 계속 문자열(draftForm.weekly)이라 여기서만 숫자↔문자열을 어댑트한다 —
        // onLiveChange로 매 입력마다 올려야 월 합·확도 seg·저장 버튼이 즉시 따라온다(blur 대기 금지:
        // 비활성 버튼은 mousedown을 삼켜 blur가 안 나므로 영영 못 누르는 막다른 길이 된다).
        const pushAmount = (next: number | null) => onAmountChange(index, next == null ? "" : String(next))
        const amountField = (
          <span
            className="block"
            // 잠금 사유 툴팁은 감싸는 요소에 둔다 — title은 자손(인풋)에 hover해도 그대로 뜬다.
            title={locked ? `W${index + 1} 확정 값이라 잠금(실수 방지) — 수정은 REV 렌즈 정정 초안으로` : undefined}
          >
            <AdminMoneyInput
              value={parseMoneyInput(weekly[index] ?? "")}
              onCommit={pushAmount}
              onLiveChange={pushAmount}
              inputRef={(node) => {
                amountRefs.current[index] = node
              }}
              onKeyDown={(event) => onAmountKeyDown(event, index)}
              blurOnEnter={false}
              readOnly={locked}
              prefix="¥"
              ariaLabel={`W${index + 1} 금액`}
              className="w-full"
              fieldClassName={isCockpit ? "h-10" : "h-8"}
              // 장부는 밀집 숫자 그리드라 교체 전 타이포(semibold, 콕핏 13px)를 유지한다.
              inputClassName={isCockpit ? "text-[13px] font-semibold" : "font-semibold"}
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
                  disabled={zeroWeek || locked}
                  aria-pressed={active}
                  title={locked ? `W${index + 1} 확정 값이라 잠금` : `W${index + 1} ${option.label}`}
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
                        ? `${CONFIDENCE_TOKENS[option.id].bgClass} text-white${locked ? " cursor-not-allowed opacity-90" : ""}`
                        : `border border-[rgba(0,0,0,0.08)] bg-white text-[#615D59]${locked ? " cursor-not-allowed opacity-60" : " hover:text-[#111110]"}`
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
