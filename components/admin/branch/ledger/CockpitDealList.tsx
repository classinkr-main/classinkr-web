"use client"

// 콕핏 입력 마스터-리스트(렌즈 "cockpit") — Cockpit-1c 시안 이식.
// 좌: "내 딜" 목록(선택월 금액·확도 톤), 우: 기존 빠른 입력 레일(railView="input")이 편집기.
// 딜을 누르면 부모가 loadDealDetail로 draftForm을 채우고 레일을 입력 모드로 연다 — 편집/저장
// 경로는 전부 기존 draft/apply(InputRailSection)를 재사용하고 여기서 새로 만들지 않는다.
// 금액·확도 산식은 매트릭스·보드와 동일한 shared 헬퍼(rowMonth*)만 쓴다(별도 집계 금지).

import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, Search, UserRound } from "lucide-react"
import { CONFIDENCE_TOKENS, type ConfidenceKey } from "@/lib/branch/confidence-tokens"
import { branchMemberSearchHaystack } from "@/lib/branch/member-names"
import {
  formatMonthLabel,
  formatMoney,
  productCategoryMeta,
  rowMonthAmount,
  rowMonthConfirmed,
  rowMonthHighConfidence,
  rowProductCategory,
  type LedgerRevenueRow,
} from "./shared"

// 행 단위 확도 톤 — ForecastBoard.cardConfidence와 동일 규약(전액 확정=확정, 고확도 보유=고확도,
// 나머지=예정). 부분 확정은 톤을 올리지 않는다(셀 합산 인플레 착시 방지).
function rowConfidenceTone(amount: number, confirmed: number, high: number): ConfidenceKey {
  if (amount <= 0) return "expected"
  if (confirmed >= amount - 1) return "confirmed"
  if (high > 0) return "high-confidence"
  return "expected"
}

// M10 확도 퀵필터 순서 — DESIGN.md 확도 3단은 항상 예정→고확도→확정 순으로 함께 읽힌다.
const CONFIDENCE_FILTER_ORDER: ConfidenceKey[] = ["expected", "high-confidence", "confirmed"]
// M10 상품 퀵필터 — rowProductCategory는 software|hardware|unknown을 반환하고, unknown은 SW로 취급한다.
type ProductFilterKey = "software" | "hardware"
const PRODUCT_FILTER_ORDER: ProductFilterKey[] = ["software", "hardware"]

interface CockpitDealListProps {
  rows: LedgerRevenueRow[]
  selectedMonth: string
  // M2: 콕핏 로컬 월 컨트롤 — 전역 셀렉터가 헤더의 period==="M"에서만 보여 콕핏에선 월 이동이 막힌다.
  // fiscal 12개월(monthOptions)과 setSelectedMonth를 받아 리스트 자체에서 전월/익월을 밟는다.
  monthOptions: Array<{ value: string; label: string }>
  onSelectMonth: (month: string) => void
  // M3: 체크 큐 진입로 — 콕핏은 플로팅 레일·FAB를 숨겨 대기 초안이 안 보인다. N=대기 초안 수,
  // onOpenQueue는 부모가 railView="queue"+패널 열기를 수행한다(새 경로 없이 기존 큐 재사용).
  openDraftCount: number
  onOpenQueue: () => void
  selectedRowId: string | null
  onSelectDeal: (row: LedgerRevenueRow) => void
  onNewDeal: () => void
}

