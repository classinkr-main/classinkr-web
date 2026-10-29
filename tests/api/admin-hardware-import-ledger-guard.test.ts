import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ replace: vi.fn(), find: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({
  HARDWARE_EDITOR_ADMIN_API_ROLES: ["admin"],
  requireVerifiedAdminContext: vi.fn(async () => ({ name: "test", role: "admin" })),
}))
vi.mock("@/lib/branch/parsers/xlsx-grid", () => ({ workbookToLedger: vi.fn(async () => ({})) }))
vi.mock("@/lib/branch/parsers/hw-ledger", () => ({
  parseLedgerWorkbook: vi.fn(() => ({ stats: { lots: ["H1"] }, inbound: [], outbound: [], warnings: [] })),
}))
vi.mock("@/lib/repositories/branch-hw", () => ({
  replaceHwInbound: mocks.replace, replaceHwOutbound: mocks.replace,
  replaceHwStock: mocks.replace, replaceHwSalesMonthly: mocks.replace,
}))
vi.mock("@/lib/repositories/branch-sync", () => ({ findActiveSyncRun: mocks.find }))
vi.mock("@/lib/repositories/hardware-inventory", () => ({ findRunningHardwareImportRun: mocks.find, importHardwareFromBranchSheets: mocks.replace }))
vi.mock("@/lib/server/sync-cache-tags", () => ({ expireSyncCacheTags: vi.fn() }))
vi.mock("@/lib/branch/sync/write-guard", () => ({ checkSyncWriteAllowed: () => ({ allowed: false, outcome: "skipped", outcomeReason: "비운영 쓰기 차단" }) }))

import { POST } from "@/app/api/admin/hardware/import-ledger/route"

function request(dryRun = false) {
  const form = new FormData()
  form.append("file", new File(["test"], "ledger.xlsx"))
  form.append("dryRun", String(dryRun))
  return new NextRequest("https://classin.co.kr/api/admin/hardware/import-ledger", { method: "POST", body: form })
}

describe("hardware ledger upload write guard", () => {
  it("비운영 환경에서 직접 업로드해도 DB 조회·교체를 하지 않는다", async () => {
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ reason: "upload-unavailable", ledgerChanged: false })
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("쓰기 없는 dry-run 파싱은 허용한다", async () => {
    const response = await POST(request(true))
    expect(await response.json()).toMatchObject({ ok: true, dryRun: true })
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
