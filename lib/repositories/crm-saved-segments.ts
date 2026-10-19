import "server-only"

import { createHash } from "node:crypto"

import { segmentFilterQueryString } from "@/lib/crm/customer-segment-filter"
import type { CustomerSegmentFilter, SavedSegmentRunDetail } from "@/lib/crm/saved-segment-api"
import {
  SAVED_SEGMENT_SPEC_VERSION,
  SEGMENT_AUTO_TAG_STATUSES,
  SEGMENT_QUALITY_FLAGS,
  type SavedSegmentDailyPoint,
  type SavedSegmentRecord,
  type SavedSegmentRunTrigger,
  type SavedSegmentVisibility,
  type SegmentAutoTagStatus,
  type SegmentQualityFlag,
} from "@/lib/crm/saved-segments"
import { isMissingTableMessage } from "@/lib/db/schema-contract"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 저장 세그먼트 저장소(세그먼트 허브, C안 ②, 2026-09-25) — crm_saved_segments · crm_saved_segment_daily.
//
//  - 전부 service role 경로다. 두 표 모두 RLS deny-all(정책 없음 — service_role 만)이라 로그인 세션으로 PostgREST 를
//    직접 불러도 읽히지 않는다. team/mine 가시성·자동 태그 관리자 전용은 API(lib/crm/saved-segments.ts
//    isSavedSegmentVisibleTo·canManageSavedSegmentAutoTag)가 강제한다.
//  - 미적용 폴백 두 관례(마이그레이션 런북 "배포 순서 규칙"):
//      읽기 = available:false + 안내(crm-region-assignments 관례, 라우트가 200),
//      쓰기 = SavedSegmentsNotReadyError(crm-tasks 관례, 라우트가 503).
//  - 일별 표만 없으면(부분 적용) 목록은 살아 있고 추이만 빈다(trendWarning) — 크론은 건수 기록만 건너뛴다.
//  - 읽기 오류의 빈 결과를 정상처럼 돌려주지 않는다 — 미적용이 아닌 오류는 던진다.
//  - Compass(crm 스키마)에는 아무것도 쓰지 않는다.

const SEGMENTS_TABLE = "crm_saved_segments"
const DAILY_TABLE = "crm_saved_segment_daily"

export const SAVED_SEGMENTS_NOT_READY_MESSAGE =
  "저장 세그먼트 표가 아직 적용되지 않았습니다. supabase/migrations/20260925_crm_saved_segments.sql 적용이 필요합니다."
export const SAVED_SEGMENT_DAILY_NOT_READY_MESSAGE =
  "세그먼트 일별 기록 표가 아직 적용되지 않아 추이가 비어 있습니다. supabase/migrations/20260925_crm_saved_segments.sql 적용이 필요합니다."
export const SAVED_SEGMENT_AUTO_TAG_LABEL_CONFLICT_MESSAGE =
  "같은 라벨을 이미 다른 세그먼트가 매일 자동으로 붙이고 있습니다. 다른 라벨을 쓰거나 그 세그먼트의 자동 태그를 먼저 꺼 주세요."

/** 표 미적용 — 쓰기 라우트가 503 으로 바꾼다. */
export class SavedSegmentsNotReadyError extends Error {
  constructor(message = SAVED_SEGMENTS_NOT_READY_MESSAGE) {
    super(message)
    this.name = "SavedSegmentsNotReadyError"
  }
}

/** 활성 자동 라벨 중복(부분 유니크 인덱스 23505) — 라우트가 409 로 바꾼다. */
export class SavedSegmentAutoTagLabelConflictError extends Error {
  constructor() {
    super(SAVED_SEGMENT_AUTO_TAG_LABEL_CONFLICT_MESSAGE)
    this.name = "SavedSegmentAutoTagLabelConflictError"
  }
}

