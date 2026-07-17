import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// 웨이브 7 — U5(터치 타깃). 좁은 뷰포트(<md)에서만 BranchDashboardClient의 팀/기간 필터 칩,
// PipelineTable의 페이지네이션 버튼, MultiSelect의 트리거를 min-h-10(40px) 이상으로 키운다 —
// 데스크톱 밀도는 md: 브레이크포인트로 원복해 그대로 유지한다. 이 저장소는 컴포넌트 렌더
// 테스트 인프라(jsdom/testing-library)가 없어(vitest.config.ts environment: "node") 다른
// tests/branch/*.test.ts와 동일하게 소스 문자열 검증으로 회귀를 잡는다.

const dashboardClientPath = join(process.cwd(), "components/admin/branch/BranchDashboardClient.tsx")
const pipelineTablePath = join(process.cwd(), "components/admin/branch/sections/PipelineTable.tsx")
const multiSelectPath = join(process.cwd(), "components/admin/branch/MultiSelect.tsx")

function dashboardClientSource() {
  return readFileSync(dashboardClientPath, "utf8")
}
function pipelineTableSource() {
  return readFileSync(pipelineTablePath, "utf8")
}
function multiSelectSource() {
  return readFileSync(multiSelectPath, "utf8")
}

describe("웨이브 7 — U5. BranchDashboardClient 팀/기간 필터 칩 모바일 터치 타깃", () => {
  it("팀 필터 버튼이 min-h-10과 md:min-h-0을 함께 갖는다(모바일만 확대, 데스크톱은 원복)", () => {
    const source = dashboardClientSource()
    const groupIndex = source.indexOf('role="group" aria-label="팀 필터"')
    expect(groupIndex).toBeGreaterThan(-1)
    const buttonClassIndex = source.indexOf("className=", groupIndex)
    const buttonClassEnd = source.indexOf("`}", buttonClassIndex)
    const buttonClass = source.slice(buttonClassIndex, buttonClassEnd)
    expect(buttonClass).toContain("min-h-10")
    expect(buttonClass).toContain("md:min-h-0")
  })

  it("기간 필터 버튼이 min-h-10과 md:min-h-0을 함께 갖는다", () => {
    const source = dashboardClientSource()
    const groupIndex = source.indexOf('role="group" aria-label="기간 필터"')
    expect(groupIndex).toBeGreaterThan(-1)
    const buttonClassIndex = source.indexOf("className=", groupIndex)
    const buttonClassEnd = source.indexOf("`}", buttonClassIndex)
    const buttonClass = source.slice(buttonClassIndex, buttonClassEnd)
    expect(buttonClass).toContain("min-h-10")
    expect(buttonClass).toContain("md:min-h-0")
  })
})

describe("웨이브 7 — U5. PipelineTable 페이지네이션 버튼 모바일 터치 타깃", () => {
  it("이전/다음 페이지 버튼이 h-10 w-10(모바일) → md:h-7 md:w-7(데스크톱)로 반응형이다", () => {
    const source = pipelineTableSource()
    const prevButtonIndex = source.indexOf('aria-label="이전 페이지"')
    const nextButtonIndex = source.indexOf('aria-label="다음 페이지"')
    expect(prevButtonIndex).toBeGreaterThan(-1)
    expect(nextButtonIndex).toBeGreaterThan(prevButtonIndex)

    const footerStart = source.lastIndexOf("<button", prevButtonIndex) - 400
    const footerEnd = nextButtonIndex + 400
    const footer = source.slice(Math.max(0, footerStart), footerEnd)
    const occurrences = footer.match(/h-10 min-h-10 w-10 min-w-10/g) ?? []
    expect(occurrences.length).toBe(2)
    expect(footer).toContain("md:h-7 md:min-h-0 md:w-7 md:min-w-0")
  })
})

describe("웨이브 7 — U5. MultiSelect 트리거 모바일 터치 타깃", () => {
  it("트리거 버튼이 h-10 min-h-10(모바일) → md:h-8 md:min-h-0(데스크톱)로 반응형이다", () => {
    const source = multiSelectSource()
    const triggerIndex = source.indexOf('aria-haspopup="listbox"')
    expect(triggerIndex).toBeGreaterThan(-1)
    const classIndex = source.lastIndexOf("className=", triggerIndex)
    const classEnd = source.indexOf('"', classIndex + 'className="'.length)
    const triggerClass = source.slice(classIndex, classEnd)
    expect(triggerClass).toContain("h-10 min-h-10")
    expect(triggerClass).toContain("md:h-8 md:min-h-0")
  })

  it("드롭다운 오프셋이 트리거의 반응형 높이에 맞춰 top-11/md:top-9로 조정됐다", () => {
    const source = multiSelectSource()
    expect(source).toContain("top-11")
    expect(source).toContain("md:top-9")
  })
})
