import { describe, expect, it } from "vitest"
import { sanitizeChannelBudgetPatch } from "@/app/api/admin/channel-budgets/route"

describe("sanitizeChannelBudgetPatch", () => {
  it("accepts a valid {channel, amount} patch", () => {
    expect(sanitizeChannelBudgetPatch({ channel: "meta", amount: 12000000 })).toEqual({
      channel: "meta",
      amount: 12000000,
    })
  })

  it("rejects an unknown channel", () => {
    expect(sanitizeChannelBudgetPatch({ channel: "tiktok", amount: 100 })).toBeNull()
    expect(sanitizeChannelBudgetPatch({ channel: "", amount: 100 })).toBeNull()
  })

  it("rejects a negative amount", () => {
    expect(sanitizeChannelBudgetPatch({ channel: "meta", amount: -5 })).toBeNull()
  })

  it("rejects a non-numeric amount", () => {
    expect(sanitizeChannelBudgetPatch({ channel: "meta", amount: "abc" })).toBeNull()
    expect(sanitizeChannelBudgetPatch({ channel: "meta", amount: null })).toBeNull()
    expect(sanitizeChannelBudgetPatch({ channel: "meta" })).toBeNull()
  })

  it("floors a decimal amount to an integer", () => {
    expect(sanitizeChannelBudgetPatch({ channel: "google", amount: 12000.7 })).toEqual({
      channel: "google",
      amount: 12000,
    })
  })

  it("accepts a zero amount (clears a budget)", () => {
    expect(sanitizeChannelBudgetPatch({ channel: "naver", amount: 0 })).toEqual({
      channel: "naver",
      amount: 0,
    })
  })

  it("returns null for non-object bodies", () => {
    expect(sanitizeChannelBudgetPatch(null)).toBeNull()
    expect(sanitizeChannelBudgetPatch("meta")).toBeNull()
    expect(sanitizeChannelBudgetPatch(undefined)).toBeNull()
  })
})
