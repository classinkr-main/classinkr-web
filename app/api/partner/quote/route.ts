import { NextRequest, NextResponse } from "next/server";

import {
  getPublicQuoteByToken,
  updateQuoteDocument,
} from "@/lib/partner-portal/repositories/quote-documents";
import { getDeal } from "@/lib/partner-portal/repositories/deals";
import {
  ensureQuoteInteractionLog,
  summarizeQuoteInteractions,
  PUBLIC_QUOTE_VIEW_ACTION,
  PUBLIC_QUOTE_REVIEW_ACTION,
  PUBLIC_QUOTE_ACCEPT_ACTION,
  type QuoteInteractionSummary,
} from "@/lib/partner-portal/repositories/activity";
import type {
  QuoteDocument,
  QuoteDocumentShare,
  QuoteDocumentVersion,
} from "@/lib/partner-portal/types";
import { createInAppNotifications } from "@/lib/notifications/repository";
import {
  STANDARD_QUOTE_DEFAULT_BODY,
  STANDARD_QUOTE_DEFAULT_VAT_LABEL,
  STANDARD_QUOTE_SUPPLIER,
} from "@/lib/standard-quote-template";

type PublicQuoteDetails = {
  templateId?: string;
  estimateNumber?: string;
  workflowStatus?: string;
  issuedAt?: string;
  validUntil?: string;
  subjectText?: string;
  recipientCompanyName?: string;
  recipientContactName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  referenceName?: string;
  supplierBusinessName?: string;
  supplierBusinessRegistrationNumber?: string;
  supplierRepresentativeName?: string;
  supplierAddress?: string;
  supplierContactName?: string;
  supplierContactPhone?: string;
  supplierContactEmail?: string;
  currencyUnitLabel?: string;
  vatIncluded?: boolean;
  vatPolicyLabel?: string;
  deliveryLocationNote?: string;
  paymentTerms?: string;
  installationPolicy?: string;
  warrantyNote?: string;
  generalNotes?: string;
  specialTerms?: string;
  footerContactText?: string;
  subtotalAmount?: number;
  vatAmount?: number;
  discountAmount?: number;
  grandTotalAmount?: number;
  hasPendingAmounts?: boolean;
  pendingAmountNote?: string;
  lineItems: Array<Record<string, unknown>>;
};

