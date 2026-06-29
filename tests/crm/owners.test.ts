import { describe, expect, it } from "vitest"

import { buildOwnerSelectOptions, type CrmOwnerOption } from "@/components/admin/crm/useCrmOwners"
import { crmTeamRoleLabel, findAdminCrmOwner } from "@/lib/repositories/admin-users"

function owner(overrides: Partial<CrmOwnerOption> & { displayName: string; ownerKey: string }): CrmOwnerOption {
  return {
    userId: null,
    displayName: overrides.displayName,
    teamRoleLabel: overrides.teamRoleLabel ?? "매니저",
    branchName: overrides.branchName ?? null,
    ownerKey: overrides.ownerKey,
    ownerAliases: overrides.ownerAliases ?? [overrides.displayName, overrides.ownerKey],
    neoOwnerId: overrides.neoOwnerId ?? null,
  }
}

describe("CRM owner account mapping", () => {
  it("keeps active admin owners visible even before they have assigned customers", () => {
    const options = buildOwnerSelectOptions([{ ownerName: "김담당", count: 3 }], [
      owner({ displayName: "김담당", ownerKey: "김담당" }),
      owner({ displayName: "신규매니저", ownerKey: "신규매니저" }),
    ])

    expect(options).toEqual([
      expect.objectContaining({ ownerName: "김담당", count: 3 }),
      expect.objectContaining({ ownerName: "신규매니저", count: 0 }),
    ])
  })

  it("uses owner aliases to connect legacy source names to admin accounts", () => {
    const options = buildOwnerSelectOptions([{ ownerName: "neo-123", count: 2 }], [
      owner({
        displayName: "박매니저",
        ownerKey: "박매니저",
        ownerAliases: ["박매니저", "neo-123"],
        neoOwnerId: "neo-123",
      }),
    ])

    expect(options[0]).toMatchObject({
      ownerName: "박매니저",
      label: "박매니저",
      count: 2,
    })
  })

  it("labels branch director and manager roles for CRM screens", () => {
    expect(crmTeamRoleLabel("branch_director")).toBe("지사장")
    expect(crmTeamRoleLabel("manager")).toBe("매니저")
  })

  it("resolves the current admin to CRM owner keys", () => {
    const directory = {
      crmOwners: [
        {
          ...owner({
            displayName: "김담당",
            ownerKey: "김담당",
            ownerAliases: ["김담당", "Kim Manager"],
            neoOwnerId: "neo-123",
          }),
          source: "supabase" as const,
          role: "ADMIN" as const,
          status: "ACTIVE" as const,
          teamRole: "manager" as const,
          assignable: true,
          sortOrder: 10,
        },
      ],
    }

    const resolved = findAdminCrmOwner(directory, { name: "Kim Manager" })

    expect(resolved.owner?.displayName).toBe("김담당")
    expect(new Set(resolved.ownerKeys)).toEqual(new Set(["김담당", "Kim Manager", "neo-123"]))
  })
})
