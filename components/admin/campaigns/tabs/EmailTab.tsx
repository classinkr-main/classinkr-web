"use client"

import dynamic from "next/dynamic"
import { ChartSkeleton } from "@/components/admin/viz"
import type { MessagePrefill } from "@/lib/message-prefill"

// 이메일·SMS 허브(구 /admin/marketing)를 이메일 탭에 흡수 — 무거우므로 동적 로딩.
const MarketingHub = dynamic(
  () => import("@/components/admin/marketing/MarketingHub"),
  { ssr: false, loading: () => <ChartSkeleton className="h-[420px]" /> }
)

// "메시지" 탭 패널 — MarketingHub 마운트만 담당한다.
// 페이지 본체에서 next/dynamic으로 로드되므로, 이 파일(+MarketingHub 체인)은
// email 탭이 활성일 때만 클라이언트 번들에 내려온다.
export default function EmailTab({
  recipientPrefill,
  onRecipientPrefillConsumed,
}: {
  recipientPrefill: MessagePrefill | null
  onRecipientPrefillConsumed: () => void
}) {
  return (
    <div className="px-4 pt-6 sm:px-6 lg:px-9">
      <MarketingHub
        recipientPrefill={recipientPrefill}
        onRecipientPrefillConsumed={onRecipientPrefillConsumed}
      />
    </div>
  )
}
