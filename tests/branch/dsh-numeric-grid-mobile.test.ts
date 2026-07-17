import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// 회귀 방지(품질 웨이브 7, 항목 5): DshNumericGrid는 min-w-[1080px] 원장 표라 md 미만에서
// 스크롤 없이는 첫 열(구분) 말고 아무 값도 안 보인다. 이 표는 검수용(헤더 주석 "숫자가 정본")
// 이라 열을 줄인 모바일 축약 카드 대신 — 열 고정(이미 있던 sticky 첫 열)은 유지하고 가로
// 스크롤이 더 있다는 사실을 명시하는 힌트를 md 미만에서만 보여주는 쪽을 택했다. 데이터를
// 숨기지 않는지(집계 로직·컬럼 수 무변경)와 힌트가 실제로 렌더 트리에 들어갔는지를 소스
// 스캔으로 확인한다.

const gridPath = join(process.cwd(), "components/admin/branch/ledger/DshNumericGrid.tsx")

function gridSource() {
  return readFileSync(gridPath, "utf8")
}

describe("DshNumericGrid — 모바일 가로 스크롤 힌트(품질 웨이브 7, 항목 5)", () => {
  it("breakdown이 있을 때만(로딩·빈 상태 분기 밖) md:hidden 힌트가 렌더된다", () => {
    const source = gridSource()
    const nonEmptyBranchStart = source.indexOf(") : (", source.indexOf("breakdown.length === 0 ? ("))
    expect(nonEmptyBranchStart).toBeGreaterThan(-1)
    const tableStart = source.indexOf("<table", nonEmptyBranchStart)
    expect(tableStart).toBeGreaterThan(nonEmptyBranchStart)
    const hintBlock = source.slice(nonEmptyBranchStart, tableStart)
    expect(hintBlock).toContain("md:hidden")
    expect(hintBlock).toContain("ArrowLeftRight")
    expect(hintBlock).toContain("좌우로 스크롤")
  })

  it("로딩 중(breakdown 없음)이거나 빈 상태에는 힌트가 없다 — 표가 없을 땐 스크롤 안내도 무의미", () => {
    const source = gridSource()
    const loadingBranchStart = source.indexOf("loading && breakdown.length === 0 ? (")
    const emptyBranchStart = source.indexOf("breakdown.length === 0 ? (")
    const nonEmptyBranchStart = source.indexOf(") : (", emptyBranchStart)
    const loadingBranch = source.slice(loadingBranchStart, emptyBranchStart)
    const emptyBranch = source.slice(emptyBranchStart, nonEmptyBranchStart)
    expect(loadingBranch).not.toContain("md:hidden")
    expect(emptyBranch).not.toContain("md:hidden")
  })

  it("표 자체는 열을 줄이지 않는다 — min-w-[1080px]와 12개월 + 4분기 + 연간 + 비율 컬럼을 그대로 유지한다", () => {
    const source = gridSource()
    expect(source).toContain('min-w-[1080px]')
    expect(source).toContain('{["Q1", "Q2", "Q3", "Q4"].map((label) => (')
    expect(source).toContain("{monthKeys.map((ym) => (")
  })

  it("첫 열(구분)의 sticky 고정은 그대로 유지된다(헤더·Team KR 합계 행 모두)", () => {
    const source = gridSource()
    expect(source).toContain('sticky left-0 z-[1] bg-[#F6F5F4] text-left font-bold')
    expect(source).toContain('sticky left-0 z-[1] bg-[#ECFDF5] text-left font-extrabold text-[#084734]')
  })

  it("가로 스크롤 컨테이너(overflow-x-auto)는 표 하나만 감싸 페이지 자체는 가로로 넘치지 않는다", () => {
    const source = gridSource()
    const wrapperIndex = source.indexOf('<div className="overflow-x-auto">')
    expect(wrapperIndex).toBeGreaterThan(-1)
  })
})
