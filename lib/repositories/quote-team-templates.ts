import "server-only"

import { isMissingTableMessage } from "@/lib/db/schema-contract"
import {
  baseQuoteTemplateViews,
  canEditQuoteTemplate,
  isQuoteTemplateVisibleTo,
  normalizeQuoteTemplateDefaults,
  teamQuoteTemplateView,
  type QuoteTeamTemplateRecord,
  type QuoteTemplateInput,
  type QuoteTemplateItem,
  type QuoteTemplateView,
  type QuoteTemplateViewer,
} from "@/lib/quote-team-templates"
import { STANDARD_QUOTE_TEMPLATES, type StandardQuoteTemplateId } from "@/lib/standard-quote-template"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 견적 팀 템플릿 저장소(2026-10-21) — quote_team_templates.
//
//  - 전부 service role 경로다(표는 RLS deny-all). '나만'·수정 권한은 API 가 lib/quote-team-templates.ts 로 강제한다.
//  - 미적용 폴백(마이그레이션 런북 관례): 읽기 = available:false + 안내(기본 템플릿은 그대로 보인다),
//    쓰기 = QuoteTeamTemplatesNotReadyError(라우트가 503).
//  - 미적용이 아닌 읽기 오류는 빈 결과로 삼키지 않고 던진다.

const TABLE = "quote_team_templates"
const COLUMNS =
  "id, name, product_line, source_template_id, items, defaults, scope, show_in_menu, owner_user_id, owner_name, archived_at, created_at, updated_at"

export const QUOTE_TEAM_TEMPLATES_NOT_READY_MESSAGE =
  "팀 템플릿 표가 아직 적용되지 않아 기본 템플릿만 보입니다. supabase/migrations/20261021_quote_team_templates.sql 적용이 필요합니다."

export class QuoteTeamTemplatesNotReadyError extends Error {
  constructor() {
    super(QUOTE_TEAM_TEMPLATES_NOT_READY_MESSAGE)
    this.name = "QuoteTeamTemplatesNotReadyError"
  }
}

interface PostgrestErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export function isQuoteTeamTemplatesTableMissing(error: PostgrestErrorLike | null | undefined) {
  if (!error) return false
  const text = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ")
  const lower = text.toLowerCase()
  if (lower.includes("42p01") || lower.includes("pgrst205")) return true
  return isMissingTableMessage(text) && lower.includes(TABLE)
}

interface QuoteTeamTemplateRow {
  id: string
  name: string
  product_line: string
  source_template_id: string | null
  items: unknown
  defaults: unknown
  scope: string
  show_in_menu: boolean | null
  owner_user_id: string | null
  owner_name: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

const STANDARD_IDS = new Set<string>(STANDARD_QUOTE_TEMPLATES.map((template) => template.id))

function toItems(raw: unknown): QuoteTemplateItem[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object") return []
    const { sku, quantity, unitPrice } = value as Record<string, unknown>
    if (typeof sku !== "string" || typeof quantity !== "number") return []
    return [{ sku, quantity, unitPrice: typeof unitPrice === "number" ? unitPrice : null }]
  })
}

export function toQuoteTeamTemplateRecord(row: QuoteTeamTemplateRow): QuoteTeamTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    productLine: row.product_line === "software" ? "software" : "hardware",
    sourceTemplateId: row.source_template_id && STANDARD_IDS.has(row.source_template_id)
      ? (row.source_template_id as StandardQuoteTemplateId)
      : null,
    items: toItems(row.items),
    defaults: normalizeQuoteTemplateDefaults(row.defaults),
    scope: row.scope === "team" ? "team" : "mine",
    showInMenu: row.show_in_menu === true,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function throwWriteError(error: PostgrestErrorLike): never {
  if (isQuoteTeamTemplatesTableMissing(error)) throw new QuoteTeamTemplatesNotReadyError()
  throw new Error(error.message ?? "팀 템플릿을 저장하지 못했습니다.")
}

export type QuoteTeamTemplateList =
  | { available: true; warning: null; templates: QuoteTeamTemplateRecord[] }
  | { available: false; warning: string; templates: [] }

