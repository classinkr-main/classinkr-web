import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeSupabase, type FakeSupabase } from "./helpers/fake-supabase-store"

// 상담 전환(챗봇→채널톡) 반박 검토 F1·F3·F4·F5·F6 재현. 가짜 저장소·가짜 채널톡 클라이언트로 전송·알림 횟수를 센다.
// 예시 값은 이 시험을 위해 지었다.

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
  MAX_HANDOFF_MESSAGE_LENGTH,
  formatHandoffMessage,
  maybeCreateChannelTalkFeedbackHandoff,
  maybeCreateChannelTalkHandoff,
  retryChannelTalkHandoffs,
  type ChannelTalkHandoffCandidate,
  type HandoffTurn,
} from "@/lib/chatbot/channel-handoff"

const OLD_STATUSES = ["pending", "sent", "skipped", "failed"]
const NEW_STATUSES = ["pending", "sending", "sent", "skipped", "failed", "abandoned"]

const SESSION_ID = "00000000-0000-4000-8000-0000000000a1"
const EVENT_ID = "00000000-0000-4000-8000-0000000000e1"
const EVENT_ID_2 = "00000000-0000-4000-8000-0000000000e2"

function seedTables() {
  const event = {
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
  }
  return {
    chat_sessions: [
      { id: SESSION_ID, anonymous_id: "anon-1", customer_name: null, customer_email: null, customer_phone: null, referrer: null },
    ],
    chat_messages: [
      { id: "m3", session_id: SESSION_ID, role: "user", content: "견적 받고 싶어요", created_at: "2026-11-25T01:01:00.000Z" },
      { id: "m4", session_id: SESSION_ID, role: "assistant", content: "담당자에게 이어 드릴게요.", created_at: "2026-11-25T01:01:01.000Z" },
    ],
    chatbot_answer_events: [event, { ...event, id: EVENT_ID_2 }],
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
  question: "견적 받고 싶어요",
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

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000)

function seedHandoff(fake: FakeSupabase, row: Record<string, unknown>) {
  fake.rows("chatbot_channel_handoffs").push({
    id: "h-1",
    answer_event_id: EVENT_ID,
    session_id: SESSION_ID,
    channel_member_id: "classin:web:anon-1",
    channel_user_id: null,
    channel_user_chat_id: null,
    payload: { question: "견적 받고 싶어요", message: "[챗봇 상담 전환] 저장된 글" },
    attempt_count: 0,
    last_error: null,
    created_at: ago(30),
    updated_at: ago(30),
    ...row,
  })
}

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
  ["마이그레이션 뒤", NEW_STATUSES],
  ["마이그레이션 전", OLD_STATUSES],
])("F1 오래된 백로그 — %s", (_label, statuses) => {
  it("만든 지 24시간 넘은 failed 건은 다시 보내지 않고 알림 없이 포기 표시만 한다", async () => {
    const fake = makeStore(statuses)
    seedHandoff(fake, { status: "failed", attempt_count: 1, last_error: "old", created_at: ago(90 * 1440), updated_at: ago(90 * 1440) })
    seedHandoff(fake, { id: "h-2", answer_event_id: EVENT_ID_2, status: "failed", attempt_count: 1, last_error: "x", created_at: ago(60), updated_at: ago(30) })

    const first = await retryChannelTalkHandoffs()
    expect(first).toMatchObject({ expired: 1, retried: 1, sent: 1, gaveUp: 0 })
    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)
    // 남은 알림은 새 건(h-2)의 전환 알림 하나뿐 — 옛 건에는 '긴급 상담 요청'도 포기 알림도 없다.
    expect(notify.emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(notify.emitNotificationEvent.mock.calls[0][0]).toMatchObject({ sourceId: EVENT_ID_2 })

    const stale = fake.rows("chatbot_channel_handoffs").find((row) => row.id === "h-1")!
    expect(stale.status).toBe(statuses.includes("abandoned") ? "abandoned" : "failed")
    expect((stale.payload as Record<string, unknown>).retry).toMatchObject({ reason: "expired" })
    expect(String(stale.last_error)).toContain("old")

    const again = await retryChannelTalkHandoffs({ now: later(60) })
    expect(again).toMatchObject({ expired: 0, retried: 0 })
    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)

    // 포기 표시한 옛 건은 '별로예요'로도 다시 나가지 않는다.
    await maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful" })
    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)
  })
})

describe("F3 마이그레이션 전 포기한 건", () => {
  it("'별로예요'·새 질문 부수효과가 포기한 건(failed + gaveUpAt)을 다시 집어 상한을 넘겨 보내지 않는다", async () => {
    const fake = makeStore(OLD_STATUSES)
    seedHandoff(fake, { status: "failed", attempt_count: 3, last_error: "x", updated_at: ago(30) })
    expect(await retryChannelTalkHandoffs()).toMatchObject({ gaveUp: 1 })

    await maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful" })
    await maybeCreateChannelTalkHandoff(candidate)

    expect(channel.writeUserChatMessage).not.toHaveBeenCalled()
    expect(fake.rows("chatbot_channel_handoffs")[0]).toMatchObject({ status: "failed", attempt_count: 3 })
  })
})

