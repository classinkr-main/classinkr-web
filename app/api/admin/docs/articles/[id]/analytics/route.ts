import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getDocsArticleAnalytics } from "@/lib/repositories/docs-articles"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await context.params
  const days = Number(req.nextUrl.searchParams.get("days") ?? 90)

  try {
    return NextResponse.json(await getDocsArticleAnalytics(id, Number.isFinite(days) ? days : 90))
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 성과를 조회하지 못했습니다."
    return NextResponse.json({
      articleId: id,
      feedbackTotal: 0,
      helpfulTotal: 0,
      notHelpfulTotal: 0,
      helpfulRate: null,
      searchClicks: 0,
      chatbotCitations: 0,
      recentFeedback: [],
      recentSearches: [],
      warning: message,
    })
  }
}
