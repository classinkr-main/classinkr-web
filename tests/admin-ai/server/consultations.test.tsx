// 갈매봇 "상담 내역 찾기" 시험 — 가짜 저장소(DB·모델·네트워크 없음). 기관 이름은 가짜이고 사람 이름·실제 연락처가 없다.
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ConsultationsCardView } from "@/components/admin/ai/cards/ConsultationsCard"
import { buildAdminAiAnnouncement } from "@/lib/admin-ai/a11y"
import { buildDeepLink, isAllowedAdminHref, isAllowedDeepLink } from "@/lib/admin-ai/links"
import {
  consultationKeywords,
  consultationsBlock,
  countRelatedConsultations,
  findConsultations,
  MAX_CONSULTATION_ITEMS,
  type ConsultationDeps,
  type ConsultationRecord,
} from "@/lib/admin-ai/server/consultations"
import { answerKnowledge, consultationAskOf } from "@/lib/admin-ai/server/knowledge"
import { collectTurn, type TurnInput } from "@/lib/admin-ai/server/orchestrator"
import { routeMessage } from "@/lib/admin-ai/server/router"
import { homeSuggestions } from "@/lib/admin-ai/suggestions"
import { INITIAL_ADMIN_AI_STATE, type AdminAiState } from "@/lib/admin-ai/store"
import type { ConsultationsCard } from "@/lib/admin-ai/types"

import { STAFF_ACTOR, fakeDeps, fakeEvidence } from "./fakes"

const NOW = Date.parse("2026-11-25T01:00:00Z") // KST 11월 25일 10시
const UUID_A = "0f8b6a52-3c1d-4e7a-9b2f-1a2b3c4d5e6f"
const SAMPLE_PHONE = "010-1234-5678"

function ch(id: string, at: string, org: string | null, subject: string, extra: Partial<ConsultationRecord> = {}): ConsultationRecord {
  return { id, source: "channel_talk", at, org, person: "고객(샘플)", leadId: null, subject, tags: [], status: "opened", ...extra }
}

const CHANNEL: ConsultationRecord[] = [
  ch("ch_a1", "2026-11-20T03:00:00Z", "가나학원", `녹화가 안 돼요. 연락은 ${SAMPLE_PHONE} 로 주세요`, { leadId: "lead-1", tags: ["녹화"] }),
  ch("ch_a2", "2026-10-15T03:00:00Z", "가나학원", "환불 문의드립니다", { leadId: "lead-1", status: "closed" }),
  ch("ch_a3", "2026-11-10T03:00:00Z", "다라에듀", "카메라 화질이 흐려요", { status: "snoozed" }),
  ...Array.from({ length: 7 }, (_, i) => ch(`ch_r${i}`, `2026-11-${String(10 + i).padStart(2, "0")}T03:00:00Z`, "마바학원", `환불 요청 ${i + 1}번째`)),
  ch("bad id/../x", "2026-11-01T03:00:00Z", "사바어학원", "결제 확인 부탁"),
]

const INTERNAL: ConsultationRecord[] = [
  { id: UUID_A, source: "internal_cs", at: "2026-11-22T03:00:00Z", org: null, person: null, leadId: null, subject: "가나학원 녹화 오류 본사 확인", tags: [], status: "waiting_review" },
]

function fakeRepo(overrides: Partial<ConsultationDeps> = {}): ConsultationDeps & { channelCalls: number[] } {
  const channelCalls: number[] = []
  return {
    channelCalls,
    channelTalk: async (limit) => {
      channelCalls.push(limit)
      return { records: CHANNEL.slice(0, limit), limit }
    },
    internalCs: async (limit) => ({ records: INTERNAL.slice(0, limit), limit }),
    findCustomersInText: async (question) => (question.includes("가나학원") ? [{ key: "lead:lead-1", name: "가나학원", href: "/admin/crm/customers/unified" }] : []),
    ...overrides,
  }
}

const READER = { canReadContent: true }

afterEach(() => vi.restoreAllMocks())

