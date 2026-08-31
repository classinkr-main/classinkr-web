/**
 * CRM 클라이언트 읽기 캐시의 공통 창(SSOT).
 *
 * CRM 작업면은 하루에도 여러 번 드나드는 화면이라, 재방문마다 스켈레톤을 다시 보는 것이
 * 가장 큰 체감 비용이었다. 그래서 두 값을 여기 한 곳에서 정한다.
 *
 *  - TTL: 이 시간 안에는 네트워크 없이 캐시를 그대로 쓴다.
 *  - SWR 창: TTL이 지나도 이 시간 안이면 **캐시를 즉시 그리고** 백그라운드로 갱신한다.
 *
 * 창을 늘리는 것만으로는 절반이다. 마운트에서 1회만 로드하는 화면은 백그라운드 갱신
 * 결과를 받을 통로가 없어 창 길이만큼 낡은 채로 남는다. 그래서 CRM 화면들은
 * `onRevalidated`를 함께 넘겨 갱신 결과를 화면에 반영한다 — 즉시 그리되 낡은 채로 두지 않는다.
 *
 * 실제 보존은 lib/admin-client.ts의 엔트리별 `keepUntil`이 책임진다(전역 프루너가 이 창을
 * 잘라내던 회귀는 tests/admin/admin-client-cache-persistence.test.ts에 고정돼 있다).
 */
export const CRM_CACHE_TTL_MS = 120_000
export const CRM_CACHE_SWR_MS = 10 * 60_000
