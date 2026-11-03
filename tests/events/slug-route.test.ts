import { readFileSync } from "node:fs"
import { validateHeaderValue } from "node:http"
import path from "node:path"

import { NextRequest, NextResponse } from "next/server"
import { getImplicitTags } from "next/dist/server/lib/implicit-tags"
import { decodePathParams } from "next/dist/server/lib/router-utils/decode-path-params"
import { describe, expect, it, vi } from "vitest"

import { encodeBlogSlugToken } from "@/lib/blog-slug-route"
import {
  getEventRouteSegment,
  getEventSlugTokenRewritePath,
  resolveEventRouteSlug,
} from "@/lib/event-slug-route"

// 한글 슬러그 행사 500 사고(2026-11-03) 회귀 고정 — 블로그 판(tests/blog/slug-route.test.ts)과 같은 원인.
// minimal mode 에서 ISR 페이지는 암묵 캐시 태그를 x-next-cache-tags 헤더로 싣는데, 태그가 디코드된 경로라
// 한글이 들어가 Node 가 던졌다. proxy 가 비ASCII 슬러그를 ASCII 토큰 경로로 rewrite 한다.

vi.mock("@/lib/supabase/middleware", () => ({
  updateSupabaseSession: async (request: NextRequest) => ({
    response: NextResponse.next({ request }),
    user: null,
  }),
}))

const { proxy } = await import("@/proxy")

// 운영 사이트맵(2026-11-03)의 실제 비ASCII 행사 슬러그와 ASCII 대조군.
const KOREAN_SLUG = "classin-meets-gwang-ju-광주-세미나-v0txw"
const ASCII_SLUG = "classin-meets-busan-2b7c2"
const PUBLIC_PATH = `/events/${encodeURIComponent(KOREAN_SLUG)}`
const TOKEN_PATH = `/events/${encodeBlogSlugToken(KOREAN_SLUG)}`

// app-page 가 minimal mode 에서 싣는 헤더 값을 Next 실제 함수로 재구성한다.
async function cacheTagsHeaderFor(requestPathname: string) {
  const { tags } = await getImplicitTags("/events/[slug]/page", decodePathParams(requestPathname), null)
  return tags.join(",")
}

const assertHeaderSafe = (value: string) => validateHeaderValue("x-next-cache-tags", value)

describe("행사 한글 슬러그 — ISR 캐시 태그 헤더", () => {
  it("원문 경로는 태그 헤더에서 던지고(사고 재현), rewrite 경로는 안전하다", async () => {
    await expect(cacheTagsHeaderFor(PUBLIC_PATH).then(assertHeaderSafe)).rejects.toThrow(
      /Invalid character in header content/
    )

    expect(getEventSlugTokenRewritePath(PUBLIC_PATH)).toBe(TOKEN_PATH)
    expect(getEventSlugTokenRewritePath(`${PUBLIC_PATH}/`)).toBe(TOKEN_PATH)
    const header = await cacheTagsHeaderFor(TOKEN_PATH)
    expect(() => assertHeaderSafe(header)).not.toThrow()
    expect(header).toContain(`_N_T_${TOKEN_PATH}`)
  })

  it("rewrite 대상은 비ASCII 행사 상세 한 세그먼트뿐이다", () => {
    for (const pathname of [
      "/events",
      "/events/",
      `/events/${ASCII_SLUG}`,
      `${PUBLIC_PATH}/calendar.ics`, // ISR 태그 헤더를 싣지 않는 라우트 — 원문 그대로 둔다.
      `/events/videos/${encodeURIComponent("부산-포럼")}`,
      `/blog/${encodeURIComponent(KOREAN_SLUG)}`,
      "/events/bad-%E0%A4%A",
      TOKEN_PATH, // 이미 토큰인 경로는 다시 rewrite 하지 않는다.
    ]) {
      expect(getEventSlugTokenRewritePath(pathname), pathname).toBeNull()
    }
  })

  it("사전 생성 세그먼트와 조회 슬러그가 서로 되돌아온다", () => {
    expect(getEventRouteSegment(ASCII_SLUG)).toBe(ASCII_SLUG)
    expect(`/events/${getEventRouteSegment(KOREAN_SLUG)}`).toBe(TOKEN_PATH)
    expect(resolveEventRouteSlug(getEventRouteSegment(KOREAN_SLUG))).toBe(KOREAN_SLUG)
    expect(resolveEventRouteSlug(encodeURIComponent(KOREAN_SLUG))).toBe(KOREAN_SLUG)
    expect(resolveEventRouteSlug(ASCII_SLUG)).toBe(ASCII_SLUG)
  })
})

describe("proxy — 행사 한글 슬러그 경계 rewrite", () => {
  const rewriteOf = async (pathname: string) =>
    (await proxy(new NextRequest(`http://localhost:3000${pathname}`))).headers.get("x-middleware-rewrite")

  it("한글 슬러그 상세를 토큰 경로로 rewrite 한다(쿼리 유지, 주소창 URL 은 그대로)", async () => {
    expect(await rewriteOf(`${PUBLIC_PATH}?_rsc=abc`)).toBe(`http://localhost:3000${TOKEN_PATH}?_rsc=abc`)
  })

  it("ASCII 슬러그·목록·calendar.ics 는 rewrite 하지 않는다", async () => {
    for (const pathname of [`/events/${ASCII_SLUG}`, "/events", `${PUBLIC_PATH}/calendar.ics`]) {
      expect(await rewriteOf(pathname), pathname).toBeNull()
    }
  })
})

describe("행사 슬러그 배선", () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n")

  it("상세 페이지는 토큰을 아는 resolveEventRouteSlug 로 params.slug 를 풀고 토큰 경로로 사전 생성한다", () => {
    const page = read("app/events/[slug]/page.tsx")
    expect(page.match(/resolveEventRouteSlug\(rawSlug\)/g)).toHaveLength(2)
    expect(page).not.toMatch(/decodeURIComponent\(/)
    expect(page).toContain("slug: getEventRouteSegment(slug)")
  })
})
