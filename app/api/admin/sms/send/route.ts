import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { sendSmsMessages } from "@/lib/messaging/send"

/**
 * POST /api/admin/sms/send
 *
 * targetTags 로 수신자 전화번호를 서버가 직접 조회해 실발송한다.
 * (수신자 소스: newsletter_subscribers.phone — 20260413_subscriber_columns.sql 로 존재 확정.
 *  구독자 테이블이 SMS 대상 정본이고 leads 는 이메일 중심이므로 구독자 phone 을 기준으로 한다.)
 *
 * 하위호환: 기존 body 필드(message, targetTags, recipientCount, testMode)를 유지하되
 *   recipientCount 는 신뢰하지 않고 서버 조회 결과를 사용한다.
 *   testMode 시에는 body.testPhone 1건만 발송한다.
 *
 * sms_campaigns 에 정직한 status(sent/partial/failed/simulated) + sent_count/failed_count 기록.
 */

const LMS_MAX = 2000

interface SendSmsRequest {
  message: string
  targetTags: string[]
  /** @deprecated 서버 조회 결과를 사용한다. 프론트 하위호환용으로만 유지. */
  recipientCount?: number
  testMode?: boolean
  /** 테스트 발송 대상 번호(testMode=true 시 필수). */
  testPhone?: string
}

/** 태그 조건으로 활성 구독자 전화번호를 조회한다(중복·빈값 제거). */
async function resolveRecipientPhones(targetTags: string[]): Promise<string[]> {
  const sb = createSupabaseAdminClient()

  let query = sb
    .from("newsletter_subscribers")
    .select("phone")
    .eq("status", "active")
    .not("phone", "is", null)

  if (Array.isArray(targetTags) && targetTags.length > 0) {
    query = query.overlaps("tags", targetTags)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`수신자 조회 실패: ${error.message}`)
  }

  const seen = new Set<string>()
  const phones: string[] = []
  for (const row of data ?? []) {
    const raw = (row as { phone?: string | null }).phone
    if (!raw) continue
    const normalized = raw.replace(/[^0-9]/g, "")
    if (normalized.length < 9) continue // 유효 번호가 아님
    if (seen.has(normalized)) continue
    seen.add(normalized)
    phones.push(raw)
  }
  return phones
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

  const { message, targetTags, testMode = false, testPhone } = body

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

  // ── 수신자 결정(서버 조회) ──────────────────────────────────
  let recipientPhones: string[]
  if (testMode) {
    if (!testPhone || typeof testPhone !== "string" || testPhone.trim().length === 0) {
      return NextResponse.json(
        { error: "테스트 발송 번호(testPhone)를 입력해주세요." },
        { status: 400 }
      )
    }
    recipientPhones = [testPhone.trim()]
  } else {
    try {
      recipientPhones = await resolveRecipientPhones(Array.isArray(targetTags) ? targetTags : [])
    } catch (err) {
      const detail = err instanceof Error ? err.message : "수신자 조회 실패"
      return NextResponse.json({ error: detail }, { status: 500 })
    }

    if (recipientPhones.length === 0) {
      return NextResponse.json(
        { error: "발송 대상이 없습니다. 전화번호가 등록된 구독자를 선택해주세요." },
        { status: 400 }
      )
    }
  }

  // ── 실발송(lib/messaging 경유) ──────────────────────────────
  const trimmedMessage = message.trim()
  const result = await sendSmsMessages({
    messages: recipientPhones.map((phone) => ({ to: phone, text: trimmedMessage })),
    context: { source: "sms-campaign", testMode },
  })

  // ── 정직한 status 산출 ──────────────────────────────────────
  let status: "sent" | "partial" | "failed" | "simulated"
  if (result.simulated > 0 && result.sent === 0 && result.failed === 0) {
    status = "simulated"
  } else if (result.failed > 0 && result.sent === 0) {
    status = "failed"
  } else if (result.failed > 0) {
    status = "partial"
  } else {
    status = "sent"
  }

  // ── DB 기록(테스트 발송은 캠페인 이력을 남기지 않음) ─────────
  if (testMode) {
    return NextResponse.json({
      ok: status !== "failed",
      testMode: true,
      status,
      recipientCount: recipientPhones.length,
      sentCount: result.sent,
      failedCount: result.failed,
      simulatedCount: result.simulated,
      ...(result.error ? { error: result.error } : {}),
    })
  }

  const sb = createSupabaseAdminClient()
  const { data: campaign, error } = await sb
    .from("sms_campaigns")
    .insert({
      message: trimmedMessage,
      target_tags: Array.isArray(targetTags) ? targetTags : [],
      recipient_count: recipientPhones.length,
      sent_count: result.sent,
      failed_count: result.failed,
      status,
      sent_at:
        status === "sent" || status === "partial" ? new Date().toISOString() : null,
      error_message: result.error ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error("[SMS SEND] DB 저장 실패:", error.message)
    // 발송은 이미 나갔으므로 발송 결과는 정직하게 반환하되 기록 실패를 알린다.
    return NextResponse.json(
      {
        error: "발송은 처리됐으나 캠페인 기록 저장에 실패했습니다.",
        detail: error.message,
        status,
        sentCount: result.sent,
        failedCount: result.failed,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: status !== "failed",
    campaignId: campaign.id,
    status,
    recipientCount: recipientPhones.length,
    sentCount: result.sent,
    failedCount: result.failed,
    simulatedCount: result.simulated,
    ...(result.error ? { error: result.error } : {}),
  })
}
