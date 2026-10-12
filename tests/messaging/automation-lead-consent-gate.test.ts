/**
 * CT11 — 자동화 세그먼트 발송(resolveSegmentRecipients)의 leads 분기 동의 게이트.
 *
 * 이전 leads 분기는 수신거부·동의를 보지 않아, 뉴스레터를 해지한 사람도 leads 행으로 다시
 * 캠페인 메일 대상에 들어갔고 동의한 적 없는 리드도 전부 포함됐다. 이제:
 * - 구독 행이 해지(active 아님)면 제외(대소문자 무시, 해지가 로그인 프로필 동의보다 우선)
 * - 동의 근거(구독 active 또는 user_profiles.marketing_consent)가 없으면 제외
 * - 동의 근거 조회가 실패하면 leads 분기 전체 제외(미결정 = 거부)
 * 실제 발송 함수(executeRule)는 부르지 않는다 — 이메일 모듈은 호출되면 실패하는 목이다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>
interface QueryState {
  table: string
  select: string
  filters: Array<[string, ...unknown[]]>
  range: [number, number] | null
}

const db = vi.hoisted(() => ({
  leads: [] as Row[],
  subscribers: [] as Row[],
  profiles: [] as Row[],
  failConsent: false,
  queries: [] as QueryState[],
}))

function pageOf(rows: Row[], state: QueryState) {
  if (!state.range) return rows
  const [from, to] = state.range
  return rows.slice(from, to + 1)
}

function resolve(state: QueryState): { data: Row[] | null; error: { message: string } | null } {
  if (state.table === "leads") return { data: db.leads, error: null }
  if (state.table === "newsletter_subscribers") {
    // 동의 인덱스 조회(모든 상태, 페이지)와 구독자 분기(active만, 페이지 없음)를 가른다.
    if (state.range) {
      if (db.failConsent) return { data: null, error: { message: "consent down" } }
      return { data: pageOf(db.subscribers, state), error: null }
    }
    return { data: db.subscribers.filter((row) => row.status === "active"), error: null }
  }
  if (state.table === "user_profiles") {
    if (db.failConsent) return { data: null, error: { message: "consent down" } }
    return { data: pageOf(db.profiles.filter((row) => row.marketing_consent === true), state), error: null }
  }
  return { data: [], error: null }
}

function builder(table: string) {
  const state: QueryState = { table, select: "", filters: [], range: null }
  db.queries.push(state)
  const chain: Record<string, unknown> = {}
  const passthrough = (name: string) => (...args: unknown[]) => {
    state.filters.push([name, ...args])
    return chain
  }
  Object.assign(chain, {
    select: (cols: string) => {
      state.select = cols
      return chain
    },
    eq: passthrough("eq"),
    not: passthrough("not"),
    in: passthrough("in"),
    gte: passthrough("gte"),
    overlaps: passthrough("overlaps"),
    order: passthrough("order"),
    range: (from: number, to: number) => {
      state.range = [from, to]
      return chain
    },
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolve(state)).then(onFulfilled, onRejected),
  })
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (table: string) => builder(table) }),
}))
vi.mock("@/lib/repositories/automation", () => ({
  getActiveRulesByTrigger: vi.fn(),
  getRuleById: vi.fn(),
  createLog: vi.fn(),
  updateLogStatus: vi.fn(),
}))
vi.mock("@/lib/repositories/automation-delay", () => ({ createDelayQueueItem: vi.fn() }))
vi.mock("@/lib/email", () => ({
  sendBatchEmail: vi.fn(() => {
    throw new Error("테스트에서 실제 발송 금지")
  }),
  wrapCampaignHtml: vi.fn(),
}))
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent: vi.fn() }))
vi.mock("@/lib/server/security-tokens", () => ({ createUnsubscribeUrl: vi.fn() }))

import { isLeadMarketingEligible, resolveSegmentRecipients } from "@/lib/automation-engine"
import { sendBatchEmail } from "@/lib/email"

function lead(email: string, source = "contact_page"): Row {
  return { email, name: email.split("@")[0], org: null, role: null, source, status: "new", created_at: "2026-09-01" }
}

beforeEach(() => {
  db.leads = []
  db.subscribers = []
  db.profiles = []
  db.failConsent = false
  db.queries = []
})

describe("isLeadMarketingEligible", () => {
  const index = {
    subscriberStatusByEmail: new Map<string, "active" | "blocked">([
      ["active@x.com", "active"],
      ["gone@x.com", "blocked"],
    ]),
    profileConsentEmails: new Set(["profile@x.com", "gone@x.com"]),
  }

  it("구독 active 또는 로그인 동의가 있으면 허용, 해지는 로그인 동의보다 우선해 거부, 근거 없으면 거부", () => {
    expect(isLeadMarketingEligible("Active@X.com ", index)).toBe(true)
    expect(isLeadMarketingEligible("profile@x.com", index)).toBe(true)
    expect(isLeadMarketingEligible("gone@x.com", index)).toBe(false)
    expect(isLeadMarketingEligible("stranger@x.com", index)).toBe(false)
    expect(isLeadMarketingEligible("  ", index)).toBe(false)
  })
})

describe("resolveSegmentRecipients — leads 분기 동의 게이트", () => {
  it("해지자·동의 없는 리드를 빼고 동의 근거가 있는 리드만 넣는다(대소문자 무시)", async () => {
    db.leads = [
      lead("a@x.com"),
      lead("b@x.com"),
      lead("c@x.com"),
      lead("d@x.com"),
      lead("E@X.com"),
    ]
    db.subscribers = [
      { id: "1", email: "a@x.com", status: "active" },
      { id: "2", email: "b@x.com", status: "unsubscribed" },
      { id: "3", email: "e@x.com", status: "active" },
    ]
    db.profiles = [
      { id: "p1", email: "b@x.com", marketing_consent: true },
      { id: "p2", email: "c@x.com", marketing_consent: true },
      { id: "p3", email: "d@x.com", marketing_consent: false },
    ]

    const recipients = await resolveSegmentRecipients({ targetTable: "leads" })

    expect(recipients.map((r) => r.email)).toEqual(["a@x.com", "c@x.com", "E@X.com"])
    expect(sendBatchEmail).not.toHaveBeenCalled()
  })

  it("같은 이메일의 구독 행 중 하나라도 해지면 제외한다", async () => {
    db.leads = [lead("dup@x.com")]
    db.subscribers = [
      { id: "1", email: "dup@x.com", status: "active" },
      { id: "2", email: "DUP@x.com", status: "unsubscribed" },
    ]

    await expect(resolveSegmentRecipients({ targetTable: "leads" })).resolves.toEqual([])
  })

  it("both — 구독 해지자가 leads 행으로 다시 들어오지 않는다(원래 결함)", async () => {
    db.leads = [lead("gone@x.com"), lead("keep@x.com")]
    db.subscribers = [
      { id: "1", email: "gone@x.com", status: "unsubscribed", source: "newsletter" },
      { id: "2", email: "keep@x.com", status: "active", source: "newsletter" },
    ]

    const recipients = await resolveSegmentRecipients({ targetTable: "both" })

    // keep은 구독자 분기에서 한 번만(중복 제거), gone은 어디에도 없다.
    expect(recipients.map((r) => r.email)).toEqual(["keep@x.com"])
  })

  it("동의 근거 조회가 실패하면 leads 분기 전체를 뺀다(fail-closed) — 구독자 분기는 그대로", async () => {
    db.failConsent = true
    db.leads = [lead("a@x.com")]
    db.subscribers = [{ id: "1", email: "s@x.com", status: "active", source: "newsletter" }]

    const recipients = await resolveSegmentRecipients({ targetTable: "both" })

    expect(recipients.map((r) => r.email)).toEqual(["s@x.com"])
  })

  it("동의 인덱스는 range 페이지네이션으로 전량 읽는다 — 1,000행 뒤 해지도 반영된다", async () => {
    db.leads = [lead("late@x.com")]
    db.subscribers = [
      ...Array.from({ length: 1000 }, (_, i) => ({ id: String(i).padStart(5, "0"), email: `u${i}@x.com`, status: "active" })),
      { id: "99999", email: "late@x.com", status: "unsubscribed" },
    ]
    db.profiles = [{ id: "p1", email: "late@x.com", marketing_consent: true }]

    await expect(resolveSegmentRecipients({ targetTable: "leads" })).resolves.toEqual([])

    const subscriberPages = db.queries
      .filter((q) => q.table === "newsletter_subscribers" && q.range)
      .map((q) => q.range)
    expect(subscriberPages).toEqual([
      [0, 999],
      [1000, 1999],
      [1001, 2000],
    ])
  })

  it("리드 행이 없으면 동의 인덱스를 조회하지 않는다", async () => {
    await resolveSegmentRecipients({ targetTable: "leads" })
    expect(db.queries.filter((q) => q.table !== "leads")).toEqual([])
  })
})
