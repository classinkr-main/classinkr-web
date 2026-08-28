import "server-only"

import {
  getBranchRevSourceRecordKey,
  isInactiveSheetStatus,
  isPlaceholderCrmName,
  isUnsafeCrmTargetLabel,
  normalizeCrmName,
  normalizeCrmOwnerName,
  scoreCrmEntityMatch,
  type CrmMatchAliasInput,
} from "@/lib/crm-source-linking"
import {
  EXTERNAL_CRM_KOREA_ONLY,
  getKoreaTeamManagerSet,
  isKoreaScopedOwner,
  isKoreaTeamLabel,
} from "@/lib/admin-crm-scope"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages } from "@/lib/supabase/pagination"
import {
  classifyCrmSourceLinkReviewValidation,
  classifyCrmSourceLinkValidation,
  getCrmSourceLinkIdentity,
  getCrmAliasEvidence,
  LEGACY_ALIAS_VALIDATION_MESSAGE,
  needsCrmAliasCatalogValidation,
  RETIRED_SIBLING_VALIDATION_MESSAGE,
  UNSAFE_MATCHING_EVIDENCE_MESSAGE,
  type CrmMatchAliasValidationRow,
  type CrmSourceLinkValidationInput,
} from "@/lib/crm/source-link-validation"
import { getExcludedXiaoshouyiOwnerIds } from "@/lib/external-crm/owner-names"

interface BranchRevCandidateSource {
  sheet_row: number
  customer_name: string
  team: string | null
  manager: string | null
  status: string | null
  first_payment: string | null
  contract_target: number | null
}

interface LeadCandidateSource {
  id: string
  name: string | null
  org: string | null
  phone: string | null
  email: string | null
  status: string
  assigned_to: string | null
  created_at: string
}

interface CustomerCandidateTarget {
  id: string
  partner_account_id?: string
  name: string
  campus_name: string | null
  contact_name?: string | null
}

interface PartnerAccountCandidateTarget {
  id: string
  name: string
  status: string | null
  owner_name?: string | null
}

interface DealCandidateTarget {
  id: string
  customer_id?: string
  partner_account_id?: string
  title: string
  deal_code: string
  customer_name?: string | null
  owner_name?: string | null
}

interface ExistingSourceLink {
  source_object: string
  source_record_key: string
  target_type: string
  target_id: string
  status: string
  normalized_name?: string | null
  metadata?: Record<string, unknown> | null
}

interface ExternalCrmRecordSource {
  object_api_key: string
  external_id: string
  normalized_name: string | null
  display_name: string | null
  owner_name: string | null
  status: string | null
  amount: number | null
  occurred_at: string | null
  synced_at: string
  is_stale?: boolean | null
}

interface CrmMatchAliasRow {
  alias: string
  canonical_name: string | null
  target_type: string | null
  target_id: string | null
  manager_name: string | null
  confidence_boost: number | null
}

type CrmMatchAliasSourceSystem = CandidateInsert["source_system"]

interface ConfirmedSourceLinkAliasSeed {
  id: string
  source_system: string
  source_object: string
  source_record_key: string
  normalized_name: string | null
  target_type: string
  target_id: string
  metadata: Record<string, unknown> | null
}

interface CandidateInsert {
  source_system: "branch_rev_sheet" | "lead" | "xiaoshouyi"
  source_object: string
  source_record_key: string
  normalized_name: string
  target_type: "partner_account" | "customer" | "deal"
  target_id: string
  confidence: number
  status: "candidate"
  metadata: Record<string, unknown>
}

export interface GenerateBranchRevLinkCandidatesResult {
  scannedSheetDeals: number
  generatedCandidates: number
  insertedCandidates: number
  skippedExisting: number
  autoConfirmed: number
}

export interface GenerateExternalCrmLinkCandidatesResult {
  scannedExternalRecords: number
  generatedCandidates: number
  insertedCandidates: number
  skippedExisting: number
  autoConfirmed: number
}

export interface GenerateLeadLinkCandidatesResult {
  scannedLeads: number
  generatedCandidates: number
  insertedCandidates: number
  skippedExisting: number
  autoConfirmed: number
}

export interface GenerateAllCrmLinkCandidatesResult {
  branchRev: GenerateBranchRevLinkCandidatesResult
  leads: GenerateLeadLinkCandidatesResult
  xiaoshouyi: GenerateExternalCrmLinkCandidatesResult
}

export type PreviewBranchRevLinkCandidatesResult = Omit<
  GenerateBranchRevLinkCandidatesResult,
  "insertedCandidates" | "autoConfirmed"
> & {
  wouldInsertCandidates: number
  wouldAutoConfirm: number
}

export type PreviewExternalCrmLinkCandidatesResult = Omit<
  GenerateExternalCrmLinkCandidatesResult,
  "insertedCandidates" | "autoConfirmed"
> & {
  wouldInsertCandidates: number
  wouldAutoConfirm: number
}

export type PreviewLeadLinkCandidatesResult = Omit<
  GenerateLeadLinkCandidatesResult,
  "insertedCandidates" | "autoConfirmed"
> & {
  wouldInsertCandidates: number
  wouldAutoConfirm: number
}

export interface PreviewAllCrmLinkCandidatesResult {
  branchRev: PreviewBranchRevLinkCandidatesResult
  leads: PreviewLeadLinkCandidatesResult
  xiaoshouyi: PreviewExternalCrmLinkCandidatesResult
}

export type CrmSourceLinkAction = "confirm" | "reject" | "stale"

export class CrmSourceLinkConflictError extends Error {}
export type CrmManualLinkTargetType = "partner_account" | "customer" | "deal"

export interface CrmManualLinkTargetOption {
  targetType: CrmManualLinkTargetType
  targetId: string
  label: string
  confidence: number
  evidence: string[]
}

interface AutoConfirmPolicy {
  enabled: boolean
  minConfidence: number
  minGap: number
}

interface ScoredLinkTarget {
  targetType: "partner_account" | "customer" | "deal"
  targetId: string
  targetLabel: string
  confidence: number
  evidence: string[]
  strategy: string
}

interface AutoConfirmDecision {
  source_object: string
  source_record_key: string
  target_type: "partner_account" | "customer" | "deal"
  target_id: string
  confidence: number
  evidence: string[]
}

const MIN_CONFIDENCE = 0.72
const MIN_EVIDENCE_REVIEW_CONFIDENCE = 0.45
const MAX_CANDIDATES_PER_SOURCE = 5
const MAX_MANUAL_SEARCH_RESULTS = 8
const EXTERNAL_CRM_RECORD_SELECT =
  "object_api_key, external_id, normalized_name, display_name, owner_name, status, amount, occurred_at, synced_at, is_stale"
const EXTERNAL_CRM_LINK_RECORDS_PER_OBJECT = 500
const EXTERNAL_CRM_LINK_CANDIDATE_OBJECTS = [
  "account",
  "contact",
  "opportunity",
  "ShroffAccount__c",
  "Collection__c",
  "SalesPerformance__c",
  "FinancialInformation__c",
]

function buildCandidateKey(candidate: {
  source_object?: string
  source_record_key: string
  target_type: string
  target_id: string
}) {
  return `${candidate.source_object ?? ""}:${candidate.source_record_key}:${candidate.target_type}:${candidate.target_id}`
}

const EMPTY_PAIR_SET: ReadonlySet<string> = new Set<string>()

function buildRejectedPairsBySource(links: ExistingSourceLink[]) {
  const rejected = new Map<string, Set<string>>()
  for (const link of links) {
    if (link.status !== "rejected") continue
    const key = `${link.source_object}:${link.source_record_key}`
    const pairs = rejected.get(key) ?? new Set<string>()
    pairs.add(`${link.target_type}:${link.target_id}`)
    rejected.set(key, pairs)
  }
  return rejected
}

function shouldKeepScoredMatch(match: { confidence: number; evidence?: string[] }) {
  if (match.confidence >= MIN_CONFIDENCE) return true
  const hasStrongSecondaryEvidence = (match.evidence ?? []).some((item) =>
    item.startsWith("owner:") || item.startsWith("alias:")
  )
  return hasStrongSecondaryEvidence && match.confidence >= MIN_EVIDENCE_REVIEW_CONFIDENCE
}

function buildSourceTargetLabel(target: CustomerCandidateTarget | PartnerAccountCandidateTarget | DealCandidateTarget) {
  if ("deal_code" in target) return `${target.deal_code} · ${target.title}`
  if ("campus_name" in target) return [target.name, target.campus_name].filter(Boolean).join(" · ")
  return target.name
}

function getTargetOwnerName(target: CustomerCandidateTarget | PartnerAccountCandidateTarget | DealCandidateTarget) {
  if ("owner_name" in target && typeof target.owner_name === "string") return target.owner_name
  if ("contact_name" in target && typeof target.contact_name === "string") return target.contact_name
  return null
}

function getMetadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function isAliasTargetType(value: string): value is "partner_account" | "customer" | "deal" | "lead" {
  return value === "partner_account" || value === "customer" || value === "deal" || value === "lead"
}

async function tryLearnAliasFromConfirmedLink(link: ConfirmedSourceLinkAliasSeed, actorUserId?: string | null) {
  if (!isAliasTargetType(link.target_type)) return

  const alias =
    getMetadataString(link.metadata, "source_label") ??
    getMetadataString(link.metadata, "source_customer_name") ??
    getMetadataString(link.metadata, "lead_org") ??
    getMetadataString(link.metadata, "lead_name") ??
    link.normalized_name
  const normalizedAlias = normalizeCrmName(alias)
  if (!alias || normalizedAlias.length < 2) return

  const canonicalName = getMetadataString(link.metadata, "target_label")
  const managerName =
    getMetadataString(link.metadata, "source_owner") ??
    getMetadataString(link.metadata, "owner_name") ??
    getMetadataString(link.metadata, "assigned_to")
  const normalizedManagerName = normalizeCrmOwnerName(managerName)
  const sb = createSupabaseAdminClient()

  let existingQuery = sb
    .from("crm_match_aliases")
    .select("id")
    .eq("normalized_alias", normalizedAlias)
    .eq("target_type", link.target_type)
    .eq("target_id", link.target_id)
    .eq("source_system", link.source_system)
    .eq("status", "active")
    .limit(1)
  existingQuery = normalizedManagerName
    ? existingQuery.eq("normalized_manager_name", normalizedManagerName)
    : existingQuery.is("normalized_manager_name", null)
  const { data: existing, error: readError } = await existingQuery

  if (readError) return

  const row = {
    alias,
    normalized_alias: normalizedAlias,
    canonical_name: canonicalName,
    normalized_canonical_name: normalizeCrmName(canonicalName),
    target_type: link.target_type,
    target_id: link.target_id,
    source_system: link.source_system,
    source_record_key: link.source_record_key,
    manager_name: managerName,
    normalized_manager_name: normalizedManagerName || null,
    confidence_boost: 0.12,
    status: "active",
    metadata: {
      source_object: link.source_object,
      source_link_id: link.id,
      learned_from: "confirmed_source_link",
    },
    created_by: actorUserId ?? null,
  }

  if (existing?.[0]?.id) {
    await sb
      .from("crm_match_aliases")
      .update({
        canonical_name: row.canonical_name,
        normalized_canonical_name: row.normalized_canonical_name,
        manager_name: row.manager_name,
        normalized_manager_name: row.normalized_manager_name,
        confidence_boost: row.confidence_boost,
        metadata: row.metadata,
      })
      .eq("id", existing[0].id)
    return
  }

  await sb.from("crm_match_aliases").insert(row)
}

