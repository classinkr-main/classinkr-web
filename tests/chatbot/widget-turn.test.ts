import { describe, expect, it } from "vitest"

import { buildPreviousTurn } from "@/scripts/lib/chatbot-live-eval-checks"
import { detectAskedSlot } from "@/lib/chatbot/follow-up"
import {
  buildPreviousTurnPayload,
  buildRetryLabel,
  classifyWidgetTurnError,
  findLastServerAnswer,
  isRetryableWidgetError,
  parseRetryAfterSeconds,
  shouldOfferHandoffChip,
  shouldShowUnresolvedNudge,
  WIDGET_HANDOFF_CHIP,
  WIDGET_RATE_LIMIT_DEFAULT_SECONDS,
  WIDGET_TURN_ERROR_COPY,
  WidgetTurnError,
  type WidgetTurnErrorKind,
  type WidgetTurnMessage,
} from "@/lib/chatbot/widget-turn"

// 위젯이 보내는 직전 턴과 재촉 말풍선 규칙(2026-11-20 조사 G1·G17). 예시 글은 이 시험을 위해 지었다.

const DEVICE_LINE = "쓰시는 기기가 PC인지 휴대폰·태블릿인지 알려 주시면, 그 기기에 맞는 순서만 짧게 다시 정리해 드릴게요."

describe("buildPreviousTurnPayload", () => {
  it("가장 최근 질문과 그 답으로 직전 턴을 만들고, 답 끝 질문의 종류를 싣는다", () => {
    const messages: WidgetTurnMessage[] = [
      { role: "assistant", content: "안녕하세요!" },
      { role: "user", content: "다시보기 영상이  안 나와요" },
      { role: "assistant", content: `다시보기를 확인해 주세요.\n\n${DEVICE_LINE}`, answerMode: "direct_answer" },
    ]
    expect(buildPreviousTurnPayload(messages)).toEqual({ question: "다시보기 영상이 안 나와요", askedSlot: "device", answerMode: "direct_answer" })
  })

  it("측정 스크립트와 같은 직전 턴을 만든다", () => {
    const answer = `다시보기를 확인해 주세요.\n\n${DEVICE_LINE}`
    const fromWidget = buildPreviousTurnPayload([
      { role: "user", content: "다시보기 영상이 안 나와요" },
      { role: "assistant", content: answer, answerMode: "direct_answer" },
    ])
    expect(fromWidget).toEqual(buildPreviousTurn("다시보기 영상이 안 나와요", answer, "direct_answer", detectAskedSlot))
  })

  it("위젯이 붙인 재촉 말풍선은 건너뛰고, 질문은 200자로 자른다", () => {
    const long = "가".repeat(250)
    const turn = buildPreviousTurnPayload([
      { role: "user", content: long },
      { role: "assistant", content: "답이에요.", answerMode: "doc_suggestion" },
      { role: "assistant", content: "도입, 수업 운영, 계정/오류, 결제 중 어느 쪽인지 알려주시면 더 짧게 좁혀드릴게요." },
    ])
    expect(turn).toEqual({ question: "가".repeat(200), answerMode: "doc_suggestion" })
  })

  it("대화가 없거나 답을 받은 질문이 하나도 없으면 보내지 않는다", () => {
    expect(buildPreviousTurnPayload([{ role: "assistant", content: "안녕하세요!" }])).toBeUndefined()
    expect(
      buildPreviousTurnPayload([
        { role: "user", content: "카메라가 안 켜져요" },
        { role: "assistant", content: WIDGET_TURN_ERROR_COPY.network },
      ])
    ).toBeUndefined()
  })

  // CX-01: 예전에는 마지막 질문이 오류였으면 직전 턴을 비워 보내, 다시 시도·이어 묻기가 '지난 문의는 볼 수 없어요'를 받았다.
  it("답을 받지 못한 질문(오류·끊김)은 건너뛰고 답을 받은 가장 최근 질문을 쓴다", () => {
    const messages: WidgetTurnMessage[] = [
      { role: "user", content: "카메라가 안 켜져요" },
      { role: "assistant", content: `카메라 권한을 확인해 주세요.\n\n${DEVICE_LINE}`, answerMode: "direct_answer" },
      { role: "user", content: "휴대폰이요" },
      { role: "assistant", content: WIDGET_TURN_ERROR_COPY.network },
      { role: "user", content: "그러면 노트북은요?" },
      { role: "assistant", content: "노트북은 브라우저 권한을" },
    ]
    expect(buildPreviousTurnPayload(messages)).toEqual({ question: "카메라가 안 켜져요", askedSlot: "device", answerMode: "direct_answer" })
  })

  it("앞 질문의 답을 뒤 질문의 답으로 잘못 짝짓지 않는다", () => {
    // 두 번째 질문은 답이 없고, 그 뒤에 온 서버 답은 첫 질문의 답이 아니다(가운데 사용자 말이 경계).
    expect(
      buildPreviousTurnPayload([
        { role: "user", content: "녹화는 어디서 봐요?" },
        { role: "user", content: "다시보기도요" },
        { role: "assistant", content: "다시보기 위치를 알려 드릴게요.", answerMode: "doc_suggestion" },
      ])
    ).toEqual({ question: "다시보기도요", answerMode: "doc_suggestion" })
  })
})

