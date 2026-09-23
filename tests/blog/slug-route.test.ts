import { validateHeaderValue } from "node:http"

import { NextRequest, NextResponse } from "next/server"
import { getImplicitTags } from "next/dist/server/lib/implicit-tags"
import { decodePathParams } from "next/dist/server/lib/router-utils/decode-path-params"
import { describe, expect, it, vi } from "vitest"

import {
  BLOG_SLUG_TOKEN_PREFIX,
  decodeBlogSlugToken,
  encodeBlogSlugToken,
  getBlogPostPath,
  getBlogPostRevalidatePath,
  getBlogSlugTokenRewritePath,
  isHeaderSafeBlogSlug,
  resolveBlogRouteSlug,
} from "@/lib/blog-slug-route"

// 한글 슬러그 글 500 사고(2026-09-21) 회귀 고정.
// 운영(Vercel, minimal mode)에서 ISR 페이지는 암묵 캐시 태그를 x-next-cache-tags 응답 헤더로
// 싣는데, Next 16 이 태그를 **디코드된** 경로로 만들어 한글이 헤더에 들어가 Node 가 던졌다.
// proxy 가 비ASCII 슬러그를 ASCII 토큰 경로로 rewrite 해 태그를 헤더 안전하게 만든다.

vi.mock("@/lib/supabase/middleware", () => ({
  updateSupabaseSession: async (request: NextRequest) => {
    const response = NextResponse.next({ request })
    // 세션 갱신이 Set-Cookie 를 실은 경우도 rewrite 응답으로 이어지는지 본다.
    if (request.headers.get("x-test-refresh") === "1") {
      response.cookies.set("sb-project-auth-token", "refreshed", { path: "/" })
    }
    return { response, user: null }
  },
}))

const { proxy } = await import("@/proxy")

// 운영 데이터(2026-09-21 사이트맵 기준 공개 19건 중 2건)의 실제 비ASCII 슬러그.
const KOREAN_SLUGS = [
  "naver-2026-06-11-최대-500만원-지원-국민내일배움카드-신청-가이드",
  "정율사관학원-인구-감소의-위기에서-학원이-살아남",
]
const ASCII_SLUG = "2026-asia-ai-education-forum-in-busan"

// app-page 가 minimal mode 에서 싣는 x-next-cache-tags 값을 Next 실제 함수로 재구성한다.
// route-module 은 interpolate(encodeURIComponent) 결과를 decodePathParams 로 되돌린 경로를
// resolvedPathname 으로 쓰고, app-render 가 그걸로 getImplicitTags 를 부른다.
async function cacheTagsHeaderFor(requestPathname: string) {
  const resolvedPathname = decodePathParams(requestPathname)
  const { tags } = await getImplicitTags("/blog/[slug]/page", resolvedPathname, null)
  return tags.join(",")
}

function assertHeaderSafe(value: string) {
  validateHeaderValue("x-next-cache-tags", value)
}

describe("블로그 한글 슬러그 — ISR 캐시 태그 헤더", () => {
  it.each(KOREAN_SLUGS)("원문 경로는 태그 헤더에서 던지고(사고 재현), 토큰 경로는 안전하다: %s", async (slug) => {
    const publicPath = getBlogPostPath(slug)
    expect(() => assertHeaderSafe(`_N_T_${decodePathParams(publicPath)}`)).toThrow(
      /Invalid character in header content/
    )
    await expect(cacheTagsHeaderFor(publicPath).then(assertHeaderSafe)).rejects.toThrow(
      /Invalid character in header content/
    )

    const rewritten = getBlogSlugTokenRewritePath(publicPath)
    expect(rewritten).toBe(`/blog/${encodeBlogSlugToken(slug)}`)
    const header = await cacheTagsHeaderFor(rewritten!)
    expect(() => assertHeaderSafe(header)).not.toThrow()
    expect(header).toContain(`_N_T_${rewritten}`)
  })

  it("ASCII 슬러그의 태그는 그대로다(rewrite 하지 않음)", async () => {
    const path = `/blog/${ASCII_SLUG}`
    expect(getBlogSlugTokenRewritePath(path)).toBeNull()
    const header = await cacheTagsHeaderFor(path)
    expect(() => assertHeaderSafe(header)).not.toThrow()
    expect(header).toContain(`_N_T_/blog/${ASCII_SLUG}`)
  })
})

