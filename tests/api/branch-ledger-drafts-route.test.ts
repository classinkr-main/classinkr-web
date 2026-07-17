import { readFileSync } from "fs"
import { join } from "path"
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 되돌리기 부활 버그(P0) 회귀 — GET 라우트를 실제로 실행해 reversedDraftIds 계약을 검증한다
// (파일 내 다른 describe들과 달리 소스 스캔이 아니라 진짜 호출 — tests/api/admin-hardware-movements.test.ts와
// 동일 requireVerifiedAdminContext 모킹 관례를 따른다). 아래 모킹은 이 파일에서 실제로
// route 모듈을 동적 import하는 describe(맨 아래)에만 영향을 준다 — 다른 블록은 readFileSync만
// 쓰므로 무관하다.
const requireVerifiedAdminContext = vi.fn()
const listBranchSalesLedgerDrafts = vi.fn()
const listBranchSalesLedgerEntries = vi.fn()
const createBranchSalesLedgerDraft = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"],
  CRM_STAFF_ADMIN_API_ROLES: ["ADMIN"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/branch-sales-ledger-drafts", () => ({
  BRANCH_SALES_LEDGER_DRAFT_KINDS: ["new-row", "edit-row"],
  BRANCH_SALES_LEDGER_DRAFT_STATUSES: ["draft", "checked", "applied", "cancelled"],
  createBranchSalesLedgerDraft,
  isBranchSalesLedgerDraftsNotReadyError: () => false,
  listBranchSalesLedgerDrafts,
  listBranchSalesLedgerEntries,
}))

const routePath = join(
  process.cwd(),
  "app/api/admin/branch/ledger-drafts/[id]/route.ts",
)
const collectionRoutePath = join(
  process.cwd(),
  "app/api/admin/branch/ledger-drafts/route.ts",
)
const repositoryPath = join(
  process.cwd(),
  "lib/repositories/branch-sales-ledger-drafts.ts",
)

function routeSource() {
  return readFileSync(routePath, "utf8")
}

function collectionRouteSource() {
  return readFileSync(collectionRoutePath, "utf8")
}

function repositorySource() {
  return readFileSync(repositoryPath, "utf8")
}

describe("branch ledger draft route", () => {
  it("requires the explicit apply action for applied status transitions", () => {
    const route = routeSource()

    expect(route).toContain('raw.status === "applied"')
    expect(route).toContain("Use action=apply to apply a checked draft")
    expect(route).toContain('action === "apply"')
    expect(route).toContain("applyBranchSalesLedgerDraft(id, actor)")
  })

  it("only applies drafts that are already checked", () => {
    const repository = repositorySource()

    expect(repository).toContain("applyBranchSalesLedgerDraft")
    expect(repository).toContain('rpc("apply_branch_sales_ledger_draft"')
    expect(repository).toContain("p_actor: actor")
    expect(repository).toContain("p_draft_id: id")
    expect(repository).toContain("BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG")
  })

  it("returns internal ledger entries with separate health from the draft queue", () => {
    const route = collectionRouteSource()
    const repository = repositorySource()

    expect(route).toContain("listBranchSalesLedgerEntries")
    expect(route).toContain("entries: entryResult.entries")
    expect(route).toContain("ledgerHealth: entryResult.health")
    expect(repository).toContain('from("branch_sales_ledger_entries")')
    expect(repository).toContain("listBranchSalesLedgerEntries")
  })

  it("does not mutate applied drafts through repository update/delete paths", () => {
    const repository = repositorySource()

    expect(repository).toContain('.neq("status", "applied")')
    expect(repository).toContain('.neq("status", "checked")')
  })

  // 웨이브 5 — 되돌리기(reverse). id 파라미터는 apply와 동일 계약(draft id)이고, repository가
  // draft_id -> entry_id 매핑을 내부에서 해결한다. draft.status는 절대 건드리지 않는다.
  it("wires action=reverse through the same draft-id-keyed PATCH contract as apply", () => {
    const route = routeSource()

    expect(route).toContain('action === "reverse"')
    expect(route).toContain("reverseBranchSalesLedgerEntryByDraftId(id, actor, reason)")
    expect(route).toContain("해당 초안에 연결된 적용 항목을 찾을 수 없습니다.")
    expect(route).toContain("NextResponse.json({ entry })")
  })

  it("maps the duplicate-active-correction conflict to 409, not 500", () => {
    const route = routeSource()

    expect(route).toContain("duplicateActiveCorrectionResponse")
    expect(route).toContain("isBranchSalesLedgerDuplicateActiveCorrectionError")
    expect(route).toContain("status: 409")
  })

  it("resolves draft_id -> entry_id and calls the idempotent reversal RPC without mutating draft status", () => {
    const repository = repositorySource()

    expect(repository).toContain("export async function reverseBranchSalesLedgerEntryByDraftId")
    expect(repository).toContain('.eq("draft_id", draftId)')
    expect(repository).toContain('rpc("reverse_branch_sales_ledger_entry"')
    expect(repository).toContain("p_entry_id: entryRow.id")
    // The audit-trail invariant: this function must never touch branch_sales_ledger_drafts.
    const fnStart = repository.indexOf("export async function reverseBranchSalesLedgerEntryByDraftId")
    const fnBody = repository.slice(fnStart, repository.indexOf("\n}\n", fnStart))
    expect(fnBody).not.toContain('from("branch_sales_ledger_drafts")')
  })

  it("surfaces the active-manual-edit unique-index violation as a friendly, recognizable error", () => {
    const repository = repositorySource()

    expect(repository).toContain("branch_sales_ledger_entries_active_manual_edit_unique")
    expect(repository).toContain("isBranchSalesLedgerDuplicateActiveCorrectionError")
    expect(repository).toContain("이미 이 딜·월에 적용된 정정 항목이 있습니다")
  })
})

