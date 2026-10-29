import "server-only"
import { revalidateTag } from "next/cache"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import { ADMIN_CRM_REVENUE_SHEET_CACHE_TAG } from "@/lib/admin-crm-revenue-sheet"
import { BRANCH_REV_DEALS_CACHE_TAG } from "@/lib/repositories/branch-deals"
import { BRANCH_DSH_CACHE_TAG, BRANCH_KPI_CACHE_TAG } from "@/lib/repositories/branch-dsh-kpi-mirror"
import { BRANCH_HW_CACHE_TAG } from "@/lib/repositories/branch-hw"
import { BRANCH_SYNC_RUNS_CACHE_TAG } from "@/lib/repositories/branch-sync"
import { HARDWARE_INVENTORY_CACHE_TAG } from "@/lib/repositories/hardware-inventory"
import { SALES_LEDGER_IMPORTS_CACHE_TAG } from "@/lib/repositories/sales-ledger-imports"

// 동기화가 끝나면 다음 조회가 새 데이터를 받게 하는 캐시 즉시 만료
// (docs/superpowers/specs/2026-09-14-vercel-pro-cron-freshness-design.md §7.1).
//
// 왜: 예전 동기화 경로는 revalidateTag(tag, "max")를 불렀다. Next 16에서 이 호출은 캐시에 "오래됨"
// 표시만 하고, 바로 다음 조회는 옛 값을 받은 채 뒤에서 새로 만든다. 그래서 동기화 버튼을 누르고
// 화면을 다시 불러와도 숫자가 그대로였다("동기화가 안 된다"). 바깥 캐시(지사 KPI 묶음)가 안쪽의
// 옛 미러 값으로 다시 채워지는 일도 있었다. { expire: 0 }은 다음 조회에서 새로 만들게 한다.
//
// 이번 범위는 매출·HW 시트 동기화 묶음뿐이다. 다른 원천(NEO·Meta 등)의 묶음은 설계 문서에 있지만
// 아직 옮기지 않았다.

/** KR Team 지역(SEG) 탭 캐시 — data-quality 라우트가 문자열 그대로 쓴다. */
export const BRANCH_SEG_CACHE_TAG = "branch-seg"

export const SYNC_CACHE_TAG_BUNDLES = {
  /** 동기화를 시도한 런이면(성공·실패 무관) 바뀌는 것 — 실행 기록과 SEG. */
  branchSyncRun: [BRANCH_SEG_CACHE_TAG, BRANCH_SYNC_RUNS_CACHE_TAG],
  /** 구형 호출 계약의 상태 묶음 — 동기화 기록 갱신만 있었을 때 사용한다. */
  branchSyncStatus: [BRANCH_SEG_CACHE_TAG, BRANCH_SYNC_RUNS_CACHE_TAG],
  /** REV 시트(REV·DSH·KPI 미러)와 그 미러를 읽는 장부 임포트·CRM 매출 조립. */
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
  /** REV 링크 유지보수(crm_source_links)가 바꾸는 CRM 매출 조립. */
  branchRevLinks: [ADMIN_CRM_REVENUE_CACHE_TAG, ADMIN_CRM_REVENUE_SHEET_CACHE_TAG],
  /** HW 시트 미러(branch_hw_*)와 그것을 함께 읽는 하드웨어 조립. */
  branchHw: [BRANCH_SEG_CACHE_TAG, BRANCH_HW_CACHE_TAG, HARDWARE_INVENTORY_CACHE_TAG, BRANCH_SYNC_RUNS_CACHE_TAG],
  /** 원장 가져오기·복원 뒤 미러와 재고 대시보드를 함께 무효화한다. */
  hardwareImport: [HARDWARE_INVENTORY_CACHE_TAG, BRANCH_HW_CACHE_TAG],
} as const

export type SyncCacheTagBundle = keyof typeof SYNC_CACHE_TAG_BUNDLES

/** 묶음들의 태그를 한 번씩만 즉시 만료한다. 만료한 태그 목록을 돌려준다(테스트·로그용). */
export function expireSyncCacheTags(...bundles: SyncCacheTagBundle[]): string[] {
  const tags = Array.from(new Set(bundles.flatMap((bundle) => SYNC_CACHE_TAG_BUNDLES[bundle])))
  for (const tag of tags) revalidateTag(tag, { expire: 0 })
  return tags
}
