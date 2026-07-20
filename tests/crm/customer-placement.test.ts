import { describe, expect, it } from "vitest"

import {
  compareDefaultCustomerPlacement,
  getDefaultCustomerPlacement,
} from "@/lib/crm/customer-placement"
import type { CrmUnifiedCustomerRow } from "@/lib/crm/unified-view-rules"

const NOW = new Date("2026-07-19T09:00:00.000Z").getTime()

function row(overrides: Partial<CrmUnifiedCustomerRow>): CrmUnifiedCustomerRow {
  return {
    key: "neo:1",
    source: "neo_account",
    sourceLabel: "고객",
    name: "테스트 학원",
    contact: null,
    ownerName: null,
    ownerKeys: [],
    lifecycle: "active_account",
    statusLabel: "활성 고객",
    nextActionLabel: "관계 유지",
    priorityReason: "최근 고객 상태 정상",
    score: 10,
    moneyLabel: null,
    href: "#",
    updatedAt: "2026-07-18T09:00:00.000Z",
    expireAt: null,
    balance: null,
    tags: [],
    origin: null,
    crmRegistered: false,
    provisional: false,
    slaTarget: false,
    firstResponseAt: null,
    createdAt: null,
    ...overrides,
  }
}

describe("CRM 기본 고객 상단 배치", () => {
  it("places a 24h+ unanswered lead ahead of expiring and routine customers", () => {
    const unanswered = row({
      key: "lead:unanswered",
      source: "lead",
      lifecycle: "new_lead",
      score: 90,
      slaTarget: true,
      createdAt: "2026-07-17T08:00:00.000Z",
    })
    const expiring = row({ key: "neo:expiring", score: 100, expireAt: "2026-07-20T09:00:00.000Z" })
    const routine = row({ key: "neo:routine" })

    expect([routine, expiring, unanswered].sort((a, b) => compareDefaultCustomerPlacement(a, b, NOW)).map((item) => item.key)).toEqual([
      "lead:unanswered",
      "neo:expiring",
      "neo:routine",
    ])
  })

  it("does not classify a lead with a recorded first response as unanswered", () => {
    const placement = getDefaultCustomerPlacement(
      row({
        key: "lead:responded",
        source: "lead",
        lifecycle: "new_lead",
        score: 36,
        slaTarget: true,
        firstResponseAt: "2026-07-18T10:00:00.000Z",
        createdAt: "2026-07-16T08:00:00.000Z",
      }),
      NOW
    )

    expect(placement).toMatchObject({ band: "follow_up", label: "후속 진행" })
  })

  it("keeps 60d+ expired accounts in recovery instead of the immediate queue", () => {
    const placement = getDefaultCustomerPlacement(
      row({ score: 60, lifecycle: "account_risk", expireAt: "2026-04-01T09:00:00.000Z" }),
      NOW
    )

    expect(placement).toMatchObject({ band: "follow_up", label: "회복 후보" })
  })

  it("uses name and key as deterministic tie breakers", () => {
    const beta = row({ key: "neo:b", name: "베타", score: 10, updatedAt: null })
    const alpha = row({ key: "neo:a", name: "알파", score: 10, updatedAt: null })
    const alphaSecond = row({ key: "neo:z", name: "알파", score: 10, updatedAt: null })

    expect(
      [alphaSecond, beta, alpha]
        .sort((a, b) => compareDefaultCustomerPlacement(a, b, NOW))
        .map((item) => item.key)
    ).toEqual(["neo:b", "neo:a", "neo:z"])
  })
})
