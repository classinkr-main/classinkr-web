// 고객 이력 찾기 — 가짜 저장소(DB·모델·네트워크 없음). 기관·사람 이름은 가짜("가나학원", "담당자 A").
import { describe, expect, it, vi } from "vitest"

import {
  CUSTOMER_HISTORY_TAGS,
  customerHistoryBlocks,
  customerHistoryTagsOf,
  findCustomerHistory,
  type CustomerHistoryDeps,
  type CustomerHistoryEventRecord,
  type CustomerHistoryProfile,
} from "@/lib/admin-ai/server/customer-history"
import { collectTurn, inheritCustomerSubject } from "@/lib/admin-ai/server/orchestrator"
import { routeMessage } from "@/lib/admin-ai/server/router"
import type { AiBlock, ReadCard } from "@/lib/admin-ai/types"
import type { CustomerRef } from "@/lib/internal-cs-chat/contact"

import { fakeDeps, STAFF_ACTOR } from "./fakes"

const NOW = Date.UTC(2026, 10, 26, 3) // 2026-11-26 12:00 KST
const GANA: CustomerRef = { key: "neo:acc-100", name: "가나학원", href: "/admin/crm/customers/accounts?account=acc-100" }
const DARA: CustomerRef = { key: "lead:lead-200", name: "다라에듀", href: "/admin/crm/customers/leads?lead=lead-200" }

function event(overrides: Partial<CustomerHistoryEventRecord> = {}): CustomerHistoryEventRecord {
  return {
    id: "ev-1",
    occurredAt: "2026-11-20T01:00:00.000Z",
    title: "카드 결제 실패 재처리",
    summary: "정기 결제 카드가 만료돼 두 번 실패했다.",
    nextActions: [{ title: "새 카드 등록 안내", dueAt: "2026-11-28T00:00:00.000Z", done: false }],
    sourceType: "manual_note",
    sourceId: "gana-billing-2026-11.md",
    tags: ["billing"],
    ...overrides,
  }
}

function deps(options: {
  inText?: CustomerRef[]
  profile?: CustomerHistoryProfile | null
  events?: CustomerHistoryEventRecord[]
  total?: number
  failEvents?: boolean
  failProfile?: boolean
  unavailable?: string
} = {}) {
  const listEvents = vi.fn<CustomerHistoryDeps["listEvents"]>(async () => {
    if (options.failEvents) throw new Error("db_down")
    const events = options.events ?? [event()]
    return { events, total: options.total ?? events.length, unavailable: options.unavailable ?? null }
  })
  const loadProfile = vi.fn<CustomerHistoryDeps["loadProfile"]>(async () => {
    if (options.failProfile) throw new Error("db_down")
    return options.profile === undefined
      ? { targets: [{ targetType: "neo_account", targetId: "acc-100" }], owner: { name: "담당자 A", from: "neo" }, uid: "100200" }
      : options.profile
  })
  const findCustomersInText = vi.fn(async (question: string) => (options.inText ?? [GANA]).filter((c) => question.includes(c.name)))
  const built: CustomerHistoryDeps = { findCustomersInText, loadProfile, listEvents }
  return { deps: built, listEvents, loadProfile, findCustomersInText }
}

const viewer = { canReadContent: true }

describe("customerHistoryTagsOf — 주제 말 → 태그", () => {
  it("결제·견적·AS·API·CS 케이스 낱말을 태그로, 없으면 다섯 태그 전부", () => {
    expect(customerHistoryTagsOf("가나학원 결제·견적 문제 있었나?")).toEqual({ tags: ["billing", "quote"], all: false })
    expect(customerHistoryTagsOf("가나학원 칠판 고장 있었나?").tags).toEqual(["as"])
    expect(customerHistoryTagsOf("가나학원 API 연동 문제").tags).toEqual(["api"])
    expect(customerHistoryTagsOf("가나학원 CS 케이스 있었나?").tags).toEqual(["cs-case"])
    expect(customerHistoryTagsOf("가나학원 이슈 있었나?")).toEqual({ tags: [...CUSTOMER_HISTORY_TAGS], all: true })
    // 영문 낱말 속 as 는 AS 가 아니다
    expect(customerHistoryTagsOf("classin 이슈").all).toBe(true)
  })
})

