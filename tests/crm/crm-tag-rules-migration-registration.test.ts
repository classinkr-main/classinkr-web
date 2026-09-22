import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

// T5·T6(§11.3) — 새 마이그레이션이 db-migration-runbook.md "새 마이그레이션을 추가할 때" 절차대로
// 등록됐는지, cron이 vercel.json에 하루 1회로 등록됐는지 고정한다.

const MIGRATION_PATH = "supabase/migrations/20260922_crm_tag_definitions_and_rules.sql"

describe("20260922_crm_tag_definitions_and_rules.sql 등록", () => {
  it("마이그레이션 파일이 실제로 존재한다", () => {
    expect(existsSync(join(process.cwd(), MIGRATION_PATH))).toBe(true)
  })

  it("SCHEMA_CONTRACT_MIGRATIONS에 등록되어 있다", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(MIGRATION_PATH)
  })

  it("SCHEMA_PROBES에 crm_tag_definitions·crm_tag_rules·crm_customer_tags(source) 3개 프로브가 있다", () => {
    const forThisMigration = SCHEMA_PROBES.filter((probe) => probe.migration === MIGRATION_PATH)
    expect(forThisMigration).toHaveLength(3)
    const tableNames = forThisMigration.map((probe) => (probe.kind === "table" ? probe.table : null))
    expect(tableNames).toEqual(["crm_tag_definitions", "crm_tag_rules", "crm_customer_tags"])
  })

  it("마이그레이션 SQL이 idempotent 구문(CREATE TABLE IF NOT EXISTS·ADD COLUMN IF NOT EXISTS·ON CONFLICT)을 쓴다", () => {
    const sql = readFileSync(join(process.cwd(), MIGRATION_PATH), "utf8")
    expect(sql).toMatch(/create table if not exists public\.crm_tag_definitions/i)
    expect(sql).toMatch(/create table if not exists public\.crm_tag_rules/i)
    expect(sql).toMatch(/add column if not exists source/i)
    expect(sql).toMatch(/on conflict \(tag, rule_type\) do nothing/i)
    expect(sql).toMatch(/on conflict \(tag\) do nothing/i)
  })

  it("crm_tag_rules와 crm_tag_definitions에 RLS를 켠다(deny-all 관례)", () => {
    const sql = readFileSync(join(process.cwd(), MIGRATION_PATH), "utf8")
    expect(sql).toMatch(/alter table public\.crm_tag_definitions enable row level security/i)
    expect(sql).toMatch(/alter table public\.crm_tag_rules enable row level security/i)
  })

  it("category CHECK가 T6이 정한 5종 enum과 일치한다", () => {
    const sql = readFileSync(join(process.cwd(), MIGRATION_PATH), "utf8")
    expect(sql).toMatch(/category in \('segment', 'stage', 'risk', 'product', 'manual'\)/i)
  })
})

describe("vercel.json crm-auto-tags cron 등록", () => {
  const vercelConfig = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>
  }

  it("/api/cron/crm-auto-tags 항목이 있고 하루 1회 스케줄이다", () => {
    const entry = vercelConfig.crons.find((cron) => cron.path === "/api/cron/crm-auto-tags")
    expect(entry).toBeDefined()
    expect(entry?.schedule).toBe("0 20 * * *")
    // "분 시 * * *" 형태 — 일 단위(day-of-month/month/day-of-week 전부 *)만 하루 1회로 본다.
    const fields = entry?.schedule.split(" ") ?? []
    expect(fields).toHaveLength(5)
    expect(fields[2]).toBe("*")
    expect(fields[3]).toBe("*")
    expect(fields[4]).toBe("*")
  })

  it("cron 라우트 파일이 실제로 존재한다", () => {
    expect(existsSync(join(process.cwd(), "app/api/cron/crm-auto-tags/route.ts"))).toBe(true)
  })
})
