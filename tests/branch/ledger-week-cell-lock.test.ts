import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { computeWeekCellStates } from "@/components/admin/branch/SalesLedgerWorkbench"

// 회귀 방지(2026-07-20 버그): 매트릭스 확장월의 주차 5칸(W1~W5) 잠금은 "그 달이 확정으로 잠겼는가"
// (monthLocked) 하나로 5칸을 통째로 잠그면 안 된다 — 실제 확정액이 찍힌 칸(display>0)만 잠그고,
// 빈 칸은 같은 달이어도 편집 가능(아직 안 지난 당월 주차 입력 허용)이어야 한다. 이 스위트는 렌더
// 없이 computeWeekCellStates를 직접 구동해 그 규칙을 고정한다.

describe("computeWeekCellStates — 주차 칸 표시·잠금 순수 계산", () => {
  it("월이 잠겨도 빈 칸(display=0)은 잠기지 않는다 — W1만 확정된 달의 W2~W5는 열려 있다", () => {
    // 익산 유투엠수학 7월 시나리오: W1 1.6만 확정 → 그 달이 monthLocked, 나머지 주차는 미입력.
    const states = computeWeekCellStates([16000, 0, 0, 0, 0], 0, true)

    expect(states[0]).toEqual({ display: 16000, isMonthOnly: false, locked: true })
    for (const index of [1, 2, 3, 4]) {
      expect(states[index]).toEqual({ display: 0, isMonthOnly: false, locked: false })
    }
  })

  it("중간 주차만 확정된 달도 확정 칸만 잠그고 앞뒤 빈 칸은 연다", () => {
    // 에듀온픽 유형: W3만 값이 있는 달.
    const states = computeWeekCellStates([0, 0, 10000, 0, 0], 0, true)

    expect(states.map((s) => s.locked)).toEqual([false, false, true, false, false])
  })

  it("월이 잠기지 않았으면(monthLocked=false) 값이 있는 칸도 잠기지 않는다", () => {
    const states = computeWeekCellStates([16000, 0, 0, 0, 0], 0, false)

    expect(states.every((s) => s.locked === false)).toBe(true)
  })

  it("월합계만(month-only) 행은 W5에 월합계를 얹고, 그 달이 잠기면 W5만 잠긴다", () => {
    // 주차 분해가 없는 시트행: monthOnlyAmount가 W5에만 표시된다(anyExplicit=false).
    const states = computeWeekCellStates([0, 0, 0, 0, 0], 30000, true)

    expect(states[4]).toEqual({ display: 30000, isMonthOnly: true, locked: true })
    for (const index of [0, 1, 2, 3]) {
      expect(states[index]).toEqual({ display: 0, isMonthOnly: false, locked: false })
    }
  })

  it("explicit 주차가 하나라도 있으면 W5 monthOnly 폴백을 쓰지 않는다", () => {
    // W1에 값이 있으면 anyExplicit=true라 monthOnlyAmount는 W5에 얹지 않는다(이중표시 방지).
    const states = computeWeekCellStates([16000, 0, 0, 0, 0], 30000, false)

    expect(states[4]).toEqual({ display: 0, isMonthOnly: false, locked: false })
  })

  it("전 칸 미입력·미잠금이면 모두 display 0·잠금 해제(예정 신규 입력 가능)", () => {
    const states = computeWeekCellStates([0, 0, 0, 0, 0], 0, false)

    expect(states).toEqual([
      { display: 0, isMonthOnly: false, locked: false },
      { display: 0, isMonthOnly: false, locked: false },
      { display: 0, isMonthOnly: false, locked: false },
      { display: 0, isMonthOnly: false, locked: false },
      { display: 0, isMonthOnly: false, locked: false },
    ])
  })
})

// 회귀 방지(2026-07-24): 잠금 "표시"(🔒 아이콘·시트 확정 툴팁)는 편집 가능한 딜행(editContext)
// 에서만 — 읽기전용 경로(카테고리 합산행 등, editContext 없음)는 monthLocked 폴백이 true라
// cellStates.locked가 display>0 칸마다 서므로, 그대로 locked prop에 넘기면 합산 주차칸마다
// 🔒 + "시트 확정 잠금" 오표기가 찍힌다(9e8f1fc5 순수 함수화 때의 회귀 — 리팩터 이전에는
// `locked={editContext ? … : false}`였다). 렌더 하네스가 없어 소스 스캔으로 게이트를 고정한다.
describe("RevMatrixWeekCells — 잠금 표시는 editContext(딜행)에서만", () => {
  it("locked prop은 Boolean(editContext) 게이트를 거친다(읽기전용 합산행 🔒 오표기 차단)", () => {
    const source = readFileSync(
      join(process.cwd(), "components/admin/branch/ledger/RevMatrix.tsx"),
      "utf8",
    )
    expect(source).toContain("const weekLocked = Boolean(editContext) && cellLocked")
    expect(source).toContain("const weekEditable = Boolean(editContext) && !cellLocked")
  })
})
