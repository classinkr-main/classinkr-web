import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SalesCountTiles } from "@/components/admin/branch/sections/OverviewHeroCard"
import { heroRoadmapSegments, monthInOverviewPeriod, remainingHighConfidence } from "@/lib/branch/overview-hero"
import type { BranchSalesCounts } from "@/lib/branch/sales-counts-contract"

const counts = (patch: Partial<BranchSalesCounts> = {}): BranchSalesCounts => ({
  fy: 2026, fyLabel: "FY2026", month: "2026-11", scope: { team: "ALL", manager: null },
  customers: { fy: 202, fyConfirmed: 123, month: 46, allTime: 392 },
  boards: { state: "ready", fy: 74, month: 14, fyPlanned: 15, fyPromotion: 3, allTime: 392 },
  ...patch,
})
const state = (data: BranchSalesCounts | null, extra: { loading?: boolean; error?: string | null; stale?: boolean } = {}) =>
  ({ data, loading: false, error: null, stale: false, ...extra })

describe("개요 A 총 고객수 · 칠판 판매 대수 칸", () => {
  it("FY 누계를 크게, 전체 누적을 작게 병기한다", () => {
    const html = renderToStaticMarkup(<SalesCountTiles counts={state(counts())} />)
    expect(html).toContain("총 고객")
    expect(html).toContain("FY2026 누계")
    expect(html).toContain(">202<")
    expect(html).toContain("확정 123")
    expect(html).toContain("이번 달 46")
    expect(html).toContain("전체 392 누적")
    expect(html).toContain("칠판 판매")
    expect(html).toContain(">74<")
    expect(html).toContain("이번 달 14")
    expect(html).toContain("예정 15")
    expect(html).toContain("프로모션 3")
    expect(html).toContain("전체 누적 392")
    expect(html).toContain("전사")
  })

  it("전체 누적이 FY와 같아도 숨기지 않고 장부 기록 범위로 표기한다", () => {
    const html = renderToStaticMarkup(<SalesCountTiles counts={state(counts({ customers: { fy: 202, fyConfirmed: 123, month: 46, allTime: 202 } }))} />)
    expect(html).toContain("전체 202 (장부 기록 범위)")
  })

  it("칠판이 unavailable이면 0대로 위장하지 않고 안내 문구를 낸다", () => {
    const html = renderToStaticMarkup(<SalesCountTiles counts={state(counts({ boards: { state: "unavailable", fy: 0, month: 0, fyPlanned: 0, fyPromotion: 0, allTime: 0 } }))} />)
    expect(html).toContain("칠판 판매 대수를 불러오지 못했습니다")
    expect(html).not.toContain("칠판 판매</span>")
    expect(html).not.toContain(">0<")
    expect(html).toContain("총 고객")
  })

  it("로딩 중에는 스켈레톤, 실패하면 오류를 보이고 0을 만들지 않는다", () => {
    const loading = renderToStaticMarkup(<SalesCountTiles counts={state(null, { loading: true })} />)
    expect(loading).toContain("animate-pulse")
    expect(loading).toContain('aria-busy="true"')
    const failed = renderToStaticMarkup(<SalesCountTiles counts={state(null, { error: "HTTP 500" })} />)
    expect(failed).toContain('role="alert"')
    expect(failed).toContain("HTTP 500")
    expect(failed).not.toContain("곳")
  })

  it("갱신 실패 시 저장된 값임을 알린다", () => {
    expect(renderToStaticMarkup(<SalesCountTiles counts={state(counts(), { stale: true })} />)).toContain("저장된 값")
  })
})

describe("개요 A 로드맵 — 남은 기간 고확도", () => {
  const row = (monthlyPayments: Record<string, number>, monthlyConfirmed: Record<string, number>, monthlyHighConfidence: Record<string, number>) =>
    ({ revenue: 0, ledgerOrigin: "sheet" as const, monthlyPayments, monthlyConfirmed, monthlyHighConfidence })
  const plans = ["2026-10", "2026-11", "2026-12", "2027-01"].map((month) => ({ month, goal: 100 }))
  const rows = [row(
    { "2026-10": 100, "2026-11": 100, "2026-12": 100, "2027-01": 100 },
    { "2026-10": 10, "2026-11": 10, "2026-12": 10, "2027-01": 10 },
    { "2026-10": 50, "2026-11": 40, "2026-12": 30, "2027-01": 20 },
  )]

  it("기간 안의 이번 달 이후 고확도만 모은다", () => {
    expect(remainingHighConfidence(rows, plans, { scope: "M", selectedMonth: "2026-11", todayMonth: "2026-11" })).toBe(40)
    expect(remainingHighConfidence(rows, plans, { scope: "Q", selectedMonth: "2026-11", todayMonth: "2026-11" })).toBe(70)
    expect(remainingHighConfidence(rows, plans, { scope: "Y", selectedMonth: "2026-11", todayMonth: "2026-11" })).toBe(90)
    expect(remainingHighConfidence(rows, plans, { scope: "M", selectedMonth: "2026-10", todayMonth: "2026-11" })).toBe(0)
  })

  it("분기는 회계 분기(10~12월)로 판정한다", () => {
    expect(monthInOverviewPeriod("2027-01", "Q", "2026-11")).toBe(false)
    expect(monthInOverviewPeriod("2026-12", "Q", "2026-11")).toBe(true)
  })

  it("막대 구간은 확정 뒤에 이어 그리고 100%를 넘지 않는다", () => {
    expect(heroRoadmapSegments(75.7, 265, 49.7)).toMatchObject({ confirmedPct: expect.closeTo(28.57, 1), highPct: expect.closeTo(18.75, 1), projectedPct: expect.closeTo(47.3, 0) })
    expect(heroRoadmapSegments(90, 100, 50)).toMatchObject({ confirmedPct: 90, highPct: 10, projectedPct: 140 })
    expect(heroRoadmapSegments(10, 0, 5)).toEqual({ confirmedPct: 0, highPct: 0, projectedPct: null })
  })
})

describe("개요 A 배치(소스 계약)", () => {
  const panel = readFileSync(join(process.cwd(), "components/admin/branch/BranchOverviewPanel.tsx"), "utf8")
  const hero = readFileSync(join(process.cwd(), "components/admin/branch/sections/OverviewHeroCard.tsx"), "utf8")
  it("위→아래 순서: 확정 매출 | 목표 달성 → 누적 흐름 → 매출 분해 → 3칸 → 전사 참고", () => {
    const order = ["<OverviewHeroCard", 'layout="cockpit"', "<IntegrityStrip", "<RevenueFlowCard", "<DealMixSection", "<BranchUpcomingDeals", "시트 영업 KPI 병목", "가까운 딜", ">전사 참고<"]
    const idx = order.map((token) => panel.indexOf(token))
    expect(idx.every((i) => i > -1)).toBe(true)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
    expect(panel).toContain("lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]")
    expect(panel).toContain("lg:grid-cols-3")
  })
  it("sales-counts는 manager 쿼리를 붙여 읽고 확도 색은 토큰만 쓴다", () => {
    expect(panel).toContain("/api/admin/branch/sales-counts?team=${team}")
    expect(panel).toContain("&manager=${encodeURIComponent(manager)}")
    expect(hero).toContain("CONFIDENCE_TOKENS")
    expect(hero).not.toMatch(/#C8102E|#1E5DA8|#A8741A/)
    expect(hero).toContain("min-h-11")
  })
})
