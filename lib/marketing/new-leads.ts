// lib/marketing/new-leads.ts
// 캠페인 허브 "신규 리드" 탭의 순수 규칙 — 날짜 범위 해석 · 필터 · 소스 그룹 카운트.
//
// 역할 분리(중복 방지):
//  - 광고 탭의 AdLeadsPanel(lib/campaigns/ad-leads)은 **Meta 광고 리드 + 딜 전환** 특화다.
//    광고비·CPL 옆에 놓고 보는 유료 유입 모집단이고, 액션은 CRM 딜 전환이다.
//  - 이 모듈은 **전 소스 신규 유입 + 연락 체크**다. 메타·구글·홈페이지·자료실 가리지 않고
//    "오늘·이번 주에 새로 들어온 것"을 날짜로 잘라 보고, 액션은 연락 여부 도장 하나다.
//
// 유입 그룹·테스트 리드·검색 판정은 전부 기존 SSOT를 그대로 쓴다(재정의 금지):
//   lib/crm/lead-attribution(getLeadSourceGroup·isTestLead·isContactedLead)
//   lib/crm/lead-ranking(tokenizeLeadSearch·matchesLeadSearch)
//
// 정직 규칙: 깨진 timestamp 는 1970년으로 떨어뜨리지 않고 조용히 제외한다. 잘못된 커스텀
// 범위는 임의 보정 없이 null 을 돌려주고, 호출부가 직전 유효 범위를 유지한다.

import {
  SOURCE_GROUP_ORDER,
  getLeadSourceGroup,
  isContactedLead,
  isTestLead,
  type LeadSourceGroup,
} from "@/lib/crm/lead-attribution"
import { matchesLeadSearch, tokenizeLeadSearch } from "@/lib/crm/lead-ranking"
import type { LeadRecord } from "@/lib/repositories/leads"

// ─── 일자 규약 ─────────────────────────────────────────────────
// KST 일자 키(en-CA = YYYY-MM-DD, Asia/Seoul)와 ±일 이동은 lib/marketing/perf.ts 및
// perf-assemble.ts 와 같은 규약이다. 그런데 그 두 파일은 퍼포먼스 대시보드 소유라
// 이 탭 때문에 시그니처를 넓히지 않는다(동시 편집 중인 파일이기도 하다). 규약만 맞춘
// 최소 헬퍼 두 개를 여기에 독립 구현한다 — 복제 범위는 이 8줄이 전부다.
const DAY_MS = 86_400_000
const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** ISO 일자(YYYY-MM-DD)를 ±days 만큼 이동. perf.ts 의 shiftDays 와 같은 규약. */
function shiftDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

/**
 * 시각을 KST 일자 키로 접는다. 값이 없거나 파싱 불가면 null —
 * "1970-01-01" 로 떨어뜨리면 깨진 리드가 모든 과거 범위에 유령으로 잡힌다.
 */
export function kstDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : KST_DATE.format(date)
}

/** KST 기준 오늘(YYYY-MM-DD). 클라이언트 시계가 어느 타임존이든 같은 값이 나온다. */
export function kstToday(now: Date = new Date()): string {
  return KST_DATE.format(now)
}

// ─── 날짜 범위 ─────────────────────────────────────────────────
export type NewLeadRangePreset = "7d" | "30d" | "90d" | "custom"

export const NEW_LEAD_RANGE_PRESETS: Array<{ id: NewLeadRangePreset; label: string }> = [
  { id: "7d", label: "7일" },
  { id: "30d", label: "30일" },
  { id: "90d", label: "90일" },
  { id: "custom", label: "직접 지정" },
]

export function isNewLeadRangePreset(value: string | null | undefined): value is NewLeadRangePreset {
  return NEW_LEAD_RANGE_PRESETS.some((preset) => preset.id === value)
}

export interface LeadDateRange {
  /** 시작 일자(YYYY-MM-DD, KST) — 포함 */
  since: string
  /** 종료 일자(YYYY-MM-DD, KST) — 포함 */
  until: string
}

export interface CustomLeadRangeInput {
  from: string
  to: string
}

/**
 * 프리셋(7d·30d·90d) 또는 커스텀 {from,to} 를 양끝 포함 구간으로 해석한다.
 * today 는 KST 기준 오늘(kstToday) — 프리셋 구간은 오늘을 끝점으로 잡는다.
 *
 * 커스텀이 비었거나 형식이 깨졌거나 from > to 면 null. 임의로 뒤집거나 오늘로 보정하지
 * 않는다 — 호출부가 인라인 에러를 띄우고 직전 유효 범위를 유지한다.
 */
export function resolveLeadDateRange(
  preset: NewLeadRangePreset,
  custom: CustomLeadRangeInput | null | undefined,
  today: string
): LeadDateRange | null {
  if (preset === "custom") {
    const from = custom?.from?.trim() ?? ""
    const to = custom?.to?.trim() ?? ""
    if (!ISO_DATE_PATTERN.test(from) || !ISO_DATE_PATTERN.test(to)) return null
    if (from > to) return null
    return { since: from, until: to }
  }
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30
  return { since: shiftDays(today, -(days - 1)), until: today }
}

// ─── 필터 ──────────────────────────────────────────────────────
export interface NewLeadFilterOptions extends LeadDateRange {
  /** 선택한 유입 묶음. 비어 있거나 생략이면 전체. */
  groups?: readonly LeadSourceGroup[]
  /** 공백 구분 AND 토큰 검색(lib/crm/lead-ranking 규약). */
  query?: string
  /** 아직 연락 안 한 리드만(status === "new"). */
  onlyUncontacted?: boolean
}

