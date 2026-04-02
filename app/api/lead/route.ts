/**
 * ─────────────────────────────────────────────────────────────
 * /api/lead  —  리드 수집 API (기존 + 마케팅 구독자 자동 등록)
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-24] 리드 → 구독자 자동 연동
 *   데모 신청 또는 문의 시 명시적 수신 동의를 받은 이메일만
 *   구독자 DB에도 등록 (옵트인 처리).
 */
import { NextRequest, NextResponse } from "next/server"
import { saveLead } from "@/lib/repositories/leads"
import { upsertSubscriber } from "@/lib/repositories/marketing"
import { getResolvedSettings } from "@/lib/repositories/settings"
import { postJson } from "@/lib/server/post-json"
import { triggerOnSubmitRules } from "@/lib/automation-engine"

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
  /** [NOTE-24] 마케팅 이메일 수신 동의 여부 */
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
  fields: Array<keyof Pick<LeadPayload, "name" | "org" | "role" | "size" | "email" | "phone" | "message">>
) {
  return fields.every((field) => Boolean(payload[field]))
}

function buildPayload(raw: unknown): LeadPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("리드 요청 값이 올바르지 않습니다.")
  }

  const body = raw as Record<string, unknown>
  const source =
    typeof body.source === "string" && VALID_SOURCES.has(body.source as LeadPayload["source"])
      ? (body.source as LeadPayload["source"])
      : null
  const email = normalizeEmail(body.email)

  if (!source) {
    throw new Error("유입 경로가 올바르지 않습니다.")
  }

  if (email === null) {
    throw new Error("올바른 이메일 형식을 입력해주세요.")
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
    !hasRequiredFields(payload, ["name", "org", "role", "size", "email", "phone"])
  ) {
    throw new Error("데모 신청 필수 항목이 누락되었습니다.")
  }

  if (
    payload.source === "contact_page" &&
    !hasRequiredFields(payload, ["org", "name", "phone", "message"])
  ) {
    throw new Error("문의 필수 항목이 누락되었습니다.")
  }

  if (payload.source === "newsletter" && !payload.email) {
    throw new Error("이메일은 필수입니다.")
  }

  return payload
}

export async function POST(req: NextRequest) {
  try {
    const body = buildPayload(await req.json())
    const settings = await getResolvedSettings()
    let stored = false
    let storageError: string | undefined

    try {
      await saveLead({ ...body })
      stored = true
    } catch (e) {
      console.error("[POST /api/lead] saveLead error:", e)
      storageError = "리드 저장소 동기화에 실패했습니다."
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

    const deliveryCount = results.filter((result) => result.status === "fulfilled").length

    if (!stored && deliveryCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "리드 저장과 외부 전달에 모두 실패했습니다.",
          details: storageError ? [storageError, ...errors] : errors,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      stored,
      warnings: [
        ...(storageError ? [storageError] : []),
        ...errors,
      ],
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "잘못된 요청입니다.",
      },
      { status: 400 }
    )
  }
}

async function sendToGoogleSheet(data: LeadPayload, url?: string) {
  if (!url) return

  const res = await postJson(url, data)
  if (!res.ok) throw new Error(`Google Sheet: ${res.status}`)
}

async function sendToWebhook(data: LeadPayload, url?: string) {
  if (!url) return

  const res = await postJson(url, data)
  if (!res.ok) throw new Error(`Webhook: ${res.status}`)
}

async function sendToChannelTalk(data: LeadPayload, url?: string) {
  if (!url) return

  const messageParts = [
    data.role,
    data.size ? `원생 ${data.size}` : undefined,
    data.message,
  ].filter(Boolean)

  const res = await postJson(url, {
    event: "new_lead",
    source: data.source,
    name: data.name || data.email,
    org: data.org,
    phone: data.phone,
    email: data.email,
    message: messageParts.join(" / "),
    timestamp: data.timestamp,
  })

  if (!res.ok) throw new Error(`ChannelTalk: ${res.status}`)
}

/**
 * [NOTE-24] 리드 → 구독자 DB 자동 동기화
 * 데모 신청자 / 문의자의 이메일을 구독자 목록에 등록.
 * 유입 경로(source)를 그대로 전달하여 추적 가능.
 */
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
      tags: data.source === "demo_modal" ? ["데모신청"] : [],
      source: data.source,
    })
  } catch (err) {
    console.error("[syncToSubscriberDB] 구독자 자동 등록 실패:", err)
    throw err
  }
}
