# Branch Dashboard — Design Spec

- 작성일: 2026-04-27
- 위치: `app/admin/branch` (기존 lead-by-branch 페이지 교체)
- 목표: 회사 BD/MKT/CSM 전체 영업·마케팅·고객 운영 데이터를 단일 어드민 대시보드에 통합. Google Sheets 두 개(Sales Branding, Hardware) 와 기존 Supabase 도메인(events, email_campaigns, leads) 을 결합.

## 1. 목표 / 비목표

**목표**
- 팀(BD/MKT/CSM) 단위 매출/활동/지역/파이프라인을 단일 화면에서 보고 액션을 결정.
- Google Sheets 가 단일 진실의 원천. 대시보드는 빠른 읽기 캐시로 동작.
- "다음 액션 5" 와 같은 자연어 인사이트는 LLM 으로 생성하되 모든 수치는 코드로 계산.
- 매출/KPI/가까운 딜/행사/캠페인 5개 핵심 지표를 상단에 고정.

**비목표 (이번 PR 범위 밖)**
- 시트 양방향 쓰기 (대시보드는 read-only)
- 외부 지사 사용자 (`branch` role) 의 격리 뷰 — admin 권한 통합. 기존 페이지는 삭제, 별도 뷰 필요 시 후속 PR.
- 세부 회계연도 회귀 분석 (이번 화면은 현재 FY 기준 페이싱·드릴다운)
- HW 시트 양방향 입출고 입력
- LLM 액션 제안의 자동 실행/티켓 생성

## 2. 시트 인덱스 (단일 진실의 원천)

| 시트 | spreadsheet ID | 용도 | 비고 |
|---|---|---|---|
| Sales Branding | `1BTXyid66wpTDTCA-fm-lTrJJ1G4KxzjhGWsN7LLP4qg` | DSH/SEG/REV/KPI 4 탭 | 분석 대상 = BD/MKT/CSM 모든 팀 |
| Hardware | `1XZNIPCYE8sZnyk2K-iHVAJmpaFFBvbDM1q_jsxK4t-k` | 판매대시보드/재고현황/2.입고 현황/3.출고 현황 | 4 탭 |

서비스 계정 = 기존 `.env.local` 의 `GOOGLE_SERVICE_ACCOUNT_EMAIL` 와 동일 (`classin-admin@classin-home.iam.gserviceaccount.com`). 두 시트 모두 해당 이메일에 **Viewer** 권한 공유 필요 (시트 소유자가 수동 1회).

## 3. 환경 변수

`.env.local` 추가:

```
GOOGLE_BRANCH_DASHBOARD_SHEET_ID=1BTXyid66wpTDTCA-fm-lTrJJ1G4KxzjhGWsN7LLP4qg
GOOGLE_BRANCH_HARDWARE_SHEET_ID=1XZNIPCYE8sZnyk2K-iHVAJmpaFFBvbDM1q_jsxK4t-k
BRANCH_DASHBOARD_CRON_SECRET=<32바이트 랜덤>
GEMINI_API_KEY=<Google AI Studio 키. 절대 커밋 금지>
GEMINI_MODEL=gemini-2.5-flash   # 옵션, 기본값
```

`.env.local.example` 동일하게 추가하되 값은 빈 문자열.

## 4. 회계연도 / 기간 토글

- 회계연도(FY) 4월 시작, 3월 종료. `FY2026 = 2026-04-01 ~ 2027-03-31`.
- 분기: Q1=4·5·6 / Q2=7·8·9 / Q3=10·11·12 / Q4=1·2·3.
- 기간 토글 `M | Q | Y` 는 다음을 의미:
  - **M** = 현재 월
  - **Q** = 현재 분기 누적
  - **Y** = 현재 FY 누적
- 모든 페이싱·달성률·페이지 카운트는 위 기준을 따름.
- 상수와 헬퍼는 `lib/branch/fiscal.ts` 1곳에서 export.

## 5. 아키텍처

```
[Sheets]                          [Supabase]                  [Next.js / Browser]
 Sales Branding (DSH/SEG/REV/KPI)
   ├─ DSH ── 직조회 + 60s 캐시 ──────────────────────────────┐
   ├─ SEG ── 직조회 + 60s 캐시 ──────────────────────────────┤
   ├─ REV ── cron 4h ──► branch_rev_deals                  ┤
   └─ KPI ── 직조회 + 60s 캐시 ──────────────────────────────┤
 Hardware                                                   │
   ├─ 판매대시보드  ── cron 4h ──► branch_hw_sales_monthly  ┤   /admin/branch
   ├─ 재고현황     ── cron 4h ──► branch_hw_stock          ├──►  page.tsx (server)
   ├─ 2.입고 현황  ── cron 4h ──► branch_hw_inbound        │     └─ BranchDashboardClient
   └─ 3.출고 현황  ── cron 4h ──► branch_hw_outbound       │
                                                            │   /api/admin/branch/{summary|heatmap|
                                                            │     pipeline|kpi|hw|insights|sync}
 [Supabase 기존 도메인]                                     │
   ├─ events        ─────────────────────────────────────── │
   ├─ email_campaigns ───────────────────────────────────── │
   └─ leads (캠페인 → 전환 매출) ────────────────────────── ┘

 [Gemini API]
   gemini-2.5-flash, 일 1회 cron 또는 강제 새로고침,
   입력 = 코드 계산된 KPI JSON, 출력 = 한 줄 정의 + 다음 액션 5
```

