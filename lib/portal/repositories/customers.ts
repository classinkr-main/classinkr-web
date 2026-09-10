"server-only";

import { scoreCrmNameMatch } from "@/lib/crm-source-linking";
import { fetchAllSupabaseRows } from "@/lib/repositories/branch-hw";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InsertCustomer, UpdateCustomer } from "@/lib/supabase/database.types.v2";
import type {
  ActivityLog,
  CalendarEvent,
  CalendarSourceType,
  Customer,
  CustomerCrmCoverage,
  CustomerCrmCoverageStatus,
  CustomerCrmDiscrepancy,
  CustomerCrmSourceLinkSummary,
  CustomerDealHistoryItem,
  CustomerDealPreview,
  CustomerDealSummary,
  CustomerExternalCrmRecordSummary,
  CustomerDetailPayload,
  CustomerInsight,
  CustomerListItem,
  DealListItem,
} from "@/lib/portal/types";

interface CustomerRepositoryOptions {
  includeCrmCoverage?: boolean;
  crmCoverageDepth?: "summary" | "detail";
}

interface DealCustomerRow {
  id: string;
  customer_id: string;
}

interface CustomerDecorationDeal {
  id: string;
  customer_id: string;
  title: string;
  current_stage: DealListItem["current_stage"];
  status: DealListItem["status"];
  updated_at: string;
}

interface CrmSourceLinkRow {
  id: string;
  source_system: string;
  source_object: string;
  source_record_key: string;
  normalized_name: string | null;
  target_type: string;
  target_id: string;
  confidence: number | null;
  status: CustomerCrmSourceLinkSummary["status"];
  metadata: Record<string, unknown> | null;
  confirmed_at: string | null;
  updated_at: string;
}

interface ExternalCrmRecordRow {
  id: string;
  object_api_key: string;
  external_id: string;
  normalized_name: string | null;
  display_name: string | null;
  owner_name: string | null;
  status: string | null;
  amount: number | null;
  occurred_at: string | null;
  synced_at: string;
}

interface PartnerAccountOwnerRow {
  id: string;
  name: string;
  owner_name: string | null;
}

const CRM_COVERAGE_EXTERNAL_MATCH_THRESHOLD = 0.72;
const CRM_COVERAGE_MAX_LINKS = 8;
const CRM_COVERAGE_MAX_EXTERNAL_RECORDS = 5;
const CRM_DISCREPANCY_AMOUNT_ABSOLUTE_THRESHOLD = 10_000;
const CRM_DISCREPANCY_AMOUNT_RELATIVE_THRESHOLD = 0.05;

function compareIsoAsc(left: string, right: string) {
  return new Date(left).getTime() - new Date(right).getTime();
}

function isOpenDeal(deal: Pick<DealListItem, "status">) {
  return deal.status !== "closed" && deal.status !== "cancelled";
}

function emptyCustomerDealSummary(customer: Customer): CustomerDealSummary {
  return {
    customer_id: customer.id,
    partner_account_id: customer.partner_account_id,
    customer_name: customer.name,
    total_deals: 0,
    active_deals: 0,
    installation_deals: 0,
    unpaid_deals: 0,
    contracted_amount: 0,
    installed_amount: 0,
    paid_amount: 0,
    outstanding_amount: 0,
    last_deal_updated_at: null,
  };
}

function getCustomerCrmLabel(customer: Customer) {
  return [customer.name, customer.campus_name].filter(Boolean).join(" · ");
}

function getMetadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getMetadataNumber(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getLatestIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function formatCrmAmount(value: number | null | undefined) {
  if (value == null) return null;
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function normalizeCrmOwnerName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}（）·._-]/g, "");
}

function isUsableCrmOwnerName(value: string | null | undefined) {
  const normalized = normalizeCrmOwnerName(value);
  if (normalized.length < 2) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (/^[a-f0-9-]{12,}$/i.test(normalized)) return false;
  return true;
}

function createCrmCoverage(
  status: CustomerCrmCoverageStatus,
  links: CustomerCrmSourceLinkSummary[],
  externalRecords: CustomerExternalCrmRecordSummary[],
  warnings: string[],
  discrepancies: CustomerCrmDiscrepancy[],
  externalMatchCount = externalRecords.length
): CustomerCrmCoverage {
  const confirmedLinkCount = links.filter((link) => link.status === "confirmed").length;
  const candidateLinkCount = links.filter((link) => link.status === "candidate").length;

  return {
    status,
    source_link_count: links.length,
    confirmed_link_count: confirmedLinkCount,
    candidate_link_count: candidateLinkCount,
    external_match_count: externalMatchCount,
    last_linked_at: getLatestIso(links.map((link) => link.confirmed_at ?? link.updated_at)),
    last_external_synced_at: getLatestIso(externalRecords.map((record) => record.synced_at)),
    warnings,
    source_links: links.slice(0, CRM_COVERAGE_MAX_LINKS),
    external_records: externalRecords.slice(0, CRM_COVERAGE_MAX_EXTERNAL_RECORDS),
    discrepancies,
  };
}

