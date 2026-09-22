import { beforeEach, describe, expect, it, vi } from "vitest"

// T5·T6(§11.3) — crm-tag-rules.ts 저장소. applyAutoTagRules(적용/제거/manual 보존/dryRun/
// last_run 갱신)를 중심으로, 정의·규칙 CRUD와 이름 변경 시 정의 동기화도 함께 고정한다.

type Row = Record<string, unknown>

const tables: Record<string, Row[]> = {
  crm_tag_definitions: [],
  crm_tag_rules: [],
  crm_customer_tags: [],
}

function resetTables() {
  tables.crm_tag_definitions = []
  tables.crm_tag_rules = []
  tables.crm_customer_tags = []
}

function matches(row: Row, filters: Array<{ field: string; op: "eq" | "in"; value: unknown }>) {
  return filters.every((f) => {
    if (f.op === "eq") return row[f.field] === f.value
    return Array.isArray(f.value) && (f.value as unknown[]).includes(row[f.field])
  })
}

// select/order/eq/in/update/delete/upsert/maybeSingle을 지원하는 최소 범용 페이크.
// crm-customer-tags-admin.test.ts류의 전용 빌더 대신, crm-tag-rules.ts가 3개 테이블에 쓰는
// 조합이 다양해(정의 upsert, 규칙 update+select, 태그 upsert 배열+delete 다중 eq) 하나로 묶었다.
function buildQuery(tableName: string) {
  const filters: Array<{ field: string; op: "eq" | "in"; value: unknown }> = []
  let mode: "select" | "update" | "delete" | "upsert" = "select"
  let updatePatch: Row | null = null
  let upsertPayload: Row | Row[] | null = null
  let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {}

  function execute(): { data: Row[] | null; error: { message: string } | null } {
    const rows = tables[tableName]
    if (mode === "select") {
      return { data: rows.filter((row) => matches(row, filters)), error: null }
    }
    if (mode === "update") {
      const updated: Row[] = []
      tables[tableName] = rows.map((row) => {
        if (!matches(row, filters)) return row
        const next = { ...row, ...updatePatch, updated_at: new Date().toISOString() }
        updated.push(next)
        return next
      })
      return { data: updated, error: null }
    }
    if (mode === "delete") {
      tables[tableName] = rows.filter((row) => !matches(row, filters))
      return { data: null, error: null }
    }
    if (mode === "upsert") {
      const conflictKeys = (upsertOptions.onConflict ?? "").split(",").filter(Boolean)
      const payloads = Array.isArray(upsertPayload) ? upsertPayload : [upsertPayload as Row]
      const results: Row[] = []
      let current = tables[tableName]
      for (const payload of payloads) {
        const idx = conflictKeys.length
          ? current.findIndex((row) => conflictKeys.every((key) => row[key] === payload[key]))
          : -1
        if (idx >= 0) {
          if (upsertOptions.ignoreDuplicates) {
            results.push(current[idx])
            continue
          }
          current = current.map((row, i) => (i === idx ? { ...row, ...payload, updated_at: new Date().toISOString() } : row))
          results.push(current[idx])
        } else {
          const defaults: Row =
            tableName === "crm_tag_definitions" ? { category: "manual", description: null, is_auto: false } : {}
          const timestamps: Row =
            tableName === "crm_customer_tags"
              ? { created_at: "2026-09-01T00:00:00Z" }
              : { created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }
          const created = { ...defaults, ...timestamps, ...payload }
          current = [...current, created]
          results.push(created)
        }
      }
      tables[tableName] = current
      return { data: results, error: null }
    }
    return { data: null, error: null }
  }

  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    eq(field: string, value: unknown) {
      filters.push({ field, op: "eq", value })
      return api
    },
    in(field: string, value: unknown) {
      filters.push({ field, op: "in", value })
      return api
    },
    update(patch: Row) {
      mode = "update"
      updatePatch = patch
      return api
    },
    delete() {
      mode = "delete"
      return api
    },
    upsert(payload: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
      mode = "upsert"
      upsertPayload = payload
      upsertOptions = options
      return api
    },
    maybeSingle() {
      const { data, error } = execute()
      return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error })
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(execute()).then(onFulfilled, onRejected)
    },
  }
  return api
}

const mocks = vi.hoisted(() => ({
  getCrmUnifiedCustomers: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: (tableName: string) => buildQuery(tableName) })),
}))

vi.mock("@/lib/repositories/crm-unified-customers", () => ({
  getCrmUnifiedCustomers: mocks.getCrmUnifiedCustomers,
}))

import {
  applyAutoTagRules,
  listTagDefinitions,
  listTagRules,
  setTagRuleEnabled,
  syncTagDefinitionsOnRename,
  upsertTagDefinition,
} from "@/lib/repositories/crm-tag-rules"

const NOW = new Date("2026-09-22T00:00:00.000Z").getTime()
const DAY_MS = 86_400_000

