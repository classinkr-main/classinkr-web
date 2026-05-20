import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import {
  createRecommendedQuestionsClient,
  hasSupabaseServerEnv,
  isRecommendedQuestionPlacement,
  isRecommendedQuestionStatus,
  normalizeJsonObject,
  normalizeNullableString,
  normalizeOrderIndex,
  normalizeString,
  normalizeUuid,
  rowToRecommendedQuestion,
  type RecommendedQuestionRow,
} from "./_shared"

function getBodyObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  if (!hasSupabaseServerEnv()) {
    return NextResponse.json({
      questions: [],
      warning: "Supabase 환경변수가 없어 추천 질문을 조회하지 않았습니다.",
    })
  }

  const status = req.nextUrl.searchParams.get("status")
  const placement = req.nextUrl.searchParams.get("placement") ?? "starter"

  try {
    const supabase = createRecommendedQuestionsClient()
    let query = supabase
      .from("chatbot_recommended_questions")
      .select(
        "id, label, prompt, placement, status, order_index, category, mapped_article_id, metadata, created_at, updated_at"
      )
      .order("order_index", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(100)

    if (isRecommendedQuestionPlacement(placement)) {
      query = query.eq("placement", placement)
    }

    if (status && status !== "all" && isRecommendedQuestionStatus(status)) {
      query = query.eq("status", status)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({
      questions: ((data ?? []) as RecommendedQuestionRow[]).map(rowToRecommendedQuestion),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "추천 질문을 조회하지 못했습니다."
    return NextResponse.json({
      questions: [],
      warning: `추천 질문 테이블을 읽지 못했습니다: ${message}`,
    })
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  if (!hasSupabaseServerEnv()) {
    return NextResponse.json(
      { error: "Supabase 환경변수가 없어 추천 질문을 생성할 수 없습니다." },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 })
  }

  const payload = getBodyObject(body)
  if (!payload) {
    return NextResponse.json({ error: "요청 본문이 비어 있습니다." }, { status: 400 })
  }

  const label = normalizeString(payload.label)
  const prompt = normalizeString(payload.prompt)
  if (!label || !prompt) {
    return NextResponse.json({ error: "label과 prompt는 필수입니다." }, { status: 400 })
  }

  const placement = isRecommendedQuestionPlacement(payload.placement)
    ? payload.placement
    : "starter"
  const status = isRecommendedQuestionStatus(payload.status) ? payload.status : "draft"

  try {
    const supabase = createRecommendedQuestionsClient()
    const { data, error } = await supabase
      .from("chatbot_recommended_questions")
      .insert({
        label,
        prompt,
        placement,
        status,
        order_index: normalizeOrderIndex(payload.orderIndex) ?? 100,
        category: normalizeNullableString(payload.category),
        mapped_article_id: normalizeUuid(payload.mappedArticleId) ?? null,
        metadata: normalizeJsonObject(payload.metadata) ?? {},
      })
      .select(
        "id, label, prompt, placement, status, order_index, category, mapped_article_id, metadata, created_at, updated_at"
      )
      .single()

    if (error) throw error
    return NextResponse.json(rowToRecommendedQuestion(data as RecommendedQuestionRow), { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "추천 질문을 생성하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
