import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// 웨이브 7 — U5(터치 타깃). 좁은 뷰포트(<md)에서만 BranchDashboardClient의 팀/기간 필터 칩,
// PipelineTable의 페이지네이션 버튼, MultiSelect의 트리거를 최소 44px로 키운다 —
// 데스크톱 밀도는 md: 브레이크포인트로 원복해 그대로 유지한다. 이 저장소는 컴포넌트 렌더
// 테스트 인프라(jsdom/testing-library)가 없어(vitest.config.ts environment: "node") 다른
// tests/branch/*.test.ts와 동일하게 소스 문자열 검증으로 회귀를 잡는다.

const dashboardClientPath = join(process.cwd(), "components/admin/branch/BranchDashboardClient.tsx")
const pipelineTablePath = join(process.cwd(), "components/admin/branch/sections/PipelineTable.tsx")
const multiSelectPath = join(process.cwd(), "components/admin/branch/MultiSelect.tsx")
const syncStatusBarPath = join(process.cwd(), "components/admin/branch/SyncStatusBar.tsx")
const integrityStripPath = join(process.cwd(), "components/admin/branch/IntegrityStrip.tsx")
const branchKpiPath = join(process.cwd(), "components/admin/branch/sections/BranchKpiAccordion.tsx")
const bottleneckPath = join(process.cwd(), "components/admin/branch/sections/ActivityBottleneckSection.tsx")

function dashboardClientSource() {
  return readFileSync(dashboardClientPath, "utf8")
}
function pipelineTableSource() {
  return readFileSync(pipelineTablePath, "utf8")
}
function multiSelectSource() {
  return readFileSync(multiSelectPath, "utf8")
}
function syncStatusBarSource() {
  return readFileSync(syncStatusBarPath, "utf8")
}
function integrityStripSource() {
  return readFileSync(integrityStripPath, "utf8")
}
function branchKpiSource() {
  return readFileSync(branchKpiPath, "utf8")
}
function bottleneckSource() {
  return readFileSync(bottleneckPath, "utf8")
}

describe("웨이브 7 — U5. BranchDashboardClient 팀/기간 필터 칩 모바일 터치 타깃", () => {
  it("팀 필터 버튼이 모바일 44px와 데스크톱 원복 규약을 함께 갖는다", () => {
    const source = dashboardClientSource()
    const groupIndex = source.indexOf('role="group" aria-label="팀 필터"')
    expect(groupIndex).toBeGreaterThan(-1)
    const buttonClassIndex = source.indexOf("className=", groupIndex)
    const buttonClassEnd = source.indexOf("`}", buttonClassIndex)
    const buttonClass = source.slice(buttonClassIndex, buttonClassEnd)
    expect(buttonClass).toContain("min-h-11")
    expect(buttonClass).toContain("min-w-11")
    expect(buttonClass).toContain("md:min-h-0")
    expect(buttonClass).toContain("md:min-w-0")
  })

  it("기간 필터 버튼도 모바일 44px 규약을 갖는다", () => {
    const source = dashboardClientSource()
    const groupIndex = source.indexOf('role="group" aria-label="기간 필터"')
    expect(groupIndex).toBeGreaterThan(-1)
    const buttonClassIndex = source.indexOf("className=", groupIndex)
    const buttonClassEnd = source.indexOf("`}", buttonClassIndex)
    const buttonClass = source.slice(buttonClassIndex, buttonClassEnd)
    expect(buttonClass).toContain("min-h-11")
    expect(buttonClass).toContain("min-w-11")
    expect(buttonClass).toContain("md:min-h-0")
    expect(buttonClass).toContain("md:min-w-0")
  })

  it("새로고침과 탭도 모바일에서 최소 44px다", () => {
    const source = dashboardClientSource()
    const refreshStart = source.lastIndexOf("<button", source.indexOf("새로고침"))
    const refreshEnd = source.indexOf("</button>", refreshStart)
    expect(source.slice(refreshStart, refreshEnd)).toContain("min-h-11 min-w-11")

    const tabStart = source.indexOf('role="tab"')
    const tabEnd = source.indexOf(">", source.indexOf("className=", tabStart))
    const tabBlock = source.slice(tabStart, tabEnd)
    expect(tabBlock).toContain("min-h-11 min-w-11")
    expect(tabBlock).toContain("md:min-h-0 md:min-w-0")
  })
})

describe("KR Team Overview 상태·정합성 컨트롤 모바일 터치 타깃", () => {
  it("동기화 버튼과 CRM 링크가 모바일 44px다", () => {
    const source = syncStatusBarSource()
    expect(source.match(/min-h-11 min-w-11/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it("정합성 요약 버튼과 상세 액션이 모바일 44px다", () => {
    const source = integrityStripSource()
    expect(source.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(4)
  })
})

describe("웨이브 7 — U5. PipelineTable 페이지네이션 버튼 모바일 터치 타깃", () => {
  it("이전/다음 페이지 버튼이 44px(모바일) → md:h-7 md:w-7(데스크톱)로 반응형이다", () => {
    const source = pipelineTableSource()
    const prevButtonIndex = source.indexOf('aria-label="이전 페이지"')
    const nextButtonIndex = source.indexOf('aria-label="다음 페이지"')
    expect(prevButtonIndex).toBeGreaterThan(-1)
    expect(nextButtonIndex).toBeGreaterThan(prevButtonIndex)

    const footerStart = source.lastIndexOf("<button", prevButtonIndex) - 400
    const footerEnd = nextButtonIndex + 400
    const footer = source.slice(Math.max(0, footerStart), footerEnd)
    const occurrences = footer.match(/h-11 min-h-11 w-11 min-w-11/g) ?? []
    expect(occurrences.length).toBe(2)
    expect(footer).toContain("md:h-7 md:min-h-0 md:w-7 md:min-w-0")
  })
})

describe("파이프라인 KPI·병목 컨트롤 모바일 터치 타깃", () => {
  it("담당자 검색·정렬·보기 전환이 모바일 44px다", () => {
    const source = branchKpiSource()
    expect(source).toContain("h-11 min-h-11 w-36")
    expect(source.match(/min-h-11 min-w-11/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it("병목 장부 링크와 담당자 링크가 모바일 44px다", () => {
    const source = bottleneckSource()
    expect(source.match(/min-h-11 min-w-11/g)?.length).toBe(2)
  })
})

describe("웨이브 7 — U5. MultiSelect 트리거 모바일 터치 타깃", () => {
  it("트리거 버튼이 h-11 min-h-11(모바일) → md:h-8 md:min-h-0(데스크톱)로 반응형이다", () => {
    const source = multiSelectSource()
    const triggerIndex = source.indexOf('aria-haspopup="listbox"')
    expect(triggerIndex).toBeGreaterThan(-1)
    const classIndex = source.lastIndexOf("className=", triggerIndex)
    const classEnd = source.indexOf('"', classIndex + 'className="'.length)
    const triggerClass = source.slice(classIndex, classEnd)
    expect(triggerClass).toContain("h-11 min-h-11")
    expect(triggerClass).toContain("md:h-8 md:min-h-0")
  })

  it("드롭다운 오프셋이 트리거의 반응형 높이에 맞춰 top-12/md:top-9로 조정됐다", () => {
    const source = multiSelectSource()
    expect(source).toContain("top-12")
    expect(source).toContain("md:top-9")
  })

  it("드롭다운 옵션도 모바일에서 최소 44px다", () => {
    const source = multiSelectSource()
    expect(source.match(/flex min-h-11 w-full/g)?.length).toBe(2)
  })
})
