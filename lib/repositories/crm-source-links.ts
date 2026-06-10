import "server-only"

import {
  getBranchRevSourceRecordKey,
  normalizeCrmName,
  normalizeCrmOwnerName,
  scoreCrmEntityMatch,
  type CrmMatchAliasInput,
} from "@/lib/crm-source-linking"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

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
}

export interface GenerateExternalCrmLinkCandidatesResult {
  scannedExternalRecords: number
  generatedCandidates: number
  insertedCandidates: number
  skippedExisting: number
}

export interface GenerateLeadLinkCandidatesResult {
  scannedLeads: number
  generatedCandidates: number
  insertedCandidates: number
  skippedExisting: number
}

export interface GenerateAllCrmLinkCandidatesResult {
  branchRev: GenerateBranchRevLinkCandidatesResult
  leads: GenerateLeadLinkCandidatesResult
  xiaoshouyi: GenerateExternalCrmLinkCandidatesResult
}

export type CrmSourceLinkAction = "confirm" | "reject" | "stale"
export type CrmManualLinkTargetType = "partner_account" | "customer" | "deal"

export interface CrmManualLinkTargetOption {
  targetType: CrmManualLinkTargetType
  targetId: string
  label: string
  confidence: number
  evidence: string[]
}

const SHEET_INACTIVE_PATTERN = /취소|해지|드랍|드롭|중단|보류|cancel|drop|lost/i
const MIN_CONFIDENCE = 0.72
const MIN_EVIDENCE_REVIEW_CONFIDENCE = 0.45
const MAX_CANDIDATES_PER_SOURCE = 5
const MAX_MANUAL_SEARCH_RESULTS = 8

