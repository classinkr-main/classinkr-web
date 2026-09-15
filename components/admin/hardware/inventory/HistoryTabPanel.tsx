"use client"

// 내역 탭 본문 — HardwareInventoryClient(오케스트레이터)에서 그대로 잘라낸 구조 분해다.
// 감사(2026-09-07 #6) 탭 경계 분해 원칙과 동일 — state·파생 메모는 전부 부모 소유, 이 파일은
// 필터 UI + HistoryLogSection 배치만 담당한다(순수 구조 분해, 동작 변경 없음).
import type { ComponentProps, Dispatch, SetStateAction } from "react"
import dynamic from "next/dynamic"
import { motion } from "framer-motion"
import { ChevronDown, Filter, Search, Settings2, Users, X } from "lucide-react"

import {
  formatLotLabel,
  formatNumber,
  historyDateRange,
  MOVEMENT_LABEL,
  PRODUCT_FILTER_OPTIONS,
  SALE_TYPE_META,
  SectionLoadingFallback,
  type HardwareDashboard,
  type HardwareMovementType,
  type OutboundSaleType,
  type ProductFilterKey,
} from "./shared"

// 상세 내역 로그(고객사×날짜 그룹 아코디언)는 첫 페인트("home" 탭)에 없다 — 이 탭 파일 자체가
// 이미 next/dynamic으로 지연 로드되므로, 하위에서 다시 감싸는 것은 필터 카드(항상 필요)와
// 로그 리스트(무거운 렌더)를 별도 청크로 더 쪼개는 것이다. 기존 관례(HardwareInventoryClient) 유지.
const HistoryLogSection = dynamic(() => import("./HistoryLogSection"), {
  ssr: false,
  loading: () => <SectionLoadingFallback />,
})

interface HistoryTabPanelProps {
  activePanelId: string
  activeTabId: string
  reduceMotion: boolean | null
  data: HardwareDashboard | null
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  setMovementsPage: Dispatch<SetStateAction<number>>
  filtersExpanded: boolean
  setFiltersExpanded: Dispatch<SetStateAction<boolean>>
  advancedHistoryFilterCount: number
  hasHistoryFilter: boolean
  resetHistoryFilters: () => void
  activeHistoryFilterChips: Array<{ key: string; label: string; onRemove: () => void }>
  filteredMovements: ComponentProps<typeof HistoryLogSection>["filteredMovements"]
  historyType: HardwareMovementType | "all" | "sample"
  setHistoryType: Dispatch<SetStateAction<HardwareMovementType | "all" | "sample">>
  historySort: "desc" | "asc"
  setHistorySort: Dispatch<SetStateAction<"desc" | "asc">>
  historyStatus: "all" | "done" | "planned"
  setHistoryStatus: Dispatch<SetStateAction<"all" | "done" | "planned">>
  includeVoided: boolean
  setIncludeVoided: Dispatch<SetStateAction<boolean>>
  saleTypeFilter: OutboundSaleType | ""
  setSaleTypeFilter: Dispatch<SetStateAction<OutboundSaleType | "">>
  productFilter: ProductFilterKey
  setProductFilter: Dispatch<SetStateAction<ProductFilterKey>>
  historyDateFrom: string
  setHistoryDateFrom: Dispatch<SetStateAction<string>>
  historyDateTo: string
  setHistoryDateTo: Dispatch<SetStateAction<string>>
  historyLots: string[]
  lotFilter: string
  setLotFilter: Dispatch<SetStateAction<string>>
  historyCustomers: string[]
  customerFilter: string
  setCustomerFilter: Dispatch<SetStateAction<string>>
  setCustomerDetail: Dispatch<SetStateAction<string | null>>
  logGroups: ComponentProps<typeof HistoryLogSection>["logGroups"]
  pageLogGroupKeys: ComponentProps<typeof HistoryLogSection>["pageLogGroupKeys"]
  toggleAllPageLogGroups: ComponentProps<typeof HistoryLogSection>["toggleAllPageLogGroups"]
  allPageGroupsExpanded: ComponentProps<typeof HistoryLogSection>["allPageGroupsExpanded"]
  logGroupsPagination: ComponentProps<typeof HistoryLogSection>["logGroupsPagination"]
  expandedLogGroups: ComponentProps<typeof HistoryLogSection>["expandedLogGroups"]
  setDetailId: ComponentProps<typeof HistoryLogSection>["setDetailId"]
  toggleLogGroup: ComponentProps<typeof HistoryLogSection>["toggleLogGroup"]
  renderMovementRow: ComponentProps<typeof HistoryLogSection>["renderMovementRow"]
  // 감사(2026-09-07 #7) — 기본 응답 2000건 캡 너머를 명시적으로 더 불러오는 왕복(부모 소유).
  loadingMoreHistory: boolean
  loadMoreHistoryError: string | null
  loadMoreHistory: () => void | Promise<void>
}

