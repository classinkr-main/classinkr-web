import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { fetchMetaLeadDetail } from "@/lib/meta/lead-ads-graph"
import {
  buildLeadCapturePayload,
  extractLeadValues,
  type MetaLeadDetail,
  type MetaWebhookPayload,
} from "@/lib/meta/lead-ads-payload"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function verifyMetaSignature(payload: string, signature: string | null) {
  const appSecret = process.env.META_APP_SECRET?.trim()
  // 시크릿이 미설정일 때만 로컬 개발 우회를 허용한다(FAIL CLOSED).
  // Vercel(프리뷰 포함)에서는 VERCEL이 항상 설정되므로 절대 우회 불가.
  if (!appSecret) {
    return process.env.NODE_ENV === "development" && !process.env.VERCEL
  }

  // 시크릿이 설정돼 있으면 서명 헤더 부재를 허용으로 처리하지 않는다.
  if (!signature?.startsWith("sha256=")) {
    return false
  }

  try {
    const received = Buffer.from(signature.slice("sha256=".length), "hex")
    const expected = Buffer.from(
      createHmac("sha256", appSecret).update(payload).digest("hex"),
      "hex"
    )

    return received.length === expected.length && timingSafeEqual(received, expected)
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()

  if (mode === "subscribe" && token && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Meta webhook verification failed." }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const { submitLeadCapture } = await import("@/lib/server/lead-capture")
  const rawBody = await req.text()
  const signature = req.headers.get("x-hub-signature-256")

  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Meta signature." }, { status: 403 })
  }

  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  if (payload.object !== "page") {
    return NextResponse.json({ ok: true, ignored: payload.object ?? "unknown" })
  }

  const leads = extractLeadValues(payload)
  const results = await Promise.allSettled(
    leads.map(async (lead) => {
      let detail: MetaLeadDetail | undefined

      try {
        detail = await fetchMetaLeadDetail(lead.leadgen_id!)
      } catch (error) {
        console.error("[meta/webhook] lead detail fetch failed:", error)
      }

      const result = await submitLeadCapture(buildLeadCapturePayload(lead, detail))
      if (result.status >= 400) {
        throw new Error(JSON.stringify(result.body))
      }

      return result.body
    })
  )

  const failed = results.filter((result) => result.status === "rejected").length

  return NextResponse.json({
    ok: true,
    received: leads.length,
    processed: leads.length - failed,
    failed,
  })
}
