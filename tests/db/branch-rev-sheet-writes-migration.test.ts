import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

const FILE = "supabase/migrations/20261023_branch_rev_sheet_writes.sql"
// 주석을 걷어 낸 본문만 검사한다 — 주석에 적힌 문장으로 통과하지 않게.
const sql = readFileSync(join(process.cwd(), FILE), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/--[^\n]*/g, "")

function triggerFunctionBody(): string {
  const match = /CREATE OR REPLACE FUNCTION public\.prevent_branch_sales_ledger_sheet_write_mutation\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(sql)
  if (!match) throw new Error("guard function not found")
  return match[1]
}

describe("20261023 branch rev sheet writes migration", () => {
  it("다시 돌려도 안전하다(IF NOT EXISTS · DROP IF EXISTS · CREATE OR REPLACE)", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.branch_sales_ledger_sheet_writes \(/)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS branch_sales_ledger_sheet_writes_draft_created_idx\s+ON public\.branch_sales_ledger_sheet_writes \(draft_id, created_at DESC\)/)
    for (const trigger of ["branch_sales_ledger_sheet_writes_updated_at", "branch_sales_ledger_sheet_writes_guard", "branch_sales_ledger_sheet_writes_no_truncate"]) {
      expect(sql).toContain(`DROP TRIGGER IF EXISTS ${trigger} ON public.branch_sales_ledger_sheet_writes;`)
      expect(sql).toMatch(new RegExp(`CREATE TRIGGER ${trigger}\\b`))
    }
    // 맨 CREATE TABLE·CREATE INDEX(IF NOT EXISTS 없이)·ALTER ... ADD CONSTRAINT 는 재실행에서 깨진다.
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/)
    expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/)
    expect(sql).not.toMatch(/ADD CONSTRAINT/)
  })

  it("기존 표·RPC 는 고치지 않는다", () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.branch_sales_ledger_(drafts|entries)\b/)
    expect(sql).not.toMatch(/FUNCTION public\.apply_branch_sales_ledger_draft\b/)
    expect(sql).not.toMatch(/FUNCTION public\.reverse_branch_sales_ledger_entry\b/)
    expect(sql).not.toMatch(/ON public\.branch_sales_ledger_(drafts|entries)\b/)
  })

  it("계약서의 칸·제약을 갖는다", () => {
    for (const column of [
      /id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
      /draft_id UUID NOT NULL\s+REFERENCES public\.branch_sales_ledger_drafts\(id\)\s+ON DELETE RESTRICT/,
      /batch_id UUID NOT NULL/,
      /status TEXT NOT NULL/,
      /code TEXT NOT NULL/,
      /row_id TEXT,/,
      /sheet_row INTEGER,/,
      /ledger_month TEXT,/,
      /cells JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      /actor TEXT NOT NULL/,
      /error TEXT,/,
      /entry_id UUID,/,
      /created_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/,
      /written_at TIMESTAMPTZ,/,
      /updated_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/,
    ]) {
      expect(sql).toMatch(column)
    }
    expect(sql).toContain("CHECK (status IN ('sending', 'written', 'refused', 'failed', 'unknown'))")
    expect(sql).toContain("CHECK (row_id IS NULL OR row_id ~ '^r_[0-9a-hjkmnp-tv-z]{12}$')")
    expect(sql).toContain("CHECK (jsonb_typeof(cells) = 'array')")
  })

  it("RLS 를 켜고 정책을 두지 않는다(service_role 만)", () => {
    expect(sql).toMatch(/ALTER TABLE public\.branch_sales_ledger_sheet_writes ENABLE ROW LEVEL SECURITY/)
    expect(sql).not.toMatch(/CREATE POLICY|DISABLE ROW LEVEL SECURITY|GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.prevent_branch_sales_ledger_sheet_write_mutation\(\)\s+FROM PUBLIC, anon, authenticated;/)
  })

  it("DELETE·TRUNCATE 를 막고 UPDATE 는 상태 칸만 허용한다", () => {
    expect(sql).toMatch(/CREATE TRIGGER branch_sales_ledger_sheet_writes_guard\s+BEFORE UPDATE OR DELETE ON public\.branch_sales_ledger_sheet_writes\s+FOR EACH ROW EXECUTE FUNCTION public\.prevent_branch_sales_ledger_sheet_write_mutation\(\);/)
    expect(sql).toMatch(/CREATE TRIGGER branch_sales_ledger_sheet_writes_no_truncate\s+BEFORE TRUNCATE ON public\.branch_sales_ledger_sheet_writes\s+FOR EACH STATEMENT/)

    const body = triggerFunctionBody()
    expect(body).toMatch(/TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE'/)
    // 고정 칸은 전부 IS DISTINCT FROM 으로 막고, 상태 칸(status·code·written_at·entry_id·error·updated_at)은 열어 둔다.
    const locked = [...body.matchAll(/NEW\.(\w+) IS DISTINCT FROM OLD\.\1/g)].map((match) => match[1]).sort()
    expect(locked).toEqual(["actor", "batch_id", "cells", "created_at", "draft_id", "id", "ledger_month", "row_id", "sheet_row"].sort())
    for (const open of ["status", "code", "written_at", "entry_id", "error", "updated_at"]) {
      expect(locked).not.toContain(open)
    }
    expect(body).toMatch(/NEW\.status = 'sending' AND OLD\.status IS DISTINCT FROM 'sending'/)
  })

  it("updated_at 은 공용 트리거로 갱신한다", () => {
    expect(sql).toMatch(/CREATE TRIGGER branch_sales_ledger_sheet_writes_updated_at\s+BEFORE UPDATE ON public\.branch_sales_ledger_sheet_writes\s+FOR EACH ROW EXECUTE FUNCTION public\.update_updated_at\(\);/)
  })

  it("시트 쓰기 반영 전용 장부 적용 RPC — 초안을 잠그고 updated_at 이 그대로일 때만 기존 apply 를 부른다", () => {
    const match = /CREATE OR REPLACE FUNCTION public\.apply_branch_sales_ledger_draft_if_unchanged\(\s*p_draft_id UUID,\s*p_actor TEXT,\s*p_expected_updated_at TIMESTAMPTZ\s*\)\s*RETURNS public\.branch_sales_ledger_drafts\s*LANGUAGE plpgsql\s*SECURITY DEFINER\s*SET search_path = public\s*AS \$\$([\s\S]*?)\$\$;/.exec(sql)
    expect(match).not.toBeNull()
    const body = match?.[1] ?? ""
    // 잠금 → 상태 → 비교 → 적용 순서(비교와 적용 사이에 고쳐질 틈이 없다).
    const lock = body.search(/FROM public\.branch_sales_ledger_drafts\s+WHERE id = p_draft_id\s+FOR UPDATE;/)
    const notChecked = body.search(/IF NOT FOUND OR v_draft\.status IS DISTINCT FROM 'checked' THEN\s+RETURN NULL;/)
    const changed = body.search(/IF p_expected_updated_at IS NULL OR v_draft\.updated_at IS DISTINCT FROM p_expected_updated_at THEN\s+RAISE EXCEPTION 'branch_sales_ledger_draft_changed'/)
    const apply = body.search(/SELECT \* INTO v_draft FROM public\.apply_branch_sales_ledger_draft\(p_draft_id, p_actor\);/)
    expect([lock, notChecked, changed, apply].every((index) => index >= 0)).toBe(true)
    expect(lock).toBeLessThan(notChecked)
    expect(notChecked).toBeLessThan(changed)
    expect(changed).toBeLessThan(apply)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.apply_branch_sales_ledger_draft_if_unchanged\(UUID, TEXT, TIMESTAMPTZ\)\s+FROM PUBLIC, anon, authenticated;/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_branch_sales_ledger_draft_if_unchanged\(UUID, TEXT, TIMESTAMPTZ\)\s+TO service_role;/)

    const probe = SCHEMA_PROBES.find((entry) => entry.kind === "rpc" && entry.functionName === "apply_branch_sales_ledger_draft_if_unchanged")
    expect(probe).toMatchObject({
      kind: "rpc",
      migration: FILE,
      catalogIdentityTypes: "uuid, text, timestamp with time zone",
      serviceRoleOnly: true,
      severity: "warning",
    })
    // 실행 프로브 금지(장부에 쓰는 함수) — 카탈로그만 본다.
    if (probe?.kind === "rpc") expect(probe.args).toBeUndefined()
  })

  it("check:db 계약에 표·칸 프로브가 있다(스위치가 꺼져 있으면 영향 없으므로 warning)", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(FILE)
    const probe = SCHEMA_PROBES.find((entry) => entry.migration === FILE)
    expect(probe).toMatchObject({ kind: "table", table: "branch_sales_ledger_sheet_writes", severity: "warning" })
    if (probe?.kind !== "table") throw new Error("Missing table readiness probe")
    expect([...probe.columns].sort()).toEqual([
      "actor", "batch_id", "cells", "code", "created_at", "draft_id", "entry_id", "error", "id", "ledger_month",
      "row_id", "sheet_row", "status", "updated_at", "written_at",
    ])
  })
})
