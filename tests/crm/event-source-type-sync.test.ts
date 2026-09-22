import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { CRM_EVENT_SOURCE_TYPES } from "@/lib/repositories/crm-events"
import {
  EXPECTED_EVENT_SOURCE_TYPE_CHECK,
  parseSourceTypeCheckList,
} from "@/lib/crm/event-source-type-contract"
import { SCHEMA_CONTRACT_MIGRATIONS } from "@/lib/db/schema-contract"

// CRM 3단계 A6 — crm_customer_events.source_type DB CHECK와 코드 enum(CRM_EVENT_SOURCE_TYPES)의
// 동기화를 고정한다. 이후 enum에 값이 추가·삭제되는데 마이그레이션이 따라가지 않으면 이 테스트가
// 깨져서 새 마이그레이션 추가를 강제한다.

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260922_crm_events_source_type_sync.sql"
)
const migrationSql = readFileSync(migrationPath, "utf8")

describe("crm_customer_events.source_type CHECK 동기화(A6)", () => {
  it("re-exports the code enum unchanged", () => {
    expect(EXPECTED_EVENT_SOURCE_TYPE_CHECK).toEqual([...CRM_EVENT_SOURCE_TYPES])
  })

  it("parses the migration's CHECK ... IN (...) list", () => {
    const parsed = parseSourceTypeCheckList(migrationSql)
    expect(parsed.length).toBeGreaterThan(0)
  })

  it("matches the code enum as a set, regardless of order", () => {
    const parsed = parseSourceTypeCheckList(migrationSql)
    expect(new Set(parsed)).toEqual(new Set(EXPECTED_EVENT_SOURCE_TYPE_CHECK))
    expect(parsed).toHaveLength(EXPECTED_EVENT_SOURCE_TYPE_CHECK.length)
  })

  it("is idempotent (DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT)", () => {
    expect(migrationSql).toMatch(
      /drop constraint if exists crm_customer_events_source_type_check/i
    )
    expect(migrationSql).toMatch(/add constraint crm_customer_events_source_type_check/i)
  })

  it("parses to an empty list for SQL with no source_type CHECK (contract self-test)", () => {
    expect(parseSourceTypeCheckList("select 1;")).toEqual([])
  })

  it("is registered in SCHEMA_CONTRACT_MIGRATIONS so check:db verifies it was applied", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(
      "supabase/migrations/20260922_crm_events_source_type_sync.sql"
    )
  })
})
