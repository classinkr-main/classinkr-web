// lib/events/attribution.ts
// 행사 ↔ 리드 attribution 토큰 매칭 SSOT
//
// 토큰 규약: 리드 notes 첫 줄의 `[event:<slug_or_id>]` (lib/types/event-metrics.ts)
// - 공개 신청 폼(lib/server/lead-capture.ts)은 slug 토큰을 기록해 왔고,
// - 리드 보드 수동 연결·캡처 배치(lib/crm/capture/apply.ts)는 id 토큰을 기록해 왔다.
// 기존 데이터 마이그레이션 없이, 읽기 측에서 slug/id 어느 쪽 토큰이든
// 같은 행사로 정규화해 매칭·집계한다.

import { parseEventToken } from "@/lib/types/event-metrics"

/** 토큰 매칭에 필요한 최소 행사 형태 (PublicEvent가 구조적으로 만족) */
export interface EventTokenTarget {
  id: string
  slug: string | null
}

/** 이 행사를 가리킬 수 있는 토큰 값들 (소문자 정규화) */
export function eventTokenValues(event: EventTokenTarget): string[] {
  const values = [event.id.toLowerCase()]
  if (event.slug) values.push(event.slug.toLowerCase())
  return values
}

/** 집계에 쓰는 정규 키 — slug가 있으면 slug, 없으면 id */
export function canonicalEventTokenKey(event: EventTokenTarget): string {
  return event.slug ?? event.id
}

/** 토큰 값(slug/id 무관, 소문자) → 정규 키 인덱스 */
export function buildEventTokenIndex(events: EventTokenTarget[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const event of events) {
    const key = canonicalEventTokenKey(event)
    for (const value of eventTokenValues(event)) index.set(value, key)
  }
  return index
}

/** 토큰 하나를 정규 키로 변환. 카탈로그에 없는 토큰은 원본 그대로 유지 */
export function resolveEventTokenKey(token: string, index: Map<string, string>): string {
  return index.get(token.toLowerCase()) ?? token
}

/**
 * source+notes 등을 합친 소문자 텍스트에 이 행사의 토큰(slug/id)이 포함되는가.
 * campaigns/analytics의 리드 매칭에서 사용 — 기존 substring 매칭 의미를 유지한다.
 */
export function textMatchesEventToken(haystackLower: string, event: EventTokenTarget): boolean {
  return eventTokenValues(event).some((value) => haystackLower.includes(`event:${value}`))
}

/**
 * 리드 notes 목록 → 행사별 신청 수.
 * notes 첫 줄 토큰을 행사 카탈로그로 정규화해 정규 키(slug ?? id) 기준으로 집계하고,
 * 카탈로그에 없는 토큰은 원본 토큰 키로 유지한다(기존 동작 보존).
 */
export function countEventTokenSignups(
  notesList: Array<string | null | undefined>,
  events: EventTokenTarget[]
): Record<string, number> {
  const index = buildEventTokenIndex(events)
  const counts: Record<string, number> = {}
  for (const notes of notesList) {
    const { token } = parseEventToken(notes)
    if (!token) continue
    const key = resolveEventTokenKey(token, index)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
