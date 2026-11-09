import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { CASE_STUDY_CATEGORY, CATEGORIES, HARDWARE_CASE_TAG } from "@/lib/blog-types"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

describe("/product/hw 설치 사례 계약", () => {
  it("사례 원본은 블로그 '성공 사례' + '하드웨어' 태그다", () => {
    expect(CASE_STUDY_CATEGORY).toBe("성공 사례")
    expect(CATEGORIES).toContain(CASE_STUDY_CATEGORY)
    expect(HARDWARE_CASE_TAG).toBe("하드웨어")

    const repository = read("lib/repositories/blog.ts")
    expect(repository).toContain("export async function getPublishedHardwareCasePosts")
    expect(repository).toContain('query = query.eq("category", filter.category)')
    expect(repository).toContain('query = query.contains("tags", [filter.tag])')
  })

  it("서버 페이지가 사례를 읽고, 실패해도 페이지를 죽이지 않는다", () => {
    const page = read("app/product/hw/page.tsx")
    expect(page).not.toContain('"use client"')
    expect(page).toContain("export const revalidate = 3600")
    expect(page).toContain("getPublishedHardwareCasePosts(HARDWARE_CASE_LIMIT).catch(")
  })

  it("공개 사례가 없으면 섹션을 숨기고, 더보기 CTA는 계측한다", () => {
    const section = read("components/product/hw/HardwareCaseStories.tsx")
    expect(section).toContain("if (posts.length === 0) return null")
    expect(section).toContain('ctaId="hw_case_stories_more"')
    expect(read("app/product/hw/ProductHWPageClient.tsx")).toContain("<HardwareCaseStories posts={casePosts} />")
  })
})
