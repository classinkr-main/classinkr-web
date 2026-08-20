# 마케팅 퍼포먼스 대시보드 — 설계 (3페이즈)

2026-08-20 확정. 캠페인 허브(/admin/campaigns) 요약 탭을 퍼포먼스 마케팅 대시보드로 재구축하고, 데이터 스파인과 AI 레이어를 얹는다. 선행 분석: [campaign-marketing-ia-develop-analysis-2026-07-23.md](campaign-marketing-ia-develop-analysis-2026-07-23.md), [campaign-entity-d1-d3-plan-2026-07-24.md](campaign-entity-d1-d3-plan-2026-07-24.md).

## 배경 — 병목 3가지 (2026-08-20 실측)

1. **히스토리 없음**: Meta 지표는 매 요청 라이브 조회(기간 총합만). 일자별 시계열·전주 대비·스냅샷이 전무해 "추이"를 만들 수 없다.
2. **수기 지표 프로덕션 쓰기 차단**: event-metrics·channel-budgets가 로컬 JSON 파일스토어(`assertLocalJsonWriteAllowed`)라 Vercel에서 PATCH가 throw. 요약 탭 CPL·ROI·채널 분포가 프로덕션에서 영구 ₩0/—.
3. **데이터 섬 미연결**: Meta 광고(spend) / leads(UTM·fbclid 완비) / client_events(사이트 행동)가 캠페인 탭에서 서로 이어져 있지 않다. client_events는 /admin/traffic 전용.

추가: 요약 탭의 "인사이트 배너"·"추천 액션"은 하드코딩 규칙(LLM 아님). 반면 `lib/branch/insights/*`에 Gemini 인사이트 파이프라인(digest 캐시→JSON 스키마 강제→숫자 환각 검증→DB 저장→크론)이 이미 가동 중 — 재사용한다.

## 확정 결정

| 질문 | 결정 |
|---|---|
| 범위 | 3페이즈 풀코스 (데이터 스파인 → 대시보드 → AI) |
| AI 기능 | 주간 AI 브리핑 + 이상 감지·해설 + 카피/소재 제안. 자연어 질문은 비범위 |
| 진행상황 | 자동(페이싱·퍼널·트렌드) + 수동(캠페인별 업데이트 로그) 둘 다 |
| 위치 | 기존 요약 탭 재구축 (탭 증식 없음) |

## Phase 1 — 데이터 스파인

### 1a. `meta_insights_daily` (신규 마이그)

```sql
create table meta_insights_daily (
  date date not null,
  campaign_id text not null,
  campaign_name text,
  spend numeric,
  impressions bigint,
  reach bigint,
  clicks bigint,
  ctr numeric,
  cpc numeric,
  cpm numeric,
  leads integer,
  currency text,
  synced_at timestamptz not null default now(),
  primary key (date, campaign_id)
);
```

- RLS admin-only(기존 marketing_campaigns 패턴). 읽기·쓰기 모두 admin 클라이언트.
- **적재 경로**: `lib/meta/marketing.ts`에 일자별 insights fetch 추가 — `{accountId}/insights?level=campaign&time_increment=1&time_range={since,until}` (Graph는 과거 ~37개월 소급 조회 지원).
- **크론**: `/api/cron/sync-meta-insights` 매일 1회 — Meta가 최근 지표를 소급 정정하므로 **trailing 3일 upsert**. vercel.json 크론 +1 (현재 9개, Hobby 제약은 하루 1회 초과만 배포 실패 — 준수).
- **백필**: `scripts/backfill-meta-insights.mjs` — 최근 12개월 1회 실행(로컬, env 필요). 트렌드가 배포 첫날부터 채워짐.

### 1b. `marketing_campaign_updates` (신규 마이그) — 수동 진행상황 로그

```sql
create table marketing_campaign_updates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references marketing_campaigns(id) on delete cascade,
  kind text not null default 'note',        -- note | change | milestone
  body text not null,
  created_by text,
  created_at timestamptz not null default now()
);
```

- CRUD: `/api/admin/marketing-campaigns/[id]/updates` (verifyAdmin). 소비처: 스코어보드 행(최근 1줄), 업데이트 피드, 캠페인 상세 패널(manage) 타임라인.

### 1c. `marketing_insights` (신규 마이그) — AI 브리핑 저장

branch_insights 테이블 패턴 미러: id, scope(text, `weekly`), digest(입력 해시, 중복 방지), headline, payload jsonb(highlights·next_actions·anomalies), model, created_at. stale 폴백 지원.

### 1d. JSON→Supabase 이전 (마이그 2개)

- `event_metrics`: `event_id text primary key, metrics jsonb, updated_at`. `lib/repositories/event-metrics.ts`의 함수명·반환 형태는 유지하되 **sync→async 전환**(Supabase 필연) — 소비처 7곳(전부 서버 라우트·async 컨텍스트)에 await 추가. `assertLocalJsonWriteAllowed` 제거. 현재 data/event-metrics.json은 `{}`라 데이터 백필 불요.
- `channel_budgets`: `channel text primary key, amount bigint not null default 0, updated_at`. `lib/repositories/channel-budgets.ts` 동일 방식. data/channel-budgets.json은 파일 자체가 없어 백필 불요.
- 효과: 요약 탭 수기 지표(행사 광고비·매출·채널 예산)가 프로덕션에서 처음으로 저장 가능.

