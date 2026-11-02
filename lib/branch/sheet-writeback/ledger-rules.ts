// 시트 쓰기 감사 행으로 장부 화면·매출시트 배너·되돌리기 가드가 같이 쓰는 판정 — 순수 모듈(클라이언트 겸용 — server-only 금지).
//
// 정본은 여기 하나다. 서버(lib/admin-crm-revenue-sheet.ts 미반영 배너, app/api/admin/branch/ledger-drafts/[id] 되돌리기)와
// 화면(components/admin/branch/ledger/sheet-write-view.ts)은 이 함수를 가져다 쓴다 — 규칙을 따로 짜지 않는다.

/**
 * 감사 행(public.branch_sales_ledger_sheet_writes)의 status — 닫힌 목록의 정본. 마이그레이션 CHECK 제약과 같고,
 * 저장소(SHEET_WRITE_STATUSES)와 화면(GET sheetWrites 판독)이 이 배열을 쓴다.
 */
export const SHEET_WRITE_ATTEMPT_STATUSES = ["sending", "written", "refused", "failed", "unknown"] as const
export type SheetWriteAttemptStatus = (typeof SHEET_WRITE_ATTEMPT_STATUSES)[number]

/**
 * 시트에 쓴 정정을 미러가 이미 읽었는가 — 시도가 written 이고, 그 뒤에 시작한 REV 동기화가 성공했으면
 * branch_rev_deals(미러)가 그 값을 갖고 있다. 그 초안을 장부 오버레이·미반영 배너에 또 세면 같은 금액이
 * 시트 행 값과 적용 초안 양쪽에서 읽힌다(시트가 정본 — 미러를 믿는다). 시각을 해석하지 못하면 false(기존 동작 쪽).
 * 경계는 엄격한 < 다 — 같은 시각에 시작한 동기화는 그 쓰기를 읽었다고 보장하지 못한다.
 * cutoff 는 absorptionCutoff(마지막 성공 동기화 시작 ↔ 읽는 쪽이 가진 시트 행의 데이터 시각 중 이른 쪽)를 넘긴다 —
 * 동기화 시각만 넘기면 읽는 쪽 행이 그 동기화보다 오래됐을 때 쓰기가 없는 행을 두고 정정을 뺀다.
 */
export function isSheetWriteAbsorbed(
  sw: { status: string; writtenAt: string | null } | null | undefined,
  cutoff: string | null,
): boolean {
  if (!sw || sw.status !== "written" || !sw.writtenAt || !cutoff) return false
  const writtenAt = Date.parse(sw.writtenAt)
  const cutoffAt = Date.parse(cutoff)
  return Number.isFinite(writtenAt) && Number.isFinite(cutoffAt) && writtenAt < cutoffAt
}

/**
 * 이중 집계 제외의 기준 시각 — 서버의 마지막 성공 REV 동기화 시작 시각과, 화면(또는 배너)이 실제로 가진 시트 행
 * 데이터의 시각(미러 synced_at·액티브 임포트 캡처 시각) 중 이른 쪽. 화면 행이 그 동기화보다 오래됐으면(다른 화면이
 * 동기화했는데 이 화면은 옛 행·동기화 직후 SWR 한 번·재캡처 실패로 옛 임포트) 그 행에는 시트 쓰기가 아직 없으므로
 * 그 동기화를 기준으로 쓰면 정정이 화면에서 사라진다. 둘 중 하나라도 모르면 null(제외하지 않음 — 기존 동작 쪽).
 */
export function absorptionCutoff(lastRevSyncStartedAt: string | null, dataSyncedAt: string | null): string | null {
  if (!lastRevSyncStartedAt || !dataSyncedAt) return null
  const syncStartedAt = Date.parse(lastRevSyncStartedAt)
  const dataAt = Date.parse(dataSyncedAt)
  if (!Number.isFinite(syncStartedAt) || !Number.isFinite(dataAt)) return null
  return dataAt < syncStartedAt ? dataSyncedAt : lastRevSyncStartedAt
}

/**
 * 행들의 데이터 시각 중 가장 이른 것(absorptionCutoff 의 dataSyncedAt). 한 동기화·캡처의 행은 같은 시각을 갖지만,
 * 섞여 있으면 가장 오래된 행을 기준으로 한다(그 행에는 쓰기가 아직 없을 수 있다). 시각이 없는 행이 하나라도 있으면 null.
 */
export function oldestSyncedAt(rows: ReadonlyArray<{ syncedAt?: string | null }>): string | null {
  let oldest: { at: number; text: string } | null = null
  for (const row of rows) {
    const text = typeof row.syncedAt === "string" ? row.syncedAt : null
    const at = text ? Date.parse(text) : Number.NaN
    if (!text || !Number.isFinite(at)) return null
    if (!oldest || at < oldest.at) oldest = { at, text }
  }
  return oldest?.text ?? null
}

/**
 * 장부 되돌리기(PATCH action=reverse)를 막는가 — 시트에 쓴 정정을 장부에서만 상쇄하면 시트에는 새 값이 남는다.
 * written, 그리고 sending(장부 항목은 시트 되읽기 확인 뒤에만 생기므로 항목이 있는데 sending 이면 시트에는 쓰였고
 * 감사 행 갱신만 못 한 것)이면 막는다. 다만 code 가 no_change(시트에서 바뀌는 칸이 없었음)면 시트에 쓴 것이 없으므로
 * 막지 않는다 — 되돌려도 화면은 그대로 시트 값이다. 그 밖·기록 없음은 기존 동작.
 */
export function sheetWriteBlocksReverse(status: string | null | undefined, code?: string | null): boolean {
  if (code === "no_change") return false
  return status === "written" || status === "sending"
}
