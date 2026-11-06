import "server-only"

import type { Auth } from "googleapis"

/**
 * Google Ads API 클라이언트 — 일자별 캠페인 성과 조회(읽기 전용).
 *
 * 미설정(자격증명 없음)은 오류가 아니라 **설정 안 됨**이다. Meta 의 MetaConfigError 와 같은
 * 규약으로 GoogleAdsConfigError 를 던져, 호출부가 503 으로 강등하고 기존 데이터를 건드리지
 * 않게 한다. 설정이 없는 상태를 "집행 0"으로 포장하지 않는다.
 *
 * ── 접근 체계 (2026-09-10 변경) ──────────────────────────────
 * developer token 은 2026-09-09 sunset 됐다. API 접근 등급이 manager 계정의 토큰이 아니라
 * **OAuth 자격증명을 발급한 Google Cloud 프로젝트**에 붙는다. 기존 토큰을 헤더로 보내도
 * 무시되며(향후 메이저 버전에서 거부 예정) 여기서는 아예 보내지 않는다.
 * 이 클라이언트는 GoogleAdsService.search 만 쓰므로 **Explorer 등급(하루 2,880회)으로 충분**하다.
 * ('Reporting'은 Standard 등급 프로젝트에만 붙는 허용 용도라 신청 대상이 아니다.)
 *
 * ── 인증 (2026-11-03) ────────────────────────────────────────
 * 기본은 Sheets·Calendar 와 같은 공용 서비스 계정(GOOGLE_SERVICE_ACCOUNT_EMAIL·GOOGLE_PRIVATE_KEY,
 * 프로젝트 classin-home)이다 — 구글 공식 시작 가이드의 방식이고 refresh_token 만료가 없다.
 * 그 서비스 계정 이메일을 광고 계정에 '읽기 전용' 사용자로 추가해야 읽힌다.
 * GOOGLE_ADS_REFRESH_TOKEN 이 있으면 OAuth(사용자 위임)를 대신 쓴다.
 * 켜는 스위치는 GOOGLE_ADS_CUSTOMER_ID 다. 절차: docs/active/google-ads-accounts-2026-11-03.md §5
 *
 * ── 반드시 지킬 두 가지 ──────────────────────────────────────
 *  1) metrics.cost_micros 는 **마이크로 단위**(1,000,000 = 계정 통화 1단위)다.
 *     Meta 의 통화 최소단위 처리(normalizeBudgetAmount)와 규칙이 달라 재사용하면 안 된다.
 *  2) metrics.conversions 는 **클릭 시각에 귀속**된다 — 과거 일자 값이 계속 바뀐다.
 *     크론이 trailing 7일을 재적재하는 이유이고, 이 값의 과거 행은 확정값이 아니다.
 */

export class GoogleAdsConfigError extends Error {}

/** REST 엔드포인트 버전. 올릴 때 GAQL 필드 호환을 함께 확인할 것. */
const API_VERSION = "v25"
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

/** access_token 은 보통 1시간 만료 — 만료 5분 전에 갱신한다(경계에서 401 을 맞지 않게). */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000

/**
 * search 페이지 안전 상한 — 일수 × 캠페인 수라 한 페이지로 안 끝날 수 있다.
 * 페이지 크기는 API 가 1만 행으로 고정한다. pageSize 를 보내면 PAGE_SIZE_NOT_SUPPORTED 로
 * 요청 전체가 거부된다(2026-11-03 실호출로 확인).
 */
const PAGE_CAP = 20

export interface GoogleAdsDailyRow {
  /** YYYY-MM-DD — segments.date(광고 계정 타임존 기준 일자) */
  date: string
  campaignId: string
  campaignName: string | null
  /** 계정 통화 네이티브 — cost_micros ÷ 1,000,000 */
  spend: number
  impressions: number
  clicks: number
  /** 클릭 시각 귀속. 부분전환이 있어 정수가 아닐 수 있다. */
  conversions: number
}

type GoogleAdsAuth =
  | { kind: "oauth"; clientId: string; clientSecret: string; refreshToken: string }
  | { kind: "service_account"; email: string; privateKey: string }

interface GoogleAdsCredentials {
  auth: GoogleAdsAuth
  customerId: string
  loginCustomerId: string | null
}

