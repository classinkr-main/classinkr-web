import { afterEach, describe, expect, it, vi } from "vitest"

import {
  chunkMarkdown,
  csKnowledgeSlug,
  deriveArticleTitle,
  promoteMessageToInternalArticle,
  slugFromRelativePath,
  writeInternalCanonDoc,
  type InternalDocsSupabase,
} from "@/lib/internal-cs-chat/internal-article-writer"

function asSupabase(fake: { from: unknown }): InternalDocsSupabase {
  return fake as unknown as InternalDocsSupabase
}

// docs_articles_slug_format 제약: 소문자 영숫자 + 단일 하이픈.
const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// 호출된 메서드 목록에 따라 결과를 정하는 thenable 체인 — 같은 테이블에서 select/upsert/delete 를 구분한다.
type Call = [string, ...unknown[]]
function smartChain(resolver: (calls: Call[]) => unknown) {
  const calls: Call[] = []
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
    _calls?: Call[]
  } = {}
  for (const method of [
    "select", "eq", "neq", "in", "order", "limit", "gte", "delete", "maybeSingle", "single", "upsert", "insert", "update",
  ]) {
    chain[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, ...args])
      return chain
    })
  }
  chain.then = (resolve, reject) => Promise.resolve(resolver(calls)).then(resolve, reject)
  chain._calls = calls
  return chain
}

interface FakeSupabase {
  from: ReturnType<typeof vi.fn>
  fromCalls: string[]
  chainsByTable: Record<string, ReturnType<typeof smartChain>[]>
}

function fakeSupabase(resolvers: Record<string, (calls: Call[]) => unknown>): FakeSupabase {
  const chainsByTable: Record<string, ReturnType<typeof smartChain>[]> = {}
  const fromCalls: string[] = []
  const from = vi.fn((table: string) => {
    fromCalls.push(table)
    const chain = smartChain(resolvers[table] ?? (() => ({ data: null, error: null })))
    ;(chainsByTable[table] ??= []).push(chain)
    return chain
  })
  return { from, fromCalls, chainsByTable }
}

function upsertPayload(chain: ReturnType<typeof smartChain>) {
  const call = chain._calls?.find((entry) => entry[0] === "upsert")
  return call?.[1] as Record<string, unknown>
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("pure markdown helpers (seed 추출 무회귀)", () => {
  it("slugFromRelativePath strips docs/active and normalizes", () => {
    expect(slugFromRelativePath("docs/active/brand-canon/voice-charter.md")).toBe("brand-canon-voice-charter")
  })

  it("chunkMarkdown splits on headings and keeps non-empty chunks", () => {
    const chunks = chunkMarkdown("# 제목\n\n첫 문단.\n\n## 하위\n\n둘째 문단.")
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks.every((chunk) => chunk.content.trim().length > 0)).toBe(true)
  })

  it("csKnowledgeSlug always satisfies the docs slug format", () => {
    expect(csKnowledgeSlug("3f2a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8")).toBe(
      "cs-3f2a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8"
    )
    expect(SLUG_FORMAT.test(csKnowledgeSlug("3f2a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8"))).toBe(true)
    // 방어적: 이상한 문자가 섞여도 형식을 지킨다.
    expect(SLUG_FORMAT.test(csKnowledgeSlug("Weird_ID__x!!"))).toBe(true)
  })

  it("deriveArticleTitle prefers a heading, then the first meaningful line", () => {
    expect(deriveArticleTitle("# 환불 정책\n본문")).toBe("환불 정책")
    expect(deriveArticleTitle("환불은 확인이 필요합니다.\n다음 줄")).toBe("환불은 확인이 필요합니다.")
  })
})

