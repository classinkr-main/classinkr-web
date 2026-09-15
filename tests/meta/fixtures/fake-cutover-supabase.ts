import { vi } from "vitest"

// 전환 스위치·원장·증인 RPC 만 흉내 내는 가짜 Supabase 클라이언트(설계 META-RECEIVER-FINAL H4·H5 테스트용).
// 호출은 전부 calls 에 남긴다. 실 DB·네트워크에 닿지 않는다.

export type FakeResult = { data: unknown; error: { message: string; code?: string } | null }
export type FakeReply = FakeResult | Error | "hang"

export type FakeCutoverSupabaseOptions = {
  /** meta_leadgen_cutover 읽기 결과 */
  cutover?: FakeReply | (() => FakeReply)
  /** meta_lead_mirror_ledger 읽기 결과(청크마다 호출) */
  ledger?: FakeReply | ((ids: string[], states: string[]) => FakeReply)
  /** meta_leadgen_record_receipts RPC 결과 */
  receipts?: FakeReply | ((args: Record<string, unknown>) => FakeReply)
}

export type FakeCall =
  | { kind: "from"; table: string; select?: string; filters: Array<[string, string, unknown]> }
  | { kind: "rpc"; name: string; args: Record<string, unknown> }

export function cutoverRow(overrides: Record<string, unknown> = {}) {
  return {
    mode: "admin",
    shadow_since: null,
    mirror_since: null,
    compass_started_at: null,
    compass_ended_at: null,
    side_effects: {
      leadCreatedNotification: true,
      subscriberUpsert: true,
      automationOnSubmit: true,
      externalForwards: true,
    },
    fallback_after_minutes: 120,
    updated_at: "2026-09-15T00:00:00.000Z",
    ...overrides,
  }
}

function settle(reply: FakeReply, signal: AbortSignal | undefined): Promise<FakeResult> {
  if (reply === "hang") {
    return new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("AbortError: aborted")))
    })
  }
  if (reply instanceof Error) return Promise.reject(reply)
  return Promise.resolve(reply)
}

export function createFakeCutoverSupabase(options: FakeCutoverSupabaseOptions = {}) {
  const calls: FakeCall[] = []

  function resolveReply<T extends unknown[]>(
    source: FakeReply | ((...args: T) => FakeReply) | undefined,
    fallback: FakeReply,
    ...args: T
  ): FakeReply {
    if (typeof source === "function") return source(...args)
    return source ?? fallback
  }

  const client = {
    from: vi.fn((table: string) => {
      const call: FakeCall = { kind: "from", table, filters: [] }
      calls.push(call)
      let signal: AbortSignal | undefined
      const builder = {
        select(columns: string) {
          call.select = columns
          return builder
        },
        eq(column: string, value: unknown) {
          call.filters.push(["eq", column, value])
          return builder
        },
        in(column: string, values: unknown[]) {
          call.filters.push(["in", column, values])
          return builder
        },
        abortSignal(value: AbortSignal) {
          signal = value
          return builder
        },
        maybeSingle() {
          return settle(resolveReply(options.cutover, { data: null, error: null }), signal)
        },
        then(onFulfilled: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) {
          const ids = (call.filters.find((filter) => filter[1] === "leadgen_id")?.[2] ?? []) as string[]
          const states = (call.filters.find((filter) => filter[1] === "state")?.[2] ?? []) as string[]
          return settle(resolveReply(options.ledger, { data: [], error: null }, ids, states), signal).then(
            onFulfilled,
            onRejected
          )
        },
      }
      return builder
    }),
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      calls.push({ kind: "rpc", name, args })
      let signal: AbortSignal | undefined
      const builder = {
        abortSignal(value: AbortSignal) {
          signal = value
          return builder
        },
        then(onFulfilled: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) {
          return settle(resolveReply(options.receipts, { data: 1, error: null }, args), signal).then(
            onFulfilled,
            onRejected
          )
        },
      }
      return builder
    }),
  }

  return { client, calls }
}
