import { NextRequest, NextResponse } from "next/server"
import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { stitchIdentity } from "@/lib/identity/stitch"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { getMarketingRequestMeta } from "@/lib/marketing/server-conversions"
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

function getAttributionValue(
  attribution: NewsletterSubscribeRequest["attribution"],
  key: keyof NonNullable<NewsletterSubscribeRequest["attribution"]>
) {
  const value = attribution?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "newsletter", { windowMs: 60_000, max: 3 })
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
    const attribution = body.attribution

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
      utmSource: getAttributionValue(attribution, "utmSource"),
      utmMedium: getAttributionValue(attribution, "utmMedium"),
      utmCampaign: getAttributionValue(attribution, "utmCampaign"),
      utmTerm: getAttributionValue(attribution, "utmTerm"),
      utmContent: getAttributionValue(attribution, "utmContent"),
      gclid: getAttributionValue(attribution, "gclid"),
      fbclid: getAttributionValue(attribution, "fbclid"),
      msclkid: getAttributionValue(attribution, "msclkid"),
      ttclid: getAttributionValue(attribution, "ttclid"),
      landingPage: getAttributionValue(attribution, "landingPage"),
      currentPage: getAttributionValue(attribution, "currentPage"),
      referrer: getAttributionValue(attribution, "referrer"),
    }, {
      requestMeta: getMarketingRequestMeta(req, {
        sourceUrl: getAttributionValue(attribution, "currentPage"),
        fbclid: getAttributionValue(attribution, "fbclid"),
      }),
    })

    if (result.body.ok && result.body.leadId) {
      void stitchIdentity({
        anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
        leadId: result.body.leadId,
        email,
        // 비인증 경로(이메일 게이트) — 이미 아는 leadId만 쓰고 이메일로 자동연결하지 않는다(D4).
        emailVerified: false,
      }).catch((error) => {
        console.warn("[newsletter/subscribe] identify failed:", error)
      })
    }

    return NextResponse.json(result.body, { status: result.status })
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
}