/** 하이픈 표기(123-456-7890)를 숫자만 남긴다 — API 는 하이픈 없는 형태만 받는다. */
export function normalizeCustomerId(raw: string): string {
  return raw.replace(/[^0-9]/g, "")
}

function readAuth(missing: string[]): GoogleAdsAuth | null {
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim()
  if (refreshToken) {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim()
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim()
    if (!clientId) missing.push("GOOGLE_ADS_CLIENT_ID")
    if (!clientSecret) missing.push("GOOGLE_ADS_CLIENT_SECRET")
    return clientId && clientSecret ? { kind: "oauth", clientId, clientSecret, refreshToken } : null
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  // Vercel env 는 개행을 \n 문자로 담는다 — lib/google.ts 와 같은 복원.
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim()
  if (email && privateKey) return { kind: "service_account", email, privateKey }
  missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL·GOOGLE_PRIVATE_KEY (또는 GOOGLE_ADS_REFRESH_TOKEN)")
  return null
}

function readCredentials(): GoogleAdsCredentials {
  const missing: string[] = []
  const customerIdRaw = process.env.GOOGLE_ADS_CUSTOMER_ID?.trim()
  if (!customerIdRaw) missing.push("GOOGLE_ADS_CUSTOMER_ID")
  const auth = readAuth(missing)
  if (!auth || !customerIdRaw) {
    throw new GoogleAdsConfigError(`Missing ${missing.join(", ")}`)
  }
  const loginRaw = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim()
  return {
    auth,
    customerId: normalizeCustomerId(customerIdRaw),
    loginCustomerId: loginRaw ? normalizeCustomerId(loginRaw) : null,
  }
}

/** 설정 여부만 확인한다(값을 읽거나 노출하지 않는다) — 커버리지 매트릭스·상태 배지용. */
export function isGoogleAdsConfigured(): boolean {
  try {
    readCredentials()
    return true
  } catch {
    return false
  }
}

/* ─── OAuth ──────────────────────────────────────────────────── */

// 토큰은 프로세스 안에서만 재사용한다(인스턴스 간 공유 없음). refresh_token 은 장기 자격이라
// 절대 캐시 밖으로 나가지 않고, access_token 도 로그·응답에 싣지 않는다.
let cachedToken: { value: string; expiresAt: number } | null = null

// 서비스 계정 토큰은 googleapis GoogleAuth 가 서명·갱신·캐시한다(lib/google.ts 와 같은 지연 import).
let serviceAccountAuth: Promise<Auth.GoogleAuth> | null = null

async function getServiceAccountToken(auth: Extract<GoogleAdsAuth, { kind: "service_account" }>): Promise<string> {
  serviceAccountAuth ??= import("googleapis").then(
    ({ google }) =>
      new google.auth.GoogleAuth({
        credentials: { client_email: auth.email, private_key: auth.privateKey },
        scopes: ["https://www.googleapis.com/auth/adwords"],
      })
  )
  const token = await (await serviceAccountAuth).getAccessToken()
  if (!token) throw new Error("Google 서비스 계정 토큰 발급 실패")
  return token
}

async function getAccessToken({ auth }: GoogleAdsCredentials): Promise<string> {
  if (auth.kind === "service_account") return getServiceAccountToken(auth)
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedToken.value
  }
  const body = new URLSearchParams({
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    refresh_token: auth.refreshToken,
    grant_type: "refresh_token",
  })
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!response.ok || !json.access_token) {
    // 토큰 값은 싣지 않는다 — 실패 사유(invalid_grant 등)만 남긴다.
    throw new Error(
      `Google OAuth 토큰 갱신 실패 (${response.status}): ${json.error ?? ""} ${json.error_description ?? ""}`.trim()
    )
  }
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

/** 테스트·크론 재시도에서 토큰 캐시를 비운다. */
export function resetGoogleAdsTokenCache() {
  cachedToken = null
  serviceAccountAuth = null
}

/* ─── GAQL ───────────────────────────────────────────────────── */

interface GoogleAdsApiRow {
  campaign?: { id?: string | number; name?: string }
  segments?: { date?: string }
  metrics?: {
    costMicros?: string | number
    impressions?: string | number
    clicks?: string | number
    conversions?: string | number
  }
  customer?: { currencyCode?: string }
}

