# Neo CRM 고객 스냅샷 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 CRM 고객 목록을 매 요청 3중 메모리 조인에서 사전조인된 스냅샷 테이블 1스캔으로 바꿔 조립 비용을 O(1)화하되, 응답 shape를 유지해 클라 즉시 UX와 숫자 정합을 그대로 보존한다.

**Architecture:** 기존 `getNeoCrmCustomers` 본문을 `computeNeoCrmCustomersLive()`로 추출(로직 변경 0) → 동기화 체인(하루 4회 + 수동) 끝에서 같은 함수로 계산해 `neo_crm_customer_snapshot` 테이블에 run_id 원자 교체로 적재 → `getNeoCrmCustomers`는 스냅샷 1쿼리로 읽고, 테이블 없음/0행이면 라이브로 폴백. summary/owners/매핑은 순수 모듈(`*-rollup.ts`)로 추출해 라이브·스냅샷 양 경로가 공유 → 숫자 정합을 구조적으로 보장.

**Tech Stack:** Next.js 16, TypeScript, Supabase(service_role admin client), Postgres 마이그레이션, vitest(node env, `server-only` 목, `@` 별칭).

**참조 스펙:** [docs/superpowers/specs/2026-06-18-neo-crm-customer-snapshot-design.md](../specs/2026-06-18-neo-crm-customer-snapshot-design.md)

**품질 게이트:** `npx eslint app components lib --max-warnings=0` + `npm run build`. 단위 테스트는 `npx vitest run <path>`.

---

## File Structure

- **Create** `supabase/migrations/20260618_neo_crm_customer_snapshot.sql` — 스냅샷 테이블 + 인덱스 + RLS(멱등). (Task 1)
- **Create** `lib/admin-crm-customers-neo-rollup.ts` — 순수 모듈: summary/owners 집계 + 스냅샷 매핑(읽기/쓰기) + 스냅샷 행 타입. server-only/Supabase import 없음. (Task 2)
- **Create** `tests/admin-crm/neo-crm-snapshot.test.ts` — rollup 순수 함수 단위 테스트. (Task 2)
- **Modify** `lib/admin-crm-customers-neo.ts` — 본문을 `computeNeoCrmCustomersLive`로 추출, rollup 헬퍼 사용, `getNeoCrmCustomers`를 스냅샷-읽기+폴백으로 재작성. (Task 3)
- **Create** `lib/external-crm/neo-crm-snapshot.ts` — `refreshNeoCrmCustomerSnapshot()` 쓰기 측. (Task 4)
- **Modify** `lib/external-crm/sync-chain.ts` — 동기화 체인에 스냅샷 갱신 훅 추가. (Task 5)

`getNeoCrmCustomerDetail`(상세 드릴다운), API 라우트(`app/api/admin/crm/customers-neo/route.ts`), 클라(`NeoCrmCustomersClient.tsx`)는 **무변경**(응답 shape 동일).

---

## Task 1: 스냅샷 테이블 마이그레이션

**Files:**
- Create: `supabase/migrations/20260618_neo_crm_customer_snapshot.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- ============================================================
-- Neo CRM customer snapshot (pre-joined customer rollup)
-- ============================================================
-- 목적
-- - /api/admin/crm/customers-neo 가 요청당 account/ShroffAccount__c/opportunity
--   를 전부 스캔 후 메모리 3중 조인하던 비용을, 동기화 시점에 미리 조립한
--   1고객=1행 스냅샷 1스캔으로 내린다.
-- - 적재는 sync chain(하루 4회 cron + 수동)에서 기존 TS 집계 로직으로 수행한다.
-- - 비파괴: 읽기 경로는 이 테이블이 없거나 비면 라이브 계산으로 폴백하므로
--   적용 전/첫 sync 전에도 앱이 동작한다.
--
-- 적용 후 검증
--   SELECT count(*) FROM public.neo_crm_customer_snapshot;

CREATE TABLE IF NOT EXISTS public.neo_crm_customer_snapshot (
  account_id          TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  owner_id            TEXT,
  owner_name          TEXT NOT NULL,
  phone               TEXT,
  balance             NUMERIC,
  expire_at           TIMESTAMPTZ,
  last_class_at       TIMESTAMPTZ,
  uid                 TEXT,
  order_amount        NUMERIC NOT NULL DEFAULT 0,
  order_count         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ,
  customer_updated_at TIMESTAMPTZ,
  search_text         TEXT,
  snapshot_run_id     UUID NOT NULL,
  source_synced_at    TIMESTAMPTZ,
  snapshot_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- run_id 원자 교체 후 사라진 고객 정리 delete 용
CREATE INDEX IF NOT EXISTS neo_crm_customer_snapshot_run_idx
  ON public.neo_crm_customer_snapshot (snapshot_run_id);

ALTER TABLE public.neo_crm_customer_snapshot ENABLE ROW LEVEL SECURITY;

-- 쓰기/읽기는 어드민 service_role 클라이언트가 RLS를 바이패스한다.
-- 정책은 일반 인증 사용자의 직접 접근을 차단하기 위한 명시적 admin-read.
DROP POLICY IF EXISTS "Admins read neo crm customer snapshot" ON public.neo_crm_customer_snapshot;
CREATE POLICY "Admins read neo crm customer snapshot"
  ON public.neo_crm_customer_snapshot
  FOR SELECT
  USING (public.is_active_admin());
```

