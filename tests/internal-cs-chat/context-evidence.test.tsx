import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  evaluateChatbotQuery: vi.fn(),
  searchConsultationEvidence: vi.fn(),
}))

vi.mock("@/lib/chatbot/service", () => ({
  evaluateChatbotQuery: mocks.evaluateChatbotQuery,
}))

vi.mock("@/lib/internal-cs-chat/consultation-search", () => ({
  searchConsultationEvidence: mocks.searchConsultationEvidence,
}))

import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import { buildInternalCsCopilotContext, buildInternalEvidence } from "@/lib/internal-cs-chat/context"
import { INCIDENT_CASES, isPlaceholderCustomer } from "@/lib/internal-cs-chat/incident-search"

const internalSource = {
  articleId: "article-internal",
  title: "녹화본이 없다 — 진단 흐름",
  heading: "원인 후보",
  urlPath: "/docs/cs-knowledge/recording-missing",
  category: "classroom",
  excerpt: "내부 메모: 총판 공급가는 대당 단가 협의 대상이다. 고객에게 말하지 않는다.",
  score: 40,
  visibility: "internal" as const,
}
const publicSource = {
  articleId: "article-public",
  title: "녹화 관리",
  urlPath: "/docs/admin/recording",
  category: "admin",
  excerpt: "관리자는 녹화 목록과 권한을 확인합니다.",
  score: 42,
}

const orgNames = Array.from(new Set(
  INCIDENT_CASES.filter((c) => !isPlaceholderCustomer(c.customer)).flatMap((c) =>
    c.customer.replace(/[()]/g, " ").split(/\s+/).filter((token) => token.length >= 4 && /\p{L}/u.test(token))
  )
))

const FORBIDDEN_WIDGET_TEXT = ["[실시간 상담 연결]", "저는 AI로 답하는", "도와드리지 않습니다"]

beforeEach(() => {
  mocks.searchConsultationEvidence.mockResolvedValue([])
})
afterEach(() => {
  vi.clearAllMocks()
})

describe("internal-only first source (IC-05)", () => {
  it("moves the answer to an internal-only block and keeps it out of the safe draft and the fallback", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({
      answer: "내부 메모: 총판 공급가는 대당 단가 협의 대상이다.",
      answerMode: "direct_answer",
      sources: [internalSource, publicSource],
    })

    const result = await buildInternalCsCopilotContext("총판 공급가 알려줘", { includeInternalDocs: true })

    const [beforeInternal, internalBlock = ""] = result.internalContext.split("[내부 전용 문서 근거]")
    expect(result.publicEvidence.answer).toBeNull()
    expect(result.publicEvidence.internalDraft).toContain("총판 공급가")
    expect(beforeInternal).toContain("공개 고객 응대 안전 초안: 없음")
    expect(beforeInternal).not.toContain("총판 공급가는 대당")
    expect(internalBlock).toContain("내부 전용 초안")
    expect(internalBlock).toContain("총판 공급가는 대당")
    expect(result.deterministicFallback).not.toContain("총판 공급가는 대당")
  })

  // 기대값 뒤집음: 예전에는 첫 출처가 공개 문서면 답을 안전 초안으로 실었으나, 내부 문서가 뒤에 섞이면
  // 답에 내부 발췌가 들어 있을 수 있어 내부 전용 초안으로만 옮긴다(검토 F1).
  it.each([
    ["public first, internal second", [publicSource, internalSource]],
    ["internal first", [internalSource, publicSource]],
  ])("moves a mixed-source answer out of the safe draft (%s)", async (_label, sources) => {
    mocks.evaluateChatbotQuery.mockResolvedValue({
      answer: "관리자 녹화 메뉴에서 확인합니다. SECRET_INTERNAL_MARK",
      answerMode: "direct_answer",
      sources,
    })
    const result = await buildInternalCsCopilotContext("녹화 메뉴", { includeInternalDocs: true })
    expect(result.publicEvidence.answer).toBeNull()
    expect(result.internalContext).not.toContain("공개 고객 응대 안전 초안: 관리자 녹화 메뉴")
    expect(result.deterministicFallback).not.toContain("SECRET_INTERNAL_MARK")
    expect(result.internalContext).toContain("SECRET_INTERNAL_MARK")
  })

  it("keeps a public-only answer as the safe draft", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({
      answer: "관리자 녹화 메뉴에서 확인합니다.",
      answerMode: "direct_answer",
      sources: [publicSource],
    })
    const result = await buildInternalCsCopilotContext("녹화 메뉴", { includeInternalDocs: true })
    expect(result.internalContext).toContain("공개 고객 응대 안전 초안: 관리자 녹화 메뉴")
    expect(result.deterministicFallback).toContain("관리자 녹화 메뉴")
  })
})

