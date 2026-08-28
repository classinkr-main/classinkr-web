import { describe, expect, it } from "vitest"

import { buildLeadMagnetImportPlan } from "../../scripts/lib/lead-magnets-import-plan.mjs"

describe("lead magnets import dry-run plan", () => {
  it("classifies inserts, updates and unchanged rows without carrying document payloads", () => {
    const magnets = [
      { slug: "new-guide", title: "신규", published: true },
      { slug: "changed-guide", title: "수정본", published: false },
      { slug: "same-guide", title: "동일", published: true },
    ]
    const existing = [
      { slug: "changed-guide", data: { slug: "changed-guide", title: "예전" }, published: false },
      { slug: "same-guide", data: { slug: "same-guide", title: "동일", published: true }, published: true },
    ]

    const plan = buildLeadMagnetImportPlan(magnets, existing)

    expect(plan).toMatchObject({
      total: 3,
      valid: 3,
      invalid: 0,
      wouldInsert: 1,
      wouldUpdate: 1,
      unchanged: 1,
      wouldUpsert: 2,
      duplicateSlugs: [],
    })
    expect(plan.operations).toEqual([
      { slug: "new-guide", action: "insert" },
      { slug: "changed-guide", action: "update" },
      { slug: "same-guide", action: "unchanged" },
    ])
  })

  it("reports invalid and duplicate slugs while simulating sequential upserts", () => {
    const plan = buildLeadMagnetImportPlan([
      { title: "slug 없음" },
      { slug: "duplicate", title: "첫 버전" },
      { slug: "duplicate", title: "둘째 버전" },
    ])

    expect(plan.invalid).toBe(1)
    expect(plan.duplicateSlugs).toEqual(["duplicate"])
    expect(plan.operations).toEqual([
      { slug: "duplicate", action: "insert" },
      { slug: "duplicate", action: "update" },
    ])
  })

  it("rejects a non-array source document", () => {
    expect(() => buildLeadMagnetImportPlan({ slug: "not-an-array" })).toThrow(
      "최상위는 배열이어야 합니다"
    )
  })
})
