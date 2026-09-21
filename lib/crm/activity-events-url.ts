/**
 * A4/P1a — CRM 기록 목록(`/api/admin/crm/events`) 조회 URL 조립 SSOT.
 *
 * CrmActivityClient(캐시 키로 씀)와 lib/admin/crm/activity-prefetch.ts(서버 프리페치 기본값
 * 문서화)가 정확히 같은 문자열을 계산해야, 서버가 미리 채운 첫 페이지가 클라이언트의 첫 fetch
 * 캐시 키와 맞아떨어져 프리페치 시드가 실제로 적중한다. 순수 함수 — I/O 없음.
 */
export const CRM_EVENTS_URL = "/api/admin/crm/events"

export interface ActivityEventsUrlInput {
  query?: string
  targetType?: string
  sourceType?: string
  sentiment?: string
  scope?: "work" | "all"
  offset?: number
  limit?: number
  targetId?: string
  from?: string
  to?: string
}

export function buildActivityEventsUrl(input: ActivityEventsUrlInput = {}): string {
  const limit = input.limit ?? 50
  const offset = input.offset ?? 0
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (input.query?.trim()) params.set("q", input.query.trim())
  if (input.targetType && input.targetType !== "all") params.set("targetType", input.targetType)
  if (input.sourceType && input.sourceType !== "all") params.set("sourceType", input.sourceType)
  if (input.sentiment && input.sentiment !== "all") params.set("sentiment", input.sentiment)
  const sourceTypeIsAll = !input.sourceType || input.sourceType === "all"
  if (input.scope === "work" && sourceTypeIsAll) params.set("scope", "work")
  if (input.targetId?.trim()) params.set("targetId", input.targetId.trim())
  if (input.from) params.set("from", input.from)
  if (input.to) params.set("to", input.to)
  return `${CRM_EVENTS_URL}?${params.toString()}`
}

/**
 * 기록 화면 첫 로드 기본값(스코프 work·필터 전체·기간 전체·limit 50·offset 0).
 * 서버 프리페치(prefetchCrmActivityInitialData)가 만드는 첫 페이지와 같은 캐시 키다.
 */
export function defaultActivityEventsUrl(): string {
  return buildActivityEventsUrl({ scope: "work" })
}