describe("promoteMessageToInternalArticle", () => {
  function resolvers(findData: unknown) {
    return {
      docs_categories: () => ({ error: null }),
      docs_articles: (calls: Call[]) =>
        calls[0]?.[0] === "upsert"
          ? { data: { id: "article-x" }, error: null }
          : { data: findData, error: null },
      docs_ai_chunks: (calls: Call[]) =>
        calls[0]?.[0] === "select" ? { data: [], error: null } : { error: null },
    }
  }

  it("writes a new internal, noindexed article with a content_json backlink and reused=false", async () => {
    const supabase = fakeSupabase(resolvers(null))
    const embed = vi.fn(async () => [0.1, 0.2, 0.3])

    const result = await promoteMessageToInternalArticle(asSupabase(supabase), {
      messageId: "3f2a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8",
      conversationId: "conv-1",
      correctedContent: "# 환불 안내\n\n환불은 계약 조건 확인 후 안내합니다.",
      embed,
      throttleMs: 0,
      now: new Date("2026-07-16T00:00:00.000Z"),
    })

    expect(result).toEqual({
      articleId: "article-x",
      slug: "cs-3f2a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8",
      reused: false,
      embeddingFailures: 0,
    })

    const articleUpsert = upsertPayload(supabase.chainsByTable.docs_articles[1])
    expect(articleUpsert).toMatchObject({
      category_id: "cs-knowledge",
      slug: "cs-3f2a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8",
      visibility: "internal",
      noindex: true,
      status: "published",
      updated_by: "cs-knowledge-promotion",
      tags: ["cs-knowledge", "internal"],
      content_json: {
        source: "cs-knowledge-promotion",
        sourceMessageId: "3f2a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8",
        sourceConversationId: "conv-1",
        promotedAt: "2026-07-16T00:00:00.000Z",
      },
    })

    // 임베딩되어 청크가 적재되고, 청크 metadata 도 승격 출처로 태깅된다.
    expect(embed).toHaveBeenCalled()
    const chunkUpsert = upsertPayload(supabase.chainsByTable.docs_ai_chunks[1])
    expect(chunkUpsert).toMatchObject({
      metadata: { source: "cs-knowledge-promotion", visibility: "internal" },
    })
  })

  it("reuses the existing article (reused=true) when the backlink already exists", async () => {
    const supabase = fakeSupabase(resolvers({ id: "existing-article", slug: "cs-msg" }))
    const result = await promoteMessageToInternalArticle(asSupabase(supabase), {
      messageId: "msg",
      conversationId: "conv-2",
      correctedContent: "확정된 답변 본문.",
      embed: vi.fn(async () => [0.1]),
      throttleMs: 0,
    })

    expect(result.reused).toBe(true)
    expect(result.slug).toBe("cs-msg")
    expect(result.embeddingFailures).toBe(0)
    // 승격 자격/멱등 확인용 백링크 조회가 실제로 일어난다.
    expect(supabase.fromCalls).toContain("docs_articles")
  })

  it("keeps the article but reports embedding failures for searchability surfacing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const supabase = fakeSupabase(resolvers(null))
    const result = await promoteMessageToInternalArticle(asSupabase(supabase), {
      messageId: "msg-embed-fail",
      conversationId: "conv-3",
      correctedContent: "임베딩이 실패해도 문서는 저장됩니다.",
      embed: vi.fn(async () => null),
      throttleMs: 0,
    })

    // 문서/청크 저장은 유지(embedding=null), 실패 수만 표면화한다.
    expect(result.embeddingFailures).toBe(1)
    const chunkUpsert = upsertPayload(supabase.chainsByTable.docs_ai_chunks[1])
    expect(chunkUpsert).toMatchObject({ embedding: null, embedding_model: null })
  })
})

describe("writeInternalCanonDoc (seed 경로 무회귀)", () => {
  const originalKey = process.env.GEMINI_API_KEY
  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalKey
  })

  it("upserts a brand-canon article with the seed's fixed fields", async () => {
    // 키 제거 → embedInternalText 가 fetch 없이 null 반환(네트워크 미접촉). 청크는 embedding=null 로 저장된다.
    delete process.env.GEMINI_API_KEY
    const supabase = fakeSupabase({
      docs_articles: () => ({ data: { id: "canon-x" }, error: null }),
      docs_ai_chunks: (calls: Call[]) =>
        calls[0]?.[0] === "select" ? { data: [], error: null } : { error: null },
    })

    const result = await writeInternalCanonDoc(asSupabase(supabase), {
      rel: "docs/active/brand-canon/voice-charter.md",
      markdown: "# Voice Charter\n\n본문 내용입니다.",
    })

    expect(result.articleId).toBe("canon-x")
    expect(result.slug).toBe("brand-canon-voice-charter")
    expect(result.chunkCount).toBeGreaterThan(0)

    const articleUpsert = upsertPayload(supabase.chainsByTable.docs_articles[0])
    expect(articleUpsert).toMatchObject({
      category_id: "internal-canon",
      visibility: "internal",
      noindex: true,
      updated_by: "seed-internal-canon",
      tags: ["brand-canon", "internal"],
    })
    // seed 는 content_json 을 건드리지 않는다(기존 값 보존).
    expect(articleUpsert).not.toHaveProperty("content_json")
  })
})
