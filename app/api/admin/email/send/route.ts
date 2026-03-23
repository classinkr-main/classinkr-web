/**
 * ─────────────────────────────────────────────────────────────
 * /api/admin/email/send  —  이메일 캠페인 발송 API
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-11] 이메일 발송 전략
 *   현재: 웹훅 기반 발송 (Google Apps Script / Make / n8n 등)
 *   향후: Resend SDK 또는 Brevo API 직접 연동 권장.
 *
 *   웹훅 방식의 흐름:
 *   1. 관리자가 제목 + 본문 + 대상 태그 지정
 *   2. 서버에서 대상 구독자 필터링
 *   3. EMAIL_WEBHOOK_URL로 수신자 목록 + 본문 전송
 *   4. 외부 서비스(Make/n8n)에서 실제 이메일 발송 처리
 *
 * [NOTE-12] {name} 치환 (개인화)
 *   본문 내 {name} 패턴을 각 구독자의 이름으로 치환.
 *   예) "안녕하세요 {name}님" → "안녕하세요 김원장님"
 *   향후 {org}, {role} 등 추가 변수도 확장 가능.
 */

import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getActiveSubscribersByTags } from "@/lib/marketing-data"
import { createCampaign } from "@/lib/marketing-data"
import type { SendEmailRequest } from "@/lib/marketing-types"

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  try {
    const body: SendEmailRequest = await req.json()

    if (!body.subject || !body.body) {
      return NextResponse.json(
        { error: "제목과 본문은 필수입니다." },
        { status: 400 }
      )
    }

    // ① 대상 구독자 필터링 [NOTE-8]
    const recipients = await getActiveSubscribersByTags(body.targetTags ?? [])

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "발송 대상이 없습니다. 태그 조건을 확인해주세요." },
        { status: 400 }
      )
    }

    /**
     * ② 이메일 발송 처리
     *
     * [NOTE-11] 웹훅 기반 발송
     * EMAIL_WEBHOOK_URL이 설정되어 있으면 외부 자동화 서비스로 전달.
     * 각 수신자별로 {name} 치환된 개인화 데이터를 포함.
     *
     * [NOTE-12] 개인화 변수 치환
     * recipients 배열에 각 수신자의 personalizedBody를 포함하여 전달.
     */
    const emailWebhookUrl = process.env.EMAIL_WEBHOOK_URL

    const personalizedRecipients = recipients.map((r) => ({
      email: r.email,
      name: r.name,
      org: r.org ?? "",
      /** [NOTE-12] {name}, {org} 등 본문 내 변수 치환 */
      personalizedBody: body.body
        .replace(/\{name\}/g, r.name)
        .replace(/\{org\}/g, r.org ?? "")
        .replace(/\{role\}/g, r.role ?? ""),
    }))

    let sendStatus: "sent" | "failed" = "sent"

    if (emailWebhookUrl) {
      try {
        const res = await fetch(emailWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: body.subject,
            recipients: personalizedRecipients,
            /** 수신거부 링크용 baseUrl (프론트엔드에서 구성) */
            unsubscribeBaseUrl: `${req.nextUrl.origin}/api/newsletter/unsubscribe`,
          }),
        })
        if (!res.ok) sendStatus = "failed"
      } catch {
        sendStatus = "failed"
      }
    } else {
      /**
       * [NOTE-13] EMAIL_WEBHOOK_URL 미설정 시
       * 실제 발송 없이 캠페인 기록만 저장 (테스트/개발 모드).
       * 콘솔에 로그를 남겨 디버깅 가능하도록 한다.
       */
      console.log("[EMAIL-DEV] 웹훅 URL 미설정. 발송 시뮬레이션:")
      console.log(`  제목: ${body.subject}`)
      console.log(`  대상: ${recipients.length}명`)
      console.log(`  태그: ${body.targetTags.join(", ") || "전체"}`)
    }

    // ③ 캠페인 이력 저장
    const campaign = await createCampaign({
      subject: body.subject,
      body: body.body,
      targetTags: body.targetTags ?? [],
      status: sendStatus,
      sentAt: sendStatus === "sent" ? new Date().toISOString() : undefined,
      recipientCount: recipients.length,
    })

    return NextResponse.json({
      ok: true,
      campaign,
      recipientCount: recipients.length,
      status: sendStatus,
    })
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청입니다." },
      { status: 400 }
    )
  }
}
