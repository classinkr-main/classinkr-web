// 리드 → CRM(고객·거래) 전환 코어.
//
// 원래 app/api/admin/leads/[id]/convert-v2/route.ts 본문에 있던 로직을 그대로 옮긴 것이다.
// 단건 라우트와 단체 전환 라우트(app/api/admin/leads/bulk-convert)가 같은 함수를 호출해야
// 멱등 판정(crm_source_links → notes 마커)·활동 로그·소스 링크 기록이 한 곳에서만 정의된다.
// 두 라우트가 각자 전환 절차를 들고 있으면 한쪽만 고쳐지는 순간 "단체로 전환했더니 계보가
// 안 남았다" 같은 어긋남이 조용히 생긴다.

import "server-only"

import { createDeal } from "@/lib/portal/repositories/deals"
import { createCustomer } from "@/lib/portal/repositories/customers"
import { logActivity } from "@/lib/portal/repositories/activity"
import type { Customer, Deal } from "@/lib/portal/types"
import { getLeadById, updateLead, type LeadRecord } from "@/lib/repositories/leads"
import {
  findConfirmedLeadConversionLink,
  upsertConfirmedLeadCustomerLink,
} from "@/lib/repositories/crm-source-links"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getLeadMagnetTitleFromStore } from "@/lib/repositories/lead-magnets"

const ADMIN_QUOTE_PARTNER_ACCOUNT_NAME = "Classin Direct Sales"

const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
  meta_lead_ads: "Meta 리드",
}

export function getLeadCustomerName(lead: LeadRecord) {
  return lead.org?.trim() || lead.name?.trim() || lead.email?.trim() || lead.phone?.trim() || `리드 ${lead.id.slice(0, 8)}`
}

