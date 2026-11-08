// 리드마그넷 PDF 링크 헬퍼 — 순수 함수(글꼴·fs 없음).
// with_pdf_tracking / absolute_url 은 scripts/generate-lead-magnet-pdfs.py 와 같은 규칙이다:
// 사이트 내부 경로("/…")에만 utm 3종을 붙이고, 이미 있는 값은 덮지 않는다.

/** 예전 오프라인 생성본(public/) 경로의 디렉터리. */
export const LEGACY_LEAD_MAGNET_PDF_DIR = "/materials/lead-magnets"

/** 슬러그로 쓸 수 있는 글자(normalizeLeadMagnet 의 normalizeSlug 결과와 같은 집합). */
const SAFE_SLUG = /^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$/

export function isSafeLeadMagnetSlug(slug: string) {
  return SAFE_SLUG.test(slug)
}

export function legacyLeadMagnetPdfPath(slug: string) {
  return `${LEGACY_LEAD_MAGNET_PDF_DIR}/${slug}.pdf`
}

/** 서버가 그때그때 그리는 PDF 경로(공개 라우트). */
export function leadMagnetPdfRoutePath(slug: string) {
  return `/api/materials/${encodeURIComponent(slug)}/pdf`
}

/**
 * PDF 응답의 Content-Disposition. 헤더 값은 Latin-1 이어야 해서 한글 슬러그는
 * filename*(RFC 5987)로 싣고, filename 에는 ASCII 대체 이름을 둔다.
 */
export function pdfContentDisposition(slug: string, disposition: "inline" | "attachment" = "inline") {
  if (/^[A-Za-z0-9._-]+$/.test(slug)) return `${disposition}; filename="${slug}.pdf"`
  return `${disposition}; filename="classin-resource.pdf"; filename*=UTF-8''${encodeURIComponent(`${slug}.pdf`)}`
}

/**
 * 스크립트가 아니라 따로 만든(브라우저로 찍은) PDF — 자료 데이터에 없는 표·디자인이 들어 있어
 * 서버 생성본으로 바꾸면 받는 사람의 내용이 줄어든다. 사람이 바꾸기로 정하기 전까지는 이 파일을
 * 그대로 보낸다. 목록은 public/ 의 PDF 생성기 정보(Creator 가 HeadlessChrome)와 테스트가 대조한다.
 */
export const HANDCRAFTED_LEAD_MAGNET_PDF_SLUGS: ReadonlySet<string> = new Set([
  "classroom-recording-replay-setup-guide",
  "night-online-class-remote-academy-guide",
  "online-class-timing-check",
])

export function isHandcraftedLeadMagnetPdf(slug: string) {
  return HANDCRAFTED_LEAD_MAGNET_PDF_SLUGS.has(slug)
}

/** resourceUrl 이 「자기 슬러그의 예전 스크립트 생성본 경로」와 정확히 같은가(따로 만든 PDF 는 아니다). */
export function isLegacyGeneratedPdfUrl(resourceUrl: string | null | undefined, slug: string) {
  if (isHandcraftedLeadMagnetPdf(slug)) return false
  return (resourceUrl ?? "").trim() === legacyLeadMagnetPdfPath(slug)
}

function splitHref(href: string) {
  const hashIndex = href.indexOf("#")
  const beforeHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : ""
  const queryIndex = beforeHash.indexOf("?")
  return {
    path: queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash,
    query: queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "",
    hash,
  }
}

/** 사이트 내부 경로에 PDF 유입 utm 을 붙인다(있는 키는 유지). */
export function withPdfTracking(href: string, sourceSlug: string) {
  if (!href.startsWith("/")) return href
  const { path, query, hash } = splitHref(href)
  const params = new URLSearchParams(query)
  if (!params.has("utm_source")) params.set("utm_source", "pdf")
  if (!params.has("utm_medium")) params.set("utm_medium", "lead_magnet")
  if (!params.has("utm_campaign")) params.set("utm_campaign", sourceSlug)
  return `${path}?${params.toString()}${hash}`
}

const PASSTHROUGH_SCHEMES = /^(?:https?:\/\/|mailto:|tel:)/i

/** PDF 안에서 누를 절대 URL. 내부 경로는 siteUrl 에 붙인다. */
export function absoluteUrl(href: string, sourceSlug: string, siteUrl: string) {
  const tracked = withPdfTracking(href, sourceSlug)
  if (PASSTHROUGH_SCHEMES.test(tracked)) return tracked
  return `${siteUrl.replace(/\/+$/, "")}/${tracked.replace(/^\/+/, "")}`
}

/** 인쇄본에 적을 짧은 주소 — 프로토콜·쿼리(utm)·www 를 뗀다. */
export function displayUrl(url: string) {
  if (/^mailto:/i.test(url)) return url.replace(/^mailto:/i, "").split("?")[0]
  if (/^tel:/i.test(url)) return url.replace(/^tel:/i, "")
  try {
    const parsed = new URL(url)
    const pathname = decodeURIComponentSafe(parsed.pathname).replace(/\/$/, "")
    return `${parsed.host.replace(/^www\./, "")}${pathname}`
  } catch {
    return url.split(/[?#]/)[0]
  }
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** PDF 링크 주석의 URI 는 7비트 ASCII 여야 한다 — 한글 경로 등은 퍼센트 인코딩한다. */
export function toPdfUri(url: string) {
  let normalized = url
  try {
    normalized = new URL(url).href
  } catch {
    normalized = encodeURI(url)
  }
  // URL 파서가 남긴 비 ASCII 가 있으면 한 번 더 인코딩한다.
  return /^[\x20-\x7e]*$/.test(normalized) ? normalized : encodeURI(normalized)
}
