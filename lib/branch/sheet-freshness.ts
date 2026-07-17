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