/** 보관 안 된 팀 템플릿 전부(가시성 필터 전). 팀 규모상 수백 행 이내 — 페이지네이션 없이 상한만 둔다. */
export async function listQuoteTeamTemplates(): Promise<QuoteTeamTemplateList> {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .select(COLUMNS)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(500)
  if (error) {
    if (isQuoteTeamTemplatesTableMissing(error)) {
      return { available: false, warning: QUOTE_TEAM_TEMPLATES_NOT_READY_MESSAGE, templates: [] }
    }
    throw new Error(error.message ?? "팀 템플릿을 불러오지 못했습니다.")
  }
  return { available: true, warning: null, templates: ((data ?? []) as QuoteTeamTemplateRow[]).map(toQuoteTeamTemplateRecord) }
}

export async function getQuoteTeamTemplate(id: string): Promise<QuoteTeamTemplateRecord | null> {
  const { data, error } = await createSupabaseAdminClient().from(TABLE).select(COLUMNS).eq("id", id).maybeSingle()
  if (error) throwWriteError(error)
  return data ? toQuoteTeamTemplateRecord(data as QuoteTeamTemplateRow) : null
}

function inputColumns(input: QuoteTemplateInput) {
  return {
    name: input.name,
    product_line: input.productLine,
    source_template_id: input.sourceTemplateId,
    items: input.items,
    defaults: input.defaults,
    scope: input.scope,
    show_in_menu: input.showInMenu,
  }
}

export async function createQuoteTeamTemplate(params: {
  input: QuoteTemplateInput
  ownerUserId: string | null
  ownerName: string | null
  actor: string
}): Promise<QuoteTeamTemplateRecord> {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .insert({
      ...inputColumns(params.input),
      owner_user_id: params.ownerUserId,
      owner_name: params.ownerName,
      created_by: params.actor,
      updated_by: params.actor,
    })
    .select(COLUMNS)
    .single()
  if (error) throwWriteError(error)
  return toQuoteTeamTemplateRecord(data as QuoteTeamTemplateRow)
}

/** 보관된 행은 고치지 않는다(null = 없음/보관됨). */
export async function updateQuoteTeamTemplate(
  id: string,
  input: QuoteTemplateInput,
  actor: string
): Promise<QuoteTeamTemplateRecord | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .update({ ...inputColumns(input), updated_by: actor })
    .eq("id", id)
    .is("archived_at", null)
    .select(COLUMNS)
    .maybeSingle()
  if (error) throwWriteError(error)
  return data ? toQuoteTeamTemplateRecord(data as QuoteTeamTemplateRow) : null
}

/** 물리 삭제 없음 — archived_at 만 찍는다. */
export async function archiveQuoteTeamTemplate(id: string, actor: string): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .update({ archived_at: new Date().toISOString(), archived_by: actor, updated_by: actor })
    .eq("id", id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle()
  if (error) throwWriteError(error)
  return Boolean(data)
}

export interface QuoteTemplateCatalogResponse {
  /** 팀 템플릿 표가 읽혔는지. false 면 warning 을 띄우고 기본 템플릿만 쓴다. */
  available: boolean
  warning: string | null
  base: QuoteTemplateView[]
  team: QuoteTemplateView[]
}

/**
 * 견적 작성기·설정 화면 공용 — 기본 템플릿 + 이 사용자에게 보이는 팀 템플릿.
 * 표 미적용이어도 기본 템플릿은 항상 돌려준다.
 */
export async function listQuoteTemplatesFor(viewer: QuoteTemplateViewer): Promise<QuoteTemplateCatalogResponse> {
  const listed = await listQuoteTeamTemplates()
  return {
    available: listed.available,
    warning: listed.warning,
    base: baseQuoteTemplateViews(),
    team: listed.templates.filter((record) => isQuoteTemplateVisibleTo(record, viewer)).map((record) => teamQuoteTemplateView(record, canEditQuoteTemplate(record, viewer))),
  }
}
