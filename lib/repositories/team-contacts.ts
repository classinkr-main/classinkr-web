import "server-only"

import { isMissingTableMessage } from "@/lib/db/schema-contract"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  isTeamContactOrg,
  kstDateString,
  staleConfirmationCleared,
  type TeamContactInput,
  type TeamContactRecord,
} from "@/lib/team-contacts/model"

// 담당자 표 저장소(2026-11-26) — internal_team_contacts(RLS deny-all, service role 전용).
//
//  - 쓰기(만들기·고치기·비활성화·확인일 찍기·CSV 가져오기)는 SUPER_ADMIN API(app/api/admin/team-contacts)만 부른다.
//  - 미적용 폴백(마이그레이션 런북 관례): 목록 = available:false + 안내, 쓰기 = TeamContactsNotReadyError(라우트가 503).
//    미적용이 아닌 읽기 오류는 빈 결과로 삼키지 않고 던진다.
//  - 안내용 읽기(readActiveTeamContactsCached)는 활성 행만 60초 캐시한다(인스턴스 메모리). 실패는 캐시하지 않고
//    빈 표 + failed:true 를 돌려준다 — 갈매봇 답은 지금처럼(빈 표) 돌고 카드에 실패가 적힌다.
//    쓰기 뒤에는 이 인스턴스의 캐시와 떠 있는 읽기를 비운다 — 쓰기 전에 떠난 읽기는 끝나도 캐시에 넣지 않는다
//    (다른 인스턴스는 길어야 60초 뒤에 새 값을 본다).

const TABLE = "internal_team_contacts"
const COLUMNS =
  "id, org, area, role, name, deputy, channel, prep, admin_link, note, confirmed_at, confirmed_by, active, sort_order, created_at, updated_at"

export const TEAM_CONTACTS_CACHE_TTL_MS = 60_000

export const TEAM_CONTACTS_NOT_READY_MESSAGE =
  "담당자 표가 아직 적용되지 않았습니다. supabase/migrations/20261126_internal_team_contacts.sql 적용이 필요합니다."

/** 안내 카드에 적는 실패 문구 — 표 미적용. */
export const TEAM_CONTACTS_NOT_READY_GAP =
  "한국 담당자 표가 아직 적용되지 않아(마이그레이션 미적용) 기본 경로(역할·계정 권한)로 안내합니다."

export class TeamContactsNotReadyError extends Error {
  constructor() {
    super(TEAM_CONTACTS_NOT_READY_MESSAGE)
    this.name = "TeamContactsNotReadyError"
  }
}

/** 같은 조직·영역에 활성 행이 이미 있다(부분 유니크 internal_team_contacts_active_area_uniq). */
export class TeamContactAreaTakenError extends Error {
  constructor() {
    super("이 업무 영역에는 이미 활성 행이 있습니다 — 그 행을 고치거나 먼저 비활성화하세요.")
    this.name = "TeamContactAreaTakenError"
  }
}

interface PostgrestErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export function isTeamContactsTableMissing(error: PostgrestErrorLike | null | undefined) {
  if (!error) return false
  const text = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ")
  const lower = text.toLowerCase()
  if (lower.includes("42p01") || lower.includes("pgrst205")) return true
  return isMissingTableMessage(text) && lower.includes(TABLE)
}

function isUniqueViolation(error: PostgrestErrorLike | null | undefined) {
  return error?.code === "23505"
}

