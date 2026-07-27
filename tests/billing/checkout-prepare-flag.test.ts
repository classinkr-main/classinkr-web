// 정찰에서 확인된 갭: prepare 라우트가 서버측에서 소프트웨어 체크아웃 피처 플래그를
// 검증하지 않아, 플래그가 꺼진 상태에서도 외부에서 직접 POST 하면 software_checkout_orders
// 에 pending 행이 생성될 수 있었다(금전 리스크는 없지만 DB 오염 가능). prepare 는 새 주문을
// 생성하는 유일한 진입점이므로 여기서만 막으면 confirm/fail 로 이어질 pending 주문 자체가
// 생기지 않는다 — confirm/fail 은 이미 존재하는 주문 + HMAC 서명된 checkoutToken 이 있어야만
// 동작하므로 같은 갭이 없고(별도 게이트 불필요), 오히려 여기서 막으면 이미 Toss 에 결제된
// 건을 confirm 하지 못하게 막는 역효과가 생길 수 있어 의도적으로 게이트를 추가하지 않았다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "@/app/api/billing/checkout/prepare/route"

function makeRequest(body: Record<string, unknown> = { mode: "subscription" }) {
  return new NextRequest("https://classin.co.kr/api/billing/checkout/prepare", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.50",
    },
    body: JSON.stringify(body),
  })
}

describe("POST /api/billing/checkout/prepare — server-side feature flag gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("rejects with 403 checkout_disabled when NEXT_PUBLIC_SW_CHECKOUT_ENABLED is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SW_CHECKOUT_ENABLED", "")

    const response = await POST(makeRequest())
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json).toEqual({ ok: false, error: "checkout_disabled" })
  })

  it("rejects with 403 checkout_disabled for any non-'true' value", async () => {
    vi.stubEnv("NEXT_PUBLIC_SW_CHECKOUT_ENABLED", "false")

    const response = await POST(makeRequest())
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json).toEqual({ ok: false, error: "checkout_disabled" })
  })
})
