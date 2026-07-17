// confirmLeadNeoLink 멱등/충돌 가드.
// (1) 같은 페어가 이미 confirmed면 upsert 없이 { created: false }
// (2) 같은 페어의 candidate가 있으면 확정 upsert(기존 metadata 보존 + manual 표식), created:false
// (3) 행이 없으면 확정 생성(created:true, confirmed_by=actorUserId)
// (4) 다른 타깃으로 이미 확정된 리드(부분 유니크 인덱스 충돌 예정)는 upsert 전에 명시적 에러.
import { afterEach, describe, expect, it, vi } from "vitest"

import { normalizeCrmName } from "@/lib/crm-source-linking"

type Row = {
  id: string
  status: string
  target_type: string
  target_id: string
  normalized_name: string | null
  metadata: Record<string, unknown> | null
}

const upsertCalls: Array<{ payload: Record<string, unknown>; options: Record<string, unknown> }> = []

// 실제 supabase-js PostgrestFilterBuilder처럼 select/eq는 같은 빌더를 반환하는
// 체이너블 + thenable 객체다. confirmLeadNeoLink는 select().eq()×3을 바로 await 하고,
// upsert(payload, opts)도 바로 await 한다.
function tableClient(rows: Row[]) {
  const builder = {
    select() {
      return builder
    },
    eq() {
      return builder
    },
    upsert(payload: Record<string, unknown>, options: Record<string, unknown>) {
      upsertCalls.push({ payload, options })
      return {
        then(resolve: (value: { error: null }) => void) {
          resolve({ error: null })
        },
      }
    },
    then(resolve: (value: { data: Row[]; error: null }) => void) {
      resolve({ data: rows, error: null })
    },
  }
  return builder
}

async function loadRepository(rows: Row[]) {
  vi.resetModules()
  upsertCalls.length = 0

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({
      from: vi.fn(() => tableClient(rows)),
    })),
  }))

  return import("@/lib/repositories/crm-source-links")
}

describe("confirmLeadNeoLink", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("returns created:false without writing when the pair is already confirmed", async () => {
    const { confirmLeadNeoLink } = await loadRepository([
      {
        id: "l1",
        status: "confirmed",
        target_type: "external_account",
        target_id: "neo-1",
        normalized_name: "테스트학원",
        metadata: { manual: true },
      },
    ])

    const result = await confirmLeadNeoLink({ leadId: "lead-1", neoAccountId: "neo-1" })

    expect(result).toEqual({ created: false })
    expect(upsertCalls).toHaveLength(0)
  })

  it("promotes an existing candidate pair to confirmed, preserving its metadata", async () => {
    const { confirmLeadNeoLink } = await loadRepository([
      {
        id: "l1",
        status: "candidate",
        target_type: "external_account",
        target_id: "neo-1",
        normalized_name: "테스트학원",
        metadata: { match_score: 0.9 },
      },
    ])

    const result = await confirmLeadNeoLink({ leadId: "lead-1", neoAccountId: "neo-1" })

    expect(result).toEqual({ created: false })
    expect(upsertCalls).toHaveLength(1)
    const payload = upsertCalls[0].payload
    expect(payload.status).toBe("confirmed")
    expect(payload.target_type).toBe("external_account")
    expect(payload.metadata).toMatchObject({ match_score: 0.9, manual: true })
    // 이름을 안 넘기면 기존 후보의 normalized_name을 유지한다.
    expect(payload.normalized_name).toBe("테스트학원")
    expect(upsertCalls[0].options.onConflict).toBe(
      "source_system,source_object,source_record_key,target_type,target_id"
    )
  })

  it("creates a confirmed link when no row exists for the pair", async () => {
    const { confirmLeadNeoLink } = await loadRepository([])

    const result = await confirmLeadNeoLink({
      leadId: "lead-1",
      neoAccountId: "neo-1",
      normalizedName: "테스트 학원",
      actorUserId: "admin-uuid",
    })

    expect(result).toEqual({ created: true })
    expect(upsertCalls).toHaveLength(1)
    const payload = upsertCalls[0].payload
    expect(payload).toMatchObject({
      source_system: "lead",
      source_object: "leads",
      source_record_key: "lead-1",
      target_type: "external_account",
      target_id: "neo-1",
      confidence: 1,
      status: "confirmed",
      confirmed_by: "admin-uuid",
      normalized_name: normalizeCrmName("테스트 학원"),
    })
    expect(payload.metadata).toMatchObject({ manual: true })
    expect(typeof payload.confirmed_at).toBe("string")
  })

  it("rejects when the lead is already confirmed to a different target (one-confirmed-per-source index)", async () => {
    const { confirmLeadNeoLink } = await loadRepository([
      {
        id: "l1",
        status: "confirmed",
        target_type: "customer",
        target_id: "cust-1",
        normalized_name: null,
        metadata: null,
      },
    ])

    await expect(
      confirmLeadNeoLink({ leadId: "lead-1", neoAccountId: "neo-1" })
    ).rejects.toThrow(/이미 다른 타깃/)
    expect(upsertCalls).toHaveLength(0)
  })
})
