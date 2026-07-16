import { describe, expect, it } from "vitest"

import { canUseLocalBugJsonFallback } from "@/lib/repositories/bugs"

describe("bug repository JSON fallback", () => {
  it("allows the file fallback only in a local runtime", () => {
    expect(canUseLocalBugJsonFallback({ NODE_ENV: "development" })).toBe(true)
    expect(canUseLocalBugJsonFallback({ NODE_ENV: "test" })).toBe(true)
  })

  it("fails closed on production and every Vercel runtime", () => {
    expect(canUseLocalBugJsonFallback({ NODE_ENV: "production" })).toBe(false)
    expect(canUseLocalBugJsonFallback({ NODE_ENV: "development", VERCEL: "1" })).toBe(false)
    expect(canUseLocalBugJsonFallback({ NODE_ENV: "development", VERCEL_ENV: "preview" })).toBe(false)
  })
})
