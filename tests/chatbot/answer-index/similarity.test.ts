import { describe, expect, it } from "vitest"

import { boundedLevenshtein, normalizeForOverlap, OverlapIndex } from "@/scripts/answer-index/lib/similarity"

// §6 V-7 겹침 기준: 정규화 동일·편집거리 2 이하·2-gram 자카드 0.8 이상·(사전 형태) 8자 이상 연속 일치.

describe("겹침 검사", () => {
  const index = new OverlapIndex(["클래스인 대표는 누구인가요?", "학생 화면 공유는 어디서 끄나요?", "줌 연동 돼요?"], { substrings: true })

  it("정규화하면 같은 글", () => {
    expect(normalizeForOverlap("클래스인 대표는, 누구인가요?!")).toBe("클래스인대표는누구인가요")
    expect(index.find("클래스인대표는 누구인가요")).toMatchObject({ index: 0, reason: "same" })
  })

  it("편집거리 2 이하(8글자 이상일 때만)", () => {
    expect(boundedLevenshtein("학생화면공유는어디서꺼요", "학생화면공유는어디서끄나요")).toBe(2)
    expect(index.find("학생 화면 공유는 어디서 꺼요")).toMatchObject({ index: 1 })
    // 짧은 글은 두 글자만 바꿔도 뜻이 달라지므로 편집거리로 묶지 않는다.
    expect(index.find("줌 녹화 돼요?")).toBeNull()
  })

  it("8자 이상 연속 일치는 사전 형태에만 쓴다", () => {
    expect(index.find("공유는어디서끄", { substring: false })).toBeNull()
    expect(index.find("화면 공유는 어디서", { substring: true })).toMatchObject({ index: 1, reason: "substring" })
  })

  it("관계없는 글은 걸리지 않는다", () => {
    expect(index.find("녹화본은 어디서 내려받나요")).toBeNull()
  })
})
