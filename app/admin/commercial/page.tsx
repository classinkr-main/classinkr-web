"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Loader2,
  Package,
  Receipt,
  UserRound,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommercialOverviewPayload } from "@/lib/partner-portal/overview-types";
import type {
  ContractDocumentBundle,
  CustomerDetailPayload,
  CustomerListItem,
  DealDetailPayload,
  DealStage,
  InstallationEvent,
} from "@/lib/partner-portal/types";

type DealTab = "overview" | "documents" | "installations" | "payments" | "activity";

const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  contact: "컨택",
  quote: "견적",
  contract: "계약",
  confirmed: "확정",
  installation: "설치",
  payment: "수납",
  closed: "종결",
  cancelled: "취소",
};

const DEAL_TABS: Array<{ id: DealTab; label: string }> = [
  { id: "overview", label: "개요" },
  { id: "documents", label: "문서" },
  { id: "installations", label: "설치" },
  { id: "payments", label: "수납" },
  { id: "activity", label: "활동" },
];

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

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

function getStageActions(detail: DealDetailPayload) {
  const hasQuote = detail.quote_documents.length > 0;
  const hasContract = detail.contract_documents.length > 0;
  const hasInstallation = detail.installations.length > 0;
  const hasOutstanding = detail.deal.outstanding_amount > 0;

  switch (detail.deal.current_stage) {
    case "contact":
      return [
        {
          title: "견적 초안 만들기",
          description: "첫 문서를 만들어 거래를 견적 단계로 올릴 준비를 합니다.",
          tone: "accent" as const,
        },
        {
          title: "미팅 로그 정리",
          description: "고객 요구사항을 활동 로그에 남겨 이후 수정 근거를 확보합니다.",
          tone: "neutral" as const,
        },
      ];
    case "quote":
      return [
        {
          title: hasQuote ? "견적 링크 발송 확인" : "견적서 생성 필요",
          description: hasQuote
            ? "고객에게 버전 고정 링크를 전달할 준비가 되어 있습니다."
            : "견적 문서가 아직 없어 다음 단계로 넘어갈 수 없습니다.",
          tone: hasQuote ? ("accent" as const) : ("warning" as const),
        },
        {
          title: "추가 계약 범위 체크",
          description: "같은 기관의 별관/추가 교실 요청이 있는지 같이 봅니다.",
          tone: "neutral" as const,
        },
      ];
    case "contract":
      return [
        {
          title: hasContract ? "서명 대기 추적" : "계약서 초안 생성",
          description: hasContract
            ? "고객이 열람할 버전 고정 계약 링크를 준비합니다."
            : "계약 문서가 없으면 확정 단계로 넘어갈 수 없습니다.",
          tone: hasContract ? ("accent" as const) : ("warning" as const),
        },
        {
          title: "분할 입금 계획 정리",
          description: "계약금/잔금과 미수 리스크를 먼저 적어두는 편이 안전합니다.",
          tone: "neutral" as const,
        },
      ];
    case "confirmed":
      return [
        {
          title: hasInstallation ? "설치 일정 점검" : "설치 일정 생성",
          description: hasInstallation
            ? "설치팀, 장소, 시간 범위를 다시 확인합니다."
            : "확정 이후에는 설치 일정이 바로 필요합니다.",
          tone: hasInstallation ? ("accent" as const) : ("warning" as const),
        },
        {
          title: "현장 메모 정리",
          description: "교실별 메모와 거치 방식을 남겨 현장 혼선을 줄입니다.",
          tone: "neutral" as const,
        },
      ];
    case "installation":
      return [
        {
          title: "설치 진행 업데이트",
          description: "복수 일정이라면 완료 범위를 나눠 기록하는 것이 좋습니다.",
          tone: "accent" as const,
        },
        {
          title: hasOutstanding ? "잔금 수납 준비" : "수납 상태 점검",
          description: hasOutstanding
            ? "설치 완료분 기준 미수금이 남아 있는지 확인합니다."
            : "수납 완료 거래라면 영수 정리만 남았습니다.",
          tone: hasOutstanding ? ("warning" as const) : ("neutral" as const),
        },
      ];
    case "payment":
      return [
        {
          title: hasOutstanding ? "미수금 후속 조치" : "영수증 정리",
          description: hasOutstanding
            ? "분할 입금 상태를 보고 미수 기관 리스크를 정리합니다."
            : "수납 완료 상태이므로 영수와 종결 로그 정리 위주로 갑니다.",
          tone: hasOutstanding ? ("warning" as const) : ("accent" as const),
        },
      ];
    case "closed":
      return [
        {
          title: "추가 계약 기회 확인",
          description: "같은 기관의 다른 관/캠퍼스 요청으로 이어질 수 있습니다.",
          tone: "neutral" as const,
        },
      ];
    case "cancelled":
      return [
        {
          title: "취소 사유 기록",
          description: "재오픈 가능성을 위해 취소 배경을 남겨두는 편이 좋습니다.",
          tone: "neutral" as const,
        },
      ];
    default:
      return [];
  }
}

