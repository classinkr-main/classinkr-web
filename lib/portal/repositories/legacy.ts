"server-only";

import { getHwSale, listHwSales } from "@/lib/repositories/hw-sales";
import {
  listInstallSchedules,
  type InstallScheduleWithRelations,
} from "@/lib/repositories/install-schedules";
import { listPartners, getPartner } from "@/lib/repositories/partners";
import { listQuotes, getQuote } from "@/lib/repositories/quotes";
import { listContracts, listContractVersions } from "@/lib/repositories/contracts";
import { listReceipts } from "@/lib/repositories/receipts";
import type {
  ActivityLog,
  ContractDocumentBundle,
  ContractDocumentVersion,
  Customer,
  CustomerDealHistoryItem,
  CustomerDetailPayload,
  CustomerListItem,
  Deal,
  DealDetailPayload,
  DealLineItem,
  InstallationEvent,
  PaymentRecord,
  QuoteDocumentBundle,
  QuoteDocumentVersion,
  ReceiptRecord,
} from "@/lib/portal/types";
import type {
  Contract,
  HwSaleItem,
  Partner,
  Quote,
  QuoteItem,
  Receipt,
} from "@/lib/supabase/database.types";

function mapPipelineStage(stage: Partner["pipeline_stage"]): Deal["current_stage"] {
  switch (stage) {
    case "prospect":
      return "contact";
    case "quoting":
      return "quote";
    case "contracted":
      return "contract";
    case "installing":
      return "installation";
    case "completed":
      return "payment";
    case "cancelled":
      return "cancelled";
    default:
      return "contact";
  }
}

function mapPaymentStatus(
  contractedAmount: number,
  paidAmount: number
): Deal["payment_status"] {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount >= contractedAmount) return "paid";
  return "partial";
}

function toLegacyCustomer(partner: Partner): Customer {
  return {
    id: partner.id,
    partner_account_id: `legacy:${partner.id}`,
    name: partner.name,
    contact_name: partner.contact_name,
    email: partner.email,
    phone: partner.phone,
    address: partner.address,
    business_number: partner.business_number,
    campus_name: null,
    region_label: null,
    notes: partner.notes,
    created_by: partner.created_by,
    created_at: partner.created_at,
    updated_at: partner.updated_at,
  };
}

function buildLegacyActivityLogs(
  partner: Partner,
  quotes: Quote[],
  contracts: Contract[],
  receipts: Receipt[],
  installs: InstallScheduleWithRelations[]
): ActivityLog[] {
  const logs: ActivityLog[] = [];

  for (const quote of quotes) {
    logs.push({
      id: `legacy-quote-${quote.id}`,
      partner_account_id: `legacy:${partner.id}`,
      customer_id: partner.id,
      deal_id: partner.id,
      actor_user_id: null,
      actor_role: "legacy",
      action_type: "quote_created",
      target_type: "quote",
      target_id: quote.id,
      summary: `견적서 생성 · ${quote.quote_number}`,
      before_json: null,
      after_json: null,
      created_at: quote.created_at,
    });
  }

  for (const contract of contracts) {
    logs.push({
      id: `legacy-contract-${contract.id}`,
      partner_account_id: `legacy:${partner.id}`,
      customer_id: partner.id,
      deal_id: partner.id,
      actor_user_id: null,
      actor_role: "legacy",
      action_type: "contract_created",
      target_type: "contract",
      target_id: contract.id,
      summary: `계약서 생성 · ${contract.contract_number}`,
      before_json: null,
      after_json: null,
      created_at: contract.created_at,
    });
  }

  for (const receipt of receipts) {
    logs.push({
      id: `legacy-receipt-${receipt.id}`,
      partner_account_id: `legacy:${partner.id}`,
      customer_id: partner.id,
      deal_id: partner.id,
      actor_user_id: null,
      actor_role: "legacy",
      action_type: "receipt_created",
      target_type: "receipt",
      target_id: receipt.id,
      summary: `수납 기록 · ${receipt.receipt_number}`,
      before_json: null,
      after_json: null,
      created_at: receipt.paid_at ?? receipt.created_at,
    });
  }

  for (const install of installs) {
    logs.push({
      id: `legacy-install-${install.id}`,
      partner_account_id: `legacy:${partner.id}`,
      customer_id: partner.id,
      deal_id: partner.id,
      actor_user_id: null,
      actor_role: "legacy",
      action_type: "installation_scheduled",
      target_type: "installation",
      target_id: install.id,
      summary: `설치 일정 · ${install.scheduled_date}`,
      before_json: null,
      after_json: null,
      created_at: install.updated_at,
    });
  }

  logs.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return logs;
}

