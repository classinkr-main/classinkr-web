// 상담 내역 찾기 — 반박 검토 결함 재현 시험. 가짜 저장소(DB·모델·네트워크 없음). 기관 이름·연락처는 가짜이고
// 사람 이름은 "샘플이름"처럼 이름이 아닌 것이 분명한 자리표시만 쓴다.
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  consultationKeywords,
  consultationsBlock,
  countRelatedConsultations,
  findConsultations,
  relatedConsultationWords,
  type ConsultationDeps,
  type ConsultationRecord,
} from "@/lib/admin-ai/server/consultations"
import { answerKnowledge, consultationAskOf } from "@/lib/admin-ai/server/knowledge"
import { collectTurn } from "@/lib/admin-ai/server/orchestrator"
import { routeMessage } from "@/lib/admin-ai/server/router"
import type { ConsultationsCard } from "@/lib/admin-ai/types"

import { STAFF_ACTOR, fakeDeps, fakeEvidence } from "./fakes"

const NOW = Date.parse("2026-11-25T01:00:00Z") // KST 11월 25일 10시
const READER = { canReadContent: true }

const ch = (id: string, at: string, org: string | null, subject: string, extra: Partial<ConsultationRecord> = {}): ConsultationRecord => ({
  id,
  source: "channel_talk",
  at,
  org,
  person: "고객(샘플)",
  leadId: null,
  subject,
  tags: [],
  status: "opened",
  ...extra,
})

const RECORDS: ConsultationRecord[] = [
  ch("a1", "2026-11-24T16:30:00Z", "가나학원", "녹화가 안 돼요", { leadId: "L1" }),
  ch("a2", "2026-11-18T03:00:00Z", "가나학원", "환불해 주실 수 있나요", { leadId: "L1" }),
  ch("a3", "2026-11-17T03:00:00Z", "다라에듀", "결제 확인 부탁드려요"),
  ch("a4", "2026-11-12T03:00:00Z", "마바학원", "수업 중 소리가 안 들려요"),
  ch("a5", "2026-11-13T03:00:00Z", null, "카메라가 안 잡혀요"),
  ch("a6", "2026-11-14T03:00:00Z", "사바어학원", "결제 오류가 나요"),
]

function repo(records: ConsultationRecord[] = RECORDS, overrides: Partial<ConsultationDeps> = {}): ConsultationDeps {
  return {
    channelTalk: async (limit) => ({ records: records.slice(0, limit), limit }),
    findCustomersInText: async (question) =>
      ["가나학원", "다라에듀", "마바학원", "사바어학원"]
        .filter((name) => question.includes(name))
        .map((name) => ({ key: name === "가나학원" ? "lead:L1" : `customer:${name}`, name, href: "/admin/crm" })),
    ...overrides,
  }
}

const OPEN = { key: "lead:L1", name: "가나학원", href: "/admin/crm" }

afterEach(() => vi.restoreAllMocks())

