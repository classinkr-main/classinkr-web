import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { postJson, validateWebhookTarget } from "@/lib/server/post-json"

const DUMMY_PAYLOAD = {
  source: "demo_modal",
  name: "test user",
  org: "test org",
  role: "admin",
  size: "100",
  email: "test@classin.kr",
  phone: "010-0000-0000",
  timestamp: new Date().toISOString(),
  _test: true,
}

const VALIDATION_MESSAGES = new Map([
  ["Webhook URLs must use HTTPS.", "Webhook tests only allow HTTPS URLs."],
  ["Webhook URLs cannot include credentials.", "URLs containing credentials are not allowed."],
  ["Local webhook targets are not allowed.", "Localhost targets are not allowed."],
  ["Private IP webhook targets are not allowed.", "Private IP targets are not allowed."],
  [
    "Webhook targets that resolve to private networks are not allowed.",
    "Hosts that resolve to private networks are not allowed.",
  ],
])

function getTestWebhookValidationMessage(message: string) {
  return VALIDATION_MESSAGES.get(message) ?? message
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const { type, url } = await req.json()

  if (!url) {
    return NextResponse.json({ ok: false, message: "No URL configured." })
  }

  try {
    const validationError = await validateWebhookTarget(url)
    if (validationError) {
      return NextResponse.json(
        { ok: false, message: getTestWebhookValidationMessage(validationError) },
        { status: 400 }
      )
    }

    let body: Record<string, unknown> = DUMMY_PAYLOAD

    if (type === "channelTalk") {
      body = {
        event: "new_lead",
        source: "demo_modal",
        name: "test user",
        org: "test org",
        phone: "010-0000-0000",
        email: "test@classin.kr",
        message: "admin / 100 users",
        timestamp: new Date().toISOString(),
        _test: true,
      }
    } else if (type === "wecom") {
      body = {
        msgtype: "text",
        text: {
          content: `[TEST] Classin notification channel connected\nType: ${type}\nTime: ${new Date().toISOString()}`,
        },
      }
    } else if (type === "kakaoAlimtalk") {
      body = {
        eventType: "notification.test",
        title: "[TEST] Classin notification template",
        message: "Kakao notification channel connection check",
        sentAt: new Date().toISOString(),
        _test: true,
      }
    } else if (type === "email") {
      body = {
        kind: "notification_test",
        subject: "[TEST] Classin email notification channel",
        message: "Email webhook connection check",
        sentAt: new Date().toISOString(),
        _test: true,
      }
    }

    const res = await postJson(url, body)

    if (res.ok) {
      return NextResponse.json({
        ok: true,
        status: res.status,
        message: `Connection successful (HTTP ${res.status})`,
      })
    }

    return NextResponse.json({
      ok: false,
      status: res.status,
      message: `Upstream response error (HTTP ${res.status})`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, message: `Connection failed: ${msg}` })
  }
}