function ledgerDraftsRequest(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/branch/ledger-drafts${query}`)
}

function mockAdmin() {
  requireVerifiedAdminContext.mockResolvedValue({
    source: "supabase",
    role: "ADMIN",
    name: "Tester",
    userId: "admin-1",
  })
}

describe("GET /api/admin/branch/ledger-drafts — reversedDraftIds (P0 되돌리기 부활 버그, item 1)", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("active entries와 별도로 status:'reversed'를 조회해 draftId 목록을 reversedDraftIds로 내려준다", async () => {
    mockAdmin()
    listBranchSalesLedgerDrafts.mockResolvedValue({
      generatedAt: "2026-07-17T00:00:00Z",
      health: { ok: true, message: null },
      drafts: [],
    })
    listBranchSalesLedgerEntries.mockImplementation(async (options: { status?: string; limit?: number } = {}) => {
      if (options.status === "reversed") {
        return {
          generatedAt: "2026-07-17T00:00:00Z",
          health: { ok: true, message: null },
          entries: [{ id: "entry-2", draftId: "draft-2", entryStatus: "reversed" }],
        }
      }
      return {
        generatedAt: "2026-07-17T00:00:00Z",
        health: { ok: true, message: null },
        entries: [{ id: "entry-1", draftId: "draft-1", entryStatus: "active" }],
      }
    })

    const { GET } = await import("@/app/api/admin/branch/ledger-drafts/route")
    const response = await GET(ledgerDraftsRequest())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.entries).toEqual([{ id: "entry-1", draftId: "draft-1", entryStatus: "active" }])
    expect(json.reversedDraftIds).toEqual(["draft-2"])
    // active 조회(limit 200)와 reversed 조회(limit 200)를 하나로 합쳐 200으로 자르면 reversed가
    // active 항목들에 밀려 잘릴 수 있다 — 반드시 별도 호출 + 별도 한도여야 한다(항목 1 설계 의도).
    expect(listBranchSalesLedgerEntries).toHaveBeenCalledWith({ limit: 200 })
    expect(listBranchSalesLedgerEntries).toHaveBeenCalledWith({ status: "reversed", limit: 200 })
  })

  it("reversed entry에 draftId가 없거나 중복돼도(방어적) 정제된 유일 목록만 내려준다", async () => {
    mockAdmin()
    listBranchSalesLedgerDrafts.mockResolvedValue({
      generatedAt: "x",
      health: { ok: true, message: null },
      drafts: [],
    })
    listBranchSalesLedgerEntries.mockImplementation(async (options: { status?: string } = {}) => {
      if (options.status === "reversed") {
        return {
          generatedAt: "x",
          health: { ok: true, message: null },
          entries: [
            { id: "entry-3", entryStatus: "reversed" }, // draftId 없음 — 방어적으로 제외돼야 함
            { id: "entry-4", draftId: "draft-4", entryStatus: "reversed" },
            { id: "entry-5", draftId: "draft-4", entryStatus: "reversed" }, // 중복 draftId
          ],
        }
      }
      return { generatedAt: "x", health: { ok: true, message: null }, entries: [] }
    })

    const { GET } = await import("@/app/api/admin/branch/ledger-drafts/route")
    const response = await GET(ledgerDraftsRequest())
    const json = await response.json()

    expect(json.reversedDraftIds).toEqual(["draft-4"])
  })

  it("reversed 목록이 비어 있으면 reversedDraftIds도 빈 배열이다(정상 케이스 회귀 방지)", async () => {
    mockAdmin()
    listBranchSalesLedgerDrafts.mockResolvedValue({
      generatedAt: "x",
      health: { ok: true, message: null },
      drafts: [],
    })
    listBranchSalesLedgerEntries.mockResolvedValue({
      generatedAt: "x",
      health: { ok: true, message: null },
      entries: [],
    })

    const { GET } = await import("@/app/api/admin/branch/ledger-drafts/route")
    const response = await GET(ledgerDraftsRequest())
    const json = await response.json()

    expect(json.reversedDraftIds).toEqual([])
  })
})
