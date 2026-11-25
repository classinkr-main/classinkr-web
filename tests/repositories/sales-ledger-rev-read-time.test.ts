// 임포트(branch_rev_lines + period entries) 경로와 미러(branch_rev_deals) 경로가 같은 확도를 낸다(F-08·F-09).
// v3 캡처는 시간에 따라 바뀌는 판정을 굳히지 않는다 — 무색상 행은 format_unavailable, 빨간 예정 칸은 예정으로 남기고
// 줄 raw 의 pendingCells 를 읽을 때 캐논이 올린다. checksum 은 파싱 날짜·캡처 달과 무관하다.
import { afterEach, describe, expect, it, vi } from "vitest"

import type { FormattedCell } from "@/lib/branch/google-sheets"
import { parseRev } from "@/lib/branch/parsers/rev"
import { dealHasColorData, splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

type Row = Record<string, unknown>

const RED = { red: 1, green: 0, blue: 0 }
const BLUE = { red: 0, green: 0, blue: 1 }
const plain = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
const red = (value: number): FormattedCell => ({ value, bg: null, fg: RED })
const blue = (value: number): FormattedCell => ({ value, bg: null, fg: BLUE })

// 메타 13열 + 11월(13)·w1~w5 + 12월(19)·w1~w5 + 1월(25)·w1~w5
const HEADER = [
  ...["Account", "Branch", "Manager", "Location", "Scale", "Importance", "Team", "Status", "Type", "Product", "First Payment", "Remark", "Sum"].map(plain),
  ...["11", "12", "1"].flatMap((month) => [plain(month), plain("w1"), plain("w2"), plain("w3"), plain("w4"), plain("w5")]),
]
function line(customer: string, blocks: FormattedCell[][]): FormattedCell[] {
  const meta = [customer, null, "예시A", null, null, null, "BD", "New", null, null, null, null, null].map(plain)
  return [...meta, ...blocks.flatMap((block) => [...block, ...Array.from({ length: 6 - block.length }, () => plain(null))])]
}
const GRID: FormattedCell[][] = [
  [plain("REV")],
  HEADER,
  // 빨간 11월 w2 300(확정) · 12월 w1 100 · w3 400 · 1월 월 칸만 빨간 900 · 12월 파랑 50
  line("예시학원1", [[plain(null), plain(null), red(300)], [plain(null), red(100), blue(50), red(400)], [red(900)]]),
  // 색 없음 11월 50 · 12월 60 · 1월 70
  line("예시학원2", [[plain(50)], [plain(60)], [plain(70)]]),
  // 월 칸 0 · 12월 w1 빨강 500 (월≠주 합)
  line("예시학원3", [[], [plain(0), red(500)], []]),
]

function mirrorDeals(today: string): BranchRevDeal[] {
  return parseRev(GRID, { refFy: 2026, today }).map((parsed) => ({
    id: `mirror-${parsed.sheet_row}`,
    sheet_row: parsed.sheet_row,
    customer_name: parsed.customer_name,
    branch_contact: parsed.branch_contact,
    team: parsed.team,
    manager: parsed.manager,
    deal_type: parsed.deal_type,
    status: parsed.status,
    first_payment: parsed.first_payment,
    product_version: parsed.product_version,
    region: parsed.region,
    importance: parsed.importance,
    note: parsed.note,
    contract_target: parsed.contract_target,
    monthly_payments: parsed.monthly_payments,
    monthly_red: parsed.monthly_red,
    monthly_confirmed: parsed.monthly_confirmed,
    monthly_high_conf: parsed.monthly_high_conf,
    raw: JSON.parse(JSON.stringify(parsed.raw)) as Record<string, unknown>,
    synced_at: `${today}T12:00:00Z`,
  }))
}

// 인메모리 PostgREST 경계(sales-ledger-rev-roundtrip.test.ts 와 같은 꼴) — 캡처한 줄·엔트리를 실제 리더로 되읽는다.
function importClient() {
  const tables: Record<string, Row[]> = {}
  const from = (table: string) => {
    let inserted: Row[] | null = null
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: (values: Row | Row[]) => {
        const rows = JSON.parse(JSON.stringify(Array.isArray(values) ? values : [values])) as Row[]
        const base = (tables[table] ?? []).length
        rows.forEach((row, index) => {
          row.id = `${table}-${base + index}`
          row.created_at = "2026-11-30T12:00:00Z"
          row.source_week ??= null
        })
        tables[table] = [...(tables[table] ?? []), ...rows]
        inserted = rows
        return builder
      },
      update: () => builder,
      single: async () => ({ data: { id: "run-new", started_at: "2026-11-30T12:00:00Z" }, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      range: async (start: number, end: number) => ({ data: (tables[table] ?? []).slice(start, end + 1), error: null }),
      then: (resolve: (value: { data: Row[] | null; error: null }) => unknown) => resolve({ data: inserted, error: null }),
    }
    return builder
  }
  return { from, tables }
}

async function captureAndRead(deals: BranchRevDeal[]) {
  vi.resetModules()
  const client = importClient()
  vi.doMock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }))
  vi.doMock("@/lib/repositories/branch-deals", () => ({ listBranchRevDealsFresh: async () => deals }))
  const { captureRevDbImport } = await import("@/lib/repositories/sales-ledger-rev-import")
  const { readRevDealsFromActiveImport } = await import("@/lib/repositories/sales-ledger-imports")
  await captureRevDbImport("test", { activate: false, fiscalYear: 2026 })
  const imported = (await readRevDealsFromActiveImport(2026, undefined, "run-new"))!
  return { imported, client }
}