export default function AdminCommercialPage() {
  const [overview, setOverview] = useState<CommercialOverviewPayload | null>(null);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [activeDealTab, setActiveDealTab] = useState<DealTab>("overview");
  const [customerDetail, setCustomerDetail] = useState<CustomerDetailPayload | null>(
    null
  );
  const [dealDetail, setDealDetail] = useState<DealDetailPayload | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);
  const [loadingDealDetail, setLoadingDealDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadOverview() {
      setLoadingOverview(true);

      try {
        const payload = await readJson<{ overview: CommercialOverviewPayload }>(
          "/api/admin/commercial/overview"
        );
        if (!alive) return;
        setOverview(payload.overview);
      } catch (fetchError) {
        if (!alive) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "운영 요약을 불러오지 못했습니다."
        );
      } finally {
        if (alive) setLoadingOverview(false);
      }
    }

    async function loadCustomers() {
      setLoadingCustomers(true);
      setError(null);

      try {
        const payload = await readJson<{ customers: CustomerListItem[] }>(
          "/api/admin/customers"
        );
        if (!alive) return;

        setCustomers(payload.customers ?? []);
        setSelectedCustomerId((current) => {
          if (current) return current;
          return payload.customers?.[0]?.customer.id ?? null;
        });
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

    void Promise.all([loadOverview(), loadCustomers()]);

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
      setActiveDealTab("overview");

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
        acc.customer_count += 1;
        acc.active_deal_count += item.summary?.active_deals ?? 0;
        acc.outstanding_amount += item.summary?.outstanding_amount ?? 0;
        acc.outstanding_customer_count +=
          (item.summary?.outstanding_amount ?? 0) > 0 ? 1 : 0;
        return acc;
      },
      {
        customer_count: 0,
        active_deal_count: 0,
        quote_count: 0,
        contract_count: 0,
        confirmed_count: 0,
        scheduled_installation_count: 0,
        outstanding_amount: 0,
        outstanding_customer_count: 0,
      }
    );
  }, [customers]);

  const metrics = overview?.metrics ?? totals;
  const stageCounts = overview?.stage_counts ?? [];
  const alerts = overview?.alerts ?? [];
  const agenda = overview?.agenda ?? [];
  const nextActions = dealDetail ? getStageActions(dealDetail) : [];

  return (
    <div className="min-h-screen bg-[#f6f6f3] px-6 py-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1a1a1a]/35">
              Partner Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#111110]">
              파트너 포털 운영 대시보드
            </h1>
            <p className="mt-2 max-w-4xl text-sm text-[#1a1a1a]/55">
              오늘의 병목, 단계 분포, 설치 일정, 미수 리스크를 먼저 보고 필요한 거래 상세로 바로 들어가는 운영판입니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#e7e7e2] bg-white px-4 py-3 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-[#1a1a1a]/35">
              Updated
            </p>
            <p className="mt-1 text-sm font-semibold text-[#111110]">
              {formatDateTime(overview?.updated_at)}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SummaryChip label="기관 수" value={String(metrics.customer_count)} icon={<Building2 className="h-4 w-4" />} />
          <SummaryChip label="진행 거래" value={String(metrics.active_deal_count)} icon={<Package className="h-4 w-4" />} />
          <SummaryChip label="견적 진행" value={String(metrics.quote_count)} icon={<FileText className="h-4 w-4" />} />
          <SummaryChip label="계약 진행" value={String(metrics.contract_count + metrics.confirmed_count)} icon={<CheckCircle2 className="h-4 w-4" />} />
          <SummaryChip label="설치 예정" value={String(metrics.scheduled_installation_count)} icon={<CalendarDays className="h-4 w-4" />} />
          <SummaryChip
            label="미수금"
            value={formatMoney(metrics.outstanding_amount)}
            icon={<CircleDollarSign className="h-4 w-4" />}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <Card className="border-[#e7e7e2] bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">단계 보드 요약</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingOverview ? (
                <LoadingBlock label="운영 보드를 불러오는 중" />
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-4">
                    {stageCounts.map((stage) => (
                      <MetricCard
                        key={stage.stage}
                        label={stage.label}
                        value={String(stage.count)}
                      />
                    ))}
                  </div>
                  <div className="rounded-2xl border border-[#ecece7] bg-[#fafaf8] p-4">
                    <div className="flex flex-wrap gap-2">
                      {stageCounts.map((stage) => (
                        <span
                          key={`${stage.stage}-chip`}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#111110]/70"
                        >
                          {stage.label} {stage.count}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-[#1a1a1a]/55">
                      이 단계 분포는 이후 Overview, 거래건, 캘린더 화면의 공통 KPI 계산식으로 재사용합니다.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#e7e7e2] bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">오늘 일정 · 주의 신호</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <SectionTitle icon={<AlertTriangle className="h-4 w-4" />} label="주의 필요" />
                {loadingOverview ? (
                  <LoadingBlock label="경고 정보를 정리하는 중" />
                ) : alerts.length === 0 ? (
                  <EmptyText label="현재 강한 경고 항목은 없습니다." />
                ) : (
                  alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)
                )}
              </div>
              <div className="space-y-3">
                <SectionTitle icon={<Clock3 className="h-4 w-4" />} label="다가오는 일정" />
                {loadingOverview ? (
                  <LoadingBlock label="일정 정보를 정리하는 중" />
                ) : agenda.length === 0 ? (
                  <EmptyText label="등록된 일정이 없습니다." />
                ) : (
                  agenda.map((item) => <AgendaRow key={item.id} item={item} />)
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
          <Card className="border-[#e7e7e2] bg-white shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">고객 / 거래 탐색</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingCustomers ? (
                <LoadingBlock label="기관 목록 불러오는 중" />
              ) : customers.length === 0 ? (
                <EmptyBlock label="V2 고객 데이터가 아직 없습니다." />
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
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? "border-[#111110] bg-[#111110] text-white"
                          : "border-[#ecece7] bg-[#fafaf8] text-[#111110] hover:border-[#cfcfc8]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {item.customer.name}
                          </p>
                          <p
                            className={`mt-1 text-xs ${
                              isSelected ? "text-white/70" : "text-[#1a1a1a]/45"
                            }`}
                          >
                            {item.customer.region_label ?? "지역 미지정"}
                            {item.customer.campus_name
                              ? ` · ${item.customer.campus_name}`
                              : ""}
                          </p>
                        </div>
                        <ArrowRight
                          className={`h-4 w-4 shrink-0 ${
                            isSelected ? "text-white/80" : "text-[#1a1a1a]/25"
                          }`}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <MiniStat
                          label="진행 거래"
                          value={String(item.summary?.active_deals ?? 0)}
                          inverted={isSelected}
                        />
                        <MiniStat
                          label="미수금"
                          value={formatMoney(item.summary?.outstanding_amount ?? 0)}
                          inverted={isSelected}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-[#e7e7e2] bg-white shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">기관 상세</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {loadingCustomerDetail ? (
                  <LoadingBlock label="기관 상세 불러오는 중" />
                ) : !customerDetail ? (
                  <EmptyBlock label="선택된 기관이 없습니다." />
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-semibold text-[#111110]">
                          {customerDetail.customer.name}
                        </h2>
                        <div className="mt-2 flex flex-wrap gap-3 text-sm text-[#1a1a1a]/55">
                          <span className="inline-flex items-center gap-1.5">
                            <UserRound className="h-4 w-4" />
                            {customerDetail.customer.contact_name ?? "담당자 미지정"}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="h-4 w-4" />
                            {customerDetail.customer.region_label ?? "지역 미지정"}
                          </span>
                        </div>
                      </div>
                      <div className="grid min-w-[280px] grid-cols-2 gap-3">
                        <MetricCard label="총 거래" value={String(customerDetail.summary.total_deals)} />
                        <MetricCard label="진행 거래" value={String(customerDetail.summary.active_deals)} />
                        <MetricCard label="계약 금액" value={formatMoney(customerDetail.summary.contracted_amount)} />
                        <MetricCard label="미수금" value={formatMoney(customerDetail.summary.outstanding_amount)} />
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3 rounded-2xl border border-[#ecece7] bg-[#fafaf8] p-4">
                        <SectionTitle icon={<Clock3 className="h-4 w-4" />} label="최근 활동" />
                        {customerDetail.recent_activity.length === 0 ? (
                          <EmptyText label="최근 활동 로그가 없습니다." />
                        ) : (
                          customerDetail.recent_activity.slice(0, 3).map((log) => (
                            <SimpleTimelineRow
                              key={log.id}
                              title={log.summary}
                              subtitle={`${log.action_type} · ${formatDateTime(log.created_at)}`}
                            />
                          ))
                        )}
                      </div>
                      <div className="space-y-3 rounded-2xl border border-[#ecece7] bg-[#fafaf8] p-4">
                        <SectionTitle icon={<CalendarDays className="h-4 w-4" />} label="다가오는 일정" />
                        {customerDetail.recent_calendar_events.length === 0 ? (
                          <EmptyText label="등록된 일정이 없습니다." />
                        ) : (
                          customerDetail.recent_calendar_events.slice(0, 3).map((event) => (
                            <SimpleTimelineRow
                              key={event.id}
                              title={event.title}
                              subtitle={`${formatDateTime(event.starts_at)} · ${event.status}`}
                            />
                          ))
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-[#111110]">
                          거래 이력
                        </h3>
                        <span className="text-xs text-[#1a1a1a]/40">
                          최근 수정 순
                        </span>
                      </div>
                      <div className="space-y-3">
                        {customerDetail.deals.map((deal) => {
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
                                  ? "border-[#111110] bg-[#f4f4f1]"
                                  : "border-[#ecece7] hover:border-[#d2d2cb]"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-[#111110]">
                                    {deal.deal_title}
                                  </p>
                                  <p className="mt-1 text-xs text-[#1a1a1a]/45">
                                    {deal.deal_code} · 단계 {deal.current_stage}
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
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-[#e7e7e2] bg-white shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">거래 상세</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {loadingDealDetail ? (
                <LoadingBlock label="거래 상세 불러오는 중" />
              ) : !dealDetail ? (
                <EmptyBlock label="선택된 거래가 없습니다." />
              ) : (
                <>
                  <div className="rounded-2xl border border-[#ecece7] bg-[#fafaf8] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">
                      {DEAL_STAGE_LABEL[dealDetail.deal.current_stage]}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-[#111110]">
                      {dealDetail.deal.title}
                    </h3>
                    <p className="mt-1 text-sm text-[#1a1a1a]/50">
                      {dealDetail.customer.name} · 최근 수정 {formatDateTime(dealDetail.deal.updated_at)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#111110]/70">
                        {dealDetail.deal.payment_status}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#111110]/70">
                        {formatMoney(dealDetail.deal.outstanding_amount)} 미수
                      </span>
                    </div>
                  </div>

                  <StageRoadmap currentStage={dealDetail.deal.current_stage} />

                  <div className="space-y-3 rounded-2xl border border-[#ecece7] bg-[#fafaf8] p-4">
                    <div className="flex items-center justify-between">
                      <SectionTitle icon={<ChevronRight className="h-4 w-4" />} label="다음 액션" />
                      <span className="text-xs text-[#1a1a1a]/35">단계 전환 전 체크</span>
                    </div>
                    <div className="space-y-3">
                      {nextActions.map((action) => (
                        <ActionCard
                          key={action.title}
                          title={action.title}
                          description={action.description}
                          tone={action.tone}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {DEAL_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveDealTab(tab.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          activeDealTab === tab.id
                            ? "bg-[#111110] text-white"
                            : "bg-[#f0f0ec] text-[#1a1a1a]/55 hover:text-[#111110]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {activeDealTab === "overview" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <MetricCard label="계약 금액" value={formatMoney(dealDetail.deal.contracted_amount)} />
                        <MetricCard label="설치 완료 금액" value={formatMoney(dealDetail.deal.installed_amount)} />
                        <MetricCard label="실수납 누계" value={formatMoney(dealDetail.deal.paid_amount)} />
                        <MetricCard label="미수금" value={formatMoney(dealDetail.deal.outstanding_amount)} />
                      </div>
                      <div className="space-y-3">
                        <SectionTitle icon={<Package className="h-4 w-4" />} label="품목 요약" />
                        {dealDetail.line_items.length === 0 ? (
                          <EmptyText label="등록된 품목이 없습니다." />
                        ) : (
                          dealDetail.line_items.map((item) => (
                            <CompactRow
                              key={item.id}
                              label={`${item.product_name} · ${item.quantity}개`}
                              value={formatMoney(item.amount)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {activeDealTab === "documents" && (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <SectionTitle icon={<FileText className="h-4 w-4" />} label="견적서" />
                        {dealDetail.quote_documents.length === 0 ? (
                          <EmptyText label="견적 문서가 없습니다." />
                        ) : (
                          dealDetail.quote_documents.map((document) => (
                            <DocumentBundleCard
                              key={document.id}
                              title={document.quote_number}
                              status={document.status}
                              versions={document.versions.length}
                              shares={document.shares?.length ?? 0}
                              latestTitle={document.versions[0]?.title ?? "-"}
                              amount={document.versions[0]?.total_amount ?? 0}
                            />
                          ))
                        )}
                      </div>
                      <div className="space-y-3">
                        <SectionTitle icon={<CheckCircle2 className="h-4 w-4" />} label="계약서" />
                        {dealDetail.contract_documents.length === 0 ? (
                          <EmptyText label="계약 문서가 없습니다." />
                        ) : (
                          dealDetail.contract_documents.map((document) => (
                            <ContractBundleCard key={document.id} document={document} />
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {activeDealTab === "installations" && (
                    <div className="space-y-3">
                      <SectionTitle icon={<CalendarDays className="h-4 w-4" />} label="설치 일정" />
                      {dealDetail.installations.length === 0 ? (
                        <EmptyText label="설치 일정이 없습니다." />
                      ) : (
                        dealDetail.installations.map((event) => (
                          <InstallationCard key={event.id} event={event} />
                        ))
                      )}
                    </div>
                  )}

                  {activeDealTab === "payments" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <MetricCard label="실수납 누계" value={formatMoney(dealDetail.deal.paid_amount)} />
                        <MetricCard label="미수금" value={formatMoney(dealDetail.deal.outstanding_amount)} />
                      </div>
                      <div className="space-y-3">
                        <SectionTitle icon={<CircleDollarSign className="h-4 w-4" />} label="입금 기록" />
                        {dealDetail.payments.length === 0 ? (
                          <EmptyText label="등록된 입금 기록이 없습니다." />
                        ) : (
                          dealDetail.payments.map((payment) => (
                            <CompactRow
                              key={payment.id}
                              label={`${formatDate(payment.paid_at)} · ${payment.payment_method}`}
                              value={formatMoney(payment.amount)}
                            />
                          ))
                        )}
                      </div>
                      <div className="space-y-3">
                        <SectionTitle icon={<Receipt className="h-4 w-4" />} label="영수증" />
                        {dealDetail.receipts.length === 0 ? (
                          <EmptyText label="영수증이 없습니다." />
                        ) : (
                          dealDetail.receipts.map((receipt) => (
                            <CompactRow
                              key={receipt.id}
                              label={`${receipt.receipt_number} · ${formatDate(receipt.created_at)}`}
                              value={formatMoney(receipt.total_amount)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {activeDealTab === "activity" && (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <SectionTitle icon={<Clock3 className="h-4 w-4" />} label="활동 로그" />
                        {dealDetail.activity_logs.length === 0 ? (
                          <EmptyText label="활동 로그가 없습니다." />
                        ) : (
                          dealDetail.activity_logs.map((log) => (
                            <SimpleTimelineRow
                              key={log.id}
                              title={log.summary}
                              subtitle={`${log.action_type} · ${formatDateTime(log.created_at)}`}
                            />
                          ))
                        )}
                      </div>
                      <div className="space-y-3">
                        <SectionTitle icon={<CalendarDays className="h-4 w-4" />} label="캘린더 이벤트" />
                        {(dealDetail.calendar_events ?? []).length === 0 ? (
                          <EmptyText label="연결된 캘린더 이벤트가 없습니다." />
                        ) : (
                          (dealDetail.calendar_events ?? []).map((event) => (
                            <SimpleTimelineRow
                              key={event.id}
                              title={event.title}
                              subtitle={`${formatDateTime(event.starts_at)} · ${event.status}`}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )}
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
    <div className="rounded-2xl border border-[#e7e7e2] bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-[#1a1a1a]/45">{icon}</div>
      <p className="mt-2 text-xs text-[#1a1a1a]/45">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#111110]">{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#ecece7] bg-[#fafaf8] px-4 py-3">
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
    <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
      <p className="text-[11px] text-[#1a1a1a]/35">{label}</p>
      <p className="mt-1 text-xs font-semibold text-[#111110]">{value}</p>
    </div>
  );
}

function SectionTitle({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-[#111110]">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function CompactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#ecece7] px-3 py-2.5">
      <span className="text-sm text-[#1a1a1a]/60">{label}</span>
      <span className="text-sm font-medium text-[#111110]">{value}</span>
    </div>
  );
}

function AlertRow({
  alert,
}: {
  alert: CommercialOverviewPayload["alerts"][number];
}) {
  const toneClass =
    alert.tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : alert.tone === "accent"
        ? "border-blue-200 bg-blue-50"
        : "border-[#ecece7] bg-[#fafaf8]";

  return (
    <div className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
      <p className="text-sm font-semibold text-[#111110]">{alert.title}</p>
      <p className="mt-1 text-xs text-[#1a1a1a]/55">{alert.description}</p>
    </div>
  );
}

function AgendaRow({
  item,
}: {
  item: CommercialOverviewPayload["agenda"][number];
}) {
  return (
    <div className="rounded-2xl border border-[#ecece7] bg-[#fafaf8] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#111110]">{item.title}</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#111110]/70">
          {item.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-[#1a1a1a]/55">
        {formatDateTime(item.starts_at)}
        {item.customer_name ? ` · ${item.customer_name}` : ""}
      </p>
      {item.description && (
        <p className="mt-1 text-xs text-[#1a1a1a]/40">{item.description}</p>
      )}
    </div>
  );
}

function StageRoadmap({ currentStage }: { currentStage: DealStage }) {
  const stages = Object.keys(DEAL_STAGE_LABEL) as DealStage[];
  const currentIndex = stages.indexOf(currentStage);

  return (
    <div className="grid grid-cols-4 gap-2">
      {stages.map((stage, index) => {
        const isCurrent = stage === currentStage;
        const isDone = index < currentIndex && currentStage !== "cancelled";

        return (
          <div
            key={stage}
            className={`rounded-2xl border px-3 py-2 text-center ${
              isCurrent
                ? "border-[#111110] bg-[#111110] text-white"
                : isDone
                  ? "border-[#d8e9d8] bg-[#eef8ee] text-[#245b2f]"
                  : "border-[#ecece7] bg-[#fafaf8] text-[#1a1a1a]/55"
            }`}
          >
            <p className="text-[11px] font-semibold">{DEAL_STAGE_LABEL[stage]}</p>
          </div>
        );
      })}
    </div>
  );
}

function ActionCard({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: "neutral" | "warning" | "accent";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : tone === "accent"
        ? "border-blue-200 bg-blue-50"
        : "border-[#ecece7] bg-white";

  return (
    <div className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
      <p className="text-sm font-semibold text-[#111110]">{title}</p>
      <p className="mt-1 text-xs text-[#1a1a1a]/55">{description}</p>
    </div>
  );
}

function DocumentBundleCard({
  title,
  status,
  versions,
  shares,
  latestTitle,
  amount,
}: {
  title: string;
  status: string;
  versions: number;
  shares: number;
  latestTitle: string;
  amount: number;
}) {
  return (
    <div className="rounded-2xl border border-[#ecece7] bg-[#fafaf8] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#111110]">{title}</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#111110]/70">
          {status}
        </span>
      </div>
      <p className="mt-2 text-xs text-[#1a1a1a]/55">{latestTitle}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <InlineMetric label="버전" value={`${versions}개`} />
        <InlineMetric label="공유" value={`${shares}개`} />
        <InlineMetric label="금액" value={formatMoney(amount)} />
      </div>
    </div>
  );
}

function ContractBundleCard({
  document,
}: {
  document: ContractDocumentBundle;
}) {
  const currentVersion = document.versions[0];

  return (
    <DocumentBundleCard
      title={document.contract_number}
      status={currentVersion?.sign_status ?? document.status}
      versions={document.versions.length}
      shares={document.shares?.length ?? 0}
      latestTitle={currentVersion?.title ?? "-"}
      amount={currentVersion?.total_amount ?? 0}
    />
  );
}

function InstallationCard({ event }: { event: InstallationEvent }) {
  return (
    <div className="rounded-2xl border border-[#ecece7] bg-[#fafaf8] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#111110]">
          {formatDateTime(event.scheduled_start_at)}
        </p>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#111110]/70">
          {event.status}
        </span>
      </div>
      <p className="mt-2 text-xs text-[#1a1a1a]/55">
        {event.assigned_team ?? "설치팀 미지정"}
        {event.location ? ` · ${event.location}` : ""}
      </p>
      {event.notes && (
        <p className="mt-1 text-xs text-[#1a1a1a]/40">{event.notes}</p>
      )}
    </div>
  );
}

function SimpleTimelineRow({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl border border-[#ecece7] bg-white px-3 py-2.5">
      <p className="text-sm font-medium text-[#111110]">{title}</p>
      <p className="mt-1 text-xs text-[#1a1a1a]/40">{subtitle}</p>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[#ecece7] bg-[#fafaf8] px-4 py-6 text-sm text-[#1a1a1a]/55">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d9d2] bg-[#fafaf8] px-4 py-8 text-center text-sm text-[#1a1a1a]/45">
      {label}
    </div>
  );
}

function EmptyText({ label }: { label: string }) {
  return <p className="text-sm text-[#1a1a1a]/40">{label}</p>;
}