describe("구어체 어미·호칭·지시어는 낱말이 아니다(거짓 '찾지 못했습니다' 막기)", () => {
  const cases: Array<[string, string[]]> = [
    ["지난주에 들어온 결제 문의 몇 건이야?", ["결제"]],
    ["마바학원이랑 채팅한 거 언제였지?", []],
    ["환불 상담 요즘 많아?", ["환불"]],
    ["가나학원 원장님이 문의했던 거 뭐였지?", []],
    ["해당 학원 상담 기록 있나?", []],
    ["카메라 안 잡힌다는 상담 최근 30일에 있었나", ["카메라"]],
    ["가나학원 지난주 문의 내용 뭐였더라", []],
    ["환불해 달라는 채팅 있었나요", ["환불"]],
    ["가나학원 상담 언제 했었어?", []],
    ["소리 안 들린다는 문의 요즘 있어?", ["소리"]],
    ["환불 문의 있었나? 가나학원 화면에서", ["환불"]],
  ]

  it("남는 낱말은 찾는 주제뿐이다", () => {
    for (const [question, words] of cases) {
      const names = ["가나학원", "마바학원"].filter((name) => question.includes(name))
      expect(consultationKeywords(question, names).map((k) => k.word), question).toEqual(words)
    }
  })

  it("맞는 상담이 있으면 찾는다", async () => {
    const expected: Array<[string, string]> = [
      ["지난주에 들어온 결제 문의 몇 건이야?", "a3"],
      ["마바학원이랑 채팅한 거 언제였지?", "a4"],
      ["환불 상담 요즘 많아?", "a2"],
      ["가나학원 원장님이 문의했던 거 뭐였지?", "a1"],
      ["해당 학원 상담 기록 있나?", "a1"],
      ["카메라 안 잡힌다는 상담 최근 30일에 있었나", "a5"],
      ["환불해 달라는 채팅 있었나요", "a2"],
      ["가나학원 상담 언제 했었어?", "a1"],
      ["소리 안 들린다는 문의 요즘 있어?", "a4"],
    ]
    for (const [question, id] of expected) {
      const result = await findConsultations(question, repo(), { openCustomer: OPEN, actor: READER, now: NOW })
      expect(result.total, question).toBeGreaterThan(0)
      expect(result.items[0].id, question).toBe(id)
    }
  })

  it("띄어 쓴 기관 이름은 한 낱말이다 — '가나 학원'이 '…가 나요'에 맞지 않는다", async () => {
    const result = await findConsultations("가나 학원 상담 있었나?", repo(), { actor: READER, now: NOW })
    expect(result.items.map((item) => item.id)).not.toContain("a6")
    expect(result.items.map((item) => item.id).sort()).toEqual(["a1", "a2"])
  })

  it("두 글자 낱말은 낱말 경계를 넘어 맞추지 않는다", async () => {
    const result = await findConsultations("가나 문의 있었나?", repo([ch("x1", "2026-11-20T03:00:00Z", null, "결제 오류가 나요")]), { actor: READER, now: NOW })
    expect(result.total).toBe(0)
  })

  it("낱말이 둘 이상인데 못 찾으면 낱말을 줄여 보라고 알린다", async () => {
    const result = await findConsultations("우주선 고장 문의 있었나?", repo(), { actor: READER, now: NOW })
    const block = consultationsBlock(result) as { kind: "consultations"; card: ConsultationsCard }
    expect(block.card.headline).toMatch(/^찾지 못했습니다/)
    expect(block.card.note).toContain("낱말을 줄여")
  })
})

describe("상한에 걸린 '없음'·건수를 정직하게", () => {
  const many = Array.from({ length: 5 }, (_, i) => ch(`m${i}`, `2026-11-${String(20 + i).padStart(2, "0")}T03:00:00Z`, "다라에듀", "화질 문의"))

  it("상한까지 읽었으면 읽은 가장 오래된 날짜를 조건 줄에 넣고, 그 이전은 확인 못 했다고 결론에 밝힌다", async () => {
    const result = await findConsultations("올해 마바학원 문의 내역 보여줘", repo(many, { scanLimit: 5 }), { actor: READER, now: NOW })
    expect(result.basis.capped).toBe(true)
    expect(result.basis.coverageFrom).toBe("2026-11-20")
    const block = consultationsBlock(result) as { kind: "consultations"; card: ConsultationsCard }
    expect(block.card.basis).toContain("2026-11-20 이후")
    expect(block.card.headline).toContain("2026-11-20 이전은 확인하지 못했습니다")
  })

  it("기간이 읽은 범위 안이면 그런 말을 붙이지 않는다", async () => {
    const result = await findConsultations("오늘 들어온 상담 보여줘", repo(many, { scanLimit: 5 }), { actor: READER, now: NOW })
    const block = consultationsBlock(result) as { kind: "consultations"; card: ConsultationsCard }
    expect(block.card.headline).not.toContain("확인하지 못했습니다")
    expect(block.card.headline).not.toContain("최소")
  })

  it("권한 없는 역할의 건수는 상한에 걸렸으면 '최소 n건'이다", async () => {
    const result = await findConsultations("화질 문의 있었나?", repo(many, { scanLimit: 5 }), { actor: { canReadContent: false }, now: NOW })
    const block = consultationsBlock(result) as { kind: "consultations"; card: ConsultationsCard }
    expect(block.card.headline).toContain("최소 5건")
  })
})

