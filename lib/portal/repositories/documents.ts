"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  QUOTE_INTERACTION_ACTIONS,
  summarizeQuoteInteractionLogs,
} from "@/lib/portal/repositories/activity";
import { listDealListItems } from "@/lib/portal/repositories/deals";
import type {
  ActivityLog,
  ContractDocument,
  ContractDocumentShare,
  ContractDocumentVersion,
  DealListItem,
  PartnerDocumentKind,
  PartnerDocumentListItem,
  PartnerDocumentSummary,
  QuoteDocument,
  QuoteDocumentShare,
  QuoteDocumentVersion,
  ReceiptRecord,
} from "@/lib/portal/types";

export interface ListPortalDocumentsInput {
  partnerAccountId?: string;
  customerId?: string;
  dealId?: string;
  type?: PartnerDocumentKind | "all";
  status?: string;
}

export interface ListPortalDocumentsResult {
  summary: PartnerDocumentSummary;
  documents: PartnerDocumentListItem[];
  deals: Array<{ id: string }>;
  customers: Array<{ id: string }>;
}

type QuoteVersionListRow = Pick<
  QuoteDocumentVersion,
  | "id"
  | "quote_document_id"
  | "version_number"
  | "title"
  | "subtotal"
  | "discount_amount"
  | "tax_amount"
  | "total_amount"
  | "valid_until"
  | "created_by"
  | "created_at"
>;

type ContractVersionListRow = Pick<
  ContractDocumentVersion,
  | "id"
  | "contract_document_id"
  | "version_number"
  | "title"
  | "total_amount"
  | "valid_from"
  | "valid_until"
  | "sign_status"
  | "partner_signed_at"
  | "partner_signature_url"
  | "admin_signed_at"
  | "admin_signature_url"
  | "created_by"
  | "created_at"
>;

type QuoteShareListRow = QuoteDocumentShare & {
  quote_document_versions?: { quote_document_id: string } | null;
  quote_document_id?: string;
};

type ContractShareListRow = ContractDocumentShare & {
  contract_document_versions?: { contract_document_id: string } | null;
  contract_document_id?: string;
};

