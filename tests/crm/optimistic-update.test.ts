import { describe, expect, it, vi } from "vitest"

import { runOptimistic } from "@/lib/crm/optimistic-update"

describe("runOptimistic", () => {
  it("runs snapshot → apply → commit in order and reports ok", async () => {
    const order: string[] = []
    const rollback = vi.fn()
    const onError = vi.fn()
    const result = await runOptimistic({
      snapshot: () => { order.push("snapshot"); return ["a", "b"] },
      apply: () => order.push("apply"),
      commit: async () => { order.push("commit") },
      rollback,
      onError,
    })
    expect(result).toEqual({ ok: true })
    expect(order).toEqual(["snapshot", "apply", "commit"])
    expect(rollback).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("rolls back with the pre-apply snapshot and calls onError when commit rejects", async () => {
    let rows = ["a", "b"]
    const error = new Error("network")
    const onError = vi.fn()
    const result = await runOptimistic({
      snapshot: () => rows,
      apply: () => { rows = rows.filter((r) => r !== "a") },
      commit: () => Promise.reject(error),
      rollback: (saved) => { rows = saved },
      onError,
    })
    expect(result).toEqual({ ok: false, error })
    expect(rows).toEqual(["a", "b"])
    expect(onError).toHaveBeenCalledWith(error)
  })

  it("does not throw when onError is omitted; the caller branches on the result", async () => {
    const rollback = vi.fn()
    const result = await runOptimistic({
      snapshot: () => 1,
      apply: () => undefined,
      commit: async () => { throw new Error("boom") },
      rollback,
    })
    expect(result.ok).toBe(false)
    expect(rollback).toHaveBeenCalledWith(1)
  })
})
