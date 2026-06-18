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

  it("deduplicates repeated heading ids", () => {
    const html = renderMarkdownToHtml(["## 결과", "", "### 결과", "", "## 결과"].join("\n"))

    expect(html).toContain('id="결과"')
    expect(html).toContain('id="결과-2"')
    expect(html).toContain('id="결과-3"')
  })

  it("renders simple markdown tables", () => {
    const html = renderMarkdownToHtml(
      ["| 항목 | 이전 | 이후 |", "|------|-----:|:----:|", "| 출석 | 70% | 92% |"].join("\n")
    )

    expect(html).toContain("<table")
    expect(html).toContain("<thead>")
    expect(html).toContain("항목")
    expect(html).toContain("92%")
    expect(html).toContain("text-right")
    expect(html).toContain("text-center")
  })

  it("does not render unsupported image hosts as images", () => {
    const html = renderMarkdownToHtml("![bad](https://example.com/image.png)")

    expect(html).not.toContain("<figure")
    expect(html).not.toContain("<img")
    expect(html).toContain("![bad]")
  })
})
