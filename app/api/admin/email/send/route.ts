import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getActiveSubscribersByTags, createCampaign } from "@/lib/repositories/marketing"
import { getResolvedSettings } from "@/lib/repositories/settings"
import { postJson } from "@/lib/server/post-json"
import type { SendEmailRequest } from "@/lib/marketing-types"

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body: SendEmailRequest = await req.json()
    const aiPersonalized = body.aiPersonalized?.filter(
      (recipient) => recipient.email && recipient.personalizedBody
    ) ?? []

    if (!body.subject || !body.body) {
      return NextResponse.json(
        { error: "?쒕ぉ怨?蹂몃Ц? ?꾩닔?낅땲??" },
        { status: 400 }
      )
    }

    const recipients =
      aiPersonalized.length > 0
        ? []
        : await getActiveSubscribersByTags(body.targetTags ?? [])

    if (recipients.length === 0 && aiPersonalized.length === 0) {
      return NextResponse.json(
        { error: "諛쒖넚 ??곸씠 ?놁뒿?덈떎. ?쒓렇 議곌굔???뺤씤?댁＜?몄슂." },
        { status: 400 }
      )
    }

    const personalizedRecipients =
      aiPersonalized.length > 0
        ? aiPersonalized.map((recipient) => ({
            email: recipient.email,
            name: recipient.name,
            personalizedSubject: recipient.subject ?? body.subject,
            personalizedBody: recipient.personalizedBody,
          }))
        : recipients.map((recipient) => ({
            email: recipient.email,
            name: recipient.name,
            org: recipient.org ?? "",
            personalizedSubject: body.subject,
            personalizedBody: body.body
              .replace(/\{name\}/g, recipient.name)
              .replace(/\{org\}/g, recipient.org ?? "")
              .replace(/\{role\}/g, recipient.role ?? ""),
          }))

    let sendStatus: "sent" | "failed" = "sent"
    const recipientCount = personalizedRecipients.length
    const settings = await getResolvedSettings()
    const emailWebhookUrl = settings.emailWebhookUrl

    if (emailWebhookUrl) {
      try {
        const res = await postJson(
          emailWebhookUrl,
          {
            subject: body.subject,
            personalizedRecipients,
            recipients: personalizedRecipients,
            unsubscribeBaseUrl: `${req.nextUrl.origin}/api/newsletter/unsubscribe`,
          },
          { timeoutMs: 10_000 }
        )
        if (!res.ok) sendStatus = "failed"
      } catch {
        sendStatus = "failed"
      }
    } else {
      console.log("[EMAIL-DEV] ?뱁썒 URL 誘몄꽕?? 諛쒖넚 ?쒕??덉씠??")
      console.log(`  ?쒕ぉ: ${body.subject}`)
      console.log(`  ??? ${recipientCount}紐?`)
      console.log(`  ?쒓렇: ${body.targetTags?.join(", ") || "?꾩껜"}`)
    }

    const campaign = await createCampaign({
      subject: body.subject,
      body: body.body,
      targetTags: body.targetTags ?? [],
      status: sendStatus,
      sentAt: sendStatus === "sent" ? new Date().toISOString() : undefined,
      recipientCount,
    })

    return NextResponse.json({
      ok: sendStatus === "sent",
      campaign,
      recipientCount,
      status: sendStatus,
      error:
        sendStatus === "failed"
          ? "?대찓???뱁썒 諛쒖넚???ㅽ뙣?덉뒿?덈떎. ?ㅼ젙 ?먮뒗 ?몃? ?곕룞 ?곹깭瑜??뺤씤?댁＜?몄슂."
          : undefined,
    })
  } catch {
    return NextResponse.json({ error: "?섎せ???붿껌?낅땲??" }, { status: 400 })
  }
}
