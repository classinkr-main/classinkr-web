import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { sendSmsMessages, sendKakaoAlimtalk } from "@/lib/messaging/send"

/**
 * POST /api/admin/messaging/test-send
 *
 * 단건 실발송(테스트). message_logs 에 context.source="test-send" 로 기록된다.
 * solapi 에러 메시지(발신번호 미등록 등)를 그대로 error 에 담아 프론트 진단에 쓰이게 한다.
 *
 * body: { channel:"sms"|"kakao", to, text?, templateId?, variables? }
 * data: { status:"sent"|"failed"|"simulated", messageId?, error? }
 */

interface TestSendBody {
  channel?: "sms" | "kakao"
  to?: string
  text?: string
  templateId?: string
  variables?: Record<string, string>
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  let body: TestSendBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 })
  }

  const { channel, to, text, templateId, variables } = body

  if (!to || typeof to !== "string" || to.trim().length === 0) {
    return NextResponse.json({ error: "수신 번호(to)는 필수입니다." }, { status: 400 })
  }

  if (channel === "sms") {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "문자 내용(text)은 필수입니다." }, { status: 400 })
    }

    const result = await sendSmsMessages({
      messages: [{ to: to.trim(), text }],
      context: { source: "test-send" },
    })

    const first = result.results[0]
    return NextResponse.json({
      data: {
        status: first?.status ?? (result.simulated > 0 ? "simulated" : result.failed > 0 ? "failed" : "sent"),
        ...(first?.messageId ? { messageId: first.messageId } : {}),
        ...(first?.error || result.error ? { error: first?.error ?? result.error } : {}),
      },
    })
  }

  if (channel === "kakao") {
    if (!templateId || typeof templateId !== "string" || templateId.trim().length === 0) {
      return NextResponse.json(
        { error: "알림톡 템플릿 ID(templateId)는 필수입니다." },
        { status: 400 }
      )
    }

    const result = await sendKakaoAlimtalk({
      to: to.trim(),
      templateId: templateId.trim(),
      variables: variables ?? {},
      context: { source: "test-send" },
    })

    const first = result.results[0]
    return NextResponse.json({
      data: {
        status: first?.status ?? (result.simulated > 0 ? "simulated" : result.failed > 0 ? "failed" : "sent"),
        ...(first?.messageId ? { messageId: first.messageId } : {}),
        ...(first?.error || result.error ? { error: first?.error ?? result.error } : {}),
      },
    })
  }

  return NextResponse.json(
    { error: "channel 은 'sms' 또는 'kakao' 여야 합니다." },
    { status: 400 }
  )
}
