/**
 * ─────────────────────────────────────────────────────────────
 * automation-engine.ts  —  세그먼트 매칭 + 규칙 실행 엔진
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-AE1] 세그먼트 수신자 추출
 *   leads + newsletter_subscribers 두 테이블을 통합 조회.
 *   중복 이메일은 subscribers 데이터를 우선시하여 dedupe.
 *   leads 분기는 발송 동의 게이트(isLeadMarketingEligible)를 통과한 행만 넣는다 — 해지·동의 없음 제외.
 *
 * [NOTE-AE2] 규칙 실행 플로우
 *   1. 규칙 조회 (template 포함)
 *   2. 세그먼트 수신자 추출
 *   3. 이메일 본문 변수 치환 (per recipient)
 *   4. EMAIL_WEBHOOK_URL 호출
 *   5. automation_logs 기록
 *
 * [NOTE-AE3] on_submit 트리거
 *   /api/lead, /api/newsletter/subscribe 에서 호출.
 *   해당 제출 건이 각 active on_submit 규칙의 segment 조건에
 *   부합하면 즉시 발송.
 */

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  getActiveRulesByTrigger,
  getRuleById,
  createLog,
  updateLogStatus,
} from "@/lib/repositories/automation"
import {
  createDelayQueueItem,
} from "@/lib/repositories/automation-delay"
import { sendBatchEmail, wrapCampaignHtml } from "@/lib/email"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { createUnsubscribeUrl } from "@/lib/server/security-tokens"
import type {
  AutomationRule,
  AutomationRecipient,
  SegmentConfig,
  DelayTriggerConfig,
} from "@/lib/automation-types"

const sb = () => createSupabaseAdminClient()

/* ─────────────────────────────────────────────────────────────
   광고성 발송 동의 게이트 (leads 분기) — CT11, 2026-09-25
   ─────────────────────────────────────────────────────────────
   leads 행에는 동의 컬럼이 없다. 그래서 leads 분기는 구독 해지자도, 동의한 적 없는 리드도 그대로
   세그먼트 발송(executeRule — 수신거부 링크가 붙는 캠페인 메일) 대상에 다시 넣고 있었다.
   동의 근거 = newsletter_subscribers.status "active"(공개 폼에서 마케팅 동의 시 여기로 동기화된다)
   또는 user_profiles.marketing_consent = true. 구독 행이 하나라도 active가 아니면(해지) 제외한다 —
   해지가 로그인 프로필 동의보다 우선. 미결정·조회 실패는 거부로 취급한다(fail-closed).
   on_submit(접수 직후 안내)·delay 트리거는 이 함수를 거치지 않는다 — 정보성 접수 확인은 대상 아님. */

const CONSENT_PAGE_SIZE = 1000
const CONSENT_MAX_PAGES = 50

export interface LeadMarketingConsentIndex {
  /** 소문자 이메일 → 구독 상태. 같은 이메일(대소문자 무시) 행 중 하나라도 active가 아니면 "blocked". */
  subscriberStatusByEmail: Map<string, "active" | "blocked">
  /** user_profiles.marketing_consent = true 인 소문자 이메일 */
  profileConsentEmails: Set<string>
}