function unifiedRow(overrides: Row): Row {
  return {
    key: "neo_account:1",
    source: "neo_account",
    score: 50,
    lifecycle: "active",
    balance: null,
    expireAt: null,
    lastContactAt: null,
    ...overrides,
  }
}

function pageOf(rows: Row[]) {
  return {
    rows,
    pagination: { limit: 2000, offset: 0, returned: rows.length, total: rows.length, hasMore: false, nextOffset: null },
  }
}

function ruleRow(overrides: Row): Row {
  return {
    id: "rule-1",
    tag: "재계약",
    rule_type: "expiring_within_days",
    params: { days: 30 },
    target_types: ["neo_account"],
    enabled: true,
    last_run_at: null,
    last_applied: null,
    last_removed: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  }
}

beforeEach(() => {
  resetTables()
  mocks.getCrmUnifiedCustomers.mockReset()
})

describe("listTagDefinitions / upsertTagDefinition", () => {
  it("빈 테이블이면 빈 배열", async () => {
    expect(await listTagDefinitions()).toEqual([])
  })

  it("upsert 후 정의를 조회하면 저장된 category가 보인다", async () => {
    const created = await upsertTagDefinition("VIP", "segment")
    expect(created).toMatchObject({ tag: "VIP", category: "segment", isAuto: false })
    const list = await listTagDefinitions()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ tag: "VIP", category: "segment" })
  })

  it("같은 태그를 다시 upsert하면 category만 바뀌고 새 행이 생기지 않는다", async () => {
    await upsertTagDefinition("VIP", "segment")
    await upsertTagDefinition("VIP", "risk")
    const list = await listTagDefinitions()
    expect(list).toHaveLength(1)
    expect(list[0].category).toBe("risk")
  })
})

describe("listTagRules / setTagRuleEnabled", () => {
  it("규칙을 조회하고 enabled를 토글한다", async () => {
    tables.crm_tag_rules = [ruleRow({})]
    const [rule] = await listTagRules()
    expect(rule).toMatchObject({ tag: "재계약", ruleType: "expiring_within_days", enabled: true })

    const updated = await setTagRuleEnabled(rule.id, false)
    expect(updated.enabled).toBe(false)
    const [after] = await listTagRules()
    expect(after.enabled).toBe(false)
  })

  it("존재하지 않는 규칙 id면 에러를 던진다", async () => {
    await expect(setTagRuleEnabled("no-such-id", true)).rejects.toThrow()
  })
})

describe("syncTagDefinitionsOnRename", () => {
  it("to 정의가 없으면 from 정의(자동 우선)를 to로 승격하고 from을 지운다", async () => {
    tables.crm_tag_definitions = [
      { tag: "VIP", category: "manual", description: null, is_auto: false, created_at: "x", updated_at: "x" },
      { tag: "재계약", category: "stage", description: "d", is_auto: true, created_at: "x", updated_at: "x" },
    ]
    await syncTagDefinitionsOnRename(["VIP", "재계약"], "우수고객")
    const list = await listTagDefinitions()
    expect(list.map((d) => d.tag)).toEqual(["우수고객"])
    expect(list[0]).toMatchObject({ category: "stage", isAuto: true }) // 자동 정의가 이겼다
  })

  it("to 정의가 이미 있으면 그 category를 유지하고 from 정의만 지운다", async () => {
    tables.crm_tag_definitions = [
      { tag: "VIP", category: "manual", description: null, is_auto: false, created_at: "x", updated_at: "x" },
      { tag: "우수고객", category: "segment", description: null, is_auto: false, created_at: "x", updated_at: "x" },
    ]
    await syncTagDefinitionsOnRename(["VIP"], "우수고객")
    const list = await listTagDefinitions()
    expect(list.map((d) => d.tag)).toEqual(["우수고객"])
    expect(list[0].category).toBe("segment")
  })

  it("어느 from에도 정의가 없었으면 아무것도 하지 않는다", async () => {
    await syncTagDefinitionsOnRename(["없는태그"], "새이름")
    expect(await listTagDefinitions()).toEqual([])
  })
})