interface GoogleAdsSearchResponse {
  results?: GoogleAdsApiRow[]
  nextPageToken?: string
  error?: { message?: string; status?: string }
}

const MICROS_PER_UNIT = 1_000_000

function count(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** 표기 정밀도 — 계정 통화 소수 2자리. 마이크로 나눗셈의 부동소수 잔여를 응답에 흘리지 않는다. */
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * API 행 → 우리 행. 순수 함수라 테스트가 **cost_micros 나눗셈**을 직접 잠근다 —
 * 이 한 줄을 빠뜨리면 지출이 100만 배로 뜬다.
 */
export function mapGoogleAdsRow(row: GoogleAdsApiRow): GoogleAdsDailyRow | null {
  const campaignId = row.campaign?.id
  const date = row.segments?.date
  if (campaignId == null || !date) return null
  return {
    date,
    campaignId: String(campaignId),
    campaignName: row.campaign?.name ?? null,
    spend: round2(count(row.metrics?.costMicros) / MICROS_PER_UNIT),
    impressions: count(row.metrics?.impressions),
    clicks: count(row.metrics?.clicks),
    conversions: count(row.metrics?.conversions),
  }
}

/** GAQL 은 문자열 조립이라 날짜를 그대로 끼워 넣으면 주입 지점이 된다 — 형식을 강제한다. */
function assertIsoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Google Ads 조회 ${label} 날짜 형식이 잘못됐다: ${value}`)
  }
  return value
}

export function buildDailyInsightsQuery(since: string, until: string): string {
  return [
    "SELECT campaign.id, campaign.name, segments.date,",
    "       metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions,",
    "       customer.currency_code",
    "FROM campaign",
    `WHERE segments.date BETWEEN '${assertIsoDate(since, "since")}' AND '${assertIsoDate(until, "until")}'`,
    // 집행이 0인 캠페인 행은 받지 않는다 — 스냅샷에 의미 없는 0행이 쌓이면
    // "집행 없음"과 "그날 캠페인이 존재하지 않음"이 구분되지 않는다.
    "  AND metrics.impressions > 0",
  ].join("\n")
}

/**
 * [since, until] (YYYY-MM-DD, inclusive) 일자별 캠페인 성과.
 *
 * truncated=true 면 PAGE_CAP 상한에서 잘린 것이다 — 호출부(크론)가 반드시 드러내야 한다.
 * 무음 절단은 "집행이 줄었다"로 오독되는 종류의 실패다.
 */
export async function fetchGoogleAdsDaily({
  since,
  until,
}: {
  since: string
  until: string
}): Promise<{ rows: GoogleAdsDailyRow[]; currency: string | null; truncated: boolean }> {
  const creds = readCredentials()
  const accessToken = await getAccessToken(creds)
  const query = buildDailyInsightsQuery(since, until)
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${creds.customerId}/googleAds:search`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  }
  // MCC 하위 계정일 때만 필요하다. 불필요하게 보내면 권한 오류가 난다.
  if (creds.loginCustomerId) headers["login-customer-id"] = creds.loginCustomerId

  const rows: GoogleAdsDailyRow[] = []
  let currency: string | null = null
  let pageToken: string | undefined
  let truncated = false

  for (let page = 0; page < PAGE_CAP; page += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, pageToken }),
      cache: "no-store",
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`Google Ads API 실패 (${response.status}): ${text.slice(0, 400)}`)
    }
    const json = (text ? JSON.parse(text) : {}) as GoogleAdsSearchResponse
    for (const raw of json.results ?? []) {
      const mapped = mapGoogleAdsRow(raw)
      if (mapped) rows.push(mapped)
      currency ??= raw.customer?.currencyCode ?? null
    }
    if (!json.nextPageToken) {
      pageToken = undefined
      break
    }
    pageToken = json.nextPageToken
    if (page === PAGE_CAP - 1) truncated = true
  }

  if (truncated) {
    console.warn("[google-ads] 페이징 상한 도달 — 결과 절단됨", { since, until })
  }

  return { rows, currency, truncated }
}
