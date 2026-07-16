import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { ChatbotInputError, updateQuestionCluster } from "@/lib/chatbot/service"
import { promoteRegressionOutcomes } from "@/lib/repositories/internal-cs-chat"

interface QuestionClusterRouteContext {
  params: Promise<{ id: string }>
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

// 계약 7: 이 PATCH 가 mappedArticleId 를 설정했고 클러스터에 내부 CS 참조가 있으면,
// 참조 메시지의 회귀 판정을 promoted 로 전파한다 (not_evaluated/needs_fix 만 — repo 가 필터).
// 전파 실패가 매핑 응답 자체를 막으면 안 되므로 관측(console.error)만 남긴다.
async function propagatePromotedOutcomes(body: unknown, cluster: unknown) {
  try {
    const raw = getRecord(body)
    if (!raw || !Object.prototype.hasOwnProperty.call(raw, "mappedArticleId")) return

    const clusterRow = getRecord(cluster)
    if (!clusterRow?.mapped_article_id) return

    const metadata = getRecord(clusterRow.metadata)
    const refs = Array.isArray(metadata?.internalCs)
      ? metadata.internalCs.filter(
          (entry): entry is { conversationId: string; messageId: string } => {
            const candidate = getRecord(entry)
            return typeof candidate?.messageId === "string" && candidate.messageId.trim() !== ""
          }
        )
      : []
    if (refs.length === 0) return

    await promoteRegressionOutcomes(refs.map((ref) => ({ messageId: ref.messageId })))
  } catch (error) {
    console.error(
      "[PATCH /api/admin/chatbot/questions/[id]] promoted propagation failed:",
      error instanceof Error ? error.message : error
    )
  }
}

export async function PATCH(req: NextRequest, context: QuestionClusterRouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const { id } = await context.params
    const body = (await req.json()) as unknown
    const result = await updateQuestionCluster(id, body)
    await propagatePromotedOutcomes(body, result.cluster)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ChatbotInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("[PATCH /api/admin/chatbot/questions/[id]] error:", error)
    return NextResponse.json(
      { error: "질문 클러스터를 수정하지 못했습니다." },
      { status: 500 }
    )
  }
}
