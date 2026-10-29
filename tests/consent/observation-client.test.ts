import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ supports: vi.fn() }))
vi.mock("@/lib/consent/consent", () => ({ supportsConsentCoordination: mocks.supports }))

import { consentObservationHeaders } from "@/lib/consent/observation-client"
import { CONSENT_OBSERVATION_HEADER, CONSENT_OBSERVATION_VERSION } from "@/lib/consent/observation-contract"

describe("현재 탭의 동의 관찰 신호", () => {
  beforeEach(() => { mocks.supports.mockReset() })
  afterEach(() => { vi.unstubAllGlobals() })

  it("서버 환경이나 미설치·구독 실패 탭에서는 헤더가 없다", () => {
    expect(consentObservationHeaders()).toEqual({})
    mocks.supports.mockReturnValue(true)
    vi.stubGlobal("window", { cookieStore: {} })
    expect(consentObservationHeaders()).toEqual({})
  })

  it("실제 관찰 중인 동일 객체와 지원 기능을 확인한 경우만 헤더를 보낸다", () => {
    const store = {}
    const context = { cookieStore: store, __classinConsentObservedStore: store, __classinConsentObserverReady: true }
    vi.stubGlobal("window", context)
    mocks.supports.mockReturnValue(true)
    expect(consentObservationHeaders()).toEqual({ [CONSENT_OBSERVATION_HEADER]: CONSENT_OBSERVATION_VERSION })
    context.cookieStore = {}
    expect(consentObservationHeaders()).toEqual({})
    context.cookieStore = store
    mocks.supports.mockReturnValue(false)
    expect(consentObservationHeaders()).toEqual({})
  })

  it("브라우저 기능 접근이 예외를 내도 폼 제출용 빈 헤더를 반환한다", () => {
    vi.stubGlobal("window", {})
    mocks.supports.mockImplementation(() => { throw new Error("blocked") })
    expect(consentObservationHeaders()).toEqual({})
  })
})