**핵심 원칙**

1. 단일 진실의 원천 = 시트. Supabase 는 빠른 읽기 캐시.
2. 동기화 실패 시 마지막 성공 데이터를 보존하고 SyncStatusBar 에 경고만 표시. 화면은 죽지 않음.
3. 수치는 항상 코드로 계산. LLM 은 자연어 1문장(`one_liner`) + 액션 5(`next_actions`) 만 생성.
4. 무거운 raw (REV `A1:CZ400`, HW 입출고) 는 Supabase, 가벼운 요약 (DSH/SEG/KPI) 은 직조회 + 60초 캐시.

## 6. 파일 구조

```
app/
  admin/branch/
    page.tsx                       # 서버 컴포넌트
    loading.tsx
  api/
    admin/branch/
      summary/route.ts             # 핵심 지표 5카드
      heatmap/route.ts             # 지역 히트맵
      pipeline/route.ts            # REV 파이프라인
      kpi/route.ts                 # 활동 KPI
      hw/route.ts                  # 하드웨어
      insights/route.ts            # LLM 인사이트 (1d 캐시)
      sync/route.ts                # POST, verifyAdmin, 수동 동기화
    cron/sync-branch/route.ts      # GET, Bearer CRON_SECRET, 4h 주기

components/admin/branch/
  BranchDashboardClient.tsx        # 팀/기간 토글 + 섹션 컴포지션
  SyncStatusBar.tsx
  sections/
    InsightCard.tsx                # 섹션 0 — LLM
    CoreKpiGrid.tsx                # 섹션 1 — 5 카드
    FiscalRoadmap.tsx              # 섹션 2 — 타임라인
    RegionHeatmap.tsx              # 섹션 3
    TeamPacingSection.tsx          # 섹션 4-A
    ManagerScorecard.tsx           # 섹션 4-B
    KpiActivityMatrix.tsx          # 섹션 4-C
    ManagerPipelineMini.tsx        # 섹션 4-D
    PipelineTable.tsx              # 섹션 5
    CampaignsSection.tsx           # 섹션 6
    HardwareSection.tsx            # 섹션 7
    DataQualityPanel.tsx           # 섹션 8

lib/branch/
  fiscal.ts                        # FY 헬퍼
  google-sheets.ts                 # readRange, readRangeWithFormat (재시도)
  parsers/
    dsh.ts seg.ts rev.ts kpi.ts hw.ts
  computations/
    heatmap.ts pacing.ts pipeline.ts kpi.ts data-quality.ts campaigns.ts core-kpi.ts
  insights/
    input-builder.ts               # buildInsightInput(team, period)
    gemini-runner.ts               # callGemini(prompt) → { one_liner, next_actions[] }
    prompt.ts                      # 분석가 페르소나 + JSON output schema
  sync/
    sync-rev.ts sync-hw.ts run-all.ts

lib/repositories/
  branch-deals.ts                  # branch_rev_deals
  branch-hw.ts                     # branch_hw_*
  branch-insights.ts               # branch_dashboard_insights
  branch-sync.ts                   # branch_sync_runs

supabase/migrations/
  20260427_branch_dashboard.sql

tests/branch/
  fixtures/                        # 시트 응답 픽스처
  parsers/*.test.ts
  computations/*.test.ts
  fiscal.test.ts
```

기존 `app/admin/branch/page.tsx` 는 삭제. `branch` role 분기 코드는 사용처 없으므로 함께 제거.

## 7. 데이터 모델 (Supabase 마이그레이션 `20260427_branch_dashboard.sql`)

