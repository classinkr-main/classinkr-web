// P2 — 매칭 인박스·매출시트 공용 소스 링크 액션(lib/crm/source-link-actions) 단위 테스트.
import { describe, expect, it, vi } from "vitest"

import type { CrmSourceLinkStatus } from "@/lib/admin-crm-revenue-types"
import {
  SOURCE_LINK_BULK_LIMIT,
  applyOptimisticLinkPatch,
  bulkIdsToRollback,
  bulkSucceededIds,
  dedupeLinkIds,
  describeBulkSourceLinkResult,
  describeBulkSourceLinkUndo,
  describeSingleSourceLinkResult,
  isSourceLinkActionable,
  isSourceLinkRevertible,
  restoreLinkRows,
  runBulkSourceLinkAction,
  runSingleSourceLinkAction,
  sourceLinkStatusAfter,
  splitBulkLinkIds,
  undoActionFor,
  type SourceLinkFetchJson,
} from "@/lib/crm/source-link-actions"

interface Row {
  id: string
  linkId: string | null
  linkStatus: CrmSourceLinkStatus | null
  note?: string
}

const rows: Row[] = [
  { id: "r1", linkId: "a", linkStatus: "candidate" },
  { id: "r2", linkId: "b", linkStatus: "stale" },
  { id: "r3", linkId: null, linkStatus: null },
  { id: "r4", linkId: "c", linkStatus: "confirmed" },
]

function harness(initial: Row[]) {
  let state = initial
  const handlers = {
    snapshot: new Map<string, Row>(),
    apply: vi.fn((ids: string[], status: CrmSourceLinkStatus) => {
      const patched = applyOptimisticLinkPatch(state, ids, (row) => ({ ...row, linkStatus: status }))
      handlers.snapshot = patched.previous
      state = patched.rows
    }),
    rollback: vi.fn((ids: string[]) => {
      state = restoreLinkRows(state, handlers.snapshot, ids)
    }),
  }
  return { handlers, get state() { return state } }
}

describe("상태 규칙", () => {
  it("액션 → 결과 상태는 서버 규칙과 같다", () => {
    expect(sourceLinkStatusAfter("confirm")).toBe("confirmed")
    expect(sourceLinkStatusAfter("reject")).toBe("rejected")
    expect(sourceLinkStatusAfter("stale")).toBe("stale")
  })

  it("후보·재검수 + 링크 있음만 행에서 확정·제외할 수 있다", () => {
    expect(rows.map(isSourceLinkActionable)).toEqual([true, true, false, false])
    expect(isSourceLinkActionable({ linkId: "x", linkStatus: "rejected" })).toBe(false)
  })

  it("확정·제외 행만 되돌릴 수 있다", () => {
    expect(rows.map(isSourceLinkRevertible)).toEqual([false, false, false, true])
    expect(isSourceLinkRevertible({ linkId: "x", linkStatus: "rejected" })).toBe(true)
    expect(isSourceLinkRevertible({ linkId: null, linkStatus: "confirmed" })).toBe(false)
  })

  it("되돌리기는 확정·제외 모두 재검수, 재검수는 되돌릴 대상이 아니다", () => {
    expect(undoActionFor("confirm")).toBe("stale")
    expect(undoActionFor("reject")).toBe("stale")
    expect(undoActionFor("stale")).toBeNull()
  })
})

describe("id 정리·상한", () => {
  it("순서를 지키며 중복·빈 id를 뺀다", () => {
    expect(dedupeLinkIds(["b", "a", "b", "", "  ", "c"])).toEqual(["b", "a", "c"])
  })

  it("상한을 넘는 id는 보내지 않고 남긴다", () => {
    const ids = Array.from({ length: SOURCE_LINK_BULK_LIMIT + 3 }, (_, index) => `id-${index}`)
    const { sent, skipped } = splitBulkLinkIds(ids)
    expect(sent).toHaveLength(SOURCE_LINK_BULK_LIMIT)
    expect(skipped).toEqual([`id-${SOURCE_LINK_BULK_LIMIT}`, `id-${SOURCE_LINK_BULK_LIMIT + 1}`, `id-${SOURCE_LINK_BULK_LIMIT + 2}`])
  })

  it("클라이언트 상한은 서버 BULK_LINK_ACTION_LIMIT와 같다", async () => {
    const { readFileSync } = await import("node:fs")
    const repository = readFileSync("lib/repositories/crm-source-links.ts", "utf8")
    expect(repository).toContain(`const BULK_LINK_ACTION_LIMIT = ${SOURCE_LINK_BULK_LIMIT}`)
  })
})

