import { NextRequest, NextResponse } from "next/server"

import type { LeadSource } from "@/lib/lead-types"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import { resolveLeadSource, submitLeadCapture } from "@/lib/server/lead-capture"

const PAGE_FORM_SOURCE_MAP = {
  demo: "demo_modal",
  contact: "contact_page",
  newsletter: "newsletter",
} as const satisfies Record<string, LeadSource>

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
}

function withCors(response: NextResponse) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value)
  }

  return response
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeString(value)
    if (normalized) return normalized
  }

  return undefined
}

function isWebhookAuthorized(req: NextRequest) {
  const secret = process.env.PAGE_WEBHOOK_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== "production"
  return req.headers.get("x-webhook-secret") === secret
}

function resolvePageSource(rawSource: unknown, rawFormType: unknown) {
  const source = resolveLeadSource(rawSource)
  const formType =
    typeof rawFormType === "string"
      ? PAGE_FORM_SOURCE_MAP[rawFormType.trim().toLowerCase() as keyof typeof PAGE_FORM_SOURCE_MAP] ?? null
      : null

  if (source && formType && source !== formType) {
    throw new Error("source and formType do not match.")
  }

  return source ?? formType
}

function buildPageWebhookPayload(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Webhook payload is invalid.")
  }

  const body = raw as Record<string, unknown>
  const source = resolvePageSource(body.source, body.formType)

  if (!source) {
    throw new Error("source or formType must be one of demo, contact, newsletter.")
  }

  return {
    source,
    name: pickString(body.name, body.contactName),
    org: pickString(body.org, body.organization, body.company),
    role: pickString(body.role, body.position, body.jobTitle),
    size: pickString(body.size, body.studentCount, body.teamSize),
    email: pickString(body.email),
    phone: pickString(body.phone, body.tel, body.mobile),
    message: pickString(body.message, body.content, body.note),
    marketingConsent:
      body.marketingConsent === true || body.marketing_consent === true,
  }
}

export async function GET() {
  return withCors(
    NextResponse.json({
      ok: true,
      endpoint: "/api/webhook/page",
      method: "POST",
      acceptedSource: ["demo_modal", "contact_page", "newsletter"],
      acceptedFormType: ["demo", "contact", "newsletter"],
      requiredBySource: {
        demo_modal: ["name", "org", "role", "size", "email", "phone"],
        contact_page: ["org", "name", "phone", "message"],
        newsletter: ["email"],
      },
    })
  )
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }))
}

export async function POST(req: NextRequest) {
  if (!isWebhookAuthorized(req)) {
    return withCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
  }

  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "page-webhook", {
    windowMs: 60_000,
    max: 10,
  })

  if (!allowed) {
    return withCors(
      NextResponse.json({ error: "Too many requests." }, { status: 429 })
    )
  }

  try {
    const raw = await req.json()
    const body =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
    const result = await submitLeadCapture(
      buildPageWebhookPayload({
        ...body,
        formType:
          typeof body.formType === "string" ? body.formType : body.form_type,
      })
    )

    return withCors(NextResponse.json(result.body, { status: result.status }))
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Invalid request.",
        },
        { status: 400 }
      )
    )
  }
}
