/**
 * 학원 규모 선택지 — 공개 폼 전부가 쓰는 단일 정본.
 *
 * 이 값은 여러 폼에 **문자열 그대로** 흩어져 있었다(문의 화면 select, 자료실 다운로드,
 * 쇼룸 예약). 리드 미러링이 모든 경로의 값을 같은 `leads.size` 컬럼에 쌓기 때문에
 * 문구가 한 글자라도 갈라지면 규모별 집계가 둘로 쪼개진다. 실제로 데모 모달만 자유
 * 입력이라 같은 컬럼에 버킷 값과 자유 문자열이 섞여 있었다.
 *
 * 리드 스코어가 이 값을 파싱해 배점한다(`lib/crm/lead-ranking.ts` 의 `parseLeadSize` —
 * 문자열에서 첫 숫자를 읽는다). 그래서 옵션 문구를 바꾸면 **과거 리드의 점수가 아니라
 * 앞으로 들어올 리드의 버킷이 갈라진다** — 문구 변경은 집계 연속성을 먼저 확인하고 한다.
 */
export const ACADEMY_SIZE_OPTIONS = [
  "100명 이하",
  "100~300명",
  "300~500명",
  "500명 이상",
] as const

export type AcademySize = (typeof ACADEMY_SIZE_OPTIONS)[number]

/** select 의 placeholder. 값이 빈 문자열이라 "미선택"과 구분된다. */
export const ACADEMY_SIZE_PLACEHOLDER = "학원 규모를 선택해주세요"

export function isAcademySize(value: unknown): value is AcademySize {
  return typeof value === "string" && (ACADEMY_SIZE_OPTIONS as readonly string[]).includes(value)
}
