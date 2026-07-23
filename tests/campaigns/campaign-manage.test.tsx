import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  CampaignManageEmpty,
  CampaignRow,
  CampaignStatusChip,
  formatCampaignPeriod,
} from "@/components/admin/campaigns/manage/CampaignRow"
import type { CampaignLink, CampaignWithLinks } from "@/lib/types/marketing-campaign"

function makeLink(overrides: Partial<CampaignLink> = {}): CampaignLink {
  return {
    id: "lnk-1",
    campaignId: "cmp-1",
    refType: "email_campaign",
    refId: "ec-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

function makeCampaign(overrides: Partial<CampaignWithLinks> = {}): CampaignWithLinks {
  return {
    id: "cmp-1",
    name: "2026 여름 신규반 모집",
    objective: "여름 방학 신규반 리드 확보",
    status: "active",
    channels: ["email", "kakao"],
    startsAt: "2026-07-01",
    endsAt: "2026-08-31",
    budget: 3_000_000,
    owner: "Minjae",
    projectId: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    links: [makeLink(), makeLink({ id: "lnk-2", refType: "event", refId: "evt-1" })],
    ...overrides,
  }
}

describe("CampaignRow", () => {
  it("renders name, active status label, channel labels, and link count", () => {
    const html = renderToStaticMarkup(<CampaignRow campaign={makeCampaign()} />)
    expect(html).toContain("2026 여름 신규반 모집")
    expect(html).toContain("진행") // CAMPAIGN_STATUS_LABEL.active
    expect(html).toContain("이메일") // channelLabel("email")
    expect(html).toContain("카카오") // channelLabel("kakao")
    expect(html).toContain("연결 2") // links.length
  })

  it("shows budget and period, and falls back gracefully when both are missing", () => {
    const withValues = renderToStaticMarkup(<CampaignRow campaign={makeCampaign()} />)
    expect(withValues).toContain("2026.07.01 ~ 2026.08.31")
    expect(withValues).toContain("₩3,000,000")

    const bare = renderToStaticMarkup(
      <CampaignRow campaign={makeCampaign({ budget: null, startsAt: null, endsAt: null })} />,
    )
    expect(bare).toContain("예산 미정")
    expect(bare).toContain("기간 미정")
  })
})

describe("CampaignStatusChip", () => {
  it("labels each status with its Korean label", () => {
    expect(renderToStaticMarkup(<CampaignStatusChip status="planned" />)).toContain("계획")
    expect(renderToStaticMarkup(<CampaignStatusChip status="paused" />)).toContain("일시중지")
    expect(renderToStaticMarkup(<CampaignStatusChip status="done" />)).toContain("완료")
  })
})

describe("formatCampaignPeriod", () => {
  it("handles open-ended and empty ranges", () => {
    expect(formatCampaignPeriod("2026-07-01", null)).toBe("2026.07.01 ~")
    expect(formatCampaignPeriod(null, "2026-08-31")).toBe("~ 2026.08.31")
    expect(formatCampaignPeriod(null, null)).toBe("기간 미정")
  })
})

describe("CampaignManageEmpty", () => {
  it("renders the empty-state copy", () => {
    const html = renderToStaticMarkup(<CampaignManageEmpty />)
    expect(html).toContain("아직 캠페인이 없습니다")
    expect(html).toContain("새 캠페인으로 시작하세요")
  })
})
