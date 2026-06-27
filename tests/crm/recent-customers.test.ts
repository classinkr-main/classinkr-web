import { afterEach, describe, expect, it, vi } from "vitest"

import {
  entityIdFromCustomerKey,
  getRecentCustomers,
  pushRecentCustomer,
  type RecentCustomer,
} from "@/lib/crm/recent-customers"

function stubLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  })
  return store
}

describe("entityIdFromCustomerKey", () => {
  it("returns everything after the first colon", () => {
    expect(entityIdFromCustomerKey("lead:abc")).toBe("abc")
    expect(entityIdFromCustomerKey("neo:a:b:c")).toBe("a:b:c")
    expect(entityIdFromCustomerKey("nokey")).toBe("nokey")
  })
})

describe("recent customers store", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const lead: RecentCustomer = { key: "lead:1", name: "테스트 학원", sourceLabel: "리드", source: "lead" }
  const neo: RecentCustomer = { key: "neo:9", name: "큰학원", sourceLabel: "고객", source: "neo_account" }

  it("returns empty without a window (SSR-safe)", () => {
    expect(getRecentCustomers()).toEqual([])
    expect(() => pushRecentCustomer(lead)).not.toThrow()
  })

  it("pushes most-recent-first and dedupes by key", () => {
    stubLocalStorage()
    pushRecentCustomer(lead)
    pushRecentCustomer(neo)
    pushRecentCustomer(lead) // re-open lead -> moves to front, no dupe

    const recents = getRecentCustomers()
    expect(recents.map((item) => item.key)).toEqual(["lead:1", "neo:9"])
  })

  it("caps the list at 8 entries", () => {
    stubLocalStorage()
    for (let i = 0; i < 12; i += 1) {
      pushRecentCustomer({ key: `neo:${i}`, name: `고객 ${i}`, sourceLabel: "고객", source: "neo_account" })
    }
    const recents = getRecentCustomers()
    expect(recents).toHaveLength(8)
    expect(recents[0]?.key).toBe("neo:11")
  })

  it("ignores malformed entries", () => {
    stubLocalStorage()
    pushRecentCustomer({ key: "", name: "no key", sourceLabel: "리드", source: "lead" })
    expect(getRecentCustomers()).toEqual([])
  })
})
