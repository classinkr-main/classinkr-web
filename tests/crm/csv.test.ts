import { describe, expect, it } from "vitest"

import { buildCsv, CSV_BOM, csvFileName, escapeCsvCell } from "@/lib/crm/csv"

describe("escapeCsvCell", () => {
  it("비어 있는 값은 빈 칸", () => {
    expect(escapeCsvCell(null)).toBe("")
    expect(escapeCsvCell(undefined)).toBe("")
  })

  it("숫자는 그대로, 무한대·NaN 은 빈 칸", () => {
    expect(escapeCsvCell(-1200)).toBe("-1200")
    expect(escapeCsvCell(Number.NaN)).toBe("")
  })

  it("수식으로 실행될 수 있는 문자열은 작은따옴표로 고정한다", () => {
    expect(escapeCsvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"")
    expect(escapeCsvCell("+82 10")).toBe("'+82 10")
    expect(escapeCsvCell("-3")).toBe("'-3")
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)")
  })

  it("쉼표·따옴표·줄바꿈은 따옴표로 감싼다", () => {
    expect(escapeCsvCell("서울, 강남")).toBe("\"서울, 강남\"")
    expect(escapeCsvCell("a\"b")).toBe("\"a\"\"b\"")
    expect(escapeCsvCell("줄\n바꿈")).toBe("\"줄\n바꿈\"")
  })
})

describe("buildCsv", () => {
  it("BOM + 헤더 + 행, CRLF 로 잇는다", () => {
    const csv = buildCsv(
      [{ name: "한빛수학", amount: 120 }],
      [
        { header: "이름", value: (row) => row.name },
        { header: "금액(₩)", value: (row) => row.amount },
      ]
    )
    expect(csv.startsWith(CSV_BOM)).toBe(true)
    expect(csv.slice(CSV_BOM.length)).toBe("이름,금액(₩)\r\n한빛수학,120")
  })
})

describe("csvFileName", () => {
  it("KST 날짜를 붙이고 경로 문자를 걸러 낸다", () => {
    const utcLateNight = new Date("2026-09-24T16:30:00Z") // KST 09-25 01:30
    expect(csvFileName("고객/목록", utcLateNight)).toBe("고객-목록-2026-09-25.csv")
    expect(csvFileName("///", utcLateNight)).toBe("export-2026-09-25.csv")
  })
})