describe("applyAutoTagRules", () => {
  it("조건을 충족하는 대상에 자동 태그를 새로 적용한다", async () => {
    tables.crm_tag_rules = [ruleRow({})]
    mocks.getCrmUnifiedCustomers.mockResolvedValue(
      pageOf([unifiedRow({ key: "neo_account:1", expireAt: new Date(NOW + 10 * DAY_MS).toISOString() })])
    )

    const report = await applyAutoTagRules({ nowMs: NOW })
    expect(report.dryRun).toBe(false)
    expect(report.results).toEqual([
      { ruleId: "rule-1", tag: "재계약", ruleType: "expiring_within_days", matched: 1, applied: 1, removed: 0, skippedManual: 0 },
    ])
    expect(tables.crm_customer_tags).toHaveLength(1)
    expect(tables.crm_customer_tags[0]).toMatchObject({
      target_type: "neo_account",
      target_id: "1",
      tag: "재계약",
      source: "auto",
    })
  })

  it("조건을 벗어난 대상의 auto 태그만 제거하고 manual은 그대로 둔다", async () => {
    tables.crm_tag_rules = [ruleRow({})]
    tables.crm_customer_tags = [
      { target_type: "neo_account", target_id: "1", tag: "재계약", source: "auto" }, // 더 이상 조건 미충족 → 제거 대상
      { target_type: "neo_account", target_id: "2", tag: "재계약", source: "manual" }, // manual → 보존
    ]
    mocks.getCrmUnifiedCustomers.mockResolvedValue(
      pageOf([
        unifiedRow({ key: "neo_account:1", expireAt: null }), // 조건 미충족
        unifiedRow({ key: "neo_account:2", expireAt: null }), // 조건 미충족이지만 manual이라 skippedManual 아님(매칭 안 됐으므로 세지 않음)
      ])
    )

    const report = await applyAutoTagRules({ nowMs: NOW })
    expect(report.results[0]).toMatchObject({ matched: 0, applied: 0, removed: 1, skippedManual: 0 })
    expect(tables.crm_customer_tags).toEqual([
      { target_type: "neo_account", target_id: "2", tag: "재계약", source: "manual" },
    ])
  })

  it("조건을 충족하지만 이미 manual로 있으면 건드리지 않고 skippedManual로 센다", async () => {
    tables.crm_tag_rules = [ruleRow({})]
    tables.crm_customer_tags = [{ target_type: "neo_account", target_id: "1", tag: "재계약", source: "manual" }]
    mocks.getCrmUnifiedCustomers.mockResolvedValue(
      pageOf([unifiedRow({ key: "neo_account:1", expireAt: new Date(NOW + 10 * DAY_MS).toISOString() })])
    )

    const report = await applyAutoTagRules({ nowMs: NOW })
    expect(report.results[0]).toMatchObject({ matched: 1, applied: 0, removed: 0, skippedManual: 1 })
    expect(tables.crm_customer_tags).toEqual([{ target_type: "neo_account", target_id: "1", tag: "재계약", source: "manual" }])
  })

  it("dryRun이면 아무것도 쓰지 않고 건수만 계산한다(last_run_at도 갱신하지 않는다)", async () => {
    tables.crm_tag_rules = [ruleRow({})]
    mocks.getCrmUnifiedCustomers.mockResolvedValue(
      pageOf([unifiedRow({ key: "neo_account:1", expireAt: new Date(NOW + 10 * DAY_MS).toISOString() })])
    )

    const report = await applyAutoTagRules({ nowMs: NOW, dryRun: true })
    expect(report.dryRun).toBe(true)
    expect(report.results[0]).toMatchObject({ applied: 1, removed: 0 })
    expect(tables.crm_customer_tags).toEqual([])
    const [rule] = await listTagRules()
    expect(rule.lastRunAt).toBeNull()
    expect(rule.lastApplied).toBeNull()
  })

  it("실행 후 규칙의 last_run_at/last_applied/last_removed를 갱신한다", async () => {
    tables.crm_tag_rules = [ruleRow({})]
    mocks.getCrmUnifiedCustomers.mockResolvedValue(
      pageOf([unifiedRow({ key: "neo_account:1", expireAt: new Date(NOW + 10 * DAY_MS).toISOString() })])
    )

    await applyAutoTagRules({ nowMs: NOW })
    const [rule] = await listTagRules()
    expect(rule.lastRunAt).toBe(new Date(NOW).toISOString())
    expect(rule.lastApplied).toBe(1)
    expect(rule.lastRemoved).toBe(0)
  })

  it("비활성 규칙은 건너뛴다", async () => {
    tables.crm_tag_rules = [ruleRow({ enabled: false })]
    mocks.getCrmUnifiedCustomers.mockResolvedValue(pageOf([]))
    const report = await applyAutoTagRules({ nowMs: NOW })
    expect(report.results).toEqual([])
    expect(mocks.getCrmUnifiedCustomers).not.toHaveBeenCalled()
  })

  it("target_types에 없는 소스 행은 대상에서 제외한다", async () => {
    tables.crm_tag_rules = [ruleRow({ target_types: ["neo_account"] })]
    mocks.getCrmUnifiedCustomers.mockResolvedValue(
      pageOf([unifiedRow({ key: "lead:1", source: "lead", expireAt: new Date(NOW + 10 * DAY_MS).toISOString() })])
    )
    const report = await applyAutoTagRules({ nowMs: NOW })
    expect(report.results[0]).toMatchObject({ matched: 0, applied: 0 })
    expect(tables.crm_customer_tags).toEqual([])
  })
})