/**
 * 신규 유입 목록. 순서:
 *   테스트 리드 제외 → KST 일자 범위 → 소스 그룹 → 검색 토큰 → 미연락
 * 반환은 최신 유입순.
 */
export function filterNewLeads(
  leads: readonly LeadRecord[],
  options: NewLeadFilterOptions
): LeadRecord[] {
  const { since, until, groups, query, onlyUncontacted } = options
  const groupSet = groups && groups.length > 0 ? new Set(groups) : null
  const tokens = tokenizeLeadSearch(query ?? "")

  const matched = leads.filter((lead) => {
    if (isTestLead(lead)) return false

    const day = kstDateKey(lead.timestamp)
    if (!day || day < since || day > until) return false

    if (groupSet && !groupSet.has(getLeadSourceGroup(lead))) return false
    if (!matchesLeadSearch(lead, tokens)) return false
    if (onlyUncontacted && isContactedLead(lead)) return false

    return true
  })

  return matched.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
}

// ─── 소스 그룹 카운트 ──────────────────────────────────────────
/**
 * 칩에 붙일 그룹별 건수. 7개 키를 항상 채운다 — 0건 그룹이 키 자체로 사라지면
 * 칩이 들쭉날쭉해지고 "이 채널은 0건"이라는 정보가 없어진다.
 */
export function countBySourceGroup(leads: readonly LeadRecord[]): Record<LeadSourceGroup, number> {
  const counts = Object.fromEntries(SOURCE_GROUP_ORDER.map((group) => [group, 0])) as Record<
    LeadSourceGroup,
    number
  >
  for (const lead of leads) counts[getLeadSourceGroup(lead)] += 1
  return counts
}

// ─── URL 파라미터 직렬화 ───────────────────────────────────────
// 이 탭의 필터는 전부 URL 에 보존된다(?nlGroups=meta,homepage). 접두 nl 은 캠페인 허브의
// 다른 축(?tab= ?perf= ?view=)과 충돌하지 않게 하려는 것.
export function parseSourceGroupParam(value: string | null | undefined): LeadSourceGroup[] {
  if (!value) return []
  const known = new Set<string>(SOURCE_GROUP_ORDER)
  const picked = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => known.has(part)) as LeadSourceGroup[]
  // 칩 순서(SOURCE_GROUP_ORDER)로 정규화 — 같은 선택이 URL 에서 한 형태로만 표기된다.
  return SOURCE_GROUP_ORDER.filter((group) => picked.includes(group))
}

export function serializeSourceGroupParam(groups: readonly LeadSourceGroup[]): string {
  return SOURCE_GROUP_ORDER.filter((group) => groups.includes(group)).join(",")
}

// ─── 액션 실패 문구 ────────────────────────────────────────────
// adminFetchJson 은 실패를 세 갈래로 던진다:
//  ① 서버가 준 한국어 메시지(`{error}`) — 그대로 쓴다. 가장 구체적이다.
//  ② `"404 Not Found"` 같은 상태 폴백 — 영문이라 그대로 노출하면 안 된다.
//  ③ fetch 자체 실패 — 브라우저마다 "Failed to fetch"·"Load failed"·"NetworkError…".
// ②③ 을 사람 문구로 옮긴다. 원인을 지어내지는 않는다 — 모르면 일반 문구로 떨어뜨린다.
// 대응 안내(새로고침/재시도)는 **이 문구가 소유**한다. 행 템플릿은 "상태는 되돌렸습니다."만
// 덧붙이므로 여기서 재시도를 또 적으면 같은 말이 두 번 나온다.
const HTTP_STATUS_MESSAGE: Record<string, string> = {
  "400": "요청 형식이 올바르지 않습니다.",
  "401": "로그인이 풀렸습니다. 새로고침이 필요합니다.",
  "403": "이 작업을 할 권한이 없습니다.",
  "404": "이미 삭제된 리드일 수 있습니다. 목록을 새로고침해 주세요.",
  "409": "다른 곳에서 먼저 처리된 것 같습니다. 목록을 새로고침해 주세요.",
  "429": "요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.",
}

const NETWORK_ERROR_PATTERN = /failed to fetch|load failed|networkerror|network request failed|err_internet|dns/i

export const LEAD_ACTION_FALLBACK_MESSAGE = "연락 처리에 실패했습니다. 다시 시도해 주세요."

export function describeLeadActionError(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : ""
  if (!raw) return LEAD_ACTION_FALLBACK_MESSAGE

  // ③ 네트워크 — 브라우저 원문은 영문이라 그대로 두면 사용자가 읽을 게 없다.
  if (NETWORK_ERROR_PATTERN.test(raw)) return "네트워크 연결을 확인해 주세요."

  // ② 상태 폴백("404 Not Found")만 골라낸다 — 서버 한국어 메시지는 건드리지 않는다.
  // 뒤에 공백이나 문자열 끝이 와야 한다(adminFetchJson 은 `${status} ${statusText}`.trim() 을 던진다).
  // `\b` 로 끊으면 한글이 비단어 문자라 "500건을 넘겨…" 같은 서버 메시지를 HTTP 500 으로 오인한다.
  const status = /^(\d{3})(?:\s|$)/.exec(raw)?.[1]
  if (status) {
    const known = HTTP_STATUS_MESSAGE[status]
    if (known) return known
    if (status.startsWith("5")) return "서버 오류로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
    return LEAD_ACTION_FALLBACK_MESSAGE
  }

  // ① 서버가 준 메시지 — 한국어 정본이므로 그대로.
  return raw
}
