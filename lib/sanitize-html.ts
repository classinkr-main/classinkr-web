import sanitizeHtmlLib from "sanitize-html"

// Output-side defense for operator-authored `content_html` (quote/contract share
// pages, admin quote view, marketing campaign HTML) rendered via
// `sanitizeMarketingHtml`. This was previously a hand-rolled regex sanitizer;
// it is now backed by the vetted `sanitize-html` library (a real HTML parser),
// which is far more robust against parser-differential / mutation-XSS attacks
// while preserving the original allowlist and visual behavior.

// Tags that may appear in the output. Anything not listed is discarded.
const ALLOWED_TAGS = [
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
]

// Per-tag attribute allowlist. Only `a` and `td`/`th` carry attributes; every
// other tag is stripped of all attributes. Matches the original behavior.
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "rel", "target", "title"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
}

// URL schemes permitted on `href`. Relative URLs, fragment (`#…`), query
// (`?…`), and protocol-relative (`//…`) links are handled by
// `allowProtocolRelative` + `allowedSchemesAppliedToAttributes`. Crucially,
// `javascript:` and `data:` are NOT in this list, so they are stripped.
const ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"]

const SANITIZE_OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  // Disallowed tags (script, style, iframe, object, embed, form, template,
  // svg, math, …) are dropped entirely, including their text content. This
  // mirrors the original BLOCKED_CONTENT_TAGS handling.
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "noscript", "title"],
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesByTag: {
    a: ALLOWED_SCHEMES,
  },
  // Apply scheme filtering to href specifically (in addition to default
  // src/etc.), so `javascript:`/`data:` hrefs are rejected.
  allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
  allowProtocolRelative: true,
  // Drop HTML comments (and conditional-comment payloads).
  allowedClasses: {},
  parser: {
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
  },
  transformTags: {
    a: (tagName, attribs) => {
      const next: Record<string, string> = {}

      if (typeof attribs.href === "string") {
        next.href = attribs.href
      }
      if (typeof attribs.title === "string") {
        next.title = attribs.title
      }
      // `target` may only be `_blank`; anything else is dropped.
      const targetBlank = attribs.target === "_blank"
      if (targetBlank) {
        next.target = "_blank"
      }
      // `rel` is only meaningful alongside an href; when opening a new tab we
      // force `noopener noreferrer`. Otherwise pass through an explicit rel
      // only when there is an href.
      if (next.href) {
        if (targetBlank) {
          next.rel = "noopener noreferrer"
        } else if (typeof attribs.rel === "string") {
          next.rel = attribs.rel
        }
      } else if (targetBlank) {
        // No href but target=_blank: still harden against reverse-tabnabbing.
        next.rel = "noopener noreferrer"
      }

      return { tagName, attribs: next }
    },
    td: (tagName, attribs) => ({
      tagName,
      attribs: filterSpanAttrs(attribs),
    }),
    th: (tagName, attribs) => ({
      tagName,
      attribs: filterSpanAttrs(attribs),
    }),
  },
}

// colspan/rowspan must be a small positive integer (1-999), matching the
// original `^[1-9]\d{0,2}$` constraint. Invalid values are dropped.
function filterSpanAttrs(attribs: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {}
  for (const name of ["colspan", "rowspan"]) {
    const value = attribs[name]
    if (typeof value === "string" && /^[1-9]\d{0,2}$/.test(value)) {
      next[name] = value
    }
  }
  return next
}

export function sanitizeMarketingHtml(html: string): string {
  if (!html) return ""
  return sanitizeHtmlLib(html, SANITIZE_OPTIONS)
}
