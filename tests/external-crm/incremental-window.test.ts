import { describe, expect, it } from "vitest"

import { planIncrementalSync, readIncrementalConfig, withIncrementalWhere } from "@/lib/external-crm/incremental-window"

const NOW = new Date("2026-11-09T06:00:00Z")
const cfg = readIncrementalConfig({ incremental: { field: "updatedAt", overlapHours: 48, fullEveryDays: 7 } })!
const run = (started_at: string, mode?: string, cursor_value = "complete", status = "success") =>
  ({ started_at, status, cursor_value, metadata: mode ? { mode } : {} })

describe("incremental window", () => {
  it("rejects unsafe field names and missing config", () => {
    expect(readIncrementalConfig({ incremental: { field: "updatedAt; DROP" } })).toBeNull()
    expect(readIncrementalConfig({})).toBeNull()
    expect(planIncrementalSync(null, [], NOW).mode).toBe("full")
  })

  it("runs full when there is no complete full run or it is older than fullEveryDays", () => {
    expect(planIncrementalSync(cfg, [run("2026-11-09T05:00:00Z", undefined, "offset:20000")], NOW).mode).toBe("full")
    expect(planIncrementalSync(cfg, [run("2026-11-01T00:00:00Z"), run("2026-11-08T00:00:00Z", "incremental")], NOW).mode).toBe("full")
  })

  it("goes incremental from the latest complete run minus overlap (legacy runs without mode count as full)", () => {
    const plan = planIncrementalSync(cfg, [run("2026-11-05T00:00:00Z"), run("2026-11-08T00:00:00Z", "incremental"), run("2026-11-09T01:00:00Z", "incremental", "running", "running")], NOW)
    expect(plan).toEqual({ mode: "incremental", field: "updatedAt", sinceMs: Date.parse("2026-11-06T00:00:00Z") })
    expect(withIncrementalWhere("status = 1", plan)).toBe(`(status = 1) AND updatedAt >= ${Date.parse("2026-11-06T00:00:00Z")}`)
    expect(withIncrementalWhere(null, { mode: "full", reason: "" })).toBeNull()
  })
})
