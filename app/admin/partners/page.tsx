"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  FileText,
  Loader2,
  MapPinned,
  Package,
  Receipt,
  UserRound,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomerDetailPayload, CustomerListItem, DealDetailPayload } from "@/lib/partner-portal/types";

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

async function readJson<T>(url: string): Promise<T> {
  const response = await adminFetch(url);
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to fetch data");
  }

  return payload;
}

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

  useEffect(() => {
    let alive = true;

    async function loadCustomers() {
      setLoadingCustomers(true);
      setError(null);

      try {
        const payload = await readJson<{ customers: CustomerListItem[] }>("/api/admin/customers");
        if (!alive) return;

        setCustomers(payload.customers ?? []);
        setSelectedCustomerId((current) => current ?? payload.customers?.[0]?.customer.id ?? null);
      } catch (fetchError) {
        if (!alive) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "고객 목록을 불러오지 못했습니다."
        );
      } finally {
        if (alive) setLoadingCustomers(false);
      }
    }

    void loadCustomers();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) return;

    let alive = true;

    async function loadCustomerDetail() {
      setLoadingCustomerDetail(true);
      setDealDetail(null);

      try {
        const payload = await readJson<{ customer: CustomerDetailPayload }>(
          `/api/admin/customers/${selectedCustomerId}`
        );
        if (!alive) return;

        setCustomerDetail(payload.customer);

        const firstDealId = payload.customer.deals[0]?.deal_id ?? null;
        setSelectedDealId((current) => {
          if (current && payload.customer.deals.some((deal) => deal.deal_id === current)) {
            return current;
          }
          return firstDealId;
        });
      } catch (fetchError) {
        if (!alive) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "기관 상세를 불러오지 못했습니다."
        );
      } finally {
        if (alive) setLoadingCustomerDetail(false);
      }
    }

    void loadCustomerDetail();

    return () => {
      alive = false;
    };
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!selectedDealId) return;

    let alive = true;

    async function loadDealDetail() {
      setLoadingDealDetail(true);

      try {
        const payload = await readJson<{ deal: DealDetailPayload }>(
          `/api/admin/deals/${selectedDealId}`
        );
        if (!alive) return;
        setDealDetail(payload.deal);
      } catch (fetchError) {
        if (!alive) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "거래 상세를 불러오지 못했습니다."
        );
      } finally {
        if (alive) setLoadingDealDetail(false);
      }
    }

    void loadDealDetail();

    return () => {
      alive = false;
    };
  }, [selectedDealId]);

  const totals = useMemo(() => {
    return customers.reduce(
      (acc, item) => {
        acc.customerCount += 1;
        acc.activeDeals += item.summary?.active_deals ?? 0;
        acc.outstanding += item.summary?.outstanding_amount ?? 0;
        return acc;
      },
      { customerCount: 0, activeDeals: 0, outstanding: 0 }
    );
  }, [customers]);

  const selectedCustomer =
    customerDetail?.customer ??
    customers.find((item) => item.customer.id === selectedCustomerId)?.customer ??
    null;

  const selectedDeals = customerDetail?.deals ?? [];

  return (
    <div className="min-h-screen bg-[#f6f3ed] px-6 py-8 text-[#111110]">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1a1a1a]/35">
              Customers
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              고객 탐색과 거래 이력을 보는 화면
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[#1a1a1a]/55">
              기관별 이력, 최근 활동, 설치 일정, 추가 계약을 한 곳에서 확인합니다.
              거래 작업은 거래 상세에서 이어집니다.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SummaryChip label="기관 수" value={String(totals.customerCount)} icon={<Building2 className="h-4 w-4" />} />
            <SummaryChip label="진행 거래" value={String(totals.activeDeals)} icon={<Package className="h-4 w-4" />} />
            <SummaryChip label="미수금" value={formatMoney(totals.outstanding)} icon={<CircleDollarSign className="h-4 w-4" />} />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_420px]">
          <Card className="border-[#e7e0d6] bg-white/90 shadow-[0_18px_40px_rgba(31,24,15,0.06)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">기관 목록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingCustomers ? (
                <LoadingBlock label="기관 목록 불러오는 중" />
              ) : customers.length === 0 ? (
                <EmptyBlock label="표시할 고객이 없습니다." />
              ) : (
                customers.map((item) => {
                  const isSelected = item.customer.id === selectedCustomerId;
                  return (
                    <button
                      key={item.customer.id}
                      type="button"
                      onClick={() =>
                        startTransition(() => {
                          setSelectedCustomerId(item.customer.id);
                        })
                      }
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                        isSelected
                          ? "border-[#111110] bg-[#111110] text-white"
                          : "border-[#ece4d8] bg-[#fbf8f1] hover:border-[#111110]/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.customer.name}</p>
                          <p className={`mt-1 text-xs ${isSelected ? "text-white/70" : "text-[#1a1a1a]/45"}`}>
                            {item.customer.region_label ?? "지역 미지정"}
                            {item.customer.campus_name ? ` · ${item.customer.campus_name}` : ""}
                          </p>
                        </div>
                        <ArrowRight className={`h-4 w-4 shrink-0 ${isSelected ? "text-white/80" : "text-[#1a1a1a]/25"}`} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <MiniStat label="진행 거래" value={String(item.summary?.active_deals ?? 0)} inverted={isSelected} />
                        <MiniStat label="미수금" value={formatMoney(item.summary?.outstanding_amount ?? 0)} inverted={isSelected} />
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="border-[#e7e0d6] bg-white/90 shadow-[0_18px_40px_rgba(31,24,15,0.06)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">기관 상세</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {loadingCustomerDetail ? (
                <LoadingBlock label="기관 상세 불러오는 중" />
              ) : !customerDetail || !selectedCustomer ? (
                <EmptyBlock label="선택된 기관이 없습니다." />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold">{selectedCustomer.name}</h2>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-[#1a1a1a]/55">
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="h-4 w-4" />
                          {selectedCustomer.contact_name ?? "담당자 미지정"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPinned className="h-4 w-4" />
                          {selectedCustomer.region_label ?? "지역 미지정"}
                        </span>
                      </div>
                    </div>
                    <div className="grid min-w-[320px] grid-cols-2 gap-3">
                      <MetricCard label="총 거래" value={String(customerDetail.summary.total_deals)} />
                      <MetricCard label="진행 거래" value={String(customerDetail.summary.active_deals)} />
                      <MetricCard label="계약 금액" value={formatMoney(customerDetail.summary.contracted_amount)} />
                      <MetricCard label="미수금" value={formatMoney(customerDetail.summary.outstanding_amount)} />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
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

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[#111110]">거래 이력</h3>
                      <span className="text-xs text-[#1a1a1a]/40">최근 수정 순</span>
                    </div>
                    <div className="space-y-3">
                      {selectedDeals.length === 0 ? (
                        <EmptyText text="거래 이력이 없습니다." />
                      ) : (
                        selectedDeals.map((deal) => {
                          const isSelected = deal.deal_id === selectedDealId;
                          return (
                            <button
                              key={deal.deal_id}
                              type="button"
                              onClick={() =>
                                startTransition(() => {
                                  setSelectedDealId(deal.deal_id);
                                })
                              }
                              className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                                isSelected
                                  ? "border-[#111110] bg-[#f4f1e9]"
                                  : "border-[#ece4d8] hover:border-[#d8cbb8]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-[#111110]">
                                    {deal.deal_title}
                                  </p>
                                  <p className="mt-1 text-xs text-[#1a1a1a]/45">
                                    {deal.deal_code} · {deal.current_stage}
                                  </p>
                                </div>
                                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#111110]/70">
                                  {deal.payment_status}
                                </span>
                              </div>
                              <div className="mt-4 grid gap-2 md:grid-cols-4">
                                <InlineMetric label="계약" value={formatMoney(deal.contracted_amount)} />
                                <InlineMetric label="설치 완료" value={formatMoney(deal.installed_amount)} />
                                <InlineMetric label="실수납" value={formatMoney(deal.paid_amount)} />
                                <InlineMetric label="미수금" value={formatMoney(deal.outstanding_amount)} />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#e7e0d6] bg-white/90 shadow-[0_18px_40px_rgba(31,24,15,0.06)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">선택 거래</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {loadingDealDetail ? (
                <LoadingBlock label="거래 상세 불러오는 중" />
              ) : !dealDetail ? (
                <EmptyBlock label="선택된 거래가 없습니다." />
              ) : (
                <>
                  <div className="rounded-2xl border border-[#ece4d8] bg-[#fbf8f1] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">
                      {dealDetail.deal.current_stage}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-[#111110]">
                      {dealDetail.deal.title}
                    </h3>
                    <p className="mt-1 text-sm text-[#1a1a1a]/50">
                      {dealDetail.customer.name} · 최근 수정 {formatDateTime(dealDetail.deal.updated_at)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard label="문서" value={String(dealDetail.quote_documents.length + dealDetail.contract_documents.length)} />
                    <MetricCard label="설치" value={String(dealDetail.installations.length)} />
                    <MetricCard label="수납" value={String(dealDetail.payments.length)} />
                    <MetricCard label="활동" value={String(dealDetail.activity_logs.length)} />
                  </div>

                  <PanelBlock title="최근 문서" icon={<FileText className="h-4 w-4" />}>
                    {dealDetail.quote_documents.length === 0 && dealDetail.contract_documents.length === 0 ? (
                      <EmptyText text="문서가 없습니다." />
                    ) : (
                      <>
                        {dealDetail.quote_documents.slice(0, 2).map((doc) => (
                          <CompactRow
                            key={doc.id}
                            label={`견적 ${doc.quote_number}`}
                            value={`${doc.versions.length}개 버전`}
                          />
                        ))}
                        {dealDetail.contract_documents.slice(0, 2).map((doc) => (
                          <CompactRow
                            key={doc.id}
                            label={`계약 ${doc.contract_number}`}
                            value={`${doc.versions.length}개 버전`}
                          />
                        ))}
                      </>
                    )}
                  </PanelBlock>

                  <PanelBlock title="최근 설치" icon={<CalendarDays className="h-4 w-4" />}>
                    {dealDetail.installations.length === 0 ? (
                      <EmptyText text="설치 일정이 없습니다." />
                    ) : (
                      dealDetail.installations.slice(0, 3).map((event) => (
                        <TimelineRow
                          key={event.id}
                          title={event.location ?? "설치 위치 미지정"}
                          subtitle={`${formatDateTime(event.scheduled_start_at)} ~ ${formatDateTime(event.scheduled_end_at)} · ${event.status}`}
                        />
                      ))
                    )}
                  </PanelBlock>

                  <PanelBlock title="수납 요약" icon={<Receipt className="h-4 w-4" />}>
                    <CompactRow label="실수납 누계" value={formatMoney(dealDetail.deal.paid_amount)} />
                    <CompactRow label="미수금" value={formatMoney(dealDetail.deal.outstanding_amount)} />
                  </PanelBlock>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#e7e0d6] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(31,24,15,0.05)]">
      <div className="flex items-center gap-2 text-[#1a1a1a]/45">{icon}</div>
      <p className="mt-2 text-xs text-[#1a1a1a]/45">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#111110]">{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#ece4d8] bg-[#fbf8f1] px-4 py-3">
      <p className="text-xs text-[#1a1a1a]/40">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#111110]">{value}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  inverted = false,
}: {
  label: string;
  value: string;
  inverted?: boolean;
}) {
  return (
    <div className={`rounded-xl px-2.5 py-2 ${inverted ? "bg-white/10" : "bg-white"}`}>
      <p className={`text-[11px] ${inverted ? "text-white/60" : "text-[#1a1a1a]/35"}`}>
        {label}
      </p>
      <p className={`mt-1 text-xs font-semibold ${inverted ? "text-white" : "text-[#111110]"}`}>
        {value}
      </p>
    </div>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <p className="text-[11px] text-[#1a1a1a]/35">{label}</p>
      <p className="mt-1 text-xs font-semibold text-[#111110]">{value}</p>
    </div>
  );
}

function PanelBlock({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-[#ece4d8] bg-[#fbf8f1] p-4">
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

function TimelineRow({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl border border-[#ece4d8] bg-white px-3 py-2.5">
      <p className="text-sm font-medium text-[#111110]">{title}</p>
      <p className="mt-1 text-xs text-[#1a1a1a]/40">{subtitle}</p>
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
