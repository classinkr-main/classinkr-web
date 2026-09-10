// T5-B: /api/admin/patch-notes?limit=1&summary=1 — overview는 최신 1건의 id/version/title/date/status만
// 쓴다. summary는 5컬럼만 select하고 changes를 []로 채우며, options 미전달은 기존 select("*") 전체 조회.
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

const ROWS: Row[] = [
  {
    id: "n2",
    version: "1.3.0",
    title: "9월 업데이트",
    date: "2026-09-01",
    status: "published",
    changes: [{ id: "c1", type: "feat", text: "새 기능" }],
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  },
  {
    id: "n1",
    version: "1.2.0",
    title: "8월 업데이트",
    date: "2026-08-01",
    status: "published",
    changes: [{ id: "c0", type: "fix", text: "버그 수정" }],
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
]

function projectRow(row: Row, columns: string): Row {
  if (columns === "*") return row
  return Object.fromEntries(columns.split(",").map((column) => [column, row[column]]))
}

function patchNotesClient() {
  const calls: { select?: string; limit?: number } = {}
  const resolve = () => {
    const rows = ROWS.slice(0, calls.limit ?? ROWS.length).map((row) => projectRow(row, calls.select ?? "*"))
    return Promise.resolve({ data: rows, error: null })
  }
  const from = vi.fn(() => ({
    select: (columns: string) => {
      calls.select = columns
      return {
        order: () => {
          const query = {
            limit: (n: number) => {
              calls.limit = n
              return { then: resolve().then.bind(resolve()) }
            },
            then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
              resolve().then(onFulfilled, onRejected),
          }
          return query
        },
      }
    },
  }))
  return { from, calls }
}

async function loadRepository() {
  vi.resetModules()
  const client = patchNotesClient()
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => client) }))
  const repository = await import("@/lib/repositories/patch-notes")
  return { repository, client }
}

describe("getAllPatchNotes options", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("limit=1 + summary: 1건, 5컬럼 select, changes는 []", async () => {
    const { repository, client } = await loadRepository()
    const notes = await repository.getAllPatchNotes({ limit: 1, summary: true })

    expect(client.calls).toEqual({ select: "id,version,title,date,status", limit: 1 })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toEqual({
      id: "n2",
      version: "1.3.0",
      title: "9월 업데이트",
      date: "2026-09-01",
      status: "published",
      changes: [],
      createdAt: "",
      updatedAt: "",
    })
  })

  it("options 미전달(기존 호출자)은 select('*') 전체 + limit 없음 + changes 보존", async () => {
    const { repository, client } = await loadRepository()
    const notes = await repository.getAllPatchNotes()

    expect(client.calls).toEqual({ select: "*" })
    expect(notes).toHaveLength(2)
    expect(notes[0].changes).toHaveLength(1)
    expect(notes[0].createdAt).toBe("2026-09-01T00:00:00Z")
  })

  it("limit만 주면 select('*')로 상위 n건", async () => {
    const { repository, client } = await loadRepository()
    const notes = await repository.getAllPatchNotes({ limit: 1 })
    expect(client.calls).toEqual({ select: "*", limit: 1 })
    expect(notes).toHaveLength(1)
    expect(notes[0].changes).toHaveLength(1)
  })
})

describe("GET /api/admin/patch-notes", () => {
  const getAllPatchNotes = vi.fn(async () => [])

  beforeEach(() => {
    vi.resetModules()
    getAllPatchNotes.mockClear()
    vi.doMock("@/lib/admin-auth", () => ({
      STAFF_ADMIN_API_ROLES: [],
      verifyAdmin: vi.fn(async () => undefined),
    }))
    vi.doMock("@/lib/repositories/patch-notes", () => ({ getAllPatchNotes, createPatchNote: vi.fn() }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("?limit=1&summary=1 → { limit: 1, summary: true }", async () => {
    const { GET } = await import("@/app/api/admin/patch-notes/route")
    const res = await GET(new NextRequest("http://localhost/api/admin/patch-notes?limit=1&summary=1"))
    expect(res.status).toBe(200)
    expect(getAllPatchNotes).toHaveBeenCalledWith({ limit: 1, summary: true })
  })

  it("파라미터 없음 → 인자 없이 호출(기존 전체 응답)", async () => {
    const { GET } = await import("@/app/api/admin/patch-notes/route")
    await GET(new NextRequest("http://localhost/api/admin/patch-notes"))
    expect(getAllPatchNotes).toHaveBeenCalledWith()
    expect(getAllPatchNotes.mock.calls[0]).toHaveLength(0)
  })

  it("limit은 양의 정수만, 100으로 캡·불량 값은 무시", async () => {
    const { GET } = await import("@/app/api/admin/patch-notes/route")
    await GET(new NextRequest("http://localhost/api/admin/patch-notes?limit=500"))
    await GET(new NextRequest("http://localhost/api/admin/patch-notes?limit=0"))
    await GET(new NextRequest("http://localhost/api/admin/patch-notes?limit=abc&summary=0"))
    expect(getAllPatchNotes).toHaveBeenNthCalledWith(1, { limit: 100 })
    expect(getAllPatchNotes.mock.calls[1]).toHaveLength(0)
    expect(getAllPatchNotes.mock.calls[2]).toHaveLength(0)
  })
})
