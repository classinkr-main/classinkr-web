import "server-only"
import type { VerifiedAdminContext } from "@/lib/admin-auth"
import { currentDataOwner } from "./data-owner"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import { UNMAPPED_BRANCH_MEMBER } from "@/lib/branch/personal-scope"

export async function resolvePersonalBranchManager(admin: VerifiedAdminContext | null) {
  if (!admin) return UNMAPPED_BRANCH_MEMBER
  const current = await currentDataOwner(admin)
  return normalizeBranchMemberName(current.owner?.displayName ?? current.owner?.ownerKey) ?? UNMAPPED_BRANCH_MEMBER
}

/** 호출 라우트의 역할 검사 후 사용한다. 자기 담당 토큰은 클라이언트 이름을 신뢰하지 않는다. */
export async function branchManagerFromRequest(url: URL, req: import("next/server").NextRequest) {
  const value = url.searchParams.get("manager")?.trim()
  if (value !== "__me") return value || undefined
  const { requireVerifiedAdminContext, BRANCH_READ_ADMIN_API_ROLES } = await import("@/lib/admin-auth")
  const { NextResponse } = await import("next/server")
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return UNMAPPED_BRANCH_MEMBER
  return resolvePersonalBranchManager(admin)
}
