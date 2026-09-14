import { afterEach, describe, expect, it, vi } from "vitest"

// getCompassActivitySignals — 리드 상태 자동 반영이 쓰는 Compass 활동 신호(lead_id·kind·actor) 조회.
// @/lib/supabase/admin 만 목으로 세우고 브리지 구현을 그대로 통과시킨다(bridge-memo.test.ts 와 같은 층위).

type Page = { data: unknown; error: unknown }

let pages: Page[] = []
let calls: Array<Record<string, unknown[]>> = []
let fromMock: ReturnType<typeof vi.fn>

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import { getCompassActivitySignals } from "@/lib/compass/bridge"

function installChain() {
  fromMock = vi.fn((table: string) => {
    const call: Record<string, unknown[]> = { from: [table], in: [] }
    calls.push(call)
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn((...args: unknown[]) => {
      call.select = args
      return chain
    })
    chain.in = vi.fn((...args: unknown[]) => {
      call.in.push(args)
      return chain
    })
    chain.order = vi.fn((...args: unknown[]) => {
      call.order = args
      return chain
    })
    chain.range = vi.fn((...args: unknown[]) => {
      call.range = args
      return Promise.resolve(pages.shift() ?? { data: [], error: null })
    })
    return chain
  })
}

afterEach(() => {
  pages = []
  calls = []
  vi.clearAllMocks()
})

const KINDS = ["call", "note"] as const

describe("getCompassActivitySignals", () => {
  it("입력 id가 없으면 조회하지 않는다", async () => {
    installChain()
    const result = await getCompassActivitySignals([], KINDS)
    expect(result).toEqual({ rows: [], down: false })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it("lead_id·kind·actor 만 읽고(본문 미전송) kind 를 서버에서 거른다", async () => {
    installChain()
    pages = [
      {
        data: [
          { lead_id: 5, kind: "call", actor: "황찬우" },
          { lead_id: 2, kind: "note", actor: "BD시트" },
        ],
        error: null,
      },
    ]

    const result = await getCompassActivitySignals([5, 2, 9, 2], KINDS)

    expect(result).toEqual({
      rows: [
        { lead_id: 5, kind: "call", actor: "황찬우" },
        { lead_id: 2, kind: "note", actor: "BD시트" },
      ],
      down: false,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].from).toEqual(["compass_activities_v"])
    expect(calls[0].select).toEqual(["lead_id, kind, actor"])
    expect(calls[0].in).toEqual([
      ["lead_id", [2, 5, 9]],
      ["kind", ["call", "note"]],
    ])
    expect(calls[0].range).toEqual([0, 999])
  })

  it("페이지가 가득 차면 다음 페이지를 이어서 읽는다 — 행 상한에서 조용히 잘리지 않는다", async () => {
    installChain()
    const full = Array.from({ length: 1000 }, () => ({ lead_id: 1, kind: "note", actor: "BD시트" }))
    pages = [
      { data: full, error: null },
      { data: [{ lead_id: 1, kind: "call", actor: "진소망" }], error: null },
    ]

    const result = await getCompassActivitySignals([1], KINDS)

    expect(result.rows).toHaveLength(1001)
    expect(result.rows.at(-1)).toEqual({ lead_id: 1, kind: "call", actor: "진소망" })
    expect(calls.map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(calls[0].order).toEqual(["id", { ascending: true }])
  })

  it("id 가 많으면 100개씩 나눠 조회한다 — URL 길이 상한 대비", async () => {
    installChain()
    const ids = Array.from({ length: 250 }, (_, index) => index + 1)

    await getCompassActivitySignals(ids, KINDS)

    const chunks = calls.map((call) => (call.in[0] as [string, number[]])[1])
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 50])
  })

  it("조회 오류는 던지지 않고 down 으로 알린다 — 빈 결과를 '활동 없음'으로 위장하지 않는다", async () => {
    installChain()
    pages = [{ data: null, error: { message: "relation does not exist" } }]

    const result = await getCompassActivitySignals([1], KINDS)

    expect(result).toMatchObject({ rows: [], down: true, error: "relation does not exist" })
  })

  it("클라이언트 예외도 down 으로 접는다", async () => {
    fromMock = vi.fn(() => {
      throw new Error("network down")
    })

    const result = await getCompassActivitySignals([1], KINDS)

    expect(result).toMatchObject({ rows: [], down: true, error: "network down" })
  })
})
