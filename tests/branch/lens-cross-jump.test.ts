// 라운드 2 Track C — 레일 행 상세의 렌즈 교차 점프 규약(소스 스캔).
// REV → 보드(선택 행 하이라이트는 selectedRowId 기존 배선), 그 외 렌즈 → REV(고객 검색 적용).
// CRLF 정규화 read 관례(autocrlf 체크아웃에서 여러 줄 패턴 보호).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const read = (relPath: string) =>
  readFileSync(join(process.cwd(), relPath), "utf8").replace(/\r\n/g, "\n")

describe("SalesLedgerWorkbench — 렌즈 교차 점프(레일 행 상세)", () => {
  const source = read("components/admin/branch/SalesLedgerWorkbench.tsx")

  it("REV 렌즈에서는 보드로 점프한다(월 컨텍스트 유지)", () => {
    expect(source).toContain('{lens === "rev" ? (')
    expect(source).toContain('onClick={() => selectLens("board")}')
    expect(source).toContain("보드에서 보기")
  })

  it("보드/DSH 렌즈에서는 REV로 점프하며 고객 검색을 적용한다", () => {
    const jumpBlock = source.slice(source.indexOf("렌즈 교차 점프"))
    expect(jumpBlock).toContain("setQuery(selectedRow.customer)")
    expect(jumpBlock).toContain('selectLens("rev")')
    expect(jumpBlock).toContain("REV 매트릭스에서 보기")
    // 고객 점프는 담당자/지역 필터를 풀어 검색 결과가 그 고객으로 좁혀지게 한다.
    expect(jumpBlock).toContain("setManagerFilter(new Set())")
    expect(jumpBlock).toContain("setRegionFilter(new Set())")
  })

  it("보드 카드 하이라이트 배선(selectedRowId)이 유지된다", () => {
    expect(source).toContain("selectedRowId={selectedRow?.id ?? null}")
  })
})
