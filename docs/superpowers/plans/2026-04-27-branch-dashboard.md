# Branch Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/admin/branch` unified dashboard pulling Sales Branding sheet (DSH/SEG/REV/KPI), Hardware sheet (4 tabs), and existing Supabase domains (events, email_campaigns, leads) for BD/MKT/CSM teams. Replace existing lead-by-branch page.

**Architecture:** Hybrid data flow — DSH/SEG/KPI direct read with 60s `unstable_cache`; REV and HW raw rows synced to Supabase every 4h via Vercel Cron. Gemini 3.1 Pro generates one_liner + next_actions[] daily, all numeric KPIs computed in code. Page composes 9 sections (0~8) with global team and period toggles. Single source of truth = sheets; sync failure preserves last successful data.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (admin client), Tailwind 4, Recharts, googleapis (existing), Gemini REST API (no SDK), Vitest, Vercel Cron.

**Reference spec:** `docs/superpowers/specs/2026-04-27-branch-dashboard-design.md`

---

## File Structure

```
supabase/migrations/20260427_branch_dashboard.sql        — 5 tables + 5 PL/pgSQL replace fns
.env.local.example                                        — 4 new env vars
vercel.json                                               — 2 new cron entries

lib/branch/
  fiscal.ts                fiscal-year helpers (FY 4월~3월)
  google-sheets.ts         readRange / readRangeWithFormat (재시도 + 포맷)
  parsers/
    dsh.ts seg.ts rev.ts kpi.ts hw.ts
  computations/
    heatmap.ts pacing.ts pipeline.ts core-kpi.ts
    data-quality.ts campaigns.ts
  insights/
    input-builder.ts prompt.ts gemini-runner.ts
  sync/
    sync-rev.ts sync-hw.ts run-all.ts

lib/repositories/
  branch-deals.ts branch-hw.ts branch-insights.ts branch-sync.ts

app/admin/branch/page.tsx                  — server component
app/admin/branch/loading.tsx
app/api/admin/branch/{summary,heatmap,pipeline,kpi,hw,insights,sync}/route.ts
app/api/cron/sync-branch/route.ts
app/api/cron/sync-branch-insights/route.ts

components/admin/branch/
  BranchDashboardClient.tsx  SyncStatusBar.tsx
  sections/InsightCard.tsx CoreKpiGrid.tsx FiscalRoadmap.tsx
  sections/RegionHeatmap.tsx TeamPacingSection.tsx ManagerScorecard.tsx
  sections/KpiActivityMatrix.tsx ManagerPipelineMini.tsx
  sections/PipelineTable.tsx CampaignsSection.tsx HardwareSection.tsx
  sections/DataQualityPanel.tsx

tests/branch/
  fixtures/                  — JSON snapshots of sheet responses
  fiscal.test.ts             parsers/*.test.ts  computations/*.test.ts
```

Engineer should follow these conventions:
- All admin DB access via `createSupabaseAdminClient()` (not server client; RLS would block).
- All admin API routes start with `const err = await verifyAdmin(req); if (err) return err;`
- Cron routes verify `Authorization: Bearer ${process.env.BRANCH_DASHBOARD_CRON_SECRET}`.
- UI palette: `#FFFFFF` ↔ `#F6F5F4` ↔ `#ECFDF5`, borders `1px solid rgba(0,0,0,0.08)`.
- Korean labels in UI, English identifiers in code.

---

## Phase 1 — Foundation (M1)

### Task 1: Add environment variables

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Append env vars**

```diff
+GOOGLE_BRANCH_DASHBOARD_SHEET_ID=
+GOOGLE_BRANCH_HARDWARE_SHEET_ID=
+BRANCH_DASHBOARD_CRON_SECRET=
+GEMINI_API_KEY=
+GEMINI_MODEL=
```

- [ ] **Step 2: Confirm `.env.local` already populated**

Run: `grep -E '^(GOOGLE_BRANCH|BRANCH_DASHBOARD_CRON|GEMINI_)' .env.local | wc -l`
Expected: `5`

If less than 5, ask user to populate before proceeding.

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "chore(branch): add env var stubs for branch dashboard"
```

---

### Task 2: Create fiscal-year helper with tests

**Files:**
- Create: `lib/branch/fiscal.ts`
- Test: `tests/branch/fiscal.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/branch/fiscal.test.ts
import { describe, it, expect } from "vitest"
import { fyOf, fyStart, fiscalQuarter, fiscalMonthIndex, ymKey, FISCAL_MONTH_ORDER } from "@/lib/branch/fiscal"

describe("fiscal", () => {
  it("FY starts April 1", () => {
    expect(fyOf(new Date("2026-04-01"))).toBe(2026)
    expect(fyOf(new Date("2027-03-31"))).toBe(2026)
    expect(fyOf(new Date("2026-03-31"))).toBe(2025)
  })
  it("fyStart returns April 1 of the FY", () => {
    expect(fyStart(new Date("2026-12-15")).toISOString().slice(0,10)).toBe("2026-04-01")
    expect(fyStart(new Date("2027-01-15")).toISOString().slice(0,10)).toBe("2026-04-01")
  })
  it("quarters", () => {
    expect(fiscalQuarter(4)).toBe(1); expect(fiscalQuarter(6)).toBe(1)
    expect(fiscalQuarter(7)).toBe(2); expect(fiscalQuarter(9)).toBe(2)
    expect(fiscalQuarter(12)).toBe(3); expect(fiscalQuarter(1)).toBe(4); expect(fiscalQuarter(3)).toBe(4)
  })
  it("month index follows FY order", () => {
    expect(FISCAL_MONTH_ORDER).toEqual([4,5,6,7,8,9,10,11,12,1,2,3])
    expect(fiscalMonthIndex(4)).toBe(0)
    expect(fiscalMonthIndex(3)).toBe(11)
  })
  it("ymKey", () => { expect(ymKey(new Date("2026-04-09"))).toBe("2026-04") })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/branch/fiscal.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/branch/fiscal.ts
export const FISCAL_MONTH_ORDER = [4,5,6,7,8,9,10,11,12,1,2,3] as const

export function fyOf(d: Date): number {
  const y = d.getUTCFullYear(); const m = d.getUTCMonth() + 1
  return m >= 4 ? y : y - 1
}
export function fyStart(d: Date): Date { return new Date(Date.UTC(fyOf(d), 3, 1)) }
export function fiscalQuarter(month: number): 1|2|3|4 {
  if (month >= 4 && month <= 6) return 1
  if (month >= 7 && month <= 9) return 2
  if (month >= 10 && month <= 12) return 3
  return 4
}
export function fiscalMonthIndex(month: number): number {
  return FISCAL_MONTH_ORDER.indexOf(month as 4|5|6|7|8|9|10|11|12|1|2|3)
}
export function ymKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,"0")}`
}
export function currentFyPeriod(now: Date): { fy: number; quarter: 1|2|3|4; month: string } {
  return { fy: fyOf(now), quarter: fiscalQuarter(now.getUTCMonth() + 1), month: ymKey(now) }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run tests/branch/fiscal.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/branch/fiscal.ts tests/branch/fiscal.test.ts
git commit -m "feat(branch): fiscal-year helpers (FY 4월~3월)"
```

---

### Task 3: Supabase migration — tables + replace functions

**Files:**
- Create: `supabase/migrations/20260427_branch_dashboard.sql`

- [ ] **Step 1: Write migration**

Copy spec §7 verbatim into the migration file. Reproduced here for execution:

```sql
-- 20260427_branch_dashboard.sql
create table branch_rev_deals (
  id uuid primary key default gen_random_uuid(),
  sheet_row int not null,
  customer_name text not null,
  branch_contact text, team text, manager text,
  deal_type text, status text,
  first_payment date, product_version text, region text, importance text, note text,
  contract_target numeric(14,0),
  monthly_payments jsonb not null default '{}',
  monthly_red jsonb not null default '{}',
  raw jsonb not null default '{}',
  synced_at timestamptz not null default now()
);
create index branch_rev_team_idx       on branch_rev_deals(team);
create index branch_rev_region_idx     on branch_rev_deals(region);
create index branch_rev_manager_idx    on branch_rev_deals(manager);
create index branch_rev_first_pay_idx  on branch_rev_deals(first_payment);

create table branch_hw_inbound (
  id uuid primary key default gen_random_uuid(),
  logistics_no text, inbound_date date,
  product text not null, quantity int not null default 0,
  unit_price numeric(14,0), amount numeric(14,0),
  serials text[], storage text, importer text, remarks text,
  raw jsonb not null default '{}', synced_at timestamptz not null default now()
);

create table branch_hw_outbound (
  id uuid primary key default gen_random_uuid(),
  logistics_no text, outbound_date date, owner text,
  product text not null, quantity int not null default 0,
  revenue numeric(14,0), destination text, serials text[],
  progress text, type text, remarks text,
  raw jsonb not null default '{}', synced_at timestamptz not null default now()
);

create table branch_hw_stock (
  id uuid primary key default gen_random_uuid(),
  product text not null, category text,
  quantity int not null default 0,
  raw jsonb not null default '{}', synced_at timestamptz not null default now()
);

create table branch_hw_sales_monthly (
  id uuid primary key default gen_random_uuid(),
  fiscal_year int not null, fiscal_month int not null,
  product text not null, quantity int not null default 0,
  raw jsonb not null default '{}', synced_at timestamptz not null default now(),
  unique (fiscal_year, fiscal_month, product)
);

create table branch_dashboard_insights (
  id uuid primary key default gen_random_uuid(),
  team text not null, fiscal_period text not null,
  generated_at timestamptz not null default now(),
  one_liner text, next_actions jsonb not null default '[]',
  raw_response jsonb, input_digest text
);
create index branch_insights_idx on branch_dashboard_insights(team, generated_at desc);

create table branch_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(), finished_at timestamptz,
  source text not null, trigger text not null, status text not null,
  rows_affected int, error text
);
create index branch_sync_runs_recent_idx on branch_sync_runs(started_at desc);

create or replace function replace_branch_rev_deals(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_rev_deals;
  insert into branch_rev_deals (
    sheet_row, customer_name, branch_contact, team, manager, deal_type, status,
    first_payment, product_version, region, importance, note, contract_target,
    monthly_payments, monthly_red, raw)
  select (r->>'sheet_row')::int, r->>'customer_name', r->>'branch_contact',
         r->>'team', r->>'manager', r->>'deal_type', r->>'status',
         nullif(r->>'first_payment','')::date,
         r->>'product_version', r->>'region', r->>'importance', r->>'note',
         nullif(r->>'contract_target','')::numeric,
         coalesce(r->'monthly_payments','{}'::jsonb),
         coalesce(r->'monthly_red','{}'::jsonb),
         coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

create or replace function replace_branch_hw_inbound(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_hw_inbound;
  insert into branch_hw_inbound (logistics_no, inbound_date, product, quantity, unit_price, amount,
    serials, storage, importer, remarks, raw)
  select r->>'logistics_no', nullif(r->>'inbound_date','')::date,
         r->>'product', coalesce((r->>'quantity')::int, 0),
         nullif(r->>'unit_price','')::numeric, nullif(r->>'amount','')::numeric,
         array(select jsonb_array_elements_text(coalesce(r->'serials','[]'::jsonb))),
         r->>'storage', r->>'importer', r->>'remarks',
         coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

create or replace function replace_branch_hw_outbound(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_hw_outbound;
  insert into branch_hw_outbound (logistics_no, outbound_date, owner, product, quantity, revenue,
    destination, serials, progress, type, remarks, raw)
  select r->>'logistics_no', nullif(r->>'outbound_date','')::date,
         r->>'owner', r->>'product', coalesce((r->>'quantity')::int, 0),
         nullif(r->>'revenue','')::numeric, r->>'destination',
         array(select jsonb_array_elements_text(coalesce(r->'serials','[]'::jsonb))),
         r->>'progress', r->>'type', r->>'remarks',
         coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

create or replace function replace_branch_hw_stock(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_hw_stock;
  insert into branch_hw_stock (product, category, quantity, raw)
  select r->>'product', r->>'category', coalesce((r->>'quantity')::int, 0), coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

create or replace function replace_branch_hw_sales_monthly(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_hw_sales_monthly;
  insert into branch_hw_sales_monthly (fiscal_year, fiscal_month, product, quantity, raw)
  select (r->>'fiscal_year')::int, (r->>'fiscal_month')::int, r->>'product',
         coalesce((r->>'quantity')::int, 0), coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase migration up` (or whatever pattern this project uses; check `supabase/` README or recent migrations for the command). If unclear, ask user.

- [ ] **Step 3: Verify tables**

Use Supabase dashboard or `psql` to confirm 7 tables and 5 functions exist.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260427_branch_dashboard.sql
git commit -m "feat(branch): supabase tables + replace functions for dashboard"
```

---

### Task 4: Repository skeletons

**Files:**
- Create: `lib/repositories/branch-deals.ts`
- Create: `lib/repositories/branch-hw.ts`
- Create: `lib/repositories/branch-insights.ts`
- Create: `lib/repositories/branch-sync.ts`

- [ ] **Step 1: Create branch-sync.ts**

```ts
// lib/repositories/branch-sync.ts
"server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type SyncSource = "rev" | "hw" | "all" | "insights"
export type SyncTrigger = "cron" | "manual"
export type SyncStatus = "running" | "success" | "failed"

export interface SyncRun {
  id: string; started_at: string; finished_at: string | null
  source: SyncSource; trigger: SyncTrigger; status: SyncStatus
  rows_affected: number | null; error: string | null
}

export async function startSyncRun(source: SyncSource, trigger: SyncTrigger): Promise<string> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_sync_runs")
    .insert({ source, trigger, status: "running" }).select("id").single()
  if (error) throw error
  return data.id
}
export async function finishSyncRun(id: string, patch: { status: SyncStatus; rows_affected?: number; error?: string }): Promise<void> {
  const sb = createSupabaseAdminClient()
  const { error } = await sb.from("branch_sync_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
}
export async function getRecentSyncRuns(limit = 10): Promise<SyncRun[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_sync_runs").select("*").order("started_at", { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as SyncRun[]
}
export async function isAnyRunning(): Promise<boolean> {
  const sb = createSupabaseAdminClient()
  const { count, error } = await sb.from("branch_sync_runs").select("*", { count: "exact", head: true }).eq("status", "running")
  if (error) throw error
  return (count ?? 0) > 0
}
```

- [ ] **Step 2: Create branch-deals.ts**

```ts
// lib/repositories/branch-deals.ts
"server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface BranchRevDeal {
  id: string; sheet_row: number
  customer_name: string; branch_contact: string | null
  team: string | null; manager: string | null
  deal_type: string | null; status: string | null
  first_payment: string | null; product_version: string | null
  region: string | null; importance: string | null; note: string | null
  contract_target: number | null
  monthly_payments: Record<string, number>
  monthly_red: Record<string, boolean>
  raw: Record<string, unknown>; synced_at: string
}

export async function listBranchRevDeals(filter?: { team?: string }): Promise<BranchRevDeal[]> {
  const sb = createSupabaseAdminClient()
  let q = sb.from("branch_rev_deals").select("*")
  if (filter?.team && filter.team !== "ALL") q = q.eq("team", filter.team)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as BranchRevDeal[]
}

export async function replaceBranchRevDeals(rows: unknown[]): Promise<number> {
  const sb = createSupabaseAdminClient()
  const { error } = await sb.rpc("replace_branch_rev_deals", { rows })
  if (error) throw error
  return rows.length
}
```

- [ ] **Step 3: Create branch-hw.ts**

```ts
// lib/repositories/branch-hw.ts
"server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface HwInbound { id: string; logistics_no: string | null; inbound_date: string | null; product: string; quantity: number; unit_price: number | null; amount: number | null; serials: string[]; storage: string | null; importer: string | null; remarks: string | null; synced_at: string }
export interface HwOutbound { id: string; logistics_no: string | null; outbound_date: string | null; owner: string | null; product: string; quantity: number; revenue: number | null; destination: string | null; serials: string[]; progress: string | null; type: string | null; remarks: string | null; synced_at: string }
export interface HwStock { id: string; product: string; category: string | null; quantity: number }
export interface HwSalesMonthly { id: string; fiscal_year: number; fiscal_month: number; product: string; quantity: number }

async function listAll<T>(table: string): Promise<T[]> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from(table).select("*")
  if (error) throw error
  return (data ?? []) as T[]
}
export const listHwInbound = () => listAll<HwInbound>("branch_hw_inbound")
export const listHwOutbound = () => listAll<HwOutbound>("branch_hw_outbound")
export const listHwStock = () => listAll<HwStock>("branch_hw_stock")
export const listHwSalesMonthly = () => listAll<HwSalesMonthly>("branch_hw_sales_monthly")

async function replaceVia(fn: string, rows: unknown[]): Promise<number> {
  const sb = createSupabaseAdminClient()
  const { error } = await sb.rpc(fn, { rows })
  if (error) throw error
  return rows.length
}
export const replaceHwInbound = (r: unknown[]) => replaceVia("replace_branch_hw_inbound", r)
export const replaceHwOutbound = (r: unknown[]) => replaceVia("replace_branch_hw_outbound", r)
export const replaceHwStock = (r: unknown[]) => replaceVia("replace_branch_hw_stock", r)
export const replaceHwSalesMonthly = (r: unknown[]) => replaceVia("replace_branch_hw_sales_monthly", r)
```

- [ ] **Step 4: Create branch-insights.ts**

```ts
// lib/repositories/branch-insights.ts
"server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type TeamScope = "ALL" | "BD" | "MKT" | "CSM"
export interface NextAction { title: string; why: string; owner: string; due?: string }
export interface BranchInsight {
  id: string; team: TeamScope; fiscal_period: string; generated_at: string
  one_liner: string | null; next_actions: NextAction[]
  raw_response: unknown; input_digest: string | null
}