function groupBy<T, K extends string>(rows: T[], keyOf: (row: T) => K | null | undefined) {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

function summarize(documents: PartnerDocumentListItem[]): PartnerDocumentSummary {
  return {
    all: documents.length,
    quote: documents.filter((document) => document.kind === "quote").length,
    contract: documents.filter((document) => document.kind === "contract").length,
    receipt: documents.filter((document) => document.kind === "receipt").length,
  };
}

async function listQuoteDocuments(
  deals: DealListItem[]
): Promise<PartnerDocumentListItem[]> {
  if (deals.length === 0) return [];

  const supabase = createSupabaseAdminClient();
  const dealIds = deals.map((deal) => deal.id);
  const dealById = new Map(deals.map((deal) => [deal.id, deal]));

  const { data: documents, error: documentsError } = await supabase
    .from("quote_documents")
    .select("*")
    .in("deal_id", dealIds)
    .order("updated_at", { ascending: false });

  if (documentsError) throw documentsError;
  const documentRows = (documents ?? []) as QuoteDocument[];
  if (documentRows.length === 0) return [];

  const documentIds = documentRows.map((document) => document.id);

  const [
    { data: versions, error: versionsError },
    { data: shares, error: sharesError },
    { data: logs, error: logsError },
  ] = await Promise.all([
    supabase
      .from("quote_document_versions")
      .select(
        "id, quote_document_id, version_number, title, subtotal, discount_amount, tax_amount, total_amount, valid_until, created_by, created_at"
      )
      .in("quote_document_id", documentIds)
      .order("version_number", { ascending: false }),
    supabase
      .from("quote_document_shares")
      .select("*, quote_document_versions!inner(quote_document_id)")
      .in("quote_document_versions.quote_document_id", documentIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_logs")
      .select("*")
      .eq("target_type", "quote_document")
      .in("target_id", documentIds)
      .in("action_type", [...QUOTE_INTERACTION_ACTIONS])
      .order("created_at", { ascending: false }),
  ]);

  if (versionsError) throw versionsError;
  if (sharesError) throw sharesError;
  if (logsError) throw logsError;

  const versionsByDocument = groupBy(
    (versions ?? []) as QuoteVersionListRow[],
    (version) => version.quote_document_id
  );
  const sharesByDocument = groupBy(
    ((shares ?? []) as QuoteShareListRow[]).map((share) => ({
      ...share,
      quote_document_id: share.quote_document_versions?.quote_document_id,
    })),
    (share) => share.quote_document_id
  );
  const logsByDocument = groupBy((logs ?? []) as ActivityLog[], (log) => log.target_id ?? undefined);

  return documentRows.map((document) => {
    const deal = dealById.get(document.deal_id);
    const versionsForDocument = versionsByDocument.get(document.id) ?? [];
    const sharesForDocument = sharesByDocument.get(document.id) ?? [];
    const currentVersion =
      versionsForDocument.find((version) => version.id === document.current_version_id) ??
      versionsForDocument[0] ??
      null;
    const latestShare = sharesForDocument[0] ?? null;
    const interaction = summarizeQuoteInteractionLogs(logsByDocument.get(document.id) ?? [], {
      version_id: currentVersion?.id ?? null,
      share_id: latestShare?.id ?? null,
      token: latestShare?.token ?? null,
    });

    return {
      id: document.id,
      kind: "quote",
      deal_id: document.deal_id,
      customer_id: deal?.customer_id ?? "",
      customer_name: deal?.customer_name ?? null,
      deal_title: deal?.title ?? "",
      document_number: document.quote_number,
      title: currentVersion?.title ?? "견적서",
      status: document.status,
      version_count: versionsForDocument.length,
      total_amount: currentVersion?.total_amount ?? null,
      updated_at: document.updated_at,
      latest_version_number: currentVersion?.version_number ?? null,
      share_count: sharesForDocument.length,
      latest_share_created_at: latestShare?.created_at ?? null,
      view_count: interaction.viewCount,
      last_viewed_at: interaction.lastViewedAt,
      review_confirmed_at: interaction.reviewConfirmedAt,
      accepted_at: interaction.acceptedAt,
      pdf_url: null,
    };
  });
}

async function listContractDocuments(
  deals: DealListItem[]
): Promise<PartnerDocumentListItem[]> {
  if (deals.length === 0) return [];

  const supabase = createSupabaseAdminClient();
  const dealIds = deals.map((deal) => deal.id);
  const dealById = new Map(deals.map((deal) => [deal.id, deal]));

  const { data: documents, error: documentsError } = await supabase
    .from("contract_documents")
    .select("*")
    .in("deal_id", dealIds)
    .order("updated_at", { ascending: false });

  if (documentsError) throw documentsError;
  const documentRows = (documents ?? []) as ContractDocument[];
  if (documentRows.length === 0) return [];

  const documentIds = documentRows.map((document) => document.id);

  const [
    { data: versions, error: versionsError },
    { data: shares, error: sharesError },
  ] = await Promise.all([
    supabase
      .from("contract_document_versions")
      .select(
        "id, contract_document_id, version_number, title, total_amount, valid_from, valid_until, sign_status, partner_signed_at, partner_signature_url, admin_signed_at, admin_signature_url, created_by, created_at"
      )
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

  const versionsByDocument = groupBy(
    (versions ?? []) as ContractVersionListRow[],
    (version) => version.contract_document_id
  );
  const sharesByDocument = groupBy(
    ((shares ?? []) as ContractShareListRow[]).map((share) => ({
      ...share,
      contract_document_id: share.contract_document_versions?.contract_document_id,
    })),
    (share) => share.contract_document_id
  );

  return documentRows.map((document) => {
    const deal = dealById.get(document.deal_id);
    const versionsForDocument = versionsByDocument.get(document.id) ?? [];
    const sharesForDocument = sharesByDocument.get(document.id) ?? [];
    const currentVersion =
      versionsForDocument.find((version) => version.id === document.current_version_id) ??
      versionsForDocument[0] ??
      null;

    return {
      id: document.id,
      kind: "contract",
      deal_id: document.deal_id,
      customer_id: deal?.customer_id ?? "",
      customer_name: deal?.customer_name ?? null,
      deal_title: deal?.title ?? "",
      document_number: document.contract_number,
      title: currentVersion?.title ?? "계약서",
      status: document.status,
      version_count: versionsForDocument.length,
      total_amount: currentVersion?.total_amount ?? null,
      updated_at: document.updated_at,
      latest_version_number: currentVersion?.version_number ?? null,
      share_count: sharesForDocument.length,
      pdf_url: null,
    };
  });
}

async function listReceiptDocuments(
  deals: DealListItem[]
): Promise<PartnerDocumentListItem[]> {
  if (deals.length === 0) return [];

  const supabase = createSupabaseAdminClient();
  const dealIds = deals.map((deal) => deal.id);
  const dealById = new Map(deals.map((deal) => [deal.id, deal]));

  const { data: receipts, error } = await supabase
    .from("receipts_v2")
    .select("*")
    .in("deal_id", dealIds)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return ((receipts ?? []) as ReceiptRecord[]).map((receipt) => {
    const deal = dealById.get(receipt.deal_id);
    return {
      id: receipt.id,
      kind: "receipt",
      deal_id: receipt.deal_id,
      customer_id: receipt.customer_id,
      customer_name: deal?.customer_name ?? null,
      deal_title: deal?.title ?? "",
      document_number: receipt.receipt_number,
      title: "영수증",
      status: "issued",
      version_count: 1,
      total_amount: receipt.total_amount,
      updated_at: receipt.updated_at,
      latest_version_number: 1,
      share_count: 0,
      pdf_url: receipt.pdf_url,
    };
  });
}

export async function listPortalDocuments(
  input: ListPortalDocumentsInput = {}
): Promise<ListPortalDocumentsResult> {
  const type = input.type ?? "all";
  const deals = await listDealListItems({
    dealId: input.dealId,
    partnerAccountId: input.partnerAccountId,
    customerId: input.customerId,
  });

  const [quoteDocuments, contractDocuments, receiptDocuments] = await Promise.all([
    type === "all" || type === "quote" ? listQuoteDocuments(deals) : Promise.resolve([]),
    type === "all" || type === "contract" ? listContractDocuments(deals) : Promise.resolve([]),
    type === "all" || type === "receipt" ? listReceiptDocuments(deals) : Promise.resolve([]),
  ]);

  const allDocuments = [...quoteDocuments, ...contractDocuments, ...receiptDocuments]
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());

  const documents = allDocuments.filter((document) => {
    if (input.status && document.status !== input.status) return false;
    return true;
  });

  return {
    summary: summarize(allDocuments),
    documents,
    deals: deals.map((deal) => ({ id: deal.id })),
    customers: Array.from(new Set(deals.map((deal) => deal.customer_id))).map((id) => ({ id })),
  };
}
