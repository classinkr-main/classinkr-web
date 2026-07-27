// 견적 코드 통화 전환 회귀 — 2026-07 CNY → KRW.
//
// 이 저장소는 "타입/INSERT 에 컬럼을 추가하면서 마이그레이션을 빠뜨려 INSERT 가 무음
// 실패"하는 사고를 겪은 적이 있다. createQuoteCode 가 amount_krw 로 쓰는 것과 그 컬럼을
// 만드는 마이그레이션이 저장소에 있는 것을 한 파일에서 함께 못박는다.
import { readFileSync } from "fs"
import { join } from "path"
import { afterEach, describe, expect, it, vi } from "vitest"

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20260727_software_quote_codes_amount_krw.sql"
)

interface InsertCall {
  table: string
  values: Record<string, unknown>
}

async function loadQuoteCodes(options: {
  /** findQuoteCodeByCode(중복 확인)와 insert 후 select 가 돌려줄 행. */
  existingRow?: Record<string, unknown> | null
  insertedRow?: Record<string, unknown>
}) {
  vi.resetModules()

  const inserts: InsertCall[] = []
  let currentTable = ""

  const builder = {
    from: vi.fn((table: string) => {
      currentTable = table
      return builder
    }),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    insert: vi.fn((values: Record<string, unknown>) => {
      inserts.push({ table: currentTable, values })
      return builder
    }),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: options.existingRow ?? null, error: null })
    ),
    single: vi.fn(() =>
      Promise.resolve({ data: options.insertedRow ?? null, error: null })
    ),
  }

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => builder),
  }))

  const mod = await import("@/lib/billing/quote-codes")
  return { ...mod, inserts }
}

function quoteCodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-1",
    code: "QB-2026-ABCDEFGH",
    kind: "business_recharge",
    organization_name: "테스트 학원",
    buyer_name: null,
    buyer_email: null,
    partner_id: null,
    amount_krw: 2_000_000,
    amount_usd: null,
    notes: null,
    expires_at: null,
    redeemed_at: null,
    redeemed_order_id: null,
    created_by: null,
    created_at: "2026-07-27T00:00:00.000Z",
    updated_at: "2026-07-27T00:00:00.000Z",
    ...overrides,
  }
}

describe("software_quote_codes amount_krw 마이그레이션", () => {
  it("멱등하게 amount_krw 컬럼을 추가한다", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8")

    expect(sql).toContain("alter table public.software_quote_codes")
    expect(sql).toContain("add column if not exists amount_krw numeric")
  })

  it("amount_cny 를 지우지 않고 역사 보존용으로 남긴다", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8")

    expect(sql).not.toContain("drop column")
    expect(sql.toLowerCase()).toContain("amount_cny")
  })
})

describe("createQuoteCode — 충전형 금액은 amount_krw 로 쓴다", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("amountKrw 를 amount_krw 컬럼에 INSERT 한다", async () => {
    const { createQuoteCode, inserts } = await loadQuoteCodes({
      insertedRow: quoteCodeRow(),
    })

    await createQuoteCode({
      kind: "business_recharge",
      amountKrw: 2_000_000,
      amountUsd: null,
      organizationName: "테스트 학원",
    })

    expect(inserts).toHaveLength(1)
    expect(inserts[0].table).toBe("software_quote_codes")
    expect(inserts[0].values).toMatchObject({
      kind: "business_recharge",
      amount_krw: 2_000_000,
      amount_usd: null,
    })
    // 역사 보존용 컬럼에는 더 이상 쓰지 않는다.
    expect(inserts[0].values).not.toHaveProperty("amount_cny")
  })

  it("구독형은 amount_krw 를 비운다", async () => {
    const { createQuoteCode, inserts } = await loadQuoteCodes({
      insertedRow: quoteCodeRow({ kind: "subscription", amount_krw: null, amount_usd: 1200 }),
    })

    await createQuoteCode({
      kind: "subscription",
      amountKrw: null,
      amountUsd: 1200,
    })

    expect(inserts[0].values).toMatchObject({ amount_krw: null, amount_usd: 1200 })
  })
})

describe("validateQuoteCode — 충전형 코드는 amountKrw 를 돌려준다", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("kind 가 맞으면 원화 금액을 실어 통과시킨다", async () => {
    const { validateQuoteCode } = await loadQuoteCodes({
      existingRow: quoteCodeRow({ amount_krw: "4000000" }),
    })

    const result = await validateQuoteCode("qb-2026-abcdefgh", "business_recharge")

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // numeric 컬럼은 문자열로 올 수 있다 — 숫자로 정규화되어야 결제 금액 계산이 맞는다.
    expect(result.code.amountKrw).toBe(4_000_000)
    expect(result.code).not.toHaveProperty("amountCny")
  })

  it("다른 유형(구독형) 코드는 충전형에 쓸 수 없다", async () => {
    const { validateQuoteCode } = await loadQuoteCodes({
      existingRow: quoteCodeRow({ kind: "subscription", amount_krw: null, amount_usd: 1200 }),
    })

    const result = await validateQuoteCode("QS-2026-ABCDEFGH", "business_recharge")

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("wrong_kind")
  })
})
