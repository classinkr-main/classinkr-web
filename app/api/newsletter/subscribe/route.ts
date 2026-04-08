import { NextRequest, NextResponse } from "next/server"
import { subscribeSubscriber } from "@/lib/repositories/marketing"
import { getResolvedSettings } from "@/lib/repositories/settings"
import { triggerOnSubmitRules } from "@/lib/automation-engine"
import type { NewsletterSubscribeRequest } from "@/lib/marketing-types"
import { postJson } from "@/lib/server/post-json"

export async function POST(req: NextRequest) {
  try {
    const body: NewsletterSubscribeRequest = await req.json()
    const VALID_SOURCES = ["demo_modal", "contact_page", "newsletter", "manual"] as const
    type SubscriberSource = typeof VALID_SOURCES[number]
    const rawSource = body.source?.trim()
    const source: SubscriberSource = VALID_SOURCES.includes(rawSource as SubscriberSource)
      ? (rawSource as SubscriberSource)
      : "newsletter"
    const email = body.email?.trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ error: "이메일은 필수입니다." }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "올바른 이메일 형식이 아닙니다." },
        { status: 400 }
      )
    }

    const { created } = await subscribeSubscriber({
      name: body.name || email.split("@")[0],
      email,
      source,
    })

    if (created) {
      const settings = await getResolvedSettings()
      const googleSheetUrl = settings.googleSheetWebhookUrl
      if (googleSheetUrl) {
        postJson(
          googleSheetUrl,
          {
            source,
            email,
            name: body.name || "",
            timestamp: new Date().toISOString(),
          },
          { timeoutMs: 8000 }
        ).catch(() => {})
      }

      // Only fire onboarding automation for newly created subscriptions.
      triggerOnSubmitRules({
        email,
        name: body.name,
        source: "newsletter",
      }).catch(() => {})
    }

    return NextResponse.json({
      ok: true,
      message: "구독 요청을 접수했습니다.",
    })
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
}
