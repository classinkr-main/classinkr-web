import { describe, expect, it } from "vitest"

import { captureBatchStatusAfterApply } from "@/lib/crm/capture/apply"

describe("captureBatchStatusAfterApply", () => {
  it("keeps a partially applied batch open while review rows remain", () => {
    expect(captureBatchStatusAfterApply({ failed: 0, reviewRemaining: 3 })).toBe("reviewed")
  })

  it("surfaces failed rows before considering the batch complete", () => {
    expect(captureBatchStatusAfterApply({ failed: 1, reviewRemaining: 1 })).toBe("partial_failed")
  })

  it("closes the batch only after every reviewable row is applied", () => {
    expect(captureBatchStatusAfterApply({ failed: 0, reviewRemaining: 0 })).toBe("applied")
  })
})