describe("widget handoff, refusal and self-introduction answers", () => {
  it.each([
    ["handoff", { answerMode: "handoff", answer: "네, 담당자 상담으로 바로 연결해 드릴게요. 아래 [실시간 상담 연결]을 눌러 주세요." }],
    ["policy_refusal", { answerMode: "direct_answer", answer: "보안 공격 요청은 도와드리지 않습니다.\n\n정상적인 질문을 해 주세요." }],
    ["self_intro", { answerMode: "direct_answer", detectedIntent: "self_knowledge", answer: "저는 AI로 답하는 Classin 상담 가이드예요." }],
  ])("drops the %s answer from context and the deterministic draft", async (reason, widget) => {
    mocks.evaluateChatbotQuery.mockResolvedValue({ ...widget, sources: [] })

    const result = await buildInternalCsCopilotContext("고객이 화가 나서 상담원 연결하라고 해요")

    expect(result.publicEvidence.answer).toBeNull()
    expect(result.publicEvidence.discardedAnswer).toBe(reason)
    for (const text of FORBIDDEN_WIDGET_TEXT) {
      expect(result.internalContext).not.toContain(text)
      expect(result.deterministicFallback).not.toContain(text)
    }
  })
})

describe("widget wording variants are not internal evidence", () => {
  it.each([
    "상담원에게 연결해 드릴게요. 아래 버튼을 눌러 주세요.",
    "담당자와 바로 연결해 드리겠습니다.",
    "저는 클래스인 AI 상담 도우미입니다.",
    "해당 요청은 답변드릴 수 없습니다.",
  ])("drops %s", async (answer) => {
    mocks.evaluateChatbotQuery.mockResolvedValue({ answer, answerMode: "direct_answer", sources: [publicSource] })
    const result = await buildInternalCsCopilotContext("고객이 화가 나서 문의합니다")
    expect(result.publicEvidence.answer).toBeNull()
    expect(result.deterministicFallback).not.toContain(answer)
  })
})

describe("fallback draft built from curated knowledge and precedents", () => {
  it("lists curated facts with external-use tags and drops the not-found line when evidence exists", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({ answer: null, sources: [] })

    const result = await buildInternalCsCopilotContext("고객이 녹화가 안 된다고 합니다")

    expect(result.deterministicFallback).not.toContain("찾지 못했습니다")
    expect(result.deterministicFallback).toContain("## 확인 상태")
    expect(result.deterministicFallback).toContain("[담당자 검토 후 안내 가능]")
    expect(result.deterministicFallback).toContain("## 선례 오류 케이스 및 점검 흐름")
    expect(result.incidentEvidence?.map((entry) => entry.id)).toContain("workflow:flow-recording-failure")
    expect(result.curatedEvidence.entries.map((entry) => entry.id)).toContain("recording-error-diagnostics")
  })

  it("never shows SMS cost in the fallback, and tags internal-only entries", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({ answer: null, sources: [] })

    const result = await buildInternalCsCopilotContext("회원가입 문자 발송 단가가 얼마야?")

    expect(result.curatedEvidence.entries.map((entry) => entry.id)).toContain("messaging-sms-cost")
    expect(result.internalContext).toContain("0.4위안")
    expect(result.deterministicFallback).toContain("[내부 전용]")
    expect(result.deterministicFallback).not.toContain("0.4위안")
  })

  it("renders without forbidden phrases, the cost figure or customer names", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({
      answer: "네, 상담으로 연결해 드릴게요. [실시간 상담 연결]",
      answerMode: "handoff",
      sources: [],
    })
    for (const question of ["고객이 녹화가 안 된다고 합니다", "회원가입 문자 발송 단가가 얼마야?", "고객이 화가 나서 상담원 연결하라고 해요"]) {
      const result = await buildInternalCsCopilotContext(question)
      const html = renderToStaticMarkup(<BlogMarkdownRenderer markdown={result.deterministicFallback} />)
      for (const text of [...FORBIDDEN_WIDGET_TEXT, "0.4위안", ...orgNames]) expect(html).not.toContain(text)
      // 모델 컨텍스트는 단가 질문에서만 원가를 싣는다. 그 밖의 질문에는 실리지 않는다.
      if (!question.includes("단가")) expect(result.internalContext).not.toContain("0.4위안")
      for (const name of orgNames) expect(result.internalContext).not.toContain(name)
    }
  })
})