function consentEmailKey(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

/** 이 리드 이메일에 광고성 발송을 해도 되는가 — 해지면 false, 동의 근거가 없으면 false. */
export function isLeadMarketingEligible(email: string, index: LeadMarketingConsentIndex): boolean {
  const key = consentEmailKey(email)
  if (!key) return false
  const status = index.subscriberStatusByEmail.get(key)
  if (status === "blocked") return false
  return status === "active" || index.profileConsentEmails.has(key)
}

type ConsentPage = { data: unknown[] | null; error: { message: string } | null }

/** range 페이지네이션(실제 받은 행 수만큼 전진, 빈 페이지에서 종료). 상한 초과·오류는 던진다. */
async function readAllConsentRows(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<ConsentPage>
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (let page = 0; ; page += 1) {
    if (page >= CONSENT_MAX_PAGES) {
      throw new Error(`[automation] ${label} 조회가 ${CONSENT_MAX_PAGES}페이지를 넘었습니다 — 상한을 재검토하세요.`)
    }
    const { data, error } = await fetchPage(from, from + CONSENT_PAGE_SIZE - 1)
    if (error) throw new Error(`[automation] ${label} 조회 실패: ${error.message}`)
    const batch = (data ?? []) as Record<string, unknown>[]
    if (batch.length === 0) break
    rows.push(...batch)
    from += batch.length
  }
  return rows
}

export async function loadLeadMarketingConsentIndex(): Promise<LeadMarketingConsentIndex> {
  const [subscribers, profiles] = await Promise.all([
    readAllConsentRows("구독 상태", (from, to) =>
      sb()
        .from("newsletter_subscribers")
        .select("id, email, status")
        .order("id", { ascending: true })
        .range(from, to)
    ),
    readAllConsentRows("로그인 마케팅 동의", (from, to) =>
      sb()
        .from("user_profiles")
        .select("id, email")
        .eq("marketing_consent", true)
        .not("email", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ])

  const subscriberStatusByEmail = new Map<string, "active" | "blocked">()
  for (const row of subscribers) {
    const key = consentEmailKey(row.email as string | null)
    if (!key) continue
    if (row.status !== "active") subscriberStatusByEmail.set(key, "blocked")
    else if (!subscriberStatusByEmail.has(key)) subscriberStatusByEmail.set(key, "active")
  }

  const profileConsentEmails = new Set<string>()
  for (const row of profiles) {
    const key = consentEmailKey(row.email as string | null)
    if (key) profileConsentEmails.add(key)
  }

  return { subscriberStatusByEmail, profileConsentEmails }
}

/* ─────────────────────────────────────────────────────────────
   세그먼트 수신자 추출
   ───────────────────────────────────────────────────────────── */

export async function resolveSegmentRecipients(
  seg: SegmentConfig
): Promise<AutomationRecipient[]> {
  const targetTable = seg.targetTable ?? "both"
  const recipients: AutomationRecipient[] = []
  const seenEmails = new Set<string>()

  // ── newsletter_subscribers ──
  if (targetTable === "subscribers" || targetTable === "both") {
    let query = sb()
      .from("newsletter_subscribers")
      .select("email, name, org, role, phone, size, source, tags, created_at")
      .eq("status", "active")
      .not("email", "is", null)

    if (seg.tags && seg.tags.length > 0) {
      query = query.overlaps("tags", seg.tags)
    }

    if (seg.sources && seg.sources.length > 0) {
      query = query.in("source", seg.sources)
    }

    if (seg.daysSinceSubmit != null) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - seg.daysSinceSubmit)
      query = query.gte("created_at", cutoff.toISOString())
    }

    const { data } = await query
    for (const row of data ?? []) {
      if (!row.email) continue
      seenEmails.add(row.email.toLowerCase())
      recipients.push({
        email: row.email,
        name: row.name ?? undefined,
        org: (row as Record<string, unknown>).org as string | undefined,
        role: row.role ?? undefined,
        phone: (row as Record<string, unknown>).phone as string | undefined,
        size: (row as Record<string, unknown>).size as string | undefined,
        source: row.source,
      })
    }
  }

  // ── leads ──
  if (targetTable === "leads" || targetTable === "both") {
    let query = sb()
      .from("leads")
      .select("email, name, org, role, source, status, created_at")
      .not("email", "is", null)

    if (seg.sources && seg.sources.length > 0) {
      query = query.in("source", seg.sources)
    }

    if (seg.leadStatuses && seg.leadStatuses.length > 0) {
      query = query.in("status", seg.leadStatuses)
    }

    if (seg.daysSinceSubmit != null) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - seg.daysSinceSubmit)
      query = query.gte("created_at", cutoff.toISOString())
    }

    const { data } = await query
    const leadRows = (data ?? []).filter((row) => Boolean(row.email))

    // 동의 게이트 — 조회 실패면 leads 분기 전체를 뺀다(미결정 consent = 거부).
    let consent: LeadMarketingConsentIndex | null = null
    if (leadRows.length > 0) {
      try {
        consent = await loadLeadMarketingConsentIndex()
      } catch (err) {
        console.error("[automation] 발송 동의 근거 조회 실패 — leads 분기를 발송 대상에서 제외합니다:", err)
      }
    }

    for (const row of leadRows) {
      if (!row.email) continue
      if (!consent || !isLeadMarketingEligible(row.email, consent)) continue
      // 중복 이메일은 subscribers 우선
      if (seenEmails.has(row.email.toLowerCase())) continue
      seenEmails.add(row.email.toLowerCase())
      recipients.push({
        email: row.email,
        name: row.name ?? undefined,
        org: row.org ?? undefined,
        role: row.role ?? undefined,
        source: row.source,
      })
    }
  }

  return recipients
}

