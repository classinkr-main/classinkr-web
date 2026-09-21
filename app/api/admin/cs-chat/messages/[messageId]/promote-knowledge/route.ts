import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  embedInternalText,
  promoteMessageToInternalArticle,
} from "@/lib/internal-cs-chat/internal-article-writer"
import { redactInternalCsText } from "@/lib/internal-cs-chat/privacy"
import {
  getInternalCsMessageById,
  isInternalCsChatNotReadyError,
} from "@/lib/repositories/internal-cs-chat"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type Context = { params: Promise<{ messageId: string }> }

// 지식 승격(계약 3) — 검토 패널·회귀 항목의 "지식으로 승격" 버튼이 소비한다.
// 대상: review_state=approved && corrected_content 존재. 멱등: 같은 메시지 재승격 시 기존 문서 갱신(reused).
// 문서는 visibility='internal', noindex=true, updated_by='cs-knowledge-promotion', content_json 백링크.
export async function POST(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { messageId } = await context.params

  try {
    const message = await getInternalCsMessageById(messageId)
    if (!message) {
      return NextResponse.json({ error: "Assistant message not found" }, { status: 404 })
    }

    const correctedContent = message.corrected_content?.trim()
    if (message.review_state !== "approved" || !correctedContent) {
      return NextResponse.json(
        {
          error: "승인(approved)되고 검토 수정본(corrected_content)이 있는 답변만 지식으로 승격할 수 있습니다",
        },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdminClient()
    const result = await promoteMessageToInternalArticle(supabase, {
      messageId: message.id,
      conversationId: message.conversation_id,
      correctedContent,
      // 임베딩 API 도 외부 모델이다 — 청크 원문은 그대로 저장하되 임베딩 입력만 PII 를 가린다.
      // (질의 쪽도 redacted 질문으로 임베딩하므로 같은 토큰 공간에서 매칭된다.) internal-article-writer 는
      // seed 스크립트가 tsx 로 직접 실행해 server-only 경계를 import 할 수 없어 라우트에서 주입한다.
      embed: (text) => embedInternalText(redactInternalCsText(text)),
    })

    // searchable: 모든 청크 임베딩 성공 = 벡터 검색으로 즉시 노출. 실패분이 있으면 문서는
    // 저장됐지만 일부 청크가 검색되지 않는다 — UI 가 배지로 분기한다.
    return NextResponse.json({
      articleId: result.articleId,
      slug: result.slug,
      reused: result.reused,
      searchable: result.embeddingFailures === 0,
    })
  } catch (error) {
    console.error(`[POST /api/admin/cs-chat/messages/${messageId}/promote-knowledge]`, error)
    if (isInternalCsChatNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to promote internal CS knowledge" }, { status: 500 })
  }
}
