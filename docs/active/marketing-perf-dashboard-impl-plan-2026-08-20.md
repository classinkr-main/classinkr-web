# 마케팅 퍼포먼스 대시보드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캠페인 허브 요약 탭을 퍼포먼스 마케팅 대시보드로 재구축 — 데이터 스파인(일자별 스냅샷+Supabase 이전) → 대시보드 UI → AI 레이어(주간 브리핑·이상 감지·카피 제안).

**Architecture:** 스펙 = [marketing-performance-dashboard-design-2026-08-20.md](marketing-performance-dashboard-design-2026-08-20.md). Meta Graph `time_increment=1`로 일자별 지표를 `meta_insights_daily`에 적재(크론 trailing 3일 upsert + 12개월 백필), 수기 저장소 2개(event-metrics·channel-budgets)를 JSON→Supabase로 이전해 프로덕션 쓰기 차단을 해소, 그 위에 단일 집계 API(`/api/admin/marketing/perf`)와 재구축된 SummaryTab을 올린다. AI는 `lib/branch/insights/*` 패턴 미러(Gemini JSON 스키마 강제+숫자 검증).

**Tech Stack:** Next.js(App Router)·Supabase(admin 클라이언트, RLS deny-all)·Recharts(기존 viz 프리미티브)·Gemini(generativelanguage v1beta)·vitest.

**공통 규칙 (모든 태스크):**
- 정직 규칙: 종합 ROAS/채널 ROI 필드 금지, Meta USD 네이티브(KRW 폴딩 금지), 매출 null≠0.
- 커밋은 **파일 스코프 지정** (`git add <파일들>` — `git add -A` 절대 금지, 공유 워크트리에 타 세션 WIP 상존).
- 게이트: `npm run typecheck && npm run lint && npm run build` (3줄 정본) + 신규 테스트 `npx vitest run tests/campaigns`. tests/branch 등 선존 실패는 무관 — **신규 실패만 0이면 통과**.
- 워크트리에서 build 시 `.env.local` 심링크 필요.
- 마이그레이션은 파일 작성까지가 코드 작업 — 라이브 적용은 Supabase 대시보드 SQL Editor 수동(레포에 CLI/psql 없음). 미적용 상태에서 화면은 그레이스풀 강등(빈 상태+안내)이어야 한다.

---

## Phase 1 — 데이터 스파인

### Task 1.1: 마이그레이션 5개 작성

**Files:**
- Create: `supabase/migrations/20260820_meta_insights_daily.sql`
- Create: `supabase/migrations/20260820_marketing_campaign_updates.sql`
- Create: `supabase/migrations/20260820_marketing_insights.sql`
- Create: `supabase/migrations/20260820_event_metrics.sql`
- Create: `supabase/migrations/20260820_channel_budgets.sql`

모든 파일은 `20260724_marketing_campaigns.sql` 패턴(idempotent `IF NOT EXISTS`, RLS ENABLE + 정책 없음 = admin-only deny-all, 상단 목적 주석)을 따른다.

- [ ] **Step 1: 20260820_meta_insights_daily.sql 작성**

