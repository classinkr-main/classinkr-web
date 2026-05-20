import { NextRequest, NextResponse } from "next/server"
import * as dns from "dns/promises"
import * as net from "net"
import { verifyAdmin } from "@/lib/admin-auth"

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

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part))
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true
  }

  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase()
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff")
  )
}

function normalizeIpv4MappedIpv6(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "")
  const dotted = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) return dotted[1]

  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (!hex) return null

  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null

  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join(".")
}

function isPrivateAddress(address: string) {
  const mappedIpv4 = normalizeIpv4MappedIpv6(address)
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4)

  const version = net.isIP(address)
  if (version === 4) return isPrivateIpv4(address)
  if (version === 6) return isPrivateIpv6(address)
  return true
}

async function validateWebhookTarget(rawUrl: string) {
  const parsed = new URL(rawUrl)

  if (parsed.protocol !== "https:") {
    return "Webhook tests only allow HTTPS URLs."
  }

  if (parsed.username || parsed.password) {
    return "URLs containing credentials are not allowed."
  }

  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return "Localhost targets are not allowed."
  }

  if (net.isIP(hostname) && isPrivateAddress(hostname)) {
    return "Private IP targets are not allowed."
  }

  const lookups = await dns.lookup(hostname, { all: true })
  if (lookups.some((entry) => isPrivateAddress(entry.address))) {
    return "Hosts that resolve to private networks are not allowed."
  }

  return null
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
      return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
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

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
      redirect: "manual",
    })

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
