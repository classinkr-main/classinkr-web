import "server-only"

import { createHmac } from "crypto"
import { unstable_cache } from "next/cache"

export class MetaConfigError extends Error {}

export type MetaCampaignStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED"

export interface MetaAdAccountStatus {
  id: string
  accountId?: string
  name?: string
  accountStatus?: number
  currency?: string
  timezone?: string
  businessName?: string
}

export interface MetaCampaignRow {
  id: string
  name: string
  status: MetaCampaignStatus | string
  effectiveStatus?: string
  objective?: string
  buyingType?: string
  createdTime?: string
  updatedTime?: string
  startTime?: string
  stopTime?: string
  lifetimeBudget: number | null
  dailyBudget: number | null
  insights: {
    spend: number
    impressions: number
    reach: number
    clicks: number
    ctr: number | null
    cpc: number | null
    cpm: number | null
    leads: number
  }
}

export interface MetaCampaignDashboard {
  account: MetaAdAccountStatus
  datePreset: string
  campaigns: MetaCampaignRow[]
  summary: {
    campaignCount: number
    activeCount: number
    pausedCount: number
    spend: number
    impressions: number
    reach: number
    clicks: number
    leads: number
    ctr: number | null
    cpc: number | null
    cpm: number | null
  }
}

export interface MetaInstagramAccountStatus {
  id: string
  username?: string
  name?: string
  followersCount: number
  followsCount: number
  mediaCount: number
  profilePictureUrl?: string
  website?: string
  biography?: string
}

export interface MetaInstagramMediaInsights {
  views: number
  reach: number
  likes: number
  comments: number
  shares: number
  saved: number
  totalInteractions: number
}

export interface MetaInstagramMediaRow {
  id: string
  caption?: string
  mediaType?: string
  mediaProductType?: string
  permalink?: string
  timestamp?: string
  thumbnailUrl?: string
  mediaUrl?: string
  likeCount: number
  commentsCount: number
  insights: MetaInstagramMediaInsights
  insightsError?: string
}

export interface MetaInstagramFollowerPoint {
  date: string
  value: number
}

export interface MetaInstagramDashboard {
  account: MetaInstagramAccountStatus
  datePreset: string
  media: MetaInstagramMediaRow[]
  followerGrowth: MetaInstagramFollowerPoint[]
  summary: {
    mediaCount: number
    totalViews: number
    totalReach: number
    totalInteractions: number
    averageViews: number
    topMediaId: string | null
    topMediaViews: number
    followerDelta: number
    insightsErrorCount: number
  }
}

interface MetaGraphErrorBody {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
  }
}

interface MetaAccessTokenCandidate {
  name: string
  value: string
}

interface MetaCampaignApiRow {
  id: string
  name?: string
  status?: string
  effective_status?: string
  objective?: string
  buying_type?: string
  created_time?: string
  updated_time?: string
  start_time?: string
  stop_time?: string
  lifetime_budget?: string
  daily_budget?: string
}

interface MetaInsightAction {
  action_type?: string
  value?: string
}

interface MetaInsightApiRow {
  campaign_id?: string
  campaign_name?: string
  spend?: string
  impressions?: string
  reach?: string
  clicks?: string
  ctr?: string
  cpc?: string
  cpm?: string
  actions?: MetaInsightAction[]
}

// 대시보드(datePreset 롤업)와 일자별(time_increment=1) 두 insights 조회가 공유하는 필드 —
// 한쪽만 고치고 다른 쪽을 잊는 드리프트를 막는다.
const CAMPAIGN_INSIGHT_FIELDS =
  "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions"

interface MetaPagingResponse<T> {
  data?: T[]
}

interface MetaInstagramAccountApiRow {
  id: string
  username?: string
  name?: string
  followers_count?: string | number
  follows_count?: string | number
  media_count?: string | number
  profile_picture_url?: string
  website?: string
  biography?: string
}

