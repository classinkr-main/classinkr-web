import "server-only"

import {
  getBranchRevSourceRecordKey,
  normalizeCrmName,
  scoreCrmNameMatch,
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

interface CustomerCandidateTarget {
  id: string
  name: string
  campus_name: string | null
}

interface DealCandidateTarget {
  id: string
  title: string
  deal_code: string
}

interface ExistingSourceLink {
  source_record_key: string
  target_type: string
  target_id: string
  status: string
}

interface CandidateInsert {
  source_system: "branch_rev_sheet"
  source_object: "branch_rev_deals"
  source_record_key: string
  normalized_name: string
  target_type: "customer" | "deal"
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

export type CrmSourceLinkAction = "confirm" | "reject" | "stale"
export type CrmManualLinkTargetType = "customer" | "deal"

export interface CrmManualLinkTargetOption {
  targetType: CrmManualLinkTargetType
  targetId: string
  label: string
  confidence: number
}

const SHEET_INACTIVE_PATTERN = /취소|해지|드랍|드롭|중단|보류|cancel|drop|lost/i
const MIN_CONFIDENCE = 0.72
const MAX_CANDIDATES_PER_SOURCE = 3
const MAX_MANUAL_SEARCH_RESULTS = 8

function buildCandidateKey(candidate: { source_record_key: string; target_type: string; target_id: string }) {
  return `${candidate.source_record_key}:${candidate.target_type}:${candidate.target_id}`
}

function buildSourceTargetLabel(target: CustomerCandidateTarget | DealCandidateTarget) {
  if ("deal_code" in target) return `${target.deal_code} · ${target.title}`
  return [target.name, target.campus_name].filter(Boolean).join(" · ")
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

  const [sheetResult, customersResult, dealsResult, linksResult] = await Promise.all([
    sb
      .from("branch_rev_deals")
      .select("sheet_row, customer_name, team, manager, status, first_payment, contract_target")
      .limit(1000),
    sb
      .from("customers")
      .select("id, name, campus_name")
      .limit(2000),
    sb
      .from("deals")
      .select("id, title, deal_code")
      .limit(2000),
    sb
      .from("crm_source_links")
      .select("source_record_key, target_type, target_id, status")
      .eq("source_system", "branch_rev_sheet")
      .eq("source_object", "branch_rev_deals")
      .limit(5000),
  ])

  if (sheetResult.error) throw sheetResult.error
  if (customersResult.error) throw customersResult.error
  if (dealsResult.error) throw dealsResult.error
  if (linksResult.error) throw linksResult.error

  const sheetDeals = ((sheetResult.data ?? []) as BranchRevCandidateSource[]).filter(
    (deal) => !SHEET_INACTIVE_PATTERN.test(deal.status ?? "")
  )
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

    const scoredTargets = [
      ...customers.map((customer) => ({
        targetType: "customer" as const,
        targetId: customer.id,
        targetLabel: buildSourceTargetLabel(customer),
        confidence: scoreCrmNameMatch(source.customer_name, buildSourceTargetLabel(customer)),
      })),
      ...deals.map((deal) => ({
        targetType: "deal" as const,
        targetId: deal.id,
        targetLabel: buildSourceTargetLabel(deal),
        confidence: scoreCrmNameMatch(source.customer_name, buildSourceTargetLabel(deal)),
      })),
    ]
      .filter((target) => target.confidence >= MIN_CONFIDENCE)
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

export async function searchManualCrmLinkTargets(
  query: string,
  sourceRecordKey?: string
): Promise<CrmManualLinkTargetOption[]> {
  const normalizedQuery = normalizeCrmName(query)
  if (normalizedQuery.length < 2) return []

  const sb = createSupabaseAdminClient()
  const [customersResult, dealsResult, source] = await Promise.all([
    sb
      .from("customers")
      .select("id, name, campus_name")
      .limit(2000),
    sb
      .from("deals")
      .select("id, title, deal_code")
      .limit(2000),
    sourceRecordKey ? findBranchRevSourceByKey(sourceRecordKey) : Promise.resolve(null),
  ])

  if (customersResult.error) throw customersResult.error
  if (dealsResult.error) throw dealsResult.error

  const sourceName = source?.customer_name ?? query
  const options: CrmManualLinkTargetOption[] = [
    ...((customersResult.data ?? []) as CustomerCandidateTarget[]).map((customer) => {
      const label = buildSourceTargetLabel(customer)
      return {
        targetType: "customer" as const,
        targetId: customer.id,
        label,
        confidence: scoreCrmNameMatch(sourceName, label),
      }
    }),
    ...((dealsResult.data ?? []) as DealCandidateTarget[]).map((deal) => {
      const label = buildSourceTargetLabel(deal)
      return {
        targetType: "deal" as const,
        targetId: deal.id,
        label,
        confidence: scoreCrmNameMatch(sourceName, label),
      }
    }),
  ]

  return options
    .filter((option) => {
      const normalizedLabel = normalizeCrmName(option.label)
      return normalizedLabel.includes(normalizedQuery) || option.confidence >= 0.35
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
    input.targetType === "customer"
      ? await sb.from("customers").select("id, name, campus_name").eq("id", input.targetId).maybeSingle()
      : await sb.from("deals").select("id, title, deal_code").eq("id", input.targetId).maybeSingle()

  if (targetResult.error) throw targetResult.error
  if (!targetResult.data) throw new Error("CRM target not found")

  const targetLabel = buildSourceTargetLabel(targetResult.data as CustomerCandidateTarget | DealCandidateTarget)
  const confidence = scoreCrmNameMatch(source.customer_name, targetLabel)
  const row: CandidateInsert = {
    source_system: "branch_rev_sheet",
    source_object: "branch_rev_deals",
    source_record_key: input.sourceRecordKey,
    normalized_name: normalizeCrmName(source.customer_name),
    target_type: input.targetType,
    target_id: input.targetId,
    confidence: Number(confidence.toFixed(4)),
    status: "candidate",
    metadata: {
      manual: true,
      sheet_row: source.sheet_row,
      source_customer_name: source.customer_name,
      source_owner: [source.team, source.manager].filter(Boolean).join(" · ") || null,
      source_status: source.status,
      target_label: targetLabel,
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

export async function updateCrmSourceLinkStatus(
  id: string,
  action: CrmSourceLinkAction,
  actorUserId?: string | null
) {
  const sb = createSupabaseAdminClient()
  const { data: link, error: readError } = await sb
    .from("crm_source_links")
    .select("id, source_system, source_object, source_record_key")
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
