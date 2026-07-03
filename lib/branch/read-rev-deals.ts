import "server-only"

import { listBranchRevDeals, type BranchRevDeal } from "@/lib/repositories/branch-deals"
import { readRevDealsFromActiveImport } from "@/lib/repositories/sales-ledger-imports"

// REV 데이터셋 단일 규약: DB-native 액티브 임포트 우선, 없으면 시트 미러(branch_rev_deals)
// 폴백. summary/heatmap 등 branch 탭이 전부 이 헬퍼를 거쳐야 DB-native 전환 이후에도
// 탭끼리 같은 데이터를 본다(미러만 읽는 탭이 남으면 활성화 직후 수치가 서로 어긋난다).
export async function readRevDealsPreferActive(
  fiscalYear: number,
  filter?: { team?: string },
): Promise<BranchRevDeal[]> {
  const imported = await readRevDealsFromActiveImport(fiscalYear, filter)
  return imported ?? listBranchRevDeals(filter)
}
