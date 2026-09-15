// lib/repositories/hardware-samples.ts — 샘플 유닛 상태 전이·위치 기록·DB 미적용 문구 회귀.
//
// 사무실·샘플 재고 풀(운영자 결정 2026-09-15): office=가용, showroom=전시·사내 사용(가용 아님),
// loaned=나간 샘플. 전시 중인 유닛은 바로 대여하지 못하고 먼저 사무실 보관(store)으로 옮긴다.
// adjust 는 nextStatus 가 있으면 상태를 정정하고 사유 메모를 요구한다(운영 데이터 정리용).
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

type Result = { data: unknown; error: unknown }
type Op = "select" | "insert" | "update" | "delete"
interface Call {
  table: string
  op: Op
  payload?: unknown
  ids?: unknown[]
}

let queue: Result[]
let calls: Call[]

function makeBuilder(table: string) {
  let current: Call | null = null
  const start = (op: Op, payload?: unknown) => {
    current = { table, op, payload }
    calls.push(current)
  }
  const b = {
    select: vi.fn(() => {
      if (!current) start("select")
      return b
    }),
    insert: vi.fn((payload: unknown) => {
      start("insert", payload)
      return b
    }),
    update: vi.fn((payload: unknown) => {
      start("update", payload)
      return b
    }),
    delete: vi.fn(() => {
      start("delete")
      return b
    }),
    in: vi.fn((_column: string, ids: unknown[]) => {
      if (current) current.ids = ids
      return b
    }),
    eq: vi.fn(() => b),
    order: vi.fn(() => b),
    like: vi.fn(() => b),
    limit: vi.fn(() => b),
    then: (resolve: (value: Result) => void) => resolve(queue.shift() ?? { data: null, error: null }),
  }
  return b
}

