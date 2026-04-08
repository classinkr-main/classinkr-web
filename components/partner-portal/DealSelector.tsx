"use client"

import Link from "next/link"
import type { DealListItem, DealStage } from "@/lib/partner-portal/types"

const STAGE_LABEL: Record<DealStage, string> = {
  contact: "컨택", quote: "견적", contract: "계약", confirmed: "확정",
  installation: "설치", payment: "수납", closed: "완료", cancelled: "취소",
}

const STAGE_DOT: Record<DealStage, string> = {
  contact: "bg-stone-400",
  quote: "bg-blue-500",
  contract: "bg-violet-500",
  confirmed: "bg-indigo-500",
  installation: "bg-orange-500",
  payment: "bg-emerald-500",
  closed: "bg-gray-400",
  cancelled: "bg-red-400",
}

interface Props {
  deals: DealListItem[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function DealSelector({ deals, selectedId, onSelect }: Props) {
  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#e0e0dc] bg-white px-5 py-10 text-center">
        <p className="text-sm font-medium text-[#1a1a1a]/50">진행 중인 거래가 없습니다</p>
        <p className="mt-1 text-xs text-[#1a1a1a]/35">고객을 추가하고 거래를 시작하세요.</p>
        <Link
          href="/partner/customers"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#084734] px-4 py-2 text-sm font-medium text-white hover:bg-[#065c41] transition-colors"
        >
          고객 관리로 이동
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-[#1a1a1a]/40 uppercase tracking-widest mb-1">거래 선택</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {deals.map((deal) => {
          const isActive = selectedId === deal.id
          return (
            <button
              key={deal.id}
              type="button"
              onClick={() => onSelect(deal.id)}
              className={`text-left rounded-xl border px-3.5 py-3 transition-all ${
                isActive
                  ? "border-[#1a1a1a] bg-[#1a1a1a] shadow-sm"
                  : "border-[#e8e8e4] bg-white hover:border-[#1a1a1a]/30 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-white/60" : STAGE_DOT[deal.current_stage]}`} />
                <span className={`text-[11px] font-medium ${isActive ? "text-white/60" : "text-[#1a1a1a]/40"}`}>
                  {STAGE_LABEL[deal.current_stage]}
                </span>
              </div>
              <p className={`text-sm font-medium leading-snug truncate ${isActive ? "text-white" : "text-[#1a1a1a]"}`}>
                {deal.title}
              </p>
              {deal.customer_name && (
                <p className={`text-xs mt-0.5 truncate ${isActive ? "text-white/50" : "text-[#1a1a1a]/40"}`}>
                  {deal.customer_name}
                </p>
              )}
              {deal.contracted_amount > 0 && (
                <p className={`text-xs mt-1.5 font-medium ${isActive ? "text-white/70" : "text-[#1a1a1a]/60"}`}>
                  {deal.contracted_amount.toLocaleString()}원
                  {deal.outstanding_amount > 0 && (
                    <span className={isActive ? " text-amber-300" : " text-amber-600"}>
                      {" · "}미수금 {deal.outstanding_amount.toLocaleString()}원
                    </span>
                  )}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
