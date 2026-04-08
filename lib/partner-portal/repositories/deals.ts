"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  InsertDeal,
  UpdateDeal,
  InsertDealLineItem,
  UpdateDealLineItem,
} from "@/lib/supabase/database.types.v2";
import type {
  ActivityLog,
  CalendarEvent,
  ContractDocument,
  ContractDocumentBundle,
  ContractDocumentShare,
  ContractDocumentVersion,
  Customer,
  Deal,
  DealDetailPayload,
  DealListItem,
  DealLineItem,
  DealStage,
  DealStatus,
  InstallationEvent,
  PaymentRecord,
  QuoteDocument,
  QuoteDocumentBundle,
  QuoteDocumentShare,
  QuoteDocumentVersion,
  ReceiptRecord,
} from "@/lib/partner-portal/types";

type ListDealsFilters = {
  partnerAccountId?: string;
  customerId?: string;
  stage?: DealStage;
  status?: DealStatus;
};

export async function listDeals(filters: ListDealsFilters = {}): Promise<Deal[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("deals")
    .select("*")
    .order("updated_at", { ascending: false });

  if (filters.partnerAccountId) query = query.eq("partner_account_id", filters.partnerAccountId);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.stage) query = query.eq("current_stage", filters.stage);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function listDealListItems(
  filters: ListDealsFilters = {}
): Promise<DealListItem[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("deals")
    .select("*, customers!inner(name, contact_name, region_label, campus_name)")
    .order("updated_at", { ascending: false });

  if (filters.partnerAccountId) query = query.eq("partner_account_id", filters.partnerAccountId);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.stage) query = query.eq("current_stage", filters.stage);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as Array<
    Deal & {
      customers: {
        name: string | null;
        contact_name: string | null;
        region_label: string | null;
        campus_name: string | null;
      };
    }
  >).map((deal) => ({
    ...deal,
    customer_name: deal.customers?.name ?? null,
    customer_contact_name: deal.customers?.contact_name ?? null,
    customer_region_label: deal.customers?.region_label ?? null,
    customer_campus_name: deal.customers?.campus_name ?? null,
  }));
}

export async function getDeal(dealId: string): Promise<Deal | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single();

  if (error) return null;
  return data as Deal;
}

async function getCustomer(customerId: string): Promise<Customer | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error) return null;
  return data as Customer;
}

