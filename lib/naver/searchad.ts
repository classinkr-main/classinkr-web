import "server-only"

import { createHmac } from "node:crypto"

/**
 * 네이버 검색광고 API 클라이언트 — 일자별 캠페인 성과 조회.
 *
 * 미설정(키 없음)은 오류가 아니라 **설정 안 됨**이다. Meta 의 MetaConfigError 와 같은 규약으로
 * NaverAdConfigError 를 던져, 호출부(크론·라우트)가 503 으로 강등하고 기존 데이터를 건드리지
 * 않게 한다. 설정이 없는 상태를 "집행 0"으로 포장하지 않는다.
 *
 * ── 인증(OAuth 아님) ─────────────────────────────────────────
 * 요청마다 HMAC 서명을 만든다. invalid-signature 의 원인은 거의 항상 둘 중 하나다:
 *   1) 서명 문자열에 쿼리스트링을 섞었다 → **path 만** 쓴다.
 *   2) 타임스탬프를 초 단위로 넣었다 → **밀리초**여야 한다.
 * 그래서 서명 생성을 signRequest() 한 곳에 가두고 순수 함수로 export 해 테스트가 규칙을 잠근다.
 *
 * ── 대용량 보고서(/stat-reports)가 아니라 /stats 를 쓰는 이유 ─
 * /stat-reports 는 한 번에 일자 × 캠페인 격자를 주지만 결과가 **헤더 없는 TSV**라
 * 컬럼 순서로 읽어야 한다. 순서가 바뀌면 광고비가 클릭수 자리로 조용히 밀린다 —
 * 틀린 수치가 화면에 그대로 뜨는 종류의 실패다.
 * /stats 는 JSON 에 필드명(impCnt·clkCnt·salesAmt·ccnt)이 붙어 오므로 그 사고가 구조적으로
 * 불가능하고, 요청이 틀리면 400 으로 **시끄럽게** 죽는다. 호출 수는 (일수 × 캠페인 청크)로
 * 늘지만 trailing 7일 × 수십 캠페인이면 10여 회라 문제가 되지 않는다.
 */

export class NaverAdConfigError extends Error {}

const BASE_URL = "https://api.searchad.naver.com"

/** /stats 의 ids 상한 — 초과하면 요청이 거부된다. 넉넉히 잡아 청크로 나눈다. */
const STATS_ID_CHUNK = 100

/** 조회할 지표 — 네이버 필드명 그대로. 이름으로 읽으므로 순서 의존이 없다. */
const STATS_FIELDS = ["impCnt", "clkCnt", "salesAmt", "ccnt"] as const

export interface NaverAdsDailyRow {
  /** YYYY-MM-DD — 조회한 일자(네이버 계정 타임존 기준) */
  date: string
  campaignId: string
  campaignName: string | null
  /** KRW · VAT 별도 (salesAmt) */
  spend: number
  impressions: number
  clicks: number
  /** ccnt — 전환추적 미연동 계정은 항상 0 이 온다(= 측정 없음이지 0 전환이 아니다) */
  conversions: number
}

interface NaverCredentials {
  apiKey: string
  secretKey: string
  customerId: string
}

function readCredentials(): NaverCredentials {
  const apiKey = process.env.NAVER_SEARCHAD_API_KEY?.trim()
  const secretKey = process.env.NAVER_SEARCHAD_SECRET_KEY?.trim()
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID?.trim()
  const missing = [
    !apiKey && "NAVER_SEARCHAD_API_KEY",
    !secretKey && "NAVER_SEARCHAD_SECRET_KEY",
    !customerId && "NAVER_SEARCHAD_CUSTOMER_ID",
  ].filter((value): value is string => Boolean(value))
  if (missing.length > 0 || !apiKey || !secretKey || !customerId) {
    throw new NaverAdConfigError(`Missing ${missing.join(", ")}`)
  }
  return { apiKey, secretKey, customerId }
}

/** 설정 여부만 확인한다(값을 읽거나 노출하지 않는다) — 커버리지 매트릭스·상태 배지용. */
export function isNaverAdConfigured(): boolean {
  try {
    readCredentials()
    return true
  } catch {
    return false
  }
}

/**
 * 서명 문자열 = `{timestamp}.{METHOD}.{path}` — **쿼리 제외, path 만**.
 * timestamp 는 epoch **밀리초**. 순수 함수라 테스트가 이 규칙을 직접 잠근다.
 */
export function signRequest(
  secretKey: string,
  timestamp: number,
  method: string,
  path: string
): string {
  return createHmac("sha256", secretKey)
    .update(`${timestamp}.${method.toUpperCase()}.${path}`)
    .digest("base64")
}

function authHeaders(creds: NaverCredentials, method: string, path: string): HeadersInit {
  const timestamp = Date.now()
  return {
    "Content-Type": "application/json; charset=UTF-8",
    "X-Timestamp": String(timestamp),
    "X-API-KEY": creds.apiKey,
    "X-Customer": creds.customerId,
    "X-Signature": signRequest(creds.secretKey, timestamp, method, path),
  }
}

