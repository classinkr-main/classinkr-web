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
}

export interface SyncFailureStreak {
  source: SyncSourceKey
  /** 마지막 성공 이후 실패한 런 수(수동 재시도 포함). */
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

// runAll은 소스별 오류를 "rev: … | hw: …"로 잇는다. 접두사 없는 오류는 런 전체 실패로 본다.
function outcomeFor(run: SyncRunLike, source: SyncSourceKey): { kind: "success" | "failed" | "skip"; error?: string } {
  if (run.status === "running") return { kind: "skip" }
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

// 2일째에 처음 알리고 이후 3일마다 다시 알린다(2, 5, 8, …). 크론이 하루 한 번만 판정하므로
// 같은 날 중복 발송은 없다. 매일 알리면 운영방이 무뎌지고, 한 번만 알리면 이번처럼 묻힌다.
export function shouldAlertSyncFailureStreak(failedDays: number): boolean {
  return failedDays >= 2 && (failedDays - 2) % 3 === 0
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
      ? `조치: 시트 공유가 끊겼습니다. 시트를 ${options.serviceAccountEmail || "서비스 계정"}에 뷰어로 다시 공유한 뒤 매출 장부의 동기화 버튼을 누르세요.`
      : null,
  ].filter((line): line is string => Boolean(line))
  return {
    title: `${label} 동기화 ${streak.failedDays}일째 실패`,
    message: lines.join("\n"),
  }
}
