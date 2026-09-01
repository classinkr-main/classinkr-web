import "server-only"

import { triggerOnSubmitRules } from "@/lib/automation-engine"
import { isSiteFormLead } from "@/lib/crm/capture/origin"
import type { LeadPayload, LeadSource } from "@/lib/lead-types"
import {
  type MarketingRequestMeta,
  sendServerConversion,
} from "@/lib/marketing/server-conversions"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { createCrmCustomerEvent } from "@/lib/repositories/crm-events"
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
// site_inflow 타임라인 이벤트 summary에 쓰는 유입 경로 한글 라벨.
const SITE_INFLOW_SOURCE_LABELS = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
} as Record<string, string>

// TLD 2자 이상 강제 — "a@b.c" 류 가짜 이메일 차단
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/
const EMAIL_MAX_LENGTH = 254

// 봇이 채우는 숨김 honeypot 필드명 (클라이언트 폼의 숨김 input과 일치해야 함)
const HONEYPOT_FIELD = "website"

// 인스턴스별 메모리 기반 중복 제출 방지 — rate-limit과 동일한 한계(서버리스 인스턴스별 독립)로
// 더블 클릭/봇 재시도 차단 용도. 더 강한 보장이 필요하면 Upstash Redis 사용.
const DUPLICATE_WINDOW_MS = 60_000
type RecentSubmissionStatus = "pending" | "accepted"

const recentSubmissions = new Map<
  string,
  {
    status: RecentSubmissionStatus
    updatedAt: number
  }
>()

function isHoneypotTripped(raw: unknown) {
  if (!raw || typeof raw !== "object") return false
  const value = (raw as Record<string, unknown>)[HONEYPOT_FIELD]
  return typeof value === "string" && value.trim().length > 0
}

function getSubmissionKey(body: LeadPayload) {
  const contact = body.email ?? body.phone
  if (!contact) return null

  const context = body.eventSlug ?? body.leadMagnet ?? body.sourceDetail ?? "general"
  return [
    body.source,
    context.trim().toLowerCase(),
    contact.trim().toLowerCase(),
  ].join(":")
}

function pruneRecentSubmissions(now = Date.now()) {
  for (const [staleKey, submission] of recentSubmissions) {
    if (now - submission.updatedAt > DUPLICATE_WINDOW_MS) {
      recentSubmissions.delete(staleKey)
    }
  }
}

function getRecentSubmissionStatus(key: string) {
  pruneRecentSubmissions()
  return recentSubmissions.get(key)?.status ?? null
}

function markSubmission(key: string, status: RecentSubmissionStatus) {
  recentSubmissions.set(key, {
    status,
    updatedAt: Date.now(),
  })
}

function clearSubmission(key: string | null) {
  if (key) recentSubmissions.delete(key)
}