function getLeadSourceLabel(lead: LeadCandidateSource) {
  return lead.org?.trim() || lead.name?.trim() || lead.email?.trim() || lead.phone?.trim() || lead.id
}

function getExternalCrmRecordLabel(record: ExternalCrmRecordSource) {
  return record.display_name ?? record.normalized_name ?? record.external_id
}

async function getCrmMatchAliases(sourceSystem: CrmMatchAliasSourceSystem): Promise<CrmMatchAliasInput[]> {
  const sb = createSupabaseAdminClient()
  const [aliasResult, confirmedLeadLinksResult] = await Promise.all([
    sb
      .from("crm_match_aliases")
      .select("alias, canonical_name, target_type, target_id, manager_name, confidence_boost")
      .eq("source_system", sourceSystem)
      .eq("status", "active")
      .limit(5000),
    sourceSystem === "lead"
      ? sb
          .from("crm_source_links")
          .select("normalized_name, target_type, target_id, metadata")
          .eq("source_system", "lead")
          .eq("source_object", "leads")
          .eq("status", "confirmed")
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ])

  const aliases: CrmMatchAliasInput[] = []

  if (!aliasResult.error) {
    for (const row of (aliasResult.data ?? []) as CrmMatchAliasRow[]) {
      aliases.push({
        alias: row.alias,
        canonicalName: row.canonical_name,
        targetType: row.target_type,
        targetId: row.target_id,
        managerName: row.manager_name,
        confidenceBoost: row.confidence_boost,
      })
    }
  }

  if (!confirmedLeadLinksResult.error) {
    for (const link of (confirmedLeadLinksResult.data ?? []) as ExistingSourceLink[]) {
      const alias =
        getMetadataString(link.metadata, "source_label") ??
        getMetadataString(link.metadata, "lead_org") ??
        link.normalized_name
      if (!alias) continue
      aliases.push({
        alias,
        canonicalName: getMetadataString(link.metadata, "target_label"),
        targetType: link.target_type,
        targetId: link.target_id,
        managerName: getMetadataString(link.metadata, "source_owner") ?? getMetadataString(link.metadata, "assigned_to"),
        confidenceBoost: 0.12,
      })
    }
  }

  return aliases
}

async function getAutoConfirmPolicies(): Promise<Record<string, AutoConfirmPolicy>> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("crm_source_priorities")
    .select("source_system, auto_confirm_enabled, auto_confirm_min_confidence, auto_confirm_min_gap")

  // Policy columns may not exist yet (migration pending) — auto-confirm stays off.
  if (error || !data) return {}

  const policies: Record<string, AutoConfirmPolicy> = {}
  for (const row of data as Array<{
    source_system: string
    auto_confirm_enabled: boolean | null
    auto_confirm_min_confidence: number | null
    auto_confirm_min_gap: number | null
  }>) {
    policies[row.source_system] = {
      enabled: row.auto_confirm_enabled === true,
      minConfidence: Number(row.auto_confirm_min_confidence ?? 0.92),
      minGap: Number(row.auto_confirm_min_gap ?? 0.15),
    }
  }
  return policies
}

// Auto-confirm only the top candidate of the first preferred target type whose
// score clears the policy threshold. Ambiguity within that type (runner-up too
// close) keeps the source in manual review instead of falling through to a
// lower-priority type, because a close runner-up usually means duplicates.
function pickAutoConfirmTarget(
  targets: ScoredLinkTarget[],
  policy: AutoConfirmPolicy | undefined,
  typePreference: Array<"partner_account" | "customer" | "deal">,
  rejectedPairKeys: ReadonlySet<string>
): ScoredLinkTarget | null {
  if (!policy?.enabled) return null

  for (const type of typePreference) {
    const typed = targets.filter((target) => target.targetType === type)
    if (typed.length === 0) continue

    const [top, second] = typed
    if (top.confidence < policy.minConfidence) continue
    if (second && top.confidence - second.confidence < policy.minGap) return null
    if (rejectedPairKeys.has(`${top.targetType}:${top.targetId}`)) return null
    return top
  }

  return null
}

async function applyAutoConfirmDecisions(
  sourceSystem: "branch_rev_sheet" | "lead" | "xiaoshouyi",
  decisions: AutoConfirmDecision[]
): Promise<number> {
  if (decisions.length === 0) return 0

  const sb = createSupabaseAdminClient()
  const now = new Date().toISOString()
  let confirmed = 0

  for (const decision of decisions) {
    const { data: row, error: readError } = await sb
      .from("crm_source_links")
      .select("id, normalized_name, status, metadata")
      .eq("source_system", sourceSystem)
      .eq("source_object", decision.source_object)
      .eq("source_record_key", decision.source_record_key)
      .eq("target_type", decision.target_type)
      .eq("target_id", decision.target_id)
      .maybeSingle()

    if (readError || !row) continue
    if (row.status === "rejected" || row.status === "confirmed") continue

    const { error: staleError } = await sb
      .from("crm_source_links")
      .update({ status: "stale", confirmed_by: null, confirmed_at: null })
      .eq("source_system", sourceSystem)
      .eq("source_object", decision.source_object)
      .eq("source_record_key", decision.source_record_key)
      .neq("id", row.id)
      .in("status", ["candidate", "confirmed"])

    if (staleError) continue

    const metadata = {
      ...((row.metadata as Record<string, unknown> | null) ?? {}),
      auto_confirmed: true,
      auto_confirmed_at: now,
      auto_confirm_evidence: decision.evidence,
    }

    const { error: confirmError } = await sb
      .from("crm_source_links")
      .update({
        status: "confirmed",
        confirmed_by: null,
        confirmed_at: now,
        confidence: Number(decision.confidence.toFixed(4)),
        metadata,
      })
      .eq("id", row.id)

    if (confirmError) continue

    confirmed += 1
    await tryLearnAliasFromConfirmedLink(
      {
        id: row.id as string,
        source_system: sourceSystem,
        source_object: decision.source_object,
        source_record_key: decision.source_record_key,
        normalized_name: (row.normalized_name as string | null) ?? null,
        target_type: decision.target_type,
        target_id: decision.target_id,
        metadata,
      },
      null
    )
  }

  return confirmed
}

function scoreSourceTargetMatch(input: {
  sourceName: string
  sourceOwner?: string | null
  targetType: "partner_account" | "customer" | "deal"
  targetId: string
  targetLabel: string
  targetOwner?: string | null
  aliases: CrmMatchAliasInput[]
}) {
  return scoreCrmEntityMatch({
    sourceName: input.sourceName,
    targetName: input.targetLabel,
    sourceOwner: input.sourceOwner,
    targetOwner: input.targetOwner,
    targetType: input.targetType,
    targetId: input.targetId,
    aliases: input.aliases,
  })
}

function getExternalCrmTargetTypes(objectApiKey: string): Array<"partner_account" | "customer" | "deal"> {
  const normalized = objectApiKey.toLowerCase()

  if (normalized.includes("account")) return ["partner_account", "customer"]
  if (normalized.includes("contact") || normalized === "lead") return ["customer"]
  if (
    normalized.includes("opportun") ||
    normalized.includes("quote") ||
    normalized.includes("order") ||
    normalized.includes("collection") ||
    normalized.includes("performance") ||
    normalized.includes("financial")
  ) {
    return ["deal", "customer"]
  }

  return ["customer", "deal"]
}

async function findBranchRevSourceByKey(sourceRecordKey: string) {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("branch_rev_deals")
    .select("sheet_row, customer_name, team, manager, status, first_payment, contract_target")
    .limit(1000)

  if (error) throw error

  return ((data ?? []) as BranchRevCandidateSource[]).find(
    (deal) => getBranchRevSourceRecordKey(deal) === sourceRecordKey
  ) ?? null
}