describe("findCustomerHistory — 결정형 찾기", () => {
  it("질문 속 고객의 태그 기록과 담당 영업(NEO 스냅숏)을 준다 — 기록 대상·태그·상한을 저장소에 넘긴다", async () => {
    const fake = deps()
    const result = await findCustomerHistory("가나학원 결제 문제 있었나?", fake.deps, { actor: viewer, now: NOW })
    expect(result.status).toBe("ok")
    expect(result.customer).toEqual({ name: "가나학원", key: "neo:acc-100" })
    expect(result.customerFrom).toBe("question")
    expect(result.owner).toEqual({ name: "담당자 A", from: "neo" })
    expect(result.uid).toBe("100200")
    expect(fake.listEvents).toHaveBeenCalledWith({ targets: [{ targetType: "neo_account", targetId: "acc-100" }], tags: ["billing"], limit: 5 })
    expect(result.items).toEqual([
      {
        id: "ev-1",
        date: "2026-11-20",
        title: "카드 결제 실패 재처리",
        summary: "정기 결제 카드가 만료돼 두 번 실패했다.",
        nextAction: "새 카드 등록 안내(2026-11-28까지)",
        source: "수기 기록 · gana-billing-2026-11.md",
        tags: ["billing"],
      },
    ])
  })

  it("질문에 고객이 없으면 열린 화면의 고객 — 둘 다 없으면 no_customer(저장소를 부르지 않는다)", async () => {
    const page = deps({ inText: [] })
    const fromPage = await findCustomerHistory("이 고객 견적 이슈 있었나?", page.deps, { openCustomer: DARA, actor: viewer, now: NOW })
    expect(fromPage.customerFrom).toBe("page")
    expect(page.loadProfile).toHaveBeenCalledWith(DARA)

    const none = deps({ inText: [] })
    const missing = await findCustomerHistory("결제 문제 있었나?", none.deps, { actor: viewer, now: NOW })
    expect(missing.status).toBe("no_customer")
    expect(none.loadProfile).not.toHaveBeenCalled()
    expect(none.listEvents).not.toHaveBeenCalled()
  })

  it("기간 말은 KST 하루 경계로 저장소에 넘기고, 해석 못 한 기간 말은 밝힌다", async () => {
    const fake = deps()
    const result = await findCustomerHistory("지난달 가나학원 결제 문제 있었나?", fake.deps, { actor: viewer, now: NOW })
    expect(result.period?.from).toBe("2026-10-01")
    expect(fake.listEvents.mock.calls[0][0]).toMatchObject({ from: "2026-09-30T15:00:00.000Z", to: "2026-10-31T14:59:59.999Z" })

    const odd = await findCustomerHistory("3월 가나학원 결제 문제 있었나?", deps().deps, { actor: viewer, now: NOW })
    expect(odd.periodUnsupported).toBe(true)
  })

  it("기록 글을 볼 수 없는 역할이면 건수만 — 제목·요지·다음 할 일이 없다(담당 영업은 보인다)", async () => {
    const fake = deps({ total: 3 })
    const result = await findCustomerHistory("가나학원 결제 문제 있었나?", fake.deps, { actor: { canReadContent: false }, now: NOW })
    expect(result.restricted).toBe(true)
    expect(result.items).toEqual([])
    expect(result.total).toBe(3)
    const text = JSON.stringify(customerHistoryBlocks(result))
    expect(text).toContain("3건이 있습니다")
    expect(text).toContain("담당자 A")
    expect(text).not.toMatch(/카드 결제 실패|새 카드 등록|gana-billing/)
  })

  it("담당 미지정·담당 조회 실패·리드 담당을 구분해 말한다", async () => {
    const unassigned = await findCustomerHistory(
      "가나학원 결제 문제 있었나?",
      deps({ profile: { targets: [{ targetType: "neo_account", targetId: "acc-100" }], owner: { name: "담당 미지정", from: "neo" } } }).deps,
      { actor: viewer, now: NOW }
    )
    expect(unassigned.owner).toBeNull()
    expect(JSON.stringify(customerHistoryBlocks(unassigned))).toContain("담당 영업은 지정되지 않았습니다")

    const failed = await findCustomerHistory(
      "가나학원 결제 문제 있었나?",
      deps({ profile: { targets: [{ targetType: "neo_account", targetId: "acc-100" }], owner: null, ownerFailed: true } }).deps,
      { actor: viewer, now: NOW }
    )
    expect(JSON.stringify(customerHistoryBlocks(failed))).toContain("담당 영업을 읽지 못했습니다")

    const lead = await findCustomerHistory(
      "다라에듀 견적 문제 있었나?",
      deps({ inText: [DARA], profile: { targets: [{ targetType: "lead", targetId: "lead-200" }], owner: { name: "담당자 B", from: "lead" } } }).deps,
      { actor: viewer, now: NOW }
    )
    expect(JSON.stringify(customerHistoryBlocks(lead))).toContain("담당 영업: 담당자 B(리드 담당)")
  })

  it("기록 조회 실패는 0건이 아니라 '읽지 못했습니다' — 담당 영업은 그대로 싣는다", async () => {
    const result = await findCustomerHistory("가나학원 결제 문제 있었나?", deps({ failEvents: true }).deps, { actor: viewer, now: NOW })
    expect(result.eventsFailed).toBe(true)
    const [first] = customerHistoryBlocks(result)
    expect(first).toMatchObject({ kind: "text" })
    expect((first as { text: string }).text).toContain("활동 기록을 읽지 못했습니다")
    expect((first as { text: string }).text).toContain("담당자 A")
  })

  it("기록 표가 없으면(마이그레이션 전) 그 사실을 말한다 — '기록이 없습니다'라 하지 않는다", async () => {
    const result = await findCustomerHistory("가나학원 결제 문제 있었나?", deps({ events: [], unavailable: "CRM 기록 DB 마이그레이션이 아직 적용되지 않았습니다." }).deps, {
      actor: viewer,
      now: NOW,
    })
    const text = JSON.stringify(customerHistoryBlocks(result))
    expect(text).toContain("아직 읽을 수 없습니다")
    expect(text).not.toContain("기록이 없습니다")
  })

  it("프로필 조회 실패는 failed, 리드·NEO 가 아닌 고객 키는 unsupported", async () => {
    const failed = await findCustomerHistory("가나학원 결제 문제 있었나?", deps({ failProfile: true }).deps, { actor: viewer, now: NOW })
    expect(failed.status).toBe("failed")
    expect(customerHistoryBlocks(failed)[0]).toMatchObject({ kind: "deny", card: { title: "고객 이력을 읽지 못했습니다" } })

    const portal = await findCustomerHistory("가나학원 결제 문제 있었나?", deps({ profile: null }).deps, { actor: viewer, now: NOW })
    expect(portal.status).toBe("unsupported")
  })

  it("요지의 연락처·호칭 앞 이름은 가린다, 채널 id 같은 source_id 는 출처에 싣지 않는다", async () => {
    const result = await findCustomerHistory(
      "가나학원 결제 문제 있었나?",
      deps({
        events: [
          event({ summary: "샘플이 원장님 010-1234-5678 로 다시 연락 요청", sourceType: "site_inflow", sourceId: "channel:abc" }),
        ],
      }).deps,
      { actor: viewer, now: NOW }
    )
    const item = result.items[0]
    expect(item.summary).not.toContain("010-1234-5678")
    expect(item.summary).not.toContain("샘플이 원장님")
    expect(item.source).toBe("홈페이지 유입")
  })

  it("같은 질문에 걸린 다른 고객은 이름만 밝히고 첫 고객만 읽는다", async () => {
    const fake = deps({ inText: [GANA, { ...DARA, name: "가나학원 분원" }] })
    const result = await findCustomerHistory("가나학원 분원 결제 문제 있었나?", fake.deps, { actor: viewer, now: NOW })
    expect(fake.loadProfile).toHaveBeenCalledTimes(1)
    expect(result.alternatives).toEqual(["가나학원 분원"])
  })
})

