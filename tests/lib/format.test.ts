// 한국어 표기 유틸(lib/format.ts) — system.md §5-6 표의 각 행 + 자정 경계 + UTC 시간.
import { describe, expect, it } from "vitest"

import { formatKrw } from "@/lib/billing/plans"
import { formatDate, formatKRW, formatKRWCompact, formatNumber, formatPhone, formatTime } from "@/lib/format"

describe("lib/format", () => {
  it("formatNumber: 천 단위 쉼표, 음수는 U+2212", () => {
    expect(formatNumber(1200)).toBe("1,200")
    expect(formatNumber(-34)).toBe("−34")
  })

  it("formatKRW: 붙여 쓴다", () => {
    expect(formatKRW(1200000)).toBe("1,200,000원")
  })

  it("formatKRWCompact: 만·억 단위, 띄어 쓴다", () => {
    expect(formatKRWCompact(12000000)).toBe("1,200만 원")
    expect(formatKRWCompact(120000000)).toBe("1억 2,000만 원")
    expect(formatKRWCompact(9000)).toBe("9,000원")
  })

  it("formatDate: meta·prose (서울 기준)", () => {
    expect(formatDate("2026-10-26T03:00:00Z", "meta")).toBe("2026.10.26")
    expect(formatDate("2026-10-26T03:00:00Z", "prose")).toBe("10월 26일(월)")
  })

  it("formatDate: UTC 15시 = 서울 자정, 다음 날로 넘어간다", () => {
    expect(formatDate(new Date("2026-10-25T15:00:00Z"))).toBe("2026.10.26")
  })

  it("formatTime: UTC 05시 = 서울 14:00", () => {
    expect(formatTime("2026-10-26T05:00:00Z")).toBe("14:00")
  })

  it("formatPhone: 02 지역번호·휴대폰·대표번호 8자리", () => {
    expect(formatPhone("0212345678")).toBe("02-1234-5678")
    expect(formatPhone("01012345678")).toBe("010-1234-5678")
    expect(formatPhone("15880000")).toBe("1588-0000")
  })

  it("billing/plans formatKrw 재수출: 기존 toLocaleString 출력과 같다(가격은 음수 없음)", () => {
    for (const n of [0, 1, 999, 1000, 12345, 1200000, 990000000, 1234.5]) {
      expect(formatKrw(n)).toBe(`${n.toLocaleString("ko-KR")}원`)
    }
  })
})