async function runBranchRevLinkCandidateGeneration(
  dryRun: boolean
): Promise<GenerateBranchRevLinkCandidatesResult> {
  const sb = createSupabaseAdminClient()

  const [sheetResult, partnerAccountsResult, customersResult, dealsResult, linksResult, aliases, autoConfirmPolicies] = await Promise.all([
    sb
      .from("branch_rev_deals")
      .select("sheet_row, customer_name, team, manager, status, first_payment, contract_target")
      .limit(1000),
    sb
      .from("partner_accounts")
      .select("id, name, status, owner_name")
      .limit(2000),
    sb
      .from("customers")
      .select("id, partner_account_id, name, campus_name, contact_name")
      .limit(2000),
    sb
      .from("deals")
      .select("id, title, deal_code, customer_id, partner_account_id")
      .limit(2000),
    sb
      .from("crm_source_links")
      .select("source_object, source_record_key, target_type, target_id, status")
      .eq("source_system", "branch_rev_sheet")
      .eq("source_object", "branch_rev_deals")
      .limit(5000),
    getCrmMatchAliases("branch_rev_sheet"),
    getAutoConfirmPolicies(),
  ])

  if (sheetResult.error) throw sheetResult.error
  if (partnerAccountsResult.error) throw partnerAccountsResult.error
  if (customersResult.error) throw customersResult.error
  if (dealsResult.error) throw dealsResult.error
  if (linksResult.error) throw linksResult.error

  const sheetDeals = ((sheetResult.data ?? []) as BranchRevCandidateSource[]).filter(
    (deal) =>
      !isInactiveSheetStatus(deal.status) &&
      // HW/SW/MKT 접두 임시 고객은 후순위 — 후보 생성/자동 확정 대상에서 제외
      !isPlaceholderCrmName(deal.customer_name)
  )
  const partnerAccounts = (partnerAccountsResult.data ?? []) as PartnerAccountCandidateTarget[]
  const customers = (customersResult.data ?? []) as CustomerCandidateTarget[]
  const deals = (dealsResult.data ?? []) as DealCandidateTarget[]
  const existingLinks = (linksResult.data ?? []) as ExistingSourceLink[]
  const existingCandidateKeys = new Set(existingLinks.map(buildCandidateKey))
  const existingConfirmedSources = new Set(
    existingLinks
      .filter((link) => link.status === "confirmed")
      .map((link) => link.source_record_key)
  )
  const rejectedPairsBySource = buildRejectedPairsBySource(existingLinks)
  const autoConfirmPolicy = autoConfirmPolicies["branch_rev_sheet"]
  const autoConfirmDecisions: AutoConfirmDecision[] = []

  const candidates: CandidateInsert[] = []

  for (const source of sheetDeals) {
    const sourceRecordKey = getBranchRevSourceRecordKey(source)
    if (existingConfirmedSources.has(sourceRecordKey)) continue

    const sourceOwner = source.manager ?? source.team
    const rankedTargets: ScoredLinkTarget[] = [
      ...partnerAccounts.map((account) => {
        const targetLabel = buildSourceTargetLabel(account)
        const match = scoreSourceTargetMatch({
          sourceName: source.customer_name,
          sourceOwner,
          targetType: "partner_account",
          targetId: account.id,
          targetLabel,
          targetOwner: account.owner_name,
          aliases,
        })
        return {
          targetType: "partner_account" as const,
          targetId: account.id,
          targetLabel,
          confidence: match.score,
          evidence: match.evidence,
          strategy: match.strategy,
        }
      }),
      ...customers.map((customer) => ({
        targetType: "customer" as const,
        targetId: customer.id,
        targetLabel: buildSourceTargetLabel(customer),
        ...(() => {
          const targetLabel = buildSourceTargetLabel(customer)
          const match = scoreSourceTargetMatch({
            sourceName: source.customer_name,
            sourceOwner,
            targetType: "customer",
            targetId: customer.id,
            targetLabel,
            targetOwner: customer.contact_name,
            aliases,
          })
          return {
            confidence: match.score,
            evidence: match.evidence,
            strategy: match.strategy,
          }
        })(),
      })),
      ...deals.map((deal) => {
        const targetLabel = buildSourceTargetLabel(deal)
        const match = scoreSourceTargetMatch({
          sourceName: source.customer_name,
          sourceOwner,
          targetType: "deal",
          targetId: deal.id,
          targetLabel,
          targetOwner: deal.owner_name,
          aliases,
        })
        return {
          targetType: "deal" as const,
          targetId: deal.id,
          targetLabel,
          confidence: match.score,
          evidence: match.evidence,
          strategy: match.strategy,
        }
      }),
    ]
      .filter((target) => !isUnsafeCrmTargetLabel(target.targetLabel))
      .filter(shouldKeepScoredMatch)
      .sort((a, b) => b.confidence - a.confidence)

    const scoredTargets = rankedTargets.slice(0, MAX_CANDIDATES_PER_SOURCE)
    const autoTarget = pickAutoConfirmTarget(
      rankedTargets,
      autoConfirmPolicy,
      ["customer", "partner_account"],
      rejectedPairsBySource.get(`branch_rev_deals:${sourceRecordKey}`) ?? EMPTY_PAIR_SET
    )
    if (autoTarget) {
      autoConfirmDecisions.push({
        source_object: "branch_rev_deals",
        source_record_key: sourceRecordKey,
        target_type: autoTarget.targetType,
        target_id: autoTarget.targetId,
        confidence: autoTarget.confidence,
        evidence: autoTarget.evidence,
      })
    }

    for (const target of scoredTargets) {
      candidates.push({
        source_system: "branch_rev_sheet",
        source_object: "branch_rev_deals",
        source_record_key: sourceRecordKey,
        normalized_name: normalizeCrmName(source.customer_name),
        target_type: target.targetType,
        target_id: target.targetId,
        confidence: Number(target.confidence.toFixed(4)),
        status: "candidate",
        metadata: {
          sheet_row: source.sheet_row,
          source_customer_name: source.customer_name,
          source_owner: [source.team, source.manager].filter(Boolean).join(" · ") || null,
          source_status: source.status,
          target_label: target.targetLabel,
          match_evidence: target.evidence,
          match_strategy: target.strategy,
          source_priority: "branch_rev_sheet_supporting",
        },
      })
    }
  }

  const rowsToInsert = candidates.filter((candidate) => !existingCandidateKeys.has(buildCandidateKey(candidate)))

  if (!dryRun && rowsToInsert.length > 0) {
    const { error } = await sb.from("crm_source_links").insert(rowsToInsert)
    if (error) throw error
  }

  const autoConfirmed = dryRun
    ? autoConfirmDecisions.length
    : await applyAutoConfirmDecisions("branch_rev_sheet", autoConfirmDecisions)

  return {
    scannedSheetDeals: sheetDeals.length,
    generatedCandidates: candidates.length,
    insertedCandidates: rowsToInsert.length,
    skippedExisting: candidates.length - rowsToInsert.length,
    autoConfirmed,
  }
}

export async function generateBranchRevLinkCandidates(): Promise<GenerateBranchRevLinkCandidatesResult> {
  return runBranchRevLinkCandidateGeneration(false)
}

export async function previewBranchRevLinkCandidates(): Promise<PreviewBranchRevLinkCandidatesResult> {
  const result = await runBranchRevLinkCandidateGeneration(true)
  const { insertedCandidates, autoConfirmed, ...summary } = result
  return {
    ...summary,
    wouldInsertCandidates: insertedCandidates,
    wouldAutoConfirm: autoConfirmed,
  }
}

async function runExternalCrmLinkCandidateGeneration(
  dryRun: boolean
): Promise<GenerateExternalCrmLinkCandidatesResult> {
  const sb = createSupabaseAdminClient()
  const recordsPromise = Promise.all(
    EXTERNAL_CRM_LINK_CANDIDATE_OBJECTS.map((objectApiKey) =>
      sb
        .from("external_crm_records")
        .select(EXTERNAL_CRM_RECORD_SELECT)
        .eq("source_system", "xiaoshouyi")
        .eq("object_api_key", objectApiKey)
        .eq("is_stale", false)
        .order("synced_at", { ascending: false })
        .limit(EXTERNAL_CRM_LINK_RECORDS_PER_OBJECT)
    )
  ).then((results) => {
    const failed = results.find((result) => result.error)
    if (failed?.error) throw failed.error
    return results.flatMap((result) => (result.data ?? []) as ExternalCrmRecordSource[])
  })

  const [records, partnerAccountsResult, customersResult, dealsResult, linksResult, aliases, autoConfirmPolicies, excludedOwnerIds] = await Promise.all([
    recordsPromise,
    sb
      .from("partner_accounts")
      .select("id, name, status, owner_name")
      .limit(2000),
    sb
      .from("customers")
      .select("id, partner_account_id, name, campus_name, contact_name")
      .limit(2000),
    sb
      .from("deals")
      .select("id, customer_id, partner_account_id, title, deal_code")
      .limit(2000),
    sb
      .from("crm_source_links")
      .select("source_object, source_record_key, target_type, target_id, status")
      .eq("source_system", "xiaoshouyi")
      .limit(5000),
    getCrmMatchAliases("xiaoshouyi"),
    getAutoConfirmPolicies(),
    getExcludedXiaoshouyiOwnerIds(sb),
  ])

  if (partnerAccountsResult.error) throw partnerAccountsResult.error
  if (customersResult.error) throw customersResult.error
  if (dealsResult.error) throw dealsResult.error
  if (linksResult.error) throw linksResult.error

  const activeRecords = records.filter(
    (record) => !record.is_stale && !excludedOwnerIds.has(record.owner_name?.trim() ?? "")
  )
  const partnerAccounts = (partnerAccountsResult.data ?? []) as PartnerAccountCandidateTarget[]
  const customers = (customersResult.data ?? []) as CustomerCandidateTarget[]
  const deals = (dealsResult.data ?? []) as DealCandidateTarget[]
  const existingLinks = (linksResult.data ?? []) as ExistingSourceLink[]
  const existingCandidateKeys = new Set(existingLinks.map(buildCandidateKey))
  const existingConfirmedSources = new Set(
    existingLinks
      .filter((link) => link.status === "confirmed")
      .map((link) => `${link.source_object}:${link.source_record_key}`)
  )
  const rejectedPairsBySource = buildRejectedPairsBySource(existingLinks)
  const autoConfirmPolicy = autoConfirmPolicies["xiaoshouyi"]
  const autoConfirmDecisions: AutoConfirmDecision[] = []

  const candidates: CandidateInsert[] = []

  for (const record of activeRecords) {
    const sourceLabel = getExternalCrmRecordLabel(record)
    const normalizedSourceLabel = record.normalized_name ?? normalizeCrmName(sourceLabel)
    if (normalizedSourceLabel.length < 2) continue
    if (existingConfirmedSources.has(`${record.object_api_key}:${record.external_id}`)) continue

    const targetTypes = new Set(getExternalCrmTargetTypes(record.object_api_key))
    const rankedTargets: ScoredLinkTarget[] = [
      ...(targetTypes.has("partner_account")
        ? partnerAccounts.map((account) => ({
            targetType: "partner_account" as const,
            targetId: account.id,
            ...(() => {
              const targetLabel = buildSourceTargetLabel(account)
              const match = scoreSourceTargetMatch({
                sourceName: sourceLabel,
                sourceOwner: record.owner_name,
                targetType: "partner_account",
                targetId: account.id,
                targetLabel,
                targetOwner: account.owner_name,
                aliases,
              })
              return {
                targetLabel,
                confidence: match.score,
                evidence: match.evidence,
                strategy: match.strategy,
              }
            })(),
          }))
        : []),
      ...(targetTypes.has("customer")
        ? customers.map((customer) => ({
            targetType: "customer" as const,
            targetId: customer.id,
            ...(() => {
              const targetLabel = buildSourceTargetLabel(customer)
              const match = scoreSourceTargetMatch({
                sourceName: sourceLabel,
                sourceOwner: record.owner_name,
                targetType: "customer",
                targetId: customer.id,
                targetLabel,
                targetOwner: customer.contact_name,
                aliases,
              })
              return {
                targetLabel,
                confidence: match.score,
                evidence: match.evidence,
                strategy: match.strategy,
              }
            })(),
          }))
        : []),
      ...(targetTypes.has("deal")
        ? deals.map((deal) => {
            const targetLabel = buildSourceTargetLabel(deal)
            const match = scoreSourceTargetMatch({
              sourceName: sourceLabel,
              sourceOwner: record.owner_name,
              targetType: "deal",
              targetId: deal.id,
              targetLabel,
              targetOwner: deal.owner_name,
              aliases,
            })
            return {
              targetType: "deal" as const,
              targetId: deal.id,
              targetLabel,
              confidence: match.score,
              evidence: match.evidence,
              strategy: match.strategy,
            }
          })
        : []),
    ]
      .filter((target) => !isUnsafeCrmTargetLabel(target.targetLabel))
      .filter(shouldKeepScoredMatch)
      .sort((a, b) => b.confidence - a.confidence)

    const scoredTargets = rankedTargets.slice(0, MAX_CANDIDATES_PER_SOURCE)
    // Auto-confirm stays conservative: customer/partner targets only — deal
    // links from external record names are too ambiguous to confirm unattended.
    const autoTarget = pickAutoConfirmTarget(
      rankedTargets,
      autoConfirmPolicy,
      ["customer", "partner_account"],
      rejectedPairsBySource.get(`${record.object_api_key}:${record.external_id}`) ?? EMPTY_PAIR_SET
    )
    if (autoTarget) {
      autoConfirmDecisions.push({
        source_object: record.object_api_key,
        source_record_key: record.external_id,
        target_type: autoTarget.targetType,
        target_id: autoTarget.targetId,
        confidence: autoTarget.confidence,
        evidence: autoTarget.evidence,
      })
    }

    for (const target of scoredTargets) {
      candidates.push({
        source_system: "xiaoshouyi",
        source_object: record.object_api_key,
        source_record_key: record.external_id,
        normalized_name: normalizedSourceLabel,
        target_type: target.targetType,
        target_id: target.targetId,
        confidence: Number(target.confidence.toFixed(4)),
        status: "candidate",
        metadata: {
          source_label: sourceLabel,
          external_id: record.external_id,
          object_api_key: record.object_api_key,
          owner_name: record.owner_name,
          source_status: record.status,
          source_amount: record.amount,
          occurred_at: record.occurred_at,
          synced_at: record.synced_at,
          target_label: target.targetLabel,
          match_evidence: target.evidence,
          match_strategy: target.strategy,
          source_priority: "xiaoshouyi_crm_primary",
        },
      })
    }
  }

  const rowsToInsert = candidates.filter((candidate) => !existingCandidateKeys.has(buildCandidateKey(candidate)))

  if (!dryRun && rowsToInsert.length > 0) {
    const { error } = await sb.from("crm_source_links").insert(rowsToInsert)
    if (error) throw error
  }

  const autoConfirmed = dryRun
    ? autoConfirmDecisions.length
    : await applyAutoConfirmDecisions("xiaoshouyi", autoConfirmDecisions)

  return {
    scannedExternalRecords: activeRecords.length,
    generatedCandidates: candidates.length,
    insertedCandidates: rowsToInsert.length,
    skippedExisting: candidates.length - rowsToInsert.length,
    autoConfirmed,
  }
}

