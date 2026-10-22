import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const runHardwareSheetAutoImport = vi.hoisted(() => vi.fn())
const runRecentLeadCustomerAutoLink = vi.hoisted(() => vi.fn())

vi.mock("@/lib/hardware/sheet-auto-import", () => ({ runHardwareSheetAutoImport }))
vi.mock("@/lib/server/lead-customer-autolink", () => ({ runRecentLeadCustomerAutoLink }))

import { GET } from "@/app/api/cron/link-hourly/route"

const ORIGINAL_ENV = { ...process.env }
const leadOk = { status: "ok", recentLeads: 3, generatedCandidates: 2, insertedCandidates: 1, autoConfirmed: 1 }

function cronRequest(authorization?: string) {
  return new NextRequest("https://classin.kr/api/cron/link-hourly", {
    headers: authorization ? { authorization } : {},
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-test-secret"
  runHardwareSheetAutoImport.mockReset()
  runRecentLeadCustomerAutoLink.mockReset()
  runHardwareSheetAutoImport.mockResolvedValue({ status: "unchanged", runId: "run-prev", checkedAt: "t" })
  runRecentLeadCustomerAutoLink.mockResolvedValue(leadOk)
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("GET /api/cron/link-hourly", () => {
  it("rejects a missing CRON_SECRET without running jobs", async () => {
    delete process.env.CRON_SECRET

    const response = await GET(cronRequest("Bearer whatever"))

    expect(response.status).toBe(401)
    expect(runHardwareSheetAutoImport).not.toHaveBeenCalled()
    expect(runRecentLeadCustomerAutoLink).not.toHaveBeenCalled()
  })

  it("rejects a wrong bearer without running jobs", async () => {
    const response = await GET(cronRequest("Bearer wrong"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" })
    expect(runHardwareSheetAutoImport).not.toHaveBeenCalled()
  })

  it("runs both jobs and returns 200 when neither failed", async () => {
    const response = await GET(cronRequest("Bearer cron-test-secret"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      hardwareSheetImport: { status: "unchanged", runId: "run-prev", checkedAt: "t" },
      leadCustomerLink: leadOk,
    })
  })

  it("still links leads when the hardware job fails, and reports 500", async () => {
    runHardwareSheetAutoImport.mockResolvedValue({ status: "failed", stage: "sheet_sync", error: "403" })

    const response = await GET(cronRequest("Bearer cron-test-secret"))

    expect(response.status).toBe(500)
    expect(runRecentLeadCustomerAutoLink).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toMatchObject({ ok: false, leadCustomerLink: leadOk })
  })

  it("contains a thrown hardware precheck error without its raw message", async () => {
    runHardwareSheetAutoImport.mockRejectedValue(new Error("connection refused at 10.0.0.1"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await GET(cronRequest("Bearer cron-test-secret"))

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.hardwareSheetImport).toEqual({ status: "failed", stage: "precheck" })
    expect(JSON.stringify(body)).not.toContain("10.0.0.1")
    expect(runRecentLeadCustomerAutoLink).toHaveBeenCalledTimes(1)
  })

  it("reports 500 when only the lead job fails", async () => {
    runRecentLeadCustomerAutoLink.mockResolvedValue({ ...leadOk, status: "failed", error: "Lead customer auto-link failed." })

    const response = await GET(cronRequest("Bearer cron-test-secret"))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ ok: false, hardwareSheetImport: { status: "unchanged" } })
  })
})
