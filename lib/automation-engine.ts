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
      .select("email, name, org, role, source, tags, created_at")
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
   변수 치환
   ───────────────────────────────────────────────────────────── */

function personalizeBody(
  body: string,
  recipient: AutomationRecipient
): string {
  return body
    .replace(/\{name\}/g, recipient.name ?? "고객")
    .replace(/\{org\}/g, recipient.org ?? "")
    .replace(/\{role\}/g, recipient.role ?? "")
    .replace(/\{email\}/g, recipient.email)
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

    const personalizedRecipients = recipients.map((r) => ({
      email: r.email,
      name: r.name ?? "고객",
      personalizedBody: personalizeBody(rule.template!.body, r),
    }))

    const res = await fetch(emailWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: rule.template.subject,
        personalizedRecipients,
        unsubscribeBaseUrl: process.env.NEXT_PUBLIC_SITE_URL
          ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/newsletter/unsubscribe`
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
          const personalizedBody = personalizeBody(rule.template.body, recipient)

          const res = await fetch(emailWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: rule.template.subject,
              personalizedRecipients: [
                { email: recipient.email, name: recipient.name ?? "고객", personalizedBody },
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