## Phase 2 — 대시보드 (요약 탭 재구축)

시안 승인됨(2026-08-20, 세션 위젯). 위→아래:

1. **기간 토글** — 공용 `components/admin/PeriodToggle.tsx` 신규 추출(현재 4곳 중복: campaigns page·MetaTab·traffic·AdLeadsPanel — 이번엔 캠페인 허브만 교체, 나머지는 후속). 우측에 마지막 스냅샷 시각.
2. **KPI 스트립 5칸 + 전주 델타** — 광고비(Meta·USD 표기), 리드(전체), CPL(광고 리드 실측 — AdLeadsPanel 정의 재사용), 리드→딜 전환율(기존 정의), 예산 집행률(KRW 채널만). 델타는 meta_insights_daily + leads.created_at 기반.
3. **AI 브리핑 카드** — Phase 3 전까지 기존 규칙 기반 인사이트가 같은 자리 유지. Phase 3에서 marketing_insights 최신 1건 + 이상 배지로 교체.
4. **일자별 추이** — spend+리드 콤보(기존 `ComparisonBarChart`/`TrendAreaChart` 재사용), 소스=meta_insights_daily. **보기 토글 2모드**(2026-08-20 Marketing Hub 시안 대조 채택): [광고비·리드] ↔ [소스 그룹별 유입 스택](leads 테이블 SOURCE_GROUP 7종, perf 응답 `leadDailyBySource`).
5. **캠페인 스코어보드** — D1 우산 캠페인(`marketing_campaigns`) 행: 이름+최근 업데이트 1줄, **페이싱 바**, 리드, CPL, 스파크라인(`Sparkline` 직접 import), 이상 배지.
   - **페이싱 규칙(통화 정직)**: 기간 경과율은 항상 표시. 집행률은 통화 정합 시만 — Meta 미러 캠페인=USD spend vs Meta 예산(기존 campaigns Graph 호출의 필드 목록에 `lifetime_budget,daily_budget` 추가 fetch), KRW 캠페인=KRW 집행 vs KRW budget. 혼합·산정 불가 시 집행률 "—".
   - 스파크라인 = 링크된 Meta 캠페인 일별 리드 합(meta_insights_daily). 링크 없으면 미표시.
6. **통합 퍼널 + 채널 믹스 (2단)** — 퍼널 5단: **노출→클릭→리드(광고)→컨택→전환** (Meta+leads 실데이터·`MiniFunnel` 재사용). 컨택 = 광고 리드 중 status≠신규(누적 해석, `isContactedLead` SSOT — 2026-08-20 시안 대조 채택). '딜' 단계는 리드-딜 조인 신뢰도 확보 전까지 제외(구현 계획과 정합). 채널 믹스: 채널별 spend 분포+CPL(ChannelBudgetTable 데이터, Supabase 전환으로 프로덕션 편집 가능). **채널별 ROAS 미표기 각주 유지.**
7. **업데이트 피드** — marketing_campaign_updates 최근 N건 + 작성 폼(캠페인 선택+종류+본문).

기존 요약 탭의 행사 중심 섹션(EventRoiChart·TimelineRow·GoalProgressPanel·행사 퍼널 비교)은 **행사 탭으로 이동**해 중복 정리. ChannelHubCards·MetaLiveSummary는 KPI 스트립에 흡수.

데이터 API: **`/api/admin/marketing/perf` 신규 단일 집계 엔드포인트** — KPI(델타 포함)·일자별 시계열·스코어보드(페이싱·스파크라인·이상 배지)를 한 응답으로 조립(대시보드 1-fetch). 업데이트 피드·채널 예산은 기존/1b API 별도. 서버 메모 캐시는 기존 45초 패턴 준수.

## Phase 3 — AI 레이어 (전부 Gemini, 신규 SDK 없음)

### 3a. 주간 AI 브리핑 — `lib/marketing/insights/`

`lib/branch/insights/*` 구조 미러: input-builder(digest) → prompt(JSON responseSchema 강제) → gemini-runner(quality/fast) → **sanity check(숫자 환각 검증 — 입력에 없는 숫자 발화 시 재시도 1회, 실패 시 미표시)** → repository 저장(stale 폴백).

- **입력**: KPI 4주 추이(주간 집계), 스코어보드 요약(캠페인별 상태·페이싱·CPL·리드), 이상 감지 결과 목록, 최근 수동 업데이트 로그(팀 활동 맥락).
- **출력 스키마**: `{ headline, highlights[], next_actions[{title, why}] }` (액션 최대 3).
- **크론**: `/api/cron/sync-marketing-insights` 주 1회(월 아침). digest 동일하면 재호출 없음. `?force=1` 수동 재생성 지원.
- **표시**: 대시보드 AI 브리핑 카드. 검증 실패·미생성 시 규칙 기반 폴백 유지(빈 카드 금지).