export async function generateExternalCrmLinkCandidates(): Promise<GenerateExternalCrmLinkCandidatesResult> {
  return runExternalCrmLinkCandidateGeneration(false)
}

export async function previewExternalCrmLinkCandidates(): Promise<PreviewExternalCrmLinkCandidatesResult> {
  const result = await runExternalCrmLinkCandidateGeneration(true)
  const { insertedCandidates, autoConfirmed, ...summary } = result
  return {
    ...summary,
    wouldInsertCandidates: insertedCandidates,
    wouldAutoConfirm: autoConfirmed,
  }
}

async function runLeadLinkCandidateGeneration(
  dryRun: boolean
): Promise<GenerateLeadLinkCandidatesResult> {
  const sb = createSupabaseAdminClient()

  const [leadsResult, partnerAccountsResult, customersResult, dealsResult, linksResult, aliases, autoConfirmPolicies] = await Promise.all([
    sb
      .from("leads")
      .select("id, name, org, phone, email, status, assigned_to, created_at")
      .neq("status", "closed")
      .limit(2000),
    sb
      .from("partner_accounts")
      .select("id, name, status, owner_name")
      .limit(2000),
    sb
      .from("customers")
      .select("id, partner_account_id, name, campus_name, contact_name")
      .limit(2000),
    sb
      .from("deals")
      .select("id, customer_id, partner_account_id, title, deal_code")
      .limit(2000),
    sb
      .from("crm_source_links")
      .select("source_object, source_record_key, target_type, target_id, status")
      .eq("source_system", "lead")
      .eq("source_object", "leads")
      .limit(5000),
    getCrmMatchAliases("lead"),
    getAutoConfirmPolicies(),
  ])

  if (leadsResult.error) throw leadsResult.error
  if (partnerAccountsResult.error) throw partnerAccountsResult.error
  if (customersResult.error) throw customersResult.error
  if (dealsResult.error) throw dealsResult.error
  if (linksResult.error) throw linksResult.error

  const leads = (leadsResult.data ?? []) as LeadCandidateSource[]
  const partnerAccounts = (partnerAccountsResult.data ?? []) as PartnerAccountCandidateTarget[]
  const customers = (customersResult.data ?? []) as CustomerCandidateTarget[]
  const deals = (dealsResult.data ?? []) as DealCandidateTarget[]
  const existingLinks = (linksResult.data ?? []) as ExistingSourceLink[]
  const existingCandidateKeys = new Set(existingLinks.map(buildCandidateKey))
  const existingConfirmedSources = new Set(
    existingLinks
      .filter((link) => link.status === "confirmed")
      .map((link) => link.source_record_key)
  )

  const rejectedPairsBySource = buildRejectedPairsBySource(existingLinks)
  const autoConfirmPolicy = autoConfirmPolicies["lead"]
  const autoConfirmDecisions: AutoConfirmDecision[] = []

  const candidates: CandidateInsert[] = []

  for (const lead of leads) {
    if (existingConfirmedSources.has(lead.id)) continue
    const sourceLabel = getLeadSourceLabel(lead)
    const normalizedSourceLabel = normalizeCrmName(sourceLabel)
    if (normalizedSourceLabel.length < 2) continue

    const rankedTargets: ScoredLinkTarget[] = [
      ...partnerAccounts.map((account) => {
        const targetLabel = buildSourceTargetLabel(account)
        const match = scoreSourceTargetMatch({
          sourceName: sourceLabel,
          sourceOwner: lead.assigned_to,
          targetType: "partner_account",
          targetId: account.id,
          targetLabel,
          targetOwner: account.owner_name,
          aliases,
        })
        return {
          targetType: "partner_account" as const,
          targetId: account.id,
          targetLabel,
          confidence: match.score,
          evidence: match.evidence,
          strategy: match.strategy,
        }
      }),
      ...customers.map((customer) => {
        const targetLabel = buildSourceTargetLabel(customer)
        const match = scoreSourceTargetMatch({
          sourceName: sourceLabel,
          sourceOwner: lead.assigned_to,
          targetType: "customer",
          targetId: customer.id,
          targetLabel,
          targetOwner: customer.contact_name,
          aliases,
        })
        return {
          targetType: "customer" as const,
          targetId: customer.id,
          targetLabel,
          confidence: match.score,
          evidence: match.evidence,
          strategy: match.strategy,
        }
      }),
      ...deals.map((deal) => {
        const targetLabel = buildSourceTargetLabel(deal)
        const match = scoreSourceTargetMatch({
          sourceName: sourceLabel,
          sourceOwner: lead.assigned_to,
          targetType: "deal",
          targetId: deal.id,
          targetLabel,
          targetOwner: deal.owner_name,
          aliases,
        })
        return {
          targetType: "deal" as const,
          targetId: deal.id,
          targetLabel,
          confidence: match.score,
          evidence: match.evidence,
          strategy: match.strategy,
        }
      }),
    ]
      .filter((target) => !isUnsafeCrmTargetLabel(target.targetLabel))
      .filter(shouldKeepScoredMatch)
      .sort((a, b) => b.confidence - a.confidence)

    const scoredTargets = rankedTargets.slice(0, MAX_CANDIDATES_PER_SOURCE)
    const autoTarget = pickAutoConfirmTarget(
      rankedTargets,
      autoConfirmPolicy,
      ["customer"],
      rejectedPairsBySource.get(`leads:${lead.id}`) ?? EMPTY_PAIR_SET
    )
    if (autoTarget) {
      autoConfirmDecisions.push({
        source_object: "leads",
        source_record_key: lead.id,
        target_type: autoTarget.targetType,
        target_id: autoTarget.targetId,
        confidence: autoTarget.confidence,
        evidence: autoTarget.evidence,
      })
    }

    for (const target of scoredTargets) {
      candidates.push({
        source_system: "lead",
        source_object: "leads",
        source_record_key: lead.id,
        normalized_name: normalizedSourceLabel,
        target_type: target.targetType,
        target_id: target.targetId,
        confidence: Number(target.confidence.toFixed(4)),
        status: "candidate",
        metadata: {
          source_label: sourceLabel,
          lead_name: lead.name,
          lead_org: lead.org,
          source_owner: lead.assigned_to,
          source_status: lead.status,
          source_created_at: lead.created_at,
          phone: lead.phone,
          email: lead.email,
          target_label: target.targetLabel,
          match_evidence: target.evidence,
          match_strategy: target.strategy,
          source_priority: "lead_intake_high",
        },
      })
    }
  }

  const rowsToInsert = candidates.filter((candidate) => !existingCandidateKeys.has(buildCandidateKey(candidate)))

  if (!dryRun && rowsToInsert.length > 0) {
    const { error } = await sb.from("crm_source_links").insert(rowsToInsert)
    if (error) throw error
  }

  const autoConfirmed = dryRun
    ? autoConfirmDecisions.length
    : await applyAutoConfirmDecisions("lead", autoConfirmDecisions)

  return {
    scannedLeads: leads.length,
    generatedCandidates: candidates.length,
    insertedCandidates: rowsToInsert.length,
    skippedExisting: candidates.length - rowsToInsert.length,
    autoConfirmed,
  }
}

export async function generateLeadLinkCandidates(): Promise<GenerateLeadLinkCandidatesResult> {
  return runLeadLinkCandidateGeneration(false)
}

export async function previewLeadLinkCandidates(): Promise<PreviewLeadLinkCandidatesResult> {
  const result = await runLeadLinkCandidateGeneration(true)
  const { insertedCandidates, autoConfirmed, ...summary } = result
  return {
    ...summary,
    wouldInsertCandidates: insertedCandidates,
    wouldAutoConfirm: autoConfirmed,
  }
}

type CrmSourceLinkCoverageSourceSystem = "branch_rev_sheet" | "xiaoshouyi" | "lead"

interface CrmSourceLinkCoverageRow {
  id: string
  source_system: string
  source_object: string
  source_record_key: string
  target_type: string | null
  target_id: string | null
  status: string
  metadata: Record<string, unknown> | null
}