function getCoverageStatus(
  links: CustomerCrmSourceLinkSummary[],
  externalMatchCount: number
): CustomerCrmCoverageStatus {
  const confirmedLinkCount = links.filter((link) => link.status === "confirmed").length;
  const confirmedExternalLinkCount = links.filter(
    (link) => link.source_system === "xiaoshouyi" && link.status === "confirmed"
  ).length;
  const candidateLinkCount = links.filter((link) => link.status === "candidate").length;

  if (confirmedLinkCount > 0 && confirmedExternalLinkCount > 0) return "verified";
  if (confirmedLinkCount > 0 || candidateLinkCount > 0 || externalMatchCount > 0) return "needs_review";
  return "unmatched";
}

function summarizeSourceLink(link: CrmSourceLinkRow): CustomerCrmSourceLinkSummary {
  return {
    id: link.id,
    source_system: link.source_system,
    source_object: link.source_object,
    source_record_key: link.source_record_key,
    status: link.status,
    confidence: link.confidence,
    source_label:
      getMetadataString(link.metadata, "source_label") ??
      getMetadataString(link.metadata, "source_customer_name") ??
      getMetadataString(link.metadata, "target_label") ??
      link.normalized_name ??
      null,
    source_owner: getMetadataString(link.metadata, "owner_name") ?? getMetadataString(link.metadata, "source_owner"),
    source_status: getMetadataString(link.metadata, "source_status"),
    source_amount: getMetadataNumber(link.metadata, "source_amount"),
    target_type: link.target_type,
    target_id: link.target_id,
    confirmed_at: link.confirmed_at,
    updated_at: link.updated_at,
  };
}

function getComparableInternalAmount(
  objectApiKey: string,
  summary: CustomerDealSummary | null
) {
  const normalized = objectApiKey.toLowerCase();
  if (normalized.includes("collection") || normalized.includes("financial")) {
    return {
      label: "내부 실수납",
      amount: summary?.paid_amount ?? 0,
    };
  }

  if (
    normalized.includes("opportun") ||
    normalized.includes("quote") ||
    normalized.includes("order") ||
    normalized.includes("performance")
  ) {
    return {
      label: "내부 계약금액",
      amount: summary?.contracted_amount ?? 0,
    };
  }

  return null;
}

function hasMeaningfulAmountGap(internalAmount: number, externalAmount: number) {
  const gap = Math.abs(internalAmount - externalAmount);
  if (gap < CRM_DISCREPANCY_AMOUNT_ABSOLUTE_THRESHOLD) return false;
  if (Math.max(internalAmount, externalAmount) === 0) return false;
  return gap / Math.max(internalAmount, externalAmount) >= CRM_DISCREPANCY_AMOUNT_RELATIVE_THRESHOLD;
}

function isClosedLikeStatus(value: string | null | undefined) {
  return /closed|complete|paid|won|성공|완료|수납|입금/i.test(value ?? "");
}

function isCancelledLikeStatus(value: string | null | undefined) {
  return /cancel|lost|drop|fail|취소|해지|실패|중단/i.test(value ?? "");
}

