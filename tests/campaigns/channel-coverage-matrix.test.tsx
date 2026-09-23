import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ChannelCoverageMatrix } from "@/components/admin/campaigns/perf/ChannelCoverageMatrix"
import type { PerfChannelLive } from "@/lib/marketing/perf"

/**
 * 커버리지 매트릭스 렌더. 테스트 환경에는 NEXT_PUBLIC_* 가 비어 있으므로
 * "전환 추적이 아무것도 설정되지 않은 배포" 시나리오가 그대로 재현된다 —
 * 그 상태에서 표가 빈칸을 정확히 세는지가 이 파일의 관심사다.
 */

const entry = (over: Partial<PerfChannelLive> = {}): PerfChannelLive => ({
  channel: "meta",
  spend: 100,
  currency: "USD",
  impressions: 0,
  clicks: 0,
  conversions: null,
  costPerConversion: null,
  campaignCount: 1,
  configured: true,
  dataThrough: "2026-09-13",
  syncedAt: null,
  previousSpend: null,
  deltaPct: null,
  ...over,
})

const render = (channels: PerfChannelLive[], defaultOpen = true) =>
  renderToStaticMarkup(<ChannelCoverageMatrix channels={channels} defaultOpen={defaultOpen} />)

describe("ChannelCoverageMatrix", () => {
  it("7개 채널 행을 전부 그린다 — 표에서 채널이 새지 않게", () => {
    const html = render([entry()])
    for (const label of ["Meta", "Google Ads", "네이버", "카카오", "YouTube", "오프라인", "기타"]) {
      expect(html).toContain(label)
    }
  })

  it("접힌 상태에서는 표를 그리지 않는다(기본값)", () => {
    const html = render([entry()], false)
    // 헤더 요약("집행 데이터 · 리드 귀속 · 전환 추적 N/M")은 접혀 있어도 보인다 —
    // 표 본문에만 있는 문구로 판정한다.
    expect(html).toContain("채널 커버리지")
    expect(html).toContain("빈칸")
    expect(html).not.toContain("리드애즈 웹훅")
    expect(html).not.toContain("해당 없음")
  })

  it("미연동 채널에 무엇을 채워야 하는지 적는다", () => {
    const html = render([entry(), entry({ channel: "naver", configured: false, spend: null, currency: null })])
    expect(html).toContain("NAVER_SEARCHAD_")
  })

  it("연동됐는데 스냅샷이 없으면 '크론 첫 실행 대기'", () => {
    const html = render([entry({ channel: "google", dataThrough: null })])
    expect(html).toContain("크론 첫 실행 대기")
  })

  it("고칠 수 있는 빈칸만 배지에 센다 — '해당 없음' 은 빠진다", () => {
    const html = render([entry()])
    expect(html).toContain("빈칸")
    // 오프라인·기타의 전환 추적은 na 라 '없음'(danger) 칩으로 그려지지 않는다.
    expect(html).toContain("해당 없음")
  })

  it("상태 칩에 채널 브랜드색을 쓰지 않는다 — 운영 상태 스케일만", () => {
    const html = render([entry({ channel: "naver", currency: "KRW" })])
    // 네이버 그린은 행 왼쪽 점 1곳에만.
    expect(html.split("#03C75A").length - 1).toBe(1)
    // 상태 칩은 DESIGN.md 운영 상태 스케일 토큰을 쓴다.
    expect(html).toContain("#ECFDF5")
  })
})
