// 액티브 DB 임포트 → BranchRevDeal 복원 경로 회귀 가드(2026-10-28 읽기 전용 감사, 결함 2·1).
//
// ① monthly_red 의미: 미러(parseRev)는 실제 확정액이 있는 달만 monthly_red=true다. 캡처
//    (rev-native:v2)는 ADR-0062의 "빨간 칸이 전부 예정이면 확정 0을 명시"를 confidence='confirmed',
//    amount=0 엔트리로 저장하는데(운영 120건), 복원이 그 엔트리를 금액과 무관하게 red=true로 올리면
//    아직 오지 않은 주차의 예정 칸이 isMatrixCellLocked에서 편집 불가·"확정" 칩으로 보였다(114셀).
//    복원은 confirmed 엔트리의 amount !== 0일 때만 red=true여야 한다.
// ② 단건 상세: readRevDealFromActiveImportById는 branch_rev_lines.id → (그 라인의 run이 해당
//    회계연도의 활성 run일 때만) 같은 run·같은 라인의 period entries로 전량 읽기와 동일한 shape을
//    복원한다. 스테일 run의 라인·모르는 id·UUID가 아닌 id는 null.
import { afterEach, describe, expect, it, vi } from "vitest"

import type { FormattedCell } from "@/lib/branch/google-sheets"
import { parseRev } from "@/lib/branch/parsers/rev"
import { isMatrixCellLocked } from "@/components/admin/branch/ledger/rev-matrix-logic"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

type Row = Record<string, unknown>

const ACTIVE_RUN = "run-active"
const STALE_RUN = "run-stale"
const LINE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LINE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const LINE_STALE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const UNKNOWN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

function line(id: string, importRunId: string, sourceRow: number, accountName: string): Row {
  return {
    id,
    import_run_id: importRunId,
    fiscal_year: 2026,
    source_row: sourceRow,
    source_record_key: `${accountName}|${sourceRow}`,
    account_name: accountName,
    branch_contact: null,
    location: "서울",
    scale: null,
    importance: "A",
    team: "BD",
    manager: "Han",
    status: "New",
    deal_type: "Direct",
    product: "ClassIn X",
    first_payment: null,
    remark: null,
    total_amount: 1000,
    raw: { row: [accountName], weeklyPayments: { "2026-09": [300, 0, 200, 0, 0] } },
    created_at: "2026-10-15T00:00:00Z",
  }
}

function entry(
  revLineId: string,
  importRunId: string,
  periodMonth: string,
  amount: number,
  confidence: "confirmed" | "high_confidence" | "expected" | "format_unavailable",
  sourceWeek: string | null = null,
): Row {
  return { rev_line_id: revLineId, import_run_id: importRunId, period_month: periodMonth, amount, confidence, source_week: sourceWeek }
}

function fixtureTables(): Record<string, Row[]> {
  let seq = 0
  const withId = (rows: Row[]) => rows.map((row) => ({ id: `entry-${++seq}`, ...row }))
  return {
    sales_ledger_active_sources: [
      {
        fiscal_year: 2026,
        tab_key: "rev",
        import_run_id: ACTIVE_RUN,
        sales_ledger_import_runs: { status: "succeeded", started_at: "2026-10-15T00:00:00Z" },
      },
    ],
    branch_rev_lines: [
      line(LINE_A, ACTIVE_RUN, 7, "학원A"),
      line(LINE_B, ACTIVE_RUN, 8, "학원B"),
      line(LINE_STALE, STALE_RUN, 7, "학원A(옛 run)"),
    ],
    branch_rev_period_entries: withId([
      // 11월: 빨간 칸이 전부 예정 → 캡처는 확정 0 명시 + 예상 500 (운영 데이터 형태 그대로)
      entry(LINE_A, ACTIVE_RUN, "2026-11", 0, "confirmed"),
      entry(LINE_A, ACTIVE_RUN, "2026-11", 500, "expected"),
      // 9월: 실제 확정 300 + 예상 200
      entry(LINE_A, ACTIVE_RUN, "2026-09", 300, "confirmed"),
      entry(LINE_A, ACTIVE_RUN, "2026-09", 200, "expected"),
      // 8월: 확정 환불(-80) — 0이 아닌 확정액이므로 red
      entry(LINE_A, ACTIVE_RUN, "2026-08", -80, "confirmed"),
      // 10월: 확정 0 명시 + 고확도 100 → red 아님(고확도 칩)
      entry(LINE_A, ACTIVE_RUN, "2026-10", 0, "confirmed"),
      entry(LINE_A, ACTIVE_RUN, "2026-10", 100, "high_confidence"),
      // 7월: 주차 엔트리 — 확정 0(w1) 뒤에 확정 150(w3): 0이 먼저 와도 뒤의 확정액이 red를 켠다
      entry(LINE_A, ACTIVE_RUN, "2026-07", 0, "confirmed", "w1"),
      entry(LINE_A, ACTIVE_RUN, "2026-07", 150, "confirmed", "w3"),
      // 6월: 확정 150(w1) 뒤에 확정 0(w2): 뒤의 0이 red를 끄지 않는다
      entry(LINE_A, ACTIVE_RUN, "2026-06", 150, "confirmed", "w1"),
      entry(LINE_A, ACTIVE_RUN, "2026-06", 0, "confirmed", "w2"),
      // 다른 라인(B)의 같은 달 확정 — 단건 조회가 rev_line_id로 좁히지 않으면 A에 섞인다
      entry(LINE_B, ACTIVE_RUN, "2026-11", 900, "confirmed"),
      // 스테일 run의 라인 엔트리
      entry(LINE_STALE, STALE_RUN, "2026-11", 700, "confirmed"),
    ]),
  }
}

