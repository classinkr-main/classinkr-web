// R4 — 매칭 '제외' 되돌리기 + 수동 연결 범위(리드·Neo CRM).
// (1) 제외(rejected) 행에 stale 액션은 상태 가드 없이 재검수로 되돌린다.
// (2) 수동 후보는 REV 시트뿐 아니라 리드·Neo CRM 원천도 받고, 원천별 metadata 모양을 후보 생성기와 맞춘다.
// (3) 소스 시스템을 안 넘겨도 키 모양(uuid → 리드, 숫자 → Neo CRM, rev: → REV)으로 알아낸다.
import { afterEach, describe, expect, it, vi } from "vitest"

// 저장소가 링크 변경 뒤 account-master Data Cache 태그를 무효화한다(next/cache 는 요청 컨텍스트 밖에서 throw).
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

type Row = Record<string, unknown>

interface Recorded {
  table: string
  op: "update" | "upsert" | "insert"
  payload: Row
  filters: Array<[string, unknown]>
}

const recorded: Recorded[] = []

// supabase-js 빌더 흉내 — select/eq/… 는 같은 빌더를 돌려주고, await 하면 표의 행을 준다.
function tableClient(table: string, rows: Row[]) {
  const filters: Array<[string, unknown]> = []
  let pending: Recorded | null = null
  const builder = {
    select: () => builder,
    limit: () => builder,
    order: () => builder,
    neq: () => builder,
    in: () => builder,
    is: () => builder,
    eq(column: string, value: unknown) {
      filters.push([column, value])
      return builder
    },
    update(payload: Row) {
      pending = { table, op: "update", payload, filters }
      recorded.push(pending)
      return builder
    },
    upsert(payload: Row) {
      pending = { table, op: "upsert", payload, filters }
      recorded.push(pending)
      return builder
    },
    insert(payload: Row) {
      pending = { table, op: "insert", payload, filters }
      recorded.push(pending)
      return builder
    },
    maybeSingle: () => ({
      then(resolve: (value: { data: Row | null; error: null }) => void) {
        resolve({ data: rows[0] ?? null, error: null })
      },
    }),
    single: () => ({
      then(resolve: (value: { data: Row; error: null }) => void) {
        resolve({ data: pending ? { id: "link-1", ...pending.payload } : rows[0], error: null })
      },
    }),
    then(resolve: (value: { data: Row[]; error: null }) => void) {
      resolve({ data: rows, error: null })
    },
  }
  return builder
}

async function loadRepository(tables: Record<string, Row[]>) {
  vi.resetModules()
  recorded.length = 0
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => tableClient(table, tables[table] ?? [])),
    })),
  }))
  return import("@/lib/repositories/crm-source-links")
}

afterEach(() => {
  vi.doUnmock("@/lib/supabase/admin")
  vi.resetModules()
})

const LEAD_ID = "6f1c2b3a-4d5e-4f60-8a71-9b8c7d6e5f40"
const CUSTOMER = { id: "cust-1", partner_account_id: null, name: "리첸수학학원", campus_name: null, contact_name: "김원장" }

describe("updateCrmSourceLinkStatus — 제외 되돌리기", () => {
  it("rejected 행에 stale 액션을 주면 가드 없이 재검수로 되돌린다", async () => {
    const { updateCrmSourceLinkStatus } = await loadRepository({
      crm_source_links: [
        {
          id: "link-1",
          source_system: "lead",
          source_object: "leads",
          source_record_key: LEAD_ID,
          normalized_name: "리첸수학학원",
          target_type: "customer",
          target_id: CUSTOMER.id,
          status: "rejected",
          metadata: {},
        },
      ],
    })

    const result = await updateCrmSourceLinkStatus("link-1", "stale", "admin-1")
    expect(result).toMatchObject({ status: "stale" })

    const update = recorded.find((entry) => entry.op === "update")
    expect(update?.payload).toEqual({ status: "stale", confirmed_by: null, confirmed_at: null })
    expect(update?.filters).toContainEqual(["id", "link-1"])
  })
})

