import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveShowroomAnswer } from "@/lib/chatbot/showroom-answer"
import { handleChatbotQuery, streamChatbotQuery, type ChatbotStreamEvent } from "@/lib/chatbot/service"
import { getShowroomAvailability } from "@/lib/showroom/availability"
import { buildShowroomAvailability, getShowroomBookingRange } from "@/lib/showroom/slots"

vi.mock("@/lib/showroom/availability", () => ({ getShowroomAvailability: vi.fn() }))

// UTC 일요일 15:01은 서울에서 월요일이다.
const mondayKst = new Date("2026-11-22T15:01:00Z")
const todayIso = "2026-11-23"
const lookup = vi.mocked(getShowroomAvailability)

beforeEach(() => {
  lookup.mockReset()
  lookup.mockImplementation(async ({ fromIso, toIso } = {}) => ({
    todayIso,
    ...getShowroomBookingRange(todayIso),
    days: buildShowroomAvailability({
      todayIso,
      fromIso,
      toIso,
      busy: [{ date: "2026-12-02", startTime: "15:00", endTime: "16:00" }],
    }),
  }))
})

describe("public chatbot showroom answers", () => {
  it("shows the booking page directly for a general visit question", async () => {
    const result = await resolveShowroomAnswer("쇼룸 방문이 가능한가요?", mondayKst)

    expect(result).toMatchObject({
      topicId: "showroom-booking",
      suppressSalesFollowUp: true,
      response: { answerMode: "direct_answer", needsHandoff: false, sources: [{ urlPath: "/showroom#booking" }] },
    })
    expect(result?.response.answer).toContain("방문이 확정되면 문자로")
    expect(lookup).not.toHaveBeenCalled()
  })

  it("looks up the requested KST weekday and only lists open afternoon slots", async () => {
    const result = await resolveShowroomAnswer(
      "다음 주 수요일 오후에 목동 쇼룸 방문 가능한 시간이 있나요?",
      mondayKst
    )

    expect(lookup).toHaveBeenCalledOnce()
    expect(lookup).toHaveBeenCalledWith({ fromIso: "2026-12-02", toIso: "2026-12-02", now: mondayKst })
    expect(result?.response.answer).toContain("12월 2일(수)")
    expect(result?.response.answer).toContain("14:00, 16:00")
    expect(result?.response.answer).not.toMatch(/10:00|11:00|15:00/)
    expect(result?.response.needsHandoff).toBe(false)
  })

  it("answers a booked time and offers the other openings that day", async () => {
    const result = await resolveShowroomAnswer("쇼룸 12월 2일 수요일 오후 3시 예약 가능한가요?", mondayKst)

    expect(result?.response.answer).toContain("15:00)에는 신청할 수 있는 자리가 없어요")
    expect(result?.response.answer).toContain("같은 날 10:00, 11:00, 14:00, 16:00")
  })

  it("explains why a closed date cannot be chosen", async () => {
    const result = await resolveShowroomAnswer("2026-11-28 쇼룸 방문 예약 가능한가요?", mondayKst)

    expect(result?.response.answer).toContain("11월 28일(토)")
    expect(result?.response.answer).toContain("주말에는 쇼룸 방문 신청을 받지 않아요")
  })

  it("keeps the explicitly requested year", async () => {
    const result = await resolveShowroomAnswer("2027/11/25 쇼룸 방문 예약 가능한가요?", mondayKst)

    expect(result?.response.answer).toContain("60일 이내")
    expect(lookup).not.toHaveBeenCalled()
  })

  it.each([
    "다음 주 오후에 쇼룸을 방문하고 싶어요",
    "12월 2일이나 12월 3일 중 쇼룸을 갈 수 있나요?",
    "12월 32일 쇼룸 예약 가능한가요?",
  ])("asks for one concrete date without guessing for %s", async (question) => {
    const result = await resolveShowroomAnswer(question, mondayKst)

    expect(result?.response.answerMode).toBe("clarifying_question")
    expect(lookup).not.toHaveBeenCalled()
  })

  it.each([
    "다음 주 수요일 오후에 수업을 만들 수 있나요?",
    "다음 주 수요일에 쇼룸 갈 건데 예약 확정 문자가 안 왔어요",
    "목동 쇼룸 예약 버튼이 안 눌려요",
    "쇼룸 방문해서 직접 체험해보고 싶어요",
    "쇼룸에서 쓰던 보드보다 받은 기기가 느려요",
    "지난 수요일 목동 쇼룸에서 본 보드 가격이 궁금해요",
  ])("leaves support and other intents to their existing route for %s", async (question) => {
    expect(await resolveShowroomAnswer(question, mondayKst)).toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })

  it("returns the booking page and avoids claiming a slot when the lookup fails", async () => {
    lookup.mockRejectedValueOnce(new Error("calendar unavailable"))

    const result = await resolveShowroomAnswer("11/25 목동 쇼룸 언제 갈 수 있어요?", mondayKst)

    expect(result?.response.answerMode).toBe("fallback")
    expect(result?.response.answer).toContain("11월 25일(수)의 가능한 시간을 지금 불러오지 못했어요")
    expect(result?.response.sources[0]?.urlPath).toBe("/showroom#booking")
  })

  it("returns a safe fallback if the lookup exceeds the chatbot time budget", async () => {
    vi.useFakeTimers()
    try {
      lookup.mockReturnValueOnce(new Promise(() => {}))
      const result = resolveShowroomAnswer("11월 25일 쇼룸 예약 문의", mondayKst)
      await vi.advanceTimersByTimeAsync(3_000)

      expect((await result)?.response.answerMode).toBe("fallback")
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps showroom results in both response modes and rechecks slots on repeat questions", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(mondayKst)
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    try {
      const request = {
        message: "다음 주 수요일 오후에 목동 쇼룸 방문 가능한 시간이 있나요?",
        context: { showSources: true },
      }
      const events: ChatbotStreamEvent[] = []
      await streamChatbotQuery(request, {}, (event) => events.push(event))

      expect(events).toContainEqual(expect.objectContaining({ type: "replace", answer: expect.stringContaining("14:00, 16:00") }))
      expect(events).toContainEqual(expect.objectContaining({ type: "meta", meta: expect.objectContaining({
        answerMode: "direct_answer",
        sources: [expect.objectContaining({ urlPath: "/showroom#booking" })],
      }) }))

      lookup.mockResolvedValueOnce({
        todayIso,
        ...getShowroomBookingRange(todayIso),
        days: [{ date: "2026-12-02", weekday: 3, bookable: false, blockedReason: "full", slots: [] }],
      })
      const later: ChatbotStreamEvent[] = []
      await streamChatbotQuery(request, {}, (event) => later.push(event))
      expect(later).toContainEqual(expect.objectContaining({ type: "replace", answer: expect.stringContaining("신청할 수 있는 시간이 없어요") }))

      const nonStream = await handleChatbotQuery(request)
      expect(nonStream.answer).toContain("14:00, 16:00")
      expect(nonStream.sources[0]?.urlPath).toBe("/showroom#booking")
      expect(lookup).toHaveBeenCalledTimes(3)
    } finally {
      vi.unstubAllEnvs()
      vi.useRealTimers()
    }
  })
})
