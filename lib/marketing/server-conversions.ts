import "server-only"

import { createHash, createHmac } from "node:crypto"
import type { NextRequest } from "next/server"

import {
  ANONYMOUS_ID_COOKIE,
  CONSENT_COOKIE,
  parseConsent,
} from "@/lib/consent/consent"

type MetaStandardEvent = "Lead" | "CompleteRegistration" | "InitiateCheckout" | "Purchase"
type Ga4ServerEvent = "generate_lead" | "begin_checkout" | "purchase"
const CONVERSION_FETCH_TIMEOUT_MS = 2_500

export interface MarketingRequestMeta {
  clientIp: string | null
  userAgent: string | null
  sourceUrl: string | null
  anonymousId: string | null
  gaClientId: string | null
  fbp: string | null
  fbc: string | null
  consent: {
    analytics: boolean
    marketing: boolean
  }
}

interface ServerConversionInput {
  eventId: string
  metaEventName: MetaStandardEvent
  ga4EventName: Ga4ServerEvent
  requestMeta?: MarketingRequestMeta | null
  sourceUrl?: string | null
  user?: {
    email?: string | null
    phone?: string | null
    externalId?: string | null
    allowHashedUserData?: boolean
  }
  customData?: Record<string, string | number | boolean | null | undefined>
}

function readEnv(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function conversionFetchSignal() {
  return AbortSignal.timeout(CONVERSION_FETCH_TIMEOUT_MS)
}

function getMetaGraphVersion() {
  return readEnv("META_GRAPH_API_VERSION") ?? "v25.0"
}

function appSecretProof(accessToken: string) {
  const appSecret = readEnv("META_APP_SECRET")
  if (!appSecret) return null
  return createHmac("sha256", appSecret).update(accessToken).digest("hex")
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "")
  return digits && digits.length >= 8 ? digits : null
}

function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return (
    forwarded ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    null
  )
}

function parseGaClientId(value: string | undefined) {
  if (!value) return null
  const parts = value.split(".")
  if (parts.length >= 4 && parts[0] === "GA1") {
    return parts.slice(-2).join(".")
  }
  return value.trim() || null
}

function buildFbc(fbclid: string | null | undefined) {
  const normalized = fbclid?.trim()
  return normalized ? `fb.1.${Date.now()}.${normalized}` : null
}

function compactCustomData(data?: Record<string, string | number | boolean | null | undefined>) {
  if (!data) return {}
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== "")
  )
}

export function getMarketingRequestMeta(
  req: NextRequest,
  options: { sourceUrl?: string | null; fbclid?: string | null } = {}
): MarketingRequestMeta {
  const consent = parseConsent(req.cookies.get(CONSENT_COOKIE)?.value ?? null)
  const anonymousId = req.cookies.get(ANONYMOUS_ID_COOKIE)?.value?.trim() || null
  const gaClientId = parseGaClientId(req.cookies.get("_ga")?.value) ?? anonymousId
  const fbc = req.cookies.get("_fbc")?.value?.trim() || buildFbc(options.fbclid)

  return {
    clientIp: getClientIp(req),
    userAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
    sourceUrl:
      options.sourceUrl?.trim() ||
      req.headers.get("referer")?.slice(0, 500) ||
      req.nextUrl.origin,
    anonymousId,
    gaClientId,
    fbp: req.cookies.get("_fbp")?.value?.trim() || null,
    fbc,
    consent: {
      analytics: Boolean(consent?.analytics),
      marketing: Boolean(consent?.marketing),
    },
  }
}

export function getMarketingConversionStatus() {
  const metaDatasetOrPixelId = readEnv("META_DATASET_ID") ?? readEnv("NEXT_PUBLIC_META_PIXEL_ID")
  const metaAccessToken = readEnv("META_CAPI_ACCESS_TOKEN") ?? readEnv("META_ACCESS_TOKEN")
  const ga4MeasurementProtocolId = readEnv("GA4_MEASUREMENT_ID")
  const ga4BrowserMeasurementId =
    readEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID") ?? readEnv("NEXT_PUBLIC_GA_ID")
  const ga4MeasurementId = ga4MeasurementProtocolId ?? ga4BrowserMeasurementId
  const ga4ApiSecret = readEnv("GA4_API_SECRET")

  return {
    meta: {
      pixelId: readEnv("NEXT_PUBLIC_META_PIXEL_ID"),
      datasetId: readEnv("META_DATASET_ID"),
      capiConfigured: Boolean(metaDatasetOrPixelId && metaAccessToken),
      testEventCodeConfigured: Boolean(readEnv("META_TEST_EVENT_CODE")),
    },
    google: {
      adsId: "AW-18252550128",
      demoConversionLabelConfigured: Boolean(readEnv("NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL")),
      ga4MeasurementId,
      measurementProtocolConfigured: Boolean(ga4MeasurementProtocolId && ga4ApiSecret),
    },
    internal: {
      trackingEnabled: process.env.NEXT_PUBLIC_INTERNAL_TRACKING_ENABLED !== "false",
    },
  }
}

