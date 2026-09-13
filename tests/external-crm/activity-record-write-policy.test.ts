// 매퍼(lib/crm/activity-record-writeback.ts)가 만든 활동 기록 payload 가 되밀기 정책
// (lib/external-crm/xiaoshouyi-write.ts 의 activityrecord)을 실제로 통과하는지 잠근다.
//
// 배경: 정책이 dbcRelation26 을 무조건 필수로 잡고 있었는데 매퍼는 리드 출처면 그 필드를 빼므로
// 리드 출처 초안이 createCrmWriteRequest 에서 "Missing required create fields" 로 죽었다.
// 정책은 이제 되밀기 지침 §2-4 describe 필수(content·startTime·entityType·dimDepart·ownerId)를
// 필수로 잠그고, dbcRelation26 은 고객 출처(activityRecordFrom=1)에서만 필수, 리드 출처(11)에서는 금지다.

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildActivityRecordPayload,
  buildCustomerEventWritebackPayload,
  buildDemoTaskWritebackPayload,
  type ActivityWritebackTarget,
} from "@/lib/crm/activity-record-writeback"
import { buildCrmWritePreview } from "@/lib/external-crm/xiaoshouyi-write"

const ACCOUNT_TARGET: ActivityWritebackTarget = {
  externalAccountId: "4006219659975492",
  externalOwnerId: "3637136716307280",
  targetGroupId: "4374707173786001",
}

// 리드 출처. targetGroupId 는 지침 §8 확인 3(리드 단건 조회에 groupId 가 있는지)이 아직 미확인이라
// 여기서는 있다고 가정한다 — 없으면 매퍼가 missing_group 으로 막는다.
const LEAD_TARGET: ActivityWritebackTarget = {
  externalAccountId: "4100000000000001",
  externalOwnerId: "3637136716307280",
  targetGroupId: "4374707173786002",
  fromLead: true,
}

function buildAll(target: ActivityWritebackTarget) {
  const results = [
    buildActivityRecordPayload({
      ...target,
      type: "call",
      result: "answered",
      notes: "연장 의사 확인",
      contactedAt: "2026-08-28T02:30:00.000Z",
    }),
    buildCustomerEventWritebackPayload({
      ...target,
      title: "학원 방문 미팅",
      summary: "3개 교실 도입 논의",
      body: null,
      occurredAt: "2026-08-28T02:30:00.000Z",
      ownerName: "문준혁",
      kind: "visit",
    }),
    buildDemoTaskWritebackPayload({
      ...target,
      title: "수학 과목 데모",
      detail: "칠판·녹화 시연",
      outcome: "도입 검토하기로",
      completedAt: "2026-08-28T05:00:00.000Z",
      ownerName: "진소망",
      kind: "inbound_visit",
    }),
  ]
  return results.map((result) => {
    if (!result.ok) throw new Error(`mapper refused: ${result.reason}`)
    return result.payload as unknown as Record<string, unknown>
  })
}

function preview(payload: Record<string, unknown>) {
  return buildCrmWritePreview({ objectApiKey: "activityrecord", operation: "create", payload })
}

function omit(payload: Record<string, unknown>, field: string) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => key !== field))
}

