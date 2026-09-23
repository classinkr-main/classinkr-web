import "server-only"
import { revalidateTag } from "next/cache"
import type { BranchSyncCacheBundle } from "@/lib/branch/sync/cache-bundles"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import { ADMIN_CRM_REVENUE_SHEET_CACHE_TAG } from "@/lib/admin-crm-revenue-sheet"
import { BRANCH_REV_DEALS_CACHE_TAG } from "@/lib/repositories/branch-deals"
import { BRANCH_DSH_CACHE_TAG, BRANCH_KPI_CACHE_TAG } from "@/lib/repositories/branch-dsh-kpi-mirror"
import { BRANCH_HW_CACHE_TAG } from "@/lib/repositories/branch-hw"
import { BRANCH_SYNC_RUNS_CACHE_TAG } from "@/lib/repositories/branch-sync"
import { HARDWARE_INVENTORY_CACHE_TAG } from "@/lib/repositories/hardware-inventory"
import { SALES_LEDGER_IMPORTS_CACHE_TAG } from "@/lib/repositories/sales-ledger-imports"

// 동기화가 끝나면 바로 최신 — 캐시 태그 묶음과 즉시 만료
// (docs/superpowers/specs/2026-09-14-vercel-pro-cron-freshness-design.md §7.1).
//
// 동기화 경로는 지금까지 revalidateTag(tag, "max")(stale-while-revalidate)로 무효화했다. 그러면
// 바로 다음 조회가 옛 값을 받고 새로 만드는 일은 뒤에서 일어난다 — 사람이 "동기화"를 누르고
// 기다린 직후의 조회가 옛 수치를 보여 다시 누르게 되던 원인이다. 캐시가 겹겹이면(KPI 묶음 캐시 안의
// DSH·KPI 미러 캐시) 바깥 캐시가 안쪽의 옛 값으로 다시 채워질 수도 있다. 그래서 동기화가 실제로
// 데이터를 쓴 소스의 묶음(바깥·안쪽 태그를 함께)을 { expire: 0 }으로 즉시 만료한다.
//
// 이 파일은 매출 장부 영역(REV·HW 시트 동기화)의 묶음만 담는다. NEO·채널톡·Meta 등 다른 동기화의
// 묶음은 설계 §7의 나머지 범위로 남아 있다(라운드 5 기획 §7).

// 지사 개요·세그먼트 품질 점검 캐시(app/api/admin/branch/data-quality)의 태그. 라우트 파일에서
// 상수를 export할 수 없어(라우트는 핸들러만 export) 여기서 정본으로 둔다.
export const BRANCH_SEG_CACHE_TAG = "branch-seg"

export const SYNC_CACHE_TAG_BUNDLES = {
  // REV 시트 동기화(syncRev)는 REV 미러·DSH·KPI 미러를 한 번에 교체하고, 액티브 장부 임포트를
  // 재캡처하며, 실행 기록을 남긴다. 매출시트(rev-sheet) 60초 캐시도 REV 미러를 읽는다.
  branchRev: [
    BRANCH_SEG_CACHE_TAG,
    BRANCH_DSH_CACHE_TAG,
    BRANCH_KPI_CACHE_TAG,
    BRANCH_REV_DEALS_CACHE_TAG,
    ADMIN_CRM_REVENUE_CACHE_TAG,
    ADMIN_CRM_REVENUE_SHEET_CACHE_TAG,
    SALES_LEDGER_IMPORTS_CACHE_TAG,
    BRANCH_SYNC_RUNS_CACHE_TAG,
  ],
  branchHw: [BRANCH_SEG_CACHE_TAG, BRANCH_HW_CACHE_TAG, HARDWARE_INVENTORY_CACHE_TAG, BRANCH_SYNC_RUNS_CACHE_TAG],
  // 동기화가 데이터를 하나도 못 써도(전 소스 실패) 실행 기록은 바뀐다 — 요약의 마지막 시도·오류가
  // 곧바로 보이게 실행 기록과 개요 태그만 만료한다.
  branchSyncStatus: [BRANCH_SEG_CACHE_TAG, BRANCH_SYNC_RUNS_CACHE_TAG],
  // REV 링크 유지보수(재부착·후보 생성)가 crm_source_links를 다시 바꾼 뒤의 매칭 표시.
  crmRevenueLinks: [ADMIN_CRM_REVENUE_CACHE_TAG, ADMIN_CRM_REVENUE_SHEET_CACHE_TAG],
} as const satisfies Record<BranchSyncCacheBundle | "crmRevenueLinks", readonly string[]>

export type SyncCacheBundle = keyof typeof SYNC_CACHE_TAG_BUNDLES

/**
 * 묶음 안의 태그를 중복 없이 { expire: 0 }으로 만료한다 — 다음 조회가 새로 만든다.
 * 만료한 태그 목록을 돌려준다(테스트·로그용).
 */
export function expireSyncCacheTags(...bundles: SyncCacheBundle[]): string[] {
  const tags = new Set<string>()
  for (const bundle of bundles) {
    for (const tag of SYNC_CACHE_TAG_BUNDLES[bundle]) tags.add(tag)
  }
  for (const tag of tags) revalidateTag(tag, { expire: 0 })
  return Array.from(tags)
}
