import { NextRequest, NextResponse } from "next/server"
import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { stitchIdentity } from "@/lib/identity/stitch"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import type { NewsletterSubscribeRequest } from "@/lib/marketing-types"
import { submitLeadCapture } from "@/lib/server/lead-capture"

function normalizeNewsletterSource(value: unknown) {
  if (typeof value !== "string") return "newsletter"
  const source = value.trim()
  if (!source) return "newsletter"
  return /^[a-zA-Z0-9_.:-]+$/.test(source) ? source.slice(0, 80) : "newsletter"
}

function normalizeLeadMagnet(value: unknown) {
  if (typeof value !== "string") return undefined
  const leadMagnet = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return leadMagnet ? leadMagnet.slice(0, 120) : undefined
}

function inferLeadMagnet(source: string) {
  const match = source.match(/(?:^|[:/])lead[_-]?magnet[:/]([a-z0-9_.:-]+)/i)
  return normalizeLeadMagnet(match?.[1])
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "newsletter", { windowMs: 60_000, max: 3 })
  if (!allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    )
  }

  try {
    const body: NewsletterSubscribeRequest = await req.json()
    const source = normalizeNewsletterSource(body.source)
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

    const result = await submitLeadCapture({
      source: "newsletter",
      sourceDetail: source,
      leadMagnet: normalizeLeadMagnet(body.leadMagnet) ?? inferLeadMagnet(source),
      name: body.name || email.split("@")[0],
      email,
      marketingConsent: true,
    })

    if (result.body.ok && result.body.leadId) {
      void stitchIdentity({
        anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
        leadId: result.body.leadId,
        email,
      }).catch((error) => {
        console.warn("[newsletter/subscribe] identify failed:", error)
      })
    }

    return NextResponse.json(result.body, { status: result.status })
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
}
