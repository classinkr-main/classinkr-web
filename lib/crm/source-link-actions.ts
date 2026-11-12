// CRM 소스 링크 확정·제외·되돌리기 — 순수 로직(서버·React 의존 없음, 단위 테스트 대상).
//
// 매칭 인박스(MatchingInboxClient)와 매출시트(rev-sheet) 두 화면이 같은 서버 경로
// (PATCH /api/admin/crm/source-links/[id]·/bulk)를 쓴다. 화면마다 따로 짜던 "어느 행이
// 무슨 상태가 되는지·실패하면 무엇을 되돌리는지·결과 문구"를 여기 하나로 모은다.
// 실제 호출과 잠금은 components/admin/crm/matching/useSourceLinkActions.ts 훅이 한다.

import type { CrmSourceLinkStatus } from "@/lib/admin-crm-revenue-types"

export type SourceLinkAction = "confirm" | "reject" | "stale"

/** 서버 bulk 경로의 한 번 처리 상한(lib/repositories/crm-source-links.ts BULK_LINK_ACTION_LIMIT와 같은 값). */
export const SOURCE_LINK_BULK_LIMIT = 200

/** 확정·제외 뒤 "되돌리기"를 띄워 두는 시간. */
export const SOURCE_LINK_UNDO_WINDOW_MS = 10_000

export const SOURCE_LINK_ACTION_LABEL: Record<SourceLinkAction, string> = {
  confirm: "확정",
  reject: "제외",
  stale: "재검수로 되돌림",
}

/** 액션이 성공하면 링크가 갖게 될 상태 — 서버 updateCrmSourceLinkStatus와 같은 규칙. */
export function sourceLinkStatusAfter(action: SourceLinkAction): CrmSourceLinkStatus {
  if (action === "confirm") return "confirmed"
  if (action === "reject") return "rejected"
  return "stale"
}

/**
 * 행에서 바로 확정·제외할 수 있는가 — 링크가 있고 후보·재검수 상태일 때만.
 * 미매칭(링크 없음)은 연결 대상을 골라야 해서 매칭 인박스의 수동 연결로 보낸다.
 */
export function isSourceLinkActionable(row: { linkId: string | null; linkStatus: CrmSourceLinkStatus | null }): boolean {
  return row.linkId !== null && (row.linkStatus === "candidate" || row.linkStatus === "stale")
}

/** 확정·제외된 행은 재검수(stale)로 되돌릴 수 있다 — 제외 쌍이 후보 재생성에서 영구 고정되지 않게(감사 §4.3). */
export function isSourceLinkRevertible(row: { linkId: string | null; linkStatus: CrmSourceLinkStatus | null }): boolean {
  return row.linkId !== null && (row.linkStatus === "confirmed" || row.linkStatus === "rejected")
}

/**
 * 되돌리기 액션 — 서버에 "직전 상태로" 경로가 없어 확정·제외 모두 재검수(stale)로 보낸다.
 * 재검수 행은 '처리 필요'에 다시 올라 그 자리에서 다시 확정·제외할 수 있다. 재검수 자체는 되돌릴 대상이 아니다.
 */
export function undoActionFor(action: SourceLinkAction): SourceLinkAction | null {
  return action === "stale" ? null : "stale"
}

/** 순서를 지키며 중복·빈 id를 뺀다(서버 bulk와 같은 규칙). */
export function dedupeLinkIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.filter((id) => typeof id === "string" && id.trim().length > 0)))
}

/** 한 번 bulk 요청에 실을 id와 상한을 넘어 남길 id를 나눈다. */
export function splitBulkLinkIds(ids: readonly string[], limit = SOURCE_LINK_BULK_LIMIT) {
  const unique = dedupeLinkIds(ids)
  return { sent: unique.slice(0, limit), skipped: unique.slice(limit) }
}

interface LinkRowShape {
  linkId: string | null
  linkStatus: CrmSourceLinkStatus | null
}