describe("낙관적 반영·복원", () => {
  it("대상 행만 바꾸고 원래 행 객체를 스냅샷으로 남긴다", () => {
    const { rows: next, previous } = applyOptimisticLinkPatch(rows, ["a", "c"], (row) => ({ ...row, linkStatus: "rejected" }))
    expect(next.map((row) => row.linkStatus)).toEqual(["rejected", "stale", null, "rejected"])
    expect(next[1]).toBe(rows[1])
    expect(previous.get("a")).toBe(rows[0])
    expect(previous.get("c")).toBe(rows[3])
  })

  it("onlyIds가 있으면 그 id만 복원하고 그 사이 바뀐 다른 행은 건드리지 않는다", () => {
    const { rows: next, previous } = applyOptimisticLinkPatch(rows, ["a", "b"], (row) => ({ ...row, linkStatus: "confirmed" }))
    const edited = next.map((row) => (row.id === "r4" ? { ...row, note: "다른 변경" } : row))
    const restored = restoreLinkRows(edited, previous, ["b"])
    expect(restored.map((row) => row.linkStatus)).toEqual(["confirmed", "stale", null, "confirmed"])
    expect(restored[3].note).toBe("다른 변경")
    expect(restored[1]).toBe(rows[1])
  })

  it("onlyIds가 없으면 스냅샷 전체를 복원한다", () => {
    const { rows: next, previous } = applyOptimisticLinkPatch(rows, ["a", "b"], (row) => ({ ...row, linkStatus: "confirmed" }))
    expect(restoreLinkRows(next, previous)).toEqual(rows)
  })
})

describe("단건 실행", () => {
  it("먼저 반영하고 기존 PATCH 경로로 보낸다", async () => {
    const h = harness(rows)
    const fetchJson = vi.fn(async () => ({ ok: true })) as unknown as SourceLinkFetchJson
    const run = await runSingleSourceLinkAction(fetchJson, "a", "confirm", h.handlers)
    expect(run).toEqual({ ok: true })
    expect(fetchJson).toHaveBeenCalledWith("/api/admin/crm/source-links/a", {
      method: "PATCH",
      body: JSON.stringify({ action: "confirm" }),
    })
    expect(h.handlers.apply).toHaveBeenCalledWith(["a"], "confirmed")
    expect(h.handlers.rollback).not.toHaveBeenCalled()
    expect(h.state[0].linkStatus).toBe("confirmed")
  })

  it("서버가 거절하면(409 등) 행을 되돌리고 서버 문구를 돌려준다", async () => {
    const h = harness(rows)
    const fetchJson = vi.fn(async () => {
      throw new Error("제외된 연결은 바로 확정할 수 없습니다.")
    }) as unknown as SourceLinkFetchJson
    const run = await runSingleSourceLinkAction(fetchJson, "a", "confirm", h.handlers)
    expect(run).toEqual({ ok: false, error: "제외된 연결은 바로 확정할 수 없습니다." })
    expect(h.state).toEqual(rows)
  })

  it("문구 없는 오류는 기본 문구", async () => {
    const h = harness(rows)
    const fetchJson = vi.fn(async () => {
      throw "boom"
    }) as unknown as SourceLinkFetchJson
    const run = await runSingleSourceLinkAction(fetchJson, "a", "reject", h.handlers)
    expect(run).toEqual({ ok: false, error: "매칭 상태 변경에 실패했습니다." })
  })
})