/** DB 제약 위반(23514) — 앱 검증을 빠져나간 값. 라우트가 400 으로 바꾼다. */
export class SavedSegmentConstraintError extends Error {
  constructor(message = "세그먼트 값이 저장 규칙에 맞지 않습니다.") {
    super(message)
    this.name = "SavedSegmentConstraintError"
  }
}

interface PostgrestErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function errorText(error: PostgrestErrorLike) {
  return [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ")
}

/** 표 부재(42P01·PGRST205·"could not find the table") — 해당 표 이름이 보이거나 코드가 명확할 때만. */
export function isSavedSegmentsTableMissing(error: PostgrestErrorLike | null | undefined, table: string = SEGMENTS_TABLE) {
  if (!error) return false
  const text = errorText(error)
  const lower = text.toLowerCase()
  if (lower.includes("42p01") || lower.includes("pgrst205")) return true
  return isMissingTableMessage(text) && lower.includes(table)
}

function isUniqueViolation(error: PostgrestErrorLike) {
  return error.code === "23505" || /duplicate key|unique constraint/i.test(error.message ?? "")
}

function isCheckViolation(error: PostgrestErrorLike) {
  return error.code === "23514" || /violates check constraint/i.test(error.message ?? "")
}

/** 정규형 필터의 sha256 앞 16자 — 추이의 '조건 변경' 끊김 판정. */
export function computeSegmentSpecHash(filter: CustomerSegmentFilter): string {
  return createHash("sha256").update(segmentFilterQueryString(filter)).digest("hex").slice(0, 16)
}

// ── 행 변환 ──────────────────────────────────────────────────────────────────

interface SavedSegmentRow {
  id: string
  name: string
  description: string | null
  spec: unknown
  spec_version: number | null
  spec_hash: string
  visibility: string
  owner_user_id: string | null
  owner_name: string | null
  auto_tag_enabled: boolean | null
  auto_tag_label: string | null
  auto_untag: boolean | null
  last_count: number | null
  last_evaluated_at: string | null
  last_run_status: string | null
  last_run_detail: unknown
  archived_at: string | null
  archived_by: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

const SEGMENT_COLUMNS =
  "id, name, description, spec, spec_version, spec_hash, visibility, owner_user_id, owner_name, auto_tag_enabled, auto_tag_label, auto_untag, last_count, last_evaluated_at, last_run_status, last_run_detail, archived_at, archived_by, created_by, updated_by, created_at, updated_at"

const STATUS_SET: ReadonlySet<string> = new Set(SEGMENT_AUTO_TAG_STATUSES)
const FLAG_SET: ReadonlySet<string> = new Set(SEGMENT_QUALITY_FLAGS)

function toStatus(value: unknown): SegmentAutoTagStatus | null {
  return typeof value === "string" && STATUS_SET.has(value) ? (value as SegmentAutoTagStatus) : null
}

function toFlags(value: unknown): SegmentQualityFlag[] {
  if (!Array.isArray(value)) return []
  return value.filter((flag): flag is SegmentQualityFlag => typeof flag === "string" && FLAG_SET.has(flag))
}

function toCount(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : undefined
}

function toRunDetail(value: unknown): SavedSegmentRunDetail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const detail: SavedSegmentRunDetail = {}
  for (const key of ["tagged", "untagged", "failed", "invalid"] as const) {
    const count = toCount(raw[key])
    if (count != null) detail[key] = count
  }
  if (raw.flags !== undefined) detail.flags = toFlags(raw.flags)
  if (raw.blockedUntag === true) detail.blockedUntag = true
  return detail
}

export function toSavedSegmentRecord(row: SavedSegmentRow): SavedSegmentRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    spec: row.spec,
    specVersion: Number(row.spec_version ?? 1),
    specHash: row.spec_hash,
    visibility: row.visibility === "team" ? "team" : "mine",
    ownerUserId: row.owner_user_id ?? null,
    ownerName: row.owner_name ?? null,
    autoTagEnabled: row.auto_tag_enabled === true,
    autoTagLabel: row.auto_tag_label ?? null,
    autoUntag: row.auto_untag === true,
    lastCount: row.last_count == null ? null : Number(row.last_count),
    lastEvaluatedAt: row.last_evaluated_at ?? null,
    lastRunStatus: toStatus(row.last_run_status),
    lastRunDetail: toRunDetail(row.last_run_detail),
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

interface SavedSegmentDailyRow {
  segment_id: string
  snapshot_date: string
  total: number
  lead_count: number | null
  neo_account_count: number | null
  customer_count: number | null
  spec_hash: string
  flags: unknown
  auto_tag_status: string
  tagged: number | null
  untagged: number | null
  tag_failed: number | null
  run_trigger: string
  evaluated_at: string
}

const DAILY_COLUMNS =
  "segment_id, snapshot_date, total, lead_count, neo_account_count, customer_count, spec_hash, flags, auto_tag_status, tagged, untagged, tag_failed, run_trigger, evaluated_at"

function toDailyPoint(row: SavedSegmentDailyRow): SavedSegmentDailyPoint {
  return {
    segmentId: row.segment_id,
    snapshotDate: String(row.snapshot_date).slice(0, 10),
    total: Number(row.total ?? 0),
    leadCount: Number(row.lead_count ?? 0),
    neoAccountCount: Number(row.neo_account_count ?? 0),
    customerCount: Number(row.customer_count ?? 0),
    specHash: row.spec_hash,
    flags: toFlags(row.flags),
    autoTagStatus: toStatus(row.auto_tag_status) ?? "off",
    tagged: Number(row.tagged ?? 0),
    untagged: Number(row.untagged ?? 0),
    tagFailed: Number(row.tag_failed ?? 0),
    runTrigger: row.run_trigger === "manual" ? "manual" : "cron",
    evaluatedAt: row.evaluated_at,
  }
}

// ── range 페이지네이션 ───────────────────────────────────────────────────────
// 플레이북 04: 실제로 받은 행 수만큼 전진 + 타이브레이커 정렬 + 첫 페이지 count 로 종료. 서버 max-rows 가 요청보다
// 작아도 중간 행을 건너뛰지 않는다(crm-customer-tags collectAllTagPages 와 같은 규칙).

const PAGE_SIZE = 1000
const MAX_PAGES = 200

interface RangePage<T> {
  data: T[] | null
  error: PostgrestErrorLike | null
  count?: number | null
}

type RangeResult<T> = { ok: true; rows: T[] } | { ok: false; error: PostgrestErrorLike }

async function collectPages<T>(
  fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<RangePage<T>>
): Promise<RangeResult<T>> {
  const rows: T[] = []
  let total: number | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error, count } = await fetchPage(rows.length, rows.length + PAGE_SIZE - 1, page === 0)
    if (error) return { ok: false, error }
    if (page === 0 && typeof count === "number") total = count
    const batch = data ?? []
    if (batch.length === 0) break
    rows.push(...batch)
    if (total !== null && rows.length >= total) break
  }
  return { ok: true, rows }
}

