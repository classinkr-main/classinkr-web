/**
 * ─────────────────────────────────────────────────────────────
 * automation-engine.ts  —  세그먼트 매칭 + 규칙 실행 엔진
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-AE1] 세그먼트 수신자 추출
 *   leads + newsletter_subscribers 두 테이블을 통합 조회.
 *   중복 이메일은 subscribers 데이터를 우선시하여 dedupe.
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
import type {
  AutomationRule,
  AutomationRecipient,
  SegmentConfig,
} from "@/lib/automation-types"

const sb = () => createSupabaseAdminClient()

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
    for (const row of data ?? []) {
      if (!row.email) continue
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
    if (!seg.sources.includes(recipient.source as "demo_modal" | "contact_page" | "newsletter" | "manual")) {
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

    const emailWebhookUrl = process.env.EMAIL_WEBHOOK_URL
    if (!emailWebhookUrl) throw new Error("EMAIL_WEBHOOK_URL 환경변수 없음")

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    const sendDate = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })

    const personalizedRecipients = await Promise.all(
      recipients.map(async (r) => {
        const unsubscribeUrl = baseUrl
          ? `${baseUrl}/api/newsletter/unsubscribe?email=${encodeURIComponent(r.email)}`
          : ""
        const opts: PersonalizeOpts = { sendDate, unsubscribeUrl }
        // AI 블록 먼저 확장, 그 다음 변수 치환
        const expandedBody    = await expandAiBlocks(rule.template!.body, r)
        const expandedSubject = await expandAiBlocks(rule.template!.subject, r)
        return {
          email: r.email,
          name: r.name ?? "고객",
          personalizedSubject: personalizeBody(expandedSubject, r, opts),
          personalizedBody:    personalizeBody(expandedBody, r, opts),
        }
      })
    )

    const res = await fetch(emailWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: rule.template.subject,
        personalizedRecipients,
        unsubscribeBaseUrl: baseUrl
          ? `${baseUrl}/api/newsletter/unsubscribe`
          : undefined,
        automationRuleId: ruleId,
        automationRuleName: rule.name,
      }),
    })

    if (!res.ok) throw new Error(`이메일 웹훅 응답 오류: ${res.status}`)

    const emails = recipients.map((r) => r.email)
    await updateLogStatus(log.id, "sent", {
      recipientCount: recipients.length,
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
   on_submit 트리거 — /api/lead, /api/newsletter/subscribe 에서 호출
   ───────────────────────────────────────────────────────────── */

interface OnSubmitPayload {
  email?: string
  name?: string
  org?: string
  role?: string
  source: "demo_modal" | "contact_page" | "newsletter" | "manual"
}

export async function triggerOnSubmitRules(payload: OnSubmitPayload): Promise<void> {
  if (!payload.email) return

  try {
    const activeRules = await getActiveRulesByTrigger("on_submit")
    if (activeRules.length === 0) return

    const recipient: AutomationRecipient = {
      email: payload.email,
      name: payload.name,
      org: payload.org,
      role: payload.role,
      source: payload.source,
    }

    const matchingRules = activeRules.filter((rule: AutomationRule) =>
      matchesSegment(recipient, rule.segmentConfig)
    )

    if (matchingRules.length === 0) return

    const emailWebhookUrl = process.env.EMAIL_WEBHOOK_URL
    if (!emailWebhookUrl) return

    await Promise.allSettled(
      matchingRules.map(async (rule: AutomationRule) => {
        if (!rule.template) return

        const log = await createLog({ ruleId: rule.id, status: "pending" })

        try {
          const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
          const unsubscribeUrl = baseUrl
            ? `${baseUrl}/api/newsletter/unsubscribe?email=${encodeURIComponent(recipient.email)}`
            : ""
          const sendDate = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
          const opts: PersonalizeOpts = { sendDate, unsubscribeUrl }
          const expandedBody    = await expandAiBlocks(rule.template.body, recipient)
          const expandedSubject = await expandAiBlocks(rule.template.subject, recipient)
          const personalizedBody    = personalizeBody(expandedBody, recipient, opts)
          const personalizedSubject = personalizeBody(expandedSubject, recipient, opts)

          const res = await fetch(emailWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: personalizedSubject,
              personalizedRecipients: [
                { email: recipient.email, name: recipient.name ?? "고객", personalizedSubject, personalizedBody },
              ],
              unsubscribeBaseUrl: process.env.NEXT_PUBLIC_SITE_URL
                ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/newsletter/unsubscribe`
                : undefined,
              automationRuleId: rule.id,
              automationRuleName: rule.name,
            }),
          })

          if (!res.ok) throw new Error(`웹훅 응답 오류: ${res.status}`)

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
  } catch (err) {
    console.error("[triggerOnSubmitRules] 오류:", err)
  }
}
