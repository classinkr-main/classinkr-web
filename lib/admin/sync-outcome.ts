// 수동 동기화 결과 계약과 화면 문구 — 서버·클라이언트 공용 순수 모듈
// (docs/superpowers/specs/2026-09-14-vercel-pro-cron-freshness-design.md §7.2, 라운드 5 기획 S-1·S-3).
//
// 동기화 버튼은 결과가 다섯 가지다: 끝났다(done) · 다른 실행이 잠금을 잡고 있어 아무것도 안 했다(running) ·
// 사유가 있어 건너뛰었다(skipped) · 일부 소스만 썼다(partial) · 실패했다(failed). 예전 화면은 HTTP 200이면
// 전부 "완료"로 보여 줬다 — 잠금에 걸린 200 { skipped: true }도 "동기화를 완료했습니다"가 됐다.
// 이 모듈의 describeSyncOutcome 하나로 모든 버튼이 같은 문구·톤을 쓰고, 완료가 아니면 "완료"라고 말하지 않는다.

export type SyncOutcome = "done" | "running" | "skipped" | "partial" | "failed"

export interface SyncOutcomeFields {
  outcome?: SyncOutcome
  /** 사람이 읽는 한 줄 사유 — 비밀값·URL 금지. */
  outcomeReason?: string
  /** running일 때 잠금을 잡은 실행의 시작 시각(ISO). */
  startedAt?: string
  /** 실패로 치지 않는 경고(범위 한도·재캡처 실패 등). */
  warnings?: string[]
  // 계약 이전 응답·HTTP 오류 본문도 같은 함수로 읽기 위한 호환 필드.
  ok?: boolean
  skipped?: boolean
  revOk?: boolean
  hw?: unknown
  error?: string
}

export type SyncNoticeTone = "success" | "info" | "warning" | "error"

export interface SyncOutcomeNotice {
  tone: SyncNoticeTone
  message: string
}

/**
 * 러너 결과(runAll의 ok·skipped·revOk·hw)에서 결과 종류를 정한다 — 설계 §7.2 규칙 그대로.
 * - ok → done, skipped → running, ok가 아니고 revOk이거나 hw 결과가 있으면 partial, 나머지 failed.
 */
export function resolveSyncOutcome(result: Pick<SyncOutcomeFields, "ok" | "skipped" | "revOk" | "hw">): SyncOutcome {
  if (result.ok) return "done"
  if (result.skipped) return "running"
  if (result.revOk === true || Boolean(result.hw)) return "partial"
  return "failed"
}

function minutesAgoLabel(startedAt: string | undefined, now: number): string | null {
  if (!startedAt) return null
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return null
  const minutes = Math.max(0, Math.floor((now - started) / 60_000))
  return minutes < 1 ? "방금 시작" : `${minutes}분 전 시작`
}

function firstWarning(fields: SyncOutcomeFields): string | null {
  const warning = fields.warnings?.find((item) => typeof item === "string" && item.trim())
  return warning ? warning.trim() : null
}

/**
 * 동기화 응답(또는 오류 응답 본문)을 화면 알림 한 줄로 바꾼다.
 * httpStatus를 넘기면 권한 거부(401·403)를 "실패" 대신 권한 안내로 말한다.
 */
export function describeSyncOutcome(
  fields: SyncOutcomeFields | null | undefined,
  options: { now?: number; httpStatus?: number } = {},
): SyncOutcomeNotice {
  const now = options.now ?? Date.now()
  if (options.httpStatus === 401 || options.httpStatus === 403) {
    return { tone: "error", message: "동기화 권한이 없습니다 — 관리자(ADMIN) 계정만 시트 동기화를 실행할 수 있습니다." }
  }
  const body = fields ?? {}
  const outcome: SyncOutcome = body.outcome ?? resolveSyncOutcome(body)
  const warning = firstWarning(body)

  switch (outcome) {
    case "done":
      return warning
        ? { tone: "warning", message: `동기화를 마쳤습니다 — 확인할 것: ${warning}` }
        : { tone: "success", message: "동기화를 마쳤습니다 — 화면을 최신 값으로 다시 불러왔습니다." }
    case "running": {
      const since = minutesAgoLabel(body.startedAt, now)
      return {
        tone: "info",
        message: `이미 동기화가 진행 중입니다${since ? `(${since})` : ""} — 이번 요청은 실행하지 않았습니다. 잠시 뒤 다시 불러오면 반영됩니다.`,
      }
    }
    case "skipped":
      return { tone: "info", message: body.outcomeReason?.trim() || "동기화를 건너뛰었습니다." }
    case "partial": {
      const detail = warning ?? body.error?.trim() ?? null
      return {
        tone: "warning",
        message: `일부만 동기화됐습니다${detail ? ` — ${detail}` : ""}. 반영된 소스는 화면에 적용했습니다.`,
      }
    }
    case "failed":
    default:
      return {
        tone: "error",
        message: `동기화에 실패했습니다${body.error?.trim() ? ` — ${body.error.trim()}` : ""}. 화면은 마지막으로 성공한 동기화 기준입니다.`,
      }
  }
}

/**
 * fetch 응답을 결과 필드로 읽는다 — 200이든 500이든 본문(JSON)을 버리지 않는다.
 * (adminFetchJson은 2xx가 아니면 본문을 버리고 문자열 오류만 던져, 부분 실패의 경고·결과 종류를 잃는다.)
 */
export async function readSyncOutcomeResponse(response: Response): Promise<{ status: number; body: SyncOutcomeFields | null }> {
  const body = (await response.json().catch(() => null)) as SyncOutcomeFields | null
  return { status: response.status, body: body && typeof body === "object" ? body : null }
}
