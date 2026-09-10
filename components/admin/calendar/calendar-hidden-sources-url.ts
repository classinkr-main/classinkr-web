/**
 * calendar-hidden-sources-url.ts — 소스 토글(hiddenSources)을 URL 쿼리(`hidden`)로
 * 직렬화/역직렬화하는 순수 함수. 새로고침·링크 공유에도 같은 필터가 유지되게 한다.
 *
 * `view`·`anchor` 파라미터와 이름이 겹치지 않아야 하고, 기본값(아무것도 숨기지 않음)은
 * 파라미터 자체를 지워 주소를 깔끔하게 유지한다(lib/use-url-state.ts와 같은 관례).
 */
import type { EventSource } from "@/lib/calendar-data"
import { SOURCE_OPTIONS } from "@/components/admin/calendar/event-style"

const KNOWN_SOURCES = new Set<string>(SOURCE_OPTIONS.map((option) => option.value))

function isKnownEventSource(value: string): value is EventSource {
  return KNOWN_SOURCES.has(value)
}

/** hiddenSources → `hidden` 쿼리 파라미터 값. 비어 있으면 빈 문자열(호출부가 파라미터 자체를 지운다). */
export function encodeHiddenSourcesParam(hiddenSources: Set<EventSource>): string {
  return Array.from(hiddenSources).sort().join(",")
}

/**
 * `hidden` 쿼리 파라미터 → hiddenSources.
 * - 파라미터 자체가 없으면(raw === null) null — 호출부가 localStorage 등 다른 원천으로 폴백해야 함을 뜻한다.
 * - 파라미터가 있으면(빈 문자열 포함) 그 값을 신뢰한다 — 빈 문자열은 "전체 표시"라는 명시적 상태다.
 * - 알 수 없는 값은 조용히 버린다(SOURCE_OPTIONS에 없는 문자열로 상태를 오염시키지 않는다).
 */
export function decodeHiddenSourcesParam(raw: string | null): Set<EventSource> | null {
  if (raw === null) return null
  if (raw === "") return new Set()

  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(isKnownEventSource)
  return new Set(values)
}
