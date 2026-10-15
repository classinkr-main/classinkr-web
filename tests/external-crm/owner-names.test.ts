import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createRecordingSupabaseClient,
  filterValue,
  type RecordedQuery,
  type RecordedQueryResolver,
} from "../helpers/recording-supabase-client"

type OwnerModule = typeof import("@/lib/external-crm/owner-names")
type OwnerClient = Parameters<OwnerModule["getXiaoshouyiOwnerNameMap"]>[0]
let owners: OwnerModule

beforeEach(async () => {
  vi.resetModules()
  owners = await import("@/lib/external-crm/owner-names")
})

function clientFor(resolve: RecordedQueryResolver) {
  const recorder = createRecordingSupabaseClient(resolve)
  return { sb: recorder.client as unknown as OwnerClient, queries: recorder.queries }
}

function page(query: RecordedQuery, rows: Array<Record<string, unknown>>, serverLimit = 1000) {
  const from = query.range?.from ?? 0
  const requested = (query.range?.to ?? rows.length - 1) - from + 1
  return {
    data: rows.slice(from, from + Math.min(serverLimit, requested)),
    error: null,
    count: query.selectOptions?.count === "exact" ? rows.length : null,
  }
}

describe("Xiaoshouyi owner directory and Korea exclusion boundary", () => {
  it("uses Korean overrides and fetches every owner even when the server clamps pages", async () => {
    const users = Array.from({ length: 5 }, (_, index) => ({ external_id: String(index), display_name: `Owner ${index}` }))
    const { sb, queries } = clientFor((query) => page(query,
      query.table === "external_crm_records" ? users : [{ external_id: "4", display_name: "HQ name", korean_name: "한국 이름" }], 2))

    const map = await owners.getXiaoshouyiOwnerNameMap(sb)
    expect(map.size).toBe(5)
    expect(map.get("4")).toBe("한국 이름")
    const userQueries = queries.filter((query) => query.table === "external_crm_records")
    expect(userQueries.map((query) => query.range?.from)).toEqual([0, 2, 4])
    expect(userQueries[0].selectOptions).toEqual({ count: "exact" })
    expect(userQueries.every((query) => query.order.some((order) => order.column === "external_id"))).toBe(true)
  })

  it.each(["external_crm_records", "crm_xiaoshouyi_owner_names"])("does not cache a failed %s lookup as an empty map", async (failedTable) => {
    let failing = true
    const { sb } = clientFor((query) => failing && query.table === failedTable
      ? { data: null, error: { message: "temporarily unavailable" } }
      : page(query, [{ external_id: "123", display_name: "새 이름", korean_name: null }]))

    await expect(owners.getXiaoshouyiOwnerNameMap(sb)).rejects.toThrow("read failed")
    failing = false
    expect((await owners.getXiaoshouyiOwnerNameMap(sb)).get("123")).toBe("새 이름")
  })

  it("never treats a failed exclusion list as permission to include every owner", async () => {
    const { sb } = clientFor(() => ({ data: null, error: { message: "scope lookup unavailable" } }))
    await expect(owners.getExcludedXiaoshouyiOwnerIds(sb)).rejects.toThrow("excluded owners read failed")
  })

  it("keeps upstream query text out of errors returned by admin routes", async () => {
    const { sb } = clientFor(() => ({ data: null, error: { code: "42501", message: "private upstream query text" } }))
    await expect(owners.getExcludedXiaoshouyiOwnerIds(sb)).rejects.toThrow("excluded owners read failed (42501)")
    await expect(owners.getExcludedXiaoshouyiOwnerIds(sb)).rejects.not.toThrow("private upstream")
  })

  it("reads the entire exclusion list with an exact count and stable order", async () => {
    const { sb, queries } = clientFor((query) => page(query, [{ external_id: "1" }, { external_id: "2" }, { external_id: "3" }], 1))
    expect([...(await owners.getExcludedXiaoshouyiOwnerIds(sb))]).toEqual(["1", "2", "3"])
    expect(queries.map((query) => query.range?.from)).toEqual([0, 1, 2])
    expect(queries.every((query) => filterValue(query, "is_excluded") === true)).toBe(true)
  })

  it("rejects a partial directory or exclusion list rather than using incomplete ownership", async () => {
    const { sb } = clientFor(() => ({ data: [], error: null, count: 1 }))
    await expect(owners.getXiaoshouyiOwnerNameMap(sb)).rejects.toThrow("read incomplete")
    await expect(owners.getExcludedXiaoshouyiOwnerIds(sb)).rejects.toThrow("read incomplete")
  })

  it("allows successful empty directories and exclusion lists", async () => {
    const { sb } = clientFor(() => ({ data: [], error: null, count: 0 }))
    expect(await owners.getXiaoshouyiOwnerNameMap(sb)).toEqual(new Map())
    expect(await owners.getExcludedXiaoshouyiOwnerIds(sb)).toEqual(new Set())
  })
})