describe("sourceRefs carry only what the context loaded (IC-21)", () => {
  it("is empty when nothing but the always-on rules were loaded", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({ answer: null, sources: [] })
    const result = await buildInternalCsCopilotContext("일반 문의")
    expect(result.sourceRefs).toEqual([])
  })

  it("lists matched curated, precedent and document refs, and keeps two precedents from one document apart", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({ answer: null, sources: [publicSource, internalSource] })
    const result = await buildInternalCsCopilotContext("57번 코드로 튕겨요, 고정 IP 충돌인가요?")

    const ids = result.sourceRefs.map((ref) => ref.id)
    expect(ids).toContain("article-public")
    expect(ids).toContain("article-internal")
    expect(ids.some((id) => id.includes("cs-error-cases-index"))).toBe(true)
    expect(ids).not.toContain("docs/active/brand-canon/voice-charter.md")
    expect(ids).not.toContain("docs/active/classin-operating-canon-2026-07-02.md")
    const incidents = result.incidentEvidence ?? []
    const labels = result.sourceRefs.map((ref) => ref.label ?? "")
    for (const entry of incidents) expect(labels.some((label) => label.includes(entry.title))).toBe(true)
  })
})

describe("buildInternalEvidence (structured parts)", () => {
  it("returns curated, incident, public and internal parts with provenance", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({
      answer: "관리자 녹화 메뉴에서 확인합니다.",
      answerMode: "direct_answer",
      sources: [publicSource, internalSource],
    })

    const parts = await buildInternalEvidence("고객이 녹화가 안 된다고 합니다")

    expect(mocks.evaluateChatbotQuery).toHaveBeenCalledWith("고객이 녹화가 안 된다고 합니다", {
      generateAnswer: false,
      includeInternalDocs: true,
    })
    expect(mocks.searchConsultationEvidence).not.toHaveBeenCalled()
    const recording = parts.curated.find((item) => item.id === "recording-error-diagnostics")
    expect(recording).toMatchObject({
      kind: "curated",
      confirmed: true,
      customerUse: "review",
      asOf: "2026-10-02",
    })
    expect(recording?.sources.length).toBeGreaterThan(0)
    expect(parts.curated.every((item) => item.id !== "source-precedence" && item.id !== "support-tone")).toBe(true)
    expect(parts.incidents.some((item) => item.kind === "workflow" && item.asOf === "2026-10-02")).toBe(true)
    expect(parts.publicDocs).toEqual([
      expect.objectContaining({ id: "article-public", customerUse: "allowed", confirmed: true }),
    ])
    expect(parts.internalDocs).toEqual([
      expect.objectContaining({ id: "article-internal", customerUse: "internal_only", confirmed: null }),
    ])
    // 공개·내부 출처가 섞인 답은 공개 답으로 내지 않고 내부 초안으로만 둔다(검토 F1).
    expect(parts.publicAnswer).toBeNull()
    expect(parts.internalDraft).toContain("녹화 메뉴")
  })

  it("marks internal-only curated knowledge and unconfirmed precedents so they are not said to a customer", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({ answer: null, sources: [] })
    const parts = await buildInternalEvidence("회원가입 문자 발송 단가가 얼마야?")
    expect(parts.curated.find((item) => item.id === "messaging-sms-cost")?.customerUse).toBe("internal_only")

    const unconfirmed = (await buildInternalEvidence("86인치 2세대 화면에 구름 줄무늬 백색 잔류물")).incidents
      .find((item) => item.kind === "incident" && item.causeStatus !== "확정")
    expect(unconfirmed).toMatchObject({ confirmed: false, customerUse: "confirm_first" })
  })

  it("matches what the copilot context was built from", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({ answer: null, sources: [publicSource, internalSource] })
    const question = "57번 코드로 튕겨요, 고정 IP 충돌인가요?"
    const [parts, context] = await Promise.all([
      buildInternalEvidence(question, { includeInternalDocs: true }),
      buildInternalCsCopilotContext(question, { includeInternalDocs: true }),
    ])
    expect(parts.curated.map((item) => item.id)).toEqual(
      context.curatedEvidence.entries.filter((entry) => !["source-precedence", "support-tone"].includes(entry.id)).map((entry) => entry.id)
    )
    expect(parts.incidents.map((item) => item.id)).toEqual((context.incidentEvidence ?? []).map((entry) => entry.id))
    expect(parts.publicDocs).toHaveLength(1)
    expect(parts.internalDocs).toHaveLength(1)
  })
})
