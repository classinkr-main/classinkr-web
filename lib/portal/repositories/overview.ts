"server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ActivityLog,
  CalendarEvent,
  CustomerDealHistoryItem,
  CustomerListItem,
  DealStage,
  InstallationEvent,
  PaymentRecord,
} from "@/lib/portal/types";
import type {
  PartnerOverviewMetrics,
  PortalOverviewPayload,
} from "@/lib/portal/repositories/partner-read";
import type {
  CommercialOverviewRange,
  CommercialOverviewAgendaItem,
  CommercialOverviewAlert,
  CommercialOverviewPayload,
  CommercialOverviewStageCount,
} from "@/lib/portal/overview-types";
import {
  listAllCustomerListItems,
  listAllCustomerListItemsLite,
} from "@/lib/portal/repositories/customers";
import { listDealListItems } from "@/lib/portal/repositories/deals";
import {
  getLegacyCustomerDetail,
  listLegacyCustomerListItems,
} from "@/lib/portal/repositories/legacy";

const STAGE_ORDER: DealStage[] = [
  "contact",
  "quote",
  "contract",
  "confirmed",
  "installation",
  "payment",
  "closed",
  "cancelled",
];

const STAGE_LABEL: Record<DealStage, string> = {
  contact: "컨택",
  quote: "견적",
  contract: "계약",
  confirmed: "확정",
  installation: "설치",
  payment: "수납",
  closed: "종결",
  cancelled: "취소",
};

const RANGE_DAY_COUNT: Record<CommercialOverviewRange, number> = {
  today: 1,
  week: 7,
  month: 30,
  quarter: 90,
};

function buildStageCounts(stages: DealStage[]): CommercialOverviewStageCount[] {
  const counts = new Map<DealStage, number>();

  for (const stage of stages) {
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }

  return STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABEL[stage],
    count: counts.get(stage) ?? 0,
  }));
}

function sortByDateDesc<T>(items: T[], getValue: (item: T) => string | null | undefined) {
  return [...items].sort((left, right) => {
    const leftValue = getValue(left);
    const rightValue = getValue(right);
    return new Date(rightValue ?? 0).getTime() - new Date(leftValue ?? 0).getTime();
  });
}

function sortByDateAsc<T>(items: T[], getValue: (item: T) => string | null | undefined) {
  return [...items].sort((left, right) => {
    const leftValue = getValue(left);
    const rightValue = getValue(right);
    return new Date(leftValue ?? 0).getTime() - new Date(rightValue ?? 0).getTime();
  });
}

function getRangeBounds(range: CommercialOverviewRange, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (RANGE_DAY_COUNT[range] - 1));

  return { start, end };
}

function isWithinRange(
  value: string | null | undefined,
  range: CommercialOverviewRange,
  now = new Date()
) {
  if (!value) return false;

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;

  const { start, end } = getRangeBounds(range, now);
  return target >= start && target <= end;
}

function filterCustomersByRange(
  customers: CustomerListItem[],
  range: CommercialOverviewRange,
  now = new Date()
) {
  return customers.filter((item) =>
    isWithinRange(
      item.summary?.last_deal_updated_at ?? item.customer.updated_at,
      range,
      now
    )
  );
}
function buildAgendaFromInstallations(
  installations: InstallationEvent[],
  customerNameById: Map<string, string>,
  dealTitleById: Map<string, string>
): CommercialOverviewAgendaItem[] {
  return sortByDateAsc(installations, (item) => item.scheduled_start_at)
    .filter((item) => item.status !== "cancelled")
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      kind: "installation",
      title: dealTitleById.get(item.deal_id) ?? "설치 일정",
      description: item.location ?? item.notes,
      customer_id: item.customer_id,
      customer_name: customerNameById.get(item.customer_id) ?? null,
      deal_id: item.deal_id,
      deal_title: dealTitleById.get(item.deal_id) ?? null,
      starts_at: item.scheduled_start_at,
      ends_at: item.scheduled_end_at,
      status: item.status,
    }));
}

