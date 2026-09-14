import { describe, expect, it } from "vitest"

import { parseQuickTask } from "@/lib/crm/task-quick-parse"

// 2026-09-14(월)을 고정 오늘로 둔다 — 요일·상대 날짜 계산을 결정적으로 검증하기 위함.
const TODAY = "2026-09-14"
const MEMBERS = ["신희성", "진소망"]

const parse = (raw: string) => parseQuickTask(raw, { memberNames: MEMBERS, today: TODAY })

describe("parseQuickTask — Compass 상단 주석 예시 3개", () => {
  it("담당자 + '내일까지' 마감 + 제목 (예시 1)", () => {
    const r = parse("내일까지 신희성 광고 소재 정리")
    expect(r.title).toBe("광고 소재 정리")
    expect(r.ownerNames).toEqual(["신희성"])
    expect(r.due).toBe("2026-09-15")
    expect(r.start).toBeNull()
    expect(r.taskType).toBeNull()
  })

  it("기간(8/5~8/9) + 제목 (예시 2)", () => {
    const r = parse("8/5~8/9 랜딩 개편")
    expect(r.start).toBe("2026-08-05")
    expect(r.due).toBe("2026-08-09")
    expect(r.title).toBe("랜딩 개편")
    expect(r.ownerNames).toEqual([])
  })

  it("@짧은이름 + 다음주 요일 + 제목 + 유형 키워드 (예시 3)", () => {
    const r = parse("@소망 다음주 월요일 견적서")
    expect(r.ownerNames).toEqual(["진소망"])
    expect(r.due).toBe("2026-09-21")
    expect(r.title).toBe("견적서")
    expect(r.taskType).toBe("quote")
  })
})

describe("parseQuickTask — 말로 쓴 날짜", () => {
  it("오늘", () => {
    const r = parse("오늘 미팅 준비")
    expect(r.due).toBe(TODAY)
    expect(r.title).toBe("미팅 준비")
  })

  it("내일", () => {
    const r = parse("내일 통화")
    expect(r.due).toBe("2026-09-15")
    expect(r.title).toBe("통화")
  })

  it("모레", () => {
    const r = parse("모레 방문 예정")
    expect(r.due).toBe("2026-09-16")
    expect(r.title).toBe("방문 예정")
  })

  it("다음주 월요일", () => {
    const r = parse("다음주 월요일 계약서 전달")
    expect(r.due).toBe("2026-09-21")
    expect(r.title).toBe("계약서 전달")
  })
})

describe("parseQuickTask — 숫자로 쓴 날짜", () => {
  it("8월 9일", () => {
    const r = parse("8월 9일까지 설치 확인")
    expect(r.due).toBe("2026-08-09")
    expect(r.start).toBeNull()
    expect(r.title).toBe("설치 확인")
  })
})

describe("parseQuickTask — 담당자 매칭", () => {
  it("@이름(전체 이름)", () => {
    const r = parse("@신희성 내일 통화")
    expect(r.ownerNames).toEqual(["신희성"])
    expect(r.due).toBe("2026-09-15")
    expect(r.title).toBe("통화")
    expect(r.taskType).toBe("call")
  })

  it("성 뺀 두 글자 이름 — 모호하지 않으면 매칭", () => {
    const r = parse("희성 자료 정리 부탁")
    expect(r.ownerNames).toEqual(["신희성"])
    expect(r.title).toBe("자료 정리 부탁")
  })
})

describe("parseQuickTask — 유효 범위 밖 날짜", () => {
  it("19/99는 날짜로 오인하지 않고 제목에 남긴다", () => {
    const r = parse("19/99 이벤트 정리")
    expect(r.due).toBeNull()
    expect(r.start).toBeNull()
    expect(r.title).toBe("19/99 이벤트 정리")
  })
})

describe("parseQuickTask — taskType 키워드 추론", () => {
  it("토큰이 콜/전화/통화로 시작하면 call", () => {
    expect(parse("콜백 준비").taskType).toBe("call")
  })

  it("키워드 토큰이 없으면 null", () => {
    expect(parse("자료 정리").taskType).toBeNull()
  })

  it("토큰 접두 일치만 인정 — '리콜'은 '콜'로 오검지되지 않는다", () => {
    expect(parse("리콜 처리 요청").taskType).toBeNull()
  })
})
