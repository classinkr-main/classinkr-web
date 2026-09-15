import { describe, expect, it } from "vitest"

import {
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
})
