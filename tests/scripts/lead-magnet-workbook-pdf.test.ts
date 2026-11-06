import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { WORKBOOK_SLUGS, buildWorkbookHtml } from "../../scripts/render-lead-magnet-workbook-pdf.mjs"

type Magnet = {
  slug: string
  title: string
  sections: Array<{ title: string; items: string[] }>
}

const magnets = JSON.parse(
  readFileSync(path.join(process.cwd(), "data", "lead-magnets.json"), "utf8")
) as Magnet[]
const bySlug = new Map(magnets.map((magnet) => [magnet.slug, magnet]))

describe("리드 마그넷 워크북 PDF 템플릿", () => {
  it.each(WORKBOOK_SLUGS as string[])("%s: 표지·안내·영역별 쪽·결과·신호·플랜·다음 단계를 모두 그린다", (slug) => {
    const magnet = bySlug.get(slug)!
    const html = buildWorkbookHtml(magnet, bySlug)

    const pages = html.match(/<section class="page/g) ?? []
    expect(pages).toHaveLength(magnet.sections.length + 6)

    const itemCount = magnet.sections.reduce((sum, section) => sum + section.items.length, 0)
    expect(html.match(/class="item"/g) ?? []).toHaveLength(itemCount)
    expect(html).toContain(`/ ${itemCount}</span>`)
    // 사이트 링크에는 PDF 유입 표식이 붙는다.
    expect(html).toContain(`utm_source=pdf&amp;utm_medium=lead_magnet&amp;utm_campaign=${slug}`)
  })

  it("데이터의 특수문자는 HTML 로 해석되지 않게 이스케이프한다", () => {
    const base = bySlug.get(WORKBOOK_SLUGS[0])!
    const magnet = {
      ...base,
      sections: [{ ...base.sections[0], items: ['<b>굵게</b> & "따옴표"'] }],
    }
    const html = buildWorkbookHtml(magnet, bySlug)
    expect(html).toContain("&lt;b&gt;굵게&lt;/b&gt; &amp; &quot;따옴표&quot;")
    expect(html).not.toContain("<b>굵게</b>")
  })

  it("한 쪽에 들어가지 않는 영역은 조용히 잘리지 않고 실패한다", () => {
    const base = bySlug.get(WORKBOOK_SLUGS[0])!
    const magnet = {
      ...base,
      sections: [{ ...base.sections[0], items: Array.from({ length: 9 }, (_, index) => `문항 ${index}`) }],
    }
    expect(() => buildWorkbookHtml(magnet, bySlug)).toThrow(/한 쪽에 들어가지 않습니다/)
  })

  it("파이썬 생성기는 워크북 자료를 건너뛰어 새 PDF 를 덮어쓰지 않는다", () => {
    const python = readFileSync(path.join(process.cwd(), "scripts", "generate-lead-magnet-pdfs.py"), "utf8")
    const match = python.match(/WORKBOOK_SLUGS = \{([^}]*)\}/)
    expect(match).not.toBeNull()
    const pythonSlugs = [...match![1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]).sort()
    expect(pythonSlugs).toEqual([...(WORKBOOK_SLUGS as string[])].sort())
  })
})
