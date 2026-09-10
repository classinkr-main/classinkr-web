import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(process.cwd(), "lib/admin-crm-duplicate-preflight.ts"), "utf8")

describe("CRM duplicate preflight pagination order", () => {
  it("external snapshot scan is gone — the UNIQUE constraint is the guarantee, not a paged sort", () => {
    // (source_system, object_api_key, external_id) 는 external_crm_records_unique_source 가 DB 에서
    // 강제한다. 84K행 synced_at 정렬을 5페이지 반복하던 스캔은 중복을 찾을 수 없어 제거됐다.
    expect(source).not.toContain('.from("external_crm_records")')
    expect(source).toContain("external_crm_records_unique_source")
  })

  it("source-link scans break updated_at ties with the row id", () => {
    expect(source.match(/\.order\("updated_at", \{ ascending: false \}\)/g)).toHaveLength(2)
    expect(source.match(/\.order\("id", \{ ascending: false \}\)/g)).toHaveLength(2)
  })
})
