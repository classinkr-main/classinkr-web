import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const SMS_MAX = 90
const LMS_MAX = 2000

interface SendSmsRequest {
  message: string
  targetTags: string[]
  recipientCount: number
  testMode?: boolean
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  let body: SendSmsRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 })
  }

  const { message, targetTags, recipientCount, testMode = false } = body

  // ── 유효성 검사 ─────────────────────────────────────────────
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "문자 내용은 필수입니다." }, { status: 400 })
  }

  if (message.length > LMS_MAX) {
    return NextResponse.json(
      { error: `문자 내용이 너무 깁니다. 최대 ${LMS_MAX}자 (LMS 기준)` },
      { status: 400 }
    )
  }

  if (!testMode && (typeof recipientCount !== "number" || recipientCount <= 0)) {
    return NextResponse.json(
      { error: "발송 대상이 없습니다. 수신자를 선택해주세요." },
      { status: 400 }
    )
  }

  const type: "SMS" | "LMS" = message.length <= SMS_MAX ? "SMS" : "LMS"
  const finalRecipientCount = testMode ? 1 : recipientCount

  // ── Provider stub ────────────────────────────────────────────
  // TODO: integrate with SMS provider (Aligo/NHN KakaoCloud)
  console.log(
    `[SMS SEND] type=${type} recipients=${finalRecipientCount} testMode=${testMode} message="${message.slice(0, 30)}${message.length > 30 ? "…" : ""}"`
  )

  // ── DB에 캠페인 기록 저장 ─────────────────────────────────
  const sb = createSupabaseAdminClient()

  const { data: campaign, error } = await sb
    .from("sms_campaigns")
    .insert({
      message: message.trim(),
      target_tags: Array.isArray(targetTags) ? targetTags : [],
      recipient_count: finalRecipientCount,
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error("[SMS SEND] DB 저장 실패:", error.message)
    return NextResponse.json(
      { error: "캠페인 기록 저장에 실패했습니다.", detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    campaignId: campaign.id,
    type,
    recipientCount: finalRecipientCount,
    testMode,
  })
}
