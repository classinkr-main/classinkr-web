import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  buildCampaignRowMetrics,
  CampaignManageEmpty,
  CampaignRow,
  CampaignStatusChip,
  formatCampaignPeriod,
} from "@/components/admin/campaigns/manage/CampaignRow"
import type {
  CampaignLink,
  CampaignRollup,
  CampaignWithLinks,
} from "@/lib/types/marketing-campaign"

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

// API 가 목록에 함께 실어 보내는 읽기시점 롤업.
// eventLeads 는 v1 미집계 자리표시자(항상 0) — "리드 0" 이 아니다.
function makeRollup(overrides: Partial<CampaignRollup> = {}): CampaignRollup {
  return {
    emailRecipients: 1200,
    emailOpens: 340,
    smsRecipients: 800,
    eventLeads: 0,
    eventDeals: 5,
    eventRevenue: null,
    metaSpend: null,
    metaCurrency: null,
    metaLeads: 12,
    linkedCounts: { email: 1, sms: 1, event: 1, meta: 0 },
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

  it("성과 스트립을 행에서 바로 보여준다(상세를 열지 않아도 읽힌다)", () => {
    const html = renderToStaticMarkup(
      <CampaignRow campaign={makeCampaign({ rollup: makeRollup() })} />,
    )
    expect(html).toContain("수신") // emailRecipients + smsRecipients
    expect(html).toContain("2,000")
    expect(html).toContain("오픈")
    expect(html).toContain("28.3%") // 340 / 1200
  })

  it("연결이 없으면 0 의 나열 대신 조용한 '연결 없음'을 보여준다", () => {
    const empty = makeRollup({
      emailRecipients: 0,
      emailOpens: 0,
      smsRecipients: 0,
      eventDeals: 0,
      metaLeads: 0,
      linkedCounts: { email: 0, sms: 0, event: 0, meta: 0 },
    })
    const html = renderToStaticMarkup(
      <CampaignRow campaign={makeCampaign({ links: [], rollup: empty })} />,
    )
    expect(html).toContain("연결 없음")
    expect(html).not.toContain("수신")
    expect(html).not.toContain("오픈")
  })

  it("rollup 이 없으면(경량 모드) 지표를 지어내지 않는다", () => {
    const html = renderToStaticMarkup(<CampaignRow campaign={makeCampaign({ rollup: undefined })} />)
    expect(html).toContain("연결 없음")
    expect(html).not.toContain("수신")
  })

  it("행사 리드(v1 미집계 자리표시자)를 행에서 숫자로 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      // objective 를 비워 본문 텍스트의 "리드" 오탐을 없앤다(스트립만 본다).
      <CampaignRow campaign={makeCampaign({ objective: null, rollup: makeRollup({ eventLeads: 0 }) })} />,
    )
    expect(html).not.toContain("리드")
  })

  it("행사 매출 null 은 ₩0 이 아니라 '미입력'", () => {
    const html = renderToStaticMarkup(
      <CampaignRow
        campaign={makeCampaign({
          budget: null,
          // 매출만 남기려고 이메일·문자 링크를 비운다(스트립 상한 4 에 밀리지 않게).
          rollup: makeRollup({
            eventRevenue: null,
            linkedCounts: { email: 0, sms: 0, event: 1, meta: 0 },
          }),
        })}
      />,
    )
    expect(html).toContain("미입력")
    expect(html).not.toContain("₩0")
  })

  it("Meta 집행은 계정 통화로 표기하고 절대 ₩ 로 접지 않는다", () => {
    const html = renderToStaticMarkup(
      <CampaignRow
        campaign={makeCampaign({
          budget: null, // 예산이 ₩ 를 렌더하지 않도록 비운다(Meta 환산 여부만 본다).
          rollup: makeRollup({
            metaSpend: 1209,
            metaCurrency: "USD",
            linkedCounts: { email: 0, sms: 0, event: 0, meta: 1 },
          }),
        })}
      />,
    )
    expect(html).toContain("USD 1,209")
    expect(html).not.toContain("₩")
  })

  it("조작된 종합 합계·ROAS 를 행에 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      <CampaignRow
        campaign={makeCampaign({
          rollup: makeRollup({ eventRevenue: 5_000_000, metaSpend: 1000, metaCurrency: "USD" }),
        })}
      />,
    )
    expect(html).not.toContain("ROAS")
    expect(html).not.toContain("합계")
  })
})

describe("buildCampaignRowMetrics", () => {
  it("연결된 채널의 가용 지표만 만든다(연결 0 → 빈 목록)", () => {
    const none = buildCampaignRowMetrics(
      makeRollup({ linkedCounts: { email: 0, sms: 0, event: 0, meta: 0 } }),
    )
    expect(none).toEqual([])
  })

  it("오픈율은 분모(수신)가 0 이면 만들지 않는다(거짓 0% 금지)", () => {
    const metrics = buildCampaignRowMetrics(
      makeRollup({
        emailRecipients: 0,
        emailOpens: 0,
        smsRecipients: 500,
        linkedCounts: { email: 1, sms: 1, event: 0, meta: 0 },
      }),
    )
    expect(metrics.map((m) => m.label)).toEqual(["수신"])
  })

  it("Meta 통화 미해석(혼재)이면 0 이 아니라 '—'", () => {
    const metrics = buildCampaignRowMetrics(
      makeRollup({
        metaSpend: null,
        metaCurrency: null,
        linkedCounts: { email: 0, sms: 0, event: 0, meta: 2 },
      }),
    )
    expect(metrics).toEqual([{ label: "Meta", value: "—", quiet: true }])
  })

  it("행에 올리는 지표는 최대 4 개(우선순위 순)", () => {
    const metrics = buildCampaignRowMetrics(
      makeRollup({
        eventRevenue: 5_000_000,
        metaSpend: 1209,
        metaCurrency: "USD",
        linkedCounts: { email: 1, sms: 1, event: 1, meta: 1 },
      }),
    )
    expect(metrics).toHaveLength(4)
    expect(metrics.map((m) => m.label)).toEqual(["수신", "오픈", "Meta", "딜"])
  })
})

describe("CampaignStatusChip", () => {
  it("labels each status with its Korean label", () => {
    expect(renderToStaticMarkup(<CampaignStatusChip status="planned" />)).toContain("계획")
    expect(renderToStaticMarkup(<CampaignStatusChip status="paused" />)).toContain("일시중지")
    expect(renderToStaticMarkup(<CampaignStatusChip status="done" />)).toContain("완료")
  })
})

describe("상태 위계", () => {
  it("진행 행에는 그린 상태 레일이, 완료 행에는 레일이 없다", () => {
    const active = renderToStaticMarkup(<CampaignRow campaign={makeCampaign({ status: "active" })} />)
    const done = renderToStaticMarkup(<CampaignRow campaign={makeCampaign({ status: "done" })} />)
    expect(active).toContain("bg-[#084734]") // 레일 액센트
    expect(done).not.toContain("bg-[#084734]")
  })

  it("완료 행은 서피스·타이틀 대비를 낮춰 뒤로 물러난다", () => {
    const done = renderToStaticMarkup(<CampaignRow campaign={makeCampaign({ status: "done" })} />)
    expect(done).toContain("bg-[#FAFAF8]")
    expect(done).toContain("text-[#615D59]")
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
