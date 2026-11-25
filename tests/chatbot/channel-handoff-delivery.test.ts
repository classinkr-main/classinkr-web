import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeSupabase, type FakeSupabase } from "./helpers/fake-supabase-store"

// 백엔드 점검 R11·B3: 상담 전환을 "읽고 → 보내고 → 상태 갱신"하는 사이에 다른 요청이 같은 건을 또 보냈다.
// 가짜 저장소(연산마다 한 틱 쉬어 동시 요청이 끼어든다)와 가짜 채널톡 클라이언트로 전송 횟수를 센다. 예시 값은 이 시험을 위해 지었다.

const channel = vi.hoisted(() => ({
  isChannelApiConfigured: vi.fn(() => true),
  upsertChannelUserByMemberId: vi.fn(async () => ({ id: "ch-user-1" })),
  createUserChat: vi.fn(async () => ({ id: "ch-chat-1" })),
  writeUserChatMessage: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: "ch-msg-1" })),
}))
const notify = vi.hoisted(() => ({
  emitNotificationEvent: vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
}))
const store = vi.hoisted(() => ({ current: null as unknown }))

vi.mock("@/lib/channel-talk-api", () => channel)
vi.mock("@/lib/notifications/emit-event", () => notify)
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => (store.current as FakeSupabase).client,
}))

import {
  HANDOFF_MAX_SEND_ATTEMPTS,
  maybeCreateChannelTalkFeedbackHandoff,
  maybeCreateChannelTalkHandoff,
  retryChannelTalkHandoffs,
  saveChatbotFeedbackOnce,
  type ChannelTalkHandoffCandidate,
} from "@/lib/chatbot/channel-handoff"

const OLD_STATUSES = ["pending", "sent", "skipped", "failed"]
const NEW_STATUSES = ["pending", "sending", "sent", "skipped", "failed", "abandoned"]

const SESSION_ID = "00000000-0000-4000-8000-0000000000a1"
const EVENT_ID = "00000000-0000-4000-8000-0000000000e1"

function seedTables() {
  return {
    chat_sessions: [
      {
        id: SESSION_ID,
        anonymous_id: "anon-1",
        customer_name: null,
        customer_email: "parent@example.com",
        customer_phone: null,
        referrer: null,
      },
    ],
    chat_messages: [
      { id: "m1", session_id: SESSION_ID, role: "user", content: "학원 30명 요금이 궁금해요", created_at: "2026-11-25T01:00:00.000Z" },
      { id: "m2", session_id: SESSION_ID, role: "assistant", content: "인원별 요금은 상담으로 안내해요", created_at: "2026-11-25T01:00:01.000Z" },
      { id: "m3", session_id: SESSION_ID, role: "user", content: "견적 받으려면 a@b.com 으로 연락 주세요", created_at: "2026-11-25T01:01:00.000Z" },
      { id: "m4", session_id: SESSION_ID, role: "assistant", content: "담당자에게 이어 드릴게요.", created_at: "2026-11-25T01:01:01.000Z" },
    ],
    chatbot_answer_events: [
      {
        id: EVENT_ID,
        session_id: SESSION_ID,
        user_message_id: "m3",
        assistant_message_id: "m4",
        normalized_question: "견적 받으려면 연락 주세요",
        detected_intent: "sales_consulting",
        detected_category: "consultation",
        answer_mode: "handoff",
        confidence: 0.4,
        unresolved: false,
      },
    ],
  }
}

function makeStore(statuses: string[]) {
  const fake = createFakeSupabase(seedTables(), {
    unique: { chatbot_channel_handoffs: [["answer_event_id"]] },
    statusCheck: { chatbot_channel_handoffs: statuses },
  })
  store.current = fake
  return fake
}

const candidate: ChannelTalkHandoffCandidate = {
  answerEventId: EVENT_ID,
  sessionId: SESSION_ID,
  anonymousId: "anon-1",
  question: "견적 받으려면 [email] 으로 연락 주세요",
  answer: "담당자에게 이어 드릴게요.",
  answerMode: "handoff",
  confidence: 0.4,
  unresolved: false,
  needsHandoff: true,
  detectedCategory: "consultation",
  detectedIntent: "sales_consulting",
  handoffIntent: "demo",
  sources: [],
}