export interface CrmSourceLinkCoverage {
  total: number
  linked: number
  needsReview: number
  coveragePct: number
  /** 저장 상태 원본과 현재 운영 KPI에서 제외한 이력을 분리해 감사할 수 있게 한다. */
  diagnostics: {
    stored: {
      total: number
      confirmed: number
      candidate: number
      stale: number
    }
    excluded: {
      /** 현재 소스 부재, 무효 alias 또는 confirmed sibling 때문에 처리 대상이 아닌 이력 */
      reviewHistory: number
      /** 현재 활성 branch 원천에 없는 과거 확정 링크 */
      confirmedHistory: number
      /** matching inbox가 다루지 않는 source_system의 저장 링크 */
      outOfScope: number
    }
    validation: {
      aliasCatalog: "verified" | "fail_open"
      branchSource: "verified" | "fail_open"
      /** Matching inbox와 동일하게 Xiaoshouyi/lead 원천 존재는 링크 행을 기준으로 fail-open한다. */
      externalSource: "fail_open"
      warnings: string[]
    }
  }
}

const CRM_SOURCE_LINK_COVERAGE_SYSTEMS = new Set<CrmSourceLinkCoverageSourceSystem>([
  "branch_rev_sheet",
  "xiaoshouyi",
  "lead",
])
const CRM_SOURCE_LINK_COVERAGE_ROW_LIMIT = 50_000
const CRM_SOURCE_LINK_COVERAGE_ALIAS_LIMIT = 20_000

function emptyCrmSourceLinkCoverage(warnings: string[] = []): CrmSourceLinkCoverage {
  return {
    total: 0,
    linked: 0,
    needsReview: 0,
    coveragePct: 0,
    diagnostics: {
      stored: { total: 0, confirmed: 0, candidate: 0, stale: 0 },
      excluded: { reviewHistory: 0, confirmedHistory: 0, outOfScope: 0 },
      validation: {
        aliasCatalog: "fail_open",
        branchSource: "fail_open",
        externalSource: "fail_open",
        warnings,
      },
    },
  }
}

function isCrmSourceLinkCoverageSystem(value: string): value is CrmSourceLinkCoverageSourceSystem {
  return CRM_SOURCE_LINK_COVERAGE_SYSTEMS.has(value as CrmSourceLinkCoverageSourceSystem)
}

// Read-only coverage rollup for the matching keystone metric. 저장 status 개수가 아니라
// Admin matching과 같은 current/actionable 경계로 분류한다. branch는 현재 활성 KR 시트
// 존재를 검증하고, Xiaoshouyi/lead는 matching inbox처럼 링크 행 존재를 fail-open 원천으로
// 사용한다. 이력/범위 밖 저장 행은 diagnostics에만 보존한다.
export async function getCrmSourceLinkCoverage(options?: { throwOnError?: boolean }): Promise<CrmSourceLinkCoverage> {
  try {
    const sb = createSupabaseAdminClient()
    const [linksResult, branchResult, aliasesResult, excludedOwnerIds] = await Promise.all([
      fetchSupabasePages<CrmSourceLinkCoverageRow>({
        maxRows: CRM_SOURCE_LINK_COVERAGE_ROW_LIMIT,
        fetchPage: (from, to) =>
          sb
            .from("crm_source_links")
            .select(
              "id, source_system, source_object, source_record_key, target_type, target_id, status, metadata",
              from === 0 ? { count: "exact" } : undefined
            )
            .neq("status", "rejected")
            .order("id", { ascending: true })
            .range(from, to),
      }),
      fetchSupabasePages<BranchRevCandidateSource & { id: string }>({
        maxRows: CRM_SOURCE_LINK_COVERAGE_ROW_LIMIT,
        fetchPage: (from, to) =>
          sb
            .from("branch_rev_deals")
            .select(
              "id, sheet_row, customer_name, team, manager, status, first_payment, contract_target",
              from === 0 ? { count: "exact" } : undefined
            )
            .order("id", { ascending: true })
            .range(from, to),
      }),
      fetchSupabasePages<CrmMatchAliasValidationRow & { id: string }>({
        maxRows: CRM_SOURCE_LINK_COVERAGE_ALIAS_LIMIT,
        fetchPage: (from, to) =>
          sb
            .from("crm_match_aliases")
            .select(
              "id, source_system, normalized_alias, target_type, target_id, normalized_manager_name",
              from === 0 ? { count: "exact" } : undefined
            )
            .eq("status", "active")
            .in("source_system", ["branch_rev_sheet", "xiaoshouyi"])
            .order("id", { ascending: true })
          .range(from, to),
      }),
      getExcludedXiaoshouyiOwnerIds(sb),
    ])

    if (linksResult.error) throw new Error(linksResult.error.message ?? "CRM source link coverage unavailable")
    if (linksResult.truncated) {
      throw new Error(`CRM source link coverage가 ${CRM_SOURCE_LINK_COVERAGE_ROW_LIMIT}건 상한에서 잘렸습니다.`)
    }

    const warnings: string[] = []
    const canValidateBranchSource = !branchResult.error && !branchResult.truncated
    const canValidateAliases = !aliasesResult.error && !aliasesResult.truncated

    if (!canValidateBranchSource) {
      const message = branchResult.error?.message
        ? `현재 branch 원천을 확인하지 못했습니다: ${branchResult.error.message}`
        : `현재 branch 원천이 ${CRM_SOURCE_LINK_COVERAGE_ROW_LIMIT}건 상한에서 잘렸습니다.`
      if (options?.throwOnError) throw new Error(message)
      warnings.push(`${message} branch 링크는 fail-open으로 집계했습니다.`)
    }
    if (!canValidateAliases) {
      const message = aliasesResult.error?.message
        ? `활성 별칭을 확인하지 못했습니다: ${aliasesResult.error.message}`
        : `활성 별칭이 ${CRM_SOURCE_LINK_COVERAGE_ALIAS_LIMIT}건 상한에서 잘렸습니다.`
      warnings.push(`${message} 별칭 후보는 오탐 제외를 피하기 위해 fail-open했습니다.`)
    }

    const branchRows = branchResult.data
    const koreaManagers = getKoreaTeamManagerSet(branchRows)
    const currentBranchKeys = new Set(
      branchRows
        .filter(
          (row) =>
            !isInactiveSheetStatus(row.status) &&
            isKoreaTeamLabel(row.team) &&
            !isPlaceholderCrmName(row.customer_name)
        )
        .map(getBranchRevSourceRecordKey)
    )
    const links = linksResult.data
    const activeAliases = canValidateAliases ? aliasesResult.data : []
    const confirmedSourceIdentities = new Set(
      links
        .filter((link) => link.status === "confirmed")
        .map((link) =>
          getCrmSourceLinkIdentity({
            sourceSystem: link.source_system,
            sourceObject: link.source_object,
            sourceRecordKey: link.source_record_key,
          })
        )
    )

    const stored = {
      total: links.length,
      confirmed: links.filter((link) => link.status === "confirmed").length,
      candidate: links.filter((link) => link.status === "candidate").length,
      stale: links.filter((link) => link.status === "stale").length,
    }
    const excluded = { reviewHistory: 0, confirmedHistory: 0, outOfScope: 0 }
    let linked = 0
    let needsReview = 0

    for (const link of links) {
      if (!isCrmSourceLinkCoverageSystem(link.source_system)) {
        excluded.outOfScope += 1
        continue
      }

      if (
        link.source_system === "xiaoshouyi" &&
        !EXTERNAL_CRM_KOREA_ONLY &&
        !isKoreaScopedOwner(
          typeof link.metadata?.owner_name === "string"
            ? link.metadata.owner_name
            : typeof link.metadata?.source_owner === "string"
              ? link.metadata.source_owner
              : null,
          koreaManagers
        )
      ) {
        excluded.outOfScope += 1
        continue
      }

      const isCurrentBranchSource =
        link.source_system !== "branch_rev_sheet" ||
        !canValidateBranchSource ||
        (link.source_object === "branch_rev_deals" && currentBranchKeys.has(link.source_record_key))
      if (!isCurrentBranchSource) {
        if (link.status === "confirmed") excluded.confirmedHistory += 1
        else if (link.status === "candidate" || link.status === "stale") excluded.reviewHistory += 1
        continue
      }

      if (link.status === "confirmed") {
        linked += 1
        continue
      }
      if (link.status !== "candidate" && link.status !== "stale") continue

      const validationState = classifyCrmSourceLinkReviewValidation(
        {
          sourceSystem: link.source_system,
          sourceObject: link.source_object,
          sourceRecordKey: link.source_record_key,
          targetType: link.target_type,
          targetId: link.target_id,
          linkStatus: link.status,
          metadata: link.metadata,
        },
        {
          confirmedSourceIdentities,
          activeAliases,
          canValidateAliases,
          excludedXiaoshouyiOwnerIds: excludedOwnerIds,
        }
      )
      if (validationState === "valid") needsReview += 1
      else excluded.reviewHistory += 1
    }

    const total = linked + needsReview
    const coveragePct = total > 0 ? Math.round((linked / total) * 100) : 0
    return {
      total,
      linked,
      needsReview,
      coveragePct,
      diagnostics: {
        stored,
        excluded,
        validation: {
          aliasCatalog: canValidateAliases ? "verified" : "fail_open",
          branchSource: canValidateBranchSource ? "verified" : "fail_open",
          externalSource: "fail_open",
          warnings,
        },
      },
    }
  } catch (error) {
    if (options?.throwOnError) throw error
    const message = error instanceof Error ? error.message : "CRM source link coverage unavailable"
    return emptyCrmSourceLinkCoverage([message])
  }
}

export async function generateAllCrmLinkCandidates(): Promise<GenerateAllCrmLinkCandidatesResult> {
  const [branchRev, leads, xiaoshouyi] = await Promise.all([
    generateBranchRevLinkCandidates(),
    generateLeadLinkCandidates(),
    generateExternalCrmLinkCandidates(),
  ])

  return { branchRev, leads, xiaoshouyi }
}

/**
 * 운영 후보 생성과 같은 조회·점수·정책 경로를 사용하되 쓰기를 전혀 실행하지 않는 preview.
 * wouldAutoConfirm은 DB 오류/동시 변경이 없다고 가정했을 때의 정책상 예상치다.
 */
export async function previewAllCrmLinkCandidates(): Promise<PreviewAllCrmLinkCandidatesResult> {
  const [branchRev, leads, xiaoshouyi] = await Promise.all([
    previewBranchRevLinkCandidates(),
    previewLeadLinkCandidates(),
    previewExternalCrmLinkCandidates(),
  ])

  return { branchRev, leads, xiaoshouyi }
}

