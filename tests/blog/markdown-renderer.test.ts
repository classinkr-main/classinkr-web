import { describe, expect, it } from "vitest"

import { renderMarkdownToHtml } from "@/lib/blog-markdown"

describe("renderMarkdownToHtml", () => {
  it("renders image markdown with a trailing backslash without hanging", () => {
    const html = renderMarkdownToHtml(
      "![Forum](https://kfoaodkgvhvmfrankeyu.supabase.co/storage/v1/object/public/blog-images/forum.jpg)\\"
    )

    expect(html).toContain("<figure")
    expect(html).toContain('src="https://kfoaodkgvhvmfrankeyu.supabase.co/storage/v1/object/public/blog-images/forum.jpg"')
  })

  it("advances past malformed image-like lines", () => {
    const html = renderMarkdownToHtml("![broken image\n\n다음 문단")

    expect(html).toContain("![broken image")
    expect(html).toContain("다음 문단")
  })

  it("renders adjacent images as separate figures", () => {
    const html = renderMarkdownToHtml(
      "![first](https://classin.ai.kr/first.png)![second](https://classin.ai.kr/second.png)"
    )

    expect(html.match(/<figure/g)).toHaveLength(2)
    expect(html).toContain('src="https://classin.ai.kr/first.png"')
    expect(html).toContain('src="https://classin.ai.kr/second.png"')
    expect(html).not.toContain("first.png)![second]")
  })

  it("keeps headings when they are pasted directly after an image", () => {
    const html = renderMarkdownToHtml(
      "![first](https://classin.ai.kr/first.png)## 다음 섹션"
    )

    expect(html).toContain("<figure")
    expect(html).toContain('id="다음-섹션"')
    expect(html).toContain("다음 섹션")
  })
})
