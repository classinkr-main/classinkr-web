import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { ELLIPSIS, fitLine, fitTitle, textWidth } from "@/lib/og/fit-text"
import { parseFontMetrics } from "@/lib/og/font-metrics"

// lib/og/template.tsx 의 블로그 카드 값과 같은 글꼴·크기
const bold = parseFontMetrics(readFileSync("assets/fonts/pretendard-static/Pretendard-Bold.otf"))
const regular = parseFontMetrics(readFileSync("assets/fonts/pretendard-static/Pretendard-Regular.otf"))
const TITLE_SIZE = 64
const MEASURE = 936
const width = (line: string) => textWidth(line, TITLE_SIZE, bold)
const fit = (title: string) => fitTitle(title, TITLE_SIZE, MEASURE, bold)

describe("parseFontMetrics — advances straight from the OTF cmap·hmtx", () => {
  it("reads the real Pretendard Bold advances (1/1000 em)", () => {
    // 기대값은 fontTools 로 같은 OTF 를 읽은 값(유닛/2048×1000)
    expect(bold.advance("가".codePointAt(0)!)).toBeCloseTo(864.26, 1) // 1770/2048
    expect(bold.advance(" ".codePointAt(0)!)).toBeCloseTo(230.47, 1)
    expect(bold.advance("W".codePointAt(0)!)).toBeCloseTo(999.02, 1)
    // 예전 어림 표가 0.7em 로 잡던 글자들
    expect(bold.advance("—".codePointAt(0)!)).toBeCloseTo(965.82, 1)
    expect(bold.advance("→".codePointAt(0)!)).toBeCloseTo(921.88, 1)
    expect(bold.advance("①".codePointAt(0)!)).toBeCloseTo(894.53, 1)
    expect(bold.advance("⟷".codePointAt(0)!)).toBeCloseTo(1695.31, 1)
    // 글꼴에 없는 글자(한자·이모지)는 undefined — 맞춤 쪽이 1em 로 어림한다
    expect(bold.advance("漢".codePointAt(0)!)).toBeUndefined()
    expect(bold.advance(0x1f600)).toBeUndefined()
  })

  it("reads the regular weight separately (the category line is drawn at 400)", () => {
    expect(regular.advance("W".codePointAt(0)!)).not.toBe(bold.advance("W".codePointAt(0)!))
  })
})

describe("fitTitle — blog share card title lines", () => {
  it("keeps a short title on one line", () => {
    expect(fit("학원 수업 녹화 기준")).toEqual(["학원 수업 녹화 기준"])
  })

  it("splits a two-line title where both lines are about the same width", () => {
    expect(fit("ClassIn EDB 교안으로 수업 준비 시간을 줄이는 법")).toEqual(["ClassIn EDB 교안으로", "수업 준비 시간을 줄이는 법"])
  })

  it("prefers breaking after a comma when the balance is close", () => {
    const [first] = fit("상담·출결·녹화까지, AI 리포트로 학부모 상담을 줄인 학원")
    expect(first.endsWith(",")).toBe(true)
  })

  it("caps a long title at two lines and ends the second on a word with an ellipsis", () => {
    const title = "학원 수업 녹화, 강사 동의부터 보관 기간까지 처음 도입할 때 정해야 할 일곱 가지 운영 기준"
    const lines = fit(title)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith(ELLIPSIS)).toBe(true)
    const kept = lines.join(" ").slice(0, -1)
    expect(title.startsWith(kept)).toBe(true)
    expect(title[kept.length]).toBe(" ")
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(MEASURE)
  })

  it("splits an unbroken run of syllables by character and still fits the measure", () => {
    const lines = fit("학원수업녹화강사동의부터보관기간까지처음도입할때정해야할일곱가지운영기준총정리")
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith(ELLIPSIS)).toBe(true)
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(MEASURE)
  })

  it("measures wide punctuation for real, so dash/arrow/circled-number titles stay inside the line box", () => {
    for (const title of [
      "상담—출결—녹화—복습—리포트—정산—보강—온보딩—교안—평가—과제—시험",
      "준비→수업→녹화→복습→리포트→상담→재등록→추천→소개→등록→안내",
      "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳①②③④⑤⑥⑦⑧⑨⑩⑪⑫",
    ]) {
      const lines = fit(title)
      expect(lines.length).toBeLessThanOrEqual(2)
      for (const line of lines) expect(width(line)).toBeLessThanOrEqual(MEASURE)
    }
  })

  it("never splits an emoji grapheme cluster (ZWJ family, flag) across lines or at the ellipsis", () => {
    const family = "👨‍👩‍👧"
    const flag = "🇰🇷"
    for (const title of [
      `가나다라마바사아자차${family}카타파하가나다라마바`,
      `가나다라마바사아자차카타파하가${flag}나다라마바사아자차카타파하가`,
      `가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라${family}${flag}${family}마바사`,
    ]) {
      const lines = fit(title)
      const joined = lines.join("").replace(ELLIPSIS, "")
      // 남은 글자에 들어간 이모지는 통째다(반쪽 국기·가족 조각이 없다)
      const regionalIndicators = Array.from(joined).filter((ch) => /\p{Regional_Indicator}/u.test(ch)).length
      expect(regionalIndicators % 2).toBe(0)
      for (const line of lines) {
        expect(line.startsWith("‍")).toBe(false)
        expect(line.replace(ELLIPSIS, "").endsWith("‍")).toBe(false)
        expect(/^[\u{1F1E6}-\u{1F1FF}]([^\u{1F1E6}-\u{1F1FF}]|$)/u.test(line)).toBe(false)
      }
      expect(title.replace(/\s/g, "").startsWith(joined)).toBe(true)
    }
  })

  it("drops a trailing comma or middle dot before the ellipsis", () => {
    const lines = fit("가나다라마바사아자차카타파하 가나다라마바사아자차카타파하, 가나다라마바사아자차카타파하")
    expect(lines.at(-1)).not.toMatch(/[,·:]…$/)
  })

  it("returns nothing for an empty title", () => {
    expect(fit("   ")).toEqual([])
  })
})

describe("fitLine — blog share card category", () => {
  it("leaves a short category alone and ellipsizes a long one on a word boundary", () => {
    expect(fitLine("운영 노하우", 28, 720, regular)).toBe("운영 노하우")
    const long = fitLine("학원 운영 노하우 · 상담 · 수업 녹화 · 전자칠판 활용 · 학부모 소통 · 강사 온보딩 · 교안", 28, 720, regular)
    expect(long.endsWith(ELLIPSIS)).toBe(true)
    expect(textWidth(long, 28, regular)).toBeLessThanOrEqual(720)
  })
})
