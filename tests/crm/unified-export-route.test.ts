/**
 * GET /api/admin/crm/customers/export (SG8) — 역할(SUPER_ADMIN·ADMIN만) · 목록과 같은 쿼리 파서 ·
 * 상한 절단 헤더 · 통화별 금액 열 · 메모 본문 제외 · 감사 로그 계약.
 */
import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildUnifiedCustomersCsv, kstDate, kstDateTime, unifiedCustomerCsvColumns } from "@/app/api/admin/crm/customers/export/unified-customers-csv"
import type { CrmUnifiedCustomerRow } from "@/lib/crm/unified-view-rules"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getCrmUnifiedCustomersForExport: vi.fn(),
  logAdminAudit: vi.fn(),
  listAdminUserDirectory: vi.fn(),
  findAdminCrmOwner: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN"],
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit: mocks.logAdminAudit }))
vi.mock("@/lib/repositories/admin-users", () => ({
  CURRENT_ADMIN_OWNER_TOKEN: "__me",
  listAdminUserDirectory: mocks.listAdminUserDirectory,
  findAdminCrmOwner: mocks.findAdminCrmOwner,
}))
vi.mock("@/lib/repositories/crm-unified-customers", () => ({
  CRM_UNIFIED_EXPORT_MAX_ROWS: 5000,
  getCrmUnifiedCustomersForExport: mocks.getCrmUnifiedCustomersForExport,
}))

const NOW_ISO = "2026-09-25T03:00:00.000Z"

function row(partial: Partial<CrmUnifiedCustomerRow>): CrmUnifiedCustomerRow {
  return {
    key: "neo:A",
    source: "neo_account",
    sourceLabel: "고객",
    name: "가나학원",
    contact: "010-1234-5678",
    regionLabel: "부산",
    ownerName: "박담당",
    ownerKeys: ["박담당"],
    lifecycle: "account_risk",
    statusLabel: "관리 필요",
    nextActionLabel: "연장 제안",
    priorityReason: "10일 내 만료",
    score: 90,
    bucket: "today",
    moneyLabel: "잔액 ¥1.2만 · 오더 $1,500",
    moneyState: "value",
    href: "#",
    updatedAt: "2026-09-01T00:00:00.000Z",
    expireAt: "2026-10-05T00:00:00.000Z",
    balance: 12_000,
    tags: ["VIP", "재계약"],
    origin: null,
    crmRegistered: false,
    provisional: false,
    slaTarget: false,
    firstResponseAt: null,
    createdAt: null,
    lastContactAt: "2026-09-22T01:30:00.000Z",
    lastContactSource: "compass",
    lastContactChannel: "call",
    lastContactActor: "진소망",
    depletionInDays: 12,
    billingMode: "consumption",
    riskLevel: "soon",
    riskReasonLabels: ["재충전 임박"],
    lastClassAt: "2026-09-20T00:00:00.000Z",
    orderAmountUsd: 1500,
    ...partial,
  }
}

async function loadRoute() {
  vi.resetModules()
  return import("@/app/api/admin/crm/customers/export/route")
}

