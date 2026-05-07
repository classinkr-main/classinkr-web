const SAFE_PUBLIC_URL_PROTOCOLS = new Set(["http:", "https:"])
const DISALLOWED_PUBLIC_URL_CHARS = /[\u0000-\u001F\u007F\s\\]/

export function sanitizePublicUrl(
  value: string | null | undefined,
  fallback = "#"
) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (!trimmed || DISALLOWED_PUBLIC_URL_CHARS.test(trimmed)) return fallback

  if (trimmed.startsWith("/")) {
    return trimmed.startsWith("//") ? fallback : trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (SAFE_PUBLIC_URL_PROTOCOLS.has(parsed.protocol)) {
      return parsed.toString()
    }
  } catch {
    return fallback
  }

  return fallback
}

export function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function sanitizePublicUrlForHtmlAttribute(
  value: string | null | undefined,
  fallback = "#"
) {
  return escapeHtmlAttribute(sanitizePublicUrl(value, fallback))
}