function handoffRows(fake: FakeSupabase) {
  return fake.rows("chatbot_channel_handoffs")
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  channel.isChannelApiConfigured.mockReturnValue(true)
  channel.writeUserChatMessage.mockImplementation(async () => ({ id: "ch-msg-1" }))
  delete process.env.CHANNEL_TALK_HANDOFF_DRY_RUN
  delete process.env.CHANNEL_TALK_HANDOFF_MODE
  delete process.env.CHANNEL_TALK_HANDOFF_ENABLED
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each([
  ["마이그레이션 뒤(sending 상태 있음)", NEW_STATUSES],
  ["마이그레이션 전(sending 상태 없음 — 지금 상태 값만)", OLD_STATUSES],
])("상담 전환 선점 — %s", (_label, statuses) => {
  it("같은 건을 두 요청이 동시에 보내도 채널톡 전송은 한 번이다", async () => {
    const fake = makeStore(statuses)

    await Promise.all([maybeCreateChannelTalkHandoff(candidate), maybeCreateChannelTalkHandoff(candidate)])

    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)
    expect(handoffRows(fake)).toHaveLength(1)
    expect(handoffRows(fake)[0]).toMatchObject({ status: "sent", attempt_count: 1, last_error: null })
    expect(notify.emitNotificationEvent).toHaveBeenCalledTimes(1)
  })

  it("이미 있는 pending 건을 두 요청이 동시에 집어도 한 번만 보낸다", async () => {
    const fake = makeStore(statuses)
    fake.rows("chatbot_channel_handoffs").push({
      id: "h-1",
      answer_event_id: EVENT_ID,
      session_id: SESSION_ID,
      channel_member_id: "classin:web:anon-1",
      channel_user_id: null,
      channel_user_chat_id: null,
      status: "pending",
      payload: { question: candidate.question },
      attempt_count: 0,
      last_error: null,
      updated_at: ago(1),
    })

    await Promise.all([maybeCreateChannelTalkHandoff(candidate), maybeCreateChannelTalkHandoff(candidate)])

    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)
    expect(handoffRows(fake)[0]).toMatchObject({ status: "sent", attempt_count: 1 })
  })

  it("보낸 뒤 상태 갱신이 실패해도 다시 보내지 않는다(요청이 다시 와도, cron 이 돌아도)", async () => {
    const fake = makeStore(statuses)
    fake.hooks.failUpdate = (table, patch) =>
      table === "chatbot_channel_handoffs" && patch.status === "sent"
        ? { code: "08006", message: "connection lost" }
        : null

    await maybeCreateChannelTalkHandoff(candidate)
    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)
    const [row] = handoffRows(fake)
    expect(row.status).not.toBe("sent")
    expect(String(row.last_error)).toMatch(/^sending:/)

    fake.hooks.failUpdate = undefined
    await maybeCreateChannelTalkHandoff(candidate)
    await maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful" })
    const cron = await retryChannelTalkHandoffs({ now: later(16) })

    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)
    expect(cron).toMatchObject({ retried: 0, sent: 0, gaveUp: 1, notified: true })
    expect((handoffRows(fake)[0].payload as Record<string, unknown>).retry).toMatchObject({ reason: "unknown_delivery" })
    expect(handoffRows(fake)[0].status).toBe(statuses.includes("abandoned") ? "abandoned" : "pending")
  })

  it("보내기 자체가 실패하면 failed 로 남고 cron 이 15분 뒤 다시 보낸다", async () => {
    const fake = makeStore(statuses)
    channel.writeUserChatMessage.mockRejectedValueOnce(new Error("channel 503"))

    await maybeCreateChannelTalkHandoff(candidate)
    expect(handoffRows(fake)[0]).toMatchObject({ status: "failed", attempt_count: 1, last_error: "channel 503" })

    expect(await retryChannelTalkHandoffs({ now: later(5) })).toMatchObject({ scanned: 0, sent: 0 })
    expect(await retryChannelTalkHandoffs({ now: later(16) })).toMatchObject({ retried: 1, sent: 1 })
    expect(handoffRows(fake)[0]).toMatchObject({ status: "sent", attempt_count: 2 })
    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(2)
  })
})