describe("activityrecord 되밀기 정책 × 매퍼", () => {
  it("고객 출처 payload 3종(연락·방문/메모·데모)이 정책 검증을 통과한다", () => {
    for (const payload of buildAll(ACCOUNT_TARGET)) {
      const result = preview(payload)
      expect(result.method).toBe("POST")
      expect(result.urlPath).toBe("/rest/data/v2.0/xobjects/activityrecord")
      expect(result.body).toEqual({ data: payload })
    }
  })

  it("리드 출처 payload 3종이 dbcRelation26 없이도 정책 검증을 통과한다", () => {
    for (const payload of buildAll(LEAD_TARGET)) {
      expect(payload).not.toHaveProperty("dbcRelation26")
      expect(payload.activityRecordFrom).toBe(11)
      expect(() => preview(payload)).not.toThrow()
    }
  })

  it("describe 필수 필드(content·startTime·entityType·dimDepart·ownerId)가 비면 거절한다", () => {
    const [payload] = buildAll(ACCOUNT_TARGET)
    for (const field of ["content", "startTime", "entityType", "dimDepart", "ownerId"]) {
      expect(() => preview(omit(payload, field))).toThrow(new RegExp(`Missing required create fields.*${field}`))
    }
  })

  it("관계 정본인 activityRecordFrom / activityRecordFrom_data 쌍이 비면 거절한다", () => {
    const [payload] = buildAll(LEAD_TARGET)
    for (const field of ["activityRecordFrom", "activityRecordFrom_data"]) {
      expect(() => preview(omit(payload, field))).toThrow(new RegExp(`Missing required create fields.*${field}`))
    }
  })

  it("고객 출처(activityRecordFrom=1)인데 dbcRelation26 이 없으면 거절한다", () => {
    const [payload] = buildAll(ACCOUNT_TARGET)
    expect(() => preview(omit(payload, "dbcRelation26"))).toThrow(/고객 출처.*dbcRelation26/)
  })

  it("리드 출처(activityRecordFrom=11)에 dbcRelation26 을 넣으면 거절한다 — 고객 참조에 리드 id 가 들어간다", () => {
    const [payload] = buildAll(LEAD_TARGET)
    expect(() => preview({ ...payload, dbcRelation26: LEAD_TARGET.externalAccountId })).toThrow(
      /Forbidden create fields.*리드 출처.*dbcRelation26/
    )
  })

  it("startTime 이 문자열이면 거절한다 — 실제 API 는 5000047 로 거절한다", () => {
    const [payload] = buildAll(ACCOUNT_TARGET)
    expect(() => preview({ ...payload, startTime: String(payload.startTime) })).toThrow(/startTime/)
  })

  it("payload 가 { data } 로 감싸져 저장됐던 형태여도 같은 규칙으로 검증한다", () => {
    const [payload] = buildAll(LEAD_TARGET)
    expect(() => preview({ data: payload })).not.toThrow()
  })
})

// createCrmWriteRequest 까지 통과하는지 — Supabase 는 스키마 확인(select+limit)·insert 를 흉내 낸다.
describe("createCrmWriteRequest × activityrecord", () => {
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = []

  function tableClient(table: string) {
    const builder = {
      select: () => builder,
      limit: () => builder,
      single: () => builder,
      insert(row: Record<string, unknown>) {
        inserted.push({ table, row })
        return builder
      },
      then(resolve: (value: { data: Record<string, unknown>; error: null }) => void) {
        const last = inserted.filter((entry) => entry.table === table).at(-1)
        resolve({ data: { id: "req-1", ...(last?.row ?? {}) }, error: null })
      },
    }
    return builder
  }

  async function loadWriteModule() {
    vi.resetModules()
    inserted.length = 0
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: vi.fn(() => ({ from: vi.fn((table: string) => tableClient(table)) })),
    }))
    return import("@/lib/external-crm/xiaoshouyi-write")
  }

  afterEach(() => {
    vi.doUnmock("@/lib/supabase/admin")
    vi.resetModules()
  })

  it("리드 출처·고객 출처 초안이 모두 draft 로 적재된다", async () => {
    const { createCrmWriteRequest } = await loadWriteModule()

    for (const target of [LEAD_TARGET, ACCOUNT_TARGET]) {
      for (const payload of buildAll(target)) {
        const row = await createCrmWriteRequest({
          objectApiKey: "activityrecord",
          operation: "create",
          payload,
          requestedBy: "admin-1",
        })
        expect(row.status).toBe("draft")
        expect(row.object_api_key).toBe("activityrecord")
      }
    }

    const requests = inserted.filter((entry) => entry.table === "crm_write_requests")
    expect(requests).toHaveLength(6)
    // 리드 출처 3건은 dbcRelation26 없이, 고객 출처 3건은 dbcRelation26 을 달고 저장된다.
    const payloads = requests.map((entry) => entry.row.payload as Record<string, unknown>)
    expect(payloads.filter((payload) => payload.activityRecordFrom === 11).every((payload) => !("dbcRelation26" in payload))).toBe(true)
    expect(payloads.filter((payload) => payload.activityRecordFrom === 1).every((payload) => typeof payload.dbcRelation26 === "string")).toBe(true)
  })

  it("ownerId 가 빠진 payload 는 Supabase 에 닿기 전에 거절된다", async () => {
    const { createCrmWriteRequest } = await loadWriteModule()
    const [payload] = buildAll(ACCOUNT_TARGET)
    await expect(
      createCrmWriteRequest({ objectApiKey: "activityrecord", operation: "create", payload: omit(payload, "ownerId") })
    ).rejects.toThrow(/ownerId/)
    expect(inserted).toHaveLength(0)
  })
})
