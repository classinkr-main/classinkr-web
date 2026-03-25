import { NextRequest, NextResponse } from "next/server"
import { upsertSubscriber, getSubscriberByEmail } from "@/lib/repositories/marketing"
import type { NewsletterSubscribeRequest } from "@/lib/marketing-types"

export async function POST(req: NextRequest) {
  try {
    const body: NewsletterSubscribeRequest = await req.json()

    if (!body.email) {
      return NextResponse.json({ error: "이메일은 필수입니다." }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: "올바른 이메일 형식이 아닙니다." },
        { status: 400 }
      )
    }

    const existing = await getSubscriberByEmail(body.email)
    if (existing && existing.status === "active") {
      return NextResponse.json({
        ok: true,
        message: "이미 구독 중입니다.",
        alreadySubscribed: true,
      })
    }

    await upsertSubscriber({
      name: body.name || body.email.split("@")[0],
      email: body.email,
      tags: body.tags ?? [],
      source: "newsletter",
    })

    const googleSheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL
    if (googleSheetUrl) {
      fetch(googleSheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "newsletter",
          email: body.email,
          name: body.name || "",
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, message: "구독이 완료되었습니다." })
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
}
