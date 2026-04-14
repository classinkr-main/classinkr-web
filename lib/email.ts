/**
 * ─────────────────────────────────────────────────────────────
 * email.ts — 통합 이메일 발송 엔진
 * ─────────────────────────────────────────────────────────────
 *
 * [아키텍처]
 *   Resend (1순위) : 캠페인·자동화·뉴스레터 — 배치 발송, 열람 추적
 *   Gmail  (2순위) : 내부 알림·관리자 다이제스트 — @classin.com 발신
 *   Webhook(폴백)  : 레거시 호환, 외부 서비스 연동 시 사용
 *
 * [사용법]
 *   import { sendEmail, sendBatchEmail, sendInternalNotification } from "@/lib/email"
 *
 *   // 단건
 *   await sendEmail({ to: "a@b.com", subject: "제목", html: "<p>본문</p>" })
 *
 *   // 배치 (캠페인)
 *   await sendBatchEmail([
 *     { to: "a@b.com", subject: "제목", html: "<p>A님 본문</p>" },
 *     { to: "b@c.com", subject: "제목", html: "<p>B님 본문</p>" },
 *   ])
 *
 *   // 내부 알림 (Gmail 우선)
 *   await sendInternalNotification({
 *     to: ["admin@classin.com"],
 *     subject: "[알림] 신규 리드",
 *     html: "<p>내용</p>",
 *   })
 */

import "server-only"

import { resend } from "@/lib/resend"

/* ── 타입 ───────────────────────────────────────────────────── */

export type EmailProvider = "resend" | "gmail" | "webhook" | "simulation"

export interface SingleEmail {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string
}

export interface SendResult {
  provider: EmailProvider
  sent: number
  failed: number
  errors?: string[]
}

/* ── 설정 ───────────────────────────────────────────────────── */

const RESEND_FROM = process.env.RESEND_FROM ?? "ClassIn <noreply@classin.ai.kr>"
const GMAIL_FROM = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""
const RESEND_BATCH_SIZE = 100

/* ── HTML 래퍼 (캠페인용) ────────────────────────────────────── */

export function wrapCampaignHtml(body: string, unsubscribeUrl?: string, trackingPixelUrl?: string): string {
  const footer = unsubscribeUrl
    ? `<p style="margin:8px 0 0">
         더 이상 이메일을 받고 싶지 않으시면
         <a href="${unsubscribeUrl}" style="color:#084734;text-decoration:underline">수신거부</a>를
         클릭해주세요.
       </p>`
    : ""

  const trackingPixel = trackingPixelUrl
    ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display:block;border:0" alt="" />`
    : ""

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f4;font-family:-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px">
    <div style="background:#ffffff;border-radius:12px;padding:32px 28px;border:1px solid rgba(0,0,0,0.08)">
      ${body}
    </div>
    <div style="text-align:center;padding:24px 0;color:#a39e98;font-size:12px;line-height:1.6">
      <p style="margin:0">ClassIn Korea · classin.co.kr</p>
      ${footer}
    </div>
  </div>
  ${trackingPixel}
</body>
</html>`
}

/* ── 알림 메일 래퍼 ───────────────────────────────────────────── */

export function wrapNotificationHtml(title: string, body: string, routeUrl?: string): string {
  const cta = routeUrl
    ? `<a href="${routeUrl}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#084734;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">확인하기</a>`
    : ""

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f4;font-family:-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="background:#ffffff;border-radius:12px;padding:28px 24px;border:1px solid rgba(0,0,0,0.08)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
        <div style="width:8px;height:8px;border-radius:50%;background:#084734"></div>
        <span style="font-size:12px;font-weight:600;color:#084734;text-transform:uppercase;letter-spacing:0.5px">ClassIn 알림</span>
      </div>
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#111110">${title}</h2>
      <div style="font-size:14px;color:#615D59;line-height:1.6">${body}</div>
      ${cta}
    </div>
    <div style="text-align:center;padding:20px 0;color:#a39e98;font-size:11px">
      ClassIn Korea · 자동 발송 알림
    </div>
  </div>
</body>
</html>`
}


/* ═════════════════════════════════════════════════════════════
   Provider: Resend
   ═════════════════════════════════════════════════════════════ */

async function sendViaResend(emails: SingleEmail[]): Promise<SendResult> {
  if (!resend) throw new Error("RESEND_API_KEY 미설정")

  let sent = 0
  let failed = 0
  const errors: string[] = []

  // 배치 분할 (최대 100건)
  for (let i = 0; i < emails.length; i += RESEND_BATCH_SIZE) {
    const batch = emails.slice(i, i + RESEND_BATCH_SIZE)

    const payload = batch.map((e) => ({
      from: e.from ?? RESEND_FROM,
      to: [e.to],
      subject: e.subject,
      html: e.html,
      ...(e.replyTo ? { reply_to: e.replyTo } : {}),
    }))

    try {
      const result = await resend.batch.send(payload)
      if (result.error) {
        errors.push(`batch[${i}]: ${result.error.message}`)
        failed += batch.length
      } else {
        sent += batch.length
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`batch[${i}]: ${msg}`)
      failed += batch.length
    }
  }

  return { provider: "resend", sent, failed, errors: errors.length ? errors : undefined }
}