function valueAt(row: Row, column: string): unknown {
  return column.split(".").reduce<unknown>((acc, key) => (acc as Row | undefined)?.[key], row)
}

interface RecordedQuery {
  table: string
  filters: Array<[string, unknown]>
  terminal: "range" | "maybeSingle" | "await"
}

// supabase-js PostgrestFilterBuilder 흉내: select/eq/order 체이너블, range/maybeSingle 종결,
// 빌더 자체도 thenable(액티브 포인터 조회는 종결 메서드 없이 await). eq 필터는 중첩 경로
// (sales_ledger_import_runs.status)까지 실제로 적용해 "어떤 필터로 좁혔는지"를 검증 가능하게 한다.
function supabaseStub(tables: Record<string, Row[]>) {
  const queries: RecordedQuery[] = []
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = []
    const matching = () => (tables[table] ?? []).filter((row) => filters.every(([column, value]) => valueAt(row, column) === value))
    const record = (terminal: RecordedQuery["terminal"]) => queries.push({ table, filters: [...filters], terminal })
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value])
        return builder
      },
      order: () => builder,
      range: async (from: number, to: number) => {
        record("range")
        return { data: matching().slice(from, to + 1), error: null }
      },
      maybeSingle: async () => {
        record("maybeSingle")
        return { data: matching()[0] ?? null, error: null }
      },
      then: (resolve: (value: { data: Row[]; error: null }) => void) => {
        record("await")
        resolve({ data: matching(), error: null })
      },
    }
    return builder
  }
  return { from, queries }
}

async function loadRepository(tables: Record<string, Row[]> = fixtureTables()) {
  vi.resetModules()
  const client = supabaseStub(tables)
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }))
  vi.doMock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
  const repository = await import("@/lib/repositories/sales-ledger-imports")
  return { repository, client }
}

// 워크벤치 매트릭스 행(LedgerRevenueRow)으로 투영 — pipeline.ts(listRevRevenue)가 monthly_* 맵을
// 그대로 camelCase로 옮기는 것과 같은 최소 투영이라, 잠금 판정(isMatrixCellLocked)을 그대로 돌릴 수 있다.
function ledgerRow(deal: BranchRevDeal): LedgerRevenueRow {
  return {
    id: deal.id,
    sourceDealId: deal.id,
    customer: deal.customer_name,
    manager: deal.manager,
    team: deal.team,
    region: deal.region,
    revenue: 0,
    ledgerOrigin: "sheet",
    monthlyPayments: deal.monthly_payments,
    monthlyConfirmed: deal.monthly_confirmed ?? {},
    monthlyHighConfidence: deal.monthly_high_conf ?? {},
    monthlyRed: deal.monthly_red,
  }
}

