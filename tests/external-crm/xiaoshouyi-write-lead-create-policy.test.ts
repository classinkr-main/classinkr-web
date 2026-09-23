import { beforeEach, describe, expect, it, vi } from "vitest"

// 네오CRM lead 생성 닫기(2026-09-14, Compass 감사 R6 G3·G4 / SPEC §3 K9·§5 E6).
// lead 생성의 작성자는 Compass 하나다(scripts/push_neocrm.mjs — NEO 중복 사전 검사가 거기에만 있다).
// 이 저장소 쓰기 큐로 만든 lead(특히 mobile 필드)는 Compass 검사(phone SOQL)가 영영 찾지 못해
// 중복 등록이 된다. 호출부 전수 grep 결과 lead create 를 부르는 UI·코드가 없어서 닫았다.
// 닫는 것은 create 뿐 — update·transfer_owner·다른 객체의 정책은 그대로여야 한다.

vi.mock("server-only", () => ({}))

const LEAD_CREATE_CLOSED = "리드 생성은 Compass 단일 경로"

/** 가짜 Supabase — 체인 메서드는 자기 자신을 돌려주고, await 하면 표 이름·동작별 결과를 준다. */
const db = vi.hoisted(() => {
  type Call = { table: string; op: string; payload?: unknown }
  const state = {
    calls: [] as Call[],
    row: null as Record<string, unknown> | null,
    touched: false,
  }
  function builder(table: string) {
    let op = "select"
    let payload: unknown
    const chain: Record<string, unknown> = {}
    for (const method of ["select", "eq", "in", "order", "limit", "maybeSingle", "single"]) {
      chain[method] = () => chain
    }
    chain.update = (value: unknown) => {
      op = "update"
      payload = value
      return chain
    }
    chain.insert = (value: unknown) => {
      op = "insert"
      payload = value
      return chain
    }
    chain.then = (resolve: (value: unknown) => unknown) => {
      state.calls.push({ table, op, payload })
      if (table === "crm_write_requests" && op === "select") return resolve({ data: state.row, error: null })
      if (table === "crm_write_requests" && op === "update") {
        return resolve({ data: { ...state.row, ...(payload as object) }, error: null })
      }
      return resolve({ data: [], error: null })
    }
    return chain
  }
  return {
    state,
    client: {
      from: (table: string) => {
        state.touched = true
        return builder(table)
      },
    },
  }
})

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => db.client,
}))

const remote = vi.hoisted(() => ({
  fetchXiaoshouyi: vi.fn(),
  getAccessToken: vi.fn(),
  getXiaoshouyiConfig: vi.fn(),
}))

vi.mock("@/lib/external-crm/xiaoshouyi-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/external-crm/xiaoshouyi-request")>()
  return { ...actual, ...remote }
})

import { buildActivityRecordPayload } from "@/lib/crm/activity-record-writeback"
import {
  buildCrmWritePreview,
  createCrmWriteRequest,
  executeCrmWriteRequest,
  getXiaoshouyiWriteMetadataPreflight,
} from "@/lib/external-crm/xiaoshouyi-write"

/** docs/active/neocrm-writeback-guide-2026-09-07.md §2-1 의 필수 필드를 다 채운 lead 페이로드. */
const VALID_LEAD_PAYLOAD = {
  name: "홍길동",
  companyName: "테스트학원",
  entityType: "3581900737888896",
  dimDepart: "3632980020953825",
  phone: "0082-1012345678",
  ownerId: "123",
}

beforeEach(() => {
  db.state.calls = []
  db.state.row = null
  db.state.touched = false
  remote.fetchXiaoshouyi.mockReset()
  remote.getAccessToken.mockReset()
  remote.getXiaoshouyiConfig.mockReset()
})

describe("lead create — 닫힘", () => {
  it("유효한 페이로드여도 미리보기 단계에서 Compass 단일 경로 사유로 거절한다", () => {
    expect(() =>
      buildCrmWritePreview({ objectApiKey: "lead", operation: "create", payload: VALID_LEAD_PAYLOAD })
    ).toThrow(LEAD_CREATE_CLOSED)
  })

  it("{ data } 로 감싼 페이로드·mobile 필드·앞뒤 공백 객체 키도 같은 사유로 거절한다", () => {
    expect(() =>
      buildCrmWritePreview({
        objectApiKey: " lead ",
        operation: "create",
        payload: { data: { ...VALID_LEAD_PAYLOAD, mobile: "01012345678" } },
      })
    ).toThrow(LEAD_CREATE_CLOSED)
  })

  it("필드 검증보다 먼저 막는다 — 모르는 필드·필수 누락이어도 사유는 닫힘이다", () => {
    expect(() =>
      buildCrmWritePreview({ objectApiKey: "lead", operation: "create", payload: { remark: "x" } })
    ).toThrow(LEAD_CREATE_CLOSED)
  })

  it("큐 적재(createCrmWriteRequest)는 DB 를 건드리기 전에 거절한다 — draft 행이 생기지 않는다", async () => {
    await expect(
      createCrmWriteRequest({ objectApiKey: "lead", operation: "create", payload: VALID_LEAD_PAYLOAD, requestedBy: "u1" })
    ).rejects.toThrow(LEAD_CREATE_CLOSED)
    expect(db.state.touched).toBe(false)
  })

  it("닫기 전에 이미 승인된 lead create 요청은 실행 시 NEO 호출 없이 failed 로 끝난다", async () => {
    db.state.row = {
      id: "req-1",
      source_system: "xiaoshouyi",
      object_api_key: "lead",
      external_id: null,
      operation: "create",
      payload: VALID_LEAD_PAYLOAD,
      status: "approved",
      attempt_count: 0,
    }

    const result = await executeCrmWriteRequest("req-1", "admin-1")

    expect(result).toMatchObject({ status: "failed", error: LEAD_CREATE_CLOSED })
    expect(remote.getXiaoshouyiConfig).not.toHaveBeenCalled()
    expect(remote.getAccessToken).not.toHaveBeenCalled()
    expect(remote.fetchXiaoshouyi).not.toHaveBeenCalled()
    // 전송 선점(status → sent)도 하지 않는다 — 시도 횟수를 까먹지 않는다.
    const updates = db.state.calls.filter((call) => call.table === "crm_write_requests" && call.op === "update")
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toMatchObject({ status: "failed", error: LEAD_CREATE_CLOSED })
    const events = db.state.calls.filter((call) => call.table === "crm_write_request_events" && call.op === "insert")
    expect(events).toHaveLength(1)
    expect(events[0].payload).toMatchObject({ event_type: "failed", from_status: "approved", to_status: "failed" })
  })
})

