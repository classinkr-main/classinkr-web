import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import {
  CS_COPILOT_API_ROLES,
  CS_KNOWLEDGE_PROMOTE_CAPABILITY,
  requireCsCopilotCapability,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import {
  deriveKnowledgeMetaFromMessage,
  embedInternalText,
  promoteMessageToInternalArticle,
} from "@/lib/internal-cs-chat/internal-article-writer"
import { INTERNAL_CS_METRICS_CACHE_TAG } from "@/lib/internal-cs-chat/metrics"
import { redactInternalCsText } from "@/lib/internal-cs-chat/privacy"
import { redactInternalCsDraft } from "@/lib/internal-cs-chat/redact"
import { hasQuickApprovedLabel, isSameAsOriginal } from "@/lib/internal-cs-chat/review-guard"
import {
  getInternalCsMessageById,
  isInternalCsChatNotReadyError,
  promoteRegressionOutcomes,
} from "@/lib/repositories/internal-cs-chat"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type Context = { params: Promise<{ messageId: string }> }

// 승격 요청 본문은 선택이다. 빈 본문은 {} 로, 깨진 JSON 은 400 으로 다룬다.
async function readOptionalBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const text = await req.text().catch(() => "")
  if (!text.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// 지식 승격(계약 3) — 검토 패널·회귀 항목의 "지식으로 승격" 버튼이 소비한다.
// 대상: corrected_content 가 있고 review_state 가 approved 또는 changes_requested(교정본을 써서 돌려보낸 답, loop-2).
// 거절(409): quick_approved 라벨이거나 교정본이 AI 원문과 같음(IC-01) — 검토 없이 원문을 공유 지식으로 만드는 경로다.
// 가림(409 → 확인 플래그): 교정본에 전화·이메일·계좌·계정 ID 같은 값이 있으면 경고와 함께 거절하고,
// confirmRedaction: true 로 다시 보내면 가린 글을 저장한다(IC-04).
// 성공 뒤: 이 메시지의 회귀 판정(not_evaluated/needs_fix)을 promoted 로 닫고 지표 캐시를 무효화한다(loop-1·loop-9).
// 보강 큐(question_clusters) 항목은 여기서 닫지 않는다 — 응답의 gapQueueNote 로 안내한다.
// 멱등: 같은 메시지 재승격 시 기존 문서 갱신(reused).
// 문서는 visibility='internal', noindex=true, updated_by='cs-knowledge-promotion', content_json 백링크.
export async function POST(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CS_COPILOT_API_ROLES)
  if (admin instanceof NextResponse) return admin
  // 교정본을 공유 지식 문서로 만드는 동작 — capability 가 필요하다(기본 부여 역할은 lib/admin-auth.ts).
  const capabilityError = requireCsCopilotCapability(admin, CS_KNOWLEDGE_PROMOTE_CAPABILITY)
  if (capabilityError) return capabilityError

  const { messageId } = await context.params
  const body = await readOptionalBody(req)
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  if (body.confirmRedaction !== undefined && typeof body.confirmRedaction !== "boolean") {
    return NextResponse.json({ error: "confirmRedaction must be a boolean" }, { status: 400 })
  }

  try {
    const message = await getInternalCsMessageById(messageId)
    if (!message) {
      return NextResponse.json({ error: "Assistant message not found" }, { status: 404 })
    }

    const trimmedCorrection = message.corrected_content?.trim()
    const reviewedWithCorrection =
      message.review_state === "approved" || message.review_state === "changes_requested"
    if (!reviewedWithCorrection || !trimmedCorrection) {
      return NextResponse.json(
        {
          error: "검토 수정본(corrected_content)이 있는 승인·수정 요청 답변만 지식으로 승격할 수 있습니다",
        },
        { status: 400 }
      )
    }

    if (hasQuickApprovedLabel(message.feedback_labels) || isSameAsOriginal(trimmedCorrection, message.content)) {
      return NextResponse.json(
        {
          error: "즉시 승인됐거나 교정본이 AI 초안 원문과 같은 답은 지식으로 승격할 수 없습니다. 검토 드로어에서 다시 검토해 주세요.",
          code: "unreviewed_original",
        },
        { status: 409 }
      )
    }

    const redaction = redactInternalCsDraft(trimmedCorrection)
    if (redaction.count > 0 && body.confirmRedaction !== true) {
      return NextResponse.json(
        {
          error: `교정본에 개인정보로 보이는 값 ${redaction.count}건이 있습니다. 가린 글로 승격하려면 확인 후 다시 요청해 주세요.`,
          code: "redaction_confirmation_required",
          warnings: [`개인정보 ${redaction.count}건을 가렸습니다`],
          redactionCount: redaction.count,
          redactedPreview: redaction.text,
        },
        { status: 409 }
      )
    }
    const correctedContent = redaction.text

    const supabase = createSupabaseAdminClient()
    // 원 답변의 근거 상태(확신도·외부 사용 범위)와 검토 시각을 승격 문서로 넘긴다 — 없으면 확신도 없는 지식이 쌓인다.
    const knowledge = deriveKnowledgeMetaFromMessage({
      metadata: message.metadata,
      reviewedAt: message.reviewed_at,
    })
    const result = await promoteMessageToInternalArticle(supabase, {
      messageId: message.id,
      conversationId: message.conversation_id,
      correctedContent,
      knowledge,
      // 저장 글(correctedContent)은 위에서 가린 교정본이다. 임베딩 API 도 외부 모델이라 입력을 한 번 더 가린다.
      // (질의 쪽도 redacted 질문으로 임베딩하므로 같은 토큰 공간에서 매칭된다.) internal-article-writer 는
      // seed 스크립트가 tsx 로 직접 실행해 server-only 경계를 import 할 수 없어 라우트에서 주입한다.
      embed: (text) => embedInternalText(redactInternalCsText(text)),
    })

    // 고리 닫기(loop-1): 승격은 이미 끝났으므로 아래 두 부수 작업의 실패는 응답을 바꾸지 않는다.
    try {
      await promoteRegressionOutcomes([{ messageId: message.id }])
    } catch (error) {
      console.error(
        `[internal-cs] failed to mark regression outcome promoted for ${message.id}:`,
        error instanceof Error ? error.message : error
      )
    }
    try {
      revalidateTag(INTERNAL_CS_METRICS_CACHE_TAG, "max")
    } catch (error) {
      console.error("[internal-cs] failed to revalidate metrics cache:", error instanceof Error ? error.message : error)
    }

    // searchable: 모든 청크 임베딩 성공 = 벡터 검색으로 즉시 노출. 실패분이 있으면 문서는
    // 저장됐지만 일부 청크가 검색되지 않는다 — UI 가 배지로 분기한다.
    return NextResponse.json({
      articleId: result.articleId,
      slug: result.slug,
      reused: result.reused,
      searchable: result.embeddingFailures === 0,
      redacted: redaction.count,
      gapQueueNote: "보강 큐에 같은 질문 항목이 있으면 별도로 닫아야 합니다.",
    })
  } catch (error) {
    console.error(`[POST /api/admin/cs-chat/messages/${messageId}/promote-knowledge]`, error)
    if (isInternalCsChatNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to promote internal CS knowledge" }, { status: 500 })
  }
}