function throwReadError(error: PostgrestErrorLike, label: string): never {
  throw new Error(`[crm-saved-segments] ${label} 실패: ${error.message ?? "unknown"}`)
}

// ── 세그먼트 읽기 ────────────────────────────────────────────────────────────

export type SavedSegmentListResult =
  | { available: true; segments: SavedSegmentRecord[] }
  | { available: false; warning: string; segments: [] }

/**
 * 세그먼트 전량(보관 포함 여부 선택). 가시성 필터는 호출부(API)가 한다 — 표가 작아(수십 행) 전량 읽기가 싸다.
 * 표가 없으면 available:false(읽기 폴백), 그 밖의 오류는 던진다.
 */
export async function listSavedSegments(options: { archived?: boolean } = {}): Promise<SavedSegmentListResult> {
  const supabase = createSupabaseAdminClient()
  const archived = options.archived === true
  const result = await collectPages<SavedSegmentRow>((from, to, withCount) => {
    const query = supabase.from(SEGMENTS_TABLE).select(SEGMENT_COLUMNS, withCount ? { count: "exact" } : undefined)
    const filtered = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null)
    return filtered.order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to)
  })
  if (!result.ok) {
    if (isSavedSegmentsTableMissing(result.error)) {
      return { available: false, warning: SAVED_SEGMENTS_NOT_READY_MESSAGE, segments: [] }
    }
    throwReadError(result.error, "목록 조회")
  }
  return { available: true, segments: result.rows.map(toSavedSegmentRecord) }
}

