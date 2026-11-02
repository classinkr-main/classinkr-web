// 시트 동기화 쓰기 허용 판정 + 실행 출처(runtime) — 순수 모듈(Supabase·server-only 없음, 단위 테스트 대상).
//
// 왜(2026-10-28 읽기 전용 감사): 매출·HW 시트 동기화(runAll → sync-rev/sync-hw → 미러 교체 RPC → 장부 임포트
// 재캡처 → 활성 포인터 UPSERT)는 전부 운영 DB에 쓴다. 로컬 .env.local 은 서울 운영 프로젝트의 키로 맞추라고
// 안내돼 있어(AGENTS.md 인프라 현황) 로컬 `next dev`·Preview 배포에서 동기화 버튼을 누르면 운영 DB를 덮어쓴다.
// 10/15~10/19 에 17:00 KST 크론(운영 배포, 옛 캡처 코드)과 운영 밖 환경의 수동 런(새 캡처 코드)이 같은
// sales_ledger_active_sources 를 번갈아 전환해 rev_period_entries 가 런마다 ~650 ↔ ~5,500 으로 진동했다.
// 쓰기 경로에 환경 가드도, 어느 환경이 썼는지 남기는 기록도 없어 사후 실측으로만 알 수 있었다.
//
// 규칙: VERCEL_ENV === "production" 이면 허용. 그 외(preview · development · 로컬)는
// BRANCH_SYNC_ALLOW_NONPROD_WRITE=1 이 있을 때만 허용하고, 없으면 "건너뜀"(쓰기 0회)으로 돌려준다.
// 판정은 던지지 않고 결과를 돌려준다 — runAll 이 lib/admin/sync-outcome.ts 의 skipped 결과 계약으로
// 화면에 그대로 전달해야 하기 때문이다(checkCronAuth 와 같은 꼴).

export const BRANCH_SYNC_NONPROD_WRITE_FLAG = "BRANCH_SYNC_ALLOW_NONPROD_WRITE"

type EnvLike = Record<string, string | undefined>

/** 이 런을 쓴 환경·코드. branch_sync_runs.runtime 와 sales_ledger_import_runs.metadata.runtime 에 그대로 실린다. */
export interface SyncRuntimeInfo {
  /** VERCEL_ENV 값(production · preview · development). Vercel 밖(로컬 next dev · 스크립트)은 "local". */
  env: string
  deploymentId: string | null
  sha: string | null
  region: string | null
  /** 쓰기를 허용한 근거. 운영이거나, 비운영 플래그. */
  allowedBy?: "production" | "nonprod-flag"
}

export type SyncWriteGuard =
  | { allowed: true; runtime: SyncRuntimeInfo & { allowedBy: "production" | "nonprod-flag" } }
  | { allowed: false; outcome: "skipped"; outcomeReason: string; runtime: SyncRuntimeInfo }

function trimmed(value: string | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

export function describeSyncRuntime(env: EnvLike = process.env): SyncRuntimeInfo {
  return {
    env: trimmed(env.VERCEL_ENV) ?? "local",
    deploymentId: trimmed(env.VERCEL_DEPLOYMENT_ID),
    sha: trimmed(env.VERCEL_GIT_COMMIT_SHA),
    region: trimmed(env.VERCEL_REGION),
  }
}

export function isNonprodWriteFlagOn(env: EnvLike = process.env): boolean {
  const value = env[BRANCH_SYNC_NONPROD_WRITE_FLAG]?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

/**
 * 동기화 쓰기 허용 판정. 허용이면 기록용 runtime(allowedBy 포함)을, 아니면 skipped 결과 계약의
 * outcome/outcomeReason 을 돌려준다. outcomeReason 은 화면에 그대로 나간다 — 비밀값·URL 금지.
 */
export function checkSyncWriteAllowed(env: EnvLike = process.env): SyncWriteGuard {
  const runtime = describeSyncRuntime(env)
  if (runtime.env === "production") return { allowed: true, runtime: { ...runtime, allowedBy: "production" } }
  if (isNonprodWriteFlagOn(env)) return { allowed: true, runtime: { ...runtime, allowedBy: "nonprod-flag" } }
  return {
    allowed: false,
    outcome: "skipped",
    outcomeReason:
      `운영 환경이 아니라 동기화 쓰기를 건너뜁니다(환경: ${runtime.env}). ` +
      `이 환경에서 운영 DB에 써야 하면 ${BRANCH_SYNC_NONPROD_WRITE_FLAG}=1 을 설정하세요.`,
    runtime,
  }
}
