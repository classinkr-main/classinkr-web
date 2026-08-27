import { readFileSync } from "fs"
import { resolve } from "path"
import { describe, expect, it } from "vitest"

describe("lead action KPI query contract", () => {
  it("uses one paginated lightweight snapshot instead of a fan-out of head counts", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/repositories/leads.ts"), "utf8")
    const actionStats = source.slice(
      source.indexOf("export async function getLeadActionStats"),
      source.indexOf("export interface LeadChannelStat")
    )

    expect(actionStats).toContain('fetchAllLeadRows(columns, "액션 KPI 조회")')
    expect(actionStats).toContain("summarizeLeadResponseStatus(leads, now)")
    expect(actionStats).not.toContain('head: true')
    expect(actionStats).not.toContain("Promise.all")
  })
})
