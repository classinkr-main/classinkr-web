import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

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

// autocrlf 체크아웃에서도 여러 줄 패턴이 깨지지 않게 줄끝을 정규화한다.
function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n")
}

function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
}

const PG_TYPE_ALIASES: Record<string, string> = { int: "integer", int4: "integer", bool: "boolean" }

/** SQL 인자 타입 목록을 pg_proc oidvectortypes 표기("integer, boolean")로 맞춘다. */
function normalizeTypeList(types: string[]): string {
  return types
    .map((type) => type.trim().toLowerCase().replace(/\s+/g, " "))
    .map((type) => PG_TYPE_ALIASES[type] ?? type)
    .join(", ")
}

/** 마이그레이션의 CREATE FUNCTION 인자 목록에서 식별 타입을 뽑는다(이름·DEFAULT 제거). */
function identityTypesFromMigration(sql: string, functionName: string): string | null {
  const match = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(([^)]*)\\)`,
    "i"
  ).exec(stripSqlComments(sql))
  if (!match) return null
  return normalizeTypeList(
    match[1].split(",").map((arg) =>
      arg
        .trim()
        .replace(/\s+default\s+[\s\S]*$/i, "")
        .split(/\s+/)
        .slice(1)
        .join(" ")
    )
  )
}

/** 주어진 시그니처에 대해 REVOKE 된 역할 집합(여러 문장에 나뉘어 있어도 합친다). */
function revokedRoles(sql: string, functionName: string, identityTypes: string): Set<string> {
  const roles = new Set<string>()
  const pattern = new RegExp(
    `revoke\\s+(?:all|execute)\\s+on\\s+function\\s+public\\.${functionName}\\s*\\(([^)]*)\\)\\s+from\\s+([^;]+);`,
    "gi"
  )
  for (const match of stripSqlComments(sql).matchAll(pattern)) {
    if (normalizeTypeList(match[1].split(",")) !== identityTypes) continue
    for (const role of match[2].split(",")) roles.add(role.trim().toLowerCase())
  }
  return roles
}

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
      if (probe.catalogIdentityTypes) continue
      // 0으로만 이뤄진 UUID — 실제 행과 겹치지 않는다.
      expect(JSON.stringify(probe.args), probe.functionName).toContain(
        "00000000-0000-4000-8000-000000000000"
      )
    }
  })

  it("checks the guarded assignment RPC through the catalog without executing it", () => {
    const probe = SCHEMA_PROBES.find(
      (candidate) => candidate.kind === "rpc" && candidate.functionName === "assign_leads_guarded"
    )
    expect(probe?.kind === "rpc" && probe.catalogIdentityTypes).toBe(
      "uuid[], text, jsonb, text, text, text, text"
    )
    expect(probe?.kind === "rpc" && probe.serviceRoleOnly).toBe(true)
  })

  it("gives every probe a stable display name", () => {
    for (const probe of SCHEMA_PROBES) {
      expect(probeName(probe).length).toBeGreaterThan(0)
    }
  })
})

// RLS anon 프로브(2026-08-18) — 메타데이터가 아니라 실제 노출 여부로 판정한다.
describe("anon RLS 프로브 판정", () => {
  const anonBase = {
    name: "blog_posts (anon)",
    label: "비공개 글 anon 노출 차단",
    migration: "supabase/migrations/20260818_rls_blog_posts_patch_notes.sql",
    severity: "blocker" as const,
    count: null,
    error: null,
  }

  it("blocks when anon can actually read forbidden rows", () => {
    const summary = summarizeSchemaProbes([
      { ...anonBase, anonVisibleRows: 12, forbiddenRowsExist: 12 },
    ])
    expect(summary.status).toBe("blocked")
    expect(summary.blocked[0].message).toContain("12건")
  })

  it("passes only when forbidden rows exist and anon sees none", () => {
    const summary = summarizeSchemaProbes([
      { ...anonBase, anonVisibleRows: 0, forbiddenRowsExist: 12 },
    ])
    expect(summary.status).toBe("ok")
  })

  it("refuses to call it verified when there are no forbidden rows to hide", () => {
    // 대상 행이 0건이면 anon이 0건을 보는 것은 RLS를 증명하지 않는다(위양성 방지).
    const summary = summarizeSchemaProbes([
      { ...anonBase, anonVisibleRows: 0, forbiddenRowsExist: 0 },
    ])
    expect(summary.status).toBe("warning")
    expect(summary.warning[0].message).toContain("검증 불가")
    expect(summary.ok).toHaveLength(0)
  })

  it("passes an empty deny-all table when catalog metadata proves RLS and no anon policy", () => {
    const summary = summarizeSchemaProbes([
      {
        ...anonBase,
        anonVisibleRows: 0,
        forbiddenRowsExist: 0,
        metadataProtected: true,
        metadataEvidence: "RLS ON, anon/public SELECT 정책 0개",
      },
    ])
    expect(summary.status).toBe("ok")
    expect(summary.ok).toHaveLength(1)
  })

  it("blocks an empty deny-all table when catalog metadata disproves protection", () => {
    const summary = summarizeSchemaProbes([
      {
        ...anonBase,
        anonVisibleRows: 0,
        forbiddenRowsExist: 0,
        metadataProtected: false,
        metadataEvidence: "RLS OFF, anon/public SELECT 정책 0개",
      },
    ])
    expect(summary.status).toBe("blocked")
    expect(summary.blocked[0].message).toContain("RLS OFF")
  })

  it("reports a skipped probe as a warning, never as a pass", () => {
    const summary = summarizeSchemaProbes([{ ...anonBase, skipped: true }])
    expect(summary.status).toBe("warning")
    expect(summary.ok).toHaveLength(0)
  })
})

describe("SCHEMA_PROBES — RLS 등재", () => {
  it("covers both tables the audit found without RLS", () => {
    const anonTables = SCHEMA_PROBES.filter((p) => p.kind === "anon").map((p) => p.table)
    expect(anonTables).toContain("blog_posts")
    expect(anonTables).toContain("patch_notes")
  })

  it("targets non-published posts as the forbidden set for blog_posts", () => {
    const probe = SCHEMA_PROBES.find((p) => p.kind === "anon" && p.table === "blog_posts")
    expect(probe?.kind === "anon" && probe.forbidden).toEqual({
      operator: "neq",
      column: "status",
      value: "PUBLISHED",
    })
  })
})

// 계약 ↔ 마이그레이션 원문 대조. 프로브가 파일과 어긋나면 check:db 가 멀쩡한 DB 를 막거나
// (시그니처 오타), 반대로 미적용을 놓친다(컬럼 누락) — 둘 다 DB 없이 여기서 먼저 잡는다.
describe("SCHEMA_PROBES — 마이그레이션 원문 대조", () => {
  it("lists only migration files that exist, each once", () => {
    for (const migration of SCHEMA_CONTRACT_MIGRATIONS) {
      expect(existsSync(join(process.cwd(), migration)), migration).toBe(true)
    }
    expect(new Set(SCHEMA_CONTRACT_MIGRATIONS).size).toBe(SCHEMA_CONTRACT_MIGRATIONS.length)
  })

  it("lists every migration a probe points at", () => {
    const listed = new Set<string>(SCHEMA_CONTRACT_MIGRATIONS)
    for (const probe of SCHEMA_PROBES) {
      expect(listed.has(probe.migration), probeName(probe)).toBe(true)
    }
  })

  it("keeps each catalog RPC probe's identity types in step with its migration", () => {
    for (const probe of SCHEMA_PROBES) {
      if (probe.kind !== "rpc" || !probe.catalogIdentityTypes) continue
      // scripts/check-db-schema.ts 는 이 형식이 아니면 카탈로그 조회를 거부한다.
      expect(probe.catalogIdentityTypes, probe.functionName).toMatch(/^[a-z0-9_[\], ]+$/i)
      // 카탈로그 프로브는 호출하지 않는다 — 인자를 적어 두면 실행 프로브로 오해하게 된다.
      expect(probe.args, probe.functionName).toBeUndefined()
      expect(
        identityTypesFromMigration(readRepoFile(probe.migration), probe.functionName),
        probe.functionName
      ).toBe(probe.catalogIdentityTypes)
    }
  })

  it("backs every service-role-only probe with a REVOKE from anon and authenticated", () => {
    for (const probe of SCHEMA_PROBES) {
      if (probe.kind !== "rpc" || !probe.serviceRoleOnly || !probe.catalogIdentityTypes) continue
      const roles = revokedRoles(
        readRepoFile(probe.migration),
        probe.functionName,
        probe.catalogIdentityTypes
      )
      expect([...roles], probe.functionName).toEqual(
        expect.arrayContaining(["public", "anon", "authenticated"])
      )
    }
  })

  it("checks the stale-first CRM overview RPC through the catalog without executing it", () => {
    const probe = SCHEMA_PROBES.find(
      (candidate) =>
        candidate.kind === "rpc" && candidate.functionName === "admin_crm_business_overview"
    )
    expect(probe?.migration).toBe(
      "supabase/migrations/20260910_admin_crm_overview_stale_first.sql"
    )
    // 스냅샷 쓰기·advisory lock 이 있는 SECURITY DEFINER 함수 — 3인자 시그니처만 존재해야 한다.
    expect(probe?.kind === "rpc" && probe.catalogIdentityTypes).toBe("integer, boolean, integer")
    expect(probe?.kind === "rpc" && probe.serviceRoleOnly).toBe(true)
  })

  it("probes every column the webhook toggle migration adds to site_settings", () => {
    const migration =
      "supabase/migrations/20260907_site_settings_webhook_toggles_and_schedule.sql"
    const added = [...readRepoFile(migration).matchAll(/add column if not exists (\w+)/gi)].map(
      (match) => match[1]
    )
    expect(added).toEqual(["webhook_enabled_json", "notification_schedule_json"])

    const probe = SCHEMA_PROBES.find(
      (candidate) => candidate.kind === "table" && candidate.migration === migration
    )
    expect(probe?.kind === "table" && probe.table).toBe("site_settings")
    for (const column of added) {
      expect(probe?.kind === "table" && probe.columns, column).toContain(column)
    }
  })

  it("keeps the CHECK-only lead digest migration out of the contract and documents how to verify it", () => {
    const migration = "supabase/migrations/20260907_lead_digest_runs_daily_type.sql"
    // CHECK 허용 집합은 REST 로 볼 수 없다 — 프로브를 지어내지 않는다.
    expect(readRepoFile(migration)).not.toMatch(/add\s+column|create\s+(?:table|function|view)/i)
    expect(SCHEMA_CONTRACT_MIGRATIONS).not.toContain(migration)
    expect(SCHEMA_PROBES.some((probe) => probe.migration === migration)).toBe(false)

    // 대신 계약 파일 주석에 적용 확인 조회를 남긴다.
    const contract = readRepoFile("lib/db/schema-contract.ts")
    expect(contract).toContain("20260907_lead_digest_runs_daily_type.sql")
    expect(contract).toContain("conname = 'lead_digest_runs_report_type_check'")
  })
})