const fromSpy = vi.fn((table: string) => makeBuilder(table))
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: fromSpy })),
}))
vi.mock("next/cache", () => ({
  revalidateTag,
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import { OFFICE_POOL_BULK_ACTION_FROM } from "@/components/admin/hardware/inventory/office-sample-pool"
import {
  HARDWARE_SAMPLES_CACHE_TAG,
  recordSampleUnitEvents,
  resolveSampleEventTarget,
  SAMPLE_EVENT_TRANSITIONS,
  SAMPLE_EVENT_TYPES,
  SAMPLE_SHOWROOM_SCHEMA_PENDING_MESSAGE,
  SAMPLE_UNIT_STATUSES,
  SampleUnitRuleError,
  type HardwareSampleUnit,
  type RecordableSampleEventType,
  type SampleUnitStatus,
} from "@/lib/repositories/hardware-samples"

function unit(overrides: Partial<HardwareSampleUnit> & Pick<HardwareSampleUnit, "id" | "status">): HardwareSampleUnit {
  return {
    item_id: "item-86",
    product_name: '86" IFP',
    asset_code: `S-86-${overrides.id}`,
    serial_no: null,
    current_customer: null,
    current_owner: null,
    loaned_at: null,
    expected_return_at: null,
    created_by: null,
    created_at: "2026-07-27T00:00:00Z",
    updated_at: "2026-07-27T00:00:00Z",
    ...overrides,
  }
}

function callsOf(op: Op, table?: string) {
  return calls.filter((call) => call.op === op && (!table || call.table === table))
}

async function expectRuleError(promise: Promise<unknown>, message: string, status: number) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  )
  expect(error).toBeInstanceOf(SampleUnitRuleError)
  expect((error as SampleUnitRuleError).message).toContain(message)
  expect((error as SampleUnitRuleError).status).toBe(status)
}

beforeEach(() => {
  queue = []
  calls = []
  fromSpy.mockClear()
  revalidateTag.mockClear()
})

// 사용자 확정 전이 표(2026-09-15) — 코드와 한 글자라도 다르면 실패해야 한다.
const EXPECTED_TRANSITIONS: Record<RecordableSampleEventType, { from: SampleUnitStatus[]; to: SampleUnitStatus | null }> = {
  loan: { from: ["office", "repair"], to: "loaned" },
  return: { from: ["loaned"], to: "office" },
  showcase: { from: ["office"], to: "showroom" },
  store: { from: ["showroom", "repair"], to: "office" },
  repair: { from: ["office", "loaned", "showroom"], to: "repair" },
  convert: { from: ["loaned", "office", "showroom"], to: "converted" },
  retire: { from: ["office", "loaned", "repair", "showroom"], to: "retired" },
  adjust: { from: [...SAMPLE_UNIT_STATUSES], to: null },
  memo: { from: [...SAMPLE_UNIT_STATUSES], to: null },
}

describe("샘플 유닛 전이 표", () => {
  it("상태·이벤트 상수에 showroom·showcase·store 가 들어 있다", () => {
    expect([...SAMPLE_UNIT_STATUSES].sort()).toEqual(["converted", "loaned", "office", "repair", "retired", "showroom"])
    expect([...SAMPLE_EVENT_TYPES].sort()).toEqual(
      ["adjust", "assign", "convert", "loan", "memo", "repair", "retire", "return", "showcase", "store"]
    )
  })

  it("사용자 확정 전이 표와 정확히 같다", () => {
    const actual = Object.fromEntries(
      Object.entries(SAMPLE_EVENT_TRANSITIONS).map(([key, value]) => [key, { from: [...value.from].sort(), to: value.to }])
    )
    const expected = Object.fromEntries(
      Object.entries(EXPECTED_TRANSITIONS).map(([key, value]) => [key, { from: [...value.from].sort(), to: value.to }])
    )
    expect(actual).toEqual(expected)
  })

  it("모든 이벤트 × 모든 상태 조합을 표대로 허용·거절한다", () => {
    for (const [eventType, rule] of Object.entries(EXPECTED_TRANSITIONS) as Array<
      [RecordableSampleEventType, (typeof EXPECTED_TRANSITIONS)[RecordableSampleEventType]]
    >) {
      for (const status of SAMPLE_UNIT_STATUSES) {
        const subject = { asset_code: "S-86-01", status }
        if (rule.from.includes(status)) {
          expect(resolveSampleEventTarget(subject, eventType), `${eventType} from ${status}`).toBe(rule.to ?? status)
        } else {
          let caught: unknown = null
          try {
            resolveSampleEventTarget(subject, eventType)
          } catch (error) {
            caught = error
          }
          expect(caught, `${eventType} from ${status} must be rejected`).toBeInstanceOf(SampleUnitRuleError)
          expect((caught as SampleUnitRuleError).status).toBe(409)
        }
      }
    }
  })

  it("전시 중인 유닛은 바로 대여하지 못하고 사무실 보관으로 먼저 옮기라고 안내한다", () => {
    expect(() => resolveSampleEventTarget({ asset_code: "S-86-01", status: "showroom" }, "loan")).toThrow(
      "전시 중인 유닛은 먼저 사무실 보관으로 옮기세요"
    )
  })

  it("adjust 는 nextStatus 가 있으면 그 상태로, 없으면 현재 상태 그대로다", () => {
    for (const status of SAMPLE_UNIT_STATUSES) {
      expect(resolveSampleEventTarget({ asset_code: "S-1", status }, "adjust")).toBe(status)
      expect(resolveSampleEventTarget({ asset_code: "S-1", status }, "adjust", "showroom")).toBe("showroom")
    }
  })

  it("클라이언트 사전 안내(OFFICE_POOL_BULK_ACTION_FROM)가 서버 전이 표와 같다", () => {
    expect([...OFFICE_POOL_BULK_ACTION_FROM.showcase].sort()).toEqual([...SAMPLE_EVENT_TRANSITIONS.showcase.from].sort())
    expect([...OFFICE_POOL_BULK_ACTION_FROM.store].sort()).toEqual([...SAMPLE_EVENT_TRANSITIONS.store.from].sort())
  })

  it("마이그레이션 20260915 의 check 값 집합이 저장소 상수와 같다", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260915_hardware_sample_showroom_status.sql"),
      "utf8"
    )
    const body = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
    const statusValues = /check \(status in \(([^)]*)\)\)/.exec(body)?.[1]
    const eventValues = /check \(event_type in \(([^)]*)\)\)/.exec(body)?.[1]
    const parse = (text: string | undefined) => (text ?? "").split(",").map((value) => value.trim().replace(/'/g, "")).sort()
    expect(parse(statusValues)).toEqual([...SAMPLE_UNIT_STATUSES].sort())
    expect(parse(eventValues)).toEqual([...SAMPLE_EVENT_TYPES].sort())
  })
})

