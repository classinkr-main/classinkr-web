// 서빙 원천 신선도 순수 판정.
//
// 2026-07-16 사고: REV(매출 딜) 액티브 임포트가 7/3에 캡처된 채로 13일간 최신 시트
// 반영분을 가렸다. KR Team 화면은 "마지막 동기화: 방금"만 보여줬는데, 그 "방금"은 시트
// 미러 동기화 시각이었을 뿐 실제로 서빙 중인 임포트 런의 캡처 시각은 아니었다 — 화면만
// 봐서는 서빙 데이터가 2주 전 것임을 알 수 없었다.
//
// runAll은 미러 동기화 → 임포트 캡처 → 런 완료 순서다. 같은 런의 시작/완료 구간에
// 캡처된 임포트를 완료보다 몇 초 앞선다는 이유로 stale로 취급하지 않는다. 시작 시각이
// 없는 구버전 응답은 기존 완료 시각 비교를 유지한다. 임의 시간 허용치는 사용하지 않는다.
export function isImportStale(
  importAsOf: string | null | undefined,
  sheetLastSync: string | null | undefined,
  sheetSyncStartedAt?: string | null,
): boolean {
  if (!importAsOf || !sheetLastSync) return false
  const importTime = Date.parse(importAsOf)
  const syncTime = Date.parse(sheetLastSync)
  if (Number.isNaN(importTime) || Number.isNaN(syncTime)) return false
  const syncStart = sheetSyncStartedAt ? Date.parse(sheetSyncStartedAt) : NaN
  const comparisonTime = Number.isFinite(syncStart) && syncStart <= syncTime ? syncStart : syncTime
  return importTime < comparisonTime
}
