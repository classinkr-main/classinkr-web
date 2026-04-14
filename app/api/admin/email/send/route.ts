import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createCampaign, updateCampaign, getActiveSubscribersByTags } from "@/lib/repositories/marketing"
import { sendBatchEmail, wrapCampaignHtml } from "@/lib/email"
import type { SendEmailRequest } from "@/lib/marketing-types"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(value?: string) {
  return !!value && EMAIL_REGEX.test(value.trim())
}

function replacePlaceholders(
  template: string,
  values: { name: string; org?: string; role?: string }
) {
  return template
    .replace(/\{name\}/g, values.name)
    .replace(/\{org\}/g, values.org ?? "")
    .replace(/\{role\}/g, values.role ?? "")
}

type PersonalizedRecipient = {
  email: string
  name: string
  org: string
  personalizedBody: string
  personalizedSubject?: string
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body: SendEmailRequest = await req.json()
    const sendMode = body.mode ?? "campaign"

    if (!body.subject || !body.body) {
      return NextResponse.json(
        { error: "제목과 본문은 필수입니다." },
        { status: 400 }
      )
    }

    const unsubscribeBaseUrl = `${req.nextUrl.origin}/api/newsletter/unsubscribe`
    let recipients: PersonalizedRecipient[] = []

    if (sendMode === "test") {
      if (!isValidEmail(body.testEmail)) {
        return NextResponse.json(
          { error: "테스트 발송용 이메일 주소를 입력해주세요." },
          { status: 400 }
        )
      }

      recipients = [
        {
          email: body.testEmail!.trim(),
          name: "테스트",
          org: "",
          personalizedSubject: replacePlaceholders(body.subject, {
            name: "테스트",
            role: "관리자",
          }),
          personalizedBody: replacePlaceholders(body.body, {
            name: "테스트",
            role: "관리자",
          }),
        },
      ]
    } else if (Array.isArray(body.aiPersonalized) && body.aiPersonalized.length > 0) {
      recipients = body.aiPersonalized
        .filter(
          (recipient) =>
            isValidEmail(recipient.email) &&
            typeof recipient.personalizedBody === "string" &&
            recipient.personalizedBody.trim().length > 0
        )
        .map((recipient) => ({
          email: recipient.email.trim(),
          name: recipient.name?.trim() || "고객",
          org: "",
          personalizedSubject: recipient.personalizedSubject ?? recipient.subject ?? body.subject,
          personalizedBody: recipient.personalizedBody,
        }))

      if (recipients.length === 0) {
        return NextResponse.json(
          { error: "AI 개인화 발송 대상이 올바르지 않습니다." },
          { status: 400 }
        )
      }
    } else if (Array.isArray(body.directEmails) && body.directEmails.length > 0) {
      // 직접 입력 모드: 이메일 주소 목록으로 발송
      const validEmails = body.directEmails
        .map((e) => e.trim())
        .filter((e) => isValidEmail(e))

      // 구독자 DB에서 매칭되는 사람은 이름 가져오기
      const allSubscribers = await getActiveSubscribersByTags([])
      const subMap = new Map(allSubscribers.map((s) => [s.email.toLowerCase(), s]))

      recipients = validEmails.map((email) => {
        const sub = subMap.get(email.toLowerCase())
        const name = sub?.name ?? email.split("@")[0]
        return {
          email,
          name,
          org: sub?.org ?? "",
          personalizedSubject: replacePlaceholders(body.subject, {
            name,
            org: sub?.org ?? "",
            role: sub?.role ?? "",
          }),
          personalizedBody: replacePlaceholders(body.body, {
            name,
            org: sub?.org ?? "",
            role: sub?.role ?? "",
          }),
        }
      })

      if (recipients.length === 0) {
        return NextResponse.json(
          { error: "유효한 이메일 주소가 없습니다." },
          { status: 400 }
        )
      }
    } else {
      const activeRecipients = await getActiveSubscribersByTags(body.targetTags ?? [])
      recipients = activeRecipients.map((recipient) => ({
        email: recipient.email,
        name: recipient.name,
        org: recipient.org ?? "",
        personalizedSubject: replacePlaceholders(body.subject, {
          name: recipient.name,
          org: recipient.org ?? "",
          role: recipient.role ?? "",
        }),
        personalizedBody: replacePlaceholders(body.body, {
          name: recipient.name,
          org: recipient.org ?? "",
          role: recipient.role ?? "",
        }),
      }))

      if (recipients.length === 0) {
        return NextResponse.json(
          { error: "발송 대상이 없습니다. 태그 조건을 확인해주세요." },
          { status: 400 }
        )
      }
    }

    // 테스트 발송: 캠페인 레코드 없이 바로 발송
    if (sendMode === "test") {
      const testEmails = recipients.map((r) => ({
        to: r.email,
        subject: r.personalizedSubject ?? body.subject,
        html: wrapCampaignHtml(
          r.personalizedBody,
          `${unsubscribeBaseUrl}?email=${encodeURIComponent(r.email)}`,
        ),
      }))
      const testResult = await sendBatchEmail(testEmails)
      return NextResponse.json({
        ok: true,
        test: true,
        provider: testResult.provider,
        recipientCount: testResult.sent,
        status: testResult.failed > 0 && testResult.sent === 0 ? "failed" : "sent",
      })
    }

    // 캠페인 레코드를 먼저 생성(draft)해서 ID를 확보 — 추적 픽셀 URL에 사용
    const campaign = await createCampaign({
      subject: body.subject,
      body: body.body,
      targetTags: body.targetTags ?? [],
      status: "draft",
      recipientCount: 0,
    })

    const baseUrl = req.nextUrl.origin
    const trackingUrl = `${baseUrl}/api/track/open?cid=${campaign.id}`

    // 통합 이메일 엔진으로 발송
    const emails = recipients.map((r) => ({
      to: r.email,
      subject: r.personalizedSubject ?? body.subject,
      html: wrapCampaignHtml(
        r.personalizedBody,
        `${unsubscribeBaseUrl}?email=${encodeURIComponent(r.email)}`,
        trackingUrl,
      ),
    }))

    const result = await sendBatchEmail(emails)
    const sendStatus = result.failed > 0 && result.sent === 0 ? "failed" : "sent"

    // 발송 결과로 캠페인 레코드 업데이트
    await updateCampaign(campaign.id, {
      status: sendStatus as "sent" | "failed",
      sentAt: sendStatus === "sent" ? new Date().toISOString() : undefined,
      recipientCount: result.sent,
    })

    return NextResponse.json({
      ok: true,
      campaign: { ...campaign, status: sendStatus, recipientCount: result.sent },
      provider: result.provider,
      recipientCount: result.sent,
      status: sendStatus,
    })
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
}
