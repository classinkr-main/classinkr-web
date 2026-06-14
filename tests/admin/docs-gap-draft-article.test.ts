import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("admin docs gap draft article flow", () => {
  const source = readFileSync(join(process.cwd(), "app/admin/docs/gaps/page.tsx"), "utf8")

  it("lets operators save an AI draft as an editable docs article", () => {
    expect(source).toContain("buildDocDraftArticlePayload")
    expect(source).toContain("/api/admin/docs/articles")
    expect(source).toContain("초안을 문서로 저장")
    expect(source).toContain("문서 편집 화면에서 최종 검수하세요")
    expect(source).not.toContain("붙여 넣어 게시")
    expect(source).toContain("router.push")
  })

  it("links cluster drafts back to the question backlog after article creation", () => {
    expect(source).toContain("mappedArticleId")
    expect(source).toContain("/api/admin/chatbot/questions/")
  })
})
