import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { __resetShareInFlightForTests, shareInFlight } from "@/lib/server/share-in-flight"

afterEach(() => {
  __resetShareInFlightForTests()
})

describe("shareInFlight", () => {
  it("동시 호출은 같은 promise를 공유하고 계산은 한 번만 돈다", async () => {
    let resolve!: (value: string) => void
    const run = vi.fn(() => new Promise<string>((r) => { resolve = r }))

    const first = shareInFlight("k", run)
    const second = shareInFlight("k", run)
    expect(second).toBe(first)
    expect(run).toHaveBeenCalledTimes(1)

    resolve("done")
    await expect(first).resolves.toBe("done")
    await expect(second).resolves.toBe("done")
  })

  it("완료 뒤의 호출은 다시 계산한다(캐시가 아니라 in-flight 공유)", async () => {
    const run = vi.fn(async () => "v")
    await shareInFlight("k", run)
    await shareInFlight("k", run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("키가 다르면 합치지 않는다", async () => {
    const run = vi.fn(async () => "v")
    await Promise.all([shareInFlight("a", run), shareInFlight("b", run)])
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("실패한 promise는 정리되어 다음 호출이 재시도한다", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok")
    await expect(shareInFlight("k", run)).rejects.toThrow("boom")
    await expect(shareInFlight("k", run)).resolves.toBe("ok")
    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe("shareInFlightByArgs", () => {
  it("같은 인자끼리만 합치고 인자를 그대로 전달한다", async () => {
    const { shareInFlightByArgs } = await import("@/lib/server/share-in-flight")
    let resolveA!: (v: string) => void
    const run = vi.fn((team: string, period: string) =>
      team === "ALL" ? new Promise<string>((r) => { resolveA = r }) : Promise.resolve(`${team}:${period}`)
    )
    const shared = shareInFlightByArgs("k", run)
    const a1 = shared("ALL", "Q")
    const a2 = shared("ALL", "Q")
    const b = shared("MKT", "Q")
    expect(a2).toBe(a1)
    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenCalledWith("ALL", "Q")
    resolveA("all:q")
    await expect(a1).resolves.toBe("all:q")
    await expect(b).resolves.toBe("MKT:Q")
  })
})
