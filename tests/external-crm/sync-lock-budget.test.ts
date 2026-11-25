import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }))

import {
  DEFAULT_SYNC_TIME_BUDGET_MS,
  SERVER_RUN_STALE_MS,
  getSyncTimeBudgetMs,
  isForeignSyncRun,
  isLiveSyncRun,
} from "@/lib/external-crm/xiaoshouyi-sync"

// NEO 동기화 잠금·시간 예산 (2026-11-23) — 함수 상한(300초)으로 끊긴 런이 30분 동안 잠금으로 남아
// 수동·크론 동기화가 전부 200 `locked` 로 아무것도 안 하던 문제.

const NOW = Date.parse("2026-11-23T06:00:00.000Z")
const ago = (ms: number) => new Date(NOW - ms).toISOString()

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("isLiveSyncRun", () => {
  it("이 서버의 런은 heartbeat 가 6분 안에 있어야 살아 있다", () => {
    expect(isLiveSyncRun({ updated_at: ago(60_000), metadata: { heartbeatAt: ago(60_000) } }, NOW)).toBe(true)
    expect(isLiveSyncRun({ updated_at: ago(SERVER_RUN_STALE_MS + 1), metadata: {} }, NOW)).toBe(false)
    expect(isLiveSyncRun({ updated_at: ago(10 * 60_000), metadata: null }, NOW)).toBe(false)
  })

  it("로컬 MCP 스크립트 런(metadata.via)은 heartbeat 가 없어 30분 창을 유지한다", () => {
    const via = { via: "eeocrm-personal-mcp" }
    expect(isForeignSyncRun(via)).toBe(true)
    expect(isLiveSyncRun({ updated_at: ago(20 * 60_000), metadata: via }, NOW)).toBe(true)
    expect(isLiveSyncRun({ updated_at: ago(31 * 60_000), metadata: via }, NOW)).toBe(false)
  })

  it("시각을 못 읽으면 살아 있지 않다", () => {
    expect(isLiveSyncRun({ updated_at: null }, NOW)).toBe(false)
    expect(isLiveSyncRun({ updated_at: "not-a-date" }, NOW)).toBe(false)
  })

  it("죽은 런 판정 창은 라우트 maxDuration(300초)보다 길다 — 살아 있는 런을 죽었다고 보지 않게", () => {
    expect(SERVER_RUN_STALE_MS).toBeGreaterThan(300_000)
    for (const path of ["app/api/admin/crm/external-sync/route.ts", "app/api/cron/sync-external-crm/route.ts"]) {
      expect(readFileSync(join(process.cwd(), path), "utf8")).toContain("export const maxDuration = 300")
    }
  })
})

describe("getSyncTimeBudgetMs", () => {
  it("기본 240초 — maxDuration(300초) 안에서 응답·스냅샷 재계산 여유를 남긴다", () => {
    expect(getSyncTimeBudgetMs()).toBe(DEFAULT_SYNC_TIME_BUDGET_MS)
    expect(DEFAULT_SYNC_TIME_BUDGET_MS).toBeLessThan(300_000)
  })

  it("env 로 바꿀 수 있지만 10초~270초로 묶는다", () => {
    vi.stubEnv("XIAOSHOUYI_SYNC_TIME_BUDGET_MS", "120000")
    expect(getSyncTimeBudgetMs()).toBe(120_000)
    vi.stubEnv("XIAOSHOUYI_SYNC_TIME_BUDGET_MS", "999999")
    expect(getSyncTimeBudgetMs()).toBe(270_000)
    vi.stubEnv("XIAOSHOUYI_SYNC_TIME_BUDGET_MS", "5")
    expect(getSyncTimeBudgetMs()).toBe(10_000)
    vi.stubEnv("XIAOSHOUYI_SYNC_TIME_BUDGET_MS", "abc")
    expect(getSyncTimeBudgetMs()).toBe(DEFAULT_SYNC_TIME_BUDGET_MS)
  })
})

describe("동기화 루프 계약(소스)", () => {
  const source = readFileSync(join(process.cwd(), "lib/external-crm/xiaoshouyi-sync.ts"), "utf8")

  it("객체를 시작하기 전과 페이지마다 예산을 보고, 페이지마다 코디네이터 heartbeat 를 찍는다", () => {
    expect(source).toContain("const deadlineAt = startedAtMs + getSyncTimeBudgetMs()")
    expect(source).toMatch(/if \(Date\.now\(\) >= deadlineAt\) \{[\s\S]*?error: TIME_BUDGET_ERROR/)
    expect(source).toMatch(/if \(Date\.now\(\) >= budget\.deadlineAt\) \{\s*truncated = true\s*break/)
    expect(source).toContain("onPage: () => heartbeatRun(coordinatorRunId, completed, object.objectApiKey)")
  })

  it("예산으로 건너뛴 객체는 실패가 아니고 complete=false 로 남는다", () => {
    expect(source).toContain('result.status === "success" || result.error === TIME_BUDGET_ERROR')
    expect(source).toContain("const complete = ok && budgetSkipped.length === 0")
  })
})