describe("lib/blog-slug-route", () => {
  it.each(KOREAN_SLUGS)("토큰은 ASCII 이고 원래 슬러그로 되돌아온다: %s", (slug) => {
    const token = encodeBlogSlugToken(slug)
    expect(token.startsWith(BLOG_SLUG_TOKEN_PREFIX)).toBe(true)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    // 어느 계층이 경로를 몇 번 디코드해도 값이 변하지 않아야 한다.
    expect(decodeURIComponent(token)).toBe(token)
    expect(decodeBlogSlugToken(token)).toBe(slug)
    expect(resolveBlogRouteSlug(token)).toBe(slug)
  })

  it("params.slug 가 퍼센트 인코딩·원문으로 와도 같은 슬러그로 푼다", () => {
    const slug = KOREAN_SLUGS[0]
    expect(resolveBlogRouteSlug(encodeURIComponent(slug))).toBe(slug)
    expect(resolveBlogRouteSlug(slug)).toBe(slug)
    expect(resolveBlogRouteSlug(ASCII_SLUG)).toBe(ASCII_SLUG)
    // 잘못된 퍼센트 인코딩은 원문 그대로(기존 decodeSlug 동작).
    expect(resolveBlogRouteSlug("bad-%E0%A4%A")).toBe("bad-%E0%A4%A")
  })

  it("토큰 접두사로 시작하는 ASCII 값은 토큰으로 인정하지 않는다", () => {
    // ASCII 슬러그에는 토큰을 발급하지 않으므로, 디코드 결과가 ASCII 면 평범한 슬러그다.
    const asciiLookalike = `${BLOG_SLUG_TOKEN_PREFIX}${Buffer.from(ASCII_SLUG).toString("base64url")}`
    expect(decodeBlogSlugToken(asciiLookalike)).toBeNull()
    expect(resolveBlogRouteSlug(asciiLookalike)).toBe(asciiLookalike)
    expect(decodeBlogSlugToken(`${BLOG_SLUG_TOKEN_PREFIX}not*base64`)).toBeNull()
    expect(decodeBlogSlugToken(`${BLOG_SLUG_TOKEN_PREFIX}`)).toBeNull()
    // 유효하지 않은 UTF-8 바이트열.
    expect(decodeBlogSlugToken(`${BLOG_SLUG_TOKEN_PREFIX}${Buffer.from([0xff, 0xfe]).toString("base64url")}`)).toBeNull()
  })

  it("rewrite 대상은 /blog/<비ASCII 슬러그> 한 세그먼트뿐이다", () => {
    const encoded = getBlogPostPath(KOREAN_SLUGS[0])
    expect(getBlogSlugTokenRewritePath(`${encoded}/`)).toBe(getBlogSlugTokenRewritePath(encoded))
    expect(getBlogSlugTokenRewritePath("/blog")).toBeNull()
    expect(getBlogSlugTokenRewritePath("/blog/")).toBeNull()
    expect(getBlogSlugTokenRewritePath("/blog/rss.xml")).toBeNull()
    expect(getBlogSlugTokenRewritePath(`/blog/${ASCII_SLUG}`)).toBeNull()
    expect(getBlogSlugTokenRewritePath(`${encoded}/extra`)).toBeNull()
    expect(getBlogSlugTokenRewritePath(`/events${encoded.slice("/blog".length)}`)).toBeNull()
    expect(getBlogSlugTokenRewritePath("/blog/bad-%E0%A4%A")).toBeNull()
    // 이미 토큰인 경로는 다시 rewrite 하지 않는다.
    expect(getBlogSlugTokenRewritePath(`/blog/${encodeBlogSlugToken(KOREAN_SLUGS[0])}`)).toBeNull()
  })

  it("공개 URL 은 퍼센트 인코딩, revalidate 대상은 ISR 캐시가 붙는 경로다", () => {
    const slug = KOREAN_SLUGS[0]
    expect(getBlogPostPath(slug)).toBe(`/blog/${encodeURIComponent(slug)}`)
    expect(getBlogPostPath(slug)).toMatch(/^[\x21-\x7E]+$/)
    expect(getBlogPostPath(ASCII_SLUG)).toBe(`/blog/${ASCII_SLUG}`)

    expect(getBlogPostRevalidatePath(ASCII_SLUG)).toBe(`/blog/${ASCII_SLUG}`)
    expect(getBlogPostRevalidatePath(slug)).toBe(getBlogSlugTokenRewritePath(getBlogPostPath(slug)))
  })

  it("헤더 안전 판정은 인쇄 가능 ASCII 만 통과시킨다", () => {
    expect(isHeaderSafeBlogSlug(ASCII_SLUG)).toBe(true)
    expect(isHeaderSafeBlogSlug("dual_device_update")).toBe(true)
    expect(isHeaderSafeBlogSlug(KOREAN_SLUGS[1])).toBe(false)
    expect(isHeaderSafeBlogSlug("café")).toBe(false)
    expect(isHeaderSafeBlogSlug("line\nbreak")).toBe(false)
  })
})

describe("proxy — 블로그 한글 슬러그 경계 rewrite", () => {
  function makeRequest(path: string, headers: Record<string, string> = {}) {
    return new NextRequest(`http://localhost:3000${path}`, { headers })
  }

  it("한글 슬러그 요청을 토큰 경로로 rewrite 한다(주소창 URL 은 유지)", async () => {
    const slug = KOREAN_SLUGS[0]
    const response = await proxy(makeRequest(getBlogPostPath(slug)))
    const rewrite = response.headers.get("x-middleware-rewrite")
    expect(rewrite).toBe(`http://localhost:3000/blog/${encodeBlogSlugToken(slug)}`)
    expect(() => validateHeaderValue("x-middleware-rewrite", rewrite!)).not.toThrow()
  })

  it("쿼리(_rsc 등)는 rewrite 뒤에도 유지된다", async () => {
    const slug = KOREAN_SLUGS[1]
    const response = await proxy(makeRequest(`${getBlogPostPath(slug)}?_rsc=abc`))
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `http://localhost:3000/blog/${encodeBlogSlugToken(slug)}?_rsc=abc`
    )
  })

  it("세션 갱신 Set-Cookie 를 rewrite 응답에도 싣는다", async () => {
    const response = await proxy(makeRequest(getBlogPostPath(KOREAN_SLUGS[0]), { "x-test-refresh": "1" }))
    expect(response.headers.get("x-middleware-rewrite")).not.toBeNull()
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("refreshed")
  })

  it("ASCII 슬러그·블로그 목록은 rewrite 하지 않는다", async () => {
    for (const path of [`/blog/${ASCII_SLUG}`, "/blog", "/blog/rss.xml"]) {
      const response = await proxy(makeRequest(path))
      expect(response.headers.get("x-middleware-rewrite")).toBeNull()
      expect(response.headers.get("x-middleware-next")).toBe("1")
    }
  })
})