function buildCrmDiscrepancies({
  links,
  externalRecords,
  summary,
  internalOwnerName,
}: {
  links: CustomerCrmSourceLinkSummary[];
  externalRecords: CustomerExternalCrmRecordSummary[];
  summary: CustomerDealSummary | null;
  internalOwnerName?: string | null;
}) {
  const discrepancies: CustomerCrmDiscrepancy[] = [];
  const confirmedLinks = links.filter((link) => link.status === "confirmed");
  const candidateLinks = links.filter((link) => link.status === "candidate");
  const normalizedInternalOwner = normalizeCrmOwnerName(internalOwnerName);
  const ownerDiscrepancyKeys = new Set<string>();

  const addOwnerDiscrepancy = ({
    id,
    externalOwnerName,
    sourceLabel,
    detail,
  }: {
    id: string;
    externalOwnerName: string | null | undefined;
    sourceLabel: string | null;
    detail: string;
  }) => {
    const normalizedExternalOwner = normalizeCrmOwnerName(externalOwnerName);
    if (!normalizedInternalOwner || !isUsableCrmOwnerName(internalOwnerName)) return;
    if (!normalizedExternalOwner || !isUsableCrmOwnerName(externalOwnerName)) return;
    if (normalizedInternalOwner === normalizedExternalOwner) return;

    const key = `${normalizedInternalOwner}:${normalizedExternalOwner}:${sourceLabel ?? ""}`;
    if (ownerDiscrepancyKeys.has(key)) return;
    ownerDiscrepancyKeys.add(key);

    discrepancies.push({
      id,
      severity: "low",
      kind: "owner_gap",
      title: "담당자 확인",
      detail,
      internal_value: internalOwnerName ?? null,
      external_value: externalOwnerName ?? null,
      source_label: sourceLabel,
    });
  };

  if (confirmedLinks.length === 0 && (candidateLinks.length > 0 || externalRecords.length > 0)) {
    discrepancies.push({
      id: "missing-confirmed-link",
      severity: "medium",
      kind: "missing_confirmed_link",
      title: "확정 source link 필요",
      detail: "후보 또는 외부 CRM snapshot은 있지만 canonical 고객/거래로 확정된 연결이 없습니다.",
      internal_value: "확정 0건",
      external_value: `후보 ${candidateLinks.length + externalRecords.length}건`,
      source_label: null,
    });
  }

  for (const record of externalRecords.slice(0, CRM_COVERAGE_MAX_EXTERNAL_RECORDS)) {
    addOwnerDiscrepancy({
      id: `external-owner:${record.id}`,
      externalOwnerName: record.owner_name,
      sourceLabel: record.display_name ?? record.external_id,
      detail: "외부 CRM snapshot 담당자와 내부 파트너 계정 담당자가 다릅니다.",
    });

    const comparable = getComparableInternalAmount(record.object_api_key, summary);
    if (comparable && record.amount != null && hasMeaningfulAmountGap(comparable.amount, record.amount)) {
      discrepancies.push({
        id: `external-amount:${record.id}`,
        severity: comparable.amount === 0 || record.amount === 0 ? "high" : "medium",
        kind: "amount_gap",
        title: "외부 CRM 금액 차이",
        detail: `${record.object_api_key} snapshot 금액과 ${comparable.label}이 다릅니다.`,
        internal_value: formatCrmAmount(comparable.amount),
        external_value: formatCrmAmount(record.amount),
        source_label: record.display_name ?? record.external_id,
      });
    }

    if (isCancelledLikeStatus(record.status) && (summary?.active_deals ?? 0) > 0) {
      discrepancies.push({
        id: `external-status:${record.id}`,
        severity: "medium",
        kind: "status_gap",
        title: "외부 CRM 상태 확인",
        detail: "외부 CRM은 취소/실패 계열 상태인데 내부 CRM에는 진행 중 거래가 있습니다.",
        internal_value: `진행 ${summary?.active_deals ?? 0}건`,
        external_value: record.status,
        source_label: record.display_name ?? record.external_id,
      });
    }

    if (isClosedLikeStatus(record.status) && (summary?.outstanding_amount ?? 0) > 0) {
      discrepancies.push({
        id: `external-payment:${record.id}`,
        severity: "low",
        kind: "status_gap",
        title: "수납 상태 재확인",
        detail: "외부 CRM은 완료/수납 계열 상태인데 내부 CRM에는 미수금이 남아 있습니다.",
        internal_value: formatCrmAmount(summary?.outstanding_amount ?? 0),
        external_value: record.status,
        source_label: record.display_name ?? record.external_id,
      });
    }
  }

  for (const link of confirmedLinks) {
    if (link.source_system === "xiaoshouyi") {
      addOwnerDiscrepancy({
        id: `link-owner:${link.id}`,
        externalOwnerName: link.source_owner,
        sourceLabel: link.source_label ?? link.source_record_key,
        detail: "확정 source link 담당자와 내부 파트너 계정 담당자가 다릅니다.",
      });
    }

    const comparable = getComparableInternalAmount(link.source_object, summary);
    if (comparable && link.source_amount != null && hasMeaningfulAmountGap(comparable.amount, link.source_amount)) {
      discrepancies.push({
        id: `link-amount:${link.id}`,
        severity: comparable.amount === 0 || link.source_amount === 0 ? "high" : "medium",
        kind: "amount_gap",
        title: "확정 링크 금액 차이",
        detail: `${link.source_system}/${link.source_object} 확정 링크 금액과 ${comparable.label}이 다릅니다.`,
        internal_value: formatCrmAmount(comparable.amount),
        external_value: formatCrmAmount(link.source_amount),
        source_label: link.source_label ?? link.source_record_key,
      });
    }

    if (isCancelledLikeStatus(link.source_status) && (summary?.active_deals ?? 0) > 0) {
      discrepancies.push({
        id: `link-status:${link.id}`,
        severity: "medium",
        kind: "status_gap",
        title: "확정 링크 상태 확인",
        detail: "확정된 원천은 취소/실패 계열 상태인데 내부 CRM에는 진행 중 거래가 있습니다.",
        internal_value: `진행 ${summary?.active_deals ?? 0}건`,
        external_value: link.source_status,
        source_label: link.source_label ?? link.source_record_key,
      });
    }
  }

  return discrepancies.slice(0, 8);
}

