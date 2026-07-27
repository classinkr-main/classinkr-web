import "server-only"

import * as dns from "dns/promises"
import * as https from "https"
import * as net from "net"

interface PostJsonOptions {
  timeoutMs?: number
  headers?: HeadersInit
}

interface ValidatedTarget {
  parsed: URL
  /** 사전 검증을 통과한(공인 IP만 포함) 주소 목록. */
  addresses: Array<{ address: string; family: 4 | 6 }>
}

/** postJson이 반환하는 최소 응답 형태. 호출부는 ok/status만 사용한다. */
export interface PostJsonResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
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

/**
 * URL을 검증하고, 통과 시 검증된(공인) IP 주소 목록을 함께 반환한다.
 * 에러 문자열을 반환하면 검증 실패다.
 */
async function resolveValidatedTarget(
  rawUrl: string
): Promise<string | ValidatedTarget> {
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

  let lookups: Array<{ address: string; family: number }>
  try {
    lookups = await dns.lookup(hostname, { all: true })
  } catch {
    return "Webhook target could not be resolved."
  }
  if (lookups.length === 0) {
    return "Webhook target could not be resolved."
  }
  if (lookups.some((entry) => isPrivateAddress(entry.address))) {
    return "Webhook targets that resolve to private networks are not allowed."
  }

  return {
    parsed,
    addresses: lookups.map((entry) => ({
      address: entry.address,
      family: entry.family === 6 ? 6 : 4,
    })),
  }
}

export async function validateWebhookTarget(rawUrl: string): Promise<string | null> {
  const result = await resolveValidatedTarget(rawUrl)
  return typeof result === "string" ? result : null
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {}
  if (!headers) return result

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value
    })
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result[key] = value
    }
  } else {
    for (const [key, value] of Object.entries(headers)) {
      result[key] = String(value)
    }
  }

  return result
}

export async function postJson(
  url: string,
  body: unknown,
  { timeoutMs = 8000, headers }: PostJsonOptions = {}
): Promise<PostJsonResponse> {
  const result = await resolveValidatedTarget(url)
  if (typeof result === "string") throw new Error(result)

  const { parsed, addresses } = result
  // DNS 리바인딩(TOCTOU) 방어: 위에서 공인 IP임을 검증한 주소만 고정해 연결한다.
  // node:https의 lookup 콜백으로 검증된 IP만 돌려줘 연결 직전 재조회를 막는다.
  // 이렇게 하면 검증 시점에는 공인 IP를, 연결 시점에는 169.254.169.254 같은
  // 사설 IP를 돌려주는 저TTL 리바인딩 공격이 무력화된다.
  // SNI/인증서 검증은 원래 호스트명(servername)으로 그대로 수행한다.
  const pinned = addresses[0]
  const serialized = JSON.stringify(body)

  return new Promise<PostJsonResponse>((resolve, reject) => {
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        servername: parsed.hostname, // TLS SNI/인증서는 원래 호스트명 기준
        // 검증된 단일 IP만 반환한다. 추가 DNS 조회는 일어나지 않는다.
        // Node 20+ 의 autoSelectFamily(기본 ON) 경로는 lookup 을 all:true 로
        // 호출하고 배열 콜백을 기대한다 — 문자열로 응답하면 net 이
        // "Invalid IP address: undefined" 로 연결 자체를 못 연다.
        lookup: (_hostname, options, callback) => {
          if (options?.all) {
            callback(null, [{ address: pinned.address, family: pinned.family }])
          } else {
            callback(null, pinned.address, pinned.family)
          }
        },
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(serialized),
          ...normalizeHeaders(headers),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () => {
          const status = res.statusCode ?? 0
          const text = Buffer.concat(chunks).toString("utf8")
          resolve({
            ok: status >= 200 && status < 300,
            status,
            // redirect: "manual"과 동치 — 3xx를 자동 추적하지 않는다.
            text: async () => text,
            json: async () => JSON.parse(text),
          })
        })
      }
    )

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Webhook request timed out."))
    })
    req.on("error", reject)
    req.end(serialized)
  })
}