interface MetaInstagramMediaApiRow {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  permalink?: string
  timestamp?: string
  thumbnail_url?: string
  media_url?: string
  like_count?: string | number
  comments_count?: string | number
}

interface MetaInstagramInsightValue {
  value?: string | number
  end_time?: string
}

interface MetaInstagramInsightApiRow {
  name?: string
  values?: MetaInstagramInsightValue[]
}

interface MetaInstagramBusinessAccountResponse {
  instagram_business_account?: {
    id?: string
    username?: string
  }
}

interface MetaRequestOptions {
  tokenKeys?: string[]
  tryAllTokens?: boolean
}

function getRequiredEnv(key: string) {
  const value = process.env[key]?.trim()
  if (!value) throw new MetaConfigError(`Missing ${key}`)
  return value
}

function getVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v25.0"
}

function getAccessTokenCandidates(tokenKeys?: string[]): MetaAccessTokenCandidate[] {
  const keys = tokenKeys ?? ["META_ACCESS_TOKEN", "META_CAPI_ACCESS_TOKEN"]
  const rawCandidates = keys.map((name) => ({
    name,
    value: process.env[name]?.trim(),
  }))

  const seen = new Set<string>()
  const candidates = rawCandidates.flatMap((candidate) => {
    if (!candidate.value || seen.has(candidate.value)) return []
    seen.add(candidate.value)
    return [{ name: candidate.name, value: candidate.value }]
  })

  if (candidates.length === 0) {
    throw new MetaConfigError(`Missing ${keys.join(" or ")}`)
  }

  return candidates
}

function getAdAccountId() {
  const raw = getRequiredEnv("META_AD_ACCOUNT_ID")
  return raw.startsWith("act_") ? raw : `act_${raw}`
}

function appSecretProof(accessToken: string) {
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appSecret) return undefined
  return createHmac("sha256", appSecret).update(accessToken).digest("hex")
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toNullableNumber(value: unknown) {
  const parsed = toNumber(value)
  return parsed > 0 ? parsed : null
}

// Meta 예산 필드(lifetime_budget 등)는 통화 최소 단위 문자열이다.
// 무소수점 통화(KRW·JPY 등)는 오프셋 1, 그 외 기본 100(센트).
const CURRENCY_MINOR_UNIT_OFFSET: Record<string, number> = { KRW: 1, JPY: 1, TWD: 1, VND: 1 }

export function normalizeBudgetAmount(raw: unknown, currency: string | null | undefined): number | null {
  const value = toNumber(raw)
  if (value <= 0) return null
  const offset = (currency && CURRENCY_MINOR_UNIT_OFFSET[currency]) || 100
  return value / offset
}

function buildUrl(
  path: string,
  accessToken: string,
  params: Record<string, string | number | undefined> = {}
) {
  const url = new URL(`https://graph.facebook.com/${getVersion()}/${path}`)
  const proof = appSecretProof(accessToken)

  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value))
  }
  if (proof) url.searchParams.set("appsecret_proof", proof)

  return { url, accessToken }
}

function formatMetaError(prefix: string, status: number, error: MetaGraphErrorBody["error"]) {
  return [
    prefix,
    status,
    error?.code ? `code ${error.code}` : undefined,
    error?.error_subcode ? `subcode ${error.error_subcode}` : undefined,
    error?.message,
  ]
    .filter(Boolean)
    .join(": ")
}

function shouldTryNextToken(status: number, error: MetaGraphErrorBody["error"]) {
  return status === 401 || error?.code === 190
}

async function metaGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  options: MetaRequestOptions = {}
) {
  const candidates = getAccessTokenCandidates(options.tokenKeys)
  let lastError: Error | null = null

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const { url, accessToken } = buildUrl(path, candidate.value, params)
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })

    const body = (await response.json().catch(() => ({}))) as T & MetaGraphErrorBody
    if (response.ok) return body

    const error = body.error
    lastError = new Error(formatMetaError("Meta API request failed", response.status, error))
    if (
      index < candidates.length - 1 &&
      (options.tryAllTokens || shouldTryNextToken(response.status, error))
    ) {
      continue
    }
    throw lastError
  }

  throw lastError ?? new Error("Meta API request failed")
}

