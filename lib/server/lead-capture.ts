import "server-only"

import { triggerOnSubmitRules } from "@/lib/automation-engine"
import { isSiteFormLead } from "@/lib/crm/capture/origin"
import { RESPONSE_TARGET_SOURCES } from "@/lib/crm/lead-attribution"
import type { LeadPayload, LeadSource } from "@/lib/lead-types"
import {
  type MarketingRequestMeta,
  sendServerConversion,
} from "@/lib/marketing/server-conversions"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { createCrmCustomerEvent } from "@/lib/repositories/crm-events"
import {
  findLeadsByContacts,
  saveLead,
  touchLeadInflow,
  updateLead,
  type LeadRecord,
} from "@/lib/repositories/leads"
import { upsertSubscriber } from "@/lib/repositories/marketing"
import { getResolvedSettings } from "@/lib/repositories/settings"
import { postJson } from "@/lib/server/post-json"
import { isWebhookEnabled } from "@/lib/webhook-settings"
import { parseEventToken, setEventToken } from "@/lib/types/event-metrics"

const VALID_SOURCES = new Set<LeadSource>([
  "demo_modal",
  "contact_page",
  "showroom_booking",
  "checkout_request",
  "newsletter",
  "meta_lead_ads",
])
// site_inflow 타임라인 이벤트 summary에 쓰는 유입 경로 한글 라벨.
const SITE_INFLOW_SOURCE_LABELS = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  showroom_booking: "쇼룸 예약",
  checkout_request: "도입 신청",
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
  /** 같은 연락처의 재문의를 새 리드 대신 기존 리드에 합쳤을 때 true(재유입 병합, §submitLeadCapture). */
  merged?: boolean
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

  // 접수 두 갈래는 서버 내부 미러라 이미 각자의 normalize 를 통과했지만, 계약을 여기에도
  // 적어 둔다 — 이 경로로 들어오는 값은 담당자가 연락할 수 있어야 한다.
  if (
    (payload.source === "showroom_booking" || payload.source === "checkout_request") &&
    !hasRequiredFields(payload, ["org", "name", "phone"])
  ) {
    throw new Error("접수에 필요한 연락 정보가 없습니다.")
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

type ReinflowCandidate = Pick<
  LeadRecord,
  "id" | "phone" | "email" | "status" | "timestamp" | "last_inflow_at" | "notes"
>

const MERGEABLE_LEAD_STATUSES = new Set<LeadRecord["status"]>(["new", "contacted"])

/**
 * 재유입 병합 대상 선정 — new/contacted만 후보로 본다. converted/closed는 이미 끝난 딜이라
 * 병합하지 않고 새 리드로 쌓는다("다시 온 고객"과 "이미 끝난 건"을 섞지 않기 위해서다).
 * 후보가 여럿이면 가장 최근(timestamp 내림차순) 1건만 합친다.
 */
function pickReinflowTarget(candidates: ReinflowCandidate[]): ReinflowCandidate | null {
  const mergeable = candidates.filter((lead) => MERGEABLE_LEAD_STATUSES.has(lead.status))
  if (mergeable.length === 0) return null
  return mergeable.reduce((latest, lead) =>
    new Date(lead.timestamp).getTime() > new Date(latest.timestamp).getTime() ? lead : latest
  )
}

// 재유입 병합 이벤트의 본문 — 새 제출이 가져온 값을 "라벨: 값" 줄로 정리한다. 기존 리드의
// notes/assigned_to 등은 건드리지 않으므로(§submitLeadCapture 재유입 병합 분기) 여기 담지 않는다.
function buildReinflowEventBody(body: LeadPayload): string {
  return [
    body.message ? `문의 내용: ${body.message}` : undefined,
    body.org ? `학원/기관: ${body.org}` : undefined,
    body.role ? `역할: ${body.role}` : undefined,
    body.size ? `규모: ${body.size}` : undefined,
    body.leadMagnet ? `리드마그넷: ${body.leadMagnet}` : undefined,
    body.utmSource ? `UTM 소스: ${body.utmSource}` : undefined,
    body.utmMedium ? `UTM 매체: ${body.utmMedium}` : undefined,
    body.utmCampaign ? `UTM 캠페인: ${body.utmCampaign}` : undefined,
    body.utmTerm ? `UTM 키워드: ${body.utmTerm}` : undefined,
    body.utmContent ? `UTM 콘텐츠: ${body.utmContent}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
}

/**
 * 제출 전에 쌓인 익명 활동을 리드로 귀속한다(신원 스티칭). 신규 저장·재유입 병합 두 경로가
 * 모두 부르므로 leadId만 갈아끼워 재사용한다. 응답을 막지 않게 뒤로 미룬다 — 실패해도
 * 경고만 남긴다.
 */
function scheduleIdentityStitch(leadId: string, anonymousId: string, context: LeadCaptureContext) {
  const stitchTask = async () => {
    try {
      const { stitchIdentity } = await import("@/lib/identity/stitch")
      const result = await stitchIdentity({ anonymousId, leadId })
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
    // 같은 연락처의 재문의를 새 리드 대신 기존 리드에 합쳤는지 — 응답 body와 알림 제목이 본다.
    let merged = false

    const notes = body.eventSlug ? setEventToken("", body.eventSlug) : undefined

    // 재유입 병합 후보 조회 — Compass 웹훅의 "재유입" 분기(같은 연락처가 다시 오면 새 리드
    // 대신 last_inflow_at만 갱신하고 activities에 inflow 이력을 남긴다. Compass 저장소
    // app/api/webhook/meta/route.ts)를 공개 제출 경로에도 이식한다.
    // 대상은 응대가 필요한 소스(RESPONSE_TARGET_SOURCES = demo_modal/contact_page/
    // meta_lead_ads)로 좁힌다 — 뉴스레터 재구독·자료 재다운로드처럼 같은 연락처 재제출이
    // 정상 동작인 소스까지 합치면 서로 다른 제출(예: 리드마그넷 A/B)이 하나로 뭉개진다
    // (아래 "different lead-magnet submissions" 기존 테스트가 이 경계를 고정한다).
    // 조회 자체가 실패해도 warn만 남기고 신규 저장으로 계속 진행한다 — 공개 홈페이지 폼이
    // 쓰는 경로라 어떤 경우에도 예외로 저장이 막히면 안 된다. 여기서 왕복 2회(전화/이메일
    // 병렬 조회, findLeadsByContacts 내부)만 추가되고 그 외 추가 조회는 없다.
    let reinflowTarget: ReinflowCandidate | null = null
    if ((body.phone || body.email) && RESPONSE_TARGET_SOURCES.has(body.source)) {
      try {
        const candidates = await findLeadsByContacts({
          phones: body.phone ? [body.phone] : [],
          emails: body.email ? [body.email] : [],
        })
        reinflowTarget = pickReinflowTarget(candidates)
      } catch (error) {
        console.warn("[lead-capture] reinflow candidate lookup failed:", error)
      }
      // 행사 신청(eventSlug)은 notes 첫 줄의 [event:slug] 토큰 하나로 행사별 신청 수를 센다
      // (lib/events/attribution.ts). 기존 리드가 이미 다른 행사 토큰을 갖고 있으면 병합하지
      // 않고 예전처럼 새 행을 만든다 — 토큰은 한 개뿐이라 덮어쓰면 이전 행사의 신청 집계가 사라진다.
      if (reinflowTarget && body.eventSlug) {
        const existingToken = parseEventToken(reinflowTarget.notes).token
        if (existingToken && existingToken !== body.eventSlug) reinflowTarget = null
      }
    }

    if (reinflowTarget) {
      // 새 리드 행을 만들지 않고 기존 리드에 합친다 — status/assigned_to/follow_up_at/notes는
      // 절대 건드리지 않는다(touchLeadInflow는 last_inflow_at만 갱신한다. Compass도 재유입
      // 시 coalesce로만 채우고 담당·단계는 그대로 둔다). last_inflow_at이 실제로 생성
      // 시각보다 뒤로 갱신되는 순간부터 lib/crm/lead-reinflow.ts의 inflow_stamp 근거
      // (백필 오차 허용치를 넘겨 유의미하게 뒤인 last_inflow_at)가 이 저장 경로에서 처음으로
      // 참이 된다 — 지금까지는 저장 경로가 항상 새 행을 만들어 그 조건이 구조적으로 거짓이었다.
      const mergedAt = new Date().toISOString()
      const existingId = reinflowTarget.id
      savedLeadId = existingId
      // 재문의도 광고 성과상 별개의 전환 이벤트다 — 병합 전에는 새 행마다 새 id 였으므로 그 계산을
      // 유지한다. 원래 id 를 재사용하면 브라우저 픽셀과의 dedup 창 안에서 재문의가 묶여 사라진다.
      conversionEventId = `lead:${existingId}:reinflow:${mergedAt}`
      stored = true
      merged = true

      try {
        await touchLeadInflow(existingId, mergedAt)
      } catch (error) {
        // 실패해도 병합 결정을 되돌리지 않는다 — last_inflow_at 스탬프가 이번엔 안 찍혀도
        // 리드를 새로 두 배 쌓는 것보다 낫다(리드는 이미 DB에 존재한다).
        console.warn("[lead-capture] touchLeadInflow failed:", error)
      }

      // 행사 신청이면 기존 리드에 행사 토큰을 새긴다(토큰이 없던 리드만 — 다른 행사 토큰이 있는
      // 리드는 위에서 병합 대상에서 뺐다). notes 는 이 토큰 줄 외에는 건드리지 않는다.
      if (body.eventSlug && parseEventToken(reinflowTarget.notes).token !== body.eventSlug) {
        try {
          await updateLead(existingId, {
            notes: setEventToken(reinflowTarget.notes ?? "", body.eventSlug),
          })
        } catch (error) {
          console.warn("[lead-capture] reinflow event token update failed:", error)
        }
      }

      void createCrmCustomerEvent({
        targetType: "lead",
        targetId: existingId,
        targetLabel: body.org || body.name || body.email || "홈페이지 리드",
        sourceType: "site_inflow",
        title: "재문의(재유입)",
        summary: [SITE_INFLOW_SOURCE_LABELS[body.source] ?? body.source, body.currentPage ?? body.landingPage]
          .filter(Boolean)
          .join(" · "),
        body: buildReinflowEventBody(body),
        occurredAt: mergedAt,
      }).catch((error) => {
        console.error("[lead-capture] reinflow site_inflow event insert failed:", error)
      })

      // 제출 전에 쌓인 익명 활동을 이 리드로 귀속한다 — 신규 저장과 동일 경로(scheduleIdentityStitch).
      if (body.anonymousId) scheduleIdentityStitch(existingId, body.anonymousId, context)
    } else {
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
        if (body.anonymousId) scheduleIdentityStitch(savedLead.id, body.anonymousId, context)
      } catch (error) {
        console.error("[lead-capture] saveLead error:", error)
        storageError = "Failed to store the lead record."
      }
    }

    const deliveryTasks: Promise<void>[] = []

    if (settings.googleSheetWebhookUrl && isWebhookEnabled(settings.webhookEnabled, "googleSheetWebhookUrl")) {
      deliveryTasks.push(sendToGoogleSheet(body, settings.googleSheetWebhookUrl))
    }

    if (settings.leadWebhookUrl && isWebhookEnabled(settings.webhookEnabled, "leadWebhookUrl")) {
      deliveryTasks.push(sendToWebhook(body, settings.leadWebhookUrl))
    }

    if (settings.channelTalkWebhookUrl && isWebhookEnabled(settings.webhookEnabled, "channelTalkWebhookUrl")) {
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
          // 재유입 병합이면 "이건 새 문의가 아니라 재문의다"를 관리자가 제목만 보고 알 수 있게 접두어를 붙인다.
          title: (merged ? "재문의 · " : "") + buildLeadNotificationTitle(body),
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
      //
      // 재유입 병합 시에는 위에서 이미 "재문의(재유입)" site_inflow 이벤트를 남겼다 — 여기서
      // 또 만들면 같은 제출에 site_inflow 이벤트가 두 번(신규용 문구 + 재유입용 문구) 남으므로
      // merged면 건너뛴다.
      if (savedLeadId && !merged && isSiteFormLead(body.source)) {
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
        merged,
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
