"use client"

// REV 매트릭스 편집 바 — 기획 sales-ledger-input-speed-plan-2026-09-20.md §8.3 A안(팝오버를
// 행 우측 고정으로 재배치)의 대체 구현. A안은 1,100px+ 매트릭스에서 우측 팝오버가 화면 밖으로
// 나가는 문제가 있어, 팝오버 위치를 옮기는 대신 셀 밖(매트릭스 위)에 항상 떠 있는 표면을 둔다 —
// 스프레드시트의 수식 입력줄과 같은 자리. 지금 편집·선택 중인 셀(고객·월/주차·값 변화)과 확도
// 3버튼·단축키 힌트를 한 줄에 모아, 어떤 셀 위에서도 절대 가리지 않고 보여준다.
//
// 이 컴포넌트는 순수 프레젠테이션이다 — 편집 상태기계(useMatrixEditor)와 확도 단축키 판정
// (confidence-shortcuts.ts)은 그대로 두고, 상위(SalesLedgerWorkbench)가 그 반환값을 이 컴포넌트
// props로 그대로 흘려보낸다. 위치(고정/스크롤 추적)는 워크벤치가 매트릭스 스크롤 컨테이너
// 기준으로 배선한다 — 이 파일은 매트릭스가 이미 쓰는 sticky 레이어(z-10/20/30, RevMatrix.tsx)와
// 충돌하지 않도록 자체 position/z-index를 갖지 않는다.

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { DRAFT_CONFIDENCE_OPTIONS, formatMoney } from "./shared"
import type { DraftConfidence } from "./shared"
import type { MatrixCellCoord } from "./rev-matrix-logic"

// 확도 단축키 표시 문자(E/H/C) — 실제 keydown 판정의 정본은 confidence-shortcuts.ts(SHORTCUTS)
// 다. 여기서는 버튼에 작게 병기할 표시 문자만 필요해 별도 로컬 맵을 둔다(판정 로직 중복 아님).
const CONFIDENCE_SHORTCUT_LETTERS: Record<DraftConfidence, string> = {
  expected: "E",
  "high-confidence": "H",
  confirmed: "C",
}

export interface RevMatrixEditBarProps {
  /** 편집 중 셀. null이면 "선택만 됨" 또는 대기 상태. */
  editing: MatrixCellCoord | null
  /** 선택 셀(편집 전). editing이 null일 때 안내에 쓴다. */
  selected: MatrixCellCoord | null
  /** 편집 중 셀의 고객명·월 라벨·주차 라벨(호출부가 rowById/formatMonthLabel로 만들어 넘긴다). */
  context: { customer: string; monthLabel: string; weekLabel?: string; currentAmount: number } | null
  /** 편집 버퍼(원 단위 숫자 문자열, 빈 문자열 가능). */
  buffer: string
  confidence: DraftConfidence
  onPickConfidence: (next: DraftConfidence) => void
  /** 편집 중이 아닐 때(선택 셀만 있을 때) 확도 버튼을 누르면 그 셀의 확도만 바꾸는 경로 — 없으면 버튼 비활성. */
  disabled?: boolean
}

// 반환 타입: 이 저장소(React 19 + @types/react 19)는 전역 앰비언트 JSX 네임스페이스가
// 모듈 스코프로 바뀌어 `JSX.Element`(비한정)가 이 파일에서 바로 해석되지 않는다
// (tsc: Cannot find namespace 'JSX'). `React.JSX.Element`는 값은 동일하고, 이 저장소의
// 기존 관례(components/admin/calendar/DatePickerPopover.tsx)와도 일치한다.
export function RevMatrixEditBar(props: RevMatrixEditBarProps): React.JSX.Element {
  const { editing, selected, context, buffer, confidence, onPickConfidence, disabled = false } = props

  return (
    <div
      role="region"
      aria-label="셀 편집"
      aria-live="polite"
      className="hidden md:flex h-11 items-center gap-3 border border-[rgba(0,0,0,0.08)] bg-white px-3"
    >
      {/* 확도색 인디케이터 — 편집 input 테두리(border-2 CONFIDENCE_TOKENS 색)와 같은 "색으로 답하기". */}
      <span
        aria-hidden
        className="w-1 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: CONFIDENCE_TOKENS[confidence].color }}
      />

      {/* 좌측: 상태 텍스트 — editing > selected > 대기 순으로 하나만 보여준다. */}
      <div className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
        {editing && context ? (
          <>
            <span className="truncate text-[12px] font-bold text-[#111110]">
              {context.customer} · {context.monthLabel}
              {context.weekLabel ? ` ${context.weekLabel}` : ""}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold tabular-nums text-[#615D59]">
              {formatMoney(context.currentAmount)} → {buffer === "" ? "빈 칸" : formatMoney(Number(buffer))}
            </span>
          </>
        ) : selected ? (
          <span className="truncate text-[12px] font-semibold text-[#615D59]">
            선택됨 — Enter/F2 또는 숫자 입력으로 편집
          </span>
        ) : (
          <span className="truncate text-[12px] font-semibold text-[#A39E98]">
            셀을 선택하면 여기서 확도를 고를 수 있습니다
          </span>
        )}
      </div>

      {/* 중앙: 확도 3버튼 세그먼트 — 매트릭스 팝오버(RevMatrixEditPopover)보다 크게(≥36px). */}
      <div role="radiogroup" aria-label="확도" className="flex shrink-0 items-center gap-1">
        {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
          const token = CONFIDENCE_TOKENS[option.id]
          const active = !disabled && confidence === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={option.hint}
              disabled={disabled}
              // 팝오버(RevMatrixEditPopover)와 같은 이유 — mousedown이 편집 input의 포커스를
              // 뺏으면 blur 커밋(의도치 않은 저장)이 발생한다. 클릭이 끝날 때까지 포커스를 지킨다.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPickConfidence(option.id)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-4 text-[12px] font-bold leading-none transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? `${token.bgClass} border-transparent text-white`
                  : `border-[rgba(0,0,0,0.08)] bg-white ${token.textClass}`
              }`}
            >
              {option.label}
              <kbd
                className={`rounded px-1 py-0.5 text-[9px] font-bold leading-none ${
                  active ? "bg-white/25 text-white" : "bg-[#f0f0ec] text-[#615D59]"
                }`}
              >
                {CONFIDENCE_SHORTCUT_LETTERS[option.id]}
              </kbd>
            </button>
          )
        })}
      </div>

      {/* 우측: 단축키 힌트 — 13인치 랩탑 이하(<lg)에서는 공간을 좌측 상태 텍스트에 양보한다. */}
      <p className="hidden shrink-0 whitespace-nowrap text-[10.5px] font-semibold text-[#A39E98] lg:inline">
        Enter 저장 · Tab 다음 칸 · Esc 취소 · Ctrl+D 아래 복사 · Ctrl+V 붙여넣기
      </p>
    </div>
  )
}
