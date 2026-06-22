const SAFE_PUBLIC_URL_PROTOCOLS = new Set(["http:", "https:"])
const SAFE_PUBLIC_IMAGE_PROTOCOLS = new Set(["https:"])
const DISALLOWED_PUBLIC_URL_CHARS = /[\u0000-\u001F\u007F\s\\]/

function getConfiguredSiteImageHosts() {
  const hosts = new Set(["classin.co.kr", "classin.ai.kr"])
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) return hosts

  try {
    hosts.add(new URL(siteUrl).hostname)
  } catch {
    return hosts
  }

  return hosts
}

const SAFE_SITE_IMAGE_HOSTS = getConfiguredSiteImageHosts()
const SAFE_REMOTE_IMAGE_HOSTS = new Set(["images.unsplash.com"])

export function isAllowedPublicImageHost(hostname: string) {
  return (
    SAFE_SITE_IMAGE_HOSTS.has(hostname) ||
    SAFE_REMOTE_IMAGE_HOSTS.has(hostname) ||
    hostname === "supabase.co" ||
    hostname.endsWith(".supabase.co")
  )
}

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

export function sanitizePublicImageUrl(
  value: string | null | undefined,
  fallback = ""
) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (!trimmed || DISALLOWED_PUBLIC_URL_CHARS.test(trimmed)) return fallback

  if (trimmed.startsWith("/")) {
    return trimmed.startsWith("//") ? fallback : trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (
      SAFE_PUBLIC_IMAGE_PROTOCOLS.has(parsed.protocol) &&
      isAllowedPublicImageHost(parsed.hostname)
    ) {
      return parsed.toString()
    }
  } catch {
    return fallback
  }

  return fallback
}

export function sanitizePublicImageUrlForHtmlAttribute(
  value: string | null | undefined,
  fallback = ""
) {
  return escapeHtmlAttribute(sanitizePublicImageUrl(value, fallback))
}