function buildCandidateKey(candidate: {
  source_object?: string
  source_record_key: string
  target_type: string
  target_id: string
}) {
  return `${candidate.source_object ?? ""}:${candidate.source_record_key}:${candidate.target_type}:${candidate.target_id}`
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

async function getCrmMatchAliases(): Promise<CrmMatchAliasInput[]> {
  const sb = createSupabaseAdminClient()
  const [aliasResult, confirmedLeadLinksResult] = await Promise.all([
    sb
      .from("crm_match_aliases")
      .select("alias, canonical_name, target_type, target_id, manager_name, confidence_boost")
      .eq("status", "active")
      .limit(5000),
    sb
      .from("crm_source_links")
      .select("normalized_name, target_type, target_id, metadata")
      .eq("source_system", "lead")
      .eq("source_object", "leads")
      .eq("status", "confirmed")
      .limit(5000),
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

export async function generateBranchRevLinkCandidates(): Promise<GenerateBranchRevLinkCandidatesResult> {
  const sb = createSupabaseAdminClient()

  const [sheetResult, partnerAccountsResult, customersResult, dealsResult, linksResult, aliases] = await Promise.all([
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
    getCrmMatchAliases(),
  ])

  if (sheetResult.error) throw sheetResult.error
  if (partnerAccountsResult.error) throw partnerAccountsResult.error
  if (customersResult.error) throw customersResult.error
  if (dealsResult.error) throw dealsResult.error
  if (linksResult.error) throw linksResult.error

  const sheetDeals = ((sheetResult.data ?? []) as BranchRevCandidateSource[]).filter(
    (deal) => !SHEET_INACTIVE_PATTERN.test(deal.status ?? "")
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

  const candidates: CandidateInsert[] = []

  for (const source of sheetDeals) {
    const sourceRecordKey = getBranchRevSourceRecordKey(source)
    if (existingConfirmedSources.has(sourceRecordKey)) continue

    const sourceOwner = source.manager ?? source.team
    const scoredTargets = [
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
      .filter(shouldKeepScoredMatch)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_CANDIDATES_PER_SOURCE)

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

  if (rowsToInsert.length > 0) {
    const { error } = await sb.from("crm_source_links").insert(rowsToInsert)
    if (error) throw error
  }

  return {
    scannedSheetDeals: sheetDeals.length,
    generatedCandidates: candidates.length,
    insertedCandidates: rowsToInsert.length,
    skippedExisting: candidates.length - rowsToInsert.length,
  }
}

export async function generateExternalCrmLinkCandidates(): Promise<GenerateExternalCrmLinkCandidatesResult> {
  const sb = createSupabaseAdminClient()

  const [recordsResult, partnerAccountsResult, customersResult, dealsResult, linksResult, aliases] =
    await Promise.all([
      sb
        .from("external_crm_records")
        .select("object_api_key, external_id, normalized_name, display_name, owner_name, status, amount, occurred_at, synced_at, is_stale")
        .eq("source_system", "xiaoshouyi")
        .eq("is_stale", false)
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
        .eq("source_system", "xiaoshouyi")
        .limit(5000),
      getCrmMatchAliases(),
    ])

  if (recordsResult.error) throw recordsResult.error
  if (partnerAccountsResult.error) throw partnerAccountsResult.error
  if (customersResult.error) throw customersResult.error
  if (dealsResult.error) throw dealsResult.error
  if (linksResult.error) throw linksResult.error

  const records = ((recordsResult.data ?? []) as ExternalCrmRecordSource[]).filter((record) => !record.is_stale)
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

  const candidates: CandidateInsert[] = []

  for (const record of records) {
    const sourceLabel = getExternalCrmRecordLabel(record)
    const normalizedSourceLabel = record.normalized_name ?? normalizeCrmName(sourceLabel)
    if (normalizedSourceLabel.length < 2) continue
    if (existingConfirmedSources.has(`${record.object_api_key}:${record.external_id}`)) continue

    const targetTypes = new Set(getExternalCrmTargetTypes(record.object_api_key))
    const scoredTargets = [
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
      .filter(shouldKeepScoredMatch)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_CANDIDATES_PER_SOURCE)

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

  if (rowsToInsert.length > 0) {
    const { error } = await sb.from("crm_source_links").insert(rowsToInsert)
    if (error) throw error
  }

  return {
    scannedExternalRecords: records.length,
    generatedCandidates: candidates.length,
    insertedCandidates: rowsToInsert.length,
    skippedExisting: candidates.length - rowsToInsert.length,
  }
}

export async function generateLeadLinkCandidates(): Promise<GenerateLeadLinkCandidatesResult> {
  const sb = createSupabaseAdminClient()

  const [leadsResult, partnerAccountsResult, customersResult, dealsResult, linksResult, aliases] = await Promise.all([
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
    getCrmMatchAliases(),
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

  const candidates: CandidateInsert[] = []

  for (const lead of leads) {
    if (existingConfirmedSources.has(lead.id)) continue
    const sourceLabel = getLeadSourceLabel(lead)
    const normalizedSourceLabel = normalizeCrmName(sourceLabel)
    if (normalizedSourceLabel.length < 2) continue

    const scoredTargets = [
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
      .filter(shouldKeepScoredMatch)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_CANDIDATES_PER_SOURCE)

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

  if (rowsToInsert.length > 0) {
    const { error } = await sb.from("crm_source_links").insert(rowsToInsert)
    if (error) throw error
  }

  return {
    scannedLeads: leads.length,
    generatedCandidates: candidates.length,
    insertedCandidates: rowsToInsert.length,
    skippedExisting: candidates.length - rowsToInsert.length,
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
    getCrmMatchAliases(),
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
  const aliases = await getCrmMatchAliases()
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

export async function updateCrmSourceLinkStatus(
  id: string,
  action: CrmSourceLinkAction,
  actorUserId?: string | null
) {
  const sb = createSupabaseAdminClient()
  const { data: link, error: readError } = await sb
    .from("crm_source_links")
    .select("id, source_system, source_object, source_record_key, normalized_name, target_type, target_id, metadata")
    .eq("id", id)
    .maybeSingle()

  if (readError) throw readError
  if (!link) throw new Error("CRM source link not found")

  if (action === "confirm") {
    const { error: staleError } = await sb
      .from("crm_source_links")
      .update({ status: "stale", confirmed_by: null, confirmed_at: null })
      .eq("source_system", link.source_system)
      .eq("source_object", link.source_object)
      .eq("source_record_key", link.source_record_key)
      .neq("id", link.id)
      .in("status", ["candidate", "confirmed"])

    if (staleError) throw staleError

    const { data, error } = await sb
      .from("crm_source_links")
      .update({
        status: "confirmed",
        confirmed_by: actorUserId ?? null,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", link.id)
      .select("id, status")
      .single()

    if (error) throw error
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
