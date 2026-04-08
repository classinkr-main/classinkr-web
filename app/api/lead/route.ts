/**
 * Public lead capture API used by homepage forms and newsletter signup.
 * The route stores the lead, forwards it to configured integrations,
 * syncs newsletter subscribers, and emits internal notification events.
 */
import { NextRequest, NextResponse } from "next/server"

import { triggerOnSubmitRules } from "@/lib/automation-engine"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { saveLead } from "@/lib/repositories/leads"
import { upsertSubscriber } from "@/lib/repositories/marketing"
import { getResolvedSettings } from "@/lib/repositories/settings"
import { postJson } from "@/lib/server/post-json"

export interface LeadPayload {
  source: "demo_modal" | "contact_page" | "newsletter"
  name?: string
  org?: string
  role?: string
  size?: string
  email?: string
  phone?: string
  message?: string
  timestamp: string
  marketingConsent?: boolean
}

const VALID_SOURCES = new Set<LeadPayload["source"]>([
  "demo_modal",
  "contact_page",
  "newsletter",
])

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeString(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeEmail(value: unknown) {
  const email = normalizeString(value)?.toLowerCase()
  if (!email) return undefined
  return EMAIL_REGEX.test(email) ? email : null
}

function hasRequiredFields(
  payload: LeadPayload,
  fields: Array<
    keyof Pick<
      LeadPayload,
      "name" | "org" | "role" | "size" | "email" | "phone" | "message"
    >
  >
) {
  return fields.every((field) => Boolean(payload[field]))
}

function buildPayload(raw: unknown): LeadPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Lead payload is invalid.")
  }

  const body = raw as Record<string, unknown>
  const source =
    typeof body.source === "string" &&
    VALID_SOURCES.has(body.source as LeadPayload["source"])
      ? (body.source as LeadPayload["source"])
      : null
  const email = normalizeEmail(body.email)

  if (!source) {
    throw new Error("Lead source is invalid.")
  }

  if (email === null) {
    throw new Error("Email format is invalid.")
  }

  const payload: LeadPayload = {
    source,
    name: normalizeString(body.name),
    org: normalizeString(body.org),
    role: normalizeString(body.role),
    size: normalizeString(body.size),
    email: email ?? undefined,
    phone: normalizeString(body.phone),
    message: normalizeString(body.message),
    timestamp: new Date().toISOString(),
    marketingConsent: body.marketingConsent === true,
  }

  if (
    payload.source === "demo_modal" &&
    !hasRequiredFields(payload, [
      "name",
      "org",
      "role",
      "size",
      "email",
      "phone",
    ])
  ) {
    throw new Error("Demo request is missing required fields.")
  }

  if (
    payload.source === "contact_page" &&
    !hasRequiredFields(payload, ["org", "name", "phone", "message"])
  ) {
    throw new Error("Contact request is missing required fields.")
  }

  if (payload.source === "newsletter" && !payload.email) {
    throw new Error("Email is required for newsletter signups.")
  }

  return payload
}

function buildLeadNotificationTitle(body: LeadPayload) {
  if (body.org) return `새 리드: ${body.org}`
  return `새 리드: ${body.name ?? body.email ?? body.phone ?? "Unknown"}`
}

function buildLeadNotificationMessage(body: LeadPayload) {
  return [
    body.name,
    body.role,
    body.size ? `예상 사용자 ${body.size}` : undefined,
    body.source,
  ]
    .filter(Boolean)
    .join(" / ")
}

