import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { updateQuestionCluster } from "@/lib/chatbot/service"
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

  // 계약 4: clusterId 가 오면 등록 + 클러스터 published 를 이 핸들러가 함께 처리한다.
  const clusterId = payload.clusterId === undefined ? undefined : normalizeUuid(payload.clusterId)
  if (payload.clusterId !== undefined && !clusterId) {
    return NextResponse.json({ error: "clusterId가 올바르지 않습니다." }, { status: 400 })
  }

  const selectColumns =
    "id, label, prompt, placement, status, order_index, category, mapped_article_id, metadata, created_at, updated_at"

  try {
    const supabase = createRecommendedQuestionsClient()

    // 재시도 멱등성: clusterUpdated:false 경고 후 재클릭 시 같은 클러스터의 추천 질문이
    // 중복 생성되지 않도록, metadata.clusterId 링크로 기존 행을 먼저 찾는다.
    let row: RecommendedQuestionRow | null = null
    let reused = false
    if (clusterId) {
      const { data: existingRows, error: existingError } = await supabase
        .from("chatbot_recommended_questions")
        .select(selectColumns)
        .eq("metadata->>clusterId", clusterId)
        .limit(1)

      if (existingError) throw existingError
      const existingRow = ((existingRows ?? []) as RecommendedQuestionRow[])[0]
      if (existingRow) {
        row = existingRow
        reused = true
      }
    }

    if (!row) {
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
          metadata: {
            ...(normalizeJsonObject(payload.metadata) ?? {}),
            ...(clusterId ? { clusterId } : {}),
          },
        })
        .select(selectColumns)
        .single()

      if (error) throw error
      row = data as RecommendedQuestionRow
    }

    if (!clusterId) {
      return NextResponse.json(rowToRecommendedQuestion(row), { status: 201 })
    }

    try {
      await updateQuestionCluster(clusterId, { status: "published" })
    } catch (clusterError) {
      // 부분 성공: 추천 질문은 있고 클러스터 갱신만 실패 — 상태를 body 에 명시해 재시도를 유도한다.
      const message =
        clusterError instanceof Error ? clusterError.message : "클러스터를 갱신하지 못했습니다."
      console.error(
        "[POST /api/admin/chatbot/recommended-questions] cluster publish failed:",
        message
      )
      return NextResponse.json(
        {
          error: `추천 질문은 등록됐지만 클러스터 상태 갱신에 실패했습니다: ${message}`,
          recommended: true,
          clusterUpdated: false,
          question: rowToRecommendedQuestion(row),
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { ...rowToRecommendedQuestion(row), recommended: true, clusterUpdated: true },
      { status: reused ? 200 : 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "추천 질문을 생성하지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
