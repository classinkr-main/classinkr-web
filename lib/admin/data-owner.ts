import "server-only"
import type { VerifiedAdminContext } from "@/lib/admin-auth"
import { findAdminCrmOwner, listAdminUserDirectoryCached } from "@/lib/repositories/admin-users"
import { branchMemberOwnerAliases } from "@/lib/branch/member-names"

export const PERSONAL_OWNER = "__me"
export const UNMAPPED_OWNER = "__no_current_admin_owner__"

export async function currentDataOwner(admin: VerifiedAdminContext) {
  const directory = await listAdminUserDirectoryCached()
  const current = findAdminCrmOwner({ crmOwners: directory.users }, admin)
  const keys = [...new Set(current.ownerKeys.flatMap(branchMemberOwnerAliases))]
  if (admin.userId) keys.push(admin.userId)
  return { keys: keys.length ? keys : [UNMAPPED_OWNER], owner: current.owner }
}

/** 생략은 개인, 명시적 빈 owner는 전체. __me는 검증된 서버 계정에서만 해석한다. */
export async function dataOwnerFromRequest(url: URL, admin: VerifiedAdminContext) {
  const value = url.searchParams.get("owner") ?? PERSONAL_OWNER
  if (!value) return undefined
  if (value !== PERSONAL_OWNER) return branchMemberOwnerAliases(value)
  return (await currentDataOwner(admin)).keys
}
