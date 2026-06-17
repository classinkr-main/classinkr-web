import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  buildClientVectorSources,
  parsePgVectorEmbedding,
} from "@/lib/chatbot/vector-fallback"

describe("chatbot client vector fallback", () => {
  it("parses pgvector string values returned through PostgREST", () => {
    expect(parsePgVectorEmbedding("[1,0.5,-0.25]")).toEqual([1, 0.5, -0.25])
    expect(parsePgVectorEmbedding([0, 1])).toEqual([0, 1])
    expect(parsePgVectorEmbedding(null)).toBeNull()
    expect(parsePgVectorEmbedding("[1, nope]")).toBeNull()
  })

  it("ranks embedded chunks by cosine similarity and dedupes article paths", () => {
    const sources = buildClientVectorSources(
      [1, 0],
      [
        {
          id: "chunk-low",
          article_id: "article-low",
          heading: "낮은 유사도",
          content: "덜 관련된 내용",
          embedding: "[0,1]",
          docs_articles: {
            id: "article-low",
            category_id: "billing",
            slug: "billing-low",
            title: "낮은 후보",
            description: "",
            canonical_path: null,
            noindex: false,
          },
        },
        {
          id: "chunk-best",
          article_id: "article-best",
          heading: "세금계산서",
          content: "세금계산서 발급과 사업자 정보 확인 안내",
          embedding: "[1,0]",
          docs_articles: {
            id: "article-best",
            category_id: "billing",
            slug: "tax-invoice",
            title: "세금계산서 발급 안내",
            description: "",
            canonical_path: "/docs/billing/tax-invoice",
            noindex: false,
          },
        },
        {
          id: "chunk-duplicate",
          article_id: "article-best",
          heading: "중복 문서",
          content: "같은 문서의 다른 청크",
          embedding: "[0.9,0.1]",
          docs_articles: {
            id: "article-best",
            category_id: "billing",
            slug: "tax-invoice",
            title: "세금계산서 발급 안내",
            description: "",
            canonical_path: "/docs/billing/tax-invoice",
            noindex: false,
          },
        },
      ],
      { maxSources: 3, similarityFloor: 0.1 }
    )

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      chunkId: "chunk-best",
      title: "세금계산서 발급 안내",
      urlPath: "/docs/billing/tax-invoice",
      category: "billing",
    })
    expect(sources[0].score).toBeCloseTo(80)
  })

  it("is wired into the chatbot service after the RPC vector search path", () => {
    const serviceSource = readFileSync(join(process.cwd(), "lib/chatbot/service.ts"), "utf8")

    expect(serviceSource).toContain("buildClientVectorSources")
    expect(serviceSource).toContain("CLIENT_VECTOR_SIMILARITY_FLOOR = 0.7")
    expect(serviceSource).toContain("clientVectorSearchSupabaseSources")
    expect(serviceSource.indexOf("vectorSearchSupabaseSources(embedding)")).toBeLessThan(
      serviceSource.indexOf("keywordSearchSupabaseSources(question)")
    )
    expect(serviceSource.indexOf("keywordSearchSupabaseSources(question)")).toBeLessThan(
      serviceSource.indexOf("clientVectorSearchSupabaseSources(embedding)")
    )
  })
})
