import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import FirstWeekGuidePage from "@/app/docs/first-week/page"
import { docsCategories, listDocs } from "@/lib/docs"
import { getDocsContent } from "@/lib/docs-content"

vi.mock("@/lib/docs-content", () => ({ getDocsContent: vi.fn() }))

describe("첫 7일 가이드", () => {
  beforeEach(() => {
    vi.mocked(getDocsContent).mockResolvedValue({ categories: docsCategories, docs: listDocs() })
  })

  it("공개된 설치·수업·복습 가이드와 도움 경로를 연결한다", async () => {
    const html = renderToStaticMarkup(await FirstWeekGuidePage())
    expect(html).toContain("첫 7일, 수업을 시작하는 순서")
    expect(html).toContain('href="/docs/start/pc-install"')
    expect(html).toContain('href="/docs/admin/course-creation"')
    expect(html).toContain('href="/docs/student/class-join-replay"')
    expect(html).toContain('href="/contact"')
  })

  it("공개 목록에서 빠진 가이드는 링크하지 않는다", async () => {
    vi.mocked(getDocsContent).mockResolvedValue({
      categories: docsCategories,
      docs: listDocs().filter((doc) => doc.slug !== "pc-install"),
    })
    const html = renderToStaticMarkup(await FirstWeekGuidePage())
    expect(html).not.toContain('href="/docs/start/pc-install"')
    expect(html).toContain('href="/docs/start/mobile-install"')
  })
})
