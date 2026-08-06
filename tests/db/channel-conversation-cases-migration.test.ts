import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260807_channel_conversation_cases.sql"
)

function migrationSql() {
  return readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n")
}

describe("channel conversation cases migration", () => {
  it("stores multiple reviewed cases per conversation without mixing source transcripts", () => {
    const sql = migrationSql()

    expect(sql).toContain("create table if not exists public.channel_conversation_cases")
    expect(sql).toContain("references public.channel_conversations(id) on delete cascade")
    expect(sql).toContain("unique (conversation_id, candidate_key)")
    expect(sql).toContain("evidence_message_ids")
    expect(sql).toContain("source_last_message_at")
  })

  it("keeps approval, cause confidence, and outcome as separate constrained states", () => {
    const sql = migrationSql()

    expect(sql).toContain("review_state in ('pending', 'approved', 'rejected')")
    expect(sql).toContain("cause_state in ('unresolved', 'suspected', 'confirmed')")
    expect(sql).toContain("'customer_confirmed_resolved'")
    expect(sql).toContain("channel_conversation_cases_confirmed_evidence_check")
  })

  it("protects the table with active-admin RLS", () => {
    const sql = migrationSql()

    expect(sql).toContain("alter table public.channel_conversation_cases enable row level security")
    expect(sql).toContain("using (public.is_active_admin())")
    expect(sql).toContain("with check (public.is_active_admin())")
  })
})