- [ ] **Step 2: 멱등성/패턴 확인**

Run: `grep -E "IF NOT EXISTS|DROP POLICY IF EXISTS|is_active_admin" supabase/migrations/20260618_neo_crm_customer_snapshot.sql`
Expected: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `is_active_admin()` 가 모두 매치(재실행 안전 + 기존 RLS 패턴 일치).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260618_neo_crm_customer_snapshot.sql
git commit -m "chore(db): neo crm 고객 스냅샷 테이블 마이그레이션

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 순수 rollup 모듈 + 단위 테스트

집계/매핑을 순수 함수로 추출해 라이브·스냅샷 경로가 공유하게 한다(숫자 정합의 구조적 보장). 이 모듈은 server-only/Supabase를 import하지 않아 DB 없이 단위 테스트 가능하다.

**Files:**
- Create: `lib/admin-crm-customers-neo-rollup.ts`
- Test: `tests/admin-crm/neo-crm-snapshot.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/admin-crm/neo-crm-snapshot.test.ts`:

```typescript
import { describe, expect, it } from "vitest"

import type { NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"
import {
  buildOwnerOptions,
  customerRowToSnapshot,
  snapshotToCustomerRow,
  summarizeCustomers,
} from "@/lib/admin-crm-customers-neo-rollup"

function row(overrides: Partial<NeoCrmCustomerRow> = {}): NeoCrmCustomerRow {
  return {
    accountId: "acc-1",
    name: "학원 A",
    ownerId: "owner-1",
    ownerName: "민재",
    phone: "010-0000-0000",
    balance: 1000,
    expireAt: null,
    lastClassAt: null,
    uid: "uid-1",
    orderAmount: 0,
    orderCount: 0,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

describe("summarizeCustomers", () => {
  it("EEO 유무(balance null)·만료임박(60일)·합계를 기존 로직대로 집계한다", () => {
    const now = Date.parse("2026-06-18T00:00:00.000Z")
    const rows = [
      row({ accountId: "a", balance: 1000, orderAmount: 50, expireAt: "2026-07-01T00:00:00.000Z" }),
      row({ accountId: "b", balance: null, orderAmount: 25, expireAt: "2027-01-01T00:00:00.000Z" }),
      row({ accountId: "c", balance: 0, orderAmount: 0, expireAt: null }),
    ]

    const s = summarizeCustomers(rows, now)

    expect(s.totalCount).toBe(3)
    expect(s.withEeoCount).toBe(2) // balance != null → a, c
    expect(s.expiringSoonCount).toBe(1) // a 만 [now, now+60d]
    expect(s.totalBalance).toBe(1000) // 1000 + 0 (null은 0)
    expect(s.totalOrderAmount).toBe(75)
  })

  it("이미 만료된(과거) expire는 임박에 포함하지 않는다", () => {
    const now = Date.parse("2026-06-18T00:00:00.000Z")
    const rows = [row({ accountId: "a", expireAt: "2026-06-01T00:00:00.000Z" })]
    expect(summarizeCustomers(rows, now).expiringSoonCount).toBe(0)
  })
})

describe("buildOwnerOptions", () => {
  it("owner별 카운트 그룹·count 내림차순·owner 없는 행 제외", () => {
    const rows = [
      row({ accountId: "a", ownerId: "o1", ownerName: "A" }),
      row({ accountId: "b", ownerId: "o1", ownerName: "A" }),
      row({ accountId: "c", ownerId: "o2", ownerName: "B" }),
      row({ accountId: "d", ownerId: null, ownerName: "담당 미지정" }),
    ]
    expect(buildOwnerOptions(rows)).toEqual([
      { ownerId: "o1", ownerName: "A", count: 2 },
      { ownerId: "o2", ownerName: "B", count: 1 },
    ])
  })
})

describe("snapshot row 매핑 round-trip", () => {
  it("customerRowToSnapshot → snapshotToCustomerRow 가 원본 행과 동일", () => {
    const original = row({
      accountId: "acc-9",
      name: "학원 Z",
      ownerId: null,
      ownerName: "담당 미지정",
      phone: null,
      balance: null,
      expireAt: "2026-08-15T00:00:00.000Z",
      lastClassAt: "2026-06-01T00:00:00.000Z",
      uid: null,
      orderAmount: 1234.5,
      orderCount: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-06-10T00:00:00.000Z",
    })

    const snap = customerRowToSnapshot(original, {
      runId: "run-1",
      snapshotAt: "2026-06-18T00:00:00.000Z",
      sourceSyncedAt: "2026-06-17T00:00:00.000Z",
    })
    const back = snapshotToCustomerRow(snap)

    expect(back).toEqual(original)
  })

  it("DB가 numeric을 문자열로 돌려줘도 number로 강제 변환한다", () => {
    const back = snapshotToCustomerRow({
      account_id: "acc-2",
      name: "학원 B",
      owner_id: "o1",
      owner_name: "민재",
      phone: null,
      balance: "2500.50",
      expire_at: null,
      last_class_at: null,
      uid: null,
      order_amount: "99",
      order_count: "4",
      created_at: null,
      customer_updated_at: null,
      source_synced_at: null,
    })

    expect(back.balance).toBe(2500.5)
    expect(back.orderAmount).toBe(99)
    expect(back.orderCount).toBe(4)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/admin-crm/neo-crm-snapshot.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/admin-crm-customers-neo-rollup"` (모듈 미존재).