```sql
-- REV raw (시트 1행 = 1 row)
create table branch_rev_deals (
  id              uuid primary key default gen_random_uuid(),
  sheet_row       int  not null,
  customer_name   text not null,                 -- A
  branch_contact  text,                           -- B
  team            text,                           -- C  BD/MKT/CSM/...
  manager         text,                           -- D
  deal_type       text,                           -- E  Direct|Channel
  status          text,                           -- F  New|Renew
  first_payment   date,                           -- G  있으면 확정 후보
  product_version text,                           -- H
  region          text,                           -- I
  importance      text,                           -- K  KA|A|B
  note            text,                           -- L
  contract_target numeric(14,0),                  -- M  목표/잠재 — 실매출 아님
  monthly_payments jsonb not null default '{}',   -- N~ : { "YYYY-MM": amount }
  monthly_red      jsonb not null default '{}',   -- 빨간 셀 여부 : { "YYYY-MM": true }
  raw              jsonb not null default '{}',
  synced_at        timestamptz not null default now()
);
create index branch_rev_team_idx       on branch_rev_deals(team);
create index branch_rev_region_idx     on branch_rev_deals(region);
create index branch_rev_manager_idx    on branch_rev_deals(manager);
create index branch_rev_first_pay_idx  on branch_rev_deals(first_payment);

-- HW 입고
create table branch_hw_inbound (
  id            uuid primary key default gen_random_uuid(),
  logistics_no  text,
  inbound_date  date,
  product       text not null,
  quantity      int  not null default 0,
  unit_price    numeric(14,0),
  amount        numeric(14,0),
  serials       text[],
  storage       text,
  importer      text,
  remarks       text,
  raw           jsonb not null default '{}',
  synced_at     timestamptz not null default now()
);

-- HW 출고
create table branch_hw_outbound (
  id            uuid primary key default gen_random_uuid(),
  logistics_no  text,
  outbound_date date,
  owner         text,
  product       text not null,
  quantity      int  not null default 0,
  revenue       numeric(14,0),
  destination   text,
  serials       text[],
  progress      text,
  type          text,
  remarks       text,
  raw           jsonb not null default '{}',
  synced_at     timestamptz not null default now()
);

-- HW 재고현황 시트 (보조)
create table branch_hw_stock (
  id          uuid primary key default gen_random_uuid(),
  product     text not null,
  category    text,
  quantity    int  not null default 0,
  raw         jsonb not null default '{}',
  synced_at   timestamptz not null default now()
);

-- HW 판매대시보드 (FY 월별 판매량)
create table branch_hw_sales_monthly (
  id          uuid primary key default gen_random_uuid(),
  fiscal_year int  not null,                    -- FY (예: 2026)
  fiscal_month int not null,                    -- 4..3 (회계연도 월)
  product     text not null,
  quantity    int  not null default 0,
  raw         jsonb not null default '{}',
  synced_at   timestamptz not null default now(),
  unique (fiscal_year, fiscal_month, product)
);

-- LLM 인사이트 캐시
create table branch_dashboard_insights (
  id            uuid primary key default gen_random_uuid(),
  team          text not null,                  -- 'ALL' | 'BD' | 'MKT' | 'CSM'
  fiscal_period text not null,                  -- 'FY2026-Q1' 등
  generated_at  timestamptz not null default now(),
  one_liner     text,
  next_actions  jsonb not null default '[]',    -- [{title, why, owner, due}]
  raw_response  jsonb,                           -- LLM 원본
  input_digest  text                             -- sha256(input JSON)
);
create index branch_insights_idx on branch_dashboard_insights(team, generated_at desc);

-- 동기화 이력
create table branch_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  source        text not null,                   -- 'rev' | 'hw' | 'all' | 'insights'
  trigger       text not null,                   -- 'cron' | 'manual'
  status        text not null,                   -- 'running' | 'success' | 'failed'
  rows_affected int,
  error         text
);
create index branch_sync_runs_recent_idx on branch_sync_runs(started_at desc);

-- 원자적 교체용 PL/pgSQL 함수 (REV/HW 모두 같은 패턴)
create or replace function replace_branch_rev_deals(rows jsonb)
returns void language plpgsql as $$
begin
  truncate branch_rev_deals;
  insert into branch_rev_deals (
    sheet_row, customer_name, branch_contact, team, manager, deal_type, status,
    first_payment, product_version, region, importance, note, contract_target,
    monthly_payments, monthly_red, raw
  )
  select
    (r->>'sheet_row')::int,
    r->>'customer_name', r->>'branch_contact', r->>'team', r->>'manager',
    r->>'deal_type', r->>'status',
    nullif(r->>'first_payment','')::date,
    r->>'product_version', r->>'region', r->>'importance', r->>'note',
    nullif(r->>'contract_target','')::numeric,
    coalesce(r->'monthly_payments','{}'::jsonb),
    coalesce(r->'monthly_red','{}'::jsonb),
    coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

-- HW 4 테이블 각각 동일 패턴 함수: replace_branch_hw_inbound, replace_branch_hw_outbound,
-- replace_branch_hw_stock, replace_branch_hw_sales_monthly
```

## 8. 시트 컬럼 매핑 / 파서 규칙

### 8.1 REV (`REV!A1:CZ400`)

| 컬럼 | 의미 | 파서 처리 |
|---|---|---|
| A | 고객사명 | 필수, 빈 행은 스킵 |
| B | 지점/연락처 | optional |
| C | 팀 | `BD`/`MKT`/`CSM` 외 값은 `team='기타'` 처리 |
| D | 매니저 | 정규화: 좌우 공백 trim, 표기 변형은 데이터 품질 패널에 경고 |
| E | 유형 | `Direct` 또는 `Channel`, 기타는 그대로 보존 |
| F | 상태 | `New` 또는 `Renew` |
| G | 첫 납부일 | ISO 또는 시트 날짜 직렬값 모두 처리, 비어있으면 null |
| H | 제품/계약 버전 | text |
| I | 지역 | trim, 데이터 품질에서 Levenshtein ≤2 클러스터 검증 |
| K | 중요도 | `KA`/`A`/`B` 외는 그대로 보존 |
| L | 비고 | text. `Negotiation`/`Proposal` 키워드 검출에 사용 |
| M | 계약 목표 금액 | **실매출 아님** — UI 어디에서도 "매출"로 표기 금지 |
| N+ | 월별 납부 합계 | 1행 헤더로 `YYYY-MM` 매핑. 빨간 배경은 `monthly_red[YM]=true` |

