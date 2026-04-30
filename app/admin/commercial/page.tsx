"use client";

import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Package,
  Receipt,
  Search,
  UserRound,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CommercialOverviewPayload,
  CommercialOverviewRange,
} from "@/lib/partner-portal/overview-types";
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

const OVERVIEW_RANGE_OPTIONS: Array<{ id: CommercialOverviewRange; label: string }> = [
  { id: "today", label: "오늘" },
  { id: "week", label: "일주일" },
  { id: "month", label: "한달" },
  { id: "quarter", label: "분기" },
];

const DEAL_STAGE_META: Record<DealStage, { color: string; dot: string; ring: string }> = {
  contact:      { color: "bg-[#f0f0ec] text-[#615D59]",   dot: "bg-[#A39E98]",   ring: "ring-[#e8e8e4]"   },
  quote:        { color: "bg-[#ECFDF5] text-[#084734]",   dot: "bg-[#084734]",   ring: "ring-[#D1FAE5]"   },
  contract:     { color: "bg-[#D1FAE5] text-[#065c41]",   dot: "bg-[#065c41]",   ring: "ring-[#A7F3D0]"   },
  confirmed:    { color: "bg-[#D1FAE5] text-[#065c41]",   dot: "bg-[#065c41]",   ring: "ring-[#A7F3D0]"   },
  installation: { color: "bg-amber-50 text-amber-700",     dot: "bg-amber-500",   ring: "ring-amber-200"   },
  payment:      { color: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", ring: "ring-emerald-200" },
  closed:       { color: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", ring: "ring-emerald-200" },
  cancelled:    { color: "bg-[#FEF3EE] text-[#B85C33]",   dot: "bg-[#E8956B]",   ring: "ring-[#F6D5C5]"   },
};

const STAGE_FLOW: DealStage[] = ["contact", "quote", "contract", "confirmed", "installation", "payment"];

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

function fmtM(n?: number | null): string {
  if (n == null) return "-";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

function getDday(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "D-Day";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
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
  const [overviewRange, setOverviewRange] = useState<CommercialOverviewRange>("today");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [activeDealTab, setActiveDealTab] = useState<DealTab>("overview");
  const [customerDetail, setCustomerDetail] = useState<CustomerDetailPayload | null>(null);
  const [dealDetail, setDealDetail] = useState<DealDetailPayload | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);
  const [loadingDealDetail, setLoadingDealDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredCustomerQuery = useDeferredValue(customerQuery);

  useEffect(() => {
    let alive = true;

    async function loadOverview() {
      setLoadingOverview(true);

      try {
        const payload = await readJson<{ overview: CommercialOverviewPayload }>(
          `/api/admin/commercial/overview?range=${overviewRange}`
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

    void loadOverview();

    return () => {
      alive = false;
    };
  }, [overviewRange]);

  useEffect(() => {
    let alive = true;

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

  const filteredCustomers = useMemo(() => {
    const query = deferredCustomerQuery.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((item) =>
      [
        item.customer.name,
        item.customer.contact_name,
        item.customer.region_label,
        item.customer.campus_name,
        item.customer.phone,
        item.customer.business_number,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [customers, deferredCustomerQuery]);

  useEffect(() => {
    if (filteredCustomers.length === 0) {
      setSelectedCustomerId(null);
      setSelectedDealId(null);
      setCustomerDetail(null);
      setDealDetail(null);
      return;
    }

    if (!selectedCustomerId || !filteredCustomers.some((item) => item.customer.id === selectedCustomerId)) {
      setSelectedCustomerId(filteredCustomers[0].customer.id);
    }
  }, [filteredCustomers, selectedCustomerId]);

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
  const overviewRangeLabel =
    OVERVIEW_RANGE_OPTIONS.find((option) => option.id === overviewRange)?.label ?? "오늘";

  return (
    <div className="min-h-screen bg-[#f5f5f2] px-6 py-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* 페이지 헤더 */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1a1a1a]/35">
              Partner Dashboard
            </p>
            <h1 className="mt-2 text-xl font-bold text-[#1a1a1a]">
              파트너 포털 운영 대시보드
            </h1>
            <p className="mt-1.5 max-w-4xl text-sm text-[#1a1a1a]/50">
              오늘의 병목, 단계 분포, 설치 일정, 미수 리스크를 먼저 보고 필요한 거래 상세로 바로 들어가는 운영판입니다.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3">
            <div className="flex flex-wrap justify-end gap-2">
              {OVERVIEW_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setOverviewRange(option.id)}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                    overviewRange === option.id
                      ? "bg-[#1a1a1a] text-white"
                      : "bg-white text-[#1a1a1a]/60 border border-[#e8e8e4] hover:bg-[#f7f7f5]",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-[#e8e8e4] bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[#1a1a1a]/35">
                Updated · {overviewRangeLabel}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#1a1a1a]">
                {formatDateTime(overview?.updated_at)}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-sm text-[#B85C33]">
            {error}
          </div>
        )}

        {/* KPI 칩 */}
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
            danger={metrics.outstanding_amount > 0}
          />
        </div>

        {/* 단계 보드 + 일정/주의 */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">단계 보드 요약</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingOverview ? (
                <LoadingBlock />
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
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    <div className="flex flex-wrap gap-2">
                      {stageCounts.map((stage) => (
                        <span
                          key={`${stage.stage}-chip`}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#1a1a1a]/70"
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

          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">오늘 일정 · 주의 신호</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <SectionTitle icon={<AlertTriangle className="h-4 w-4" />} label="주의 필요" />
                {loadingOverview ? (
                  <LoadingBlock />
                ) : alerts.length === 0 ? (
                  <EmptyText label="현재 강한 경고 항목은 없습니다." />
                ) : (
                  alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)
                )}
              </div>
              <div className="space-y-3">
                <SectionTitle icon={<Clock3 className="h-4 w-4" />} label="다가오는 일정" />
                {loadingOverview ? (
                  <LoadingBlock />
                ) : agenda.length === 0 ? (
                  <EmptyText label="등록된 일정이 없습니다." />
                ) : (
                  agenda.map((item) => <AgendaRow key={item.id} item={item} />)
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 3컬럼 메인 레이아웃 */}
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
          {/* 고객 목록 */}
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="space-y-3 pb-4">
              <CardTitle className="text-base">고객 / 거래 탐색</CardTitle>
              <div className="flex items-center justify-between gap-3 text-xs text-[#1a1a1a]/40">
                <span>검색 결과</span>
                <span>{filteredCustomers.length}/{customers.length}</span>
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/30" />
                <input
                  type="search"
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  placeholder="기관명, 담당자, 지역으로 검색"
                  className="w-full rounded-xl border border-[#e8e8e4] bg-[#fafaf8] py-2.5 pl-9 pr-3 text-sm text-[#1a1a1a] outline-none transition-colors focus:border-[#1a1a1a]"
                />
              </label>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/30" />
                <input
                  type="search"
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  placeholder="湲곌?紐?, ?대떦??, 吏??쑝濡?寃??"
                  className="h-10 w-full rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] pl-9 pr-3 text-sm text-[#1a1a1a] outline-none transition-colors duration-150 placeholder:text-[#1a1a1a]/35 focus:border-[#1a1a1a]/25 focus:bg-white"
                />
              </div>
              {loadingCustomers ? (
                <LoadingBlock />
              ) : customers.length === 0 ? (
                <EmptyBlock label="V2 고객 데이터가 아직 없습니다." />
              ) : filteredCustomers.length === 0 ? (
                <EmptyBlock label="검색 조건에 맞는 기관이 없습니다." />
              ) : (
                filteredCustomers.map((item) => {
                  const isSelected = item.customer.id === selectedCustomerId;
                  const hasOutstanding = (item.summary?.outstanding_amount ?? 0) > 0;
                  return (
                    <button
                      key={item.customer.id}
                      type="button"
                      onClick={() =>
                        startTransition(() => {
                          setSelectedCustomerId(item.customer.id);
                        })
                      }
                      className={[
                        "relative w-full rounded-xl border px-4 py-3 text-left transition-colors duration-150",
                        isSelected
                          ? "border-[#1a1a1a] bg-[#fafafa]"
                          : "border-[#e8e8e4] bg-white hover:bg-[#f7f7f5] hover:border-[#ccc]",
                      ].join(" ")}
                    >
                      {hasOutstanding && (
                        <span className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-[#B85C33]" />
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 pr-4">
                          <p className="truncate text-sm font-semibold text-[#1a1a1a]">
                            {item.customer.name}
                          </p>
                          <p className="mt-1 text-xs text-[#1a1a1a]/45">
                            {item.customer.region_label ?? "지역 미지정"}
                            {item.customer.campus_name
                              ? ` · ${item.customer.campus_name}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full bg-[#f7f7f5] px-2.5 py-1 text-[#1a1a1a]/60">
                          嫄곕옒 {item.summary?.total_deals ?? 0}嫄?
                        </span>
                        <span className="rounded-full bg-[#f7f7f5] px-2.5 py-1 text-[#1a1a1a]/60">
                          吏꾪뻾 {item.summary?.active_deals ?? 0}嫄?
                        </span>
                        {hasOutstanding && (
                          <span className="rounded-full bg-[#FEF3EE] px-2.5 py-1 text-[#B85C33]">
                            誘몄닔 {formatMoney(item.summary?.outstanding_amount ?? 0)}
                          </span>
                        )}
                      </div>
                      <div className="hidden mt-3 flex flex-wrap gap-2 text-xs">
                        <MiniStat
                          label="진행 거래"
                          value={String(item.summary?.active_deals ?? 0)}
                        />
                        <MiniStat
                          label="미수금"
                          value={formatMoney(item.summary?.outstanding_amount ?? 0)}
                          danger={(item.summary?.outstanding_amount ?? 0) > 0}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* 기관 상세 */}
          <div className="space-y-6">
            <Card className="border-[#e8e8e4] bg-white shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">기관 상세</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {loadingCustomerDetail ? (
                  <LoadingBlock />
                ) : !customerDetail ? (
                  <EmptyBlock label="선택된 기관이 없습니다." />
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-semibold text-[#1a1a1a]">
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
                      <div className="space-y-3 rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
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
                      <div className="space-y-3 rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
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
                        <h3 className="text-sm font-semibold text-[#1a1a1a]">
                          거래 이력
                        </h3>
                        <span className="text-xs text-[#1a1a1a]/40">
                          최근 수정 순
                        </span>
                      </div>
                      <div className="space-y-3">
                        {customerDetail.deals.map((deal) => {
                          const isSelected = deal.deal_id === selectedDealId;
                          const stageMeta = DEAL_STAGE_META[deal.current_stage];
                          const dday = (deal.current_stage === "installation" || deal.current_stage === "confirmed")
                            ? getDday((deal as { scheduled_start_at?: string | null }).scheduled_start_at)
                            : null;
                          return (
                            <button
                              key={deal.deal_id}
                              type="button"
                              onClick={() =>
                                startTransition(() => {
                                  setSelectedDealId(deal.deal_id);
                                })
                              }
                              className={[
                                "w-full rounded-2xl border px-4 py-4 text-left transition-colors duration-150",
                                isSelected
                                  ? "ring-2 ring-[#1a1a1a] ring-offset-1 border-[#1a1a1a]"
                                  : "border-[#e8e8e4] hover:border-[#d2d2cb]",
                              ].join(" ")}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[#1a1a1a]">
                                    {deal.deal_title}
                                  </p>
                                  <p className="mt-0.5 font-mono text-[10px] text-[#1a1a1a]/40">
                                    {deal.deal_code}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors duration-200 ${stageMeta.color}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${stageMeta.dot}`} />
                                    {DEAL_STAGE_LABEL[deal.current_stage]}
                                  </span>
                                  {dday && (
                                    <span className="text-[10px] font-medium text-amber-600">
                                      {dday}
                                    </span>
                                  )}
                                  {deal.contracted_amount != null && (
                                    <span className="text-xs font-semibold text-[#1a1a1a]">
                                      {fmtM(deal.contracted_amount)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="mt-4 grid gap-2 grid-cols-4">
                                <InlineMetric label="계약" value={fmtM(deal.contracted_amount)} />
                                <InlineMetric label="설치완료" value={fmtM(deal.installed_amount)} />
                                <InlineMetric label="실수납" value={fmtM(deal.paid_amount)} />
                                <InlineMetric label="미수금" value={fmtM(deal.outstanding_amount)} danger={(deal.outstanding_amount ?? 0) > 0} />
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

          {/* 거래 상세 패널 */}
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">거래 상세</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {loadingDealDetail ? (
                <LoadingBlock />
              ) : !dealDetail ? (
                <EmptyBlock label="선택된 거래가 없습니다." />
              ) : (
                <div key={dealDetail.deal.id} className="transition-opacity duration-200 ease-out space-y-5">
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">
                      {DEAL_STAGE_LABEL[dealDetail.deal.current_stage]}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-[#1a1a1a]">
                      {dealDetail.deal.title}
                    </h3>
                    <p className="mt-1 text-sm text-[#1a1a1a]/50">
                      {dealDetail.customer.name} · 최근 수정 {formatDateTime(dealDetail.deal.updated_at)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white border border-[#e8e8e4] px-2.5 py-1 text-[10px] font-medium text-[#1a1a1a]/70">
                        {dealDetail.deal.payment_status}
                      </span>
                      {(dealDetail.deal.outstanding_amount ?? 0) > 0 ? (
                        <span className="rounded-full bg-[#FEF3EE] border border-[#F6D5C5] px-2.5 py-1 text-[10px] font-semibold text-[#B85C33] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#B85C33] shrink-0" />
                          {fmtM(dealDetail.deal.outstanding_amount)} 미수
                        </span>
                      ) : (
                        <span className="rounded-full bg-white border border-[#e8e8e4] px-2.5 py-1 text-[10px] font-medium text-[#1a1a1a]/70">
                          미수 없음
                        </span>
                      )}
                    </div>
                  </div>

                  <StageRoadmap currentStage={dealDetail.deal.current_stage} />

                  <div className="space-y-3 rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
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

                  {/* 탭 버튼 */}
                  <div className="flex flex-wrap gap-2">
                    {DEAL_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveDealTab(tab.id)}
                        className={[
                          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                          activeDealTab === tab.id
                            ? "bg-[#1a1a1a] text-white"
                            : "bg-[#f0f0ec] text-[#1a1a1a]/55 hover:text-[#1a1a1a]",
                        ].join(" ")}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* 탭 콘텐츠 */}
                  {activeDealTab === "overview" && (
                    <div className="space-y-4 transition-opacity duration-150">
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
                    <div className="space-y-4 transition-opacity duration-150">
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
                    <div className="space-y-3 transition-opacity duration-150">
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
                    <div className="space-y-4 transition-opacity duration-150">
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
                    <div className="space-y-4 transition-opacity duration-150">
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── 서브 컴포넌트 ───────────────────────────────────────────────────────────

function SummaryChip({
  label,
  value,
  icon,
  danger,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${danger ? "border-[#F6D5C5] bg-[#FEF3EE]" : "border-[#e8e8e4] bg-white"}`}>
      <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${danger ? "bg-[#F6D5C5] text-[#B85C33]" : "bg-[#f7f7f5] text-[#1a1a1a]/40"}`}>
        {icon}
      </div>
      <p className={`text-[10px] uppercase tracking-wider mt-2 ${danger ? "text-[#B85C33]" : "text-[#1a1a1a]/40"}`}>{label}</p>
      <p className={`text-base font-bold mt-0.5 ${danger ? "text-[#9A4A27]" : "text-[#1a1a1a]"}`}>{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-[#1a1a1a]/40">{label}</p>
      <p className="mt-1 text-sm font-bold text-[#1a1a1a]">{value}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1.5",
        danger ? "bg-[#FEF3EE]" : "bg-[#f7f7f5]",
      ].join(" ")}
    >
      <p className={`text-[10px] ${danger ? "text-[#B85C33]" : "text-[#1a1a1a]/40"}`}>{label}</p>
      <p className={`text-xs font-semibold ${danger ? "text-[#9A4A27]" : "text-[#1a1a1a]"}`}>{value}</p>
    </div>
  );
}

function InlineMetric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${danger ? "bg-[#FEF3EE]" : "bg-[#f7f7f5]"}`}>
      <p className={`text-[10px] ${danger ? "text-[#B85C33]" : "text-[#1a1a1a]/40"}`}>{label}</p>
      <p className={`mt-1 text-xs font-semibold ${danger ? "text-[#9A4A27]" : "text-[#1a1a1a]"}`}>{value}</p>
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
    <div className="flex items-center gap-2 text-sm font-semibold text-[#1a1a1a]">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function CompactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e8e8e4] px-3 py-2.5">
      <span className="text-sm text-[#1a1a1a]/60">{label}</span>
      <span className="text-sm font-medium text-[#1a1a1a]">{value}</span>
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
      ? "bg-amber-50 border-amber-200 text-amber-800"
      : alert.tone === "accent"
        ? "bg-[#ECFDF5] border-[#D1FAE5] text-[#084734]"
        : "bg-[#f7f7f5] border-[#e8e8e4] text-[#1a1a1a]";

  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClass}`}>
      <p className="text-sm font-semibold">{alert.title}</p>
      <p className="mt-1 text-xs opacity-70">{alert.description}</p>
    </div>
  );
}

function AgendaRow({
  item,
}: {
  item: CommercialOverviewPayload["agenda"][number];
}) {
  return (
    <div className="bg-white border-[#e8e8e4] rounded-xl border px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#1a1a1a]">{item.title}</p>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f0f0ec] text-[#1a1a1a]/60 font-medium">
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
  if (currentStage === "cancelled") return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-[#E8956B]" />
      <span className="text-xs text-[#B85C33]">취소됨</span>
    </div>
  );

  const activeIdx = STAGE_FLOW.indexOf(currentStage);
  return (
    <div className="flex items-center gap-0">
      {STAGE_FLOW.map((s, i) => {
        const meta = DEAL_STAGE_META[s];
        const isPast   = i < activeIdx;
        const isActive = i === activeIdx;
        const isFuture = i > activeIdx;
        return (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-1">
              <div className={[
                "rounded-full transition-colors duration-200",
                isActive ? `w-3.5 h-3.5 ${meta.dot} ring-2 ${meta.ring}` : "",
                isPast   ? `w-2.5 h-2.5 ${meta.dot}` : "",
                isFuture ? "w-2.5 h-2.5 bg-white border-2 border-[#d8d8d4]" : "",
              ].filter(Boolean).join(" ")} />
              <span className={`text-[9px] leading-none whitespace-nowrap ${isActive ? "font-semibold text-[#1a1a1a]" : isPast ? "text-[#1a1a1a]/40" : "text-[#1a1a1a]/25"}`}>
                {DEAL_STAGE_LABEL[s]}
              </span>
            </div>
            {i < STAGE_FLOW.length - 1 && (
              <div className={`h-px flex-1 min-w-[10px] mb-3.5 transition-colors duration-200 ${i < activeIdx ? meta.dot : "bg-[#e0e0dc]"}`} />
            )}
          </React.Fragment>
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
      ? "bg-amber-50 border-amber-200"
      : tone === "accent"
        ? "bg-[#ECFDF5] border-[#D1FAE5]"
        : "bg-[#f7f7f5] border-[#e8e8e4]";

  return (
    <div className={`rounded-xl border px-3 py-3 active:scale-[0.98] transition-transform duration-75 ${toneClass}`}>
      <p className="text-sm font-semibold text-[#1a1a1a]">{title}</p>
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
    <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#1a1a1a]">{title}</p>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-[#e8e8e4] font-medium text-[#1a1a1a]/70">
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
    <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#1a1a1a]">
          {formatDateTime(event.scheduled_start_at)}
        </p>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-[#e8e8e4] font-medium text-[#1a1a1a]/70">
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
  isLast = false,
}: {
  title: string;
  subtitle: string;
  isLast?: boolean;
}) {
  return (
    <div className={`relative flex gap-3 ${isLast ? "" : "pb-4"}`}>
      {!isLast && (
        <span className="absolute left-3 top-6 bottom-0 w-px bg-[#e8e8e4]" />
      )}
      <div className="shrink-0 w-6 h-6 rounded-full bg-[#f0f0ec] flex items-center justify-center z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]/25" />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium text-[#1a1a1a]">{title}</p>
        <p className="mt-0.5 text-xs text-[#1a1a1a]/40">{subtitle}</p>
      </div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="space-y-2">
      <div className="h-14 rounded-xl bg-[#f0f0ec] animate-pulse" />
      <div className="h-14 rounded-xl bg-[#f0f0ec] animate-pulse" />
      <div className="h-14 rounded-xl bg-[#f0f0ec] animate-pulse" />
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-4 py-8 text-center text-sm text-[#1a1a1a]/40">
      {label}
    </div>
  );
}

function EmptyText({ label }: { label: string }) {
  return <p className="text-sm text-[#1a1a1a]/40">{label}</p>;
}
