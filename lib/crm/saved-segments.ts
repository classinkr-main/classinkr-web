// 저장 세그먼트(세그먼트 허브, C안 ②, 2026-09-25) — 순수 규칙 모듈(서버·화면·테스트 공용, I/O 없음).
//
//  - 상수: 조건 판·이름·상한·자동 태그 숫자·일별 보존·KST 06시(UTC 슬롯 21) 크론 편승 시각.
//  - 마커: 자동 태그가 붙인 행은 crm_customer_tags.created_by = "auto:seg:<세그먼트 id>". 뗄 때는 이 마커가
//    붙은 행만 뗀다(사람이 붙인 태그는 절대 지우지 않는다).
//  - 검증(validateSavedSegmentInput) · 자동 태그 가드 판정(decideAutoTag) · 8주 추이(buildSegmentWeeklyTrend) ·
//    가시성·편집 권한.
//
// API 응답 모양은 lib/crm/saved-segment-api.ts(고정 계약)가 정본이다. 여기 숫자들(상한·급변 가드·떼기 상한)은
// 2026-09-25 통합 담당 결정 기본값이며 추정치라 조정할 수 있다.

import {
  SAVED_SEGMENT_DESCRIPTION_MAX,
  SAVED_SEGMENT_NAME_MAX,
  SAVED_SEGMENT_SPEC_VERSION,
  SEGMENT_OR_MAX_GROUPS,
  SEGMENT_TREND_WEEKS,
  type CustomerSegmentFilter,
  type SavedSegmentRunDetail,
  type SavedSegmentVisibility,
  type SegmentAutoTagStatus,
  type SegmentQualityFlag,
  type SegmentTrendPoint,
} from "@/lib/crm/saved-segment-api"
import {
  isSegmentFilterEmpty,
  normalizeSegmentFilter,
  segmentFilterTags,
} from "@/lib/crm/customer-segment-filter"
import { segmentSpecQueryString } from "@/lib/crm/customer-segment-spec"
import { normalizeTag } from "@/lib/crm/tag-suggestions"
import { kstHourToUtcSlot } from "@/lib/notifications/schedule"

export type { SegmentAutoTagStatus, SegmentQualityFlag, SegmentTrendPoint, SavedSegmentVisibility }
export {
  SAVED_SEGMENT_DESCRIPTION_MAX,
  SAVED_SEGMENT_NAME_MAX,
  SAVED_SEGMENT_SPEC_VERSION,
  SEGMENT_OR_MAX_GROUPS,
  SEGMENT_TREND_WEEKS,
}

// ── 상수 ─────────────────────────────────────────────────────────────────────

/** 자동 태그 라벨 길이 상한 — crm_customer_tags normalizeTag(40자)와 같다. */
export const SAVED_SEGMENT_AUTO_TAG_LABEL_MAX = 40
/** 자동 태그를 붙이는 세그먼트 회원 상한 — 넘으면 skipped_too_many(대량 오태깅 방지). */
export const AUTO_TAG_MAX_MEMBERS = 1_000
/**
 * 크론 한 번에 자동 태그를 적용하는 세그먼트 수 상한. 넘친 세그먼트는 skipped_time_budget(다음 실행 우선).
 * 실제로 적용을 시작한 세그먼트만 센다 — 가드(NEO 오래됨·품질 저하·상한·급변)로 건너뛴 세그먼트는 세지 않는다.
 */
export const AUTO_TAG_MAX_SEGMENTS_PER_RUN = 20
/** 급변 가드 — 전날(같은 조건) 건수가 이 이상일 때만 본다. */
export const SEGMENT_SPIKE_MIN_PREVIOUS = 20
/** 급변 가드 배수 — 오늘 > 전날×3 또는 오늘 < 전날÷3 이면 멈춘다. */
export const SEGMENT_SPIKE_FACTOR = 3
/** 떼기 상한 = max(50, 이 세그먼트가 붙여 둔 자동 태그 행 수 × 50%). 넘으면 떼기만 막는다(blockedUntag). */
export const SEGMENT_UNTAG_MIN_CAP = 50
export const SEGMENT_UNTAG_MAX_RATIO = 0.5
/** 일별 기록 보존 일수 — 넘은 행은 크론이 best-effort 로 지운다. */
export const SEGMENT_DAILY_RETENTION_DAYS = 180
/** 상세 화면 일별 점 창(8주). */
export const SEGMENT_DETAIL_DAILY_DAYS = SEGMENT_TREND_WEEKS * 7
/** 급변 가드가 "전날" 기록을 찾는 최대 거리(일) — 크론이 하루 건너뛰어도 직전 기록과 비교한다. */
export const SEGMENT_SPIKE_LOOKBACK_DAYS = 7

