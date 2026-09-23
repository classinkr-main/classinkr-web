import { describe, expect, it } from "vitest"

import {
  clearStoredDraft,
  DRAFT_MAX_AGE_MS,
  QUICK_CART_DRAFT_KEY,
  QUICK_CART_DRAFT_VERSION,
  readStoredDraft,
  readStoredQuickCartDrafts,
  writeStoredDraft,
} from "@/components/admin/hardware/inventory/draft-storage"

// 입력 가속 P3-1 — 작성 중 입력을 잃지 않되, 옛 초안이 오늘 저장으로 새지 않아야 한다.
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

describe("draft storage", () => {
  it("쓰고 바로 읽으면 그대로 돌아온다", () => {
    const storage = fakeStorage()
    writeStoredDraft("k", 1, { lot: "C3", rows: 2 }, { storage, now: 1_000 })
    expect(readStoredDraft("k", 1, { storage, now: 2_000 })).toEqual({ lot: "C3", rows: 2 })
  })

  it("스키마 버전이 다르면 읽지 않는다", () => {
    const storage = fakeStorage()
    writeStoredDraft("k", 1, { lot: "C3" }, { storage, now: 1_000 })
    expect(readStoredDraft("k", 2, { storage, now: 2_000 })).toBeNull()
  })

  it("기본 보관 기한(24시간)을 넘기면 버린다", () => {
    const storage = fakeStorage()
    writeStoredDraft("k", 1, { lot: "C3" }, { storage, now: 0 })
    expect(readStoredDraft("k", 1, { storage, now: DRAFT_MAX_AGE_MS + 1 })).toBeNull()
    expect(readStoredDraft("k", 1, { storage, now: DRAFT_MAX_AGE_MS - 1 })).toEqual({ lot: "C3" })
  })

  it("저장 시각이 없는 값은 읽지 않는다(옛 포맷)", () => {
    const storage = fakeStorage({ k: JSON.stringify({ version: 1, value: { lot: "C3" } }) })
    expect(readStoredDraft("k", 1, { storage, now: 1_000 })).toBeNull()
  })

  it("망가진 JSON 은 조용히 null", () => {
    const storage = fakeStorage({ k: "{not json" })
    expect(readStoredDraft("k", 1, { storage, now: 1_000 })).toBeNull()
  })

  it("지우면 더 읽히지 않는다", () => {
    const storage = fakeStorage()
    writeStoredDraft("k", 1, { lot: "C3" }, { storage, now: 1_000 })
    clearStoredDraft("k", { storage })
    expect(readStoredDraft("k", 1, { storage, now: 1_100 })).toBeNull()
  })

  it("storage 를 쓸 수 없으면(프라이빗 모드 등) 던지지 않고 기능만 포기한다", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
      removeItem: () => {
        throw new Error("blocked")
      },
    }
    expect(() => writeStoredDraft("k", 1, { lot: "C3" }, { storage: blocked })).not.toThrow()
    expect(readStoredDraft("k", 1, { storage: blocked })).toBeNull()
    expect(() => clearStoredDraft("k", { storage: blocked })).not.toThrow()
    // storage 자체가 없는 환경(SSR)도 같다.
    expect(readStoredDraft("k", 1, { storage: null })).toBeNull()
  })
})

describe("readStoredQuickCartDrafts", () => {
  function cartLine(overrides: Record<string, unknown> = {}) {
    return {
      productName: '86" IFP',
      movementType: "outbound",
      quantity: 2,
      occurredAt: "2026-09-20",
      fromLocation: "창고",
      toLocation: "남명학원",
      owner: "",
      status: "출고",
      referenceNo: "",
      memo: "",
      lotNo: "",
      unitPrice: null,
      amountUsd: null,
      amountCny: null,
      storageLocation: "",
      importer: "",
      serials: [],
      ...overrides,
    }
  }

  it("담아 둔 줄을 그대로 되살린다", () => {
    const storage = fakeStorage()
    writeStoredDraft(QUICK_CART_DRAFT_KEY, QUICK_CART_DRAFT_VERSION, [cartLine()], { storage, now: 1_000 })
    const restored = readStoredQuickCartDrafts({ storage, now: 2_000 })
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ productName: '86" IFP', quantity: 2, toLocation: "남명학원" })
  })

  it("형태가 깨진 줄만 버리고 나머지는 살린다", () => {
    const storage = fakeStorage()
    writeStoredDraft(
      QUICK_CART_DRAFT_KEY,
      QUICK_CART_DRAFT_VERSION,
      [
        cartLine(),
        cartLine({ productName: "   " }),
        cartLine({ quantity: 0 }),
        cartLine({ quantity: "2" }),
        cartLine({ serials: null }),
        "문자열",
        null,
      ],
      { storage, now: 1_000 }
    )
    const restored = readStoredQuickCartDrafts({ storage, now: 2_000 })
    expect(restored).toHaveLength(1)
    expect(restored[0].productName).toBe('86" IFP')
  })

  it("배열이 아니거나 기한을 넘긴 값은 빈 바구니", () => {
    const storage = fakeStorage()
    writeStoredDraft(QUICK_CART_DRAFT_KEY, QUICK_CART_DRAFT_VERSION, { not: "an array" }, { storage, now: 1_000 })
    expect(readStoredQuickCartDrafts({ storage, now: 2_000 })).toEqual([])

    writeStoredDraft(QUICK_CART_DRAFT_KEY, QUICK_CART_DRAFT_VERSION, [cartLine()], { storage, now: 0 })
    expect(readStoredQuickCartDrafts({ storage, now: DRAFT_MAX_AGE_MS + 1 })).toEqual([])
  })
})
