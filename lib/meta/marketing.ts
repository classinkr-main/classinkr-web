import "server-only"

import { createHmac } from "crypto"

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

interface MetaPagingResponse<T> {
  data?: T[]
}

function getRequiredEnv(key: string) {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`Missing ${key}`)
  return value
}

function getVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v25.0"
}

function getAccessTokenCandidates(): MetaAccessTokenCandidate[] {
  const rawCandidates = [
    { name: "META_ACCESS_TOKEN", value: process.env.META_ACCESS_TOKEN?.trim() },
    { name: "META_CAPI_ACCESS_TOKEN", value: process.env.META_CAPI_ACCESS_TOKEN?.trim() },
  ]

  const seen = new Set<string>()
  const candidates = rawCandidates.flatMap((candidate) => {
    if (!candidate.value || seen.has(candidate.value)) return []
    seen.add(candidate.value)
    return [{ name: candidate.name, value: candidate.value }]
  })

  if (candidates.length === 0) {
    throw new Error("Missing META_ACCESS_TOKEN or META_CAPI_ACCESS_TOKEN")
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

async function metaGet<T>(path: string, params?: Record<string, string | number | undefined>) {
  const candidates = getAccessTokenCandidates()
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
    if (index < candidates.length - 1 && shouldTryNextToken(response.status, error)) continue
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
  return (actions ?? []).reduce((total, action) => {
    const type = action.action_type?.toLowerCase() ?? ""
    if (!type.includes("lead")) return total
    return total + toNumber(action.value)
  }, 0)
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

export async function getMetaCampaignDashboard({
  datePreset = "last_30d",
  limit = 50,
}: {
  datePreset?: string
  limit?: number
} = {}): Promise<MetaCampaignDashboard> {
  const accountId = getAdAccountId()
  const [account, campaignResponse, insightsResponse] = await Promise.all([
    getMetaAdAccountStatus(),
    metaGet<MetaPagingResponse<MetaCampaignApiRow>>(`${accountId}/campaigns`, {
      fields: "id,name,status,effective_status,objective,buying_type,created_time,updated_time,start_time,stop_time",
      limit,
    }),
    metaGet<MetaPagingResponse<MetaInsightApiRow>>(`${accountId}/insights`, {
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
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
