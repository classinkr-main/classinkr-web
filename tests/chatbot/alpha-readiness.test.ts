import { describe, expect, it } from "vitest"

import { buildChatbotAlphaReadiness } from "@/lib/chatbot/alpha-readiness"

describe("chatbot alpha readiness", () => {
  it("blocks alpha launch when runtime env and docs corpus are missing", () => {
    const report = buildChatbotAlphaReadiness({
      hasSupabaseEnv: false,
      hasGeminiApiKey: false,
      docsArticleCount: 0,
      docsChunkCount: 0,
      embeddedChunkCount: 0,
      recommendedQuestionCount: 0,
      unresolvedGapCount: 0,
      zeroResultSearchCount: 0,
    })

    expect(report.overallStatus).toBe("blocked")
    expect(report.summary.blocked).toBeGreaterThanOrEqual(5)
    expect(report.checks.find((check) => check.key === "supabase_env")?.action).toContain(
      "NEXT_PUBLIC_SUPABASE_URL"
    )
    expect(report.checks.find((check) => check.key === "database_shape")?.status).toBe("blocked")
    expect(report.checks.find((check) => check.key === "database_shape")?.action).toContain(
      "Supabase 환경 변수"
    )
    expect(report.checks.find((check) => check.key === "docs_chunks")?.action).toContain(
      "reindex"
    )
  })

  it("warns when alpha can run but embeddings or backlog work still remain", () => {
    const report = buildChatbotAlphaReadiness({
      hasSupabaseEnv: true,
      hasGeminiApiKey: true,
      docsArticleCount: 24,
      docsChunkCount: 120,
      embeddedChunkCount: 40,
      recommendedQuestionCount: 5,
      unresolvedGapCount: 3,
      zeroResultSearchCount: 2,
    })

    expect(report.overallStatus).toBe("warning")
    expect(report.summary.blocked).toBe(0)
    expect(report.checks.find((check) => check.key === "embeddings")?.status).toBe("warning")
    expect(report.checks.find((check) => check.key === "embeddings")?.action).toContain(
      "scripts/embed-docs-chunks.ts"
    )
    expect(report.checks.find((check) => check.key === "gap_backlog")?.status).toBe("warning")
  })

  it("surfaces database query warnings as an actionable schema check", () => {
    const report = buildChatbotAlphaReadiness({
      hasSupabaseEnv: true,
      hasGeminiApiKey: true,
      docsArticleCount: 24,
      docsChunkCount: 120,
      embeddedChunkCount: 120,
      recommendedQuestionCount: 5,
      unresolvedGapCount: 0,
      zeroResultSearchCount: 0,
      warnings: ["question_clusters: relation does not exist"],
    })

    const databaseShape = report.checks.find((check) => check.key === "database_shape")

    expect(report.overallStatus).toBe("warning")
    expect(databaseShape?.status).toBe("warning")
    expect(databaseShape?.detail).toContain("question_clusters")
    expect(databaseShape?.action).toContain("migration")
    expect(databaseShape?.artifacts).toEqual(
      expect.arrayContaining([
        "supabase/migrations/20260614_alpha_admin_base_schema.sql",
        "supabase/migrations/20260421_docs_center.sql",
        "supabase/migrations/20260604_docs_article_drafts.sql",
        "supabase/migrations/20260616_docs_chunk_vector_rpc_text_compat.sql",
        "supabase/migrations/20260616_chatbot_channel_talk_handoffs.sql",
      ])
    )
  })

  it("marks alpha as ready when the corpus, embeddings, prompts, and backlog are healthy", () => {
    const report = buildChatbotAlphaReadiness({
      hasSupabaseEnv: true,
      hasGeminiApiKey: true,
      docsArticleCount: 24,
      docsChunkCount: 120,
      embeddedChunkCount: 120,
      recommendedQuestionCount: 5,
      unresolvedGapCount: 0,
      zeroResultSearchCount: 0,
    })

    expect(report.overallStatus).toBe("ok")
    expect(report.summary).toEqual({ ok: report.checks.length, warning: 0, blocked: 0 })
  })
})
