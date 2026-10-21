import { describe, expect, it } from "vitest"

import {
  getCodeDaysLeft,
  getCodeQueueKey,
  getContractQueueKey,
  getContractSteps,
  groupCodes,
  groupContracts,
  groupReceipts,
  needsCashReceipt,
  type CodeQueueInput,
  type ContractQueueInput,
  type ReceiptQueueInput,
} from "@/components/admin/documents/document-queues"

const NOW = Date.parse("2026-10-20T03:00:00Z")

function contract(patch: Partial<ContractQueueInput & { id: string }>): ContractQueueInput & { id: string } {
  return {
    id: "c",
    status: "sent",
    partner_signed_at: null,
    admin_signed_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    ...patch,
  }
}

function receipt(patch: Partial<ReceiptQueueInput & { id: string }>): ReceiptQueueInput & { id: string } {
  return {
    id: "r",
    cash_receipt_requested: false,
    cash_receipt_number: null,
    paid_at: "2026-10-15T03:00:00Z",
    created_at: "2026-10-15T03:00:00Z",
    ...patch,
  }
}

function code(patch: Partial<CodeQueueInput & { id: string }>): CodeQueueInput & { id: string } {
  return { id: "q", expiresAt: null, redeemedAt: null, createdAt: "2026-10-01T00:00:00Z", ...patch }
}

describe("계약서 큐", () => {
  it("상태별 묶음 — 고객 서명 끝난 건이 맨 위", () => {
    expect(getContractQueueKey(contract({ status: "partner_signed", partner_signed_at: "2026-10-17T00:00:00Z" }))).toBe("sign")
    expect(getContractQueueKey(contract({ status: "sent" }))).toBe("await")
    expect(getContractQueueKey(contract({ status: "admin_signed", admin_signed_at: "2026-10-17T00:00:00Z" }))).toBe("await")
    expect(getContractQueueKey(contract({ status: "draft" }))).toBe("draft")
    expect(getContractQueueKey(contract({ status: "completed" }))).toBe("done")
    expect(getContractQueueKey(contract({ status: "cancelled", partner_signed_at: "2026-10-17T00:00:00Z" }))).toBe("cancelled")
  })

  it("양측 서명이 다 있으면 상태가 늦어도 완료", () => {
    const signed = contract({ status: "partner_signed", partner_signed_at: "2026-10-17T00:00:00Z", admin_signed_at: "2026-10-18T00:00:00Z" })
    expect(getContractQueueKey(signed)).toBe("done")
    expect(getContractSteps(signed).every((step) => step.done)).toBe(true)
  })

  it("발송 전 타임라인은 작성만 끝남", () => {
    const steps = getContractSteps(contract({ status: "draft" }))
    expect(steps.map((step) => step.done)).toEqual([true, false, false, false, false])
  })

  it("묶음 순서는 우선순위, 빈 묶음은 빠진다", () => {
    const groups = groupContracts([
      contract({ id: "a", status: "completed" }),
      contract({ id: "b", status: "partner_signed", partner_signed_at: "2026-10-17T00:00:00Z" }),
      contract({ id: "c", status: "draft", updated_at: "2026-10-03T00:00:00Z" }),
      contract({ id: "d", status: "draft", updated_at: "2026-10-05T00:00:00Z" }),
    ])
    expect(groups.map((group) => group.key)).toEqual(["sign", "draft", "done"])
    expect(groups[1].items.map((item) => item.id)).toEqual(["d", "c"])
  })
})

describe("영수증 큐", () => {
  it("요청했는데 번호가 없을 때만 현금영수증 발행 필요", () => {
    expect(needsCashReceipt(receipt({ cash_receipt_requested: true }))).toBe(true)
    expect(needsCashReceipt(receipt({ cash_receipt_requested: true, cash_receipt_number: "  " }))).toBe(true)
    expect(needsCashReceipt(receipt({ cash_receipt_requested: true, cash_receipt_number: "010" }))).toBe(false)
    expect(needsCashReceipt(receipt({ cash_receipt_requested: false }))).toBe(false)
  })

  it("발행 필요가 맨 위, 나머지는 입금월(없으면 발행월) 최신순", () => {
    const groups = groupReceipts(
      [
        receipt({ id: "sep", paid_at: "2026-09-15T03:00:00Z" }),
        receipt({ id: "oct", paid_at: "2026-10-15T03:00:00Z" }),
        receipt({ id: "need", cash_receipt_requested: true, paid_at: "2026-09-10T03:00:00Z" }),
        receipt({ id: "nopaid", paid_at: null, created_at: "2026-10-16T03:00:00Z" }),
        receipt({ id: "old", paid_at: "2025-12-15T03:00:00Z" }),
      ],
      NOW
    )
    expect(groups.map((group) => group.label)).toEqual(["현금영수증 발행 필요", "10월", "9월", "2025년 12월"])
    expect(groups.map((group) => group.tone)).toEqual(["warn", "neutral", "muted", "muted"])
    expect(groups[1].items.map((item) => item.id)).toEqual(["nopaid", "oct"])
  })
})

describe("SW 견적 코드 큐", () => {
  it("사용 > 만료 > 7일 이내 임박 > 결제 대기", () => {
    expect(getCodeQueueKey(code({ redeemedAt: "2026-10-14T00:00:00Z", expiresAt: "2026-10-01T00:00:00Z" }), NOW)).toBe("used")
    expect(getCodeQueueKey(code({ expiresAt: "2026-10-19T00:00:00Z" }), NOW)).toBe("expired")
    expect(getCodeQueueKey(code({ expiresAt: "2026-10-23T00:00:00Z" }), NOW)).toBe("soon")
    expect(getCodeQueueKey(code({ expiresAt: "2026-10-27T03:00:00Z" }), NOW)).toBe("soon")
    expect(getCodeQueueKey(code({ expiresAt: "2026-10-28T00:00:00Z" }), NOW)).toBe("active")
    expect(getCodeQueueKey(code({}), NOW)).toBe("active")
  })

  it("남은 날은 올림, 만료일 없으면 null", () => {
    expect(getCodeDaysLeft(code({ expiresAt: "2026-10-23T00:00:00Z" }), NOW)).toBe(3)
    expect(getCodeDaysLeft(code({ expiresAt: "2026-10-19T00:00:00Z" }), NOW)).toBe(0)
    expect(getCodeDaysLeft(code({}), NOW)).toBeNull()
  })

  it("임박 묶음은 빨리 끝나는 순", () => {
    const groups = groupCodes(
      [
        code({ id: "late", expiresAt: "2026-10-25T00:00:00Z" }),
        code({ id: "early", expiresAt: "2026-10-21T00:00:00Z" }),
        code({ id: "used", redeemedAt: "2026-10-14T00:00:00Z" }),
      ],
      NOW
    )
    expect(groups.map((group) => group.key)).toEqual(["soon", "used"])
    expect(groups[0].items.map((item) => item.id)).toEqual(["early", "late"])
  })
})