function buildCoverageWarnings(
  links: CustomerCrmSourceLinkSummary[],
  externalMatchCount: number
) {
  const warnings: string[] = [];
  const confirmedLinkCount = links.filter((link) => link.status === "confirmed").length;
  const candidateLinkCount = links.filter((link) => link.status === "candidate").length;

  if (confirmedLinkCount === 0 && candidateLinkCount > 0) {
    warnings.push("REV/CRM 후보 매칭 승인 필요");
  }
  if (confirmedLinkCount === 0 && candidateLinkCount === 0) {
    warnings.push("앱 고객과 연결된 source link 없음");
  }
  if (externalMatchCount === 0) {
    warnings.push("외부 CRM snapshot 매칭 없음");
  } else if (confirmedLinkCount === 0) {
    warnings.push("외부 CRM 후보가 있지만 확정 source link 없음");
  }

  return warnings;
}

async function buildCustomerCrmCoverageMap(
  customers: Customer[],
  summaryMap: Map<string, CustomerDealSummary> = new Map(),
  depth: CustomerRepositoryOptions["crmCoverageDepth"] = "detail"
): Promise<Map<string, CustomerCrmCoverage>> {
  const coverageMap = new Map<string, CustomerCrmCoverage>();
  if (customers.length === 0) return coverageMap;

  const customerIds = customers.map((customer) => customer.id);
  const partnerAccountIds = Array.from(
    new Set(customers.map((customer) => customer.partner_account_id).filter(Boolean))
  );
  const supabase = createSupabaseAdminClient();

  try {
    const { data: dealRows, error: dealError } = await supabase
      .from("deals")
      .select("id, customer_id")
      .in("customer_id", customerIds)
      .limit(5000);

    if (dealError) throw dealError;

    const deals = (dealRows ?? []) as DealCustomerRow[];
    const dealIdToCustomerId = new Map(deals.map((deal) => [deal.id, deal.customer_id]));
    const dealIds = deals.map((deal) => deal.id);

    const partnerAccountsPromise =
      partnerAccountIds.length > 0
        ? supabase
            .from("partner_accounts")
            .select("id, name, owner_name")
            .in("id", partnerAccountIds)
        : Promise.resolve({ data: [], error: null });

    const customerLinksQuery = supabase
      .from("crm_source_links")
      .select("id, source_system, source_object, source_record_key, normalized_name, target_type, target_id, confidence, status, metadata, confirmed_at, updated_at")
      .eq("target_type", "customer")
      .in("target_id", customerIds)
      .order("updated_at", { ascending: false })
      .limit(5000);

    const partnerAccountLinksPromise =
      partnerAccountIds.length > 0
        ? supabase
            .from("crm_source_links")
            .select("id, source_system, source_object, source_record_key, normalized_name, target_type, target_id, confidence, status, metadata, confirmed_at, updated_at")
            .eq("target_type", "partner_account")
            .in("target_id", partnerAccountIds)
            .order("updated_at", { ascending: false })
            .limit(5000)
        : Promise.resolve({ data: [], error: null });

    const dealLinksPromise =
      dealIds.length > 0
        ? supabase
            .from("crm_source_links")
            .select("id, source_system, source_object, source_record_key, normalized_name, target_type, target_id, confidence, status, metadata, confirmed_at, updated_at")
            .eq("target_type", "deal")
            .in("target_id", dealIds)
            .order("updated_at", { ascending: false })
            .limit(5000)
        : Promise.resolve({ data: [], error: null });

    const externalRecordsPromise =
      depth === "detail"
        ? supabase
            .from("external_crm_records")
            .select("id, object_api_key, external_id, normalized_name, display_name, owner_name, status, amount, occurred_at, synced_at")
            .eq("source_system", "xiaoshouyi")
            .order("synced_at", { ascending: false })
            .limit(2000)
        : Promise.resolve({ data: [], error: null });

    const [
      partnerAccountsResult,
      customerLinksResult,
      partnerAccountLinksResult,
      dealLinksResult,
      externalRecordsResult,
    ] = await Promise.all([
      partnerAccountsPromise,
      customerLinksQuery,
      partnerAccountLinksPromise,
      dealLinksPromise,
      externalRecordsPromise,
    ]);

    if (partnerAccountsResult.error) throw partnerAccountsResult.error;
    if (customerLinksResult.error) throw customerLinksResult.error;
    if (partnerAccountLinksResult.error) throw partnerAccountLinksResult.error;
    if (dealLinksResult.error) throw dealLinksResult.error;
    if (externalRecordsResult.error) throw externalRecordsResult.error;

    const partnerAccountById = new Map(
      ((partnerAccountsResult.data ?? []) as PartnerAccountOwnerRow[]).map((account) => [account.id, account])
    );
    const linksByCustomerId = new Map<string, CustomerCrmSourceLinkSummary[]>();
    for (const link of (customerLinksResult.data ?? []) as CrmSourceLinkRow[]) {
      const items = linksByCustomerId.get(link.target_id) ?? [];
      items.push(summarizeSourceLink(link));
      linksByCustomerId.set(link.target_id, items);
    }

    const customerIdsByPartnerAccountId = new Map<string, string[]>();
    for (const customer of customers) {
      const items = customerIdsByPartnerAccountId.get(customer.partner_account_id) ?? [];
      items.push(customer.id);
      customerIdsByPartnerAccountId.set(customer.partner_account_id, items);
    }

    for (const link of (partnerAccountLinksResult.data ?? []) as CrmSourceLinkRow[]) {
      const linkedCustomerIds = customerIdsByPartnerAccountId.get(link.target_id) ?? [];
      for (const customerId of linkedCustomerIds) {
        const items = linksByCustomerId.get(customerId) ?? [];
        items.push(summarizeSourceLink(link));
        linksByCustomerId.set(customerId, items);
      }
    }

    for (const link of (dealLinksResult.data ?? []) as CrmSourceLinkRow[]) {
      const customerId = dealIdToCustomerId.get(link.target_id);
      if (!customerId) continue;
      const items = linksByCustomerId.get(customerId) ?? [];
      items.push(summarizeSourceLink(link));
      linksByCustomerId.set(customerId, items);
    }

    const externalRecords = (externalRecordsResult.data ?? []) as ExternalCrmRecordRow[];

    for (const customer of customers) {
      const customerLabel = getCustomerCrmLabel(customer);
      const links = (linksByCustomerId.get(customer.id) ?? [])
        .sort((left, right) => {
          const leftConfirmed = left.status === "confirmed" ? 1 : 0;
          const rightConfirmed = right.status === "confirmed" ? 1 : 0;
          if (leftConfirmed !== rightConfirmed) return rightConfirmed - leftConfirmed;
          return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
        });

      const matchedExternalRecords = externalRecords
        .map((record) => {
          const recordLabel = record.display_name ?? record.normalized_name ?? record.external_id;
          const confidence = scoreCrmNameMatch(customerLabel, recordLabel);
          return {
            id: record.id,
            object_api_key: record.object_api_key,
            external_id: record.external_id,
            display_name: record.display_name,
            owner_name: record.owner_name,
            status: record.status,
            amount: record.amount,
            occurred_at: record.occurred_at,
            synced_at: record.synced_at,
            confidence: Number(confidence.toFixed(4)),
          };
        })
        .filter((record) => record.confidence >= CRM_COVERAGE_EXTERNAL_MATCH_THRESHOLD)
        .sort((left, right) => {
          if (left.confidence !== right.confidence) return right.confidence - left.confidence;
          return new Date(right.synced_at).getTime() - new Date(left.synced_at).getTime();
        });
      const externalLinkCount = links.filter(
        (link) => link.source_system === "xiaoshouyi" && link.status !== "rejected"
      ).length;
      const externalMatchCount = Math.max(externalLinkCount, matchedExternalRecords.length);

      coverageMap.set(
        customer.id,
        createCrmCoverage(
          getCoverageStatus(links, externalMatchCount),
          links,
          matchedExternalRecords,
          buildCoverageWarnings(links, externalMatchCount),
          buildCrmDiscrepancies({
            links,
            externalRecords: matchedExternalRecords,
            summary: summaryMap.get(customer.id) ?? null,
            internalOwnerName: partnerAccountById.get(customer.partner_account_id)?.owner_name ?? null,
          }),
          externalMatchCount
        )
      );
    }

    return coverageMap;
  } catch (error) {
    const message = error instanceof Error ? error.message : "CRM coverage 조회 실패";
    for (const customer of customers) {
      coverageMap.set(
        customer.id,
        createCrmCoverage("error", [], [], [`CRM coverage 조회 오류: ${message}`], [])
      );
    }
    return coverageMap;
  }
}