/** 매일 자동 태그 시각(KST) — 09~11시 크론 묶음(채널톡·연락 동기화·NEO·아침 카드)을 피한다. */
export const CRM_SEGMENT_DAILY_KST_HOUR = 6
/** /api/cron/dispatch/[slot] 의 UTC 슬롯(= 21). 새 크론·vercel.json 변경 없이 편승한다. */
export const CRM_SEGMENT_DAILY_UTC_SLOT = kstHourToUtcSlot(CRM_SEGMENT_DAILY_KST_HOUR)
export const SEGMENT_AUTO_TAG_SCHEDULE_LABEL = "매일 06시"

/**
 * 디스패처(maxDuration 60초) 요청 시작부터 세그먼트 잡이 "새 세그먼트 적용을 시작할 수 있는" 마지막 시각(ms).
 * 남은 20초는 마지막으로 시작한 세그먼트의 적용(1,000명 상한 — 약 1~3초)·일별 upsert·세그먼트 행 last_* 갱신(묶음
 * 병렬)·보존 삭제 몫이다. 같은 슬롯에서 아침 카드(leadDaily)가 먼저 돌면 그 시간만큼 줄어든다.
 */
export const CRM_SEGMENT_DAILY_REQUEST_BUDGET_MS = 40_000

/** 세그먼트 잡에 넘길 적용 시간 예산 — 같은 요청에서 앞선 잡이 쓴 시간(ms)을 뺀다. 음수·비정상 입력은 0 으로 본다. */
export function segmentDailyTimeBudgetMs(elapsedBeforeJobMs: number): number {
  const elapsed = Number.isFinite(elapsedBeforeJobMs) && elapsedBeforeJobMs > 0 ? elapsedBeforeJobMs : 0
  return Math.max(0, CRM_SEGMENT_DAILY_REQUEST_BUDGET_MS - elapsed)
}

/** DB CHECK(crm_saved_segments.last_run_status · crm_saved_segment_daily.auto_tag_status)와 같은 값. */
export const SEGMENT_AUTO_TAG_STATUSES: readonly SegmentAutoTagStatus[] = [
  "off",
  "applied",
  "partial",
  "failed",
  "skipped_neo_stale",
  "skipped_degraded",
  "skipped_too_many",
  "skipped_spike",
  "skipped_unreadable",
  "skipped_time_budget",
]

/** DB CHECK(crm_saved_segment_daily.flags)와 같은 값. */
export const SEGMENT_QUALITY_FLAGS: readonly SegmentQualityFlag[] = [
  "compass_down",
  "compass_partial",
  "source_incomplete",
  "neo_stale",
  "truncated",
]

/**
 * 건수 품질을 떨어뜨리는 플래그 — 추이 점선 표시 기준. truncated 는 회원 키 목록만 잘린 것이라(건수는 정확)
 * 넣지 않는다.
 */
export const SEGMENT_DEGRADING_FLAGS: ReadonlySet<SegmentQualityFlag> = new Set([
  "compass_down",
  "compass_partial",
  "source_incomplete",
  "neo_stale",
])

export type SavedSegmentRunTrigger = "cron" | "manual"

// ── 레코드 ───────────────────────────────────────────────────────────────────

