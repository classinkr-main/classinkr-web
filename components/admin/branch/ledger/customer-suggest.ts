import { normalizedAccountKey } from "@/lib/branch/account-key"

// 레일 고객/계정 표기 추천 — 순수 판정(입력 레일이 렌더에서 그대로 쓴다).
// 매출 장부 입력 속도 라운드 4(docs/active/sales-ledger-input-speed-plan-2026-09-20.md §2.3·§4
// P0-3): 집계 키인 고객명이 자유 입력이라 표기 흔들림("OO학원"/"OO 학원")이 정규화 키는 같은데
// 새 행을 만들어 집계를 쪼갠다. 담당자 datalist(품질 감사 2026-09-10 #7)와 동일하게 "추천만 하고
// 차단하지 않는" 패턴을 고객명에도 적용한다 — 강제 select로 바꾸면 시트에서 아직 등장하지 않은
// 신규 고객 입력이 막히므로, 자유 입력은 유지하고 표기가 갈렸을 때만 인라인 경고로 알려준다.

/**
 * 레일 고객/계정 datalist 후보 — REV 행 고객명(시트 행 + 적용 초안 행)에서 유일·정렬(ko).
 * 빈 문자열 제외. managerOptions와 동일한 산식(Set dedup + localeCompare 정렬) — 새 규칙 도입 없음.
 */
export function buildCustomerOptions(rows: ReadonlyArray<{ customer: string | null | undefined }>): string[] {
  return Array.from(new Set(rows.map((row) => row.customer).filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b, "ko"))
}

/**
 * 입력값과 정규화 키(normalizedAccountKey)는 같은데 표기만 다른 기존 후보가 있으면 그 표기
 * (canonical)를 돌려준다 — 저장을 막지 않는 "추천"용이라 호출부는 이 결과를 인라인 경고에만 쓴다.
 *  - 입력이 비었거나 공백뿐이면 null
 *  - 후보 중 트림 기준 완전 동일 문자열이 있으면 null(이미 기존 표기 — 경고 불필요)
 *  - 정규화 키가 같은 후보가 여럿이면 첫 번째: options는 buildCustomerOptions가 만든 정렬된
 *    배열이 그대로 들어온다는 계약이라, 여기서 다시 정렬하지 않고 배열 순서상 첫 매치를 쓴다.
 */
export function findCustomerSpellingMatch(input: string, options: readonly string[]): { canonical: string } | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (options.some((option) => option.trim() === trimmed)) return null
  const key = normalizedAccountKey(trimmed)
  // 구분 기호뿐인 입력("---" 등)은 정규화 키가 빈 문자열이 되어 서로 무관한 후보끼리 거짓
  // 매칭될 수 있다 — 의미 있는 키가 없으면 추천하지 않는다.
  if (!key) return null
  const match = options.find((option) => normalizedAccountKey(option) === key)
  return match ? { canonical: match } : null
}
