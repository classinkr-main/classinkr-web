import "server-only"

// Meta 리드애즈 단일 수신 전환 스위치 읽기·수신 증인 기록·원장 소유 판정(설계 META-RECEIVER-FINAL
// §4-2 H4, §5).
//
// - 스위치는 public.meta_leadgen_cutover 한 행이다(마이그레이션 20260915_meta_leadgen_single_receiver.sql).
//   service_role 은 select 만 가능하고, 바꾸는 것은 SQL 함수 meta_leadgen_set_mode·set_options 뿐이다.
// - 기본은 admin(지금 웹훅 경로)이다. 행이 없거나, 못 읽거나, 모르는 값이면 admin 으로 본다.
// - env META_LEADGEN_FORCE_ADMIN=1 은 비상 스위치다 — DB 를 읽지 않고 admin 으로 본다
//   (재배포가 있어야 반영된다. DB 를 못 읽을 때만 쓴다).
// - 성공한 읽기만 인스턴스 메모로 30초 둔다(모드 전환·롤백 반영 지연 = 30초). 실패는 메모하지
//   않는다 — DB 가 돌아오면 다음 요청이 바로 읽는다.

import type { SupabaseClient } from "@supabase/supabase-js"

import type { MetaLeadValue } from "@/lib/meta/lead-ads-payload"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const META_LEADGEN_MODES = ["admin", "shadow", "compass"] as const
export type MetaLeadgenMode = (typeof META_LEADGEN_MODES)[number]
export type MetaLeadgenReceiptMode = Exclude<MetaLeadgenMode, "admin">

export const META_LEADGEN_CUTOVER_TABLE = "meta_leadgen_cutover"
export const META_LEAD_MIRROR_LEDGER_TABLE = "meta_lead_mirror_ledger"
export const META_LEADGEN_RECORD_RECEIPTS_RPC = "meta_leadgen_record_receipts"

/** 모드 반영 지연(웹훅·크론 인스턴스 메모) — 설계 §5 */
export const META_LEADGEN_CUTOVER_CACHE_TTL_MS = 30_000
/** 스위치 한 행 읽기 상한 — 넘으면 읽기 실패로 보고 admin 으로 간다 */
export const META_LEADGEN_CUTOVER_READ_TIMEOUT_MS = 3_000
/** 증인 RPC 상한 — 넘으면 실패로 본다(compass 모드에서는 인라인 저장으로 넘어간다) */
export const META_LEADGEN_RECEIPTS_TIMEOUT_MS = 5_000
/** 원장 조회 상한 — 넘으면 소유 없음으로 본다(건너뛰지 않음 = 지금 경로) */
export const META_LEAD_LEDGER_READ_TIMEOUT_MS = 3_000
export const META_LEAD_LEDGER_ID_CHUNK = 200

/** 이 상태의 원장 행이 있으면 public.leads 행이 이미 있거나(inserted·adopted) 폴백이 저장 중이다 */
export const LEDGER_OWNED_STATES = ["inserted", "adopted", "fallback_pending"] as const

const CUTOVER_COLUMNS =
  "mode, shadow_since, mirror_since, compass_started_at, compass_ended_at, side_effects, fallback_after_minutes, updated_at"

export type MetaLeadgenSideEffects = {
  leadCreatedNotification: boolean
  subscriberUpsert: boolean
  automationOnSubmit: boolean
  externalForwards: boolean
}

/** 마이그레이션 컬럼 기본값과 같다 */
export const DEFAULT_META_LEADGEN_SIDE_EFFECTS: Readonly<MetaLeadgenSideEffects> = Object.freeze({
  leadCreatedNotification: true,
  subscriberUpsert: true,
  automationOnSubmit: true,
  externalForwards: true,
})

export type MetaLeadgenCutover = {
  mode: MetaLeadgenMode
  shadowSince: string | null
  mirrorSince: string | null
  compassStartedAt: string | null
  compassEndedAt: string | null
  sideEffects: MetaLeadgenSideEffects
  fallbackAfterMinutes: number
  updatedAt: string | null
}

export type MetaLeadgenModeSource =
  /** env META_LEADGEN_FORCE_ADMIN=1 — DB 를 읽지 않았다 */
  | "env_force_admin"
  /** DB 한 행을 읽었다(메모 포함) */
  | "db"
  /** 읽기 실패(오류·시간 초과·행 없음·모르는 모드) → admin */
  | "read_failed"

export type ResolvedMetaLeadgenCutover = {
  mode: MetaLeadgenMode
  source: MetaLeadgenModeSource
  /** source='db' 일 때만 값이 있다 */
  cutover: MetaLeadgenCutover | null
  /** source='read_failed' 일 때 원인(값·PII 없음) */
  error?: string
}

