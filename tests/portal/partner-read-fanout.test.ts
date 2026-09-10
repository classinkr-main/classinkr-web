import { beforeEach, describe, expect, it, vi } from "vitest";

const { listCustomerListItems, listDealListItems, getDealDetailForPartnerAccount } = vi.hoisted(
  () => ({
    listCustomerListItems: vi.fn(),
    listDealListItems: vi.fn(),
    getDealDetailForPartnerAccount: vi.fn(),
  })
);

vi.mock("@/lib/portal/repositories/customers", () => ({
  listCustomerListItems,
  getCustomerDetailForPartnerAccount: vi.fn(),
}));

vi.mock("@/lib/portal/repositories/deals", () => ({
  listDealListItems,
  getDealDetailForPartnerAccount,
}));

vi.mock("@/lib/portal/repositories/legacy", () => ({
  listLegacyCustomerListItems: vi.fn(async () => []),
  getLegacyCustomerDetail: vi.fn(async () => null),
  getLegacyDealDetail: vi.fn(async () => null),
}));

import { loadPortalOverview, loadPartnerDocuments } from "@/lib/portal/repositories/partner-read";
import type { PartnerAccountContext } from "@/lib/portal/context";
import type { CustomerListItem, DealDetailPayload, DealListItem } from "@/lib/portal/types";

const context: PartnerAccountContext = {
  userId: "user-1",
  partnerAccountId: "partner-1",
  legacyPartnerId: null,
  customerId: null,
  role: "partner",
  source: "v2",
};

function makeDeal(i: number): DealListItem {
  return {
    id: `deal-${i}`,
    partner_account_id: "partner-1",
    customer_id: `cust-${i}`,
    deal_code: `D${i}`,
    title: `Deal ${i}`,
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
    notes: null,
    created_by: null,
    owner_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    // 서로 다른 updated_at → 최근순 정렬 후 상한 slice 대상이 달라짐을 확인할 수 있게.
    updated_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    customer_name: null,
    customer_contact_name: null,
    customer_region_label: null,
    customer_campus_name: null,
    owner_name: null,
  };
}

function makeDealDetail(deal: DealListItem): DealDetailPayload {
  return {
    deal: {
      id: deal.id,
      partner_account_id: deal.partner_account_id,
      customer_id: deal.customer_id,
      deal_code: deal.deal_code,
      title: deal.title,
      status: deal.status,
      current_stage: deal.current_stage,
      expected_amount: 0,
      contracted_amount: 0,
      installed_amount: 0,
      paid_amount: 0,
      outstanding_amount: 0,
      payment_status: deal.payment_status,
      starts_at: null,
      closed_at: null,
      notes: null,
      created_by: null,
      owner_id: null,
      created_at: deal.created_at,
      updated_at: deal.updated_at,
    },
    customer: {
      id: deal.customer_id,
      partner_account_id: deal.partner_account_id,
      name: "고객",
      contact_name: null,
      email: null,
      phone: null,
      address: null,
      business_number: null,
      campus_name: null,
      region_label: null,
      notes: null,
      created_by: null,
      created_at: deal.created_at,
      updated_at: deal.updated_at,
    },
    line_items: [],
    quote_documents: [],
    contract_documents: [],
    installations: [],
    payments: [],
    receipts: [],
    activity_logs: [],
    calendar_events: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  listCustomerListItems.mockReset();
  listDealListItems.mockReset();
  getDealDetailForPartnerAccount.mockReset();
});

describe("loadPartnerDocuments fan-out cap (T10)", () => {
  it("invokes deal-detail lookup at most PORTAL_DETAIL_FANOUT_LIMIT (20) times for 30 deals", async () => {
    const deals = Array.from({ length: 30 }, (_, i) => makeDeal(i));
    listDealListItems.mockResolvedValue(deals);
    getDealDetailForPartnerAccount.mockImplementation(async (dealId: string) => {
      const deal = deals.find((d) => d.id === dealId);
      return deal ? makeDealDetail(deal) : null;
    });

    const result = await loadPartnerDocuments(context);

    expect(getDealDetailForPartnerAccount).toHaveBeenCalledTimes(20);
    expect(result.mode).toBe("v2");

    // 최근 updated_at 20건만 상세 조회 대상이어야 한다(가장 오래된 deal-0..9 는 제외).
    const calledIds = getDealDetailForPartnerAccount.mock.calls.map((call) => call[0]);
    expect(calledIds).not.toContain("deal-0");
    expect(calledIds).not.toContain("deal-9");
    expect(calledIds).toContain("deal-29");
    expect(calledIds).toContain("deal-10");
  });

  it("does not call deal-detail lookup beyond the cap when deals <= limit", async () => {
    const deals = Array.from({ length: 5 }, (_, i) => makeDeal(i));
    listDealListItems.mockResolvedValue(deals);
    getDealDetailForPartnerAccount.mockImplementation(async (dealId: string) => {
      const deal = deals.find((d) => d.id === dealId);
      return deal ? makeDealDetail(deal) : null;
    });

    await loadPartnerDocuments(context);

    expect(getDealDetailForPartnerAccount).toHaveBeenCalledTimes(5);
  });
});

describe("loadPortalOverview concurrency (T10)", () => {
  it("starts the customers and deals loads concurrently rather than sequentially", async () => {
    const customersDeferred = deferred<CustomerListItem[]>();
    const dealsDeferred = deferred<DealListItem[]>();

    listCustomerListItems.mockReturnValue(customersDeferred.promise);
    listDealListItems.mockReturnValue(dealsDeferred.promise);
    getDealDetailForPartnerAccount.mockResolvedValue(null);

    const overviewPromise = loadPortalOverview(context);

    // 둘 다 마이크로태스크 한 틱 안에 시작되어야 한다(직렬이면 deals 쪽은 아직 호출 전).
    await Promise.resolve();
    await Promise.resolve();

    expect(listCustomerListItems).toHaveBeenCalledTimes(1);
    expect(listDealListItems).toHaveBeenCalledTimes(1);

    customersDeferred.resolve([]);
    dealsDeferred.resolve([]);

    const overview = await overviewPromise;
    expect(overview.customers).toEqual([]);
    expect(overview.deals).toEqual([]);
  });
});
