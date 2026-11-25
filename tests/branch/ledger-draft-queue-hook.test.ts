import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// useLedgerDraftQueue 를 직접 돌려 본다(2026-11-25 시트 고정 전 정비, F-36). 이 저장소의 vitest 는 node 환경이라
// tests/branch/helpers/hook-runner.ts 의 미니 훅 런타임 위에서 훅을 돌리고, 서버는 아래 가짜 저장소가 대신한다.
//  - F-06: 줄 동작(수정·체크·취소·삭제)이 500 이어도 큐는 서버 모드 그대로, 그 행에만 다시 시도 에러. 새 초안 저장 실패는
//    그 한 건만 로컬 임시 초안이고 다음 저장은 다시 서버로 — 성공하면 못 보낸 것을 다시 보낸다. 브라우저 저장소에는
//    local-* 만 남는다. 처음부터 목록을 못 읽은 로컬 큐도 저장이 성공하면 서버 모드로 돌아온다.
//  - F-05: 같은 칸 저장이 겹치면 한 건만 만들고 이어서 PATCH(앞 응답의 updatedAt 으로). 응답을 못 받은 저장은 목록을
//    다시 읽어 같은 칸 초안을 쓴다. 로컬 재전송도 같은 칸 서버 초안이 있으면 새로 만들지 않는다.
//  - F-20: 반영 요청이 나가 있는 초안은 다른 곳에서 다시 보내지 않는다(applyingIds·applyBusy).
//  - F-33: 응답을 못 받은 반영은 목록을 다시 읽어 맞춘다. 4xx 는 한국어 사유. 영어 문구를 그대로 보이지 않는다.
//  - 시트 고정(sheetWrite.lock): 적용 중이면 행마다 다시 적용하라는 안내가 없다.

type Json = Record<string, unknown>
type FakeResult = { status: number; body?: unknown } | "network"
interface FakeRequest {
  method: string
  url: string
  body: Json | undefined
}

const fake = vi.hoisted(() => ({
  handler: null as null | ((request: FakeRequest) => FakeResult | Promise<FakeResult>),
  calls: [] as FakeRequest[],
}))

async function fakeFetch(url: string, init?: { method?: string; body?: unknown }) {
  const method = (init?.method ?? "GET").toUpperCase()
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Json) : undefined
  const request = { method, url, body }
  fake.calls.push(request)
  if (!fake.handler) throw new Error("fake handler 없음")
  const result = await fake.handler(request)
  if (result === "network") throw new TypeError("Failed to fetch")
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    statusText: "",
    json: async () => result.body ?? null,
  }
}

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  const { hookImplsWithFallback } = await import("@/tests/branch/helpers/hook-runner")
  return { ...actual, ...hookImplsWithFallback(actual as unknown as Record<string, unknown>) }
})

vi.mock("@/components/admin/branch/client-api", () => ({
  adminFetch: (url: string, init?: { method?: string; body?: unknown }) => fakeFetch(url, init),
  adminFetchJson: async (url: string, init?: { method?: string; body?: unknown }) => {
    const response = await fakeFetch(url, init)
    const data = (await response.json()) as Json | null
    if (!response.ok) throw new Error((data?.error as string | undefined) ?? `${response.status}`)
    return data
  },
}))

import { renderHook } from "@/tests/branch/helpers/hook-runner"
import type { LedgerDraft } from "@/components/admin/branch/ledger/shared"
import { APPLY_NO_RESPONSE_MESSAGE } from "@/components/admin/branch/ledger/sheet-write-view"
import {
  draftCellKey,
  ledgerCellKey,
  localDraftToInput,
  useLedgerDraftQueue,
  type LedgerDraftInput,
} from "@/components/admin/branch/ledger/useLedgerDraftQueue"

// ── 가짜 서버 ────────────────────────────────────────────────────────────────

class FakeServer {
  drafts: LedgerDraft[] = []
  sheetWrite: Json = { mode: "off", lastRevSyncStartedAt: null }
  seq = 0
  /** 있으면 먼저 묻는다 — undefined 를 돌려주면 기본 처리. */
  override: ((request: FakeRequest) => FakeResult | undefined | Promise<FakeResult | undefined>) | null = null

