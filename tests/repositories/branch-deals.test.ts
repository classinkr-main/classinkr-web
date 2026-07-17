// listBranchRevDeals raw opt-in 회귀 가드.
// branch-deals.ts는 대용량 raw 컬럼(원본 84칸 row + weeklyPayments)을 기본 SELECT에서 뺀다
// (withRaw opt-in). 이 테스트는 (1) 기본 호출이 raw 컬럼을 요청하지 않고 (2) withRaw:true가
// raw 컬럼을 명시적으로 요청함을 Supabase select() 호출 인자로 검증한다 — 실제 DB 없이도
// "opt-in을 깜빡해 raw가 조용히 비는" 회귀를 여기서 잡는다.
import { afterEach, describe, expect, it, vi } from "vitest"

const selectCalls: string[] = []

// 실제 supabase-js PostgrestFilterBuilder처럼 .select/.order/.eq/.range는 모두 같은
// 빌더(this)를 반환하는 체이너블 + thenable 객체다 — branch-deals.ts는
// .range(...)를 먼저 호출한 뒤 team!=="ALL"일 때만 .eq(...)를 잇는다(순서가 뒤바뀌면
// range()가 먼저 프라미스로 굳어버려 .eq 체이닝이 깨진다).
function tableClient() {
  const builder: {
    select: (columns: string) => typeof builder
    order: () => typeof builder
    eq: () => typeof builder
    range: () => typeof builder
    then: (resolve: (value: { data: unknown[]; error: null }) => void) => void
  } = {
    select(columns: string) {
      selectCalls.push(columns)
      return builder
    },
    order() {
      return builder
    },
    eq() {
      return builder
    },
    range() {
      return builder
    },
    then(resolve) {
      resolve({
        data: [
          {
            id: "d1",
            sheet_row: 1,
            customer_name: "고객A",
            branch_contact: null,
            team: "BD",
            manager: "Han",
            deal_type: "Direct",
            status: "New",
            first_payment: null,
            product_version: null,
            region: "서울",
            importance: "A",
            note: null,
            contract_target: 100,
            monthly_payments: {},
            monthly_red: {},
            monthly_confirmed: {},
            monthly_high_conf: {},
            synced_at: "2026-07-01T00:00:00.000Z",
            // raw는 select 컬럼에 없으면 실제 PostgREST 응답에도 없다 — 여기서는
            // select 인자 자체를 검증하는 게 핵심이라 항상 undefined로 둔다.
          },
        ],
        error: null,
      })
    },
  }
  return builder
}

function supabaseClient() {
  return {
    from: vi.fn(() => tableClient()),
  }
}

async function loadRepository() {
  vi.resetModules()
  selectCalls.length = 0
  const client = supabaseClient()

  vi.doMock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (fn: unknown) => fn,
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => client),
  }))

  const repository = await import("@/lib/repositories/branch-deals")
  return repository
}

describe("listBranchRevDeals raw opt-in", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("excludes the raw column by default", async () => {
    const { listBranchRevDeals } = await loadRepository()

    const deals = await listBranchRevDeals({ team: "BD" })

    expect(selectCalls).toHaveLength(1)
    expect(selectCalls[0]).not.toMatch(/(^|,\s*)raw(\s*,|$)/)
    // normalizeDealRow는 raw가 선택되지 않아도 항상 {}로 채운다(하위호환 유지) —
    // 다만 원본 raw.weeklyPayments/row는 존재하지 않으므로 주차 프로젝션이 필요한
    // 호출부는 반드시 withRaw:true를 명시해야 한다(별도 테스트로 회귀 가드).
    expect(deals[0].raw).toEqual({})
  })

  it("includes the raw column when withRaw is true", async () => {
    const { listBranchRevDeals } = await loadRepository()

    await listBranchRevDeals({ team: "BD" }, { withRaw: true })

    expect(selectCalls).toHaveLength(1)
    expect(selectCalls[0]).toMatch(/(^|,\s*)raw(\s*,|$)/)
  })
})