async function buildLegacyDealDetailPayload(partner: Partner): Promise<DealDetailPayload> {
  const [quotes, contracts, receipts, installs, hwSales] = await Promise.all([
    listQuotes(partner.id),
    listContracts(partner.id),
    listReceipts(undefined, partner.id),
    listInstallSchedules({ partnerId: partner.id }),
    listHwSales({ partnerId: partner.id }),
  ]);

  const paidAmount = receipts.reduce((sum, item) => sum + (item.total_amount ?? 0), 0);
  const contractedAmount =
    contracts[0]?.total_amount ?? partner.deal_amount ?? quotes[0]?.total_amount ?? 0;
  const installedAmount =
    partner.pipeline_stage === "installing" || partner.pipeline_stage === "completed"
      ? contractedAmount
      : 0;

  const deal: Deal = {
    id: partner.id,
    partner_account_id: `legacy:${partner.id}`,
    customer_id: partner.id,
    deal_code: `legacy-${partner.id}`,
    title: partner.name,
    status: partner.pipeline_stage === "cancelled" ? "cancelled" : "active",
    current_stage: mapPipelineStage(partner.pipeline_stage),
    expected_amount: contractedAmount,
    contracted_amount: contractedAmount,
    installed_amount: installedAmount,
    paid_amount: paidAmount,
    outstanding_amount: Math.max(contractedAmount - paidAmount, 0),
    payment_status: mapPaymentStatus(contractedAmount, paidAmount),
    starts_at: quotes[0]?.created_at ?? partner.created_at,
    closed_at: partner.pipeline_stage === "completed" ? partner.updated_at : null,
    notes: partner.notes,
    created_by: partner.created_by,
    created_at: partner.created_at,
    updated_at: partner.updated_at,
  };

  const customer = toLegacyCustomer(partner);

  const quoteDocuments: QuoteDocumentBundle[] = [];
  for (const quote of quotes) {
    const quoteWithItems = await getQuote(quote.id);
    const version: QuoteDocumentVersion = {
      id: `legacy-quote-version-${quote.id}`,
      quote_document_id: quote.id,
      version_number: quote.version ?? 1,
      title: quote.title,
      content_html: null,
      structured_json: null,
      subtotal: quote.subtotal,
      discount_amount: quote.discount_amount,
      tax_amount: quote.tax_amount,
      total_amount: quote.total_amount,
      valid_until: quote.valid_until,
      created_by: quote.created_by,
      created_at: quote.created_at,
    };
    quoteDocuments.push({
      id: quote.id,
      deal_id: partner.id,
      quote_number: quote.quote_number,
      current_version_id: version.id,
      status:
        quote.status === "sent"
          ? "shared"
          : quote.status === "accepted"
            ? "accepted"
            : quote.status === "expired"
              ? "expired"
              : "draft",
      created_by: quote.created_by,
      created_by_role: "partner" as const,
      approved_by: null,
      approved_at: null,
      created_at: quote.created_at,
      updated_at: quote.updated_at,
      versions: [version],
      shares: [],
    });

    void quoteWithItems;
  }

  const contractDocuments: ContractDocumentBundle[] = [];
  for (const contract of contracts) {
    const versions = await listContractVersions(contract.id);
    const mappedVersions: ContractDocumentVersion[] =
      versions.length > 0
        ? versions.map((version) => ({
            id: version.id,
            contract_document_id: contract.id,
            version_number: version.version_number,
            title: contract.title,
            content_html: version.content_html,
            structured_json: null,
            total_amount: contract.total_amount,
            valid_from: contract.valid_from,
            valid_until: contract.valid_until,
            sign_status:
              contract.status === "partner_signed"
                ? "partner_signed"
                : contract.status === "admin_signed" || contract.status === "completed"
                  ? "completed"
                  : contract.status === "cancelled"
                    ? "cancelled"
                    : "draft",
            partner_signed_at: contract.partner_signed_at,
            partner_signature_url: contract.partner_signature_url,
            admin_signed_at: contract.admin_signed_at,
            admin_signature_url: contract.admin_signature_url,
            created_by: contract.created_by,
            created_at: version.created_at,
          }))
        : [
            {
              id: `legacy-contract-version-${contract.id}`,
              contract_document_id: contract.id,
              version_number: contract.version ?? 1,
              title: contract.title,
              content_html: contract.content_html,
              structured_json: null,
              total_amount: contract.total_amount,
              valid_from: contract.valid_from,
              valid_until: contract.valid_until,
              sign_status:
                contract.status === "partner_signed"
                  ? "partner_signed"
                  : contract.status === "admin_signed" || contract.status === "completed"
                    ? "completed"
                    : contract.status === "cancelled"
                      ? "cancelled"
                      : "draft",
              partner_signed_at: contract.partner_signed_at,
              partner_signature_url: contract.partner_signature_url,
              admin_signed_at: contract.admin_signed_at,
              admin_signature_url: contract.admin_signature_url,
              created_by: contract.created_by,
              created_at: contract.created_at,
            },
          ];

    contractDocuments.push({
      id: contract.id,
      deal_id: partner.id,
      contract_number: contract.contract_number,
      current_version_id: mappedVersions[0]?.id ?? null,
      status:
        contract.status === "sent"
          ? "shared"
          : contract.status === "partner_signed"
            ? "partner_signed"
            : contract.status === "admin_signed" || contract.status === "completed"
              ? "completed"
              : contract.status === "cancelled"
                ? "cancelled"
                : "draft",
      created_by: contract.created_by,
      created_at: contract.created_at,
      updated_at: contract.updated_at,
      versions: mappedVersions,
      shares: [],
    });
  }

  const lineItems: DealLineItem[] = [];
  if (quotes[0]) {
    const latestQuote = await getQuote(quotes[0].id);
    for (const [index, item] of (latestQuote?.items ?? []).entries()) {
      lineItems.push(mapQuoteItemToLineItem(partner.id, item, index));
    }
  }

  if (lineItems.length === 0 && hwSales.length > 0) {
    const firstSale = await getHwSale(hwSales[0].id);
    for (const [index, item] of (firstSale?.items ?? []).entries()) {
      lineItems.push(mapHwSaleItemToLineItem(partner.id, item, index));
    }
  }

  const installations: InstallationEvent[] = installs.map((install) => ({
    id: install.id,
    partner_account_id: `legacy:${partner.id}`,
    customer_id: partner.id,
    deal_id: partner.id,
    scheduled_start_at: `${install.scheduled_date}T09:00:00+09:00`,
    scheduled_end_at: `${install.scheduled_date}T18:00:00+09:00`,
    timezone: "Asia/Seoul",
    location: install.location,
    assigned_team: install.team?.name ?? null,
    status:
      install.status === "requested"
        ? "planned"
        : install.status === "confirmed"
          ? "confirmed"
          : install.status === "completed"
            ? "completed"
            : "cancelled",
    created_by_role: install.requested_by === "partner" ? "partner" : "admin",
    notes: install.notes,
    created_by: install.manager_id,
    created_at: install.created_at,
    updated_at: install.updated_at,
  }));

  const payments: PaymentRecord[] = receipts.map((receipt) => ({
    id: `legacy-payment-${receipt.id}`,
    partner_account_id: `legacy:${partner.id}`,
    customer_id: partner.id,
    deal_id: partner.id,
    amount: receipt.total_amount,
    paid_at: receipt.paid_at ?? receipt.created_at,
    payment_method: receipt.payment_method,
    memo: receipt.notes,
    created_by: receipt.created_by,
    created_at: receipt.created_at,
    updated_at: receipt.updated_at,
  }));

  const receiptRecords: ReceiptRecord[] = receipts.map((receipt) => ({
    id: receipt.id,
    partner_account_id: `legacy:${partner.id}`,
    customer_id: partner.id,
    deal_id: partner.id,
    payment_id: `legacy-payment-${receipt.id}`,
    receipt_number: receipt.receipt_number,
    total_amount: receipt.total_amount,
    pdf_url: receipt.pdf_url,
    notes: receipt.notes,
    created_by: receipt.created_by,
    created_at: receipt.created_at,
    updated_at: receipt.updated_at,
  }));

  const activityLogs = buildLegacyActivityLogs(
    partner,
    quotes,
    contracts,
    receipts,
    installs
  );

  return {
    deal,
    customer,
    line_items: lineItems,
    quote_documents: quoteDocuments,
    contract_documents: contractDocuments,
    installations,
    payments,
    receipts: receiptRecords,
    activity_logs: activityLogs,
    calendar_events: installations.map((item) => ({
      id: `legacy-calendar-${item.id}`,
      partner_account_id: item.partner_account_id,
      customer_id: item.customer_id,
      deal_id: item.deal_id,
      source_type: "installation",
      source_id: item.id,
      starts_at: item.scheduled_start_at,
      ends_at: item.scheduled_end_at,
      timezone: item.timezone,
      title: `${partner.name} 설치 일정`,
      description: item.location,
      status:
        item.status === "cancelled"
          ? "cancelled"
          : item.status === "completed"
            ? "completed"
            : "active",
      created_by: item.created_by,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
  };
}

function mapQuoteItemToLineItem(
  dealId: string,
  item: QuoteItem,
  sortOrder: number
): DealLineItem {
  return {
    id: item.id,
    deal_id: dealId,
    sku: item.sku,
    category: inferCategory(item.product_name),
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    amount: item.amount,
    sort_order: sortOrder,
    notes: item.description,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mapHwSaleItemToLineItem(
  dealId: string,
  item: HwSaleItem,
  sortOrder: number
): DealLineItem {
  return {
    id: item.id,
    deal_id: dealId,
    sku: item.sku,
    category: inferCategory(item.product_name),
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    amount: item.unit_price * item.quantity,
    sort_order: sortOrder,
    notes: item.serial_notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function inferCategory(
  productName: string
): DealLineItem["category"] {
  if (productName.includes("카메라")) return "camera";
  if (productName.includes("스탠드") || productName.includes("벽걸이") || productName.includes("매립")) {
    return "mount";
  }
  if (productName.includes("설치")) return "install_fee";
  return "board";
}

async function buildLegacyCustomerSummary(partner: Partner) {
  const [contracts, receipts] = await Promise.all([
    listContracts(partner.id),
    listReceipts(undefined, partner.id),
  ]);

  const contractedAmount =
    contracts[0]?.total_amount ?? partner.deal_amount ?? 0;
  const paidAmount = receipts.reduce((sum, item) => sum + item.total_amount, 0);
  const outstandingAmount = Math.max(contractedAmount - paidAmount, 0);

  return {
    customer_id: partner.id,
    partner_account_id: `legacy:${partner.id}`,
    customer_name: partner.name,
    total_deals: 1,
    active_deals:
      partner.pipeline_stage === "completed" || partner.pipeline_stage === "cancelled"
        ? 0
        : 1,
    installation_deals: partner.pipeline_stage === "installing" ? 1 : 0,
    unpaid_deals: outstandingAmount > 0 ? 1 : 0,
    contracted_amount: contractedAmount,
    installed_amount:
      partner.pipeline_stage === "installing" || partner.pipeline_stage === "completed"
        ? contractedAmount
        : 0,
    paid_amount: paidAmount,
    outstanding_amount: outstandingAmount,
    last_deal_updated_at: partner.updated_at,
  };
}

export async function listLegacyCustomerListItems(): Promise<CustomerListItem[]> {
  const partners = await listPartners();
  return Promise.all(
    partners.map(async (partner) => {
      const summary = await buildLegacyCustomerSummary(partner);
      const detail = await buildLegacyDealDetailPayload(partner);
      const nextInstall = detail.installations[0]?.scheduled_start_at ?? null;

      return {
        customer: toLegacyCustomer(partner),
        summary,
        insight: {
          primary_stage: detail.deal.current_stage,
          next_event_at: nextInstall,
          next_event_type: nextInstall ? "installation" : null,
          recent_activity_at: detail.activity_logs[0]?.created_at ?? null,
          attention_level:
            summary.outstanding_amount > 0 || !nextInstall ? "high" : "medium",
        },
        deal_previews: [
          {
            deal_id: partner.id,
            title: partner.name,
            current_stage: detail.deal.current_stage,
            status: detail.deal.status,
            updated_at: detail.deal.updated_at,
            next_event_at: nextInstall,
          },
        ],
      };
    })
  );
}

export async function getLegacyCustomerDetail(
  customerId: string
): Promise<CustomerDetailPayload | null> {
  const partner = await getPartner(customerId);
  if (!partner) return null;

  const detail = await buildLegacyDealDetailPayload(partner);
  const summary = await buildLegacyCustomerSummary(partner);
  const nextInstall = detail.installations[0];

  const dealHistory: CustomerDealHistoryItem[] = [
    {
      customer_id: partner.id,
      customer_name: partner.name,
      deal_id: partner.id,
      deal_code: `legacy-${partner.id}`,
      deal_title: partner.name,
      current_stage: detail.deal.current_stage,
      deal_status: detail.deal.status,
      expected_amount: detail.deal.expected_amount,
      contracted_amount: detail.deal.contracted_amount,
      installed_amount: detail.deal.installed_amount,
      paid_amount: detail.deal.paid_amount,
      outstanding_amount: detail.deal.outstanding_amount,
      payment_status: detail.deal.payment_status,
      deal_created_at: detail.deal.created_at,
      deal_updated_at: detail.deal.updated_at,
      last_activity_at: detail.activity_logs[0]?.created_at ?? null,
      next_installation_at: nextInstall?.scheduled_start_at ?? null,
      last_paid_at: detail.payments[0]?.paid_at ?? null,
    },
  ];

  return {
    customer: toLegacyCustomer(partner),
    summary,
    deals: dealHistory,
    recent_activity: detail.activity_logs.slice(0, 12),
    recent_calendar_events: detail.installations.slice(0, 12).map((item) => ({
      id: `legacy-calendar-${item.id}`,
      partner_account_id: `legacy:${partner.id}`,
      customer_id: partner.id,
      deal_id: partner.id,
      source_type: "installation",
      source_id: item.id,
      starts_at: item.scheduled_start_at,
      ends_at: item.scheduled_end_at,
      timezone: item.timezone,
      title: `${partner.name} 설치 일정`,
      description: item.location,
      status: item.status === "cancelled" ? "cancelled" : item.status === "completed" ? "completed" : "active",
      created_by: item.created_by,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
  };
}

export async function getLegacyDealDetail(
  dealId: string
): Promise<DealDetailPayload | null> {
  const partner = await getPartner(dealId);
  if (!partner) return null;
  return buildLegacyDealDetailPayload(partner);
}