async function getLeadMagnetLabel(value?: string) {
  if (!value) return ""
  const title = await getLeadMagnetTitleFromStore(value)
  if (title) return title
  return value
    .split(/[-_:]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

async function buildLeadConversionNotes(lead: LeadRecord) {
  const leadMagnetLabel = await getLeadMagnetLabel(lead.lead_magnet)
  const lines = [
    "[리드 전환]",
    `원본 리드 ID: ${lead.id}`,
    `유입일: ${new Date(lead.timestamp).toLocaleString("ko-KR")}`,
    `유입 경로: ${SOURCE_LABEL[lead.source] ?? lead.source}`,
    lead.source_detail ? `Source Detail: ${lead.source_detail}` : null,
    lead.lead_magnet ? `Lead Magnet: ${leadMagnetLabel || lead.lead_magnet}` : null,
    lead.role ? `역할: ${lead.role}` : null,
    lead.size ? `규모: ${lead.size}` : null,
    lead.branch ? `지역/브랜치: ${lead.branch}` : null,
    lead.assigned_to ? `담당자: ${lead.assigned_to}` : null,
    lead.utm_source ? `UTM Source: ${lead.utm_source}` : null,
    lead.utm_medium ? `UTM Medium: ${lead.utm_medium}` : null,
    lead.utm_campaign ? `UTM Campaign: ${lead.utm_campaign}` : null,
    lead.landing_page ? `Landing Page: ${lead.landing_page}` : null,
    lead.current_page ? `Current Page: ${lead.current_page}` : null,
    lead.referrer ? `Referrer: ${lead.referrer}` : null,
  ].filter((line): line is string => Boolean(line))

  if (lead.message?.trim()) {
    lines.push("", "[문의 내용]", lead.message.trim())
  }

  if (lead.notes?.trim()) {
    lines.push("", "[기존 메모]", lead.notes.trim())
  }

  return lines.join("\n")
}

function buildConvertedLeadNotes(lead: LeadRecord, customer: Customer, deal: Deal) {
  const conversionSummary = [
    "[CRM 전환]",
    `전환일: ${new Date().toLocaleString("ko-KR")}`,
    `고객: ${customer.name} (${customer.id})`,
    `거래: ${deal.deal_code} · ${deal.title} (${deal.id})`,
  ].join("\n")

  if (!lead.notes?.trim()) return conversionSummary
  if (lead.notes.includes(customer.id) || lead.notes.includes(deal.id)) return lead.notes
  return `${lead.notes.trim()}\n\n${conversionSummary}`
}

async function getOrCreateAdminQuotePartnerAccountId(createdBy?: string | null) {
  const supabase = createSupabaseAdminClient()

  const { data: existingRows, error: existingError } = await supabase
    .from("partner_accounts")
    .select("id")
    .eq("name", ADMIN_QUOTE_PARTNER_ACCOUNT_NAME)
    .order("created_at", { ascending: true })
    .limit(1)

  if (existingError) throw existingError
  const existing = existingRows?.[0]
  if (existing?.id) return existing.id as string

  const { data: created, error: createError } = await supabase
    .from("partner_accounts")
    .insert({
      name: ADMIN_QUOTE_PARTNER_ACCOUNT_NAME,
      owner_name: "Classin Korea",
      status: "active",
      notes: "Auto-created for admin CRM lead conversion and quick quotes.",
      created_by: createdBy ?? null,
    })
    .select("id")
    .single()

  if (createError) throw createError
  return created.id as string
}

type ExistingLeadConversion = {
  customer: Customer | null
  deal: Deal | null
  matchedBy: "source_link" | "notes_marker" | null
}

function buildLeadMarker(leadId: string) {
  return `%원본 리드 ID: ${leadId}%`
}

async function findLatestMarkerDealForCustomer(customerId: string, leadId: string) {
  const supabase = createSupabaseAdminClient()
  const { data: dealRows, error: dealError } = await supabase
    .from("deals")
    .select("*")
    .eq("customer_id", customerId)
    .ilike("notes", buildLeadMarker(leadId))
    .order("created_at", { ascending: false })
    .limit(1)

  if (dealError) throw dealError
  return (dealRows?.[0] as Deal | undefined) ?? null
}

// ① 정식 링크(crm_source_links confirmed) 기반 멱등 판정 — 노트 편집과 무관한 SSOT.
async function findLeadConversionBySourceLink(leadId: string): Promise<ExistingLeadConversion | null> {
  let link: Awaited<ReturnType<typeof findConfirmedLeadConversionLink>> = null
  try {
    link = await findConfirmedLeadConversionLink(leadId)
  } catch (linkError) {
    // 링크 조회 실패는 레거시 마커 판정으로 폴백 — 전환 자체를 막지 않는다.
    console.warn("[lead-conversion] source link lookup failed", linkError)
    return null
  }
  if (!link) return null

  const supabase = createSupabaseAdminClient()
  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", link.customerId)
    .maybeSingle()

  if (customerError) throw customerError
  const customer = (customerRow as Customer | null) ?? null
  // 링크가 삭제된 고객을 가리키면 레거시/신규 생성 경로로 폴백.
  if (!customer) return null

  let deal: Deal | null = null
  if (link.dealId) {
    const { data: dealRow, error: dealError } = await supabase
      .from("deals")
      .select("*")
      .eq("id", link.dealId)
      .maybeSingle()

    if (dealError) throw dealError
    deal = (dealRow as Deal | null) ?? null
  }

  // 링크 metadata에 딜 계보가 없으면(매칭 인박스 수동 확정 등) 마커 딜로 보강.
  if (!deal) {
    deal = await findLatestMarkerDealForCustomer(customer.id, leadId)
  }

  return { customer, deal, matchedBy: "source_link" }
}

// ② 레거시 호환 — customers.notes '원본 리드 ID:' 텍스트 마커 판정.
async function findLeadConversionByNotesMarker(leadId: string): Promise<ExistingLeadConversion> {
  const supabase = createSupabaseAdminClient()

  const { data: customerRows, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .ilike("notes", buildLeadMarker(leadId))
    .order("created_at", { ascending: false })
    .limit(1)

  if (customerError) throw customerError
  const customer = customerRows?.[0] as Customer | undefined
  if (!customer) return { customer: null, deal: null, matchedBy: null }

  return {
    customer,
    deal: await findLatestMarkerDealForCustomer(customer.id, leadId),
    matchedBy: "notes_marker",
  }
}

async function findExistingLeadConversion(leadId: string): Promise<ExistingLeadConversion> {
  const byLink = await findLeadConversionBySourceLink(leadId)
  if (byLink) return byLink
  return findLeadConversionByNotesMarker(leadId)
}

/** 전환이 성립하지 못한 사유. 라우트가 HTTP 상태로 옮긴다(예외와 구분되는 "정상 거절"). */
export type LeadConversionFailureCode = "not_found" | "already_converted" | "lead_update_failed"

export const LEAD_CONVERSION_FAILURE_STATUS: Record<LeadConversionFailureCode, number> = {
  not_found: 404,
  already_converted: 409,
  lead_update_failed: 500,
}

export interface LeadConversionSuccess {
  ok: true
  customer: Customer
  deal: Deal
  lead: LeadRecord
  sourceLinkCreated: boolean
  matchedBy: "source_link" | "notes_marker" | null
  reusedExisting: { customer: boolean; deal: boolean }
  /** 전환 직후 동선 — 딜 포커스 딥링크 + 통합 고객 검색 딥링크. */
  links: { deal: string; customer: string }
}

export interface LeadConversionFailure {
  ok: false
  code: LeadConversionFailureCode
  error: string
}

export type LeadConversionResult = LeadConversionSuccess | LeadConversionFailure

export interface ConvertLeadActor {
  userId?: string | null
  role: string
}

/**
 * 리드 1건을 CRM 고객·거래로 전환한다.
 *
 * 이미 전환된 리드는 예외가 아니라 `ok:false`로 돌려준다 — 단체 전환에서 한 건이 이미
 * 전환됐다는 이유로 나머지 전부가 실패하면 안 되기 때문이다. DB 오류 등 진짜 사고는
 * 그대로 throw해 호출부(라우트)가 500으로 처리한다.
 */
export async function convertLeadToCrm(
  leadId: string,
  actor: ConvertLeadActor
): Promise<LeadConversionResult> {
  const lead = await getLeadById(leadId)
  if (!lead) return { ok: false, code: "not_found", error: "리드를 찾을 수 없습니다." }
  if (lead.status === "converted") {
    return { ok: false, code: "already_converted", error: "이미 전환된 리드입니다." }
  }

  const conversionNotes = await buildLeadConversionNotes(lead)
  const existingConversion = await findExistingLeadConversion(lead.id)
  const partnerAccountId =
    existingConversion.customer?.partner_account_id ??
    await getOrCreateAdminQuotePartnerAccountId(actor.userId ?? null)

  const customer =
    existingConversion.customer ??
    await createCustomer({
      partner_account_id: partnerAccountId,
      name: getLeadCustomerName(lead),
      contact_name: lead.name?.trim() || null,
      email: lead.email?.trim() || null,
      phone: lead.phone?.trim() || null,
      address: null,
      business_number: null,
      campus_name: null,
      region_label: lead.branch?.trim() || null,
      notes: conversionNotes,
      created_by: actor.userId ?? null,
    })

  if (!existingConversion.customer) {
    await logActivity({
      partner_account_id: customer.partner_account_id,
      customer_id: customer.id,
      deal_id: null,
      actor_user_id: actor.userId ?? null,
      actor_role: actor.role,
      action_type: "create",
      target_type: "customer",
      target_id: customer.id,
      summary: `리드 "${getLeadCustomerName(lead)}"에서 고객 "${customer.name}" 생성`,
      before_json: null,
      after_json: customer as unknown as Record<string, unknown>,
    })
  }

  const deal =
    existingConversion.deal ??
    await createDeal({
      partner_account_id: customer.partner_account_id,
      customer_id: customer.id,
      title: `${customer.name} 리드 상담`,
      status: "active",
      current_stage: "contact",
      expected_amount: 0,
      contracted_amount: 0,
      installed_amount: 0,
      paid_amount: 0,
      outstanding_amount: 0,
      payment_status: "unpaid",
      starts_at: null,
      closed_at: null,
      notes: conversionNotes,
      created_by: actor.userId ?? null,
      owner_id: actor.userId ?? null,
    })

  if (!existingConversion.deal) {
    await logActivity({
      partner_account_id: customer.partner_account_id,
      customer_id: customer.id,
      deal_id: deal.id,
      actor_user_id: actor.userId ?? null,
      actor_role: actor.role,
      action_type: "create",
      target_type: "deal",
      target_id: deal.id,
      summary: `리드 "${getLeadCustomerName(lead)}"에서 거래 "${deal.title}" 생성`,
      before_json: null,
      after_json: deal as unknown as Record<string, unknown>,
    })
  }

  const updatedLead = await updateLead(lead.id, {
    status: "converted",
    notes: buildConvertedLeadNotes(lead, customer, deal),
  })

  if (!updatedLead) {
    return {
      ok: false,
      code: "lead_update_failed",
      error: "리드를 전환 완료 상태로 바꾸지 못했습니다.",
    }
  }

  let sourceLinkCreated = false
  try {
    await upsertConfirmedLeadCustomerLink({
      leadId: lead.id,
      sourceLabel: getLeadCustomerName(lead),
      customerId: customer.id,
      customerLabel: customer.name,
      actorUserId: actor.userId,
      metadata: {
        lead_source: lead.source,
        source_detail: lead.source_detail ?? null,
        lead_magnet: lead.lead_magnet ?? null,
        deal_id: deal.id,
        deal_code: deal.deal_code,
      },
    })
    sourceLinkCreated = true
  } catch (sourceLinkError) {
    console.warn("[lead-conversion] source link failed", sourceLinkError)
  }

  return {
    ok: true,
    customer,
    deal,
    lead: updatedLead,
    sourceLinkCreated,
    matchedBy: existingConversion.matchedBy,
    reusedExisting: {
      customer: Boolean(existingConversion.customer),
      deal: Boolean(existingConversion.deal),
    },
    links: {
      deal: `/admin/crm/deals/orders?deal=${encodeURIComponent(deal.id)}`,
      customer: `/admin/crm/customers/unified?q=${encodeURIComponent(customer.name)}`,
    },
  }
}
