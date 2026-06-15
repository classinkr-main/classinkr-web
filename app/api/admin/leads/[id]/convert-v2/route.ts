import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { createDeal } from "@/lib/portal/repositories/deals"
import { createCustomer } from "@/lib/portal/repositories/customers"
import { logActivity } from "@/lib/portal/repositories/activity"
import type { Customer, Deal } from "@/lib/portal/types"
import { getLeadById, updateLead, type LeadRecord } from "@/lib/repositories/leads"
import { upsertConfirmedLeadCustomerLink } from "@/lib/repositories/crm-source-links"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getLeadMagnetTitleFromStore } from "@/lib/repositories/lead-magnets"

type RouteContext = {
  params: Promise<{ id: string }>
}

const ADMIN_QUOTE_PARTNER_ACCOUNT_NAME = "Classin Direct Sales"

const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
  meta_lead_ads: "Meta 리드",
}

function getLeadCustomerName(lead: LeadRecord) {
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

async function findExistingLeadConversion(leadId: string) {
  const supabase = createSupabaseAdminClient()
  const leadMarker = `%원본 리드 ID: ${leadId}%`

  const { data: customerRows, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .ilike("notes", leadMarker)
    .order("created_at", { ascending: false })
    .limit(1)

  if (customerError) throw customerError
  const customer = customerRows?.[0] as Customer | undefined
  if (!customer) return { customer: null, deal: null }

  const { data: dealRows, error: dealError } = await supabase
    .from("deals")
    .select("*")
    .eq("customer_id", customer.id)
    .ilike("notes", leadMarker)
    .order("created_at", { ascending: false })
    .limit(1)

  if (dealError) throw dealError
  return {
    customer,
    deal: (dealRows?.[0] as Deal | undefined) ?? null,
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const { id } = await context.params

  try {
    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    if (lead.status === "converted") {
      return NextResponse.json({ error: "Lead is already converted" }, { status: 409 })
    }

    const conversionNotes = await buildLeadConversionNotes(lead)
    const existingConversion = await findExistingLeadConversion(lead.id)
    const partnerAccountId =
      existingConversion.customer?.partner_account_id ??
      await getOrCreateAdminQuotePartnerAccountId(admin.userId ?? null)

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
        created_by: admin.userId ?? null,
      })

    if (!existingConversion.customer) {
      await logActivity({
        partner_account_id: customer.partner_account_id,
        customer_id: customer.id,
        deal_id: null,
        actor_user_id: admin.userId ?? null,
        actor_role: admin.role,
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
        created_by: admin.userId ?? null,
      })

    if (!existingConversion.deal) {
      await logActivity({
        partner_account_id: customer.partner_account_id,
        customer_id: customer.id,
        deal_id: deal.id,
        actor_user_id: admin.userId ?? null,
        actor_role: admin.role,
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
      return NextResponse.json({ error: "Failed to mark lead as converted" }, { status: 500 })
    }

    let sourceLinkCreated = false
    try {
      await upsertConfirmedLeadCustomerLink({
        leadId: lead.id,
        sourceLabel: getLeadCustomerName(lead),
        customerId: customer.id,
        customerLabel: customer.name,
        actorUserId: admin.userId,
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
      console.warn("[POST /api/admin/leads/[id]/convert-v2] source link failed", sourceLinkError)
    }

    return NextResponse.json({
      ok: true,
      customer,
      deal,
      lead: updatedLead,
      sourceLinkCreated,
      reusedExisting: {
        customer: Boolean(existingConversion.customer),
        deal: Boolean(existingConversion.deal),
      },
    })
  } catch (error) {
    console.error(`[POST /api/admin/leads/${id}/convert-v2]`, error)
    return NextResponse.json({ error: "Failed to convert lead to V2 CRM" }, { status: 500 })
  }
}