type PublicQuoteInteraction = {
  status: "open" | "confirmed" | "locked";
  canConfirmReview: boolean;
  canRequestProceed: boolean;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  helperText: string;
  summary: QuoteInteractionSummary;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pickString(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = readString(source[key]);
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function pickNumber(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = readNumber(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function pickBoolean(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function sanitizeQuoteDocument(document: QuoteDocument) {
  const { created_by, deal_id, current_version_id, ...safe } = document;
  void created_by;
  void deal_id;
  void current_version_id;
  return safe;
}

function sanitizeQuoteVersion(version: QuoteDocumentVersion) {
  const { created_by, quote_document_id, ...safe } = version;
  void created_by;
  void quote_document_id;
  return safe;
}

function sanitizeQuoteShare(share: QuoteDocumentShare) {
  const { created_by, token, quote_document_version_id, ...safe } = share;
  void created_by;
  void token;
  void quote_document_version_id;
  return safe;
}

function normalizeLineItem(value: unknown, index: number) {
  const item = isRecord(value) ? value : {};
  const quantity = pickNumber(item, "quantity", "qty");
  const unitPrice = pickNumber(item, "unitPrice", "unit_price", "price");
  const amount =
    pickNumber(item, "lineSupplyAmount", "amount") ??
    (quantity != null && unitPrice != null ? Math.max(0, Math.round(quantity * unitPrice)) : undefined);

  return {
    id: pickString(item, "id") ?? `line-${index + 1}`,
    sortOrder: pickNumber(item, "sortOrder", "sort_order") ?? index + 1,
    lineNumber: pickNumber(item, "lineNumber", "line_number") ?? index + 1,
    itemType: pickString(item, "itemType", "item_type"),
    itemCode: pickString(item, "itemCode", "item_code"),
    itemName:
      pickString(item, "itemName", "product_name", "name", "title") ?? `견적 품목 ${index + 1}`,
    itemDescription: pickString(item, "itemDescription", "description", "notes", "remark"),
    quantity,
    quantityUnit: pickString(item, "quantityUnit", "quantity_unit"),
    unitPrice,
    lineSupplyAmount: amount,
    vatIncluded: pickBoolean(item, "vatIncluded", "vat_included"),
    lineStatus: pickString(item, "lineStatus", "line_status"),
    billingMode: pickString(item, "billingMode", "billing_mode"),
    remark: pickString(item, "remark"),
    linkedQuantityRowId: pickString(item, "linkedQuantityRowId"),
    linkedChecklistTemplateId: pickString(item, "linkedChecklistTemplateId"),
  };
}

function normalizeQuoteDetails(
  value: unknown,
  fallback: {
    customerName?: string | null;
    title?: string | null;
    quoteNumber?: string | null;
    issuedAt?: string | null;
    validUntil?: string | null;
    subtotal?: number | null;
    discountAmount?: number | null;
    vatAmount?: number | null;
    totalAmount?: number | null;
  } = {}
): PublicQuoteDetails {
  const root = isRecord(value) ? value : {};
  const details = isRecord(root.quoteDetails) ? root.quoteDetails : root;
  const lineItemsSource =
    Array.isArray(details.lineItems) ? details.lineItems :
    Array.isArray(details.items) ? details.items :
    Array.isArray(root.line_items) ? root.line_items :
    Array.isArray(root.items) ? root.items :
    [];

  const normalizedLineItems = lineItemsSource.map((item, index) => normalizeLineItem(item, index));
  const subtotalFromLines = normalizedLineItems.reduce((sum, item) => sum + Number(item.lineSupplyAmount ?? 0), 0);
  const discountFromLines = normalizedLineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const base = Math.max(0, Math.round(quantity * unitPrice));
    const amount = Number(item.lineSupplyAmount ?? 0);
    return sum + Math.max(0, base - amount);
  }, 0);

  const subtotalAmount = pickNumber(details, "subtotalAmount", "subtotal") ?? fallback.subtotal ?? subtotalFromLines;
  const discountAmount =
    pickNumber(details, "discountAmount", "discount_amount") ?? fallback.discountAmount ?? discountFromLines;
  const vatAmount =
    pickNumber(details, "vatAmount", "tax_amount", "taxAmount") ?? fallback.vatAmount ?? 0;
  const grandTotalAmount =
    pickNumber(details, "grandTotalAmount", "total_amount", "totalAmount") ??
    fallback.totalAmount ??
    subtotalAmount + vatAmount - discountAmount;

  return {
    templateId: pickString(details, "templateId", "template_id"),
    estimateNumber: pickString(details, "estimateNumber", "estimate_number") ?? fallback.quoteNumber ?? undefined,
    workflowStatus: pickString(details, "workflowStatus"),
    issuedAt: pickString(details, "issuedAt", "issued_at") ?? fallback.issuedAt ?? undefined,
    validUntil: pickString(details, "validUntil", "valid_until") ?? fallback.validUntil ?? undefined,
    subjectText:
      pickString(details, "subjectText", "title", "subject") ??
      fallback.title ??
      fallback.quoteNumber ??
      STANDARD_QUOTE_DEFAULT_BODY,
    recipientCompanyName:
      pickString(details, "recipientCompanyName", "customerName", "customer_name", "partner_name") ??
      fallback.customerName ??
      undefined,
    recipientContactName: pickString(details, "recipientContactName", "contact_name"),
    recipientPhone: pickString(details, "recipientPhone", "phone"),
    recipientEmail: pickString(details, "recipientEmail", "email"),
    referenceName: pickString(details, "referenceName"),
    supplierBusinessName:
      pickString(details, "supplierBusinessName", "supplier_name") ??
      STANDARD_QUOTE_SUPPLIER.businessName,
    supplierBusinessRegistrationNumber:
      pickString(details, "supplierBusinessRegistrationNumber") ??
      STANDARD_QUOTE_SUPPLIER.businessRegistrationNumber,
    supplierRepresentativeName:
      pickString(details, "supplierRepresentativeName") ??
      STANDARD_QUOTE_SUPPLIER.representativeName,
    supplierAddress: pickString(details, "supplierAddress") ?? STANDARD_QUOTE_SUPPLIER.address,
    supplierContactName:
      pickString(details, "supplierContactName") ?? STANDARD_QUOTE_SUPPLIER.contactName,
    supplierContactPhone:
      pickString(details, "supplierContactPhone") ?? STANDARD_QUOTE_SUPPLIER.contactPhone,
    supplierContactEmail: pickString(details, "supplierContactEmail"),
    currencyUnitLabel: pickString(details, "currencyUnitLabel") ?? "원",
    vatIncluded: pickBoolean(details, "vatIncluded", "vat_included"),
    vatPolicyLabel: pickString(details, "vatPolicyLabel") ?? STANDARD_QUOTE_DEFAULT_VAT_LABEL,
    deliveryLocationNote: pickString(details, "deliveryLocationNote", "delivery_location_note"),
    paymentTerms: pickString(details, "paymentTerms"),
    installationPolicy: pickString(details, "installationPolicy"),
    warrantyNote: pickString(details, "warrantyNote"),
    generalNotes: pickString(details, "generalNotes", "notes"),
    specialTerms: pickString(details, "specialTerms"),
    footerContactText: pickString(details, "footerContactText"),
    subtotalAmount,
    vatAmount,
    discountAmount,
    grandTotalAmount,
    hasPendingAmounts: pickBoolean(details, "hasPendingAmounts", "has_pending_amounts"),
    pendingAmountNote: pickString(details, "pendingAmountNote", "pending_amount_note"),
    lineItems: normalizedLineItems,
  };
}

function emptyInteractionSummary(): QuoteInteractionSummary {
  return {
    viewCount: 0,
    firstViewedAt: null,
    lastViewedAt: null,
    reviewConfirmedAt: null,
    acceptedAt: null,
    acceptedVersionId: null,
    acceptedShareId: null,
  };
}

function buildPublicQuoteInteraction({
  document,
  share,
  summary,
}: {
  document: QuoteDocument;
  share: QuoteDocumentShare;
  summary: QuoteInteractionSummary;
}): PublicQuoteInteraction {
  if (document.status === "accepted") {
    return {
      status: "confirmed",
      canConfirmReview: false,
      canRequestProceed: false,
      primaryActionLabel: "동의 완료",
      secondaryActionLabel: "인쇄 / 저장",
      helperText: "견적 내용에 동의하셨습니다. 담당자가 다음 단계를 안내드립니다.",
      summary,
    };
  }

  if (document.status === "expired" || document.status === "archived") {
    return {
      status: "locked",
      canConfirmReview: false,
      canRequestProceed: false,
      primaryActionLabel: "만료됨",
      secondaryActionLabel: "인쇄 / 저장",
      helperText: "현재 링크는 더 이상 응답을 받을 수 없습니다.",
      summary,
    };
  }

  return {
    status: "open",
    canConfirmReview: share.access_mode === "view",
    canRequestProceed: false,
    primaryActionLabel: "진행 동의",
    secondaryActionLabel: "인쇄 / 저장",
    helperText: "견적 내용을 검토한 뒤, 동의하시면 계약 단계로 진행됩니다.",
    summary,
  };
}

function buildPublicQuoteResponse(publicQuote: {
  share: QuoteDocumentShare;
  document: QuoteDocument;
  version: QuoteDocumentVersion;
  customer_name: string | null;
}, summary: QuoteInteractionSummary) {
  const quoteDetails = normalizeQuoteDetails(publicQuote.version.structured_json, {
    customerName: publicQuote.customer_name,
    title: publicQuote.version.title,
    quoteNumber: publicQuote.document.quote_number,
    issuedAt: publicQuote.version.created_at,
    validUntil: publicQuote.version.valid_until,
    subtotal: publicQuote.version.subtotal,
    discountAmount: publicQuote.version.discount_amount,
    vatAmount: publicQuote.version.tax_amount,
    totalAmount: publicQuote.version.total_amount,
  });

  return {
    quote: sanitizeQuoteDocument(publicQuote.document),
    version: sanitizeQuoteVersion(publicQuote.version),
    share: sanitizeQuoteShare(publicQuote.share),
    customer_name: publicQuote.customer_name,
    quote_details: quoteDetails,
    interaction: buildPublicQuoteInteraction({ ...publicQuote, summary }),
  };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  try {
    const publicQuote = await getPublicQuoteByToken(token);
    if (!publicQuote) {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다" }, { status: 404 });
    }

    const deal = await getDeal(publicQuote.document.deal_id);
    let summary = emptyInteractionSummary();
    if (deal) {
      try {
        await ensureQuoteInteractionLog({
          partner_account_id: deal.partner_account_id,
          customer_id: deal.customer_id,
          deal_id: deal.id,
          actor_user_id: null,
          actor_role: "partner",
          action_type: PUBLIC_QUOTE_VIEW_ACTION,
          target_type: "quote_document",
          target_id: publicQuote.document.id,
          summary: "공개 견적 열람",
          before_json: null,
          after_json: {
            version_id: publicQuote.version.id,
            share_id: publicQuote.share.id,
            token,
          },
          dedupeWindowMinutes: 30,
          dedupeByVersion: publicQuote.version.id,
          dedupeByShare: publicQuote.share.id,
          dedupeByToken: token,
        });
      } catch (logError) {
        console.warn("[partner/quote] view log skipped:", logError);
      }

      try {
        summary = await summarizeQuoteInteractions({
          quote_document_id: publicQuote.document.id,
          version_id: publicQuote.version.id,
          share_id: publicQuote.share.id,
          token,
        });
      } catch (summaryError) {
        console.warn("[partner/quote] interaction summary skipped:", summaryError);
      }
    }

    return NextResponse.json(
      buildPublicQuoteResponse(publicQuote, summary),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[partner/quote] GET error:", error);
    return NextResponse.json({ error: "공개 견적서를 불러오지 못했습니다" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      action?: string;
    };

    const token = body.token?.trim();
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    if (body.action !== "review_confirmed") {
      return NextResponse.json({ error: "지원하지 않는 요청입니다" }, { status: 400 });
    }

    const publicQuote = await getPublicQuoteByToken(token);
    if (!publicQuote) {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다" }, { status: 404 });
    }

    const deal = await getDeal(publicQuote.document.deal_id);
    if (!deal) {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다" }, { status: 404 });
    }

    if (publicQuote.document.status === "expired" || publicQuote.document.status === "archived") {
      return NextResponse.json({ error: "응답할 수 없는 견적서입니다" }, { status: 400 });
    }

    const updatedDocument =
      publicQuote.document.status === "accepted"
        ? publicQuote.document
        : await updateQuoteDocument(publicQuote.document.id, { status: "accepted" });

    try {
      await ensureQuoteInteractionLog({
        partner_account_id: deal.partner_account_id,
        customer_id: deal.customer_id,
        deal_id: deal.id,
        actor_user_id: null,
        actor_role: "partner",
        action_type: PUBLIC_QUOTE_REVIEW_ACTION,
        target_type: "quote_document",
        target_id: publicQuote.document.id,
        summary: "공개 견적 검토 완료 확인",
        before_json: null,
        after_json: {
          version_id: publicQuote.version.id,
          share_id: publicQuote.share.id,
          token,
        },
        dedupeWindowMinutes: 10,
        dedupeByVersion: publicQuote.version.id,
        dedupeByShare: publicQuote.share.id,
        dedupeByToken: token,
      });
    } catch (logError) {
      console.warn("[partner/quote] review log skipped:", logError);
    }

    try {
      await ensureQuoteInteractionLog({
        partner_account_id: deal.partner_account_id,
        customer_id: deal.customer_id,
        deal_id: deal.id,
        actor_user_id: null,
        actor_role: "partner",
        action_type: PUBLIC_QUOTE_ACCEPT_ACTION,
        target_type: "quote_document",
        target_id: publicQuote.document.id,
        summary: "공개 견적 수락",
        before_json: null,
        after_json: {
          version_id: publicQuote.version.id,
          share_id: publicQuote.share.id,
          token,
        },
        dedupeWindowMinutes: 10,
        dedupeByVersion: publicQuote.version.id,
        dedupeByShare: publicQuote.share.id,
        dedupeByToken: token,
      });
    } catch (logError) {
      console.warn("[partner/quote] accept log skipped:", logError);
    }

    // 고객 동의 알림 → 파트너 계정
    if (publicQuote.document.status !== "accepted" && deal.partner_account_id) {
      createInAppNotifications([{
        recipientType: "partner_account",
        recipientId: deal.partner_account_id,
        eventType: "quote_customer_agreed",
        notificationType: "status_update",
        categoryTag: "partner",
        scopeTag: "team",
        severity: "info",
        title: "고객 진행 동의",
        message: `${publicQuote.customer_name ?? "고객"}이 견적(${publicQuote.document.quote_number})에 동의했습니다.`,
        routeUrl: `/partner/quotes`,
        iconKey: "badge_check",
        tone: "green",
      }]).catch(console.error);
    }

    let summary = emptyInteractionSummary();
    try {
      summary = await summarizeQuoteInteractions({
        quote_document_id: publicQuote.document.id,
        version_id: publicQuote.version.id,
        share_id: publicQuote.share.id,
        token,
      });
    } catch (summaryError) {
      console.warn("[partner/quote] interaction summary skipped:", summaryError);
    }

    const payload = buildPublicQuoteResponse({
      ...publicQuote,
      document: updatedDocument,
    }, summary);

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[partner/quote] POST error:", error);
    return NextResponse.json({ error: "공개 견적 응답 처리에 실패했습니다" }, { status: 500 });
  }
}