/* ─────────────────────────────────────────────────────────────
   단일 수신자 매칭 (on_submit 트리거용)
   ───────────────────────────────────────────────────────────── */

export function matchesSegment(
  recipient: AutomationRecipient,
  seg: SegmentConfig
): boolean {
  if (seg.sources && seg.sources.length > 0) {
    if (!seg.sources.includes(recipient.source as
        | "demo_modal"
        | "contact_page"
        | "showroom_booking"
        | "checkout_request"
        | "newsletter"
        | "manual"
        | "meta_lead_ads")) {
      return false
    }
  }
  if (seg.hasEmail && !recipient.email) return false
  return true
}

/* ─────────────────────────────────────────────────────────────
   AI 블록 확장 — {ai: 프롬프트} → 수신자별 AI 생성 텍스트
   ───────────────────────────────────────────────────────────── */

async function callAiBlock(
  prompt: string,
  recipient: AutomationRecipient
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return `[AI 블록 오류: GEMINI_API_KEY 없음]`

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai")
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" })

    const systemPrompt = `
당신은 학원 관리 소프트웨어 클래스인의 마케팅 담당자입니다.
아래 수신자 정보를 바탕으로 요청된 내용을 작성해주세요.

수신자 정보:
- 이름: ${recipient.name || "알 수 없음"}
- 학원명: ${recipient.org || "알 수 없음"}
- 직책: ${recipient.role || "알 수 없음"}
- 학원 규모: ${recipient.size || "알 수 없음"}

요청: ${prompt}

규칙:
- 한국어로 작성
- 수신자의 상황을 자연스럽게 반영
- 1~3문장으로 간결하게
- HTML 태그 없이 순수 텍스트
`.trim()

    const result = await model.generateContent(systemPrompt)
    return result.response.text().trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI 오류"
    return `[AI 블록 오류: ${msg}]`
  }
}

/** 템플릿 텍스트에서 {ai: 프롬프트} 블록을 수신자별로 AI 생성 텍스트로 교체 */
async function expandAiBlocks(
  text: string,
  recipient: AutomationRecipient
): Promise<string> {
  const regex = /\{ai:\s*([^}]+)\}/g
  const matches = [...text.matchAll(regex)]
  if (matches.length === 0) return text

  const results = await Promise.allSettled(
    matches.map(async (match) => ({
      original: match[0],
      expanded: await callAiBlock(match[1].trim(), recipient),
    }))
  )

  let result = text
  for (const r of results) {
    if (r.status === "fulfilled") {
      result = result.replace(r.value.original, r.value.expanded)
    }
  }
  return result
}

/* ─────────────────────────────────────────────────────────────
   변수 치환
   ───────────────────────────────────────────────────────────── */

interface PersonalizeOpts {
  sendDate?: string
  unsubscribeUrl?: string
}

function personalizeBody(
  body: string,
  recipient: AutomationRecipient,
  opts: PersonalizeOpts = {}
): string {
  const today = opts.sendDate ??
    new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
  return body
    .replace(/\{name\}/g, recipient.name ?? "고객")
    .replace(/\{org\}/g, recipient.org ?? "")
    .replace(/\{role\}/g, recipient.role ?? "")
    .replace(/\{email\}/g, recipient.email)
    .replace(/\{phone\}/g, recipient.phone ?? "")
    .replace(/\{academy_size\}/g, recipient.size ?? "")
    .replace(/\{date\}/g, today)
    .replace(/\{unsubscribe_url\}/g, opts.unsubscribeUrl ?? "")
}

/* ─────────────────────────────────────────────────────────────
   규칙 실행 (이메일 발송 + 로그)
   ───────────────────────────────────────────────────────────── */

