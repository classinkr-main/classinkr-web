import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

import { fetchAllAccountMasterRowsById } from "@/lib/repositories/account-master"

describe("Account master keyset pagination", () => {
  it("reads every page and advances with the last id instead of OFFSET", async () => {
    const source = Array.from({ length: 5 }, (_, index) => ({
      id: `id-${index + 1}`,
      value: index + 1,
    }))
    const fetchPage = vi.fn(async (afterId: string | null, limit: number) => {
      const start = afterId ? source.findIndex((row) => row.id === afterId) + 1 : 0
      return { data: source.slice(start, start + limit), error: null }
    })

    const rows = await fetchAllAccountMasterRowsById(fetchPage, {
      label: "test",
      pageSize: 2,
    })

    expect(rows).toEqual(source)
    expect(fetchPage.mock.calls).toEqual([
      [null, 2],
      ["id-2", 2],
      ["id-4", 2],
    ])
  })

  it("surfaces source failures instead of returning a partial account master", async () => {
    await expect(
      fetchAllAccountMasterRowsById(
        async () => ({ data: null, error: { message: "database unavailable" } }),
        { label: "customers", pageSize: 2 }
      )
    ).rejects.toThrow("customers 조회 실패: database unavailable")
  })

  it("fails explicitly at the safety ceiling instead of silently truncating", async () => {
    const source = [{ id: "id-1" }, { id: "id-2" }, { id: "id-3" }]
    await expect(
      fetchAllAccountMasterRowsById(
        async (afterId, limit) => {
          const start = afterId ? source.findIndex((row) => row.id === afterId) + 1 : 0
          return { data: source.slice(start, start + limit), error: null }
        },
        { label: "links", pageSize: 2, maxRows: 2 }
      )
    ).rejects.toThrow("안전 상한 2건을 초과")
  })

  it("keeps all four production sources off fixed row caps", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/repositories/account-master.ts"),
      "utf8"
    )

    expect(source).not.toContain(".limit(2000)")
    expect(source).not.toContain(".limit(1000)")
    expect(source).not.toContain(".limit(5000)")
    expect(source.match(/fetchAllAccountMasterRowsById\(/g)?.length).toBe(4)
  })
})
