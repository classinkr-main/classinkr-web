import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { BriefingCard } from "@/components/admin/campaigns/perf/BriefingCard"
import { ChannelMixCard } from "@/components/admin/campaigns/perf/ChannelMixCard"
import { FunnelCard } from "@/components/admin/campaigns/perf/FunnelCard"
import { KpiStrip } from "@/components/admin/campaigns/perf/KpiStrip"
import { CampaignScoreboard } from "@/components/admin/campaigns/perf/CampaignScoreboard"
import type { MarketingPerfResponse, PerfScoreboardRow } from "@/lib/marketing/perf"

// 한눈에 층 밴드들의 정적 렌더 스모크 — 값·정직 표기(—/미측정)·링크 착지가 마크업에 있는지만 본다.
// 데이터 조회 훅은 SummaryTab 이 소유하므로 여기서는 순수 표시 컴포넌트만 렌더한다.

const period: MarketingPerfResponse["period"] = {
  key: "30d",
  since: "2026-08-16",
  until: "2026-09-14",
  prevSince: "2026-07-17",
  prevUntil: "2026-08-15",
  prevBasis: "trailing",
}

const kpis: MarketingPerfResponse["kpis"] = {
  spendUsd: { value: 4860, previous: 4585, deltaPct: 6, currency: "USD" },
  leads: { value: 187, previous: 167, deltaPct: 12 },
  adLeads: { value: 112, previous: 100, deltaPct: 12 },
  cplUsd: { value: 43.39, previous: 45.7, deltaPct: -5, currency: "USD" },
  leadConversionRate: { value: 8.9, previous: 7.7, deltaPct: 15 },
  budgetExecutionPct: { value: null, previous: null, deltaPct: null, currency: "KRW" },
}

const funnel: MarketingPerfResponse["funnel"] = {
  impressions: 412300,
  clicks: 6810,
  adLeads: 112,
  contacted: 89,
  convertedLeads: 10,
}

function scoreboardRow(overrides: Partial<PerfScoreboardRow>): PerfScoreboardRow {
  return {
    campaignId: "c1",
    name: "SW 온라인 프로덕트",
    status: "active",
    pacing: { elapsedPct: 58, executionPct: 61 },
    pacingCurrency: "USD",
    leads: 64,
    spendUsd: 2444.8,
    cpl: 38.2,
    sparkline: [],
    latestUpdate: null,
    anomalies: [],
    ...overrides,
  }
}

describe("BriefingCard (판정 밴드)", () => {
  it("상태 점 문장·헤드라인·액션 3개·스냅샷 줄을 함께 그린다", () => {
    const html = renderToStaticMarkup(
      <BriefingCard
        headline="리드 187건, 이전 30일 대비 +12%"
        items={["광고 리드 전환율 8.9%"]}
        actions={[
          { title: "소재 교체 검토", why: "7일 CTR 1.1% < 30일 1.9%" },
          { title: "미컨택 광고 리드 23건 연락" },
          { title: "업데이트 기록 남기기" },
          { title: "네 번째는 잘린다" },
        ]}
        badges={["최근 30일", "CTR 급락"]}
        meta="AI 브리핑 · 09.14 09:20 생성"
        status="caution"
        statusLine="주의 · 이상 신호 1건"
        snapshotLine="스냅샷 09.14 06:10 · Meta 09.13까지"
      />
    )
    expect(html).toContain("주의 · 이상 신호 1건")
    expect(html).toContain("리드 187건, 이전 30일 대비 +12%")
    expect(html).toContain("소재 교체 검토")
    expect(html).toContain("업데이트 기록 남기기")
    expect(html).not.toContain("네 번째는 잘린다")
    expect(html).toContain("스냅샷 09.14 06:10")
    // AI 출처면 그린 아웃라인으로 승격된다.
    expect(html).toContain("border-[#BDEFD8]")
  })

  it("규칙 기반이면 승격하지 않고 출처를 밝힌다", () => {
    const html = renderToStaticMarkup(
      <BriefingCard headline="집계 없음" items={[]} actions={[]} badges={["규칙 기반"]} status="unmeasured" statusLine="미측정 · 소스 연결 확인" />
    )
    expect(html).toContain("규칙 기반 요약")
    expect(html).toContain("미측정 · 소스 연결 확인")
    expect(html).not.toContain("border-[#BDEFD8] shadow")
  })
})