export async function executeRule(ruleId: string): Promise<{
  logId: string
  recipientCount: number
  status: "sent" | "failed"
}> {
  const rule = await getRuleById(ruleId)
  if (!rule || !rule.template) {
    throw new Error(`[automation] 규칙 또는 템플릿 없음: ${ruleId}`)
  }

  const log = await createLog({ ruleId, status: "pending" })

  try {
    const recipients = await resolveSegmentRecipients(rule.segmentConfig)

    if (recipients.length === 0) {
      await updateLogStatus(log.id, "sent", { recipientCount: 0, recipientEmails: [] })
      return { logId: log.id, recipientCount: 0, status: "sent" }
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    const sendDate = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })

    const emailPayloads = await Promise.all(
      recipients.map(async (r) => {
        const unsubscribeUrl = baseUrl ? createUnsubscribeUrl(baseUrl, r.email) : undefined
        const opts: PersonalizeOpts = { sendDate, unsubscribeUrl }
        const expandedBody    = await expandAiBlocks(rule.template!.body, r)
        const expandedSubject = await expandAiBlocks(rule.template!.subject, r)
        const trackingUrl = baseUrl
          ? `${baseUrl}/api/track/open?cid=${log.id}`
          : undefined
        return {
          to: r.email,
          subject: personalizeBody(expandedSubject, r, opts),
          html: wrapCampaignHtml(personalizeBody(expandedBody, r, opts), unsubscribeUrl, trackingUrl),
        }
      })
    )

    const result = await sendBatchEmail(emailPayloads)

    if (result.failed > 0 && result.sent === 0) {
      throw new Error(`이메일 전체 실패 (${result.provider}): ${result.errors?.join(", ")}`)
    }

    const emails = recipients.map((r) => r.email)
    await updateLogStatus(log.id, "sent", {
      recipientCount: result.sent,
      recipientEmails: emails,
    })

    return { logId: log.id, recipientCount: recipients.length, status: "sent" }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updateLogStatus(log.id, "failed", { errorMessage: message })
    return { logId: log.id, recipientCount: 0, status: "failed" }
  }
}

/* ─────────────────────────────────────────────────────────────
   delay 큐 항목 실행 — cron 에서 단일 수신자 발송 시 호출
   ───────────────────────────────────────────────────────────── */

/**
 * delay 큐의 단일 항목을 처리한다.
 * 규칙과 템플릿을 로드하고, 수신자 데이터로 개인화 후 이메일을 발송한다.
 * cron 핸들러가 updateDelayItemStatus 를 직접 관리하므로 이 함수는 순수하게 발송만 담당.
 */
