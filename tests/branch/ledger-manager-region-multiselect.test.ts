import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import {
  parseMultiFilterParam,
  serializeMultiFilterParam,
} from "@/components/admin/branch/SalesLedgerWorkbench"

// 회귀 방지(품질 웨이브 7, 항목 3): 장부 담당/지역 필터가 단일 select에서 MultiSelect(Set)로
// 바뀌면서 URL 직렬화(mgr/region)가 콤마 구분 다중값을 지원해야 하되, 기존 단일값 링크(장부
// 자체가 예전에 만든 북마크 · PipelineTable/BranchPipelineKanban/ActivityBottleneckSection 등
// 다른 화면이 보내는 크로스링크는 항상 "첫 값 규약"으로 단일 mgr 하나만 싣는다)도 그대로
// 동작해야 한다. 이 스위트는 그 파싱/직렬화 순수 함수를 직접 구동하고, 필터 로직이 실제로
// Set 포함 검사로 바뀌었는지 소스 스캔으로 확인한다.

const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

function workbenchSource() {
  return readFileSync(workbenchPath, "utf8")
}

describe("parseMultiFilterParam — URL → Set 파싱", () => {
  it("값이 없으면(null/빈 문자열) 빈 Set이다(= 전체)", () => {
    expect(parseMultiFilterParam(null)).toEqual(new Set())
    expect(parseMultiFilterParam("")).toEqual(new Set())
  })

  it("단일 값(크로스링크 첫 값 규약 — PipelineTable 등이 보내는 형태)은 원소 1개짜리 Set이다", () => {
    expect(parseMultiFilterParam("김지사")).toEqual(new Set(["김지사"]))
  })

  it("콤마 구분 다중값(장부 자체가 직렬화한 URL)을 여러 원소로 분리한다", () => {
    expect(parseMultiFilterParam("김지사,이지사")).toEqual(new Set(["김지사", "이지사"]))
  })

  it("공백과 빈 토큰(연속 콤마)을 정리한다", () => {
    expect(parseMultiFilterParam(" 김지사 , 이지사 ,, ")).toEqual(new Set(["김지사", "이지사"]))
  })
})

describe("serializeMultiFilterParam — Set → URL 직렬화", () => {
  it("빈 Set은 null(파라미터 생략 = 전체)이다", () => {
    expect(serializeMultiFilterParam(new Set())).toBeNull()
  })

  it("원소 1개는 콤마 없는 단일값으로 직렬화된다(하위 호환 — 옛 단일값 링크와 동일한 형태)", () => {
    expect(serializeMultiFilterParam(new Set(["김지사"]))).toBe("김지사")
  })

  it("여러 값은 정렬된 콤마 목록으로 직렬화된다(결정적 출력)", () => {
    expect(serializeMultiFilterParam(new Set(["이지사", "김지사"]))).toBe("김지사,이지사")
  })

  it("직렬화 → 파싱 왕복이 원래 Set을 복원한다", () => {
    const original = new Set(["박지사", "김지사", "이지사"])
    const serialized = serializeMultiFilterParam(original)
    expect(parseMultiFilterParam(serialized)).toEqual(original)
  })
})

describe("장부 필터 로직 — Set 포함 검사로 전환(소스 스캔, 품질 웨이브 7 항목 3)", () => {
  it("revBaseFilteredRows가 담당자/지역 필터를 managerFilter.has/regionFilter.has로 판정한다", () => {
    const source = workbenchSource()
    expect(source).toContain("managerFilter.size === 0 || (row.manager != null && managerFilter.has(row.manager))")
    expect(source).toContain("regionFilter.size === 0 || (row.region != null && regionFilter.has(row.region))")
  })

  it("장부 필터 UI가 <select> 대신 MultiSelect를 담당/지역에 각각 소비한다", () => {
    const source = workbenchSource()
    const importIndex = source.indexOf('import MultiSelect from "./MultiSelect"')
    expect(importIndex).toBeGreaterThan(-1)
    expect(source).toContain('selected={managerFilter}')
    expect(source).toContain('selected={regionFilter}')
    expect(source).toContain("onChange={setManagerFilter}")
    expect(source).toContain("onChange={setRegionFilter}")
  })

  it("KPI 보기 크로스링크(pipelineHref)는 BranchDashboardClient가 단일 select라 첫 값만 동봉한다", () => {
    const source = workbenchSource()
    const fnStart = source.indexOf("const pipelineHref = useMemo")
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = source.indexOf("}, [team, period, selectedMonth, query, managerFilter])", fnStart)
    expect(fnEnd).toBeGreaterThan(fnStart)
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toContain("const [firstManager] = managerFilter")
    expect(fnBody).toContain("if (firstManager) params.set(\"mgr\", firstManager)")
  })

  it("URL 파싱 effect는 mgr/region을 parseMultiFilterParam으로 Set에 채운다(반응형 절대 계약 — 부재 시 기본값 리셋)", () => {
    const source = workbenchSource()
    expect(source).toContain('const nextManagerFilter = parseMultiFilterParam(params.get("mgr"))')
    expect(source).toContain("setManagerFilter((current) => replaceEquivalentSet(current, nextManagerFilter))")
    expect(source).toContain('const nextRegionFilter = parseMultiFilterParam(params.get("region"))')
    expect(source).toContain("setRegionFilter((current) => replaceEquivalentSet(current, nextRegionFilter))")
  })

  it("URL 직렬화 effect는 serializeMultiFilterParam으로 mgr/region을 다시 쓴다", () => {
    const source = workbenchSource()
    expect(source).toContain("const mgrParam = serializeMultiFilterParam(managerFilter)")
    expect(source).toContain("const regionParam = serializeMultiFilterParam(regionFilter)")
  })
})