`readRangeWithFormat()` 는 `sheets.spreadsheets.get` 의 `includeGridData=true`, `ranges=['REV!A1:CZ400']`, `fields='sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor,userEnteredValue)'` 사용. 빨간 셀 판별:

```ts
const isRed = (bg?: {red?:number; green?:number; blue?:number}) =>
  !!bg && (bg.red ?? 0) >= 0.85 && (bg.green ?? 0) < 0.5 && (bg.blue ?? 0) < 0.5
```
임계값은 첫 동기화 후 실제 시트 색을 보고 보정 가능 (위험요소 §17.2).

### 8.2 DSH (`DSH!A1:V200`)

회계연도 월 순서 = `[4,5,6,7,8,9,10,11,12,1,2,3]`. 컬럼 의미:
- F: 연간 합계
- G~J: Q1~Q4
- K~V: 월별 (FY 월 순서)

행 구조 추정:
```
[BD]      Goal
[BD]      Status
  Han       Goal
  Han       Status
  Wangchan  Goal
  Wangchan  Status
  Junhyuk   Goal
  Junhyuk   Status
[MKT]     Goal
[MKT]     Status
  ... 멤버들
[CSM]     Goal
[CSM]     Status
  ... 멤버들
```

파서 출력:
```ts
type DshRow = {
  level: 'team' | 'member'
  team: 'BD' | 'MKT' | 'CSM' | string
  member?: string
  kind: 'goal' | 'status'
  annual: number
  quarters: [number, number, number, number]
  months: Record<string, number>   // 'YYYY-MM' (FY 월 매핑)
}
```

부수 효과: 멤버 → 팀 매핑 dictionary 도 함께 추출 → KPI 파서가 사용.

### 8.3 SEG (`SEG!A1:AZ100`)

DSH 보조 해석용으로만. **히트맵/지역별 매출 계산에는 사용 금지**. 파서는 다음만 추출:
- L: Goal 섹션 지역명 / M: Goal 금액
- Q: Status 섹션 지역명 / R: Status 금액

SEG 값을 UI 에 노출하는 곳은 데이터 품질 패널 11번 ("SEG status==goal 인 지역" 안내) 한 곳뿐.

### 8.4 KPI (`KPI!A1:AZ60`)

- A: 멤버명
- B~F: LD/ACC/OPP/SOL/VST 활동 **목표**
- V~Z: 동일 순서 활동 **실적**

`branch_team_members` 매핑(DSH 출력)으로 멤버 → 팀 매칭. 매칭 실패 시 데이터 품질 13번 경고.

지표 약어:
- LD = Lead, ACC = Account, OPP = Opportunity, SOL = Solution, VST = Visit

### 8.5 Hardware 시트

- **판매대시보드** — FY 월별 제품 판매량. 1열 제품명, 그 외 월별 컬럼. FY 월 순서 가정.
- **재고현황** — `재고 현황` 헤더 행 이후를 데이터로 인식. 컬럼 = 제품명/카테고리/수량.
- **2.입고 현황** — 물류No./입고일/제품명/수량/단가/금액/시리얼/보관 장소/수입자/Remarks.
- **3.출고 현황** — 물류No./출고일/담당자/제품명/수량/매출/배송·설치 장소/시리얼/진행 상태/유형/Remarks.

핵심 제품 카탈로그(컴퓨테이션·재고 부족 임계 적용):
```ts
const HW_CORE_PRODUCTS = [
  { key: 'IFP86',  match: /86["”]?\s*IFP/i,  threshold: 2 },
  { key: 'IFP75',  match: /75["”]?\s*IFP/i,  threshold: 2 },
  { key: 'CAM_T1', match: /T1\s*카메라|카메라\s*T1/i, threshold: 2 },
  { key: 'CAM_S1', match: /S1\s*카메라|카메라\s*S1/i, threshold: 2 },
  { key: 'OPS',    match: /\bOPS\b/i,                threshold: 5 },
] as const
```

재고 산출:
- 입출고 기반 재고 = Σ 입고 quantity − Σ 출고 quantity (제품 카탈로그 매핑 기준)
- 재고현황 시트 보조: 임계 5 이하면 부족 (OPS 동일 5 이하)
- 입출고 기반 임계: 2 이하 (OPS 만 5)
- 두 기준이 다르면 데이터 품질 패널 12번에 표시

## 9. 계산 규칙

### 9.1 지역 히트맵 (`heatmap.ts`)

**REV 전용**. SEG 사용 금지.

