import { describe, expect, it } from "vitest"

import {
  ALPHA_DB_MIGRATIONS,
  ALPHA_DB_RPC_PROBES,
  ALPHA_DB_TABLE_PROBES,
  buildAlphaDbProbeSelect,
  summarizeAlphaDbProbeResults,
} from "@/lib/chatbot/alpha-db-contract"

describe("alpha DB contract", () => {
  it("declares the migrations and runtime table probes needed for chatbot alpha", () => {
    expect(ALPHA_DB_MIGRATIONS).toEqual(
      expect.arrayContaining([
        "supabase/migrations/20260614_alpha_admin_base_schema.sql",
        "supabase/migrations/20260421_docs_center.sql",
        "supabase/migrations/20260421_z_chatbot_analytics.sql",
        "supabase/migrations/20260520_chatbot_recommended_questions.sql",
        "supabase/migrations/20260614211500_chatbot_recommended_questions_alpha_seed.sql",
        "supabase/migrations/20260604_docs_article_drafts.sql",
        "supabase/migrations/20260613_docs_chunk_vector_search.sql",
      ])
    )
    expect(ALPHA_DB_MIGRATIONS).not.toContain("supabase/migrations/20260613_docs_chunk_embedding_768.sql")

    const tables = ALPHA_DB_TABLE_PROBES.map((probe) => probe.table)

    expect(tables).toEqual(
      expect.arrayContaining([
        "admin_profiles",
        "leads",
        "audit_logs",
        "docs_articles",
        "docs_ai_chunks",
        "docs_article_versions",
        "docs_search_events",
        "question_clusters",
        "chatbot_recommended_questions",
        "docs_article_drafts",
      ])
    )
  })

  it("declares the vector search RPC required for retrieval readiness", () => {
    expect(ALPHA_DB_RPC_PROBES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          functionName: "match_docs_ai_chunks",
          migration: "supabase/migrations/20260616_docs_chunk_vector_rpc_text_compat.sql",
          args: expect.objectContaining({
            match_count: 1,
            query_embedding: expect.any(String),
          }),
        }),
      ])
    )
  })

  it("probes the consultation search RPC so a re-broken overload fails the gate", () => {
    // 20260716_channel_conversations.sql 이 동일 인자명의 vector/text 오버로드를 만들어 PostgREST 가
    // 후보를 못 고르는 사고가 있었다. 목킹된 유닛 테스트로는 절대 잡히지 않으므로 라이브 RPC 프로브로 고정한다.
    const probe = ALPHA_DB_RPC_PROBES.find(
      (candidate) => candidate.functionName === "match_channel_conversation_chunks"
    )

    expect(probe).toBeDefined()
    expect(probe!.migration).toBe("supabase/migrations/20260828_channel_match_rpc_single_overload.sql")
    // 런타임(lib/internal-cs-chat/consultation-search.ts)과 같은 3-인자 문자열 임베딩 호출 모양이어야
    // 오버로드 해석 경로를 실제로 밟는다.
    expect(Object.keys(probe!.args).sort()).toEqual(["match_count", "min_similarity", "query_embedding"])
    expect(JSON.parse(probe!.args.query_embedding as string)).toHaveLength(768)
  })

  it("builds targeted Supabase selects so missing runtime columns fail fast", () => {
    const docsArticles = ALPHA_DB_TABLE_PROBES.find((probe) => probe.table === "docs_articles")

    expect(docsArticles).toBeDefined()
    expect(buildAlphaDbProbeSelect(docsArticles!)).toContain("status")
    expect(buildAlphaDbProbeSelect(docsArticles!)).toContain("visibility")
    expect(buildAlphaDbProbeSelect(docsArticles!)).not.toBe("*")
  })

  it("blocks on schema probe errors and warns on missing launch data", () => {
    const summary = summarizeAlphaDbProbeResults([
      { table: "docs_articles", label: "공개 문서 원본", count: 0, minimumRows: 1, error: null },
      { table: "docs_ai_chunks", label: "RAG 문서 청크", count: null, error: "column embedding does not exist" },
      { table: "chatbot_recommended_questions", label: "추천 질문", count: 3, minimumRows: 4, error: null },
    ])

    expect(summary.status).toBe("blocked")
    expect(summary.blocked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "docs_ai_chunks",
          message: expect.stringContaining("column embedding"),
        }),
      ])
    )
    expect(summary.warning).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "docs_articles" }),
        expect.objectContaining({ table: "chatbot_recommended_questions" }),
      ])
    )
  })
})
