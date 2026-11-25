// 동기화가 실제로 돌릴 부분과 실행 기록(branch_sync_runs.source) — 순수 모듈(server-only 없음, 단위 테스트 대상).
//
// 부분(part):
//   rev — 매출 대시보드 스프레드시트 전체(REV 계약 + DSH·KPI 탭) + 장부 임포트 재캡처 + CRM 링크 유지보수
//   dsh — 같은 스프레드시트의 DSH·KPI 탭만(시트 고정 뒤 크론·수동이 REV 대신 돌린다)
//   hw  — 하드웨어 스프레드시트
//
// 요청은 지금처럼 "rev"·"hw" 로 들어온다(장부 ['rev','hw'], KR Team ['rev','hw'], CRM 딜·매출시트 ['rev'], 크론 전부).
// 시트 고정(lib/branch/rev-sheet-lock.ts)이 active 면 요청의 rev 를 dsh 로 바꾼다. 예외는 관리자의 "12/1 스냅샷 다시 읽기"
// (POST /api/admin/branch/sync { revSnapshotReread: true } → runAll allowLockedRevRead) 하나뿐이다.

import { isRevSheetLockActive, type RevSheetLock } from "@/lib/branch/rev-sheet-lock"

export type BranchSyncRequestSource = "rev" | "hw"
export type BranchSyncPart = "rev" | "dsh" | "hw"
/** branch_sync_runs.source 에 남기는 값(lib/repositories/branch-sync.ts SyncSource 의 동기화 몫). */
export type BranchSyncRunSource = "all" | "rev" | "hw" | "dsh" | "dsh+hw"

export interface BranchSyncPlan {
  /** 실제로 돌릴 부분(요청 순서). */
  parts: BranchSyncPart[]
  /** 시트 고정이 active 일 때만 — reread 는 고정 중 REV 를 다시 읽었는지(관리자 스냅샷 다시 읽기). */
  revSheetLock?: { lockedAt: string; reread: boolean }
}

/**
 * 요청 원천 + 고정 상태 → 돌릴 부분. 빈 요청은 전부(rev·hw)로 본다(runAll 과 같은 규칙).
 * 고정 active 이고 rev 를 요청했으면 rev → dsh(allowLockedRevRead 면 그대로 rev, reread=true).
 */
export function planSyncParts(
  requested: ReadonlyArray<BranchSyncRequestSource> | undefined,
  lock: RevSheetLock,
  opts: { allowLockedRevRead?: boolean } = {},
): BranchSyncPlan {
  const sources: BranchSyncRequestSource[] = requested && requested.length > 0 ? [...new Set(requested)] : ["rev", "hw"]
  if (!isRevSheetLockActive(lock)) return { parts: sources }
  const reread = opts.allowLockedRevRead === true && sources.includes("rev")
  const parts: BranchSyncPart[] = reread ? sources : sources.map((source) => (source === "rev" ? "dsh" : source))
  return { parts, revSheetLock: { lockedAt: lock.lockedAt, reread } }
}

/**
 * 실행 기록(branch_sync_runs.source)에 남길 값 — 실제로 돌린 부분. rev+hw → "all", rev → "rev", dsh+hw → "dsh+hw",
 * dsh → "dsh", hw → "hw".
 *
 * 왜(2026-09-25): 매출 장부 새로고침·매출 대시보드·매출시트의 수동 동기화는 REV만 돌리는데 기록은 늘 "all"이었다.
 * 동기화 건강 판정(lib/admin/sync-health.ts)과 크론 연속 실패 알림(failure-streak.ts)은 성공한 "all" 런을 두 원천 모두의
 * 성공으로 읽으므로, HW가 실패 중이어도 REV 새로고침 한 번이면 HW 연속 실패가 0으로 돌아갔다. 읽는 쪽은
 * syncRunCoversSource 로 자기 원천을 돌리지 않은 런을 건너뛴다. source 칸은 CHECK 제약 없는 text 라
 * (20260427_branch_dashboard.sql) 스키마 변경이 필요 없다.
 *
 * REV 를 읽지 않은 런(dsh·dsh+hw)에는 절대 "all"·"rev" 를 남기지 않는다 — lastSuccessfulRevSyncStartedAt
 * (이중 집계 흡수 기준 시각, branch-sales-ledger-sheet-writes.ts)이 source ∈ {all, rev} 로 고른다.
 */
export function syncRunSourceFor(parts: ReadonlyArray<BranchSyncPart>): BranchSyncRunSource {
  const hasHw = parts.includes("hw")
  if (parts.includes("rev")) return hasHw ? "all" : "rev"
  if (parts.includes("dsh")) return hasHw ? "dsh+hw" : "dsh"
  if (hasHw) return "hw"
  return "all"
}