function buildAlertsFromDeals(
  deals: Array<{
    id: string;
    customer_id: string;
    title: string;
    current_stage: DealStage;
    outstanding_amount: number;
    payment_status: string;
  }>,
  customerNameById: Map<string, string>,
  installationsByDealId: Map<string, InstallationEvent[]>
): CommercialOverviewAlert[] {
  const alerts: CommercialOverviewAlert[] = [];

  for (const deal of deals
    .filter((item) => item.outstanding_amount > 0)
    .sort((left, right) => right.outstanding_amount - left.outstanding_amount)
    .slice(0, 3)) {
    alerts.push({
      id: `outstanding-${deal.id}`,
      kind: "outstanding",
      tone: "warning",
      title: `${customerNameById.get(deal.customer_id) ?? "기관"} 미수금`,
      description: `${deal.title} · ${deal.outstanding_amount.toLocaleString("ko-KR")}원 미수`,
      customer_id: deal.customer_id,
      deal_id: deal.id,
    });
  }

  for (const deal of deals
    .filter((item) => item.current_stage === "confirmed")
    .slice(0, 2)) {
    const hasInstallation = (installationsByDealId.get(deal.id) ?? []).some(
      (item) => item.status !== "cancelled"
    );

    if (!hasInstallation) {
      alerts.push({
        id: `installation-${deal.id}`,
        kind: "installation",
        tone: "accent",
        title: "설치 일정 생성 필요",
        description: `${deal.title} · 확정 이후 설치 일정이 아직 없습니다.`,
        customer_id: deal.customer_id,
        deal_id: deal.id,
      });
    }
  }

  for (const deal of deals
    .filter(
      (item) =>
        (item.current_stage === "quote" || item.current_stage === "contract") &&
        item.payment_status === "unpaid"
    )
    .slice(0, 2)) {
    alerts.push({
      id: `stage-${deal.id}`,
      kind: "attention",
      tone: "neutral",
      title: "다음 단계 확인 필요",
      description: `${deal.title} · ${STAGE_LABEL[deal.current_stage]} 단계에서 후속 조치가 필요합니다.`,
      customer_id: deal.customer_id,
      deal_id: deal.id,
    });
  }

  return alerts.slice(0, 6);
}

function buildOverviewFromCustomerItemsAndDealHistory(
  customers: CustomerListItem[],
  dealHistory: CustomerDealHistoryItem[],
  calendarEvents: CalendarEvent[],
  range: CommercialOverviewRange = "today"
): CommercialOverviewPayload {
  const now = new Date();
  const filteredCustomers = filterCustomersByRange(customers, range, now);
  const filteredDealHistory = dealHistory.filter((deal) =>
    isWithinRange(deal.deal_updated_at, range, now)
  );
  const filteredCalendarEvents = calendarEvents.filter((event) =>
    isWithinRange(event.starts_at, range, now)
  );
  const customerNameById = new Map(
    customers.map((item) => [item.customer.id, item.customer.name])
  );
  const dealTitleById = new Map(
    dealHistory.map((deal) => [deal.deal_id, deal.deal_title])
  );

  const metrics = {
    customer_count: filteredCustomers.length,
    active_deal_count: filteredDealHistory.filter((deal) => deal.deal_status === "active").length,
    quote_count: filteredDealHistory.filter((deal) => deal.current_stage === "quote").length,
    contract_count: filteredDealHistory.filter((deal) => deal.current_stage === "contract").length,
    confirmed_count: filteredDealHistory.filter((deal) => deal.current_stage === "confirmed").length,
    scheduled_installation_count: filteredCalendarEvents.filter(
      (event) => event.status !== "cancelled"
    ).length,
    outstanding_amount: filteredCustomers.reduce(
      (sum, item) => sum + (item.summary?.outstanding_amount ?? 0),
      0
    ),
    outstanding_customer_count: filteredCustomers.filter(
      (item) => (item.summary?.outstanding_amount ?? 0) > 0
    ).length,
  };

  const alerts = buildAlertsFromDeals(
    filteredDealHistory.map((deal) => ({
      id: deal.deal_id,
      customer_id: deal.customer_id,
      title: deal.deal_title,
      current_stage: deal.current_stage,
      outstanding_amount: deal.outstanding_amount,
      payment_status: deal.payment_status,
    })),
    customerNameById,
    new Map<string, InstallationEvent[]>()
  );

  const agenda = sortByDateAsc(filteredCalendarEvents, (item) => item.starts_at)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      kind: item.source_type,
      title: item.title,
      description: item.description,
      customer_id: item.customer_id,
      customer_name: item.customer_id ? customerNameById.get(item.customer_id) ?? null : null,
      deal_id: item.deal_id,
      deal_title: item.deal_id ? dealTitleById.get(item.deal_id) ?? null : null,
      starts_at: item.starts_at,
      ends_at: item.ends_at,
      status: item.status,
    }));

  return {
    metrics,
    stage_counts: buildStageCounts(filteredDealHistory.map((deal) => deal.current_stage)),
    alerts,
    agenda,
    updated_at: new Date().toISOString(),
  };
}