/**
 * 낙관적 반영 — ids에 해당하는 행에 patch를 적용한 새 배열과, 되돌릴 때 쓸 원래 행 스냅샷을 돌려준다.
 * 원래 행 객체를 그대로 보관하므로 복원은 정확히 요청 전 값으로 돌아간다(필드별 역산 없음).
 */
export function applyOptimisticLinkPatch<T extends LinkRowShape>(
  rows: readonly T[],
  ids: readonly string[],
  patch: (row: T) => T
): { rows: T[]; previous: Map<string, T> } {
  const target = new Set(ids)
  const previous = new Map<string, T>()
  const next = rows.map((row) => {
    if (!row.linkId || !target.has(row.linkId)) return row
    if (!previous.has(row.linkId)) previous.set(row.linkId, row)
    return patch(row)
  })
  return { rows: next, previous }
}

/** 스냅샷으로 복원 — onlyIds를 주면 그 id만(bulk 부분 실패). 그 사이 바뀐 다른 행은 건드리지 않는다. */
export function restoreLinkRows<T extends LinkRowShape>(
  rows: readonly T[],
  previous: ReadonlyMap<string, T>,
  onlyIds?: readonly string[]
): T[] {
  const restore = onlyIds ? new Set(onlyIds) : null
  return rows.map((row) => {
    if (!row.linkId) return row
    if (restore && !restore.has(row.linkId)) return row
    return previous.get(row.linkId) ?? row
  })
}

export interface BulkSourceLinkResult {
  updated: number
  failed: Array<{ id: string; error: string }>
  skipped?: number
}

/** bulk 응답에서 낙관적 반영을 되돌려야 할 id — 실패 + 상한 초과로 남긴 id. */
export function bulkIdsToRollback(result: BulkSourceLinkResult, skippedIds: readonly string[] = []): string[] {
  return dedupeLinkIds([...result.failed.map((entry) => entry.id), ...skippedIds])
}

/** bulk 응답에서 실제로 바뀐 id — 되돌리기 대상. */
export function bulkSucceededIds(sentIds: readonly string[], result: BulkSourceLinkResult): string[] {
  const failed = new Set(result.failed.map((entry) => entry.id))
  return sentIds.filter((id) => !failed.has(id))
}

/**
 * bulk 결과 한 줄 — 처리·실패(어느 행인지)·미처리(상한 초과)를 모두 밝혀 합이 선택 건수와 맞게 한다.
 * 매칭 인박스가 쓰던 문구 그대로다.
 */
export function describeBulkSourceLinkResult(
  action: SourceLinkAction,
  result: BulkSourceLinkResult,
  labelOf: (id: string) => string | undefined = () => undefined
): string {
  const formatNumber = (value: number) => new Intl.NumberFormat("ko-KR").format(value)
  const actionLabel = action === "confirm" ? "확정" : action === "reject" ? "제외" : "재검수"
  const parts = [`${actionLabel} ${formatNumber(result.updated)}건 처리`]
  if (result.failed.length > 0) {
    const names = result.failed
      .slice(0, 3)
      .map(({ id }) => labelOf(id) ?? id.slice(0, 8))
      .join(", ")
    const more = result.failed.length > 3 ? ` 외 ${formatNumber(result.failed.length - 3)}건` : ""
    parts.push(`실패 ${formatNumber(result.failed.length)}건 (${names}${more})`)
  }
  if (result.skipped && result.skipped > 0) {
    parts.push(`미처리 ${formatNumber(result.skipped)}건 · 한 번에 처리할 수 있는 한도를 넘어 남겨 두었습니다`)
  }
  return parts.join(" · ")
}

/** 단건 성공 문구 — 되돌리기 버튼 옆에 붙는다. */
export function describeSingleSourceLinkResult(action: SourceLinkAction, label: string | undefined): string {
  const subject = label ? `${label} ` : ""
  if (action === "confirm") return `${subject}연결을 확정했습니다.`
  if (action === "reject") return `${subject}후보를 제외했습니다.`
  return `${subject}재검수로 되돌렸습니다.`
}

