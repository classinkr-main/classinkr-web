import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260827_repair_increment_campaign_click_count.sql"
)
const migrationSql = readFileSync(migrationPath, "utf8")
const columnMigrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260818_email_campaign_metrics.sql"),
  "utf8"
)
const rollbackPath = join(
  process.cwd(),
  "supabase/rollbacks/20260827_repair_increment_campaign_click_count.rollback.sql"
)
const rollbackSql = readFileSync(rollbackPath, "utf8")

describe("increment_campaign_click_count repair migration", () => {
  it("keeps the PostgREST argument name and atomic update used by the click route", () => {
    expect(migrationSql).toMatch(
      /function public\.increment_campaign_click_count\(campaign_id uuid\)/i
    )
    expect(migrationSql).toMatch(/set click_count = campaign\.click_count \+ 1/i)
    expect(migrationSql).toMatch(/where campaign\.id = campaign_id/i)
  })

  it("limits the SECURITY DEFINER function to service_role", () => {
    expect(migrationSql).toMatch(/security definer\s+set search_path = ''/i)
    expect(migrationSql).toMatch(
      /revoke all on function public\.increment_campaign_click_count\(uuid\) from public/i
    )
    expect(migrationSql).toMatch(
      /grant execute on function public\.increment_campaign_click_count\(uuid\) to service_role/i
    )
    expect(migrationSql).not.toMatch(
      /grant execute on function public\.increment_campaign_click_count\(uuid\) to (?:public|anon|authenticated)/i
    )
  })

  it("keeps the prerequisite migration secure when it is applied to a fresh environment", () => {
    expect(columnMigrationSql).toMatch(/security definer\s+set search_path = ''/i)
    expect(columnMigrationSql).toMatch(
      /revoke all on function public\.increment_campaign_click_count\(uuid\) from public/i
    )
    expect(columnMigrationSql).toMatch(
      /grant execute on function public\.increment_campaign_click_count\(uuid\) to service_role/i
    )
  })

  it("points the live schema probe at the forward repair migration", () => {
    const probe = SCHEMA_PROBES.find(
      (candidate) =>
        candidate.kind === "rpc" &&
        candidate.functionName === "increment_campaign_click_count"
    )

    expect(probe?.migration).toBe(
      "supabase/migrations/20260827_repair_increment_campaign_click_count.sql"
    )
    expect(migrationSql).toMatch(/notify pgrst, 'reload schema'/i)
  })

  it("orders the click_count column migration before the RPC repair", () => {
    const columnMigration = SCHEMA_CONTRACT_MIGRATIONS.indexOf(
      "supabase/migrations/20260818_email_campaign_metrics.sql"
    )
    const rpcMigration = SCHEMA_CONTRACT_MIGRATIONS.indexOf(
      "supabase/migrations/20260827_repair_increment_campaign_click_count.sql"
    )

    expect(columnMigration).toBeGreaterThanOrEqual(0)
    expect(rpcMigration).toBeGreaterThan(columnMigration)
    expect(migrationSql).toContain("선행조건: 20260818_email_campaign_metrics.sql")
  })

  it("ships an exact-signature rollback without touching campaign data", () => {
    expect(rollbackSql).toMatch(
      /drop function if exists public\.increment_campaign_click_count\(uuid\)/i
    )
    expect(rollbackSql).toMatch(/notify pgrst, 'reload schema'/i)
    expect(rollbackSql).not.toMatch(/drop\s+(?:table|schema)|delete\s+from|truncate/i)
  })
})