- [ ] **Step 3: rollup 모듈 구현**

`lib/admin-crm-customers-neo-rollup.ts`:

```typescript
// Neo CRM 고객 집계·매핑 순수 헬퍼.
// 라이브 계산(computeNeoCrmCustomersLive)과 스냅샷 읽기/쓰기가 공유한다.
// server-only / Supabase import 금지 — DB 없이 단위 테스트 가능해야 한다.
import type {
  NeoCrmCustomerOwnerOption,
  NeoCrmCustomerRow,
} from "@/lib/admin-crm-customers-neo"

const EXPIRING_SOON_DAYS = 60

// Supabase JS는 numeric을 number 또는 (정밀도 보존 시) string으로 돌려줄 수 있다.
export interface NeoCrmCustomerSnapshotRow {
  account_id: string
  name: string
  owner_id: string | null
  owner_name: string
  phone: string | null
  balance: number | string | null
  expire_at: string | null
  last_class_at: string | null
  uid: string | null
  order_amount: number | string | null
  order_count: number | string | null
  created_at: string | null
  customer_updated_at: string | null
  source_synced_at: string | null
}

export interface NeoCrmCustomerSummary {
  totalCount: number
  withEeoCount: number
  expiringSoonCount: number
  totalBalance: number
  totalOrderAmount: number
}

export interface SnapshotRowMeta {
  runId: string
  snapshotAt: string
  sourceSyncedAt: string | null
}

// 기존 getNeoCrmCustomers 의 인라인 summary 누적과 1:1 동치.
// withEeoCount: 기존 `if (eeo)` ⇔ row.balance != null (eeo 있으면 balance는 항상 number).
export function summarizeCustomers(
  rows: NeoCrmCustomerRow[],
  nowMs: number
): NeoCrmCustomerSummary {
  const expiringThresholdMs = nowMs + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
  let withEeoCount = 0
  let expiringSoonCount = 0
  let totalBalance = 0
  let totalOrderAmount = 0

  for (const row of rows) {
    if (row.balance != null) withEeoCount += 1
    if (row.expireAt) {
      const expMs = new Date(row.expireAt).getTime()
      if (expMs >= nowMs && expMs <= expiringThresholdMs) expiringSoonCount += 1
    }
    totalBalance += row.balance ?? 0
    totalOrderAmount += row.orderAmount
  }

  return {
    totalCount: rows.length,
    withEeoCount,
    expiringSoonCount,
    totalBalance,
    totalOrderAmount,
  }
}

export function buildOwnerOptions(rows: NeoCrmCustomerRow[]): NeoCrmCustomerOwnerOption[] {
  const ownerCounts = new Map<string, { ownerName: string; count: number }>()
  for (const row of rows) {
    if (!row.ownerId) continue
    const existing = ownerCounts.get(row.ownerId) ?? { ownerName: row.ownerName, count: 0 }
    existing.count += 1
    ownerCounts.set(row.ownerId, existing)
  }
  return Array.from(ownerCounts.entries())
    .map(([ownerId, value]) => ({ ownerId, ownerName: value.ownerName, count: value.count }))
    .sort((a, b) => b.count - a.count)
}

function buildSearchText(row: NeoCrmCustomerRow): string {
  return [row.name, row.uid, row.phone, row.ownerName]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
}

export function customerRowToSnapshot(row: NeoCrmCustomerRow, meta: SnapshotRowMeta) {
  return {
    account_id: row.accountId,
    name: row.name,
    owner_id: row.ownerId,
    owner_name: row.ownerName,
    phone: row.phone,
    balance: row.balance,
    expire_at: row.expireAt,
    last_class_at: row.lastClassAt,
    uid: row.uid,
    order_amount: row.orderAmount,
    order_count: row.orderCount,
    created_at: row.createdAt,
    customer_updated_at: row.updatedAt,
    search_text: buildSearchText(row),
    snapshot_run_id: meta.runId,
    source_synced_at: meta.sourceSyncedAt,
    snapshot_at: meta.snapshotAt,
  }
}

export function snapshotToCustomerRow(row: NeoCrmCustomerSnapshotRow): NeoCrmCustomerRow {
  return {
    accountId: row.account_id,
    name: row.name,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    phone: row.phone,
    balance: row.balance == null ? null : Number(row.balance),
    expireAt: row.expire_at,
    lastClassAt: row.last_class_at,
    uid: row.uid,
    orderAmount: Number(row.order_amount ?? 0),
    orderCount: Number(row.order_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.customer_updated_at,
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/admin-crm/neo-crm-snapshot.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 린트 확인**

Run: `npx eslint lib/admin-crm-customers-neo-rollup.ts tests/admin-crm/neo-crm-snapshot.test.ts --max-warnings=0`
Expected: 출력 없음(통과).

- [ ] **Step 6: Commit**

```bash
git add lib/admin-crm-customers-neo-rollup.ts tests/admin-crm/neo-crm-snapshot.test.ts
git commit -m "feat(crm): neo crm 고객 집계·매핑 순수 rollup 모듈 + 테스트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 라이브 계산 추출 + 스냅샷 읽기 경로

