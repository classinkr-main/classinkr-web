import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createCampaign, getActiveSubscribersByTags } from "@/lib/repositories/marketing"
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

    const emailWebhookUrl = process.env.EMAIL_WEBHOOK_URL
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

    const webhookRecipients = recipients.map((recipient) => ({
      email: recipient.email,
      name: recipient.name,
      org: recipient.org,
      personalizedSubject: recipient.personalizedSubject,
      personalizedBody: recipient.personalizedBody,
    }))

    let sendStatus: "sent" | "failed" = "sent"

    if (emailWebhookUrl) {
      try {
        const res = await fetch(emailWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: body.subject,
            recipients: webhookRecipients,
            personalizedRecipients: webhookRecipients,
            mode: sendMode,
            unsubscribeBaseUrl: `${req.nextUrl.origin}/api/newsletter/unsubscribe`,
          }),
        })

        if (!res.ok) sendStatus = "failed"
      } catch {
        sendStatus = "failed"
      }
    } else {
      console.log("[EMAIL-DEV] 웹훅 URL 미설정. 발송 시뮬레이션:")
      console.log(`  제목: ${body.subject}`)
      console.log(`  대상: ${recipients.length}명`)
      console.log(`  태그: ${(body.targetTags ?? []).join(", ") || "전체"}`)
      if (sendMode === "test") {
        console.log(`  테스트 이메일: ${body.testEmail?.trim()}`)
      } else if (body.aiPersonalized?.length) {
        console.log("  모드: AI 개인화 발송")
      }
    }

    if (sendMode === "test") {
      return NextResponse.json({
        ok: true,
        test: true,
        recipientCount: recipients.length,
        status: sendStatus,
      })
    }

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
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
}
