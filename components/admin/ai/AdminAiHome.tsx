"use client"

import { demoScenarioPrompt } from "@/lib/admin-ai/demo-scenarios"
import { riskName } from "@/lib/admin-ai/format"
import { adminAiStore } from "@/lib/admin-ai/store"
import { resolveAdminAiSuggestions } from "@/lib/admin-ai/suggestions"
import type { AdminAiPageContext, OrderRisk } from "@/lib/admin-ai/types"
import { GalmaebotAvatar } from "./GalmaebotAvatar"

const RISK_TEXT: Record<OrderRisk, string> = {
  R0: "text-[#A39E98]",
  R1: "text-[#084734]",
  R2: "text-[#A8741A]",
  R3: "text-[#B43E3E]",
  R4: "text-[#31302E]",
}

export function RiskTag({ risk, sensitive = false }: { risk: OrderRisk; sensitive?: boolean }) {
  return (
    <span className={`whitespace-nowrap text-[11px] font-semibold ${RISK_TEXT[risk]}`}>
      <b className="font-mono font-semibold">{risk}</b> {riskName(risk, sensitive)}
    </span>
  )
}

/** 첫 화면 — 인사, 확인 대기 알림, 화면별 추천(정적 목록). */
export function AdminAiHome({
  context,
  pendingCount,
  onShowPending,
}: {
  context: AdminAiPageContext
  pendingCount: number
  onShowPending: () => void
}) {
  const suggestions = resolveAdminAiSuggestions(context.path)

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col items-center gap-0.5 pb-0.5 pt-1.5 text-center">
        <GalmaebotAvatar variant="full" size={104} />
        <b className="mt-1.5 text-[16px] tracking-[-0.01em] text-[#111110]">무엇을 도와드릴까요?</b>
        <span className="text-[12px] text-[#615D59]">물어보거나, 할 일을 시켜 주세요.</span>
      </div>

      {pendingCount > 0 ? (
        <button
          type="button"
          onClick={onShowPending}
          className="flex items-center gap-2 rounded-lg border border-[#ECD29C] bg-white px-2.5 py-2 text-left text-[12px] text-[#7A520F] shadow-[inset_2px_0_0_#A8741A] hover:bg-[#FDFDFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
        >
          <b className="font-semibold">확인을 기다리는 오더 {pendingCount}건</b>
          <span className="ml-auto font-semibold text-[#615D59]">보기</span>
        </button>
      ) : null}

      <div className="flex flex-col overflow-hidden rounded-xl border border-[#E8E8E4]">
        <h5 className="border-b border-[#E8E8E4] bg-[#F6F5F4] px-3 py-2 text-[11px] font-semibold text-[#A39E98]">
          {context.label}에서 자주 하는 일
        </h5>
        {suggestions.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() =>
              adminAiStore.ask({
                text: demoScenarioPrompt(item.scenario),
                scenario: item.scenario,
                context,
              })
            }
            className="flex w-full items-center gap-2.5 border-b border-[#F0F0EC] px-3 py-2.5 text-left text-[13px] text-[#111110] last:border-b-0 hover:bg-[#FDFDFC] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#084734]"
          >
            <span>{item.label}</span>
            <span className="ml-auto">
              <RiskTag risk={item.risk} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