기존 `getNeoCrmCustomers` 본문을 `computeNeoCrmCustomersLive`로 옮기고(인라인 summary/owners 누적을 rollup 헬퍼로 교체), `getNeoCrmCustomers`를 스냅샷-읽기+폴백으로 재작성한다. 응답 shape/타입은 그대로라 라우트·클라는 무변경.

**Files:**
- Modify: `lib/admin-crm-customers-neo.ts`

- [ ] **Step 1: import 추가 + 미사용 상수 제거**

`lib/admin-crm-customers-neo.ts` 상단 import 블록 끝(`fetchSupabasePages` import 다음)에 추가:

```typescript
import {
  buildOwnerOptions,
  snapshotToCustomerRow,
  summarizeCustomers,
  type NeoCrmCustomerSnapshotRow,
} from "@/lib/admin-crm-customers-neo-rollup"
```

상수 영역에서 `const EXPIRING_SOON_DAYS = 60` 줄을 **삭제**한다(rollup으로 이동). `const SCAN_LIMIT = 5000` 아래에 추가:

```typescript
const SNAPSHOT_SCAN_LIMIT = 50000
const SNAPSHOT_SELECT =
  "account_id, name, owner_id, owner_name, phone, balance, expire_at, last_class_at, uid, order_amount, order_count, created_at, customer_updated_at, source_synced_at"
```

- [ ] **Step 2: `getNeoCrmCustomers` 함수 전체를 아래 두 함수로 교체**

현재 `export async function getNeoCrmCustomers(): Promise<NeoCrmCustomerList> { ... }` 블록(본문 전체)을 다음으로 **대체**:

