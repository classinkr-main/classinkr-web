import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("admin sidebar docs gap discoverability", () => {
  const source = readFileSync(
    join(process.cwd(), "components/admin/AdminSidebar.tsx"),
    "utf8"
  )

  // IA 재설계(admin-ia-redesign-2026-06-29 §3·§6): 보강 큐는 독립 사이드바 탭에서
  // 문서 센터(/admin/docs) "보강 큐" 탭으로 병합됨. 사이드바는 문서 센터 진입점만 노출하고,
  // 호버 시 보강 큐 탭 데이터(gaps + alpha-readiness)를 미리 데운다.
  it("keeps the docs center reachable as the host of the gap queue tab", () => {
    expect(source).toContain('"/admin/docs"')
    expect(source).toContain('가이드 문서')
  })

  it("warms alpha readiness and gap queue data when the docs nav item is hovered", () => {
    expect(source).toContain('"/admin/docs"')
    expect(source).toContain('/api/admin/docs/alpha-readiness')
    expect(source).toContain('/api/admin/docs/gaps')
  })
})