/** 세그먼트 한 개. 없으면 null. 표가 없으면 SavedSegmentsNotReadyError. */
export async function getSavedSegment(id: string): Promise<SavedSegmentRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(SEGMENTS_TABLE).select(SEGMENT_COLUMNS).eq("id", id).maybeSingle()
  if (error) {
    if (isSavedSegmentsTableMissing(error)) throw new SavedSegmentsNotReadyError()
    throwReadError(error, "상세 조회")
  }
  return data ? toSavedSegmentRecord(data as SavedSegmentRow) : null
}

/** 크론·수동 실행 대상 — 보관 안 된 세그먼트(ids 가 있으면 그중에서만). */
export async function listActiveSavedSegmentsForRun(ids?: readonly string[]): Promise<SavedSegmentRecord[]> {
  const listed = await listSavedSegments({ archived: false })
  if (!listed.available) throw new SavedSegmentsNotReadyError()
  if (!ids) return listed.segments
  const wanted = new Set(ids)
  return listed.segments.filter((segment) => wanted.has(segment.id))
}

/** 활성 자동 태그 라벨(보관 안 됨·켜짐) — 태그 이름 변경·병합 가드용. 표가 없으면 빈 배열. */
export async function listActiveAutoTagLabels(): Promise<Array<{ segmentId: string; segmentName: string; label: string }>> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(SEGMENTS_TABLE)
    .select("id, name, auto_tag_label")
    .eq("auto_tag_enabled", true)
    .is("archived_at", null)
    .order("id", { ascending: true })
    .limit(PAGE_SIZE)
  if (error) {
    if (isSavedSegmentsTableMissing(error)) return []
    throwReadError(error, "자동 태그 라벨 조회")
  }
  return ((data ?? []) as Array<{ id: string; name: string; auto_tag_label: string | null }>)
    .filter((row) => Boolean(row.auto_tag_label))
    .map((row) => ({ segmentId: row.id, segmentName: row.name, label: row.auto_tag_label as string }))
}

// ── 세그먼트 쓰기 ────────────────────────────────────────────────────────────

function throwWriteError(error: PostgrestErrorLike, label: string): never {
  if (isSavedSegmentsTableMissing(error)) throw new SavedSegmentsNotReadyError()
  if (isUniqueViolation(error)) throw new SavedSegmentAutoTagLabelConflictError()
  if (isCheckViolation(error)) throw new SavedSegmentConstraintError()
  throw new Error(`[crm-saved-segments] ${label} 실패: ${error.message ?? "unknown"}`)
}

export interface CreateSavedSegmentInput {
  name: string
  description: string | null
  spec: CustomerSegmentFilter
  visibility: SavedSegmentVisibility
  ownerUserId: string | null
  ownerName: string | null
  autoTag: { enabled: boolean; label: string | null; untag: boolean }
  actor: string | null
}

export async function createSavedSegment(input: CreateSavedSegmentInput): Promise<SavedSegmentRecord> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(SEGMENTS_TABLE)
    .insert({
      name: input.name,
      description: input.description,
      spec: input.spec,
      spec_version: SAVED_SEGMENT_SPEC_VERSION,
      spec_hash: computeSegmentSpecHash(input.spec),
      visibility: input.visibility,
      owner_user_id: input.ownerUserId,
      owner_name: input.ownerName,
      auto_tag_enabled: input.autoTag.enabled,
      auto_tag_label: input.autoTag.label,
      auto_untag: input.autoTag.untag,
      created_by: input.actor,
      updated_by: input.actor,
    })
    .select(SEGMENT_COLUMNS)
    .single()
  if (error) throwWriteError(error, "생성")
  return toSavedSegmentRecord(data as SavedSegmentRow)
}

