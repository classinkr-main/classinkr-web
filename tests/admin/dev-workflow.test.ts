import { describe, expect, it } from "vitest"

import {
  hasValidRoadmapStatuses,
  isBugSeverity,
  isBugStatus,
  isPatchNoteStatus,
} from "@/lib/admin/dev-workflow"

describe("Dev Mode workflow status contracts", () => {
  it("rejects free-form workflow states", () => {
    expect(isBugStatus("almost-done")).toBe(false)
    expect(isBugSeverity("blocker")).toBe(false)
    expect(isPatchNoteStatus("public")).toBe(false)
  })

  it("validates roadmap and nested feature states", () => {
    expect(hasValidRoadmapStatuses({ status: "in-progress", features: [{ status: "done" }] })).toBe(true)
    expect(hasValidRoadmapStatuses({ status: "doing" })).toBe(false)
    expect(hasValidRoadmapStatuses({ features: [{ status: "waiting" }] })).toBe(false)
  })
})