async function metaPost<T>(path: string, params: Record<string, string | number | undefined>) {
  const candidates = getAccessTokenCandidates()
  let lastError: Error | null = null

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const { url, accessToken } = buildUrl(path, candidate.value)
    const body = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== "") body.set(key, String(value))
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    })

    const json = (await response.json().catch(() => ({}))) as T & MetaGraphErrorBody
    if (response.ok) return json

    const error = json.error
    lastError = new Error(formatMetaError("Meta API write failed", response.status, error))
    if (index < candidates.length - 1 && shouldTryNextToken(response.status, error)) continue
    throw lastError
  }

  throw lastError ?? new Error("Meta API write failed")
}

function extractLeads(actions: MetaInsightAction[] | undefined) {
  const normalized = (actions ?? []).map((action) => ({
    type: action.action_type?.toLowerCase() ?? "",
    value: toNumber(action.value),
  }))

  const primaryLead = normalized.find((action) => action.type === "lead")
  if (primaryLead) return primaryLead.value

  const groupedLead = normalized.find((action) => action.type === "onsite_conversion.lead_grouped")
  if (groupedLead) return groupedLead.value

  return normalized
    .filter((action) => action.type.includes("lead"))
    .reduce((max, action) => Math.max(max, action.value), 0)
}

const INSTAGRAM_TOKEN_KEYS = [
  "META_ACCESS_TOKEN",
  "META_PAGE_ACCESS_TOKEN",
  "META_CAPI_ACCESS_TOKEN",
]

function getDirectInstagramAccountId() {
  return (
    process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() ||
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() ||
    process.env.IG_USER_ID?.trim() ||
    ""
  )
}

