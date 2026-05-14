import "server-only"

import { triggerOnSubmitRules } from "@/lib/automation-engine"
import type { LeadPayload, LeadSource } from "@/lib/lead-types"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { saveLead } from "@/lib/repositories/leads"
import { upsertSubscriber } from "@/lib/repositories/marketing"
import { getResolvedSettings } from "@/lib/repositories/settings"
import { postJson } from "@/lib/server/post-json"
import { setEventToken } from "@/lib/types/event-metrics"

const VALID_SOURCES = new Set<LeadSource>([
  "demo_modal",
  "contact_page",
  "newsletter",
  "meta_lead_ads",
])

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface LeadSubmissionSuccess {
  ok: true
  stored: boolean
  warnings: string[]
}

export interface LeadSubmissionError {
  ok: false
  error: string
  details?: string[]
}

export type LeadSubmissionResult =
  | {
      status: number
      body: LeadSubmissionSuccess
    }
  | {
      status: number
      body: LeadSubmissionError
    }

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

export function resolveLeadSource(value: unknown): LeadSource | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!VALID_SOURCES.has(trimmed as LeadSource)) return null
  return trimmed as LeadSource
}

export function buildLeadPayload(raw: unknown): LeadPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("요청 형식이 올바르지 않습니다.")
  }

  const body = raw as Record<string, unknown>
  const source = resolveLeadSource(body.source)
  const email = normalizeEmail(body.email)

  if (!source) {
    throw new Error("문의 경로가 올바르지 않습니다.")
  }

  if (email === null) {
    throw new Error("이메일 형식을 다시 확인해 주세요.")
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
    eventSlug: normalizeString(body.eventSlug),
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
    throw new Error("상담 요청에 필요한 정보를 모두 입력해 주세요.")
  }

  if (
    payload.source === "contact_page" &&
    !hasRequiredFields(payload, ["org", "name", "phone", "message"])
  ) {
    throw new Error("필수 문의 정보를 모두 입력해 주세요.")
  }

  if (payload.source === "newsletter" && !payload.email) {
    throw new Error("뉴스레터 구독에는 이메일이 필요합니다.")
  }

  return payload
}

function buildLeadNotificationTitle(body: LeadPayload) {
  const target = body.org ?? body.name ?? body.email ?? body.phone ?? "Unknown"
  if (body.eventSlug) return `행사 신청: ${target}`
  return `새 리드: ${target}`
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

export async function submitLeadCapture(raw: unknown): Promise<LeadSubmissionResult> {
  try {
    const body = buildLeadPayload(raw)
    const settings = await getResolvedSettings()
    let stored = false
    let savedLeadId: string | undefined
    let storageError: string | undefined

    const notes = body.eventSlug ? setEventToken("", body.eventSlug) : undefined

    try {
      const savedLead = await saveLead({ ...body, notes })
      savedLeadId = savedLead.id
      stored = true
    } catch (error) {
      console.error("[lead-capture] saveLead error:", error)
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
        console.error("[lead-capture] triggerOnSubmitRules error:", error)
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
        console.error("[lead-capture] notification emit failed:", error)
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
        console.error("[lead-capture] incident notification emit failed:", error)
      })
    }

    if (!stored && deliveryCount === 0) {
      return {
        status: 502,
        body: {
          ok: false,
          error: "상담 요청 저장과 전달이 모두 실패했습니다.",
          details: storageError ? [storageError, ...errors] : errors,
        },
      }
    }

    return {
      status: 200,
      body: {
        ok: true,
        stored,
        warnings: [...(storageError ? [storageError] : []), ...errors],
      },
    }
  } catch (error) {
    return {
      status: 400,
      body: {
        ok: false,
        error: error instanceof Error ? error.message : "요청을 처리하지 못했습니다.",
      },
    }
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
      tags: data.source === "demo_modal"
        ? ["demo_request"]
        : data.source === "meta_lead_ads"
          ? ["meta_lead_ads"]
          : [],
      source: data.source,
    })
  } catch (error) {
    console.error("[lead-capture] subscriber sync failed:", error)
    throw error
  }
}
