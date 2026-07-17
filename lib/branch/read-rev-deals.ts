import "server-only"

import { listBranchRevDeals, type BranchRevDeal } from "@/lib/repositories/branch-deals"
import { getActiveImportRunInfo, readRevDealsFromActiveImport } from "@/lib/repositories/sales-ledger-imports"

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

export interface RevDealsSource {
  kind: "import" | "mirror"
  asOf: string | null
  runId?: string
}

// readRevDealsPreferActive와 같은 사다리를 타되 "지금 보는 수치가 어느 원천에서, 언제 온
// 것인지"를 함께 반환한다. 2026-07-16 사고(7/3에 캡처된 스테일 액티브 임포트가 13일간
// 최신 시트 반영분을 가렸으나, 화면은 "마지막 동기화: 방금"만 보여줘 재발을 알 길이
// 없었음) 이후 KR Team 등 서빙 화면이 소스 신선도를 스스로 판단할 수 있게 하려는 용도.
// 기존 readRevDealsPreferActive는 시그니처를 유지한다(heatmap/kpi/data-quality/insights 등
// 소스 메타가 필요 없는 다수 소비처가 이미 그 시그니처에 맞춰져 있다).
export async function readRevDealsPreferActiveWithSource(
  fiscalYear: number,
  filter?: { team?: string },
): Promise<{ deals: BranchRevDeal[]; source: RevDealsSource }> {
  const runInfo = await getActiveImportRunInfo("rev", fiscalYear)
  if (runInfo) {
    // runId를 이미 확보했으므로 readRevDealsFromActiveImport 내부의 getActiveImportRunId
    // 재조회를 생략한다(이중 조회 제거).
    const imported = await readRevDealsFromActiveImport(fiscalYear, filter, runInfo.runId)
    if (imported) {
      return { deals: imported, source: { kind: "import", asOf: runInfo.startedAt, runId: runInfo.runId } }
    }
  }
  // 미러 폴백 — 동기화 완료 시각은 summary 라우트가 이미 lastSync로 계산해 두므로 여기서는
  // null로 남기고 라우트가 그 값을 대입한다(같은 값을 다시 조회하는 왕복을 만들지 않는다).
  const mirrorDeals = await listBranchRevDeals(filter)
  return { deals: mirrorDeals, source: { kind: "mirror", asOf: null } }
}