/** crm_saved_segments 한 행(카멜). spec 은 저장된 원본 — 읽을 때 readStoredSegmentFilter 로 판을 확인한다. */
export interface SavedSegmentRecord {
  id: string
  name: string
  description: string | null
  spec: unknown
  specVersion: number
  specHash: string
  visibility: SavedSegmentVisibility
  ownerUserId: string | null
  ownerName: string | null
  autoTagEnabled: boolean
  autoTagLabel: string | null
  autoUntag: boolean
  lastCount: number | null
  lastEvaluatedAt: string | null
  lastRunStatus: SegmentAutoTagStatus | null
  lastRunDetail: SavedSegmentRunDetail | null
  archivedAt: string | null
  archivedBy: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

/** crm_saved_segment_daily 한 행(카멜). */
export interface SavedSegmentDailyPoint {
  segmentId: string
  /** KST 날짜 YYYY-MM-DD */
  snapshotDate: string
  total: number
  leadCount: number
  neoAccountCount: number
  customerCount: number
  specHash: string
  flags: SegmentQualityFlag[]
  autoTagStatus: SegmentAutoTagStatus
  tagged: number
  untagged: number
  tagFailed: number
  runTrigger: SavedSegmentRunTrigger
  evaluatedAt: string
}

// ── 날짜(KST) ────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** KST 날짜 키(YYYY-MM-DD). KST 는 서머타임이 없어 +9시간 고정이다. */
export function kstDateKeyOf(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 날짜 키 ± 일수. 형식이 틀리면 원값 그대로. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  if (!DATE_KEY_PATTERN.test(dateKey)) return dateKey
  const time = Date.parse(`${dateKey}T00:00:00.000Z`)
  if (Number.isNaN(time)) return dateKey
  return new Date(time + days * DAY_MS).toISOString().slice(0, 10)
}

// ── 마커 ─────────────────────────────────────────────────────────────────────

export const SEGMENT_AUTO_TAG_MARKER_PREFIX = "auto:seg:"

/** 자동 태그 행의 created_by 값. */
export function segmentAutoTagMarker(segmentId: string): string {
  return `${SEGMENT_AUTO_TAG_MARKER_PREFIX}${segmentId}`
}

/** created_by → 세그먼트 id(자동 태그 행이 아니면 null). */
export function parseSegmentAutoTagMarker(value: string | null | undefined): string | null {
  if (!value || !value.startsWith(SEGMENT_AUTO_TAG_MARKER_PREFIX)) return null
  const id = value.slice(SEGMENT_AUTO_TAG_MARKER_PREFIX.length).trim()
  return id || null
}

// ── 조건 해시 입력 ───────────────────────────────────────────────────────────

/** spec_hash 입력 — 정규형 필터 쿼리 문자열(서버가 sha256 앞 16자로 접는다). OR 그룹도 포함. */
export { segmentFilterQueryString as segmentSpecHashInput } from "@/lib/crm/customer-segment-filter"

// ── 권한·가시성 ──────────────────────────────────────────────────────────────

export interface SavedSegmentViewer {
  userId: string | null
  /** SUPER_ADMIN·ADMIN(STAFF_ADMIN_API_ROLES) 여부 — 라우트가 역할로 계산해 넘긴다. */
  isStaffAdmin: boolean
}

type SegmentAccessInput = Pick<SavedSegmentRecord, "visibility" | "ownerUserId">

export function isSavedSegmentOwner(segment: SegmentAccessInput, viewer: SavedSegmentViewer): boolean {
  return Boolean(viewer.userId) && segment.ownerUserId === viewer.userId
}

/** 팀 공유는 모두, "내 것"은 소유자만 본다(SUPER_ADMIN 포함 다른 사람 비노출 — 2026-09-25 결정). */
export function isSavedSegmentVisibleTo(segment: SegmentAccessInput, viewer: SavedSegmentViewer): boolean {
  if (segment.visibility === "team") return true
  return isSavedSegmentOwner(segment, viewer)
}

/** 이름·조건·공유 범위·보관 — 소유자, 또는 팀 세그먼트면 관리자(STAFF_ADMIN). */
export function canEditSavedSegment(segment: SegmentAccessInput, viewer: SavedSegmentViewer): boolean {
  if (isSavedSegmentOwner(segment, viewer)) return true
  return viewer.isStaffAdmin && segment.visibility === "team"
}

/** 자동 태그 켜기·끄기·적용 실행 — 관리자(SUPER_ADMIN·ADMIN)만, 그리고 편집할 수 있는 세그먼트만. */
export function canManageSavedSegmentAutoTag(segment: SegmentAccessInput, viewer: SavedSegmentViewer): boolean {
  return viewer.isStaffAdmin && canEditSavedSegment(segment, viewer)
}

// ── 입력 검증 ────────────────────────────────────────────────────────────────

export interface SavedSegmentInputDraft {
  name?: unknown
  description?: unknown
  spec?: unknown
  visibility?: unknown
  autoTag?: unknown
}

/** 검증을 통과한 값 — undefined 는 "바꾸지 않음"(PATCH). */
export interface SavedSegmentValidatedInput {
  name?: string
  description?: string | null
  spec?: CustomerSegmentFilter
  visibility?: SavedSegmentVisibility
  autoTag?: { enabled?: boolean; label?: string | null; untag?: boolean; detachExisting?: boolean }
}

export type SavedSegmentValidation =
  | { ok: true; value: SavedSegmentValidatedInput }
  | { ok: false; error: string }

/** 저장할 때 합쳐 볼 현재 값(PATCH) — 생성이면 null. */
export interface SavedSegmentCurrentState {
  visibility: SavedSegmentVisibility
  spec: CustomerSegmentFilter | null
  autoTagEnabled: boolean
  autoTagLabel: string | null
  archived: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

/** 입력 조건의 OR 그룹 중 조건이 비어 있거나 모르는 값만 있는 그룹이 있는가 — 저장 거부(빈 그룹 금지). */
function hasEmptyOrGroup(raw: Record<string, unknown>): boolean {
  if (raw.anyOf == null) return false
  if (!Array.isArray(raw.anyOf)) return true
  return raw.anyOf.some((group) => {
    if (!isPlainObject(group)) return true
    return segmentSpecQueryString(normalizeSegmentFilter(group as CustomerSegmentFilter)) === ""
  })
}

/**
 * 생성·수정 입력 검증. mode=create 면 name·spec 필수. current 는 PATCH 의 현재 값(합친 결과로 자동 태그
 * 제약을 본다).
 *  - 이름 1~60자, 설명 ≤500자
 *  - 빈 조건 저장 금지, 빈 OR 그룹 금지, OR 그룹 ≤5
 *  - 자동 태그: 팀 공유 필수 · 라벨 1~40자 · 라벨이 자기 조건의 라벨과 같으면 거부("스스로를 붙잡는 조건")
 *    · 보관된 세그먼트는 켤 수 없다
 */
export function validateSavedSegmentInput(
  draft: SavedSegmentInputDraft,
  mode: "create" | "update",
  current: SavedSegmentCurrentState | null = null
): SavedSegmentValidation {
  const value: SavedSegmentValidatedInput = {}

  if (draft.name !== undefined || mode === "create") {
    if (typeof draft.name !== "string") return { ok: false, error: "세그먼트 이름을 입력해 주세요." }
    const name = draft.name.trim().replace(/\s+/g, " ")
    if (!name) return { ok: false, error: "세그먼트 이름을 입력해 주세요." }
    if (name.length > SAVED_SEGMENT_NAME_MAX) {
      return { ok: false, error: `세그먼트 이름은 ${SAVED_SEGMENT_NAME_MAX}자 이하로 적어 주세요.` }
    }
    value.name = name
  }

  if (draft.description !== undefined) {
    if (draft.description === null) value.description = null
    else if (typeof draft.description !== "string") return { ok: false, error: "설명 형식이 올바르지 않습니다." }
    else {
      const description = draft.description.trim()
      if (description.length > SAVED_SEGMENT_DESCRIPTION_MAX) {
        return { ok: false, error: `설명은 ${SAVED_SEGMENT_DESCRIPTION_MAX}자 이하로 적어 주세요.` }
      }
      value.description = description || null
    }
  }

  if (draft.spec !== undefined || mode === "create") {
    if (!isPlainObject(draft.spec)) return { ok: false, error: "세그먼트 조건이 필요합니다." }
    if (Array.isArray(draft.spec.anyOf) && draft.spec.anyOf.length > SEGMENT_OR_MAX_GROUPS) {
      return { ok: false, error: `'또는' 그룹은 최대 ${SEGMENT_OR_MAX_GROUPS}개까지입니다.` }
    }
    if (hasEmptyOrGroup(draft.spec)) {
      return { ok: false, error: "비어 있는 '또는' 그룹이 있습니다. 조건을 고르거나 그룹을 지워 주세요." }
    }
    const spec = normalizeSegmentFilter(draft.spec as CustomerSegmentFilter)
    if (isSegmentFilterEmpty(spec)) {
      return { ok: false, error: "조건이 하나도 없는 세그먼트는 저장할 수 없습니다." }
    }
    value.spec = spec
  }

  if (draft.visibility !== undefined) {
    if (draft.visibility !== "team" && draft.visibility !== "mine") {
      return { ok: false, error: "공유 범위는 팀 공유 또는 내 것이어야 합니다." }
    }
    value.visibility = draft.visibility
  } else if (mode === "create") {
    value.visibility = "mine"
  }

  if (draft.autoTag !== undefined && draft.autoTag !== null) {
    if (!isPlainObject(draft.autoTag)) return { ok: false, error: "자동 태그 설정 형식이 올바르지 않습니다." }
    const raw = draft.autoTag
    const autoTag: NonNullable<SavedSegmentValidatedInput["autoTag"]> = {}
    if (raw.enabled !== undefined) {
      if (typeof raw.enabled !== "boolean") return { ok: false, error: "자동 태그 켜기 값이 올바르지 않습니다." }
      autoTag.enabled = raw.enabled
    }
    if (raw.label !== undefined) {
      if (raw.label === null) autoTag.label = null
      else if (typeof raw.label !== "string") return { ok: false, error: "자동 태그 라벨 형식이 올바르지 않습니다." }
      else {
        const trimmed = raw.label.trim().replace(/\s+/g, " ")
        if (trimmed.length > SAVED_SEGMENT_AUTO_TAG_LABEL_MAX) {
          return { ok: false, error: `자동 태그 라벨은 ${SAVED_SEGMENT_AUTO_TAG_LABEL_MAX}자 이하로 적어 주세요.` }
        }
        autoTag.label = trimmed ? normalizeTag(trimmed) : null
      }
    }
    if (raw.untag !== undefined) {
      if (typeof raw.untag !== "boolean") return { ok: false, error: "자동 떼기 값이 올바르지 않습니다." }
      autoTag.untag = raw.untag
    }
    if (raw.detachExisting !== undefined) {
      if (typeof raw.detachExisting !== "boolean") return { ok: false, error: "붙은 자동 태그 떼기 값이 올바르지 않습니다." }
      autoTag.detachExisting = raw.detachExisting
    }
    value.autoTag = autoTag
  }

  // 합친 결과로 자동 태그 제약을 본다(DB CHECK crm_saved_segments_auto_tag_check 와 같은 규칙을 먼저 알린다).
  const enabled = value.autoTag?.enabled ?? current?.autoTagEnabled ?? false
  if (enabled) {
    const label = value.autoTag?.label !== undefined ? value.autoTag.label : (current?.autoTagLabel ?? null)
    const visibility = value.visibility ?? current?.visibility ?? "mine"
    const spec = value.spec ?? current?.spec ?? null
    if (current?.archived) return { ok: false, error: "보관된 세그먼트는 자동 태그를 켤 수 없습니다. 먼저 복구해 주세요." }
    if (visibility !== "team") return { ok: false, error: "자동 태그는 팀 공유 세그먼트에서만 켤 수 있습니다." }
    if (!label) return { ok: false, error: "자동 태그 라벨을 입력해 주세요." }
    const labelKey = label.toLowerCase()
    if (spec && segmentFilterTags(spec).some((tag) => tag.toLowerCase() === labelKey)) {
      return {
        ok: false,
        error: "자동 태그 라벨이 이 세그먼트 조건의 라벨과 같습니다. 스스로를 붙잡는 조건이라 켤 수 없습니다.",
      }
    }
  }

  return { ok: true, value }
}

// ── 자동 태그 가드 ───────────────────────────────────────────────────────────

export interface AutoTagDecisionInput {
  enabled: boolean
  readable: boolean
  /** 조건이 NEO 신호(만료·소진·잔액·위험·과금·고객만)를 쓰는가 */
  usesNeoSignals: boolean
  /** 이번 평가의 품질 플래그 */
  flags: readonly SegmentQualityFlag[]
  total: number
  /** 회원 키가 상한에서 잘렸는가 */
  truncated: boolean
  /** 같은 조건(spec_hash)의 직전 정상 일별 건수 — 없으면 null */
  previousTotal: number | null
  /**
   * lookback 안에 같은 조건 일별 점은 있는데 전부 품질 저하(segmentSpikeBaseline.degradedOnly) — NEO·Compass·원천이
   * 막 복구된 첫날이라 비교할 정상 기준이 없다. 급변 가드와 같이 하루 보류한다(없으면 false).
   */
  previousDegradedOnly?: boolean
  /** 이번 실행의 시간·개수 예산을 넘었는가 */
  overBudget: boolean
}

export type AutoTagDecision = Exclude<SegmentAutoTagStatus, "applied" | "partial" | "failed"> | "apply"

/** 급변 가드 — 전날 p ≥ 20 이고 오늘 t > 3p 또는 t < p/3. */
export function isSegmentCountSpike(total: number, previousTotal: number | null): boolean {
  if (previousTotal == null || previousTotal < SEGMENT_SPIKE_MIN_PREVIOUS) return false
  return total > previousTotal * SEGMENT_SPIKE_FACTOR || total < previousTotal / SEGMENT_SPIKE_FACTOR
}

/**
 * 자동 태그 결정 — 아래 순서에서 첫 번째로 걸린 상태. 모두 통과하면 "apply".
 * off → unreadable → neo_stale → degraded(Compass 끊김·원천 미완성: 붙이지도 떼지도 않음) → too_many →
 * spike(급변 또는 복구 첫날 — 직전 기록이 전부 품질 저하라 비교 기준 없음) → time_budget.
 */
export function decideAutoTag(input: AutoTagDecisionInput): AutoTagDecision {
  if (!input.enabled) return "off"
  if (!input.readable) return "skipped_unreadable"
  if (input.usesNeoSignals && input.flags.includes("neo_stale")) return "skipped_neo_stale"
  if (input.flags.some((flag) => flag === "compass_down" || flag === "compass_partial" || flag === "source_incomplete")) {
    return "skipped_degraded"
  }
  if (input.total > AUTO_TAG_MAX_MEMBERS || input.truncated) return "skipped_too_many"
  if (input.previousDegradedOnly === true || isSegmentCountSpike(input.total, input.previousTotal)) return "skipped_spike"
  if (input.overBudget) return "skipped_time_budget"
  return "apply"
}

/** 한 번에 뗄 수 있는 자동 태그 수 — max(50, 붙여 둔 자동 태그 행 수의 50%). */
export function segmentUntagLimit(markerRowCount: number): number {
  const count = Number.isFinite(markerRowCount) && markerRowCount > 0 ? markerRowCount : 0
  return Math.max(SEGMENT_UNTAG_MIN_CAP, Math.ceil(count * SEGMENT_UNTAG_MAX_RATIO))
}

/** 적용 결과 → 상태. 실패가 있으면 일부라도 반영됐으면 partial, 하나도 못 했으면 failed. */
export function autoTagResultStatus(result: { tagged: number; untagged: number; failed: number }): SegmentAutoTagStatus {
  if (result.failed <= 0) return "applied"
  return result.tagged + result.untagged > 0 ? "partial" : "failed"
}

// ── 추이 ─────────────────────────────────────────────────────────────────────

export interface SegmentTrendSourcePoint {
  /** KST 날짜 YYYY-MM-DD */
  date: string
  total: number
  specHash: string
  flags: readonly SegmentQualityFlag[]
}

export function isDegradedSegmentPoint(flags: readonly SegmentQualityFlag[]): boolean {
  return flags.some((flag) => SEGMENT_DEGRADING_FLAGS.has(flag))
}

/**
 * 8주 추이 — 주 끝 = 오늘, 오늘-7, …(오래된 주 → 최근 주). 각 주 끝의 창(7일) 안 마지막 일별 점을 쓴다.
 * 점이 없으면 total=null. 지금 조건(currentHash)과 다른 조건으로 잰 점은 specChanged, 품질 플래그가 있던 점은
 * degraded(점선).
 */
export function buildSegmentWeeklyTrend(
  points: readonly SegmentTrendSourcePoint[],
  currentHash: string,
  todayKst: string,
  weeks: number = SEGMENT_TREND_WEEKS
): SegmentTrendPoint[] {
  const sorted = [...points].filter((point) => DATE_KEY_PATTERN.test(point.date)).sort((a, b) => (a.date < b.date ? -1 : 1))
  const trend: SegmentTrendPoint[] = []
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const weekEnd = addDaysToDateKey(todayKst, -7 * index)
    const weekStart = addDaysToDateKey(weekEnd, -6)
    let last: SegmentTrendSourcePoint | null = null
    for (const point of sorted) {
      if (point.date < weekStart) continue
      if (point.date > weekEnd) break
      last = point
    }
    trend.push(
      last
        ? { weekEnd, total: last.total, specChanged: last.specHash !== currentHash, degraded: isDegradedSegmentPoint(last.flags) }
        : { weekEnd, total: null, specChanged: false, degraded: false }
    )
  }
  return trend
}

/** 급변 가드 기준 — 직전 정상 건수와 "정상 점은 없고 품질 저하 점만 있었다"(복구 첫날)를 구분한다. */
export interface SegmentSpikeBaseline {
  /** lookback 안 같은 조건의 직전 정상 일별 건수 — 없으면 null */
  previousTotal: number | null
  /**
   * lookback 안에 같은 조건 점이 있었지만 전부 품질 저하였다 — NEO·Compass·원천이 막 복구된 첫날. 비교할 정상 기준이
   * 없으니 decideAutoTag 가 하루 보류(skipped_spike)하고, 오늘 기록한 정상 점이 내일의 기준이 된다.
   * 점이 하나도 없으면(새 조건·첫 실행) false — 가드 입력 없음.
   */
  degradedOnly: boolean
}

/**
 * 같은 조건의 직전(오늘보다 이른) 정상 일별 건수 — 급변 가드 입력. lookback 일 안에서만 찾는다.
 * 품질 저하 점(isDegradedSegmentPoint — Compass 끊김·원천 미완성·NEO 오래됨)은 건너뛴다: Compass 가 끊긴 날 부풀어
 * 기록된 950 을 기준으로 삼으면 정상화된 다음 날(310)이 "1/3 감소"로 막히고, 원천 미완성으로 5 로 무너진 날을 기준으로
 * 삼으면 다음 날 진짜 급증에도 가드(전날 20 이상)가 꺼진다.
 * 정상 점이 없을 때는 둘을 가른다: 점이 아예 없으면 가드 입력 없음, 품질 저하 점만 있으면 degradedOnly — 7일 넘게
 * NEO 가 멈췄다 돌아온 첫날(첫 동기화가 불완전해 300 → 900)을 기준 없이 그대로 붙이지 않게.
 */
export function segmentSpikeBaseline(
  points: readonly SegmentTrendSourcePoint[],
  currentHash: string,
  todayKst: string,
  lookbackDays: number = SEGMENT_SPIKE_LOOKBACK_DAYS
): SegmentSpikeBaseline {
  const earliest = addDaysToDateKey(todayKst, -lookbackDays)
  let best: SegmentTrendSourcePoint | null = null
  let sawDegraded = false
  for (const point of points) {
    if (point.specHash !== currentHash) continue
    if (point.date >= todayKst || point.date < earliest) continue
    if (isDegradedSegmentPoint(point.flags)) {
      sawDegraded = true
      continue
    }
    if (!best || point.date > best.date) best = point
  }
  return best ? { previousTotal: best.total, degradedOnly: false } : { previousTotal: null, degradedOnly: sawDegraded }
}

/** segmentSpikeBaseline 의 정상 건수만 — 정상 점이 없으면 null. */
export function previousSegmentTotal(
  points: readonly SegmentTrendSourcePoint[],
  currentHash: string,
  todayKst: string,
  lookbackDays: number = SEGMENT_SPIKE_LOOKBACK_DAYS
): number | null {
  return segmentSpikeBaseline(points, currentHash, todayKst, lookbackDays).previousTotal
}
