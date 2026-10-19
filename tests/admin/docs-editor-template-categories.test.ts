import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { docsCategories } from "@/lib/docs"

const source = readFileSync(
  join(process.cwd(), "components/admin/docs/DocsArticleEditor.tsx"),
  "utf8"
)

// DOC_TEMPLATES 배열 리터럴 범위만 잘라 본다 — 앵커가 사라지면 조용히 통과하지 않도록 throw.
function templatesBlock(): string {
  const anchor = "const DOC_TEMPLATES: DocsArticleTemplate[] = ["
  const start = source.indexOf(anchor)
  if (start < 0) throw new Error("DOC_TEMPLATES anchor not found")
  const end = source.indexOf("\n]\n", start)
  if (end < 0) throw new Error("DOC_TEMPLATES end not found")
  return source.slice(start, end)
}

function templateEntries(): string[] {
  // 각 템플릿은 4칸 들여쓴 `id: "..."` 로 시작한다.
  return templatesBlock()
    .split(/\n {4}id: /)
    .slice(1)
}

function applyTemplateBody(): string {
  const start = source.indexOf("function applyTemplate(template: DocsArticleTemplate)")
  if (start < 0) throw new Error("applyTemplate not found")
  const end = source.indexOf("setForm(", start)
  if (end < 0) throw new Error("applyTemplate setForm not found")
  return source.slice(start, end)
}

describe("DocsArticleEditor templates only target visible categories", () => {
  const visibleIds = new Set<string>(docsCategories.map((category) => category.id))

  it("finds the template list", () => {
    expect(templateEntries().length).toBeGreaterThanOrEqual(5)
  })

  it("never forces a category hidden by the 2026-05-14 category migration", () => {
    const forced = Array.from(templatesBlock().matchAll(/\bcategoryId: "([^"]+)"/g)).map(
      (match) => match[1]
    )
    for (const categoryId of forced) {
      expect(visibleIds.has(categoryId), `template categoryId "${categoryId}" is hidden`).toBe(
        true
      )
    }
  })

  it("keeps the troubleshooting template as a troubleshooting docType without a hidden category", () => {
    const entry = templateEntries().find((text) => text.startsWith('"troubleshooting",'))
    expect(entry).toBeDefined()
    expect(entry).toMatch(/\bdocType: "troubleshooting"/)
    expect(entry).not.toMatch(/\bcategoryId: "troubleshooting"/)
  })

  it("keeps the editor's current category when a template does not pin one", () => {
    const body = applyTemplateBody()
    expect(body).toMatch(/:\s*form\.categoryId \|\| categories\[0\]\?\.id/)
    expect(body).not.toMatch(/:\s*categories\[0\]\?\.id \?\? form\.categoryId/)
  })
})
