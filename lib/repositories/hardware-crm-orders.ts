import "server-only"

import { normalizeQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type HardwareCrmOrderSource = "portal_deal" | "portal_quote" | "legacy_quote" | "external_crm"
export type HardwareCrmOrderConfidence = "high" | "medium" | "low"

export interface HardwareCrmOrderCandidate {
  id: string
  source: HardwareCrmOrderSource
  sourceLabel: string
  referenceNo: string
  title: string
  productName: string | null
  quantity: number | null
  amount: number | null
  customerName: string | null
  owner: string | null
  status: string | null
  occurredAt: string | null
  syncedAt: string | null
  href: string | null
  confidence: HardwareCrmOrderConfidence
  reason: string
}

export interface HardwareCrmOrderCandidateInput {
  productName?: string | null
  quantity?: number | null
}

export interface HardwareCrmOrderCandidateResult {
  candidates: HardwareCrmOrderCandidate[]
  warnings: string[]
}

interface DealLineItemRow {
  id: string
  deal_id: string
  product_name: string
  quantity: number | string | null
  amount: number | string | null
  updated_at?: string | null
}

interface DealRow {
  id: string
  title: string | null
  status: string | null
  current_stage: string | null
  customer_id: string | null
  updated_at: string | null
}

interface CustomerRow {
  id: string
  name: string | null
  contact_name: string | null
  campus_name: string | null
}

interface ExternalCrmRecordRow {
  id: string
  external_id: string
  normalized_name: string | null
  display_name: string | null
  owner_name: string | null
  status: string | null
  amount: number | string | null
  occurred_at: string | null
  synced_at: string | null
}

function cleanString(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text.length ? text : null
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeForMatch(value: unknown) {
  return cleanString(value)
    ?.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "") ?? ""
}

function productSearchTerm(productName: string | null | undefined) {
  const text = cleanString(productName)
  if (!text) return null
  return text.replace(/[%_]/g, "").slice(0, 80)
}

function confidenceFromMatch(input: {
  candidateText: string
  productName?: string | null
  candidateQuantity?: number | null
  requestedQuantity?: number | null
  localLineItem: boolean
}): HardwareCrmOrderConfidence {
  const productNeedle = normalizeForMatch(input.productName)
  const candidateHaystack = normalizeForMatch(input.candidateText)
  const productMatched = productNeedle.length >= 2 && candidateHaystack.includes(productNeedle)
  const quantityMatched =
    input.requestedQuantity != null &&
    input.candidateQuantity != null &&
    input.requestedQuantity === input.candidateQuantity

  if (productMatched && quantityMatched) return "high"
  if (productMatched || (input.localLineItem && quantityMatched)) return "medium"
  return "low"
}

function candidateRank(candidate: HardwareCrmOrderCandidate) {
  const confidenceRank: Record<HardwareCrmOrderConfidence, number> = {
    high: 0,
    medium: 1,
    low: 2,
  }
  const sourceRank: Record<HardwareCrmOrderSource, number> = {
    portal_deal: 0,
    portal_quote: 1,
    legacy_quote: 2,
    external_crm: 3,
  }
  return confidenceRank[candidate.confidence] * 10 + sourceRank[candidate.source]
}

async function listPortalDealCandidates(input: HardwareCrmOrderCandidateInput): Promise<HardwareCrmOrderCandidate[]> {
  const sb = createSupabaseAdminClient()
  const searchTerm = productSearchTerm(input.productName)

  let lineItemsQuery = sb
    .from("deal_line_items")
    .select("id,deal_id,product_name,quantity,amount,updated_at")
    .order("updated_at", { ascending: false })
    .limit(40)

  if (searchTerm) lineItemsQuery = lineItemsQuery.ilike("product_name", `%${searchTerm}%`)

  const { data: lineItems, error: lineItemsError } = await lineItemsQuery
  if (lineItemsError) throw lineItemsError

  const lineRows = (lineItems ?? []) as DealLineItemRow[]
  if (lineRows.length === 0) return []

  const dealIds = Array.from(new Set(lineRows.map((row) => row.deal_id).filter(Boolean)))
  const { data: deals, error: dealsError } = await sb
    .from("deals")
    .select("id,title,status,current_stage,customer_id,updated_at")
    .in("id", dealIds)
  if (dealsError) throw dealsError

  const dealRows = (deals ?? []) as DealRow[]
  const dealsById = new Map(dealRows.map((deal) => [deal.id, deal]))
  const customerIds = Array.from(new Set(dealRows.map((deal) => deal.customer_id).filter(Boolean))) as string[]
  const customersById = new Map<string, CustomerRow>()

  if (customerIds.length > 0) {
    const { data: customers, error: customersError } = await sb
      .from("customers")
      .select("id,name,contact_name,campus_name")
      .in("id", customerIds)
    if (customersError) throw customersError
    for (const customer of (customers ?? []) as CustomerRow[]) {
      customersById.set(customer.id, customer)
    }
  }

  return lineRows.map((line): HardwareCrmOrderCandidate => {
    const deal = dealsById.get(line.deal_id)
    const customer = deal?.customer_id ? customersById.get(deal.customer_id) : null
    const quantity = toNumber(line.quantity)
    const confidence = confidenceFromMatch({
      candidateText: `${line.product_name} ${deal?.title ?? ""}`,
      productName: input.productName,
      candidateQuantity: quantity,
      requestedQuantity: input.quantity ?? null,
      localLineItem: true,
    })

    return {
      id: `portal:${line.id}`,
      source: "portal_deal",
      sourceLabel: "CRM 딜 라인",
      referenceNo: `deal:${line.deal_id}:line:${line.id}`,
      title: deal?.title ?? line.product_name,
      productName: line.product_name,
      quantity,
      amount: toNumber(line.amount),
      customerName: customer?.name ?? customer?.campus_name ?? customer?.contact_name ?? null,
      owner: null,
      status: deal?.status ?? deal?.current_stage ?? null,
      occurredAt: deal?.updated_at ?? line.updated_at ?? null,
      syncedAt: null,
      href: `/admin/crm/deals/orders?deal=${line.deal_id}`,
      confidence,
      reason:
        confidence === "high"
          ? "품목과 수량이 일치합니다."
          : confidence === "medium"
            ? "품목 또는 수량이 유사합니다."
            : "최근 CRM 딜 라인입니다.",
    }
  })
}

async function listExternalCrmCandidates(input: HardwareCrmOrderCandidateInput): Promise<HardwareCrmOrderCandidate[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("external_crm_records")
    .select("id,external_id,normalized_name,display_name,owner_name,status,amount,occurred_at,synced_at")
    .eq("source_system", "xiaoshouyi")
    .eq("object_api_key", "opportunity")
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(25)
  if (error) throw error

  return ((data ?? []) as ExternalCrmRecordRow[]).map((record): HardwareCrmOrderCandidate => {
    const title = record.display_name ?? record.normalized_name ?? record.external_id
    const confidence = confidenceFromMatch({
      candidateText: title,
      productName: input.productName,
      candidateQuantity: null,
      requestedQuantity: input.quantity ?? null,
      localLineItem: false,
    })

    return {
      id: `external:${record.external_id}`,
      source: "external_crm",
      sourceLabel: "실제 CRM 오더",
      referenceNo: `xiaoshouyi:opportunity:${record.external_id}`,
      title,
      productName: null,
      quantity: null,
      amount: toNumber(record.amount),
      customerName: title,
      owner: record.owner_name,
      status: record.status,
      occurredAt: record.occurred_at,
      syncedAt: record.synced_at,
      href: "/admin/crm/deals",
      confidence,
      reason:
        confidence === "medium"
          ? "오더명에 품목명이 포함되어 있습니다."
          : "최근 실제 CRM 오더입니다.",
    }
  })
}

async function listLegacyQuoteCandidates(input: HardwareCrmOrderCandidateInput): Promise<HardwareCrmOrderCandidate[]> {
  const sb = createSupabaseAdminClient()
  const searchTerm = productSearchTerm(input.productName)

  let itemsQuery = sb
    .from("quote_items")
    .select("id,quote_id,product_name,quantity,amount,sort_order")
    .order("sort_order", { ascending: true })
    .limit(50)

  if (searchTerm) itemsQuery = itemsQuery.ilike("product_name", `%${searchTerm}%`)

  const { data: items, error: itemsError } = await itemsQuery
  if (itemsError) throw itemsError

  const itemRows = (items ?? []) as Array<{
    id: string
    quote_id: string
    product_name: string
    quantity: number | string | null
    amount: number | string | null
  }>
  if (itemRows.length === 0) return []

  const quoteIds = Array.from(new Set(itemRows.map((item) => item.quote_id).filter(Boolean)))
  const { data: quotes, error: quotesError } = await sb
    .from("quotes")
    .select("id,quote_number,title,status,total_amount,accepted_at,sent_at,updated_at")
    .in("id", quoteIds)
  if (quotesError) throw quotesError

  const quotesById = new Map((quotes ?? []).map((quote) => [quote.id, quote as {
    id: string
    quote_number: string
    title: string | null
    status: string | null
    total_amount: number | string | null
    accepted_at: string | null
    sent_at: string | null
    updated_at: string | null
  }]))

  return itemRows.map((line): HardwareCrmOrderCandidate => {
    const quote = quotesById.get(line.quote_id)
    const quantity = toNumber(line.quantity)
    const confidence = confidenceFromMatch({
      candidateText: `${line.product_name} ${quote?.title ?? ""}`,
      productName: input.productName,
      candidateQuantity: quantity,
      requestedQuantity: input.quantity ?? null,
      localLineItem: true,
    })

    return {
      id: `legacy-quote:${line.id}`,
      source: "legacy_quote",
      sourceLabel: "관리자 견적 라인",
      referenceNo: `quote:${line.quote_id}:line:${line.id}`,
      title: quote?.title ?? quote?.quote_number ?? line.product_name,
      productName: line.product_name,
      quantity,
      amount: toNumber(line.amount),
      customerName: null,
      owner: null,
      status: quote?.status ?? null,
      occurredAt: quote?.accepted_at ?? quote?.sent_at ?? quote?.updated_at ?? null,
      syncedAt: null,
      href: quote ? `/admin/quotes/${quote.id}/view` : null,
      confidence,
      reason:
        confidence === "high"
          ? "견적 품목과 수량이 일치합니다."
          : confidence === "medium"
            ? "견적 품목 또는 수량이 유사합니다."
            : "최근 관리자 견적 라인입니다.",
    }
  })
}

async function listPortalQuoteCandidates(input: HardwareCrmOrderCandidateInput): Promise<HardwareCrmOrderCandidate[]> {
  const sb = createSupabaseAdminClient()
  const { data: documents, error: documentsError } = await sb
    .from("quote_documents")
    .select("id,deal_id,quote_number,current_version_id,status,updated_at,created_at")
    .order("updated_at", { ascending: false })
    .limit(40)
  if (documentsError) throw documentsError

  const documentRows = (documents ?? []) as Array<{
    id: string
    deal_id: string
    quote_number: string
    current_version_id: string | null
    status: string | null
    updated_at: string | null
    created_at: string | null
  }>
  const versionIds = Array.from(new Set(documentRows.map((doc) => doc.current_version_id).filter(Boolean))) as string[]
  if (versionIds.length === 0) return []

  const { data: versions, error: versionsError } = await sb
    .from("quote_document_versions")
    .select("id,quote_document_id,version_number,title,structured_json,total_amount,valid_until,created_at")
    .in("id", versionIds)
  if (versionsError) throw versionsError

  const versionRows = (versions ?? []) as Array<{
    id: string
    quote_document_id: string
    version_number: number
    title: string | null
    structured_json: Record<string, unknown> | null
    total_amount: number | string | null
    valid_until: string | null
    created_at: string | null
  }>
  const versionsById = new Map(versionRows.map((version) => [version.id, version]))

  const dealIds = Array.from(new Set(documentRows.map((doc) => doc.deal_id).filter(Boolean)))
  const { data: deals, error: dealsError } = await sb
    .from("deals")
    .select("id,title,status,current_stage,customer_id,updated_at")
    .in("id", dealIds)
  if (dealsError) throw dealsError

  const dealRows = (deals ?? []) as DealRow[]
  const dealsById = new Map(dealRows.map((deal) => [deal.id, deal]))
  const customerIds = Array.from(new Set(dealRows.map((deal) => deal.customer_id).filter(Boolean))) as string[]
  const customersById = new Map<string, CustomerRow>()
  if (customerIds.length > 0) {
    const { data: customers, error: customersError } = await sb
      .from("customers")
      .select("id,name,contact_name,campus_name")
      .in("id", customerIds)
    if (customersError) throw customersError
    for (const customer of (customers ?? []) as CustomerRow[]) {
      customersById.set(customer.id, customer)
    }
  }

  const searchNeedle = normalizeForMatch(input.productName)
  const candidates: HardwareCrmOrderCandidate[] = []
  for (const document of documentRows) {
    const version = document.current_version_id ? versionsById.get(document.current_version_id) : null
    if (!version) continue
    const deal = dealsById.get(document.deal_id)
    const customer = deal?.customer_id ? customersById.get(deal.customer_id) : null
    const details = normalizeQuoteDetailsFromStructuredJson(version.structured_json, {})
    const lineItems = details.lineItems ?? []

    lineItems.forEach((line, index) => {
      if (line.itemType && line.itemType !== "hardware") return
      if (searchNeedle && !normalizeForMatch(`${line.itemName} ${line.itemDescription ?? ""}`).includes(searchNeedle)) return

      const quantity = toNumber(line.quantity)
      const confidence = confidenceFromMatch({
        candidateText: `${line.itemName} ${line.itemDescription ?? ""} ${deal?.title ?? ""}`,
        productName: input.productName,
        candidateQuantity: quantity,
        requestedQuantity: input.quantity ?? null,
        localLineItem: true,
      })

      candidates.push({
        id: `portal-quote:${version.id}:${line.id ?? index}`,
        source: "portal_quote",
        sourceLabel: "포털 견적 라인",
        referenceNo: `portal-quote:${document.id}:line:${line.id ?? index + 1}`,
        title: version.title ?? document.quote_number,
        productName: line.itemName,
        quantity,
        amount: toNumber(line.lineSupplyAmount),
        customerName: customer?.name ?? customer?.campus_name ?? customer?.contact_name ?? null,
        owner: null,
        status: document.status ?? deal?.status ?? deal?.current_stage ?? null,
        occurredAt: document.updated_at ?? version.created_at ?? deal?.updated_at ?? null,
        syncedAt: null,
        href: null,
        confidence,
        reason:
          confidence === "high"
            ? "포털 견적 품목과 수량이 일치합니다."
            : confidence === "medium"
              ? "포털 견적 품목 또는 수량이 유사합니다."
              : "최근 포털 견적 라인입니다.",
      })
    })
  }

  return candidates
}

export async function listHardwareCrmOrderCandidates(
  input: HardwareCrmOrderCandidateInput
): Promise<HardwareCrmOrderCandidateResult> {
  const warnings: string[] = []
  const candidateGroups = await Promise.allSettled([
    listPortalDealCandidates(input),
    listPortalQuoteCandidates(input),
    listLegacyQuoteCandidates(input),
    listExternalCrmCandidates(input),
  ])

  const candidates: HardwareCrmOrderCandidate[] = []
  for (const result of candidateGroups) {
    if (result.status === "fulfilled") {
      candidates.push(...result.value)
    } else {
      warnings.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
    }
  }

  return {
    candidates: candidates
      .sort((a, b) => {
        const rankGap = candidateRank(a) - candidateRank(b)
        if (rankGap !== 0) return rankGap
        return new Date(b.occurredAt ?? b.syncedAt ?? 0).getTime() - new Date(a.occurredAt ?? a.syncedAt ?? 0).getTime()
      })
      .slice(0, 12),
    warnings,
  }
}
