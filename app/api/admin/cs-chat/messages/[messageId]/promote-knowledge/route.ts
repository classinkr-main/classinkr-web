import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { promoteMessageToInternalArticle } from "@/lib/internal-cs-chat/internal-article-writer"
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
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error(`[POST /api/admin/cs-chat/messages/${messageId}/promote-knowledge]`, error)
    if (isInternalCsChatNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to promote internal CS knowledge" }, { status: 500 })
  }
}
