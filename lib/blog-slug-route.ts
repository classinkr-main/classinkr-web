/**
 * 블로그 슬러그 ↔ 라우트 경로의 경계 인코딩.
 *
 * 사고(2026-09-21 확인, 그 이전부터): 슬러그에 한글이 든 글(/blog/naver-…-최대-500만원-…)이
 * 운영(Vercel)에서 인증 없는 GET 에도 전부 500 이었다. 런타임 로그
 * `TypeError: Invalid character in header content ["x-next-cache-tags"]`.
 *
 * 원인 — Next 16 의 ISR 경로:
 *  1. route-module 이 동적 파라미터를 끼운 경로를 **디코드해서**(decodePathParams)
 *     resolvedPathname 으로 만든다 → `/blog/naver-…-최대-…`.
 *  2. app-render 가 그 경로로 암묵 캐시 태그 `_N_T_/blog/naver-…-최대-…` 를 만든다
 *     (next/dist/server/lib/implicit-tags.js).
 *  3. minimal mode(=Vercel 함수)에서 ISR 페이지(revalidate=3600)는 이 태그 목록을
 *     `x-next-cache-tags` 응답 헤더로 싣는데, Node 는 0xFF 를 넘는 문자가 든 헤더 값을
 *     거부하므로 렌더가 끝난 뒤 setHeader 에서 던진다 → 500.
 *  로컬 `next start`(non-minimal)는 이 헤더를 지우고 응답하므로 재현되지 않는다
 *  (`NEXT_PRIVATE_MINIMAL_MODE=1 next start` 로는 재현된다).
 *
 * 해법 — 요청 경계에서 인코딩:
 *  헤더에 그대로 못 싣는 문자가 든 슬러그는 proxy.ts 가 `/blog/_u8_<base64url(UTF-8)>` 로
 *  rewrite 한다. 주소창 URL 은 그대로(한글 슬러그)이고, ISR 캐시 키·암묵 태그는 ASCII 토큰
 *  경로가 되어 헤더에 안전하다. ISR(revalidate)은 끄지 않는다.
 *  퍼센트 이중 인코딩이 아니라 base64url 인 이유: Vercel 라우팅·Next 매처·decodePathParams 가
 *  경로를 몇 번 디코드하든 `%` 가 없는 토큰은 값이 변하지 않는다.
 *
 * ASCII 슬러그는 이 모듈을 거쳐도 기존 경로·캐시 키·revalidatePath 대상이 그대로다.
 */

const BLOG_PATH_PREFIX = "/blog/"

/** proxy rewrite 전용 토큰 접두사. 슬러그 생성기(slugifyTitle 등)는 `_` 를 남기지 않는다. */
export const BLOG_SLUG_TOKEN_PREFIX = "_u8_"

// Node 가 헤더 값으로 받아 주는 인쇄 가능 ASCII(0x20–0x7E)만으로 된 슬러그인지.
// 이 범위를 벗어나는 슬러그(한글·이모지·제어 문자)는 ISR 태그 헤더에 실리면 500 이 난다.
export function isHeaderSafeBlogSlug(slug: string) {
  return /^[\x20-\x7E]*$/.test(slug)
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

/** 슬러그 → ASCII 토큰 세그먼트(`_u8_…`). proxy rewrite 와 revalidatePath 가 같은 값을 쓴다. */
export function encodeBlogSlugToken(slug: string) {
  return `${BLOG_SLUG_TOKEN_PREFIX}${toBase64Url(new TextEncoder().encode(slug))}`
}

/**
 * 토큰 세그먼트 → 슬러그. 토큰이 아니면 null.
 * 토큰은 헤더에 못 싣는 슬러그에만 발급하므로, 디코드 결과가 헤더 안전(=ASCII)이거나
 * 재인코딩이 원문과 다르면(비정규 base64) 토큰으로 인정하지 않는다 — `_u8_` 로 시작하는
 * 실제 ASCII 슬러그가 있어도 평범한 슬러그로 조회되게 하기 위해서다.
 */
export function decodeBlogSlugToken(segment: string): string | null {
  if (!segment.startsWith(BLOG_SLUG_TOKEN_PREFIX)) return null
  const bytes = fromBase64Url(segment.slice(BLOG_SLUG_TOKEN_PREFIX.length))
  if (!bytes) return null

  let slug: string
  try {
    slug = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  if (isHeaderSafeBlogSlug(slug) || encodeBlogSlugToken(slug) !== segment) return null
  return slug
}

/**
 * `/blog/[slug]` 의 params.slug(토큰·퍼센트 인코딩·원문 중 무엇이든) → DB 조회용 슬러그.
 * 비ASCII 경로의 params 는 퍼센트 인코딩된 채 들어올 수 있어 한 번 디코드한다.
 */
export function resolveBlogRouteSlug(rawParam: string) {
  const fromToken = decodeBlogSlugToken(rawParam)
  if (fromToken !== null) return fromToken
  try {
    return decodeURIComponent(rawParam)
  } catch {
    return rawParam
  }
}

/**
 * proxy.ts 의 경계 rewrite 대상. `/blog/<세그먼트>` 이고 디코드한 슬러그가 헤더에 못 싣는
 * 문자를 품을 때만 토큰 경로를 돌려준다. `/blog`·`/blog/rss.xml`·ASCII 슬러그·하위 경로는 null.
 * pathname 은 NextURL.pathname(퍼센트 인코딩 상태)을 받는다.
 */
export function getBlogSlugTokenRewritePath(pathname: string): string | null {
  const match = /^\/blog\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null

  let slug: string
  try {
    slug = decodeURIComponent(match[1])
  } catch {
    return null
  }
  if (isHeaderSafeBlogSlug(slug)) return null
  return `${BLOG_PATH_PREFIX}${encodeBlogSlugToken(slug)}`
}

/** 공개 URL 경로(canonical·OG·JSON-LD·공유). 비ASCII 는 퍼센트 인코딩된다. */
export function getBlogPostPath(slug: string) {
  return `${BLOG_PATH_PREFIX}${encodeURIComponent(slug)}`
}

/**
 * revalidatePath 대상 — ISR 캐시가 실제로 붙는 경로.
 * ASCII 슬러그는 기존과 같은 `/blog/<slug>`, 헤더에 못 싣는 슬러그는 proxy 가 rewrite 하는
 * 토큰 경로다(한글 원문 경로에는 캐시 엔트리가 생기지 않는다).
 */
export function getBlogPostRevalidatePath(slug: string) {
  return isHeaderSafeBlogSlug(slug)
    ? `${BLOG_PATH_PREFIX}${slug}`
    : `${BLOG_PATH_PREFIX}${encodeBlogSlugToken(slug)}`
}
