import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { BlogPost } from "@/lib/blog-types"

// 콘텐츠 「한눈에」(/admin/blog 기본 보기)가 첫 렌더에서 깨지지 않고, 글 관리 입구·미리보기를 그리는지 본다.
// 서버 렌더라 effect(조회수·인스타 요청)는 돌지 않는다 — 요청 전 상태(조회수 칸 뼈대)를 그린다.

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/blog",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

vi.mock("@/lib/admin-client", () => ({
  adminFetch: vi.fn(),
  adminFetchJsonCached: vi.fn(() => new Promise(() => undefined)),
}))

function post(overrides: Partial<BlogPost>): BlogPost {
  return {
    id: 1,
    slug: "post",
    title: "글",
    excerpt: "",
    category: "인사이트",
    tags: [],
    tag: "",
    date: "2026. 10. 01",
    author: "ClassIn 팀",
    authorRole: "",
    authorBio: "",
    readTime: "5분",
    imageUrl: "",
    thumbnailAlt: "",
    heroImageUrl: "",
    heroImageAlt: "",
    featured: false,
    benefitItems: [],
    targetReader: "",
    contentMarkdown: "",
    seoTitle: "",
    seoDescription: "",
    relatedPostIds: [],
    pageLayout: "standard",
    cta: { eyebrow: "", title: "", description: "", buttonLabel: "무료 상담 신청하기", buttonHref: "/contact" },
    status: "published",
    ...overrides,
  }
}

describe("ContentHub first render", () => {
  it("lists posts published in the window with a preview and the manage links", async () => {
    const { default: ContentHub } = await import("@/components/admin/blog/ContentHub")
    const now = new Date("2026-10-29T01:00:00.000Z")
    const html = renderToStaticMarkup(
      <ContentHub
        posts={[
          post({ id: 1, slug: "fresh", title: "학생 이탈을 예측하는 6가지 데이터 시그널", date: "2026. 10. 14", featured: true }),
          post({ id: 2, slug: "old", title: "오래된 글", date: "2026. 06. 02" }),
          post({ id: 3, slug: "draft", title: "작성 중", date: "2026. 10. 20", status: "draft" }),
        ]}
        postsLoading={false}
        period="last_30d"
        refreshToken={0}
        nowMs={now.getTime()}
        draftCount={1}
        trashCount={3}
        onPeriodChange={() => undefined}
        onOpenManage={() => undefined}
        onEdit={() => undefined}
      />
    )

    expect(html).toContain("발행한 콘텐츠")
    expect(html).toContain("학생 이탈을 예측하는 6가지 데이터 시그널")
    // 조회수를 아직 모르는 오래된 글·초안은 표에 없다
    expect(html).not.toContain("오래된 글")
    expect(html).not.toContain(">작성 중<")
    expect(html).toContain("작성 중인 글 1편")
    expect(html).toContain("휴지통 3")
    expect(html).toContain("에디터에서 열기")
    expect(html).toContain('href="/blog/fresh"')
    expect(html).toContain("무료 상담 신청하기")
    expect(html).toContain('aria-label="주요 글"')
    expect(html).toContain("9월 30일 ~ 10월 29일")
  })
})

describe("AdminBlogPage", () => {
  it("opens on the 한눈에 view with the 글 관리 tab next to it", async () => {
    const { default: AdminBlogPage } = await import("@/app/admin/blog/page")
    const html = renderToStaticMarkup(<AdminBlogPage />)
    expect(html).toContain('aria-label="콘텐츠 보기"')
    expect(html).toMatch(/aria-current="page"[^>]*>한눈에/)
    expect(html).toContain("글 관리")
    expect(html).toContain('aria-label="기간"')
    expect(html).toContain("발행한 콘텐츠")
    expect(html).not.toContain("에디터 바로 열기")
  })
})
