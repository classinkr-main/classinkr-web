import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  createCampaign,
  updateCampaign,
  getActiveSubscribersByTags,
  findRecentSentCampaign,
} from "@/lib/repositories/marketing"
import { sendBatchEmail, wrapCampaignHtml, rewriteCampaignLinksForTracking } from "@/lib/email"
import { createEmailClickUrl, createUnsubscribeUrl } from "@/lib/server/security-tokens"
import type { SendEmailRequest } from "@/lib/marketing-types"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(value?: string) {
  return !!value && EMAIL_REGEX.test(value.trim())
}

function replacePlaceholders(
  template: string,
  values: { name: string; org?: string; role?: string }
) {
  return template
    .replace(/\{name\}/g, values.name)
    .replace(/\{org\}/g, values.org ?? "")
    .replace(/\{role\}/g, values.role ?? "")
}

type PersonalizedRecipient = {
  email: string
  name: string
  org: string
  personalizedBody: string
  personalizedSubject?: string
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body: SendEmailRequest = await req.json()
    const sendMode = body.mode ?? "campaign"

    if (!body.subject || !body.body) {
      return NextResponse.json(
        { error: "제목과 본문은 필수입니다." },
        { status: 400 }
      )
    }

    let recipients: PersonalizedRecipient[] = []

    if (sendMode === "test") {
      if (!isValidEmail(body.testEmail)) {
        return NextResponse.json(
          { error: "테스트 발송용 이메일 주소를 입력해주세요." },
          { status: 400 }
        )
      }

      recipients = [
        {
          email: body.testEmail!.trim(),
          name: "테스트",
          org: "",
          personalizedSubject: replacePlaceholders(body.subject, {
            name: "테스트",
            role: "관리자",
          }),
          personalizedBody: replacePlaceholders(body.body, {
            name: "테스트",
            role: "관리자",
          }),
        },
      ]
    } else if (Array.isArray(body.aiPersonalized) && body.aiPersonalized.length > 0) {
      recipients = body.aiPersonalized
        .filter(
          (recipient) =>
            isValidEmail(recipient.email) &&
            typeof recipient.personalizedBody === "string" &&
            recipient.personalizedBody.trim().length > 0
        )
        .map((recipient) => ({
          email: recipient.email.trim(),
          name: recipient.name?.trim() || "고객",
          org: "",
          personalizedSubject: recipient.personalizedSubject ?? recipient.subject ?? body.subject,
          personalizedBody: recipient.personalizedBody,
        }))

      if (recipients.length === 0) {
        return NextResponse.json(
          { error: "AI 개인화 발송 대상이 올바르지 않습니다." },
          { status: 400 }
        )
      }
    } else if (Array.isArray(body.directEmails) && body.directEmails.length > 0) {
      // 직접 입력 모드: 이메일 주소 목록으로 발송
      const validEmails = body.directEmails
        .map((e) => e.trim())
        .filter((e) => isValidEmail(e))

      // 구독자 DB에서 매칭되는 사람은 이름 가져오기
      const allSubscribers = await getActiveSubscribersByTags([])
      const subMap = new Map(allSubscribers.map((s) => [s.email.toLowerCase(), s]))

      recipients = validEmails.map((email) => {
        const sub = subMap.get(email.toLowerCase())
        const name = sub?.name ?? email.split("@")[0]
        return {
          email,
          name,
          org: sub?.org ?? "",
          personalizedSubject: replacePlaceholders(body.subject, {
            name,
            org: sub?.org ?? "",
            role: sub?.role ?? "",
          }),
          personalizedBody: replacePlaceholders(body.body, {
            name,
            org: sub?.org ?? "",
            role: sub?.role ?? "",
          }),
        }
      })

      if (recipients.length === 0) {
        return NextResponse.json(
          { error: "유효한 이메일 주소가 없습니다." },
          { status: 400 }
        )
      }
    } else {
      const activeRecipients = await getActiveSubscribersByTags(body.targetTags ?? [])
      recipients = activeRecipients.map((recipient) => ({
        email: recipient.email,
        name: recipient.name,
        org: recipient.org ?? "",
        personalizedSubject: replacePlaceholders(body.subject, {
          name: recipient.name,
          org: recipient.org ?? "",
          role: recipient.role ?? "",
        }),
        personalizedBody: replacePlaceholders(body.body, {
          name: recipient.name,
          org: recipient.org ?? "",
          role: recipient.role ?? "",
        }),
      }))

      if (recipients.length === 0) {
        return NextResponse.json(
          { error: "발송 대상이 없습니다. 태그 조건을 확인해주세요." },
          { status: 400 }
        )
      }
    }

    // 테스트 발송: 캠페인 레코드 없이 바로 발송
    if (sendMode === "test") {
      const testEmails = recipients.map((r) => ({
        to: r.email,
        subject: r.personalizedSubject ?? body.subject,
        html: wrapCampaignHtml(
          r.personalizedBody,
          createUnsubscribeUrl(req.nextUrl.origin, r.email),
        ),
      }))
      const testResult = await sendBatchEmail(testEmails)
      const testFailed = testResult.sent === 0 && testResult.failed > 0
      const testResponse = {
        ok: !testFailed,
        test: true,
        provider: testResult.provider,
        recipientCount: testResult.sent,
        failedCount: testResult.failed,
        errors: (testResult.errors ?? []).slice(0, 5),
        status: testFailed ? "failed" : "sent",
        ...(testFailed
          ? { error: testResult.errors?.[0] ?? "이메일을 발송하지 못했습니다." }
          : {}),
      }
      return NextResponse.json(testResponse, {
        status: testFailed ? (testResult.provider === "simulation" ? 503 : 502) : 200,
      })
    }

    // 더블클릭·이중 제출 서버 방어(2026-08-18) — 같은 제목이 10분 내 이미 발송됐다면 차단한다.
    // 클라이언트 sendLoading 은 새로고침·중복 탭을 막지 못한다. force 로 의도적 재발송은 허용.
    if (!body.force) {
      try {
        const recent = await findRecentSentCampaign(body.subject, 10 * 60_000)
        if (recent) {
          return NextResponse.json(
            {
              error: "같은 제목의 캠페인이 10분 내에 이미 발송됐습니다. 중복 발송이 아니라면 잠시 후 다시 시도하거나 제목을 바꿔주세요.",
              duplicate: true,
            },
            { status: 409 }
          )
        }
      } catch (guardError) {
        // 가드 조회 실패가 발송 자체를 막으면 안 된다 — 경고만 남기고 진행.
        console.warn("[email/send] duplicate guard skipped:", guardError)
      }
    }

    // 캠페인 레코드를 먼저 생성(draft)해서 ID를 확보 — 추적 픽셀 URL에 사용
    const campaign = await createCampaign({
      subject: body.subject,
      body: body.body,
      targetTags: body.targetTags ?? [],
      status: "draft",
      recipientCount: 0,
    })

    const baseUrl = req.nextUrl.origin
    const trackingUrl = `${baseUrl}/api/track/open?cid=${campaign.id}`

    // 통합 이메일 엔진으로 발송 — 본문 링크는 서명된 클릭 추적 리다이렉트로 치환한다
    // (2026-08-18 성과 루프). 수신거부·추적 URL 은 원본 유지(토큰 이중 래핑 방지).
    const emails = recipients.map((r) => ({
      to: r.email,
      subject: r.personalizedSubject ?? body.subject,
      html: rewriteCampaignLinksForTracking(
        wrapCampaignHtml(
          r.personalizedBody,
          createUnsubscribeUrl(req.nextUrl.origin, r.email),
          trackingUrl,
        ),
        (url) => createEmailClickUrl(baseUrl, String(campaign.id), url),
        ["/api/newsletter/unsubscribe", "/api/track/"],
      ),
    }))

    const result = await sendBatchEmail(emails)
    const sendStatus = result.failed > 0 && result.sent === 0 ? "failed" : "sent"
    const sendErrors = (result.errors ?? []).slice(0, 20)

    // 발송 결과로 캠페인 레코드 업데이트
    await updateCampaign(campaign.id, {
      status: sendStatus as "sent" | "failed",
      sentAt: sendStatus === "sent" ? new Date().toISOString() : undefined,
      recipientCount: result.sent,
    })

    // 부분 실패 기록(2026-08-18) — sent>0 이어도 실패 수·오류를 은폐하지 않는다.
    // 새 컬럼(failed_count·send_errors)이라 마이그레이션 미적용 환경에서도 발송이 죽지 않게
    // 코어 업데이트와 분리해 best-effort 로 기록한다.
    try {
      await updateCampaign(campaign.id, { failedCount: result.failed, sendErrors })
    } catch (metricsError) {
      console.warn("[email/send] 부분 실패 기록 실패(마이그레이션 미적용?):", metricsError)
    }

    const deliveryFailed = result.sent === 0 && result.failed > 0
    const responseBody = {
      ok: !deliveryFailed,
      campaign: { ...campaign, status: sendStatus, recipientCount: result.sent },
      provider: result.provider,
      recipientCount: result.sent,
      failedCount: result.failed,
      errors: sendErrors.slice(0, 5),
      status: sendStatus,
      ...(deliveryFailed
        ? { error: sendErrors[0] ?? "이메일을 발송하지 못했습니다." }
        : {}),
    }

    return NextResponse.json(responseBody, {
      status: deliveryFailed ? (result.provider === "simulation" ? 503 : 502) : 200,
    })
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
}