// ── 요청 실행(낙관적 반영 → 서버 → 실패분 복원) ────────────────────────────────
// fetchJson은 주입한다(화면은 adminFetchJson, 테스트는 가짜). 화면 상태를 직접 만지지 않고
// apply/rollback 두 콜백만 부른다 — 상태 모양(인박스 data.rows, 매출시트 data.rows)은 호출자가 안다.

export type SourceLinkFetchJson = <T>(input: string, init: { method: "PATCH"; body: string }) => Promise<T>

export interface SourceLinkRunHandlers {
  /** 요청 전에 화면에 먼저 반영한다(낙관적). */
  apply: (ids: string[], status: CrmSourceLinkStatus) => void
  /** 서버가 받지 않은 id만 요청 전 값으로 되돌린다. */
  rollback: (ids: string[]) => void
}

export type SingleSourceLinkRun = { ok: true } | { ok: false; error: string }

export type BulkSourceLinkRun =
  | { ok: true; result: BulkSourceLinkResult; succeededIds: string[]; skippedIds: string[] }
  | { ok: false; error: string }

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function runSingleSourceLinkAction(
  fetchJson: SourceLinkFetchJson,
  linkId: string,
  action: SourceLinkAction,
  handlers: SourceLinkRunHandlers
): Promise<SingleSourceLinkRun> {
  handlers.apply([linkId], sourceLinkStatusAfter(action))
  try {
    await fetchJson(`/api/admin/crm/source-links/${encodeURIComponent(linkId)}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    })
    return { ok: true }
  } catch (error) {
    handlers.rollback([linkId])
    return { ok: false, error: errorMessage(error, "매칭 상태 변경에 실패했습니다.") }
  }
}

export async function runBulkSourceLinkAction(
  fetchJson: SourceLinkFetchJson,
  ids: readonly string[],
  action: SourceLinkAction,
  handlers: SourceLinkRunHandlers
): Promise<BulkSourceLinkRun> {
  const { sent, skipped } = splitBulkLinkIds(ids)
  if (sent.length === 0) return { ok: false, error: "선택한 연결이 없습니다." }
  // 상한을 넘는 id는 보내지도, 미리 반영하지도 않는다 — 화면이 서버와 어긋나지 않게.
  handlers.apply(sent, sourceLinkStatusAfter(action))
  try {
    const response = await fetchJson<BulkSourceLinkResult>(`/api/admin/crm/source-links/bulk`, {
      method: "PATCH",
      body: JSON.stringify({ ids: sent, action }),
    })
    const result: BulkSourceLinkResult = {
      updated: Number(response?.updated ?? 0),
      failed: Array.isArray(response?.failed) ? response.failed : [],
      skipped: Number(response?.skipped ?? 0) + skipped.length,
    }
    const rollbackIds = bulkIdsToRollback(result)
    if (rollbackIds.length > 0) handlers.rollback(rollbackIds)
    return { ok: true, result, succeededIds: bulkSucceededIds(sent, result), skippedIds: skipped }
  } catch (error) {
    handlers.rollback(sent)
    return { ok: false, error: errorMessage(error, "일괄 처리에 실패했습니다.") }
  }
}

/** bulk 되돌리기 줄의 짧은 문구 — 자세한 처리·실패 내역은 화면의 결과 줄이 따로 보인다. */
export function describeBulkSourceLinkUndo(action: SourceLinkAction, count: number): string {
  const formatted = new Intl.NumberFormat("ko-KR").format(count)
  if (action === "confirm") return `${formatted}건을 확정했습니다.`
  if (action === "reject") return `${formatted}건을 제외했습니다.`
  return `${formatted}건을 재검수로 되돌렸습니다.`
}
