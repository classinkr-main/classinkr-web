import { getBusinessDateParts } from "@/lib/business-time"

// 동기화 연속 실패 판정 — 순수 함수(크론 라우트가 branch_sync_runs 최근 행을 넘긴다).
// 2026-08-28~09-10 REV 동기화가 매일 403으로 실패했는데 화면 배지뿐이라 14일간 복구되지
// 않았다. 소스별로 "몇 일째 실패 중인가"를 세고, 알릴 날인지 판정하고, 알림 문구를 만든다.

export type SyncSourceKey = "rev" | "hw"

export interface SyncRunLike {
  started_at: string
  status: "running" | "success" | "failed"
  error: string | null
  source?: string
  /** branch_sync_runs.trigger — "cron"·"manual". 알림 판정(그날 첫 크론 실패)에만 쓴다. */
  trigger?: string
}

export interface SyncFailureStreak {
  source: SyncSourceKey
  /** 마지막 성공 이후 이 원천을 돌려 실패한 런 수(수동 재시도 포함, 이 원천을 돌리지 않은 런은 빼고). */
  failedRuns: number
  /** 실패가 있었던 서로 다른 KST 날짜 수 — 알림 판정 기준. */
  failedDays: number
  lastFailureAt: string | null
  lastSuccessAt: string | null
  /** 가장 최근 실패의 이 소스 오류 문구. */
  lastError: string | null
  /** 넘겨받은 기록 안에서 성공을 못 만났다 — 실제 연속 실패는 이보다 길 수 있다. */
  truncated: boolean
}

const SOURCE_KEYS: SyncSourceKey[] = ["rev", "hw"]
const SOURCE_LABEL: Record<SyncSourceKey, string> = { rev: "매출 시트(REV·DSH·KPI)", hw: "하드웨어 시트" }
const DAY_MS = 86_400_000

/**
 * 이 런이 해당 원천을 실제로 돌렸는가.
 *
 * runAll은 한 원천만 돌린 런(매출 장부 새로고침·매출 대시보드·매출시트의 수동 동기화 = REV만)에
 * 그 원천 이름("rev"·"hw")을 source로 남긴다(2026-09-25). 그런 런은 다른 원천의 판정에서 건너뛴다 —
 * 예전에는 모든 런이 "all"로 남아, HW가 이틀째 실패 중이어도 누가 REV만 새로고침하면 그 성공이
 * HW의 성공으로 읽혀 연속 실패가 0으로 돌아갔다(경고 띠·크론 알림 둘 다).
 *
 * 하위 호환: "all"·빈 값(옛 기록 포함)은 예전 해석 그대로 두 원천을 모두 돌린 런으로 본다. 수정
 * 이전에 REV만 돌린 옛 "all" 행은 구분할 방법이 없어 그대로 읽힌다 — 최근 60런 창에서 밀려나며 사라진다.
 */
export function syncRunCoversSource(run: Pick<SyncRunLike, "source">, source: SyncSourceKey): boolean {
  const recorded = run.source
  if (recorded === "rev" || recorded === "hw") return recorded === source
  return true
}

// runAll은 소스별 오류를 "rev: … | hw: …"로 잇는다. 접두사 없는 오류는 런 전체 실패로 본다
// (단일 원천 런이면 그 원천의 실패 — 다른 원천에는 애초에 건너뜀이다).
function outcomeFor(run: SyncRunLike, source: SyncSourceKey): { kind: "success" | "failed" | "skip"; error?: string } {
  if (run.status === "running") return { kind: "skip" }
  if (!syncRunCoversSource(run, source)) return { kind: "skip" }
  if (run.status === "success") return { kind: "success" }
  const segments = (run.error ?? "").split(" | ").map((segment) => segment.trim()).filter(Boolean)
  const own = segments.find((segment) => segment.startsWith(`${source}:`))
  if (own) return { kind: "failed", error: own }
  const otherSourceOnly = segments.length > 0 && segments.every((segment) =>
    SOURCE_KEYS.some((key) => key !== source && segment.startsWith(`${key}:`)),
  )
  if (otherSourceOnly) return { kind: "success" }
  return { kind: "failed", error: run.error ?? "알 수 없는 오류" }
}

