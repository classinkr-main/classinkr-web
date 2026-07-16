import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260716_internal_cs_multimodal_bridge.sql"
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

describe("internal CS multimodal bridge migration", () => {
  it("creates a size- and MIME-limited private image bucket", () => {
    const sql = readMigration()

    expect(sql).toContain("'internal-cs-assets'")
    expect(sql).toContain("false,")
    expect(sql).toContain("8388608")
    expect(sql).toContain("ARRAY['image/jpeg', 'image/png', 'image/webp']")
  })

  it("keeps original assets, AI analysis, and human review state together", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.internal_cs_assets")
    expect(sql).toContain("REFERENCES public.internal_cs_conversations(id) ON DELETE CASCADE")
    expect(sql).toContain("UNIQUE (conversation_id, sha256)")
    expect(sql).toContain("CHECK (status IN ('uploaded', 'analyzing', 'ready', 'failed'))")
    expect(sql).toContain("CHECK (review_state IN ('pending', 'approved', 'changes_requested', 'rejected'))")
    expect(sql).toContain("internal_cs_assets_pending_review_idx")
  })

  it("creates replay-safe integration audit events with indexed foreign keys", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.internal_cs_integration_events")
    expect(sql).toContain("UNIQUE (direction, source_system, idempotency_key)")
    expect(sql).toContain("internal_cs_integration_events_conversation_idx")
    expect(sql).toContain("internal_cs_integration_events_asset_idx")
    expect(sql).toContain("internal_cs_integration_events_processing_idx")
  })

  it("limits table and storage access to active authenticated admins", () => {
    const sql = readMigration()

    expect(sql).toContain("ALTER TABLE public.internal_cs_assets ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE public.internal_cs_integration_events ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("TO authenticated")
    expect(sql).toContain("public.is_active_admin()")
    expect(sql).toContain("REVOKE ALL ON TABLE public.internal_cs_assets FROM anon")
    expect(sql).toContain("bucket_id = 'internal-cs-assets' AND public.is_active_admin()")
  })
})
