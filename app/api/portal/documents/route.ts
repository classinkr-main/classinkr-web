import { NextRequest, NextResponse } from "next/server";

import {
  getPartnerAccountFilter,
  isErrorResponse,
  requirePortalContext,
} from "@/lib/partner-portal/portal-context";
import {
  getDealDetail,
  getDealDetailForPartnerAccount,
  listDealListItems,
} from "@/lib/partner-portal/repositories/deals";
import { summarizeQuoteInteractions } from "@/lib/partner-portal/repositories/activity";
import type {
  ContractDocumentBundle,
  DealDetailPayload,
  PartnerDocumentKind,
  PartnerDocumentListItem,
  PartnerDocumentSummary,
  QuoteDocumentBundle,
  ReceiptRecord,
} from "@/lib/partner-portal/types";

async function mapQuoteDocuments(detail: DealDetailPayload): Promise<PartnerDocumentListItem[]> {
  return Promise.all(detail.quote_documents.map(async (document: QuoteDocumentBundle) => {
    const currentVersion =
      document.versions.find((version) => version.id === document.current_version_id) ??
      document.versions[0] ??
      null;
    const latestShare = document.shares[0] ?? null;
    const interaction = await summarizeQuoteInteractions({
      quote_document_id: document.id,
      version_id: currentVersion?.id ?? null,
      share_id: latestShare?.id ?? null,
      token: latestShare?.token ?? null,
    }).catch(() => null);

    return {
      id: document.id,
      kind: "quote",
      deal_id: detail.deal.id,
      customer_id: detail.customer.id,
      customer_name: detail.customer.name,
      deal_title: detail.deal.title,
      document_number: document.quote_number,
      title: currentVersion?.title ?? "견적서",
      status: document.status,
      version_count: document.versions.length,
      total_amount: currentVersion?.total_amount ?? null,
      updated_at: document.updated_at,
      latest_version_number: currentVersion?.version_number ?? null,
      share_count: document.shares.length,
      latest_share_created_at: latestShare?.created_at ?? null,
      view_count: interaction?.viewCount ?? 0,
      last_viewed_at: interaction?.lastViewedAt ?? null,
      review_confirmed_at: interaction?.reviewConfirmedAt ?? null,
      accepted_at: interaction?.acceptedAt ?? null,
      pdf_url: null,
    };
  }));
}

function mapContractDocuments(detail: DealDetailPayload): PartnerDocumentListItem[] {
  return detail.contract_documents.map((document: ContractDocumentBundle) => {
    const currentVersion =
      document.versions.find((version) => version.id === document.current_version_id) ??
      document.versions[0] ??
      null;

    return {
      id: document.id,
      kind: "contract",
      deal_id: detail.deal.id,
      customer_id: detail.customer.id,
      customer_name: detail.customer.name,
      deal_title: detail.deal.title,
      document_number: document.contract_number,
      title: currentVersion?.title ?? "계약서",
      status: document.status,
      version_count: document.versions.length,
      total_amount: currentVersion?.total_amount ?? null,
      updated_at: document.updated_at,
      latest_version_number: currentVersion?.version_number ?? null,
      share_count: document.shares.length,
      pdf_url: null,
    };
  });
}

function mapReceipts(detail: DealDetailPayload): PartnerDocumentListItem[] {
  return detail.receipts.map((receipt: ReceiptRecord) => ({
    id: receipt.id,
    kind: "receipt",
    deal_id: detail.deal.id,
    customer_id: detail.customer.id,
    customer_name: detail.customer.name,
    deal_title: detail.deal.title,
    document_number: receipt.receipt_number,
    title: "영수증",
    status: "issued",
    version_count: 1,
    total_amount: receipt.total_amount,
    updated_at: receipt.updated_at,
    latest_version_number: 1,
    share_count: 0,
    pdf_url: receipt.pdf_url,
  }));
}

async function mapDetailDocuments(detail: DealDetailPayload): Promise<PartnerDocumentListItem[]> {
  const quoteDocuments = await mapQuoteDocuments(detail);
  return [
    ...quoteDocuments,
    ...mapContractDocuments(detail),
    ...mapReceipts(detail),
  ];
}

function summarize(documents: PartnerDocumentListItem[]): PartnerDocumentSummary {
  return {
    all: documents.length,
    quote: documents.filter((document) => document.kind === "quote").length,
    contract: documents.filter((document) => document.kind === "contract").length,
    receipt: documents.filter((document) => document.kind === "receipt").length,
  };
}

export async function GET(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") ?? "all") as PartnerDocumentKind | "all";
  const customerId = searchParams.get("customer_id") ?? undefined;
  const dealId = searchParams.get("deal_id") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  try {
    const partnerAccountId = getPartnerAccountFilter(ctx) ?? undefined;
    const deals = await listDealListItems({
      partnerAccountId,
      customerId,
    });
    const targetDeals = dealId ? deals.filter((deal) => deal.id === dealId) : deals;

    const details = await Promise.all(
      targetDeals.map(async (deal) => {
        try {
          if (ctx.type === "admin") return getDealDetail(deal.id);
          return getDealDetailForPartnerAccount(deal.id, ctx.partnerAccountId);
        } catch (error) {
          console.warn("[portal/documents] deal detail fallback", error);
          return null;
        }
      })
    );

    const mappedDocumentGroups = await Promise.all(
      details
        .filter((detail): detail is DealDetailPayload => Boolean(detail))
        .map(mapDetailDocuments)
    );
    const allDocuments = mappedDocumentGroups
      .flat()
      .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());

    const documents = allDocuments.filter((document) => {
      if (type !== "all" && document.kind !== type) return false;
      if (customerId && document.customer_id !== customerId) return false;
      if (dealId && document.deal_id !== dealId) return false;
      if (status && document.status !== status) return false;
      return true;
    });

    return NextResponse.json({
      mode: "v2",
      summary: summarize(allDocuments),
      documents,
      deals: targetDeals.map((deal) => ({ id: deal.id })),
      customers: Array.from(
        new Set(targetDeals.map((deal) => deal.customer_id))
      ).map((id) => ({ id })),
    });
  } catch (error) {
    console.error("[portal/documents] GET error:", error);
    return NextResponse.json({ error: "문서 목록 조회 실패" }, { status: 500 });
  }
}
