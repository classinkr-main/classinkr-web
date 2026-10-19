import { normalizeBranchMemberName } from "@/lib/branch/member-names"

export function matchesDataOwner(value: string | null | undefined, keys?: readonly string[]) {
  if (!keys) return true
  const name = normalizeBranchMemberName(value)?.toLowerCase()
  return Boolean(name && keys.some((key) => normalizeBranchMemberName(key)?.toLowerCase() === name))
}