async function naverGet<T>(
  creds: NaverCredentials,
  path: string,
  query: Array<[string, string]> = []
): Promise<T> {
  const url = new URL(path, BASE_URL)
  for (const [key, value] of query) url.searchParams.append(key, value)
  const response = await fetch(url, {
    method: "GET",
    // 서명은 url.search 가 아니라 path 로만 만든다 — 쿼리를 섞으면 invalid-signature.
    headers: authHeaders(creds, "GET", path),
    cache: "no-store",
  })
  const text = await response.text()
  if (!response.ok) {
    // 네이버는 실패 본문에 code/title/detail 을 준다. 그대로 실으면 원인(서명·권한·파라미터)이 바로 읽힌다.
    throw new Error(
      `네이버 검색광고 API 실패 (GET ${path}, ${response.status}): ${text.slice(0, 300)}`
    )
  }
  return (text ? JSON.parse(text) : null) as T
}

/* ─── 캠페인 마스터 ──────────────────────────────────────────── */

interface NaverCampaignApiRow {
  nccCampaignId?: string
  name?: string
  campaignTp?: string
  status?: string
}

export interface NaverCampaign {
  id: string
  name: string
  type: string | null
}

/** /ncc/campaigns — /stats 는 id 만 돌려주므로 이름은 여기서 붙인다. */
export async function fetchNaverCampaigns(): Promise<NaverCampaign[]> {
  const creds = readCredentials()
  const rows = await naverGet<NaverCampaignApiRow[]>(creds, "/ncc/campaigns")
  return (rows ?? [])
    .filter((row): row is NaverCampaignApiRow & { nccCampaignId: string } =>
      Boolean(row?.nccCampaignId)
    )
    .map((row) => ({
      id: row.nccCampaignId,
      name: row.name?.trim() || row.nccCampaignId,
      type: row.campaignTp ?? null,
    }))
}

/* ─── 일자별 성과 ────────────────────────────────────────────── */

interface NaverStatApiRow {
  id?: string
  impCnt?: number | string
  clkCnt?: number | string
  salesAmt?: number | string
  ccnt?: number | string
}

/** 음수·비수치는 0. 지표는 음수가 될 수 없고, 문자열로 오는 계정이 있다. */
function metric(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * /stats 응답 → 우리 행. 응답 봉투가 `{data:[...]}` 인 계정과 배열 그대로인 계정이 있어
 * 둘 다 받는다 — 어느 쪽이든 **필드명으로** 읽으므로 값이 밀릴 여지는 없다.
 * 순수 함수(네트워크 없음)라 테스트가 매핑을 직접 잠근다.
 */
export function mapStatRows(payload: unknown, date: string): NaverAdsDailyRow[] {
  const rows: NaverStatApiRow[] = Array.isArray(payload)
    ? (payload as NaverStatApiRow[])
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: NaverStatApiRow[] }).data)
      : []
  return rows
    .filter((row): row is NaverStatApiRow & { id: string } => Boolean(row?.id))
    .map((row) => ({
      date,
      campaignId: row.id,
      campaignName: null, // 마스터 조회로 나중에 채운다
      spend: metric(row.salesAmt),
      impressions: metric(row.impCnt),
      clicks: metric(row.clkCnt),
      conversions: metric(row.ccnt),
    }))
}

/** [since, until] 를 YYYY-MM-DD 배열로. 역순·비정상 범위는 빈 배열(호출부가 0행으로 본다). */
export function enumerateDates(since: string, until: string): string[] {
  const start = Date.parse(`${since}T00:00:00Z`)
  const end = Date.parse(`${until}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return []
  const out: string[] = []
  for (let t = start; t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * [since, until] (YYYY-MM-DD, inclusive) 일자별 캠페인 성과.
 *
 * 하루가 실패해도 나머지 날짜는 살린다 — 한 날짜의 오류가 trailing 재적재 전체를 날리면
 * 어제 수치가 영영 안 들어온다. failedDates 는 호출부(크론)가 응답에 실어 부분 실패를 드러낸다.
 *
 * 캠페인이 하나도 없으면 빈 결과다(실패가 아니다) — 계정에 캠페인이 없거나 전부 삭제된 상태.
 */
export async function fetchNaverAdsDaily({
  since,
  until,
}: {
  since: string
  until: string
}): Promise<{ rows: NaverAdsDailyRow[]; failedDates: string[]; campaignCount: number }> {
  const creds = readCredentials()
  const campaigns = await fetchNaverCampaigns()
  const nameById = new Map(campaigns.map((c) => [c.id, c.name]))
  const idChunks = chunk(
    campaigns.map((c) => c.id),
    STATS_ID_CHUNK
  )
  if (idChunks.length === 0) return { rows: [], failedDates: [], campaignCount: 0 }

  const fieldsParam = JSON.stringify(STATS_FIELDS)
  const rows: NaverAdsDailyRow[] = []
  const failedDates: string[] = []

  for (const date of enumerateDates(since, until)) {
    try {
      for (const ids of idChunks) {
        const query: Array<[string, string]> = ids.map((id) => ["ids", id] as [string, string])
        query.push(["fields", fieldsParam])
        // /stats 의 timeRange 는 [since, until] inclusive — 같은 날짜를 넣어 하루로 자른다.
        query.push(["timeRange", JSON.stringify({ since: date, until: date })])
        const payload = await naverGet<unknown>(creds, "/stats", query)
        rows.push(...mapStatRows(payload, date))
      }
    } catch (error) {
      failedDates.push(date)
      console.warn("[naver-searchad] 일자 통계 조회 실패", date, error)
    }
  }

  for (const row of rows) row.campaignName = nameById.get(row.campaignId) ?? null

  return { rows, failedDates, campaignCount: campaigns.length }
}
