import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260806_lead_digest_runs.sql"),
  "utf8"
)
const channelMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260806_wecom_lead_report_channel.sql"),
  "utf8"
)

describe("lead digest run migration", () => {
  it("keeps Meta and homepage delivery independently retryable and deduplicated", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.lead_digest_runs")
    expect(migration).toContain("CHECK (report_type IN ('meta', 'homepage'))")
    expect(migration).toContain("CHECK (status IN ('pending', 'sent', 'failed'))")
    expect(migration).toContain("UNIQUE (report_type, window_end)")
    expect(migration).toContain("ALTER TABLE public.lead_digest_runs ENABLE ROW LEVEL SECURITY")
  })

  it("separates lead reports from the disabled operations webhook", () => {
    expect(channelMigration).toContain("wecom_lead_report_webhook_url TEXT")
    expect(channelMigration).toContain(
      "wecom_ops_webhook_enabled BOOLEAN NOT NULL DEFAULT true"
    )
  })
})