describe("GET /api/admin/crm/customers/export", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1", role: "ADMIN", name: "관리자" })
    mocks.getCrmUnifiedCustomersForExport.mockResolvedValue({
      generatedAt: NOW_ISO,
      total: 7210,
      rows: [row({})],
      truncated: true,
      limit: 5000,
      meta: { compass: "ok", homeContactDetail: "ok" },
      segmentLabels: ["만료 30일 이내"],
    })
  })

  it("SUPER_ADMIN·ADMIN 만 — 역할 목록을 인증에 넘기고, 거절 응답은 그대로 돌려준다", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/customers/export"))

    expect(response.status).toBe(403)
    expect(mocks.requireVerifiedAdminContext.mock.calls[0][1]).toEqual(["SUPER_ADMIN", "ADMIN"])
    expect(mocks.getCrmUnifiedCustomersForExport).not.toHaveBeenCalled()
  })

  it("목록과 같은 파서로 조건을 읽고(모르는 값은 버림) 상한까지 조건 전체를 CSV 로 내려준다", async () => {
    const { GET } = await loadRoute()
    const response = await GET(
      new NextRequest(
        "https://classin.kr/api/admin/crm/customers/export?view=expiring&source=neo_account&expDays=30&risk=urgent&risk=bogus&sort=last_contact&keys=neo:A,neo:B&keys=lead:1&limit=10&offset=50"
      )
    )

    expect(response.status).toBe(200)
    const [options, cap] = mocks.getCrmUnifiedCustomersForExport.mock.calls[0]
    expect(cap).toBe(5000)
    expect(options).toMatchObject({
      view: "expiring",
      source: "neo_account",
      segment: { expDays: 30, risk: ["urgent"] },
      sort: { key: "last_contact", direction: "asc" },
      keys: ["neo:A", "neo:B", "lead:1"],
    })
    expect(options).not.toHaveProperty("limit")
    expect(options).not.toHaveProperty("offset")

    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8")
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="crm-customers-selected-2026-09-25.csv"')
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("X-Export-Truncated")).toBe("1")
    expect(response.headers.get("X-Export-Total")).toBe("7210")
    expect(response.headers.get("X-Export-Rows")).toBe("1")

    const csv = await response.text()
    expect(csv.split("\r\n")[0]).toContain("고객 키,구분,출처,고객명,연락처")
    expect(csv).toContain("010-1234-5678")
  })

  it("내보낼 때마다 조건·건수만 감사 로그에 남긴다(행 내용 없음)", async () => {
    const { GET } = await loadRoute()
    await GET(new NextRequest("https://classin.kr/api/admin/crm/customers/export?expDays=30"))

    expect(mocks.logAdminAudit).toHaveBeenCalledTimes(1)
    const [entry] = mocks.logAdminAudit.mock.calls[0]
    expect(entry).toMatchObject({
      action: "crm.customers.export",
      targetType: "crm_customer",
      payload: { rows: 1, total: 7210, truncated: true, selected: 0, conditions: ["만료 30일 이내"] },
    })
    expect(JSON.stringify(entry.payload)).not.toContain("010-1234-5678")
  })

  it("OR 그룹(`or`, 세그먼트 허브)도 같은 파서로 받는다 — 감사 로그 조건 문구는 저장소가 만든 OR 문구 그대로", async () => {
    mocks.getCrmUnifiedCustomersForExport.mockResolvedValueOnce({
      generatedAt: NOW_ISO,
      total: 2,
      rows: [row({})],
      truncated: false,
      limit: 5000,
      meta: { compass: "ok", homeContactDetail: "ok" },
      segmentLabels: ["만료 60일 이내", "(무연락 60일+) 또는 (위험 긴급)"],
    })
    const { GET } = await loadRoute()
    const response = await GET(
      new NextRequest(
        "https://classin.kr/api/admin/crm/customers/export?expDays=60&or=risk%3Durgent&or=noContactDays%3D60&or=risk%3Dbogus"
      )
    )

    expect(response.status).toBe(200)
    expect(mocks.getCrmUnifiedCustomersForExport.mock.calls[0][0].segment).toEqual({
      expDays: 60,
      anyOf: [{ noContactDays: 60 }, { risk: ["urgent"] }],
    })
    expect(mocks.logAdminAudit.mock.calls[0][0].payload.conditions).toEqual([
      "만료 60일 이내",
      "(무연락 60일+) 또는 (위험 긴급)",
    ])
  })

  it("내 담당(__me)은 로그인 담당자 키로 풀어 넘긴다", async () => {
    mocks.listAdminUserDirectory.mockResolvedValue([])
    mocks.findAdminCrmOwner.mockReturnValue({ ownerKeys: ["김담당", "neo-1"] })
    const { GET } = await loadRoute()
    await GET(new NextRequest("https://classin.kr/api/admin/crm/customers/export?owner=__me"))

    expect(mocks.getCrmUnifiedCustomersForExport.mock.calls[0][0]).toMatchObject({ owner: undefined, ownerKeys: ["김담당", "neo-1"] })
  })

  it("저장소 오류는 한국어 500", async () => {
    mocks.getCrmUnifiedCustomersForExport.mockRejectedValueOnce(new Error("boom"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/customers/export"))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "고객 목록 CSV를 만들지 못했습니다." })
    errorSpy.mockRestore()
  })
})

