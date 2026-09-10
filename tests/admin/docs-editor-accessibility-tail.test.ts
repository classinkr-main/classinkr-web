import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "components/admin/docs/DocsArticleEditor.tsx"),
  "utf8"
)

describe("DocsArticleEditor accessibility tail contract", () => {
  it("keeps editor controls touch-safe and keyboard-visible", () => {
    expect(source).toContain("[&_button]:min-h-11")
    expect(source).toContain("[&_button]:focus-visible:ring-2")
    expect(source).toContain("[&_input:not([type=checkbox])]:min-h-11")
    expect(source).toContain("[&_select]:min-h-11")
    expect(source).toContain("[&_textarea]:focus-visible:ring-2")
    expect(source).toContain("-my-3 inline-flex h-11 w-11")
    expect(source).toContain("inline-flex min-h-11 items-center")
  })

  it("programmatically names compact fields and exposes selection state", () => {
    for (const label of [
      "카테고리",
      "문서 유형",
      "제품 영역",
      "난이도",
      "관련 문서",
      "관련 문서 연결 유형",
      "가시성",
      "스냅샷 메모",
    ]) {
      expect(source).toContain(`aria-label="${label}"`)
    }
    expect(source).toContain('role="tablist"')
    expect(source).toContain('aria-label="문서 편집 보조 패널"')
    expect(source).toContain("aria-selected={activeSidebarTab === tab.value}")
    expect(source).toContain("aria-pressed={active}")
    expect(source).toContain("tabIndex={activeSidebarTab === tab.value ? 0 : -1}")
    expect(source).toContain("handleSidebarTabKeyDown")
  })

  it("announces async feedback and traps focus inside the preview dialog", () => {
    expect(source).toContain('role="alert"')
    expect(source).toContain('role="status"')
    expect(source).toContain('aria-busy="true"')
    expect(source).toContain("previewDialogRef")
    expect(source).toContain("previewCloseButtonRef")
    expect(source).toContain('event.key === "Escape"')
    expect(source).toContain('event.key !== "Tab"')
    expect(source).toContain("previouslyFocused?.focus()")
    expect(source).toContain("0건으로 표시하지 않습니다.")
    expect(source).toContain("analytics: analyticsResult.data")
  })
})
