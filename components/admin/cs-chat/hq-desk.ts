// 본사 확인 화면(CS 코파일럿 · tab=hq)의 순수 로직.
// 정본: docs/active/cs-admin-console-ia-2026-07-27.md §6 — 신규 테이블 0 · 신규 API 라우트 0.
// 상태는 internal_cs_conversations.tags[]에만 산다. 어휘는
// docs/active/internal-cs-content-arrangement-2026-07-15.md §5가 정본이고 새로 만들지 않는다.

/** 의도 축 — "이 건은 본사에 물어봐야 한다". 상태와 무관하게 남는 분류다. */
export const HQ_INTENT_TAG = "intent:hq_confirmation"
/** 근거 축 — 회신 대기 중. 이 태그가 본사 확인 목록의 유일한 소속 조건이다. */
export const HQ_PENDING_TAG = "evidence:hq_pending"
/** 근거 축 — 회신을 받아 확정됨. hq_pending과 상호배타적이다. */
export const HQ_CONFIRMED_TAG = "evidence:confirmed"

// 서버(lib/repositories/internal-cs-chat.ts cleanInternalCsTags)는 trim·중복 제거 후 20개로 자른다.
// 어휘 화이트리스트는 없으므로 위 3개는 그대로 통과한다. 다만 20개 상한 때문에
// 이미 태그가 꽉 찬 대화는 새 태그가 조용히 잘릴 수 있어, 호출부가 PATCH 응답의 tags를 검증한다.
export const INTERNAL_CS_TAG_LIMIT = 20

interface TaggedConversation {
  tags: string[]
}

export function isHqPending(conversation: TaggedConversation) {
  return conversation.tags.includes(HQ_PENDING_TAG)
}

/**
 * 본사 확인 목록 — `evidence:hq_pending`을 가진 대화만, 오래 기다린 순서로.
 *
 * 목록 API를 새로 만들지 않는다(§6). 워크스페이스가 이미 받아 둔
 * `GET /api/admin/cs-chat/conversations?status=all&limit=100` 응답을 클라이언트에서 거른다.
 * 정렬 키가 updated_at인 이유는 아래 hqWaitingSince 주석 참조.
 */
export function selectHqPending<T extends TaggedConversation & { updated_at: string }>(
  conversations: T[]
): T[] {
  return conversations
    .filter(isHqPending)
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
}

/**
 * 대기 시작 시각의 근사값.
 *
 * `evidence:hq_pending`이 언제 붙었는지는 어디에도 저장되지 않는다 — 태그는 배열 한 칼럼이고
 * 이력 테이블을 새로 만들지 않기로 했다(§6). 그래서 updated_at을 대신 쓴다.
 * 근사인 지점: 태그를 붙인 뒤 담당자 지정·상태 변경·제목 수정이 일어나면 updated_at 트리거가
 * 다시 찍혀 경과가 0으로 되돌아간다. 화면에도 이 근사를 명시한다.
 */
export function hqWaitingSince(conversation: { updated_at: string }) {
  return conversation.updated_at
}

/**
 * 대기 경과 — "3일 4시간" 형태. 1시간 미만은 분, 1일 미만은 시간까지만 보여준다.
 * 미래 시각(시계 오차)은 "방금"으로 눕힌다.
 */
export function formatWaitingElapsed(since: string, now: number = Date.now()) {
  const start = Date.parse(since)
  if (Number.isNaN(start)) return "—"
  const minutes = Math.floor((now - start) / 60_000)
  if (minutes < 1) return "방금"
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days}일 ${restHours}시간` : `${days}일`
}

/** 3일 넘게 회신이 없으면 행을 눈에 띄게 한다 — 별도 SLA 필드가 아니라 표시용 임계값이다. */
export const HQ_STALE_HOURS = 72

export function isHqStale(since: string, now: number = Date.now()) {
  const start = Date.parse(since)
  if (Number.isNaN(start)) return false
  return now - start >= HQ_STALE_HOURS * 3_600_000
}

/**
 * 펼친 행의 상세 캐시 상한.
 *
 * 본사 확인 목록은 `status=all&limit=100` 응답을 태그로 거른 부분집합이라 한 세션에서
 * 펼칠 수 있는 행이 최대 100개다. 캐시가 그만큼 자라도 세션 한정이라 무해하지만 상한이 없었다.
 * 12개면 한 화면에서 오가며 비교하는 범위를 덮고, 넘어가면 가장 오래 담긴 것부터 버린다.
 */
export const HQ_DETAIL_CACHE_LIMIT = 12

/**
 * 상세 캐시에 한 건을 넣고 상한을 넘으면 오래된 것부터 버린다.
 *
 * 삽입 순서를 그대로 나이로 쓴다 — 호출부가 캐시 히트일 때 아예 다시 넣지 않으므로
 * 재삽입으로 순서가 갱신되는 경우가 없고, 그래서 삽입 순서 = 최초 적재 순서다.
 * (키는 UUID 문자열이라 JS 객체의 정수형 키 재정렬 규칙에 걸리지 않는다.)
 */
export function putHqDetail<T>(current: Record<string, T>, id: string, detail: T): Record<string, T> {
  const next = { ...current, [id]: detail }
  const keys = Object.keys(next)
  if (keys.length <= HQ_DETAIL_CACHE_LIMIT) return next
  for (const stale of keys.slice(0, keys.length - HQ_DETAIL_CACHE_LIMIT)) delete next[stale]
  return next
}

/**
 * 본사 확인 요청 — 의도 태그와 대기 태그를 붙이고, 상충하는 `evidence:confirmed`만 걷어낸다.
 * evidence 축의 다른 값(conditional·conflict·field_verified)과 area/topic 태그는 건드리지 않는다.
 * 기존 순서를 보존하고 새 태그만 뒤에 붙인다.
 */
export function withHqPending(tags: string[]) {
  const kept = tags.filter((tag) => tag !== HQ_CONFIRMED_TAG)
  const next = [...new Set(kept)]
  for (const tag of [HQ_INTENT_TAG, HQ_PENDING_TAG]) {
    if (!next.includes(tag)) next.push(tag)
  }
  return next
}

/**
 * 본사 확인 완료 — 대기 태그를 빼고 확정 태그를 넣는다. 목록에서 빠지는 유일한 경로다.
 * `intent:hq_confirmation`은 남긴다 — "본사에 물어본 건"이라는 분류는 회신 후에도 사실이다.
 */
export function withHqConfirmed(tags: string[]) {
  const kept = tags.filter((tag) => tag !== HQ_PENDING_TAG)
  const next = [...new Set(kept)]
  if (!next.includes(HQ_CONFIRMED_TAG)) next.push(HQ_CONFIRMED_TAG)
  return next
}