async function listDealLineItems(dealId: string): Promise<DealLineItem[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("deal_line_items")
    .select("*")
    .eq("deal_id", dealId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DealLineItem[];
}

async function listQuoteDocumentBundles(dealId: string): Promise<QuoteDocumentBundle[]> {
  const supabase = createSupabaseAdminClient();
  const { data: documents, error: documentsError } = await supabase
    .from("quote_documents")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  if (documentsError) throw documentsError;
  const documentRows = (documents ?? []) as QuoteDocument[];
  if (documentRows.length === 0) return [];

  const documentIds = documentRows.map((document) => document.id);

  const [{ data: versions, error: versionsError }, { data: shares, error: sharesError }] =
    await Promise.all([
      supabase
        .from("quote_document_versions")
        .select("*")
        .in("quote_document_id", documentIds)
        .order("version_number", { ascending: false }),
      supabase
        .from("quote_document_shares")
        .select("*, quote_document_versions!inner(quote_document_id)")
        .in("quote_document_versions.quote_document_id", documentIds)
        .order("created_at", { ascending: false }),
    ]);

  if (versionsError) throw versionsError;
  if (sharesError) throw sharesError;

  const versionRows = (versions ?? []) as QuoteDocumentVersion[];
  const shareRows = ((shares ?? []) as Array<
    QuoteDocumentShare & { quote_document_versions: { quote_document_id: string } }
  >).map((share) => ({
    id: share.id,
    quote_document_version_id: share.quote_document_version_id,
    token: share.token,
    access_mode: share.access_mode,
    expires_at: share.expires_at,
    created_by: share.created_by,
    created_at: share.created_at,
    quote_document_id: share.quote_document_versions.quote_document_id,
  }));

  return documentRows.map((document) => ({
    ...document,
    versions: versionRows.filter((version) => version.quote_document_id === document.id),
    shares: shareRows
      .filter((share) => share.quote_document_id === document.id)
      .map((share) => ({
        id: share.id,
        quote_document_version_id: share.quote_document_version_id,
        token: share.token,
        access_mode: share.access_mode,
        expires_at: share.expires_at,
        created_by: share.created_by,
        created_at: share.created_at,
      })),
  }));
}

async function listContractDocumentBundles(
  dealId: string
): Promise<ContractDocumentBundle[]> {
  const supabase = createSupabaseAdminClient();
  const { data: documents, error: documentsError } = await supabase
    .from("contract_documents")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  if (documentsError) throw documentsError;
  const documentRows = (documents ?? []) as ContractDocument[];
  if (documentRows.length === 0) return [];

  const documentIds = documentRows.map((document) => document.id);

  const [{ data: versions, error: versionsError }, { data: shares, error: sharesError }] =
    await Promise.all([
      supabase
        .from("contract_document_versions")
        .select("*")
        .in("contract_document_id", documentIds)
        .order("version_number", { ascending: false }),
      supabase
        .from("contract_document_shares")
        .select("*, contract_document_versions!inner(contract_document_id)")
        .in("contract_document_versions.contract_document_id", documentIds)
        .order("created_at", { ascending: false }),
    ]);

  if (versionsError) throw versionsError;
  if (sharesError) throw sharesError;

  const versionRows = (versions ?? []) as ContractDocumentVersion[];
  const shareRows = ((shares ?? []) as Array<
    ContractDocumentShare & { contract_document_versions: { contract_document_id: string } }
  >).map((share) => ({
    id: share.id,
    contract_document_version_id: share.contract_document_version_id,
    token: share.token,
    access_mode: share.access_mode,
    expires_at: share.expires_at,
    created_by: share.created_by,
    created_at: share.created_at,
    contract_document_id: share.contract_document_versions.contract_document_id,
  }));

  return documentRows.map((document) => ({
    ...document,
    versions: versionRows.filter((version) => version.contract_document_id === document.id),
    shares: shareRows
      .filter((share) => share.contract_document_id === document.id)
      .map((share) => ({
        id: share.id,
        contract_document_version_id: share.contract_document_version_id,
        token: share.token,
        access_mode: share.access_mode,
        expires_at: share.expires_at,
        created_by: share.created_by,
        created_at: share.created_at,
      })),
  }));
}

async function listInstallations(dealId: string): Promise<InstallationEvent[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("installation_events")
    .select("*")
    .eq("deal_id", dealId)
    .order("scheduled_start_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as InstallationEvent[];
}

async function listPayments(dealId: string): Promise<PaymentRecord[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("payments_v2")
    .select("*")
    .eq("deal_id", dealId)
    .order("paid_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PaymentRecord[];
}

async function listReceipts(dealId: string): Promise<ReceiptRecord[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("receipts_v2")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ReceiptRecord[];
}

async function listActivityLogs(dealId: string): Promise<ActivityLog[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

async function listCalendarEvents(dealId: string): Promise<CalendarEvent[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("deal_id", dealId)
    .order("starts_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as CalendarEvent[];
}

export async function getDealDetail(dealId: string): Promise<DealDetailPayload | null> {
  const deal = await getDeal(dealId);
  if (!deal) return null;

  const [
    customer,
    lineItems,
    quoteDocuments,
    contractDocuments,
    installations,
    payments,
    receipts,
    activityLogs,
    calendarEvents,
  ] = await Promise.all([
    getCustomer(deal.customer_id),
    listDealLineItems(dealId),
    listQuoteDocumentBundles(dealId),
    listContractDocumentBundles(dealId),
    listInstallations(dealId),
    listPayments(dealId),
    listReceipts(dealId),
    listActivityLogs(dealId),
    listCalendarEvents(dealId),
  ]);

  if (!customer) return null;

  return {
    deal,
    customer,
    line_items: lineItems,
    quote_documents: quoteDocuments,
    contract_documents: contractDocuments,
    installations,
    payments,
    receipts,
    activity_logs: activityLogs,
    calendar_events: calendarEvents,
  };
}

export async function getDealDetailForPartnerAccount(
  dealId: string,
  partnerAccountId: string
): Promise<DealDetailPayload | null> {
  const detail = await getDealDetail(dealId);
  if (!detail) return null;
  if (detail.deal.partner_account_id !== partnerAccountId) return null;
  return detail;
}

/* ─── Write Operations ──────────────────────────────────── */

/** deal_code 자동 생성: D-YYYY-NNN */
async function generateDealCode(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const year = new Date().getFullYear();
  const prefix = `D-${year}-`;

  const { count } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true })
    .like("deal_code", `${prefix}%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function createDeal(
  input: Omit<InsertDeal, "deal_code">
): Promise<Deal> {
  const supabase = createSupabaseAdminClient();
  const dealCode = await generateDealCode();

  const { data, error } = await supabase
    .from("deals")
    .insert({ ...input, deal_code: dealCode })
    .select()
    .single();

  if (error) throw error;
  return data as Deal;
}

export async function updateDeal(
  dealId: string,
  input: UpdateDeal
): Promise<Deal> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("deals")
    .update(input)
    .eq("id", dealId)
    .select()
    .single();

  if (error) throw error;
  return data as Deal;
}

export async function createDealLineItem(
  input: InsertDealLineItem
): Promise<DealLineItem> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("deal_line_items")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as DealLineItem;
}

export async function updateDealLineItem(
  id: string,
  input: UpdateDealLineItem
): Promise<DealLineItem> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("deal_line_items")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as DealLineItem;
}

export async function deleteDealLineItem(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("deal_line_items")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
