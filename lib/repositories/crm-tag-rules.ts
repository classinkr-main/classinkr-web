import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { normalizeTag } from "@/lib/crm/tag-suggestions"
import {
  buildAutoTagMatcher,
  isAutoTagRuleType,
  type AutoTagRuleParams,
  type AutoTagRuleType,
  type AutoTagTargetRow,
} from "@/lib/crm/auto-tag-rules"
import { TAG_CATEGORIES, type TagCategory } from "@/lib/crm/tag-admin"
import { getCrmUnifiedCustomers, type CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"

// T5·T6(§11.3) — 태그 정의(범주·자동 여부)와 자동 태그 규칙(만료 임박·건강도 위험·휴면)의
// server-only 저장소. crm_customer_tags(수십만 행 규모)에는 컬럼을 얹지 않고 별도 소규모
// 테이블 2개(crm_tag_definitions·crm_tag_rules)를 둔다. 대상 집합은 통합 고객 행 모델
// (getCrmUnifiedCustomers)을 range 페이지네이션으로 끝까지 읽어 재사용한다 — 우선순위 큐·
// 인사이트와 같은 원칙(전량 조회는 range로 끝까지, 잘리지 않는다).

const DEFINITIONS_TABLE = "crm_tag_definitions"
const RULES_TABLE = "crm_tag_rules"
const TAGS_TABLE = "crm_customer_tags"

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

export interface CrmTagDefinition {
  tag: string
  category: TagCategory
  description: string | null
  isAuto: boolean
  createdAt: string
  updatedAt: string
}

interface CrmTagDefinitionRow {
  tag: string
  category: string
  description: string | null
  is_auto: boolean
  created_at: string
  updated_at: string
}

function toDefinition(row: CrmTagDefinitionRow): CrmTagDefinition {
  const category = (TAG_CATEGORIES as readonly string[]).includes(row.category)
    ? (row.category as TagCategory)
    : "manual"
  return {
    tag: row.tag,
    category,
    description: row.description,
    isAuto: row.is_auto,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface CrmTagRule {
  id: string
  tag: string
  ruleType: AutoTagRuleType
  params: AutoTagRuleParams
  targetTypes: string[]
  enabled: boolean
  lastRunAt: string | null
  lastApplied: number | null
  lastRemoved: number | null
  createdAt: string
  updatedAt: string
}

interface CrmTagRuleRow {
  id: string
  tag: string
  rule_type: string
  params: Record<string, unknown> | null
  target_types: string[] | null
  enabled: boolean
  last_run_at: string | null
  last_applied: number | null
  last_removed: number | null
  created_at: string
  updated_at: string
}

function toRule(row: CrmTagRuleRow): CrmTagRule {
  return {
    id: row.id,
    tag: row.tag,
    ruleType: isAutoTagRuleType(row.rule_type) ? row.rule_type : "health_risk",
    params: (row.params ?? {}) as AutoTagRuleParams,
    targetTypes: row.target_types ?? ["neo_account"],
    enabled: row.enabled,
    lastRunAt: row.last_run_at,
    lastApplied: row.last_applied,
    lastRemoved: row.last_removed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listTagDefinitions(): Promise<CrmTagDefinition[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(DEFINITIONS_TABLE).select("*").order("tag", { ascending: true })
  if (error) throw new Error(`[crm-tag-rules] 태그 정의 조회 실패: ${error.message ?? "unknown"}`)
  return ((data ?? []) as CrmTagDefinitionRow[]).map(toDefinition)
}

export async function upsertTagDefinition(tagRaw: string, category: TagCategory): Promise<CrmTagDefinition> {
  const tag = normalizeTag(tagRaw)
  if (!tag) throw new Error("태그가 필요합니다.")
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(DEFINITIONS_TABLE)
    .upsert({ tag, category }, { onConflict: "tag" })
    .select("*")
    .maybeSingle()
  if (error) throw new Error(`[crm-tag-rules] 태그 범주 저장 실패: ${error.message ?? "unknown"}`)
  if (!data) throw new Error("태그 정의 저장 결과를 확인할 수 없습니다.")
  return toDefinition(data as CrmTagDefinitionRow)
}

export async function listTagRules(): Promise<CrmTagRule[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(RULES_TABLE).select("*").order("created_at", { ascending: true })
  if (error) throw new Error(`[crm-tag-rules] 규칙 조회 실패: ${error.message ?? "unknown"}`)
  return ((data ?? []) as CrmTagRuleRow[]).map(toRule)
}

export async function setTagRuleEnabled(ruleId: string, enabled: boolean): Promise<CrmTagRule> {
  if (!ruleId) throw new Error("규칙 id가 필요합니다.")
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(RULES_TABLE)
    .update({ enabled })
    .eq("id", ruleId)
    .select("*")
    .maybeSingle()
  if (error) throw new Error(`[crm-tag-rules] 규칙 상태 변경 실패: ${error.message ?? "unknown"}`)
  if (!data) throw new Error("규칙을 찾을 수 없습니다.")
  return toRule(data as CrmTagRuleRow)
}

/**
 * 태그 이름 변경·병합 시(app/api/admin/crm/tags/route.ts) 정의 테이블의 tag도 함께 바꾼다.
 * `to` 정의가 이미 있으면 그 category·is_auto를 유지하고 `from` 정의 행만 정리(삭제)한다.
 * `to` 정의가 없으면 `from` 정의 중 하나(자동 태그 우선, 없으면 첫 번째)를 `to`로 승격한다.
 * 어느 `from`에도 정의가 없었으면 아무것도 하지 않는다(정의 없는 수기 태그의 정상 상태).
 */
export async function syncTagDefinitionsOnRename(fromListRaw: readonly string[], toRaw: string): Promise<void> {
  const to = normalizeTag(toRaw)
  const uniqueFrom = Array.from(new Set(fromListRaw.map(normalizeTag).filter((tag) => tag && tag !== to)))
  if (!to || uniqueFrom.length === 0) return

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(DEFINITIONS_TABLE)
    .select("*")
    .in("tag", [...uniqueFrom, to])
  if (error) throw new Error(`[crm-tag-rules] 태그 정의 동기화 조회 실패: ${error.message ?? "unknown"}`)

  const rows = (data ?? []) as CrmTagDefinitionRow[]
  const toRow = rows.find((row) => row.tag === to)
  const fromRows = rows.filter((row) => uniqueFrom.includes(row.tag))
  if (fromRows.length === 0) return

  const winner = toRow ?? fromRows.find((row) => row.is_auto) ?? fromRows[0]
  const { error: upsertError } = await supabase.from(DEFINITIONS_TABLE).upsert(
    { tag: to, category: winner.category, description: winner.description, is_auto: winner.is_auto },
    { onConflict: "tag" }
  )
  if (upsertError) throw new Error(`[crm-tag-rules] 태그 정의 반영 실패: ${upsertError.message ?? "unknown"}`)

  const { error: deleteError } = await supabase.from(DEFINITIONS_TABLE).delete().in("tag", uniqueFrom)
  if (deleteError) throw new Error(`[crm-tag-rules] 태그 정의 정리 실패: ${deleteError.message ?? "unknown"}`)
}

// ── 자동 태그 적용(cron + 관리 패널 미리보기 공용) ──────────────────────────

const UNIFIED_ROWS_PAGE_SIZE = 2_000

async function loadAllUnifiedRows(nowMs: number): Promise<CrmUnifiedCustomerRow[]> {
  const rows: CrmUnifiedCustomerRow[] = []
  let offset = 0
  for (;;) {
    const page = await getCrmUnifiedCustomers({
      limit: UNIFIED_ROWS_PAGE_SIZE,
      offset,
      now: new Date(nowMs),
      // 첫 페이지만 스냅샷 캐시를 우회해 신선한 조건 판정을 보장한다(이후 페이지는 그 재수집이
      // 남긴 캐시를 읽는다 — 페이지마다 강제 재수집하면 대량 페이지에서 불필요하게 비싸진다).
      bypassCache: offset === 0,
    })
    rows.push(...page.rows)
    if (!page.pagination.hasMore || page.pagination.nextOffset == null) break
    offset = page.pagination.nextOffset
  }
  return rows
}

function isTagTargetSource(source: CrmUnifiedCustomerRow["source"]): source is "lead" | "neo_account" | "customer" {
  return source === "lead" || source === "neo_account" || source === "customer"
}

function splitTargetKey(key: string): { targetType: string; targetId: string } {
  const sep = key.indexOf(":")
  if (sep < 0) return { targetType: key, targetId: "" }
  return { targetType: key.slice(0, sep), targetId: key.slice(sep + 1) }
}

interface ExistingTagRow {
  target_type: string
  target_id: string
  tag: string
  source: string
}

export interface AutoTagRuleApplyResult {
  ruleId: string
  tag: string
  ruleType: AutoTagRuleType
  /** 이번 실행에서 규칙 조건을 충족한 대상 수(태그 부여 상태와 무관). */
  matched: number
  /** 이번 실행에서 새로 자동 태그를 부여한 수(이미 auto로 있던 대상은 포함하지 않는다). */
  applied: number
  /** 이번 실행에서 조건을 벗어나 삭제한 자동 태그 수(manual 태그는 절대 삭제하지 않는다). */
  removed: number
  /** 조건은 충족하지만 이미 사람이(manual) 붙여 손대지 않은 수. */
  skippedManual: number
}

export interface AutoTagRulesReport {
  generatedAt: string
  dryRun: boolean
  results: AutoTagRuleApplyResult[]
}

export interface ApplyAutoTagRulesOptions {
  nowMs?: number
  dryRun?: boolean
}

async function loadExistingTagRows(
  supabase: SupabaseAdminClient,
  tags: readonly string[]
): Promise<Map<string, Map<string, ExistingTagRow>>> {
  const byTag = new Map<string, Map<string, ExistingTagRow>>()
  if (tags.length === 0) return byTag
  const { data, error } = await supabase
    .from(TAGS_TABLE)
    .select("target_type, target_id, tag, source")
    .in("tag", tags as string[])
  if (error) throw new Error(`[crm-tag-rules] 기존 태그 조회 실패: ${error.message ?? "unknown"}`)
  for (const row of (data ?? []) as ExistingTagRow[]) {
    let byKey = byTag.get(row.tag)
    if (!byKey) {
      byKey = new Map()
      byTag.set(row.tag, byKey)
    }
    byKey.set(`${row.target_type}:${row.target_id}`, row)
  }
  return byTag
}

/**
 * 규칙별 대상 집합을 계산해 조건 충족 대상에 자동 태그를 upsert하고(이미 manual로 있으면
 * 건드리지 않는다), 조건에서 벗어난 대상의 auto 태그만 삭제한다. dryRun이면 아무것도 쓰지
 * 않고 결과 건수만 계산한다(cron 실행 없이 관리 패널 "지금 미리보기"가 쓰는 경로와 동일).
 */
export async function applyAutoTagRules(options: ApplyAutoTagRulesOptions = {}): Promise<AutoTagRulesReport> {
  const nowMs = options.nowMs ?? Date.now()
  const dryRun = options.dryRun === true
  const supabase = createSupabaseAdminClient()

  const rules = (await listTagRules()).filter((rule) => rule.enabled)
  if (rules.length === 0) {
    return { generatedAt: new Date(nowMs).toISOString(), dryRun, results: [] }
  }

  const allRows = await loadAllUnifiedRows(nowMs)
  const existingByTag = await loadExistingTagRows(
    supabase,
    rules.map((rule) => rule.tag)
  )

  const results: AutoTagRuleApplyResult[] = []

  for (const rule of rules) {
    const matcher = buildAutoTagMatcher(rule.ruleType, rule.params, nowMs)
    const targetTypes = new Set(rule.targetTypes)
    const matchedKeys = new Set<string>()

    for (const row of allRows) {
      if (!isTagTargetSource(row.source)) continue
      if (!targetTypes.has(row.source)) continue
      const targetRow: AutoTagTargetRow = {
        key: row.key,
        score: row.score,
        lifecycle: row.lifecycle,
        balance: row.balance,
        expireAt: row.expireAt,
        lastContactAt: row.lastContactAt ?? null,
      }
      if (matcher(targetRow)) matchedKeys.add(row.key)
    }

    const existingByKey = existingByTag.get(rule.tag) ?? new Map<string, ExistingTagRow>()

    const toInsert: { target_type: string; target_id: string; tag: string; source: "auto" }[] = []
    const toDelete: { target_type: string; target_id: string }[] = []
    let applied = 0
    let removed = 0
    let skippedManual = 0

    for (const key of matchedKeys) {
      const existing = existingByKey.get(key)
      if (!existing) {
        const { targetType, targetId } = splitTargetKey(key)
        toInsert.push({ target_type: targetType, target_id: targetId, tag: rule.tag, source: "auto" })
        applied += 1
      } else if (existing.source === "manual") {
        skippedManual += 1
      }
      // else: 이미 auto로 있음 — 변화 없음(신규 적용분만 applied에 센다).
    }

    for (const [key, existing] of existingByKey) {
      if (existing.source !== "auto") continue
      if (matchedKeys.has(key)) continue
      const { targetType, targetId } = splitTargetKey(key)
      toDelete.push({ target_type: targetType, target_id: targetId })
      removed += 1
    }

    if (!dryRun) {
      if (toInsert.length > 0) {
        const { error } = await supabase
          .from(TAGS_TABLE)
          .upsert(toInsert, { onConflict: "target_type,target_id,tag", ignoreDuplicates: true })
        if (error) throw new Error(`[crm-tag-rules] 자동 태그 적용 실패(${rule.tag}): ${error.message ?? "unknown"}`)
      }
      for (const target of toDelete) {
        const { error } = await supabase
          .from(TAGS_TABLE)
          .delete()
          .eq("target_type", target.target_type)
          .eq("target_id", target.target_id)
          .eq("tag", rule.tag)
          .eq("source", "auto")
        if (error) throw new Error(`[crm-tag-rules] 자동 태그 제거 실패(${rule.tag}): ${error.message ?? "unknown"}`)
      }
      const { error: updateError } = await supabase
        .from(RULES_TABLE)
        .update({
          last_run_at: new Date(nowMs).toISOString(),
          last_applied: applied,
          last_removed: removed,
        })
        .eq("id", rule.id)
      if (updateError) {
        throw new Error(`[crm-tag-rules] 규칙 상태 갱신 실패(${rule.tag}): ${updateError.message ?? "unknown"}`)
      }
    }

    results.push({
      ruleId: rule.id,
      tag: rule.tag,
      ruleType: rule.ruleType,
      matched: matchedKeys.size,
      applied,
      removed,
      skippedManual,
    })
  }

  return { generatedAt: new Date(nowMs).toISOString(), dryRun, results }
}
