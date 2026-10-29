import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// P2-9 — "적용된 값을 한 번에 바꾸기" 원자 대체 RPC 마이그레이션 정적 검증.
// 실제 DB 없이 SQL 텍스트만 검증하는 기존 관례(tests/db/branch-sales-ledger-entry-reversal-
// migration.test.ts와 동일)를 따른다.
const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260922_branch_sales_ledger_supersede_entry.sql",
)

function readMigration() {
  return readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n")
}

describe("branch sales ledger supersede-entry migration (P2-9)", () => {
  it("is additive — CREATE OR REPLACE, never redefines apply_branch_sales_ledger_draft", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.supersede_branch_sales_ledger_entry")
    // 모든 적용 경로가 지나가는 핵심 함수는 이 파일에서 절대 재정의하지 않는다(회귀 반경 격리).
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.apply_branch_sales_ledger_draft")
  })

  it("declares the expected signature and returns the drafts row type", () => {
    const sql = readMigration()

    expect(sql).toContain("p_old_draft_id UUID")
    expect(sql).toContain("p_new_draft_id UUID")
    expect(sql).toContain("p_actor TEXT")
    expect(sql).toContain("p_reason TEXT DEFAULT NULL")
    expect(sql).toContain("RETURNS public.branch_sales_ledger_drafts")
  })

  it("is SECURITY DEFINER with a locked-down search_path", () => {
    const sql = readMigration()

    expect(sql).toContain("SECURITY DEFINER")
    expect(sql).toContain("SET search_path = public")
  })

  it("locks both the old entry and the new draft with FOR UPDATE exactly twice", () => {
    const sql = readMigration()

    const forUpdateCount = (sql.match(/FOR UPDATE/g) ?? []).length
    expect(forUpdateCount).toBe(2)
    expect(sql).toContain("FROM public.branch_sales_ledger_entries")
    expect(sql).toContain("WHERE draft_id = p_old_draft_id")
    expect(sql).toContain("FROM public.branch_sales_ledger_drafts")
    expect(sql).toContain("WHERE id = p_new_draft_id")
  })

  it("raises P0002 when the old entry or the new draft cannot be found", () => {
    const sql = readMigration()

    expect(sql).toContain("supersede: old draft has no applied entry")
    expect(sql).toContain("supersede: new draft not found")
    // 두 RAISE 모두 P0002 — 'not found 계열' 문구 하나로 저장소가 번역한다.
    const p0002Count = (sql.match(/USING ERRCODE = 'P0002'/g) ?? []).length
    expect(p0002Count).toBe(2)
  })

  it("is idempotent when the old entry is already reversed and the new draft already applied", () => {
    const sql = readMigration()

    const idempotentIndex = sql.indexOf("v_old.entry_status = 'reversed' AND v_new.status = 'applied'")
    expect(idempotentIndex).toBeGreaterThan(-1)
    const returnIndex = sql.indexOf("RETURN v_new;", idempotentIndex)
    expect(returnIndex).toBeGreaterThan(idempotentIndex)
    // 순서: 대상 일치 검증(3) → 멱등 반환(4) → checked 검증(5). 적용된 초안·entry는 트리거로
    // 불변이라 진짜 재시도는 3을 항상 다시 통과하고, 무관한 (반전된 entry, 적용된 초안) 쌍으로
    // 부른 잘못된 호출만 "성공"으로 둔갑하지 않고 걸러진다.
    const firstMismatchIndex = sql.indexOf("supersede: target mismatch")
    expect(firstMismatchIndex).toBeGreaterThan(-1)
    expect(idempotentIndex).toBeGreaterThan(sql.lastIndexOf("supersede: target mismatch"))
    const mustBeCheckedIndex = sql.indexOf("new draft must be checked")
    expect(mustBeCheckedIndex).toBeGreaterThan(returnIndex)
  })

  it("has an error-free availability probe path (both ids NULL) before any lock", () => {
    const sql = readMigration()

    const probeIndex = sql.indexOf("IF p_old_draft_id IS NULL AND p_new_draft_id IS NULL THEN")
    expect(probeIndex).toBeGreaterThan(-1)
    const probeReturnIndex = sql.indexOf("RETURN NULL;", probeIndex)
    expect(probeReturnIndex).toBeGreaterThan(probeIndex)
    // 프로브는 어떤 잠금·쓰기보다 앞서 끝나야 한다(ERROR 로그·잠금 없이 존재만 확인).
    expect(probeReturnIndex).toBeLessThan(sql.indexOf("FOR UPDATE"))
  })

  it("rejects a new draft that is not checked (excluding the idempotent branch) with P0001", () => {
    const sql = readMigration()

    expect(sql).toContain("IF v_new.status <> 'checked' THEN")
    expect(sql).toContain("supersede: new draft must be checked")
    expect(sql).toContain("USING ERRCODE = 'P0001'")
  })

  it("validates all four target-match dimensions before mutating anything", () => {
    const sql = readMigration()

    // (1) kind <-> entry_type correspondence
    expect(sql).toContain("v_old.entry_type = 'manual-edit' AND v_new.kind <> 'edit-row'")
    expect(sql).toContain("v_old.entry_type = 'manual-new' AND v_new.kind <> 'new-row'")
    // (2) same ledger month
    expect(sql).toContain("v_old.ledger_month IS DISTINCT FROM v_new.ledger_month")
    // (3) same source_deal_id for manual-edit corrections
    expect(sql).toContain("v_old.source_deal_id IS DISTINCT FROM v_new.source_deal_id")
    // (4) same trimmed customer_name for manual-new (additive) rows
    expect(sql).toContain("btrim(coalesce(v_old.customer_name, ''))")
    expect(sql).toContain("btrim(coalesce(v_new.customer_name, ''))")
    expect(sql).toContain("supersede: target mismatch")
  })

  it("reverses the old entry by calling the existing reversal RPC instead of duplicating its UPDATE", () => {
    const sql = readMigration()

    const callIndex = sql.indexOf("public.reverse_branch_sales_ledger_entry(")
    expect(callIndex).toBeGreaterThan(-1)
    expect(sql).toContain("IF v_old.entry_status = 'active' THEN")
    expect(sql).toContain("'superseded by draft ' || p_new_draft_id::text")
    // 이 파일 자체는 entries UPDATE 문을 복제하지 않는다(반전 로직은 reverse RPC 안에만 있다).
    expect(sql).not.toMatch(/UPDATE\s+public\.branch_sales_ledger_entries/)
  })

  it("applies the new draft via the existing apply RPC and rolls back everything if it returns NULL", () => {
    const sql = readMigration()

    const applyCallIndex = sql.indexOf("public.apply_branch_sales_ledger_draft(p_new_draft_id, p_actor)")
    expect(applyCallIndex).toBeGreaterThan(-1)
    const nullCheckIndex = sql.indexOf("IF v_new IS NULL THEN", applyCallIndex)
    expect(nullCheckIndex).toBeGreaterThan(applyCallIndex)
    const raiseIndex = sql.indexOf("RAISE EXCEPTION", nullCheckIndex)
    expect(raiseIndex).toBeGreaterThan(nullCheckIndex)
    expect(sql.slice(nullCheckIndex, raiseIndex + 400)).toContain("supersede: apply returned null")
    expect(sql.slice(nullCheckIndex, raiseIndex + 400)).toContain("USING ERRCODE = 'P0001'")
    // 이 파일 자체는 drafts UPDATE 문을 복제하지 않는다(적용 로직은 apply RPC 안에만 있다).
    expect(sql).not.toMatch(/UPDATE\s+public\.branch_sales_ledger_drafts/)
  })

  it("returns the freshly applied draft row", () => {
    const sql = readMigration()

    const lastReturn = sql.lastIndexOf("RETURN v_new;")
    expect(lastReturn).toBeGreaterThan(-1)
  })

  it("locks execute grants down to service_role, matching the existing draft/entry RPC convention", () => {
    const sql = readMigration()

    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.supersede_branch_sales_ledger_entry(UUID, UUID, TEXT, TEXT)",
    )
    expect(sql).toContain("FROM PUBLIC, anon, authenticated")
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.supersede_branch_sales_ledger_entry(UUID, UUID, TEXT, TEXT)",
    )
    expect(sql).toContain("TO service_role")
  })

  it("documents purpose, apply order, and a data-safe rollback in the file header", () => {
    const sql = readMigration()

    expect(sql).toContain("npm run check:db")
    expect(sql).toContain("DROP FUNCTION public.supersede_branch_sales_ledger_entry(UUID, UUID, TEXT, TEXT);")
  })
})
