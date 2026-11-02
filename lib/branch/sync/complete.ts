import "server-only"
import { resolveSyncOutcome, type SyncOutcome } from "@/lib/admin/sync-outcome"
import { runBranchRevLinkMaintenance } from "@/lib/repositories/crm-source-links"
import { expireSyncCacheTags, type SyncCacheTagBundle } from "@/lib/server/sync-cache-tags"
import type { RunAllResult } from "./run-all"

export type CompletedBranchSync = RunAllResult & { outcome: SyncOutcome; crmLinks?: unknown }

// runAll 이 결과 종류를 명시했으면(운영 밖 쓰기 가드의 "skipped") 그 값을 지킨다 — 다시 계산하면
// skipped=true 가 잠금 충돌("running")로 바뀌어 화면이 "이미 동기화가 진행 중"이라고 잘못 말한다.
function outcomeOf(result: RunAllResult): SyncOutcome {
  return result.outcome ?? resolveSyncOutcome(result)
}

/**
 * 수동·Cron 모두 실제 반영된 소스의 파생 조회를 즉시 만료한다. 부분 실패도 성공분은 반영한다.
 *
 * 만료는 "오래됨 표시"(revalidateTag(tag, "max"))가 아니라 즉시 만료다 — 그래야 동기화 직후 다시
 * 불러온 화면이 새 값을 받는다(lib/server/sync-cache-tags.ts). 응답에는 결과 종류(outcome)를 실어
 * 화면이 잠김·부분 실패를 "완료"로 보이지 않게 한다(lib/admin/sync-outcome.ts).
 */
export async function completeBranchSync(
  result: RunAllResult,
  sources: readonly string[] = ["rev", "hw"],
): Promise<CompletedBranchSync> {
  // 잠김(다른 실행이 도는 중)·운영 밖 가드로 건너뛰었으면 아무것도 바뀌지 않았다 — 만료하지 않는다.
  if (result.skipped) return { ...result, outcome: outcomeOf(result) }

  const revSucceeded = sources.includes("rev") && (result.revOk === true || result.ok)
  const hwSucceeded = sources.includes("hw") && Boolean(result.hw)
  // 실패한 런도 실행 기록은 새로 생겼다 — 상태 줄이 옛 "마지막 동기화"를 보이지 않게 항상 만료한다.
  const bundles: SyncCacheTagBundle[] = ["branchSyncRun"]
  if (hwSucceeded) bundles.push("branchHw")
  if (revSucceeded) bundles.push("branchRev")
  expireSyncCacheTags(...bundles)

  if (!revSucceeded) return { ...result, outcome: outcomeOf(result) }

  try {
    const crmLinks = await runBranchRevLinkMaintenance()
    return { ...result, crmLinks, outcome: outcomeOf(result) }
  } catch {
    // 원본 동기화 성공과 후속 링크 오류를 구분한다. 실패 원문은 응답에 복제하지 않는다.
    return {
      ...result,
      warnings: [...(result.warnings ?? []), "CRM 매출 연결 유지보수 실패 — 연결 상태를 다시 확인해 주세요."],
      outcome: outcomeOf(result),
    }
  } finally {
    // 유지보수 도중 일부 링크가 반영된 뒤 실패해도 이전 매출 연결 캐시를 재사용하지 않는다.
    expireSyncCacheTags("branchRevLinks")
  }
}