interface TeamContactRow {
  id: string
  org: string
  area: string
  role: string | null
  name: string | null
  deputy: string | null
  channel: string | null
  prep: unknown
  admin_link: string | null
  note: string | null
  confirmed_at: string | null
  confirmed_by: string | null
  active: boolean | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

function toRecord(row: TeamContactRow): TeamContactRecord | null {
  if (!isTeamContactOrg(row.org)) return null
  return {
    id: row.id,
    org: row.org,
    area: row.area,
    role: row.role,
    name: row.name,
    deputy: row.deputy,
    channel: row.channel,
    prep: Array.isArray(row.prep) ? row.prep.filter((item): item is string => typeof item === "string") : [],
    adminLink: row.admin_link,
    note: row.note,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at).slice(0, 10) : null,
    confirmedBy: row.confirmed_by,
    active: row.active !== false,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRecords(data: unknown): TeamContactRecord[] {
  if (!Array.isArray(data)) return []
  return (data as TeamContactRow[]).map(toRecord).filter((record): record is TeamContactRecord => record !== null)
}

function writeError(error: PostgrestErrorLike, fallback: string): Error {
  if (isTeamContactsTableMissing(error)) return new TeamContactsNotReadyError()
  if (isUniqueViolation(error)) return new TeamContactAreaTakenError()
  return new Error(error.message || fallback)
}

function toPayload(input: TeamContactInput) {
  return {
    org: input.org,
    area: input.area,
    role: input.role,
    name: input.name,
    deputy: input.deputy,
    channel: input.channel,
    prep: input.prep,
    admin_link: input.adminLink,
    note: input.note,
    confirmed_at: input.confirmedAt,
    sort_order: input.sortOrder,
  }
}

/** 쓰기의 행위자 — 감사·확인자 표시에 쓰는 이름. */
export interface TeamContactActor {
  name: string
}

export type TeamContactsList =
  | { available: false; warning: string; rows: TeamContactRecord[] }
  | { available: true; warning: null; rows: TeamContactRecord[] }

/** 화면용 목록(캐시 없음). includeInactive 면 비활성 행도. */
export async function listTeamContacts(options: { includeInactive?: boolean } = {}): Promise<TeamContactsList> {
  let query = createSupabaseAdminClient().from(TABLE).select(COLUMNS)
  if (!options.includeInactive) query = query.eq("active", true)
  const { data, error } = await query.order("org").order("sort_order").order("area")
  if (error) {
    if (isTeamContactsTableMissing(error)) return { available: false, warning: TEAM_CONTACTS_NOT_READY_MESSAGE, rows: [] }
    throw new Error(error.message || "담당자 표를 불러오지 못했습니다.")
  }
  return { available: true, warning: null, rows: toRecords(data) }
}

export async function getTeamContact(id: string): Promise<TeamContactRecord | null> {
  const { data, error } = await createSupabaseAdminClient().from(TABLE).select(COLUMNS).eq("id", id).maybeSingle()
  if (error) {
    if (isTeamContactsTableMissing(error)) throw new TeamContactsNotReadyError()
    throw new Error(error.message || "담당자 표 행을 불러오지 못했습니다.")
  }
  return data ? toRecord(data as TeamContactRow) : null
}

export async function createTeamContact(input: TeamContactInput, actor: TeamContactActor): Promise<TeamContactRecord> {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .insert({ ...toPayload(input), confirmed_by: input.confirmedAt ? actor.name : null, active: true })
    .select(COLUMNS)
    .single()
  if (error) throw writeError(error, "담당자 표 행을 만들지 못했습니다.")
  invalidateTeamContactsCache()
  const record = data ? toRecord(data as TeamContactRow) : null
  if (!record) throw new Error("담당자 표 행을 만들지 못했습니다.")
  return record
}

/**
 * 보낸 값으로 고친다(검사된 전체 입력). 확인일이 바뀌면 확인자를 행위자로, 비우면 확인자도 비운다.
 * 1차·대리 담당이 바뀌었는데 확인일을 새로 주지 않았으면(화면은 지금 확인일을 그대로 보낸다) 지난 확인은 앞 사람의 것이라
 * 확인일·확인자를 비운다(staleConfirmationCleared) — 새 사람은 "확인일 찍기"나 새 날짜로 다시 확인한다.
 */
export async function updateTeamContact(
  base: TeamContactRecord,
  input: TeamContactInput,
  actor: TeamContactActor
): Promise<TeamContactRecord | null> {
  const next = staleConfirmationCleared(base, input)
  const confirmedBy = next.confirmedAt ? (next.confirmedAt === base.confirmedAt ? base.confirmedBy : actor.name) : null
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .update({ ...toPayload(next), confirmed_by: confirmedBy })
    .eq("id", base.id)
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw writeError(error, "담당자 표 행을 고치지 못했습니다.")
  invalidateTeamContactsCache()
  return data ? toRecord(data as TeamContactRow) : null
}

/** 비활성화(active=false)·다시 켜기. 물리 삭제는 없다. 다시 켤 때 같은 영역에 활성 행이 있으면 TeamContactAreaTakenError. */
export async function setTeamContactActive(id: string, active: boolean): Promise<TeamContactRecord | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .update({ active })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw writeError(error, active ? "담당자 표 행을 다시 켜지 못했습니다." : "담당자 표 행을 비활성화하지 못했습니다.")
  invalidateTeamContactsCache()
  return data ? toRecord(data as TeamContactRow) : null
}

/** 확인일 찍기 — 오늘(한국 날짜)과 확인한 사람. */
export async function confirmTeamContact(id: string, actor: TeamContactActor, now: Date = new Date()): Promise<TeamContactRecord | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .update({ confirmed_at: kstDateString(now), confirmed_by: actor.name })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw writeError(error, "확인일을 찍지 못했습니다.")
  invalidateTeamContactsCache()
  return data ? toRecord(data as TeamContactRow) : null
}