describe("customerHistoryBlocks — 카드", () => {
  it("결론 한 줄(건수·최근 날짜·담당 영업) + 조회 카드(날짜·기록·다음 할 일·출처, 내부용 표시)", async () => {
    const result = await findCustomerHistory("가나학원 결제·견적 문제 있었나?", deps({ total: 7 }).deps, { actor: viewer, now: NOW })
    const [text, read] = customerHistoryBlocks(result) as [Extract<AiBlock, { kind: "text" }>, Extract<AiBlock, { kind: "read" }>]
    expect(text.text).toBe("가나학원 결제·견적 관련 기록 7건을 찾았습니다 — 최근 2026-11-20. 담당 영업: 담당자 A(NEO 기준).")
    const card: ReadCard = read.card
    expect(card.title).toBe("고객 이력")
    expect(card.target).toEqual({ label: "가나학원", meta: "결제·견적 · 7건 · UID 100200" })
    expect(card.table?.head).toEqual(["날짜", "기록", "다음 할 일", "출처"])
    expect(card.table?.rows[0]).toEqual([
      "2026-11-20",
      "카드 결제 실패 재처리 — 정기 결제 카드가 만료돼 두 번 실패했다.",
      "새 카드 등록 안내(2026-11-28까지)",
      "수기 기록 · gana-billing-2026-11.md",
    ])
    expect(card.internalOnly).toBe(true)
    expect(card.note).toContain("나머지 6건")
    expect(card.openHref).toBe("/admin/crm/customers/unified")
  })

  it("기록이 없으면 없다고 말한다(기간 포함)", async () => {
    const result = await findCustomerHistory("이번 달 가나학원 AS 문제 있었나?", deps({ events: [] }).deps, { actor: viewer, now: NOW })
    const [text] = customerHistoryBlocks(result) as [Extract<AiBlock, { kind: "text" }>]
    expect(text.text).toBe("가나학원에 AS 관련 기록이 없습니다(이번 달). 담당 영업: 담당자 A(NEO 기준).")
  })
})