async function resolveInstagramAccountId() {
  const direct = getDirectInstagramAccountId()
  if (direct) return direct

  const errors: string[] = []
  const pageId = process.env.META_PAGE_ID?.trim()
  if (pageId) {
    try {
      const page = await metaGet<MetaInstagramBusinessAccountResponse>(
        pageId,
        { fields: "instagram_business_account{id,username}" },
        { tokenKeys: INSTAGRAM_TOKEN_KEYS, tryAllTokens: true }
      )
      const id = page.instagram_business_account?.id
      if (id) return id
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  try {
    const adAccounts = await metaGet<MetaPagingResponse<{ id?: string; username?: string }>>(
      `${getAdAccountId()}/instagram_accounts`,
      { fields: "id,username", limit: 1 },
      { tokenKeys: INSTAGRAM_TOKEN_KEYS, tryAllTokens: true }
    )
    const id = adAccounts.data?.[0]?.id
    if (id) return id
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  const suffix = errors.length > 0 ? ` Last error: ${errors[errors.length - 1]}` : ""
  throw new MetaConfigError(
    `Missing META_INSTAGRAM_BUSINESS_ACCOUNT_ID. Set it directly, or configure META_PAGE_ID with a connected Instagram business account.${suffix}`
  )
}

function getDateRangeForPreset(datePreset: string) {
  const end = new Date()
  const start = new Date(end)

  switch (datePreset) {
    case "last_7d":
      start.setDate(end.getDate() - 7)
      break
    case "last_90d":
      start.setDate(end.getDate() - 90)
      break
    case "this_month":
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      break
    case "last_30d":
    default:
      start.setDate(end.getDate() - 30)
      break
  }

  return {
    since: Math.floor(start.getTime() / 1000),
    until: Math.floor(end.getTime() / 1000),
  }
}

function mapInsightRows(rows: MetaInstagramInsightApiRow[] | undefined) {
  const output: Record<string, number> = {}
  for (const row of rows ?? []) {
    if (!row.name) continue
    const firstValue = row.values?.[0]?.value
    output[row.name] = toNumber(firstValue)
  }
  return output
}

function summarizeInstagram(media: MetaInstagramMediaRow[], followerGrowth: MetaInstagramFollowerPoint[]) {
  const totalViews = media.reduce((sum, item) => sum + item.insights.views, 0)
  const totalReach = media.reduce((sum, item) => sum + item.insights.reach, 0)
  const totalInteractions = media.reduce((sum, item) => sum + item.insights.totalInteractions, 0)
  const topMedia = media.reduce<MetaInstagramMediaRow | null>((top, item) => {
    if (!top || item.insights.views > top.insights.views) return item
    return top
  }, null)
  const followerDelta = followerGrowth.reduce((sum, item) => sum + item.value, 0)

  return {
    mediaCount: media.length,
    totalViews,
    totalReach,
    totalInteractions,
    averageViews: media.length > 0 ? Math.round(totalViews / media.length) : 0,
    topMediaId: topMedia?.id ?? null,
    topMediaViews: topMedia?.insights.views ?? 0,
    followerDelta,
    insightsErrorCount: media.filter((item) => item.insightsError).length,
  }
}

async function getInstagramMediaInsights(mediaId: string): Promise<{
  insights: MetaInstagramMediaInsights
  error?: string
}> {
  const metrics = ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions"]
  const empty: MetaInstagramMediaInsights = {
    views: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saved: 0,
    totalInteractions: 0,
  }

  try {
    const response = await metaGet<MetaPagingResponse<MetaInstagramInsightApiRow>>(
      `${mediaId}/insights`,
      { metric: metrics.join(",") },
      { tokenKeys: INSTAGRAM_TOKEN_KEYS, tryAllTokens: true }
    )
    const values = mapInsightRows(response.data)
    return {
      insights: {
        views: values.views ?? 0,
        reach: values.reach ?? 0,
        likes: values.likes ?? 0,
        comments: values.comments ?? 0,
        shares: values.shares ?? 0,
        saved: values.saved ?? 0,
        totalInteractions:
          values.total_interactions ??
          (values.likes ?? 0) + (values.comments ?? 0) + (values.shares ?? 0) + (values.saved ?? 0),
      },
    }
  } catch (error) {
    return {
      insights: empty,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function getInstagramFollowerGrowth(igUserId: string, datePreset: string) {
  const { since, until } = getDateRangeForPreset(datePreset)

  try {
    const response = await metaGet<MetaPagingResponse<MetaInstagramInsightApiRow>>(
      `${igUserId}/insights`,
      {
        metric: "follower_count",
        period: "day",
        since,
        until,
      },
      { tokenKeys: INSTAGRAM_TOKEN_KEYS, tryAllTokens: true }
    )

    const values = response.data?.[0]?.values ?? []
    return values.map((point) => ({
      date: point.end_time?.slice(0, 10) ?? "",
      value: toNumber(point.value),
    })).filter((point) => point.date)
  } catch {
    return []
  }
}

function summarize(campaigns: MetaCampaignRow[]) {
  const totals = campaigns.reduce(
    (acc, campaign) => {
      acc.spend += campaign.insights.spend
      acc.impressions += campaign.insights.impressions
      acc.reach += campaign.insights.reach
      acc.clicks += campaign.insights.clicks
      acc.leads += campaign.insights.leads
      if (campaign.effectiveStatus === "ACTIVE" || campaign.status === "ACTIVE") acc.activeCount += 1
      if (campaign.effectiveStatus === "PAUSED" || campaign.status === "PAUSED") acc.pausedCount += 1
      return acc
    },
    {
      activeCount: 0,
      pausedCount: 0,
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      leads: 0,
    }
  )

  return {
    campaignCount: campaigns.length,
    ...totals,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
    cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null,
  }
}

export async function getMetaAdAccountStatus(): Promise<MetaAdAccountStatus> {
  const account = await metaGet<{
    id: string
    account_id?: string
    name?: string
    account_status?: number
    currency?: string
    timezone_name?: string
    business?: { id?: string; name?: string }
  }>(getAdAccountId(), {
    fields: "id,account_id,name,account_status,currency,timezone_name,business{id,name}",
  })

  return {
    id: account.id,
    accountId: account.account_id,
    name: account.name,
    accountStatus: account.account_status,
    currency: account.currency,
    timezone: account.timezone_name,
    businessName: account.business?.name,
  }
}

/**
 * 대시보드 서버 메모 — 같은 (datePreset, limit) 요청은 45초 동안 Graph 재호출 없이 재사용한다.
 * 이 대시보드는 요청당 Graph 3콜(account+campaigns+insights)인데, 소비처가 넷이다
 * (meta/campaigns 라우트 · 캠페인 롤업 · 링크 후보 · meta-sync). 캠페인 관리 목록을 한 번
 * 여는 것만으로 롤업+상세가 연달아 부르므로 서버 메모가 없으면 콜 수가 소비처 수만큼 배가된다.
 * 명시 동기화·상태 변경 직후 재조회는 fresh:true 로 우회한다(중지/재개가 45초 늦게 보이면 안 된다).
 */
const DASHBOARD_MEMO_TTL_MS = 45_000
const dashboardMemo = new Map<string, { at: number; promise: Promise<MetaCampaignDashboard> }>()

export async function getMetaCampaignDashboard({
  datePreset = "last_30d",
  limit = 50,
  fresh = false,
}: {
  datePreset?: string
  limit?: number
  fresh?: boolean
} = {}): Promise<MetaCampaignDashboard> {
  const memoKey = `${datePreset}:${limit}`
  if (!fresh) {
    const hit = dashboardMemo.get(memoKey)
    if (hit && Date.now() - hit.at < DASHBOARD_MEMO_TTL_MS) return hit.promise
  }
  const promise = fetchMetaCampaignDashboard({ datePreset, limit })
  dashboardMemo.set(memoKey, { at: Date.now(), promise })
  // 실패한 promise 를 메모에 남기면 45초 동안 모든 소비처가 같은 에러를 재생한다 — 즉시 비운다.
  promise.catch(() => {
    if (dashboardMemo.get(memoKey)?.promise === promise) dashboardMemo.delete(memoKey)
  })
  return promise
}

async function fetchMetaCampaignDashboard({
  datePreset,
  limit,
}: {
  datePreset: string
  limit: number
}): Promise<MetaCampaignDashboard> {
  const accountId = getAdAccountId()
  const [account, campaignResponse, insightsResponse] = await Promise.all([
    getMetaAdAccountStatus(),
    metaGet<MetaPagingResponse<MetaCampaignApiRow>>(`${accountId}/campaigns`, {
      fields: "id,name,status,effective_status,objective,buying_type,created_time,updated_time,start_time,stop_time,lifetime_budget,daily_budget",
      limit,
    }),
    metaGet<MetaPagingResponse<MetaInsightApiRow>>(`${accountId}/insights`, {
      level: "campaign",
      fields: CAMPAIGN_INSIGHT_FIELDS,
      date_preset: datePreset,
      limit,
    }),
  ])

  const insightByCampaign = new Map(
    (insightsResponse.data ?? [])
      .filter((row) => row.campaign_id)
      .map((row) => [row.campaign_id!, row])
  )

  const campaigns = (campaignResponse.data ?? []).map((campaign): MetaCampaignRow => {
    const insight = insightByCampaign.get(campaign.id)
    return {
      id: campaign.id,
      name: campaign.name ?? insight?.campaign_name ?? campaign.id,
      status: campaign.status ?? "UNKNOWN",
      effectiveStatus: campaign.effective_status,
      objective: campaign.objective,
      buyingType: campaign.buying_type,
      createdTime: campaign.created_time,
      updatedTime: campaign.updated_time,
      startTime: campaign.start_time,
      stopTime: campaign.stop_time,
      lifetimeBudget: normalizeBudgetAmount(campaign.lifetime_budget, account.currency),
      dailyBudget: normalizeBudgetAmount(campaign.daily_budget, account.currency),
      insights: {
        spend: toNumber(insight?.spend),
        impressions: toNumber(insight?.impressions),
        reach: toNumber(insight?.reach),
        clicks: toNumber(insight?.clicks),
        ctr: toNullableNumber(insight?.ctr),
        cpc: toNullableNumber(insight?.cpc),
        cpm: toNullableNumber(insight?.cpm),
        leads: extractLeads(insight?.actions),
      },
    }
  })

  return {
    account,
    datePreset,
    campaigns,
    summary: summarize(campaigns),
  }
}

export async function updateMetaCampaignStatus(id: string, status: "ACTIVE" | "PAUSED") {
  return metaPost<{ success?: boolean }>(id, { status })
}

async function fetchMetaInstagramDashboard(
  datePreset: string,
  safeLimit: number,
): Promise<MetaInstagramDashboard> {
  const igUserId = await resolveInstagramAccountId()

  const [account, mediaResponse, followerGrowth] = await Promise.all([
    metaGet<MetaInstagramAccountApiRow>(
      igUserId,
      {
        fields:
          "id,username,name,followers_count,follows_count,media_count,profile_picture_url,website,biography",
      },
      { tokenKeys: INSTAGRAM_TOKEN_KEYS, tryAllTokens: true }
    ),
    metaGet<MetaPagingResponse<MetaInstagramMediaApiRow>>(
      `${igUserId}/media`,
      {
        fields:
          "id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count",
        limit: safeLimit,
      },
      { tokenKeys: INSTAGRAM_TOKEN_KEYS, tryAllTokens: true }
    ),
    getInstagramFollowerGrowth(igUserId, datePreset),
  ])

  const media = await Promise.all(
    (mediaResponse.data ?? []).map(async (row): Promise<MetaInstagramMediaRow> => {
      const { insights, error } = await getInstagramMediaInsights(row.id)
      return {
        id: row.id,
        caption: row.caption,
        mediaType: row.media_type,
        mediaProductType: row.media_product_type,
        permalink: row.permalink,
        timestamp: row.timestamp,
        thumbnailUrl: row.thumbnail_url,
        mediaUrl: row.media_url,
        likeCount: toNumber(row.like_count),
        commentsCount: toNumber(row.comments_count),
        insights,
        insightsError: error,
      }
    })
  )

  return {
    account: {
      id: account.id,
      username: account.username,
      name: account.name,
      followersCount: toNumber(account.followers_count),
      followsCount: toNumber(account.follows_count),
      mediaCount: toNumber(account.media_count),
      profilePictureUrl: account.profile_picture_url,
      website: account.website,
      biography: account.biography,
    },
    datePreset,
    media,
    followerGrowth,
    summary: summarizeInstagram(media, followerGrowth),
  }
}

/**
 * 콜드 Fluid 인스턴스 재계산 방지 — 이전에는 이 함수에 아무 캐시도 없었다(형제 함수
 * getMetaCampaignDashboard의 45초 dashboardMemo와 달리, Instagram 대시보드는 매 요청
 * Graph API를 다시 불렀다: 계정 1콜 + 미디어 목록 1콜 + 미디어당 인사이트 콜(최대 limit개) +
 * 팔로워 성장 1콜). revalidate=300(외부 데이터라 몇 분 단위로도 잘 안 바뀐다 — 캠페인
 * 대시보드의 45초보다 길게 잡는다). 실패는 캐시하지 않는다 — unstable_cache는 함수가
 * reject하면 값을 저장하지 않으므로, 기존 모듈 메모가 쓰던 "실패 promise 즉시 비움" 방어
 * 코드가 여기선 필요 없다(구조적으로 같은 효과).
 */
const META_INSTAGRAM_DASHBOARD_CACHE_TAG = "meta-instagram-dashboard"

const getCachedMetaInstagramDashboard = unstable_cache(
  fetchMetaInstagramDashboard,
  ["meta-instagram-dashboard-v1"],
  { revalidate: 300, tags: [META_INSTAGRAM_DASHBOARD_CACHE_TAG] },
)

export async function getMetaInstagramDashboard({
  datePreset = "last_30d",
  limit = 25,
}: {
  datePreset?: string
  limit?: number
} = {}): Promise<MetaInstagramDashboard> {
  const safeLimit = Math.min(Math.max(limit, 1), 50)
  return getCachedMetaInstagramDashboard(datePreset, safeLimit)
}

/* ─── 일자별 insights (meta_insights_daily 스냅샷용) ─────────── */

export interface MetaDailyInsightRow {
  date: string          // date_start — 광고 계정 타임존 기준 일자
  campaignId: string
  campaignName: string | null
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number | null
  cpc: number | null
  cpm: number | null
  leads: number
}

interface MetaDailyInsightApiRow extends MetaInsightApiRow {
  date_start?: string
  date_stop?: string
}

interface MetaCursorPaging {
  paging?: { cursors?: { after?: string }; next?: string }
}

export function mapDailyInsightRow(row: MetaDailyInsightApiRow): MetaDailyInsightRow | null {
  if (!row.campaign_id || !row.date_start) return null
  return {
    date: row.date_start,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name ?? null,
    spend: toNumber(row.spend),
    impressions: toNumber(row.impressions),
    reach: toNumber(row.reach),
    clicks: toNumber(row.clicks),
    ctr: toNullableNumber(row.ctr),
    cpc: toNullableNumber(row.cpc),
    cpm: toNullableNumber(row.cpm),
    leads: extractLeads(row.actions),
  }
}

const DAILY_INSIGHTS_PAGE_CAP = 20

/**
 * 캠페인 레벨 일자별 insights — time_increment=1 로 [since, until](YYYY-MM-DD, inclusive)
 * 범위를 조회한다. 행 수 = 일수 × 캠페인 수라 커서 페이징을 따라간다(안전 상한 20페이지).
 *
 * truncated=true 인 경우(둘 중 하나):
 *  1) 20페이지 캡에 도달했는데 다음 페이지(after)가 아직 남아있다 — 큰 범위/캠페인 수로 상한 초과.
 *  2) Meta 가 다음 페이지 존재(paging.next)만 알리고 커서(cursors.after)를 안 줘 더 따라갈 수 없다.
 * 두 경우 모두 결과가 무음으로 잘려나간 것이므로, 호출자(크론/백필)가 반드시 확인해야 한다.
 */
export async function fetchMetaDailyInsights({
  since,
  until,
}: {
  since: string
  until: string
}): Promise<{ rows: MetaDailyInsightRow[]; currency: string | null; truncated: boolean }> {
  const accountId = getAdAccountId()
  const account = await getMetaAdAccountStatus()
  const rows: MetaDailyInsightRow[] = []
  let after: string | undefined
  let truncated = false

  for (let page = 0; page < DAILY_INSIGHTS_PAGE_CAP; page += 1) {
    const response = await metaGet<MetaPagingResponse<MetaDailyInsightApiRow> & MetaCursorPaging>(
      `${accountId}/insights`,
      {
        level: "campaign",
        fields: CAMPAIGN_INSIGHT_FIELDS,
        time_increment: 1,
        time_range: JSON.stringify({ since, until }),
        limit: 500,
        after,
      }
    )
    for (const raw of response.data ?? []) {
      const mapped = mapDailyInsightRow(raw)
      if (mapped) rows.push(mapped)
    }

    if (!response.paging?.next) {
      after = undefined
      break
    }
    if (!response.paging?.cursors?.after) {
      truncated = true
      break
    }
    after = response.paging.cursors.after
    if (page === DAILY_INSIGHTS_PAGE_CAP - 1) truncated = true
  }

  if (truncated) {
    console.warn("[meta-daily] 페이징 상한 도달 — 결과 절단됨", { since, until })
  }

  return { rows, currency: account.currency ?? null, truncated }
}
