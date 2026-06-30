import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("admin docs gap draft article flow", () => {
  // IA 재설계(admin-ia-redesign-2026-06-29 §3·§6): 보강 큐 초안→문서 저장 흐름은
  // 독립 page에서 문서 센터 "보강 큐" 탭이 렌더하는 DocsGapsPanel 컴포넌트로 이전됨.
  const source = readFileSync(
    join(process.cwd(), "components/admin/docs/DocsGapsPanel.tsx"),
    "utf8"
  )

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