export interface LeadSubmissionSuccess {
  ok: true
  stored: boolean
  warnings: string[]
  leadId?: string
  conversionEventId?: string
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

export interface LeadCaptureContext {
  requestMeta?: MarketingRequestMeta | null
  deferTask?: (task: () => Promise<void>) => void
  /**
   * 상위 플로우가 자체 알림을 이미 소유할 때 lead.created 알림만 생략한다.
   * (예: 결제창 무결제 도입 신청 — checkout.request_created 1건으로 통일)
   * 리드 저장·구글시트·채널톡·CRM 타임라인·서버 전환은 그대로 수행한다.
   */
  suppressLeadCreatedNotification?: boolean
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeTrackingSlug(value: unknown) {
  const normalized = normalizeString(value)
  if (!normalized) return undefined
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || undefined
}

function inferLeadMagnet(value: string | undefined) {
  if (!value) return undefined
  const match = value.match(/(?:^|[:/])lead[_-]?magnet[:/]([a-z0-9_.:-]+)/i)
  return normalizeTrackingSlug(match?.[1])
}

function normalizeEmail(value: unknown) {
  const email = normalizeString(value)?.toLowerCase()
  if (!email) return undefined
  if (email.length > EMAIL_MAX_LENGTH) return null
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
    branch: normalizeString(body.branch),
    message: normalizeString(body.message),
    timestamp: new Date().toISOString(),
    marketingConsent: body.marketingConsent === true,
    eventSlug: normalizeString(body.eventSlug),
    sourceDetail: normalizeString(body.sourceDetail ?? body.source_detail),
    leadMagnet: normalizeTrackingSlug(body.leadMagnet ?? body.lead_magnet),
    utmSource: normalizeString(body.utmSource ?? body.utm_source),
    utmMedium: normalizeString(body.utmMedium ?? body.utm_medium),
    utmCampaign: normalizeString(body.utmCampaign ?? body.utm_campaign),
    utmTerm: normalizeString(body.utmTerm ?? body.utm_term),
    utmContent: normalizeString(body.utmContent ?? body.utm_content),
    gclid: normalizeString(body.gclid),
    fbclid: normalizeString(body.fbclid),
    msclkid: normalizeString(body.msclkid),
    ttclid: normalizeString(body.ttclid),
    landingPage: normalizeString(body.landingPage ?? body.landing_page),
    currentPage: normalizeString(body.currentPage ?? body.current_page),
    referrer: normalizeString(body.referrer),
    anonymousId: normalizeString(body.anonymousId ?? body.anonymous_id),
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

  payload.leadMagnet ??= inferLeadMagnet(payload.sourceDetail)

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
    body.org,
    body.role,
    body.size ? `예상 사용자 ${body.size}` : undefined,
    body.source,
  ]
    .filter(Boolean)
    .join(" / ")
}

export async function submitLeadCapture(
  raw: unknown,
  context: LeadCaptureContext = {}
): Promise<LeadSubmissionResult> {
  let submissionKey: string | null = null

  try {
    // honeypot이 채워졌으면 봇으로 간주 — 저장·전달 없이 성공 응답(봇이 차단을 학습하지 못하도록)
    if (isHoneypotTripped(raw)) {
      console.warn("[lead-capture] honeypot tripped — dropping submission")
      return { status: 200, body: { ok: true, stored: false, warnings: [] } }
    }

    const body = buildLeadPayload(raw)
    submissionKey = getSubmissionKey(body)

    // 동일 연락처의 60초 내 재제출은 성공적으로 접수된 요청만 중복 성공 처리한다.
    // 실패한 요청은 즉시 재시도할 수 있어야 하므로 pending 상태와 accepted 상태를 분리한다.
    if (submissionKey) {
      const recentStatus = getRecentSubmissionStatus(submissionKey)

      if (recentStatus === "accepted") {
        console.warn(`[lead-capture] duplicate submission dropped (source=${body.source})`)
        return { status: 200, body: { ok: true, stored: false, warnings: [] } }
      }

      if (recentStatus === "pending") {
        return {
          status: 409,
          body: {
            ok: false,
            error: "상담 요청을 접수 중입니다. 잠시만 기다려 주세요.",
          },
        }
      }

      markSubmission(submissionKey, "pending")
    }

    const settings = await getResolvedSettings()
    let stored = false
    let savedLeadId: string | undefined
    let storageError: string | undefined
    let conversionEventId: string | undefined

    const notes = body.eventSlug ? setEventToken("", body.eventSlug) : undefined

    try {
      const savedLead = await saveLead({
        ...body,
        notes,
        source_detail: body.sourceDetail,
        lead_magnet: body.leadMagnet,
        utm_source: body.utmSource,
        utm_medium: body.utmMedium,
        utm_campaign: body.utmCampaign,
        utm_term: body.utmTerm,
        utm_content: body.utmContent,
        gclid: body.gclid,
        fbclid: body.fbclid,
        msclkid: body.msclkid,
        ttclid: body.ttclid,
        landing_page: body.landingPage,
        current_page: body.currentPage,
        referrer: body.referrer,
        anonymous_id: body.anonymousId,
      })
      savedLeadId = savedLead.id
      conversionEventId = `lead:${savedLead.id}`
      stored = true

      // 제출 전에 쌓인 익명 활동을 이 리드로 귀속한다.
      //
      // 신원 결합 모듈은 원래부터 있었지만(로그인 콜백·자료 다운로드·뉴스레터에서 호출),
      // 정작 리드 제출 경로에서는 한 번도 부르지 않았다. 그래서 client_events 2,159행 중
      // lead_id 가 채워진 행이 0이었고, 리드 참여 신호가 항상 빈손이었다(2026-08-05 실측).
      //
      // 응답을 막지 않게 뒤로 미룬다 — 리드 저장은 이미 끝났으므로 실패해도 경고만 남긴다.
      if (body.anonymousId) {
        const leadIdForStitch = savedLead.id
        const anonymousIdForStitch = body.anonymousId
        const stitchTask = async () => {
          try {
            const { stitchIdentity } = await import("@/lib/identity/stitch")
            const result = await stitchIdentity({
              anonymousId: anonymousIdForStitch,
              leadId: leadIdForStitch,
            })
            if (result.warnings.length) {
              console.warn("[lead-capture] identity stitch warnings:", result.warnings.join(" | "))
            }
          } catch (error) {
            console.warn("[lead-capture] identity stitch failed:", error)
          }
        }
        if (context.deferTask) context.deferTask(stitchTask)
        else void stitchTask()
      }
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

    if (stored) {
      void sendServerConversion({
        eventId: conversionEventId ?? `lead:${savedLeadId}`,
        metaEventName:
          body.source === "newsletter" ? "CompleteRegistration" : "Lead",
        ga4EventName: "generate_lead",
        requestMeta: context.requestMeta ?? null,
        sourceUrl: body.currentPage ?? body.landingPage ?? context.requestMeta?.sourceUrl,
        user: {
          email: body.email,
          phone: body.phone,
          externalId: savedLeadId,
          allowHashedUserData: body.marketingConsent === true,
        },
        customData: {
          lead_id: savedLeadId,
          source: body.source,
          source_detail: body.sourceDetail,
          lead_magnet: body.leadMagnet,
          event_slug: body.eventSlug,
        },
      }).catch((error) => {
        console.warn("[lead-capture] server conversion failed:", error)
      })

      const emitLeadCreatedNotification = async () => {
        await emitNotificationEvent({
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
            sourceDetail: body.sourceDetail,
            leadMagnet: body.leadMagnet,
            name: body.name,
            org: body.org,
            role: body.role,
            size: body.size,
            email: body.email,
            phone: body.phone,
            message: body.message,
            utmSource: body.utmSource,
            utmMedium: body.utmMedium,
            utmCampaign: body.utmCampaign,
            utmTerm: body.utmTerm,
            utmContent: body.utmContent,
            gclid: body.gclid,
            fbclid: body.fbclid,
            msclkid: body.msclkid,
            ttclid: body.ttclid,
            landingPage: body.landingPage,
            currentPage: body.currentPage,
            referrer: body.referrer,
          },
          // 개별 리드는 관리자 인앱에 즉시 남기되 WeCom은 10:10 일일 카드로 묶는다.
          channels: [],
        })
      }
      const emitLeadCreatedNotificationSafely = async () => {
        try {
          await emitLeadCreatedNotification()
        } catch (error) {
          console.error("[lead-capture] notification emit failed:", error)
        }
      }

      // 상위 플로우가 알림을 소유하면 건너뛴다 — 여기서 또 보내면 ops 방에 2건이 뜬다.
      if (!context.suppressLeadCreatedNotification) {
        if (context.deferTask) {
          context.deferTask(emitLeadCreatedNotificationSafely)
        } else {
          void emitLeadCreatedNotificationSafely()
        }
      }

      // 홈페이지 유입 자동 타임라인 이벤트 — 실패해도 리드 저장에 영향 없음(스펙 §D).
      //
      // 판정은 폼 출처(source) 하나로만 한다. 예전에는 광고 클릭 식별자가 있으면 건너뛰었는데,
      // 그러면 광고를 타고 들어와 홈페이지 폼을 채운 문의가 CRM 타임라인에 한 줄도 안 남았다.
      // 유료 트래픽이 대부분이라 사실상 홈페이지 문의 대부분이 사라지던 경로다(2026-09-01 실측).
      if (savedLeadId && isSiteFormLead(body.source)) {
        void createCrmCustomerEvent({
          targetType: "lead",
          targetId: savedLeadId,
          targetLabel: body.org || body.name || body.email || "홈페이지 리드",
          sourceType: "site_inflow",
          title: "홈페이지 상담 신청",
          summary: [SITE_INFLOW_SOURCE_LABELS[body.source] ?? body.source, body.currentPage ?? body.landingPage]
            .filter(Boolean)
            .join(" · "),
          occurredAt: new Date().toISOString(),
        }).catch((error) => {
          console.error("[lead-capture] site_inflow event insert failed:", error)
        })
      }
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

    if (!stored) {
      clearSubmission(submissionKey)
      return {
        status: 502,
        body: {
          ok: false,
          error: "상담 요청을 어드민에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          details: storageError ? [storageError, ...errors] : errors,
        },
      }
    }

    if (submissionKey) markSubmission(submissionKey, "accepted")

    return {
      status: 200,
      body: {
        ok: true,
        stored,
        leadId: savedLeadId,
        conversionEventId,
        warnings: [...(storageError ? [storageError] : []), ...errors],
      },
    }
  } catch (error) {
    clearSubmission(submissionKey)
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
    sourceDetail: data.sourceDetail,
    leadMagnet: data.leadMagnet,
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
          : data.source === "newsletter"
            ? ["newsletter", ...(data.leadMagnet ? ["lead_magnet", data.leadMagnet] : [])]
          : [],
      source: data.sourceDetail ?? data.source,
    })
  } catch (error) {
    console.error("[lead-capture] subscriber sync failed:", error)
    throw error
  }
}
