import ExcelJSForFixture from "exceljs"
import { describe, expect, it } from "vitest"

import { workbookToLedger } from "@/lib/branch/parsers/xlsx-grid"

// workbookToLedger는 exceljs를 함수 내부에서 동적 import(`await import("exceljs")`)한다.
// 이 테스트는 그 동적 import가 vitest 환경에서 실제로 문제없이 로드·동작하고, 결과 grid가
// 이전 top-level import 구현과 동일한 값을 내는지를 확인한다.
async function buildFixtureBuffer(): Promise<Buffer> {
  const wb = new ExcelJSForFixture.Workbook()
  const ws = wb.addWorksheet("Sheet1")
  ws.getCell("A1").value = "이름"
  ws.getCell("B1").value = "수량"
  ws.getCell("A2").value = "노트북"
  ws.getCell("B2").value = 3
  ws.getCell("A3").value = null
  ws.getCell("B3").value = { richText: [{ text: "합" }, { text: "계" }] }
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer
}

describe("workbookToLedger (동적 import된 exceljs)", () => {
  it("업로드된 xlsx 버퍼를 시트명 → 0-indexed grid map으로 변환한다", async () => {
    const buffer = await buildFixtureBuffer()

    const result = await workbookToLedger(buffer)

    expect(Object.keys(result.sheets)).toEqual(["Sheet1"])
    const grid = result.sheets.Sheet1
    expect(grid[0]).toEqual(["이름", "수량"])
    expect(grid[1]).toEqual(["노트북", 3])
    // null 셀 + richText 조인("합"+"계") 둘 다 정상 평탄화되어야 한다.
    expect(grid[2]).toEqual([null, "합계"])
  })

  it("같은 프로세스에서 두 번 호출해도(동적 import 캐시) 동일하게 동작한다", async () => {
    const buffer = await buildFixtureBuffer()

    const first = await workbookToLedger(buffer)
    const second = await workbookToLedger(buffer)

    expect(second).toEqual(first)
  })
})