export async function getCommercialOverview(
  range: CommercialOverviewRange = "today"
): Promise<CommercialOverviewPayload> {
  const supabase = createSupabaseAdminClient();
  const [customers, deals, installations] = await Promise.all([
    // 개요 metrics는 customer/summary만 사용 — decoration 쿼리 생략
    listAllCustomerListItemsLite(),
    listDealListItems(),
    supabase
      .from("installation_events")
      .select("*")
      .order("scheduled_start_at", { ascending: true })
      .limit(12),
  ]);

  if (installations.error) {
    throw installations.error;
  }

  const installationRows = (installations.data ?? []) as InstallationEvent[];
  const now = new Date();
  const filteredCustomers = filterCustomersByRange(customers, range, now);
  const filteredDeals = deals.filter((deal) => isWithinRange(deal.updated_at, range, now));
  const filteredInstallationRows = installationRows.filter((item) =>
    isWithinRange(item.scheduled_start_at, range, now)
  );
  const customerNameById = new Map(
    customers.map((item) => [item.customer.id, item.customer.name])
  );
  const dealTitleById = new Map(deals.map((deal) => [deal.id, deal.title]));
  const installationsByDealId = installationRows.reduce((map, item) => {
    const items = map.get(item.deal_id) ?? [];
    items.push(item);
    map.set(item.deal_id, items);
    return map;
  }, new Map<string, InstallationEvent[]>());

  return {
    metrics: {
      customer_count: filteredCustomers.length,
      active_deal_count: filteredDeals.filter((deal) => deal.status === "active").length,
      quote_count: filteredDeals.filter((deal) => deal.current_stage === "quote").length,
      contract_count: filteredDeals.filter((deal) => deal.current_stage === "contract").length,
      confirmed_count: filteredDeals.filter((deal) => deal.current_stage === "confirmed").length,
      scheduled_installation_count: filteredInstallationRows.filter(
        (item) => item.status !== "cancelled" && item.status !== "completed"
      ).length,
      outstanding_amount: filteredCustomers.reduce(
        (sum, item) => sum + (item.summary?.outstanding_amount ?? 0),
        0
      ),
      outstanding_customer_count: filteredCustomers.filter(
        (item) => (item.summary?.outstanding_amount ?? 0) > 0
      ).length,
    },
    stage_counts: buildStageCounts(filteredDeals.map((deal) => deal.current_stage)),
    alerts: buildAlertsFromDeals(
      filteredDeals.map((deal) => ({
        id: deal.id,
        customer_id: deal.customer_id,
        title: deal.title,
        current_stage: deal.current_stage,
        outstanding_amount: deal.outstanding_amount,
        payment_status: deal.payment_status,
      })),
      customerNameById,
      installationsByDealId
    ),
    agenda: buildAgendaFromInstallations(
      filteredInstallationRows,
      customerNameById,
      dealTitleById
    ),
    updated_at: new Date().toISOString(),
  };
}

export async function getAdminPartnerPortalOverview(): Promise<PortalOverviewPayload> {
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const [
    customers,
    deals,
    activityResult,
    installationResult,
    paymentResult,
    calendarResult,
  ] = await Promise.all([
    listAllCustomerListItems(),
    listDealListItems(),
    supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("installation_events")
      .select("*")
      .neq("status", "cancelled")
      .gte("scheduled_end_at", nowIso)
      .order("scheduled_start_at", { ascending: true })
      .limit(12),
    supabase
      .from("payments_v2")
      .select("*")
      .order("paid_at", { ascending: false })
      .limit(12),
    supabase
      .from("calendar_events")
      .select("*")
      .eq("status", "active")
      .gte("ends_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(12),
  ]);

  if (activityResult.error) throw activityResult.error;
  if (installationResult.error) throw installationResult.error;
  if (paymentResult.error) throw paymentResult.error;
  if (calendarResult.error) throw calendarResult.error;

  const metrics = customers.reduce<PartnerOverviewMetrics>(
    (acc, item) => {
      acc.customer_count += 1;
      acc.active_deal_count += item.summary?.active_deals ?? 0;
      acc.installation_deal_count += item.summary?.installation_deals ?? 0;
      acc.unpaid_deal_count += item.summary?.unpaid_deals ?? 0;
      acc.contracted_amount += item.summary?.contracted_amount ?? 0;
      acc.installed_amount += item.summary?.installed_amount ?? 0;
      acc.paid_amount += item.summary?.paid_amount ?? 0;
      acc.outstanding_amount += item.summary?.outstanding_amount ?? 0;
      return acc;
    },
    {
      customer_count: 0,
      active_deal_count: 0,
      installation_deal_count: 0,
      unpaid_deal_count: 0,
      contracted_amount: 0,
      installed_amount: 0,
      paid_amount: 0,
      outstanding_amount: 0,
    }
  );

  const dealTitleById = new Map(deals.map((deal) => [deal.id, deal.title]));
  const upcomingInstallations = ((installationResult.data ?? []) as InstallationEvent[]).map(
    (item) => ({
      ...item,
      title: dealTitleById.get(item.deal_id) ?? "Installation",
    })
  ) as InstallationEvent[];

  return {
    mode: "legacy",
    metrics,
    customers,
    deals,
    recent_activity: (activityResult.data ?? []) as ActivityLog[],
    upcoming_installations: upcomingInstallations,
    recent_payments: (paymentResult.data ?? []) as PaymentRecord[],
    recent_calendar_events: (calendarResult.data ?? []) as CalendarEvent[],
    inventory_summary: [],
  };
}

export async function getLegacyCommercialOverview(
  range: CommercialOverviewRange = "today"
): Promise<CommercialOverviewPayload> {
  const customers = await listLegacyCustomerListItems();
  const details = (
    await Promise.all(customers.map((item) => getLegacyCustomerDetail(item.customer.id)))
  ).filter((item): item is NonNullable<typeof item> => Boolean(item));

  return buildOverviewFromCustomerItemsAndDealHistory(
    customers,
    details.flatMap((item) => item.deals),
    sortByDateDesc(
      details.flatMap((item) => item.recent_calendar_events),
      (item) => item.starts_at
    ),
    range
  );
}
