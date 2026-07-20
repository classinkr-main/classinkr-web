"use client"

// 콕핏 입력 마스터-리스트(렌즈 "cockpit") — Cockpit-1c 시안 이식.
// 좌: "내 딜" 목록(선택월 금액·확도 톤), 우: 기존 빠른 입력 레일(railView="input")이 편집기.
// 딜을 누르면 부모가 loadDealDetail로 draftForm을 채우고 레일을 입력 모드로 연다 — 편집/저장
// 경로는 전부 기존 draft/apply(InputRailSection)를 재사용하고 여기서 새로 만들지 않는다.
// 금액·확도 산식은 매트릭스·보드와 동일한 shared 헬퍼(rowMonth*)만 쓴다(별도 집계 금지).

import { useMemo, useState } from "react"
import { Plus, Search, UserRound } from "lucide-react"
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

interface CockpitDealListProps {
  rows: LedgerRevenueRow[]
  selectedMonth: string
  selectedRowId: string | null
  onSelectDeal: (row: LedgerRevenueRow) => void
  onNewDeal: () => void
}

export function CockpitDealList({ rows, selectedMonth, selectedRowId, onSelectDeal, onNewDeal }: CockpitDealListProps) {
  // 리스트 로컬 검색 — 부모의 전역 필터(managerFilter '내 딜' 프리셋 포함, filteredRows)를 건드리지
  // 않고 이 화면 안에서만 좁힌다(다른 렌즈·URL 필터와 커플링 금지).
  const [term, setTerm] = useState("")

  const items = useMemo(() => {
    const query = term.trim().toLowerCase()
    return rows
      .map((row) => {
        const amount = rowMonthAmount(row, selectedMonth)
        return {
          row,
          amount,
          tone: rowConfidenceTone(amount, rowMonthConfirmed(row, selectedMonth), rowMonthHighConfidence(row, selectedMonth)),
          product: productCategoryMeta(rowProductCategory(row)),
        }
      })
      // 매니저는 한글/영문 교차 검색 — "Wangchan"·"이왕찬"·"왕찬" 모두 이왕찬 딜을 찾는다(branchMemberSearchHaystack).
      .filter(({ row }) =>
        !query || row.customer.toLowerCase().includes(query) || branchMemberSearchHaystack(row.manager).includes(query),
      )
      // 선택월 금액 있는 행 먼저(내림차순), 동액은 이름순.
      .sort((a, b) => b.amount - a.amount || a.row.customer.localeCompare(b.row.customer, "ko"))
  }, [rows, selectedMonth, term])

  const monthTotal = useMemo(() => items.reduce((sum, item) => sum + item.amount, 0), [items])

  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="border-b border-[rgba(0,0,0,0.08)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
              <UserRound className="h-4 w-4 text-[#084734]" />
              내 딜 · 콕핏 입력
              <span className="text-[11px] font-semibold text-[#615D59]">
                {formatMonthLabel(selectedMonth)} · {items.length.toLocaleString("ko-KR")}건
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
        <div className="mt-3 flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="고객·담당자 검색"
              aria-label="내 딜 검색"
              className="h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] pl-8 pr-3 text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
            />
          </label>
          <span className="shrink-0 rounded-md bg-[#FAFAF8] px-2.5 py-1.5 text-[11px] font-bold tabular-nums text-[#615D59]">
            합 <span className="text-[#111110]">{formatMoney(monthTotal)}</span>
          </span>
        </div>
      </div>

      <div className="max-h-[70dvh] overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="m-2 rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] text-[#615D59]">
            조건에 맞는 딜이 없습니다 — 검색어를 지우거나 담당자 필터를 풀어보세요.
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map(({ row, amount, tone, product }) => {
              const token = CONFIDENCE_TOKENS[tone]
              const selected = row.id === selectedRowId
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onSelectDeal(row)}
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
