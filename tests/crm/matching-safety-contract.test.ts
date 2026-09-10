import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const repository = readFileSync(
  join(process.cwd(), "lib/repositories/crm-source-links.ts"),
  "utf8"
)
const inbox = readFileSync(join(process.cwd(), "lib/admin-crm-matching.ts"), "utf8")

describe("CRM matching eligibility guard wiring", () => {
  it("filters unsafe targets in every candidate generator and excluded Xiaoshouyi owners before scoring", () => {
    expect(
      repository.match(/\.filter\(\(target\) => !isUnsafeCrmTargetLabel\(target\.targetLabel\)\)/g)
    ).toHaveLength(3)
    expect(repository).toContain("getExcludedXiaoshouyiOwnerIds(sb)")
    expect(repository).toContain("!excludedOwnerIds.has(record.owner_name?.trim() ?? \"\")")
  })

  it("checks the same safety classifier before confirm mutates a source link", () => {
    const safetyCheck = repository.indexOf("const safetyState = classifyCrmSourceLinkReviewValidation(")
    const confirmMutation = repository.indexOf('status: "confirmed"', safetyCheck)
    expect(safetyCheck).toBeGreaterThan(0)
    expect(repository.slice(safetyCheck, confirmMutation)).toContain(
      'if (safetyState === "unsafe_matching_evidence")'
    )
    expect(repository.slice(safetyCheck, confirmMutation)).toContain("UNSAFE_MATCHING_EVIDENCE_MESSAGE")
  })

  it("uses the same excluded-owner and unsafe-evidence state in inbox classification", () => {
    expect(inbox).toContain("excludedXiaoshouyiOwnerIds: excludedOwnerIds")
    expect(inbox).toContain('validationState === "unsafe_matching_evidence"')
    expect(inbox).toContain("UNSAFE_MATCHING_EVIDENCE_MESSAGE")
  })
})