describe("F4 보내지 못한 건의 기록", () => {
  it("보내기 실패 뒤 failed 기록이 한 번 실패해도 한 번 더 적어, cron 이 '보냈는지 모름'이 아니라 다시 보낸다", async () => {
    const fake = makeStore(NEW_STATUSES)
    channel.writeUserChatMessage.mockRejectedValueOnce(new Error("503"))
    let failures = 0
    fake.hooks.failUpdate = (table, patch) =>
      table === "chatbot_channel_handoffs" && patch.status === "failed" && failures++ === 0
        ? { code: "08006", message: "lost" }
        : null

    await maybeCreateChannelTalkHandoff(candidate)
    fake.hooks.failUpdate = undefined
    expect(fake.rows("chatbot_channel_handoffs")[0]).toMatchObject({ status: "failed", last_error: "503" })

    const cron = await retryChannelTalkHandoffs({ now: later(16) })
    expect(cron).toMatchObject({ retried: 1, sent: 1, gaveUp: 0 })
    expect(fake.rows("chatbot_channel_handoffs")[0].status).toBe("sent")
  })
})

describe("F5 나중에 온 코멘트", () => {
  function seedSent(fake: FakeSupabase, feedback: Record<string, unknown>) {
    seedHandoff(fake, {
      status: "sent",
      channel_user_id: "ch-user-1",
      channel_user_chat_id: "ch-chat-9",
      attempt_count: 1,
      payload: { question: "q", feedback },
    })
  }

  it("처음 전달에 코멘트가 없었으면 나중 코멘트를 한 번만 상담방에 붙인다(동시에 와도)", async () => {
    const fake = makeStore(NEW_STATUSES)
    seedSent(fake, { rating: "not_helpful", comment: null, appendedAt: ago(5) })

    await maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful" })
    expect(channel.writeUserChatMessage).not.toHaveBeenCalled()

    await Promise.all([
      maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful", comment: "요금표가 없어요" }),
      maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful", comment: "요금표가 없어요" }),
    ])
    await maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful", comment: "또 다른 코멘트" })

    expect(channel.writeUserChatMessage).toHaveBeenCalledTimes(1)
    expect(channel.writeUserChatMessage.mock.calls[0][0]).toBe("ch-chat-9")
    expect(String(channel.writeUserChatMessage.mock.calls[0][1])).toContain("요금표가 없어요")
    expect((fake.rows("chatbot_channel_handoffs")[0].payload as Record<string, unknown>).feedback).toMatchObject({
      comment: "요금표가 없어요",
    })
  })

  it("처음 전달에 코멘트가 있었으면 더 붙이지 않는다", async () => {
    const fake = makeStore(NEW_STATUSES)
    seedSent(fake, { rating: "not_helpful", comment: "처음 코멘트", appendedAt: ago(5) })
    await maybeCreateChannelTalkFeedbackHandoff(EVENT_ID, { rating: "not_helpful", comment: "두 번째" })
    expect(channel.writeUserChatMessage).not.toHaveBeenCalled()
  })
})

describe("F6 상담 글 전체 길이", () => {
  const long = "가".repeat(5000)
  const turns: HandoffTurn[] = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `${index}번째 ${long}`,
  }))

  it("모든 칸이 최대여도 상한 안에 들고 [고객 질문]은 남는다", async () => {
    makeStore(NEW_STATUSES)
    await maybeCreateChannelTalkHandoff({
      ...candidate,
      question: long,
      routingQuestion: `${long}나`,
      answer: long,
      recentTurns: turns,
      sources: Array.from({ length: 5 }, (_, index) => ({
        title: long.slice(0, 300),
        urlPath: `/docs/x${index}`,
        category: "c",
        excerpt: "",
        score: 1,
      })),
    })
    const message = String(channel.writeUserChatMessage.mock.calls[0][1])
    expect(message.length).toBeLessThanOrEqual(MAX_HANDOFF_MESSAGE_LENGTH)
    expect(message).toContain("[고객 질문]")
  })

  it("앞서 물은 내용은 오래된 것부터 빼고 최근 것을 남긴다", () => {
    const routingQuestion = "나".repeat(600)
    const message = formatHandoffMessage({ ...candidate, question: long, routingQuestion, answer: long }, ["needs_handoff"], undefined, {
      contact: null,
      recentTurns: turns,
    })
    expect(message.length).toBeLessThanOrEqual(MAX_HANDOFF_MESSAGE_LENGTH)
    expect(message).toContain("[앞서 물은 내용]")
    expect(message).toContain("19번째")
    expect(message).not.toContain("14번째")
    expect(message).toContain("[기술 정보")
  })

  it("짧은 글은 그대로다(앞서 물은 내용 6개 모두)", () => {
    const shortTurns: HandoffTurn[] = Array.from({ length: 6 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `짧은 말 ${index}`,
    }))
    const message = formatHandoffMessage(candidate, ["needs_handoff"], undefined, { contact: null, recentTurns: shortTurns })
    for (let index = 0; index < 6; index += 1) expect(message).toContain(`짧은 말 ${index}`)
  })
})