describe("createManualCrmLinkCandidate — 리드·Neo CRM 원천", () => {
  it("리드 원천을 리드 uuid 키만으로 알아내 lead/leads 후보를 만든다", async () => {
    const { createManualCrmLinkCandidate } = await loadRepository({
      // 같은 키의 링크 행이 없어도(키 모양으로) 리드로 판정한다.
      crm_source_links: [],
      leads: [
        {
          id: LEAD_ID,
          name: "김원장",
          org: "리첸수학학원",
          phone: "010-1234-5678",
          email: null,
          status: "contacted",
          assigned_to: "문준혁",
          created_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      customers: [CUSTOMER],
      crm_match_aliases: [],
    })

    const result = await createManualCrmLinkCandidate({
      sourceRecordKey: LEAD_ID,
      targetType: "customer",
      targetId: CUSTOMER.id,
    })
    expect(result).toMatchObject({ status: "candidate" })

    const upsert = recorded.find((entry) => entry.op === "upsert")
    expect(upsert?.table).toBe("crm_source_links")
    expect(upsert?.payload).toMatchObject({
      source_system: "lead",
      source_object: "leads",
      source_record_key: LEAD_ID,
      target_type: "customer",
      target_id: CUSTOMER.id,
      status: "candidate",
    })
    expect(upsert?.payload.metadata).toMatchObject({
      manual: true,
      source_label: "리첸수학학원",
      lead_org: "리첸수학학원",
      source_owner: "문준혁",
      source_priority: "lead_intake_high",
      target_label: "리첸수학학원",
    })
    // 이름이 같으니 점수가 후보 문턱을 넘는다.
    expect(Number(upsert?.payload.confidence)).toBeGreaterThan(0.8)
  })

  it("Neo CRM 원천은 external_id + object_api_key 로 xiaoshouyi 후보를 만든다", async () => {
    const { createManualCrmLinkCandidate } = await loadRepository({
      crm_source_links: [],
      external_crm_records: [
        {
          object_api_key: "account",
          external_id: "4006219659975492",
          normalized_name: "리첸수학학원",
          display_name: "리첸수학학원",
          owner_name: "문준혁",
          status: null,
          amount: null,
          occurred_at: null,
          synced_at: "2026-08-28T05:20:00.000Z",
          is_stale: false,
        },
      ],
      customers: [CUSTOMER],
      crm_match_aliases: [],
    })

    await createManualCrmLinkCandidate({
      sourceSystem: "xiaoshouyi",
      sourceObject: "account",
      sourceRecordKey: "4006219659975492",
      targetType: "customer",
      targetId: CUSTOMER.id,
    })

    const upsert = recorded.find((entry) => entry.op === "upsert")
    expect(upsert?.payload).toMatchObject({
      source_system: "xiaoshouyi",
      source_object: "account",
      source_record_key: "4006219659975492",
      status: "candidate",
    })
    expect(upsert?.payload.metadata).toMatchObject({
      manual: true,
      external_id: "4006219659975492",
      object_api_key: "account",
      owner_name: "문준혁",
      source_priority: "xiaoshouyi_crm_primary",
    })
  })

  it("같은 키의 링크 행이 있으면 그 source_system 을 믿는다", async () => {
    const { createManualCrmLinkCandidate } = await loadRepository({
      crm_source_links: [{ source_system: "xiaoshouyi", source_object: "contact", id: "link-9" }],
      external_crm_records: [
        {
          object_api_key: "contact",
          external_id: "4006219659975499",
          normalized_name: "김원장",
          display_name: "김원장",
          owner_name: null,
          status: null,
          amount: null,
          occurred_at: null,
          synced_at: "2026-08-28T05:20:00.000Z",
          is_stale: false,
        },
      ],
      customers: [CUSTOMER],
      crm_match_aliases: [],
    })

    // crm_source_links 조회가 [{id:"link-9"}] 를 돌려주므로 "이미 확정" 가드에 걸린다 —
    // 이 테스트는 소스 판정이 링크 행을 따라갔는지만 본다.
    await expect(
      createManualCrmLinkCandidate({
        sourceRecordKey: "4006219659975499",
        targetType: "customer",
        targetId: CUSTOMER.id,
      })
    ).rejects.toThrow("already has a confirmed link")
  })

  it("원천을 못 찾으면 not found 로 거절한다 — 라우트가 404 로 옮긴다", async () => {
    const { createManualCrmLinkCandidate } = await loadRepository({ crm_source_links: [], leads: [] })
    await expect(
      createManualCrmLinkCandidate({ sourceRecordKey: LEAD_ID, targetType: "customer", targetId: CUSTOMER.id })
    ).rejects.toThrow(/not found/)
  })

  it("createManualBranchRevLinkCandidate 는 같은 구현으로 위임한다(라우트 호환)", async () => {
    const repo = await loadRepository({ crm_source_links: [], leads: [] })
    await expect(
      repo.createManualBranchRevLinkCandidate({ sourceRecordKey: "rev:1:unknown:no-first-payment:0", targetType: "customer", targetId: "x" })
    ).rejects.toThrow(/not found/)
  })
})
