import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { generateDocDraft } from "@/lib/chatbot/doc-gaps"

// 갭 질문에 대한 AI 문서 초안 생성(저장하지 않음 — 어드민 검토 후 게시).
export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  let body: { question?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 })
  }

  const question = typeof body.question === "string" ? body.question.trim() : ""
  if (!question) {
    return NextResponse.json({ error: "question은 필수입니다." }, { status: 400 })
  }

  try {
    const draft = await generateDocDraft(question)
    if (!draft) {
      return NextResponse.json(
        { error: "초안을 생성하지 못했습니다. GEMINI_API_KEY 설정을 확인하세요." },
        { status: 502 }
      )
    }
    return NextResponse.json(draft)
  } catch (error) {
    console.error("[POST /api/admin/docs/gaps/draft] error:", error)
    return NextResponse.json({ error: "초안 생성 중 오류가 발생했습니다." }, { status: 500 })
  }
}
