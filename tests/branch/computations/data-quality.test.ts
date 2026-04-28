import { describe, it, expect } from "vitest"
import { runDataQuality } from "@/lib/branch/computations/data-quality"
import type { DshOutput } from "@/lib/branch/parsers/dsh"

describe("runDataQuality", () => {
  it("flags missing DSH team", () => {
    const dsh: DshOutput = { rows: [], members: {} }
    const out = runDataQuality({
      deals: [], dsh, kpi: [], seg: [], hwInbound: [], hwOutbound: [], hwStock: [],
    })
    expect(out.find((i) => i.id === "DQ-7")).toBeTruthy()
  })
})