```ts
type Period = 'M' | 'Q' | 'Y'
type RegionRow = {
  region: string
  target: number          // M열 합 (firstPayment 무관)
  revenue: number         // 빨간 셀 + firstPayment 있는 딜만, 기간 토글에 따라 합산
  progress: number        // revenue / target × 100
  status: 'good' | 'warning' | 'critical'  // ≥95 / ≥75 / <75
  velocity: number        // (revenueQ / target) ÷ (분기 진행률), Q 토글일 때만 유의미
}
```

`team` 토글 적용 시 `team` 필터 후 그룹핑.

### 9.2 페이싱 / 매니저 카드 (`pacing.ts`)

DSH `goal/status` × 기간 토글로 산출. 매니저 카드는 DSH 매핑된 멤버 동적 렌더.

각 매니저 카드:
- 목표 (DSH `goal.annual` 또는 `quarters[Q]` 또는 `months[YM]`)
- 확정 매출 (REV 매니저 필터 + 빨간 셀)
- 파이프라인 (확률 × M열, §9.4)
- 달성률 (확정/목표)
- New/Renew 비중 (REV F열)
- 활동 KPI 미니 막대 (KPI 시트 5종)
- 강점·리스크·다음 액션 (LLM 결과 — 매니저 단위 인사이트는 v1 에서는 팀 인사이트의 일부로만 표기, 별도 LLM 호출 X)

### 9.3 핵심 지표 5 카드 (`core-kpi.ts`)

| 카드 | 산출 |
|---|---|
| 매출 | `revenue/target` (기간 토글), 페이싱 화살표 = (현재 페이싱 vs 일정 페이싱) |
| KPI | 5종 중 달성률 최저 1종 + 매니저 ★ |
| 가까운 딜 | `firstPayment` 가 향후 30일 내 OR `dealProbability >= 0.7` 인 REV 행 카운트 + Σ contract_target |
| 행사 | Supabase `events` 의 `start_at` 향후 30일 + 지역 N개 |
| 캠페인 성과 | `email_campaigns` 최근 30일 발송 N건 + 평균 open/click. 가능하면 캠페인 → leads 연결 후 전환 매출 합 |

### 9.4 파이프라인 확률 (`pipeline.ts`)

```ts
function dealProbability(d: BranchRevDeal): number {
  if (d.first_payment) return 1.0
  if (/Negotiation/i.test(d.note ?? '')) return 0.7
  if (/Proposal/i.test(d.note ?? '')) return 0.5
  let base = d.status === 'Renew' ? 0.4 : 0.2
  if (d.deal_type === 'Channel') base *= 0.85
  if (d.importance === 'KA') base += 0.1
  return Math.min(base, 0.6)
}
function pipelineValue(d: BranchRevDeal): number {
  return Number(d.contract_target ?? 0) * dealProbability(d)
}
```

### 9.5 데이터 품질 12+1 체크 (`data-quality.ts`)

각 결과: `{ id, severity: 'info'|'warn'|'error', message, samples?: any[] }`.

1. M열 → 실매출 노출 — 코드 검색에서 금지된 패턴 발견 시 build-time 에러 (정적). 런타임 체크는 N/A.
2. firstPayment 있는데 monthly 합 0 인 딜 → warn, 샘플 5개
3. 매니저명 표기 불일치 (대소문자/공백) → warn
4. 월 헤더 정규화 실패 (1~12 숫자만, FY 매핑 안 됨) → error
5. 지역명 클러스터 (Levenshtein ≤2) → warn
6. HW 재고현황 vs 입출고 잔량 차이 ≥ 임계 → warn
7. DSH Goal/Status 행 추정 실패 → error
8. KPI B~F 비고 V~Z만 채워진 행 → warn (컬럼 밀림 가능성)
9. HW 입출고 제품명이 카탈로그와 매칭 안 됨 → warn
10. 빨간 셀 추출 실패 (formatRuns 0 cells) → error
11. SEG `status == goal` 인 지역 → info (스펙상 SEG 자체 결함, 히트맵 미사용 사실 재확인용)
12. REV F열 N/Renew 외 값 → info
13. **신규**: KPI 시트 멤버 중 DSH 팀 매핑 누락 → warn

## 10. 동기화

### 10.1 Cron (Vercel)

`vercel.json` 추가:
```json
{
  "crons": [
    { "path": "/api/cron/sync-branch", "schedule": "0 */4 * * *" },
    { "path": "/api/cron/sync-branch-insights", "schedule": "0 5 * * *" }
  ]
}
```

`/api/cron/sync-branch` 는 `Bearer ${BRANCH_DASHBOARD_CRON_SECRET}` 검증 후 `runAll()` 호출.
`/api/cron/sync-branch-insights` 는 매일 새벽 5시 (KST 새벽), 4개 팀 컨텍스트(`ALL`/`BD`/`MKT`/`CSM`) 각각 LLM 호출.

### 10.2 동기화 로직 (`run-all.ts`)

각 동기화 단위는:
1. `branch_sync_runs` `status='running'` INSERT
2. 시트 호출 + 파싱
3. `replace_branch_*` PL/pgSQL 함수로 truncate→insert (원자성 보장)
4. 성공 시 `status='success'`, rows_affected
5. 실패 시 `status='failed'`, error 저장. **기존 데이터 보존**

