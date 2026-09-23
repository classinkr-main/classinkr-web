/**
 * unified-08 — 돈흐름 셀의 소스별 zero 표기와 통화 기호.
 *
 * 외부 CRM 계정(neo_account)의 잔액은 ¥, 오더는 $이고 전환 고객(customer)의 계약·미수만 ₩이다.
 * zero 상태를 소스와 무관하게 "0원"으로 그리면 ¥0 잔액을 원화 0으로 오독한다.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MONEY_ZERO_LABEL, moneyCell } from "@/components/admin/crm/unified/row-visuals"
import { SECONDARY_TEXT_CLASS } from "@/components/admin/crm/home/shared"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"

function row(overrides: Partial<CrmUnifiedCustomerRow>): CrmUnifiedCustomerRow {
  return {
    key: "neo:1",
    source: "neo_account",
    sourceLabel: "고객",
    name: "테스트 고객",
    contact: null,
    ownerName: null,
    ownerKeys: [],
    lifecycle: "active_account",
    statusLabel: "활성 고객",
    nextActionLabel: "관계 유지",
    priorityReason: "-",
    score: 10,
    bucket: null,
    moneyLabel: null,
    moneyState: "zero",
    href: "#",
    updatedAt: null,
    expireAt: null,
    balance: 0,
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

describe("moneyCell (unified-08)", () => {
  it("외부 CRM 계정의 zero는 '잔액 ¥0'으로, 전환 고객의 zero는 '₩0'으로 그린다 — '0원' 금지", () => {
    const neo = renderToStaticMarkup(moneyCell(row({ source: "neo_account" })))
    const customer = renderToStaticMarkup(moneyCell(row({ key: "customer:1", source: "customer" })))

    expect(neo).toContain("잔액 ¥0")
    expect(neo).toContain(MONEY_ZERO_LABEL.neo_account?.title ?? "__missing__")
    expect(customer).toContain("₩0")
    expect(neo).not.toContain("0원")
    expect(customer).not.toContain("0원")
  })

  it("value 상태는 저장소가 기호를 포함해 만든 라벨을 그대로 쓰고 문자열을 새로 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      moneyCell(row({ moneyState: "value", moneyLabel: "잔액 ¥1.2만 · 오더 $300" }))
    )
    expect(html).toContain("잔액 ¥1.2만 · 오더 $300")
    expect(html).toContain(SECONDARY_TEXT_CLASS)
  })

  it("unsynced는 warning 토큰, none/zero/value 본문은 SECONDARY_TEXT_CLASS 이상 대비를 쓴다", () => {
    const unsynced = renderToStaticMarkup(moneyCell(row({ moneyState: "unsynced" })))
    const none = renderToStaticMarkup(moneyCell(row({ key: "lead:1", source: "lead", moneyState: "none" })))

    expect(unsynced).toContain("동기화 대기")
    expect(unsynced).toContain(STATUS_TONE_TEXT_CLASS.warning)
    expect(none).toContain(SECONDARY_TEXT_CLASS)
    for (const html of [unsynced, none]) {
      expect(html).not.toMatch(/text-\[#1a1a1a\]\/(30|40|55)/)
    }
  })
})
