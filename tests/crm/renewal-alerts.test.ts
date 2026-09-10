import { describe, expect, it } from "vitest"

import { buildRenewalAlertDigests, type RenewalAlertRow } from "@/lib/crm/renewal-alerts"

function row(overrides: Partial<RenewalAlertRow> = {}): RenewalAlertRow {
  return {
    accountId: "acc-1",
    accountName: "학원 1",
    ownerId: "owner-1",
    ownerName: "김담당",
    billingMode: "consumption",
    balance: 500,
    expireInDays: null,
    depletionInDays: null,
    riskReasons: [],
    ...overrides,
  }
}

describe("buildRenewalAlertDigests", () => {
  it("담당자당 하나로 묶는다 — 고객 단위로 쏘지 않는다", () => {
    const digests = buildRenewalAlertDigests([
      row({ accountId: "a", expireInDays: 5 }),
      row({ accountId: "b", expireInDays: 12 }),
      row({ accountId: "c", ownerId: "owner-2", ownerName: "이담당", expireInDays: 3 }),
    ])
    expect(digests).toHaveLength(2)
    const mine = digests.find((d) => d.ownerId === "owner-1")
    expect(mine?.items).toHaveLength(2)
    expect(mine?.summary).toBe("만료 임박 2곳")
  })

  it("한 고객이 여러 사유에 걸려도 가장 급한 하나만 낸다", () => {
    const digests = buildRenewalAlertDigests([
      row({
        expireInDays: 4,
        depletionInDays: 2,
        riskReasons: [{ code: "depleted_balance" }, { code: "recharge_due" }],
      }),
    ])
    expect(digests[0]?.items).toHaveLength(1)
    expect(digests[0]?.items[0]?.kind).toBe("expiring")
  })

  it("소진이 재충전 임박보다 앞선다 — 이미 멈춘 쪽이 급하다", () => {
    const digests = buildRenewalAlertDigests([
      row({ balance: 0, depletionInDays: 3, riskReasons: [{ code: "depleted_balance" }, { code: "recharge_due" }] }),
    ])
    expect(digests[0]?.items[0]?.kind).toBe("depleted")
  })

  it("재충전 임박은 위험 판정이 통과시킨 것만 낸다", () => {
    // depletionInDays 만 있고 recharge_due 사유가 없으면(구독제 등) 알리지 않는다.
    expect(buildRenewalAlertDigests([row({ depletionInDays: 5, riskReasons: [] })])).toHaveLength(0)
    expect(
      buildRenewalAlertDigests([row({ depletionInDays: 5, riskReasons: [{ code: "recharge_due" }] })])[0]?.items[0]?.kind
    ).toBe("recharge_due")
  })

  it("만료 창 밖과 이미 만료된 건은 이 알림이 다루지 않는다", () => {
    expect(buildRenewalAlertDigests([row({ expireInDays: 90 })])).toHaveLength(0)
    expect(buildRenewalAlertDigests([row({ expireInDays: -5 })])).toHaveLength(0)
  })

  it("쿨다운에 걸린 건은 빠진다", () => {
    const rows = [row({ accountId: "a", expireInDays: 5 }), row({ accountId: "b", expireInDays: 9 })]
    const digests = buildRenewalAlertDigests(rows, { suppressedKeys: new Set(["expiring:a"]) })
    expect(digests[0]?.items.map((i) => i.accountId)).toEqual(["b"])
  })

  it("전부 쿨다운이면 담당자 묶음 자체를 만들지 않는다", () => {
    const digests = buildRenewalAlertDigests([row({ expireInDays: 5 })], {
      suppressedKeys: new Set(["expiring:acc-1"]),
    })
    expect(digests).toHaveLength(0)
  })

  it("급한 순으로 세우고 상한에서 자른다", () => {
    const rows = [
      row({ accountId: "far", expireInDays: 28 }),
      row({ accountId: "near", expireInDays: 1 }),
      row({ accountId: "mid", expireInDays: 14 }),
    ]
    const digests = buildRenewalAlertDigests(rows, { maxItemsPerOwner: 2 })
    expect(digests[0]?.items.map((i) => i.accountId)).toEqual(["near", "mid"])
  })

  it("할 일이 많은 담당자를 위로 올린다", () => {
    const digests = buildRenewalAlertDigests([
      row({ accountId: "a", ownerId: "few", ownerName: "적음", expireInDays: 3 }),
      row({ accountId: "b", ownerId: "many", ownerName: "많음", expireInDays: 3 }),
      row({ accountId: "c", ownerId: "many", ownerName: "많음", expireInDays: 4 }),
    ])
    expect(digests[0]?.ownerName).toBe("많음")
  })

  it("담당자 id 가 없어도 이름으로 묶인다", () => {
    const digests = buildRenewalAlertDigests([
      row({ accountId: "a", ownerId: null, ownerName: "담당 미지정", expireInDays: 3 }),
      row({ accountId: "b", ownerId: null, ownerName: "담당 미지정", expireInDays: 6 }),
    ])
    expect(digests).toHaveLength(1)
    expect(digests[0]?.items).toHaveLength(2)
  })

  it("여러 사유가 섞이면 요약에 전부 적는다", () => {
    const digests = buildRenewalAlertDigests([
      row({ accountId: "a", expireInDays: 3 }),
      row({ accountId: "b", balance: 0, riskReasons: [{ code: "depleted_balance" }] }),
      row({ accountId: "c", depletionInDays: 8, riskReasons: [{ code: "recharge_due" }] }),
    ])
    expect(digests[0]?.summary).toBe("만료 임박 1곳 · 잔액 소진 1곳 · 재충전 임박 1곳")
  })
})
