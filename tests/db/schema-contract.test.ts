import { describe, expect, it } from "vitest"

import {
  SCHEMA_CONTRACT_MIGRATIONS,
  SCHEMA_PROBES,
  isMissingColumnMessage,
  isMissingTableMessage,
  probeName,
  summarizeSchemaProbes,
  type SchemaProbeResult,
} from "@/lib/db/schema-contract"

const base = {
  name: "lead_magnets",
  label: "자료 퍼널 저장소",
  migration: "supabase/migrations/20260818_lead_magnets.sql",
  severity: "blocker" as const,
}

describe("summarizeSchemaProbes", () => {
  it("treats a missing schema object as a blocker with the migration as remedy", () => {
    const results: SchemaProbeResult[] = [
      { ...base, count: null, error: "테이블 없음 — 42P01" },
    ]
    const summary = summarizeSchemaProbes(results)
    expect(summary.status).toBe("blocked")
    expect(summary.blocked[0].remedy).toContain("20260818_lead_magnets.sql")
  })

  it("treats an empty-but-present table as a warning pointing at the seed command", () => {
    const results: SchemaProbeResult[] = [
      {
        ...base,
        count: 0,
        error: null,
        minimumRows: 1,
        seedCommand: "node --env-file=.env.local scripts/import-lead-magnets.mjs",
      },
    ]
    const summary = summarizeSchemaProbes(results)
    // 스키마는 맞으므로 blocked가 아니다 — 남은 것은 데이터 이관뿐.
    expect(summary.status).toBe("warning")
    expect(summary.blocked).toHaveLength(0)
    expect(summary.warning[0].remedy).toContain("import-lead-magnets.mjs")
  })

  it("reports ok when every probe passes its row minimum", () => {
    const results: SchemaProbeResult[] = [
      { ...base, count: 7, error: null, minimumRows: 1 },
      { ...base, name: "increment_campaign_click_count()", count: null, error: null },
    ]
    expect(summarizeSchemaProbes(results).status).toBe("ok")
  })

  it("honours a probe marked warning instead of blocking the run", () => {
    const results: SchemaProbeResult[] = [
      { ...base, severity: "warning", count: null, error: "테이블 없음" },
    ]
    const summary = summarizeSchemaProbes(results)
    expect(summary.status).toBe("warning")
    expect(summary.blocked).toHaveLength(0)
  })
})

describe("오류 메시지 분류", () => {
  it("distinguishes a missing table from a missing column", () => {
    expect(isMissingTableMessage("Could not find the table 'public.lead_magnets'")).toBe(true)
    expect(isMissingTableMessage('relation "public.lead_magnets" does not exist')).toBe(true)
    expect(isMissingColumnMessage('column "click_count" does not exist')).toBe(true)
    // 컬럼 부재를 테이블 부재로 오분류하면 잘못된 조치(테이블 재생성)를 안내하게 된다.
    expect(isMissingTableMessage('column "click_count" does not exist')).toBe(false)
  })
})

describe("SCHEMA_PROBES 계약", () => {
  it("covers every migration the contract claims to verify", () => {
    const probed = new Set(SCHEMA_PROBES.map((probe) => probe.migration))
    for (const migration of SCHEMA_CONTRACT_MIGRATIONS) {
      expect(probed.has(migration), migration).toBe(true)
    }
  })

  it("keeps RPC probes side-effect free by targeting a non-existent id", () => {
    for (const probe of SCHEMA_PROBES) {
      if (probe.kind !== "rpc") continue
      // 0으로만 이뤄진 UUID — 실제 행과 겹치지 않는다.
      expect(Object.values(probe.args).join(""), probe.functionName).toMatch(/^0[0-9a-f-]*$/)
    }
  })

  it("gives every probe a stable display name", () => {
    for (const probe of SCHEMA_PROBES) {
      expect(probeName(probe).length).toBeGreaterThan(0)
    }
  })
})
