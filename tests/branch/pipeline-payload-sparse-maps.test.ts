import { describe, expect, it } from "vitest"
import { listRevRevenue, sparseNumberMap, sparseBooleanMap } from "@/lib/branch/computations/pipeline"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

// 품질 감사 2026-09-10 — #1(페이로드 다이어트): /api/admin/branch/pipeline(172.6KB 실측)와
// 그 결과를 그대로 쓰는 page.tsx 서버 프리페치(RSC HTML 1,145.9KB 실측)의 상당 비중은
// monthlyPayments/monthlyConfirmed/monthlyHighConfidence/monthlyRed가 매출 없는 달까지
// 0/false로 꽉 채워 직렬화되는 데서 온다. mapNumberValue(shared.tsx)와 row.monthlyRed?.[month]
// 소비부는 "누락 키"를 이미 0/false로 읽으므로(회귀 없음), 0/false 값을 제거해도 안전하다 —
// 이 스위트가 그 트리밍 자체를 순수 함수 단위로 고정한다.
describe("sparseNumberMap — 0값 키를 제거하되 소비 시맨틱은 바꾸지 않는다", () => {
  it("0이 아닌 값만 남긴다", () => {
    expect(sparseNumberMap({ "2026-04": 0, "2026-05": 1000, "2026-06": 0 })).toEqual({ "2026-05": 1000 })
  })

  it("null/undefined 맵은 빈 객체를 반환한다", () => {
    expect(sparseNumberMap(null)).toEqual({})
    expect(sparseNumberMap(undefined)).toEqual({})
  })

  it("음수는 falsy가 아니므로 보존한다(가감 표현 등 실제 값)", () => {
    expect(sparseNumberMap({ "2026-04": -500 })).toEqual({ "2026-04": -500 })
  })

  it("빈 객체 입력은 빈 객체를 반환한다", () => {
    expect(sparseNumberMap({})).toEqual({})
  })
})

describe("sparseBooleanMap — false 키를 제거하되 소비 시맨틱은 바꾸지 않는다", () => {
  it("true만 남기고 false는 제거한다", () => {
    expect(sparseBooleanMap({ "2026-04": true, "2026-05": false, "2026-06": true })).toEqual({
      "2026-04": true,
      "2026-06": true,
    })
  })

  it("null/undefined 맵은 빈 객체를 반환한다", () => {
    expect(sparseBooleanMap(null)).toEqual({})
    expect(sparseBooleanMap(undefined)).toEqual({})
  })
})

const mk = (over: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD", manager: "Han",
  deal_type: "Direct", status: "New", first_payment: null, product_version: null,
  region: "서울", importance: "A", note: null, contract_target: 0,
  monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "", ...over,
})

describe("listRevRevenue — 응답 맵에 실제로 sparseNumberMap/sparseBooleanMap을 적용한다", () => {
  it("monthlyPayments/monthlyConfirmed/monthlyHighConfidence는 0값 달을 응답에서 뺀다", () => {
    const [row] = listRevRevenue([
      mk({
        monthly_payments: { "2026-04": 0, "2026-05": 500 },
        monthly_confirmed: { "2026-04": 0, "2026-05": 500 },
        monthly_high_conf: { "2026-04": 0 },
      }),
    ])
    expect(row.monthlyPayments).toEqual({ "2026-05": 500 })
    expect(row.monthlyConfirmed).toEqual({ "2026-05": 500 })
    expect(row.monthlyHighConfidence).toEqual({})
  })

  it("monthlyRed는 false값 달을 응답에서 뺀다", () => {
    const [row] = listRevRevenue([
      mk({ monthly_payments: { "2026-04": 100 }, monthly_red: { "2026-04": false, "2026-05": true } }),
    ])
    expect(row.monthlyRed).toEqual({ "2026-05": true })
  })

  it("트리밍 이후에도 revenue 집계(revenueFromRev)는 원본 monthly_payments 기준이라 값이 그대로다", () => {
    // 회귀 방지: sparseNumberMap을 revenueFromRev 호출 "이전"에 적용해버리면 0값 달이 아니라
    // 정상 값도 지워질 위험을 원천 차단하는 실측 가드. monthly_red를 둘 다 true로 둬 확정 산식이
    // 전액을 confirmed로 잡는 기존 스위트(computations/pipeline.test.ts)와 동일 조건을 쓴다 —
    // 이 값은 트리밍 도입 전과 동일해야 한다.
    const [row] = listRevRevenue([
      mk({
        id: "a",
        monthly_payments: { "2026-04": 100, "2026-05": 200 },
        monthly_red: { "2026-04": true, "2026-05": true },
      }),
    ], undefined, { period: "Y", now: new Date("2026-04-01T00:00:00Z") })
    expect(row.revenue).toBe(300)
    // monthlyRed는 둘 다 true라 sparseBooleanMap이 그대로 보존한다(false만 제거 대상).
    expect(row.monthlyRed).toEqual({ "2026-04": true, "2026-05": true })
  })
})