describe("재전송 cron", () => {
  function seedHandoff(fake: FakeSupabase, row: Record<string, unknown>) {
    fake.rows("chatbot_channel_handoffs").push({
      answer_event_id: EVENT_ID,
      session_id: SESSION_ID,
      channel_member_id: "classin:web:anon-1",
      channel_user_id: null,
      channel_user_chat_id: null,
      payload: { question: "견적 받으려면 [email] 으로 연락 주세요", message: "[챗봇 상담 전환] 저장된 글" },
      attempt_count: 0,
      last_error: null,
      ...row,
    })
  }

  it("15분 넘은 pending 만 다시 보낸다(저장해 둔 글 그대로)", async () => {
    const fake = makeStore(NEW_STATUSES)
    fake.rows("chatbot_answer_events").push({
      ...seedTables().chatbot_answer_events[0],
      id: "00000000-0000-4000-8000-0000000000e2",
    })
    seedHandoff(fake, { id: "old", status: "pending", updated_at: ago(20) })
    seedHandoff(fake, {
      id: "fresh",
      answer_event_id: "00000000-0000-4000-8000-0000000000e2",
      status: "pending",
      updated_at: ago(5),
    })

    const result = await retryChannelTalkHandoffs()

    expect(result).toMatchObject({ scanned: 1, retried: 1, sent: 1, gaveUp: 0 })
    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)
    expect(channel.writeUserChatMessage.mock.calls[0][1]).toBe("[챗봇 상담 전환] 저장된 글")
    expect(fake.rows("chatbot_channel_handoffs").find((row) => row.id === "old")).toMatchObject({ status: "sent" })
    expect(fake.rows("chatbot_channel_handoffs").find((row) => row.id === "fresh")).toMatchObject({ status: "pending" })
  })

  it(`보내기 시도는 ${HANDOFF_MAX_SEND_ATTEMPTS}회까지, 그 뒤에는 포기 표시와 알림 한 번`, async () => {
    const fake = makeStore(NEW_STATUSES)
    channel.writeUserChatMessage.mockRejectedValue(new Error("channel down"))
    seedHandoff(fake, { id: "h-1", status: "pending", updated_at: ago(20) })

    for (let run = 1; run <= HANDOFF_MAX_SEND_ATTEMPTS; run += 1) {
      await retryChannelTalkHandoffs({ now: later(16 * run) })
    }
    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(HANDOFF_MAX_SEND_ATTEMPTS)
    expect(fake.rows("chatbot_channel_handoffs")[0]).toMatchObject({ status: "failed", attempt_count: 3 })
    expect(notify.emitNotificationEvent).not.toHaveBeenCalled()

    const giveUp = await retryChannelTalkHandoffs({ now: later(16 * 5) })
    const again = await retryChannelTalkHandoffs({ now: later(16 * 6) })

    expect(giveUp).toMatchObject({ gaveUp: 1, notified: true })
    expect(again).toMatchObject({ scanned: 0, gaveUp: 0, notified: false })
    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(HANDOFF_MAX_SEND_ATTEMPTS)
    expect(notify.emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(notify.emitNotificationEvent.mock.calls[0][0]).toMatchObject({
      eventType: "chatbot.channel_talk_handoff_abandoned",
      channels: ["wecom_cs_webhook"],
    })
    expect(fake.rows("chatbot_channel_handoffs")[0]).toMatchObject({ status: "abandoned", last_error: "channel down" })
  })

  it("마이그레이션 전에도 포기한 건은 다시 집지 않는다(payload 표시)", async () => {
    const fake = makeStore(OLD_STATUSES)
    seedHandoff(fake, { id: "h-1", status: "failed", attempt_count: 3, last_error: "x", updated_at: ago(30) })

    expect(await retryChannelTalkHandoffs()).toMatchObject({ gaveUp: 1 })
    expect(await retryChannelTalkHandoffs({ now: later(60) })).toMatchObject({ scanned: 0, gaveUp: 0 })
    expect(fake.rows("chatbot_channel_handoffs")[0].status).toBe("failed")
    expect(notify.emitNotificationEvent).toHaveBeenCalledTimes(1)
  })

  it("상담 전환이 꺼져 있으면 아무것도 하지 않는다", async () => {
    makeStore(NEW_STATUSES)
    channel.isChannelApiConfigured.mockReturnValue(false)
    expect(await retryChannelTalkHandoffs()).toMatchObject({ enabled: false, scanned: 0 })
  })
})

