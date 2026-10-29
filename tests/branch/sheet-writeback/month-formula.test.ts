import { describe, expect, it } from "vitest"

import { colToA1, isRevLayoutError, resolveRevLayout, type RevLayout } from "@/lib/branch/sheet-writeback/layout"
import { checkMonthFormulas, formulaRefs } from "@/lib/branch/sheet-writeback/month-formula"

import { block, blocks, buildHeader, REF_FY } from "./fixtures"

function layout(): RevLayout {
  const resolved = resolveRevLayout(buildHeader(), REF_FY)
  if (isRevLayoutError(resolved)) throw new Error(resolved.detail)
  return resolved
}

/** 15행 기준 정상 합계 수식 묶음(월 합계 칸 → 수식). */
function regularFormulas(row1: number): Map<number, string | null> {
  const map = new Map<number, string | null>()
  for (const monthBlock of blocks()) {
    map.set(monthBlock.totalCol, `=${monthBlock.weekCols.map((col) => `${colToA1(col)}${row1}`).join("+")}`)
  }
  return map
}

describe("formulaRefs", () => {
  it("+ 체인·SUM 범위·SUM 목록·$ 를 해석한다", () => {
    expect([...formulaRefs("=O3+P3+Q3+R3+S3", 3)!]).toEqual(["O3", "P3", "Q3", "R3", "S3"])
    expect([...formulaRefs("=SUM(O3:S3)", 3)!]).toEqual(["O3", "P3", "Q3", "R3", "S3"])
    expect([...formulaRefs("=sum($O$3:$S$3)", 3)!]).toEqual(["O3", "P3", "Q3", "R3", "S3"])
    expect([...formulaRefs("= SUM(O3, P3) + Q3", 3)!]).toEqual(["O3", "P3", "Q3"])
  })

  it.each([
    ["빼기", "=AA3+AB3-AE3"],
    ["같은 칸 두 번(6월 3행 실측 꼴)", "=AA3+AA3+AB3+AC3+AD3"],
    ["상수 더하기", "=O3+P3+100"],
    ["다른 행", "=O4+P3"],
    ["여러 행 범위", "=SUM(O3:S4)"],
    ["수식 아님", "1500"],
    ["빈 수식", "="],
    ["다른 함수", "=IFERROR(O3,0)"],
    ["괄호 깨짐", "=SUM(O3+P3)"],
  ])("%s → null", (_label, formula) => {
    expect(formulaRefs(formula, 3)).toBeNull()
  })
})

describe("checkMonthFormulas", () => {
  const oct = block("2026-10")
  const sept = block("2026-09")
  const AZ = oct.weekCols[1] // 10월 w2

  it("정상 수식이면 통과", () => {
    expect(checkMonthFormulas(15, regularFormulas(15), layout(), [oct.weekCols[3]])).toEqual({ ok: true })
  })

  it("실측 사례: 9월 합계(AR) 15행이 AW 대신 AZ 를 더한다 → 10월 w2 쓰기는 9월 불규칙으로 거절", () => {
    const formulas = regularFormulas(15)
    formulas.set(sept.totalCol, "=AS15+AT15+AU15+AV15+AZ15")
    expect(checkMonthFormulas(15, formulas, layout(), [AZ])).toEqual({
      ok: false,
      code: "month_formula_irregular",
      month: "2026-09",
    })
    // 9월 칸에 쓰려 해도 9월 합계가 AW 를 빠뜨려 거절된다.
    expect(checkMonthFormulas(15, formulas, layout(), [sept.weekCols[4]])).toMatchObject({ ok: false, month: "2026-09" })
  })

  it("대상 달 합계가 수식이 아니면(숫자 상수·빈 칸) 불규칙", () => {
    const formulas = regularFormulas(15)
    formulas.set(oct.totalCol, null)
    expect(checkMonthFormulas(15, formulas, layout(), [oct.weekCols[3]])).toMatchObject({ ok: false, month: "2026-10" })
    const missing = regularFormulas(15)
    missing.delete(oct.totalCol)
    expect(checkMonthFormulas(15, missing, layout(), [oct.weekCols[3]])).toMatchObject({ ok: false, month: "2026-10" })
  })

  it("대상 달 합계가 주차 칸 일부만 더하면 불규칙", () => {
    const formulas = regularFormulas(15)
    formulas.set(oct.totalCol, "=AY15+AZ15+BA15+BB15")
    expect(checkMonthFormulas(15, formulas, layout(), [oct.weekCols[3]])).toMatchObject({ ok: false, month: "2026-10" })
  })

  it("다른 달 합계가 해석 불가여도 대상 칸을 범위로 덮으면 불규칙", () => {
    const formulas = regularFormulas(15)
    const nov = block("2026-11")
    formulas.set(nov.totalCol, "=SUM(AY15:BI15)-1")
    expect(checkMonthFormulas(15, formulas, layout(), [oct.weekCols[3]])).toMatchObject({ ok: false, month: "2026-11" })
  })

  it("다른 달 합계의 상수는 대상 칸과 무관하다", () => {
    const formulas = regularFormulas(15)
    formulas.set(block("2026-04").totalCol, null)
    expect(checkMonthFormulas(15, formulas, layout(), [oct.weekCols[3]])).toEqual({ ok: true })
  })
})