describe("통합 고객 CSV 열", () => {
  const nowMs = Date.parse(NOW_ISO)

  it("금액은 통화별 열로만 — 잔액(CNY)·오더(USD)·계약/미수(KRW)를 합치지 않는다", () => {
    const headers = unifiedCustomerCsvColumns(nowMs).map((column) => column.header)
    expect(headers).toEqual(expect.arrayContaining(["잔액(CNY ¥)", "오더(USD $)", "계약(KRW ₩)", "미수(KRW ₩)"]))
    expect(headers.some((header) => header.includes("합계") || header === "금액")).toBe(false)

    const csv = buildUnifiedCustomersCsv(
      [row({}), row({ key: "customer:C", source: "customer", balance: null, orderAmountUsd: null, contractedKrw: 1_000_000, outstandingKrw: 200_000 })],
      nowMs
    )
    const [header, neoLine, customerLine] = csv.replace(/^﻿/, "").split("\r\n")
    const cell = (line: string, name: string) => line.split(",")[header.split(",").indexOf(name)]
    expect(cell(neoLine, "잔액(CNY ¥)")).toBe("12000")
    expect(cell(neoLine, "오더(USD $)")).toBe("1500")
    expect(cell(neoLine, "계약(KRW ₩)")).toBe("")
    expect(cell(customerLine, "잔액(CNY ¥)")).toBe("")
    expect(cell(customerLine, "계약(KRW ₩)")).toBe("1000000")
    expect(cell(customerLine, "미수(KRW ₩)")).toBe("200000")
  })

  it("마지막 연락·NEO 신호 열 — 표시 이름으로, 기록이 없으면 '기록 없음'", () => {
    const csv = buildUnifiedCustomersCsv([row({}), row({ key: "lead:1", source: "lead", lastContactAt: null, lastContactSource: null })], nowMs)
    const [header, first, second] = csv.replace(/^﻿/, "").split("\r\n")
    const names = header.split(",")
    const cell = (line: string, name: string) => line.split(",")[names.indexOf(name)]
    expect(cell(first, "마지막 연락일시")).toBe("2026-09-22 10:30")
    expect(cell(first, "마지막 연락 경과(일)")).toBe("3")
    expect(cell(first, "마지막 연락 채널")).toBe("Compass 콜")
    expect(cell(first, "마지막 연락자")).toBe("진소망")
    expect(cell(first, "과금 방식")).toBe("충전제")
    expect(cell(first, "위험 등급")).toBe("임박")
    expect(cell(first, "소진 예상(일)")).toBe("12")
    expect(cell(second, "마지막 연락 채널")).toBe("기록 없음")
  })

  it("수식 주입 방어·BOM — lib/crm/csv.ts 규약", () => {
    const csv = buildUnifiedCustomersCsv([row({ name: "=HYPERLINK(\"x\")" })], nowMs)
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })

  it("메모·기록 본문 열이 없다(개인정보 최소화)", () => {
    const headers = unifiedCustomerCsvColumns(nowMs).map((column) => column.header)
    expect(headers.some((header) => /메모|본문|노트/.test(header))).toBe(false)
  })

  it("날짜는 KST", () => {
    expect(kstDate("2026-09-24T16:00:00.000Z")).toBe("2026-09-25")
    expect(kstDateTime("2026-09-24T16:05:00.000Z")).toBe("2026-09-25 01:05")
    expect(kstDate(null)).toBe("")
  })
})
