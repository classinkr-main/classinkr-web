import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getActiveSubscribersByTags, createCampaign } from "@/lib/repositories/marketing"
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

    const recipients = await getActiveSubscribersByTags(body.targetTags ?? [])

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "발송 대상이 없습니다. 태그 조건을 확인해주세요." },
        { status: 400 }
      )
    }

    const emailWebhookUrl = process.env.EMAIL_WEBHOOK_URL

    const personalizedRecipients = recipients.map((r) => ({
      email: r.email,
      name: r.name,
      org: r.org ?? "",
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
      console.log(`  태그: ${body.targetTags.join(", ") || "전체"}`)
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
