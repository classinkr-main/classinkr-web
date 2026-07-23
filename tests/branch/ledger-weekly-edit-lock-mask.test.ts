import { describe, expect, it } from "vitest"
import { weeklyEditLockMask } from "@/components/admin/branch/SalesLedgerWorkbench"

// Task B(2026-07-23): 콕핏/레일 주차 그리드의 "확정 주차 읽기전용, 빈 주차 추가만 허용" 규칙을 고정한다.
// 확정으로 잠긴 달에서 explicit 주차 금액이 있는 칸만 잠그고(덮어쓰기 방지), 빈 칸은 열어 아직 안 지난
// 주차 입력을 허용한다. explicit 주차가 없으면(월합계만/미입력) 전 false — 그 경우 폼 전체 잠금이 담당.

describe("weeklyEditLockMask — 콕핏/레일 주차 칸 잠금 마스크", () => {
  it("확정 달 + explicit 주차: 값 있는 칸만 잠그고 빈 칸은 연다", () => {
    // 익산 유투엠수학 7월: W1 1.6만 확정, 나머지 미입력.
    expect(weeklyEditLockMask(true, true, [16000, 0, 0, 0, 0])).toEqual([true, false, false, false, false])
  })

  it("확정 달 + 중간 주차만 값: 그 칸만 잠근다", () => {
    expect(weeklyEditLockMask(true, true, [0, 0, 10000, 0, 0])).toEqual([false, false, true, false, false])
  })

  it("월이 잠기지 않았으면 explicit 주차가 있어도 전부 열림", () => {
    expect(weeklyEditLockMask(false, true, [16000, 0, 0, 0, 0])).toEqual([false, false, false, false, false])
  })

  it("확정 달이어도 explicit 주차가 없으면(월합계만/미입력) 전부 false — 폼 전체 잠금이 보호", () => {
    expect(weeklyEditLockMask(true, false, [0, 0, 0, 0, 0])).toEqual([false, false, false, false, false])
    // hasExplicitWeeks=false면 weeks 내용과 무관하게 전 false(개별로 보존할 주차가 없음).
    expect(weeklyEditLockMask(true, false, [30000, 0, 0, 0, 0])).toEqual([false, false, false, false, false])
  })

  it("확정 달 + 여러 주차 확정: 값 있는 칸 모두 잠그고 빈 칸만 연다", () => {
    expect(weeklyEditLockMask(true, true, [5000, 5000, 0, 0, 0])).toEqual([true, true, false, false, false])
  })

  it("weeks 배열이 5칸보다 짧아도 안전하게 false로 채운다", () => {
    expect(weeklyEditLockMask(true, true, [16000])).toEqual([true, false, false, false, false])
  })
})
