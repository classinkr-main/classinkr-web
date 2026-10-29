import { normalizedAccountKey } from "@/lib/branch/account-key"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"

/**
 * 신규 초안에는 확정된 거래처 ID가 없으므로 고객명만으로 다른 담당자·팀의 거래를
 * 같은 거래로 취급하지 않는다. 담당자나 팀이 비어 있으면 일치 여부를 추정하지 않는다.
 * 기존 행의 점 표시에는 원문 표기 일치를, 대기 행 그룹에는 기존 정규화 규약을 쓴다.
 */
export function pendingCustomerScope(
  customer: string | null | undefined,
  manager: string | null | undefined,
  team: string | null | undefined,
  normalizeCustomer: boolean,
): string | null {
  const customerKey = normalizeCustomer ? normalizedAccountKey(customer) : customer?.trim()
  const managerKey = normalizeBranchMemberName(manager)?.toLowerCase()
  const teamKey = team?.trim().toUpperCase()
  if (!customerKey || !managerKey || !teamKey) return null
  return JSON.stringify([customerKey, managerKey, teamKey])
}
