import { readFileSync } from "node:fs"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

// 건강 RPC 읽기(관리 화면·"미측정" 가드 공용). 경보는 내지 않고, 절대 던지지 않는다.

const hoisted = vi.hoisted(() => ({ client: null as unknown }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    if (!hoisted.client) throw new Error("Supabase env 없음")
    return hoisted.client
  },
}))

import {
  META_LEAD_MIRROR_HEALTH_FUNCTION,
  META_LEAD_MIRROR_HEALTH_TIMEOUT_MS,
  readMetaLeadMirrorHealth,
} from "@/lib/meta/lead-mirror-health"

function clientResolving(result: unknown | (() => Promise<unknown>)) {
  const abortSignal = vi.fn((signal: AbortSignal) => {
    void signal
    return typeof result === "function" ? (result as () => Promise<unknown>)() : Promise.resolve(result)
  })
  const rpc = vi.fn(() => ({ abortSignal }))
  return { rpc, abortSignal }
}

afterEach(() => {
  hoisted.client = null
  vi.useRealTimers()
})

describe("readMetaLeadMirrorHealth", () => {
  it("함수 이름은 미러 오케스트레이터의 건강 RPC 이름과 같다", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/server/meta-lead-mirror.ts"), "utf8")
    expect(source).toContain(`export const META_LEAD_MIRROR_HEALTH_RPC = "${META_LEAD_MIRROR_HEALTH_FUNCTION}"`)
  })

  it("객체 응답은 ok:true 와 원문 jsonb 를 돌려준다(인자 없이 한 번 부른다)", async () => {
    const client = clientResolving({ data: { mode: "compass", stale_minutes: 3 }, error: null })
    hoisted.client = client

    await expect(readMetaLeadMirrorHealth()).resolves.toEqual({
      ok: true,
      health: { mode: "compass", stale_minutes: 3 },
    })
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith("meta_lead_mirror_health")
  })

  it("RPC 오류(함수 없음·권한)는 코드와 함께 ok:false", async () => {
    hoisted.client = clientResolving({ data: null, error: { code: "PGRST202", message: "Could not find the function" } })

    await expect(readMetaLeadMirrorHealth()).resolves.toEqual({
      ok: false,
      error: "meta_lead_mirror_health 실패: PGRST202 Could not find the function",
    })
  })

  it("객체가 아닌 응답(null·배열·숫자)은 ok:false", async () => {
    for (const data of [null, [], 3]) {
      hoisted.client = clientResolving({ data, error: null })
      await expect(readMetaLeadMirrorHealth()).resolves.toMatchObject({ ok: false })
    }
  })

  it("클라이언트 생성 실패·호출 예외도 던지지 않고 ok:false", async () => {
    hoisted.client = null
    await expect(readMetaLeadMirrorHealth()).resolves.toEqual({
      ok: false,
      error: "meta_lead_mirror_health 실패: Supabase env 없음",
    })

    hoisted.client = clientResolving(() => Promise.reject(new Error("fetch failed")))
    await expect(readMetaLeadMirrorHealth()).resolves.toEqual({
      ok: false,
      error: "meta_lead_mirror_health 실패: fetch failed",
    })
  })

  it("상한을 넘기면 요청을 취소하고 ok:false(기본 8초)", async () => {
    vi.useFakeTimers()
    const client = clientResolving(() => new Promise(() => {}))
    hoisted.client = client

    const pending = readMetaLeadMirrorHealth()
    await vi.advanceTimersByTimeAsync(META_LEAD_MIRROR_HEALTH_TIMEOUT_MS)

    await expect(pending).resolves.toEqual({ ok: false, error: "meta_lead_mirror_health 실패: 8000ms 초과" })
    const signal = client.abortSignal.mock.calls[0][0] as AbortSignal
    expect(signal.aborted).toBe(true)
  })
})
