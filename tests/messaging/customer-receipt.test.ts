import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 접수 확인 발송. 발송 레이어(lib/messaging/send)는 모킹하고 채널 선택과 문구만 본다.
 *
 * 채널 선택이 핵심이다 — 알림톡 템플릿은 카카오 비즈니스 채널 사전 승인이 필요해서,
 * 승인 전에는 문자로 나가고 템플릿 ID 환경변수가 채워지면 알림톡으로 바뀌어야 한다.
 */

const SIMULATED = {
  provider: "solapi" as const,
  channel: "sms" as const,
  requested: 1,
  sent: 0,
  failed: 0,
  simulated: 1,
  results: [],
}

async function load() {
  vi.resetModules()
  const sendSmsMessages = vi.fn().mockResolvedValue(SIMULATED)
  const sendKakaoAlimtalk = vi.fn().mockResolvedValue(SIMULATED)
  vi.doMock("@/lib/messaging/send", () => ({ sendSmsMessages, sendKakaoAlimtalk }))
  const mod = await import("@/lib/messaging/customer-receipt")
  return { mod, sendSmsMessages, sendKakaoAlimtalk }
}

const SHOWROOM = {
  bookingId: "booking-1",
  phone: "010-1234-5678",
  visitDate: "2026-09-24",
  visitTime: "14:00",
}

const CHECKOUT = {
  requestId: "req-1",
  phone: "010-1234-5678",
  desiredDate: "2026-09-24",
  items: [{ name: '86" Classin 전자칠판' }, { name: "벽걸이 설치" }],
  totalAmount: 6_800_000,
  currency: "KRW",
}

describe("접수 확인 발송", () => {
  beforeEach(() => {
    delete process.env.SOLAPI_TEMPLATE_SHOWROOM_BOOKING
    delete process.env.SOLAPI_TEMPLATE_CHECKOUT_REQUEST
  })

  afterEach(() => {
    delete process.env.SOLAPI_TEMPLATE_SHOWROOM_BOOKING
    delete process.env.SOLAPI_TEMPLATE_CHECKOUT_REQUEST
    vi.resetModules()
  })

  it("템플릿이 없으면 문자로 보낸다", async () => {
    const { mod, sendSmsMessages, sendKakaoAlimtalk } = await load()

    await mod.sendShowroomBookingReceipt(SHOWROOM)

    expect(sendKakaoAlimtalk).not.toHaveBeenCalled()
    expect(sendSmsMessages).toHaveBeenCalledTimes(1)
    expect(sendSmsMessages.mock.calls[0][0].messages[0].to).toBe(SHOWROOM.phone)
  })

  it("템플릿 ID 가 채워지면 코드 변경 없이 알림톡으로 바뀐다", async () => {
    process.env.SOLAPI_TEMPLATE_SHOWROOM_BOOKING = "TPL_SHOWROOM_001"
    const { mod, sendSmsMessages, sendKakaoAlimtalk } = await load()

    await mod.sendShowroomBookingReceipt(SHOWROOM)

    expect(sendSmsMessages).not.toHaveBeenCalled()
    expect(sendKakaoAlimtalk).toHaveBeenCalledWith(
      expect.objectContaining({ to: SHOWROOM.phone, templateId: "TPL_SHOWROOM_001" })
    )
  })

  it("빈 문자열 템플릿은 미설정으로 본다", async () => {
    process.env.SOLAPI_TEMPLATE_SHOWROOM_BOOKING = "   "
    const { mod, sendSmsMessages, sendKakaoAlimtalk } = await load()

    await mod.sendShowroomBookingReceipt(SHOWROOM)

    expect(sendKakaoAlimtalk).not.toHaveBeenCalled()
    expect(sendSmsMessages).toHaveBeenCalledTimes(1)
  })

  it("쇼룸 문구는 확정이 아니라 접수라고 말한다", async () => {
    const { mod, sendSmsMessages } = await load()

    await mod.sendShowroomBookingReceipt(SHOWROOM)
    const text: string = sendSmsMessages.mock.calls[0][0].messages[0].text

    expect(text).toContain("접수되었습니다")
    expect(text).toContain("9/24(목) 14:00")
    expect(text).toContain("확인 후 확정 연락")
    // 요청형이라 이 문자가 확정으로 읽히면 안 된다.
    expect(text).not.toContain("확정되었습니다")
  })

  it("신청 문구에 구성 요약·합계·과세 기준이 들어간다", async () => {
    const { mod, sendSmsMessages } = await load()

    await mod.sendCheckoutRequestReceipt(CHECKOUT)
    const text: string = sendSmsMessages.mock.calls[0][0].messages[0].text

    // 전 품목을 펼치면 LMS 로 넘어가고 읽히지도 않는다 — 첫 품목 + 나머지 건수로 접는다.
    expect(text).toContain('86" Classin 전자칠판 외 1건')
    expect(text).toContain("₩6,800,000")
    expect(text).toContain("부가세 별도")
    expect(text).toContain("9/24(목)")
  })

  it("품목이 하나면 접지 않는다", async () => {
    const { mod, sendSmsMessages } = await load()

    await mod.sendCheckoutRequestReceipt({ ...CHECKOUT, items: [{ name: "AI Studio 패키지" }] })
    const text: string = sendSmsMessages.mock.calls[0][0].messages[0].text

    expect(text).toContain("AI Studio 패키지")
    expect(text).not.toContain("외 0건")
  })

  it("USD 신청도 통화 기호를 맞춘다", async () => {
    const { mod, sendSmsMessages } = await load()

    await mod.sendCheckoutRequestReceipt({
      ...CHECKOUT,
      items: [{ name: "Standard 연 결제" }],
      totalAmount: 990,
      currency: "USD",
    })
    const text: string = sendSmsMessages.mock.calls[0][0].messages[0].text

    expect(text).toContain("$990")
  })

  it("발송 컨텍스트에 어떤 접수인지 남긴다 — message_logs 추적용", async () => {
    const { mod, sendSmsMessages } = await load()

    await mod.sendCheckoutRequestReceipt(CHECKOUT)

    expect(sendSmsMessages.mock.calls[0][0].context).toEqual({
      source: "checkout_request",
      refId: "req-1",
    })
  })
})