  stamp() {
    this.seq += 1
    return `2026-11-25T00:00:${String(this.seq).padStart(2, "0")}.000Z`
  }

  add(draft: Partial<LedgerDraft> & { id: string }): LedgerDraft {
    const full: LedgerDraft = {
      kind: "edit-row",
      status: "checked",
      customer: "예시학원",
      manager: "예시A",
      team: "BD",
      month: "2026-11",
      amount: 100_000,
      note: "",
      createdAt: this.stamp(),
      updatedAt: this.stamp(),
      ...draft,
    }
    this.drafts.push(full)
    return full
  }

  create(body: Json): LedgerDraft {
    const now = this.stamp()
    const draft = {
      ...(body as unknown as LedgerDraft),
      id: `srv-${this.drafts.length + 1}`,
      status: (body.status as LedgerDraft["status"]) ?? "draft",
      createdAt: now,
      updatedAt: now,
    }
    this.drafts.push(draft)
    return draft
  }

  async handle(request: FakeRequest): Promise<FakeResult> {
    const overridden = this.override ? await this.override(request) : undefined
    if (overridden !== undefined) return overridden
    const { method, url, body } = request
    if (method === "GET" && url.startsWith("/api/admin/branch/ledger-drafts?")) {
      return { status: 200, body: { drafts: [...this.drafts], entries: [], sheetWrite: this.sheetWrite, sheetWrites: {} } }
    }
    if (method === "POST" && url === "/api/admin/branch/ledger-drafts") {
      return { status: 201, body: { draft: this.create(body ?? {}) } }
    }
    if (method === "PATCH" && url === "/api/admin/branch/ledger-drafts/batch") {
      const ids = (body?.ids as string[]) ?? []
      if (body?.action === "check") {
        return { status: 200, body: { results: ids.map((id) => ({ id, ok: true, status: 200, draft: this.patch(id, { status: "checked" }) })) } }
      }
      return {
        status: 200,
        body: { results: ids.map((id) => ({ id, ok: true, status: 200, draft: this.patch(id, { status: "applied" }), sheet: { code: "disabled" } })) },
      }
    }
    const single = /^\/api\/admin\/branch\/ledger-drafts\/([^/?]+)$/.exec(url)
    if (single) {
      const id = decodeURIComponent(single[1])
      const existing = this.drafts.find((draft) => draft.id === id)
      if (!existing) return { status: 404, body: { error: "Draft not found" } }
      if (method === "DELETE") {
        this.drafts = this.drafts.filter((draft) => draft.id !== id)
        return { status: 200, body: { ok: true } }
      }
      if (body?.action === "apply") return { status: 200, body: { draft: this.patch(id, { status: "applied" }), sheet: { code: "disabled" } } }
      if (typeof body?.expectedUpdatedAt === "string" && body.expectedUpdatedAt !== existing.updatedAt) {
        return { status: 409, body: { error: "다른 곳에서 먼저 수정되었습니다.", draft: existing } }
      }
      const { expectedUpdatedAt: _ignored, ...fields } = body ?? {}
      void _ignored
      return { status: 200, body: { draft: this.patch(id, fields as Partial<LedgerDraft>) } }
    }
    return { status: 500, body: { error: "unexpected" } }
  }

  patch(id: string, fields: Partial<LedgerDraft>): LedgerDraft {
    const index = this.drafts.findIndex((draft) => draft.id === id)
    const next = { ...this.drafts[index], ...fields, updatedAt: this.stamp() }
    this.drafts[index] = next
    return next
  }
}

let server: FakeServer
const storage = new Map<string, string>()

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function cellInput(overrides: Partial<LedgerDraftInput> = {}, week = "w4"): LedgerDraftInput {
  return {
    kind: "edit-row",
    sourceDealId: "deal-1",
    sourceSheetRow: 12,
    sourceSnapshot: { origin: "rev-matrix-cell", week },
    customer: "예시학원",
    manager: "예시A",
    team: "BD",
    month: "2026-11",
    amount: 100_000,
    note: "",
    status: "checked",
    metadata: { origin: "rev-matrix-cell", week, sourceDealId: "deal-1" },
    ...overrides,
  }
}

