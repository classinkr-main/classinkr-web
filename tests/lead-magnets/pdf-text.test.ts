// lib/lead-magnet-pdf/text.ts — 글꼴 없이 도는 줄바꿈·정리 헬퍼.
import { describe, expect, it } from "vitest"

import {
  categoryLabel,
  cleanText,
  splitWorksheetHint,
  tierLabel,
  truncateToWidth,
  wrapText,
  type MeasureText,
} from "@/lib/lead-magnet-pdf/text"

// 실제 글꼴 비율에 가깝게: 한글 1.0, 라틴·숫자 0.55, 공백 0.28 (단위 = 1pt 글자).
const measure: MeasureText = (text) => {
  let width = 0
  for (const char of text) {
    if (char === " ") width += 0.28
    else if (/[가-힣]/.test(char)) width += 1
    else width += 0.55
  }
  return width
}

const withoutSpaces = (value: string) => value.replace(/\s+/g, "")

describe("cleanText", () => {
  it("null·nbsp·연속 공백을 정리한다", () => {
    expect(cleanText(null)).toBe("")
    expect(cleanText(undefined)).toBe("")
    expect(cleanText("  가  나 \n\t다  ")).toBe("가 나 다")
    expect(cleanText(12)).toBe("12")
  })
})

describe("wrapText", () => {
  const korean =
    "수업 녹화는 대부분의 학원이 이미 하고 있습니다. 문제는 그다음입니다. 저장 확인, 링크 전달, 결석 안내, 복습 독려, 학부모 안내를 누군가 손으로 이어야 하고 https://classin.co.kr/resources/classroom-recording-replay-setup-guide?utm_source=pdf 같은 긴 주소도 있습니다."

  it.each([6, 9.5, 14, 30])("글자를 하나도 잃지 않는다(폭 %s)", (maxWidth) => {
    const lines = wrapText(korean, measure, maxWidth)
    expect(withoutSpaces(lines.join(""))).toBe(withoutSpaces(korean))
  })

  it.each([6, 9.5, 14, 30])("어떤 줄도 폭을 넘지 않는다(폭 %s)", (maxWidth) => {
    const lines = wrapText(korean, measure, maxWidth)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(maxWidth)
  })

  it("줄 끝·줄 머리에 공백을 남기지 않는다", () => {
    for (const line of wrapText(korean, measure, 12)) {
      expect(line).toBe(line.trim())
      expect(line).not.toBe("")
    }
  })

  it("어절 단위로 끊는다 — 한 줄에 들어가는 어절은 쪼개지 않는다", () => {
    expect(wrapText("가나다 라마바 사아자", measure, 5)).toEqual(["가나다", "라마바", "사아자"])
  })

  it("한 줄보다 긴 어절은 글자 단위로 자른다", () => {
    const lines = wrapText("가나다라마바사아자차", measure, 4)
    expect(lines).toEqual(["가나다라", "마바사아", "자차"])
  })

  it("빈 값은 빈 배열", () => {
    expect(wrapText("", measure, 10)).toEqual([])
    expect(wrapText("   ", measure, 10)).toEqual([])
    expect(wrapText(null, measure, 10)).toEqual([])
  })

  it("한 글자도 안 들어가는 폭에서도 글자를 버리지 않고 끝난다", () => {
    const lines = wrapText("가나 다", measure, 0.5)
    expect(lines.join("")).toBe("가나다")
  })
})

describe("truncateToWidth", () => {
  it("폭 안이면 그대로, 넘치면 말줄임", () => {
    expect(truncateToWidth("가나다", measure, 10)).toBe("가나다")
    const cut = truncateToWidth("가나다라마바사", measure, 4)
    expect(cut.endsWith("…")).toBe(true)
    expect(measure(cut)).toBeLessThanOrEqual(4)
  })
})

describe("라벨·작업표 헬퍼", () => {
  it("분류·단계 라벨", () => {
    expect(categoryLabel("hardware")).toBe("하드웨어")
    expect(categoryLabel("unknown")).toBe("unknown")
    expect(tierLabel("advanced")).toBe("심화")
    expect(tierLabel("basic")).toBe("기본")
  })

  it("hint 가 열 수와 맞을 때만 칸별 예시로 나눈다", () => {
    expect(splitWorksheetHint("기본 ON · 필요 시 · 링크 시청자 있을 때", 3)).toEqual([
      "기본 ON",
      "필요 시",
      "링크 시청자 있을 때",
    ])
    expect(splitWorksheetHint("ON · 검토", 3)).toBeNull()
    expect(splitWorksheetHint("", 3)).toBeNull()
    expect(splitWorksheetHint("강사·운영팀 · 담임", 2)).toEqual(["강사·운영팀", "담임"])
  })
})
