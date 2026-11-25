import { beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeSupabase, type FakeSupabase } from "../chatbot/helpers/fake-supabase-store"

// 백엔드 점검 R9: 채널톡 웹훅의 "상담 완결" 기록 중복 판정이 출처 id 를 보지 않아, 본문이 같은(대개 null) 서로 다른 상담이
// 10초 안에 닫히면 하나로 뭉개졌다. 출처 id 기준 조회(getOrCreateCrmCustomerEventBySource)와 짧은 창 중복 판정의
// source_id 조건을 가짜 저장소로 확인한다. 예시 값은 이 시험을 위해 지었다.

const store = vi.hoisted(() => ({ current: null as unknown }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => (store.current as FakeSupabase).client,
}))
vi.mock("@/lib/storage/crm-recordings", () => ({
  createCrmRecordingSignedUrls: vi.fn(async () => new Map()),
}))
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))

import { createCrmCustomerEvent, getOrCreateCrmCustomerEventBySource } from "@/lib/repositories/crm-events"

function closedEvent(chatId: string) {
  return {
    targetType: "customer" as const,
    targetId: null,
    sourceType: "site_inflow" as const,
    sourceId: `channel:${chatId}`,
    occurredAt: "2026-11-25T03:00:00.000Z",
    title: "채널톡 실시간 상담 완결",
    summary: `채널톡 대화(${chatId})가 완결되어 CRM 타임라인에 실시간 스탬프되었습니다.`,
    body: null,
    sentiment: "neutral" as const,
    tags: ["channel_talk"],
  }
}

let fake: FakeSupabase

beforeEach(() => {
  fake = createFakeSupabase(
    {},
    {
      partialUnique: {
        crm_customer_events: [
          {
            columns: ["source_type", "source_id"],
            where: (row) => row.source_type === "site_inflow" && String(row.source_id ?? "").startsWith("channel:"),
          },
        ],
      },
    }
  )
  store.current = fake
})

describe("채널톡 상담 완결 CRM 기록", () => {
  it("10초 안에 닫힌 서로 다른 상담 두 건은 기록 두 건이다", async () => {
    await getOrCreateCrmCustomerEventBySource(closedEvent("chat-a"))
    await getOrCreateCrmCustomerEventBySource(closedEvent("chat-b"))
    expect(fake.rows("crm_customer_events").map((row) => row.source_id)).toEqual(["channel:chat-a", "channel:chat-b"])
  })

  it("같은 상담이 여러 번(동시에) 닫혀도 기록은 하나다", async () => {
    const results = await Promise.all([
      getOrCreateCrmCustomerEventBySource(closedEvent("chat-a")),
      getOrCreateCrmCustomerEventBySource(closedEvent("chat-a")),
    ])
    await getOrCreateCrmCustomerEventBySource(closedEvent("chat-a"))
    expect(fake.rows("crm_customer_events")).toHaveLength(1)
    expect(results.filter((result) => result.created)).toHaveLength(1)
  })

  it("짧은 창 중복 판정(createCrmCustomerEvent)도 출처 id 가 다르면 따로 남긴다", async () => {
    await createCrmCustomerEvent(closedEvent("chat-a"))
    await createCrmCustomerEvent(closedEvent("chat-b"))
    await createCrmCustomerEvent({ ...closedEvent("chat-a"), sourceId: undefined, title: "수기 메모" })
    await createCrmCustomerEvent({ ...closedEvent("chat-a"), sourceId: undefined, title: "수기 메모" })
    const rows = fake.rows("crm_customer_events")
    expect(rows.filter((row) => row.title === "채널톡 실시간 상담 완결")).toHaveLength(2)
    // 출처 id 없는 같은 내용의 연속 입력(더블클릭)은 지금처럼 하나로 막는다.
    expect(rows.filter((row) => row.title === "수기 메모")).toHaveLength(1)
  })
})
