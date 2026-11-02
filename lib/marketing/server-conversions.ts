import "server-only"

import { createHash, createHmac } from "node:crypto"
import type { NextRequest } from "next/server"

import {
  GA4_MEASUREMENT_ID as BROWSER_GA4_MEASUREMENT_ID,
  GOOGLE_ADS_ID,
} from "@/lib/analytics-config"
import {
  ANONYMOUS_ID_COOKIE,
  CONSENT_COOKIE,
  parseConsent,
} from "@/lib/consent/consent"

type MetaStandardEvent = "Lead" | "CompleteRegistration" | "InitiateCheckout" | "Purchase"
const CONVERSION_FETCH_TIMEOUT_MS = 2_500

export interface MarketingRequestMeta {
  clientIp: string | null
  userAgent: string | null
  sourceUrl: string | null
  anonymousId: string | null
  /** 진짜 _ga 쿠키에서 읽은 GA4 client_id. 쿠키가 없거나 모양이 다르면 null. */
  gaClientId: string | null
  /** _ga_<측정 ID> 쿠키의 세션 ID. 측정 ID 미설정·쿠키 없음이면 null. */
  gaSessionId: string | null
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

/**
 * _ga = GA1.<도메인 단계>.<난수>.<최초 방문 초> → client_id 는 뒤 두 칸. 모양이 다르면 null —
 * 원문을 client_id 로 보내면 어느 브라우저와도 안 이어지는 유령 사용자가 생긴다.
 */
export function parseGaClientId(value: string | null | undefined) {
  const parts = value?.trim().split(".") ?? []
  return parts.length >= 4 && /^GA\d+$/.test(parts[0]) ? parts.slice(-2).join(".") : null
}

/**
 * _ga_<측정 ID 뒤쪽> 쿠키의 세션 ID — 접두(GSn.n.) 뒤 첫 숫자열.
 *   GS1.1.1700000000.3.1.1700000100.0.0.0           → 1700000000
 *   GS2.1.s1700000000$o3$g1$t1700000100$j60$l0$h0  → 1700000000 (값 앞 글자 하나는 건너뛴다)
 */
export function parseGaSessionId(value: string | null | undefined) {
  return value?.trim().match(/^GS\d+\.\d+\.[a-z]?(\d+)/i)?.[1] ?? null
}

/** 세션 쿠키 이름은 측정 ID 를 따른다(G-6MWTJ8C0L2 → _ga_6MWTJ8C0L2). MP 와 같은 스트림이어야 하므로 MP 쪽 ID 우선. */
function gaSessionCookieName() {
  const measurementId = readEnv("GA4_MEASUREMENT_ID") ?? BROWSER_GA4_MEASUREMENT_ID
  return measurementId ? `_ga_${measurementId.replace(/^G-/i, "")}` : null
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
  // 익명 ID 로 대신 채우지 않는다 — 리드에 저장해 나중에 MP 로 보낼 값이라 진짜 GA client_id 만 쓴다.
  const gaClientId = parseGaClientId(req.cookies.get("_ga")?.value)
  const sessionCookie = gaSessionCookieName()
  const gaSessionId = sessionCookie ? parseGaSessionId(req.cookies.get(sessionCookie)?.value) : null
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
    gaSessionId,
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
      adsId: GOOGLE_ADS_ID,
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

/**
 * GA4 Measurement Protocol 로 이벤트 1건. GA4_MEASUREMENT_ID·GA4_API_SECRET 이 없으면 보내지 않고 null.
 * 보냈으면 HTTP 결과(ok=false 면 Google 이 받지 않았다). 네트워크 오류·시간 초과는 던진다 — 받았는지 모른다.
 * api_secret 이 URL 에 실리므로 URL 을 로그에 남기지 않는다.
 */
export async function sendGa4MeasurementProtocolEvent(event: {
  clientId: string
  /** 쿠키 동의 마케팅 항목 → consent.ad_user_data·ad_personalization */
  adConsent: boolean
  name: string
  params: Record<string, string | number>
}): Promise<{ ok: boolean; status: number } | null> {
  const measurementId = readEnv("GA4_MEASUREMENT_ID")
  const apiSecret = readEnv("GA4_API_SECRET")
  if (!measurementId || !apiSecret) return null

  const url = new URL("https://www.google-analytics.com/mp/collect")
  url.searchParams.set("measurement_id", measurementId)
  url.searchParams.set("api_secret", apiSecret)

  const consent = event.adConsent ? "GRANTED" : "DENIED"
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: event.clientId,
      consent: { ad_user_data: consent, ad_personalization: consent },
      events: [{ name: event.name, params: event.params }],
    }),
    signal: conversionFetchSignal(),
  })
  return { ok: response.ok, status: response.status }
}

/**
 * 접수·결제 서버 전환 — Meta CAPI 만 보낸다(브라우저 픽셀과 event_id 로 중복이 걸러진다).
 *
 * GA4 는 여기서 보내지 않는다. 같은 접수·결제에 브라우저(gtag)가 generate_lead·begin_checkout·purchase 를
 * 이미 보내고 GA4 는 event_id 로 중복을 걸러 주지 않아, 서버 MP 까지 나가면 두 배로 잡힌다
 * (docs/active/seo-analytics-console-runbook-2026-10-28.md §5-6). 서버 MP 는 브라우저가 보낼 수 없는
 * 리드 품질 이벤트(lib/marketing/lead-quality-signal.ts)에만 쓴다.
 */
export async function sendServerConversion(input: ServerConversionInput) {
  try {
    return await sendMetaConversion(input)
  } catch (error) {
    console.warn("[marketing-conversions] Meta CAPI failed:", error)
    return null
  }
}