describe("shouldShowUnresolvedNudge", () => {
  it("서버가 되묻거나 안내 답을 낸 뒤에는 세 번 이어져도 붙이지 않는다", () => {
    for (const answerMode of ["clarifying_question", "fallback"]) {
      expect(shouldShowUnresolvedNudge({ streak: 3, threshold: 3, answerMode })).toBe(false)
      expect(shouldShowUnresolvedNudge({ streak: 5, threshold: 3, answerMode })).toBe(false)
    }
  })

  it("그 밖의 못 풀림이 세 번 이어지면 붙이고, 상담 연결 답이면 붙이지 않는다", () => {
    expect(shouldShowUnresolvedNudge({ streak: 3, threshold: 3, answerMode: "doc_suggestion" })).toBe(true)
    expect(shouldShowUnresolvedNudge({ streak: 2, threshold: 3, answerMode: "doc_suggestion" })).toBe(false)
    expect(shouldShowUnresolvedNudge({ streak: 3, threshold: 3, answerMode: "handoff", needsHandoff: true })).toBe(false)
  })
})

describe("shouldOfferHandoffChip (CX-22)", () => {
  const clarify = "어떤 걸 도와드릴까요? 도입, 수업 운영, 계정 중에 골라 주세요."

  it("직전 서버 답과 같은 글의 되묻기가 또 오면 사람 연결 칩을 붙인다(공백 차이는 같게 본다)", () => {
    expect(
      shouldOfferHandoffChip({
        previousAnswer: { content: clarify, answerMode: "clarifying_question" },
        answer: { content: `${clarify}  `.replace(" ", "\n"), answerMode: "clarifying_question" },
      })
    ).toBe(true)
  })

  it("처음 되묻기·다른 글·다른 답 모드·이미 상담 연결 답이면 붙이지 않는다", () => {
    expect(shouldOfferHandoffChip({ answer: { content: clarify, answerMode: "clarifying_question" } })).toBe(false)
    expect(
      shouldOfferHandoffChip({
        previousAnswer: { content: clarify, answerMode: "clarifying_question" },
        answer: { content: "기기를 알려 주세요.", answerMode: "clarifying_question" },
      })
    ).toBe(false)
    expect(
      shouldOfferHandoffChip({
        previousAnswer: { content: clarify, answerMode: "direct_answer" },
        answer: { content: clarify, answerMode: "clarifying_question" },
      })
    ).toBe(false)
    expect(
      shouldOfferHandoffChip({
        previousAnswer: { content: clarify, answerMode: "clarifying_question" },
        answer: { content: clarify, answerMode: "clarifying_question" },
        needsHandoff: true,
      })
    ).toBe(false)
  })

  it("같은 안내 답(fallback)이 두 번 이어져도 붙인다", () => {
    const fallback = "확인 가능한 답변을 찾지 못했어요."
    expect(
      shouldOfferHandoffChip({
        previousAnswer: { content: fallback, answerMode: "fallback" },
        answer: { content: fallback, answerMode: "fallback" },
      })
    ).toBe(true)
  })

  it("칩 문구는 사람 연결을 말하고, 마지막 서버 답은 위젯이 붙인 말풍선을 건너뛰고 찾는다", () => {
    expect(WIDGET_HANDOFF_CHIP).toContain("담당자")
    const messages: WidgetTurnMessage[] = [
      { role: "user", content: "클래스인" },
      { role: "assistant", content: clarify, answerMode: "clarifying_question" },
      { role: "assistant", content: WIDGET_TURN_ERROR_COPY.server },
    ]
    expect(findLastServerAnswer(messages)).toBe(messages[1])
  })
})