### 3b. 이상 감지 + 해설 — `lib/marketing/anomaly.ts`

감지는 **순수 함수 규칙**(테스트 대상), LLM은 브리핑 입력으로 받아 해설·우선순위만 부여.

| 규칙 | 기본 임계값 |
|---|---|
| CPL 급등 | 캠페인 7일 CPL > 30일 CPL × 1.5 (리드 최소 표본 5) |
| CTR 급락 | 7일 CTR < 30일 CTR × 0.6 |
| 페이싱 초과 | 집행률 − 기간 경과율 > 10%p (통화 정합 시만) |
| 리드 급감 | 최근 7일 리드 < 직전 7일 × 0.6 |

배지 표시: 스코어보드 행 + AI 브리핑 카드 하단 칩. 임계값은 상수 모듈로 분리.

### 3c. 카피/소재 제안 — 온디맨드 (크론 아님)

- 라우트: `/api/admin/marketing/creative-suggest` (POST, verifyAdmin, 온디맨드 버튼 — 광고 탭 AdLeadsPanel 인근).
- **입력**: `getMetaAdInfo`(lib/crm/lead-attribution.ts)로 leads의 utm_campaign/adset/ad를 파싱해 **광고명별 리드 수·전환 수 집계** + META_INTENT_RULES 참고. Graph ad-level insights는 미수집이므로 **광고별 spend/CPL은 없음 — 리드 볼륨·질 기준 랭킹임을 UI에 명시**(정직).
- **출력**: 상위/하위 소재 패턴 분석 + 다음 카피 제안 N개(JSON 스키마). 기존 이메일 개인화 AI(`/api/admin/marketing/ai`)와 별개 유지.

## 정직 규칙 (전부 계승, 위반 금지)

- 채널·통화 가로지르는 **종합 ROAS/ROI 미표기** — 타입에 필드 자체를 만들지 않는다.
- Meta 집행은 **통화 네이티브(USD)**, KRW 폴딩 금지. KPI·페이싱·믹스 전부 통화 분리 표기.
- 행사 매출 **null ≠ 0** (미입력은 —).
- 채널별 ROI 미표기(매출 채널 귀속 불가), 행사 리드 롤업 v1 미집계 유지.
- AI 브리핑은 sanity check 통과분만 표시. 입력에 없는 숫자 발화 금지.

## 비범위

자연어 질문 AI · D4 대량발송/클릭추적 · D5 비-Meta 광고 API · GA4 Data API 읽기 · Meta adset/ad 레벨 insights 수집 · PeriodToggle 전면 교체(캠페인 허브 외 3곳은 후속).

## 백로그 — 실측 수익 렌즈 (2026-08-20 Marketing Hub 시안 대조에서 채택)

레퍼런스 시안(claude.ai/design "마케팅 리드 관리 UI/UX" — Marketing Hub.dc.html)의 "전환·심화지표" 화면 아이디어를 재구성해 등록: 전환 리드별 계약 금액 → 캠페인별 **실측 ROAS/CAC**(구독은 연 환산). 정직 규칙과 양립(귀속 불가 추정이 아니라 입력/실측 기반). 단 **시안의 수기 금액 입력 테이블은 금지** — 계약 금액 정본은 rev-sheet 장부·딜에 있으므로, converted 리드가 bulk-convert 로 만든 **딜 금액의 캠페인별 롤업**으로 구현한다. 선행 조건: 리드→딜 조인 신뢰도 확보(퍼널 딜 단계를 뺀 그 이유). Phase 3 완료 후 별도 라운드.

같은 대조에서 **불채택 확정**: ROAS 전면 표기(추정 ROAS — 정직 규칙 위반)·Google Ads 분석 탭(API 연동 없음, D5 보류)·리드 관리 화면(기존 CRM 리드 보드와 중복 — 정본 분열 금지)·팀 자동 배정 규칙(별도 기획 감)·시각 언어(블루/파스텔/Pretendard — 그린 에디토리얼 취향·DESIGN.md 게이트와 충돌, IA만 참고).

## 리스크·전제

- Meta 소급 정정: trailing 3일 재적재로 흡수. 그 이전 확정치와 라이브 조회가 미세하게 다를 수 있음 — 대시보드는 스냅샷 기준임을 각주.
- Vercel Hobby 크론: 신규 2개(일간 sync + 주간 insights) 모두 하루 1회 이하 — 제약 준수.
- 마이그 적용 경로: supabase CLI 부재 — 대시보드 SQL Editor 수동 적용(기존 절차). 마이그 파일은 필수 작성.
- 미적용 상태 그레이스풀 강등: 테이블 부재 시 빈 상태 + 안내(기존 D1 패턴).
- home_v3 워크트리에 타 세션 WIP 상존 — 커밋은 파일 스코프 지정(`git add -A` 금지).