```typescript
// 스냅샷이 없거나(미적용/첫 sync 전) 비면 호출되는 라이브 계산.
// 동기화 시점 스냅샷 적재(refreshNeoCrmCustomerSnapshot)도 이 함수를 쓴다 →
// 같은 코드가 양쪽을 계산하므로 per-고객 숫자가 정의상 일치한다.
export async function computeNeoCrmCustomersLive(): Promise<NeoCrmCustomerList> {
  const sb = createSupabaseAdminClient()
  const generatedAt = new Date().toISOString()

  const empty: NeoCrmCustomerList = {
    ok: false,
    error: null,
    latestSyncedAt: null,
    generatedAt,
    summary: { totalCount: 0, withEeoCount: 0, expiringSoonCount: 0, totalBalance: 0, totalOrderAmount: 0 },
    owners: [],
    rows: [],
  }

  const [accountResult, shroffResult, opportunityResult, ownerNames, excludedOwnerIds, latestResult] =
    await Promise.all([
      fetchExternalCrmRows<AccountRecord>(
        sb,
        "account",
        "external_id, display_name, owner_name, occurred_at, payload"
      ),
      fetchExternalCrmRows<ShroffRecord>(sb, "ShroffAccount__c", "payload"),
      fetchExternalCrmRows<OpportunityRecord>(sb, "opportunity", "amount, payload"),
      getXiaoshouyiOwnerNameMap(sb),
      getExcludedXiaoshouyiOwnerIds(sb),
      sb
        .from("external_crm_records")
        .select("synced_at")
        .eq("source_system", "xiaoshouyi")
        .order("synced_at", { ascending: false })
        .limit(1),
    ])

  if (accountResult.error) {
    return { ...empty, error: `external_crm_records(account): ${accountResult.error.message}` }
  }

  // EEO(ShroffAccount) aggregated by linked Account__c id.
  const eeoByAccount = new Map<string, { balance: number; expireAt: string | null; lastClassAt: string | null; uid: string | null }>()
  for (const row of (shroffResult.error ? [] : shroffResult.data ?? []) as ShroffRecord[]) {
    const accountId = payloadString(row.payload, "Account__c")
    if (!accountId) continue
    const balance = payloadNumber(row.payload, "CurrencyAmount__c") ?? 0
    const expireAt = toIso(row.payload?.["expireTime__c"])
    const lastClassAt = toIso(row.payload?.["LastClassDate__c"])
    const uid = payloadString(row.payload, "uid__c")
    const existing = eeoByAccount.get(accountId)
    if (!existing) {
      eeoByAccount.set(accountId, { balance, expireAt, lastClassAt, uid })
    } else {
      existing.balance += balance
      if (expireAt && (!existing.expireAt || expireAt < existing.expireAt)) existing.expireAt = expireAt
      if (lastClassAt && (!existing.lastClassAt || lastClassAt > existing.lastClassAt)) existing.lastClassAt = lastClassAt
      if (!existing.uid && uid) existing.uid = uid
    }
  }

  // Opportunity (order) aggregated by accountId.
  const orderByAccount = new Map<string, { amount: number; count: number }>()
  for (const row of (opportunityResult.error ? [] : opportunityResult.data ?? []) as OpportunityRecord[]) {
    const accountId = payloadString(row.payload, "accountId")
    if (!accountId) continue
    const amount = Number(row.amount) || 0
    const existing = orderByAccount.get(accountId) ?? { amount: 0, count: 0 }
    existing.amount += amount
    existing.count += 1
    orderByAccount.set(accountId, existing)
  }

  const rows: NeoCrmCustomerRow[] = []
  for (const account of (accountResult.data ?? []) as AccountRecord[]) {
    const ownerId = account.owner_name?.trim() || null
    // 중국팀 등 제외 owner의 고객은 한국팀 고객 목록에서 제외.
    if (ownerId && excludedOwnerIds.has(ownerId)) continue

    const accountId = account.external_id
    const eeo = eeoByAccount.get(accountId)
    const order = orderByAccount.get(accountId)
    const ownerName = resolveOwnerName(ownerId, ownerNames)

    rows.push({
      accountId,
      name: account.display_name ?? payloadString(account.payload, "accountName") ?? accountId,
      ownerId,
      ownerName,
      phone: payloadString(account.payload, "phone"),
      balance: eeo ? eeo.balance : null,
      expireAt: eeo?.expireAt ?? null,
      lastClassAt: eeo?.lastClassAt ?? null,
      uid: eeo?.uid ?? null,
      orderAmount: order?.amount ?? 0,
      orderCount: order?.count ?? 0,
      createdAt: toIso(account.payload?.["createdAt"]),
      updatedAt: account.occurred_at ?? toIso(account.payload?.["updatedAt"]),
    })
  }

  const summary = summarizeCustomers(rows, Date.now())
  const owners = buildOwnerOptions(rows)
  const latestRow = latestResult.error ? null : latestResult.data?.[0]

  return {
    ok: true,
    error: null,
    latestSyncedAt: latestRow && typeof latestRow.synced_at === "string" ? latestRow.synced_at : null,
    generatedAt,
    summary,
    owners,
    rows,
  }
}

// 읽기 경로: 사전조인된 스냅샷 1스캔. 테이블 없음/0행이면 라이브 폴백.
export async function getNeoCrmCustomers(): Promise<NeoCrmCustomerList> {
  const sb = createSupabaseAdminClient()
  const generatedAt = new Date().toISOString()

  const snapshot = await fetchSupabasePages<NeoCrmCustomerSnapshotRow>({
    maxRows: SNAPSHOT_SCAN_LIMIT,
    fetchPage: async (from, to) => {
      const { data, error, count } = await sb
        .from("neo_crm_customer_snapshot")
        .select(SNAPSHOT_SELECT)
        .range(from, to)
      return { data, error, count }
    },
  })

  // 적용 전/첫 sync 전/조회 오류 → 라이브 계산으로 폴백(비파괴).
  if (snapshot.error || snapshot.data.length === 0) {
    return computeNeoCrmCustomersLive()
  }

  const rows = snapshot.data.map(snapshotToCustomerRow)
  const summary = summarizeCustomers(rows, Date.now()) // 만료 임박은 읽기 시점 now로 정확히
  const owners = buildOwnerOptions(rows)
  const latestSyncedAt = snapshot.data.reduce<string | null>((latest, row) => {
    const value = row.source_synced_at
    if (!value) return latest
    return latest == null || value > latest ? value : latest
  }, null)

  return {
    ok: true,
    error: null,
    latestSyncedAt,
    generatedAt,
    summary,
    owners,
    rows,
  }
}
```