export async function getLatestInsight(team: TeamScope): Promise<BranchInsight | null> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_dashboard_insights")
    .select("*").eq("team", team).order("generated_at", { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as BranchInsight | null
}
export async function findInsightByDigest(team: TeamScope, digest: string, withinHours = 24): Promise<BranchInsight | null> {
  const sb = createSupabaseAdminClient()
  const cutoff = new Date(Date.now() - withinHours * 3600_000).toISOString()
  const { data, error } = await sb.from("branch_dashboard_insights")
    .select("*").eq("team", team).eq("input_digest", digest)
    .gte("generated_at", cutoff).order("generated_at", { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as BranchInsight | null
}
export async function insertInsight(row: Omit<BranchInsight, "id" | "generated_at">): Promise<BranchInsight> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.from("branch_dashboard_insights").insert(row).select("*").single()
  if (error) throw error
  return data as BranchInsight
}
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "lib/repositories/branch-" | head -20`
Expected: empty (no type errors).

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/branch-*.ts
git commit -m "feat(branch): repository skeletons (deals/hw/insights/sync)"
```

---

### Task 5: Google sheets reader with format extraction

**Files:**
- Create: `lib/branch/google-sheets.ts`

- [ ] **Step 1: Create reader**

```ts
// lib/branch/google-sheets.ts
import "server-only"
import { sheets } from "@/lib/google"

const RETRY_DELAYS_MS = [200, 800, 2000]

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown
  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    try { return await fn() } catch (e) { lastErr = e }
  }
  throw new Error(`[branch/sheets] ${label} failed after retries: ${String(lastErr)}`)
}

export async function readRange(spreadsheetId: string, range: string): Promise<string[][]> {
  return withRetry(async () => {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId, range,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    })
    return (res.data.values ?? []) as string[][]
  }, range)
}

export interface CellFormat { red?: number; green?: number; blue?: number }
export interface FormattedCell { value: string | number | null; bg: CellFormat | null }

export async function readRangeWithFormat(spreadsheetId: string, range: string): Promise<FormattedCell[][]> {
  return withRetry(async () => {
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [range],
      includeGridData: true,
      fields: "sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor,userEnteredValue)",
    })
    const data = res.data.sheets?.[0]?.data?.[0]?.rowData ?? []
    return data.map((row) =>
      (row.values ?? []).map((cell): FormattedCell => ({
        value:
          cell.userEnteredValue?.numberValue ??
          cell.userEnteredValue?.stringValue ??
          (cell.formattedValue ? cell.formattedValue : null),
        bg: cell.effectiveFormat?.backgroundColor ?? null,
      }))
    )
  }, range)
}

export function isRedBg(bg: CellFormat | null): boolean {
  if (!bg) return false
  return (bg.red ?? 0) >= 0.85 && (bg.green ?? 0) < 0.5 && (bg.blue ?? 0) < 0.5
}

export function envSheetId(kind: "dashboard" | "hardware"): string {
  const id = kind === "dashboard"
    ? process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID
    : process.env.GOOGLE_BRANCH_HARDWARE_SHEET_ID
  if (!id) throw new Error(`Missing env: GOOGLE_BRANCH_${kind === "dashboard" ? "DASHBOARD" : "HARDWARE"}_SHEET_ID`)
  return id
}
```

- [ ] **Step 2: Smoke test (manual, optional)**

Create `scripts/branch-sheets-smoke.ts`:
```ts
import { readRange, envSheetId } from "@/lib/branch/google-sheets"
async function main() {
  const id = envSheetId("dashboard")
  const rows = await readRange(id, "REV!A1:E5")
  console.log(rows)
}
main()
```
Run: `npx tsx scripts/branch-sheets-smoke.ts`
Expected: First 5 rows of REV. If permission error, confirm sheet sharing.

(Delete script after verification.)

- [ ] **Step 3: Commit**

```bash
git add lib/branch/google-sheets.ts
git commit -m "feat(branch): google sheets reader with format and retry"
```

---

## Phase 2 — Parsers (M2)

Each parser ingests sheet data and produces typed records. Tests use fixtures in `tests/branch/fixtures/`. Fixtures are constructed by hand or captured from real sync (anonymized).

### Task 6: REV parser (heaviest, do first)

**Files:**
- Create: `lib/branch/parsers/rev.ts`
- Test: `tests/branch/parsers/rev.test.ts`
- Create: `tests/branch/fixtures/rev-sample.json`

- [ ] **Step 1: Create fixture (8-10 rows)**

```json
// tests/branch/fixtures/rev-sample.json
[
  [{"value":"Customer","bg":null},{"value":"Branch","bg":null},{"value":"Team","bg":null},{"value":"Manager","bg":null},{"value":"Type","bg":null},{"value":"Status","bg":null},{"value":"FirstPay","bg":null},{"value":"Version","bg":null},{"value":"Region","bg":null},{"value":"J","bg":null},{"value":"Importance","bg":null},{"value":"Note","bg":null},{"value":"Target","bg":null},{"value":"2026-04","bg":null},{"value":"2026-05","bg":null},{"value":"2026-06","bg":null}],
  [{"value":"학원A","bg":null},{"value":"본원","bg":null},{"value":"BD","bg":null},{"value":"Han","bg":null},{"value":"Direct","bg":null},{"value":"New","bg":null},{"value":"2026-04-15","bg":null},{"value":"v1","bg":null},{"value":"서울","bg":null},{"value":null,"bg":null},{"value":"KA","bg":null},{"value":"","bg":null},{"value":12000000,"bg":null},{"value":4000000,"bg":{"red":0.95,"green":0.2,"blue":0.2}},{"value":4000000,"bg":{"red":0.95,"green":0.2,"blue":0.2}},{"value":4000000,"bg":null}],
  [{"value":"학원B","bg":null},{"value":"강남","bg":null},{"value":"MKT","bg":null},{"value":"Mira","bg":null},{"value":"Channel","bg":null},{"value":"Renew","bg":null},{"value":"","bg":null},{"value":"v2","bg":null},{"value":"부산","bg":null},{"value":null,"bg":null},{"value":"A","bg":null},{"value":"Negotiation","bg":null},{"value":8000000,"bg":null},{"value":0,"bg":null},{"value":0,"bg":null},{"value":0,"bg":null}]
]
```

- [ ] **Step 2: Write failing test**

```ts
// tests/branch/parsers/rev.test.ts
import { describe, it, expect } from "vitest"
import fixture from "../fixtures/rev-sample.json"
import { parseRev } from "@/lib/branch/parsers/rev"

describe("parseRev", () => {
  it("skips header row, parses customer rows", () => {
    const out = parseRev(fixture as never)
    expect(out).toHaveLength(2)
    expect(out[0].customer_name).toBe("학원A")
    expect(out[0].team).toBe("BD")
    expect(out[0].manager).toBe("Han")
    expect(out[0].first_payment).toBe("2026-04-15")
    expect(out[0].importance).toBe("KA")
    expect(out[0].contract_target).toBe(12000000)
  })
  it("captures monthly payments + red flags", () => {
    const out = parseRev(fixture as never)
    expect(out[0].monthly_payments["2026-04"]).toBe(4000000)
    expect(out[0].monthly_payments["2026-06"]).toBe(4000000)
    expect(out[0].monthly_red["2026-04"]).toBe(true)
    expect(out[0].monthly_red["2026-05"]).toBe(true)
    expect(out[0].monthly_red["2026-06"]).toBeUndefined()
  })
  it("blank first_payment becomes null", () => {
    const out = parseRev(fixture as never)
    expect(out[1].first_payment).toBeNull()
  })
  it("normalizes year-only month headers using FY", () => {
    const headers = ["...","...","...","...","...","...","...","...","...","...","...","...","...","4월","5월"]
    // 직접 normalizeMonthHeader 단위 테스트
  })
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/branch/parsers/rev.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement parser**

```ts
// lib/branch/parsers/rev.ts
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { isRedBg } from "@/lib/branch/google-sheets"

export const REV_RANGE = "REV!A1:CZ400"
export const REV_COLS = {
  customer: 0, branchContact: 1, team: 2, manager: 3,
  dealType: 4, status: 5, firstPayment: 6, productVersion: 7,
  region: 8, importance: 10, note: 11, contractTarget: 12,
  monthlyStart: 13,
} as const

export interface RevDealParsed {
  sheet_row: number
  customer_name: string
  branch_contact: string | null
  team: string | null
  manager: string | null
  deal_type: string | null
  status: string | null
  first_payment: string | null
  product_version: string | null
  region: string | null
  importance: string | null
  note: string | null
  contract_target: number | null
  monthly_payments: Record<string, number>
  monthly_red: Record<string, boolean>
  raw: Record<string, unknown>
}

const ymRe = /^(\d{4})-(\d{1,2})$/
const monthOnlyRe = /^([1-9]|1[0-2])월?$/

export function normalizeMonthHeader(value: unknown, refFy: number): string | null {
  if (value == null) return null
  const s = String(value).trim()
  const ym = s.match(ymRe)
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}`
  const mo = s.match(monthOnlyRe)
  if (mo) {
    const m = parseInt(mo[1], 10)
    const y = m >= 4 ? refFy : refFy + 1
    return `${y}-${String(m).padStart(2, "0")}`
  }
  return null
}

function asString(v: unknown): string | null { if (v == null) return null; const s = String(v).trim(); return s.length ? s : null }
function asNumber(v: unknown): number | null { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null }
function asDate(v: unknown): string | null { const s = asString(v); if (!s) return null; const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (!m) return null; return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}` }

export function parseRev(grid: FormattedCell[][], opts?: { refFy?: number }): RevDealParsed[] {
  if (grid.length === 0) return []
  const refFy = opts?.refFy ?? new Date().getUTCFullYear()
  const headers = grid[0] ?? []
  const monthMap: Array<{ idx: number; ym: string }> = []
  for (let i = REV_COLS.monthlyStart; i < headers.length; i++) {
    const ym = normalizeMonthHeader(headers[i]?.value, refFy)
    if (ym) monthMap.push({ idx: i, ym })
  }

  const out: RevDealParsed[] = []
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const customer = asString(row[REV_COLS.customer]?.value)
    if (!customer) continue
    const monthly_payments: Record<string, number> = {}
    const monthly_red: Record<string, boolean> = {}
    for (const { idx, ym } of monthMap) {
      const cell = row[idx]; if (!cell) continue
      const n = asNumber(cell.value)
      if (n != null && n !== 0) monthly_payments[ym] = n
      if (isRedBg(cell.bg)) monthly_red[ym] = true
    }
    out.push({
      sheet_row: r + 1,
      customer_name: customer,
      branch_contact: asString(row[REV_COLS.branchContact]?.value),
      team: asString(row[REV_COLS.team]?.value),
      manager: asString(row[REV_COLS.manager]?.value),
      deal_type: asString(row[REV_COLS.dealType]?.value),
      status: asString(row[REV_COLS.status]?.value),
      first_payment: asDate(row[REV_COLS.firstPayment]?.value),
      product_version: asString(row[REV_COLS.productVersion]?.value),
      region: asString(row[REV_COLS.region]?.value),
      importance: asString(row[REV_COLS.importance]?.value),
      note: asString(row[REV_COLS.note]?.value),
      contract_target: asNumber(row[REV_COLS.contractTarget]?.value),
      monthly_payments, monthly_red,
      raw: { row: row.map((c) => c?.value ?? null) },
    })
  }
  return out
}
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run tests/branch/parsers/rev.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/branch/parsers/rev.ts tests/branch/parsers/rev.test.ts tests/branch/fixtures/rev-sample.json
git commit -m "feat(branch): REV parser with red-cell + monthly normalization"
```

---

### Task 7: DSH parser (team grouping)

**Files:**
- Create: `lib/branch/parsers/dsh.ts`
- Test: `tests/branch/parsers/dsh.test.ts`
- Create: `tests/branch/fixtures/dsh-sample.json`

- [ ] **Step 1: Build fixture (4 cols A,F,G..J,K..V abbreviated to 4 month sample)**

Create a fixture mimicking team headers and member rows. Manual construction; ~12 rows. Keep small.

```json
[
  [{"value":"Label","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"Annual","bg":null},{"value":"Q1","bg":null},{"value":"Q2","bg":null},{"value":"Q3","bg":null},{"value":"Q4","bg":null},{"value":"4","bg":null},{"value":"5","bg":null},{"value":"6","bg":null}],
  [{"value":"BD","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"Goal","bg":null},{"value":120000000,"bg":null},{"value":30000000,"bg":null},{"value":30000000,"bg":null},{"value":30000000,"bg":null},{"value":30000000,"bg":null},{"value":10000000,"bg":null},{"value":10000000,"bg":null},{"value":10000000,"bg":null}],
  [{"value":"BD","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"Status","bg":null},{"value":40000000,"bg":null},{"value":40000000,"bg":null},{"value":0,"bg":null},{"value":0,"bg":null},{"value":0,"bg":null},{"value":15000000,"bg":null},{"value":15000000,"bg":null},{"value":10000000,"bg":null}],
  [{"value":"  Han","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"Goal","bg":null},{"value":40000000,"bg":null},{"value":10000000,"bg":null},{"value":10000000,"bg":null},{"value":10000000,"bg":null},{"value":10000000,"bg":null},{"value":3000000,"bg":null},{"value":3000000,"bg":null},{"value":4000000,"bg":null}],
  [{"value":"  Han","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"Status","bg":null},{"value":15000000,"bg":null},{"value":15000000,"bg":null},{"value":0,"bg":null},{"value":0,"bg":null},{"value":0,"bg":null},{"value":5000000,"bg":null},{"value":5000000,"bg":null},{"value":5000000,"bg":null}],
  [{"value":"MKT","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"","bg":null},{"value":"Goal","bg":null},{"value":60000000,"bg":null},{"value":15000000,"bg":null},{"value":15000000,"bg":null},{"value":15000000,"bg":null},{"value":15000000,"bg":null},{"value":5000000,"bg":null},{"value":5000000,"bg":null},{"value":5000000,"bg":null}]
]
```

- [ ] **Step 2: Write failing test**

```ts
// tests/branch/parsers/dsh.test.ts
import { describe, it, expect } from "vitest"
import fixture from "../fixtures/dsh-sample.json"
import { parseDsh } from "@/lib/branch/parsers/dsh"

describe("parseDsh", () => {
  it("extracts team-level Goal/Status", () => {
    const { rows, members } = parseDsh(fixture as never, 2026)
    const bdGoal = rows.find((r) => r.level === "team" && r.team === "BD" && r.kind === "goal")
    expect(bdGoal?.annual).toBe(120000000)
    expect(bdGoal?.quarters[0]).toBe(30000000)
    expect(bdGoal?.months["2026-04"]).toBe(10000000)
    expect(members.Han).toBe("BD")
  })
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/branch/parsers/dsh.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

```ts
// lib/branch/parsers/dsh.ts
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { normalizeMonthHeader } from "./rev"

export const DSH_RANGE = "DSH!A1:V200"
export const DSH_COLS = { label: 0, kind: 4, annual: 5, q1: 6, q4: 9, monthStart: 10 } as const

export type DshLevel = "team" | "member"
export type DshKind = "goal" | "status"

export interface DshRow {
  level: DshLevel
  team: string
  member?: string
  kind: DshKind
  annual: number
  quarters: [number, number, number, number]
  months: Record<string, number>
}

export interface DshOutput { rows: DshRow[]; members: Record<string, string> }

const TEAM_HEADERS = ["BD", "MKT", "CSM"]

function asNum(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export function parseDsh(grid: FormattedCell[][], refFy: number): DshOutput {
  if (grid.length === 0) return { rows: [], members: {} }
  const headers = grid[0] ?? []
  const monthMap: Array<{ idx: number; ym: string }> = []
  for (let i = DSH_COLS.monthStart; i < headers.length; i++) {
    const ym = normalizeMonthHeader(headers[i]?.value, refFy)
    if (ym) monthMap.push({ idx: i, ym })
  }

  const rows: DshRow[] = []
  const members: Record<string, string> = {}
  let currentTeam: string | null = null

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const labelRaw = String(row[DSH_COLS.label]?.value ?? "").trim()
    const indented = String(row[DSH_COLS.label]?.value ?? "").startsWith("  ") || String(row[DSH_COLS.label]?.value ?? "").startsWith("\t")
    if (!labelRaw) continue
    const kind = String(row[DSH_COLS.kind]?.value ?? "").toLowerCase().trim()
    if (kind !== "goal" && kind !== "status") continue
    const k = kind as DshKind
    const months: Record<string, number> = {}
    for (const { idx, ym } of monthMap) months[ym] = asNum(row[idx]?.value)
    const base = {
      kind: k,
      annual: asNum(row[DSH_COLS.annual]?.value),
      quarters: [asNum(row[DSH_COLS.q1]?.value), asNum(row[DSH_COLS.q1+1]?.value), asNum(row[DSH_COLS.q1+2]?.value), asNum(row[DSH_COLS.q4]?.value)] as [number, number, number, number],
      months,
    }
    if (TEAM_HEADERS.includes(labelRaw) && !indented) {
      currentTeam = labelRaw
      rows.push({ level: "team", team: currentTeam, ...base })
    } else if (currentTeam) {
      rows.push({ level: "member", team: currentTeam, member: labelRaw, ...base })
      members[labelRaw] = currentTeam
    }
  }
  return { rows, members }
}
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run tests/branch/parsers/dsh.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/branch/parsers/dsh.ts tests/branch/parsers/dsh.test.ts tests/branch/fixtures/dsh-sample.json
git commit -m "feat(branch): DSH parser with team grouping"
```

---

### Task 8: SEG parser

**Files:**
- Create: `lib/branch/parsers/seg.ts`
- Test: `tests/branch/parsers/seg.test.ts`

- [ ] **Step 1: Test + impl together (small)**

```ts
// lib/branch/parsers/seg.ts
import type { FormattedCell } from "@/lib/branch/google-sheets"
export const SEG_RANGE = "SEG!A1:AZ100"
export interface SegRow { region: string; goal: number; status: number }

export function parseSeg(grid: FormattedCell[][]): SegRow[] {
  // L=11 goal region, M=12 goal amount, Q=16 status region, R=17 status amount
  const goalMap = new Map<string, number>()
  const statusMap = new Map<string, number>()
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const gReg = String(row[11]?.value ?? "").trim()
    const gAmt = Number(row[12]?.value); if (gReg) goalMap.set(gReg, Number.isFinite(gAmt) ? gAmt : 0)
    const sReg = String(row[16]?.value ?? "").trim()
    const sAmt = Number(row[17]?.value); if (sReg) statusMap.set(sReg, Number.isFinite(sAmt) ? sAmt : 0)
  }
  const regions = new Set([...goalMap.keys(), ...statusMap.keys()])
  return [...regions].map((region) => ({ region, goal: goalMap.get(region) ?? 0, status: statusMap.get(region) ?? 0 }))
}
```

```ts
// tests/branch/parsers/seg.test.ts
import { describe, it, expect } from "vitest"
import { parseSeg } from "@/lib/branch/parsers/seg"

describe("parseSeg", () => {
  it("aligns goal vs status by region", () => {
    const grid: any[][] = [Array(20).fill({ value: "" })]
    grid.push([
      ...Array(11).fill({ value: "" }),
      { value: "서울" }, { value: 1000 },
      ...Array(3).fill({ value: "" }),
      { value: "서울" }, { value: 600 },
    ])
    const rows = parseSeg(grid as never)
    expect(rows.find((r) => r.region === "서울")).toEqual({ region: "서울", goal: 1000, status: 600 })
  })
})
```

- [ ] **Step 2: Run, commit**

Run: `npx vitest run tests/branch/parsers/seg.test.ts`
Expected: PASS.

```bash
git add lib/branch/parsers/seg.ts tests/branch/parsers/seg.test.ts
git commit -m "feat(branch): SEG parser (goal/status by region)"
```

---

### Task 9: KPI parser

**Files:**
- Create: `lib/branch/parsers/kpi.ts`
- Test: `tests/branch/parsers/kpi.test.ts`

- [ ] **Step 1: Implement + test**

```ts
// lib/branch/parsers/kpi.ts
import type { FormattedCell } from "@/lib/branch/google-sheets"

export const KPI_RANGE = "KPI!A1:AZ60"
export const KPI_METRICS = ["LD", "ACC", "OPP", "SOL", "VST"] as const
export type KpiMetric = typeof KPI_METRICS[number]
export type KpiPair = { goal: number; actual: number }

export interface KpiRow { member: string; pairs: Record<KpiMetric, KpiPair> }

const ACTUAL_OFFSET = 20  // V열은 0-based 21번째 (= V), index 21. B=1..F=5; V=21..Z=25.

export function parseKpi(grid: FormattedCell[][]): KpiRow[] {
  const out: KpiRow[] = []
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const member = String(row[0]?.value ?? "").trim()
    if (!member) continue
    const pairs: Record<KpiMetric, KpiPair> = {} as never
    KPI_METRICS.forEach((m, i) => {
      const goal = Number(row[1 + i]?.value); const actual = Number(row[21 + i]?.value)
      pairs[m] = { goal: Number.isFinite(goal) ? goal : 0, actual: Number.isFinite(actual) ? actual : 0 }
    })
    out.push({ member, pairs })
  }
  return out
}
```

```ts
// tests/branch/parsers/kpi.test.ts
import { describe, it, expect } from "vitest"
import { parseKpi } from "@/lib/branch/parsers/kpi"

describe("parseKpi", () => {
  it("maps B-F goals and V-Z actuals", () => {
    const grid: any[][] = [Array(30).fill({ value: "" })]
    const row = Array(30).fill({ value: "" })
    row[0] = { value: "Han" }
    row[1] = { value: 10 }; row[2] = { value: 20 }; row[3] = { value: 30 }; row[4] = { value: 40 }; row[5] = { value: 50 }
    row[21] = { value: 5 }; row[22] = { value: 18 }; row[23] = { value: 27 }; row[24] = { value: 36 }; row[25] = { value: 22 }
    grid.push(row)
    const out = parseKpi(grid as never)
    expect(out[0].member).toBe("Han")
    expect(out[0].pairs.LD).toEqual({ goal: 10, actual: 5 })
    expect(out[0].pairs.VST).toEqual({ goal: 50, actual: 22 })
  })
})
```

- [ ] **Step 2: Run, commit**

Run: `npx vitest run tests/branch/parsers/kpi.test.ts` → PASS.

```bash
git add lib/branch/parsers/kpi.ts tests/branch/parsers/kpi.test.ts
git commit -m "feat(branch): KPI parser (5 metrics goal/actual)"
```

---

### Task 10: HW parsers (4 sub-parsers)

**Files:**
- Create: `lib/branch/parsers/hw.ts`
- Test: `tests/branch/parsers/hw.test.ts`

- [ ] **Step 1: Implement**

```ts
// lib/branch/parsers/hw.ts
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { FISCAL_MONTH_ORDER } from "@/lib/branch/fiscal"

export const HW_RANGES = {
  sales:    "판매대시보드!A1:Z100",
  stock:    "재고현황!A1:Z200",
  inbound:  "'2.입고 현황'!A1:Z500",
  outbound: "'3.출고 현황'!A1:Z500",
} as const

const s = (v: unknown) => { if (v == null) return null; const t = String(v).trim(); return t.length ? t : null }
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null }
const date = (v: unknown) => { const t = s(v); if (!t) return null; const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}` : null }
const arr = (v: unknown): string[] => { const t = s(v); return t ? t.split(/[,;\s]+/).filter(Boolean) : [] }

export interface HwInboundParsed { logistics_no: string|null; inbound_date: string|null; product: string; quantity: number; unit_price: number|null; amount: number|null; serials: string[]; storage: string|null; importer: string|null; remarks: string|null; raw: unknown }
export interface HwOutboundParsed { logistics_no: string|null; outbound_date: string|null; owner: string|null; product: string; quantity: number; revenue: number|null; destination: string|null; serials: string[]; progress: string|null; type: string|null; remarks: string|null; raw: unknown }
export interface HwStockParsed { product: string; category: string|null; quantity: number; raw: unknown }
export interface HwSalesMonthlyParsed { fiscal_year: number; fiscal_month: number; product: string; quantity: number; raw: unknown }

export function parseInbound(grid: FormattedCell[][]): HwInboundParsed[] {
  const out: HwInboundParsed[] = []
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const product = s(row[2]?.value); if (!product) continue
    out.push({
      logistics_no: s(row[0]?.value), inbound_date: date(row[1]?.value),
      product, quantity: n(row[3]?.value) ?? 0,
      unit_price: n(row[4]?.value), amount: n(row[5]?.value),
      serials: arr(row[6]?.value), storage: s(row[7]?.value),
      importer: s(row[8]?.value), remarks: s(row[9]?.value),
      raw: row.map((c) => c?.value ?? null),
    })
  }
  return out
}

export function parseOutbound(grid: FormattedCell[][]): HwOutboundParsed[] {
  const out: HwOutboundParsed[] = []
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const product = s(row[3]?.value); if (!product) continue
    out.push({
      logistics_no: s(row[0]?.value), outbound_date: date(row[1]?.value),
      owner: s(row[2]?.value), product, quantity: n(row[4]?.value) ?? 0,
      revenue: n(row[5]?.value), destination: s(row[6]?.value),
      serials: arr(row[7]?.value), progress: s(row[8]?.value),
      type: s(row[9]?.value), remarks: s(row[10]?.value),
      raw: row.map((c) => c?.value ?? null),
    })
  }
  return out
}

export function parseStock(grid: FormattedCell[][]): HwStockParsed[] {
  const out: HwStockParsed[] = []
  let inSection = false
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? []
    const first = String(row[0]?.value ?? "").trim()
    if (!inSection) { if (first.includes("재고 현황") || first.includes("재고현황")) inSection = true; continue }
    const product = s(row[0]?.value); if (!product) continue
    if (product.includes("재고") && product.includes("현황")) continue
    out.push({ product, category: s(row[1]?.value), quantity: n(row[2]?.value) ?? 0, raw: row.map((c) => c?.value ?? null) })
  }
  return out
}

export function parseSalesMonthly(grid: FormattedCell[][], refFy: number): HwSalesMonthlyParsed[] {
  if (grid.length === 0) return []
  const header = grid[0] ?? []
  // header[0] = product label, header[1..12] = FY 4월~3월
  const out: HwSalesMonthlyParsed[] = []
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const product = s(row[0]?.value); if (!product) continue
    for (let c = 1; c < Math.min(13, row.length); c++) {
      const month = FISCAL_MONTH_ORDER[c - 1]
      const fy = month >= 4 ? refFy : refFy + 1
      const qty = n(row[c]?.value) ?? 0
      out.push({ fiscal_year: refFy, fiscal_month: month, product, quantity: qty, raw: { value: row[c]?.value } })
    }
  }
  return out
}
```

- [ ] **Step 2: Test (one per sub-parser)**

```ts
// tests/branch/parsers/hw.test.ts
import { describe, it, expect } from "vitest"
import { parseInbound, parseOutbound, parseStock, parseSalesMonthly } from "@/lib/branch/parsers/hw"

describe("hw parsers", () => {
  it("inbound", () => {
    const grid: any[][] = [Array(10).fill({ value: "" }), [
      { value: "L001" }, { value: "2026-04-10" }, { value: "86\" IFP" },
      { value: 10 }, { value: 800000 }, { value: 8000000 },
      { value: "S1,S2" }, { value: "창고A" }, { value: "수입자K" }, { value: "" }
    ]]
    const out = parseInbound(grid as never)
    expect(out[0].product).toBe('86" IFP')
    expect(out[0].quantity).toBe(10)
    expect(out[0].serials).toEqual(["S1", "S2"])
  })
  it("stock skips header band", () => {
    const grid: any[][] = [
      [{ value: "메모" }, { value: "" }, { value: "" }],
      [{ value: "재고 현황" }, { value: "" }, { value: "" }],
      [{ value: "86\" IFP" }, { value: "IFP" }, { value: 4 }]
    ]
    expect(parseStock(grid as never)[0]).toMatchObject({ product: '86" IFP', quantity: 4 })
  })
  it("salesMonthly maps FY months", () => {
    const grid: any[][] = [
      Array(13).fill({ value: "" }),
      [{ value: "86\" IFP" }, ...Array(12).fill({ value: 1 })],
    ]
    const out = parseSalesMonthly(grid as never, 2026)
    expect(out).toHaveLength(12)
    expect(out[0]).toMatchObject({ fiscal_year: 2026, fiscal_month: 4, product: '86" IFP', quantity: 1 })
    expect(out[11]).toMatchObject({ fiscal_year: 2026, fiscal_month: 3 })
  })
})
```

- [ ] **Step 3: Run, commit**

Run: `npx vitest run tests/branch/parsers/hw.test.ts` → PASS.

```bash
git add lib/branch/parsers/hw.ts tests/branch/parsers/hw.test.ts
git commit -m "feat(branch): HW parsers (inbound/outbound/stock/sales)"
```

---

## Phase 3 — Computations (M2)

### Task 11: Heatmap (REV-only)

**Files:**
- Create: `lib/branch/computations/heatmap.ts`
- Test: `tests/branch/computations/heatmap.test.ts`

- [ ] **Step 1: Implement**

```ts
// lib/branch/computations/heatmap.ts
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { fyOf, fiscalQuarter, ymKey } from "@/lib/branch/fiscal"

export type Period = "M" | "Q" | "Y"
export interface RegionRow {
  region: string; target: number; revenue: number
  progress: number; status: "good" | "warning" | "critical"; velocity: number
}

function statusOf(p: number): "good"|"warning"|"critical" {
  if (p >= 95) return "good"; if (p >= 75) return "warning"; return "critical"
}

function inScope(ym: string, scope: Period, now: Date): boolean {
  const fy = fyOf(now); const m = Number(ym.slice(5, 7)); const y = Number(ym.slice(0, 4))
  const fyOfYm = m >= 4 ? y : y - 1
  if (fyOfYm !== fy) return false
  if (scope === "Y") return true
  if (scope === "M") return ym === ymKey(now)
  // Q
  return fiscalQuarter(m) === fiscalQuarter(now.getUTCMonth() + 1)
}

export function computeHeatmap(deals: BranchRevDeal[], scope: Period, now: Date, teamFilter?: string): RegionRow[] {
  const filtered = teamFilter && teamFilter !== "ALL" ? deals.filter((d) => d.team === teamFilter) : deals
  const targets = new Map<string, number>()
  const revenues = new Map<string, number>()
  for (const d of filtered) {
    const region = d.region ?? "미정"
    targets.set(region, (targets.get(region) ?? 0) + Number(d.contract_target ?? 0))
    if (!d.first_payment) continue
    let rev = 0
    for (const [ym, amt] of Object.entries(d.monthly_payments)) {
      if (!d.monthly_red[ym]) continue
      if (!inScope(ym, scope, now)) continue
      rev += Number(amt)
    }
    if (rev) revenues.set(region, (revenues.get(region) ?? 0) + rev)
  }
  const rows: RegionRow[] = []
  for (const [region, target] of targets) {
    const revenue = revenues.get(region) ?? 0
    const progress = target > 0 ? (revenue / target) * 100 : 0
    rows.push({ region, target, revenue, progress, status: statusOf(progress), velocity: 0 })
  }
  // velocity: revenueQ / target ÷ (분기 진행률) — Q 모드에서만 의미. 단순화: progress / quarterPct
  if (scope === "Q") {
    const monthIdx = now.getUTCMonth() + 1
    const qStartMonth = (Math.floor((monthIdx - 1 - 3 + 12) % 12 / 3)) * 3 + 4 // 회계연도 분기 시작월
    const dayInQ = Math.max(1, (now.getUTCMonth() + 1 - qStartMonth) * 30 + now.getUTCDate())
    const qPct = Math.min(100, (dayInQ / 90) * 100)
    rows.forEach((r) => { r.velocity = qPct > 0 ? r.progress / qPct : 0 })
  }
  return rows.sort((a, b) => b.target - a.target)
}
```

- [ ] **Step 2: Test**

```ts
// tests/branch/computations/heatmap.test.ts
import { describe, it, expect } from "vitest"
import { computeHeatmap } from "@/lib/branch/computations/heatmap"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mk = (over: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD",
  manager: "Han", deal_type: "Direct", status: "New", first_payment: null,
  product_version: null, region: "서울", importance: "A", note: null,
  contract_target: 0, monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "",
  ...over,
})

describe("computeHeatmap", () => {
  const now = new Date("2026-05-15T00:00:00Z")
  it("target = sum of M (incl. firstPayment-less deals)", () => {
    const out = computeHeatmap([
      mk({ region: "서울", contract_target: 1000 }),
      mk({ region: "서울", contract_target: 500, first_payment: "2026-04-01", monthly_payments: { "2026-04": 200 }, monthly_red: { "2026-04": true } }),
    ], "Y", now)
    expect(out[0].target).toBe(1500)
    expect(out[0].revenue).toBe(200)
  })
  it("status thresholds", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01", monthly_payments: { "2026-04": 950 }, monthly_red: { "2026-04": true } }),
      mk({ region: "B", contract_target: 1000, first_payment: "2026-04-01", monthly_payments: { "2026-04": 800 }, monthly_red: { "2026-04": true } }),
      mk({ region: "C", contract_target: 1000, first_payment: "2026-04-01", monthly_payments: { "2026-04": 500 }, monthly_red: { "2026-04": true } }),
    ], "Y", now)
    const map = Object.fromEntries(out.map((r) => [r.region, r.status]))
    expect(map.A).toBe("good"); expect(map.B).toBe("warning"); expect(map.C).toBe("critical")
  })
  it("ignores cells without red flag", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01",
          monthly_payments: { "2026-04": 800 }, monthly_red: {} }),
    ], "Y", now)
    expect(out[0].revenue).toBe(0)
  })
})
```

- [ ] **Step 3: Run, commit**

Run: `npx vitest run tests/branch/computations/heatmap.test.ts` → PASS.

```bash
git add lib/branch/computations/heatmap.ts tests/branch/computations/heatmap.test.ts
git commit -m "feat(branch): heatmap computation (REV-only, M/Q/Y)"
```

---

### Task 12: Pacing (DSH-driven)

**Files:**
- Create: `lib/branch/computations/pacing.ts`
- Test: `tests/branch/computations/pacing.test.ts`

- [ ] **Step 1: Implement**

```ts
// lib/branch/computations/pacing.ts
import type { DshOutput, DshRow } from "@/lib/branch/parsers/dsh"
import { fiscalQuarter, ymKey } from "@/lib/branch/fiscal"
import type { Period } from "./heatmap"

