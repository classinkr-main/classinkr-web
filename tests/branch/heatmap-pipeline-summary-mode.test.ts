import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// 웨이브 7 — F3(히트맵 탭 이중 렌더 해소). 히트맵 탭의 PipelineTable(과거 pageSize=10 전체
// 기능 테이블)을 검색/필터 UI 없는 요약 모드(상위 10 매출 + "전체 파이프라인에서 보기 →")로
// 축소했다. summaryMode prop이 툴바(검색·팀/담당/지역 MultiSelect·건수·초기화)와 페이지네이션
// 푸터를 숨기고, 행 클릭(onRowClick)은 그대로 유지한다. 파이프라인 탭 쪽(테이블/칸반)은 불변.

const pipelineTablePath = join(process.cwd(), "components/admin/branch/sections/PipelineTable.tsx")
const dashboardClientPath = join(process.cwd(), "components/admin/branch/BranchDashboardClient.tsx")

function pipelineTableSource() {
  return readFileSync(pipelineTablePath, "utf8")
}
function dashboardClientSource() {
  return readFileSync(dashboardClientPath, "utf8")
}

describe("웨이브 7 — F3. PipelineTable summaryMode", () => {
  it("summaryMode·onViewFullPipeline prop을 갖는다", () => {
    const source = pipelineTableSource()
    expect(source).toContain("summaryMode?: boolean")
    expect(source).toContain("onViewFullPipeline?: () => void")
  })

  it("summaryMode일 때 검색/필터 툴바(검색창 + 팀·담당·지역 MultiSelect)를 숨긴다", () => {
    const source = pipelineTableSource()
    expect(source).toContain("{!summaryMode && (")
    // 필터 행에 검색 input과 3개 MultiSelect(팀/담당/지역)가 모두 그 조건부 블록 안에 있어야 한다.
    const filterBlockStart = source.indexOf('<div className="mb-2 flex flex-wrap items-center gap-2">')
    expect(filterBlockStart).toBeGreaterThan(-1)
    const filterBlockEnd = source.indexOf('<div className="overflow-x-auto', filterBlockStart)
    const filterBlock = source.slice(filterBlockStart, filterBlockEnd)
    expect(filterBlock).toContain('placeholder="고객사, 매니저, 지역 검색"')
    expect((filterBlock.match(/<MultiSelect/g) ?? []).length).toBe(3)
  })

  it("summaryMode일 때 상위 10건만 고정으로 보여준다(페이지네이션 상태와 무관)", () => {
    const source = pipelineTableSource()
    expect(source).toContain("const displayRows = summaryMode ? filteredRows.slice(0, 10) : pageRows")
    // 테이블 본문이 pageRows가 아니라 displayRows를 렌더해야 summaryMode 슬라이스가 실제로 반영된다.
    expect(source).not.toContain("{pageRows.map((r) =>")
    expect(source).toContain("{displayRows.map((r) =>")
  })

  it("summaryMode일 때 페이지네이션 대신 '전체 파이프라인에서 보기 →' 링크를 렌더한다", () => {
    const source = pipelineTableSource()
    // JSDoc 주석에도 같은 문구가 한 번 더 등장하므로(prop 설명) 실제 JSX(마지막 등장)를 본다.
    const idx = source.lastIndexOf("전체 파이프라인에서 보기 →")
    expect(idx).toBeGreaterThan(-1)
    // 그 버튼이 onViewFullPipeline을 호출해야 한다(같은 페이지 탭 전환 — Link href 아님).
    const buttonStart = source.lastIndexOf("<button", idx)
    expect(buttonStart).toBeGreaterThan(-1)
    const buttonBlock = source.slice(buttonStart, idx)
    expect(buttonBlock).toContain("onClick={onViewFullPipeline}")
  })

  it("summaryMode·hideHeader와 무관하게 행 클릭(onRowClick)은 그대로 살아있다", () => {
    const source = pipelineTableSource()
    // onRowClick은 summaryMode 조건부 블록 밖(항상 렌더되는 tbody)에서 쓰인다.
    expect(source).toContain("onClick={onRowClick ? () => onRowClick(r) : undefined}")
  })

  it("요약 모드 제목은 '전체 목록'이 아니라 '상위 10 매출'임을 명시한다", () => {
    const source = pipelineTableSource()
    expect(source).toContain('const headerLabel = summaryMode ? "REV 상위 10 매출" : "REV 고객별 매출"')
  })
})

describe("웨이브 7 — F3. BranchDashboardClient 탭별 배선", () => {
  it("히트맵 탭은 summaryMode + onViewFullPipeline(파이프라인 탭 전환)을 넘긴다", () => {
    const source = dashboardClientSource()
    const heatmapBlockStart = source.indexOf('activeTab === "heatmap"')
    expect(heatmapBlockStart).toBeGreaterThan(-1)
    const heatmapBlockEnd = source.indexOf('activeTab === "ai"', heatmapBlockStart)
    const heatmapBlock = source.slice(heatmapBlockStart, heatmapBlockEnd)
    expect(heatmapBlock).toContain("summaryMode")
    expect(heatmapBlock).toContain('onViewFullPipeline={() => selectTab("pipeline")}')
    // 요약 모드는 항상 상위 10건 고정이라 pageSize prop을 더 이상 넘기지 않는다.
    expect(heatmapBlock).not.toContain("pageSize={10}")
  })

  it("파이프라인 탭의 PipelineTable 호출은 이번 변경으로 건드리지 않는다(불변)", () => {
    const source = dashboardClientSource()
    expect(source).toContain('<PipelineTable key={`pipeline-rev-${team}`} team={team} period={period} selectedMonth={selectedMonth} refreshKey={refreshKey} onRowClick={openDealLog} hideHeader')
    const pipelineBlockStart = source.indexOf('activeTab === "pipeline"')
    const pipelineBlockEnd = source.indexOf('activeTab === "heatmap"')
    const pipelineBlock = source.slice(pipelineBlockStart, pipelineBlockEnd)
    expect(pipelineBlock).not.toContain("summaryMode")
  })
})