/* ═════════════════════════════════════════════════════════════
   Provider: Gmail (서비스 계정)
   ═════════════════════════════════════════════════════════════ */

async function sendViaGmail(emails: SingleEmail[]): Promise<SendResult> {
  // 동적 import — googleapis가 없는 환경에서도 다른 provider는 사용 가능
  const { gmail } = await import("@/lib/google")

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const e of emails) {
    const from = e.from ?? GMAIL_FROM
    try {
      const raw = buildGmailRaw(from, e.to, e.subject, e.html)
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      })
      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`gmail(${e.to}): ${msg}`)
      failed++
    }
  }

  return { provider: "gmail", sent, failed, errors: errors.length ? errors : undefined }
}

function buildGmailRaw(from: string, to: string, subject: string, html: string): string {
  return Buffer.from(
    [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(html).toString("base64"),
    ].join("\r\n"),
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}


/* ═════════════════════════════════════════════════════════════
   Provider: 레거시 Webhook 폴백
   ═════════════════════════════════════════════════════════════ */

async function sendViaWebhook(
  webhookUrl: string,
  emails: SingleEmail[],
): Promise<SendResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: emails[0]?.subject,
        recipients: emails.map((e) => ({
          email: e.to,
          personalizedBody: e.html,
          personalizedSubject: e.subject,
        })),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    return {
      provider: "webhook",
      sent: res.ok ? emails.length : 0,
      failed: res.ok ? 0 : emails.length,
    }
  } catch (err) {
    return {
      provider: "webhook",
      sent: 0,
      failed: emails.length,
      errors: [err instanceof Error ? err.message : String(err)],
    }
  }
}


/* ═════════════════════════════════════════════════════════════
   PUBLIC API
   ═════════════════════════════════════════════════════════════ */

/**
 * 단건 이메일 발송
 * 우선순위: Resend → Webhook → Simulation
 */
export async function sendEmail(email: SingleEmail): Promise<SendResult> {
  return sendBatchEmail([email])
}

/**
 * 배치 이메일 발송 (캠페인·자동화용)
 * 우선순위: Resend → Webhook → Simulation
 */
export async function sendBatchEmail(emails: SingleEmail[]): Promise<SendResult> {
  if (emails.length === 0) return { provider: "simulation", sent: 0, failed: 0 }

  // 1순위: Resend
  if (resend) {
    return sendViaResend(emails)
  }

  // 2순위: 레거시 Webhook
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL
  if (webhookUrl) {
    return sendViaWebhook(webhookUrl, emails)
  }

  // 3순위: 시뮬레이션
  console.log(`[EMAIL-SIM] ${emails.length}건 발송 시뮬레이션 (Resend·Webhook 모두 미설정)`)
  emails.slice(0, 3).forEach((e) => console.log(`  → ${e.to}: ${e.subject}`))
  if (emails.length > 3) console.log(`  ... 외 ${emails.length - 3}건`)

  return { provider: "simulation", sent: emails.length, failed: 0 }
}

/**
 * 내부 알림 이메일 (관리자 다이제스트 등)
 * 우선순위: Gmail → Resend → Simulation
 *
 * Gmail은 @classin.com 발신으로 내부 커뮤니케이션에 적합.
 * Gmail 실패 시 Resend로 자동 폴백.
 */
export async function sendInternalNotification(params: {
  to: string[]
  subject: string
  html: string
  routeUrl?: string
}): Promise<SendResult> {
  const emails: SingleEmail[] = params.to.map((addr) => ({
    to: addr,
    subject: params.subject,
    html: params.html,
  }))

  if (emails.length === 0) return { provider: "simulation", sent: 0, failed: 0 }

  // 1순위: Gmail (내부 알림)
  if (GMAIL_FROM) {
    try {
      const result = await sendViaGmail(emails)
      // Gmail 전부 실패 시 Resend 폴백
      if (result.failed === emails.length && resend) {
        console.warn("[EMAIL] Gmail 전체 실패 → Resend 폴백")
        return sendViaResend(emails)
      }
      return result
    } catch {
      console.warn("[EMAIL] Gmail 사용 불가 → Resend 폴백")
    }
  }

  // 2순위: Resend
  if (resend) {
    return sendViaResend(emails)
  }

  // 3순위: 시뮬레이션
  console.log(`[EMAIL-SIM] 내부 알림 ${emails.length}건 시뮬레이션`)
  return { provider: "simulation", sent: emails.length, failed: 0 }
}