describe("findConsultations — 고객·낱말·기간", () => {
  it("고객 + 기간: '가나학원 지난달에 뭐 문의했지?' → 지난달 가나학원 상담만", async () => {
    const result = await findConsultations("가나학원 지난달에 뭐 문의했지?", fakeRepo(), { actor: READER, now: NOW })
    expect(result.basis.customer).toBe("가나학원")
    expect(result.basis.customerFrom).toBe("question")
    expect(result.basis.keywords).toEqual([])
    expect(result.period?.from).toBe("2026-10-01")
    expect(result.period?.to).toBe("2026-10-31")
    expect(result.items.map((item) => item.id)).toEqual(["ch_a2"])
    expect(result.items[0]).toMatchObject({ date: "2026-10-15", who: "가나학원 · 고객(샘플)", status: "종료", summary: "환불 문의드립니다" })
    const block = consultationsBlock(result)
    expect(block.kind === "consultations" && block.card.headline).toBe("가나학원 상담 1건을 찾았습니다(지난달).")
  })

  it("낱말: '녹화 안 된다는 상담 최근에 있었나?' → 두 출처에서 최신순, 요지는 가린 글", async () => {
    const result = await findConsultations("녹화 안 된다는 상담 최근에 있었나?", fakeRepo(), { actor: READER, now: NOW })
    expect(result.basis.keywords).toEqual(["녹화"])
    expect(result.items.map((item) => `${item.source}:${item.id}`)).toEqual([`internal_cs:${UUID_A}`, "channel_talk:ch_a1"])
    const channelItem = result.items[1]
    expect(channelItem.summary).not.toContain(SAMPLE_PHONE)
    expect(channelItem.summary).toContain("[phone]")
    expect(result.items[0]).toMatchObject({ who: "사내 CS 대화", status: "검토 대기", href: `/admin/cs-chatbot?conversation=${UUID_A}` })
    expect(channelItem.href).toBe("/admin/channel-talk?conversation=ch_a1")
  })

  it("열린 고객: '이 고객 최근 상담 보여 줘' → 열린 화면의 고객(리드 id·이름)으로 찾는다", async () => {
    const openCustomer = { key: "lead:lead-1", name: "가나학원", href: "/admin/crm/customers/unified" }
    const result = await findConsultations("이 고객 최근 상담 보여 줘", fakeRepo({ findCustomersInText: async () => [] }), { openCustomer, actor: READER, now: NOW })
    expect(result.basis.customerFrom).toBe("page")
    expect(result.items.map((item) => item.id)).toEqual([UUID_A, "ch_a1", "ch_a2"])
  })

  it("고객 + 낱말: '가나학원 환불 문의 있었나?' → 둘 다 맞는 상담만", async () => {
    const result = await findConsultations("가나학원 환불 문의 있었나?", fakeRepo(), { actor: READER, now: NOW })
    expect(result.basis.keywords).toEqual(["환불"])
    expect(result.items.map((item) => item.id)).toEqual(["ch_a2"])
  })

  it("5건이 넘으면 최신 5건과 more — 카드에 나머지 건수", async () => {
    const result = await findConsultations("환불 문의 들어온 거 있어?", fakeRepo(), { actor: READER, now: NOW })
    expect(result.total).toBe(8)
    expect(result.items).toHaveLength(MAX_CONSULTATION_ITEMS)
    expect(result.more).toBe(3)
    expect(result.items[0].id).toBe("ch_r6")
    const block = consultationsBlock(result)
    if (block.kind !== "consultations") throw new Error("consultations block expected")
    expect(block.card.moreCount).toBe(3)
    expect(block.card.headline).toBe("'환불' 관련 상담 8건을 찾았습니다.")
    expect(block.card.note).toContain("나머지 3건")
  })

  it("못 찾으면 '찾지 못했습니다 — 조건: …'과 상담 화면 링크", async () => {
    const result = await findConsultations("우주선 문의 들어온 거 있어?", fakeRepo(), { actor: READER, now: NOW })
    expect(result.total).toBe(0)
    const block = consultationsBlock(result)
    if (block.kind !== "consultations") throw new Error("consultations block expected")
    expect(block.card.headline).toMatch(/^찾지 못했습니다 — 조건: 낱말 '우주선'/)
    expect(block.card.openLinkId).toBe("admin:channel-talk")
    expect(block.card.items).toHaveLength(0)
  })

  it("상한까지 읽었으면 '최근 상담 안에서'를 밝힌다", async () => {
    const result = await findConsultations("환불 문의 있어?", fakeRepo({ scanLimit: 3 }), { actor: READER, now: NOW })
    expect(result.basis.capped).toBe(true)
    expect(consultationsBlock(result).kind === "consultations" && (consultationsBlock(result) as { card: ConsultationsCard }).card.basis).toContain("최근 상담 안에서")
  })

  it("해석하지 못한 기간 말은 기간 없이 찾고 그렇다고 밝힌다", async () => {
    const result = await findConsultations("3월에 환불 문의 있었나?", fakeRepo(), { actor: READER, now: NOW })
    expect(result.periodUnsupported).toBe(true)
    expect(result.period).toBeNull()
    const block = consultationsBlock(result)
    expect(block.kind === "consultations" && block.card.note).toContain("기간 말을 해석하지 못해")
  })

  it("한 출처가 실패하면 나머지로 답하고 읽지 못한 출처를 알린다", async () => {
    const repo = fakeRepo({
      internalCs: async () => {
        throw new Error("down")
      },
    })
    const result = await findConsultations("녹화 문의 있었나?", repo, { actor: READER, now: NOW })
    expect(result.failed).toEqual(["internal_cs"])
    expect(result.items.map((item) => item.id)).toEqual(["ch_a1"])
    const block = consultationsBlock(result)
    expect(block.kind === "consultations" && block.card.note).toContain("내부 CS 상담을 읽지 못했습니다")
  })

  it("설정되지 않은 출처(null)는 실패가 아니다", async () => {
    const result = await findConsultations("녹화 문의 있었나?", fakeRepo({ internalCs: async () => null }), { actor: READER, now: NOW })
    expect(result.failed).toEqual([])
    expect(result.basis.scanned.map((entry) => entry.source)).toEqual(["channel_talk"])
  })

  it("임베딩 검색은 주입했을 때만 — 읽은 최근 상담 안의 것만 더한다", async () => {
    const semantic = vi.fn(async () => [
      { id: "ch_a3", source: "channel_talk" as const },
      { id: "not-in-scan", source: "channel_talk" as const },
    ])
    const without = await findConsultations("화면이 뿌옇다는 문의 있었나?", fakeRepo(), { actor: READER, now: NOW })
    expect(without.total).toBe(0)
    expect(without.basis.semantic).toBe(false)
    const withSemantic = await findConsultations("화면이 뿌옇다는 문의 있었나?", fakeRepo({ semantic }), { actor: READER, now: NOW })
    expect(semantic).toHaveBeenCalledTimes(1)
    expect(withSemantic.basis.semantic).toBe(true)
    expect(withSemantic.items.map((item) => item.id)).toEqual(["ch_a3"])
  })

  it("링크는 꼴이 맞는 id 에만 — 이상한 id 의 상담은 [열기]가 없다", async () => {
    const result = await findConsultations("사바어학원 상담 보여 줘", fakeRepo(), { actor: READER, now: NOW })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].href).toBeUndefined()
  })

  it("로그를 남기지 않는다(질문·상담 글이 콘솔에 닿지 않는다)", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "info")]
    await findConsultations("가나학원 녹화 문의 있었나?", fakeRepo({ internalCs: async () => Promise.reject(new Error("down")) }), { actor: READER, now: NOW })
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