describe("recordSampleUnitEvents — 샘플 전시·사무실 보관", () => {
  it("showcase: 사무실 보관 유닛을 전시로 옮기고 위치는 사무실 → 사무실로 남긴다", async () => {
    queue = [
      { data: [unit({ id: "01", status: "office", current_customer: "잔여 고객" })], error: null },
      { data: [{ id: "e1", unit_id: "01" }], error: null },
      { data: [unit({ id: "01", status: "showroom" })], error: null },
    ]

    const units = await recordSampleUnitEvents({ unitIds: ["01"], eventType: "showcase", occurredAt: "2026-09-15" })

    expect(units[0].status).toBe("showroom")
    const [insert] = callsOf("insert", "hardware_sample_events")
    expect(insert.payload).toEqual([
      expect.objectContaining({
        unit_id: "01",
        event_type: "showcase",
        occurred_at: "2026-09-15",
        from_location: "사무실",
        to_location: "사무실",
      }),
    ])
    const [update] = callsOf("update", "hardware_sample_units")
    expect(update.payload).toEqual({ status: "showroom", current_customer: null, loaned_at: null, expected_return_at: null })
    expect(update.ids).toEqual(["01"])
    expect(revalidateTag).toHaveBeenCalledWith(HARDWARE_SAMPLES_CACHE_TAG, { expire: 0 })
  })

  it("store: 전시 유닛은 사무실 → 사무실, 수리 유닛은 수리 → 사무실로 남기고 대여 흔적을 지운다", async () => {
    queue = [
      {
        data: [
          unit({ id: "01", status: "showroom" }),
          unit({ id: "02", status: "repair", current_customer: "수리 전 고객", loaned_at: "2025-01-01" }),
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [unit({ id: "01", status: "office" }), unit({ id: "02", status: "office" })], error: null },
    ]

    await recordSampleUnitEvents({ unitIds: ["01", "02"], eventType: "store" })

    const [insert] = callsOf("insert", "hardware_sample_events")
    expect(insert.payload).toEqual([
      expect.objectContaining({ unit_id: "01", event_type: "store", from_location: "사무실", to_location: "사무실" }),
      expect.objectContaining({ unit_id: "02", event_type: "store", from_location: "수리", to_location: "사무실" }),
    ])
    const updates = callsOf("update", "hardware_sample_units")
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toEqual({ status: "office", current_customer: null, loaned_at: null, expected_return_at: null })
    expect(updates[0].ids).toEqual(["01", "02"])
  })

  it("loan: 전시 중인 유닛이 섞이면 아무것도 쓰지 않고 거절한다", async () => {
    queue = [{ data: [unit({ id: "01", status: "office" }), unit({ id: "02", status: "showroom" })], error: null }]

    await expectRuleError(
      recordSampleUnitEvents({ unitIds: ["01", "02"], eventType: "loan", customer: "남명학원" }),
      "전시 중인 유닛은 먼저 사무실 보관으로 옮기세요",
      409
    )
    expect(callsOf("insert")).toHaveLength(0)
    expect(callsOf("update")).toHaveLength(0)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("허용되지 않는 전이는 현재 상태를 밝혀 409 로 거절한다", async () => {
    queue = [{ data: [unit({ id: "01", status: "loaned", current_customer: "탑텐영어" })], error: null }]

    await expectRuleError(
      recordSampleUnitEvents({ unitIds: ["01"], eventType: "showcase" }),
      "현재 상태(대여중)에서 전시 전환 처리할 수 없습니다",
      409
    )
    expect(callsOf("insert")).toHaveLength(0)
  })

  it("loan·return 의 기존 위치 기록 관례는 그대로다", async () => {
    queue = [
      { data: [unit({ id: "01", status: "office" })], error: null },
      { data: [], error: null },
      { data: [unit({ id: "01", status: "loaned" })], error: null },
    ]
    await recordSampleUnitEvents({ unitIds: ["01"], eventType: "loan", customer: "남명학원", occurredAt: "2026-09-15" })
    expect(callsOf("insert")[0].payload).toEqual([
      expect.objectContaining({ customer: "남명학원", from_location: "사무실", to_location: "남명학원" }),
    ])
    expect(callsOf("update")[0].payload).toEqual({
      status: "loaned",
      current_customer: "남명학원",
      loaned_at: "2026-09-15",
      expected_return_at: null,
    })

    calls = []
    queue = [
      { data: [unit({ id: "01", status: "loaned", current_customer: "남명학원" })], error: null },
      { data: [], error: null },
      { data: [unit({ id: "01", status: "office" })], error: null },
    ]
    await recordSampleUnitEvents({ unitIds: ["01"], eventType: "return" })
    expect(callsOf("insert")[0].payload).toEqual([
      expect.objectContaining({ customer: "남명학원", from_location: "남명학원", to_location: "사무실" }),
    ])
  })
})

describe("recordSampleUnitEvents — 샘플 상태 정정(adjust nextStatus)", () => {
  it("nextStatus 가 있으면 사유 메모가 없을 때 DB 를 건드리기 전에 400 으로 거절한다", async () => {
    await expectRuleError(
      recordSampleUnitEvents({ unitIds: ["01"], eventType: "adjust", nextStatus: "office", memo: "  " }),
      "상태 정정에는 사유 메모가 필요합니다",
      400
    )
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it("nextStatus 는 adjust 에서만 받는다", async () => {
    await expectRuleError(
      recordSampleUnitEvents({ unitIds: ["01"], eventType: "return", nextStatus: "office", memo: "x" }),
      "정정(adjust) 이벤트에서만",
      400
    )
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it("알 수 없는 nextStatus 는 거절한다", async () => {
    await expectRuleError(
      recordSampleUnitEvents({
        unitIds: ["01"],
        eventType: "adjust",
        nextStatus: "demo" as unknown as SampleUnitStatus,
        memo: "x",
      }),
      "정정할 상태 값이 올바르지 않습니다",
      400
    )
  })

  it("대여 → 전시 정정: 위치는 고객 → 사무실, 대여 흔적을 지우고 메모를 남긴다", async () => {
    queue = [
      {
        data: [unit({ id: "01", status: "loaned", current_customer: "클래스인 쇼룸", loaned_at: "2024-04-01" })],
        error: null,
      },
      { data: [{ id: "e1", unit_id: "01" }], error: null },
      { data: [unit({ id: "01", status: "showroom" })], error: null },
    ]

    await recordSampleUnitEvents({
      unitIds: ["01"],
      eventType: "adjust",
      nextStatus: "showroom",
      memo: "9/15 실사 — 쇼룸 전시",
      customer: "무시될 고객",
    })

    expect(callsOf("insert")[0].payload).toEqual([
      expect.objectContaining({
        event_type: "adjust",
        from_location: "클래스인 쇼룸",
        to_location: "사무실",
        memo: "9/15 실사 — 쇼룸 전시",
      }),
    ])
    expect(callsOf("update")[0].payload).toEqual({
      status: "showroom",
      current_customer: null,
      loaned_at: null,
      expected_return_at: null,
    })
  })

  it("→ 대여 정정: 새로 대여가 된 유닛만 처리일부터 세고, 이미 대여중이던 유닛은 대여일을 지킨다", async () => {
    queue = [
      {
        data: [
          unit({ id: "01", status: "office" }),
          unit({ id: "02", status: "loaned", current_customer: "고객 미상", loaned_at: "2026-07-27" }),
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [unit({ id: "01", status: "loaned" })], error: null },
      { data: [unit({ id: "02", status: "loaned" })], error: null },
    ]

    const units = await recordSampleUnitEvents({
      unitIds: ["01", "02"],
      eventType: "adjust",
      nextStatus: "loaned",
      memo: "실사 — 고객사 확인",
      occurredAt: "2026-09-15",
    })

    expect(units.map((item) => item.id)).toEqual(["01", "02"])
    const updates = callsOf("update", "hardware_sample_units")
    expect(updates).toHaveLength(2)
    expect(updates[0]).toMatchObject({
      ids: ["01"],
      payload: { status: "loaned", current_customer: "고객 미상", loaned_at: "2026-09-15" },
    })
    expect(updates[1]).toMatchObject({ ids: ["02"], payload: { status: "loaned" } })
    expect(callsOf("insert")[0].payload).toEqual([
      expect.objectContaining({ unit_id: "01", from_location: "사무실", to_location: "고객 미상" }),
      expect.objectContaining({ unit_id: "02", from_location: "고객 미상", to_location: "고객 미상" }),
    ])
  })

  it("nextStatus 없는 adjust 는 예전처럼 상태를 바꾸지 않고 전달된 필드만 고친다", async () => {
    queue = [
      { data: [unit({ id: "01", status: "loaned", current_customer: "고객 미상" })], error: null },
      { data: [], error: null },
      { data: [unit({ id: "01", status: "loaned", current_customer: "탑텐영어" })], error: null },
    ]

    await recordSampleUnitEvents({ unitIds: ["01"], eventType: "adjust", customer: "탑텐영어" })

    expect(callsOf("update")[0].payload).toEqual({ current_customer: "탑텐영어" })
    expect(callsOf("insert")[0].payload).toEqual([
      expect.objectContaining({ event_type: "adjust", customer: "탑텐영어", from_location: null, to_location: null }),
    ])
  })
})

describe("recordSampleUnitEvents — 샘플 전시 DB 미적용(23514)", () => {
  const checkViolation = {
    code: "23514",
    message: 'new row for relation "hardware_sample_events" violates check constraint "hardware_sample_events_event_type_check"',
  }

  it("showcase 이벤트가 check 에 걸리면 읽을 수 있는 문구(409)로 바꾸고 상태는 건드리지 않는다", async () => {
    queue = [
      { data: [unit({ id: "01", status: "office" })], error: null },
      { data: null, error: checkViolation },
    ]

    await expectRuleError(
      recordSampleUnitEvents({ unitIds: ["01"], eventType: "showcase" }),
      SAMPLE_SHOWROOM_SCHEMA_PENDING_MESSAGE,
      409
    )
    expect(callsOf("update")).toHaveLength(0)
    expect(callsOf("delete")).toHaveLength(0)
  })

  it("adjust → showroom 은 이벤트가 들어간 뒤 상태 갱신이 막히므로 방금 넣은 이벤트를 되돌린다", async () => {
    queue = [
      { data: [unit({ id: "01", status: "loaned", current_customer: "클래스인 쇼룸" })], error: null },
      { data: [{ id: "event-1", unit_id: "01" }], error: null },
      {
        data: null,
        error: {
          code: "23514",
          message: 'new row for relation "hardware_sample_units" violates check constraint "hardware_sample_units_status_check"',
        },
      },
      { data: null, error: null }, // delete
    ]

    await expectRuleError(
      recordSampleUnitEvents({ unitIds: ["01"], eventType: "adjust", nextStatus: "showroom", memo: "쇼룸 전시" }),
      SAMPLE_SHOWROOM_SCHEMA_PENDING_MESSAGE,
      409
    )
    const deletes = callsOf("delete", "hardware_sample_events")
    expect(deletes).toHaveLength(1)
    expect(deletes[0].ids).toEqual(["event-1"])
    expect(revalidateTag).toHaveBeenCalledWith(HARDWARE_SAMPLES_CACHE_TAG, { expire: 0 })
  })

  it("여러 묶음 중 뒤 묶음만 실패하면 반영된 유닛의 이벤트는 남기고 실패한 유닛의 이벤트만 되돌린다", async () => {
    const networkError = { code: "08006", message: "connection failure" }
    queue = [
      {
        data: [
          unit({ id: "01", status: "office" }),
          unit({ id: "02", status: "loaned", current_customer: "고객 미상", loaned_at: "2026-07-27" }),
        ],
        error: null,
      },
      {
        data: [
          { id: "event-1", unit_id: "01" },
          { id: "event-2", unit_id: "02" },
        ],
        error: null,
      },
      { data: [unit({ id: "01", status: "loaned" })], error: null },
      { data: null, error: networkError },
      { data: null, error: null }, // delete
    ]

    const error = await recordSampleUnitEvents({
      unitIds: ["01", "02"],
      eventType: "adjust",
      nextStatus: "loaned",
      memo: "실사",
    }).catch((reason: unknown) => reason)

    // 전시와 무관한 실패는 원래 오류 그대로 올린다.
    expect(error).toBe(networkError)
    expect(callsOf("delete", "hardware_sample_events")[0].ids).toEqual(["event-2"])
  })

  it("전시와 무관한 check 위반은 원래 오류를 그대로 올린다", async () => {
    const otherViolation = { code: "23514", message: "some other check" }
    queue = [
      { data: [unit({ id: "01", status: "office" })], error: null },
      { data: null, error: otherViolation },
    ]

    const error = await recordSampleUnitEvents({ unitIds: ["01"], eventType: "loan", customer: "남명학원" }).catch(
      (reason: unknown) => reason
    )
    expect(error).toBe(otherViolation)
  })

  it("찾지 못한 유닛은 404 규칙 오류다", async () => {
    queue = [{ data: [], error: null }]
    await expectRuleError(
      recordSampleUnitEvents({ unitIds: ["01"], eventType: "store" }),
      "일부 유닛을 찾을 수 없습니다",
      404
    )
  })
})