type CutoverRow = {
  mode?: unknown
  shadow_since?: unknown
  mirror_since?: unknown
  compass_started_at?: unknown
  compass_ended_at?: unknown
  side_effects?: unknown
  fallback_after_minutes?: unknown
  updated_at?: unknown
}

type CacheEntry = { expiresAt: number; promise: Promise<MetaLeadgenCutover> }

let cutoverCache: CacheEntry | null = null

/** 테스트 전용 — 모듈 스코프 메모를 비운다 */
export function __resetMetaLeadgenCutoverCacheForTests(): void {
  cutoverCache = null
}

export function isMetaLeadgenForceAdmin(): boolean {
  return process.env.META_LEADGEN_FORCE_ADMIN?.trim() === "1"
}

function isMode(value: unknown): value is MetaLeadgenMode {
  return typeof value === "string" && (META_LEADGEN_MODES as readonly string[]).includes(value)
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function parseSideEffects(value: unknown): MetaLeadgenSideEffects {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const pick = (key: keyof MetaLeadgenSideEffects) =>
    typeof source[key] === "boolean" ? (source[key] as boolean) : DEFAULT_META_LEADGEN_SIDE_EFFECTS[key]
  return {
    leadCreatedNotification: pick("leadCreatedNotification"),
    subscriberUpsert: pick("subscriberUpsert"),
    automationOnSubmit: pick("automationOnSubmit"),
    externalForwards: pick("externalForwards"),
  }
}

/** DB 행 → 스위치. 모드가 모르는 값이면 throw(호출부가 admin 으로 폴백한다). */
export function parseMetaLeadgenCutoverRow(row: CutoverRow | null | undefined): MetaLeadgenCutover {
  if (!row) throw new Error("meta_leadgen_cutover: default 행이 없다")
  if (!isMode(row.mode)) throw new Error("meta_leadgen_cutover: 알 수 없는 모드")
  const fallbackAfter = Number(row.fallback_after_minutes)
  return {
    mode: row.mode,
    shadowSince: optionalText(row.shadow_since),
    mirrorSince: optionalText(row.mirror_since),
    compassStartedAt: optionalText(row.compass_started_at),
    compassEndedAt: optionalText(row.compass_ended_at),
    sideEffects: parseSideEffects(row.side_effects),
    fallbackAfterMinutes: Number.isFinite(fallbackAfter) && fallbackAfter > 0 ? fallbackAfter : 120,
    updatedAt: optionalText(row.updated_at),
  }
}

function errorLabel(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message)
  return String(error)
}

