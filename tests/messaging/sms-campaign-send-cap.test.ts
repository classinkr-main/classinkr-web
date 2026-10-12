/**
 * CT11 — POST /api/admin/sms/send 수신자 전량 조회 + 1회 상한(500) + 드라이런.
 *
 * 이전엔 수신자 조회가 PostgREST 기본 1,000행에서 조용히 잘렸고 상한도 없었다. 이제 range 페이지네이션
 * (실제 받은 행 수만큼 전진)으로 전량을 세고, 500명을 넘으면 한 건도 보내지 않고 대상 수를 보고한다.
 * 실제 발송은 절대 하지 않는다 — lib/messaging/send는 목이고 MESSAGING_DRY_RUN=1도 켠다.
 */
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

const db = vi.hoisted(() => ({
  subscribers: [] as Row[],
  /** 서버 max-rows 흉내 — 요청 범위보다 적게 돌려줄 수 있다. */
  serverMaxRows: Infinity,
  ranges: [] as Array<[number, number]>,
  campaignInserts: [] as Row[],
}))

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  sendSmsMessages: vi.fn(),
}))

function subscriberQuery() {
  let range: [number, number] | null = null
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: self,
    eq: self,
    not: self,
    overlaps: self,
    order: self,
    range: (from: number, to: number) => {
      range = [from, to]
      db.ranges.push([from, to])
      return chain
    },
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
      const [from, to] = range ?? [0, db.subscribers.length - 1]
      const size = Math.min(to - from + 1, db.serverMaxRows)
      return Promise.resolve({ data: db.subscribers.slice(from, from + size), error: null }).then(
        onFulfilled,
        onRejected
      )
    },
  })
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "sms_campaigns") {
        return {
          insert: (row: Row) => {
            db.campaignInserts.push(row)
            return { select: () => ({ single: async () => ({ data: { id: "campaign-1", ...row }, error: null }) }) }
          },
        }
      }
      return subscriberQuery()
    },
  }),
}))
vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/messaging/send", () => ({ sendSmsMessages: mocks.sendSmsMessages }))

import { POST } from "@/app/api/admin/sms/send/route"

function subscribers(count: number, offset = 0): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(offset + i).padStart(6, "0"),
    phone: `010-${String(1000 + ((offset + i) % 9000)).padStart(4, "0")}-${String(offset + i).padStart(4, "0")}`,
  }))
}

function sendRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/sms/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("MESSAGING_DRY_RUN", "1")
  db.subscribers = []
  db.serverMaxRows = Infinity
  db.ranges = []
  db.campaignInserts = []
  mocks.verifyAdmin.mockResolvedValue(undefined)
  mocks.sendSmsMessages.mockImplementation(async ({ messages }: { messages: unknown[] }) => ({
    provider: "solapi",
    channel: "sms",
    requested: messages.length,
    sent: 0,
    failed: 0,
    simulated: messages.length,
    results: [],
  }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("POST /api/admin/sms/send — 1회 상한", () => {
  it("대상이 500명을 넘으면 한 건도 보내지 않고 대상 수를 보고한다(캠페인 이력도 없음)", async () => {
    db.subscribers = subscribers(1200)

    const response = await POST(sendRequest({ message: "안내", targetTags: [] }))
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json).toMatchObject({ code: "recipient_cap_exceeded", recipientCount: 1200, maxPerRun: 500, sentCount: 0 })
    expect(mocks.sendSmsMessages).not.toHaveBeenCalled()
    expect(db.campaignInserts).toEqual([])
    // 1,000행 절단 없이 전량을 셌다: 0-999, 1000-1999(200행), 빈 페이지에서 종료.
    expect(db.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [1200, 2199],
    ])
  })

  it("서버가 요청보다 적게 돌려줘도 받은 행 수만큼 전진해 전량을 센다", async () => {
    db.subscribers = subscribers(700)
    db.serverMaxRows = 300

    const response = await POST(sendRequest({ message: "안내", targetTags: ["demo_request"] }))
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.recipientCount).toBe(700)
    expect(db.ranges.map(([from]) => from)).toEqual([0, 300, 600, 700])
    expect(mocks.sendSmsMessages).not.toHaveBeenCalled()
  })

  it("정확히 500명은 보낸다 — 드라이런이면 simulated로 기록한다", async () => {
    db.subscribers = subscribers(500)

    const response = await POST(sendRequest({ message: "안내", targetTags: [] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.sendSmsMessages).toHaveBeenCalledTimes(1)
    expect(mocks.sendSmsMessages.mock.calls[0][0].messages).toHaveLength(500)
    expect(json).toMatchObject({ status: "simulated", recipientCount: 500, simulatedCount: 500, sentCount: 0 })
    expect(db.campaignInserts).toHaveLength(1)
    expect(db.campaignInserts[0]).toMatchObject({ status: "simulated", sent_at: null, recipient_count: 500 })
  })

  it("중복·무효 번호를 뺀 뒤 상한을 센다", async () => {
    db.subscribers = [
      { id: "1", phone: "010-1111-2222" },
      { id: "2", phone: "01011112222" },
      { id: "3", phone: "12-34" },
      { id: "4", phone: null },
    ]

    const response = await POST(sendRequest({ message: "안내", targetTags: [] }))

    expect(response.status).toBe(200)
    expect(mocks.sendSmsMessages.mock.calls[0][0].messages).toEqual([{ to: "010-1111-2222", text: "안내" }])
  })

  it("테스트 발송(1건)은 수신자 조회·상한과 무관하다", async () => {
    const response = await POST(sendRequest({ message: "안내", testMode: true, testPhone: "010-0000-0000" }))

    expect(response.status).toBe(200)
    expect(db.ranges).toEqual([])
    expect(mocks.sendSmsMessages.mock.calls[0][0].messages).toEqual([{ to: "010-0000-0000", text: "안내" }])
  })
})