export function computeSyncFailureStreak(runs: SyncRunLike[], source: SyncSourceKey): SyncFailureStreak {
  const ordered = runs
    .filter((run) => run.source !== "insights")
    .slice()
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
  const days = new Set<string>()
  let failedRuns = 0
  let lastFailureAt: string | null = null
  let lastError: string | null = null
  let lastSuccessAt: string | null = null
  for (const run of ordered) {
    const outcome = outcomeFor(run, source)
    if (outcome.kind === "skip") continue
    if (outcome.kind === "success") {
      lastSuccessAt = run.started_at
      break
    }
    failedRuns += 1
    days.add(getBusinessDateParts(new Date(run.started_at)).date)
    if (!lastFailureAt) {
      lastFailureAt = run.started_at
      lastError = outcome.error ?? null
    }
  }
  return {
    source,
    failedRuns,
    failedDays: days.size,
    lastFailureAt,
    lastSuccessAt,
    lastError,
    truncated: failedRuns > 0 && lastSuccessAt === null,
  }
}

// 2일째에 처음 알리고 이후 3일마다 다시 알린다(2, 5, 8, …). 같은 날 중복 발송은
// isFirstCronFailureOfKstDay가 막는다. 매일 알리면 운영방이 무뎌지고, 한 번만 알리면 이번처럼 묻힌다.
export function shouldAlertSyncFailureStreak(failedDays: number): boolean {
  return failedDays >= 2 && (failedDays - 2) % 3 === 0
}

/**
 * 방금 끝난 크론 실행이 이 원천의 "KST 오늘 첫 크론 실패"인가 — 알림은 이때만 판정한다.
 *
 * 크론이 하루 3번(KST 09·13·17시) 돌면서 같은 날 실패가 여러 번 쌓인다. 실패할 때마다 판정하면
 * "2일째 실패" 알림이 하루 세 번 나간다(2026-09-14 설계 §6). 수동 재시도 실패는 세지 않는다 —
 * 아침에 누가 수동으로 눌러 실패했다고 그날 크론 알림이 빠지면 안 된다.
 * runs에는 방금 끝난 실행이 들어 있어야 한다(listRecentSyncRunsFresh).
 */
export function isFirstCronFailureOfKstDay(runs: SyncRunLike[], source: SyncSourceKey, now: Date): boolean {
  const today = getBusinessDateParts(now).date
  const cronFailuresToday = runs.filter(
    (run) =>
      run.trigger === "cron" &&
      getBusinessDateParts(new Date(run.started_at)).date === today &&
      outcomeFor(run, source).kind === "failed",
  )
  return cronFailuresToday.length === 1
}

// 권한·공유 끊김 계열(재시도·재동기화로 안 풀리고 사람이 시트를 다시 공유해야 하는 오류).
export function isPermissionError(error: string | null): boolean {
  if (!error) return false
  const text = error.toLowerCase()
  return text.includes("does not have permission") || text.includes("permission_denied") || text.includes("403")
}

export function buildSyncFailureAlert(
  streak: SyncFailureStreak,
  options: { now: Date; serviceAccountEmail?: string | null },
): { title: string; message: string } {
  const label = SOURCE_LABEL[streak.source]
  const lastSuccess = streak.lastSuccessAt
    ? `마지막 성공 ${getBusinessDateParts(new Date(streak.lastSuccessAt)).date} (${Math.floor(
        (options.now.getTime() - Date.parse(streak.lastSuccessAt)) / DAY_MS,
      )}일 전)`
    : "최근 기록에 성공 없음"
  const lines = [
    `${lastSuccess} · 실패 ${streak.failedRuns}회. 그동안 어드민 매출 화면은 마지막으로 성공한 데이터를 보여줍니다.`,
    streak.lastError ? `오류: ${streak.lastError.slice(0, 180)}` : null,
    isPermissionError(streak.lastError)
      ? `조치: 시트 공유가 끊겼습니다. 시트를 ${options.serviceAccountEmail || "서비스 계정"}에 뷰어로 다시 공유한 뒤 매출 장부에서 새로고침하세요.`
      : null,
  ].filter((line): line is string => Boolean(line))
  return {
    title: `${label} 동기화 ${streak.failedDays}일째 실패`,
    message: lines.join("\n"),
  }
}