async function sendMetaConversion(input: ServerConversionInput) {
  const metaDatasetOrPixelId = readEnv("META_DATASET_ID") ?? readEnv("NEXT_PUBLIC_META_PIXEL_ID")
  const accessToken = readEnv("META_CAPI_ACCESS_TOKEN") ?? readEnv("META_ACCESS_TOKEN")
  if (!metaDatasetOrPixelId || !accessToken || !input.requestMeta?.consent.marketing) {
    return { skipped: true as const, reason: "meta_not_configured_or_no_consent" }
  }

  const userData: Record<string, unknown> = {
    client_ip_address: input.requestMeta.clientIp ?? undefined,
    client_user_agent: input.requestMeta.userAgent ?? undefined,
    fbp: input.requestMeta.fbp ?? undefined,
    fbc: input.requestMeta.fbc ?? undefined,
  }

  if (input.user?.allowHashedUserData) {
    const email = normalizeEmail(input.user.email)
    const phone = normalizePhone(input.user.phone)
    if (email) userData.em = [sha256(email)]
    if (phone) userData.ph = [sha256(phone)]
  }

  const externalId = input.user?.externalId ?? input.requestMeta.anonymousId
  if (externalId) userData.external_id = [sha256(externalId)]

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: input.metaEventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        action_source: "website",
        event_source_url: input.sourceUrl ?? input.requestMeta.sourceUrl ?? undefined,
        user_data: Object.fromEntries(
          Object.entries(userData).filter(([, value]) => value !== undefined && value !== null)
        ),
        custom_data: compactCustomData(input.customData),
      },
    ],
  }
  const testEventCode = readEnv("META_TEST_EVENT_CODE")
  if (testEventCode) body.test_event_code = testEventCode

  const url = new URL(`https://graph.facebook.com/${getMetaGraphVersion()}/${metaDatasetOrPixelId}/events`)
  url.searchParams.set("access_token", accessToken)
  const proof = appSecretProof(accessToken)
  if (proof) url.searchParams.set("appsecret_proof", proof)

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: conversionFetchSignal(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`Meta CAPI ${response.status}: ${text.slice(0, 300)}`)
  }

  return { skipped: false as const }
}

async function sendGa4ServerEvent(input: ServerConversionInput) {
  const measurementId = readEnv("GA4_MEASUREMENT_ID")
  const apiSecret = readEnv("GA4_API_SECRET")
  const clientId = input.requestMeta?.gaClientId
  if (!measurementId || !apiSecret || !clientId || !input.requestMeta?.consent.analytics) {
    return { skipped: true as const, reason: "ga4_not_configured_or_no_consent" }
  }

  const url = new URL("https://www.google-analytics.com/mp/collect")
  url.searchParams.set("measurement_id", measurementId)
  url.searchParams.set("api_secret", apiSecret)

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      consent: {
        ad_user_data: input.requestMeta.consent.marketing ? "GRANTED" : "DENIED",
        ad_personalization: input.requestMeta.consent.marketing ? "GRANTED" : "DENIED",
      },
      events: [
        {
          name: input.ga4EventName,
          params: {
            event_id: input.eventId,
            ...compactCustomData(input.customData),
          },
        },
      ],
    }),
    signal: conversionFetchSignal(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`GA4 MP ${response.status}: ${text.slice(0, 300)}`)
  }

  return { skipped: false as const }
}

export async function sendServerConversion(input: ServerConversionInput) {
  const [meta, ga4] = await Promise.allSettled([
    sendMetaConversion(input),
    sendGa4ServerEvent(input),
  ])

  if (meta.status === "rejected") {
    console.warn("[marketing-conversions] Meta CAPI failed:", meta.reason)
  }
  if (ga4.status === "rejected") {
    console.warn("[marketing-conversions] GA4 Measurement Protocol failed:", ga4.reason)
  }

  return { meta, ga4 }
}
