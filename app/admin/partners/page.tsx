"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileText,
  Loader2,
  MapPinned,
  Package,
  Phone,
  Receipt,
  Search,
  UserRound,
  Wrench,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CustomerDetailPayload,
  CustomerListItem,
  DealDetailPayload,
  DealStage,
  InstallationStatus,
} from "@/lib/partner-portal/types";

/* ─── helpers ─────────────────────────────────────────────── */

function adminFetch(url: string, options?: RequestInit) {
  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("admin_password") ?? ""
      : "";
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
}

function formatMoney(value?: number | null) {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

async function readJson<T>(url: string): Promise<T> {
  const response = await adminFetch(url);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Failed to fetch data");
  return payload;
}

/* ─── stage config ─────────────────────────────────────────── */

const STAGE_ORDER: DealStage[] = [
  "contact", "quote", "contract", "confirmed", "installation", "payment",
];

const STAGE_LABEL: Record<DealStage, string> = {
  contact: "컨택",
  quote: "견적",
  contract: "계약",
  confirmed: "확정",
  installation: "설치",
  payment: "수납",
  closed: "완료",
  cancelled: "취소",
};

const STAGE_COLOR: Record<DealStage, string> = {
  contact: "bg-[#e5e5e5] text-[#555]",
  quote: "bg-blue-100 text-blue-700",
  contract: "bg-violet-100 text-violet-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  installation: "bg-orange-100 text-orange-700",
  payment: "bg-emerald-100 text-emerald-700",
  closed: "bg-[#e5e5e5] text-[#888]",
  cancelled: "bg-red-100 text-red-500",
};

const INSTALL_STATUS_COLOR: Record<InstallationStatus, string> = {
  planned: "bg-blue-50 text-blue-600 border-blue-200",
  confirmed: "bg-indigo-50 text-indigo-600 border-indigo-200",
  in_progress: "bg-orange-50 text-orange-600 border-orange-200",
  completed: "bg-emerald-50 text-emerald-600 border-emerald-200",
  paused: "bg-yellow-50 text-yellow-600 border-yellow-200",
  cancelled: "bg-red-50 text-red-500 border-red-200",
};

const INSTALL_STATUS_LABEL: Record<InstallationStatus, string> = {
  planned: "예정",
  confirmed: "확정",
  in_progress: "진행 중",
  completed: "완료",
  paused: "보류",
  cancelled: "취소",
};

type DealTab = "overview" | "documents" | "installations" | "payments" | "activity";
type CustomerFilter = "all" | "attention" | "install_soon" | "payment_late";
type SortKey = "recent" | "outstanding" | "name";

/* ─── page ─────────────────────────────────────────────────── */

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetailPayload | null>(null);
  const [dealDetail, setDealDetail] = useState<DealDetailPayload | null>(null);

  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);
  const [loadingDealDetail, setLoadingDealDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>("all");
  const [dealTab, setDealTab] = useState<DealTab>("overview");

  /* fetch customers */
  useEffect(() => {
    let alive = true;
    setLoadingCustomers(true);
    setError(null);

    readJson<{ customers: CustomerListItem[] }>("/api/admin/customers")
      .then((payload) => {
        if (!alive) return;
        setCustomers(payload.customers ?? []);
        setSelectedCustomerId((c) => c ?? payload.customers?.[0]?.customer.id ?? null);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "고객 목록을 불러오지 못했습니다.");
      })
      .finally(() => { if (alive) setLoadingCustomers(false); });

    return () => { alive = false; };
  }, []);

  /* fetch customer detail */
  useEffect(() => {
    if (!selectedCustomerId) return;
    let alive = true;
    setLoadingCustomerDetail(true);
    setDealDetail(null);

    readJson<{ customer: CustomerDetailPayload }>(`/api/admin/customers/${selectedCustomerId}`)
      .then((payload) => {
        if (!alive) return;
        setCustomerDetail(payload.customer);
        const firstDealId = payload.customer.deals[0]?.deal_id ?? null;
        setSelectedDealId((c) => {
          if (c && payload.customer.deals.some((d) => d.deal_id === c)) return c;
          return firstDealId;
        });
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "기관 상세 오류"); })
      .finally(() => { if (alive) setLoadingCustomerDetail(false); });

    return () => { alive = false; };
  }, [selectedCustomerId]);

  /* fetch deal detail */
  useEffect(() => {
    if (!selectedDealId) return;
    let alive = true;
    setLoadingDealDetail(true);
    setDealTab("overview");

    readJson<{ deal: DealDetailPayload }>(`/api/admin/deals/${selectedDealId}`)
      .then((payload) => { if (alive) setDealDetail(payload.deal); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "거래 상세 오류"); })
      .finally(() => { if (alive) setLoadingDealDetail(false); });

    return () => { alive = false; };
  }, [selectedDealId]);

  /* totals for KPI */
  const totals = useMemo(() => customers.reduce(
    (acc, item) => {
      acc.customerCount += 1;
      acc.activeDeals += item.summary?.active_deals ?? 0;
      acc.outstanding += item.summary?.outstanding_amount ?? 0;
      acc.installationDeals += item.summary?.installation_deals ?? 0;
      acc.unpaidDeals += item.summary?.unpaid_deals ?? 0;
      return acc;
    },
    { customerCount: 0, activeDeals: 0, outstanding: 0, installationDeals: 0, unpaidDeals: 0 }
  ), [customers]);

  /* filtered + sorted customer list */
  const filteredCustomers = useMemo(() => {
    let list = customers;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((item) =>
        item.customer.name.toLowerCase().includes(q) ||
        (item.customer.region_label ?? "").toLowerCase().includes(q) ||
        (item.customer.contact_name ?? "").toLowerCase().includes(q)
      );
    }

    if (customerFilter === "attention") {
      list = list.filter((item) => (item.summary?.outstanding_amount ?? 0) > 0);
    } else if (customerFilter === "install_soon") {
      list = list.filter((item) => (item.summary?.installation_deals ?? 0) > 0);
    } else if (customerFilter === "payment_late") {
      list = list.filter((item) => (item.summary?.unpaid_deals ?? 0) > 0);
    }

    return [...list].sort((a, b) => {
      if (sort === "outstanding") {
        return (b.summary?.outstanding_amount ?? 0) - (a.summary?.outstanding_amount ?? 0);
      }
      if (sort === "name") {
        return a.customer.name.localeCompare(b.customer.name, "ko");
      }
      // recent: by last_deal_updated_at
      const aTime = a.summary?.last_deal_updated_at ?? a.customer.updated_at;
      const bTime = b.summary?.last_deal_updated_at ?? b.customer.updated_at;
      return bTime.localeCompare(aTime);
    });
  }, [customers, search, sort, customerFilter]);

  const selectedCustomer =
    customerDetail?.customer ??
    customers.find((item) => item.customer.id === selectedCustomerId)?.customer ?? null;
  const selectedDeals = customerDetail?.deals ?? [];

  return (
    <div className="min-h-screen bg-[#f6f3ed] px-6 py-8 text-[#111110]">
      <div className="mx-auto max-w-[1680px] space-y-5">

        {/* ── header ── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1a1a1a]/35">
              Customers
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">고객 & 거래</h1>
            <p className="mt-1 text-sm text-[#1a1a1a]/50">
              기관별 거래 이력, 설치 일정, 수납 현황을 한 화면에서 관리합니다.
            </p>
          </div>
          <div className="grid grid-cols-5 gap-3">
            <SummaryChip label="기관 수" value={String(totals.customerCount)} icon={<Building2 className="h-4 w-4" />} />
            <SummaryChip label="진행 거래" value={String(totals.activeDeals)} icon={<Package className="h-4 w-4" />} />
            <SummaryChip label="설치 중" value={String(totals.installationDeals)} icon={<Wrench className="h-4 w-4" />} />
            <SummaryChip label="미납 거래" value={String(totals.unpaidDeals)} icon={<AlertCircle className="h-4 w-4" />} />
            <SummaryChip label="미수금" value={formatMoney(totals.outstanding)} icon={<CircleDollarSign className="h-4 w-4" />} warn={totals.outstanding > 0} />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {/* ── filter chips ── */}
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "attention", "install_soon", "payment_late"] as CustomerFilter[]).map((f) => {
            const labels: Record<CustomerFilter, string> = {
              all: "전체",
              attention: "주의 필요",
              install_soon: "설치 중",
              payment_late: "수납 지연",
            };
            return (
              <button
                key={f}
                type="button"
                onClick={() => setCustomerFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  customerFilter === f
                    ? "bg-[#111110] text-white"
                    : "border border-[#d9cfbf] bg-white text-[#1a1a1a]/60 hover:border-[#111110]/30"
                }`}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>

        {/* ── 3-column ── */}
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_440px]">

          {/* ── col 1: 기관 목록 ── */}
          <div className="flex flex-col gap-3">
            {/* search + sort */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/30" />
                <input
                  type="text"
                  placeholder="기관명 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-[#e7e0d6] bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-[#1a1a1a]/30 focus:border-[#111110]/40"
                />
              </div>
              <div className="relative">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="appearance-none rounded-xl border border-[#e7e0d6] bg-white py-2 pl-3 pr-8 text-sm text-[#1a1a1a]/70 outline-none focus:border-[#111110]/40"
                >
                  <option value="recent">최근 수정</option>
                  <option value="outstanding">미수금순</option>
                  <option value="name">이름순</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1a1a1a]/40" />
              </div>
            </div>

            <Card className="border-[#e7e0d6] bg-white/90 shadow-[0_18px_40px_rgba(31,24,15,0.06)]">
              <CardContent className="space-y-2 p-4">
                {loadingCustomers ? (
                  <LoadingBlock label="기관 목록 불러오는 중" />
                ) : filteredCustomers.length === 0 ? (
                  <EmptyBlock label={search ? "검색 결과가 없습니다." : "표시할 고객이 없습니다."} />
                ) : (
                  filteredCustomers.map((item) => {
                    const isSelected = item.customer.id === selectedCustomerId;
                    const hasOutstanding = (item.summary?.outstanding_amount ?? 0) > 0;
                    const hasInstallation = (item.summary?.installation_deals ?? 0) > 0;
                    return (
                      <button
                        key={item.customer.id}
                        type="button"
                        onClick={() => startTransition(() => { setSelectedCustomerId(item.customer.id); })}
                        className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                          isSelected
                            ? "border-[#111110] bg-[#111110] text-white"
                            : "border-[#ece4d8] bg-[#fbf8f1] hover:border-[#111110]/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-semibold">{item.customer.name}</p>
                              {hasOutstanding && (
                                <span className={`h-2 w-2 shrink-0 rounded-full ${isSelected ? "bg-red-400" : "bg-red-400"}`} />
                              )}
                              {hasInstallation && (
                                <span className={`h-2 w-2 shrink-0 rounded-full ${isSelected ? "bg-orange-300" : "bg-orange-400"}`} />
                              )}
                            </div>
                            <p className={`mt-0.5 text-xs ${isSelected ? "text-white/60" : "text-[#1a1a1a]/45"}`}>
                              {item.customer.region_label ?? "지역 미지정"}
                              {item.customer.campus_name ? ` · ${item.customer.campus_name}` : ""}
                            </p>
                          </div>
                          <ArrowRight className={`mt-0.5 h-4 w-4 shrink-0 ${isSelected ? "text-white/70" : "text-[#1a1a1a]/20"}`} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-1.5">
                          <MiniStat label="진행 거래" value={String(item.summary?.active_deals ?? 0)} inverted={isSelected} />
                          <MiniStat
                            label="미수금"
                            value={formatMoney(item.summary?.outstanding_amount ?? 0)}
                            inverted={isSelected}
                            warn={hasOutstanding && !isSelected}
                          />
                        </div>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── col 2: 기관 상세 ── */}
          <Card className="border-[#e7e0d6] bg-white/90 shadow-[0_18px_40px_rgba(31,24,15,0.06)]">
            <CardContent className="space-y-5 p-6">
              {loadingCustomerDetail ? (
                <LoadingBlock label="기관 상세 불러오는 중" />
              ) : !customerDetail || !selectedCustomer ? (
                <EmptyBlock label="선택된 기관이 없습니다." />
              ) : (
                <>
                  {/* customer header */}
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold">{selectedCustomer.name}</h2>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-[#1a1a1a]/55">
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="h-4 w-4" />
                          {selectedCustomer.contact_name ?? "담당자 미지정"}
                        </span>
                        {selectedCustomer.phone && (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-4 w-4" />
                            {selectedCustomer.phone}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          <MapPinned className="h-4 w-4" />
                          {selectedCustomer.region_label ?? "지역 미지정"}
                        </span>
                      </div>
                    </div>
                    <div className="grid min-w-[300px] grid-cols-2 gap-2.5">
                      <MetricCard label="총 거래" value={String(customerDetail.summary.total_deals)} />
                      <MetricCard label="진행 거래" value={String(customerDetail.summary.active_deals)} />
                      <MetricCard label="계약 금액" value={formatMoney(customerDetail.summary.contracted_amount)} />
                      <MetricCard label="미수금" value={formatMoney(customerDetail.summary.outstanding_amount)} warn={(customerDetail.summary.outstanding_amount ?? 0) > 0} />
                    </div>
                  </div>

                  {/* recent panels */}
                  <div className="grid gap-3 lg:grid-cols-2">
                    <PanelBlock title="최근 활동" icon={<Clock3 className="h-4 w-4" />}>
                      {customerDetail.recent_activity.length === 0 ? (
                        <EmptyText text="최근 활동 로그가 없습니다." />
                      ) : (
                        customerDetail.recent_activity.slice(0, 4).map((log) => (
                          <TimelineRow
                            key={log.id}
                            title={log.summary}
                            subtitle={`${log.action_type} · ${formatDateTime(log.created_at)}`}
                          />
                        ))
                      )}
                    </PanelBlock>
                    <PanelBlock title="최근 일정" icon={<CalendarDays className="h-4 w-4" />}>
                      {customerDetail.recent_calendar_events.length === 0 ? (
                        <EmptyText text="등록된 일정이 없습니다." />
                      ) : (
                        customerDetail.recent_calendar_events.slice(0, 4).map((event) => (
                          <TimelineRow
                            key={event.id}
                            title={event.title}
                            subtitle={`${formatDateTime(event.starts_at)} · ${event.status}`}
                          />
                        ))
                      )}
                    </PanelBlock>
                  </div>

                  {/* deals */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">거래 이력</h3>
                      <span className="text-xs text-[#1a1a1a]/40">최근 수정 순</span>
                    </div>
                    {selectedDeals.length === 0 ? (
                      <EmptyText text="거래 이력이 없습니다." />
                    ) : (
                      selectedDeals.map((deal) => {
                        const isSelected = deal.deal_id === selectedDealId;
                        const stageIndex = STAGE_ORDER.indexOf(deal.current_stage as DealStage);
                        const hasOutstanding = (deal.outstanding_amount ?? 0) > 0;
                        return (
                          <button
                            key={deal.deal_id}
                            type="button"
                            onClick={() => startTransition(() => { setSelectedDealId(deal.deal_id); })}
                            className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                              isSelected
                                ? "border-[#111110] bg-[#f4f1e9]"
                                : "border-[#ece4d8] hover:border-[#d8cbb8]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#111110]">{deal.deal_title}</p>
                                <p className="mt-0.5 text-xs text-[#1a1a1a]/40">{deal.deal_code}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {hasOutstanding && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
                                    미수
                                  </span>
                                )}
                                <StageBadge stage={deal.current_stage as DealStage} />
                              </div>
                            </div>

                            {/* mini roadmap */}
                            <div className="mt-3 flex items-center gap-1">
                              {STAGE_ORDER.map((s, i) => {
                                const filled = i <= stageIndex;
                                const isCurrent = i === stageIndex;
                                return (
                                  <div key={s} className="flex items-center gap-1">
                                    <div className={`h-2 w-2 rounded-full transition-colors ${
                                      isCurrent
                                        ? "ring-2 ring-offset-1 ring-[#111110] bg-[#111110]"
                                        : filled
                                        ? "bg-[#111110]"
                                        : "bg-[#d9cfbf]"
                                    }`} />
                                    {i < STAGE_ORDER.length - 1 && (
                                      <div className={`h-px w-4 ${filled && i < stageIndex ? "bg-[#111110]" : "bg-[#d9cfbf]"}`} />
                                    )}
                                  </div>
                                );
                              })}
                              <span className="ml-1.5 text-[11px] text-[#1a1a1a]/40">
                                {STAGE_LABEL[deal.current_stage as DealStage] ?? deal.current_stage}
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-4 gap-1.5">
                              <InlineMetric label="계약" value={formatMoney(deal.contracted_amount)} />
                              <InlineMetric label="설치 완료" value={formatMoney(deal.installed_amount)} />
                              <InlineMetric label="실수납" value={formatMoney(deal.paid_amount)} />
                              <InlineMetric label="미수금" value={formatMoney(deal.outstanding_amount)} warn={hasOutstanding} />
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── col 3: 선택 거래 상세 ── */}
          <Card className="border-[#e7e0d6] bg-white/90 shadow-[0_18px_40px_rgba(31,24,15,0.06)]">
            <CardContent className="p-0">
              {loadingDealDetail ? (
                <div className="p-6"><LoadingBlock label="거래 상세 불러오는 중" /></div>
              ) : !dealDetail ? (
                <div className="p-6"><EmptyBlock label="선택된 거래가 없습니다." /></div>
              ) : (
                <>
                  {/* deal header */}
                  <div className="border-b border-[#ece4d8] p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-[#1a1a1a]/40">{dealDetail.customer.name}</p>
                        <h3 className="mt-0.5 text-base font-semibold text-[#111110]">
                          {dealDetail.deal.title}
                        </h3>
                        <p className="mt-1 text-xs text-[#1a1a1a]/40">
                          수정 {formatDateTime(dealDetail.deal.updated_at)}
                        </p>
                      </div>
                      <StageBadge stage={dealDetail.deal.current_stage} />
                    </div>

                    {/* stage roadmap (large) */}
                    <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
                      {STAGE_ORDER.map((s, i) => {
                        const stageIdx = STAGE_ORDER.indexOf(dealDetail.deal.current_stage);
                        const filled = i <= stageIdx;
                        const isCurrent = i === stageIdx;
                        return (
                          <div key={s} className="flex items-center gap-1">
                            <div className="flex flex-col items-center gap-1">
                              <div className={`h-2.5 w-2.5 rounded-full ${
                                isCurrent
                                  ? "ring-2 ring-offset-1 ring-[#111110] bg-[#111110]"
                                  : filled ? "bg-[#111110]" : "bg-[#d9cfbf]"
                              }`} />
                              <span className={`text-[10px] whitespace-nowrap ${
                                isCurrent ? "font-semibold text-[#111110]" : "text-[#1a1a1a]/35"
                              }`}>
                                {STAGE_LABEL[s]}
                              </span>
                            </div>
                            {i < STAGE_ORDER.length - 1 && (
                              <div className={`mb-3.5 h-px w-6 ${filled && i < stageIdx ? "bg-[#111110]" : "bg-[#d9cfbf]"}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* tabs */}
                  <div className="flex border-b border-[#ece4d8]">
                    {(["overview", "documents", "installations", "payments", "activity"] as DealTab[]).map((tab) => {
                      const labels: Record<DealTab, string> = {
                        overview: "개요",
                        documents: "문서",
                        installations: "설치",
                        payments: "수납",
                        activity: "활동",
                      };
                      const counts: Record<DealTab, number | null> = {
                        overview: null,
                        documents: dealDetail.quote_documents.length + dealDetail.contract_documents.length,
                        installations: dealDetail.installations.length,
                        payments: dealDetail.payments.length,
                        activity: dealDetail.activity_logs.length,
                      };
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setDealTab(tab)}
                          className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors ${
                            dealTab === tab
                              ? "border-b-2 border-[#111110] text-[#111110]"
                              : "text-[#1a1a1a]/45 hover:text-[#1a1a1a]/70"
                          }`}
                        >
                          {labels[tab]}
                          {counts[tab] !== null && counts[tab]! > 0 && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                              dealTab === tab ? "bg-[#111110] text-white" : "bg-[#ece4d8] text-[#1a1a1a]/60"
                            }`}>
                              {counts[tab]}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* tab content */}
                  <div className="space-y-4 p-5">
                    {dealTab === "overview" && <OverviewTab deal={dealDetail} />}
                    {dealTab === "documents" && <DocumentsTab deal={dealDetail} />}
                    {dealTab === "installations" && <InstallationsTab deal={dealDetail} />}
                    {dealTab === "payments" && <PaymentsTab deal={dealDetail} />}
                    {dealTab === "activity" && <ActivityTab deal={dealDetail} />}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ─── tab components ──────────────────────────────────────── */

function OverviewTab({ deal }: { deal: DealDetailPayload }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <MetricCard label="계약 금액" value={formatMoney(deal.deal.contracted_amount)} />
        <MetricCard label="실수납 누계" value={formatMoney(deal.deal.paid_amount)} />
        <MetricCard label="설치 완료" value={formatMoney(deal.deal.installed_amount)} />
        <MetricCard label="미수금" value={formatMoney(deal.deal.outstanding_amount)} warn={(deal.deal.outstanding_amount ?? 0) > 0} />
      </div>

      {deal.line_items.length > 0 && (
        <PanelBlock title="판매 품목" icon={<Package className="h-4 w-4" />}>
          {deal.line_items.map((item) => (
            <CompactRow
              key={item.id}
              label={`${item.product_name} × ${item.quantity}`}
              value={formatMoney(item.amount)}
            />
          ))}
        </PanelBlock>
      )}

      {deal.deal.notes && (
        <div className="rounded-xl border border-[#ece4d8] bg-[#fbf8f1] p-3">
          <p className="text-xs text-[#1a1a1a]/40">메모</p>
          <p className="mt-1 text-sm text-[#111110]">{deal.deal.notes}</p>
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ deal }: { deal: DealDetailPayload }) {
  if (deal.quote_documents.length === 0 && deal.contract_documents.length === 0) {
    return <EmptyBlock label="등록된 문서가 없습니다." />;
  }
  return (
    <div className="space-y-3">
      {deal.quote_documents.map((doc) => {
        const latest = doc.versions[doc.versions.length - 1];
        const isShared = doc.shares.length > 0;
        return (
          <div key={doc.id} className="rounded-2xl border border-[#ece4d8] bg-[#fbf8f1] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#111110]">{doc.quote_number}</p>
                <p className="mt-0.5 text-xs text-[#1a1a1a]/40">
                  견적서 · v{latest?.version_number ?? 1} · {doc.versions.length}개 버전
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {isShared && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                    공유됨
                  </span>
                )}
                <DocStatusBadge status={doc.status} />
              </div>
            </div>
            {latest && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-[#1a1a1a]/50">
                  합계 {formatMoney(latest.total_amount)}
                  {latest.valid_until ? ` · 유효기한 ${formatDate(latest.valid_until)}` : ""}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {deal.contract_documents.map((doc) => {
        const latest = doc.versions[doc.versions.length - 1];
        const isShared = doc.shares.length > 0;
        const signStatus = latest?.sign_status;
        return (
          <div key={doc.id} className="rounded-2xl border border-[#ece4d8] bg-[#fbf8f1] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#111110]">{doc.contract_number}</p>
                <p className="mt-0.5 text-xs text-[#1a1a1a]/40">
                  계약서 · v{latest?.version_number ?? 1} · {doc.versions.length}개 버전
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {isShared && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                    공유됨
                  </span>
                )}
                {signStatus === "partner_signed" && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-600">
                    서명 완료
                  </span>
                )}
                {signStatus === "draft" && isShared && (
                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-600">
                    서명 대기
                  </span>
                )}
                <DocStatusBadge status={doc.status} />
              </div>
            </div>
            {latest && (
              <span className="mt-2 block text-xs text-[#1a1a1a]/50">
                합계 {formatMoney(latest.total_amount)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InstallationsTab({ deal }: { deal: DealDetailPayload }) {
  if (deal.installations.length === 0) return <EmptyBlock label="등록된 설치 일정이 없습니다." />;
  return (
    <div className="space-y-3">
      {deal.installations.map((event) => (
        <div key={event.id} className="rounded-2xl border border-[#ece4d8] bg-[#fbf8f1] p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[#111110]">
                {event.location ?? "장소 미지정"}
              </p>
              <p className="mt-0.5 text-xs text-[#1a1a1a]/40">
                {formatDateTime(event.scheduled_start_at)} → {formatDateTime(event.scheduled_end_at)}
              </p>
              {event.assigned_team && (
                <p className="mt-0.5 text-xs text-[#1a1a1a]/40">팀: {event.assigned_team}</p>
              )}
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${INSTALL_STATUS_COLOR[event.status]}`}>
              {INSTALL_STATUS_LABEL[event.status]}
            </span>
          </div>
          {event.notes && (
            <p className="mt-2 text-xs text-[#1a1a1a]/45">{event.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function PaymentsTab({ deal }: { deal: DealDetailPayload }) {
  const METHOD_LABEL: Record<string, string> = {
    bank_transfer: "계좌이체",
    card: "카드",
    cash: "현금",
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="계약 금액" value={formatMoney(deal.deal.contracted_amount)} />
        <MetricCard label="실수납" value={formatMoney(deal.deal.paid_amount)} />
        <MetricCard label="미수금" value={formatMoney(deal.deal.outstanding_amount)} warn={(deal.deal.outstanding_amount ?? 0) > 0} />
      </div>

      {deal.payments.length === 0 ? (
        <EmptyText text="입금 기록이 없습니다." />
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#1a1a1a]/50">입금 기록</p>
          {deal.payments.map((p) => (
            <CompactRow
              key={p.id}
              label={`${formatDate(p.paid_at)} · ${METHOD_LABEL[p.payment_method] ?? p.payment_method}`}
              value={formatMoney(p.amount)}
            />
          ))}
        </div>
      )}

      {deal.receipts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#1a1a1a]/50">영수증</p>
          {deal.receipts.map((r) => (
            <CompactRow
              key={r.id}
              label={r.receipt_number}
              value={formatMoney(r.total_amount)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityTab({ deal }: { deal: DealDetailPayload }) {
  if (deal.activity_logs.length === 0) return <EmptyBlock label="활동 로그가 없습니다." />;
  return (
    <div className="space-y-2">
      {deal.activity_logs.map((log) => (
        <div key={log.id} className="flex gap-3">
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#d9cfbf]" />
          <div>
            <p className="text-sm text-[#111110]">{log.summary}</p>
            <p className="mt-0.5 text-xs text-[#1a1a1a]/40">
              {log.actor_role} · {formatDateTime(log.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── small components ────────────────────────────────────── */

function StageBadge({ stage }: { stage: DealStage }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STAGE_COLOR[stage] ?? "bg-[#e5e5e5] text-[#555]"}`}>
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}

function DocStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-[#ece4d8] text-[#1a1a1a]/60",
    shared: "bg-blue-100 text-blue-600",
    accepted: "bg-emerald-100 text-emerald-600",
    expired: "bg-red-100 text-red-500",
    archived: "bg-[#e5e5e5] text-[#888]",
    partner_signed: "bg-violet-100 text-violet-600",
    admin_signed: "bg-indigo-100 text-indigo-600",
    completed: "bg-emerald-100 text-emerald-600",
    cancelled: "bg-red-100 text-red-500",
  };
  const labelMap: Record<string, string> = {
    draft: "초안",
    shared: "공유됨",
    accepted: "수락됨",
    expired: "만료",
    archived: "보관",
    partner_signed: "서명 완료",
    admin_signed: "관리자 서명",
    completed: "완료",
    cancelled: "취소",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? "bg-[#ece4d8] text-[#1a1a1a]/60"}`}>
      {labelMap[status] ?? status}
    </span>
  );
}

function SummaryChip({ label, value, icon, warn = false }: { label: string; value: string; icon: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-[0_10px_24px_rgba(31,24,15,0.05)] ${warn ? "border-red-200 bg-red-50" : "border-[#e7e0d6] bg-white"}`}>
      <div className={`flex items-center gap-2 ${warn ? "text-red-400" : "text-[#1a1a1a]/45"}`}>{icon}</div>
      <p className={`mt-2 text-xs ${warn ? "text-red-400" : "text-[#1a1a1a]/45"}`}>{label}</p>
      <p className={`mt-1 text-sm font-semibold ${warn ? "text-red-600" : "text-[#111110]"}`}>{value}</p>
    </div>
  );
}

function MetricCard({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${warn ? "border-red-200 bg-red-50" : "border-[#ece4d8] bg-[#fbf8f1]"}`}>
      <p className={`text-xs ${warn ? "text-red-400" : "text-[#1a1a1a]/40"}`}>{label}</p>
      <p className={`mt-1 text-sm font-semibold ${warn ? "text-red-600" : "text-[#111110]"}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, inverted = false, warn = false }: { label: string; value: string; inverted?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl px-2.5 py-2 ${inverted ? "bg-white/10" : warn ? "bg-red-50" : "bg-white"}`}>
      <p className={`text-[11px] ${inverted ? "text-white/60" : warn ? "text-red-400" : "text-[#1a1a1a]/35"}`}>{label}</p>
      <p className={`mt-0.5 text-xs font-semibold ${inverted ? "text-white" : warn ? "text-red-600" : "text-[#111110]"}`}>{value}</p>
    </div>
  );
}

function InlineMetric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${warn ? "bg-red-50" : "bg-white"}`}>
      <p className={`text-[11px] ${warn ? "text-red-400" : "text-[#1a1a1a]/35"}`}>{label}</p>
      <p className={`mt-0.5 text-xs font-semibold ${warn ? "text-red-600" : "text-[#111110]"}`}>{value}</p>
    </div>
  );
}

function PanelBlock({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-2xl border border-[#ece4d8] bg-[#fbf8f1] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#111110]">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function CompactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#ece4d8] bg-white px-3 py-2.5">
      <span className="text-sm text-[#1a1a1a]/60">{label}</span>
      <span className="text-sm font-medium text-[#111110]">{value}</span>
    </div>
  );
}

function TimelineRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-[#ece4d8] bg-white px-3 py-2.5">
      <p className="text-sm font-medium text-[#111110]">{title}</p>
      <p className="mt-0.5 text-xs text-[#1a1a1a]/40">{subtitle}</p>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[#ece4d8] bg-[#fbf8f1] px-4 py-6 text-sm text-[#1a1a1a]/55">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9cfbf] bg-[#fbf8f1] px-4 py-8 text-center text-sm text-[#1a1a1a]/45">
      {label}
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="text-sm text-[#1a1a1a]/40">{text}</p>;
}
