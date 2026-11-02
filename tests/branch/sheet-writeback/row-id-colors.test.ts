import { describe, expect, it } from "vitest"

import { isBlueText as sheetsIsBlueText, isRedText as sheetsIsRedText } from "@/lib/branch/google-sheets"
import {
  colorForConfidence,
  confidenceForColor,
  isBlueText,
  isRedText,
  parseDraftConfidence,
  weekColorOf,
} from "@/lib/branch/sheet-writeback/colors"
import { generateRowId, isValidRowId, ROW_ID_RE } from "@/lib/branch/sheet-writeback/row-id"

describe("row-id", () => {
  it("r_ + Crockford base32 소문자 12자만 통과한다(i·l·o·u·대문자·길이 오류 거절)", () => {
    expect(isValidRowId("r_0123456789ab")).toBe(true)
    expect(isValidRowId("r_abcdefghjkmn")).toBe(true)
    for (const bad of ["r_0123456789a", "r_0123456789abc", "R_0123456789ab", "r_0123456789AB", "r_i123456789ab", "r_l123456789ab", "r_o123456789ab", "r_u123456789ab", "x_0123456789ab", " r_0123456789ab", 12, null, undefined]) {
      expect(isValidRowId(bad), String(bad)).toBe(false)
    }
  })

  it("만든 ID 는 형식을 지키고, 겹치면 다시 뽑는다", () => {
    const sequences = [new Uint8Array(12).fill(0), new Uint8Array(12).fill(31)]
    let call = 0
    const rand = () => sequences[call++]
    const id = generateRowId(new Set(["r_000000000000"]), rand)
    expect(call).toBe(2)
    expect(id).toBe("r_zzzzzzzzzzzz")
    expect(ROW_ID_RE.test(id)).toBe(true)
  })

  it("기본 난수로 만든 ID 도 형식을 지키고 서로 다르다", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      const id = generateRowId(seen)
      expect(isValidRowId(id)).toBe(true)
      seen.add(id)
    }
    expect(seen.size).toBe(200)
  })

  it("바이트 32~255 도 알파벳 안으로 접힌다(& 31)", () => {
    const id = generateRowId(new Set(), () => Uint8Array.from([32, 63, 64, 255, 200, 100, 50, 0, 1, 2, 3, 4]))
    expect(isValidRowId(id)).toBe(true)
  })
})

describe("colors — google-sheets 판정과 같은 임계", () => {
  const samples: Array<{ red?: number; green?: number; blue?: number } | null> = [null, {}]
  for (const red of [0, 0.3, 0.7, 0.75, 0.92, 1]) {
    for (const green of [0, 0.15, 0.3, 0.31, 0.5]) {
      for (const blue of [0, 0.2, 0.3, 0.31, 0.5, 0.8, 1]) samples.push({ red, green, blue })
    }
  }

  it("isRedText/isBlueText 가 parsers 가 쓰는 google-sheets 판정과 모든 표본에서 같다", () => {
    for (const fg of samples) {
      expect(isRedText(fg), JSON.stringify(fg)).toBe(sheetsIsRedText(fg))
      expect(isBlueText(fg), JSON.stringify(fg)).toBe(sheetsIsBlueText(fg))
    }
  })

  it("weekColorOf: 빨강 r · 파랑 b · 그 밖(갈색·검정·없음) k", () => {
    expect(weekColorOf({ red: 1 })).toBe("r")
    expect(weekColorOf({ red: 0.92, green: 0.26, blue: 0.21 })).toBe("r") // #EB4336
    expect(weekColorOf({ blue: 1 })).toBe("b")
    expect(weekColorOf({ red: 0.07, green: 0.33, blue: 0.8 })).toBe("b") // #1155CC
    expect(weekColorOf({ red: 0.71, green: 0.37, blue: 0.02 })).toBe("k") // A열 갈색
    expect(weekColorOf({})).toBe("k")
    expect(weekColorOf(null)).toBe("k")
  })

  it("쓰는 색 세 가지는 Home·Compass 두 판정을 모두 확실히 통과한다", () => {
    const red = colorForConfidence("confirmed")
    const blue = colorForConfidence("high-confidence")
    const black = colorForConfidence("expected")
    expect(red).toEqual({ red: 1, green: 0, blue: 0 })
    expect(blue).toEqual({ red: 0, green: 0, blue: 1 })
    expect(black).toEqual({ red: 0, green: 0, blue: 0 })
    // Compass isPaid: r>0.7 · g<0.3 · b<0.3
    expect(red.red > 0.7 && red.green < 0.3 && red.blue < 0.3).toBe(true)
    expect(weekColorOf(red)).toBe("r")
    expect(weekColorOf(blue)).toBe("b")
    expect(weekColorOf(black)).toBe("k")
  })

  it("confidence ↔ color 왕복", () => {
    for (const c of ["confirmed", "high-confidence", "expected"] as const) {
      expect(confidenceForColor(weekColorOf(colorForConfidence(c)))).toBe(c)
    }
    expect(parseDraftConfidence("high_confidence")).toBe("high-confidence")
    expect(parseDraftConfidence("format_unavailable")).toBeNull()
    expect(parseDraftConfidence(3)).toBeNull()
  })
})