소스: `rev`, `hw`, `insights`, `all`. 트리거: `cron`, `manual`.

### 10.3 직조회 + Next.js 캐시 (DSH/SEG/KPI)

```ts
import { unstable_cache } from 'next/cache'
export const readDsh = unstable_cache(
  () => readRangeWithFormat('DSH!A1:V200'),
  ['branch-dsh'], { revalidate: 60, tags: ['branch-dsh'] }
)
```

수동 새로고침 = `/api/admin/branch/sync` POST (verifyAdmin):
- `revalidateTag('branch-dsh' | 'branch-seg' | 'branch-kpi')`
- `runAll({ trigger:'manual' })` (REV/HW)
- 인사이트는 별도 버튼 (force=1) 으로 강제 재생성 가능

## 11. LLM 인사이트 (Gemini)

### 11.1 모델 / SDK

- 기본 모델: `gemini-2.5-flash` (env `GEMINI_MODEL` 로 override 가능)
- 호출: REST 직접 (`fetch`) — `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`
- 응답 모드: `responseMimeType: 'application/json'` + `responseSchema` 로 JSON 출력 강제
- 추가 의존성 없음 (`@google/generative-ai` 미사용)

### 11.2 입력 빌더 (`input-builder.ts`)

```ts
buildInsightInput(team: 'ALL'|'BD'|'MKT'|'CSM', period: 'M'|'Q'|'Y'): InsightInput
```

출력 JSON (값은 모두 코드 계산):
```ts
type InsightInput = {
  fiscalPeriod: string         // 'FY2026-Q1'
  team: string                 // 'ALL'|'BD'|'MKT'|'CSM'
  scope: 'M'|'Q'|'Y'
  team_pacing: { goal:number; status:number; pacing_pct:number }
  managers: Array<{
    name: string
    team: string
    goal: number; status: number; pipeline: number
    achievement_pct: number
    deals_total: number; deals_confirmed: number
    new_renew: { new:number; renew:number }
    kpi: { LD:[g,a]; ACC:[g,a]; OPP:[g,a]; SOL:[g,a]; VST:[g,a] }
  }>
  regions: Array<{ region:string; target:number; revenue:number; progress_pct:number; status:'good'|'warning'|'critical' }>
  bottleneck_kpi: { name:string; pct:number; worst_manager:string }
  closing_deals: Array<{ customer:string; manager:string; expected:number; due:string }>
  events_30d: Array<{ title:string; date:string; region?:string }>
  campaigns_30d: Array<{ name:string; sent_at:string; open_pct:number; click_pct:number; conv_revenue?:number }>
  hw_alerts: Array<{ product:string; current:number; threshold:number }>
}
```

### 11.3 시스템 프롬프트 (`prompt.ts` 발췌)

분석가 페르소나는 사용자가 제공한 12 섹션 가이드 그대로. 출력은 **JSON 객체**로 강제:
```json
{
  "one_liner": "...",
  "next_actions": [
    { "title": "...", "why": "...", "owner": "Han|...", "due": "YYYY-MM-DD" }
  ]
}
```

규칙(시스템 프롬프트):
- 입력 JSON 의 수치를 다시 계산하지 말 것 (그대로 인용)
- 출력은 5개 액션, 각 액션 100자 이내
- M열은 목표 금액, 실매출 아님 — 둘을 혼동하지 말 것
- 회계연도 4월 시작
- 반드시 위 JSON 스키마 준수, 다른 문자열 출력 금지

### 11.4 캐시 키 / 비용

- `input_digest = sha256(InsightInput JSON)`
- 24h 내 같은 digest 인사이트 있으면 재사용
- 강제 새로고침 = `force=1`
- 일일 cron 4팀 = 일 4회. flash 모델 기준 입력 5KB / 출력 1KB → 월 비용 < $1

## 12. UI 레이아웃

상단 글로벌 컨트롤 (sticky):
```
SyncStatusBar  |  팀 [전체|BD|MKT|CSM]  기간 [M|Q|Y]  [↻ 새로고침]
```

본문 (좌측 sticky anchor nav + 우측 본문):

```
0. AI 인사이트                  — 한 줄 정의 + 다음 액션 5
1. 핵심 지표 (5 카드)           — 매출 / KPI / 가까운 딜 / 행사 / 캠페인
2. 로드맵 / FY 타임라인         — 누적 목표 vs 매출 + ◆행사 ●딜 ▲캠페인
3. 지역 히트맵                  — REV 전용
4. 팀 / 매니저 (4-A~D)          — 페이싱 / 매니저 카드 / KPI 매트릭스 / 매니저 파이프라인 mini
5. 파이프라인 전체 테이블       — 필터: 매니저/지역/등급/단계
6. 마케팅 / 캠페인 성과         — email_campaigns
7. 하드웨어                     — 판매 추이 / 재고 / 출고 진행
8. 데이터 품질 점검             — 13종
```

색상 / 보더 / 섹션 배경은 CLAUDE.md UI 규칙 (`#FFFFFF` ↔ `#F6F5F4` ↔ `#ECFDF5`, `1px solid rgba(0,0,0,0.08)`).