async function loadPure() {
  vi.resetModules()
  vi.doMock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }))
  vi.doMock("@/lib/repositories/branch-deals", () => ({ listBranchRevDealsFresh: async () => [] }))
  return import("@/lib/repositories/sales-ledger-rev-import")
}

const READ_DATES = ["2026-11-30", "2026-12-01", "2026-12-08", "2026-12-15", "2026-12-20", "2027-01-01", "2027-01-05", "2027-02-02"]
const MONTHS = ["2026-11", "2026-12", "2027-01"]

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
  vi.restoreAllMocks()
})

describe("임포트 ↔ 미러 패리티 — 같은 스냅샷, 같은 읽는 날, 같은 확도", () => {
  it("11/30 스냅샷을 여러 날에 읽어도 두 경로가 한 칸도 다르지 않다", async () => {
    const mirror = mirrorDeals("2026-11-30")
    const { imported } = await captureAndRead(mirror)
    expect(imported).toHaveLength(mirror.length)
    for (const source of mirror) {
      const target = imported.find((deal) => deal.sheet_row === source.sheet_row)!
      for (const at of READ_DATES) {
        for (const month of MONTHS) {
          const total = source.monthly_payments[month] ?? 0
          expect(splitMonthConfidence(target, month, total, dealHasColorData(target), at), `${source.customer_name} ${month} @${at}`)
            .toEqual(splitMonthConfidence(source, month, total, dealHasColorData(source), at))
        }
      }
    }
  })

  it("12월 캡처를 1월에 읽으면 무색상 12월이 확정이다(캡처 달이 굳지 않는다)", async () => {
    const mirror = mirrorDeals("2026-12-20")
    const { imported, client } = await captureAndRead(mirror)
    const plainRow = imported.find((deal) => deal.customer_name === "예시학원2")!
    // 확도 없이 저장 → 색 맵을 만들지 않는다 → 캐논이 읽는 날의 영업월로 판정한다.
    expect(plainRow.monthly_red).toEqual({})
    expect(dealHasColorData(plainRow)).toBe(false)
    const entries = client.tables.branch_rev_period_entries.filter((entry) => entry.rev_line_id === "branch_rev_lines-1")
    expect(entries.map((entry) => entry.confidence)).toEqual(["format_unavailable", "format_unavailable", "format_unavailable"])
    expect(splitMonthConfidence(plainRow, "2026-12", 60, false, "2026-12-20").confirmed).toBe(0)
    expect(splitMonthConfidence(plainRow, "2026-12", 60, false, "2027-01-05").confirmed).toBe(60)
  })

  it("빨간 예정 칸은 캡처에서 확정으로 올리지 않고(예정 엔트리), 읽을 때 올린다", async () => {
    const mirror = mirrorDeals("2026-11-30")
    const { imported, client } = await captureAndRead(mirror)
    const decEntries = client.tables.branch_rev_period_entries
      .filter((entry) => entry.rev_line_id === "branch_rev_lines-0" && entry.period_month === "2026-12")
      .map((entry) => [entry.confidence, entry.amount])
    expect(decEntries).toEqual([["confirmed", 0], ["high_confidence", 50], ["expected", 500]])
    const redRow = imported.find((deal) => deal.customer_name === "예시학원1")!
    expect(splitMonthConfidence(redRow, "2026-12", 550, true, "2026-12-08")).toEqual({ confirmed: 100, highConfidence: 50, expected: 400 })
    expect(splitMonthConfidence(redRow, "2027-01", 900, true, "2027-01-01")).toEqual({ confirmed: 900, highConfidence: 0, expected: 0 })
  })
})

