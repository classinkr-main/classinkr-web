import { afterEach, describe, expect, it, vi } from "vitest"

async function loadScanner(options: { deliveryError?: Error } = {}) {
  vi.resetModules()
  const markLeadAlertSent = vi.fn().mockResolvedValue(undefined)
  const emitNotificationEvent = options.deliveryError
    ? vi.fn().mockRejectedValue(options.deliveryError)
    : vi.fn().mockResolvedValue({ id: "event-1", deliveryResults: [{ status: "sent" }] })

  vi.doMock("@/lib/repositories/leads", () => ({
    getLeads: vi.fn().mockResolvedValue([
      {
        id: "lead-1",
        source: "contact_page",
        name: "운영 리드",
        org: "운영 학원",
        email: "ops@example.com",
        status: "new",
        timestamp: new Date(Date.now() - 25 * 3_600_000).toISOString(),
      },
      {
        id: "test-lead",
        source: "meta_lead_ads",
        name: "<test lead: dummy data>",
        email: "test@meta.com",
        status: "new",
        timestamp: new Date(Date.now() - 72 * 3_600_000).toISOString(),
      },
    ]),
  }))
  vi.doMock("@/lib/repositories/lead-alert-states", () => ({
    listLeadAlertStates: vi.fn().mockResolvedValue([]),
    getLeadAlertState: vi.fn().mockResolvedValue(null),
    markLeadAlertSent,
  }))
  vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))

  const { scanLeadResponseAlerts } = await import("@/lib/server/lead-response-alerts")
  return { scanLeadResponseAlerts, emitNotificationEvent, markLeadAlertSent }
}

describe("lead response alerts", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("excludes test leads and records state only after lead-report delivery succeeds", async () => {
    const { scanLeadResponseAlerts, emitNotificationEvent, markLeadAlertSent } = await loadScanner()

    const result = await scanLeadResponseAlerts()

    expect(result).toMatchObject({ scanned: 2, unresponded: 1, sent: 1 })
    expect(emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        routeUrl: "/admin/crm/customers/leads?filter=unresponded_24h&focus=risk",
        channels: ["wecom_lead_report_webhook"],
        requireSuccessfulDelivery: true,
      })
    )
    expect(markLeadAlertSent).toHaveBeenCalledTimes(1)
  })

  it("does not mark a skipped or failed delivery as sent", async () => {
    const { scanLeadResponseAlerts, markLeadAlertSent } = await loadScanner({
      deliveryError: new Error("wecom_lead_report_webhook: skipped"),
    })

    const result = await scanLeadResponseAlerts()

    expect(result.sent).toBe(0)
    expect(result.errors).toEqual([expect.stringContaining("skipped")])
    expect(markLeadAlertSent).not.toHaveBeenCalled()
  })
})
