import { beforeEach, describe, expect, it, vi } from "vitest"

// 장부의 동기화 요청(client-api postBranchSync) — 시트 고정 중 관리자의 "12/1 스냅샷 다시 읽기"만
// 본문에 revSnapshotReread: true 를 싣는다. 서버(app/api/admin/branch/sync/route.ts)는 글자 그대로 true 일 때만 받는다.
// 옵션이 없으면 지금 요청 모양 그대로({ sources }).

const adminFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
vi.mock("@/lib/admin-client", () => ({
  adminFetch: (url: string, init?: RequestInit) => adminFetch(url, init),
  adminFetchJson: vi.fn(),
  adminFetchJsonCachedWithMeta: vi.fn(),
  clearAdminRequestCache: vi.fn(),
}))

import { branchSyncRequestBody, postBranchSync } from "@/components/admin/branch/client-api"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function sentBody(call = 0): unknown {
  const init = adminFetch.mock.calls[call]?.[1]
  return JSON.parse(String(init?.body))
}

beforeEach(() => {
  adminFetch.mockReset()
})

describe("branchSyncRequestBody", () => {
  it("옵션이 없거나 false 면 { sources } 그대로 — revSnapshotReread 키가 없다", () => {
    expect(branchSyncRequestBody(["rev", "hw"])).toEqual({ sources: ["rev", "hw"] })
    expect(branchSyncRequestBody(["rev"], { revSnapshotReread: false })).toEqual({ sources: ["rev"] })
    expect("revSnapshotReread" in branchSyncRequestBody(["rev"], {})).toBe(false)
  })

  it("revSnapshotReread: true 일 때만 싣는다", () => {
    expect(branchSyncRequestBody(["rev"], { revSnapshotReread: true })).toEqual({ sources: ["rev"], revSnapshotReread: true })
  })

  it("넘긴 배열을 바꾸지 않는다", () => {
    const sources: Array<"rev" | "hw"> = ["rev"]
    const body = branchSyncRequestBody(sources, { revSnapshotReread: true })
    body.sources.push("hw")
    expect(sources).toEqual(["rev"])
  })
})

describe("postBranchSync", () => {
  it("지금 호출(옵션 없음)은 예전과 같은 POST 본문", async () => {
    adminFetch.mockResolvedValue(jsonResponse({ ok: true, outcome: "done" }))
    const result = await postBranchSync(["rev", "hw"])
    expect(adminFetch).toHaveBeenCalledTimes(1)
    expect(adminFetch.mock.calls[0][0]).toBe("/api/admin/branch/sync")
    expect(adminFetch.mock.calls[0][1]?.method).toBe("POST")
    expect(sentBody()).toEqual({ sources: ["rev", "hw"] })
    expect(result.status).toBe(200)
    expect(result.body?.outcome).toBe("done")
  })

  it("스냅샷 다시 읽기는 { sources: ['rev'], revSnapshotReread: true } 를 보내고, 고정 필드를 그대로 돌려준다", async () => {
    adminFetch.mockResolvedValue(jsonResponse({
      ok: true,
      outcome: "done",
      ranSources: ["rev"],
      revSheetLock: { lockedAt: "2026-12-01", reread: true },
    }))
    const result = await postBranchSync(["rev"], { revSnapshotReread: true })
    expect(sentBody()).toEqual({ sources: ["rev"], revSnapshotReread: true })
    expect(result.body?.revSheetLock).toEqual({ lockedAt: "2026-12-01", reread: true })
    expect(result.body?.ranSources).toEqual(["rev"])
  })

  it("고정 중 DSH·HW 만 돈 부분 실패(500)도 본문(dshOk·ranSources·dsh)을 버리지 않는다", async () => {
    adminFetch.mockResolvedValue(jsonResponse({
      ok: false,
      outcome: "partial",
      dshOk: true,
      dsh: 42,
      ranSources: ["dsh", "hw"],
      revSheetLock: { lockedAt: "2026-12-01", reread: false },
      error: "hw: 시트 읽기 실패",
    }, 500))
    const result = await postBranchSync(["rev", "hw"])
    expect(result.status).toBe(500)
    expect(result.body?.dshOk).toBe(true)
    expect(result.body?.dsh).toBe(42)
    expect(result.body?.ranSources).toEqual(["dsh", "hw"])
    expect(result.body?.revSheetLock).toEqual({ lockedAt: "2026-12-01", reread: false })
  })
})