export default function HistoryTabPanel({
  activePanelId,
  activeTabId,
  reduceMotion,
  data,
  search,
  setSearch,
  setMovementsPage,
  filtersExpanded,
  setFiltersExpanded,
  advancedHistoryFilterCount,
  hasHistoryFilter,
  resetHistoryFilters,
  activeHistoryFilterChips,
  filteredMovements,
  historyType,
  setHistoryType,
  historySort,
  setHistorySort,
  historyStatus,
  setHistoryStatus,
  includeVoided,
  setIncludeVoided,
  saleTypeFilter,
  setSaleTypeFilter,
  productFilter,
  setProductFilter,
  historyDateFrom,
  setHistoryDateFrom,
  historyDateTo,
  setHistoryDateTo,
  historyLots,
  lotFilter,
  setLotFilter,
  historyCustomers,
  customerFilter,
  setCustomerFilter,
  setCustomerDetail,
  logGroups,
  pageLogGroupKeys,
  toggleAllPageLogGroups,
  allPageGroupsExpanded,
  logGroupsPagination,
  expandedLogGroups,
  setDetailId,
  toggleLogGroup,
  renderMovementRow,
  loadingMoreHistory,
  loadMoreHistoryError,
  loadMoreHistory,
}: HistoryTabPanelProps) {
  const movementsLoaded = data?.movements.length ?? 0
  const movementsTotal = data?.movementsTotal ?? movementsLoaded
  const hasMoreHistory = movementsTotal > movementsLoaded
  return (
    <motion.div
      id={activePanelId}
      role="tabpanel"
      aria-labelledby={activeTabId}
      className="space-y-5"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
    >
        <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="relative block min-w-[240px] flex-1 sm:max-w-[440px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setMovementsPage(1)
                }}
                aria-label="하드웨어 원장 검색"
                placeholder="품목·고객사·물량번호·담당자·특이사항 검색"
                className="h-10 w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] pl-9 pr-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
              />
            </label>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersExpanded((current) => !current)}
                aria-expanded={filtersExpanded}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 ${
                  filtersExpanded
                    ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                    : "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:bg-[#F6F5F4]"
                }`}
              >
                <Settings2 className="h-3.5 w-3.5" />
                상세 필터
                {advancedHistoryFilterCount > 0 && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#084734] px-1 text-[10px] font-bold text-white">
                    {advancedHistoryFilterCount}
                  </span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersExpanded ? "rotate-180" : ""}`} />
              </button>
              {hasHistoryFilter && (
                <button
                  type="button"
                  onClick={resetHistoryFilters}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4]"
                >
                  <X className="h-3.5 w-3.5" />
                  전체 초기화
                </button>
              )}
            </div>
          </div>
          {hasHistoryFilter ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[rgba(0,0,0,0.06)] pt-3">
              <span className="text-[11px] font-bold text-[#615D59]">적용된 필터</span>
              {activeHistoryFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#084734] transition hover:bg-[#d6f7e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45"
                >
                  {chip.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
              <span className="ml-auto text-[11px] font-semibold text-[#615D59]">
                필터 후 {formatNumber(filteredMovements.length)}건 / 전체 {formatNumber(data?.movements.length ?? 0)}건
              </span>
            </div>
          ) : null}
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex w-12 shrink-0 items-center gap-1.5 text-[12px] font-bold text-[#111110]">
              <Filter className="h-3.5 w-3.5 text-[#615D59]" />
              유형
            </span>
            {(["all", "inbound", "outbound", "sample", "return", "transfer", "repair", "adjust"] as const).map((type) => {
              const active = historyType === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setHistoryType(type)
                    setMovementsPage(1)
                  }}
                  className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                    active
                      ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                      : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                  }`}
                >
                  {type === "all" ? "전체" : type === "sample" ? "샘플" : MOVEMENT_LABEL[type]}
                </button>
              )
            })}
            <span className="ml-auto inline-flex items-center gap-1.5">
              {(["desc", "asc"] as const).map((order) => {
                const active = historySort === order
                return (
                  <button
                    key={order}
                    type="button"
                    onClick={() => {
                      setHistorySort(order)
                      setMovementsPage(1)
                    }}
                    className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                      active
                        ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                        : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                    }`}
                  >
                    {order === "desc" ? "최신순" : "오래된순"}
                  </button>
                )
              })}
            </span>
          </div>
          {filtersExpanded && (
          <>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="w-12 shrink-0 text-[12px] font-bold text-[#111110]">상태</span>
            {(
              [
                { key: "all", label: "전체" },
                { key: "done", label: "완료" },
                { key: "planned", label: "배송 예정" },
              ] as const
            ).map((option) => {
              const active = historyStatus === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setHistoryStatus(option.key)
                    setMovementsPage(1)
                  }}
                  className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                    active
                      ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                      : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => {
                setIncludeVoided((current) => !current)
                setMovementsPage(1)
              }}
              aria-pressed={includeVoided}
              className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                includeVoided
                  ? "border-[#B43E3E] bg-[#FCE9E9] text-[#B43E3E]"
                  : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
              }`}
            >
              취소 포함
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="w-12 shrink-0 text-[12px] font-bold text-[#111110]">판매유형</span>
            <button
              type="button"
              onClick={() => {
                setSaleTypeFilter("")
                setMovementsPage(1)
              }}
              className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                saleTypeFilter === ""
                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                  : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
              }`}
            >
              전체
            </button>
            {(Object.keys(SALE_TYPE_META) as OutboundSaleType[]).map((type) => {
              const active = saleTypeFilter === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSaleTypeFilter(active ? "" : type)
                    setMovementsPage(1)
                  }}
                  className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                    active
                      ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                      : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                  }`}
                >
                  {SALE_TYPE_META[type].label}
                </button>
              )
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="w-12 shrink-0 text-[12px] font-bold text-[#111110]">기간</span>
            {(
              [
                { key: "thisMonth", label: "이번 달" },
                { key: "lastMonth", label: "지난 달" },
                { key: "last30", label: "최근 30일" },
              ] as const
            ).map((option) => {
              const range = historyDateRange(option.key)
              const active = historyDateFrom === range.from && historyDateTo === range.to
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setHistoryDateFrom(range.from)
                    setHistoryDateTo(range.to)
                    setMovementsPage(1)
                  }}
                  className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                    active
                      ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                      : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => {
                setHistoryDateFrom("")
                setHistoryDateTo("")
                setMovementsPage(1)
              }}
              className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                historyDateFrom === "" && historyDateTo === ""
                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                  : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
              }`}
            >
              전체
            </button>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#615D59]">
              시작
              <input
                type="date"
                value={historyDateFrom}
                max={historyDateTo || undefined}
                onChange={(event) => {
                  setHistoryDateFrom(event.target.value)
                  setMovementsPage(1)
                }}
                aria-label="기간 시작일"
                className="h-8 rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-[11px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#615D59]">
              종료
              <input
                type="date"
                value={historyDateTo}
                min={historyDateFrom || undefined}
                onChange={(event) => {
                  setHistoryDateTo(event.target.value)
                  setMovementsPage(1)
                }}
                aria-label="기간 종료일"
                className="h-8 rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-[11px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
              />
            </label>
          </div>
          {(data?.stock ?? []).length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="w-12 shrink-0 text-[12px] font-bold text-[#111110]">제품</span>
              <button
                type="button"
                onClick={() => {
                  setProductFilter("")
                  setMovementsPage(1)
                }}
                className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                  productFilter === ""
                    ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                    : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                }`}
              >
                전체
              </button>
              {PRODUCT_FILTER_OPTIONS.map((option) => {
                const active = productFilter === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setProductFilter(active ? "" : option.key)
                      setMovementsPage(1)
                    }}
                    className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                      active
                        ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                        : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          ) : null}
          {historyLots.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-[12px] font-bold text-[#111110]">물류No</span>
              <button
                type="button"
                onClick={() => {
                  setLotFilter("")
                  setMovementsPage(1)
                }}
                className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                  lotFilter === ""
                    ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                    : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                }`}
              >
                전체
              </button>
              {historyLots.map((lot) => {
                const active = lotFilter === lot
                return (
                  <button
                    key={lot}
                    type="button"
                    onClick={() => {
                      setLotFilter(active ? "" : lot)
                      setMovementsPage(1)
                    }}
                    className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100 ${
                      active
                        ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                        : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                    }`}
                  >
                    {formatLotLabel(lot) ?? lot}
                  </button>
                )
              })}
            </div>
          ) : null}
          {historyCustomers.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="w-12 shrink-0 text-[12px] font-bold text-[#111110]">고객사</span>
              <div className="relative">
                <select
                  value={customerFilter}
                  onChange={(event) => {
                    setCustomerFilter(event.target.value)
                    setMovementsPage(1)
                  }}
                  aria-label="고객사 필터"
                  className={`h-8 w-full min-w-[180px] max-w-[240px] cursor-pointer appearance-none rounded-full border pl-3 pr-8 text-[11px] font-bold outline-none transition focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 ${
                    customerFilter ? "border-[#084734] bg-[#ECFDF5] text-[#084734]" : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E]"
                  }`}
                >
                  <option value="">전체 고객사 ({formatNumber(historyCustomers.length)})</option>
                  {historyCustomers.map((customer) => (
                    <option key={customer} value={customer}>
                      {customer}
                    </option>
                  ))}
                </select>
                <ChevronDown className={`pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${customerFilter ? "text-[#084734]" : "text-[#615D59]"}`} />
              </div>
              {customerFilter ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCustomerDetail(customerFilter)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#d6f7e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100"
                  >
                    <Users className="h-3 w-3" />
                    거래이력
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerFilter("")
                      setMovementsPage(1)
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/45 active:scale-95 motion-reduce:active:scale-100"
                  >
                    <X className="h-3 w-3" />
                    해제
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          </>
          )}
        </section>

        {/* 감사(2026-09-07 #7) — 기본 응답 2000건 캡 너머는 이 배너가 없으면 화면에서 아예 닿을
            방법이 없었다. 필터·검색은 이미 불러온 movements 안에서만 동작하므로, 오래된 이력을
            찾고 있다면 먼저 이 배너로 더 불러와야 한다는 점을 분명히 안내한다. */}
        {hasMoreHistory && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <p className="text-[11.5px] font-semibold text-[#615D59]">
              최근 {formatNumber(movementsLoaded)}건만 불러왔습니다 · 전체 {formatNumber(movementsTotal)}건 — 검색·필터는 불러온 범위 안에서만 적용됩니다.
            </p>
            <button
              type="button"
              onClick={() => void loadMoreHistory()}
              disabled={loadingMoreHistory}
              className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#084734] bg-white px-3 text-[11.5px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMoreHistory ? "불러오는 중…" : "이전 이력 더 불러오기"}
            </button>
          </div>
        )}
        {loadMoreHistoryError && (
          <p className="text-[11.5px] font-semibold text-[#B43E3E]">{loadMoreHistoryError}</p>
        )}

        <HistoryLogSection
          filteredMovements={filteredMovements}
          logGroups={logGroups}
          pageLogGroupKeys={pageLogGroupKeys}
          toggleAllPageLogGroups={toggleAllPageLogGroups}
          allPageGroupsExpanded={allPageGroupsExpanded}
          logGroupsPagination={logGroupsPagination}
          expandedLogGroups={expandedLogGroups}
          setDetailId={setDetailId}
          toggleLogGroup={toggleLogGroup}
          renderMovementRow={renderMovementRow}
          setMovementsPage={setMovementsPage}
          hasActiveFilter={hasHistoryFilter}
          onResetFilters={resetHistoryFilters}
        />
    </motion.div>
  )
}