function resolveAttentionLevel({
  summary,
  activeDealCount,
  primaryStage,
  nextEventAt,
  recentActivityAt,
}: {
  summary: CustomerDealSummary | null;
  activeDealCount: number;
  primaryStage: DealListItem["current_stage"] | null;
  nextEventAt: string | null;
  recentActivityAt: string | null;
}): CustomerInsight["attention_level"] {
  const now = Date.now();
  let score = 0;

  if ((summary?.outstanding_amount ?? 0) > 0) score += 2;
  if (activeDealCount > 1) score += 1;

  if (nextEventAt) {
    const diffDays = (new Date(nextEventAt).getTime() - now) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1) score += 2;
    else if (diffDays <= 7) score += 1;
  } else if (primaryStage === "confirmed") {
    score += 3;
  } else if (activeDealCount > 0) {
    score += 1;
  }

  if (recentActivityAt) {
    const inactiveDays = (now - new Date(recentActivityAt).getTime()) / (1000 * 60 * 60 * 24);
    if (inactiveDays >= 14 && activeDealCount > 0) score += 1;
  } else if (activeDealCount > 0) {
    score += 1;
  }

  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

async function buildCustomerListDecorations(
  customers: Customer[],
  summaryMap: Map<string, CustomerDealSummary>,
  partnerAccountId?: string
): Promise<{
  insightMap: Map<string, CustomerInsight>;
  dealPreviewMap: Map<string, CustomerDealPreview[]>;
}> {
  if (customers.length === 0) {
    return {
      insightMap: new Map(),
      dealPreviewMap: new Map(),
    };
  }

  const customerIds = customers.map((customer) => customer.id);
  const customerIdSet = new Set(customerIds);
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // 세 쿼리 모두 고객 전체를 대상으로 하므로 PostgREST 1000행 캡에 걸리면 뒤로 밀린 고객의
  // 최근 활동·다음 일정이 에러 없이 사라진다(= attention 배지가 조용히 틀어짐).
  // id 키셋으로 전량 읽고, 소비가 기대하는 순서는 아래에서 JS로 다시 세운다.
  const [deals, activityRows, eventRows] = await Promise.all([
    fetchAllSupabaseRows<CustomerDecorationDeal>((afterId, limit) => {
      let query = supabase
        .from("deals")
        .select("id, customer_id, title, current_stage, status, updated_at")
        .in("customer_id", customerIds);
      if (partnerAccountId) query = query.eq("partner_account_id", partnerAccountId);
      if (afterId) query = query.gt("id", afterId);
      return query.order("id", { ascending: true }).limit(limit);
    }),
    fetchAllSupabaseRows<Pick<ActivityLog, "id" | "customer_id" | "created_at">>(
      (afterId, limit) => {
        let query = supabase
          .from("activity_logs")
          .select("id, customer_id, created_at")
          .in("customer_id", customerIds);
        if (partnerAccountId) query = query.eq("partner_account_id", partnerAccountId);
        if (afterId) query = query.gt("id", afterId);
        return query.order("id", { ascending: true }).limit(limit);
      }
    ),
    fetchAllSupabaseRows<
      Pick<
        CalendarEvent,
        "id" | "customer_id" | "deal_id" | "source_type" | "starts_at" | "ends_at" | "status"
      >
    >((afterId, limit) => {
      let query = supabase
        .from("calendar_events")
        .select("id, customer_id, deal_id, source_type, starts_at, ends_at, status")
        .in("customer_id", customerIds)
        .eq("status", "active")
        .gte("ends_at", nowIso);
      if (partnerAccountId) query = query.eq("partner_account_id", partnerAccountId);
      if (afterId) query = query.gt("id", afterId);
      return query.order("id", { ascending: true }).limit(limit);
    }),
  ]);

  // 고객별 push 순서가 그대로 최신순이어야 primaryDeal/미리보기가 최신 거래를 잡는다
  deals.sort((left, right) => compareIsoAsc(right.updated_at, left.updated_at));
  eventRows.sort((left, right) => compareIsoAsc(left.starts_at, right.starts_at));

  const dealsByCustomerId = new Map<string, CustomerDecorationDeal[]>();
  for (const deal of deals) {
    if (!customerIdSet.has(deal.customer_id)) continue;
    const items = dealsByCustomerId.get(deal.customer_id) ?? [];
    items.push(deal);
    dealsByCustomerId.set(deal.customer_id, items);
  }

  const recentActivityByCustomerId = new Map<string, string>();
  for (const row of activityRows) {
    if (!row.customer_id) continue;
    const current = recentActivityByCustomerId.get(row.customer_id);
    if (!current || compareIsoAsc(current, row.created_at) < 0) {
      recentActivityByCustomerId.set(row.customer_id, row.created_at);
    }
  }

  const nextEventByCustomerId = new Map<
    string,
    { starts_at: string; source_type: CalendarSourceType }
  >();
  const nextEventByDealId = new Map<string, string>();

  for (const row of eventRows) {
    if (row.customer_id && !nextEventByCustomerId.has(row.customer_id)) {
      nextEventByCustomerId.set(row.customer_id, {
        starts_at: row.starts_at,
        source_type: row.source_type,
      });
    }

    if (row.deal_id) {
      const current = nextEventByDealId.get(row.deal_id);
      if (!current || compareIsoAsc(row.starts_at, current) < 0) {
        nextEventByDealId.set(row.deal_id, row.starts_at);
      }
    }
  }

  const insightMap = new Map<string, CustomerInsight>();
  const dealPreviewMap = new Map<string, CustomerDealPreview[]>();

  for (const customer of customers) {
    const customerDeals = dealsByCustomerId.get(customer.id) ?? [];
    const activeDeals = customerDeals.filter(isOpenDeal);
    const rankedDeals = activeDeals.length > 0 ? activeDeals : customerDeals;
    const primaryDeal = rankedDeals[0] ?? null;
    const nextEvent = nextEventByCustomerId.get(customer.id) ?? null;
    const recentActivityAt = recentActivityByCustomerId.get(customer.id) ?? null;
    const summary = summaryMap.get(customer.id) ?? null;

    dealPreviewMap.set(
      customer.id,
      rankedDeals.slice(0, 2).map((deal) => ({
        deal_id: deal.id,
        title: deal.title,
        current_stage: deal.current_stage,
        status: deal.status,
        updated_at: deal.updated_at,
        next_event_at: nextEventByDealId.get(deal.id) ?? null,
      }))
    );

    insightMap.set(customer.id, {
      primary_stage: primaryDeal?.current_stage ?? null,
      next_event_at: nextEvent?.starts_at ?? null,
      next_event_type: nextEvent?.source_type ?? null,
      recent_activity_at: recentActivityAt,
      attention_level: resolveAttentionLevel({
        summary,
        activeDealCount: activeDeals.length,
        primaryStage: primaryDeal?.current_stage ?? null,
        nextEventAt: nextEvent?.starts_at ?? null,
        recentActivityAt,
      }),
    });
  }

  return { insightMap, dealPreviewMap };
}