export async function executeDelayQueueItem(
  ruleId: string,
  recipient: AutomationRecipient
): Promise<void> {
  const rule = await getRuleById(ruleId)
  if (!rule || !rule.template) {
    throw new Error(`[automation] delay 큐 실행 오류: 규칙 또는 템플릿 없음 (ruleId=${ruleId})`)
  }

  // executeRule 과 동일한 automation_logs 기록 패턴 — delay 발송도 감사 로그를 남긴다.
  const log = await createLog({ ruleId, status: "pending" })

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    const unsubscribeUrl = baseUrl ? createUnsubscribeUrl(baseUrl, recipient.email) : undefined
    const sendDate = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    const opts: PersonalizeOpts = { sendDate, unsubscribeUrl }

    const expandedBody    = await expandAiBlocks(rule.template.body, recipient)
    const expandedSubject = await expandAiBlocks(rule.template.subject, recipient)
    const personalizedBody    = personalizeBody(expandedBody, recipient, opts)
    const personalizedSubject = personalizeBody(expandedSubject, recipient, opts)

    const result = await sendBatchEmail([{
      to: recipient.email,
      subject: personalizedSubject,
      html: wrapCampaignHtml(personalizedBody, unsubscribeUrl),
    }])

    if (result.failed > 0) {
      throw new Error(`[automation] delay 큐 이메일 발송 실패 (${result.provider})`)
    }

    await updateLogStatus(log.id, "sent", {
      recipientCount: 1,
      recipientEmails: [recipient.email],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updateLogStatus(log.id, "failed", { errorMessage: message })
    // cron 핸들러가 큐 상태를 관리하므로 실패는 그대로 전파한다.
    throw err
  }
}

/* ─────────────────────────────────────────────────────────────
   on_submit 트리거 — /api/lead, /api/newsletter/subscribe 에서 호출
   ───────────────────────────────────────────────────────────── */

interface OnSubmitPayload {
  email?: string
  name?: string
  org?: string
  role?: string
  source: string
}

export async function triggerOnSubmitRules(payload: OnSubmitPayload): Promise<void> {
  if (!payload.email) return

  try {
    const recipient: AutomationRecipient = {
      email: payload.email,
      name: payload.name,
      org: payload.org,
      role: payload.role,
      source: payload.source,
    }

    // ── on_submit 규칙: 즉시 발송 ─────────────────────────────
    const onSubmitRules = await getActiveRulesByTrigger("on_submit")
    const matchingOnSubmit = onSubmitRules.filter((rule: AutomationRule) =>
      matchesSegment(recipient, rule.segmentConfig)
    )

    if (matchingOnSubmit.length > 0) {
      await Promise.allSettled(
        matchingOnSubmit.map(async (rule: AutomationRule) => {
          if (!rule.template) return

          const log = await createLog({ ruleId: rule.id, status: "pending" })

          try {
            const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
            const unsubscribeUrl = baseUrl
              ? createUnsubscribeUrl(baseUrl, recipient.email)
              : undefined
            const sendDate = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
            const opts: PersonalizeOpts = { sendDate, unsubscribeUrl }
            const expandedBody    = await expandAiBlocks(rule.template.body, recipient)
            const expandedSubject = await expandAiBlocks(rule.template.subject, recipient)
            const personalizedBody    = personalizeBody(expandedBody, recipient, opts)
            const personalizedSubject = personalizeBody(expandedSubject, recipient, opts)
            const trackingUrl = baseUrl
              ? `${baseUrl}/api/track/open?cid=${log.id}`
              : undefined

            const result = await sendBatchEmail([{
              to: recipient.email,
              subject: personalizedSubject,
              html: wrapCampaignHtml(personalizedBody, unsubscribeUrl, trackingUrl),
            }])

            if (result.failed > 0) throw new Error(`발송 실패 (${result.provider})`)

            await updateLogStatus(log.id, "sent", {
              recipientCount: 1,
              recipientEmails: [recipient.email],
            })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            await updateLogStatus(log.id, "failed", { errorMessage: message })
          }
        })
      )
    }

    // ── delay 규칙: 큐에 예약 삽입 ───────────────────────────
    const delayRules = await getActiveRulesByTrigger("delay")
    const matchingDelay = delayRules.filter((rule: AutomationRule) =>
      matchesSegment(recipient, rule.segmentConfig)
    )

    if (matchingDelay.length > 0) {
      await Promise.allSettled(
        matchingDelay.map(async (rule: AutomationRule) => {
          try {
            const config = rule.triggerConfig as DelayTriggerConfig
            const scheduledAt = new Date(Date.now() + config.hours * 3_600_000)

            await createDelayQueueItem({
              ruleId: rule.id,
              recipientEmail: recipient.email,
              recipientName: recipient.name,
              recipientData: recipient,
              scheduledAt,
            })

            console.log(
              `[triggerOnSubmitRules] delay 큐 추가 — rule=${rule.id}, ` +
              `email=${recipient.email}, scheduledAt=${scheduledAt.toISOString()}`
            )
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(
              `[triggerOnSubmitRules] delay 큐 삽입 실패 (rule=${rule.id}):`,
              err
            )
            // 무음 실패 방지: 예약 발송이 큐에 들어가지 못하면 자동화가 조용히 누락된다.
            await emitNotificationEvent({
              eventType: "automation.delay_enqueue_failed",
              notificationType: "incident",
              categoryTag: "marketing",
              severity: "warning",
              title: "자동화 예약 발송 큐 삽입 실패",
              message: `규칙 '${rule.name}'의 예약 발송을 큐에 넣지 못했습니다: ${message}`,
              source: "automation",
              sourceId: rule.id,
              payload: { ruleId: rule.id, recipientEmail: recipient.email, error: message },
            }).catch((notifyErr) => {
              console.error("[triggerOnSubmitRules] 알림 발행 실패:", notifyErr)
            })
          }
        })
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[triggerOnSubmitRules] 오류:", err)
    // 무음 실패 방지: on_submit 자동화 경로 전체가 죽으면 리드 후속 발송이 통째로 누락된다.
    await emitNotificationEvent({
      eventType: "automation.on_submit_failed",
      notificationType: "incident",
      categoryTag: "marketing",
      severity: "critical",
      title: "on_submit 자동화 실행 실패",
      message: `리드 제출 자동화 트리거가 실패했습니다 (source=${payload.source}): ${message}`,
      source: "automation",
      payload: { source: payload.source, email: payload.email, error: message },
    }).catch((notifyErr) => {
      console.error("[triggerOnSubmitRules] 알림 발행 실패:", notifyErr)
    })
  }
}
