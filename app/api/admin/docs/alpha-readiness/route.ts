import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { buildChatbotAlphaReadiness } from "@/lib/chatbot/alpha-readiness"
import { listDocGapBacklog } from "@/lib/chatbot/doc-gaps"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type CountQuery = PromiseLike<{
  count: number | null
  error: { message?: string } | null
}>

function hasSupabaseServerEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
      (process.env.SUPABASE_SECRET_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

async function readCount(label: string, query: CountQuery, warnings: string[]) {
  const result = await query
  if (result.error) {
    warnings.push(`${label}: ${result.error.message ?? "count query failed"}`)
    return 0
  }
  return result.count ?? 0
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const hasSupabaseEnv = hasSupabaseServerEnv()
  const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY?.trim())

  if (!hasSupabaseEnv) {
    return NextResponse.json(
      buildChatbotAlphaReadiness({
        hasSupabaseEnv,
        hasGeminiApiKey,
        docsArticleCount: 0,
        docsChunkCount: 0,
        embeddedChunkCount: 0,
        recommendedQuestionCount: 0,
        unresolvedGapCount: 0,
        zeroResultSearchCount: 0,
      })
    )
  }

  try {
    const supabase = createSupabaseAdminClient()
    const warnings: string[] = []

    const [
      docsArticleCount,
      docsChunkCount,
      embeddedChunkCount,
      recommendedQuestionCount,
      backlog,
    ] = await Promise.all([
      readCount(
        "docs_articles",
        supabase.from("docs_articles").select("id", { count: "exact", head: true }).eq("status", "published"),
        warnings
      ),
      readCount(
        "docs_ai_chunks",
        supabase.from("docs_ai_chunks").select("id", { count: "exact", head: true }),
        warnings
      ),
      readCount(
        "docs_ai_chunks.embedding",
        supabase
          .from("docs_ai_chunks")
          .select("id", { count: "exact", head: true })
          .not("embedding", "is", null),
        warnings
      ),
      readCount(
        "chatbot_recommended_questions",
        supabase
          .from("chatbot_recommended_questions")
          .select("id", { count: "exact", head: true })
          .eq("placement", "starter")
          .eq("status", "published"),
        warnings
      ),
      listDocGapBacklog({ limit: 100 }),
    ])

    if (backlog.warning) warnings.push(`doc_gaps: ${backlog.warning}`)

    return NextResponse.json(
      buildChatbotAlphaReadiness({
        hasSupabaseEnv,
        hasGeminiApiKey,
        docsArticleCount,
        docsChunkCount,
        embeddedChunkCount,
        recommendedQuestionCount,
        unresolvedGapCount: backlog.gapClusters.length,
        zeroResultSearchCount: backlog.zeroResultSearches.length,
        warnings,
      })
    )
  } catch (error) {
    console.error("[GET /api/admin/docs/alpha-readiness] error:", error)
    return NextResponse.json({ error: "챗봇 알파 준비도를 조회하지 못했습니다." }, { status: 500 })
  }
}
