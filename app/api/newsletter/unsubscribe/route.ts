import { NextRequest, NextResponse } from "next/server"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { verifyUnsubscribeToken } from "@/lib/server/security-tokens"
import { unsubscribe } from "@/lib/repositories/marketing"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const email = url.searchParams.get("email") ?? ""
  const token = url.searchParams.get("token") ?? ""

  return new NextResponse(renderUnsubscribePage(email, token), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "newsletter-unsubscribe", {
    windowMs: 60_000,
    max: 10,
  })

  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  try {
    const contentType = req.headers.get("content-type") ?? ""
    let email = ""
    let token = ""

    if (contentType.includes("application/json")) {
      const body = await req.json()
      email = typeof body?.email === "string" ? body.email.trim() : ""
      token = typeof body?.token === "string" ? body.token.trim() : ""
    } else {
      const form = await req.formData()
      const value = form.get("email")
      const tokenValue = form.get("token")
      email = typeof value === "string" ? value.trim() : ""
      token = typeof tokenValue === "string" ? tokenValue.trim() : ""
    }

    if (!email || !verifyUnsubscribeToken(email, token)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }

    await unsubscribe(email)

    return NextResponse.json({
      ok: true,
      message: "Completed.",
    })
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }
}

function renderUnsubscribePage(email: string, token: string): string {
  const safeEmail = escapeHtml(email)
  const safeToken = escapeHtml(token)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unsubscribe - Classin</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #FAFAF8;
      color: #111110;
    }
    .card {
      text-align: center;
      padding: 48px 32px;
      background: white;
      border-radius: 16px;
      border: 1px solid #e8e8e4;
      max-width: 420px;
      width: 90%;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin-bottom: 12px; }
    p { color: #666; line-height: 1.6; }
    .email { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #084734; word-break: break-all; }
    button {
      appearance: none;
      border: 0;
      border-radius: 10px;
      padding: 12px 18px;
      background: #084734;
      color: white;
      font-weight: 600;
      cursor: pointer;
      margin-top: 16px;
    }
    button:hover { opacity: 0.92; }
    .note { margin-top: 16px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#9993;</div>
    <h1>Unsubscribe confirmation</h1>
    <p>Click the button below to unsubscribe this address.</p>
    <p class="email">${safeEmail || "No email provided."}</p>
    <form method="POST" action="/api/newsletter/unsubscribe">
      <input type="hidden" name="email" value="${safeEmail}" />
      <input type="hidden" name="token" value="${safeToken}" />
      <button type="submit">Unsubscribe</button>
    </form>
    <p class="note">The request is handled the same way regardless of whether the address exists.</p>
  </div>
</body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
