import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { submitLeadCapture } from "@/lib/server/lead-capture"

export const runtime = "nodejs"

type MetaLeadValue = {
  leadgen_id?: string
  page_id?: string
  form_id?: string
  ad_id?: string
  adgroup_id?: string
  created_time?: number
}

type MetaWebhookPayload = {
  object?: string
  entry?: Array<{
    id?: string
    time?: number
    changes?: Array<{
      field?: string
      value?: MetaLeadValue
    }>
  }>
}

type MetaLeadDetail = MetaLeadValue & {
  id?: string
  created_time?: string | number
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  field_data?: Array<{
    name?: string
    values?: string[]
  }>
}

function getGraphApiVersion() {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v25.0"
}

function getMetaAccessToken() {
  return (
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim()
  )
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function appSecretProof(accessToken: string) {
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appSecret) return undefined
  return createHmac("sha256", appSecret).update(accessToken).digest("hex")
}

function verifyMetaSignature(payload: string, signature: string | null) {
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appSecret) return true

  if (!signature?.startsWith("sha256=")) {
    return process.env.NODE_ENV !== "production"
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

function extractLeadValues(payload: MetaWebhookPayload) {
  const values: MetaLeadValue[] = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) {
        values.push(change.value)
      }
    }
  }

  return values
}

function fieldDataToMap(fieldData: MetaLeadDetail["field_data"]) {
  const fields: Record<string, string> = {}

  for (const field of fieldData ?? []) {
    const key = normalizeString(field.name)
    if (!key) continue

    const value = field.values
      ?.map((item) => normalizeString(item))
      .filter(Boolean)
      .join(", ")

    if (value) fields[key.toLowerCase()] = value
  }

  return fields
}

function pickField(fields: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = fields[key.toLowerCase()]
    if (value) return value
  }

  return undefined
}

function hasMarketingConsent(fields: Record<string, string>) {
  const value = pickField(fields, [
    "marketing_consent",
    "consent_marketing",
    "email_marketing_consent",
    "marketing",
    "마케팅_수신_동의",
    "마케팅 수신 동의",
  ])

  if (!value) return false

  return ["1", "true", "yes", "y", "agree", "agreed", "동의"].includes(
    value.trim().toLowerCase()
  )
}

function buildMetaMessage(value: MetaLeadValue, detail?: MetaLeadDetail) {
  const fields = fieldDataToMap(detail?.field_data)
  const fieldSummary = Object.entries(fields)
    .map(([key, item]) => `${key}: ${item}`)
    .join(" / ")

  return [
    "Meta Lead Ads",
    `leadgen_id=${value.leadgen_id ?? detail?.id ?? "-"}`,
    `page_id=${value.page_id ?? "-"}`,
    `form_id=${value.form_id ?? detail?.form_id ?? "-"}`,
    detail?.campaign_name || detail?.campaign_id
      ? `campaign=${detail.campaign_name ?? detail.campaign_id}`
      : undefined,
    detail?.adset_name || detail?.adset_id
      ? `adset=${detail.adset_name ?? detail.adset_id}`
      : undefined,
    detail?.ad_name || detail?.ad_id || value.ad_id
      ? `ad=${detail?.ad_name ?? detail?.ad_id ?? value.ad_id}`
      : undefined,
    fieldSummary ? `fields=${fieldSummary}` : undefined,
  ]
    .filter(Boolean)
    .join("\n")
}

function buildLeadCapturePayload(value: MetaLeadValue, detail?: MetaLeadDetail) {
  const fields = fieldDataToMap(detail?.field_data)
  const firstName = pickField(fields, ["first_name", "firstname", "이름"])
  const lastName = pickField(fields, ["last_name", "lastname", "성"])
  const combinedName = [lastName, firstName].filter(Boolean).join("")

  return {
    source: "meta_lead_ads",
    name:
      pickField(fields, ["full_name", "name", "성명", "이름"]) ||
      combinedName ||
      undefined,
    org: pickField(fields, [
      "company_name",
      "company",
      "organization",
      "business_name",
      "school_name",
      "academy_name",
      "학원명",
      "회사명",
      "기관명",
    ]),
    role: pickField(fields, ["job_title", "role", "position", "직책", "담당자직책"]),
    size: pickField(fields, [
      "student_count",
      "number_of_students",
      "academy_size",
      "team_size",
      "원생수",
      "학생수",
      "규모",
    ]),
    email: pickField(fields, ["email", "email_address", "이메일"]),
    phone: pickField(fields, [
      "phone_number",
      "phone",
      "mobile",
      "mobile_number",
      "전화번호",
      "휴대폰",
    ]),
    message: buildMetaMessage(value, detail),
    marketingConsent: hasMarketingConsent(fields),
  }
}

async function fetchMetaLeadDetail(leadgenId: string) {
  const accessToken = getMetaAccessToken()
  if (!accessToken) {
    throw new Error("META_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN is required.")
  }

  const url = new URL(
    `https://graph.facebook.com/${getGraphApiVersion()}/${leadgenId}`
  )
  url.searchParams.set(
    "fields",
    [
      "id",
      "created_time",
      "ad_id",
      "ad_name",
      "adset_id",
      "adset_name",
      "campaign_id",
      "campaign_name",
      "form_id",
      "field_data",
    ].join(",")
  )

  const proof = appSecretProof(accessToken)
  if (proof) url.searchParams.set("appsecret_proof", proof)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new Error(`Meta lead fetch failed: ${response.status} ${errorText}`)
  }

  return (await response.json()) as MetaLeadDetail
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
