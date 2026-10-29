import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { getDocBySlug, getDocPath } from "@/lib/docs"

const ROOT = path.resolve(__dirname, "../..")

function readSource(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8")
}

// 공개 페이지가 내부 링크로 거는 문서들이 실제로 있는지, 클라이언트 페이지에 직접 적은 경로가 정본과 같은지 지킨다.
describe("공개 페이지가 연결하는 문서 링크", () => {
  const linked = [
    { slug: "software-pricing-quote-bundle-faq", category: "software" },
    { slug: "pre-adoption-faq-22-questions", category: "start" },
    { slug: "hardware-spec-installation-faq", category: "hardware" },
  ] as const

  it.each(linked)("$category/$slug 문서가 lib/docs.ts 에 존재하고 비공개가 아니다", ({ slug, category }) => {
    const doc = getDocBySlug(slug, category)
    expect(doc).toBeDefined()
    expect(doc?.visibility ?? "public").toBe("public")
    expect(doc?.status ?? "published").toBe("published")
    expect(getDocPath(doc!)).toBe(`/docs/${category}/${slug}`)
  })

  it("/product/hw 가 직접 적은 하드웨어 FAQ 경로는 lib/docs.ts 의 경로와 같다", () => {
    const doc = getDocBySlug("hardware-spec-installation-faq", "hardware")
    expect(doc).toBeDefined()
    expect(readSource("app/product/hw/page.tsx")).toContain(`"${getDocPath(doc!)}"`)
  })

  it("/pricing 과 /faq 는 slug 로 문서를 조회해 링크를 만든다", () => {
    expect(readSource("app/pricing/page.tsx")).toContain('getDocBySlug("software-pricing-quote-bundle-faq", "software")')
    expect(readSource("app/faq/page.tsx")).toContain('getDocBySlug("pre-adoption-faq-22-questions", "start")')
  })
})
