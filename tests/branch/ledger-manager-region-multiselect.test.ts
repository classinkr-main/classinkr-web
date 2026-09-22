import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import {
  parseMultiFilterParam,
  serializeMultiFilterParam,
} from "@/components/admin/branch/SalesLedgerWorkbench"
import { matchesRevRowFilters, type RevRowFilters } from "@/components/admin/branch/ledger/pending-draft-rows"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

// 회귀 방지(품질 웨이브 7, 항목 3): 장부 담당/지역 필터가 단일 select에서 MultiSelect(Set)로
// 바뀌면서 URL 직렬화(mgr/region)가 콤마 구분 다중값을 지원해야 하되, 기존 단일값 링크(장부
// 자체가 예전에 만든 북마크 · PipelineTable/BranchPipelineKanban/ActivityBottleneckSection 등
// 다른 화면이 보내는 크로스링크는 항상 "첫 값 규약"으로 단일 mgr 하나만 싣는다)도 그대로
// 동작해야 한다. 이 스위트는 그 파싱/직렬화 순수 함수를 직접 구동하고, 필터 로직이 실제로
// Set 포함 검사로 동작하는지 추출된 술어(matchesRevRowFilters)를 직접 구동해 확인한다.

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
  // 입력 속도 라운드 P1-4에서 필터 술어가 matchesRevRowFilters(ledger/pending-draft-rows.ts)로 추출됐다
  // (장부 행과 적용 대기 섹션이 같은 술어를 공유). 옛 소스 리터럴 스캔 대신 그 함수를 직접 구동해
  // "Set 포함 검사" 의미를 동작으로 고정하고, revBaseFilteredRows가 그 함수를 쓰는지만 소스로 본다.
  const baseFilters: RevRowFilters = {
    managerFilter: new Set<string>(),
    regionFilter: new Set<string>(),
    productFilter: "all",
    revStatusFilter: "ALL",
    revDealTypeFilter: "ALL",
    revOriginFilter: "all",
  }
  function row(overrides: Partial<LedgerRevenueRow>): LedgerRevenueRow {
    return { id: "r", customer: "테스트 학원", manager: null, team: "BD", region: null, revenue: 0, ledgerOrigin: "sheet", ...overrides }
  }

  it("담당자 필터는 Set 포함 검사다 — 빈 Set이면 전부 통과, 값이 있으면 포함된 담당자만(담당자 없음은 탈락)", () => {
    const multi = { ...baseFilters, managerFilter: new Set(["김지사", "박지사"]) }
    expect(matchesRevRowFilters(row({ manager: "이지사" }), baseFilters, [])).toBe(true)
    expect(matchesRevRowFilters(row({ manager: "김지사" }), multi, [])).toBe(true)
    expect(matchesRevRowFilters(row({ manager: "박지사" }), multi, [])).toBe(true)
    expect(matchesRevRowFilters(row({ manager: "이지사" }), multi, [])).toBe(false)
    expect(matchesRevRowFilters(row({ manager: null }), multi, [])).toBe(false)
  })

  it("지역 필터도 같은 Set 포함 검사다", () => {
    const multi = { ...baseFilters, regionFilter: new Set(["서울", "부산"]) }
    expect(matchesRevRowFilters(row({ region: "대구" }), baseFilters, [])).toBe(true)
    expect(matchesRevRowFilters(row({ region: "부산" }), multi, [])).toBe(true)
    expect(matchesRevRowFilters(row({ region: "대구" }), multi, [])).toBe(false)
    expect(matchesRevRowFilters(row({ region: null }), multi, [])).toBe(false)
  })

  it("revBaseFilteredRows는 인라인 사본 없이 matchesRevRowFilters를 소비한다(드리프트 차단)", () => {
    const source = workbenchSource()
    expect(source).toContain("return rows.filter((row) => matchesRevRowFilters(row, filters, tokens))")
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