export interface PacingValue { goal: number; status: number; pacing_pct: number }

function pickValue(row: DshRow, scope: Period, now: Date): number {
  if (scope === "Y") return row.annual
  if (scope === "Q") return row.quarters[fiscalQuarter(now.getUTCMonth() + 1) - 1]
  return row.months[ymKey(now)] ?? 0
}

export function teamPacing(dsh: DshOutput, team: string, scope: Period, now: Date): PacingValue {
  const goal = dsh.rows.find((r) => r.level === "team" && r.team === team && r.kind === "goal")
  const status = dsh.rows.find((r) => r.level === "team" && r.team === team && r.kind === "status")
  const g = goal ? pickValue(goal, scope, now) : 0
  const s = status ? pickValue(status, scope, now) : 0
  return { goal: g, status: s, pacing_pct: g > 0 ? (s / g) * 100 : 0 }
}

export function memberPacing(dsh: DshOutput, member: string, scope: Period, now: Date): PacingValue & { team: string | null } {
  const team = dsh.members[member] ?? null
  const goal = dsh.rows.find((r) => r.level === "member" && r.member === member && r.kind === "goal")
  const status = dsh.rows.find((r) => r.level === "member" && r.member === member && r.kind === "status")
  const g = goal ? pickValue(goal, scope, now) : 0
  const s = status ? pickValue(status, scope, now) : 0
  return { team, goal: g, status: s, pacing_pct: g > 0 ? (s / g) * 100 : 0 }
}