export async function searchManualCrmLinkTargets(
  query: string,
  sourceRecordKey?: string
): Promise<CrmManualLinkTargetOption[]> {
  const normalizedQuery = normalizeCrmName(query)
  if (normalizedQuery.length < 2) return []

  const sb = createSupabaseAdminClient()
  const [partnerAccountsResult, customersResult, dealsResult, source, aliases] = await Promise.all([
    sb
      .from("partner_accounts")
      .select("id, name, status, owner_name")
      .limit(2000),
    sb
      .from("customers")
      .select("id, partner_account_id, name, campus_name, contact_name")
      .limit(2000),
    sb
      .from("deals")
      .select("id, customer_id, partner_account_id, title, deal_code")
      .limit(2000),
    sourceRecordKey ? findBranchRevSourceByKey(sourceRecordKey) : Promise.resolve(null),
    getCrmMatchAliases("branch_rev_sheet"),
  ])

  if (partnerAccountsResult.error) throw partnerAccountsResult.error
  if (customersResult.error) throw customersResult.error
  if (dealsResult.error) throw dealsResult.error

  const sourceName = source?.customer_name ?? query
  const sourceOwner = source ? source.manager ?? source.team : null
  const options: CrmManualLinkTargetOption[] = [
    ...((partnerAccountsResult.data ?? []) as PartnerAccountCandidateTarget[]).map((account) => {
      const label = buildSourceTargetLabel(account)
      const match = scoreSourceTargetMatch({
        sourceName,
        sourceOwner,
        targetType: "partner_account",
        targetId: account.id,
        targetLabel: label,
        targetOwner: account.owner_name,
        aliases,
      })
      return {
        targetType: "partner_account" as const,
        targetId: account.id,
        label,
        confidence: match.score,
        evidence: match.evidence,
      }
    }),
    ...((customersResult.data ?? []) as CustomerCandidateTarget[]).map((customer) => {
      const label = buildSourceTargetLabel(customer)
      const match = scoreSourceTargetMatch({
        sourceName,
        sourceOwner,
        targetType: "customer",
        targetId: customer.id,
        targetLabel: label,
        targetOwner: customer.contact_name,
        aliases,
      })
      return {
        targetType: "customer" as const,
        targetId: customer.id,
        label,
        confidence: match.score,
        evidence: match.evidence,
      }
    }),
    ...((dealsResult.data ?? []) as DealCandidateTarget[]).map((deal) => {
      const label = buildSourceTargetLabel(deal)
      const match = scoreSourceTargetMatch({
        sourceName,
        sourceOwner,
        targetType: "deal",
        targetId: deal.id,
        targetLabel: label,
        targetOwner: deal.owner_name,
        aliases,
      })
      return {
        targetType: "deal" as const,
        targetId: deal.id,
        label,
        confidence: match.score,
        evidence: match.evidence,
      }
    }),
  ]

  return options
    .filter((option) => {
      const normalizedLabel = normalizeCrmName(option.label)
      return (
        normalizedLabel.includes(normalizedQuery) ||
        shouldKeepScoredMatch({ confidence: option.confidence, evidence: option.evidence }) ||
        option.confidence >= 0.35
      )
    })
    .sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label, "ko-KR"))
    .slice(0, MAX_MANUAL_SEARCH_RESULTS)
}

export async function createManualBranchRevLinkCandidate(input: {
  sourceRecordKey: string
  targetType: CrmManualLinkTargetType
  targetId: string
}) {
  const sb = createSupabaseAdminClient()
  const source = await findBranchRevSourceByKey(input.sourceRecordKey)
  if (!source) throw new Error("REV source row not found")

  const { data: confirmedLinks, error: confirmedError } = await sb
    .from("crm_source_links")
    .select("id")
    .eq("source_system", "branch_rev_sheet")
    .eq("source_object", "branch_rev_deals")
    .eq("source_record_key", input.sourceRecordKey)
    .eq("status", "confirmed")
    .limit(1)

  if (confirmedError) throw confirmedError
  if ((confirmedLinks ?? []).length > 0) throw new Error("REV source already has a confirmed link")

  const targetResult =
    input.targetType === "partner_account"
      ? await sb.from("partner_accounts").select("id, name, status, owner_name").eq("id", input.targetId).maybeSingle()
      : input.targetType === "customer"
        ? await sb
            .from("customers")
            .select("id, partner_account_id, name, campus_name, contact_name")
            .eq("id", input.targetId)
            .maybeSingle()
        : await sb
            .from("deals")
            .select("id, customer_id, partner_account_id, title, deal_code")
            .eq("id", input.targetId)
            .maybeSingle()

  if (targetResult.error) throw targetResult.error
  if (!targetResult.data) throw new Error("CRM target not found")

  const target = targetResult.data as CustomerCandidateTarget | PartnerAccountCandidateTarget | DealCandidateTarget
  const targetLabel = buildSourceTargetLabel(target)
  const aliases = await getCrmMatchAliases("branch_rev_sheet")
  const match = scoreSourceTargetMatch({
    sourceName: source.customer_name,
    sourceOwner: source.manager ?? source.team,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel,
    targetOwner: getTargetOwnerName(target),
    aliases,
  })
  const row: CandidateInsert = {
    source_system: "branch_rev_sheet",
    source_object: "branch_rev_deals",
    source_record_key: input.sourceRecordKey,
    normalized_name: normalizeCrmName(source.customer_name),
    target_type: input.targetType,
    target_id: input.targetId,
    confidence: Number(match.score.toFixed(4)),
    status: "candidate",
    metadata: {
      manual: true,
      sheet_row: source.sheet_row,
      source_customer_name: source.customer_name,
      source_owner: [source.team, source.manager].filter(Boolean).join(" · ") || null,
      source_status: source.status,
      target_label: targetLabel,
      match_evidence: match.evidence,
      match_strategy: match.strategy,
      source_priority: "branch_rev_sheet_supporting",
    },
  }

  const { data, error } = await sb
    .from("crm_source_links")
    .upsert(row, {
      onConflict: "source_system,source_object,source_record_key,target_type,target_id",
    })
    .select("id, status")
    .single()

  if (error) throw error
  return data
}

export interface ConfirmedLeadConversionLink {
  linkId: string
  customerId: string
  dealId: string | null
  dealCode: string | null
  metadata: Record<string, unknown> | null
}

// 리드→고객 전환 멱등 판정용 SSOT 조회. customers.notes 텍스트 마커 대신
// 확정(confirmed) 링크를 먼저 보고, 딜 계보는 링크 metadata(deal_id/deal_code)에서 읽는다.
// 부분 유니크 인덱스(crm_source_links_one_confirmed_source_idx)가 소스당 확정 1건을 보장한다.
export async function findConfirmedLeadConversionLink(
  leadId: string
): Promise<ConfirmedLeadConversionLink | null> {
  const sourceRecordKey = leadId.trim()
  if (!sourceRecordKey) return null

  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("crm_source_links")
    .select("id, target_id, metadata")
    .eq("source_system", "lead")
    .eq("source_object", "leads")
    .eq("source_record_key", sourceRecordKey)
    .eq("status", "confirmed")
    .eq("target_type", "customer")
    .limit(1)

  if (error) throw error

  const link = data?.[0] as
    | { id: string; target_id: string | null; metadata: Record<string, unknown> | null }
    | undefined
  if (!link?.target_id) return null

  const metadata = link.metadata ?? null
  return {
    linkId: link.id,
    customerId: link.target_id,
    dealId: getMetadataString(metadata, "deal_id"),
    dealCode: getMetadataString(metadata, "deal_code"),
    metadata,
  }
}

export async function upsertConfirmedLeadCustomerLink(input: {
  leadId: string
  sourceLabel: string
  customerId: string
  customerLabel: string
  actorUserId?: string | null
  metadata?: Record<string, unknown>
}) {
  const sb = createSupabaseAdminClient()
  const sourceRecordKey = input.leadId.trim()
  const sourceLabel = input.sourceLabel.trim()
  const customerId = input.customerId.trim()
  const customerLabel = input.customerLabel.trim()

  if (!sourceRecordKey || !sourceLabel || !customerId || !customerLabel) {
    throw new Error("Invalid lead conversion source link input")
  }

  const { data: confirmedLinks, error: confirmedError } = await sb
    .from("crm_source_links")
    .select("id, target_id, status")
    .eq("source_system", "lead")
    .eq("source_object", "leads")
    .eq("source_record_key", sourceRecordKey)
    .eq("status", "confirmed")
    .limit(1)

  if (confirmedError) throw confirmedError

  const existingConfirmed = confirmedLinks?.[0]
  if (existingConfirmed?.id && existingConfirmed.target_id !== customerId) {
    return existingConfirmed
  }

  const { error: staleError } = await sb
    .from("crm_source_links")
    .update({ status: "stale", confirmed_by: null, confirmed_at: null })
    .eq("source_system", "lead")
    .eq("source_object", "leads")
    .eq("source_record_key", sourceRecordKey)
    .neq("target_id", customerId)
    .in("status", ["candidate", "confirmed"])

  if (staleError) throw staleError

  const now = new Date().toISOString()
  const { data, error } = await sb
    .from("crm_source_links")
    .upsert(
      {
        source_system: "lead",
        source_object: "leads",
        source_record_key: sourceRecordKey,
        normalized_name: normalizeCrmName(sourceLabel),
        target_type: "customer",
        target_id: customerId,
        confidence: 1,
        status: "confirmed",
        confirmed_by: input.actorUserId ?? null,
        confirmed_at: now,
        metadata: {
          ...(input.metadata ?? {}),
          source_label: sourceLabel,
          target_label: customerLabel,
          converted_at: now,
        },
      },
      {
        onConflict: "source_system,source_object,source_record_key,target_type,target_id",
      }
    )
    .select("id, status")
    .single()

  if (error) throw error
  await tryLearnAliasFromConfirmedLink(
    {
      id: data.id as string,
      source_system: "lead",
      source_object: "leads",
      source_record_key: sourceRecordKey,
      normalized_name: normalizeCrmName(sourceLabel),
      target_type: "customer",
      target_id: customerId,
      metadata: {
        ...(input.metadata ?? {}),
        source_label: sourceLabel,
        target_label: customerLabel,
        source_owner: input.metadata?.source_owner,
        assigned_to: input.metadata?.assigned_to,
      },
    },
    input.actorUserId
  )
  return data
}

// convert-v2 등이 남긴 confirmed lead→customer 링크를 leadId→customerId 맵으로 반환.
// 통합 고객 목록이 전환된 리드와 portal customer의 이중 등장을 접는 데 사용한다.
// confirmed_at 오름차순으로 덮어써서 같은 리드에 확정이 여럿이면 최신 확정이 남는다.
export async function listConfirmedLeadCustomerLinks(): Promise<Map<string, string>> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("crm_source_links")
    .select("source_record_key, target_id, confirmed_at")
    .eq("source_system", "lead")
    .eq("source_object", "leads")
    .eq("target_type", "customer")
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: true, nullsFirst: true })
    .limit(5000)

  if (error) throw error

  const map = new Map<string, string>()
  for (const row of (data ?? []) as Array<{ source_record_key: string; target_id: string }>) {
    if (row.source_record_key && row.target_id) map.set(row.source_record_key, row.target_id)
  }
  return map
}

