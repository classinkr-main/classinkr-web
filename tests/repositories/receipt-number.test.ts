import { beforeEach, describe, expect, it, vi } from "vitest"

// 영수증 번호는 행 수가 아니라 최대 순번 + 1 — 중간 삭제 후에도 기존 번호와 충돌하지 않는다.
vi.mock("server-only", () => ({}))

const state = vi.hoisted(() => ({ rows: [] as Array<{ receipt_number: string }>, error: null as unknown }))
const query = vi.hoisted(() => {
  const q: Record<string, unknown> = {}
  q.select = vi.fn(() => q)
  q.like = vi.fn(() => q)
  q.order = vi.fn(() => q)
  q.limit = vi.fn(async () => ({ data: state.rows, error: state.error }))
  return q
})
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => query }) }))

import { generateReceiptNumber } from "@/lib/repositories/receipts"

const year = new Date().getFullYear()

beforeEach(() => {
  state.rows = []
  state.error = null
})

describe("generateReceiptNumber", () => {
  it("행이 없으면 001", async () => {
    expect(await generateReceiptNumber()).toBe(`R-${year}-001`)
  })

  it("중간 번호가 삭제돼 count+1 이면 충돌할 상황에서도 최대 순번 + 1 을 쓴다", async () => {
    // 001 삭제 → 남은 건 002, 003 (count=2 → 예전 방식은 003 을 다시 만들었다)
    state.rows = [{ receipt_number: `R-${year}-003` }, { receipt_number: `R-${year}-002` }]
    expect(await generateReceiptNumber()).toBe(`R-${year}-004`)
  })

  it("999 를 넘어도 숫자 최댓값을 쓴다", async () => {
    state.rows = [{ receipt_number: `R-${year}-999` }, { receipt_number: `R-${year}-1000` }]
    expect(await generateReceiptNumber()).toBe(`R-${year}-1001`)
  })

  it("읽기 오류는 001 로 위장하지 않고 던진다", async () => {
    state.error = new Error("db down")
    await expect(generateReceiptNumber()).rejects.toThrow("db down")
  })
})
