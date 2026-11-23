import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const trackEvent = vi.hoisted(() => vi.fn())

vi.mock("@/lib/analytics", () => ({ trackEvent }))

import { PURCHASE_TRACKED_KEY_PREFIX, trackPurchaseOnce } from "@/lib/billing/purchase-tracking"

// 결제 성공 화면(app/checkout/success → CheckoutSuccessClient)의 purchase 1회 발화.
// localStorage 접근은 사이트 데이터 차단·용량 초과·구형 Safari 사생활 모드에서 throw 한다.
// effect 안의 throw 는 error boundary(app/error.tsx)로 가서 결제 직후 성공 화면이 사라지므로,
// 저장소가 막혀도 throw 없이 purchase 를 보내야 한다.

const ORDER = { orderId: "order_123", amount: 99000, conversionEventId: "conv_abc" }
const KEY = `${PURCHASE_TRACKED_KEY_PREFIX}${ORDER.orderId}`

function domException(name: string) {
  const error = new Error(`${name}: storage unavailable`)
  error.name = name
  return error
}

function createStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    map,
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, String(value))
    }),
  }
}

function stubWindowWithStorage(storage: unknown) {
  vi.stubGlobal("window", { localStorage: storage })
  vi.stubGlobal("localStorage", storage)
}

beforeEach(() => {
  trackEvent.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("trackPurchaseOnce", () => {
  it("sends purchase once and marks the order in localStorage", () => {
    const storage = createStorage()
    stubWindowWithStorage(storage)

    expect(trackPurchaseOnce(ORDER)).toBe(true)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith("purchase", {
      transaction_id: "order_123",
      event_id: "conv_abc",
      value: 99000,
      currency: "KRW",
    })
    expect(storage.map.get(KEY)).toBe("1")

    // 새로고침·재방문(같은 브라우저)에서는 다시 보내지 않는다.
    expect(trackPurchaseOnce(ORDER)).toBe(false)
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it("skips an order already marked as tracked", () => {
    stubWindowWithStorage(createStorage({ [KEY]: "1" }))

    expect(trackPurchaseOnce(ORDER)).toBe(false)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it("falls back to purchase:<orderId> when there is no conversionEventId", () => {
    stubWindowWithStorage(createStorage())

    trackPurchaseOnce({ orderId: "order_456", amount: 1000 })
    expect(trackEvent).toHaveBeenCalledWith(
      "purchase",
      expect.objectContaining({ transaction_id: "order_456", event_id: "purchase:order_456" })
    )
  })

  it("still sends purchase when getItem throws (site data blocked)", () => {
    const storage = createStorage()
    storage.getItem.mockImplementation(() => {
      throw domException("SecurityError")
    })
    stubWindowWithStorage(storage)

    expect(() => trackPurchaseOnce(ORDER)).not.toThrow()
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith("purchase", expect.objectContaining({ transaction_id: "order_123" }))
  })

  it("does not throw when setItem throws (quota full / old Safari private mode)", () => {
    const storage = createStorage()
    storage.setItem.mockImplementation(() => {
      throw domException("QuotaExceededError")
    })
    stubWindowWithStorage(storage)

    let result: boolean | undefined
    expect(() => {
      result = trackPurchaseOnce(ORDER)
    }).not.toThrow()
    expect(result).toBe(true)
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it("does not throw when both getItem and setItem throw", () => {
    const storage = createStorage()
    storage.getItem.mockImplementation(() => {
      throw domException("SecurityError")
    })
    storage.setItem.mockImplementation(() => {
      throw domException("SecurityError")
    })
    stubWindowWithStorage(storage)

    expect(() => trackPurchaseOnce(ORDER)).not.toThrow()
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it("does not throw when reading window.localStorage itself throws", () => {
    // Chrome 은 쿠키·사이트 데이터를 막으면 localStorage getter 자체가 SecurityError 를 던진다.
    const throwingWindow = {}
    Object.defineProperty(throwingWindow, "localStorage", {
      get() {
        throw domException("SecurityError")
      },
    })
    vi.stubGlobal("window", throwingWindow)

    expect(() => trackPurchaseOnce(ORDER)).not.toThrow()
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })
})

describe("CheckoutSuccessClient — purchase tracking contract", () => {
  const source = readFileSync(join(process.cwd(), "components/billing/CheckoutSuccessClient.tsx"), "utf8")

  it("delegates purchase tracking to the storage-guarded helper", () => {
    expect(source).toMatch(/from "@\/lib\/billing\/purchase-tracking"/)
    expect(source).toMatch(/trackPurchaseOnce\(/)
  })

  it("does not touch localStorage directly (unguarded access would crash the success page)", () => {
    expect(source).not.toMatch(/localStorage/)
  })
})
