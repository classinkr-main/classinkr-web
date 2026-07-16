import { afterEach, describe, expect, it, vi } from "vitest"

import {
  assertLocalJsonWriteAllowed,
  isLocalJsonWriteAllowed,
} from "@/lib/server/runtime-persistence"

describe("runtime persistence boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("allows local development JSON writes", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("VERCEL", "")
    expect(isLocalJsonWriteAllowed()).toBe(true)
    expect(() => assertLocalJsonWriteAllowed("test-store")).not.toThrow()
  })

  it("fails closed in production and Vercel runtimes", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(isLocalJsonWriteAllowed()).toBe(false)
    expect(() => assertLocalJsonWriteAllowed("test-store")).toThrow(/Supabase 저장소/)

    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("VERCEL", "1")
    expect(isLocalJsonWriteAllowed()).toBe(false)
  })
})