```sql
-- Meta 캠페인 일자별 성과 스냅샷 — 크론(sync-meta-insights)이 trailing 3일 upsert,
-- scripts/backfill-meta-insights.mjs 가 과거 12개월 1회 백필한다.
-- date 는 Meta insights 의 date_start(광고 계정 타임존 기준 일자) 그대로 저장.
-- spend 는 계정 통화 네이티브(currency 컬럼) — KRW 환산 금지(정직 규칙).
CREATE TABLE IF NOT EXISTS public.meta_insights_daily (
  date          DATE NOT NULL,
  campaign_id   TEXT NOT NULL,
  campaign_name TEXT,
  spend         NUMERIC NOT NULL DEFAULT 0,
  impressions   BIGINT NOT NULL DEFAULT 0,
  reach         BIGINT NOT NULL DEFAULT 0,
  clicks        BIGINT NOT NULL DEFAULT 0,
  ctr           NUMERIC,
  cpc           NUMERIC,
  cpm           NUMERIC,
  leads         INTEGER NOT NULL DEFAULT 0,
  currency      TEXT,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_insights_daily_date
  ON public.meta_insights_daily (date);

ALTER TABLE public.meta_insights_daily ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: 20260820_marketing_campaign_updates.sql 작성**

```sql
-- 우산 캠페인(D1) 수동 진행상황 로그 — 스코어보드 최근 1줄·업데이트 피드·상세 타임라인의 원천.
CREATE TABLE IF NOT EXISTS public.marketing_campaign_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'note'
                CHECK (kind IN ('note', 'change', 'milestone')),
  body        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_updates_campaign
  ON public.marketing_campaign_updates (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_updates_created
  ON public.marketing_campaign_updates (created_at DESC);

ALTER TABLE public.marketing_campaign_updates ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: 20260820_marketing_insights.sql 작성**

```sql
-- 마케팅 AI 주간 브리핑 저장 — lib/branch/insights 의 branch_insights 패턴 미러.
-- digest = 입력 정규화 해시(같은 입력 재호출 방지), payload = {highlights, next_actions, anomalies}.
CREATE TABLE IF NOT EXISTS public.marketing_insights (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      TEXT NOT NULL DEFAULT 'weekly',
  digest     TEXT NOT NULL,
  headline   TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  model      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_insights_scope
  ON public.marketing_insights (scope, created_at DESC);

ALTER TABLE public.marketing_insights ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: 20260820_event_metrics.sql 작성**

```sql
-- 행사 수기 성과 — data/event-metrics.json(로컬 JSON, 프로덕션 쓰기 차단) 대체.
-- metrics 는 lib/types/event-metrics.ts 의 EventMetrics 형태(JSONB) 그대로 보존한다.
CREATE TABLE IF NOT EXISTS public.event_metrics (
  event_id   TEXT PRIMARY KEY,
  metrics    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_metrics ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 5: 20260820_channel_budgets.sql 작성**

```sql
-- 채널별 배정 예산(KRW) — data/channel-budgets.json 대체. 채널 enum 은
-- lib/types/event-metrics.ts AD_CHANNELS(7종)와 동일하게 CHECK 로 고정한다.
CREATE TABLE IF NOT EXISTS public.channel_budgets (
  channel    TEXT PRIMARY KEY
               CHECK (channel IN ('google', 'meta', 'naver', 'kakao', 'youtube', 'offline', 'other')),
  amount     BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_budgets ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260820_meta_insights_daily.sql supabase/migrations/20260820_marketing_campaign_updates.sql supabase/migrations/20260820_marketing_insights.sql supabase/migrations/20260820_event_metrics.sql supabase/migrations/20260820_channel_budgets.sql
git commit -m "feat(marketing): 퍼포먼스 대시보드 스파인 마이그 5종"
```

---

### Task 1.2: Meta 일자별 insights fetch + 예산 필드 (lib/meta/marketing.ts 확장)

**Files:**
- Modify: `lib/meta/marketing.ts`
- Test: `tests/campaigns/meta-daily-map.test.ts` (신규)

vitest는 `server-only`를 `tests/__mocks__/server-only.ts`로 alias하므로 이 모듈을 직접 import해 테스트할 수 있다.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/campaigns/meta-daily-map.test.ts`

```ts
import { describe, expect, it } from "vitest"
import { mapDailyInsightRow, normalizeBudgetAmount } from "@/lib/meta/marketing"

describe("mapDailyInsightRow", () => {
  it("정상 행을 도메인 행으로 변환한다 (leads 는 actions 에서 파생)", () => {
    const row = mapDailyInsightRow({
      date_start: "2026-08-18",
      date_stop: "2026-08-18",
      campaign_id: "123",
      campaign_name: "여름특강",
      spend: "42.5",
      impressions: "1000",
      reach: "800",
      clicks: "50",
      ctr: "5",
      cpc: "0.85",
      cpm: "42.5",
      actions: [{ action_type: "lead", value: "7" }],
    })
    expect(row).toEqual({
      date: "2026-08-18",
      campaignId: "123",
      campaignName: "여름특강",
      spend: 42.5,
      impressions: 1000,
      reach: 800,
      clicks: 50,
      ctr: 5,
      cpc: 0.85,
      cpm: 42.5,
      leads: 7,
    })
  })

  it("campaign_id 또는 date_start 가 없으면 null", () => {
    expect(mapDailyInsightRow({ campaign_id: "1" })).toBeNull()
    expect(mapDailyInsightRow({ date_start: "2026-08-18" })).toBeNull()
  })

  it("빈 지표는 0/null 로 정규화한다", () => {
    const row = mapDailyInsightRow({ date_start: "2026-08-18", campaign_id: "1" })
    expect(row).toMatchObject({ spend: 0, impressions: 0, leads: 0, ctr: null, cpc: null })
  })
})

describe("normalizeBudgetAmount", () => {
  it("USD 는 100 오프셋(센트→달러)", () => {
    expect(normalizeBudgetAmount("50000", "USD")).toBe(500)
  })
  it("KRW 는 오프셋 1", () => {
    expect(normalizeBudgetAmount("500000", "KRW")).toBe(500000)
  })
  it("0 이하·비수치는 null", () => {
    expect(normalizeBudgetAmount("0", "USD")).toBeNull()
    expect(normalizeBudgetAmount(undefined, "USD")).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/campaigns/meta-daily-map.test.ts`
Expected: FAIL — `mapDailyInsightRow`/`normalizeBudgetAmount` export 없음.

- [ ] **Step 3: lib/meta/marketing.ts 구현**

(a) `MetaCampaignApiRow`에 예산 필드 추가:

```ts
interface MetaCampaignApiRow {
  // ...기존 필드 유지...
  lifetime_budget?: string
  daily_budget?: string
}
```

(b) `MetaCampaignRow`에 정규화된 예산 추가(계정 통화 단위):

```ts
export interface MetaCampaignRow {
  // ...기존 필드 유지...
  lifetimeBudget: number | null
  dailyBudget: number | null
  insights: { /* 기존 그대로 */ }
}
```

(c) 통화 오프셋 헬퍼 + export (Meta 예산 필드는 통화 최소 단위 — 무소수점 통화는 오프셋 1):

```ts
// Meta 예산 필드(lifetime_budget 등)는 통화 최소 단위 문자열이다.
// 무소수점 통화(KRW·JPY 등)는 오프셋 1, 그 외 기본 100(센트).
const CURRENCY_MINOR_UNIT_OFFSET: Record<string, number> = { KRW: 1, JPY: 1, TWD: 1, VND: 1 }

export function normalizeBudgetAmount(raw: unknown, currency: string | null | undefined): number | null {
  const value = toNumber(raw)
  if (value <= 0) return null
  const offset = (currency && CURRENCY_MINOR_UNIT_OFFSET[currency]) || 100
  return value / offset
}
```

(d) `fetchMetaCampaignDashboard`의 campaigns fields 문자열에 `lifetime_budget,daily_budget` 추가하고, 매핑에 반영:

```ts
    metaGet<MetaPagingResponse<MetaCampaignApiRow>>(`${accountId}/campaigns`, {
      fields:
        "id,name,status,effective_status,objective,buying_type,created_time,updated_time,start_time,stop_time,lifetime_budget,daily_budget",
      limit,
    }),
```

```ts
  const campaigns = (campaignResponse.data ?? []).map((campaign): MetaCampaignRow => {
    const insight = insightByCampaign.get(campaign.id)
    return {
      // ...기존 매핑 유지...
      lifetimeBudget: normalizeBudgetAmount(campaign.lifetime_budget, account.currency),
      dailyBudget: normalizeBudgetAmount(campaign.daily_budget, account.currency),
      insights: { /* 기존 그대로 */ },
    }
  })
```

(e) 일자별 insights 타입·매핑·fetch (파일 하단에 추가):

```ts
/* ─── 일자별 insights (meta_insights_daily 스냅샷용) ─────────── */

export interface MetaDailyInsightRow {
  date: string          // date_start — 광고 계정 타임존 기준 일자
  campaignId: string
  campaignName: string | null
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number | null
  cpc: number | null
  cpm: number | null
  leads: number
}

interface MetaDailyInsightApiRow extends MetaInsightApiRow {
  date_start?: string
  date_stop?: string
}

interface MetaCursorPaging {
  paging?: { cursors?: { after?: string }; next?: string }
}

export function mapDailyInsightRow(row: MetaDailyInsightApiRow): MetaDailyInsightRow | null {
  if (!row.campaign_id || !row.date_start) return null
  return {
    date: row.date_start,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name ?? null,
    spend: toNumber(row.spend),
    impressions: toNumber(row.impressions),
    reach: toNumber(row.reach),
    clicks: toNumber(row.clicks),
    ctr: toNullableNumber(row.ctr),
    cpc: toNullableNumber(row.cpc),
    cpm: toNullableNumber(row.cpm),
    leads: extractLeads(row.actions),
  }
}

/**
 * 캠페인 레벨 일자별 insights — time_increment=1 로 [since, until](YYYY-MM-DD, inclusive)
 * 범위를 조회한다. 행 수 = 일수 × 캠페인 수라 커서 페이징을 따라간다(안전 상한 20페이지).
 */
export async function fetchMetaDailyInsights({
  since,
  until,
}: {
  since: string
  until: string
}): Promise<{ rows: MetaDailyInsightRow[]; currency: string | null }> {
  const accountId = getAdAccountId()
  const account = await getMetaAdAccountStatus()
  const rows: MetaDailyInsightRow[] = []
  let after: string | undefined

  for (let page = 0; page < 20; page += 1) {
    const response = await metaGet<MetaPagingResponse<MetaDailyInsightApiRow> & MetaCursorPaging>(
      `${accountId}/insights`,
      {
        level: "campaign",
        fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
        time_increment: 1,
        time_range: JSON.stringify({ since, until }),
        limit: 500,
        after,
      }
    )
    for (const raw of response.data ?? []) {
      const mapped = mapDailyInsightRow(raw)
      if (mapped) rows.push(mapped)
    }
    after = response.paging?.next ? response.paging?.cursors?.after : undefined
    if (!after) break
  }

  return { rows, currency: account.currency ?? null }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/campaigns/meta-daily-map.test.ts`
Expected: PASS (테스트 3+3개)

- [ ] **Step 5: 커밋**

```bash
git add lib/meta/marketing.ts tests/campaigns/meta-daily-map.test.ts
git commit -m "feat(meta): 일자별 insights fetch + 캠페인 예산 필드"
```

---

### Task 1.3: meta-insights-daily 저장소

**Files:**
- Create: `lib/repositories/meta-insights-daily.ts`

- [ ] **Step 1: 저장소 작성** — `lib/repositories/marketing-campaigns.ts`의 admin 클라이언트 패턴을 따른다(RLS deny-all이므로 반드시 `createSupabaseAdminClient`).

```ts
// lib/repositories/meta-insights-daily.ts
// Meta 캠페인 일자별 스냅샷(meta_insights_daily) — 크론이 쓰고 perf API 가 읽는다.
// RLS admin-only(deny-all) — 반드시 admin(service-role) 클라이언트로만 접근.

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { MetaDailyInsightRow } from "@/lib/meta/marketing"

const sb = () => createSupabaseAdminClient()

export interface MetaInsightsDailyRecord extends MetaDailyInsightRow {
  currency: string | null
  syncedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRecord(row: any): MetaInsightsDailyRecord {
  return {
    date: row.date,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name ?? null,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    ctr: row.ctr != null ? Number(row.ctr) : null,
    cpc: row.cpc != null ? Number(row.cpc) : null,
    cpm: row.cpm != null ? Number(row.cpm) : null,
    leads: Number(row.leads ?? 0),
    currency: row.currency ?? null,
    syncedAt: row.synced_at,
  }
}

/** (date, campaign_id) upsert — 백필 대비 500행 청크. 반환 = 처리 행 수. */
export async function upsertMetaInsightsDaily(
  rows: MetaDailyInsightRow[],
  currency: string | null
): Promise<number> {
  if (rows.length === 0) return 0
  const payload = rows.map((r) => ({
    date: r.date,
    campaign_id: r.campaignId,
    campaign_name: r.campaignName,
    spend: r.spend,
    impressions: r.impressions,
    reach: r.reach,
    clicks: r.clicks,
    ctr: r.ctr,
    cpc: r.cpc,
    cpm: r.cpm,
    leads: r.leads,
    currency,
    synced_at: new Date().toISOString(),
  }))
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await sb()
      .from("meta_insights_daily")
      .upsert(payload.slice(i, i + 500), { onConflict: "date,campaign_id" })
    if (error) throw new Error(`[meta-insights-daily] upsert 실패: ${error.message}`)
  }
  return payload.length
}

/** [since, until] (YYYY-MM-DD, inclusive) 범위 조회 — date asc. */
export async function getMetaInsightsDailyRange(
  since: string,
  until: string
): Promise<MetaInsightsDailyRecord[]> {
  const { data, error } = await sb()
    .from("meta_insights_daily")
    .select("*")
    .gte("date", since)
    .lte("date", until)
    .order("date", { ascending: true })
  if (error) throw new Error(`[meta-insights-daily] 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToRecord)
}

/** 최신 synced_at (대시보드 "스냅샷 시각" 표기용). 행 없으면 null. */
export async function getLatestSyncedAt(): Promise<string | null> {
  const { data, error } = await sb()
    .from("meta_insights_daily")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
  if (error) return null
  return data?.[0]?.synced_at ?? null
}
```

- [ ] **Step 2: 타입 확인**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add lib/repositories/meta-insights-daily.ts
git commit -m "feat(marketing): meta_insights_daily 저장소"
```

---

### Task 1.4: 일간 동기화 크론 + vercel.json

**Files:**
- Create: `app/api/cron/sync-meta-insights/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: 크론 라우트 작성** — 인증 패턴은 `app/api/cron/sync-branch-insights/route.ts`와 동일(x-vercel-cron + CRON_SECRET Bearer).

```ts
import { NextRequest, NextResponse } from "next/server"
import { fetchMetaDailyInsights } from "@/lib/meta/marketing"
import { upsertMetaInsightsDaily } from "@/lib/repositories/meta-insights-daily"

export const maxDuration = 60

// KST 기준 YYYY-MM-DD (en-CA 로케일 = ISO 날짜 포맷)
function kstDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d)
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL && !req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    // Meta 는 최근 지표를 소급 정정하므로 trailing 3일을 매일 재적재(upsert)한다.
    const since = kstDate(-3)
    const until = kstDate(0)
    const { rows, currency } = await fetchMetaDailyInsights({ since, until })
    const upserted = await upsertMetaInsightsDaily(rows, currency)
    return NextResponse.json({ since, until, fetched: rows.length, upserted })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: vercel.json 크론 추가** — crons 배열 끝에 (20:50 UTC = 05:50 KST, 하루 1회 — Hobby 제약 준수):

```json
    {
      "path": "/api/cron/sync-meta-insights",
      "schedule": "50 20 * * *"
    }
```

- [ ] **Step 3: 크론 검사 통과 확인** (prebuild 게이트와 동일 스크립트)

Run: `npm run check:vercel-crons`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add app/api/cron/sync-meta-insights/route.ts vercel.json
git commit -m "feat(marketing): Meta 일자별 지표 동기화 크론 (trailing 3일 upsert)"
```

---

### Task 1.5: 12개월 백필 스크립트

**Files:**
- Create: `scripts/backfill-meta-insights.mjs`

`lib/`는 `server-only` import 때문에 스크립트에서 직접 못 쓴다 — `tmp/db-probe*.mjs` 패턴대로 standalone .mjs(자체 Graph fetch + supabase-js). 실행: `node --env-file=.env.local scripts/backfill-meta-insights.mjs`.

- [ ] **Step 1: 스크립트 작성**

```js
// scripts/backfill-meta-insights.mjs
// Meta 캠페인 일자별 insights 12개월 백필 → meta_insights_daily upsert.
// 실행: node --env-file=.env.local scripts/backfill-meta-insights.mjs [--months 12]
// lib/ 는 server-only 라 import 불가 — Graph 호출·매핑을 자체 포함한다(lib/meta/marketing.ts 와 동일 로직).
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "node:crypto"

const MONTHS = Number(process.argv.find((a, i) => process.argv[i - 1] === "--months") ?? 12)
const VERSION = process.env.META_GRAPH_API_VERSION?.trim() || "v25.0"
const TOKEN = process.env.META_ACCESS_TOKEN?.trim() || process.env.META_CAPI_ACCESS_TOKEN?.trim()
const RAW_ACCOUNT = process.env.META_AD_ACCOUNT_ID?.trim()
const APP_SECRET = process.env.META_APP_SECRET?.trim()
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!TOKEN || !RAW_ACCOUNT) throw new Error("META_ACCESS_TOKEN / META_AD_ACCOUNT_ID 필요")
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase URL / service key 필요")

const ACCOUNT = RAW_ACCOUNT.startsWith("act_") ? RAW_ACCOUNT : `act_${RAW_ACCOUNT}`
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function graphUrl(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VERSION}/${path}`)
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.set(k, String(v))
  if (APP_SECRET) {
    url.searchParams.set("appsecret_proof", createHmac("sha256", APP_SECRET).update(TOKEN).digest("hex"))
  }
  return url
}

async function graphGet(path, params) {
  const res = await fetch(graphUrl(path, params), { headers: { Authorization: `Bearer ${TOKEN}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Graph ${res.status}: ${body.error?.message ?? "unknown"}`)
  return body
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const nnum = (v) => (num(v) > 0 ? num(v) : null)
function extractLeads(actions = []) {
  const rows = actions.map((a) => ({ type: (a.action_type ?? "").toLowerCase(), value: num(a.value) }))
  const primary = rows.find((r) => r.type === "lead")
  if (primary) return primary.value
  const grouped = rows.find((r) => r.type === "onsite_conversion.lead_grouped")
  if (grouped) return grouped.value
  return rows.filter((r) => r.type.includes("lead")).reduce((m, r) => Math.max(m, r.value), 0)
}

const account = await graphGet(ACCOUNT, { fields: "currency" })
const currency = account.currency ?? null
const today = new Date()
let total = 0

for (let m = MONTHS - 1; m >= 0; m -= 1) {
  const start = new Date(today.getFullYear(), today.getMonth() - m, 1)
  const end = new Date(today.getFullYear(), today.getMonth() - m + 1, 0)
  const since = start.toISOString().slice(0, 10)
  const until = (end > today ? today : end).toISOString().slice(0, 10)

  let after
  const payload = []
  for (let page = 0; page < 20; page += 1) {
    const res = await graphGet(`${ACCOUNT}/insights`, {
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      limit: 500,
      after,
    })
    for (const row of res.data ?? []) {
      if (!row.campaign_id || !row.date_start) continue
      payload.push({
        date: row.date_start,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name ?? null,
        spend: num(row.spend),
        impressions: num(row.impressions),
        reach: num(row.reach),
        clicks: num(row.clicks),
        ctr: nnum(row.ctr),
        cpc: nnum(row.cpc),
        cpm: nnum(row.cpm),
        leads: extractLeads(row.actions),
        currency,
        synced_at: new Date().toISOString(),
      })
    }
    after = res.paging?.next ? res.paging?.cursors?.after : undefined
    if (!after) break
  }

  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await sb
      .from("meta_insights_daily")
      .upsert(payload.slice(i, i + 500), { onConflict: "date,campaign_id" })
    if (error) throw new Error(`upsert 실패(${since}): ${error.message}`)
  }
  total += payload.length
  console.log(`${since} ~ ${until}: ${payload.length}행`)
}

console.log(`백필 완료 — 총 ${total}행`)
```

- [ ] **Step 2: 커밋** (실행은 마이그 적용 후 Task 1.9에서)

```bash
git add scripts/backfill-meta-insights.mjs
git commit -m "feat(marketing): Meta 일자별 insights 12개월 백필 스크립트"
```

---

### Task 1.6: event-metrics 저장소 Supabase 전환 (sync→async)

**Files:**
- Modify: `lib/repositories/event-metrics.ts` (전면 재작성)
- Modify: `app/api/admin/event-metrics/route.ts:9` (`await` 추가)
- Modify: `app/api/admin/event-metrics/[id]/route.ts:93` (`await` 추가)
- Modify: `app/api/admin/marketing-projects/route.ts:34` (`await` 추가)
- Modify: `app/api/admin/marketing-projects/[id]/route.ts:32` (`await` 추가)
- Modify: `lib/marketing/campaign-rollup-sources.ts:125` (`await` 추가 — 호출부 `gatherEvents`가 이미 async인지 확인, 아니면 async 전파)

- [ ] **Step 1: 저장소 재작성** — 함수명·반환 형태 유지, sync→async만 전환. 정규화 로직(DEFAULT_EVENT_METRICS 병합, 배열 방어)은 기존과 동일하게 보존한다.

```ts
// lib/repositories/event-metrics.ts
// 행사 캠페인 메트릭 저장소 — Supabase(event_metrics) 이전 완료(2026-08-20).
// 이전 JSON 폴백(data/event-metrics.json)은 프로덕션 쓰기 차단 문제로 폐기.
// RLS admin-only(deny-all) — 반드시 admin 클라이언트로만 접근.

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  DEFAULT_EVENT_METRICS,
  type EventMetrics,
} from "@/lib/types/event-metrics"

const sb = () => createSupabaseAdminClient()

function normalize(eventId: string, raw: Partial<EventMetrics> | null | undefined): EventMetrics {
  const base = raw ?? {}
  return {
    ...DEFAULT_EVENT_METRICS,
    ...base,
    eventId,
    adSpendEntries: Array.isArray(base.adSpendEntries) ? base.adSpendEntries : [],
    relatedLinks: Array.isArray(base.relatedLinks) ? base.relatedLinks : [],
    updatedAt: base.updatedAt ?? new Date().toISOString(),
  }
}

export async function getEventMetrics(eventId: string): Promise<EventMetrics> {
  const { data, error } = await sb()
    .from("event_metrics")
    .select("metrics")
    .eq("event_id", eventId)
    .maybeSingle()
  // 행 부재(data=null, error=null)는 여전히 기본값 반환 — 부재와 "쿼리 자체 실패"를 분리한다.
  // error 를 무시하면 일시 장애 때 read-merge-upsert(saveEventMetrics)가 기존 데이터를
  // 기본값으로 덮어써 유실시킬 수 있다.
  if (error) throw new Error(`[event-metrics] 조회 실패: ${error.message}`)
  return normalize(eventId, data?.metrics as Partial<EventMetrics> | undefined)
}

export async function getAllEventMetrics(): Promise<Record<string, EventMetrics>> {
  const { data, error } = await sb().from("event_metrics").select("event_id, metrics")
  if (error) throw new Error(`[event-metrics] 조회 실패: ${error.message}`)
  const result: Record<string, EventMetrics> = {}
  for (const row of data ?? []) {
    result[row.event_id] = normalize(row.event_id, row.metrics as Partial<EventMetrics>)
  }
  return result
}

export async function saveEventMetrics(
  eventId: string,
  patch: Partial<Omit<EventMetrics, "eventId" | "updatedAt">>
): Promise<EventMetrics> {
  const current = await getEventMetrics(eventId)
  const merged: EventMetrics = {
    ...current,
    ...patch,
    eventId,
    adSpendEntries: patch.adSpendEntries ?? current.adSpendEntries ?? [],
    relatedLinks: patch.relatedLinks ?? current.relatedLinks ?? [],
    updatedAt: new Date().toISOString(),
  }
  const { error } = await sb()
    .from("event_metrics")
    .upsert(
      { event_id: eventId, metrics: merged, updated_at: merged.updatedAt },
      { onConflict: "event_id" }
    )
  if (error) throw new Error(`[event-metrics] 저장 실패: ${error.message}`)
  return merged
}

export async function deleteEventMetrics(eventId: string): Promise<void> {
  const { error } = await sb().from("event_metrics").delete().eq("event_id", eventId)
  if (error) throw new Error(`[event-metrics] 삭제 실패: ${error.message}`)
}
```

(read-merge-upsert 레이스는 단일 어드민 편집 흐름이라 v1 허용 — 파일 주석으로 명시.)

- [ ] **Step 2: 소비처 5파일에 await 추가** — 각 호출부는 이미 async 함수/라우트다. `getAllEventMetrics()` → `await getAllEventMetrics()`, `saveEventMetrics(...)` → `await saveEventMetrics(...)`. `lib/marketing/campaign-rollup-sources.ts`의 `gatherEvents`가 sync 함수라면 async로 바꾸고 그 호출부(`gatherRollupSources`)까지 await 전파 — 파일을 읽고 전파 범위를 확정한다.

- [ ] **Step 3: 타입 확인** — await 누락은 typecheck 가 Promise 타입 불일치로 잡는다.

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add lib/repositories/event-metrics.ts app/api/admin/event-metrics/route.ts "app/api/admin/event-metrics/[id]/route.ts" app/api/admin/marketing-projects/route.ts "app/api/admin/marketing-projects/[id]/route.ts" lib/marketing/campaign-rollup-sources.ts
git commit -m "feat(marketing): event-metrics 저장소 Supabase 이전 (프로덕션 쓰기 차단 해소)"
```

---

### Task 1.7: channel-budgets 저장소 Supabase 전환

**Files:**
- Modify: `lib/repositories/channel-budgets.ts` (전면 재작성)
- Modify: `app/api/admin/channel-budgets/route.ts:29,41` (`await` 추가)

- [ ] **Step 1: 저장소 재작성**

```ts
// lib/repositories/channel-budgets.ts
// 채널별 예산(배정) 저장소 — Supabase(channel_budgets) 이전 완료(2026-08-20).
// RLS admin-only(deny-all) — admin 클라이언트 전용. KRW 0 이상 정수로 정규화.

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { AD_CHANNELS, type AdChannel } from "@/lib/types/event-metrics"

const sb = () => createSupabaseAdminClient()
const CHANNEL_SET = new Set<string>(AD_CHANNELS)

function normalizeAmount(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/** 7개 AdChannel 전 키 반환 — 테이블에 없는 채널은 0. */
export async function getChannelBudgets(): Promise<Record<AdChannel, number>> {
  const { data, error } = await sb().from("channel_budgets").select("channel, amount")
  if (error) throw new Error(`[channel-budgets] 조회 실패: ${error.message}`)
  const stored = new Map((data ?? []).map((row) => [row.channel as string, row.amount]))
  const result = {} as Record<AdChannel, number>
  for (const channel of AD_CHANNELS) {
    result[channel] = normalizeAmount(stored.get(channel))
  }
  return result
}

/** 단일 채널 배정 저장 후 전체 맵 반환. enum 밖 채널은 방어적으로 무시. */
export async function saveChannelBudget(
  channel: AdChannel,
  amount: number
): Promise<Record<AdChannel, number>> {
  if (!CHANNEL_SET.has(channel)) return getChannelBudgets()
  const { error } = await sb()
    .from("channel_budgets")
    .upsert(
      { channel, amount: normalizeAmount(amount), updated_at: new Date().toISOString() },
      { onConflict: "channel" }
    )
  if (error) throw new Error(`[channel-budgets] 저장 실패: ${error.message}`)
  return getChannelBudgets()
}
```

- [ ] **Step 2: 라우트 await 추가** — `app/api/admin/channel-budgets/route.ts` GET/PATCH의 두 호출에 `await`.

- [ ] **Step 3: 타입 확인 + 커밋**

Run: `npm run typecheck` → PASS

```bash
git add lib/repositories/channel-budgets.ts app/api/admin/channel-budgets/route.ts
git commit -m "feat(marketing): channel-budgets 저장소 Supabase 이전"
```

---

### Task 1.8: 캠페인 업데이트 로그 — 저장소 + CRUD API

**Files:**
- Create: `lib/repositories/campaign-updates.ts`
- Create: `app/api/admin/marketing-campaigns/[id]/updates/route.ts`
- Modify: `lib/types/marketing-campaign.ts` (타입 추가)

- [ ] **Step 1: 타입 추가** — `lib/types/marketing-campaign.ts`에:

```ts
export type CampaignUpdateKind = "note" | "change" | "milestone"
export const CAMPAIGN_UPDATE_KINDS: CampaignUpdateKind[] = ["note", "change", "milestone"]
export const CAMPAIGN_UPDATE_KIND_LABEL: Record<CampaignUpdateKind, string> = {
  note: "메모",
  change: "변경",
  milestone: "마일스톤",
}

export interface CampaignUpdate {
  id: string
  campaignId: string
  campaignName?: string | null // 통합 피드 조회 시에만 조인
  kind: CampaignUpdateKind
  body: string
  createdBy: string | null
  createdAt: string
}
```

- [ ] **Step 2: 저장소 작성**

```ts
// lib/repositories/campaign-updates.ts
// 우산 캠페인 수동 진행상황 로그(marketing_campaign_updates).
// RLS admin-only — admin 클라이언트 전용.

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { CampaignUpdate, CampaignUpdateKind } from "@/lib/types/marketing-campaign"

const sb = () => createSupabaseAdminClient()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUpdate(row: any): CampaignUpdate {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignName: row.marketing_campaigns?.name ?? null,
    kind: row.kind as CampaignUpdateKind,
    body: row.body,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  }
}

export async function listCampaignUpdates(campaignId: string, limit = 50): Promise<CampaignUpdate[]> {
  const { data, error } = await sb()
    .from("marketing_campaign_updates")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[campaign-updates] 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToUpdate)
}

/** 전 캠페인 통합 피드 — 캠페인명 조인. */
export async function listRecentUpdates(limit = 20): Promise<CampaignUpdate[]> {
  const { data, error } = await sb()
    .from("marketing_campaign_updates")
    .select("*, marketing_campaigns(name)")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[campaign-updates] 피드 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToUpdate)
}

export async function createCampaignUpdate(input: {
  campaignId: string
  kind: CampaignUpdateKind
  body: string
  createdBy?: string | null
}): Promise<CampaignUpdate> {
  const { data, error } = await sb()
    .from("marketing_campaign_updates")
    .insert({
      campaign_id: input.campaignId,
      kind: input.kind,
      body: input.body,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`[campaign-updates] 생성 실패: ${error.message}`)
  return rowToUpdate(data)
}

export async function deleteCampaignUpdate(campaignId: string, updateId: string): Promise<void> {
  const { error } = await sb()
    .from("marketing_campaign_updates")
    .delete()
    .eq("id", updateId)
    .eq("campaign_id", campaignId) // 경로 캠페인 소속 검증 (removeLink 패턴)
  if (error) throw new Error(`[campaign-updates] 삭제 실패: ${error.message}`)
}
```

- [ ] **Step 3: 라우트 작성** — `app/api/admin/marketing-campaigns/[id]/updates/route.ts`. verifyAdmin + 검증 + try/catch 강등은 `app/api/admin/channel-budgets/route.ts` 패턴. GET(목록)·POST(생성: kind는 CAMPAIGN_UPDATE_KINDS 검증, body는 trim 후 1~2000자)·DELETE(`?updateId=` 쿼리). POST의 createdBy는 verifyAdmin이 반환/노출하는 세션 정보가 있으면 채우고 없으면 null(형제 라우트에서 어드민 표시명 획득 방식을 확인해 동일하게).

- [ ] **Step 4: 타입 확인 + 커밋**

Run: `npm run typecheck` → PASS

```bash
git add lib/types/marketing-campaign.ts lib/repositories/campaign-updates.ts "app/api/admin/marketing-campaigns/[id]/updates/route.ts"
git commit -m "feat(marketing): 캠페인 진행상황 업데이트 로그 (저장소+CRUD)"
```

---

### Task 1.9: Phase 1 게이트 + 마이그 적용 + 백필

- [ ] **Step 1: 게이트 3줄 + 신규 테스트**

```bash
npm run typecheck && npm run lint && npm run build
npx vitest run tests/campaigns
```
Expected: 전부 PASS (build는 워크트리면 .env.local 심링크 선행)

- [ ] **Step 2: 마이그 5개 라이브 적용** — Supabase 대시보드 SQL Editor 수동 실행(레포 절차: 로그인된 Chrome=claude-in-chrome MCP. [campaign-entity-d1-d3-plan-2026-07-24.md](campaign-entity-d1-d3-plan-2026-07-24.md) 적용 방법 노트 참조). 적용 순서 무관(상호 FK 없음, updates만 marketing_campaigns 참조 — 이미 라이브).

- [ ] **Step 3: 검증 프로브** — `tmp/db-probe*.mjs` 패턴으로 5테이블 존재+행0 확인.

- [ ] **Step 4: 백필 실행**

```bash
node --env-file=.env.local scripts/backfill-meta-insights.mjs --months 12
```
Expected: 월별 행 수 로그 + "백필 완료". 이후 프로브로 `meta_insights_daily` 행 수·최신 date 확인.

---

## Phase 2 — 대시보드 (요약 탭 재구축)

### Task 2.1: perf 순수 함수 (기간·델타·페이싱·시리즈)

**Files:**
- Create: `lib/marketing/perf.ts`
- Test: `tests/campaigns/perf.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/campaigns/perf.test.ts`

```ts
import { describe, expect, it } from "vitest"
import {
  resolvePerfPeriod,
  computeDeltaPct,
  computePacing,
  aggregateDailySeries,
  type PerfPeriodKey,
} from "@/lib/marketing/perf"

describe("resolvePerfPeriod", () => {
  it("30d — [오늘-29, 오늘] + 직전 30일", () => {
    const p = resolvePerfPeriod("30d", "2026-08-20")
    expect(p).toEqual({
      key: "30d",
      since: "2026-07-22",
      until: "2026-08-20",
      prevSince: "2026-06-22",
      prevUntil: "2026-07-21",
    })
  })
  it("quarter — 분기 시작~오늘 + 직전 동일 길이", () => {
    const p = resolvePerfPeriod("quarter", "2026-08-20")
    expect(p.since).toBe("2026-07-01")
    expect(p.until).toBe("2026-08-20")
  })
})

describe("computeDeltaPct", () => {
  it("증감률 계산", () => {
    expect(computeDeltaPct(120, 100)).toBe(20)
    expect(computeDeltaPct(80, 100)).toBe(-20)
  })
  it("이전 0 또는 null 이면 null (0 나눗셈·미측정 정직)", () => {
    expect(computeDeltaPct(120, 0)).toBeNull()
    expect(computeDeltaPct(120, null)).toBeNull()
    expect(computeDeltaPct(null, 100)).toBeNull()
  })
})

describe("computePacing", () => {
  it("기간 경과율 — 기간 내 오늘", () => {
    const p = computePacing({
      startsAt: "2026-08-01",
      endsAt: "2026-08-31",
      today: "2026-08-16",
      spend: 58,
      budget: 100,
    })
    expect(p.elapsedPct).toBe(50) // 31일 중 15.5일 → 반올림 50
    expect(p.executionPct).toBe(58)
  })
  it("예산 없으면 executionPct null, 기간 없으면 elapsedPct null", () => {
    const p = computePacing({ startsAt: null, endsAt: null, today: "2026-08-16", spend: 58, budget: null })
    expect(p.elapsedPct).toBeNull()
    expect(p.executionPct).toBeNull()
  })
  it("기간 종료 후는 100 으로 클램프", () => {
    const p = computePacing({ startsAt: "2026-07-01", endsAt: "2026-07-31", today: "2026-08-16", spend: 0, budget: null })
    expect(p.elapsedPct).toBe(100)
  })
})

describe("aggregateDailySeries", () => {
  it("일자별 spend/leads 합산 — 캠페인 여러 개를 날짜로 접는다", () => {
    const rows = [
      { date: "2026-08-18", campaignId: "a", spend: 10, leads: 2 },
      { date: "2026-08-18", campaignId: "b", spend: 5, leads: 1 },
      { date: "2026-08-19", campaignId: "a", spend: 7, leads: 0 },
    ]
    expect(aggregateDailySeries(rows)).toEqual([
      { date: "2026-08-18", spend: 15, leads: 3 },
      { date: "2026-08-19", spend: 7, leads: 0 },
    ])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/campaigns/perf.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `lib/marketing/perf.ts` (순수 함수, "server-only" 불필요)

```ts
// lib/marketing/perf.ts
// 퍼포먼스 대시보드 순수 계산 — 기간 해석·전기 대비 델타·캠페인 페이싱·일자 시리즈.
// 정직 규칙: 분모 0/미측정 은 0% 가 아니라 null. 통화 혼합 집행률은 호출부에서 null 로 들어온다.

export type PerfPeriodKey = "7d" | "30d" | "90d" | "quarter"

export interface PerfPeriod {
  key: PerfPeriodKey
  since: string
  until: string
  prevSince: string
  prevUntil: string
}

const DAY_MS = 86_400_000

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function shiftDays(iso: string, days: number): string {
  return toIso(new Date(toDate(iso).getTime() + days * DAY_MS))
}

/** today(YYYY-MM-DD, KST 기준 오늘) 를 끝점으로 기간과 직전 동일 길이 기간을 해석한다. */
export function resolvePerfPeriod(key: PerfPeriodKey, today: string): PerfPeriod {
  let since: string
  if (key === "quarter") {
    const d = toDate(today)
    const qStartMonth = Math.floor(d.getUTCMonth() / 3) * 3
    since = toIso(new Date(Date.UTC(d.getUTCFullYear(), qStartMonth, 1)))
  } else {
    const days = key === "7d" ? 7 : key === "90d" ? 90 : 30
    since = shiftDays(today, -(days - 1))
  }
  const lengthDays = Math.round((toDate(today).getTime() - toDate(since).getTime()) / DAY_MS) + 1
  const prevUntil = shiftDays(since, -1)
  const prevSince = shiftDays(prevUntil, -(lengthDays - 1))
  return { key, since, until: today, prevSince, prevUntil }
}

/** 전기 대비 증감률(%). 이전이 0/null 이거나 현재가 null 이면 null. */
export function computeDeltaPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export interface PacingInput {
  startsAt: string | null
  endsAt: string | null
  today: string
  spend: number | null   // 예산과 같은 통화일 때만 값, 아니면 null
  budget: number | null
}

export interface Pacing {
  elapsedPct: number | null    // 기간 경과율 0~100 (기간 미설정 시 null)
  executionPct: number | null  // 집행률 (spend/budget, 통화 정합 시만)
}

export function computePacing({ startsAt, endsAt, today, spend, budget }: PacingInput): Pacing {
  let elapsedPct: number | null = null
  if (startsAt && endsAt) {
    const start = toDate(startsAt).getTime()
    const end = toDate(endsAt).getTime() + DAY_MS // endsAt 당일 포함
    const now = toDate(today).getTime() + DAY_MS / 2
    if (end > start) {
      elapsedPct = Math.round(Math.min(1, Math.max(0, (now - start) / (end - start))) * 100)
    }
  }
  const executionPct =
    spend != null && budget != null && budget > 0 ? Math.round((spend / budget) * 100) : null
  return { elapsedPct, executionPct }
}

export interface DailyPoint {
  date: string
  spend: number
  leads: number
}

/** 캠페인별 일자 행을 날짜로 접어 spend/leads 합산 시리즈로 만든다(date asc). */
export function aggregateDailySeries(
  rows: Array<{ date: string; spend: number; leads: number }>
): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>()
  for (const row of rows) {
    const point = byDate.get(row.date) ?? { date: row.date, spend: 0, leads: 0 }
    point.spend += row.spend
    point.leads += row.leads
    byDate.set(row.date, point)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npx vitest run tests/campaigns/perf.test.ts` → PASS

```bash
git add lib/marketing/perf.ts tests/campaigns/perf.test.ts
git commit -m "feat(marketing): perf 순수 계산 (기간·델타·페이싱·시리즈)"
```

---

### Task 2.2: 공용 PeriodToggle 컴포넌트

**Files:**
- Create: `components/admin/PeriodToggle.tsx`

- [ ] **Step 1: 구현** — 현재 4곳(campaigns page:669-687, MetaTab:120, traffic:471-489, AdLeadsPanel:391)이 복제 중인 `role="group"`+`aria-pressed` 버튼 그룹의 공용화. **이번 라운드는 재구축되는 요약 탭에서만 사용**(기존 3곳 교체는 비범위). 기존 캠페인 페이지의 토글 마크업·클래스를 그대로 제네릭화한다(시각 회귀 방지 — 구현 시 page.tsx:669-687을 먼저 읽고 클래스 복사).

```tsx
"use client"

// 공용 기간 토글 — 캠페인 허브 4곳에 복제된 role="group"+aria-pressed 패턴의 공용화.
// 옵션 id 는 딥링크(useUrlState)와 결합되므로 호출부가 안정적 문자열을 넘긴다.

export interface PeriodOption<K extends string = string> {
  id: K
  label: string
}

export function PeriodToggle<K extends string>({
  options,
  value,
  onChange,
  ariaLabel = "기간 선택",
}: {
  options: PeriodOption<K>[]
  value: K
  onChange: (next: K) => void
  ariaLabel?: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex items-center gap-1.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={/* page.tsx:669-687 의 기존 토글 버튼 클래스를 그대로 사용 — 구현 시 복사 */ ""}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/admin/PeriodToggle.tsx
git commit -m "feat(admin): 공용 PeriodToggle 추출"
```

---

### Task 2.3: `/api/admin/marketing/perf` 집계 엔드포인트

**Files:**
- Create: `lib/marketing/perf-assemble.ts` (서버 조립 — route 에서 분리해 두께 관리)
- Create: `app/api/admin/marketing/perf/route.ts`
- Modify: `lib/crm/lead-attribution.ts` (전환 판정 상수 승격 — 아래 참고)

**응답 계약** (`lib/marketing/perf.ts`에 타입 추가):

```ts
export interface PerfKpi {
  value: number | null
  previous: number | null
  deltaPct: number | null
  currency?: "USD" | "KRW"
}

export interface PerfScoreboardRow {
  campaignId: string
  name: string
  status: string
  pacing: Pacing
  pacingCurrency: "USD" | "KRW" | null // 집행률이 어느 통화 기준인지 (null=미산정)
  leads: number
  cpl: number | null                    // USD (링크된 Meta 일자 spend / leads)
  sparkline: Array<{ date: string; leads: number }> // 최근 14일
  latestUpdate: { body: string; kind: string; createdAt: string; createdBy: string | null } | null
  anomalies: string[]                   // Phase 3 전까지 빈 배열 (AnomalyKind 문자열)
}

export interface MarketingPerfResponse {
  period: PerfPeriod
  snapshotAt: string | null
  kpis: {
    spendUsd: PerfKpi
    leads: PerfKpi
    cplUsd: PerfKpi
    leadConversionRate: PerfKpi   // 광고 리드 중 전환 비율(%) — AdLeadsPanel 전환 정의 재사용
    budgetExecutionPct: PerfKpi   // KRW 배정 합 대비 KRW 집행 합
  }
  daily: DailyPoint[]
  scoreboard: PerfScoreboardRow[]
  funnel: { impressions: number; clicks: number; adLeads: number; convertedLeads: number }
  channelMix: Array<{
    channel: string
    budget: number
    spendKrw: number | null
    metaSpendUsd: number | null   // meta 채널 행에만 — 통화 분리 유지
  }>
  updatesFeed: import("@/lib/types/marketing-campaign").CampaignUpdate[]
}
```

- [ ] **Step 1: 전환 판정 SSOT 승격** — `components/admin/campaigns/leads/AdLeadsPanel.tsx`를 읽고, "전환/전환 대상" 판정에 쓰는 리드 status 집합·판정 함수를 `lib/crm/lead-attribution.ts`로 옮겨 export 한다(`isConvertedLead(lead)`, `isConversionEligibleLead(lead)` 형태). AdLeadsPanel은 승격된 함수를 import 하도록 교체(동작 불변). 커밋 분리:

```bash
git add lib/crm/lead-attribution.ts components/admin/campaigns/leads/AdLeadsPanel.tsx
git commit -m "refactor(crm): 광고 리드 전환 판정을 lead-attribution SSOT 로 승격"
```

- [ ] **Step 2: 조립 함수 작성** — `lib/marketing/perf-assemble.ts` (`"server-only"`). 시그니처:

```ts
export async function assembleMarketingPerf(periodKey: PerfPeriodKey): Promise<MarketingPerfResponse>
```

조립 순서(각 소스 실패는 채널 격리 — `gatherRollupSources` 패턴처럼 try/catch 후 해당 섹션 빈 값):
1. `resolvePerfPeriod(periodKey, kstToday())` — kstToday는 크론과 동일한 Intl en-CA 헬퍼(이 파일에 두고 크론도 여기서 import 하도록 정리).
2. `getMetaInsightsDailyRange(prevSince, until)` 1회 — 현재 기간/직전 기간으로 분할해 spend·leads 합산, `aggregateDailySeries`로 daily(현재 기간만).
3. `getMarketingLeads()` (lib/repositories/leads.ts:399) — created_at으로 기간 분할. 전체 리드 수 KPI + `source === "meta_lead_ads"` 광고 리드 → funnel.adLeads·convertedLeads(`isConvertedLead`), CPL = 기간 Meta spend / 기간 광고 리드 수(분모 0이면 null).
4. `listCampaigns()`(D1) + `listRecentUpdates(20)` + 캠페인별 최근 업데이트 1건(피드 20건에서 파생하지 말고 `marketing_campaign_updates`를 campaign_id IN 쿼리로 최신 1건씩 — 저장소에 `latestUpdatesByCampaign(campaignIds)` 추가).
5. 스코어보드 행: 링크된 meta_campaign ref_id 들의 일자 행으로 leads·spend 합산+스파크라인(최근 14일). 페이싱: 캠페인 links 가 전부 meta → `getMetaCampaignDashboard()`(45초 메모 재사용)에서 lifetimeBudget 합이 있으면 USD 집행률, 아니면 campaign.budget(KRW) vs 링크 행사 KRW 광고비(`eventAdSpendFromMetrics(getAllEventMetrics())` 재사용) — 혼합이면 executionPct null.
6. channelMix: `getChannelBudgets()` + KRW 집행(ChannelBudgetTable 이 쓰는 집행 산식을 확인해 동일 소스 재사용 — event-metrics adSpendEntries 채널 합) + meta 행에 기간 Meta spend(USD 분리 필드).
7. `getLatestSyncedAt()` → snapshotAt.

- [ ] **Step 3: 라우트 작성** — `app/api/admin/marketing/perf/route.ts`: verifyAdmin → `?period=` 파싱(기본 30d, 화이트리스트 밖은 400) → `assembleMarketingPerf` → JSON. try/catch 500 강등. 서버 메모 45초(`getMetaCampaignDashboard` 메모 패턴과 동일한 Map 메모, 키=period).

- [ ] **Step 4: 게이트 + 커밋**

Run: `npm run typecheck && npm run lint` → PASS

```bash
git add lib/marketing/perf.ts lib/marketing/perf-assemble.ts app/api/admin/marketing/perf/route.ts lib/repositories/campaign-updates.ts app/api/cron/sync-meta-insights/route.ts
git commit -m "feat(marketing): perf 단일 집계 엔드포인트"
```

---

### Task 2.4: 요약 탭 재구축 (UI)

**Files:**
- Create: `components/admin/campaigns/perf/KpiStrip.tsx`
- Create: `components/admin/campaigns/perf/BriefingCard.tsx`
- Create: `components/admin/campaigns/perf/DailyTrendSection.tsx`
- Create: `components/admin/campaigns/perf/CampaignScoreboard.tsx`
- Create: `components/admin/campaigns/perf/FunnelMixSection.tsx`
- Create: `components/admin/campaigns/perf/UpdatesFeed.tsx`
- Modify: `components/admin/campaigns/tabs/SummaryTab.tsx` (재작성 — perf 조립)
- Modify: `components/admin/campaigns/tabs/EventsTab.tsx` (행사 섹션 이식 수용)
- Modify: `app/admin/campaigns/page.tsx` (요약 탭 기간 상태 `PerfPeriodKey`로 교체 + PeriodToggle)

**승인된 시안(2026-08-20 세션 위젯)이 레이아웃 정본.** 디자인 규칙: DESIGN.md·[feedback_ui_design_taste] — 파스텔 채움 금지, 아웃라인/에디토리얼, 그린은 액센트만, 채널 색은 `AD_CHANNEL_COLOR`(차트·점 표시만).

- [ ] **Step 1: 데이터 훅** — SummaryTab에 `usePerf(period)` 내부 훅: `/api/admin/marketing/perf?period=` fetch + loading/error 상태. 기존 SummaryTab의 코어 데이터 의존(행사·리드 props)은 퍼널·행사 이동 섹션에만 남는다.

- [ ] **Step 2: 컴포넌트 6종 구현** — 전부 perf 응답 타입을 props로 받는 표시 컴포넌트(자체 fetch 없음):
  - `KpiStrip` — `kpis` 5칸. `tabs/KpiCard.tsx`(compact StatTile 래퍼) 재사용, 델타는 `TrendBadge`(components/admin/viz/primitives). USD/KRW 통화 라벨 명시, value null → "—".
  - `BriefingCard` — Phase 2에서는 기존 SummaryTab InsightsBanner의 규칙 기반 인사이트(SummaryTab.tsx:568-628)를 이식해 표시(로직 이동, 삭제 아님). Phase 3에서 AI payload로 교체될 자리 — props를 `{ headline, items[], badges[] }` 중립 형태로 설계.
  - `DailyTrendSection` — `ComparisonBarChart`(막대=spend, 선=leads, 좌축 USD/우축 건수). 빈 데이터 → `EmptyState`("스냅샷 없음 — 마이그·백필 적용 전").
  - `CampaignScoreboard` — 행 그리드(이름+최근 업데이트 1줄 / 페이싱 바+경과율 / 리드 / CPL / Sparkline). Sparkline은 `components/admin/viz/Sparkline` 직접 import(배럴 제외 정책). 페이싱 바는 시안처럼 자체 div(집행>경과+10%p면 danger 톤). 캠페인 0개 → EmptyState + `/admin/campaigns/manage` 링크.
  - `FunnelMixSection` — 좌: `MiniFunnel`(4단: 노출→클릭→리드→전환 리드. **시안의 '딜' 5단은 리드-딜 조인 신뢰도 확보 전까지 제외** — 정직 우선, 스펙 각주). 우: 채널 믹스 가로바(budget·spendKrw, meta 행은 USD 별도 표기) + "채널별 ROAS 미표기" 각주.
  - `UpdatesFeed` — 피드 목록 + 작성 폼(캠페인 select=스코어보드 캠페인 목록, kind 칩 3종, textarea, POST 후 재조회). 작성 폼은 접힘 기본.

- [ ] **Step 3: SummaryTab 재조립 + 행사 섹션 이동** — SummaryTab을 위 6종 조립으로 재작성. 기존 섹션 처분: ChannelHubCards·MetaLiveSummary→KPI 스트립에 흡수(삭제), InsightsBanner 규칙→BriefingCard로 이식, `EventFunnelCompareChart`·`EventRoiChart`·`TimelineRow`·`GoalProgressPanel`·`TopPerformersTable`→**EventsTab으로 이동**(EventsTab 상단 "행사 성과 비교" 섹션 신설), `ChannelSpendPieChart`·`ChannelEfficiencyChart`→FunnelMixSection 채널 믹스로 대체(삭제), 추천 액션 규칙(629-701)→BriefingCard 액션으로 이식. 미사용이 된 컴포넌트 파일은 다른 소비처 grep 후 없으면 삭제.

- [ ] **Step 4: page.tsx 기간 토글 교체** — 요약 탭의 Period("active|30d|90d|all")를 요약 탭에 한해 `PerfPeriodKey`("7d|30d|90d|quarter") + PeriodToggle로 교체. events/meta 탭의 기존 Period 딥링크(`?range=`)는 불변. 요약 탭 딥링크 파라미터는 `?perf=30d` 신설(useUrlState).

- [ ] **Step 5: 게이트 + 커밋**

Run: `npm run typecheck && npm run lint && npm run build` → PASS

```bash
git add components/admin/campaigns/perf components/admin/campaigns/tabs/SummaryTab.tsx components/admin/campaigns/tabs/EventsTab.tsx app/admin/campaigns/page.tsx
git commit -m "feat(campaigns): 요약 탭 → 퍼포먼스 대시보드 재구축"
```

---

### Task 2.5: 실화면 검증

- [ ] **Step 1: 데브 서버 프리뷰** — `.claude/launch.json`의 dev 서버(포트 3888)로 preview_start → `/admin/campaigns` 로그인 후 확인:
  - KPI 스트립 5칸 + 델타 렌더(스냅샷 없으면 "—" 강등)
  - 기간 토글 4종 전환 + `?perf=` 딥링크 왕복
  - 스코어보드: 캠페인 행·페이싱 바·스파크라인·최근 업데이트 1줄
  - 업데이트 작성 → 피드·스코어보드 반영
  - 행사 탭에 이동된 섹션 렌더
  - 콘솔 에러 0 (`read_console_messages`)
- [ ] **Step 2: 다크 모드 + 좁은 폭(resize_window)** 확인 — 파스텔 채움 미사용, 스코어보드 그리드 줄바꿈.
- [ ] **Step 3: 스크린샷 공유 + 남은 diff 커밋**

---

## Phase 3 — AI 레이어

### Task 3.1: 이상 감지 순수 함수

**Files:**
- Create: `lib/marketing/anomaly.ts`
- Test: `tests/campaigns/anomaly.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from "vitest"
import { detectAnomalies, ANOMALY_THRESHOLDS } from "@/lib/marketing/anomaly"

const base = {
  id: "c1",
  name: "테스트",
  cpl7d: null as number | null,
  cpl30d: null as number | null,
  leads7d: 0,
  leadsPrev7d: 0,
  ctr7d: null as number | null,
  ctr30d: null as number | null,
  executionPct: null as number | null,
  elapsedPct: null as number | null,
}

describe("detectAnomalies", () => {
  it("CPL 급등 — 7일 CPL 이 30일 CPL×1.5 초과 + 표본 충족", () => {
    const flags = detectAnomalies({
      campaigns: [{ ...base, cpl7d: 40, cpl30d: 20, leads7d: ANOMALY_THRESHOLDS.cplMinLeads7d }],
    })
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ kind: "cpl_spike", campaignId: "c1" })
  })
  it("표본 미달이면 CPL 급등 미발화", () => {
    const flags = detectAnomalies({
      campaigns: [{ ...base, cpl7d: 40, cpl30d: 20, leads7d: ANOMALY_THRESHOLDS.cplMinLeads7d - 1 }],
    })
    expect(flags).toHaveLength(0)
  })
  it("페이싱 초과 — 집행률이 경과율+10%p 초과", () => {
    const flags = detectAnomalies({ campaigns: [{ ...base, executionPct: 62, elapsedPct: 45 }] })
    expect(flags[0]).toMatchObject({ kind: "pacing_over" })
  })
  it("경계값(정확히 +10%p)은 미발화", () => {
    const flags = detectAnomalies({ campaigns: [{ ...base, executionPct: 55, elapsedPct: 45 }] })
    expect(flags).toHaveLength(0)
  })
  it("리드 급감 — 직전 7일 대비 0.6배 미만", () => {
    const flags = detectAnomalies({ campaigns: [{ ...base, leads7d: 5, leadsPrev7d: 10 }] })
    expect(flags[0]).toMatchObject({ kind: "leads_drop" })
  })
  it("CTR 급락 — 30일 대비 0.6배 미만", () => {
    const flags = detectAnomalies({ campaigns: [{ ...base, ctr7d: 1, ctr30d: 2 }] })
    expect(flags[0]).toMatchObject({ kind: "ctr_drop" })
  })
})
```

- [ ] **Step 2: 실패 확인** → `npx vitest run tests/campaigns/anomaly.test.ts` FAIL

- [ ] **Step 3: 구현**

```ts
// lib/marketing/anomaly.ts
// 이상 감지는 순수 규칙(테스트 대상) — LLM 은 이 결과에 해설·우선순위만 붙인다(감지 아님).

export type AnomalyKind = "cpl_spike" | "ctr_drop" | "pacing_over" | "leads_drop"

export interface AnomalyFlag {
  kind: AnomalyKind
  campaignId: string | null
  campaignName: string | null
  severity: "warn" | "high"
  detail: string
  metric: { current: number; baseline: number }
}

export const ANOMALY_THRESHOLDS = {
  cplSpikeRatio: 1.5,   // 7일 CPL > 30일 CPL × 1.5
  cplMinLeads7d: 5,     // CPL 급등 최소 표본(7일 리드)
  ctrDropRatio: 0.6,    // 7일 CTR < 30일 CTR × 0.6
  pacingOverGapPp: 10,  // 집행률 − 경과율 > 10%p
  leadsDropRatio: 0.6,  // 최근 7일 리드 < 직전 7일 × 0.6
} as const

export interface AnomalyCampaignInput {
  id: string | null
  name: string
  cpl7d: number | null
  cpl30d: number | null
  leads7d: number
  leadsPrev7d: number
  ctr7d: number | null
  ctr30d: number | null
  executionPct: number | null
  elapsedPct: number | null
}

export function detectAnomalies(input: { campaigns: AnomalyCampaignInput[] }): AnomalyFlag[] {
  const flags: AnomalyFlag[] = []
  const T = ANOMALY_THRESHOLDS

  for (const c of input.campaigns) {
    if (
      c.cpl7d != null &&
      c.cpl30d != null &&
      c.cpl30d > 0 &&
      c.leads7d >= T.cplMinLeads7d &&
      c.cpl7d > c.cpl30d * T.cplSpikeRatio
    ) {
      flags.push({
        kind: "cpl_spike",
        campaignId: c.id,
        campaignName: c.name,
        severity: c.cpl7d > c.cpl30d * 2 ? "high" : "warn",
        detail: `7일 CPL이 30일 평균의 ${Math.round((c.cpl7d / c.cpl30d) * 10) / 10}배`,
        metric: { current: c.cpl7d, baseline: c.cpl30d },
      })
    }
    if (c.ctr7d != null && c.ctr30d != null && c.ctr30d > 0 && c.ctr7d < c.ctr30d * T.ctrDropRatio) {
      flags.push({
        kind: "ctr_drop",
        campaignId: c.id,
        campaignName: c.name,
        severity: "warn",
        detail: `7일 CTR이 30일 평균의 ${Math.round((c.ctr7d / c.ctr30d) * 100)}%`,
        metric: { current: c.ctr7d, baseline: c.ctr30d },
      })
    }
    if (
      c.executionPct != null &&
      c.elapsedPct != null &&
      c.executionPct - c.elapsedPct > T.pacingOverGapPp
    ) {
      flags.push({
        kind: "pacing_over",
        campaignId: c.id,
        campaignName: c.name,
        severity: c.executionPct - c.elapsedPct > T.pacingOverGapPp * 2 ? "high" : "warn",
        detail: `집행 ${c.executionPct}% vs 기간 경과 ${c.elapsedPct}%`,
        metric: { current: c.executionPct, baseline: c.elapsedPct },
      })
    }
    if (c.leadsPrev7d > 0 && c.leads7d < c.leadsPrev7d * T.leadsDropRatio) {
      flags.push({
        kind: "leads_drop",
        campaignId: c.id,
        campaignName: c.name,
        severity: "warn",
        detail: `최근 7일 리드 ${c.leads7d}건 (직전 7일 ${c.leadsPrev7d}건)`,
        metric: { current: c.leads7d, baseline: c.leadsPrev7d },
      })
    }
  }
  return flags
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

```bash
git add lib/marketing/anomaly.ts tests/campaigns/anomaly.test.ts
git commit -m "feat(marketing): 이상 감지 순수 규칙 4종"
```

---

### Task 3.2: 주간 AI 브리핑 파이프라인

**Files:**
- Create: `lib/marketing/insights/input-builder.ts`
- Create: `lib/marketing/insights/prompt.ts`
- Create: `lib/marketing/insights/runner.ts`
- Create: `lib/repositories/marketing-insights.ts`

**선행 필독**: `lib/branch/insights/{input-builder,prompt,gemini-runner,sanity-check,runner}.ts` — 이 5파일 구조를 마케팅 도메인으로 미러한다. Gemini 호출(fetch generativelanguage v1beta, `responseMimeType: "application/json"` + `responseSchema`, temp 0.4, `GEMINI_MODEL`/`GEMINI_FAST_MODEL`)과 digest 캐시·stale 폴백·sanity 재시도 흐름은 동일. `checkNumericalSanity`가 도메인 비종속 시그니처면 import 재사용, branch 결합이면 동일 로직 미러.

- [ ] **Step 1: input-builder** — `buildMarketingInsightInput()`: Task 2.3의 `assembleMarketingPerf("30d")` 재사용 + 주간 집계(최근 4주 spend/leads/CPL 주별 합), `detectAnomalies` 결과, `listRecentUpdates(10)`. 출력은 LLM 입력용 직렬화 객체 + `digestInput()`(branch 패턴 미러 — 안정 정렬 stringify 해시).
- [ ] **Step 2: prompt** — 시스템 프롬프트(내부 CS 톤 규칙: 결론·팩트 우선, 감정 표현 금지) + responseSchema:

```ts
export const MARKETING_INSIGHT_SYSTEM_PROMPT = `너는 클래스인 KR 지사의 퍼포먼스 마케팅 애널리스트다.
아래 JSON 데이터(주간 지표·캠페인 스코어보드·이상 감지·팀 업데이트 로그)만 근거로 주간 브리핑을 쓴다.
규칙:
- 결론·팩트 우선. 감정 표현·수사 금지. 한국어.
- 데이터에 없는 숫자를 만들지 않는다. 모든 수치는 입력에 있는 값만 인용한다.
- 종합 ROAS·채널별 ROI 를 계산하거나 언급하지 않는다(통화·귀속 불가).
- Meta 광고비는 USD — 원화로 환산하지 않는다.
- next_actions 는 이번 주 실행 가능한 것 최대 3개, 각각 근거(why)를 데이터로 댄다.`

export const MARKETING_INSIGHT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "한 문장 핵심 요약" },
    highlights: { type: "array", items: { type: "string" }, description: "주요 관찰 2~4개" },
    next_actions: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, why: { type: "string" } },
        required: ["title", "why"],
      },
    },
  },
  required: ["headline", "highlights", "next_actions"],
} as const
```

- [ ] **Step 3: repository** — `lib/repositories/marketing-insights.ts`: `getLatestInsight(scope)`, `getInsightByDigest(scope, digest)`, `saveInsight({scope, digest, headline, payload, model})` (admin 클라이언트, marketing_insights 테이블).
- [ ] **Step 4: runner** — `runMarketingInsights(force = false)`: input build → digest → `getInsightByDigest` 히트 시 스킵(`{from: "cache"}`) → Gemini 호출 → 숫자 sanity 검증(경고 시 1회 재시도, 재실패 시 저장 안 하고 `{from: "stale", error}` — 최신 저장분 유지) → 저장. 반환 `{from: "fresh"|"cache"|"stale", insight, error?}`.
- [ ] **Step 5: 게이트 + 커밋**

```bash
git add lib/marketing/insights lib/repositories/marketing-insights.ts
git commit -m "feat(marketing): 주간 AI 브리핑 파이프라인 (branch insights 패턴 미러)"
```

---

### Task 3.3: 브리핑 크론 + 어드민 API

**Files:**
- Create: `app/api/cron/sync-marketing-insights/route.ts`
- Create: `app/api/admin/marketing/insights/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: 크론 라우트** — sync-branch-insights와 동일 인증, 본문은 `runMarketingInsights(true)` 1회 호출 + 결과 JSON.
- [ ] **Step 2: vercel.json** — 월요일 07:30 KST = 일요일 22:30 UTC:

```json
    {
      "path": "/api/cron/sync-marketing-insights",
      "schedule": "30 22 * * 0"
    }
```

- [ ] **Step 3: 어드민 API** — `GET /api/admin/marketing/insights`: verifyAdmin → `?force=1`이면 `runMarketingInsights(true)`, 아니면 `getLatestInsight("weekly")` + `detectAnomalies` 현재값 → `{ insight, anomalies }`.
- [ ] **Step 4: 검사 + 커밋**

Run: `npm run check:vercel-crons` → PASS

```bash
git add app/api/cron/sync-marketing-insights/route.ts app/api/admin/marketing/insights/route.ts vercel.json
git commit -m "feat(marketing): 주간 브리핑 크론 + 조회 API"
```

---

### Task 3.4: 대시보드 AI 연결 (브리핑 카드 라이브 + 이상 배지)

**Files:**
- Modify: `lib/marketing/perf-assemble.ts` (scoreboard 행에 anomalies 채움 + 응답에 anomalies 포함)
- Modify: `components/admin/campaigns/perf/BriefingCard.tsx` (AI payload 소비)
- Modify: `components/admin/campaigns/perf/CampaignScoreboard.tsx` (이상 배지 칩)
- Modify: `components/admin/campaigns/tabs/SummaryTab.tsx` (insights fetch 추가)

- [ ] **Step 1: perf-assemble에 detectAnomalies 통합** — 스코어보드 행별 7일/30일 CPL·CTR·리드 집계는 이미 조립 중인 meta_insights_daily 데이터에서 파생. 각 행 `anomalies: AnomalyKind[]` 채움.
- [ ] **Step 2: BriefingCard AI 모드** — `/api/admin/marketing/insights` fetch: insight 있으면 headline+highlights+next_actions+이상 칩(시안대로), 없으면 기존 규칙 기반 폴백 유지(빈 카드 금지). "다시 생성" 버튼 = `?force=1` POST 아님 GET. 브리핑 생성 시각 표기.
- [ ] **Step 3: 스코어보드 배지** — 행 이름 옆 danger 톤 아웃라인 칩(시안), `AnomalyKind`→한글 라벨 매핑 상수는 anomaly.ts에 추가.
- [ ] **Step 4: 게이트 + 실화면 확인(브리핑 카드·배지) + 커밋**

```bash
git add lib/marketing/perf-assemble.ts components/admin/campaigns/perf/BriefingCard.tsx components/admin/campaigns/perf/CampaignScoreboard.tsx components/admin/campaigns/tabs/SummaryTab.tsx lib/marketing/anomaly.ts
git commit -m "feat(campaigns): AI 브리핑 카드 라이브 + 스코어보드 이상 배지"
```

---

### Task 3.5: 카피/소재 제안 (온디맨드)

**Files:**
- Create: `lib/marketing/creative-input.ts`
- Test: `tests/campaigns/creative-input.test.ts`
- Create: `app/api/admin/marketing/creative-suggest/route.ts`
- Modify: `components/admin/campaigns/tabs/MetaTab.tsx` (버튼+결과 패널)

- [ ] **Step 1: 실패하는 테스트 작성** — `aggregateAdCreativePerf`: `getMetaAdInfo`(lib/crm/lead-attribution.ts:67)로 리드를 (campaign, adset, ad)별 접기.

```ts
import { describe, expect, it } from "vitest"
import { aggregateAdCreativePerf } from "@/lib/marketing/creative-input"
import type { LeadRecord } from "@/lib/repositories/leads"

function lead(partial: Partial<LeadRecord>): LeadRecord {
  return { source: "meta_lead_ads", ...partial } as LeadRecord
}

describe("aggregateAdCreativePerf", () => {
  it("광고명별 리드·전환 집계 + 리드 수 내림차순", () => {
    const rows = aggregateAdCreativePerf([
      lead({ utm_campaign: "여름", utm_term: "A그룹", utm_content: "카피1" }),
      lead({ utm_campaign: "여름", utm_term: "A그룹", utm_content: "카피1" }),
      lead({ utm_campaign: "여름", utm_term: "B그룹", utm_content: "카피2" }),
    ])
    expect(rows[0]).toMatchObject({ campaign: "여름", ad: "카피1", leads: 2 })
    expect(rows[1]).toMatchObject({ ad: "카피2", leads: 1 })
  })
  it("meta_lead_ads 아닌 리드는 제외", () => {
    expect(aggregateAdCreativePerf([lead({ source: "homepage" })])).toEqual([])
  })
})
```

(converted 집계는 Task 2.3에서 승격한 `isConvertedLead` 재사용 — 테스트 리드에 해당 status 필드를 채워 1케이스 추가.)

- [ ] **Step 2: 실패 확인** → 구현:

```ts
// lib/marketing/creative-input.ts
// 광고 소재별 성과 집계 — 원천은 leads 의 UTM(getMetaAdInfo). Graph ad-level insights 는
// 미수집이므로 소재별 spend/CPL 은 없다 — 리드 볼륨·전환 기준 랭킹임을 소비처 UI 에 명시한다(정직).

import { getMetaAdInfo, isConvertedLead } from "@/lib/crm/lead-attribution"
import type { LeadRecord } from "@/lib/repositories/leads"

export interface AdCreativePerf {
  campaign: string | null
  adset: string | null
  ad: string | null
  leads: number
  converted: number
}

export function aggregateAdCreativePerf(leads: LeadRecord[]): AdCreativePerf[] {
  const byKey = new Map<string, AdCreativePerf>()
  for (const lead of leads) {
    const info = getMetaAdInfo(lead)
    if (!info) continue
    const key = `${info.campaign ?? ""}${info.adset ?? ""}${info.ad ?? ""}`
    const row = byKey.get(key) ?? {
      campaign: info.campaign ?? null,
      adset: info.adset ?? null,
      ad: info.ad ?? null,
      leads: 0,
      converted: 0,
    }
    row.leads += 1
    if (isConvertedLead(lead)) row.converted += 1
    byKey.set(key, row)
  }
  return [...byKey.values()].sort((a, b) => b.leads - a.leads)
}
```

(`getMetaAdInfo`의 `MetaAdInfo` 필드명은 구현 시 lead-attribution.ts를 읽고 정확히 맞춘다 — campaign/adset/ad 명명이 다르면 테스트·코드 동시 수정.)

- [ ] **Step 3: 라우트** — `POST /api/admin/marketing/creative-suggest`: verifyAdmin → body `{period?: "30d"|"90d"}`(기본 90d) → `getMarketingLeads()` 기간 필터 → `aggregateAdCreativePerf` → 상위 10·하위 5(leads≥2) → Gemini(브리핑과 동일 호출 패턴, responseSchema: `{patterns: string[], suggestions: [{headline, body, rationale}]}`, 시스템 프롬프트: 성과 데이터 기반 소재 패턴 분석+제안, 데이터 밖 수치 금지, META_INTENT_RULES 키워드 참고 컨텍스트로 주입) → JSON 반환(저장 없음 v1). `maxDuration = 60`.
- [ ] **Step 4: MetaTab UI** — AdLeadsPanel 아래 "AI 소재 제안" 섹션: 실행 버튼(로딩 상태) → patterns 목록 + suggestions 카드. "소재별 광고비 미수집 — 리드 기준 랭킹" 각주.
- [ ] **Step 5: 게이트 + 커밋**

```bash
git add lib/marketing/creative-input.ts tests/campaigns/creative-input.test.ts app/api/admin/marketing/creative-suggest/route.ts components/admin/campaigns/tabs/MetaTab.tsx
git commit -m "feat(marketing): AI 카피/소재 제안 (온디맨드)"
```

---

### Task 3.6: 최종 게이트 + 실화면 검증

- [ ] **Step 1: 게이트 전체**

```bash
npm run typecheck && npm run lint && npm run build
npx vitest run tests/campaigns
```
Expected: 전부 PASS (신규 실패 0)

- [ ] **Step 2: 실화면 종합 검증** — 요약 탭(브리핑·배지·업데이트), 광고 탭(소재 제안), 행사 탭(이동 섹션), `?force=1` 브리핑 재생성, 콘솔 에러 0. 스크린샷 공유.

- [ ] **Step 3: 배포 전 체크리스트 기록** — 마이그 5개 적용 확인(1.9), 백필 실행 확인, 크론 2개는 배포 후 vercel 크론 등록 자동. 푸시 전 게이트 재실행(동시 세션 WIP 주의). 프로덕션 반영은 Preview/Promote 수동 절차.

## 자체 검토 노트

- 스펙 전 요구 대응: Phase 1(1a→Task 1.2-1.5, 1b→1.8, 1c→3.2, 1d→1.6-1.7) / Phase 2(토글→2.2, KPI·트렌드·스코어보드·퍼널·믹스·피드→2.3-2.4) / Phase 3(브리핑→3.2-3.4, 이상→3.1+3.4, 카피→3.5). 정직 규칙은 각 태스크에 인라인.
- 시안과 의도적 차이 1건: 퍼널 '딜' 5단 제외(4단) — 리드-딜 조인 신뢰도 확보 전 정직 우선. KPI의 "리드→딜 전환"도 "리드 전환율"(AdLeadsPanel converted 정의)로 구현.
- 구현 시 반드시 현재 파일을 읽고 맞출 것으로 표시한 지점: AdLeadsPanel 전환 상수(2.3-1), gatherEvents async 전파(1.6-2), MetaAdInfo 필드명(3.5-2), 토글 버튼 클래스(2.2), ChannelBudgetTable 집행 산식(2.3-2 6번), createdBy 획득 방식(1.8-3).
