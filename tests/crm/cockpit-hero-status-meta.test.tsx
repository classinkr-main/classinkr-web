import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import CrmCockpitHero from "@/components/admin/crm/home/CrmCockpitHero"
import type { AdminCrmOverview } from "@/components/admin/crm/home/shared"
import { STATUS_TONE_CLASS } from "@/lib/crm/status-tone"

// home-01 — 히어로가 overview 상태 메타(business.ok·neoCrm.ok·snapshot)를 읽어 부분 실패를
// '$0'·'¥0'이 아니라 '—'로, 기준 시각·출처·갱신 지연을 캡션으로 드러낸다.

function makeOverview(overrides: {
  businessOk?: boolean
  businessError?: string | null
  neoOk?: boolean
  neoError?: string | null
  snapshotSource?: "db_snapshot" | "live_query"
  stale?: boolean
} = {}): AdminCrmOverview {
  return {
    generatedAt: "2026-09-15T00:30:00.000Z",
    overallStatus: "ok",
    business: {
      ok: overrides.businessOk ?? true,
      warning: null,
      error: overrides.businessError ?? null,
      revenue: {
        deliveryTotalAmount: 12_500_000,
        contractedAmount: 3_000_000,
        paidAmount: 0,
        outstandingAmount: 800_000,
        expectedPipelineAmount: 0,
        acceptedQuoteAmount: 2_000_000,
      },
      kpis: {
        partnerAccountCount: 0,
        customerCount: 0,
        activeDealCount: 0,
        paymentRiskCount: 2,
        quoteDocumentCount: 0,
        recentActivityCount: 0,
      },
      customerLogs: { latestActivityAt: null, recent: [] },
      snapshot: {
        source: overrides.snapshotSource ?? "live_query",
        refreshedAt: "2026-09-15T00:00:00.000Z",
        stale: overrides.stale ?? false,
        maxAgeSeconds: 600,
      },
      upcomingThisWeek: { count: 0, items: [] },
      frequentCustomers: [],
    },
    schema: { ok: 1, blocked: 0, firstBlocked: null, firstAction: null },
    xiaoshouyi: { configured: true, authMode: "access_token", missingEnvGroups: [], objectCount: 0, pageSize: 0, maxPages: 0 },
    sourceLinks: { ok: true, total: 0, confirmed: 0, candidate: 0, rejected: 0, stale: 0, error: null },
    externalSnapshots: { ok: true, recordCount: 0, staleCount: 0, latestSyncedAt: null, latestRunStatus: null, latestRunObject: null, error: null },
    writeQueue: { ok: true, active: 0, draft: 0, approved: 0, sent: 0, failed: 0, succeeded: 0, cancelled: 0, error: null },
    neoCrm: {
      ok: overrides.neoOk ?? true,
      error: overrides.neoError ?? null,
      latestSyncedAt: null,
      kpis: {
        accountCount: 0,
        activeAccountCountMonth: 0,
        // 서버 폴백(ok:false)은 kpis 를 전부 0 으로 준다 — 이 값이 화면에 '$0'으로 새면 안 된다.
        salesAmountMonth: overrides.neoOk === false ? 0 : 9_800,
        salesCountMonth: 0,
        opportunityAmount: overrides.neoOk === false ? 0 : 4_200,
        opportunityCountMonth: overrides.neoOk === false ? 0 : 3,
        collectionAmountMonth: overrides.neoOk === false ? 0 : 5_100,
        collectionCountMonth: 0,
        collectionAmount30d: 0,
        collectionCount30d: 0,
      },
      recentOrders: [],
    },
  }
}

const noop = () => undefined

describe("CrmCockpitHero 상태 메타", () => {
  it("정상 응답은 값과 함께 기준 시각·실시간 출처 캡션을 그린다", () => {
    const html = renderToStaticMarkup(<CrmCockpitHero overview={makeOverview()} loading={false} error={null} onRetry={noop} />)
    expect(html).toContain("기준 ")
    expect(html).toContain("실시간")
    expect(html).not.toContain("스냅샷")
    expect(html).not.toContain("갱신 지연")
    expect(html).toContain("$4,200")
    expect(html).toContain("¥")
    expect(html).not.toContain("확인 불가")
    expect(html).not.toContain('role="alert"')
  })

  it("neoCrm.ok=false 면 오더·동기화 카드가 '$0'·'¥0' 대신 '—'가 되고 원인·재시도 배너가 붙는다", () => {
    const html = renderToStaticMarkup(
      <CrmCockpitHero
        overview={makeOverview({ neoOk: false, neoError: "팀 리포트 타임아웃" })}
        loading={false}
        error={null}
        onRetry={noop}
      />
    )
    expect(html).not.toContain("$0")
    expect(html).not.toContain("¥0")
    expect(html).toContain('data-metric-state="unavailable"')
    expect(html).toContain("팀 리포트 타임아웃")
    expect(html).toContain('role="alert"')
    expect(html).toContain(">다시 확인</button>")
    expect(html).toContain(STATUS_TONE_CLASS.danger)
    // 자체 집계 카드(₩)는 그대로 살아 있다.
    expect(html).toContain("1,250")
    expect(html).not.toContain("#B85C33")
  })

  it("business.ok=false 면 인식 매출·미수 카드가 '—'가 되고 위험 강조는 꺼진다", () => {
    const html = renderToStaticMarkup(
      <CrmCockpitHero
        overview={makeOverview({ businessOk: false, businessError: "스냅샷 RPC 실패" })}
        loading={false}
        error={null}
        onRetry={noop}
      />
    )
    expect(html).toContain("스냅샷 RPC 실패")
    expect(html).toContain('data-metric-state="unavailable"')
    // 실패로 0 이 된 paymentRiskCount 로 '2곳' 을 그리지 않는다.
    expect(html).not.toContain("2<span")
    // Neo 카드는 정상 값 유지.
    expect(html).toContain("$4,200")
  })

  it("db 스냅샷 + stale 이면 '스냅샷' 출처와 warning 톤 '갱신 지연' 칩 + 새로고침 버튼을 그린다", () => {
    const html = renderToStaticMarkup(
      <CrmCockpitHero
        overview={makeOverview({ snapshotSource: "db_snapshot", stale: true })}
        loading={false}
        error={null}
        onRetry={noop}
      />
    )
    expect(html).toContain("스냅샷")
    expect(html).toContain("갱신 지연")
    expect(html).toContain("새로고침")
    expect(html).toContain(STATUS_TONE_CLASS.warning)
    expect(html).toContain('data-tone="warning"')
  })

  it("전체 실패(overview 없음)는 danger 배너 + 재시도이며 0 을 그리지 않는다", () => {
    const html = renderToStaticMarkup(<CrmCockpitHero overview={null} loading={false} error="네트워크 오류" onRetry={noop} />)
    expect(html).toContain('role="alert"')
    expect(html).toContain("네트워크 오류")
    expect(html).toContain(">다시 확인</button>")
    expect(html).not.toContain("$0")
  })

  it("콜드 로드는 스켈레톤이며 캡션도 값도 0 이 아니다", () => {
    const html = renderToStaticMarkup(<CrmCockpitHero overview={null} loading error={null} onRetry={noop} />)
    expect(html).toContain("animate-pulse")
    expect(html).not.toContain("$0")
    expect(html).not.toContain("기준 -")
  })
})
