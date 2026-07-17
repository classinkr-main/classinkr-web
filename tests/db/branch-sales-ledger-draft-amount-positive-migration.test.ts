// 웨이브7 (I5) — branch_sales_ledger_drafts.amount 서버 검증의 DB 레벨 방어선 마이그레이션.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260718_branch_sales_ledger_draft_amount_positive.sql",
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

describe("branch sales ledger draft amount-positive migration", () => {
  it("guards the ADD CONSTRAINT with an idempotent pg_constraint existence check", () => {
    const sql = readMigration()

    expect(sql).toContain("DO $$")
    expect(sql).toContain("SELECT 1 FROM pg_constraint")
    expect(sql).toContain("conrelid = 'public.branch_sales_ledger_drafts'::regclass")
    expect(sql).toContain("conname = 'branch_sales_ledger_drafts_amount_positive_check'")
    expect(sql).toContain("ALTER TABLE public.branch_sales_ledger_drafts")
    expect(sql).toContain("ADD CONSTRAINT branch_sales_ledger_drafts_amount_positive_check")
  })

  it("only enforces amount>0 once status reaches checked/applied, keeping the draft-status zero placeholder legal", () => {
    const sql = readMigration()

    // 리터럴하게 "amount > 0"만 걸면 lib/admin/handoff/contract-to-ledger-draft.ts의 계약 서명
    // 자동 제안(kind=new-row, status=draft, amount=0)이 매 서명마다 23514로 깨진다 — 그래서
    // status가 checked/applied로 전이될 때만 강제하는 조건부 CHECK여야 한다.
    expect(sql).toContain("CHECK (status NOT IN ('checked', 'applied') OR amount > 0)")
  })

  it("documents the contract-handoff zero-amount exception inline", () => {
    const sql = readMigration()

    expect(sql).toContain("contract-to-ledger-draft.ts")
    expect(sql).toContain("amount=0")
  })

  it("was validated against production with zero violations and applies as a VALID constraint (no NOT VALID suffix on the ADD CONSTRAINT)", () => {
    const sql = readMigration()

    expect(sql).toContain("db-probe-ledger-amount-check.mjs")
    // 조건부 CHECK 절 자체는 VALID로 즉시 적용된다 — "NOT VALID"라는 문자열은 산문 설명에서만
    // 등장해야 하고(왜 안 써도 되는지 설명), 실제 ADD CONSTRAINT 구문에는 붙지 않는다.
    expect(sql).toContain("CHECK (status NOT IN ('checked', 'applied') OR amount > 0);")
    expect(sql).not.toContain("OR amount > 0) NOT VALID")
  })

  it("leaves a comment on the constraint explaining the draft-status exception for future readers", () => {
    const sql = readMigration()

    expect(sql).toContain("COMMENT ON CONSTRAINT branch_sales_ledger_drafts_amount_positive_check")
    expect(sql).toContain("ON public.branch_sales_ledger_drafts IS")
  })
})