export interface UpdateSavedSegmentPatch {
  name?: string
  description?: string | null
  spec?: CustomerSegmentFilter
  visibility?: SavedSegmentVisibility
  autoTagEnabled?: boolean
  autoTagLabel?: string | null
  autoUntag?: boolean
  /** true = 보관 해제(archived_at·archived_by 비움) */
  restore?: boolean
  actor: string | null
}

/** 사람이 바꾼 값만 싣는다. 조건이 바뀌면 spec_hash·spec_version 을 다시 쓴다(추이 끊김). 없으면 null. */
export async function updateSavedSegment(id: string, patch: UpdateSavedSegmentPatch): Promise<SavedSegmentRecord | null> {
  const update: Record<string, unknown> = { updated_by: patch.actor }
  if (patch.name !== undefined) update.name = patch.name
  if (patch.description !== undefined) update.description = patch.description
  if (patch.spec !== undefined) {
    update.spec = patch.spec
    update.spec_version = SAVED_SEGMENT_SPEC_VERSION
    update.spec_hash = computeSegmentSpecHash(patch.spec)
  }
  if (patch.visibility !== undefined) update.visibility = patch.visibility
  if (patch.autoTagEnabled !== undefined) update.auto_tag_enabled = patch.autoTagEnabled
  if (patch.autoTagLabel !== undefined) update.auto_tag_label = patch.autoTagLabel
  if (patch.autoUntag !== undefined) update.auto_untag = patch.autoUntag
  if (patch.restore) {
    update.archived_at = null
    update.archived_by = null
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(SEGMENTS_TABLE)
    .update(update)
    .eq("id", id)
    .select(SEGMENT_COLUMNS)
    .maybeSingle()
  if (error) throwWriteError(error, "수정")
  return data ? toSavedSegmentRecord(data as SavedSegmentRow) : null
}

/** 보관(물리 삭제 아님) — 자동 태그도 끈다(붙은 태그는 둔다 — 떼기는 호출부가 따로). 없으면 null. */
export async function archiveSavedSegment(id: string, actor: string | null): Promise<SavedSegmentRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(SEGMENTS_TABLE)
    .update({ archived_at: new Date().toISOString(), archived_by: actor, auto_tag_enabled: false, updated_by: actor })
    .eq("id", id)
    .select(SEGMENT_COLUMNS)
    .maybeSingle()
  if (error) throwWriteError(error, "보관")
  return data ? toSavedSegmentRecord(data as SavedSegmentRow) : null
}

export interface SavedSegmentRunState {
  lastCount: number | null
  lastEvaluatedAt: string
  lastRunStatus: SegmentAutoTagStatus
  lastRunDetail: SavedSegmentRunDetail
}

/** 실행 결과 갱신(last_*) — 수정 시각은 트리거가 올리지 않는다(마이그레이션 주석). */
export async function updateSavedSegmentRunState(id: string, state: SavedSegmentRunState): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const update: Record<string, unknown> = {
    last_evaluated_at: state.lastEvaluatedAt,
    last_run_status: state.lastRunStatus,
    last_run_detail: state.lastRunDetail,
  }
  if (state.lastCount != null) update.last_count = state.lastCount
  const { error } = await supabase.from(SEGMENTS_TABLE).update(update).eq("id", id)
  if (error) throwWriteError(error, "실행 결과 갱신")
}

// ── 일별 기록 ────────────────────────────────────────────────────────────────