describe("일괄 실행", () => {
  it("bulk 경로로 보내고 실패한 id만 되돌린다", async () => {
    const h = harness(rows)
    const fetchJson = vi.fn(async () => ({ updated: 1, failed: [{ id: "b", error: "conflict" }], skipped: 0 })) as unknown as SourceLinkFetchJson
    const run = await runBulkSourceLinkAction(fetchJson, ["a", "b", "a"], "confirm", h.handlers)
    expect(fetchJson).toHaveBeenCalledWith("/api/admin/crm/source-links/bulk", {
      method: "PATCH",
      body: JSON.stringify({ ids: ["a", "b"], action: "confirm" }),
    })
    expect(run.ok).toBe(true)
    if (!run.ok) return
    expect(run.succeededIds).toEqual(["a"])
    expect(h.handlers.rollback).toHaveBeenCalledWith(["b"])
    expect(h.state.map((row) => row.linkStatus)).toEqual(["confirmed", "stale", null, "confirmed"])
  })

  it("요청 자체가 실패하면 보낸 id를 모두 되돌린다", async () => {
    const h = harness(rows)
    const fetchJson = vi.fn(async () => {
      throw new Error("500")
    }) as unknown as SourceLinkFetchJson
    const run = await runBulkSourceLinkAction(fetchJson, ["a", "b"], "reject", h.handlers)
    expect(run).toEqual({ ok: false, error: "500" })
    expect(h.state).toEqual(rows)
  })

  it("상한 초과분은 반영하지도 보내지도 않고 미처리로 센다", async () => {
    const ids = Array.from({ length: SOURCE_LINK_BULK_LIMIT + 2 }, (_, index) => `id-${index}`)
    const h = harness(ids.map((id) => ({ id, linkId: id, linkStatus: "candidate" as const })))
    const fetchJson = vi.fn(async () => ({ updated: SOURCE_LINK_BULK_LIMIT, failed: [], skipped: 0 })) as unknown as SourceLinkFetchJson
    const run = await runBulkSourceLinkAction(fetchJson, ids, "confirm", h.handlers)
    expect(run.ok).toBe(true)
    if (!run.ok) return
    expect(run.result.skipped).toBe(2)
    expect(run.skippedIds).toEqual([`id-${SOURCE_LINK_BULK_LIMIT}`, `id-${SOURCE_LINK_BULK_LIMIT + 1}`])
    expect(h.state.filter((row) => row.linkStatus === "confirmed")).toHaveLength(SOURCE_LINK_BULK_LIMIT)
    expect(h.state.at(-1)?.linkStatus).toBe("candidate")
  })

  it("빈 선택은 요청하지 않는다", async () => {
    const h = harness(rows)
    const fetchJson = vi.fn() as unknown as SourceLinkFetchJson
    const run = await runBulkSourceLinkAction(fetchJson, ["", " "], "confirm", h.handlers)
    expect(run.ok).toBe(false)
    expect(fetchJson).not.toHaveBeenCalled()
    expect(h.handlers.apply).not.toHaveBeenCalled()
  })

  it("실패·되돌림 id 헬퍼", () => {
    const result = { updated: 1, failed: [{ id: "b", error: "x" }, { id: "b", error: "y" }] }
    expect(bulkIdsToRollback(result, ["z"])).toEqual(["b", "z"])
    expect(bulkSucceededIds(["a", "b"], result)).toEqual(["a"])
  })
})

describe("문구", () => {
  it("bulk 결과는 처리·실패(행 이름)·미처리를 모두 밝힌다", () => {
    const labels = new Map([["a", "가나학원"], ["b", "다라학원"]])
    const message = describeBulkSourceLinkResult(
      "confirm",
      { updated: 3, failed: [{ id: "a", error: "" }, { id: "b", error: "" }, { id: "c", error: "" }, { id: "d1234567890", error: "" }], skipped: 5 },
      (id) => labels.get(id)
    )
    expect(message).toBe("확정 3건 처리 · 실패 4건 (가나학원, 다라학원, c 외 1건) · 미처리 5건 · 한 번에 처리할 수 있는 한도를 넘어 남겨 두었습니다")
  })

  it("bulk 제외 전부 성공", () => {
    expect(describeBulkSourceLinkResult("reject", { updated: 2, failed: [] })).toBe("제외 2건 처리")
  })

  it("단건·되돌리기 문구", () => {
    expect(describeSingleSourceLinkResult("confirm", "가나학원")).toBe("가나학원 연결을 확정했습니다.")
    expect(describeSingleSourceLinkResult("reject", undefined)).toBe("후보를 제외했습니다.")
    expect(describeSingleSourceLinkResult("stale", "가")).toBe("가 재검수로 되돌렸습니다.")
    expect(describeBulkSourceLinkUndo("confirm", 1200)).toBe("1,200건을 확정했습니다.")
    expect(describeBulkSourceLinkUndo("reject", 2)).toBe("2건을 제외했습니다.")
  })
})