## 13. API 라우트 (모두 `verifyAdmin()` 가드)

| 라우트 | 메서드 | 응답 핵심 |
|---|---|---|
| `/api/admin/branch/summary` | GET | 5 카드 + sync 상태 |
| `/api/admin/branch/heatmap` | GET `?team&period` | RegionRow[] |
| `/api/admin/branch/pipeline` | GET `?team&manager&region&importance&stage` | 파이프라인 행 |
| `/api/admin/branch/kpi` | GET `?team` | 매니저 × 5 KPI |
| `/api/admin/branch/hw` | GET | 판매 추이 + 재고 + 출고 상태 |
| `/api/admin/branch/insights` | GET `?team&force=0\|1` | one_liner + next_actions[] |
| `/api/admin/branch/sync` | POST | runAll trigger 'manual' |
| `/api/cron/sync-branch` | GET (Bearer CRON_SECRET) | runAll trigger 'cron' |
| `/api/cron/sync-branch-insights` | GET (Bearer CRON_SECRET) | 4팀 인사이트 일괄 생성 |

## 14. 보안

- 두 시트는 service account 에 **Viewer** 만 공유. 시트 자체에서 편집 가능한 구글 계정은 변경 없음.
- 다운로드된 JSON 키 파일(`/Users/.../classin-home-27bc23b04f40.json`) 은 작업 후 삭제. 같은 계정 정보가 이미 env 에 있으므로 별도 보관 불필요. 보관해야 한다면 `classin_secret/` (`.gitignore` 됨).
- LLM 입력 JSON 에서 PII 제외:
  - 고객 담당자 이름/이메일/전화 X
  - 고객사명, 매니저명, 금액, 지역은 포함
- cron 라우트는 Bearer 토큰. 외부 노출 시 서비스 거부 방지 위해 4시간에 1회만 실행되며 동시 실행 방지(`branch_sync_runs` 의 `running` 행 1개 이상이면 신규 호출은 즉시 종료).
- DB 접근은 모두 `createSupabaseAdminClient()` (memory 규칙: server 클라이언트 쓰면 RLS 차단됨).
- 인사이트 LLM 호출은 일 4회 cron + 사용자 강제. 비용 폭주 방지 위해 강제 호출은 1분당 1회 rate limit.

## 15. 오류 처리

| 상황 | 사용자에게 보이는 것 |
|---|---|
| 시트 호출 실패 | 마지막 성공 데이터 노출 + SyncStatusBar 빨간 배너 + 마지막 성공 시각 + 에러 메시지 |
| 빨간 셀 추출 실패 (formatRuns 빈) | "확정 매출 계산 불가" 카드, 데이터 품질 패널 10번 error |
| LLM 호출 실패 | 마지막 캐시 + "stale" 배지. 캐시도 없으면 카드만 노출, "다음 액션 5는 일시 사용 불가" |
| 캠페인 데이터 없음 | 카드 5번 "데이터 없음" 빈 상태 |
| 행사 데이터 없음 | 카드 4번 "데이터 없음" 빈 상태 |
| HW 시트 권한 없음 | 7번 섹션 빈 상태 + 데이터 품질 9·10번 error |
| 동기화 동시 호출 | 신규 호출 즉시 200 + `{ status: 'already_running' }` 반환 |

## 16. 테스트 전략

| 레이어 | 도구 | 대상 |
|---|---|---|
| 회계연도 | Vitest | `fiscal.ts` 경계값 (3/31, 4/1, 12/31, 1/1) |
| 파서 | Vitest + `tests/branch/fixtures/*.json` | DSH/SEG/REV/KPI/HW. 빨간 셀, 월 헤더, 팀 그룹핑 |
| 계산 | Vitest | heatmap 임계값, 파이프라인 확률, 데이터 품질 13종, 코어 KPI |
| 동기화 | Vitest + Supabase test schema (선택) 또는 모킹 | replace 함수 호출 정합성 |
| LLM | 모킹 | gemini-runner 가 받는 입력 JSON 만 검증, 응답은 모킹 |
| Lint/Build | 기존 게이트 | `npx eslint app components lib --max-warnings=0` + `npm run build` |
| UI 화면 | 수동 | 직접 `/admin/branch` 열어 5 카드 + 토글 + 새로고침 동작 확인 (CLAUDE.md UI 규칙) |

## 17. 위험 요소 / 검증 필요