export async function listCustomers(partnerAccountId?: string): Promise<Customer[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (partnerAccountId) {
    query = query.eq("partner_account_id", partnerAccountId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as Customer[];
}

export async function listCustomerListItems(
  partnerAccountId: string,
  options: CustomerRepositoryOptions = {}
): Promise<CustomerListItem[]> {
  const [customers, summaries] = await Promise.all([
    listCustomers(partnerAccountId),
    listCustomerDealSummaries(partnerAccountId),
  ]);

  const summaryMap = new Map(
    summaries.map((summary) => [summary.customer_id, summary])
  );
  const { insightMap, dealPreviewMap } = await buildCustomerListDecorations(
    customers,
    summaryMap,
    partnerAccountId
  );
  const crmCoverageMap = options.includeCrmCoverage
    ? await buildCustomerCrmCoverageMap(customers, summaryMap, options.crmCoverageDepth ?? "summary")
    : new Map<string, CustomerCrmCoverage>();

  return customers.map((customer) => ({
    customer,
    summary: summaryMap.get(customer.id) ?? null,
    insight: insightMap.get(customer.id) ?? null,
    deal_previews: dealPreviewMap.get(customer.id) ?? [],
    ...(options.includeCrmCoverage
      ? { crm_coverage: crmCoverageMap.get(customer.id) ?? null }
      : {}),
  }));
}

export async function listAllCustomerListItems(
  options: CustomerRepositoryOptions = {}
): Promise<CustomerListItem[]> {
  const [customers, summaries] = await Promise.all([
    listCustomers(),
    listCustomerDealSummaries(),
  ]);

  const summaryMap = new Map(
    summaries.map((summary) => [summary.customer_id, summary])
  );
  const { insightMap, dealPreviewMap } = await buildCustomerListDecorations(
    customers,
    summaryMap
  );
  const crmCoverageMap = options.includeCrmCoverage
    ? await buildCustomerCrmCoverageMap(customers, summaryMap, options.crmCoverageDepth ?? "summary")
    : new Map<string, CustomerCrmCoverage>();

  return customers.map((customer) => ({
    customer,
    summary: summaryMap.get(customer.id) ?? null,
    insight: insightMap.get(customer.id) ?? null,
    deal_previews: dealPreviewMap.get(customer.id) ?? [],
    ...(options.includeCrmCoverage
      ? { crm_coverage: crmCoverageMap.get(customer.id) ?? null }
      : {}),
  }));
}

// Lite 목록 소비처(개요 metrics·PortalHome 기관 카드·CRM 통합 고객 행)가 읽는 컬럼만.
// notes/business_number/created_by 는 세 소비처 어디도 읽지 않는다 — Row 캐스팅 구조라
// 새 소비처가 그 셋을 읽으면 여기에 먼저 넣어야 하고, 아니면 무음 undefined 가 된다.
const CUSTOMER_LITE_COLUMNS =
  "id, partner_account_id, name, contact_name, email, phone, address, campus_name, region_label, created_at, updated_at";

async function listCustomersLite(): Promise<Customer[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_LITE_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []) as Customer[];
}

// 개요 화면처럼 insight/deal_previews가 필요 없는 호출자용 —
// decoration 쿼리(거래·활동·일정 3회 왕복)를 건너뛰고 컬럼도 좁혀 읽는다.
export async function listAllCustomerListItemsLite(): Promise<CustomerListItem[]> {
  const [customers, summaries] = await Promise.all([
    listCustomersLite(),
    listCustomerDealSummaries(),
  ]);

  const summaryMap = new Map(
    summaries.map((summary) => [summary.customer_id, summary])
  );

  return customers.map((customer) => ({
    customer,
    summary: summaryMap.get(customer.id) ?? null,
    insight: null,
    deal_previews: [],
  }));
}

export async function getCustomer(customerId: string): Promise<Customer | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error) return null;
  return data as Customer;
}

