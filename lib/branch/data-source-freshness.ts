// 서빙 원천 신선도 순수 판정.
//
// 2026-07-16 사고: REV(매출 딜) 액티브 임포트가 7/3에 캡처된 채로 13일간 최신 시트
// 반영분을 가렸다. KR Team 화면은 "마지막 동기화: 방금"만 보여줬는데, 그 "방금"은 시트
// 미러 동기화 시각이었을 뿐 실제로 서빙 중인 임포트 런의 캡처 시각은 아니었다 — 화면만
// 봐서는 서빙 데이터가 2주 전 것임을 알 수 없었다.
//
// 이 함수는 "임포트 런의 캡처 시각이 시트 미러의 마지막 동기화 시각보다 오래됐는가"만
// 판정한다. UI 프레이밍(배지 문구·색)과 분리해 순수 함수로 두어 단위 테스트한다.
export function isImportStale(
  importAsOf: string | null | undefined,
  sheetLastSync: string | null | undefined,
): boolean {
  if (!importAsOf || !sheetLastSync) return false
  const importTime = Date.parse(importAsOf)
  const syncTime = Date.parse(sheetLastSync)
  if (Number.isNaN(importTime) || Number.isNaN(syncTime)) return false
  return importTime < syncTime
}
