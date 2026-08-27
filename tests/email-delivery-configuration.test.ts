import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const originalWebhookUrl = process.env.EMAIL_WEBHOOK_URL
const originalGoogleSender = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL

async function loadEmailWithoutProvider() {
  vi.resetModules()
  vi.doMock("@/lib/resend", () => ({ resend: null }))
  delete process.env.EMAIL_WEBHOOK_URL
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  return import("@/lib/email")
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe("email provider configuration", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    restoreEnv("EMAIL_WEBHOOK_URL", originalWebhookUrl)
    restoreEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", originalGoogleSender)
    vi.doUnmock("@/lib/resend")
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("does not count campaign simulation as a successful delivery", async () => {
    const { sendBatchEmail } = await loadEmailWithoutProvider()

    const result = await sendBatchEmail([
      { to: "first@example.com", subject: "제목", html: "<p>본문</p>" },
      { to: "second@example.com", subject: "제목", html: "<p>본문</p>" },
    ])

    expect(result).toEqual({
      provider: "simulation",
      sent: 0,
      failed: 2,
      errors: ["이메일 발송 공급자가 설정되지 않았습니다."],
    })
  })

  it("does not count an internal notification simulation as delivered", async () => {
    const { sendInternalNotification } = await loadEmailWithoutProvider()

    const result = await sendInternalNotification({
      to: ["ops@example.com"],
      subject: "운영 알림",
      html: "<p>확인 필요</p>",
    })

    expect(result).toMatchObject({
      provider: "simulation",
      sent: 0,
      failed: 1,
    })
  })
})