export async function POST(req: NextRequest) {
  try {
    const body = buildPayload(await req.json())
    const settings = await getResolvedSettings()
    let stored = false
    let savedLeadId: string | undefined
    let storageError: string | undefined

    try {
      const savedLead = await saveLead({ ...body })
      savedLeadId = savedLead.id
      stored = true
    } catch (error) {
      console.error("[POST /api/lead] saveLead error:", error)
      storageError = "Failed to store the lead record."
    }

    const deliveryTasks: Promise<void>[] = []

    if (settings.googleSheetWebhookUrl) {
      deliveryTasks.push(sendToGoogleSheet(body, settings.googleSheetWebhookUrl))
    }

    if (settings.leadWebhookUrl) {
      deliveryTasks.push(sendToWebhook(body, settings.leadWebhookUrl))
    }

    if (settings.channelTalkWebhookUrl) {
      deliveryTasks.push(sendToChannelTalk(body, settings.channelTalkWebhookUrl))
    }

    if (body.email && body.marketingConsent === true) {
      deliveryTasks.push(syncToSubscriberDB(body))
    }

    const results = await Promise.allSettled(deliveryTasks)
    const errors = results
      .filter((result) => result.status === "rejected")
      .map((result) => (result as PromiseRejectedResult).reason?.message)
      .filter(Boolean)

    if (body.email) {
      void triggerOnSubmitRules({
        email: body.email,
        name: body.name,
        org: body.org,
        role: body.role,
        source: body.source,
      }).catch((error) => {
        console.error("[POST /api/lead] triggerOnSubmitRules error:", error)
      })
    }

    const deliveryCount = results.filter(
      (result) => result.status === "fulfilled"
    ).length

    if (stored) {
      void emitNotificationEvent({
        eventType: "lead.created",
        notificationType: "action_required",
        categoryTag: "lead",
        severity: "info",
        scopeTag: "org_admin",
        title: buildLeadNotificationTitle(body),
        message: buildLeadNotificationMessage(body),
        routeUrl: "/admin/crm",
        source: "lead",
        sourceId: savedLeadId,
        payload: {
          leadId: savedLeadId,
          source: body.source,
          name: body.name,
          org: body.org,
          role: body.role,
          size: body.size,
          email: body.email,
          phone: body.phone,
        },
      }).catch((error) => {
        console.error("[POST /api/lead] notification emit failed:", error)
      })
    }

    if (storageError || errors.length > 0) {
      void emitNotificationEvent({
        eventType: "integration.webhook_failed",
        notificationType: "incident",
        categoryTag: "system",
        severity: storageError ? "critical" : "warning",
        scopeTag: "critical_control",
        title: storageError
          ? "리드 저장 또는 전달 실패"
          : "리드 전달 경고가 발생했습니다",
        message: [storageError, ...errors]
          .filter(Boolean)
          .slice(0, 3)
          .join(" | "),
        routeUrl: "/admin/settings",
        source: "lead",
        sourceId: savedLeadId,
        payload: {
          leadId: savedLeadId,
          source: body.source,
          errors,
          storageError,
        },
        channels: ["wecom_webhook", "email"],
      }).catch((error) => {
        console.error("[POST /api/lead] incident notification emit failed:", error)
      })
    }

    if (!stored && deliveryCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Lead storage and delivery both failed.",
          details: storageError ? [storageError, ...errors] : errors,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      stored,
      warnings: [...(storageError ? [storageError] : []), ...errors],
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid request.",
      },
      { status: 400 }
    )
  }
}

async function sendToGoogleSheet(data: LeadPayload, url?: string) {
  if (!url) return

  const response = await postJson(url, data)
  if (!response.ok) throw new Error(`Google Sheet: ${response.status}`)
}

async function sendToWebhook(data: LeadPayload, url?: string) {
  if (!url) return

  const response = await postJson(url, data)
  if (!response.ok) throw new Error(`Webhook: ${response.status}`)
}

async function sendToChannelTalk(data: LeadPayload, url?: string) {
  if (!url) return

  const messageParts = [
    data.role,
    data.size ? `예상 ${data.size}` : undefined,
    data.message,
  ].filter(Boolean)

  const response = await postJson(url, {
    event: "new_lead",
    source: data.source,
    name: data.name || data.email,
    org: data.org,
    phone: data.phone,
    email: data.email,
    message: messageParts.join(" / "),
    timestamp: data.timestamp,
  })

  if (!response.ok) throw new Error(`ChannelTalk: ${response.status}`)
}

async function syncToSubscriberDB(data: LeadPayload) {
  if (!data.email) return

  try {
    await upsertSubscriber({
      name: data.name || data.email.split("@")[0],
      email: data.email,
      org: data.org,
      role: data.role,
      size: data.size,
      phone: data.phone,
      tags: data.source === "demo_modal" ? ["demo_request"] : [],
      source: data.source,
    })
  } catch (error) {
    console.error("[syncToSubscriberDB] subscriber sync failed:", error)
    throw error
  }
}
