// 라운드 5 B1~B3 — CSV·TSV 조립 공용 모듈(lib/export/delimited.ts).
import { describe, expect, it } from "vitest"

import { escapeCsvCell, escapeTsvCell, fileDateStamp, safeFileName, toCsv, toTsv } from "@/lib/export/delimited"

describe("toCsv", () => {
  it("쉼표·따옴표·줄바꿈이 든 칸만 따옴표로 감싸고 따옴표는 두 번 쓴다, 줄은 CRLF", () => {
    expect(
      toCsv([
        ["고객", "메모", "금액"],
        ["A학원, 강남", '말하길 "좋다"', 1234567],
        ["B학원", "줄1\n줄2", 0],
      ]),
    ).toBe('고객,메모,금액\r\n"A학원, 강남","말하길 ""좋다""",1234567\r\nB학원,"줄1\n줄2",0')
  })

  it("null·undefined·NaN은 빈 칸, 불리언은 Y/빈 칸", () => {
    expect(toCsv([[null, undefined, Number.NaN, true, false]])).toBe(",,,Y,")
  })
})

describe("수식 주입 방지", () => {
  it("=·+·@로 시작하는 문자열은 작은따옴표로 무력화한다", () => {
    expect(escapeCsvCell("=SUM(A1:A3)")).toBe("'=SUM(A1:A3)")
    expect(escapeCsvCell("+82 10")).toBe("'+82 10")
    expect(escapeCsvCell("@cmd")).toBe("'@cmd")
  })

  it("'-' 뒤가 숫자면 그대로(음수 문자열), 아니면 무력화", () => {
    expect(escapeCsvCell("-1200")).toBe("-1200")
    expect(escapeCsvCell("-1+1")).toBe("'-1+1")
    expect(escapeCsvCell("- 메모")).toBe("'- 메모")
  })

  it("숫자 타입 음수는 숫자 그대로", () => {
    expect(escapeCsvCell(-500)).toBe("-500")
  })
})

describe("toTsv", () => {
  it("칸 안의 탭·줄바꿈을 공백으로 바꿔 칸이 밀리지 않게 한다", () => {
    expect(toTsv([["a\tb", "c\nd", 3]])).toBe("a b\tc d\t3")
    expect(escapeTsvCell("=A1")).toBe("'=A1")
  })
})

describe("파일 이름", () => {
  it("쓸 수 없는 문자를 걸러 내고 한글은 둔다", () => {
    expect(safeFileName("매출장부 REV/2026:9")).toBe("매출장부_REV_2026_9")
    expect(safeFileName("  ")).toBe("export")
  })

  it("YYYYMMDD", () => {
    expect(fileDateStamp(new Date(2026, 8, 3))).toBe("20260903")
  })
})