- [ ] **Step 3: 린트 확인 (미사용 변수 0)**

Run: `npx eslint lib/admin-crm-customers-neo.ts --max-warnings=0`
Expected: 출력 없음. (인라인 summary 누적 제거로 `EXPIRING_SOON_DAYS`/`nowMs` 등이 안 남아야 함 — 경고 시 잔여 미사용 코드 삭제.)

- [ ] **Step 4: rollup 테스트 재확인(회귀 없음)**

Run: `npx vitest run tests/admin-crm/neo-crm-snapshot.test.ts`
Expected: PASS (타입 export 경로 변화 없음 확인).

- [ ] **Step 5: Commit**

```bash
git add lib/admin-crm-customers-neo.ts
git commit -m "refactor(crm): 라이브 계산 추출 + 고객 목록 스냅샷 읽기/폴백

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 스냅샷 적재(쓰기) 모듈

동기화 시점에 `computeNeoCrmCustomersLive()`로 계산한 행을 run_id 원자 교체로 적재한다. 빈 결과로 양호한 스냅샷을 덮어쓰지 않도록 가드한다.

**Files:**
- Create: `lib/external-crm/neo-crm-snapshot.ts`

- [ ] **Step 1: 모듈 구현**

`lib/external-crm/neo-crm-snapshot.ts`:

```typescript
import "server-only"

import { randomUUID } from "node:crypto"

import { computeNeoCrmCustomersLive } from "@/lib/admin-crm-customers-neo"
import { customerRowToSnapshot } from "@/lib/admin-crm-customers-neo-rollup"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface NeoCrmCustomerSnapshotRefreshResult {
  ok: boolean
  rowCount: number
  error: string | null
}

const UPSERT_CHUNK = 500

