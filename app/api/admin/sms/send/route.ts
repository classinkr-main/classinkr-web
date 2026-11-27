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
 *
 * 2026-09-25(CT11) — 수신자 조회를 range 페이지네이션으로 바꿨다(이전엔 PostgREST 기본 1,000행에서
 * 조용히 잘렸다). 대신 1회 실행 상한(MAX_RECIPIENTS_PER_RUN)을 두고, 넘으면 한 건도 보내지 않고
 * 대상 수를 보고한다 — 태그로 나눠 보내게 한다. 상한 검사는 MESSAGING_DRY_RUN=1(시뮬레이션)에서도
 * 똑같이 걸린다. "(광고)" 표기·야간(21~08시) 제한은 메시지 정책 결정 전이라 코드로 강제하지 않는다.
 */

const LMS_MAX = 2000
/** 1회 실행당 실발송 상한 — 넘으면 중단·보고(나눠 보내기). 늘리려면 정책 결정 후 이 상수만 바꾼다. */
const MAX_RECIPIENTS_PER_RUN = 500
const SUBSCRIBER_PAGE_SIZE = 1000
const SUBSCRIBER_MAX_PAGES = 50

interface SendSmsRequest {
  message: string
  targetTags: string[]
  /** @deprecated 서버 조회 결과를 사용한다. 프론트 하위호환용으로만 유지. */
  recipientCount?: number
  testMode?: boolean
  /** 테스트 발송 대상 번호(testMode=true 시 필수). */
  testPhone?: string
  /** 같은 문구·같은 대상을 방금 보냈어도 다시 보낸다(중복 발송 확인을 거친 뒤에만 true). */
  force?: boolean
}

/** 같은 문구·같은 대상 태그의 발송이 이 시간 안에 있으면 force 없이는 다시 보내지 않는다. */
const DUPLICATE_SEND_WINDOW_MS = 10 * 60 * 1000

function sameTags(a: unknown, b: string[]) {
  const left = Array.isArray(a) ? [...a].map(String).sort() : []
  const right = [...b].sort()
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/** 방금 나간 같은 발송을 찾는다 — 두 번 눌러 같은 문자가 전원에게 두 번 나가는 것을 막는다. 조회 실패는 던진다(확인 없이 보내지 않는다). */
async function findRecentDuplicateSend(message: string, targetTags: string[]) {
  const sb = createSupabaseAdminClient()
  const since = new Date(Date.now() - DUPLICATE_SEND_WINDOW_MS).toISOString()
  const { data, error } = await sb
    .from("sms_campaigns")
    .select("id, target_tags, status, created_at, sent_count")
    .eq("message", message)
    .in("status", ["sent", "partial"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw new Error(`최근 발송 이력 조회 실패: ${error.message}`)
  return ((data ?? []) as Array<{ id: string; target_tags: unknown; status: string; created_at: string; sent_count: number | null }>).find(
    (row) => sameTags(row.target_tags, targetTags)
  ) ?? null
}

/**
 * 태그 조건으로 활성 구독자 전화번호를 전량 조회한다(중복·빈값 제거).
 * range 페이지네이션 + id 타이브레이커 정렬, 실제 받은 행 수만큼 전진하고 빈 페이지에서 멈춘다.
 * 페이지 상한을 넘으면 무음 절단 대신 에러로 드러낸다.
 */
async function resolveRecipientPhones(targetTags: string[]): Promise<string[]> {
  const sb = createSupabaseAdminClient()
  const seen = new Set<string>()
  const phones: string[] = []

  let from = 0
  for (let page = 0; ; page += 1) {
    if (page >= SUBSCRIBER_MAX_PAGES) {
      throw new Error(
        `수신자 조회가 ${SUBSCRIBER_MAX_PAGES}페이지(${SUBSCRIBER_MAX_PAGES * SUBSCRIBER_PAGE_SIZE}행)를 넘었습니다.`
      )
    }

    let query = sb
      .from("newsletter_subscribers")
      .select("id, phone")
      .eq("status", "active")
      .not("phone", "is", null)

    if (Array.isArray(targetTags) && targetTags.length > 0) {
      query = query.overlaps("tags", targetTags)
    }

    const { data, error } = await query
      .order("id", { ascending: true })
      .range(from, from + SUBSCRIBER_PAGE_SIZE - 1)
    if (error) {
      throw new Error(`수신자 조회 실패: ${error.message}`)
    }

    const rows = data ?? []
    if (rows.length === 0) break
    for (const row of rows) {
      const raw = (row as { phone?: string | null }).phone
      if (!raw) continue
      const normalized = raw.replace(/[^0-9]/g, "")
      if (normalized.length < 9) continue // 유효 번호가 아님
      if (seen.has(normalized)) continue
      seen.add(normalized)
      phones.push(raw)
    }
    from += rows.length
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

    // 1회 상한 초과 — 일부만 보내지 않고 통째로 멈춘 뒤 대상 수를 보고한다(캠페인 이력도 남기지 않는다).
    if (recipientPhones.length > MAX_RECIPIENTS_PER_RUN) {
      console.warn(
        `[SMS SEND] 1회 상한 초과로 중단 — 대상 ${recipientPhones.length}명 > 상한 ${MAX_RECIPIENTS_PER_RUN}명`
      )
      return NextResponse.json(
        {
          error: `발송 대상 ${recipientPhones.length.toLocaleString("ko-KR")}명이 1회 상한 ${MAX_RECIPIENTS_PER_RUN}명을 넘어 발송하지 않았습니다. 태그로 나눠 보내주세요.`,
          code: "recipient_cap_exceeded",
          recipientCount: recipientPhones.length,
          maxPerRun: MAX_RECIPIENTS_PER_RUN,
          sentCount: 0,
        },
        { status: 409 }
      )
    }
  }

  // ── 실발송(lib/messaging 경유) ──────────────────────────────
  const trimmedMessage = message.trim()

  // ── 중복 발송 확인(테스트 발송 제외) ─────────────────────────
  if (!testMode && body.force !== true) {
    let duplicate: Awaited<ReturnType<typeof findRecentDuplicateSend>>
    try {
      duplicate = await findRecentDuplicateSend(trimmedMessage, Array.isArray(targetTags) ? targetTags : [])
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "최근 발송 이력 조회 실패" }, { status: 500 })
    }
    if (duplicate) {
      const minutes = Math.max(1, Math.round((Date.now() - new Date(duplicate.created_at).getTime()) / 60000))
      return NextResponse.json(
        {
          error: `같은 문구를 같은 대상에게 ${minutes}분 전에 보냈습니다(${duplicate.sent_count ?? 0}건). 다시 보내려면 확인 후 다시 요청해 주세요.`,
          code: "recent_duplicate_send",
          campaignId: duplicate.id,
          sentCount: 0,
        },
        { status: 409 }
      )
    }
  }
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
