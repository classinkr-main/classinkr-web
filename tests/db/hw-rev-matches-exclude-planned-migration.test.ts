import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// 출고↔REV 대사 뷰 수리 계약(2026-10-22).
// 예전 뷰는 occurred_at 유무로만 실출고를 골라, 날짜가 저장되는 배송 예정을 실출고로 셌다.
// 로컬 Postgres 16 에서 예전 뷰 → 새 뷰 교체와 예정 3건 제외를 실측했다(커밋 메시지 참고).
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261022_hw_rev_matches_exclude_planned.sql"),
  "utf8"
)
const original = readFileSync(
  join(process.cwd(), "supabase/migrations/20260710_hw_rev_reconcile_matches.sql"),
  "utf8"
)

function selectList(source: string) {
  const start = source.lastIndexOf("SELECT\n  COALESCE(hw.account_key")
  return source.slice(start, source.indexOf("FROM hw", start))
}

describe("v_hardware_rev_matches — 배송 예정 제외", () => {
  it("replaces the view in place with the same output columns", () => {
    expect(sql).toContain("CREATE OR REPLACE VIEW public.v_hardware_rev_matches AS")
    expect(selectList(sql)).toBe(selectList(original))
  })

  it("excludes planned/reserved/waiting statuses with the same words as the app's isPlannedStatus", () => {
    expect(sql).toContain(
      "AND NOT (coalesce(m.status, '') ILIKE ANY (ARRAY['%예정%', '%예약%', '%대기%', '%planned%']))"
    )
    const appRule = readFileSync(join(process.cwd(), "lib/repositories/hardware-inventory.ts"), "utf8")
    expect(appRule).toContain("return /예정|예약|대기|planned/i.test(text)")
  })

  it("keeps the void and dated-outbound filters", () => {
    expect(sql).toContain("AND m.voided_at IS NULL")
    expect(sql).toContain("AND m.occurred_at IS NOT NULL")
    expect(sql).toContain("WHERE m.movement_type = 'outbound'")
  })

  it("keeps the view out of anon/authenticated reach", () => {
    expect(sql).toContain("REVOKE ALL ON public.v_hardware_rev_matches FROM anon, authenticated;")
  })
})