function callsOf(method: string, url?: string) {
  return fake.calls.filter((call) => call.method === method && (url == null || call.url === url))
}

async function mount() {
  const view = renderHook(() => useLedgerDraftQueue())
  await view.settle()
  return view
}

beforeEach(() => {
  server = new FakeServer()
  fake.calls = []
  fake.handler = (request) => server.handle(request)
  storage.clear()
  vi.stubGlobal("window", globalThis)
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function storedDrafts(): LedgerDraft[] {
  return JSON.parse(storage.get("classin:sales-ledger-drafts:v1") ?? "[]") as LedgerDraft[]
}

// ── F-06 ────────────────────────────────────────────────────────────────────

describe("F-06 — 한 번의 실패로 큐가 로컬로 내려가지 않는다", () => {
  const SERVER_500 = { status: 500, body: { error: "Failed to update sales ledger draft" } }

  it.each([
    ["toggleDraft", "체크 상태를 바꾸지 못했습니다"],
    ["cancelDraft", "초안을 취소하지 못했습니다"],
    ["deleteDraft", "초안을 삭제하지 못했습니다"],
  ] as const)("%s 가 500 이면 그 행에만 다시 시도 에러(한국어 사유)를 달고 서버 모드 그대로 — 다음 저장은 서버로 간다", async (action, text) => {
    server.add({ id: "srv-1", status: "draft", sourceDealId: "deal-9" })
    const view = await mount()
    server.override = (request) => (request.url.endsWith("/srv-1") ? SERVER_500 : undefined)
    if (action === "deleteDraft") server.override = (request) => (request.method === "DELETE" ? { status: 500, body: { error: "Failed to delete sales ledger draft" } } : undefined)

    await view.current[action]("srv-1")
    await view.settle()

    expect(view.current.queueMode).toBe("server")
    const message = view.current.recordErrors.get("srv-1") ?? ""
    expect(message).toContain(text)
    expect(message).toContain("다시 시도하세요")
    expect(message).not.toMatch(/Failed to/)

    server.override = null
    const created = await view.current.createDraft(cellInput())
    expect(created.draft?.id).toMatch(/^srv-/)
    expect(callsOf("POST", "/api/admin/branch/ledger-drafts")).toHaveLength(1)
  })

  it("updateDraft 가 500 이면 error 로 돌려주고(로컬 폴백 아님) 큐는 서버 모드 그대로", async () => {
    server.add({ id: "srv-1", status: "checked", sourceDealId: "deal-1", metadata: { origin: "rev-matrix-cell", week: "w4" } })
    const view = await mount()
    server.override = (request) => (request.method === "PATCH" ? SERVER_500 : undefined)

    const result = await view.current.updateDraft("srv-1", cellInput({ amount: 300_000 }))
    await view.settle()

    expect(result.draft).toBeNull()
    expect(result.error).toContain("고친 값을 저장하지 못했습니다(서버가 초안을 저장하지 못했습니다)")
    expect(view.current.queueMode).toBe("server")
    expect(view.current.drafts.some((draft) => draft.id.startsWith("local-"))).toBe(false)
  })

  it("새 초안 저장이 500 이면 그 한 건만 로컬 임시 초안 — 다음 저장이 성공하면 못 보낸 것을 다시 보낸다", async () => {
    server.add({ id: "srv-1", status: "checked" })
    const view = await mount()
    server.override = (request) => (request.method === "POST" ? { status: 500, body: { error: "Failed to create sales ledger draft" } } : undefined)

    const first = await view.current.createDraft(cellInput({ sourceDealId: "deal-2", metadata: { origin: "rev-matrix-cell", week: "w1", sourceDealId: "deal-2" } }, "w1"))
    await view.settle()
    expect(first.draft?.id).toMatch(/^local-/)
    expect(view.current.queueMode).toBe("server")
    expect(view.current.unsyncedLocalCount).toBe(1)
    // 브라우저 저장소에는 로컬 임시 초안만(서버 초안 사본 없음).
    expect(storedDrafts().map((draft) => draft.id)).toEqual([first.draft?.id])

    server.override = null
    const second = await view.current.createDraft(cellInput())
    await view.settle()
    expect(second.draft?.id).toMatch(/^srv-/)
    // 성공 뒤 목록을 다시 읽고 로컬 초안을 서버로 다시 보냈다 — 자가 체크(checked)도 그대로.
    expect(view.current.unsyncedLocalCount).toBe(0)
    expect(view.current.drafts.some((draft) => draft.id.startsWith("local-"))).toBe(false)
    const resent = server.drafts.find((draft) => draft.sourceDealId === "deal-2")
    expect(resent?.status).toBe("checked")
    expect(storedDrafts()).toEqual([])
  })

  it("처음부터 목록을 못 읽은 로컬 큐도 저장을 서버로 먼저 보내고, 성공하면 서버 모드로 돌아온다", async () => {
    let listDown = true
    server.override = (request) => (request.method === "GET" && listDown ? "network" : undefined)
    const view = await mount()
    expect(view.current.queueMode).toBe("local")
    expect(view.current.queueError).toContain("서버에 연결하지 못했습니다")

    listDown = false
    const created = await view.current.createDraft(cellInput())
    await view.settle()
    expect(created.draft?.id).toMatch(/^srv-/)
    expect(view.current.queueMode).toBe("server")
  })

  it("목록을 한 번 읽은 뒤의 조회 실패는 목록·서버 모드를 그대로 두고 알리기만 한다", async () => {
    server.add({ id: "srv-1", status: "checked" })
    const view = await mount()
    server.override = (request) => (request.method === "GET" ? "network" : undefined)

    await view.current.reloadDrafts()
    await view.settle()
    expect(view.current.queueMode).toBe("server")
    expect(view.current.drafts.map((draft) => draft.id)).toEqual(["srv-1"])
    expect(view.current.queueError).toContain("초안 목록을 다시 읽지 못했습니다")
  })

  it("localDraftToInput — 셀 커밋 초안·로컬에서 체크한 초안은 checked 로 다시 연다, 레일 초안은 status 없이", () => {
    const base = { id: "local-1", createdAt: "", updatedAt: "", ...cellInput() } as LedgerDraft
    expect(localDraftToInput({ ...base, status: "draft" }).status).toBe("checked")
    const rail = { ...base, status: "draft" as const, sourceSnapshot: { origin: "rail" }, metadata: { origin: "rail" } }
    expect(localDraftToInput(rail).status).toBeUndefined()
    expect(localDraftToInput({ ...rail, status: "checked" }).status).toBe("checked")
  })
})

// ── F-05 ────────────────────────────────────────────────────────────────────

describe("F-05 — 같은 칸 저장이 겹쳐도 초안은 한 건", () => {
  it("칸 키는 종류·딜·월·주차로 정해지고, 워크벤치가 칸 좌표로 같은 키를 만든다", () => {
    const key = draftCellKey(cellInput())
    expect(key).toBe(ledgerCellKey({ kind: "edit-row", sourceDealId: "deal-1", customer: "예시학원", month: "2026-11", week: 3 }))
    expect(draftCellKey(cellInput({}, "w2"))).not.toBe(key)
    expect(draftCellKey(cellInput({ metadata: { origin: "rail" }, sourceSnapshot: { origin: "rail" } }))).toBeNull()
    expect(ledgerCellKey({ kind: "new-row", customer: "  신규학원 ", month: "2026-11" })).toBe("new-row|customer:신규학원|2026-11|month")
  })

  it("저장이 나가 있는 칸을 다시 고치면 기다렸다가 그 초안을 PATCH 한다(앞 응답의 updatedAt 으로)", async () => {
    const view = await mount()
    const gate = deferred<void>()
    server.override = async (request) => {
      if (request.method === "POST") {
        await gate.promise
        return undefined
      }
      return undefined
    }

    const first = view.current.createDraft(cellInput({ amount: 100_000 }))
    const second = view.current.createDraft(cellInput({ amount: 200_000 }))
    await view.settle(3)
    const key = draftCellKey(cellInput()) as string
    expect(view.current.savingCellKeys.has(key)).toBe(true)
    expect(callsOf("POST")).toHaveLength(1)

    gate.resolve()
    const [firstResult, secondResult] = await Promise.all([first, second])
    await view.settle()

    expect(callsOf("POST")).toHaveLength(1)
    const patches = callsOf("PATCH", `/api/admin/branch/ledger-drafts/${firstResult.draft?.id}`)
    expect(patches).toHaveLength(1)
    expect(patches[0].body?.amount).toBe(200_000)
    expect(patches[0].body?.expectedUpdatedAt).toBe(firstResult.draft?.updatedAt)
    expect(secondResult.conflict).toBeUndefined()
    expect(secondResult.draft?.id).toBe(firstResult.draft?.id)
    expect(server.drafts).toHaveLength(1)
    expect(server.drafts[0].amount).toBe(200_000)
    expect(view.current.savingCellKeys.size).toBe(0)
  })

  it("다른 칸 저장은 잇지 않는다(각자 새 초안)", async () => {
    const view = await mount()
    await Promise.all([view.current.createDraft(cellInput({}, "w1")), view.current.createDraft(cellInput({}, "w2"))])
    expect(callsOf("POST")).toHaveLength(2)
    expect(server.drafts).toHaveLength(2)
  })

  it("응답을 못 받은 저장은 목록을 다시 읽어 같은 칸의 대기 초안을 쓴다 — 서버가 이미 만들었으면 두 번 만들지 않는다", async () => {
    const view = await mount()
    server.override = (request) => {
      if (request.method !== "POST") return undefined
      server.create(request.body ?? {})
      return "network"
    }

    const result = await view.current.createDraft(cellInput())
    await view.settle()
    expect(result.draft?.id).toBe("srv-1")
    expect(server.drafts).toHaveLength(1)
    expect(view.current.drafts.some((draft) => draft.id.startsWith("local-"))).toBe(false)
  })

  it("응답을 못 받았고 서버에도 없으면 로컬 임시 초안 — 다시 보낼 때 같은 칸 서버 초안이 생겼으면 새로 만들지 않고 고친다", async () => {
    const view = await mount()
    server.override = (request) => (request.method === "POST" ? "network" : undefined)
    const local = await view.current.createDraft(cellInput({ amount: 150_000 }))
    await view.settle()
    expect(local.draft?.id).toMatch(/^local-/)

    // 그사이 같은 칸 초안이 서버에 생겼다(다른 탭·늦게 들어간 저장) — 다시 보내기는 그 초안을 PATCH 한다.
    server.override = null
    server.add({ id: "srv-7", sourceDealId: "deal-1", amount: 100_000, metadata: { origin: "rev-matrix-cell", week: "w4", sourceDealId: "deal-1" } })
    fake.calls = []
    const sent = await view.current.retryUnsentDrafts()
    await view.settle()
    expect(sent).toBe(true)
    expect(callsOf("POST")).toHaveLength(0)
    expect(callsOf("PATCH", "/api/admin/branch/ledger-drafts/srv-7")).toHaveLength(1)
    expect(server.drafts).toHaveLength(1)
    expect(server.drafts[0].amount).toBe(150_000)
  })

  it("새로고침 전에 못 보낸 로컬 초안(브라우저 저장소)도 마운트할 때 다시 보낸다 — 같은 값의 서버 초안이 있으면 그대로 쓴다", async () => {
    const leftover = { id: "local-old", status: "draft", createdAt: "", updatedAt: "", ...cellInput() } as LedgerDraft
    storage.set("classin:sales-ledger-drafts:v1", JSON.stringify([leftover]))
    server.add({ id: "srv-3", sourceDealId: "deal-1", amount: 100_000, metadata: { origin: "rev-matrix-cell", week: "w4", sourceDealId: "deal-1" } })

    const view = await mount()
    expect(callsOf("POST")).toHaveLength(0)
    expect(callsOf("PATCH")).toHaveLength(0)
    expect(view.current.drafts.map((draft) => draft.id)).toEqual(["srv-3"])
    expect(storedDrafts()).toEqual([])
  })
})

// ── F-20 ────────────────────────────────────────────────────────────────────

describe("F-20 — 반영 중인 초안은 다시 보내지 않는다", () => {
  it("일괄 반영이 나가 있는 동안 같은 초안의 줄 적용·두 번째 일괄 반영은 요청을 보내지 않고, applyBusy 로 알린다", async () => {
    server.add({ id: "srv-1" })
    server.add({ id: "srv-2" })
    const view = await mount()
    const gate = deferred<void>()
    server.override = async (request) => {
      if (request.url === "/api/admin/branch/ledger-drafts/batch") await gate.promise
      return undefined
    }

    const bulk = view.current.applyDrafts(["srv-1", "srv-2"])
    await view.settle(3)
    expect(view.current.applyBusy).toBe(true)
    expect([...view.current.applyingIds].sort()).toEqual(["srv-1", "srv-2"])

    expect(await view.current.applyDraft("srv-1")).toBeNull()
    expect(await view.current.applyDrafts(["srv-1", "srv-2"])).toEqual({ done: 0, failed: 0, sheetResults: [] })
    expect(callsOf("PATCH", "/api/admin/branch/ledger-drafts/srv-1")).toHaveLength(0)
    expect(callsOf("PATCH", "/api/admin/branch/ledger-drafts/batch")).toHaveLength(1)

    gate.resolve()
    const result = await bulk
    await view.settle()
    expect(result).toMatchObject({ done: 2, failed: 0 })
    expect(view.current.applyBusy).toBe(false)
    expect(view.current.applyingIds.size).toBe(0)
  })

  it("겹치지 않는 초안은 그대로 보낸다(진행 중인 id 만 뺀다)", async () => {
    server.add({ id: "srv-1" })
    server.add({ id: "srv-2" })
    const view = await mount()
    const gate = deferred<void>()
    server.override = async (request) => {
      if (request.url.endsWith("/srv-1")) await gate.promise
      return undefined
    }
    const single = view.current.applyDraft("srv-1")
    await view.settle(3)
    const bulk = await view.current.applyDrafts(["srv-1", "srv-2"])
    expect(callsOf("PATCH", "/api/admin/branch/ledger-drafts/batch")[0].body?.ids).toEqual(["srv-2"])
    expect(bulk.done).toBe(1)
    gate.resolve()
    await single
  })
})

// ── F-33 ────────────────────────────────────────────────────────────────────

describe("F-33 — 응답을 못 받은 반영·영어 문구", () => {
  it("단건 반영 응답을 못 받았는데 서버가 반영을 마쳤으면(다시 읽은 목록이 적용완료) 성공으로 센다", async () => {
    server.add({ id: "srv-1" })
    const view = await mount()
    server.override = (request) => {
      if (request.body?.action !== "apply") return undefined
      server.patch("srv-1", { status: "applied" })
      return "network"
    }
    const outcome = await view.current.applyDraft("srv-1")
    await view.settle()
    expect(outcome?.ok).toBe(true)
    expect(view.current.queueError).toBeNull()
    expect(view.current.queueMode).toBe("server")
  })

  it("반영되지 않았으면 '응답을 받지 못했습니다 — 새로고침해…' 로 말한다(실패 단정·영어 없음)", async () => {
    server.add({ id: "srv-1" })
    const view = await mount()
    server.override = (request) => (request.body?.action === "apply" ? "network" : undefined)
    const outcome = await view.current.applyDraft("srv-1")
    await view.settle()
    expect(outcome).toMatchObject({ ok: false, status: 0, code: null, error: APPLY_NO_RESPONSE_MESSAGE })
    expect(view.current.queueError).toBe(APPLY_NO_RESPONSE_MESSAGE)
    expect(view.current.queueMode).toBe("server")
  })

  it("일괄 반영이 403 이면 서버가 받지 않은 것 — 권한 사유(한국어)로 실패, 응답 없음으로 말하지 않는다", async () => {
    server.add({ id: "srv-1" })
    server.add({ id: "srv-2" })
    const view = await mount()
    server.override = (request) => (request.url.endsWith("/batch") ? { status: 403, body: { error: "Forbidden" } } : undefined)
    const result = await view.current.applyDrafts(["srv-1", "srv-2"])
    expect(result.failed).toBe(2)
    expect(result.sheetResults.every((outcome) => outcome.status === 403 && outcome.error === "이 작업을 할 권한이 없습니다")).toBe(true)
  })

  it("일괄 반영 응답이 끊겼는데 일부는 서버가 반영했으면 그만큼 성공으로 센다", async () => {
    server.add({ id: "srv-1" })
    server.add({ id: "srv-2" })
    const view = await mount()
    server.override = (request) => {
      if (!request.url.endsWith("/batch")) return undefined
      server.patch("srv-1", { status: "applied" })
      return "network"
    }
    const result = await view.current.applyDrafts(["srv-1", "srv-2"])
    await view.settle()
    expect(result).toMatchObject({ done: 1, failed: 1 })
    expect(view.current.queueError).toBe(`1건 ${APPLY_NO_RESPONSE_MESSAGE}`)
  })

  it("되돌리기 실패는 한국어 사유로 다시 던진다", async () => {
    server.add({ id: "srv-1", status: "applied" })
    const view = await mount()
    server.override = (request) => (request.body?.action === "reverse" ? "network" : undefined)
    await expect(view.current.reverseEntry("srv-1")).rejects.toThrow("서버에 연결하지 못했습니다")
  })
})

// ── 시트 고정 ────────────────────────────────────────────────────────────────

describe("시트 고정 — 적용 중이면 '시트·' 문구와 행마다 다시 적용 안내가 없다", () => {
  it("sheetWrite.lock 을 읽고(모드는 꺼짐), 반영 실패 안내는 체크 큐에서 사유 확인으로", async () => {
    server.sheetWrite = { mode: "on", lastRevSyncStartedAt: null, lock: { lockedAt: "2026-12-01", active: true } }
    server.add({ id: "srv-1" })
    const view = await mount()
    expect(view.current.sheetWrite.lock).toEqual({ lockedAt: "2026-12-01", active: true })
    expect(view.current.sheetWrite.mode).toBe("off")

    server.override = (request) =>
      request.url.endsWith("/batch")
        ? { status: 200, body: { results: [{ id: "srv-1", ok: false, status: 409, error: "이미 정정이 있습니다", sheet: { code: "active_correction" } }] } }
        : undefined
    await view.current.applyDrafts(["srv-1"])
    await view.settle()
    expect(view.current.queueError).toBe("1건이 장부에 반영되지 않았습니다 — 체크 큐에서 사유를 확인하세요")
    expect(view.current.queueError).not.toContain("해당 행에서 다시 적용")
  })

  it("고정 전에는 지금 안내 그대로", async () => {
    server.add({ id: "srv-1" })
    const view = await mount()
    server.override = (request) =>
      request.url.endsWith("/batch")
        ? { status: 200, body: { results: [{ id: "srv-1", ok: false, status: 409, error: "이미 정정이 있습니다", sheet: { code: "active_correction" } }] } }
        : undefined
    await view.current.applyDrafts(["srv-1"])
    await view.settle()
    expect(view.current.queueError).toBe("일괄 적용 중 1건이 DB 장부에 반영되지 않았습니다 — 해당 행에서 다시 적용하세요.")
  })
})

describe("F-29 — 목록 상한 경고는 저장 성공으로 지워지지 않는다", () => {
  it("entries 상한 경고가 저장 성공(큐 알림 비움) 뒤에도 남고, 다음 목록 조회가 다시 정한다", async () => {
    server.override = (request) =>
      request.method === "GET" && request.url.startsWith("/api/admin/branch/ledger-drafts?")
        ? { status: 200, body: { drafts: [...server.drafts], entries: [], sheetWrite: server.sheetWrite, sheetWrites: {}, truncated: { openDrafts: false, entries: true } } }
        : undefined
    const view = await mount()
    expect(view.current.queueError).toContain("20,000건")

    const created = await view.current.createDraft(cellInput())
    await view.settle()
    expect(created.draft).not.toBeNull()
    expect(view.current.queueError).toContain("20,000건")

    server.override = null
    await view.current.reloadDrafts()
    await view.settle()
    expect(view.current.queueError).toBeNull()
  })
})
