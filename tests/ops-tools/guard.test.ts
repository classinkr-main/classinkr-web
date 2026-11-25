/**
 * 쓰기 안전장치(lib/ops-tools/guard.ts) — 넘침 정리가 실행 중인 키를 지우지 않는지, 지문 대조, 상한 되돌리기.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { IDEMPOTENCY_MAX_ENTRIES, WRITE_RATE_LIMIT, fingerprintArgs, resetOpsGuardsForTest, runIdempotent, takeWriteSlot } from "@/lib/ops-tools/guard"

beforeEach(() => resetOpsGuardsForTest())

describe("idempotency 메모리", () => {
  it("넘쳐도 실행 중(pending) 항목은 지우지 않고, 실행 중 항목만으로 꽉 차면 새 키를 거절한다", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const execute = vi.fn(async () => {
      await gate
      return "done"
    })
    const first = runIdempotent({ caller: "c", tool: "t", key: "k-0", fingerprint: "f" }, execute)
    for (let i = 1; i < IDEMPOTENCY_MAX_ENTRIES; i++) void runIdempotent({ caller: "c", tool: "t", key: `k-${i}`, fingerprint: "f" }, execute)
    await expect(runIdempotent({ caller: "c", tool: "t", key: "overflow", fingerprint: "f" }, execute)).rejects.toMatchObject({ code: "rate_limited" })
    // 가장 오래된 실행 중 키로 동시에 재시도해도 두 번 실행하지 않는다
    const again = runIdempotent({ caller: "c", tool: "t", key: "k-0", fingerprint: "f" }, execute)
    release()
    expect(await first).toEqual({ result: "done", replayed: false })
    expect(await again).toEqual({ result: "done", replayed: true })
    expect(execute).toHaveBeenCalledTimes(IDEMPOTENCY_MAX_ENTRIES)
  })

  it("넘칠 때는 끝난 항목부터 지워 새 키를 받는다", async () => {
    for (let i = 0; i < IDEMPOTENCY_MAX_ENTRIES; i++) await runIdempotent({ caller: "c", tool: "t", key: `d-${i}`, fingerprint: "f" }, async () => i)
    expect(await runIdempotent({ caller: "c", tool: "t", key: "new", fingerprint: "f" }, async () => "x")).toEqual({ result: "x", replayed: false })
  })

  it("도메인 표에서 찾은 결과의 지문이 다르면 거절하고 키를 남기지 않는다", async () => {
    const lookup = async () => ({ result: "old", fingerprint: "other" })
    await expect(runIdempotent({ caller: "c", tool: "t", key: "k", fingerprint: "mine" }, async () => "new", lookup)).rejects.toMatchObject({ code: "idempotency_conflict" })
    expect(await runIdempotent({ caller: "c", tool: "t", key: "k", fingerprint: "other" }, async () => "new", lookup)).toEqual({ result: "old", replayed: true })
  })

  it("지문은 키 순서와 idempotency_key 에 상관없고 원문을 싣지 않는다", () => {
    const a = fingerprintArgs({ b: 1, a: { y: 2, x: "010-1234-5678" }, idempotency_key: "k1" })
    expect(a).toBe(fingerprintArgs({ a: { x: "010-1234-5678", y: 2 }, b: 1 }))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("분당 상한", () => {
  it("release 는 센 한 번만 되돌린다", () => {
    const now = 1_000_000
    const slots = Array.from({ length: WRITE_RATE_LIMIT.max }, (_, i) => takeWriteSlot("c", now + i))
    expect(takeWriteSlot("c", now + 20).allowed).toBe(false)
    slots[3].release()
    slots[3].release()
    expect(takeWriteSlot("c", now + 21).allowed).toBe(true)
    expect(takeWriteSlot("c", now + 22).allowed).toBe(false)
  })
})