describe("조율기 — 고객 이력 갈래", () => {
  const input = (text: string) => ({ text, context: null, actor: STAFF_ACTOR, now: NOW })

  it("고객 이력 질문은 고객 이력 찾기를 부르고 결론·카드를 낸다", async () => {
    const fake = deps()
    const customerHistory = vi.fn((question: string, openCustomer: CustomerRef | null, now: number) =>
      findCustomerHistory(question, fake.deps, { openCustomer, actor: viewer, now })
    )
    const { blocks, steps } = await collectTurn(input("가나학원 결제 문제 있었나?"), { ...fakeDeps().deps, customerHistory })
    expect(customerHistory).toHaveBeenCalledWith("가나학원 결제 문제 있었나?", null, NOW)
    expect(steps).toContain("고객 이력 찾기")
    expect(blocks.map((block) => block.kind)).toEqual(["text", "read"])
  })

  it("막음 카드가 있으면 찾기를 부르지 않는다, 연결이 없으면 고객 화면 안내", async () => {
    const customerHistory = vi.fn()
    const denied: AiBlock = { kind: "deny", card: { title: "1:1 로 물어봐 주세요", target: { label: "고객 이력", meta: "단체방" }, text: "막음" } }
    const blocked = await collectTurn(input("가나학원 결제 문제 있었나?"), { ...fakeDeps().deps, customerHistory, customerHistoryDenied: denied })
    expect(blocked.blocks).toEqual([denied])
    expect(customerHistory).not.toHaveBeenCalled()

    const unwired = await collectTurn(input("가나학원 결제 문제 있었나?"), fakeDeps().deps)
    expect(unwired.blocks[0]).toMatchObject({ kind: "text" })
    expect(unwired.blocks[1]).toMatchObject({ kind: "links", card: { items: [{ linkId: "admin:crm-customers-unified" }] } })
  })

  it("'… 문제 있었나? 누가 맡아?' — 담당 질문이 앞 조각의 고객을 잇는다(다른 갈래 뒤는 그대로)", async () => {
    const seen: string[] = []
    const base = fakeDeps().deps
    const resolveContact = vi.fn(async (question: string, openCustomer: CustomerRef | null) => {
      seen.push(question)
      return base.resolveContact(question, openCustomer)
    })
    const fake = deps()
    await collectTurn(input("가나학원 결제 문제 있었나? 누가 맡아?"), {
      ...base,
      resolveContact,
      customerHistory: (question, openCustomer, now) => findCustomerHistory(question, fake.deps, { openCustomer, actor: viewer, now }),
    })
    expect(seen).toEqual(["가나학원 결제 문제 있었나? 누가 맡아?"])

    const [knowledgeAsk, contactAsk] = routeMessage("환불 규정 알려 줘. 누가 맡아?")
    expect(inheritCustomerSubject(contactAsk, knowledgeAsk).text).toBe(contactAsk.text)
    const [historyAsk, ownAsk] = routeMessage("가나학원 결제 문제 있었나? 다라에듀 담당 누구야?")
    expect(inheritCustomerSubject(ownAsk, historyAsk).text).toBe(ownAsk.text)
  })
})
