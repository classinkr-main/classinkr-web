import "server-only"

import * as dns from "dns/promises"
import * as net from "net"

interface PostJsonOptions {
  timeoutMs?: number
  headers?: HeadersInit
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
    normalized === "::" ||
    normalized === "::1" ||
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

export async function validateWebhookTarget(rawUrl: string): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return "Invalid webhook URL."
  }

  if (parsed.protocol !== "https:") {
    return "Webhook URLs must use HTTPS."
  }
  if (parsed.username || parsed.password) {
    return "Webhook URLs cannot include credentials."
  }

  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    return "Local webhook targets are not allowed."
  }

  if (net.isIP(hostname) && isPrivateAddress(hostname)) {
    return "Private IP webhook targets are not allowed."
  }

  let lookups: Array<{ address: string }>
  try {
    lookups = await dns.lookup(hostname, { all: true })
  } catch {
    return "Webhook target could not be resolved."
  }
  if (lookups.some((entry) => isPrivateAddress(entry.address))) {
    return "Webhook targets that resolve to private networks are not allowed."
  }

  return null
}

export async function postJson(
  url: string,
  body: unknown,
  { timeoutMs = 8000, headers }: PostJsonOptions = {}
) {
  const validationError = await validateWebhookTarget(url)
  if (validationError) throw new Error(validationError)

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    credentials: "omit",
    redirect: "manual",
  })
}
