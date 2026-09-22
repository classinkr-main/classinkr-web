/**
 * CRM 3단계 A6 — crm_customer_events.source_type DB CHECK와 코드 enum 동기화 계약.
 *
 * 코드 SSOT는 lib/repositories/crm-events.ts의 CRM_EVENT_SOURCE_TYPES다. 이 모듈은 그 값을
 * 그대로 재노출하고, 마이그레이션 SQL 문자열에서 CHECK ... IN (...) 목록을 파싱해 두 값이
 * 집합으로 일치하는지 테스트가 고정할 수 있게 한다.
 *
 * 순수 모듈 — Supabase 클라이언트를 import하지 않는다(단위 테스트 대상).
 */

import { CRM_EVENT_SOURCE_TYPES } from "@/lib/repositories/crm-events"

/** 마이그레이션의 CHECK 제약이 허용해야 하는 source_type 전체 — 코드 enum과 동일해야 한다. */
export const EXPECTED_EVENT_SOURCE_TYPE_CHECK: readonly string[] = [...CRM_EVENT_SOURCE_TYPES]

/**
 * 마이그레이션 SQL에서 `source_type IN (...)` CHECK 목록을 파싱한다.
 * 따옴표로 감싼 문자열 리터럴만 뽑고 순서는 SQL에 쓰인 그대로 보존한다(비교는 호출부가 집합으로 한다).
 * 매치되는 CHECK 목록이 없으면 빈 배열을 돌려준다 — 마이그레이션 형식이 바뀌면 테스트가
 * "빈 목록 vs 코드 enum" 불일치로 드러나게 하기 위함이다(조용히 통과시키지 않는다).
 */
export function parseSourceTypeCheckList(sql: string): string[] {
  const match = sql.match(/source_type\s+in\s*\(([^)]*)\)/i)
  if (!match) return []
  const body = match[1]
  const values: string[] = []
  const literalPattern = /'((?:[^'\\]|\\.)*)'/g
  let literal: RegExpExecArray | null
  while ((literal = literalPattern.exec(body)) !== null) {
    values.push(literal[1])
  }
  return values
}