const LEAD_NEO_LINK_PAGE_SIZE = 1000
const LEAD_NEO_LINK_MAX_PAGES = 20

/**
 * NEO 등록 확정된 리드 id 집합 — source_object='leads' → target_type='external_account' confirmed.
 * source_system='lead'은 결과를 바꾸지 않는다(leads 링크의 유일한 소스 시스템). 다만
 * crm_source_links_source_idx(source_system, source_object, status)의 선두 컬럼이라
 * 이게 빠지면 인덱스를 못 타고 전 테이블을 훑는다.
 */
export async function listConfirmedLeadNeoLinkLeadIds(): Promise<Set<string>> {
  const sb = createSupabaseAdminClient()
  const ids = new Set<string>()

  // PostgREST는 요청당 기본 1000행에서 조용히 절단한다 — 절단되면 등록된 리드가
  // '등록 대기'로 오판된다. 결정적 정렬(id) + range로 짧은 페이지가 나올 때까지
  // 이어 읽고, 상한 초과는 무음 대신 에러로 드러낸다.
  for (let page = 0; ; page += 1) {
    if (page >= LEAD_NEO_LINK_MAX_PAGES) {
      throw new Error(
        `crm_source_links lead→neo 조회가 ${LEAD_NEO_LINK_MAX_PAGES}페이지(${LEAD_NEO_LINK_MAX_PAGES * LEAD_NEO_LINK_PAGE_SIZE}행)를 초과했습니다 — 페이지 상한을 재검토하세요.`
      )
    }
    const from = page * LEAD_NEO_LINK_PAGE_SIZE
    const { data, error } = await sb
      .from("crm_source_links")
      .select("source_record_key")
      .eq("source_system", "lead")
      .eq("source_object", "leads")
      // external_account = 360 드로어의 수동 'NEO 등록됨'(계정 링크),
      // external_lead    = 밀어넣기 도구가 CRM lead 를 생성·대사하며 남기는 링크.
      // 둘 다 "NEO 에 등록된 리드"라는 같은 사실이므로 배지는 함께 센다.
      .in("target_type", ["external_account", "external_lead"])
      .eq("status", "confirmed")
      .order("id", { ascending: true })
      .range(from, from + LEAD_NEO_LINK_PAGE_SIZE - 1)

    if (error) throw new Error(`crm_source_links lead→neo 조회 실패: ${error.message}`)

    const rows = data ?? []
    for (const row of rows) ids.add(String(row.source_record_key))
    if (rows.length < LEAD_NEO_LINK_PAGE_SIZE) break
  }
  return ids
}

/**
 * 이 리드가 NEO 계정으로 등록 확정됐는지 단건 조회 (360 드로어용 — 벌크 Set 스캔 금지).
 * 겨냥하는 링크 집합은 listConfirmedLeadNeoLinkLeadIds와 같고(source_system='lead',
 * source_object='leads', target_type='external_account', status='confirmed') 리드 1건으로
 * 좁힌다. source_system 술어는 결과를 바꾸지 않지만(leads 링크의 유일한 소스 시스템)
 * crm_source_links_source_idx(source_system, source_object, status)와
 * crm_source_links_unique_candidate의 선두 컬럼이라 이게 빠지면 인덱스를 못 탄다.
 * tests/repositories/crm-source-links-find-neo-link.test.ts가 이 eq 호출 목록을 그대로
 * 검증하므로 필터를 더하거나 빼려면 그 테스트를 함께 고쳐야 한다.
 */
export async function findConfirmedLeadNeoLink(leadId: string): Promise<{ targetId: string } | null> {
  const sourceRecordKey = leadId.trim()
  if (!sourceRecordKey) return null

  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("crm_source_links")
    .select("target_id")
    .eq("source_system", "lead")
    .eq("source_object", "leads")
    .eq("source_record_key", sourceRecordKey)
    .eq("target_type", "external_account")
    .eq("status", "confirmed")
    .limit(1)

  if (error) throw new Error(`crm_source_links lead→neo 단건 조회 실패: ${error.message}`)

  const link = (data ?? [])[0] as { target_id: string | null } | undefined
  if (!link?.target_id) return null
  return { targetId: link.target_id }
}

// 확정 충돌 에러 문구용 타깃 종류 한국어 라벨 — 어드민 화면 노출 카피.
const CRM_LINK_TARGET_TYPE_KO: Record<string, string> = {
  customer: "전환 고객",
  partner_account: "파트너 계정",
  deal: "딜",
  external_account: "NEO 계정",
}

/**
 * '리드 → NEO 계정' 수동 등록 확정(360 드로어 'NEO 등록 연결' 액션). 멱등:
 * 이미 같은 페어가 confirmed면 그대로 { created: false }를 돌려준다. 같은 페어의
 * 비확정 후보가 있으면 확정으로 갱신하고, 없으면 확정 행을 새로 만든다 —
 * unique 제약(source_system,source_object,source_record_key,target_type,target_id)이
 * select-then-insert 레이스를 upsert로 흡수한다. 확정된 행은 그대로
 * listConfirmedLeadNeoLinkLeadIds의 조회 모양(source_system='lead', source_object='leads',
 * target_type='external_account', status='confirmed')에 잡힌다 — source_system을 다른 값으로
 * 쓰면 그 lookup에서 조용히 사라진다.
 */
export async function confirmLeadNeoLink(input: {
  leadId: string
  neoAccountId: string
  normalizedName?: string | null
  actorUserId?: string | null
}): Promise<{ created: boolean }> {
  const sb = createSupabaseAdminClient()
  const leadId = input.leadId.trim()
  const neoAccountId = input.neoAccountId.trim()
  if (!leadId || !neoAccountId) {
    throw new Error("lead→neo 링크 입력이 비어 있습니다.")
  }

  const { data, error: readError } = await sb
    .from("crm_source_links")
    .select("id, status, target_type, target_id, normalized_name, metadata")
    .eq("source_system", "lead")
    .eq("source_object", "leads")
    .eq("source_record_key", leadId)

  if (readError) throw new Error(`lead→neo 링크 조회 실패: ${readError.message}`)

  const links = (data ?? []) as Array<{
    id: string
    status: string
    target_type: string
    target_id: string
    normalized_name: string | null
    metadata: Record<string, unknown> | null
  }>
  const existing = links.find(
    (link) => link.target_type === "external_account" && link.target_id === neoAccountId
  )
  if (existing?.status === "confirmed") return { created: false }

  // 부분 유니크 인덱스(crm_source_links_one_confirmed_source_idx)는 소스당 확정 1건만
  // 허용한다. 이미 다른 타깃(예: convert-v2 lead→customer)으로 확정된 리드면 DB가
  // 어차피 거부하므로, 불투명한 23505 대신 원인이 보이는 에러로 먼저 알린다.
  // 메시지는 어드민 토스트에 그대로 노출된다 — raw enum/전체 id 대신 한국어 라벨 + 뒤 8자리.
  const otherConfirmed = links.find((link) => link.status === "confirmed" && link !== existing)
  if (otherConfirmed) {
    const typeLabel = CRM_LINK_TARGET_TYPE_KO[otherConfirmed.target_type] ?? otherConfirmed.target_type
    const shortId =
      otherConfirmed.target_id.length > 8 ? `…${otherConfirmed.target_id.slice(-8)}` : otherConfirmed.target_id
    throw new Error(
      `이미 다른 타깃(${typeLabel} ${shortId})으로 확정된 리드입니다 — 기존 확정 링크를 해제한 뒤 다시 시도하세요.`
    )
  }

  const now = new Date().toISOString()
  const normalizedName = input.normalizedName?.trim()
    ? normalizeCrmName(input.normalizedName)
    : (existing?.normalized_name ?? null)

  const { error } = await sb
    .from("crm_source_links")
    .upsert(
      {
        source_system: "lead",
        source_object: "leads",
        source_record_key: leadId,
        normalized_name: normalizedName,
        target_type: "external_account",
        target_id: neoAccountId,
        confidence: 1,
        status: "confirmed",
        confirmed_by: input.actorUserId ?? null,
        confirmed_at: now,
        // 기존 후보의 매칭 근거(metadata)는 보존하고 수동 확정 표식만 얹는다.
        metadata: { ...(existing?.metadata ?? {}), manual: true, manual_confirmed_at: now },
      },
      {
        onConflict: "source_system,source_object,source_record_key,target_type,target_id",
      }
    )

  if (error) throw new Error(`lead→neo 링크 확정 실패: ${error.message}`)
  return { created: !existing }
}

interface ConfirmableSourceLinkRow {
  id: string
  source_system: string
  source_object: string
  source_record_key: string
  normalized_name: string | null
  target_type: string
  target_id: string
  status: string
  metadata: Record<string, unknown> | null
}

async function assertCrmSourceLinkConfirmable(
  sb: ReturnType<typeof createSupabaseAdminClient>,
  link: ConfirmableSourceLinkRow
) {
  if (link.status === "confirmed") return
  if (link.status === "rejected") {
    throw new CrmSourceLinkConflictError("제외된 연결은 바로 확정할 수 없습니다. 새 후보로 다시 연결해 주세요.")
  }
  if (link.status !== "candidate" && link.status !== "stale") {
    throw new CrmSourceLinkConflictError("현재 상태에서는 이 연결을 확정할 수 없습니다.")
  }

  const { data: confirmedSibling, error: siblingError } = await sb
    .from("crm_source_links")
    .select("id")
    .eq("source_system", link.source_system)
    .eq("source_object", link.source_object)
    .eq("source_record_key", link.source_record_key)
    .eq("status", "confirmed")
    .neq("id", link.id)
    .limit(1)

  if (siblingError) {
    throw new Error(`기존 확정 연결을 검증하지 못했습니다: ${siblingError.message}`)
  }
  if (confirmedSibling?.[0]?.id) {
    throw new CrmSourceLinkConflictError(RETIRED_SIBLING_VALIDATION_MESSAGE)
  }

  const validationInput: CrmSourceLinkValidationInput = {
    sourceSystem: link.source_system,
    targetType: link.target_type,
    targetId: link.target_id,
    linkStatus: link.status,
    metadata: link.metadata,
  }
  const excludedOwnerIds =
    link.source_system === "xiaoshouyi"
      ? await getExcludedXiaoshouyiOwnerIds(sb)
      : new Set<string>()
  const safetyState = classifyCrmSourceLinkReviewValidation(
    {
      ...validationInput,
      sourceObject: link.source_object,
      sourceRecordKey: link.source_record_key,
    },
    {
      confirmedSourceIdentities: new Set(),
      activeAliases: [],
      canValidateAliases: false,
      excludedXiaoshouyiOwnerIds: excludedOwnerIds,
    }
  )
  if (safetyState === "unsafe_matching_evidence") {
    throw new CrmSourceLinkConflictError(UNSAFE_MATCHING_EVIDENCE_MESSAGE)
  }
  if (!needsCrmAliasCatalogValidation(validationInput)) return

  const { data: aliases, error: aliasError } = await sb
    .from("crm_match_aliases")
    .select("source_system, normalized_alias, target_type, target_id, normalized_manager_name")
    .eq("source_system", link.source_system)
    .eq("target_type", link.target_type)
    .eq("target_id", link.target_id)
    .eq("status", "active")
    .in("normalized_alias", getCrmAliasEvidence(link.metadata))

  if (aliasError) {
    throw new Error(`별칭 근거를 검증하지 못했습니다: ${aliasError.message}`)
  }
  if (
    classifyCrmSourceLinkValidation(validationInput, (aliases ?? []) as CrmMatchAliasValidationRow[]) !== "valid"
  ) {
    throw new CrmSourceLinkConflictError(LEGACY_ALIAS_VALIDATION_MESSAGE)
  }
}

