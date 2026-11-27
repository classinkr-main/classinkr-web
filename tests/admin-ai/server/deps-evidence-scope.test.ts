// 갈매봇 서버 연결의 묻기 근거 범위 — 내부 근거를 끈 연결(위컴 단체방)은 내부 문서 검색을 끄고 공개 문서만 싣는다.
// 어드민 화면·위컴 1:1(기본)은 그대로 내부 문서까지. 실제 검색·DB·모델은 부르지 않는다(가짜 부품). 문장은 샘플이다.
import { describe, expect, it, vi } from "vitest"

import type { InternalEvidenceParts } from "@/lib/internal-cs-chat/context"

const PARTS: InternalEvidenceParts = {
  curated: [
    {
      kind: "curated",
      id: "curated-sample",
      title: "샘플내부원칙",
      summary: "샘플내부원칙 요약",
      status: "confirmed",
      externalUse: "internal_only",
      handling: [],
      recommendedTags: [],
      confirmed: true,
      customerUse: "internal_only",
      asOf: null,
      sources: [],
    },
  ],
  incidents: [{ kind: "workflow", id: "flow-sample", title: "샘플내부흐름", summary: "샘플내부흐름 요약", steps: [], confirmed: true, customerUse: "review", asOf: null, sources: [] }],
  publicDocs: [
    {
      kind: "public_doc",
      id: "doc-sample",
      title: "공개 안내(샘플)",
      summary: "공개 안내 요약",
      excerpt: "공개 안내 발췌",
      urlPath: "/support",
      confirmed: true,
      customerUse: "allowed",
      asOf: null,
      sources: [],
    },
  ],
  internalDocs: [{ kind: "internal_doc", id: "internal-sample", title: "샘플내부문서", summary: "샘플내부문서 요약", excerpt: "샘플내부문서 발췌", confirmed: null, customerUse: "internal_only", asOf: null, sources: [] }],
  publicAnswer: null,
  internalDraft: "샘플내부초안",
}

const hoisted = vi.hoisted(() => ({ buildInternalEvidence: vi.fn<(question: string, options?: { includeInternalDocs?: boolean }) => Promise<unknown>>(async () => null) }))

vi.mock("@/lib/internal-cs-chat/context", () => ({ buildInternalEvidence: hoisted.buildInternalEvidence }))
vi.mock("@/lib/internal-cs-chat/contact-deps", () => ({ buildContactDeps: () => ({ findCustomersInText: async () => [] }) }))
vi.mock("@/lib/admin-ai/server/consultation-deps", () => ({ buildConsultationDeps: () => ({}) }))
vi.mock("@/lib/admin-ai/server/customer-history-deps", () => ({ buildCustomerHistoryDeps: () => ({}) }))
vi.mock("@/lib/admin-ai/server/llm/adapter", () => ({ getAdminAiModelAdapter: () => null }))
vi.mock("@/lib/admin-ai/server/ticket-claims", () => ({ readConfirmSetup: () => ({ cardSecret: null }) }))

import { buildServerOrchestratorDeps } from "@/lib/admin-ai/server/deps"

describe("묻기 근거 범위", () => {
  it("기본(어드민 화면·위컴 1:1) — 내부 문서 검색을 켜고 근거를 그대로 싣는다", async () => {
    hoisted.buildInternalEvidence.mockClear()
    hoisted.buildInternalEvidence.mockResolvedValue(PARTS)
    const deps = buildServerOrchestratorDeps({ sub: "staff:sample", canReadConsultations: true })
    const parts = await deps.knowledge.evidence("수업 녹화")
    expect(hoisted.buildInternalEvidence).toHaveBeenCalledWith("수업 녹화", { includeInternalDocs: true })
    expect(parts).toEqual(PARTS)
  })

  it("internalEvidence:false(위컴 단체방) — 내부 문서 검색을 끄고, 정리 지식·선례·내부 문서·내부 초안을 뗀다", async () => {
    hoisted.buildInternalEvidence.mockClear()
    hoisted.buildInternalEvidence.mockResolvedValue(PARTS)
    const deps = buildServerOrchestratorDeps({ sub: "staff:sample", canReadConsultations: false, customerContacts: false, contactNames: false, internalEvidence: false })
    const parts = await deps.knowledge.evidence("수업 녹화")
    expect(hoisted.buildInternalEvidence).toHaveBeenCalledWith("수업 녹화", { includeInternalDocs: false })
    expect(parts).toEqual({ curated: [], incidents: [], publicDocs: PARTS.publicDocs, internalDocs: [], publicAnswer: null, internalDraft: null })
    expect(JSON.stringify(parts)).not.toContain("샘플내부")
  })
})
