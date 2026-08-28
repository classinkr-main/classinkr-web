"use client"

// 딜(Deal Lite) 섹션 + 빠른 추가 폼 — 폼 상태·mutation은 부모(드로어 본체)가 소유한다.
// Customer360Drawer.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { Briefcase, Plus } from "lucide-react"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmDealStage } from "@/lib/repositories/crm-deals"
import { DEAL_STAGE_LABEL, DEAL_STAGE_OPTIONS, formatAmount, formatDay, SectionTitle } from "./shared"

export default function DrawerDealsSection({
  data,
  actingId,
  dealFormOpen,
  onDealFormOpenChange,
  dealTitle,
  onDealTitleChange,
  dealAmount,
  onDealAmountChange,
  dealStage,
  onDealStageChange,
  onAddDeal,
  onDealStage,
}: {
  data: Customer360
  actingId: string | null
  dealFormOpen: boolean
  onDealFormOpenChange: (open: boolean) => void
  dealTitle: string
  onDealTitleChange: (value: string) => void
  dealAmount: string
  onDealAmountChange: (value: string) => void
  dealStage: CrmDealStage
  onDealStageChange: (value: CrmDealStage) => void
  onAddDeal: () => void
  onDealStage: (dealId: string, stage: CrmDealStage) => void
}) {
  return (
    <section id="c360-deal" className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <SectionTitle icon={<Briefcase className="h-3.5 w-3.5" />}>
        딜 {data.deals.summary.total > 0 ? `(${data.deals.summary.total})` : ""}
      </SectionTitle>
      <div className="mb-3 space-y-1.5">
        {data.deals.rows.length === 0 ? (
          <p className="text-[12px] text-[#1a1a1a]/40">진행 중인 딜이 없습니다.</p>
        ) : (
          data.deals.rows.map((deal) => (
            <div key={deal.id} className="rounded-xl bg-[#fafaf8] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[12px] font-semibold text-[#111110]">{deal.title}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    deal.status === "won"
                      ? "bg-[#ECFDF5] text-[#084734]"
                      : deal.status === "lost"
                        ? "bg-[#FEF3EE] text-[#B85C33]"
                        : "bg-white text-[#1a1a1a]/55"
                  }`}
                >
                  {DEAL_STAGE_LABEL[deal.stage]}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-[11px] text-[#1a1a1a]/45">
                  {deal.expectedAmount != null ? `${formatAmount(deal.expectedAmount)} · ` : ""}
                  {deal.expectedCloseAt ? `예상 ${formatDay(deal.expectedCloseAt)}` : "종료일 미정"}
                </p>
                {deal.status === "open" ? (
                  <select
                    value={deal.stage}
                    onChange={(event) => onDealStage(deal.id, event.target.value as CrmDealStage)}
                    disabled={actingId === `deal:${deal.id}`}
                    className="h-7 rounded-lg border border-[#e8e8e4] bg-white px-1.5 text-[11px] font-semibold text-[#111110] outline-none disabled:opacity-50"
                    aria-label="딜 단계"
                  >
                    {DEAL_STAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-[#f0f0ec] pt-3">
        {dealFormOpen ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={dealTitle}
              aria-label="새 딜 제목"
              onChange={(event) => onDealTitleChange(event.target.value)}
              placeholder="새 딜 제목"
              autoFocus
              className="h-9 min-w-[140px] flex-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
            />
            <input
              value={dealAmount}
              aria-label="새 딜 예상 금액"
              onChange={(event) => onDealAmountChange(event.target.value)}
              inputMode="numeric"
              placeholder="예상금액"
              className="h-9 w-24 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] text-[#111110] outline-none focus:border-[#111110]"
            />
            <select
              value={dealStage}
              aria-label="새 딜 단계"
              onChange={(event) => onDealStageChange(event.target.value as CrmDealStage)}
              className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
            >
              {DEAL_STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onAddDeal}
              disabled={!dealTitle.trim() || actingId === "deal"}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              딜 추가
            </button>
            <button
              type="button"
              onClick={() => onDealFormOpenChange(false)}
              className="inline-flex h-9 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2]"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onDealFormOpenChange(true)}
            aria-expanded={dealFormOpen}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-[#dcdcd6] px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:border-[#111110] hover:text-[#111110]"
          >
            <Plus className="h-3.5 w-3.5" />
            딜 추가
          </button>
        )}
      </div>
    </section>
  )
}
