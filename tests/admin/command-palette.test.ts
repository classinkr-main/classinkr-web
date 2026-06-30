import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("admin command palette discoverability", () => {
  const source = readFileSync(
    join(process.cwd(), "components/admin/AdminCommandPalette.tsx"),
    "utf8"
  )

  it("exposes the docs gap queue as an alpha operations route", () => {
    // IA 재설계(admin-ia-redesign-2026-06-29 §3·§6): 보강 큐는 독립 라우트에서
    // 문서 센터(/admin/docs)의 "보강 큐" 탭으로 병합됨. 커맨드 팔레트도 탭 딥링크로 이동.
    expect(source).toContain("/admin/docs?tab=gaps")
    expect(source).toContain("문서 보강 큐")
  })
})
