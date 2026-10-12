"use client"

import { useEffect, useRef } from "react"
import { Check } from "lucide-react"

import { adminAiStore, type AdminAiState } from "@/lib/admin-ai/store"
import type { AiBlock, AiMessage } from "@/lib/admin-ai/types"
import { ChoiceCardView, DenyCardView, ReadCardView } from "./cards/InfoCards"
import { OrderCard } from "./cards/OrderCard"
import { GalmaebotAvatar } from "./GalmaebotAvatar"

function Block({ block, state }: { block: AiBlock; state: AdminAiState }) {
  switch (block.kind) {
    case "text":
      return <p className="text-[13px] leading-[1.5] text-[#31302E]">{block.text}</p>
    case "steps":
      return (
        <ul className="flex flex-col gap-[5px] text-[12px]">
          {block.steps.map((step) => (
            <li
              key={step.label}
              className={`flex items-center gap-[7px] ${
                step.done ? "text-[#A39E98]" : "text-[#615D59]"
              }`}
            >
              {step.done ? (
                <Check className="h-3 w-3 shrink-0 text-[#084734]" aria-hidden="true" />
              ) : (
                <span
                  className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-[#E8E8E4] border-t-[#084734] motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {step.label}
              {step.done ? "" : " 중"}
            </li>
          ))}
        </ul>
      )
    case "order": {
      const order = state.orders[block.orderId]
      if (!order) return null
      return (
        <OrderCard
          order={order}
          now={state.now}
          onAction={(action) => adminAiStore.actOnOrder(order.id, action)}
        />
      )
    }
    case "read":
      return <ReadCardView card={block.card} />
    case "deny":
      return <DenyCardView card={block.card} />
    case "choice":
      return <ChoiceCardView card={block.card} />
  }
}

function Message({ message, state }: { message: AiMessage; state: AdminAiState }) {
  if (message.role === "user") {
    return (
      <div className="max-w-[92%] self-end rounded-[12px_12px_4px_12px] border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-[9px] text-[13px] leading-[1.5] text-[#084734]">
        {message.text}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[22px_minmax(0,1fr)] items-start gap-[9px]">
      <GalmaebotAvatar size={22} />
      <div className="flex min-w-0 flex-col gap-[9px]">
        {message.blocks.length === 0 && message.pending ? (
          <span className="text-[12px] text-[#A39E98]">생각하는 중…</span>
        ) : null}
        {message.blocks.map((block, index) => (
          <Block key={`${message.id}-${index}`} block={block} state={state} />
        ))}
      </div>
    </div>
  )
}

export function AdminAiConversation({
  state,
  className = "",
}: {
  state: AdminAiState
  className?: string
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const count = state.messages.length
  const last = state.messages[count - 1]
  const lastBlocks = last?.blocks.length ?? 0

  // 새 말풍선·새 카드가 붙을 때만 아래로 내린다. 매초 시계가 바뀔 때는 움직이지 않는다.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [count, lastBlocks])

  return (
    <div className={`flex flex-col gap-3 ${className}`} aria-live="polite">
      {state.messages.map((message) => (
        <Message key={message.id} message={message} state={state} />
      ))}
      <div ref={endRef} />
    </div>
  )
}
