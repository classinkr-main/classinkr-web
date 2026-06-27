import { renderToStaticMarkup } from "react-dom/server"

import { describe, expect, it } from "vitest"

import { IntegrationControlPanel } from "@/components/admin/settings/IntegrationControlPanel"
import type { AdminIntegrationStatusResponse } from "@/lib/admin-integrations/types"

const generatedAt = "2026-06-22T00:00:00.000Z"

const status: AdminIntegrationStatusResponse = {
  generatedAt,
  items: [
    {
      key: "supabase",
      label: "Supabase",
      category: "core",
      configured: true,
      source: "env",
      health: "ok",
      description: "관리자와 포털 저장소입니다.",
      requiredKeys: ["NEXT_PUBLIC_SUPABASE_URL"],
      lastCheckedAt: generatedAt,
      adminHref: "/admin/settings?tab=integrations",
    },
    {
      key: "lead_webhooks",
      label: "Lead Webhooks",
      category: "lead",
      configured: true,
      source: "mixed",
      health: "warning",
      description: "리드 전달 채널입니다.",
      requiredKeys: ["LEAD_WEBHOOK_URL"],
      lastCheckedAt: generatedAt,
      adminHref: "/admin/settings?tab=integrations",
    },
    {
      key: "channel_talk",
      label: "Channel Talk",
      category: "lead",
      configured: false,
      source: "not_configured",
      health: "unknown",
      description: "상담 연결입니다.",
      requiredKeys: ["CHANNEL_TALK_ACCESS"],
      lastCheckedAt: generatedAt,
      adminHref: "/admin/channel-talk",
    },
    {
      key: "toss_payments",
      label: "Toss",
      category: "billing",
      configured: true,
      source: "env",
      health: "ok",
      description: "결제 연결입니다.",
      requiredKeys: ["TOSS_SECRET_KEY"],
      lastCheckedAt: generatedAt,
      adminHref: "/admin/software-quote-codes",
    },
  ],
}

describe("admin settings integration organization", () => {
  it("summarizes connected services by operating area", () => {
    const html = renderToStaticMarkup(
      <IntegrationControlPanel
        active="status"
        onChange={() => undefined}
        status={status}
        loading={false}
        error={null}
        onRefresh={() => undefined}
      >
        <div>webhook settings</div>
      </IntegrationControlPanel>
    )

    expect(html).toContain("연결 현황 요약")
    expect(html).toContain("핵심 기반")
    expect(html).toContain("리드·상담")
    expect(html).toContain("결제·정산")
    expect(html).toContain("1/1 연결")
    expect(html).toContain("1/2 연결")
    expect(html).toContain("확인 1")
    expect(html).toContain("미설정 1")
  })
})