// sync chain(하루 4회 cron + 수동) 끝에서 호출. 적재 실패/테이블 없음은
// 직전 스냅샷을 보존하고 no-op으로 끝나며, 읽기 경로가 라이브로 폴백한다.
export async function refreshNeoCrmCustomerSnapshot(): Promise<NeoCrmCustomerSnapshotRefreshResult> {
  try {
    const list = await computeNeoCrmCustomersLive()
    // 라이브 계산 실패 시 적재하지 않음 — 에러 결과로 양호한 스냅샷을 덮어쓰지 않는다.
    if (!list.ok) {
      return { ok: false, rowCount: 0, error: list.error ?? "live compute failed" }
    }
    // 0행은 의심스러운 상태(전수 실패 가능) — 기존 스냅샷을 비우지 않는다.
    if (list.rows.length === 0) {
      return { ok: true, rowCount: 0, error: null }
    }

    const sb = createSupabaseAdminClient()
    const runId = randomUUID()
    const snapshotAt = new Date().toISOString()

    const snapshotRows = list.rows.map((row) =>
      customerRowToSnapshot(row, { runId, snapshotAt, sourceSyncedAt: list.latestSyncedAt })
    )

    // upsert(in-place 갱신)는 행을 항상 유지 → 동시 읽기가 빈 결과를 보지 않는다.
    for (let i = 0; i < snapshotRows.length; i += UPSERT_CHUNK) {
      const chunk = snapshotRows.slice(i, i + UPSERT_CHUNK)
      const { error } = await sb
        .from("neo_crm_customer_snapshot")
        .upsert(chunk, { onConflict: "account_id" })
      if (error) {
        return { ok: false, rowCount: i, error: error.message }
      }
    }

    // 이번 run에 없는(=사라진) 고객 제거.
    const { error: deleteError } = await sb
      .from("neo_crm_customer_snapshot")
      .delete()
      .neq("snapshot_run_id", runId)
    if (deleteError) {
      return { ok: false, rowCount: snapshotRows.length, error: deleteError.message }
    }

    return { ok: true, rowCount: snapshotRows.length, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[neo-crm-snapshot] refresh failed", error)
    return { ok: false, rowCount: 0, error: message }
  }
}
```

- [ ] **Step 2: 린트 + 타입(빌드) 확인**

Run: `npx eslint lib/external-crm/neo-crm-snapshot.ts --max-warnings=0`
Expected: 출력 없음.

- [ ] **Step 3: Commit**

```bash
git add lib/external-crm/neo-crm-snapshot.ts
git commit -m "feat(crm): 동기화 시점 고객 스냅샷 적재 모듈

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 동기화 체인 훅

`runExternalCrmSyncChain`에서 sync 성공 시 candidates 생성 뒤 스냅샷 갱신을 호출한다. 수동 동기화도 같은 chain을 타므로 자동 커버된다.

**Files:**
- Modify: `lib/external-crm/sync-chain.ts`

- [ ] **Step 1: import 추가**

`lib/external-crm/sync-chain.ts`의 import 블록(`generateExternalCrmLinkCandidates` import 다음)에 추가:

```typescript
import {
  type NeoCrmCustomerSnapshotRefreshResult,
  refreshNeoCrmCustomerSnapshot,
} from "@/lib/external-crm/neo-crm-snapshot"
```

- [ ] **Step 2: 결과 타입 확장**

`ExternalCrmSyncChainResult` 인터페이스에 필드 추가:

```typescript
export interface ExternalCrmSyncChainResult {
  sync: ExternalCrmSyncResult
  candidates?: GenerateExternalCrmLinkCandidatesResult
  candidatesError?: string
  snapshot?: NeoCrmCustomerSnapshotRefreshResult
  snapshotError?: string
}
```

- [ ] **Step 3: 훅 호출 추가**

`runExternalCrmSyncChain` 의 `if (sync.ok && !sync.skipped) { ... }` 블록 안, candidates try/catch **다음**에 추가:

```typescript
    try {
      result.snapshot = await refreshNeoCrmCustomerSnapshot()
    } catch (error) {
      result.snapshotError = error instanceof Error ? error.message : String(error)
      console.error("[external-crm sync-chain] neo crm snapshot refresh failed", error)
    }
```

(블록 전체가 다음 형태가 된다:)

```typescript
  if (sync.ok && !sync.skipped) {
    try {
      result.candidates = await generateExternalCrmLinkCandidates()
    } catch (error) {
      result.candidatesError = error instanceof Error ? error.message : String(error)
      console.error("[external-crm sync-chain] candidate generation failed", error)
    }

    try {
      result.snapshot = await refreshNeoCrmCustomerSnapshot()
    } catch (error) {
      result.snapshotError = error instanceof Error ? error.message : String(error)
      console.error("[external-crm sync-chain] neo crm snapshot refresh failed", error)
    }
  }
```

- [ ] **Step 4: 린트 확인**

Run: `npx eslint lib/external-crm/sync-chain.ts --max-warnings=0`
Expected: 출력 없음.

- [ ] **Step 5: Commit**

```bash
git add lib/external-crm/sync-chain.ts
git commit -m "feat(crm): 동기화 체인에 고객 스냅샷 갱신 훅 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 전체 품질 게이트 + 롤아웃 검증

**Files:** (코드 변경 없음 — 검증/적용만)

- [ ] **Step 1: 전체 단위 테스트**

Run: `npx vitest run tests/admin-crm/neo-crm-snapshot.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 2: 린트 게이트**

Run: `npx eslint app components lib --max-warnings=0`
Expected: 출력 없음(통과).

- [ ] **Step 3: 빌드 게이트**

Run: `npm run build`
Expected: 빌드 성공(타입/페이지 컴파일 통과).

- [ ] **Step 4: 마이그레이션 적용**

Supabase에 `supabase/migrations/20260618_neo_crm_customer_snapshot.sql` 적용(프로젝트의 마이그레이션 적용 절차대로). 적용 전에도 앱은 라이브 폴백으로 동작하므로 코드 머지와 순서 무관.
적용 확인: `SELECT count(*) FROM public.neo_crm_customer_snapshot;` → 0행(아직 미적재).

- [ ] **Step 5: 최초 적재(수동 동기화 1회)**

어드민 수동 동기화(`POST /api/admin/crm/external-sync`)를 1회 트리거 → sync chain이 `refreshNeoCrmCustomerSnapshot`을 실행.
확인: `SELECT count(*) FROM public.neo_crm_customer_snapshot;` → 고객 수만큼(>0) 적재.

- [ ] **Step 6: 숫자 정합(스냅샷 vs 라이브 폴백) 비교**

같은 엔드포인트를 두 모드로 비교한다(어드민 세션으로):
1. **스냅샷 모드**: 어드민 고객 화면 로드 → KPI(고객 수/만료 임박/총 잔액/총 오더)와 상위 몇 행 기록.
2. **폴백 모드 강제**: `DELETE FROM public.neo_crm_customer_snapshot;` 후 같은 화면 새로고침(`force`) → 라이브 계산 결과.
3. KPI 4종(totalCount/expiringSoonCount/totalBalance/totalOrderAmount)과 상위 행의 잔액/오더/만료가 **일치**하는지 확인. (날짜는 timestamptz 직렬화 차이로 `+00:00` vs `Z` 표기만 다를 수 있음 → 같은 순간이면 정합. `new Date()` 파싱 기준으로 비교.)
4. 확인 후 다시 수동 동기화 1회로 스냅샷 재적재(스냅샷 모드 복귀).

- [ ] **Step 7: (선택) 정합 확인 결과를 메모리에 기록**

스냅샷 vs 라이브 KPI가 일치했으면 회귀 0 확인. 프로젝트 메모리(`project_perf_optimization_2026-06.md`)에 "neo crm 고객 스냅샷 완료 + 정합 확인" 한 줄 갱신.

---

## Self-Review (작성자 점검 결과)

**Spec coverage:**
- 스냅샷 테이블(컬럼/인덱스/RLS) → Task 1 ✓
- 빌더 = computeNeoCrmCustomersLive 재사용 + run_id 원자 교체 + 빈결과 가드 → Task 4 ✓
- summary/owners/매핑 공유 헬퍼 → Task 2 ✓
- 읽기 = 스냅샷 1쿼리 + 폴백, 응답 shape 동일 → Task 3 ✓
- 동기화 훅(cron+수동) → Task 5 ✓
- 검증(파리티/품질 게이트/멱등/롤아웃) → Task 1 Step2, Task 6 ✓
- 비범위(서버 페이지네이션, detail 무변경) 준수 ✓

**Placeholder scan:** 모든 코드 스텝에 실제 코드/명령/기대출력 포함. TBD/“적절히 처리” 없음. ✓

**Type consistency:** `NeoCrmCustomerRow`/`NeoCrmCustomerOwnerOption`/`NeoCrmCustomerList`(기존, 변경 없음), `NeoCrmCustomerSnapshotRow`/`NeoCrmCustomerSummary`/`SnapshotRowMeta`(rollup), `NeoCrmCustomerSnapshotRefreshResult`(snapshot) 명명이 Task 2/3/4/5에서 일관. `computeNeoCrmCustomersLive`/`getNeoCrmCustomers`/`refreshNeoCrmCustomerSnapshot`/`summarizeCustomers`/`buildOwnerOptions`/`customerRowToSnapshot`/`snapshotToCustomerRow` 시그니처가 정의처와 호출처에서 일치. ✓

**런타임 순환 의존:** admin-crm-customers-neo → rollup(런타임), rollup → admin(타입 전용, 소거), neo-crm-snapshot → {admin, rollup}, sync-chain → neo-crm-snapshot. 사이클 없음. ✓