export async function updateCrmSourceLinkStatus(
  id: string,
  action: CrmSourceLinkAction,
  actorUserId?: string | null
) {
  const sb = createSupabaseAdminClient()
  const { data: link, error: readError } = await sb
    .from("crm_source_links")
    .select("id, source_system, source_object, source_record_key, normalized_name, target_type, target_id, status, metadata")
    .eq("id", id)
    .maybeSingle()

  if (readError) throw readError
  if (!link) throw new Error("CRM source link not found")

  if (action === "confirm") {
    await assertCrmSourceLinkConfirmable(sb, link as ConfirmableSourceLinkRow)
    if (link.status === "confirmed") return { id: link.id, status: "confirmed" as const }

    const { data, error } = await sb
      .from("crm_source_links")
      .update({
        status: "confirmed",
        confirmed_by: actorUserId ?? null,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", link.id)
      .eq("status", link.status)
      .select("id, status")
      .single()

    if (error) throw error

    // 선택 링크를 먼저 확정한다. 경쟁 확정이 동시에 생기면 DB 유니크 제약이
    // 선택 업데이트를 거부하므로, 기존 후보들을 먼저 stale로 잃는 부분 실패가 없다.
    const { error: staleError } = await sb
      .from("crm_source_links")
      .update({ status: "stale", confirmed_by: null, confirmed_at: null })
      .eq("source_system", link.source_system)
      .eq("source_object", link.source_object)
      .eq("source_record_key", link.source_record_key)
      .neq("id", link.id)
      .eq("status", "candidate")

    if (staleError) throw staleError
    await tryLearnAliasFromConfirmedLink(link as ConfirmedSourceLinkAliasSeed, actorUserId)
    return data
  }

  const status = action === "reject" ? "rejected" : "stale"
  const { data, error } = await sb
    .from("crm_source_links")
    .update({ status, confirmed_by: null, confirmed_at: null })
    .eq("id", link.id)
    .select("id, status")
    .single()

  if (error) throw error
  return data
}

export interface BulkUpdateCrmSourceLinksResult {
  updated: number
  failed: Array<{ id: string; error: string }>
  /**
   * 요청 상한(BULK_LINK_ACTION_LIMIT)을 넘어 처리하지 않은 건수.
   * 조용히 잘라 내면 updated + failed 합이 사용자가 선택한 수와 달라지는데
   * 화면에는 그 차이를 설명할 근거가 없다.
   */
  skipped: number
}

const BULK_LINK_ACTION_LIMIT = 200

export async function bulkUpdateCrmSourceLinkStatus(
  ids: string[],
  action: CrmSourceLinkAction,
  actorUserId?: string | null
): Promise<BulkUpdateCrmSourceLinksResult> {
  const deduped = Array.from(new Set(ids.filter((id) => typeof id === "string" && id.trim())))
  const uniqueIds = deduped.slice(0, BULK_LINK_ACTION_LIMIT)
  const skipped = deduped.length - uniqueIds.length
  const failed: Array<{ id: string; error: string }> = []
  let updated = 0

  for (const id of uniqueIds) {
    try {
      await updateCrmSourceLinkStatus(id, action, actorUserId)
      updated += 1
    } catch (error) {
      failed.push({ id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return { updated, failed, skipped }
}

export interface ReattachBranchRevLinksResult {
  checkedConfirmedLinks: number
  reattached: number
  staled: number
}

interface ConfirmedBranchRevLinkRow {
  id: string
  source_record_key: string
  target_type: string
  target_id: string
  normalized_name: string | null
  metadata: Record<string, unknown> | null
}

function getBranchRevKeySuffix(key: string) {
  return key.replace(/^rev:\d+:/, "")
}

// branch_rev_deals is full-replaced on every sheet sync, so a confirmed link's
// source_record_key (which embeds sheet_row) can orphan when rows shift. This
// pass migrates confirmed links to the moved row when the name+payment+amount
// fingerprint still identifies exactly one row, and marks the rest stale for
// the matching inbox.
export async function reattachBranchRevConfirmedLinks(): Promise<ReattachBranchRevLinksResult> {
  const sb = createSupabaseAdminClient()
  const [sheetResult, linksResult] = await Promise.all([
    sb
      .from("branch_rev_deals")
      .select("sheet_row, customer_name, team, manager, status, first_payment, contract_target")
      .limit(1000),
    sb
      .from("crm_source_links")
      .select("id, source_record_key, target_type, target_id, normalized_name, metadata")
      .eq("source_system", "branch_rev_sheet")
      .eq("source_object", "branch_rev_deals")
      .eq("status", "confirmed")
      .limit(2000),
  ])

  if (sheetResult.error) throw sheetResult.error
  if (linksResult.error) throw linksResult.error

  const currentKeys = new Set<string>()
  const keysBySuffix = new Map<string, string[]>()
  for (const deal of (sheetResult.data ?? []) as BranchRevCandidateSource[]) {
    const key = getBranchRevSourceRecordKey(deal)
    currentKeys.add(key)
    const suffix = getBranchRevKeySuffix(key)
    const list = keysBySuffix.get(suffix) ?? []
    list.push(key)
    keysBySuffix.set(suffix, list)
  }

  const links = (linksResult.data ?? []) as ConfirmedBranchRevLinkRow[]
  const now = new Date().toISOString()
  let reattached = 0
  let staled = 0

  for (const link of links) {
    if (currentKeys.has(link.source_record_key)) continue

    const suffix = getBranchRevKeySuffix(link.source_record_key)
    const matches = keysBySuffix.get(suffix) ?? []

    if (matches.length !== 1) {
      const { error } = await sb
        .from("crm_source_links")
        .update({
          status: "stale",
          confirmed_by: null,
          confirmed_at: null,
          metadata: {
            ...(link.metadata ?? {}),
            reattach_failed: matches.length === 0 ? "row_removed" : "ambiguous_rows",
            reattach_checked_at: now,
          },
        })
        .eq("id", link.id)

      if (!error) staled += 1
      continue
    }

    const newKey = matches[0]
    const newSheetRow = Number(newKey.match(/^rev:(\d+):/)?.[1] ?? Number.NaN)
    const { data: rowsAtNewKey, error: rowsError } = await sb
      .from("crm_source_links")
      .select("id, status, target_type, target_id, metadata")
      .eq("source_system", "branch_rev_sheet")
      .eq("source_object", "branch_rev_deals")
      .eq("source_record_key", newKey)

    if (rowsError) continue

    const existingRows = (rowsAtNewKey ?? []) as Array<{
      id: string
      status: string
      target_type: string
      target_id: string
      metadata: Record<string, unknown> | null
    }>

    const confirmedAtNewKey = existingRows.find((row) => row.status === "confirmed")
    if (confirmedAtNewKey) {
      // The moved row already has its own confirmed link — retire the orphan.
      const { error } = await sb
        .from("crm_source_links")
        .update({
          status: "stale",
          confirmed_by: null,
          confirmed_at: null,
          metadata: { ...(link.metadata ?? {}), reattach_failed: "new_row_already_confirmed", reattach_checked_at: now },
        })
        .eq("id", link.id)

      if (!error) staled += 1
      continue
    }

    const samePairRow = existingRows.find(
      (row) => row.target_type === link.target_type && row.target_id === link.target_id
    )

    if (samePairRow) {
      const { error: promoteError } = await sb
        .from("crm_source_links")
        .update({
          status: "confirmed",
          confirmed_at: now,
          metadata: {
            ...(samePairRow.metadata ?? {}),
            reattached_at: now,
            reattached_from: link.source_record_key,
          },
        })
        .eq("id", samePairRow.id)

      if (promoteError) continue

      await sb
        .from("crm_source_links")
        .update({
          status: "stale",
          confirmed_by: null,
          confirmed_at: null,
          metadata: { ...(link.metadata ?? {}), reattach_moved_to: newKey, reattach_checked_at: now },
        })
        .eq("id", link.id)

      reattached += 1
      continue
    }

    const { error: moveError } = await sb
      .from("crm_source_links")
      .update({
        source_record_key: newKey,
        metadata: {
          ...(link.metadata ?? {}),
          sheet_row: Number.isNaN(newSheetRow) ? (link.metadata?.sheet_row ?? null) : newSheetRow,
          reattached_at: now,
          reattached_from: link.source_record_key,
        },
      })
      .eq("id", link.id)

    if (!moveError) reattached += 1
  }

  return { checkedConfirmedLinks: links.length, reattached, staled }
}

export interface BranchRevLinkMaintenanceResult {
  reattach?: ReattachBranchRevLinksResult
  reattachError?: string
  candidates?: GenerateBranchRevLinkCandidatesResult
  candidatesError?: string
}

// Run after every REV sheet sync: first migrate confirmed links onto moved
// rows, then regenerate candidates (with auto-confirm) for whatever is left.
// Failures are reported but never break the sheet sync itself.
export async function runBranchRevLinkMaintenance(): Promise<BranchRevLinkMaintenanceResult> {
  const result: BranchRevLinkMaintenanceResult = {}

  try {
    result.reattach = await reattachBranchRevConfirmedLinks()
  } catch (error) {
    result.reattachError = error instanceof Error ? error.message : String(error)
    console.error("[crm-source-links] REV link reattach failed", error)
  }

  try {
    result.candidates = await generateBranchRevLinkCandidates()
  } catch (error) {
    result.candidatesError = error instanceof Error ? error.message : String(error)
    console.error("[crm-source-links] REV candidate generation failed", error)
  }

  return result
}