describe("위젯 오류 문구 표 (CX-01)", () => {
  const kinds: WidgetTurnErrorKind[] = ["network", "server", "rate_limited", "timeout", "interrupted", "rejected"]

  it("종류마다 한국어 문구가 있고, 브라우저 영어 오류 글이나 내부 사정은 들어 있지 않다", () => {
    for (const kind of kinds) {
      const copy = WIDGET_TURN_ERROR_COPY[kind]
      expect(copy).toMatch(/[가-힣]/)
      expect(copy).not.toMatch(/fetch|failed|error|HTTP|\d{3}/i)
      expect(copy.endsWith("요.")).toBe(true)
    }
  })

  it("오류를 종류로 나눈다", () => {
    expect(classifyWidgetTurnError(new TypeError("Failed to fetch"))).toBe("network")
    expect(classifyWidgetTurnError(new Error("boom"), { online: false })).toBe("network")
    expect(classifyWidgetTurnError(new DOMException("aborted", "AbortError"), { timedOut: true })).toBe("timeout")
    expect(classifyWidgetTurnError(new Error("boom"))).toBe("server")
    expect(classifyWidgetTurnError(new WidgetTurnError("rate_limited", { retryAfterSeconds: 7 }))).toBe("rate_limited")
    expect(classifyWidgetTurnError(new WidgetTurnError("interrupted"), { timedOut: true })).toBe("interrupted")
  })

  it("다시 보내도 같은 결과인 거절에만 다시 시도를 두지 않는다", () => {
    expect(kinds.filter((kind) => !isRetryableWidgetError(kind))).toEqual(["rejected"])
  })

  it("429 대기 시간은 Retry-After 를 따르고(1~60초), 없거나 읽지 못하면 10초", () => {
    const now = Date.UTC(2026, 10, 25, 0, 0, 0)
    expect(parseRetryAfterSeconds("7")).toBe(7)
    expect(parseRetryAfterSeconds("600")).toBe(60)
    expect(parseRetryAfterSeconds(new Date(now + 15_000).toUTCString(), now)).toBe(15)
    expect(parseRetryAfterSeconds(null)).toBe(WIDGET_RATE_LIMIT_DEFAULT_SECONDS)
    expect(parseRetryAfterSeconds("soon")).toBe(10)
    expect(parseRetryAfterSeconds("0")).toBe(10)
  })

  it("다시 시도 버튼 이름에 질문 앞부분을 싣는다", () => {
    expect(buildRetryLabel("카메라가   안 켜져요")).toBe("다시 시도: 카메라가 안 켜져요")
    expect(buildRetryLabel("가".repeat(40))).toBe(`다시 시도: ${"가".repeat(24)}…`)
    expect(buildRetryLabel("  ")).toBe("다시 시도")
  })
})
