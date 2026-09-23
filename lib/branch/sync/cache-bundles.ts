// 시트 동기화 결과 → 즉시 만료할 캐시 묶음 판정(순수). 태그 목록·만료 호출은 lib/server/sync-cache-tags.ts.
// 라우트 테스트가 서버 전용 모듈(next/cache·저장소)을 끌어오지 않고도 이 규칙을 그대로 쓰게 분리했다.

export type BranchSyncCacheBundle = "branchRev" | "branchHw" | "branchSyncStatus"

/**
 * 시트 동기화(runAll) 결과 → 만료할 묶음. 설계 §7.1 만료 규칙
 * (docs/superpowers/specs/2026-09-14-vercel-pro-cron-freshness-design.md):
 * - 잠금에 걸려 건너뛰었으면(skipped) 아무것도 안 바뀌었으니 만료하지 않는다([]).
 * - 데이터를 쓴 소스의 묶음만 — runAll은 부분 실패도 ok=false로 뭉뚱그리므로 소스별 성공 신호로 본다.
 *   rev는 revOk(성공 0행과 실패를 구분), hw는 성공했을 때만 채워지는 결과 객체.
 * - 전 소스 실패여도 실행 기록은 바뀌었으니 상태 묶음(branchSyncStatus)은 만료한다.
 * 수동 동기화 라우트와 크론 라우트가 같은 규칙을 쓴다.
 */
export function branchSyncBundles(
  result: { ok: boolean; skipped?: boolean; revOk?: boolean; hw?: unknown },
  sources: ReadonlyArray<"rev" | "hw">,
): BranchSyncCacheBundle[] {
  if (result.skipped) return []
  const bundles: BranchSyncCacheBundle[] = []
  if (sources.includes("rev") && (result.ok || result.revOk === true)) bundles.push("branchRev")
  if (sources.includes("hw") && Boolean(result.hw)) bundles.push("branchHw")
  return bundles.length > 0 ? bundles : ["branchSyncStatus"]
}
