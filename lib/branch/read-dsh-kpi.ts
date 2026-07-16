import "server-only"

import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE, type DshOutput } from "@/lib/branch/parsers/dsh"
import { parseKpiBlocks, KPI_RANGE, type KpiBlocks } from "@/lib/branch/parsers/kpi"
import { getActiveImportRunInfo, readDshFromActiveImport, readKpiBlocksFromActiveImport } from "@/lib/repositories/sales-ledger-imports"
import {
  BRANCH_DSH_CACHE_TAG,
  BRANCH_KPI_CACHE_TAG,
  readBranchDshMirror,
  readBranchKpiMirror,
} from "@/lib/repositories/branch-dsh-kpi-mirror"

// DSH/KPI 데이터셋 단일 규약(REV의 read-rev-deals와 같은 사다리):
// ①매출장부 액티브 임포트 ②시트 미러(동기화 스냅샷) ③라이브 시트(최후 수단).
// ③은 미러가 한 번도 채워진 적 없는 초기 상태에서만 닿는다 — 첫 동기화 이후에는
// 시트 접근이 끊겨도 summary/kpi/insights가 마지막 스냅샷으로 계속 응답한다.
// 시트 편집 반영 시점도 "요청당 60초 재읽기"가 아니라 "마지막 동기화"로 바뀐다 —
// SyncStatusBar의 시트-신선도 경고(sheetModifiedAt vs lastSync)가 그 간극을 알린다.

const readLiveDsh = unstable_cache(
  async (fiscalYear: number) => parseDsh(await readRangeWithFormat(envSheetId("dashboard"), DSH_RANGE), fiscalYear),
  ["branch-dsh-live-fallback"],
  { revalidate: 60, tags: [BRANCH_DSH_CACHE_TAG] },
)

const readLiveKpiBlocks = unstable_cache(
  async () => parseKpiBlocks(await readRangeWithFormat(envSheetId("dashboard"), KPI_RANGE)),
  ["branch-kpi-live-fallback"],
  { revalidate: 60, tags: [BRANCH_KPI_CACHE_TAG] },
)

export async function readDshPreferDb(fiscalYear: number): Promise<DshOutput> {
  const imported = await readDshFromActiveImport(fiscalYear)
  if (imported) return imported
  const mirror = await readBranchDshMirror(fiscalYear)
  if (mirror) return mirror
  return readLiveDsh(fiscalYear)
}

export interface DshSource {
  kind: "import" | "mirror" | "live"
  asOf: string | null
  runId?: string
}

// readDshPreferDb와 같은 사다리를 타되 서빙 소스 메타를 함께 반환한다 — KR Team 등 화면이
// "지금 보는 DSH가 장부 임포트/시트 미러/라이브 시트 중 어디서, 언제 왔는지"를 표면화할 때
// 쓴다(data_sources). mirror/live 폴백의 asOf는 호출부(summary 라우트)가 이미 계산해 둔
// lastSync/sheetModifiedAt으로 채우도록 null로 남긴다(중복 조회 방지).
export async function readDshPreferDbWithSource(fiscalYear: number): Promise<{ dsh: DshOutput; source: DshSource }> {
  const runInfo = await getActiveImportRunInfo("dsh", fiscalYear)
  if (runInfo) {
    const imported = await readDshFromActiveImport(fiscalYear)
    if (imported) {
      return { dsh: imported, source: { kind: "import", asOf: runInfo.startedAt, runId: runInfo.runId } }
    }
  }
  const mirror = await readBranchDshMirror(fiscalYear)
  if (mirror) return { dsh: mirror, source: { kind: "mirror", asOf: null } }
  return { dsh: await readLiveDsh(fiscalYear), source: { kind: "live", asOf: null } }
}

export async function readKpiBlocksPreferDb(fiscalYear: number): Promise<KpiBlocks> {
  const imported = await readKpiBlocksFromActiveImport(fiscalYear)
  if (imported) return imported
  const mirror = await readBranchKpiMirror(fiscalYear)
  if (mirror) return mirror
  return readLiveKpiBlocks()
}