describe("요지 가림 — 비껴 쓴 이메일·호칭 앞 이름", () => {
  const subjects = [
    "환불 메일 sample @ example . com 으로",
    "환불 sample[at]example.com 으로",
    "환불 sample(at)example(dot)com 으로",
    "환불 담당 샘플이름 선생님께 전달",
  ]
  it("요지에 이메일·이름이 남지 않는다", async () => {
    for (const subject of subjects) {
      const result = await findConsultations("환불 문의 있었나?", repo([ch("r1", "2026-11-20T03:00:00Z", null, subject)]), { actor: READER, now: NOW })
      const summary = result.items[0].summary
      expect(summary, subject).not.toMatch(/sample|example|샘플이름/)
    }
  })
  it("호칭이 붙어도 흔한 말(담당·담임 등)은 남긴다", async () => {
    const result = await findConsultations("환불 문의 있었나?", repo([ch("r1", "2026-11-20T03:00:00Z", null, "환불 담임 선생님께 전달")]), { actor: READER, now: NOW })
    expect(result.items[0].summary).toContain("담임 선생님")
  })
})

describe("묻기 답의 관련 상담 줄 — 추천 문장이 상담 내역 갈래로 가고 같은 건수를 낸다", () => {
  const store = [ch("x", "2026-11-20T03:00:00Z", null, "녹화 안 됨 / 환불 / 화질 / 카메라 / 출결")]
  it("'환불 규정 알려줘'의 추천은 '규정'을 빼서 상담 내역 갈래로 간다", () => {
    expect(consultationAskOf("환불 규정 알려줘")).toBe("환불 상담 최근에 있었나?")
    expect(routeMessage(consultationAskOf("환불 규정 알려줘")).map((d) => d.branch)).toEqual(["consultations"])
  })
  for (const question of ["환불 규정 알려줘", "녹화가 안 될 때 어떻게 해?", "카메라 인식이 안 돼요", "가나학원 화질 설정 방법"]) {
    it(question, async () => {
      const ask = consultationAskOf(question)
      const count = await countRelatedConsultations(question, repo(store))
      if (count == null || count === 0) return
      expect(routeMessage(ask).map((d) => d.branch), ask).toEqual(["consultations"])
      const found = await findConsultations(ask, repo(store), { actor: READER, now: NOW })
      expect(found.total, ask).toBe(count)
      expect(relatedConsultationWords(question).length).toBeGreaterThan(0)
    })
  }
})

describe("묻기 답의 상담 건수 읽기는 짧은 시간 상한 안에서만 기다린다", () => {
  it("상담 건수가 느려도 정보 답은 나오고, 건수 줄만 빠진다", async () => {
    const { deps } = fakeDeps({ segmentTimeoutMs: 400 })
    deps.knowledge = {
      ...deps.knowledge,
      consultationCount: () => new Promise((resolve) => setTimeout(() => resolve(3), 2_000)),
      optionalTimeoutMs: 50,
    }
    const res = await collectTurn({ text: "수업 녹화 방법 알려줘", context: null, actor: STAFF_ACTOR, now: NOW }, deps)
    expect(res.blocks[0].kind).toBe("answer")
    expect(JSON.stringify(res.blocks)).not.toContain("관련 상담")
  })

  it("answerKnowledge 도 혼자서 같은 상한을 지킨다", async () => {
    const started = Date.now()
    const blocks = await answerKnowledge("수업 녹화 방법 알려줘", {
      evidence: async (q) => fakeEvidence(q),
      consultationCount: () => new Promise((resolve) => setTimeout(() => resolve(3), 2_000)),
      optionalTimeoutMs: 30,
      contact: async () => ({ title: "담당", items: [] }) as never,
    })
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(blocks[0].kind).toBe("answer")
  })
})