describe("lead create 외 정책 — 그대로", () => {
  it("lead update 는 외부 id 로 PATCH 미리보기를 만든다", () => {
    const preview = buildCrmWritePreview({
      objectApiKey: "lead",
      operation: "update",
      externalId: "3700000000000001",
      payload: { companyName: "바뀐학원", mobile: "01012345678" },
    })
    expect(preview).toMatchObject({
      operation: "update",
      method: "PATCH",
      urlPath: "/rest/data/v2.0/xobjects/lead/3700000000000001",
      body: { data: { companyName: "바뀐학원", mobile: "01012345678" } },
    })
  })

  it("lead update 의 허용 필드 검증은 그대로다", () => {
    expect(() =>
      buildCrmWritePreview({ objectApiKey: "lead", operation: "update", externalId: "1", payload: { remark: "x" } })
    ).toThrow("Unsupported Xiaoshouyi fields for 리드: remark")
  })

  it("lead transfer_owner 는 ownerId 만 담아 PATCH 한다", () => {
    const preview = buildCrmWritePreview({
      objectApiKey: "lead",
      operation: "transfer_owner",
      externalId: "3700000000000001",
      payload: { ownerId: " 456 ", name: "무시" },
    })
    expect(preview).toMatchObject({ method: "PATCH", body: { data: { ownerId: "456" } } })
  })

  it("activityrecord create(유일한 실제 호출부 — 연락 기록 되밀기)는 그대로 열려 있다", () => {
    // payload 는 실제 호출부의 매퍼로 만든다 — 손으로 적은 최소 payload 는 되밀기 정책의 필수 필드
    // (content·startTime·entityType·dimDepart·ownerId + activityRecordFrom 쌍, 고객 출처는 dbcRelation26)가
    // 바뀔 때마다 "닫혔다"가 아니라 "필수 누락"으로 깨져, 이 테스트가 잠그려는 것(create 가 열려 있음)을
    // 가린다. 필수 필드 계약 자체는 tests/external-crm/activity-record-write-policy.test.ts 가 잠근다.
    const mapped = buildActivityRecordPayload({
      externalAccountId: "3700000000000009",
      externalOwnerId: "3637136716307280",
      targetGroupId: "4374707173786001",
      type: "call",
      result: "answered",
      notes: "콜",
      contactedAt: "2026-09-14T00:00:00.000Z",
    })
    if (!mapped.ok) throw new Error(`mapper refused: ${mapped.reason}`)
    const preview = buildCrmWritePreview({
      objectApiKey: "activityrecord",
      operation: "create",
      payload: mapped.payload as unknown as Record<string, unknown>,
    })
    expect(preview).toMatchObject({ operation: "create", method: "POST", urlPath: "/rest/data/v2.0/xobjects/activityrecord" })
  })

  it.each([
    ["account", { accountName: "테스트학원" }],
    ["contact", { contactName: "홍길동" }],
    ["opportunity", { opportunityName: "전자칠판 3대" }],
    ["Collection__c", { name: "9월 수금" }],
  ])("%s create 는 그대로 열려 있다", (objectApiKey, payload) => {
    expect(buildCrmWritePreview({ objectApiKey, operation: "create", payload }).method).toBe("POST")
  })

  it("activityrecord update 는 원래대로 작업 미허용 문구로 거절한다(닫힘 사유와 섞이지 않는다)", () => {
    expect(() =>
      buildCrmWritePreview({ objectApiKey: "activityrecord", operation: "update", externalId: "1", payload: { content: "x" } })
    ).toThrow("활동 기록 객체는 update 작업을 허용하지 않습니다.")
  })

  it("ShroffAccount__c 는 원래대로 객체 전체 read-only 사유로 거절한다", () => {
    expect(() =>
      buildCrmWritePreview({ objectApiKey: "ShroffAccount__c", operation: "update", externalId: "1", payload: { name: "x" } })
    ).toThrow("EEO 계정 상태 객체는 read-only snapshot으로만 다룹니다.")
  })

  it("메타데이터 사전 점검에서 lead 는 read-only 로 표시되지 않는다(수정 경로가 열려 있으므로 필드 프로브 대상)", async () => {
    remote.getXiaoshouyiConfig.mockReturnValue(null)
    const preflight = await getXiaoshouyiWriteMetadataPreflight()
    const lead = preflight.objects.find((object) => object.objectApiKey === "lead")
    expect(lead).toMatchObject({ readOnly: false, status: "skipped" })
    expect(lead?.allowedFields).toEqual(
      ["companyName", "dimDepart", "email", "entityType", "mobile", "name", "ownerId", "phone", "territoryHighSeaId"]
    )
    const shroff = preflight.objects.find((object) => object.objectApiKey === "ShroffAccount__c")
    expect(shroff).toMatchObject({ readOnly: true, status: "read_only" })
  })
})
