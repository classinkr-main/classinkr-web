// findConfirmedLeadNeoLink 단건 조회 가드 (360 드로어 'NEO 등록됨' 상태 소스).
// (1) confirmed 행이 있으면 { targetId } — 조회 필터는 벌크 lookup과 동일 모양
// (2) 행이 없으면 null (3) 빈 leadId는 DB 조회 없이 null (4) 조회 에러는 원인 메시지로 드러난다.
import { afterEach, describe, expect, it, vi } from "vitest"

type Row = { target_id: string | null }
type QueryResult = { data: Row[] | null; error: { message: string } | null }

const eqCalls: Array<[string, unknown]> = []
const adminClientMock = vi.fn()

// 실제 supabase-js PostgrestFilterBuilder처럼 select/eq/limit은 같은 빌더를 반환하는
// 체이너블 + thenable 객체다. findConfirmedLeadNeoLink는 select().eq()×4.limit(1)을 바로 await 한다.
function tableClient(result: QueryResult) {
  const builder = {
    select() {
      return builder
    },
    eq(column: string, value: unknown) {
      eqCalls.push([column, value])
      return builder
    },
    limit() {
      return builder
    },
    then(resolve: (value: QueryResult) => void) {
      resolve(result)
    },
  }
  return builder
}

async function loadRepository(result: QueryResult) {
  vi.resetModules()
  eqCalls.length = 0
  adminClientMock.mockReset()
  adminClientMock.mockImplementation(() => ({
    from: vi.fn(() => tableClient(result)),
  }))

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: adminClientMock,
  }))

  return import("@/lib/repositories/crm-source-links")
}

describe("findConfirmedLeadNeoLink", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("returns the confirmed neo target for the lead, using the bulk lookup's filter shape", async () => {
    const { findConfirmedLeadNeoLink } = await loadRepository({
      data: [{ target_id: "neo-1" }],
      error: null,
    })

    const result = await findConfirmedLeadNeoLink("lead-1")

    expect(result).toEqual({ targetId: "neo-1" })
    expect(eqCalls).toEqual([
      ["source_object", "leads"],
      ["source_record_key", "lead-1"],
      ["target_type", "external_account"],
      ["status", "confirmed"],
    ])
  })

  it("returns null when no confirmed link exists", async () => {
    const { findConfirmedLeadNeoLink } = await loadRepository({ data: [], error: null })

    await expect(findConfirmedLeadNeoLink("lead-1")).resolves.toBeNull()
  })

  it("returns null for a blank leadId without querying the database", async () => {
    const { findConfirmedLeadNeoLink } = await loadRepository({ data: [], error: null })

    await expect(findConfirmedLeadNeoLink("   ")).resolves.toBeNull()
    expect(adminClientMock).not.toHaveBeenCalled()
  })

  it("surfaces query errors with the underlying message", async () => {
    const { findConfirmedLeadNeoLink } = await loadRepository({
      data: null,
      error: { message: "connection refused" },
    })

    await expect(findConfirmedLeadNeoLink("lead-1")).rejects.toThrow(
      /lead→neo 단건 조회 실패: connection refused/
    )
  })
})
