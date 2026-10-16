import "server-only"
import { revalidateTag } from "next/cache"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import { ADMIN_CRM_REVENUE_SHEET_CACHE_TAG } from "@/lib/admin-crm-revenue-sheet"
import { BRANCH_HW_CACHE_TAG } from "@/lib/repositories/branch-hw"
import { BRANCH_REV_DEALS_CACHE_TAG } from "@/lib/repositories/branch-deals"
import { runBranchRevLinkMaintenance } from "@/lib/repositories/crm-source-links"
import type { RunAllResult } from "./run-all"

/** 수동·Cron 모두 실제 반영된 소스의 파생 조회를 갱신한다. 부분 실패도 성공분은 유지한다. */
export async function completeBranchSync(result: RunAllResult, sources: readonly string[] = ["rev", "hw"]) {
  if (result.skipped) return result

  revalidateTag("branch-seg", "max")
  const revSucceeded = sources.includes("rev") && (result.revOk === true || result.ok)
  if (sources.includes("hw") && result.hw) revalidateTag(BRANCH_HW_CACHE_TAG, "max")
  if (!revSucceeded) return result

  const revenueTags = [ADMIN_CRM_REVENUE_CACHE_TAG, ADMIN_CRM_REVENUE_SHEET_CACHE_TAG]
  for (const tag of ["branch-dsh", "branch-kpi", BRANCH_REV_DEALS_CACHE_TAG, ...revenueTags]) {
    revalidateTag(tag, "max")
  }
  try {
    const crmLinks = await runBranchRevLinkMaintenance()
    return { ...result, crmLinks }
  } catch {
    // 원본 동기화 성공과 후속 링크 오류를 구분한다. 실패 원문은 응답에 복제하지 않는다.
    return { ...result, warnings: [...(result.warnings ?? []), "CRM 매출 연결 유지보수 실패 — 연결 상태를 다시 확인해 주세요."] }
  } finally {
    // 유지보수 도중 일부 링크가 반영된 뒤 실패해도 이전 매출 연결 캐시를 재사용하지 않는다.
    for (const tag of revenueTags) revalidateTag(tag, "max")
  }
}
