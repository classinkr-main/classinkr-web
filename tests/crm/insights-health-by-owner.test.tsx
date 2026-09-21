/**
 * T2·T3 — 인사이트 화면의 담당별 건강도 스택바와 점수 3종 정의, 360 개요의 점수 라벨.
 *
 * - 범례는 색+텍스트(안전/주의/위험)로 항상 있고, 담당 한 줄에 세그먼트 건수가 직접 적힌다.
 * - 담당자 0명이면 EmptyState.
 * - 점수 정의는 details(기본 열림)로 ScoreKindTable을 그린다.
 * - 360 개요는 숫자만 두지 않는다 — 건강도(기존 고객)·우선순위는 ScoreKindLabel로 종류를 붙인다.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CrmHealthByOwnerSection, CrmScoreKindDefinitionsSection } from "@/components/admin/crm/CrmInsightsClient"
import Customer360DetailOverview from "@/components/admin/crm/Customer360DetailOverview"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"

const DISTRIBUTION = {
  total: 7,
  safe: 4,
  watch: 2,
  risk: 1,
  byOwner: [
    { ownerId: "owner-kim", ownerName: "김담당", total: 4, safe: 2, watch: 1, risk: 1 },
    { ownerId: null, ownerName: "미배정", total: 3, safe: 2, watch: 1, risk: 0 },
  ],
}

describe("CrmHealthByOwnerSection (T2)", () => {
  it("범례(색+텍스트)·담당 행·세그먼트 건수·합계를 그린다", () => {
    const html = renderToStaticMarkup(
      <CrmHealthByOwnerSection distribution={DISTRIBUTION} generatedAt="2026-09-18T09:00:00.000Z" loading={false} />
    )

    expect(html).toContain("담당별 건강도")
    expect(html).toMatch(/aria-label="범례"/)
    for (const label of ["안전", "주의", "위험"]) expect(html).toContain(label)
    expect(html).toContain("background-color:#084734")
    expect(html).toContain("background-color:#ECD29C")
    expect(html).toContain("background-color:#F2B8B8")

    expect(html).toContain("김담당")
    expect(html).toContain("미배정")
    expect(html).toContain('data-owner-id="owner-kim"')
    // 세그먼트 직접 라벨(건수)과 title 툴팁.
    expect(html).toMatch(/data-band="safe"[^>]*title="안전 2건"/)
    expect(html).toMatch(/data-band="watch"[^>]*title="주의 1건"/)
    expect(html).toMatch(/data-band="risk"[^>]*title="위험 1건"/)
    // 0건 세그먼트는 그리지 않는다(미배정 위험 0).
    expect(html).not.toContain('title="위험 0건"')
    // 우측 합계 + 기준 시각.
    expect(html).toContain(">4</span>")
    expect(html).toContain("기준 ")
  })

  it("담당자 0명이면 EmptyState를 그린다", () => {
    const html = renderToStaticMarkup(
      <CrmHealthByOwnerSection
        distribution={{ total: 0, safe: 0, watch: 0, risk: 0, byOwner: [] }}
        generatedAt={null}
        loading={false}
      />
    )
    expect(html).toContain("담당자별 건강도를 표시할 활성 고객이 없습니다.")
  })
})

describe("CrmScoreKindDefinitionsSection (T3)", () => {
  it("기본 열림 details로 점수 3종 정의표를 그린다", () => {
    const html = renderToStaticMarkup(<CrmScoreKindDefinitionsSection />)
    expect(html).toMatch(/<details[^>]*open/)
    expect(html).toContain("점수 3종 정의")
    expect(html).toContain('data-score-kind="health"')
    expect(html).toContain('data-score-kind="lead"')
    expect(html).toContain('data-score-kind="priority"')
  })
})

function make360(overrides: Partial<Customer360> = {}): Customer360 {
  return {
    generatedAt: "2026-09-18T03:00:00.000Z",
    key: "neo:acc-1",
    source: "neo_account",
    entityId: "acc-1",
    found: true,
    health: { ok: true, warnings: [] },
    header: {
      key: "neo:acc-1",
      source: "neo_account",
      sourceLabel: "고객",
      name: "테스트 학원",
      statusLabel: "활성 고객",
      ownerName: "김담당",
      ownerKeys: ["김담당"],
      region: null,
      score: 42,
      priorityReason: null,
      nextActionLabel: null,
      createdAt: null,
      updatedAt: null,
    },
    contacts: { phone: null, email: null, message: null, extra: [] },
    money: {
      available: true,
      label: null,
      totalBalance: 100,
      totalOrderAmount: null,
      orders: [],
      collections: [],
      performances: [],
      eeoAccounts: [],
    },
    productSummary: { matched: false },
    origin: null,
    crmRegistered: true,
    neoAccountId: "acc-1",
    risk: { severity: "low", reasons: [], overdueTaskCount: 0, riskEventCount: 0, nearestExpireAt: null, totalBalance: 100 },
    serviceRisk: null,
    activity: { generatedAt: "", health: { ok: true, message: null }, summary: { total: 0, returned: 0, recordings: 0, risks: 0, openNextActions: 0 }, rows: [] },
    compass: { leadIds: [], href: null, entries: [], down: false },
    tasks: { generatedAt: "", health: { ok: true, message: null }, summary: { total: 0, returned: 0, open: 0, overdue: 0, dueToday: 0, snoozed: 0, done: 0 }, rows: [] },
    deals: { generatedAt: "", health: { ok: true, message: null }, summary: { total: 0, returned: 0, open: 0, won: 0, lost: 0, openAmount: 0, noNextActionCount: 0, aggregateTruncated: false }, rows: [] },
    tags: [],
    ...overrides,
  } as unknown as Customer360
}

describe("Customer360DetailOverview 점수 라벨 (T3)", () => {
  it("기존 고객은 건강도(ScoreKindLabel)와 우선순위를 종류 라벨과 함께 그린다", () => {
    const html = renderToStaticMarkup(<Customer360DetailOverview data={make360()} />)

    expect(html).toMatch(/data-score-kind="health"[^>]*>(?:(?!<\/span>).)*건강도/)
    // 리스크 low·서비스 없음·만료 없음 → 100점 안전.
    expect(html).toMatch(/data-score-kind="health"[\s\S]*?>100</)
    expect(html).toMatch(/data-score-kind="priority"[^>]*>(?:(?!<\/span>).)*우선순위/)
    expect(html).toMatch(/data-score-kind="priority"[\s\S]*?>42</)
    // 종류 없는 "점수" 타일은 남기지 않는다.
    expect(html).not.toContain(">점수<")
  })

  it("리드는 건강도 대상이 아니라 우선순위만 라벨한다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailOverview
        data={make360({
          source: "lead",
          money: {
            available: false,
            label: null,
            totalBalance: null,
            totalOrderAmount: null,
            orders: [],
            collections: [],
            performances: [],
            eeoAccounts: [],
            lineItems: [],
            lineItemsMeta: { truncated: false, sources: [] },
            unmatchedOutbound: [],
          },
        } as Partial<Customer360>)}
      />
    )
    expect(html).not.toContain('data-score-kind="health"')
    expect(html).toContain('data-score-kind="priority"')
  })
})