export function CockpitDealList({
  rows,
  selectedMonth,
  monthOptions,
  onSelectMonth,
  openDraftCount,
  onOpenQueue,
  selectedRowId,
  onSelectDeal,
  onNewDeal,
}: CockpitDealListProps) {
  // 리스트 로컬 검색 — 부모의 전역 필터(managerFilter '내 딜' 프리셋 포함, filteredRows)를 건드리지
  // 않고 이 화면 안에서만 좁힌다(다른 렌즈·URL 필터와 커플링 금지).
  const [term, setTerm] = useState("")
  // M10 로컬 퀵필터 — 확도(다중)·상품(다중). 전역 filteredRows는 그대로, 콕핏 안에서만 좁힌다.
  const [confidenceFilters, setConfidenceFilters] = useState<Set<ConfidenceKey>>(() => new Set())
  const [productFilters, setProductFilters] = useState<Set<ProductFilterKey>>(() => new Set())

  // M10(b) 화살표 롤빙 — 리스트 항목 간 ↑/↓ 이동(Enter 선택은 button 기본 동작).
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  // M2 월 스테퍼 경계 — fiscal 12개월 안에서만 이동(REV 스테퍼와 동일하게 FY에 가둔다).
  const monthValues = useMemo(() => monthOptions.map((option) => option.value), [monthOptions])
  const monthIndex = monthValues.indexOf(selectedMonth)
  const prevMonthDisabled = monthIndex === 0
  const nextMonthDisabled = monthIndex === monthValues.length - 1
  const stepMonth = (delta: -1 | 1) => {
    if (monthValues.length === 0) return
    // FY 밖 값(URL 주입 등)이면 경계로 스냅한다 — 갇혀서 못 움직이는 상태를 만들지 않는다.
    if (monthIndex < 0) {
      onSelectMonth(delta < 0 ? monthValues[0] : monthValues[monthValues.length - 1])
      return
    }
    const next = Math.min(Math.max(monthIndex + delta, 0), monthValues.length - 1)
    onSelectMonth(monthValues[next])
  }

  const toggleConfidence = (key: ConfidenceKey) => {
    setConfidenceFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const toggleProduct = (key: ProductFilterKey) => {
    setProductFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const items = useMemo(() => {
    const query = term.trim().toLowerCase()
    return rows
      .map((row) => {
        const amount = rowMonthAmount(row, selectedMonth)
        const category = rowProductCategory(row)
        return {
          row,
          amount,
          tone: rowConfidenceTone(amount, rowMonthConfirmed(row, selectedMonth), rowMonthHighConfidence(row, selectedMonth)),
          category,
          product: productCategoryMeta(category),
        }
      })
      .filter(({ row, tone, category }) => {
        // 매니저는 한글/영문 교차 검색 — "Wangchan"·"이왕찬"·"왕찬" 모두 이왕찬 딜을 찾는다(branchMemberSearchHaystack).
        if (query && !(row.customer.toLowerCase().includes(query) || branchMemberSearchHaystack(row.manager).includes(query))) {
          return false
        }
        if (confidenceFilters.size > 0 && !confidenceFilters.has(tone)) return false
        // unknown(과거 저장 데이터)은 SW로 분류된다 — productCategoryMeta와 동일 규약.
        if (productFilters.size > 0 && !productFilters.has(category === "unknown" ? "software" : category)) return false
        return true
      })
      // 선택월 금액 있는 행 먼저(내림차순), 동액은 이름순.
      .sort((a, b) => b.amount - a.amount || a.row.customer.localeCompare(b.row.customer, "ko"))
  }, [rows, selectedMonth, term, confidenceFilters, productFilters])

  const monthTotal = useMemo(() => items.reduce((sum, item) => sum + item.amount, 0), [items])
  const filtersActive = term.trim() !== "" || confidenceFilters.size > 0 || productFilters.size > 0

  const handleItemKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === "ArrowDown") nextIndex = Math.min(index + 1, items.length - 1)
    else if (event.key === "ArrowUp") nextIndex = Math.max(index - 1, 0)
    else if (event.key === "Home") nextIndex = 0
    else if (event.key === "End") nextIndex = items.length - 1
    if (nextIndex == null) return
    event.preventDefault()
    itemRefs.current[nextIndex]?.focus()
  }

  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="border-b border-[rgba(0,0,0,0.08)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
              <UserRound className="h-4 w-4 text-[#084734]" />
              내 딜 · 콕핏 입력
              <span className="text-[11px] font-semibold text-[#615D59]">
                {filtersActive
                  ? `표시 ${items.length.toLocaleString("ko-KR")} / 전체 ${rows.length.toLocaleString("ko-KR")}`
                  : `${items.length.toLocaleString("ko-KR")}건`}
              </span>
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#615D59]">
              딜을 누르면 우측 빠른 입력에서 주차별 확도를 바로 남깁니다 — 담당자 필터가 곧 &lsquo;내 딜&rsquo;입니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewDeal}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
          >
            <Plus className="h-3.5 w-3.5" />
            새 딜
          </button>
        </div>

        {/* M2 로컬 월 컨트롤 + M3 체크 큐 진입로 — 콕핏에서 다음 달로 넘기고 대기 초안을 연다. */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              disabled={prevMonthDisabled}
              aria-label="이전 달"
              title="이전 달 (회계연도 안에서만 이동)"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#615D59] transition hover:bg-white hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[60px] px-1 text-center text-[12px] font-bold tabular-nums text-[#111110]">
              {formatMonthLabel(selectedMonth)}
            </span>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              disabled={nextMonthDisabled}
              aria-label="다음 달"
              title="다음 달 (회계연도 안에서만 이동)"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#615D59] transition hover:bg-white hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenQueue}
            disabled={openDraftCount === 0}
            aria-label={`체크 큐 ${openDraftCount}건 열기`}
            title={openDraftCount > 0 ? "대기 초안을 체크 큐에서 확인·적용" : "대기 중인 초안이 없습니다"}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
              openDraftCount > 0
                ? "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F] hover:bg-[#F7E6C6]"
                : "cursor-not-allowed border-[rgba(0,0,0,0.08)] bg-white text-[#A39E98]"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            체크 큐 {openDraftCount.toLocaleString("ko-KR")}건
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              // M10(b) 연장: 검색 후 ↓ 한 번으로 결과 목록 첫 항목에 포커스 — 이후는 기존 롤빙
              // (↑/↓/Home/End)과 Enter 선택이 이어진다. 마우스 없이 검색→선택이 한 흐름이 된다.
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" || items.length === 0) return
                event.preventDefault()
                itemRefs.current[0]?.focus()
              }}
              placeholder="고객·담당자 검색"
              aria-label="내 딜 검색"
              className="h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] pl-8 pr-3 text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
            />
          </label>
          <span className="shrink-0 rounded-md bg-[#FAFAF8] px-2.5 py-1.5 text-[11px] font-bold tabular-nums text-[#615D59]">
            합 <span className="text-[#111110]">{formatMoney(monthTotal)}</span>
          </span>
        </div>

        {/* M10(a) 파워 스캔 — 확도·상품 로컬 퀵필터(다중 토글). 확도 색은 CONFIDENCE_TOKENS SSOT를 재사용한다. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {CONFIDENCE_FILTER_ORDER.map((key) => {
            const token = CONFIDENCE_TOKENS[key]
            const active = confidenceFilters.has(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleConfidence(key)}
                aria-pressed={active}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#084734] ${
                  active ? token.chipClass : "border-[rgba(0,0,0,0.08)] bg-white text-[#A39E98] hover:text-[#615D59]"
                }`}
              >
                {token.label}
              </button>
            )
          })}
          <span className="mx-0.5 h-4 w-px bg-[rgba(0,0,0,0.08)]" aria-hidden />
          {PRODUCT_FILTER_ORDER.map((key) => {
            const meta = productCategoryMeta(key)
            const active = productFilters.has(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleProduct(key)}
                aria-pressed={active}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#084734] ${
                  active ? meta.className : "border-[rgba(0,0,0,0.08)] bg-white text-[#A39E98] hover:text-[#615D59]"
                }`}
              >
                {meta.shortLabel}
              </button>
            )
          })}
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setTerm("")
                setConfidenceFilters(new Set())
                setProductFilters(new Set())
              }}
              className="ml-auto text-[11px] font-bold text-[#084734] underline-offset-2 transition hover:underline"
            >
              필터 해제
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[70dvh] overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="m-2 rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] text-[#615D59]">
            조건에 맞는 딜이 없습니다 — 검색어·필터를 지우거나 담당자 필터를 풀어보세요.
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map(({ row, amount, tone, product }, index) => {
              const token = CONFIDENCE_TOKENS[tone]
              const selected = row.id === selectedRowId
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    ref={(node) => {
                      itemRefs.current[index] = node
                    }}
                    onClick={() => onSelectDeal(row)}
                    onKeyDown={(event) => handleItemKeyDown(event, index)}
                    aria-pressed={selected}
                    className={`w-full rounded-md border border-l-[3px] px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 ${
                      selected
                        ? "border-[#BDEFD8] border-l-[#084734] bg-[#ECFDF5]"
                        : "border-[rgba(0,0,0,0.08)] border-l-transparent bg-white hover:bg-[#FAFAF8]"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[13px] font-bold text-[#111110]">{row.customer || "(무제목)"}</span>
                      <span className="shrink-0 text-[12px] font-bold tabular-nums text-[#111110]">{formatMoney(amount)}</span>
                    </span>
                    <span className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-0.5 text-[10px] font-semibold text-[#615D59]">
                          {product.shortLabel}
                        </span>
                        {row.manager && (
                          <span className="truncate text-[10.5px] font-semibold text-[#A39E98]">{row.manager}</span>
                        )}
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${token.chipClass}`}>
                        {token.label}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="border-t border-[rgba(0,0,0,0.08)] px-4 py-2.5 text-[10.5px] font-semibold text-[#A39E98]">
        확도 톤은 매트릭스·보드와 동일 산식(확정=녹색·고확도=파랑·예정=앰버) · 선택 월 {formatMonthLabel(selectedMonth)} 기준
      </p>
    </section>
  )
}