describe("KpiStrip (히어로 4칸)", () => {
  it("4칸 값과 분모·분자 문구를 그리고, 예산 집행률 타일은 없다", () => {
    const html = renderToStaticMarkup(
      <KpiStrip
        kpis={kpis}
        daily={[{ date: "2026-09-13", spend: 180.5, leads: 4 }]}
        leadDailyBySource={[{ date: "2026-09-13", meta: 3, homepage: 1 }]}
        period={period}
        funnel={funnel}
      />
    )
    expect(html).toContain("187")
    expect(html).toContain("$4,860")
    expect(html).toContain("$43.39")
    expect(html).toContain("8.9")
    expect(html).toContain("광고비 ÷ 광고 리드 112")
    expect(html).toContain("광고 리드 112 중 전환 10")
    expect(html).not.toContain("예산 집행률")
    // 소스 분해 범례 — 접힌 그룹 없이 두 소스만.
    expect(html).toContain("메타 3")
    expect(html).toContain("홈페이지 1")
    // 히어로 값은 44px, 등폭 숫자 없음.
    expect(html).toContain("text-[44px]")
  })

  it("미측정은 — 로 표기하고 0 을 지어내지 않는다", () => {
    const html = renderToStaticMarkup(
      <KpiStrip
        kpis={{
          spendUsd: { value: null, previous: null, deltaPct: null, currency: "USD" },
          leads: { value: null, previous: null, deltaPct: null },
          adLeads: { value: null, previous: null, deltaPct: null },
          cplUsd: { value: null, previous: null, deltaPct: null, currency: "USD" },
          leadConversionRate: { value: null, previous: null, deltaPct: null },
          budgetExecutionPct: { value: null, previous: null, deltaPct: null, currency: "KRW" },
        }}
        daily={[]}
        leadDailyBySource={[]}
        period={period}
        funnel={{ impressions: 0, clicks: 0, adLeads: 0, contacted: 0, convertedLeads: 0 }}
      />
    )
    expect(html).toContain("광고 리드 미측정")
    expect((html.match(/>—</g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})

describe("FunnelCard layout=horizontal", () => {
  it("5단 값과 단계 사이 전환율을 그린다", () => {
    const html = renderToStaticMarkup(<FunnelCard funnel={funnel} metaMeasured layout="horizontal" />)
    for (const label of ["노출", "클릭", "리드", "컨택", "전환"]) expect(html).toContain(label)
    expect(html).toContain("412,300")
    expect(html).toContain("1.7%") // 클릭 ÷ 노출
    expect(html).toContain("79.5%") // 컨택 ÷ 리드
    expect(html).not.toContain("전원 미컨택")
  })

  it("광고 리드가 있는데 컨택 0 이면 그 구간만 경고한다", () => {
    const html = renderToStaticMarkup(
      <FunnelCard funnel={{ ...funnel, contacted: 0, convertedLeads: 0 }} metaMeasured={false} layout="horizontal" />
    )
    expect(html).toContain("전원 미컨택")
    expect(html).toContain("Meta 스냅샷 미수집")
  })
})

describe("CampaignScoreboard compact", () => {
  it("활성 상위 limit 행만 그리고 전체 링크와 휴면 수를 말한다", () => {
    const rows = [
      scoreboardRow({ campaignId: "a", name: "A 캠페인", leads: 64 }),
      scoreboardRow({ campaignId: "b", name: "B 캠페인", leads: 31, anomalies: ["ctr_drop"] }),
      scoreboardRow({ campaignId: "c", name: "C 캠페인", leads: 17 }),
      scoreboardRow({ campaignId: "d", name: "D 캠페인", leads: 3 }),
      scoreboardRow({ campaignId: "e", name: "E 휴면", status: "paused", leads: 0 }),
    ]
    const html = renderToStaticMarkup(
      <CampaignScoreboard rows={rows} compact limit={3} moreHref="/admin/campaigns?tab=detail#campaigns" />
    )
    expect(html).toContain("캠페인 Top 3")
    expect(html).toContain("A 캠페인")
    expect(html).toContain("C 캠페인")
    expect(html).not.toContain("D 캠페인")
    expect(html).not.toContain("E 휴면")
    expect(html).toContain("전체 5개 스코어보드")
    expect(html).toContain("진행 4 · 휴면 1")
    expect(html).toContain("CTR 급락")
  })
})

describe("ChannelMixCard", () => {
  it("KRW 배정·집행과 Meta USD 를 분리해 표기하고 미입력은 — 다", () => {
    const html = renderToStaticMarkup(
      <ChannelMixCard
        channelMix={[
          { channel: "meta", budget: 3000000, spendKrw: null, metaSpendUsd: 4860 },
          { channel: "naver", budget: 1000000, spendKrw: 400000, metaSpendUsd: null },
        ]}
        budgetExecution={{ value: 40, previous: null, deltaPct: null, currency: "KRW" }}
        editHref="/admin/campaigns?tab=data#budgets"
      />
    )
    expect(html).toContain("USD 4,860")
    expect(html).toContain("40%")
    expect(html).toContain("배정·집행 입력 → 데이터")
    expect(html).toContain("tab=data#budgets")
  })
})
