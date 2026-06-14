import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("alpha admin base migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260614_alpha_admin_base_schema.sql"),
    "utf8"
  ).toLowerCase()

  it("reconstructs the admin, lead, and audit base schema idempotently", () => {
    expect(sql).toContain("create or replace function public.is_active_admin")
    expect(sql).toContain("create or replace function public.update_updated_at")
    expect(sql).toContain("create table if not exists public.admin_profiles")
    expect(sql).toContain("create table if not exists public.leads")
    expect(sql).toContain("create table if not exists public.audit_logs")
    expect(sql).toContain("drop policy if exists")
  })

  it("covers alpha lead attribution and follow-up fields", () => {
    expect(sql).toContain("source_detail")
    expect(sql).toContain("lead_magnet")
    expect(sql).toContain("follow_up_at")
    expect(sql).toContain("assigned_to")
    expect(sql).toContain("idx_leads_source_detail")
    expect(sql).toContain("idx_leads_follow_up_at")
  })

  it("keeps public lead submission possible while admin reads stay guarded", () => {
    expect(sql).toContain("alter table public.leads enable row level security")
    expect(sql).toContain("public can submit leads")
    expect(sql).toContain("admins read leads")
    expect(sql).toContain("public.is_active_admin()")
  })
})