// 미러 쪽 참조: rev-future-week.test.ts와 같은 그리드 — 월 "10" + w1~w5, 오늘 10/16(w3까지 확정).
const RED = { red: 1, green: 0, blue: 0 }
const plain = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
const redCell = (value: number): FormattedCell => ({ value, bg: null, fg: RED })
const HEADER: FormattedCell[] = [
  ...["Account", "Branch", "City", "Scale", "Porta", "Team", "Manager", "Status", "Type", "Product", "First Payment", "Note", "Target"].map(plain),
  plain("10"), plain("w1"), plain("w2"), plain("w3"), plain("w4"), plain("w5"),
]
function mirrorDeal(weeks: FormattedCell[]) {
  const meta = ["학원A", null, null, null, null, "BD", "Han", "New", null, null, null, null, null].map(plain)
  return parseRev([[plain("REV")], HEADER, [...meta, plain(null), ...weeks]], { refFy: 2026, today: "2026-10-16" })[0]
}

describe("active import read — monthly_red carries the mirror's meaning (only real confirmed amounts)", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("does not flag a month whose only confirmed entry is the explicit zero (all red cells still pending)", async () => {
    const { repository } = await loadRepository()
    const [dealA] = (await repository.readRevDealsFromActiveImport(2026, undefined, ACTIVE_RUN))!

    expect(dealA.id).toBe(LINE_A)
    // 금액·확정 0 명시는 그대로 복원된다 — 캐논(rev-confirmed)의 무색상 폴백을 막는 정보라 지우면 안 된다.
    expect(dealA.monthly_payments["2026-11"]).toBe(500)
    expect(dealA.monthly_confirmed?.["2026-11"]).toBe(0)
    // 결함 2: 이전 복원은 여기서 true를 돌려 예정 칸을 확정 잠금으로 보이게 했다.
    expect(dealA.monthly_red["2026-11"]).toBe(false)
    // 확정 0 + 고확도만 있는 달도 red가 아니다(칩은 "고확도").
    expect(dealA.monthly_red["2026-10"]).toBe(false)
    expect(dealA.monthly_confirmed?.["2026-10"]).toBe(0)
    expect(dealA.monthly_high_conf?.["2026-10"]).toBe(100)
  })

  it("still flags months that carry a real confirmed amount, including refunds and weekly splits", async () => {
    const { repository } = await loadRepository()
    const [dealA] = (await repository.readRevDealsFromActiveImport(2026, undefined, ACTIVE_RUN))!

    expect(dealA.monthly_red["2026-09"]).toBe(true)
    expect(dealA.monthly_confirmed?.["2026-09"]).toBe(300)
    expect(dealA.monthly_payments["2026-09"]).toBe(500)
    // 확정 환불(-80)도 0이 아닌 확정액 — 미러의 빨간 글자 음수와 같은 의미.
    expect(dealA.monthly_red["2026-08"]).toBe(true)
    expect(dealA.monthly_confirmed?.["2026-08"]).toBe(-80)
    // 주차 엔트리: 0이 먼저 오든(7월) 나중에 오든(6월) 확정액이 하나라도 있으면 red.
    expect(dealA.monthly_red["2026-07"]).toBe(true)
    expect(dealA.monthly_red["2026-06"]).toBe(true)
    expect(dealA.monthly_confirmed?.["2026-07"]).toBe(150)
    expect(dealA.monthly_confirmed?.["2026-06"]).toBe(150)
  })

  it("matches parseRev: a future red week leaves monthly_red unset while a past red week sets it", async () => {
    // 미러: w4(10/22, 아직 미래)만 빨간 500 → 확정 0 명시, red 없음. w2(10/8, 과거) 빨간 300 → red.
    const pendingOnly = mirrorDeal([plain(null), plain(null), plain(null), redCell(500), plain(null)])
    const pastConfirmed = mirrorDeal([plain(null), redCell(300), plain(null), plain(null), plain(null)])
    expect(pendingOnly.monthly_confirmed["2026-10"]).toBe(0)
    expect(pendingOnly.monthly_red["2026-10"]).toBeUndefined()
    expect(pastConfirmed.monthly_red["2026-10"]).toBe(true)

    // 임포트: 캡처가 두 행을 저장한 형태 그대로의 엔트리에서 같은 판정이 나와야 한다.
    const tables = fixtureTables()
    tables.branch_rev_period_entries = [
      { id: "p-1", ...entry(LINE_A, ACTIVE_RUN, "2026-10", 0, "confirmed") },
      { id: "p-2", ...entry(LINE_A, ACTIVE_RUN, "2026-10", 500, "expected", "w4") },
      { id: "p-3", ...entry(LINE_B, ACTIVE_RUN, "2026-10", 300, "confirmed", "w2") },
    ]
    const { repository } = await loadRepository(tables)
    const deals = (await repository.readRevDealsFromActiveImport(2026, undefined, ACTIVE_RUN))!
    const importedPending = deals.find((deal) => deal.id === LINE_A)!
    const importedConfirmed = deals.find((deal) => deal.id === LINE_B)!

    expect(Boolean(importedPending.monthly_red["2026-10"])).toBe(Boolean(pendingOnly.monthly_red["2026-10"]))
    expect(importedPending.monthly_confirmed?.["2026-10"]).toBe(pendingOnly.monthly_confirmed["2026-10"])
    expect(Boolean(importedConfirmed.monthly_red["2026-10"])).toBe(Boolean(pastConfirmed.monthly_red["2026-10"]))
  })

  it("keeps a pending-only month editable in the matrix and locks a confirmed month (user-visible symptom)", async () => {
    const { repository } = await loadRepository()
    const [dealA] = (await repository.readRevDealsFromActiveImport(2026, undefined, ACTIVE_RUN))!
    const row = ledgerRow(dealA)

    // 11월(확정 0 명시 + 예상 500): 아직 오지 않은 주차의 예정 칸 — 편집 가능해야 한다.
    expect(isMatrixCellLocked(row, "2026-11")).toBe(false)
    // 9월(확정 300/500): 미러와 같이 red 플래그로 잠금.
    expect(isMatrixCellLocked(row, "2026-09")).toBe(true)
  })
})