export interface SavedSegmentDailyUpsert {
  segmentId: string
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

export type SavedSegmentDailyWriteResult = { ok: true; written: number } | { ok: false; reason: "not_ready" | "failed" }

/** 일별 행 배치 upsert(PK segment_id·snapshot_date — 같은 날 재실행은 덮어쓴다). 표가 없으면 not_ready. */
export async function upsertSavedSegmentDailyRows(
  rows: readonly SavedSegmentDailyUpsert[]
): Promise<SavedSegmentDailyWriteResult> {
  if (rows.length === 0) return { ok: true, written: 0 }
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from(DAILY_TABLE).upsert(
    rows.map((row) => ({
      segment_id: row.segmentId,
      snapshot_date: row.snapshotDate,
      total: row.total,
      lead_count: row.leadCount,
      neo_account_count: row.neoAccountCount,
      customer_count: row.customerCount,
      spec_hash: row.specHash,
      flags: row.flags,
      auto_tag_status: row.autoTagStatus,
      tagged: row.tagged,
      untagged: row.untagged,
      tag_failed: row.tagFailed,
      run_trigger: row.runTrigger,
      evaluated_at: row.evaluatedAt,
    })),
    { onConflict: "segment_id,snapshot_date" }
  )
  if (error) {
    if (isSavedSegmentsTableMissing(error, DAILY_TABLE)) return { ok: false, reason: "not_ready" }
    console.error("[crm-saved-segments] 일별 기록 실패", error.message ?? "unknown")
    return { ok: false, reason: "failed" }
  }
  return { ok: true, written: rows.length }
}

export type SavedSegmentDailyListResult =
  | { available: true; points: SavedSegmentDailyPoint[] }
  | { available: false; warning: string; points: [] }

/** id in(...) 한 번에 싣는 세그먼트 수 — URL 상한 아래(UUID 100개 ≈ 3.7KB). */
const DAILY_ID_CHUNK = 100

/**
 * 세그먼트들의 일별 점(sinceDate 이상, KST 날짜 키) — 청크·range 페이지네이션 전량(20개×56일=1,120행이면
 * max-rows 를 넘는다). 일별 표가 없으면 available:false(추이만 빈다), 그 밖의 오류는 던진다.
 */
export async function listSavedSegmentDailyPoints(
  segmentIds: readonly string[],
  sinceDate: string
): Promise<SavedSegmentDailyListResult> {
  const ids = [...new Set(segmentIds.filter(Boolean))]
  if (ids.length === 0) return { available: true, points: [] }
  const supabase = createSupabaseAdminClient()
  const points: SavedSegmentDailyPoint[] = []
  for (let index = 0; index < ids.length; index += DAILY_ID_CHUNK) {
    const chunk = ids.slice(index, index + DAILY_ID_CHUNK)
    const result = await collectPages<SavedSegmentDailyRow>((from, to, withCount) =>
      supabase
        .from(DAILY_TABLE)
        .select(DAILY_COLUMNS, withCount ? { count: "exact" } : undefined)
        .in("segment_id", chunk)
        .gte("snapshot_date", sinceDate)
        .order("segment_id", { ascending: true })
        .order("snapshot_date", { ascending: true })
        .range(from, to)
    )
    if (!result.ok) {
      if (isSavedSegmentsTableMissing(result.error, DAILY_TABLE)) {
        return { available: false, warning: SAVED_SEGMENT_DAILY_NOT_READY_MESSAGE, points: [] }
      }
      throwReadError(result.error, "일별 기록 조회")
    }
    points.push(...result.rows.map(toDailyPoint))
  }
  return { available: true, points }
}

/** 보존 기간이 지난 일별 행 삭제(best-effort — 실패는 로그만). */
export async function deleteSavedSegmentDailyBefore(beforeDate: string): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from(DAILY_TABLE).delete().lt("snapshot_date", beforeDate)
    if (error && !isSavedSegmentsTableMissing(error, DAILY_TABLE)) {
      console.warn("[crm-saved-segments] 일별 기록 보존 삭제 실패", error.message ?? "unknown")
    }
  } catch (error) {
    console.warn("[crm-saved-segments] 일별 기록 보존 삭제 실패", error instanceof Error ? error.name : "Error")
  }
}
