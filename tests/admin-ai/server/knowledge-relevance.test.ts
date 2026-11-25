// 서버 1단계 검토(2026-11) 동작-1 재현 시험 — 두괄식 결론이 질문에 대한 답인가.
// 실제 정리 지식·선례 근거(buildInternalEvidence)를 쓰고, 공개 검색(모델·DB)과 상담 검색만 빈 값으로 바꾼다.
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/chatbot/service", () => ({ evaluateChatbotQuery: async () => ({ answer: null, answerMode: "none", sources: [] }) }))
vi.mock("@/lib/internal-cs-chat/consultation-search", () => ({ searchConsultationEvidence: async () => [] }))

import type { InternalCuratedEvidence, InternalEvidenceParts, InternalPublicDocEvidence } from "@/lib/internal-cs-chat/context"
import { buildInternalEvidence } from "@/lib/internal-cs-chat/context"
import { NO_EVIDENCE_ANSWER, answerKnowledge, questionTokens } from "@/lib/admin-ai/server/knowledge"
import type { AnswerCard } from "@/lib/admin-ai/types"

import { fakeInternalContact } from "./fakes"

async function conclusionOf(question: string, evidence: (q: string) => Promise<InternalEvidenceParts>): Promise<AnswerCard> {
  const blocks = await answerKnowledge(question, { evidence, contact: async (q) => ({ title: "담당자", target: { label: fakeInternalContact(q).who, meta: "" } }) })
  const answer = blocks.find((block) => block.kind === "answer")
  if (!answer || answer.kind !== "answer") throw new Error("answer block expected")
  return answer.card
}

const real = (q: string) => buildInternalEvidence(q, { includeInternalDocs: true })

/** 결론 줄이 질문의 핵심 낱말(일반어 제외)을 하나 이상 담거나, 근거 없음이어야 한다. */
function onTopic(question: string, answer: string) {
  if (answer === NO_EVIDENCE_ANSWER) return true
  return questionTokens(question).some((token) => token.weight >= 1 && token.variants.some((variant) => answer.toLowerCase().includes(variant)))
}

describe("결론은 질문에 대한 답이다(실제 정리 지식)", () => {
  it.each([
    ["화상 수업 중 학생 마이크를 한 번에 끄려면?", "ClassIn Mic DT2 Pro"],
    ["맥북에서 클래스인 설치 오류 나면 뭐부터 봐야 해", "벽면 강도"],
    ["녹화 영상 다운로드 막을 수 있어?", "EDB 교안"],
    ["결제 링크를 학생이 못 열어요", "ZIP의 글로벌"],
    ["클래스인 블록체인 결제 지원해?", "ZIP의 글로벌"],
    ["요금제 업그레이드하면 차액은 어떻게 계산돼?", "ZIP의 글로벌"],
    ["교실 녹화 파일은 며칠 보관돼?", "EDB 교안"],
  ])("%s", async (question, wrong) => {
    const card = await conclusionOf(question, real)
    expect(card.answer, question).not.toContain(wrong)
    expect(onTopic(question, card.answer), `${question} → ${card.answer}`).toBe(true)
  }, 30_000)

  it("맞는 문장이 방법 칸에 묻히지 않고 결론으로 올라온다", async () => {
    const card = await conclusionOf("녹화 영상 다운로드 막을 수 있어?", real)
    expect(card.answer).toContain("다운로드")
  }, 30_000)
})

const curated = (id: string, summary: string, handling: string[], confirmed = true): InternalCuratedEvidence => ({
  kind: "curated",
  id,
  title: `${id}(샘플)`,
  summary,
  status: confirmed ? "confirmed" : "conditional",
  externalUse: "reviewed_summary_allowed",
  handling,
  recommendedTags: [],
  confirmed,
  customerUse: "review",
  asOf: "2026-10-01",
  sources: [{ id, label: id }],
})

const publicDoc = (summary: string, excerpt: string): InternalPublicDocEvidence => ({
  kind: "public_doc",
  id: "doc",
  title: "공개 문서(샘플)",
  heading: "안내",
  summary,
  excerpt,
  urlPath: "/support",
  confirmed: true,
  customerUse: "allowed",
  asOf: null,
  sources: [{ id: "doc", label: "공개 문서(샘플)" }],
})

const EMPTY: InternalEvidenceParts = { curated: [], incidents: [], publicDocs: [], internalDocs: [], publicAnswer: null, internalDraft: null }

describe("근거 고르기(질문별로 다른 가짜 근거)", () => {
  it("정리 지식이 걸려도 질문과 맞지 않으면 맞는 공개 문서를 앞세운다", async () => {
    const parts: InternalEvidenceParts = {
      ...EMPTY,
      curated: [curated("mic-hw", "현재 액세서리 정본은 마이크 모델 A다.", ["교실 면적을 확인한다."])],
      publicDocs: [publicDoc("학생 마이크는 교사가 수업 중 전체 음소거로 한 번에 끌 수 있습니다.", "학생 마이크는 교사가 전체 음소거로 끌 수 있습니다. 교실 도구에서 전체 음소거를 누릅니다.")],
    }
    const card = await conclusionOf("수업 중 학생 마이크를 전체 음소거로 끄는 방법", async () => parts)
    expect(card.answer).toContain("음소거")
    expect(card.sources[0]?.kind).toBe("public")
  })

  it("근거가 질문과 거의 겹치지 않으면 지어내지 않고 근거 없음으로 간다", async () => {
    const parts: InternalEvidenceParts = { ...EMPTY, curated: [curated("zip", "ZIP의 글로벌 결제 주기는 한국 계약 정본이 아니다.", ["환불일을 확정하지 않는다."])] }
    const card = await conclusionOf("클래스인 블록체인 결제 지원해?", async () => parts)
    expect(card.answer).toBe(NO_EVIDENCE_ANSWER)
  })

  it("결론은 근거 안에서 질문과 가장 맞는 문장이다(요약 첫 문장이 아니어도)", async () => {
    const parts: InternalEvidenceParts = {
      ...EMPTY,
      curated: [curated("lms", "현행 정본은 교안과 칠판 기준이다.", ["녹화 다운로드와 워터마크는 관리자 설정에서 막을 수 있다.", "권한은 계약 범위를 따른다."])],
    }
    const card = await conclusionOf("녹화 다운로드 막을 수 있어?", async () => parts)
    expect(card.answer).toBe("녹화 다운로드와 워터마크는 관리자 설정에서 막을 수 있다.")
    expect(card.steps ?? []).not.toContain("녹화 다운로드와 워터마크는 관리자 설정에서 막을 수 있다.")
  })
})