/** CSV 가져오기 한 줄 — 고칠 행(existingId)이 있으면 고치고, 없으면 만든다. */
export interface TeamContactImportWrite {
  existingId: string | null
  input: TeamContactInput
  /** 확인일이 CSV 에서 왔으면 확인자 표시. */
  confirmedBy: string | null
}

export interface TeamContactImportResult {
  created: number
  updated: number
  failed: Array<{ area: string; error: string }>
}

/**
 * CSV 가져오기 넣기 — 한 줄씩(표 하나에 많아야 수십 줄). 한 줄이 실패해도 나머지는 넣고, 실패 줄을 돌려준다.
 * 표 미적용이면 처음 줄에서 TeamContactsNotReadyError 를 던진다(아무것도 넣지 않았다).
 */
export async function applyTeamContactImport(writes: TeamContactImportWrite[]): Promise<TeamContactImportResult> {
  const client = createSupabaseAdminClient()
  const result: TeamContactImportResult = { created: 0, updated: 0, failed: [] }
  try {
    for (const write of writes) {
      const payload = { ...toPayload(write.input), confirmed_by: write.input.confirmedAt ? write.confirmedBy : null }
      const { error } = write.existingId
        ? await client.from(TABLE).update(payload).eq("id", write.existingId).select("id").maybeSingle()
        : await client.from(TABLE).insert({ ...payload, active: true }).select("id").single()
      if (error) {
        const mapped = writeError(error, "넣지 못했습니다.")
        if (mapped instanceof TeamContactsNotReadyError) throw mapped
        result.failed.push({ area: write.input.area, error: mapped.message })
        continue
      }
      if (write.existingId) result.updated += 1
      else result.created += 1
    }
  } finally {
    invalidateTeamContactsCache()
  }
  return result
}

// ── 안내용 읽기(짧은 캐시) ───────────────────────────────────────────────────────────────

export interface TeamContactsRead {
  rows: TeamContactRecord[]
  failed: boolean
  /** 실패 이유(표 미적용이면 안내 문구). 모르는 오류면 null. */
  warning: string | null
}

let activeCache: { at: number; rows: TeamContactRecord[] } | null = null
let activeInflight: Promise<TeamContactRecord[]> | null = null
/** 쓰기마다 하나씩 올린다 — 쓰기 전에 떠난 읽기는 끝나도 캐시에 넣지 않는다(지난 행이 60초 남는 경합). */
let cacheGeneration = 0

async function fetchActiveTeamContacts(): Promise<TeamContactRecord[]> {
  const list = await listTeamContacts()
  if (!list.available) throw new TeamContactsNotReadyError()
  return list.rows
}

/**
 * 이 인스턴스의 안내용 캐시를 비운다(쓰기 뒤). 떠 있는 읽기도 떼어 낸다 — 그 읽기는 쓰기 전 값일 수 있어,
 * 끝나도 캐시에 넣지 않고(세대가 다르다) 뒤에 오는 읽기는 거기에 올라타지 않고 새로 읽는다.
 */
export function invalidateTeamContactsCache() {
  activeCache = null
  activeInflight = null
  cacheGeneration += 1
}

/**
 * 활성 행(KR·HQ 모두) — 갈매봇·위컴 담당자 안내용. 60초 캐시. 실패는 캐시하지 않고 빈 표 + failed:true(던지지 않는다).
 */
export async function readActiveTeamContactsCached(now: () => number = Date.now): Promise<TeamContactsRead> {
  if (activeCache && now() - activeCache.at < TEAM_CONTACTS_CACHE_TTL_MS) {
    return { rows: activeCache.rows, failed: false, warning: null }
  }
  // 떠 있는 읽기는 늘 지금 세대의 것이다(무효화가 떼어 낸다).
  const generation = cacheGeneration
  const pending = activeInflight ?? fetchActiveTeamContacts()
  activeInflight = pending
  try {
    const rows = await pending
    if (generation === cacheGeneration) activeCache = { at: now(), rows }
    return { rows, failed: false, warning: null }
  } catch (error) {
    const notReady = error instanceof TeamContactsNotReadyError
    console.warn(
      `[team-contacts] 담당자 표를 읽지 못해 빈 표로 안내합니다(${notReady ? "표 미적용" : error instanceof Error ? error.name : "unknown"}).`
    )
    return { rows: [], failed: true, warning: notReady ? TEAM_CONTACTS_NOT_READY_GAP : null }
  } finally {
    if (activeInflight === pending) activeInflight = null
  }
}
