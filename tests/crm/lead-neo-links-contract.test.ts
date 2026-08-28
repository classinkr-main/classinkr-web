// NEO 등록 마커 데이터 계약 고정 (2026-08-28 확정 — 리드 원격 등록/NEO 푸시):
// 등록된 리드의 마커는 crm_source_links confirmed 1행이며, 밀어넣기 도구는
// target_type='external_lead', 360 드로어 수동 링크는 'external_account'를 만든다.
// 배지·미등록 필터는 **두 target_type을 함께** '등록됨'으로 세야 한다 — 어느 한쪽만 세면
// 도구로 등록한 리드가 보드에서 '미등록'으로 오판돼 중복 등록을 유발한다.
import { afterEach, describe, expect, it, vi } from "vitest"

type Row = { source_record_key: string | null; target_id: string | null; target_type: string | null }
type QueryResult = { data: Row[] | null; error: { message: string } | null }

const filterCalls: Array<[string, string, unknown]> = []
const adminClientMock = vi.fn()

// 실제 supabase-js PostgrestFilterBuilder처럼 select/eq/in/order/range는 같은 빌더를
// 반환하는 체이너블 + thenable 객체다(tests/repositories/crm-source-links-find-neo-link 관례).
// 페이지 루프는 페이지마다 .from()을 새로 부르므로, 페이지 커서는 빌더 밖에서 공유한다.
function tableClient(results: QueryResult[], cursor: { page: number }) {
  const builder = {
    select() {
      return builder
    },
    eq(column: string, value: unknown) {
      filterCalls.push(["eq", column, value])
      return builder
    },
    in(column: string, values: unknown) {
      filterCalls.push(["in", column, values])
      return builder
    },
    order() {
      return builder
    },
    range() {
      cursor.page += 1
      return builder
    },
    then(resolve: (value: QueryResult) => void) {
      resolve(results[Math.min(cursor.page, results.length - 1)] ?? { data: [], error: null })
    },
  }
  return builder
}

async function loadRepository(results: QueryResult[]) {
  vi.resetModules()
  filterCalls.length = 0
  adminClientMock.mockReset()
  const cursor = { page: -1 }
  adminClientMock.mockImplementation(() => ({
    from: vi.fn(() => tableClient(results, cursor)),
  }))

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: adminClientMock,
  }))

  return import("@/lib/repositories/crm-source-links")
}

describe("listConfirmedLeadNeoLinks — NEO 등록 마커 계약", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("external_account와 external_lead 두 target_type을 함께 조회한다", async () => {
    const { listConfirmedLeadNeoLinks } = await loadRepository([{ data: [], error: null }])
    await listConfirmedLeadNeoLinks()

    const inCall = filterCalls.find(([kind, column]) => kind === "in" && column === "target_type")
    expect(inCall).toBeDefined()
    expect([...(inCall![2] as string[])].sort()).toEqual(["external_account", "external_lead"])
    // 확정 링크만 — status='confirmed' 필터가 빠지면 후보(candidate)까지 등록으로 오판된다.
    expect(filterCalls).toContainEqual(["eq", "status", "confirmed"])
    expect(filterCalls).toContainEqual(["eq", "source_object", "leads"])
  })

  it("두 target_type의 링크가 모두 등록 리드 집합에 들어간다", async () => {
    const { listConfirmedLeadNeoLinkLeadIds } = await loadRepository([
      {
        data: [
          { source_record_key: "lead-tool", target_id: "4475126973334300", target_type: "external_lead" },
          { source_record_key: "lead-manual", target_id: "neo-acc-1", target_type: "external_account" },
        ],
        error: null,
      },
    ])

    const ids = await listConfirmedLeadNeoLinkLeadIds()
    expect(ids.has("lead-tool")).toBe(true)
    expect(ids.has("lead-manual")).toBe(true)
    expect(ids.size).toBe(2)
  })

  it("상세 조회는 target_id·target_type을 보존한다 — 드로어의 'NEO 등록됨/계정 연결' 구분 표기용", async () => {
    const { listConfirmedLeadNeoLinks } = await loadRepository([
      {
        data: [
          { source_record_key: "lead-tool", target_id: "4475126973334300", target_type: "external_lead" },
          { source_record_key: "lead-manual", target_id: "neo-acc-1", target_type: "external_account" },
        ],
        error: null,
      },
    ])

    const links = await listConfirmedLeadNeoLinks()
    expect(links).toEqual([
      { leadId: "lead-tool", targetId: "4475126973334300", targetType: "external_lead" },
      { leadId: "lead-manual", targetId: "neo-acc-1", targetType: "external_account" },
    ])
  })

  it("1000행 페이지를 이어 읽어 절단 없이 합친다", async () => {
    const fullPage: Row[] = Array.from({ length: 1000 }, (_, index) => ({
      source_record_key: `lead-${index}`,
      target_id: `neo-${index}`,
      target_type: index % 2 === 0 ? "external_lead" : "external_account",
    }))
    const { listConfirmedLeadNeoLinkLeadIds } = await loadRepository([
      { data: fullPage, error: null },
      { data: [{ source_record_key: "lead-last", target_id: "neo-last", target_type: "external_lead" }], error: null },
    ])

    const ids = await listConfirmedLeadNeoLinkLeadIds()
    expect(ids.size).toBe(1001)
    expect(ids.has("lead-last")).toBe(true)
  })

  it("조회 에러는 원인 메시지로 드러난다 — 미등록 오판 대신 실패로", async () => {
    const { listConfirmedLeadNeoLinks } = await loadRepository([
      { data: null, error: { message: "boom" } },
    ])
    await expect(listConfirmedLeadNeoLinks()).rejects.toThrow(/boom/)
  })
})