export async function getCustomerDealSummary(
  customerId: string
): Promise<CustomerDealSummary | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customer_deal_summary")
    .select("*")
    .eq("customer_id", customerId)
    .single();

  if (error) return null;
  return data as CustomerDealSummary;
}

export async function listCustomerDealSummaries(
  partnerAccountId?: string
): Promise<CustomerDealSummary[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("customer_deal_summary")
    .select("*")
    .order("last_deal_updated_at", { ascending: false, nullsFirst: false });

  if (partnerAccountId) {
    query = query.eq("partner_account_id", partnerAccountId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as CustomerDealSummary[];
}

export async function listCustomerDealHistory(
  customerId: string
): Promise<CustomerDealHistoryItem[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customer_deal_history")
    .select("*")
    .eq("customer_id", customerId)
    .order("deal_updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as CustomerDealHistoryItem[];
}

export async function listRecentCustomerActivity(
  customerId: string,
  limit = 20
): Promise<ActivityLog[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export async function listRecentCustomerCalendarEvents(
  customerId: string,
  limit = 20
): Promise<CalendarEvent[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .select("*, deals(title, current_stage)")
    .eq("customer_id", customerId)
    .order("starts_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as Array<
    CalendarEvent & {
      deals?: {
        title: string | null;
        current_stage: DealListItem["current_stage"] | null;
      } | null;
    }
  >).map((event) => ({
    ...event,
    deal_title: event.deals?.title ?? null,
    deal_stage: event.deals?.current_stage ?? null,
  }));
}

export async function getCustomerDetail(
  customerId: string,
  options: CustomerRepositoryOptions = {}
): Promise<CustomerDetailPayload | null> {
  const [customer, summary, deals, recentActivity, recentCalendarEvents] =
    await Promise.all([
      getCustomer(customerId),
      getCustomerDealSummary(customerId),
      listCustomerDealHistory(customerId),
      listRecentCustomerActivity(customerId, 12),
      listRecentCustomerCalendarEvents(customerId, 12),
    ]);

  if (!customer) {
    return null;
  }

  const resolvedSummary = summary ?? emptyCustomerDealSummary(customer);
  const crmCoverage = options.includeCrmCoverage
    ? (await buildCustomerCrmCoverageMap(
        [customer],
        new Map([[customer.id, resolvedSummary]]),
        options.crmCoverageDepth ?? "detail"
      )).get(customer.id) ?? null
    : null;

  return {
    customer,
    summary: resolvedSummary,
    deals,
    recent_activity: recentActivity,
    recent_calendar_events: recentCalendarEvents,
    ...(options.includeCrmCoverage ? { crm_coverage: crmCoverage } : {}),
  };
}

export async function getCustomerDetailForPartnerAccount(
  customerId: string,
  partnerAccountId: string,
  options: CustomerRepositoryOptions = {}
): Promise<CustomerDetailPayload | null> {
  const detail = await getCustomerDetail(customerId, options);
  if (!detail) return null;
  if (detail.customer.partner_account_id !== partnerAccountId) return null;
  return detail;
}

/* ─── Write Operations ──────────────────────────────────── */

export async function createCustomer(
  input: InsertCustomer
): Promise<Customer> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customers")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as Customer;
}

export async function updateCustomer(
  customerId: string,
  input: UpdateCustomer
): Promise<Customer> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customers")
    .update(input)
    .eq("id", customerId)
    .select()
    .single();

  if (error) throw error;
  return data as Customer;
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId);

  if (error) throw error;
}
