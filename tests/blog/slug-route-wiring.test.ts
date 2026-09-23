/**
 * 한글 슬러그 블로그 500 수정(lib/blog-slug-route.ts)의 배선 고정.
 *
 * slug-route.test.ts 는 헬퍼 자체를 잠그지만, 페이지가 plain decodeURIComponent 로 돌아가거나 어드민
 * 라우트가 revalidatePath(`/blog/${slug}`) 로 돌아가도 그 테스트는 통과한다 — 그러면 한글 글은 proxy 가
 * 넘긴 `_u8_` 토큰을 그대로 조회해 "글을 찾을 수 없습니다"(200)를 그리거나, 수정해도 캐시가 갱신되지
 * 않는다. 세 파일이 헬퍼를 경유하는지만 소스로 본다.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

function read(relative: string) {
  // Windows CRLF 체크아웃에서도 같은 패턴으로 보게 줄바꿈을 맞춘다.
  return readFileSync(path.join(process.cwd(), relative), "utf8").replace(/\r\n/g, "\n")
}

describe("blog slug route wiring", () => {
  it("the post page resolves params.slug through resolveBlogRouteSlug (token-aware), not a bare decode", () => {
    const page = read("app/blog/[slug]/page.tsx")
    expect(page).toContain('from "@/lib/blog-slug-route"')
    expect(page).toMatch(/resolveBlogRouteSlug\(slug\)/)
    expect(page).not.toMatch(/decodeURIComponent\(\s*slug\s*\)/)
    // 공개 URL(canonical·JSON-LD·공유)은 토큰이 아니라 원래 슬러그 경로다.
    expect(page).toContain("getBlogPostPath(post.slug)")
  })

  it.each(["app/api/admin/blog/route.ts", "app/api/admin/blog/[id]/route.ts"])(
    "%s revalidates the path the ISR cache actually lives on",
    (file) => {
      const source = read(file)
      expect(source).toContain("revalidatePath(getBlogPostRevalidatePath(slug))")
      expect(source).not.toContain("revalidatePath(`/blog/${slug}`)")
    }
  )

  it("proxy rewrites header-unsafe blog slugs before the admin guard", () => {
    const proxy = read("proxy.ts")
    const rewriteAt = proxy.indexOf("getBlogSlugTokenRewritePath(request.nextUrl.pathname)")
    const guardAt = proxy.indexOf("isProtectedAdminPath(request.nextUrl.pathname)", rewriteAt)
    expect(rewriteAt).toBeGreaterThan(-1)
    expect(guardAt).toBeGreaterThan(rewriteAt)
  })
})
