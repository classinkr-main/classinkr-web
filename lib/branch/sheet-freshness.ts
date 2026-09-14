// 시트가 마지막 동기화보다 눈에 띄게 앞서 있는지(=DB가 아직 그 시트 수정분을 못 받았는지) 순수 판정.
//
// 품질 웨이브 4 — 항목 4: 원래 SyncStatusBar.tsx 안에서만 계산하던 판정을 순수 함수로 추출해
// 단위 테스트하고, 장부 화면의 "장부 원천 스트립"에서도 같은 경고를 낼 수 있게 공유한다
// (isImportStale — lib/branch/data-source-freshness.ts — 와 같은 패턴).
//
// 짧은 편집(셀 오탈자 수정 등)이 동기화 몇 분 뒤에 걸리는 것까지 매번 경고하면 소음이라, 동기화
// 시각 대비 SHEET_AHEAD_WARN_MS(2분)보다 더 늦게 수정된 경우만 "시트가 더 새로움"으로 판정한다.
export const SHEET_AHEAD_WARN_MS = 2 * 60_000

export function isSheetAheadOfSync(
  sheetModifiedAt: string | null | undefined,
  lastSync: string | null | undefined,
): boolean {
  if (!sheetModifiedAt || !lastSync) return false
  const modifiedTime = Date.parse(sheetModifiedAt)
  const syncTime = Date.parse(lastSync)
  if (Number.isNaN(modifiedTime) || Number.isNaN(syncTime)) return false
  return modifiedTime - syncTime > SHEET_AHEAD_WARN_MS
}

// 품질 감사 2026-09-10 — #2(data_trust 핵심): getSheetModifiedTime(google-sheets.ts)가 재시도
// 후에도 실패하면 이제 던진다(예전엔 permission/network 실패를 null로 삼켜 "정상인데 값 없음"과
// "확인 자체가 실패함"이 구분되지 않았다 — 그 결과 위 isSheetAheadOfSync가 null 입력에 무조건
// false를 반환해 "시트가 더 새로움" 경고가 조용히 꺼졌다). summary-payload.ts의 readSheetFreshness가
// dash/hw 두 Drive 조회를 Promise.allSettled로 모은 뒤 이 순수 함수에 넘겨 판정한다 — async/캐시와
// 분리해 여기서 직접 단위 테스트한다(tests/branch/sheet-freshness.test.ts).
export interface SheetFreshnessResult {
  modifiedTime: string | null
  /** true면 dash/hw 중 최소 하나의 Drive 조회가 재시도 후에도 실패했다는 뜻 —
   *  modifiedTime이 null이어도 "시트에 값이 없다"가 아니라 "확인 못 했다"로 승격해야 한다. */
  failed: boolean
}

export function resolveSheetFreshnessFromSettled(
  dash: PromiseSettledResult<string | null>,
  hw: PromiseSettledResult<string | null>,
): SheetFreshnessResult {
  const candidates = [dash, hw]
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter((t): t is string => Boolean(t))
  return {
    modifiedTime: candidates.length === 0 ? null : candidates.sort().pop() ?? null,
    failed: dash.status === "rejected" || hw.status === "rejected",
  }
}