describe("권한 — 상담 글을 볼 수 없는 역할", () => {
  it("건수만 내고 목록(누가·요지·링크)은 싣지 않는다 + CS 담당 안내", async () => {
    const result = await findConsultations("녹화 문의 있었나?", fakeRepo(), { actor: { canReadContent: false }, now: NOW })
    expect(result.restricted).toBe(true)
    expect(result.total).toBe(2)
    expect(result.items).toEqual([])
    const block = consultationsBlock(result)
    if (block.kind !== "consultations") throw new Error("consultations block expected")
    expect(block.card.headline).toBe("'녹화' 관련 상담 2건이 있습니다.")
    expect(block.card.note).toContain("CS 담당")
    const json = JSON.stringify(block)
    expect(json).not.toContain("가나학원")
    expect(json).not.toContain("녹화가 안 돼요")
    expect(json).not.toContain("conversation=")
  })
})

describe("낱말 고르기", () => {
  it("상담을 가리키는 말·묻는 꼴·기간 말·고객 이름은 낱말이 아니다", () => {
    expect(consultationKeywords("가나학원 지난달에 뭐 문의했지?", ["가나학원"]).map((k) => k.word)).toEqual([])
    expect(consultationKeywords("최근 30일 녹화 문의 찾아 줘").map((k) => k.word)).toEqual(["녹화"])
    expect(consultationKeywords("로그인 오류 채팅 들어온 거 있나?").map((k) => k.word)).toEqual(["로그인", "오류"])
  })

  it("관련 상담 건수(묻기 답 줄) — 낱말이 없으면 null", async () => {
    expect(await countRelatedConsultations("수업 녹화 방법", fakeRepo())).toBe(2)
    expect(await countRelatedConsultations("어떻게 해?", fakeRepo())).toBeNull()
  })
})