export function listMembersByTeam(dsh: DshOutput, team: string | "ALL"): string[] {
  if (team === "ALL") return Object.keys(dsh.members)
  return Object.entries(dsh.members).filter(([, t]) => t === team).map(([m]) => m)
}
```

- [ ] **Step 2: Test**

```ts
// tests/branch/computations/pacing.test.ts
import { describe, it, expect } from "vitest"
import { teamPacing, memberPacing, listMembersByTeam } from "@/lib/branch/computations/pacing"

const dsh = {
  rows: [
    { level: "team", team: "BD", kind: "goal", annual: 100, quarters: [25,25,25,25], months: { "2026-04": 8 } },
    { level: "team", team: "BD", kind: "status", annual: 50, quarters: [50,0,0,0], months: { "2026-04": 12 } },
    { level: "member", team: "BD", member: "Han", kind: "goal", annual: 40, quarters: [10,10,10,10], months: { "2026-04": 3 } },
    { level: "member", team: "BD", member: "Han", kind: "status", annual: 25, quarters: [25,0,0,0], months: { "2026-04": 5 } },
  ],
  members: { Han: "BD" },
} as never

describe("pacing", () => {
  const now = new Date("2026-05-15T00:00:00Z")
  it("teamPacing yearly", () => { expect(teamPacing(dsh, "BD", "Y", now)).toEqual({ goal: 100, status: 50, pacing_pct: 50 }) })
  it("teamPacing quarter Q1", () => { expect(teamPacing(dsh, "BD", "Q", now)).toEqual({ goal: 25, status: 50, pacing_pct: 200 }) })
  it("memberPacing reports team", () => { expect(memberPacing(dsh, "Han", "Y", now).team).toBe("BD") })
  it("listMembersByTeam", () => { expect(listMembersByTeam(dsh, "BD")).toEqual(["Han"]) })
})
```

- [ ] **Step 3: Run, commit**

Run: `npx vitest run tests/branch/computations/pacing.test.ts` → PASS.

```bash
git add lib/branch/computations/pacing.ts tests/branch/computations/pacing.test.ts
git commit -m "feat(branch): pacing (team/member, M/Q/Y)"
```

---

### Task 13: Pipeline probability + value

**Files:**
- Create: `lib/branch/computations/pipeline.ts`
- Test: `tests/branch/computations/pipeline.test.ts`

- [ ] **Step 1: Implement**

```ts
// lib/branch/computations/pipeline.ts
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

export function dealProbability(d: BranchRevDeal): number {
  if (d.first_payment) return 1.0
  if (/Negotiation/i.test(d.note ?? "")) return 0.7
  if (/Proposal/i.test(d.note ?? "")) return 0.5
  let base = d.status === "Renew" ? 0.4 : 0.2
  if (d.deal_type === "Channel") base *= 0.85
  if (d.importance === "KA") base += 0.1
  return Math.min(base, 0.6)
}

export function pipelineValue(d: BranchRevDeal): number {
  return Number(d.contract_target ?? 0) * dealProbability(d)
}

export type PipelineStage = "lead" | "proposal" | "negotiation" | "contract"
export function stageOf(d: BranchRevDeal): PipelineStage {
  if (d.first_payment) return "contract"
  if (/Negotiation/i.test(d.note ?? "")) return "negotiation"
  if (/Proposal/i.test(d.note ?? "")) return "proposal"
  return "lead"
}

export interface PipelineRow { id: string; customer: string; manager: string|null; team: string|null; region: string|null; importance: string|null; stage: PipelineStage; probability: number; target: number; confirmed_revenue: number; pipeline_value: number }

export function listPipeline(deals: BranchRevDeal[], filter?: { team?: string; manager?: string; region?: string; importance?: string; stage?: PipelineStage }): PipelineRow[] {
  return deals.filter((d) => {
    if (filter?.team && filter.team !== "ALL" && d.team !== filter.team) return false
    if (filter?.manager && d.manager !== filter.manager) return false
    if (filter?.region && d.region !== filter.region) return false
    if (filter?.importance && d.importance !== filter.importance) return false
    if (filter?.stage && stageOf(d) !== filter.stage) return false
    return true
  }).map((d) => {
    const confirmed = Object.entries(d.monthly_payments).reduce((s, [ym, v]) => s + (d.monthly_red[ym] ? Number(v) : 0), 0)
    return {
      id: d.id, customer: d.customer_name, manager: d.manager, team: d.team,
      region: d.region, importance: d.importance, stage: stageOf(d),
      probability: dealProbability(d), target: Number(d.contract_target ?? 0),
      confirmed_revenue: d.first_payment ? confirmed : 0,
      pipeline_value: pipelineValue(d),
    }
  })
}
```

- [ ] **Step 2: Test**

```ts
// tests/branch/computations/pipeline.test.ts
import { describe, it, expect } from "vitest"
import { dealProbability, pipelineValue, stageOf, listPipeline } from "@/lib/branch/computations/pipeline"

const mk = (over: any) => ({ id:"x", sheet_row:1, customer_name:"c", branch_contact:null, team:"BD", manager:"Han", deal_type:"Direct", status:"New", first_payment:null, product_version:null, region:"서울", importance:"A", note:null, contract_target:0, monthly_payments:{}, monthly_red:{}, raw:{}, synced_at:"", ...over })

describe("pipeline", () => {
  it("contract when firstPayment present", () => { const d = mk({ first_payment: "2026-04-10" }); expect(dealProbability(d)).toBe(1); expect(stageOf(d)).toBe("contract") })
  it("negotiation note", () => { const d = mk({ note: "Negotiation phase" }); expect(dealProbability(d)).toBe(0.7) })
  it("renew + KA cap 0.6", () => { const d = mk({ status: "Renew", importance: "KA" }); expect(dealProbability(d)).toBe(0.5) })
  it("channel reduces base", () => { const d = mk({ deal_type: "Channel" }); expect(dealProbability(d)).toBeCloseTo(0.17, 2) })
  it("pipelineValue multiplies target", () => { const d = mk({ contract_target: 1000, status: "Renew" }); expect(pipelineValue(d)).toBe(400) })
  it("listPipeline filters by team", () => {
    const rows = listPipeline([mk({ id:"a", team:"BD" }), mk({ id:"b", team:"MKT" })], { team: "BD" })
    expect(rows.map((r) => r.id)).toEqual(["a"])
  })
})
```

- [ ] **Step 3: Commit**

Run: `npx vitest run tests/branch/computations/pipeline.test.ts` → PASS.

```bash
git add lib/branch/computations/pipeline.ts tests/branch/computations/pipeline.test.ts
git commit -m "feat(branch): pipeline probability + filterable list"
```

---

### Task 14: Core KPI (5 cards summary)

**Files:**
- Create: `lib/branch/computations/core-kpi.ts`
- Test: `tests/branch/computations/core-kpi.test.ts`

- [ ] **Step 1: Implement**

```ts
// lib/branch/computations/core-kpi.ts
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { KpiRow, KpiMetric } from "@/lib/branch/parsers/kpi"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import { teamPacing } from "./pacing"
import { dealProbability } from "./pipeline"
import type { Period } from "./heatmap"

export interface CoreKpiSummary {
  revenue: { confirmed: number; goal: number; pacing_pct: number }
  bottleneck_kpi: { metric: KpiMetric | null; pct: number; worst_member: string | null }
  closing_deals: { count: number; total_target: number }
  events_30d: { count: number; regions: number }
  campaigns_30d: { count: number; avg_open_pct: number; conv_revenue: number }
}

export function summarizeRevenue(dsh: DshOutput, deals: BranchRevDeal[], team: string, scope: Period, now: Date): CoreKpiSummary["revenue"] {
  const pace = teamPacing(dsh, team === "ALL" ? "BD" : team, scope, now) // ALL = aggregate all teams
  if (team === "ALL") {
    let goal = 0, status = 0
    for (const t of ["BD","MKT","CSM"]) {
      const p = teamPacing(dsh, t, scope, now); goal += p.goal; status += p.status
    }
    return { confirmed: status, goal, pacing_pct: goal > 0 ? (status / goal) * 100 : 0 }
  }
  return { confirmed: pace.status, goal: pace.goal, pacing_pct: pace.pacing_pct }
}

export function bottleneckKpi(rows: KpiRow[], teamMembers: Set<string>): CoreKpiSummary["bottleneck_kpi"] {
  const filtered = teamMembers.size === 0 ? rows : rows.filter((r) => teamMembers.has(r.member))
  if (filtered.length === 0) return { metric: null, pct: 0, worst_member: null }
  const totals = { LD: 0, ACC: 0, OPP: 0, SOL: 0, VST: 0 } as Record<KpiMetric, number>
  const goals = { ...totals }
  for (const m of ["LD","ACC","OPP","SOL","VST"] as KpiMetric[]) {
    for (const r of filtered) { totals[m] += r.pairs[m].actual; goals[m] += r.pairs[m].goal }
  }
  let worstMetric: KpiMetric | null = null; let worstPct = Infinity
  for (const m of ["LD","ACC","OPP","SOL","VST"] as KpiMetric[]) {
    const pct = goals[m] > 0 ? (totals[m] / goals[m]) * 100 : 0
    if (pct < worstPct) { worstPct = pct; worstMetric = m }
  }
  if (!worstMetric) return { metric: null, pct: 0, worst_member: null }
  // worst member for that metric
  const worstMember = filtered
    .map((r) => ({ m: r.member, pct: r.pairs[worstMetric!].goal > 0 ? (r.pairs[worstMetric!].actual / r.pairs[worstMetric!].goal) * 100 : 0 }))
    .sort((a, b) => a.pct - b.pct)[0]?.m ?? null
  return { metric: worstMetric, pct: worstPct, worst_member: worstMember }
}

export function closingDeals(deals: BranchRevDeal[], now: Date): CoreKpiSummary["closing_deals"] {
  const deadline = new Date(now); deadline.setUTCDate(deadline.getUTCDate() + 30)
  const candidates = deals.filter((d) => {
    if (d.first_payment) {
      const fp = new Date(d.first_payment); return fp >= now && fp <= deadline
    }
    return dealProbability(d) >= 0.7
  })
  return { count: candidates.length, total_target: candidates.reduce((s, d) => s + Number(d.contract_target ?? 0), 0) }
}
```

- [ ] **Step 2: Test (basic shape only — heavy testing in integration)**

```ts
// tests/branch/computations/core-kpi.test.ts
import { describe, it, expect } from "vitest"
import { closingDeals, bottleneckKpi } from "@/lib/branch/computations/core-kpi"

const mk = (o: any) => ({ id:"x", sheet_row:1, customer_name:"c", branch_contact:null, team:"BD", manager:"Han", deal_type:"Direct", status:"New", first_payment:null, product_version:null, region:"서울", importance:"A", note:null, contract_target:0, monthly_payments:{}, monthly_red:{}, raw:{}, synced_at:"", ...o })

