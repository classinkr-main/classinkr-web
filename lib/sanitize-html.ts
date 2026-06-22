const BLOCKED_CONTENT_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "template",
  "svg",
  "math",
]

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
])

const VOID_TAGS = new Set(["br", "hr"])

const ATTRIBUTES_BY_TAG: Record<string, Set<string>> = {
  a: new Set(["href", "rel", "target", "title"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
}

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function normalizeUrlForCheck(value: string) {
  return value
    .replace(/&colon;/gi, ":")
    .replace(/&#0*58;/gi, ":")
    .replace(/&#x0*3a;/gi, ":")
    .replace(/[\u0000-\u001F\u007F\s]+/g, "")
    .toLowerCase()
}

function isSafeHref(value: string) {
  const normalized = normalizeUrlForCheck(value)
  if (!normalized) return false
  if (normalized.startsWith("#") || normalized.startsWith("/") || normalized.startsWith("?")) {
    return true
  }
  if (normalized.startsWith("//")) return true
  return /^(https?:|mailto:|tel:)/.test(normalized)
}

function sanitizeAttributes(tagName: string, rawAttributes: string) {
  const allowedAttributes = ATTRIBUTES_BY_TAG[tagName]
  if (!allowedAttributes || !rawAttributes.trim()) return ""

  const parts: string[] = []
  let hrefSeen = false
  let targetBlank = false

  for (const match of rawAttributes.matchAll(ATTR_RE)) {
    const rawName = match[1]
    const name = rawName.toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ""

    if (
      name.startsWith("on") ||
      name === "style" ||
      name === "srcdoc" ||
      name === "xmlns" ||
      name.startsWith("xlink")
    ) {
      continue
    }

    if (!allowedAttributes.has(name)) continue
    if ((name === "colspan" || name === "rowspan") && !/^[1-9]\d{0,2}$/.test(value)) {
      continue
    }
    if (name === "href") {
      if (!isSafeHref(value)) continue
      hrefSeen = true
    }
    if (name === "target") {
      if (value !== "_blank") continue
      targetBlank = true
    }
    if (name === "rel" && !hrefSeen) continue

    parts.push(`${name}="${escapeAttribute(value)}"`)
  }

  if (tagName === "a" && targetBlank) {
    const relIndex = parts.findIndex((part) => part.startsWith("rel="))
    if (relIndex >= 0) {
      parts[relIndex] = `rel="${escapeAttribute("noopener noreferrer")}"`
    } else {
      parts.push(`rel="${escapeAttribute("noopener noreferrer")}"`)
    }
  }

  return parts.length ? ` ${parts.join(" ")}` : ""
}

export function sanitizeMarketingHtml(html: string) {
  let sanitized = html

  for (const tag of BLOCKED_CONTENT_TAGS) {
    sanitized = sanitized.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
      ""
    )
  }

  sanitized = sanitized
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-zA-Z][\w:-]*)([^<>]*)>/g, (fullTag, rawTagName: string, rawAttributes: string) => {
      const tagName = rawTagName.toLowerCase()
      if (!ALLOWED_TAGS.has(tagName)) return ""

      const isClosingTag = /^<\//.test(fullTag)
      if (isClosingTag) {
        return VOID_TAGS.has(tagName) ? "" : `</${tagName}>`
      }

      const attributes = sanitizeAttributes(tagName, rawAttributes)
      return VOID_TAGS.has(tagName) ? `<${tagName}${attributes}>` : `<${tagName}${attributes}>`
    })

  return sanitized
}
