import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { ChatbotInputError, updateQuestionCluster } from "@/lib/chatbot/service"

interface QuestionClusterRouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, context: QuestionClusterRouteContext) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const { id } = await context.params
    const result = await updateQuestionCluster(id, await req.json())
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
