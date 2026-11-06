import { describe, expect, it } from "vitest"

import { ELLIPSIS, fitLine, fitTitle, textWidth } from "@/lib/og/fit-text"

// lib/og/template.tsx 의 블로그 카드 값
const TITLE_SIZE = 64
const MEASURE = 936
const width = (line: string) => textWidth(line, TITLE_SIZE)

describe("fitTitle — blog share card title lines", () => {
  it("keeps a short title on one line", () => {
    expect(fitTitle("학원 수업 녹화 기준", TITLE_SIZE, MEASURE)).toEqual(["학원 수업 녹화 기준"])
  })

  it("splits a two-line title where both lines are about the same width", () => {
    expect(fitTitle("ClassIn EDB 교안으로 수업 준비 시간을 줄이는 법", TITLE_SIZE, MEASURE)).toEqual([
      "ClassIn EDB 교안으로",
      "수업 준비 시간을 줄이는 법",
    ])
  })

  it("prefers breaking after a comma when the balance is close", () => {
    const [first] = fitTitle("상담·출결·녹화까지, AI 리포트로 학부모 상담을 줄인 학원", TITLE_SIZE, MEASURE)
    expect(first.endsWith(",")).toBe(true)
  })

  it("caps a long title at two lines and ends the second on a word with an ellipsis", () => {
    const title = "학원 수업 녹화, 강사 동의부터 보관 기간까지 처음 도입할 때 정해야 할 일곱 가지 운영 기준"
    const lines = fitTitle(title, TITLE_SIZE, MEASURE)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith(ELLIPSIS)).toBe(true)
    // 말줄임 앞은 원문의 낱말 경계다(낱말 중간에서 자르지 않는다)
    const kept = lines.join(" ").slice(0, -1)
    expect(title.startsWith(kept)).toBe(true)
    expect(title[kept.length]).toBe(" ")
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(MEASURE)
  })

  it("splits an unbroken run of syllables by character and still fits the measure", () => {
    const lines = fitTitle("학원수업녹화강사동의부터보관기간까지처음도입할때정해야할일곱가지운영기준총정리", TITLE_SIZE, MEASURE)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith(ELLIPSIS)).toBe(true)
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(MEASURE)
  })

  it("drops a trailing comma or middle dot before the ellipsis", () => {
    const lines = fitTitle("가나다라마바사아자차카타파하 가나다라마바사아자차카타파하, 가나다라마바사아자차카타파하", TITLE_SIZE, MEASURE)
    expect(lines.at(-1)).not.toMatch(/[,·:]…$/)
  })

  it("returns nothing for an empty title", () => {
    expect(fitTitle("   ", TITLE_SIZE, MEASURE)).toEqual([])
  })
})

describe("fitLine — blog share card category", () => {
  it("leaves a short category alone and ellipsizes a long one on a word boundary", () => {
    expect(fitLine("운영 노하우", 28, 720)).toBe("운영 노하우")
    const long = fitLine("학원 운영 노하우 · 상담 · 수업 녹화 · 전자칠판 활용 · 학부모 소통 · 강사 온보딩 · 교안", 28, 720)
    expect(long.endsWith(ELLIPSIS)).toBe(true)
    expect(textWidth(long, 28)).toBeLessThanOrEqual(720)
  })
})
