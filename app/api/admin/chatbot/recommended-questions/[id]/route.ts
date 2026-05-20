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
} from "../_shared"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface RouteContext {
  params: Promise<{ id: string }>
}

function getBodyObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  if (!hasSupabaseServerEnv()) {
    return NextResponse.json(
      { error: "Supabase 환경변수가 없어 추천 질문을 수정할 수 없습니다." },
      { status: 503 }
    )
  }

  const { id } = await context.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "추천 질문 ID가 올바르지 않습니다." }, { status: 400 })
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

  const patch: Record<string, unknown> = {}

  if ("label" in payload) {
    const label = normalizeString(payload.label)
    if (!label) return NextResponse.json({ error: "label은 비워둘 수 없습니다." }, { status: 400 })
    patch.label = label
  }

  if ("prompt" in payload) {
    const prompt = normalizeString(payload.prompt)
    if (!prompt) return NextResponse.json({ error: "prompt는 비워둘 수 없습니다." }, { status: 400 })
    patch.prompt = prompt
  }

  if ("placement" in payload) {
    if (!isRecommendedQuestionPlacement(payload.placement)) {
      return NextResponse.json({ error: "지원하지 않는 노출 위치입니다." }, { status: 400 })
    }
    patch.placement = payload.placement
  }

  if ("status" in payload) {
    if (!isRecommendedQuestionStatus(payload.status)) {
      return NextResponse.json({ error: "지원하지 않는 추천 질문 상태입니다." }, { status: 400 })
    }
    patch.status = payload.status
  }

  if ("orderIndex" in payload) {
    const orderIndex = normalizeOrderIndex(payload.orderIndex)
    if (orderIndex === undefined) {
      return NextResponse.json({ error: "orderIndex가 올바르지 않습니다." }, { status: 400 })
    }
    patch.order_index = orderIndex
  }

  if ("category" in payload) patch.category = normalizeNullableString(payload.category)
  if ("mappedArticleId" in payload) patch.mapped_article_id = normalizeUuid(payload.mappedArticleId) ?? null
  if ("metadata" in payload) patch.metadata = normalizeJsonObject(payload.metadata) ?? {}

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "수정할 필드가 없습니다." }, { status: 400 })
  }

  try {
    const supabase = createRecommendedQuestionsClient()
    const { data, error } = await supabase
      .from("chatbot_recommended_questions")
      .update(patch)
      .eq("id", id)
      .select(
        "id, label, prompt, placement, status, order_index, category, mapped_article_id, metadata, created_at, updated_at"
      )
      .single()

    if (error) throw error
    return NextResponse.json(rowToRecommendedQuestion(data as RecommendedQuestionRow))
  } catch (error) {
    const message = error instanceof Error ? error.message : "추천 질문을 수정하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  if (!hasSupabaseServerEnv()) {
    return NextResponse.json(
      { error: "Supabase 환경변수가 없어 추천 질문을 삭제할 수 없습니다." },
      { status: 503 }
    )
  }

  const { id } = await context.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "추천 질문 ID가 올바르지 않습니다." }, { status: 400 })
  }

  try {
    const supabase = createRecommendedQuestionsClient()
    const { error } = await supabase.from("chatbot_recommended_questions").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "추천 질문을 삭제하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