describe("readRevDealFromActiveImportById — row detail for import-mode ids", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("restores a line of the active run with the same shape as the full-run read, scoped to that line's entries", async () => {
    const { repository, client } = await loadRepository()

    const detail = await repository.readRevDealFromActiveImportById(LINE_A)
    const full = (await repository.readRevDealsFromActiveImport(2026, undefined, ACTIVE_RUN))!
    const fromFullRead = full.find((deal) => deal.id === LINE_A)

    expect(detail).not.toBeNull()
    expect(detail).toEqual(fromFullRead)
    // 라인 B의 11월 확정 900이 섞이지 않았다(= rev_line_id로 좁혔다).
    expect(detail!.monthly_payments["2026-11"]).toBe(500)
    expect(detail!.monthly_confirmed?.["2026-11"]).toBe(0)
    expect(detail!.monthly_red["2026-11"]).toBe(false)
    expect(detail!.raw.weeklyPayments).toEqual({ "2026-09": [300, 0, 200, 0, 0], "2026-07": [0, 0, 150, 0, 0], "2026-06": [150, 0, 0, 0, 0] })

    const lineLookup = client.queries.find((query) => query.table === "branch_rev_lines" && query.terminal === "maybeSingle")
    expect(lineLookup?.filters).toEqual([["id", LINE_A]])
    const entryLookup = client.queries.find((query) => query.table === "branch_rev_period_entries" && query.terminal === "range")
    expect(entryLookup?.filters).toEqual([["import_run_id", ACTIVE_RUN], ["rev_line_id", LINE_A]])
  })

  it("returns null for a line that belongs to a run which is no longer active for its fiscal year", async () => {
    const { repository, client } = await loadRepository()

    expect(await repository.readRevDealFromActiveImportById(LINE_STALE)).toBeNull()
    // 활성 run 판정에서 끊겨 엔트리 조회까지 가지 않는다.
    expect(client.queries.some((query) => query.table === "branch_rev_period_entries")).toBe(false)
  })

  it("returns null for an unknown uuid and short-circuits non-uuid ids without a database round trip", async () => {
    const { repository, client } = await loadRepository()

    expect(await repository.readRevDealFromActiveImportById(UNKNOWN_ID)).toBeNull()
    const before = client.queries.length
    expect(await repository.readRevDealFromActiveImportById("draft-srv-1")).toBeNull()
    expect(client.queries.length).toBe(before)
  })
})