describe("'별로예요' 피드백 전달", () => {
  it("이미 보낸 상담방에 같은 답 '별로예요'를 여러 번 눌러도 채널톡 글은 한 번이다", async () => {
    const fake = makeStore(NEW_STATUSES)
    fake.rows("chatbot_channel_handoffs").push({
      id: "h-1",
      answer_event_id: EVENT_ID,
      session_id: SESSION_ID,
      channel_member_id: "classin:web:anon-1",
      channel_user_id: "ch-user-1",
      channel_user_chat_id: "ch-chat-9",
      status: "sent",
      payload: { question: "q" },
      attempt_count: 1,
      last_error: null,
      updated_at: ago(3),
    })

    await Promise.all([
      maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful" }),
      maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful" }),
    ])
    await maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful", comment: "또 눌러요" })

    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)
    expect(channel.writeUserChatMessage.mock.calls[0][0]).toBe("ch-chat-9")
    expect((fake.rows("chatbot_channel_handoffs")[0].payload as Record<string, unknown>).feedback).toMatchObject({
      rating: "not_helpful",
      channelMessageId: "ch-msg-1",
    })
  })

  it("전환 건이 없을 때 '별로예요' 두 번이면 상담방·글은 한 번만 생긴다", async () => {
    const fake = makeStore(NEW_STATUSES)

    await Promise.all([
      maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful" }),
      maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful" }),
    ])
    await maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful" })

    expect(channel.createUserChat).toHaveBeenCalledTimes(1)
    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)
    expect(fake.rows("chatbot_channel_handoffs")).toHaveLength(1)
    const message = String(channel.writeUserChatMessage.mock.calls[0][1])
    expect(message).toContain("[사용자 피드백]")
    expect(message).toContain("고객이 챗봇 답에 '별로예요'를 눌렀어요")
  })

  it("'도움 됐어요'는 채널톡으로 가지 않는다", async () => {
    makeStore(NEW_STATUSES)
    await maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "helpful" })
    expect(channel.writeUserChatMessage).not.toHaveBeenCalled()
  })
})

describe("앞서 물은 내용(직전 대화)", () => {
  it("호출하는 쪽이 넘기지 않으면 저장된 이전 대화를 읽어 싣고, 연락처는 가린다", async () => {
    makeStore(NEW_STATUSES)
    await maybeCreateChannelTalkHandoff(candidate)
    const message = String(channel.writeUserChatMessage.mock.calls[0][1])
    expect(message).toContain("[앞서 물은 내용]\n고객: 학원 30명 요금이 궁금해요\n챗봇: 인원별 요금은 상담으로 안내해요")
    // 이번 질문(m3)은 [고객 질문]에만 있고 앞선 내용에는 없다.
    expect(message.split("[앞서 물은 내용]")[1].split("[연락 방법]")[0]).not.toContain("견적")
    expect(message).toContain("남긴 연락처: 이메일 (값은 채널톡 고객 정보에 있어요)")
    expect(message).not.toContain("parent@example.com")
  })

  it("넘긴 recentTurns 가 있으면 그것을 쓰고, 원문 연락처도 가린다", async () => {
    makeStore(NEW_STATUSES)
    await maybeCreateChannelTalkHandoff({
      ...candidate,
      recentTurns: [{ role: "user", content: "제 번호는 010-1234-5678 이에요" }],
    })
    const message = String(channel.writeUserChatMessage.mock.calls[0][1])
    expect(message).toContain("[앞서 물은 내용]\n고객: 제 번호는 [phone] 이에요")
    expect(message).not.toContain("010-1234-5678")
  })
})

describe("피드백 행 — 답 하나에 한 행", () => {
  it("같은 답에 두 번 저장하면 행은 하나, 평가를 바꾸면 그 행을 고친다", async () => {
    const fake = createFakeSupabase({}, { unique: { chatbot_feedback: [["answer_event_id"]] } })
    const client = fake.client as never

    const first = await saveChatbotFeedbackOnce(client, { answerEventId: EVENT_ID, rating: "not_helpful", comment: null })
    const second = await saveChatbotFeedbackOnce(client, { answerEventId: EVENT_ID, rating: "not_helpful", comment: null })
    const changed = await saveChatbotFeedbackOnce(client, { answerEventId: EVENT_ID, rating: "helpful", comment: null })

    expect(first).toEqual({ created: true, changed: true, previousRating: null })
    expect(second).toEqual({ created: false, changed: false, previousRating: "not_helpful" })
    expect(changed).toEqual({ created: false, changed: true, previousRating: "not_helpful" })
    expect(fake.rows("chatbot_feedback")).toHaveLength(1)
    expect(fake.rows("chatbot_feedback")[0].rating).toBe("helpful")
  })

  it("동시에 두 번 저장해도 유니크에 걸린 쪽이 다시 읽어 행 하나로 끝난다", async () => {
    const fake = createFakeSupabase({}, { unique: { chatbot_feedback: [["answer_event_id"]] } })
    const client = fake.client as never
    const results = await Promise.all([
      saveChatbotFeedbackOnce(client, { answerEventId: EVENT_ID, rating: "not_helpful", comment: null }),
      saveChatbotFeedbackOnce(client, { answerEventId: EVENT_ID, rating: "not_helpful", comment: null }),
    ])
    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(fake.rows("chatbot_feedback")).toHaveLength(1)
  })
})