describe("core-kpi", () => {
  it("closing deals: firstPayment within 30d", () => {
    const now = new Date("2026-05-01T00:00:00Z")
    const out = closingDeals([
      mk({ first_payment: "2026-05-15", contract_target: 100 }),
      mk({ first_payment: "2026-08-01", contract_target: 200 }),
    ], now)
    expect(out.count).toBe(1); expect(out.total_target).toBe(100)
  })
  it("bottleneck picks lowest pct metric", () => {
    const rows: any = [{ member: "A", pairs: {
      LD: { goal: 10, actual: 5 }, ACC: { goal: 10, actual: 9 },
      OPP: { goal: 10, actual: 8 }, SOL: { goal: 10, actual: 7 }, VST: { goal: 10, actual: 6 },
    }}]
    const out = bottleneckKpi(rows, new Set())
    expect(out.metric).toBe("LD"); expect(out.pct).toBe(50)
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add lib/branch/computations/core-kpi.ts tests/branch/computations/core-kpi.test.ts
git commit -m "feat(branch): core KPI summary (revenue/bottleneck/closing)"
```

---

### Task 15: Data quality (12 + 1 checks)

**Files:**
- Create: `lib/branch/computations/data-quality.ts`
- Test: `tests/branch/computations/data-quality.test.ts`

- [ ] **Step 1: Implement (only most critical checks; rest as TODO comments inside code)**

```ts
// lib/branch/computations/data-quality.ts
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import type { KpiRow } from "@/lib/branch/parsers/kpi"
import type { SegRow } from "@/lib/branch/parsers/seg"
import type { HwInbound, HwOutbound, HwStock } from "@/lib/repositories/branch-hw"

export type Severity = "info" | "warn" | "error"
export interface DqIssue { id: string; severity: Severity; message: string; samples?: unknown[] }

export interface DqInputs {
  deals: BranchRevDeal[]; dsh: DshOutput; kpi: KpiRow[]; seg: SegRow[]
  hwInbound: HwInbound[]; hwOutbound: HwOutbound[]; hwStock: HwStock[]
}

const HW_PRODUCT_PATTERNS = [/86["”]?\s*IFP/i, /75["”]?\s*IFP/i, /T1\s*카메라|카메라\s*T1/i, /S1\s*카메라|카메라\s*S1/i, /\bOPS\b/i]

export function runDataQuality(inp: DqInputs): DqIssue[] {
  const issues: DqIssue[] = []

  // 2. firstPayment 있는데 monthly 합 0
  const ghost = inp.deals.filter((d) => d.first_payment && Object.values(d.monthly_payments).every((v) => !v))
  if (ghost.length) issues.push({ id: "DQ-2", severity: "warn", message: `firstPayment 있는데 월별 납부 0인 딜 ${ghost.length}건`, samples: ghost.slice(0, 5).map((d) => d.customer_name) })

  // 3. manager casing
  const seen = new Map<string, Set<string>>()
  for (const d of inp.deals) { const m = (d.manager ?? "").trim(); if (!m) continue; const k = m.toLowerCase(); seen.has(k) || seen.set(k, new Set()); seen.get(k)!.add(m) }
  for (const [, variants] of seen) { if (variants.size > 1) issues.push({ id: "DQ-3", severity: "warn", message: "매니저 표기 불일치", samples: [...variants] }) }

  // 4. month header normalization fail (deals 0 인데 시트 행은 있을 때)
  if (inp.deals.length > 0 && inp.deals.every((d) => Object.keys(d.monthly_payments).length === 0)) {
    issues.push({ id: "DQ-4", severity: "error", message: "REV 월 헤더가 정규화되지 않았을 가능성" })
  }

  // 7. DSH team rows missing
  const teams = new Set(inp.dsh.rows.filter((r) => r.level === "team").map((r) => r.team))
  for (const t of ["BD","MKT","CSM"]) if (!teams.has(t)) issues.push({ id: "DQ-7", severity: "error", message: `DSH 에 ${t} 팀 행 없음` })

  // 9. HW product not matching catalog
  const allHw = [...inp.hwInbound, ...inp.hwOutbound]
  const unknown = allHw.filter((row) => !HW_PRODUCT_PATTERNS.some((p) => p.test(row.product))).map((r) => r.product)
  if (unknown.length) issues.push({ id: "DQ-9", severity: "warn", message: "HW 입출고 제품명 카탈로그 불일치", samples: [...new Set(unknown)].slice(0, 8) })

  // 10. red-cell extraction failed (firstPayment 있는데 monthly_red 다 비어있음)
  const noRed = inp.deals.filter((d) => d.first_payment && Object.values(d.monthly_payments).some((v) => v) && Object.keys(d.monthly_red).length === 0)
  if (noRed.length) issues.push({ id: "DQ-10", severity: "error", message: "빨간 셀 추출 실패 의심 (formatRuns 비어 있음)", samples: noRed.slice(0,5).map((d) => d.customer_name) })

  // 11. SEG status === goal 인 지역
  const segIdent = inp.seg.filter((s) => s.goal > 0 && s.goal === s.status).map((s) => s.region)
  if (segIdent.length) issues.push({ id: "DQ-11", severity: "info", message: "SEG 의 status==goal 지역 (히트맵 미사용 사유)", samples: segIdent })

  // 13. KPI member without DSH team mapping
  const unmapped = inp.kpi.map((r) => r.member).filter((m) => !inp.dsh.members[m])
  if (unmapped.length) issues.push({ id: "DQ-13", severity: "warn", message: "KPI 멤버 중 DSH 팀 매핑 누락", samples: unmapped })

  return issues
}
```

- [ ] **Step 2: Smoke test**

```ts
// tests/branch/computations/data-quality.test.ts
import { describe, it, expect } from "vitest"
import { runDataQuality } from "@/lib/branch/computations/data-quality"

describe("runDataQuality", () => {
  it("flags missing DSH team", () => {
    const out = runDataQuality({
      deals: [], dsh: { rows: [], members: {} } as never,
      kpi: [], seg: [], hwInbound: [], hwOutbound: [], hwStock: [],
    })
    expect(out.find((i) => i.id === "DQ-7")).toBeTruthy()
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add lib/branch/computations/data-quality.ts tests/branch/computations/data-quality.test.ts
git commit -m "feat(branch): data quality checks (12+1)"
```

---

### Task 16: Campaigns aggregation

**Files:**
- Create: `lib/branch/computations/campaigns.ts`

- [ ] **Step 1: Implement**

```ts
// lib/branch/computations/campaigns.ts
import { getAllCampaigns } from "@/lib/repositories/marketing"

export interface CampaignSummary {
  recent: Array<{ id: string|number; subject: string; sentAt: string|undefined; recipientCount: number; openCount: number; openPct: number }>
  count_30d: number
  avg_open_pct: number
}

export async function summarizeCampaigns(now: Date): Promise<CampaignSummary> {
  const all = await getAllCampaigns()
  const cutoff = new Date(now); cutoff.setUTCDate(cutoff.getUTCDate() - 30)
  const recent = all
    .filter((c) => c.sentAt && new Date(c.sentAt) >= cutoff)
    .map((c) => {
      const recipients = Number((c as { recipientCount?: number }).recipientCount ?? 0)
      const opens = Number(c.openCount ?? 0)
      const openPct = recipients > 0 ? (opens / recipients) * 100 : 0
      return { id: c.id, subject: c.subject, sentAt: c.sentAt, recipientCount: recipients, openCount: opens, openPct }
    })
  const avg = recent.length ? recent.reduce((s, r) => s + r.openPct, 0) / recent.length : 0
  return { recent, count_30d: recent.length, avg_open_pct: avg }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/branch/computations/campaigns.ts
git commit -m "feat(branch): campaign summary (last 30d open rate)"
```

---

## Phase 4 — Sync (M3)

### Task 17: REV sync

**Files:**
- Create: `lib/branch/sync/sync-rev.ts`

- [ ] **Step 1: Implement**

```ts
// lib/branch/sync/sync-rev.ts
import "server-only"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseRev, REV_RANGE } from "@/lib/branch/parsers/rev"
import { replaceBranchRevDeals } from "@/lib/repositories/branch-deals"
import { fyOf } from "@/lib/branch/fiscal"

export async function syncRev(): Promise<{ rows: number }> {
  const sheetId = envSheetId("dashboard")
  const grid = await readRangeWithFormat(sheetId, REV_RANGE)
  const refFy = fyOf(new Date())
  const parsed = parseRev(grid, { refFy })
  const rows = parsed.map((p) => ({
    sheet_row: p.sheet_row, customer_name: p.customer_name, branch_contact: p.branch_contact,
    team: p.team, manager: p.manager, deal_type: p.deal_type, status: p.status,
    first_payment: p.first_payment, product_version: p.product_version, region: p.region,
    importance: p.importance, note: p.note,
    contract_target: p.contract_target == null ? "" : String(p.contract_target),
    monthly_payments: p.monthly_payments, monthly_red: p.monthly_red, raw: p.raw,
  }))
  const n = await replaceBranchRevDeals(rows)
  return { rows: n }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/branch/sync/sync-rev.ts
git commit -m "feat(branch): sync REV via replace function"
```

---

### Task 18: HW sync

**Files:**
- Create: `lib/branch/sync/sync-hw.ts`

- [ ] **Step 1: Implement**

```ts
// lib/branch/sync/sync-hw.ts
import "server-only"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { HW_RANGES, parseInbound, parseOutbound, parseStock, parseSalesMonthly } from "@/lib/branch/parsers/hw"
import { replaceHwInbound, replaceHwOutbound, replaceHwStock, replaceHwSalesMonthly } from "@/lib/repositories/branch-hw"
import { fyOf } from "@/lib/branch/fiscal"

export async function syncHw(): Promise<{ inbound: number; outbound: number; stock: number; sales: number }> {
  const sheetId = envSheetId("hardware")
  const refFy = fyOf(new Date())
  const [inboundGrid, outboundGrid, stockGrid, salesGrid] = await Promise.all([
    readRangeWithFormat(sheetId, HW_RANGES.inbound),
    readRangeWithFormat(sheetId, HW_RANGES.outbound),
    readRangeWithFormat(sheetId, HW_RANGES.stock),
    readRangeWithFormat(sheetId, HW_RANGES.sales),
  ])
  const inbound = parseInbound(inboundGrid).map((p) => ({
    ...p,
    quantity: String(p.quantity),
    unit_price: p.unit_price == null ? "" : String(p.unit_price),
    amount: p.amount == null ? "" : String(p.amount),
  }))
  const outbound = parseOutbound(outboundGrid).map((p) => ({
    ...p, quantity: String(p.quantity),
    revenue: p.revenue == null ? "" : String(p.revenue),
  }))
  const stock = parseStock(stockGrid).map((p) => ({ ...p, quantity: String(p.quantity) }))
  const sales = parseSalesMonthly(salesGrid, refFy).map((p) => ({ ...p, quantity: String(p.quantity), fiscal_year: String(p.fiscal_year), fiscal_month: String(p.fiscal_month) }))
  const [iN, oN, sN, mN] = await Promise.all([
    replaceHwInbound(inbound), replaceHwOutbound(outbound),
    replaceHwStock(stock), replaceHwSalesMonthly(sales),
  ])
  return { inbound: iN, outbound: oN, stock: sN, sales: mN }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/branch/sync/sync-hw.ts
git commit -m "feat(branch): sync HW (inbound/outbound/stock/sales)"
```

---

### Task 19: Run-all orchestrator

**Files:**
- Create: `lib/branch/sync/run-all.ts`

- [ ] **Step 1: Implement**

```ts
// lib/branch/sync/run-all.ts
import "server-only"
import { startSyncRun, finishSyncRun, isAnyRunning, type SyncTrigger } from "@/lib/repositories/branch-sync"
import { syncRev } from "./sync-rev"
import { syncHw } from "./sync-hw"

export interface RunAllResult { ok: boolean; rev?: number; hw?: { inbound:number; outbound:number; stock:number; sales:number }; error?: string; skipped?: boolean }

export async function runAll(opts: { trigger: SyncTrigger; sources?: Array<"rev"|"hw"> }): Promise<RunAllResult> {
  if (await isAnyRunning()) return { ok: false, skipped: true }
  const sources = opts.sources ?? ["rev", "hw"]
  const id = await startSyncRun("all", opts.trigger)
  try {
    let revRows = 0; let hw: any = undefined
    if (sources.includes("rev")) { const r = await syncRev(); revRows = r.rows }
    if (sources.includes("hw"))  { hw = await syncHw() }
    await finishSyncRun(id, { status: "success", rows_affected: revRows + (hw ? hw.inbound + hw.outbound + hw.stock + hw.sales : 0) })
    return { ok: true, rev: revRows, hw }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await finishSyncRun(id, { status: "failed", error: msg })
    return { ok: false, error: msg }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/branch/sync/run-all.ts
git commit -m "feat(branch): runAll orchestrator with concurrent guard"
```

---

### Task 20: Manual sync API + cron route

**Files:**
- Create: `app/api/admin/branch/sync/route.ts`
- Create: `app/api/cron/sync-branch/route.ts`

- [ ] **Step 1: Manual sync route**

```ts
// app/api/admin/branch/sync/route.ts
import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { verifyAdmin } from "@/lib/admin-auth"
import { runAll } from "@/lib/branch/sync/run-all"

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const result = await runAll({ trigger: "manual" })
  for (const tag of ["branch-dsh", "branch-seg", "branch-kpi"]) revalidateTag(tag)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
```

- [ ] **Step 2: Cron route**

```ts
// app/api/cron/sync-branch/route.ts
import { NextRequest, NextResponse } from "next/server"
import { runAll } from "@/lib/branch/sync/run-all"

function unauthorized() { return NextResponse.json({ error: "unauthorized" }, { status: 401 }) }

export async function GET(req: NextRequest) {
  const expected = process.env.BRANCH_DASHBOARD_CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) return unauthorized()
  const result = await runAll({ trigger: "cron" })
  return NextResponse.json(result)
}
```

- [ ] **Step 3: Add to vercel.json**

```diff
 {
   "crons": [
     { "path": "/api/cron/automation", "schedule": "0 9 * * *" },
+    { "path": "/api/cron/sync-branch", "schedule": "0 */4 * * *" }
   ]
 }
```

(Insights cron added in Phase 9.)

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/branch/sync/route.ts app/api/cron/sync-branch/route.ts vercel.json
git commit -m "feat(branch): manual + cron sync routes"
```

---

### Task 21: First sync run + verification

**Files:** none (operational task)

- [ ] **Step 1: Run dev server**

Run: `npm run dev`

- [ ] **Step 2: Trigger manual sync**

In another terminal:
```bash
curl -X POST http://localhost:3000/api/admin/branch/sync \
  -H "Authorization: Bearer $(node -e 'console.log(require(\"./.env.local\"))')"  # adjust to project's admin auth pattern
```
Or use the project's existing admin login flow (see another admin API call for pattern).

- [ ] **Step 3: Inspect results**

In Supabase dashboard:
- `select count(*) from branch_rev_deals` — should be > 0 (typically 50+).
- `select * from branch_sync_runs order by started_at desc limit 3` — top row `status='success'`.
- Spot-check one row of `branch_rev_deals`: `monthly_red` should have at least some `true` keys (if not, red-cell threshold needs tuning per spec §17.2).

- [ ] **Step 4: Save raw sample for fixture refinement**

If first sync reveals parser issues (DSH headers, red-cell threshold, month-header format, KPI column shift), capture sample rows and refine parsers. Update fixtures.

- [ ] **Step 5: Commit any parser fixes**

```bash
git add lib/branch/parsers/*.ts tests/branch/
git commit -m "fix(branch): parser tuning after first sync"
```

---

## Phase 5 — Page skeleton + Sections 1-3 (M4)

### Task 22: Replace existing /admin/branch

**Files:**
- Delete: existing `app/admin/branch/page.tsx`
- Create: `app/admin/branch/loading.tsx`
- Create: new `app/admin/branch/page.tsx`

- [ ] **Step 1: Delete old**

```bash
git rm app/admin/branch/page.tsx
```

- [ ] **Step 2: Loading skeleton**

```tsx
// app/admin/branch/loading.tsx
export default function Loading() {
  return (
    <div className="px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
      <div className="animate-pulse space-y-6">
        <div className="h-12 rounded-2xl bg-[#f0f0ec]" />
        <div className="h-32 rounded-2xl bg-[#f0f0ec]" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-[#f0f0ec]" />)}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: New server page (data fetched in API routes; page just renders client shell)**

```tsx
// app/admin/branch/page.tsx
import BranchDashboardClient from "@/components/admin/branch/BranchDashboardClient"

export const dynamic = "force-dynamic"

export default async function BranchDashboardPage() {
  return <BranchDashboardClient />
}
```

- [ ] **Step 4: Commit**

```bash
git add app/admin/branch/page.tsx app/admin/branch/loading.tsx
git commit -m "feat(branch): replace lead-by-branch page with dashboard shell"
```

---

### Task 23: Dashboard client + global toggles

**Files:**
- Create: `components/admin/branch/BranchDashboardClient.tsx`
- Create: `components/admin/branch/SyncStatusBar.tsx`

- [ ] **Step 1: SyncStatusBar**

```tsx
// components/admin/branch/SyncStatusBar.tsx
"use client"
import { useState } from "react"
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react"

interface SyncStatusBarProps { lastSync: string | null; lastError: string | null; onRefresh: () => Promise<void> }

export default function SyncStatusBar({ lastSync, lastError, onRefresh }: SyncStatusBarProps) {
  const [busy, setBusy] = useState(false)
  return (
    <div className={`sticky top-0 z-30 border-b ${lastError ? "border-rose-200 bg-rose-50" : "border-[#e8e8e4] bg-white"} px-4 py-3 text-[12px]`}>
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {lastError ? <AlertTriangle className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <span className="text-[#1a1a1a]/70">{lastError ?? `마지막 동기화: ${lastSync ? new Date(lastSync).toLocaleString("ko-KR") : "없음"}`}</span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onRefresh() } finally { setBusy(false) } }}
          className="inline-flex items-center gap-1 rounded-full bg-[#111110] px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "동기화 중..." : "지금 새로고침"}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: BranchDashboardClient with team/period state**

```tsx
// components/admin/branch/BranchDashboardClient.tsx
"use client"
import { useEffect, useState, useCallback } from "react"
import SyncStatusBar from "./SyncStatusBar"
import CoreKpiGrid from "./sections/CoreKpiGrid"
import RegionHeatmap from "./sections/RegionHeatmap"

export type Team = "ALL" | "BD" | "MKT" | "CSM"
export type Period = "M" | "Q" | "Y"
const TEAMS: Team[] = ["ALL", "BD", "MKT", "CSM"]
const PERIODS: Period[] = ["M", "Q", "Y"]

function getToken() { return typeof window !== "undefined" ? sessionStorage.getItem("admin_password") ?? "" : "" }
async function adminFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json", ...init?.headers } })
  return res
}

export default function BranchDashboardClient() {
  const [team, setTeam] = useState<Team>("ALL")
  const [period, setPeriod] = useState<Period>("Q")
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refreshSummary = useCallback(async () => {
    const res = await adminFetch(`/api/admin/branch/summary?team=${team}&period=${period}`)
    if (!res.ok) { setLastError(await res.text()); return }
    const data = await res.json()
    setLastSync(data.lastSync ?? null)
    setLastError(data.lastError ?? null)
  }, [team, period])

  useEffect(() => { refreshSummary() }, [refreshSummary, refreshKey])

  const onRefresh = useCallback(async () => {
    const res = await adminFetch("/api/admin/branch/sync", { method: "POST" })
    if (!res.ok) setLastError(`동기화 실패: ${res.status}`)
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div className="px-4 pb-24 sm:px-6 lg:px-8">
      <SyncStatusBar lastSync={lastSync} lastError={lastError} onRefresh={onRefresh} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-[#e8e8e4] bg-white p-1">
          {TEAMS.map((t) => (
            <button key={t} type="button" onClick={() => setTeam(t)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${team === t ? "bg-[#111110] text-white" : "text-[#1a1a1a]/60"}`}>
              {t === "ALL" ? "전체" : t}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full border border-[#e8e8e4] bg-white p-1">
          {PERIODS.map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${period === p ? "bg-[#111110] text-white" : "text-[#1a1a1a]/60"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-10">
        <CoreKpiGrid team={team} period={period} refreshKey={refreshKey} />
        <RegionHeatmap team={team} period={period} refreshKey={refreshKey} />
        {/* further sections added in subsequent tasks */}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/branch/
git commit -m "feat(branch): dashboard client shell with team/period toggles"
```

---

### Task 24: Summary API + CoreKpiGrid

**Files:**
- Create: `app/api/admin/branch/summary/route.ts`
- Create: `components/admin/branch/sections/CoreKpiGrid.tsx`

- [ ] **Step 1: Summary API**

```ts
// app/api/admin/branch/summary/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseKpi, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { fyOf } from "@/lib/branch/fiscal"
import { summarizeRevenue, bottleneckKpi, closingDeals } from "@/lib/branch/computations/core-kpi"
import { listMembersByTeam } from "@/lib/branch/computations/pacing"
import { summarizeCampaigns } from "@/lib/branch/computations/campaigns"
import { getRecentSyncRuns } from "@/lib/repositories/branch-sync"
import { listPublicEvents } from "@/lib/repositories/public-events"

const readDsh = unstable_cache(async () => {
  const id = envSheetId("dashboard")
  const grid = await readRangeWithFormat(id, DSH_RANGE)
  return parseDsh(grid, fyOf(new Date()))
}, ["branch-dsh"], { revalidate: 60, tags: ["branch-dsh"] })

const readKpi = unstable_cache(async () => {
  const id = envSheetId("dashboard")
  const grid = await readRangeWithFormat(id, KPI_RANGE)
  return parseKpi(grid)
}, ["branch-kpi"], { revalidate: 60, tags: ["branch-kpi"] })

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = (url.searchParams.get("team") ?? "ALL") as "ALL"|"BD"|"MKT"|"CSM"
  const period = (url.searchParams.get("period") ?? "Q") as "M"|"Q"|"Y"
  const now = new Date()
  try {
    const [dsh, kpi, deals, campaigns, runs, events] = await Promise.all([
      readDsh(), readKpi(), listBranchRevDeals(), summarizeCampaigns(now), getRecentSyncRuns(3), listPublicEvents(),
    ])
    const filteredDeals = team === "ALL" ? deals : deals.filter((d) => d.team === team)
    const teamMembers = new Set(listMembersByTeam(dsh, team))
    const revenue = summarizeRevenue(dsh, filteredDeals, team, period, now)
    const bottle = bottleneckKpi(kpi, teamMembers)
    const closing = closingDeals(filteredDeals, now)
    const events30 = events.filter((e) => {
      const t = new Date(e.startsAt).getTime()
      return t >= now.getTime() && t <= now.getTime() + 30*86400_000
    })
    const lastRun = runs[0]
    return NextResponse.json({
      team, period,
      revenue, bottleneck: bottle, closing,
      events_30d: { count: events30.length, regions: new Set(events30.map((e) => e.location ?? "")).size },
      campaigns_30d: { count: campaigns.count_30d, avg_open_pct: campaigns.avg_open_pct },
      lastSync: lastRun?.finished_at ?? lastRun?.started_at ?? null,
      lastError: lastRun?.status === "failed" ? lastRun.error ?? "동기화 실패" : null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: CoreKpiGrid component**

```tsx
// components/admin/branch/sections/CoreKpiGrid.tsx
"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"

interface SummaryResponse {
  revenue: { confirmed: number; goal: number; pacing_pct: number }
  bottleneck: { metric: string|null; pct: number; worst_member: string|null }
  closing: { count: number; total_target: number }
  events_30d: { count: number; regions: number }
  campaigns_30d: { count: number; avg_open_pct: number }
}

function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

export default function CoreKpiGrid({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    adminFetch(`/api/admin/branch/summary?team=${team}&period=${period}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d) })
      .catch((e) => setError(String(e)))
  }, [team, period, refreshKey])
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
  if (!data) return <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{Array.from({length:5}).map((_,i)=><div key={i} className="h-28 animate-pulse rounded-2xl bg-[#f0f0ec]"/>)}</div>
  const cards = [
    { label: "매출", value: `₩${fmt(data.revenue.confirmed)}`, sub: `목표 ₩${fmt(data.revenue.goal)} · ${data.revenue.pacing_pct.toFixed(0)}%` },
    { label: "활동 KPI 병목", value: data.bottleneck.metric ?? "-", sub: `${data.bottleneck.pct.toFixed(0)}% · ${data.bottleneck.worst_member ?? "-"}` },
    { label: "가까운 딜", value: `${data.closing.count}건`, sub: `목표 합 ₩${fmt(data.closing.total_target)}` },
    { label: "행사 (30일)", value: `${data.events_30d.count}건`, sub: `지역 ${data.events_30d.regions}개` },
    { label: "캠페인 성과", value: `${data.campaigns_30d.count}건`, sub: `평균 오픈율 ${data.campaigns_30d.avg_open_pct.toFixed(0)}%` },
  ]
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">핵심 지표</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/35">{c.label}</p>
            <p className="mt-2 text-[20px] font-bold tracking-[-0.02em] text-[#111110]">{c.value}</p>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/45">{c.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Verify in browser**

Run dev server, visit `/admin/branch`. Confirm 5 cards render with real data.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/branch/summary components/admin/branch/sections/CoreKpiGrid.tsx
git commit -m "feat(branch): summary API + 5 core KPI cards"
```

---

### Task 25: Heatmap API + RegionHeatmap

**Files:**
- Create: `app/api/admin/branch/heatmap/route.ts`
- Create: `components/admin/branch/sections/RegionHeatmap.tsx`

- [ ] **Step 1: API**

```ts
// app/api/admin/branch/heatmap/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { computeHeatmap } from "@/lib/branch/computations/heatmap"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = url.searchParams.get("team") ?? "ALL"
  const period = (url.searchParams.get("period") ?? "Q") as "M"|"Q"|"Y"
  try {
    const deals = await listBranchRevDeals()
    const rows = computeHeatmap(deals, period, new Date(), team)
    return NextResponse.json({ rows })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: Component**

```tsx
// components/admin/branch/sections/RegionHeatmap.tsx
"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"

interface Row { region: string; target: number; revenue: number; progress: number; status: "good"|"warning"|"critical"; velocity: number }
const COLOR = { good: "bg-emerald-50 text-emerald-700 border-emerald-200", warning: "bg-amber-50 text-amber-700 border-amber-200", critical: "bg-rose-50 text-rose-700 border-rose-200" } as const
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }
async function adminFetch(url: string) { const token = sessionStorage.getItem("admin_password") ?? ""; return fetch(url, { headers: { Authorization: `Bearer ${token}` } }) }

export default function RegionHeatmap({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    adminFetch(`/api/admin/branch/heatmap?team=${team}&period=${period}`)
      .then((r) => r.json()).then((d) => d.error ? setError(d.error) : setRows(d.rows)).catch((e) => setError(String(e)))
  }, [team, period, refreshKey])
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
  if (!rows) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-[13px] font-semibold text-[#111110]/70">지역 히트맵</h2>
        <p className="text-[11px] text-[#1a1a1a]/40">REV 기준 (SEG 미사용)</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {rows.map((r) => (
          <div key={r.region} className={`rounded-2xl border p-4 ${COLOR[r.status]}`}>
            <p className="text-[12px] font-medium">{r.region}</p>
            <p className="mt-1 text-[20px] font-bold">{r.progress.toFixed(0)}%</p>
            <p className="mt-1 text-[11px] opacity-70">매출 ₩{fmt(r.revenue)} / 목표 ₩{fmt(r.target)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/branch/heatmap components/admin/branch/sections/RegionHeatmap.tsx
git commit -m "feat(branch): region heatmap (M/Q/Y, REV-only)"
```

---

### Task 26: Fiscal roadmap (timeline)

**Files:**
- Create: `components/admin/branch/sections/FiscalRoadmap.tsx`
- Modify: `app/api/admin/branch/summary/route.ts` (extend with monthly series)

- [ ] **Step 1: Extend summary API to include monthly series**

```ts
// add to summary/route.ts response
// monthly_series: { months: ["2026-04",...], goal_cum: [...], revenue_cum: [...], events: [{date,title}], deals: [{date,customer,amount}], campaigns: [{date,name}] }
```

```ts
// computation snippet (add to summary/route.ts before NextResponse.json)
import { FISCAL_MONTH_ORDER, fyOf } from "@/lib/branch/fiscal"

const fy = fyOf(now)
const months: string[] = FISCAL_MONTH_ORDER.map((m) => `${m >= 4 ? fy : fy + 1}-${String(m).padStart(2,"0")}`)
const teamRow = team === "ALL" ? null : dsh.rows.find((r) => r.level === "team" && r.team === team && r.kind === "goal")
const aggregateGoal = (m: string) => team === "ALL"
  ? ["BD","MKT","CSM"].reduce((s, t) => { const g = dsh.rows.find((r) => r.level === "team" && r.team === t && r.kind === "goal"); return s + (g?.months[m] ?? 0) }, 0)
  : (teamRow?.months[m] ?? 0)
let goalCum = 0; const goal_cum = months.map((m) => { goalCum += aggregateGoal(m); return goalCum })
let revCum = 0; const revenue_cum = months.map((m) => {
  const sum = filteredDeals.reduce((s, d) => s + (d.first_payment && d.monthly_red[m] ? Number(d.monthly_payments[m] ?? 0) : 0), 0)
  revCum += sum; return revCum
})
const eventsTimeline = events.filter((e) => months.some((mm) => e.startsAt.startsWith(mm))).map((e) => ({ date: e.startsAt.slice(0,10), title: e.title }))
const dealsTimeline = filteredDeals.filter((d) => d.first_payment && months.some((mm) => d.first_payment!.startsWith(mm))).map((d) => ({ date: d.first_payment!, customer: d.customer_name, amount: Number(d.contract_target ?? 0) }))
const campaignsTimeline = campaigns.recent.filter((c) => c.sentAt && months.some((mm) => c.sentAt!.startsWith(mm))).map((c) => ({ date: c.sentAt!, name: c.subject }))
// add to response: monthly_series: { months, goal_cum, revenue_cum, events: eventsTimeline, deals: dealsTimeline, campaigns: campaignsTimeline }
```

- [ ] **Step 2: Roadmap component using Recharts**

```tsx
// components/admin/branch/sections/FiscalRoadmap.tsx
"use client"
import { useEffect, useState } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceDot } from "recharts"
import type { Team, Period } from "../BranchDashboardClient"

interface Series { months: string[]; goal_cum: number[]; revenue_cum: number[]; events: {date:string;title:string}[]; deals: {date:string;customer:string;amount:number}[]; campaigns: {date:string;name:string}[] }
async function adminFetch(url: string) { const token = sessionStorage.getItem("admin_password") ?? ""; return fetch(url, { headers: { Authorization: `Bearer ${token}` } }) }

export default function FiscalRoadmap({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [data, setData] = useState<Series | null>(null)
  useEffect(() => {
    adminFetch(`/api/admin/branch/summary?team=${team}&period=${period}`).then((r) => r.json()).then((d) => setData(d.monthly_series))
  }, [team, period, refreshKey])
  if (!data) return <div className="h-72 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  const chart = data.months.map((m, i) => ({ month: m.slice(5), goal: data.goal_cum[i], revenue: data.revenue_cum[i] }))
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">FY 로드맵</h2>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="goal" stroke="#888" strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="revenue" stroke="#0d8a4d" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {data.events.slice(0, 8).map((e) => <span key={e.date+e.title} className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">◆ {e.date.slice(5)} {e.title}</span>)}
          {data.deals.slice(0, 8).map((d) => <span key={d.date+d.customer} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">● {d.date.slice(5)} {d.customer}</span>)}
          {data.campaigns.slice(0, 6).map((c) => <span key={c.date+c.name} className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">▲ {c.date.slice(5)} {c.name}</span>)}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Wire into BranchDashboardClient**

Add `<FiscalRoadmap team={team} period={period} refreshKey={refreshKey} />` after `CoreKpiGrid` in the section list.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/branch/summary components/admin/branch/sections/FiscalRoadmap.tsx components/admin/branch/BranchDashboardClient.tsx
git commit -m "feat(branch): FY roadmap (cumulative goal vs revenue + event/deal/campaign markers)"
```

---

## Phase 6 — Team / Manager + Pipeline (M5)

### Task 27: KPI API + ManagerScorecard + KpiActivityMatrix + TeamPacingSection

**Files:**
- Create: `app/api/admin/branch/kpi/route.ts`
- Create: `components/admin/branch/sections/TeamPacingSection.tsx`
- Create: `components/admin/branch/sections/ManagerScorecard.tsx`
- Create: `components/admin/branch/sections/KpiActivityMatrix.tsx`

- [ ] **Step 1: KPI API**

```ts
// app/api/admin/branch/kpi/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseKpi, KPI_RANGE, KPI_METRICS } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { teamPacing, memberPacing, listMembersByTeam } from "@/lib/branch/computations/pacing"
import { fyOf } from "@/lib/branch/fiscal"

const readDsh = unstable_cache(async () => parseDsh(await readRangeWithFormat(envSheetId("dashboard"), DSH_RANGE), fyOf(new Date())), ["branch-dsh"], { revalidate: 60, tags: ["branch-dsh"] })
const readKpi = unstable_cache(async () => parseKpi(await readRangeWithFormat(envSheetId("dashboard"), KPI_RANGE)), ["branch-kpi"], { revalidate: 60, tags: ["branch-kpi"] })

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = (url.searchParams.get("team") ?? "ALL") as "ALL"|"BD"|"MKT"|"CSM"
  const period = (url.searchParams.get("period") ?? "Q") as "M"|"Q"|"Y"
  const now = new Date()
  try {
    const [dsh, kpi, deals] = await Promise.all([readDsh(), readKpi(), listBranchRevDeals()])
    const members = listMembersByTeam(dsh, team).filter((m) => kpi.find((k) => k.member === m))
    const teams = team === "ALL" ? ["BD","MKT","CSM"] : [team]
    const teamSummaries = teams.map((t) => ({ team: t, ...teamPacing(dsh, t, period, now) }))
    const memberSummaries = members.map((m) => {
      const p = memberPacing(dsh, m, period, now)
      const k = kpi.find((row) => row.member === m)!
      const dealsOf = deals.filter((d) => d.manager === m)
      const confirmed = dealsOf.filter((d) => d.first_payment).reduce((s, d) => s + Object.entries(d.monthly_payments).reduce((a, [ym, v]) => a + (d.monthly_red[ym] ? Number(v) : 0), 0), 0)
      const newRenew = dealsOf.reduce((acc, d) => { if (d.status === "New") acc.new += 1; else if (d.status === "Renew") acc.renew += 1; return acc }, { new: 0, renew: 0 })
      return { member: m, team: p.team, goal: p.goal, status: p.status, achievement_pct: p.pacing_pct, confirmed, deals_total: dealsOf.length, deals_confirmed: dealsOf.filter((d) => d.first_payment).length, new_renew: newRenew, kpi: KPI_METRICS.reduce((acc, mt) => ({ ...acc, [mt]: k.pairs[mt] }), {} as Record<string, { goal: number; actual: number }>) }
    })
    return NextResponse.json({ teams: teamSummaries, members: memberSummaries })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: TeamPacingSection**

```tsx
// components/admin/branch/sections/TeamPacingSection.tsx
"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"
async function adminFetch(url: string) { const t = sessionStorage.getItem("admin_password") ?? ""; return fetch(url, { headers: { Authorization: `Bearer ${t}` } }) }
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }
interface TeamRow { team: string; goal: number; status: number; pacing_pct: number }

export default function TeamPacingSection({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<TeamRow[] | null>(null)
  useEffect(() => { adminFetch(`/api/admin/branch/kpi?team=${team}&period=${period}`).then((r) => r.json()).then((d) => setRows(d.teams)) }, [team, period, refreshKey])
  if (!rows) return <div className="h-32 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">팀 페이싱</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((t) => (
          <div key={t.team} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <p className="text-[12px] font-medium text-[#1a1a1a]/60">{t.team}</p>
            <p className="mt-1 text-[20px] font-bold">{t.pacing_pct.toFixed(0)}%</p>
            <p className="mt-1 text-[11px] text-[#1a1a1a]/45">실적 ₩{fmt(t.status)} / 목표 ₩{fmt(t.goal)}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, t.pacing_pct)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: ManagerScorecard**

```tsx
// components/admin/branch/sections/ManagerScorecard.tsx
"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"
async function adminFetch(url: string) { const t = sessionStorage.getItem("admin_password") ?? ""; return fetch(url, { headers: { Authorization: `Bearer ${t}` } }) }
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }
interface MemberRow { member: string; team: string|null; goal: number; status: number; achievement_pct: number; confirmed: number; deals_total: number; deals_confirmed: number; new_renew: { new: number; renew: number }; kpi: Record<string, { goal: number; actual: number }> }

export default function ManagerScorecard({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<MemberRow[] | null>(null)
  useEffect(() => { adminFetch(`/api/admin/branch/kpi?team=${team}&period=${period}`).then((r) => r.json()).then((d) => setRows(d.members)) }, [team, period, refreshKey])
  if (!rows) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">매니저 스코어카드</h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((m) => (
          <div key={m.member} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-semibold">{m.member}</p>
              <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px]">{m.team ?? "?"}</span>
            </div>
            <p className="mt-2 text-[18px] font-bold">{m.achievement_pct.toFixed(0)}%</p>
            <p className="mt-1 text-[11px] text-[#1a1a1a]/45">실적 ₩{fmt(m.confirmed)} / 목표 ₩{fmt(m.goal)}</p>
            <p className="mt-2 text-[11px] text-[#1a1a1a]/55">딜 {m.deals_total}건 (확정 {m.deals_confirmed}) · 신규 {m.new_renew.new} · 갱신 {m.new_renew.renew}</p>
            <div className="mt-2 grid grid-cols-5 gap-1 text-[10px]">
              {Object.entries(m.kpi).map(([k, v]) => {
                const pct = v.goal > 0 ? (v.actual / v.goal) * 100 : 0
                return <div key={k} className="rounded bg-[#fafaf8] px-1.5 py-1 text-center"><div className="text-[#1a1a1a]/55">{k}</div><div className="font-medium">{pct.toFixed(0)}%</div></div>
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: KpiActivityMatrix**

```tsx
// components/admin/branch/sections/KpiActivityMatrix.tsx
"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"
async function adminFetch(url: string) { const t = sessionStorage.getItem("admin_password") ?? ""; return fetch(url, { headers: { Authorization: `Bearer ${t}` } }) }
const METRICS = ["LD","ACC","OPP","SOL","VST"] as const
interface MemberRow { member: string; kpi: Record<string, { goal: number; actual: number }> }

export default function KpiActivityMatrix({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<MemberRow[] | null>(null)
  useEffect(() => { adminFetch(`/api/admin/branch/kpi?team=${team}&period=${period}`).then((r) => r.json()).then((d) => setRows(d.members)) }, [team, period, refreshKey])
  if (!rows) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">활동 KPI 매트릭스</h2>
      <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-[#fafaf8] text-[#1a1a1a]/60">
            <tr><th className="px-3 py-2 text-left">멤버</th>{METRICS.map((m) => <th key={m} className="px-3 py-2 text-right">{m}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.member} className="border-t border-[#f0f0ec]">
                <td className="px-3 py-2 font-medium">{r.member}</td>
                {METRICS.map((m) => {
                  const v = r.kpi[m]; const pct = v?.goal > 0 ? (v.actual / v.goal) * 100 : 0
                  const tone = pct >= 95 ? "text-emerald-700" : pct >= 75 ? "text-amber-700" : "text-rose-700"
                  return <td key={m} className={`px-3 py-2 text-right ${tone}`}>{v?.actual ?? 0}/{v?.goal ?? 0} ({pct.toFixed(0)}%)</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Wire in client + commit**

Add 3 sections to `BranchDashboardClient` after RegionHeatmap. Commit:

```bash
git add app/api/admin/branch/kpi components/admin/branch/sections/{TeamPacingSection,ManagerScorecard,KpiActivityMatrix}.tsx components/admin/branch/BranchDashboardClient.tsx
git commit -m "feat(branch): kpi API + team pacing + manager scorecards + activity matrix"
```

---

### Task 28: Pipeline API + table

**Files:**
- Create: `app/api/admin/branch/pipeline/route.ts`
- Create: `components/admin/branch/sections/PipelineTable.tsx`

- [ ] **Step 1: API**

```ts
// app/api/admin/branch/pipeline/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { listPipeline, type PipelineStage } from "@/lib/branch/computations/pipeline"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  try {
    const deals = await listBranchRevDeals()
    const rows = listPipeline(deals, {
      team: url.searchParams.get("team") ?? undefined,
      manager: url.searchParams.get("manager") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      importance: url.searchParams.get("importance") ?? undefined,
      stage: (url.searchParams.get("stage") ?? undefined) as PipelineStage | undefined,
    })
    return NextResponse.json({ rows })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: Component (filters omitted for v1; add table only)**

```tsx
// components/admin/branch/sections/PipelineTable.tsx
"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"
async function adminFetch(url: string) { const t = sessionStorage.getItem("admin_password") ?? ""; return fetch(url, { headers: { Authorization: `Bearer ${t}` } }) }
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

interface Row { id: string; customer: string; manager: string|null; team: string|null; region: string|null; importance: string|null; stage: string; probability: number; target: number; confirmed_revenue: number; pipeline_value: number }

export default function PipelineTable({ team, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => { adminFetch(`/api/admin/branch/pipeline?team=${team}`).then((r) => r.json()).then((d) => setRows(d.rows)) }, [team, refreshKey])
  if (!rows) return <div className="h-64 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-[13px] font-semibold text-[#111110]/70">파이프라인</h2>
        <p className="text-[11px] text-[#1a1a1a]/40" title="M열 = 계약 목표/잠재 (실매출 아님)">M열 = 목표 금액. 실매출 = 빨간 셀 합</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-[#fafaf8] text-[#1a1a1a]/60">
            <tr><th className="px-3 py-2 text-left">고객사</th><th className="px-3 py-2">매니저</th><th className="px-3 py-2">지역</th><th className="px-3 py-2">중요도</th><th className="px-3 py-2">단계</th><th className="px-3 py-2 text-right">목표 (M)</th><th className="px-3 py-2 text-right">확정매출</th><th className="px-3 py-2 text-right">파이프라인 가치</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#f0f0ec]">
                <td className="px-3 py-2 font-medium">{r.customer}</td>
                <td className="px-3 py-2 text-center">{r.manager ?? "-"}</td>
                <td className="px-3 py-2 text-center">{r.region ?? "-"}</td>
                <td className="px-3 py-2 text-center">{r.importance ?? "-"}</td>
                <td className="px-3 py-2 text-center">{r.stage} ({(r.probability * 100).toFixed(0)}%)</td>
                <td className="px-3 py-2 text-right text-[#1a1a1a]/60">₩{fmt(r.target)}</td>
                <td className="px-3 py-2 text-right font-medium">₩{fmt(r.confirmed_revenue)}</td>
                <td className="px-3 py-2 text-right">₩{fmt(r.pipeline_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Wire + commit**

Add to `BranchDashboardClient`. Commit:

```bash
git add app/api/admin/branch/pipeline components/admin/branch/sections/PipelineTable.tsx components/admin/branch/BranchDashboardClient.tsx
git commit -m "feat(branch): pipeline API + table with M-vs-revenue distinction"
```

---

## Phase 7 — Sections 6-8 (M6)

### Task 29: CampaignsSection

**Files:**
- Create: `components/admin/branch/sections/CampaignsSection.tsx`

- [ ] **Step 1: Add to summary API response (already includes campaigns_30d count and avg open). Extend with `campaigns_recent: Array<{ id, subject, sentAt, recipientCount, openCount, openPct }>` from `summarizeCampaigns(now).recent.slice(0, 8)` and return.**

```ts
// in summary/route.ts add to response:
// campaigns_recent: campaigns.recent.slice(0, 8)
```

- [ ] **Step 2: Component**

```tsx
// components/admin/branch/sections/CampaignsSection.tsx
"use client"
import { useEffect, useState } from "react"
async function adminFetch(url: string) { const t = sessionStorage.getItem("admin_password") ?? ""; return fetch(url, { headers: { Authorization: `Bearer ${t}` } }) }
interface Row { id: string|number; subject: string; sentAt?: string; recipientCount: number; openCount: number; openPct: number }

export default function CampaignsSection({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => { adminFetch("/api/admin/branch/summary?team=ALL&period=Q").then((r) => r.json()).then((d) => setRows(d.campaigns_recent ?? [])) }, [refreshKey])
  if (!rows) return <div className="h-32 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">캠페인 성과 (최근 30일)</h2>
      <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-[#fafaf8] text-[#1a1a1a]/60">
            <tr><th className="px-3 py-2 text-left">캠페인</th><th className="px-3 py-2">발송일</th><th className="px-3 py-2 text-right">발송</th><th className="px-3 py-2 text-right">오픈</th><th className="px-3 py-2 text-right">오픈율</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-[#1a1a1a]/40">최근 30일 발송된 캠페인 없음</td></tr>}
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-t border-[#f0f0ec]">
                <td className="px-3 py-2 font-medium">{r.subject}</td>
                <td className="px-3 py-2 text-center">{r.sentAt?.slice(0,10) ?? "-"}</td>
                <td className="px-3 py-2 text-right">{r.recipientCount}</td>
                <td className="px-3 py-2 text-right">{r.openCount}</td>
                <td className="px-3 py-2 text-right">{r.openPct.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Commit**

Add to client. Commit.

```bash
git add components/admin/branch/sections/CampaignsSection.tsx components/admin/branch/BranchDashboardClient.tsx app/api/admin/branch/summary
git commit -m "feat(branch): campaign performance section"
```

---

### Task 30: HW API + HardwareSection

**Files:**
- Create: `app/api/admin/branch/hw/route.ts`
- Create: `components/admin/branch/sections/HardwareSection.tsx`

- [ ] **Step 1: API**

```ts
// app/api/admin/branch/hw/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { listHwInbound, listHwOutbound, listHwStock, listHwSalesMonthly } from "@/lib/repositories/branch-hw"

const HW_PATTERNS: Array<{ key: string; match: RegExp; threshold: number; thresholdSheet: number }> = [
  { key: "IFP86",  match: /86["”]?\s*IFP/i, threshold: 2, thresholdSheet: 5 },
  { key: "IFP75",  match: /75["”]?\s*IFP/i, threshold: 2, thresholdSheet: 5 },
  { key: "CAM_T1", match: /T1\s*카메라|카메라\s*T1/i, threshold: 2, thresholdSheet: 5 },
  { key: "CAM_S1", match: /S1\s*카메라|카메라\s*S1/i, threshold: 2, thresholdSheet: 5 },
  { key: "OPS",    match: /\bOPS\b/i, threshold: 5, thresholdSheet: 5 },
]

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  try {
    const [inbound, outbound, stock, sales] = await Promise.all([listHwInbound(), listHwOutbound(), listHwStock(), listHwSalesMonthly()])
    const stockByPattern = HW_PATTERNS.map((p) => {
      const fromIO = inbound.filter((r) => p.match.test(r.product)).reduce((s, r) => s + r.quantity, 0) - outbound.filter((r) => p.match.test(r.product)).reduce((s, r) => s + r.quantity, 0)
      const fromSheet = stock.filter((r) => p.match.test(r.product)).reduce((s, r) => s + r.quantity, 0)
      return { product: p.key, io_stock: fromIO, sheet_stock: fromSheet, low: fromIO <= p.threshold || fromSheet <= p.thresholdSheet }
    })
    const progress = outbound.reduce<Record<string, number>>((acc, r) => { const k = r.progress ?? "미정"; acc[k] = (acc[k] ?? 0) + r.quantity; return acc }, {})
    return NextResponse.json({ stock: stockByPattern, sales_monthly: sales, progress })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: Component**

```tsx
// components/admin/branch/sections/HardwareSection.tsx
"use client"
import { useEffect, useState } from "react"
async function adminFetch(url: string) { const t = sessionStorage.getItem("admin_password") ?? ""; return fetch(url, { headers: { Authorization: `Bearer ${t}` } }) }
interface StockRow { product: string; io_stock: number; sheet_stock: number; low: boolean }
interface SalesRow { fiscal_year: number; fiscal_month: number; product: string; quantity: number }

export default function HardwareSection({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<{ stock: StockRow[]; sales_monthly: SalesRow[]; progress: Record<string, number> } | null>(null)
  useEffect(() => { adminFetch("/api/admin/branch/hw").then((r) => r.json()).then(setData) }, [refreshKey])
  if (!data) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section className="space-y-4">
      <h2 className="text-[13px] font-semibold text-[#111110]/70">하드웨어</h2>
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        {data.stock.map((s) => (
          <div key={s.product} className={`rounded-2xl border p-4 ${s.low ? "border-rose-200 bg-rose-50" : "border-[#e8e8e4] bg-white"}`}>
            <p className="text-[11px] font-medium uppercase">{s.product}</p>
            <p className="mt-2 text-[18px] font-bold">{s.io_stock}대</p>
            <p className="mt-1 text-[11px] opacity-60">시트 재고 {s.sheet_stock}대</p>
            {s.low && <p className="mt-1 text-[11px] font-medium text-rose-700">재고 부족</p>}
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <p className="mb-2 text-[12px] font-medium">출고 진행 상태</p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {Object.entries(data.progress).map(([k, v]) => <span key={k} className="rounded-full bg-[#fafaf8] px-2.5 py-1">{k} {v}대</span>)}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Commit**

Wire in client. Commit.

```bash
git add app/api/admin/branch/hw components/admin/branch/sections/HardwareSection.tsx components/admin/branch/BranchDashboardClient.tsx
git commit -m "feat(branch): HW stock + progress section"
```

---

### Task 31: DataQualityPanel

**Files:**
- Create: `app/api/admin/branch/data-quality/route.ts`
- Create: `components/admin/branch/sections/DataQualityPanel.tsx`

- [ ] **Step 1: API**

```ts
// app/api/admin/branch/data-quality/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseSeg, SEG_RANGE } from "@/lib/branch/parsers/seg"
import { parseKpi, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { listHwInbound, listHwOutbound, listHwStock } from "@/lib/repositories/branch-hw"
import { runDataQuality } from "@/lib/branch/computations/data-quality"
import { fyOf } from "@/lib/branch/fiscal"

const readDsh = unstable_cache(async () => parseDsh(await readRangeWithFormat(envSheetId("dashboard"), DSH_RANGE), fyOf(new Date())), ["branch-dsh"], { revalidate: 60, tags: ["branch-dsh"] })
const readSeg = unstable_cache(async () => parseSeg(await readRangeWithFormat(envSheetId("dashboard"), SEG_RANGE)), ["branch-seg"], { revalidate: 60, tags: ["branch-seg"] })
const readKpi = unstable_cache(async () => parseKpi(await readRangeWithFormat(envSheetId("dashboard"), KPI_RANGE)), ["branch-kpi"], { revalidate: 60, tags: ["branch-kpi"] })

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  try {
    const [dsh, seg, kpi, deals, hwInbound, hwOutbound, hwStock] = await Promise.all([readDsh(), readSeg(), readKpi(), listBranchRevDeals(), listHwInbound(), listHwOutbound(), listHwStock()])
    const issues = runDataQuality({ deals, dsh, kpi, seg, hwInbound, hwOutbound, hwStock })
    return NextResponse.json({ issues })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: Component**

```tsx
// components/admin/branch/sections/DataQualityPanel.tsx
"use client"
import { useEffect, useState } from "react"
async function adminFetch(url: string) { const t = sessionStorage.getItem("admin_password") ?? ""; return fetch(url, { headers: { Authorization: `Bearer ${t}` } }) }
interface Issue { id: string; severity: "info"|"warn"|"error"; message: string; samples?: unknown[] }
const TONE = { info: "border-sky-200 bg-sky-50 text-sky-800", warn: "border-amber-200 bg-amber-50 text-amber-800", error: "border-rose-200 bg-rose-50 text-rose-800" }

export default function DataQualityPanel({ refreshKey }: { refreshKey: number }) {
  const [issues, setIssues] = useState<Issue[] | null>(null)
  useEffect(() => { adminFetch("/api/admin/branch/data-quality").then((r) => r.json()).then((d) => setIssues(d.issues ?? [])) }, [refreshKey])
  if (!issues) return <div className="h-32 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">데이터 품질 점검</h2>
      <div className="space-y-2">
        {issues.length === 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-700">현재 검출된 이슈 없음</div>}
        {issues.map((i) => (
          <details key={i.id} className={`rounded-2xl border p-3 text-[12px] ${TONE[i.severity]}`}>
            <summary className="cursor-pointer"><span className="font-medium">[{i.id}]</span> {i.message}</summary>
            {i.samples && i.samples.length > 0 && <pre className="mt-2 max-h-40 overflow-auto rounded bg-white/40 p-2 text-[11px]">{JSON.stringify(i.samples, null, 2)}</pre>}
          </details>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Commit**

Wire in client. Commit.

```bash
git add app/api/admin/branch/data-quality components/admin/branch/sections/DataQualityPanel.tsx components/admin/branch/BranchDashboardClient.tsx
git commit -m "feat(branch): data quality panel"
```

---

## Phase 8 — LLM Insights (M7)

### Task 32: Insight input builder

**Files:**
- Create: `lib/branch/insights/input-builder.ts`

- [ ] **Step 1: Implement**

```ts
// lib/branch/insights/input-builder.ts
import "server-only"
import { createHash } from "crypto"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import type { KpiRow } from "@/lib/branch/parsers/kpi"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { teamPacing, listMembersByTeam } from "@/lib/branch/computations/pacing"
import { computeHeatmap } from "@/lib/branch/computations/heatmap"
import { closingDeals } from "@/lib/branch/computations/core-kpi"
import { dealProbability } from "@/lib/branch/computations/pipeline"
import { fyOf, fiscalQuarter } from "@/lib/branch/fiscal"
import type { Period } from "@/lib/branch/computations/heatmap"

export type TeamScope = "ALL" | "BD" | "MKT" | "CSM"

export interface InsightInput {
  fiscalPeriod: string; team: TeamScope; scope: Period
  team_pacing: { goal: number; status: number; pacing_pct: number }
  managers: Array<{ name: string; team: string|null; goal: number; status: number; achievement_pct: number; deals_total: number; deals_confirmed: number; new_renew: { new: number; renew: number }; kpi: Record<string, [number, number]> }>
  regions: Array<{ region: string; target: number; revenue: number; progress_pct: number; status: string }>
  bottleneck_kpi: { name: string; pct: number; worst_member: string|null }
  closing_deals: Array<{ customer: string; manager: string|null; expected: number; due: string|null }>
  events_30d: Array<{ title: string; date: string; region?: string|null }>
  campaigns_30d: Array<{ name: string; sent_at: string; open_pct: number }>
  hw_alerts: Array<{ product: string; current: number; threshold: number }>
}

export function digestInput(inp: InsightInput): string {
  return createHash("sha256").update(JSON.stringify(inp)).digest("hex")
}

export interface BuildArgs {
  team: TeamScope; scope: Period; now: Date
  dsh: DshOutput; kpi: KpiRow[]; deals: BranchRevDeal[]
  events: Array<{ title: string; startsAt: string; location: string|null }>
  campaigns: Array<{ subject: string; sentAt?: string; openPct: number }>
  hwAlerts: Array<{ product: string; current: number; threshold: number }>
}

export function buildInsightInput(a: BuildArgs): InsightInput {
  const fy = fyOf(a.now); const q = fiscalQuarter(a.now.getUTCMonth() + 1)
  const pacing = a.team === "ALL"
    ? ["BD","MKT","CSM"].reduce((acc, t) => { const p = teamPacing(a.dsh, t, a.scope, a.now); return { goal: acc.goal + p.goal, status: acc.status + p.status, pacing_pct: 0 } }, { goal: 0, status: 0, pacing_pct: 0 })
    : teamPacing(a.dsh, a.team, a.scope, a.now)
  pacing.pacing_pct = pacing.goal > 0 ? (pacing.status / pacing.goal) * 100 : 0

  const members = listMembersByTeam(a.dsh, a.team)
  const managers = members.map((m) => {
    const k = a.kpi.find((r) => r.member === m)
    const dealsOf = a.deals.filter((d) => d.manager === m)
    const confirmed = dealsOf.filter((d) => d.first_payment).reduce((s, d) => s + Object.entries(d.monthly_payments).reduce((a, [ym, v]) => a + (d.monthly_red[ym] ? Number(v) : 0), 0), 0)
    const goal = a.dsh.rows.find((r) => r.level === "member" && r.member === m && r.kind === "goal")
    const status = a.dsh.rows.find((r) => r.level === "member" && r.member === m && r.kind === "status")
    const goalVal = goal?.annual ?? 0
    return {
      name: m, team: a.dsh.members[m] ?? null,
      goal: goalVal, status: status?.annual ?? 0,
      achievement_pct: goalVal > 0 ? ((status?.annual ?? 0) / goalVal) * 100 : 0,
      deals_total: dealsOf.length,
      deals_confirmed: dealsOf.filter((d) => d.first_payment).length,
      new_renew: dealsOf.reduce((acc, d) => { if (d.status === "New") acc.new += 1; else if (d.status === "Renew") acc.renew += 1; return acc }, { new: 0, renew: 0 }),
      kpi: k ? Object.fromEntries(Object.entries(k.pairs).map(([m2, v]) => [m2, [v.goal, v.actual]])) as Record<string, [number, number]> : {},
    }
  })

  const regions = computeHeatmap(a.deals, a.scope, a.now, a.team).slice(0, 12).map((r) => ({ region: r.region, target: r.target, revenue: r.revenue, progress_pct: r.progress, status: r.status }))

  const KPIM = ["LD","ACC","OPP","SOL","VST"]
  const totals = Object.fromEntries(KPIM.map((m) => [m, [0, 0]] as [string, [number, number]]))
  for (const r of a.kpi) for (const m of KPIM) { totals[m][0] += r.pairs[m as keyof typeof r.pairs].goal; totals[m][1] += r.pairs[m as keyof typeof r.pairs].actual }
  let bn = "LD"; let bnPct = Infinity
  for (const m of KPIM) { const [g, a2] = totals[m] as [number, number]; const pct = g > 0 ? (a2 / g) * 100 : 0; if (pct < bnPct) { bn = m; bnPct = pct } }
  const worstMember = a.kpi.length > 0 ? a.kpi.map((r) => ({ m: r.member, pct: r.pairs[bn as keyof typeof r.pairs].goal > 0 ? (r.pairs[bn as keyof typeof r.pairs].actual / r.pairs[bn as keyof typeof r.pairs].goal) * 100 : 0 })).sort((x, y) => x.pct - y.pct)[0]?.m ?? null : null

  const closing = closingDeals(a.deals, a.now)
  const closing_deals = a.deals.filter((d) => d.first_payment && new Date(d.first_payment) >= a.now && new Date(d.first_payment).getTime() <= a.now.getTime() + 30*86400_000 || dealProbability(d) >= 0.7)
    .slice(0, 12).map((d) => ({ customer: d.customer_name, manager: d.manager, expected: Number(d.contract_target ?? 0), due: d.first_payment }))

  return {
    fiscalPeriod: `FY${fy}-Q${q}`, team: a.team, scope: a.scope,
    team_pacing: pacing, managers, regions,
    bottleneck_kpi: { name: bn, pct: bnPct, worst_member: worstMember },
    closing_deals,
    events_30d: a.events.filter((e) => new Date(e.startsAt) >= a.now && new Date(e.startsAt).getTime() <= a.now.getTime() + 30*86400_000).slice(0, 12).map((e) => ({ title: e.title, date: e.startsAt.slice(0,10), region: e.location })),
    campaigns_30d: a.campaigns.filter((c) => c.sentAt).slice(0, 8).map((c) => ({ name: c.subject, sent_at: c.sentAt!, open_pct: c.openPct })),
    hw_alerts: a.hwAlerts.slice(0, 5),
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/branch/insights/input-builder.ts
git commit -m "feat(branch): insight input builder + sha256 digest"
```

---

### Task 33: Prompt + Gemini runner

**Files:**
- Create: `lib/branch/insights/prompt.ts`
- Create: `lib/branch/insights/gemini-runner.ts`
- Test: `tests/branch/insights/gemini-runner.test.ts`

- [ ] **Step 1: Prompt**

```ts
// lib/branch/insights/prompt.ts
export const INSIGHT_SYSTEM_PROMPT = `너는 Sales Branding Dashboard 의 시니어 BD/MKT/CSM 운영 컨설턴트다.
규칙:
- 입력 JSON 의 수치를 다시 계산하지 말고 인용만 한다.
- 출력은 반드시 다음 JSON 스키마를 따른다:
  { "one_liner": "한 줄 정의 (50자 이내)", "next_actions": [ { "title": "...", "why": "...", "owner": "매니저명", "due": "YYYY-MM-DD" } ] }
- next_actions 는 정확히 5개. 각 title 은 100자 이내.
- M열은 계약 목표/잠재 금액이며 실매출이 아니다. 둘을 혼동하지 않는다.
- 회계연도는 4월 시작, 3월 종료다.
- 한국어로 작성한다.`

export const INSIGHT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    one_liner: { type: "string" },
    next_actions: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, why: { type: "string" }, owner: { type: "string" }, due: { type: "string" } },
        required: ["title", "why", "owner"],
      },
    },
  },
  required: ["one_liner", "next_actions"],
} as const
```

- [ ] **Step 2: Runner**

```ts
// lib/branch/insights/gemini-runner.ts
import "server-only"
import { INSIGHT_SYSTEM_PROMPT, INSIGHT_RESPONSE_SCHEMA } from "./prompt"
import type { InsightInput } from "./input-builder"

export interface InsightResult { one_liner: string; next_actions: Array<{ title: string; why: string; owner: string; due?: string }> }

export async function callGemini(input: InsightInput): Promise<{ result: InsightResult; raw: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")
  const model = process.env.GEMINI_MODEL ?? "gemini-3.1-pro"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = {
    systemInstruction: { parts: [{ text: INSIGHT_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: INSIGHT_RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  }
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  if (!res.ok) { const t = await res.text(); throw new Error(`Gemini ${res.status}: ${t}`) }
  const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  const parsed = JSON.parse(text) as InsightResult
  if (!parsed.one_liner || !Array.isArray(parsed.next_actions)) throw new Error("invalid Gemini response shape")
  return { result: parsed, raw: json }
}
```

- [ ] **Step 3: Test (mocked)**

```ts
// tests/branch/insights/gemini-runner.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { callGemini } from "@/lib/branch/insights/gemini-runner"

describe("callGemini", () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = "test"; vi.restoreAllMocks() })
  it("parses JSON response", async () => {
    const fake = { candidates: [{ content: { parts: [{ text: JSON.stringify({ one_liner: "ok", next_actions: [{ title: "t", why: "y", owner: "Han" }] }) }] } }] }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => fake } as never))
    const out = await callGemini({} as never)
    expect(out.result.one_liner).toBe("ok")
    expect(out.result.next_actions).toHaveLength(1)
  })
  it("throws on non-200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" } as never))
    await expect(callGemini({} as never)).rejects.toThrow(/500/)
  })
})
```

- [ ] **Step 4: Commit**

```bash
git add lib/branch/insights/prompt.ts lib/branch/insights/gemini-runner.ts tests/branch/insights/
git commit -m "feat(branch): gemini runner + prompt with JSON schema"
```

---

### Task 34: Insights API + cron + InsightCard

**Files:**
- Create: `app/api/admin/branch/insights/route.ts`
- Create: `app/api/cron/sync-branch-insights/route.ts`
- Create: `components/admin/branch/sections/InsightCard.tsx`
- Modify: `vercel.json`

- [ ] **Step 1: Insights API (GET)**

```ts
// app/api/admin/branch/insights/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseKpi, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { listPublicEvents } from "@/lib/repositories/public-events"
import { summarizeCampaigns } from "@/lib/branch/computations/campaigns"
import { buildInsightInput, digestInput, type TeamScope } from "@/lib/branch/insights/input-builder"
import { callGemini } from "@/lib/branch/insights/gemini-runner"
import { findInsightByDigest, getLatestInsight, insertInsight } from "@/lib/repositories/branch-insights"
import { fyOf } from "@/lib/branch/fiscal"

const readDsh = unstable_cache(async () => parseDsh(await readRangeWithFormat(envSheetId("dashboard"), DSH_RANGE), fyOf(new Date())), ["branch-dsh"], { revalidate: 60, tags: ["branch-dsh"] })
const readKpi = unstable_cache(async () => parseKpi(await readRangeWithFormat(envSheetId("dashboard"), KPI_RANGE)), ["branch-kpi"], { revalidate: 60, tags: ["branch-kpi"] })

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = (url.searchParams.get("team") ?? "ALL") as TeamScope
  const force = url.searchParams.get("force") === "1"
  const now = new Date()
  try {
    const [dsh, kpi, deals, events, campaigns] = await Promise.all([readDsh(), readKpi(), listBranchRevDeals(), listPublicEvents(), summarizeCampaigns(now)])
    const input = buildInsightInput({
      team, scope: "Q", now, dsh, kpi,
      deals: team === "ALL" ? deals : deals.filter((d) => d.team === team),
      events: events.map((e) => ({ title: e.title, startsAt: e.startsAt, location: e.location })),
      campaigns: campaigns.recent.map((c) => ({ subject: c.subject, sentAt: c.sentAt, openPct: c.openPct })),
      hwAlerts: [],
    })
    const digest = digestInput(input)
    if (!force) {
      const cached = await findInsightByDigest(team, digest)
      if (cached) return NextResponse.json({ from: "cache", ...cached })
    }
    const { result, raw } = await callGemini(input)
    const saved = await insertInsight({ team, fiscal_period: input.fiscalPeriod, one_liner: result.one_liner, next_actions: result.next_actions, raw_response: raw, input_digest: digest })
    return NextResponse.json({ from: "fresh", ...saved })
  } catch (e) {
    const fallback = await getLatestInsight(team)
    if (fallback) return NextResponse.json({ from: "stale", error: String(e), ...fallback })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Cron route**

```ts
// app/api/cron/sync-branch-insights/route.ts
import { NextRequest, NextResponse } from "next/server"

const TEAMS = ["ALL", "BD", "MKT", "CSM"] as const

export async function GET(req: NextRequest) {
  const expected = process.env.BRANCH_DASHBOARD_CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const base = req.nextUrl.origin
  const results: Record<string, unknown> = {}
  for (const t of TEAMS) {
    const r = await fetch(`${base}/api/admin/branch/insights?team=${t}&force=1`, { headers: { Authorization: `Bearer __cron__` } })
    results[t] = { ok: r.ok, status: r.status }
  }
  return NextResponse.json(results)
}
```

Note: the insights API requires `verifyAdmin`, so the cron either needs a service-mode bypass or move LLM call into a shared lib. Simplification — extract `runInsights(team)` into `lib/branch/insights/runner.ts` and call directly from cron without HTTP hop:

```ts
// lib/branch/insights/runner.ts
import "server-only"
import { /* same imports as API route, minus NextRequest */ } from "..."
export async function runInsights(team: TeamScope, force: boolean): Promise<{ from: "cache" | "fresh" | "stale" | "error"; one_liner?: string; next_actions?: unknown; error?: string }> { /* body identical to API GET handler */ }
```

Then both API and cron call `runInsights(team, force)`. Refactor accordingly.

- [ ] **Step 3: vercel.json update**

```json
{
  "crons": [
    { "path": "/api/cron/automation", "schedule": "0 9 * * *" },
    { "path": "/api/cron/sync-branch", "schedule": "0 */4 * * *" },
    { "path": "/api/cron/sync-branch-insights", "schedule": "0 5 * * *" }
  ]
}
```

- [ ] **Step 4: InsightCard component**

```tsx
// components/admin/branch/sections/InsightCard.tsx
"use client"
import { useEffect, useState, useCallback } from "react"
import type { Team } from "../BranchDashboardClient"
import { RefreshCw } from "lucide-react"
async function adminFetch(url: string) { const t = sessionStorage.getItem("admin_password") ?? ""; return fetch(url, { headers: { Authorization: `Bearer ${t}` } }) }

interface NextAction { title: string; why: string; owner: string; due?: string }
interface InsightResp { from: "cache"|"fresh"|"stale"; one_liner: string; next_actions: NextAction[]; generated_at: string; error?: string }

export default function InsightCard({ team, refreshKey }: { team: Team; refreshKey: number }) {
  const [data, setData] = useState<InsightResp | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (force: boolean) => {
    setBusy(true)
    try {
      const r = await adminFetch(`/api/admin/branch/insights?team=${team}${force ? "&force=1" : ""}`)
      setData(await r.json())
    } finally { setBusy(false) }
  }, [team])
  useEffect(() => { load(false) }, [load, refreshKey])
  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-[#ECFDF5] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase text-[#084734]/70">AI 인사이트</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-[#084734]">{data?.one_liner ?? "분석 중..."}</p>
        </div>
        <button type="button" disabled={busy} onClick={() => load(true)} className="inline-flex items-center gap-1 rounded-full bg-[#084734] px-3 py-1.5 text-[11px] text-white disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "분석 중..." : "다시 분석"}
        </button>
      </div>
      <ol className="mt-4 space-y-2 text-[12px] leading-5 text-[#084734]">
        {data?.next_actions?.map((a, i) => (
          <li key={i} className="rounded-xl bg-white/70 p-3">
            <p className="font-semibold">{i + 1}. {a.title}</p>
            <p className="mt-1 text-[11px] text-[#084734]/75">{a.why}</p>
            <p className="mt-1 text-[10px] text-[#084734]/55">담당 {a.owner}{a.due ? ` · 기한 ${a.due}` : ""}</p>
          </li>
        ))}
      </ol>
      {data?.from === "stale" && <p className="mt-2 text-[10px] text-amber-700">stale 캐시 (LLM 호출 실패)</p>}
    </section>
  )
}
```

- [ ] **Step 5: Wire in client (insert as section 0, top of stack)**

In `BranchDashboardClient`, render `<InsightCard team={team} refreshKey={refreshKey} />` as the first section.

- [ ] **Step 6: Commit**

```bash
git add lib/branch/insights/runner.ts app/api/admin/branch/insights app/api/cron/sync-branch-insights vercel.json components/admin/branch/sections/InsightCard.tsx components/admin/branch/BranchDashboardClient.tsx
git commit -m "feat(branch): LLM insights (gemini) + InsightCard + cron"
```

---

## Phase 9 — Validation (M9)

### Task 35: Lint, build, smoke

**Files:** none

- [ ] **Step 1: ESLint**

Run: `npx eslint app components lib --max-warnings=0`
Expected: 0 warnings/errors. Fix anything that surfaces.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`. Visit `/admin/branch`. Verify:
- Team toggle (전체/BD/MKT/CSM) updates all sections.
- Period toggle (M/Q/Y) updates revenue cards + heatmap + roadmap.
- Sync button triggers refresh and updates timestamp.
- Insight card shows one_liner + 5 actions.
- Heatmap shows colors by status.
- Pipeline table shows confirmed_revenue ≠ target column.
- Hardware section shows low-stock highlighting.
- Data quality panel shows checks.

- [ ] **Step 4: Final commit (if any small fixes from smoke)**

```bash
git add -A
git commit -m "chore(branch): post-smoke fixes"
```

---

## Self-Review Checklist (executed by author after writing)

1. **Spec coverage**: every spec section has at least one task. Sections 0-8 → Tasks 22-34. Migration → Task 3. Sync → Tasks 17-21. LLM → Tasks 32-34.
2. **Placeholder scan**: no "TBD/TODO" left in plan body. (Step 3 of Task 20 references "Insights cron added in Phase 9" — that's a forward reference, not a placeholder; the actual config lives in Task 34 Step 3.)
3. **Type consistency**: `BranchRevDeal` (repo), `RevDealParsed` (parser), `DshOutput`, `KpiRow`, `InsightInput` all referenced consistently across tasks.
4. **Ambiguity**: Task 21 (first sync) is operational — the engineer must use the project's actual admin auth flow, which varies (cookie, header). Prefer existing admin route call pattern as reference.

---

## Reminders

- All admin DB access via `createSupabaseAdminClient()`; never the server client.
- `verifyAdmin(req)` returns a `NextResponse` (401/403) when not authorized; otherwise undefined.
- Cron routes verify `Authorization: Bearer ${BRANCH_DASHBOARD_CRON_SECRET}`.
- Sheet ranges: `'2.입고 현황'` and `'3.출고 현황'` need single-quotes due to leading digit.
- M열 (`contract_target`) must NEVER be displayed labelled as 매출. Always pair with `confirmed_revenue` from red-cell logic.
- `monthly_red` empty across all rows after sync = red-cell threshold needs tuning (see spec §17.2).