describe("링크 관문 — 등록된 화면 + 허용된 쿼리 키만", () => {
  it("검증된 id 만 딥링크가 된다", () => {
    expect(buildDeepLink("channel_talk_conversation", "ch_a1")).toBe("/admin/channel-talk?conversation=ch_a1")
    expect(buildDeepLink("internal_cs_conversation", UUID_A)).toBe(`/admin/cs-chatbot?conversation=${UUID_A}`)
    expect(buildDeepLink("internal_cs_conversation", "ch_a1")).toBeUndefined()
    expect(buildDeepLink("channel_talk_conversation", "../../x")).toBeUndefined()
    expect(buildDeepLink("channel_talk_conversation", 42)).toBeUndefined()
  })

  it("허용 밖 쿼리·경로·꼴은 거절한다", () => {
    expect(isAllowedDeepLink("/admin/channel-talk?conversation=ch_a1")).toBe(true)
    for (const href of [
      "/admin/channel-talk?conversation=ch_a1&tab=x",
      "/admin/channel-talk?evil=1",
      "/admin/channel-talk?conversation=ch%2F..",
      "/admin/quotes?conversation=ch_a1",
      "/admin/cs-chatbot?conversation=ch_a1",
      "/admin/channel-talk?conversation=ch_a1#x",
      "https://example.com/admin/channel-talk?conversation=ch_a1",
      "//example.com/admin/channel-talk?conversation=ch_a1",
      "/admin/channel-talk?Conversation=ch_a1",
      "/admin/channel-talk",
    ]) {
      expect(isAllowedDeepLink(href), href).toBe(false)
    }
    expect(isAllowedAdminHref("/admin/channel-talk")).toBe(true)
    expect(isAllowedAdminHref("/admin/channel-talk?conversation=ch_a1&x=1")).toBe(false)
  })
})

describe("묻기 답의 '관련 상담 n건' 줄", () => {
  it("건수와 상담 내역 갈래로 가는 추천만 — 상담 글은 섞지 않는다", async () => {
    const blocks = await answerKnowledge("수업 녹화 방법", {
      evidence: async (q) => fakeEvidence(q),
      consultationCount: async () => 3,
      contact: async () => ({ title: "담당자", target: { label: "", meta: "" } }),
    })
    const answer = blocks[0]
    if (answer.kind !== "answer") throw new Error("answer expected")
    const line = answer.card.sources.find((source) => source.kind === "consultation")
    expect(line?.title).toBe("관련 상담 3건")
    expect(line?.where).toContain("상담 내역 보기")
    expect(line?.linkId).toBe("admin:channel-talk")
    const ask = consultationAskOf("수업 녹화 방법")
    expect(routeMessage(ask).map((d) => d.branch)).toEqual(["consultations"])
  })
})

