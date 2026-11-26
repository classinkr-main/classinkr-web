import { beforeEach, describe, expect, it, vi } from "vitest"

// listConfirmedLeadCustomerLinks: 단일 .limit(5000)은 PostgREST max-rows(1000)에서 조용히 잘려
// 오름차순 정렬의 최신 확정 링크가 빠졌다. range 페이지로 전량 읽고 오류는 던진다.

const createClient = vi.hoisted(() => vi.fn())
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: createClient }))

const SERVER_MAX_ROWS = 1000

function pagedClient(total: number, options?: { failAtFrom?: number }) {
  const ranges: Array<[number, number]> = []
  const orders: string[] = []
  const client = {
    from() {
      let range: [number, number] = [0, SERVER_MAX_ROWS - 1]
      const chain: Record<string, unknown> = {}
      for (const method of ["select", "eq"]) chain[method] = () => chain
      chain.order = (column: string) => {
        orders.push(column)
        return chain
      }
      chain.range = (from: number, to: number) => {
        range = [from, to]
        ranges.push(range)
        return chain
      }
      chain.then = (resolve: (value: unknown) => unknown) => {
        const [from, to] = range
        if (options?.failAtFrom === from) {
          return Promise.resolve({ data: null, error: { message: "boom" }, count: null }).then(resolve)
        }
        const end = Math.min(to, from + SERVER_MAX_ROWS - 1, total - 1)
        const data = []
        for (let i = from; i <= end; i += 1) {
          data.push({ source_record_key: `lead-${i}`, target_id: `cust-${i}`, confirmed_at: null })
        }
        return Promise.resolve({ data, error: null, count: from === 0 ? total : null }).then(resolve)
      }
      return chain
    },
  }
  return { client, ranges, orders }
}

beforeEach(() => {
  createClient.mockReset()
})

describe("listConfirmedLeadCustomerLinks", () => {
  it("reads past the 1000-row PostgREST cap with a unique tie-breaker order", async () => {
    const { client, ranges, orders } = pagedClient(2300)
    createClient.mockReturnValue(client)
    const { listConfirmedLeadCustomerLinks } = await import("@/lib/repositories/crm-source-links")

    const map = await listConfirmedLeadCustomerLinks()

    expect(map.size).toBe(2300)
    expect(map.get("lead-2299")).toBe("cust-2299")
    expect(ranges.length).toBeGreaterThanOrEqual(3)
    expect(orders).toEqual(expect.arrayContaining(["confirmed_at", "id"]))
  })

  it("throws on a page error instead of returning a partial map", async () => {
    const { client } = pagedClient(2300, { failAtFrom: 1000 })
    createClient.mockReturnValue(client)
    const { listConfirmedLeadCustomerLinks } = await import("@/lib/repositories/crm-source-links")

    await expect(listConfirmedLeadCustomerLinks()).rejects.toThrow("boom")
  })
})