1. **DSH 행 위치 / 팀 헤더 패턴** — 파서는 추정 기반. 첫 동기화 후 결과를 콘솔/디버그에 덤프해 실제 시트와 매칭. 실패 시 §8.2 패턴 확정 후 재작업.
2. **빨간 셀 RGB 임계** — 첫 동기화 후 실 색상값을 sample 50개 추출해 임계값 보정. 변경은 `lib/branch/parsers/rev.ts` 1곳.
3. **KPI 멤버 → 팀 매핑** — DSH 매핑 실패 시 fallback 으로 빈 dictionary. 데이터 품질 13번에 미매핑 멤버 노출. 운영 중 하드코딩 dictionary 추가 가능.
4. **REV 월 헤더 표기 다양성** — `YYYY-MM` / `4월` / 숫자 `4` / `2026.04` 등. 파서가 정규화 실패하면 데이터 품질 4번 error.
5. **Vercel Cron timeout** — Vercel 플랜에 따라 함수 실행 시간 제한 다름 (Hobby 10s, Pro 60s). `runAll()` 이 분리되어 REV/HW/insights 각각 60초 내 완료되도록 설계. 실측 후 필요시 REV→`branch_rev_deals` 적재를 chunked insert (배치 100행) 로 분산. 플랜이 Hobby 면 cron 호출 → 별도 백그라운드 `runtime: 'nodejs'` + 외부 큐 필요 (이번 PR 범위 밖, plan 에서 호스팅 플랜 확인).
6. **Anthropic 에서 Gemini 전환** — 향후 Anthropic 키 확보 시 `gemini-runner` 만 교체 가능하도록 인터페이스(`callLlm(input)`) 분리.
7. **인사이트 출력 스키마 불일치** — Gemini JSON 모드 강제 + 응답 검증 (Zod 스키마). 실패 시 1회 재시도 후 stale 캐시 유지.
8. **LLM 환각 방지** — 시스템 프롬프트에 "수치 재계산 금지" 명시. 출력 검증 시 `next_actions` 텍스트에 등장하는 숫자가 입력 JSON 의 수치와 ±10% 이내인지 휴리스틱 검사.

## 18. 마일스톤

```
M1. 인프라 + 스키마           env, vercel.json, lib/google-sheets, sync 라우트 골격, migration
M2. 파서 + 컴퓨테이션         DSH/SEG/REV/KPI/HW 파서 + heatmap/pacing/pipeline/core-kpi/data-quality
M3. 첫 동기화 + 검증           실데이터 1회 동기화 → §17.1~4 보정
M4. 섹션 1~3 (인사이트 placeholder, 핵심 지표, 로드맵, 히트맵)
M5. 섹션 4~5 (팀/매니저, 파이프라인 테이블)
M6. 섹션 6~8 (캠페인, 하드웨어, 데이터 품질)
M7. LLM 인사이트 (Gemini, input-builder, prompt, runner, 캐시) — 섹션 0
M8. SyncStatusBar + 새로고침 UX 통합
M9. 검증 게이트              eslint + build + 수동 화면 점검
```

각 마일스톤은 단일 PR 내 commit 단위로 분리. M3 이후로는 실시트 가정이 깨질 수 있어 마일스톤 사이에 가정 갱신 가능.

## 19. 변경 사항 요약

- 기존 `/admin/branch` (lead-by-branch) 삭제. `branch` role 분기 코드 제거.
- 기존 `lib/google.ts` 그대로 재사용 (Auth/scopes 동일).
- 새 라이브러리 모듈: `lib/branch/*`.
- 새 컴포넌트 폴더: `components/admin/branch/*`.
- 새 API 라우트: `app/api/admin/branch/*`, `app/api/cron/sync-branch*`.
- 새 마이그레이션: `supabase/migrations/20260427_branch_dashboard.sql`.
- env 4개 추가 (위 §3).
- 기존 `lib/repositories/marketing.ts` 와 events 도메인은 그대로 read.

## 20. Plan 단계 첫 작업 (코드 작성 전 확정 항목)

이 항목들은 **plan 단계 첫 task** 로 처리. 모두 repo 내 코드/시트 한 번 호출이면 답이 나옴.

- DSH 팀 헤더 표기 (`BD` vs `사업개발`) — 첫 동기화 결과 콘솔 덤프로 확인.
- `events` 테이블 컬럼 (`start_at`, `region`, `title` 등) — `lib/supabase/database.types.ts` 또는 `lib/repositories/public-events.ts` 확인.
- `email_campaigns` 컬럼 (`sent_at`, `open_count`, `click_count`, `recipient_count` 등) — `lib/repositories/marketing.ts` + database types 확인.
- 캠페인 → leads 연결 키 (`campaign_id` on leads or `email_campaigns.audience` 등) — `lib/repositories/leads.ts` 확인.
- Vercel 플랜 (Hobby/Pro/Enterprise) — `vercel.json` 또는 사용자에게 확인.
- `verifyAdmin()` 시그니처 — `lib/admin/auth.ts` 또는 기존 admin API 라우트 1개 확인.

## 21. 단일 진실 원칙 요약 (지침)

- M열은 **계약 목표/잠재**. 실매출 아님. UI 라벨 어디에서도 "매출"로 표기 금지.
- 실매출 = `firstPayment` 있는 딜의 **빨간 셀 월별 납부 합**.
- 지역 히트맵은 **REV 전용**. SEG 사용 금지.
- 회계연도 4월 시작.
- 모든 수치는 코드 계산. LLM 은 자연어 요약 + 액션 5만.
- Supabase 동기화 실패 시 마지막 성공 데이터 보존.
- 모든 어드민 API 는 `verifyAdmin()` + admin Supabase 클라이언트.