describe("조율기 — 상담 내역 갈래", () => {
  const turn = (text: string, extra: Partial<TurnInput> = {}): TurnInput => ({ text, context: null, actor: STAFF_ACTOR, now: NOW, ...extra })

  it("상담 내역 질문은 상담 카드 하나를 내고, 열린 고객을 넘긴다", async () => {
    const { deps } = fakeDeps()
    const seen: Array<string | null> = []
    deps.consultations = async (question, openCustomer, now) => {
      seen.push(openCustomer?.key ?? null)
      return findConsultations(question, fakeRepo(), { openCustomer, actor: READER, now })
    }
    const context = { path: "/admin/crm/customers/unified", label: "고객", entity: { type: "lead" as const, id: "lead-1", label: "가나학원" } }
    const result = await collectTurn(turn("이 고객 최근 상담 보여 줘", { context }), deps)
    expect(result.blocks.map((b) => b.kind)).toEqual(["consultations"])
    expect(seen).toEqual(["lead:lead-1"])
    expect(result.steps).toContain("상담 내역 찾기")
  })

  it("상담 내역 연결이 없으면 상담 화면 안내만", async () => {
    const { deps } = fakeDeps()
    delete deps.consultations
    const result = await collectTurn(turn("환불 문의 들어온 거 있어?"), deps)
    expect(result.blocks.map((b) => b.kind)).toEqual(["text", "links"])
  })

  it("실제 모드 첫 화면에 '상담 내역 찾기' 추천이 있고 이 갈래로 간다", () => {
    const { ask } = homeSuggestions("/admin", "live")
    const item = ask.find((entry) => entry.label === "상담 내역 찾기")
    expect(item).toBeDefined()
    expect(routeMessage(item!.text).map((d) => d.branch)).toEqual(["consultations"])
  })
})

describe("카드 — 정적 마크업", () => {
  it("결론 한 줄이 맨 위, 목록 줄마다 날짜·출처·상태·요지·[열기]", async () => {
    const result = await findConsultations("녹화 문의 있었나?", fakeRepo(), { actor: READER, now: NOW })
    const block = consultationsBlock(result)
    if (block.kind !== "consultations") throw new Error("consultations block expected")
    const html = renderToStaticMarkup(<ConsultationsCardView card={block.card} />)
    expect(html.indexOf("&#x27;녹화&#x27; 관련 상담 2건을 찾았습니다.")).toBeGreaterThan(-1)
    expect(html.indexOf("찾았습니다")).toBeLessThan(html.indexOf("2026-11-22"))
    expect(html).toContain(`href="/admin/cs-chatbot?conversation=${UUID_A}"`)
    expect(html).toContain('href="/admin/channel-talk?conversation=ch_a1"')
    expect(html).toContain("검토 대기")
    expect(html).toContain("채널톡")
    expect(html).toContain("상담 화면 열기")
    expect(html).not.toContain(SAMPLE_PHONE)
  })

  it("관문 밖 주소는 [열기]를 그리지 않는다", () => {
    const card: ConsultationsCard = {
      title: "상담 내역",
      target: { label: "시험", meta: "1건" },
      headline: "시험 상담 1건을 찾았습니다.",
      items: [{ id: "x", source: "channel_talk", status: "진행 중", summary: "요지", href: "/admin/channel-talk?conversation=x&tab=evil" }],
      basis: "시험",
    }
    const html = renderToStaticMarkup(<ConsultationsCardView card={card} />)
    expect(html).not.toContain("tab=evil")
    expect(html).not.toContain(">열기<")
  })

  it("못 찾음 카드와 스크린리더 알림", async () => {
    const result = await findConsultations("우주선 문의 있었나?", fakeRepo(), { actor: READER, now: NOW })
    const block = consultationsBlock(result)
    if (block.kind !== "consultations") throw new Error("consultations block expected")
    const html = renderToStaticMarkup(<ConsultationsCardView card={block.card} />)
    expect(html).toContain("찾지 못했습니다 — 조건:")
    expect(html).toContain('href="/admin/channel-talk"')
    const state: AdminAiState = {
      ...INITIAL_ADMIN_AI_STATE,
      messages: [{ id: "m1", role: "assistant", blocks: [block] }],
    }
    expect(buildAdminAiAnnouncement(state)).toContain("찾지 못했습니다")
  })
})
