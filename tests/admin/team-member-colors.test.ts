import { describe, expect, it } from "vitest"

import { TEAM_MEMBER_COLORS, TEAM_MEMBER_FALLBACK_COLOR, getTeamMemberColor } from "@/lib/team-member-colors"

describe("team member colors", () => {
  it("assigns a distinct colour to every configured member", () => {
    const colors = Object.values(TEAM_MEMBER_COLORS)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it("covers everyone in data/team-calendars.json", async () => {
    const members = (await import("../../data/team-calendars.json")).default as Array<{ name: string }>
    for (const member of members) {
      expect(TEAM_MEMBER_COLORS[member.name], member.name).toBeDefined()
    }
  })

  it("falls back to a neutral colour for unknown assignees instead of throwing", () => {
    expect(getTeamMemberColor("모르는사람")).toBe(TEAM_MEMBER_FALLBACK_COLOR)
    expect(getTeamMemberColor(null)).toBe(TEAM_MEMBER_FALLBACK_COLOR)
  })
})