describe("revImportChecksum — 파싱 날짜·캡처 달과 무관", () => {
  it("같은 시트를 11/30 과 12/8 에 파싱해도 같은 checksum(얼린 시트 다시 읽기는 dedupe)", async () => {
    const { revImportChecksum } = await loadPure()
    const strip = (deals: BranchRevDeal[]) => deals.map((deal) => ({ ...deal, id: "x", synced_at: "" }))
    expect(revImportChecksum(strip(mirrorDeals("2026-11-30")))).toBe(revImportChecksum(strip(mirrorDeals("2026-12-08"))))
    expect(revImportChecksum(strip(mirrorDeals("2026-11-30")))).toBe(revImportChecksum(strip(mirrorDeals("2027-01-20"))))
  })

  it("캡처하는 달(시계)이 바뀌어도 같은 checksum", async () => {
    const { revImportChecksum } = await loadPure()
    const deals = mirrorDeals("2026-11-30")
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-30T12:00:00Z"))
    const november = revImportChecksum(deals)
    vi.setSystemTime(new Date("2027-01-10T12:00:00Z"))
    expect(revImportChecksum(deals)).toBe(november)
  })

  it("금액·색이 바뀌면 checksum 이 바뀐다", async () => {
    const { revImportChecksum } = await loadPure()
    const base = mirrorDeals("2026-11-30")
    const changedAmount = base.map((deal, index) => index === 1 ? { ...deal, monthly_payments: { ...deal.monthly_payments, "2026-12": 61 } } : deal)
    const changedColour = base.map((deal, index) => index === 1 ? { ...deal, monthly_red: { "2026-11": true } } : deal)
    expect(revImportChecksum(changedAmount)).not.toBe(revImportChecksum(base))
    expect(revImportChecksum(changedColour)).not.toBe(revImportChecksum(base))
  })
})

describe("revImportEntriesForDeal — 순수 엔트리 계획", () => {
  it("무색상 행은 달마다 format_unavailable 한 건(명시 0 달 포함)", async () => {
    const { revImportEntriesForDeal } = await loadPure()
    const [, plainRow] = mirrorDeals("2026-11-30")
    expect(revImportEntriesForDeal({ ...plainRow, monthly_payments: { ...plainRow.monthly_payments, "2027-02": 0 } })).toEqual([
      { period_month: "2026-11", amount: 50, confidence: "format_unavailable" },
      { period_month: "2026-12", amount: 60, confidence: "format_unavailable" },
      { period_month: "2027-01", amount: 70, confidence: "format_unavailable" },
      { period_month: "2027-02", amount: 0, confidence: "format_unavailable" },
    ])
  })

  it("월≠주 합 표시는 캡처에도 넘겨 확정이 월 합계를 넘지 않는다", async () => {
    const { revImportEntriesForDeal } = await loadPure()
    const mismatch = mirrorDeals("2026-12-05").find((deal) => deal.customer_name === "예시학원3")!
    expect(mismatch.monthly_confirmed?.["2026-12"]).toBe(500)
    expect(revImportEntriesForDeal(mismatch)).toEqual([{ period_month: "2026-12", amount: 0, confidence: "expected" }])
  })
})