async function withTimeout<T>(
  timeoutMs: number,
  label: string,
  run: (signal: AbortSignal) => PromiseLike<T>
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`${label}: ${timeoutMs}ms 초과`))
    }, timeoutMs)
  })
  try {
    return await Promise.race([Promise.resolve(run(controller.signal)), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function fetchCutoverRow(): Promise<MetaLeadgenCutover> {
  const sb: SupabaseClient = createSupabaseAdminClient()
  const { data, error } = await withTimeout(META_LEADGEN_CUTOVER_READ_TIMEOUT_MS, "meta_leadgen_cutover 읽기", (signal) =>
    sb
      .from(META_LEADGEN_CUTOVER_TABLE)
      .select(CUTOVER_COLUMNS)
      .eq("id", "default")
      .abortSignal(signal)
      .maybeSingle()
  )
  if (error) throw new Error(`meta_leadgen_cutover 읽기 실패: ${errorLabel(error)}`)
  return parseMetaLeadgenCutoverRow(data as CutoverRow | null)
}

/**
 * 스위치 한 행을 30초 메모로 읽는다. 실패는 throw 하고 메모하지 않는다.
 * 동시에 들어온 호출은 진행 중인 읽기 하나를 공유한다.
 * env 비상 스위치는 보지 않는다 — 미러·폴백 크론은 env 와 무관하게 돈다(설계 §5).
 */
export function readMetaLeadgenCutover(): Promise<MetaLeadgenCutover> {
  const now = Date.now()
  if (cutoverCache && cutoverCache.expiresAt > now) return cutoverCache.promise

  const entry: CacheEntry = {
    expiresAt: Number.POSITIVE_INFINITY,
    promise: Promise.resolve().then(fetchCutoverRow),
  }
  entry.promise.then(
    () => {
      if (cutoverCache === entry) entry.expiresAt = Date.now() + META_LEADGEN_CUTOVER_CACHE_TTL_MS
    },
    () => {
      if (cutoverCache === entry) cutoverCache = null
    }
  )
  cutoverCache = entry
  return entry.promise
}

/**
 * 웹훅이 쓸 모드와 그 근거. 절대 throw 하지 않는다.
 * env META_LEADGEN_FORCE_ADMIN=1 → admin(DB 를 읽지 않음) · 읽기 실패 → admin.
 */
export async function resolveMetaLeadgenCutover(): Promise<ResolvedMetaLeadgenCutover> {
  if (isMetaLeadgenForceAdmin()) {
    return { mode: "admin", source: "env_force_admin", cutover: null }
  }
  try {
    const cutover = await readMetaLeadgenCutover()
    return { mode: cutover.mode, source: "db", cutover }
  } catch (error) {
    const message = errorLabel(error)
    console.warn("[meta/leadgen-cutover] 모드를 읽지 못해 admin 으로 처리:", message)
    return { mode: "admin", source: "read_failed", cutover: null, error: message }
  }
}

/** 설계 §4-2 H4 의 getEffectiveMetaLeadgenMode — 모드만 필요한 호출부용 */
export async function getEffectiveMetaLeadgenMode(): Promise<MetaLeadgenMode> {
  return (await resolveMetaLeadgenCutover()).mode
}

export type MetaLeadgenReceiptRow = {
  leadgen_id: string
  page_id: string | null
  form_id: string | null
  ad_id: string | null
}

/** 증인 RPC 에 넘기는 행 — 식별자 4개만(PII 없음). 중복·숫자 검사는 RPC 가 한다. */
export function buildMetaLeadgenReceiptRows(leads: MetaLeadValue[]): MetaLeadgenReceiptRow[] {
  return leads.map((lead) => ({
    leadgen_id: String(lead.leadgen_id ?? ""),
    page_id: lead.page_id ?? null,
    form_id: lead.form_id ?? null,
    ad_id: lead.ad_id ?? null,
  }))
}

/**
 * 수신 증인 기록 — meta_leadgen_record_receipts RPC 1회. 실패(오류·시간 초과·숫자가 아닌 id)는 throw.
 * 반환값은 RPC 가 돌려준 처리 행 수다.
 */
export async function recordMetaLeadgenReceipts(
  leads: MetaLeadValue[],
  mode: MetaLeadgenReceiptMode
): Promise<number> {
  if (mode !== "shadow" && mode !== "compass") {
    throw new Error(`meta_leadgen_record_receipts: 모드는 shadow·compass 만(지금 ${String(mode)})`)
  }
  const sb: SupabaseClient = createSupabaseAdminClient()
  const { data, error } = await withTimeout(META_LEADGEN_RECEIPTS_TIMEOUT_MS, "meta_leadgen_record_receipts", (signal) =>
    sb
      .rpc(META_LEADGEN_RECORD_RECEIPTS_RPC, { p_rows: buildMetaLeadgenReceiptRows(leads), p_mode: mode })
      .abortSignal(signal)
  )
  if (error) throw new Error(`meta_leadgen_record_receipts 실패: ${errorLabel(error)}`)
  return typeof data === "number" ? data : Number(data ?? 0)
}

/**
 * 원장이 이미 소유한 leadgen id 집합(state ∈ inserted·adopted·fallback_pending).
 * `mirror_since` 가 있을 때만 조회한다 — 원장이 비어 있는 동안(전환 전) 웹훅 동작은 바뀌지 않는다.
 * cutover 를 넘기지 않으면 메모된 스위치를 읽는다(못 읽으면 조회하지 않음).
 * 조회 실패는 빈 집합(= 건너뛰지 않음, 지금 경로). 중복은 건강 지표 H4 가 드러낸다.
 */
export async function isLeadgenOwnedByLedger(
  leadgenIds: string[],
  cutover?: MetaLeadgenCutover | null
): Promise<Set<string>> {
  const owned = new Set<string>()
  const ids = [...new Set(leadgenIds.filter((id) => typeof id === "string" && id))]
  if (!ids.length) return owned

  let state = cutover
  if (state === undefined) {
    try {
      state = await readMetaLeadgenCutover()
    } catch {
      return owned
    }
  }
  if (!state?.mirrorSince) return owned

  try {
    const sb: SupabaseClient = createSupabaseAdminClient()
    for (let index = 0; index < ids.length; index += META_LEAD_LEDGER_ID_CHUNK) {
      const chunk = ids.slice(index, index + META_LEAD_LEDGER_ID_CHUNK)
      const { data, error } = await withTimeout(META_LEAD_LEDGER_READ_TIMEOUT_MS, "meta_lead_mirror_ledger 읽기", (signal) =>
        sb
          .from(META_LEAD_MIRROR_LEDGER_TABLE)
          .select("leadgen_id")
          .in("leadgen_id", chunk)
          .in("state", [...LEDGER_OWNED_STATES])
          .abortSignal(signal)
      )
      if (error) throw new Error(errorLabel(error))
      for (const row of (data ?? []) as Array<{ leadgen_id?: unknown }>) {
        if (typeof row.leadgen_id === "string") owned.add(row.leadgen_id)
      }
    }
    return owned
  } catch (error) {
    console.warn("[meta/leadgen-cutover] 원장 조회 실패 — 건너뛰지 않고 처리:", errorLabel(error))
    return new Set<string>()
  }
}
