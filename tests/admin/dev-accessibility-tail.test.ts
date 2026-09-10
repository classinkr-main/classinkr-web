import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "app/admin/dev/page.tsx"), "utf8")

describe("admin dev accessibility and state contract", () => {
  it("keeps native controls touch-safe and keyboard-visible", () => {
    expect(source).toContain("[&_button]:min-h-11")
    expect(source).toContain("[&_button]:focus-visible:ring-2")
    expect(source).toContain("[&_input]:min-h-11")
    expect(source).toContain("[&_select]:min-h-11")
    expect(source).toContain("[&_textarea]:focus-visible:ring-2")
    expect(source).toContain('aria-label={`${feat.title} 기능 삭제`}')
    expect(source).toContain("sm:focus-visible:opacity-100")
    expect(source).toContain('className="mx-auto max-w-5xl px-4 sm:px-0')
    expect(source).toContain("grid grid-cols-2 gap-1")
  })

  it("does not turn failed reads into truthful-looking empty lists", () => {
    expect(source).not.toMatch(/adminFetchJsonCached<[^>]+>\([\s\S]*?\.catch\(\(\) => \[\]\)/)
    expect(source.match(/<DevLoadError/g)?.length).toBeGreaterThanOrEqual(5)
    expect(source).toContain('role="alert"')
    expect(source).toContain('aria-busy="true"')
    expect(source).toContain("이전에 불러온 데이터를 유지합니다.")
    expect(source).toContain("개발 도구 접근 권한을 확인하는 중입니다.")
    expect(source).toContain("versions.length === 0 && !showForm && !loadError")
    expect(source).toContain("filtered.length === 0 && !loadError")
    expect(source).toContain("notes.length === 0 && !showForm && !loadError")
  })

  it("makes commit expansion and compact icon actions screen-reader clear", () => {
    expect(source).toContain("aria-expanded={isExpanded}")
    expect(source).toContain("커밋 상세 ${isExpanded ? \"접기\" : \"펼치기\"}")
    expect(source).toContain('aria-label="버전 작성 폼 닫기"')
    expect(source).toContain('aria-label="버그 작성 폼 닫기"')
    expect(source).toContain('aria-label="패치노트 작성 폼 닫기"')
    expect(source).toContain('aria-label="변경사항 항목 삭제"')
    expect(source).toContain("tabIndex={tab === t.id ? 0 : -1}")
    expect(source).toContain("handleTabKeyDown")
  })
})
