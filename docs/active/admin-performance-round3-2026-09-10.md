# Admin 속도 3라운드 — 조회 경로에서 재계산 제거(stale-first) — 2026-09-10

기준 시점: 2026-09-10
대상: `/admin` 탭의 조회 경로 전체 — 외부 원천 미러, 서버 Data Cache, DB 스냅샷 RPC, 클라이언트 SWR
목표: [2라운드(2026-09-04)](./admin-performance-round2-2026-09-04.md)가 탭 전환 RSC 왕복과 모듈 메모를 정리한 뒤, 남은 마지막 동기 재계산 층(DB 스냅샷)을 걷어내고 승격에서 빠진 엔드포인트를 같은 규약으로 맞춘다.
관련: [1라운드](./admin-performance-plan-2026-09-02.md), [2라운드](./admin-performance-round2-2026-09-04.md), [공용 Supabase DB 통폐합 분석](./supabase-shared-db-consolidation-analysis-2026-09-02.md), [플랫폼 & 데이터 파트 가이드](./playbook/06-platform-data.md), [마케팅/그로스/CRM 파트 가이드](./playbook/04-growth-crm.md)

---

## 0. 이 라운드의 한 문장

> **조회는 재계산을 기다리지 않는다. 재계산은 항상 쓰기·크론·백그라운드가 소유한다.**

캐시가 이미 5층인데(§1) 가장 아래 한 층(DB 스냅샷 RPC)만 여전히 조회가 재계산을 동기로 문다. 위 네 층이 미스나는 순간 그 비용이 그대로 사용자에게 노출된다. 3라운드는 그 층을 마저 뒤집고, 2라운드에서 승격되지 않은 엔드포인트를 같은 규약으로 맞춘다.

## 1. 현재 서버 구조 (2026-09-10, 코드로 확인)

| 층 | 무엇 | 정본 | 상태 |
|---|---|---|---|
| ① 외부 원천 | 매출원장 시트, Xiaoshouyi(NeoCRM), 채널톡, Meta Graph, 노션, 쇼룸 ICS | — | 조회 경로에서 직접 부르는 곳이 거의 없다(§2) |
| ② 자체 DB 미러 | `external_crm_records`, `branch_rev_deals`, `branch_dsh/kpi_mirror`, `channel_conversations`, `meta_insights_daily` | `lib/repositories/*` | cron 11종, 전부 하루 1회 이하(`vercel.json`) |
| ③ 서버 Data Cache | `unstable_cache` 51개 파일, 캐시 태그 29종 | `lib/admin/crm/cache-tags.ts` 외 | 2라운드에서 모듈 메모 → Data Cache 승격 |
| ④ 클라이언트 SWR | memory 90 / sessionStorage 70 / localStorage 60, TTL 45초 + stale 5분, 배포 토큰 shape guard | `lib/admin-client.ts` | 동작 중 |
| ⑤ 라우터 캐시 | `staleTimes.dynamic = 180` + 사이드바 hover FULL 프리페치 | `next.config.ts:160`, `components/admin/AdminSidebar.tsx` | 7탭 중 6탭 재방문 RSC 왕복 0(2라운드 §4.1) |

조회가 동기화를 유발하지 않는 것은 코드로 확인했다. `runAll()`은 `POST /api/admin/branch/sync`와 `/api/cron/sync-branch`에만, Xiaoshouyi 동기화는 `POST /api/admin/crm/external-sync`에만 있다.

## 2. "조회가 길어지니 자체 DB에 넣자" — 원천별 준수 여부

| 원천 | 미러 | 조회 경로가 미러를 보는가 | 판정 |
|---|---|---|---|
| Xiaoshouyi / NeoCRM | `external_crm_records` + 집계 뷰 `external_crm_object_snapshot` | 전부 미러. 요청 시 외부 API 호출 0건(`getXiaoshouyiSyncPreflight`는 env 확인만) | 지켜짐 |
| 매출원장 시트(DSH/KPI/REV) | 3단 사다리: 액티브 임포트 → 시트 미러 → 라이브 | `lib/branch/read-dsh-kpi.ts`, `lib/branch/read-rev-deals.ts`. 라이브는 미러가 한 번도 채워지지 않은 초기 상태에서만 | 지켜짐(가장 좋은 사례) |
| 채널톡 | `channel_conversations`(cron 00:15 UTC) | 미러 읽기 | 지켜짐 |
| Meta 광고 | `meta_insights_daily`(cron 20:50 UTC) 존재 | `marketing/perf`만 미러를 읽는다. **`meta/campaigns`·`meta/instagram`은 Graph API 직접 호출**(45초 / 300초 Data Cache) | 절반만 |
| 노션 마케팅 캘린더 · 쇼룸 ICS · 공휴일 | 미러 테이블 없음 | `lib/admin-calendar/source-cache.ts`의 메모리 + Data Cache 이중 SWR | **의도된 설계**(§5) |
| Compass(`crm` 스키마) | 미러 아님 — 같은 Supabase의 브리지 뷰 7장 | `lib/compass/bridge.ts` | 지켜짐(이중 미러 금지가 원칙) |
| Drive 시트 신선도 | 없음 | `lib/branch/summary-payload.ts:218` — KR Team 조회 경로에서 Drive API(60초 Data Cache) | 남은 1건 |

무거운 3대 원천(NeoCRM·매출시트·채널톡)에서는 결정이 지켜졌다. 남은 위반은 Meta Graph 직접 조회 2개(Overview 첫 방문 2,435ms, 2라운드 §1.2)와 Drive 신선도 1건이다.

## 3. "매번 동기화 말고 동기화 전 버전을 먼저" — 어디까지 되어 있나

이미 되어 있는 것(코드 확인):

- **지사 데이터 사다리.** `read-dsh-kpi.ts` 주석 그대로 — 첫 동기화 이후에는 시트 접근이 끊겨도 마지막 스냅샷으로 계속 응답한다. 신선도 간극은 SyncStatusBar의 시트-신선도 경고가 표면화한다.
- **서버 Data Cache.** Next 16 `unstable_cache`는 만료 엔트리를 즉시 반환하고 백그라운드로 재검증한다. 단 플랫폼이 `waitUntil`을 줄 때만 성립한다(Vercel Fluid는 준다, `next dev`는 주지 않는다 — 2라운드 §4.3).
- **클라이언트 SWR.** TTL 45초가 지나도 5분 안이면 즉시 그리고 뒤에서 갱신한다.
- **캘린더 외부 소스.** 신선/스테일/콜드 3상태 규약 + 소스별 응답 마감.

되어 있지 않은 곳이 이번 라운드의 작업 목록이다.

### 3.1 DB 스냅샷에는 SWR이 없다 (P0)

`admin_crm_business_overview`(`supabase/migrations/20260613_admin_crm_overview_snapshot.sql:504`)는 스냅샷 테이블 + dirty 로그 설계인데, **dirty가 찍혀 있거나 `p_max_age_seconds`(앱은 300초)를 넘으면 조회가 재계산을 동기로 기다린다.** 저장된 payload를 그냥 돌려주는 경로는 "다른 트랜잭션이 advisory lock을 쥐고 있을 때"(`:537`)뿐이다.

dirty 트리거는 `partner_accounts`, `customers`, `deals`, `quotes`, `contracts`, `receipts`, `activity_logs`, `quote_documents`, `contract_documents`, `payments_v2`, `receipts_v2`, `calendar_events` 12개 테이블에 STATEMENT 단위로 걸려 있다(`:65-98`). 즉 쓰기가 한 번이라도 있으면 다음 조회가 재계산을 문다. 2라운드가 측정한 366콜 평균 969ms · 콜당 1,748블록이 여기서 나온다.

### 3.2 모듈 메모로 남은 것 (P1)

| 대상 | 왜 문제인가 |
|---|---|
| `lib/admin-crm-customers-neo.ts:133`(60초) | 개요·통합고객·os-summary 3화면이 공유하는 하위 소스. 하루 수십 방문이라 Fluid 인스턴스는 거의 항상 콜드 = 사실상 매번 재계산. 2라운드 §4.6이 후속으로 남긴 항목 |
| `app/api/admin/marketing/intake-today/route.ts` | 2라운드 실측에서 캠페인 탭 재방문 1.8초 |
| `app/api/admin/marketing/weekly-report/route.ts` | 같은 패턴 |
| `app/api/admin/messaging/status/route.ts` | 같은 패턴 |

### 3.3 서버 캐시가 아예 없는 GET 라우트 (P1)

import 2단계까지 추적했을 때 `unstable_cache`·`shareInFlight`가 어디에도 닿지 않는 GET 라우트가 138개 중 59개다. 그중 실제 탭 조회 경로에 있는 것만 추리면:

`crm/tasks`(2라운드 실측 3.3초) · `hardware/samples`(1.1초) · `notifications`(콜드 1,207ms) · `crm/customers-neo` · `crm/region-map` · `crm/account-master` · `cs-chat/metrics` · `showroom-bookings` · `receipts` · `docs`

나머지 49개는 편집 화면·설정·단건 조회라 이번 스코프 밖이다.

### 3.4 캐시 태그 무효화 공백 (P1, TTL 상향의 전제 조건)

정의됐지만 무효화하는 곳이 한 군데도 없는 태그 3종: `ADMIN_CRM_READINESS_CACHE_TAG`, `ADMIN_CRM_REVENUE_SHEET_CACHE_TAG`, `ADMIN_HOMEPAGE_FLOW_CACHE_TAG`. 여기에 2라운드 §4.6이 남긴 누락 2건이 그대로다 — `public_events` 쓰기가 캘린더 이벤트 태그를 무효화하지 않고, `campaign-updates`·`event-metrics` 쓰기가 마케팅 perf 태그를 무효화하지 않는다(각 ≤60초 지연).

**이것이 TTL을 못 올리는 이유다.** 하루 수십 방문에 TTL 60~120초는 대부분 stale 적중이라 이득이 없지만, 무효화 배선 없이 TTL만 5~10분으로 올리면 "저장했는데 화면이 안 바뀐다"가 된다. 순서를 지켜야 한다.

### 3.5 클라이언트 지속 캐시 스코프가 2개뿐 (P2)

`LOCAL_PERSIST_SCOPES = ["/api/admin/crm", "/api/admin/leads"]`(`lib/admin-client.ts:44`). 지사·마케팅·하드웨어·캘린더는 sessionStorage까지만이라 브라우저를 다시 켜면 "이전 버전"이 없다.

## 4. 실행 계획

### Phase 0 — 프로덕션 베이스라인 (운영자, 생략 불가)

2라운드 수치는 전부 dev다. dev에는 `waitUntil`이 없어 Data Cache의 stale 응답이 재검증을 기다린다(2라운드 §4.3) — **베이스라인 없이 착수하면 3라운드의 효과를 증명할 수 없다.**

```bash
ADMIN_BASE_URL=https://<도메인> ADMIN_COOKIE='<cookie>' npm run measure:admin -- --runs=5
```

콜드 열이 이미 웜 열에 가까우면 Phase 2~4의 우선순위가 내려가고, 여전히 벌어져 있으면 계획대로 간다. **측정은 한 번에 한 패스, 병렬 금지** — Compass가 같은 DB를 쓰고 2026-09-04에 REST 504가 113건 터졌다(2라운드 §4.4).

### Phase 1 — DB 스냅샷을 stale-first로 (P0) — **구현 완료 (2026-09-10, hom_v4)**

구현물:
- `supabase/migrations/20260910_admin_crm_overview_stale_first.sql` — **작성만, 미적용.**
  기존 2인자 함수를 DROP 하고 `p_hard_max_age_seconds`(기본 3600)를 더한 3인자로 재생성한다.
  오버로드를 만들지 않은 이유는 PostgREST 가 인자 이름으로 후보를 고르기 때문이다(같은 이름
  함수가 둘이면 양쪽 다 PGRST203 으로 죽는다 — `feedback_postgrest_overload_ambiguity` 사고).
- `lib/admin-crm-overview.ts` — 하드 안전핀 전달, stale 응답 시 `after()` 로 강제 갱신 예약
  (`scheduleAdminCrmOverviewRefresh`, 60초 쿨다운), 그리고 **마이그레이션 미적용 DB 를 위한
  2인자 재시도**. 이 재시도가 없으면 배포~적용 사이에 개요가 매번 live 쿼리로 떨어져 오히려
  느려진다.
- `tests/admin-crm/overview-stale-first.test.ts` — 위 계약 9건 고정.

운영자 조치: `supabase/migrations/20260910_admin_crm_overview_stale_first.sql` 적용 + `npm run check:db`.

바꾼 계약:

1. 스냅샷 행이 존재하면 **항상 즉시 반환**하고, 신선도는 `stale` 플래그와 `refreshedAt`으로 사실만 표기한다.
2. 동기 재계산은 두 경우로 한정한다 — 스냅샷이 한 번도 만들어진 적 없을 때, 그리고 새 파라미터 `p_hard_max_age_seconds`(예: 3600초)를 넘겼을 때. 무한 stale을 막는 안전핀이다.
3. 갱신은 앱이 소유한다. 응답을 보낸 뒤 `after()`로 `p_force=true`를 호출한다.

**`vercel.json`에 크론을 추가하지 않는다.** 하루 1회 이하 제한(Hobby 기준, `AGENTS.md`)에 걸리고, `after()` 백그라운드 갱신이면 그 제약을 건드리지 않는다. 화면은 이미 `refreshedAt`을 받고 있으므로 "N분 전 기준" 표기로 정직성을 유지한다.

- 소유: 플랫폼 & 데이터(마이그레이션) + 마케팅/그로스/CRM(`lib/admin-crm-overview.ts` 소비부)
- 검증: `supabase/migrations/YYYYMMDD_*.sql` 1장, `npm run check:db`, 관련 vitest
- 실패 모드: 스냅샷 인프라 부재는 이미 `isMissingSnapshotInfraError`로 폴백 경로가 있다 — 그 경로를 깨지 않는다

### Phase 2 — 남은 모듈 메모 승격 (P1) — 일부 진행

2026-09-10 병렬 라운드에서 Overview·CRM 코어 에이전트가 인접 작업을 했다. 남은 항목은 아래 표
그대로이며, `admin-crm-customers-neo`(3화면 공유)가 여전히 1순위다.


§3.2의 4건. 우선순위는 `admin-crm-customers-neo`가 먼저다(3화면 공유).

**승격 1건 = 네 가지가 한 세트다.** 2라운드가 이 중 둘을 빠뜨려 사고가 났다.

1. 캐시 태그 정의
2. 쓰기 경로에 `revalidateTag(태그, "max")` 짝짓기
3. `shareInFlight`로 인스턴스 내 동시 계산 합치기 — 2라운드에서 이걸 빠뜨려 `customers/unified`와 `health-distribution`이 콜드에 두 번 돌았다
4. `assertJsonSafeInDev` 배선 — Data Cache는 JSON이다. Map/Set/Date/클래스 인스턴스를 넣으면 캐시 적중 뒤 500이 난다(우선순위 큐 사고, `aa0323e`)

### Phase 3 — 미승격 조회 엔드포인트 승격 (P1)

§3.3의 10건을 실측 순서대로. Phase 2와 같은 4종 세트 규약을 그대로 적용한다.

### Phase 4 — 무효화 먼저, TTL 상향은 그다음 (P1)

1. 무효화 공백 3종 배선(§3.4)
2. 누락 배선 2건: `public_events` 쓰기 → 캘린더 태그, `campaign-updates`·`event-metrics` 쓰기 → 마케팅 perf 태그
3. **그 다음에만** 태그 무효화가 있는 엔트리부터 TTL 60~120초 → 5~10분

순서를 거꾸로 하면 신선도 사고다.

### Phase 5 — 조사만 (이번 라운드에서 구현하지 않음)

- **Meta Graph 직접 조회 2개(`meta/campaigns`·`meta/instagram`)를 `meta_insights_daily` 미러로.** 효과는 크지만(Overview 2,435ms) 캠페인 레벨과 광고 레벨을 한 테이블로 합치는 것은 이중 계상이라 금지돼 있고(통폐합 분석 §4.4-3), 팔로워 성장처럼 미러에 없는 필드가 있다. 필드 매핑 조사부터 하고 전환은 다음 라운드로.
- **Overview 재방문 RSC 1건 잔존**의 라우터 캐시 키 원인(2라운드 §4.4 후속).
- **화면당 fan-out.** `app/admin/overview/OverviewClient.tsx`가 15개 엔드포인트, 사이드바가 60개 URL을 예열한다. 한 화면 20~30 동시 쿼리가 09-04 504 폭주의 조건이었다.

## 5. 스코프에서 제외하는 것과 근거

- **노션·쇼룸 피드의 미러 테이블 신설.** 플레이북 공통 철칙이 "Notion이 원천인 마케팅 캘린더 이벤트는 Supabase에 미러링하거나 양방향 쓰기하지 않는다"고 명시한다(`docs/active/playbook/README.md`). `lib/admin-calendar/source-cache.ts`의 이중 SWR이 의도된 답이며, 그 신선도 지연은 파일 주석에 트레이드오프로 이미 기록돼 있다.
- **`vercel.json`에 sub-daily 크론 추가.** `AGENTS.md`의 배포/Cron 안전 규칙 위반. 필요하면 외부 스케줄러·큐·Pro 전환을 먼저 확정한다.
- **`crm/overview` 스코프 분리(`?scope=home`).** 2라운드가 보류로 판정했고, 콜드 비용의 대부분이 RPC 한 문장이라 스코프를 나눠도 남는다. Phase 1이 원인을 없앤다.
- **클라이언트 번들·하이드레이션.** 재방문 138~295ms가 그 하한이고, 이번 라운드의 대상은 서버 왕복이다.

## 6. 작업 방식

2라운드에서 검증된 방식을 그대로 쓴다.

- 워크트리 격리 서브에이전트 병렬 + TDD(실패 테스트 → 구현) + 오케스트레이터 diff 검토 후 병합
- **디스패치 직후 워크트리 베이스가 작업 브랜치 tip인지 `git log -1`로 확인한다** — 과거 `origin/main` 베이스 사고 재발 방지
- Phase 1~4는 파일이 거의 겹치지 않아 병렬 가능하다
- 게이트는 병합 후 한 번, 순서대로:

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build          # check:vercel-crons · check:design-tokens · check:public-content 포함
npx vitest run --dir tests
```

Phase 1이 DB 계약을 건드리므로 `npm run check:db`를 함께 돌린다.

## 7. 병행 라운드와의 관계 (2026-09-10 추가)

이 계획은 같은 날 진행된 "어드민 전면 개편"(사이드바 전면 공개 + 5영역 병렬 속도 작업)과
겹친다. 그 라운드에서 이미 끝난 것과 이 문서가 계속 소유하는 것을 갈라 둔다.

| 이 문서의 항목 | 상태 |
|---|---|
| Phase 1 DB 스냅샷 stale-first | **완료**(위 §4 Phase 1) |
| Phase 2 모듈 메모 승격 4건 | **완료** — admin-crm-customers-neo · marketing/intake-today · weekly-report · messaging/status |
| Phase 3 무캐시 조회 라우트 | **완료 10건** — crm/tasks·region-map·account-master·customers-neo · notifications · hardware/samples · cs-chat/metrics · showroom-bookings · receipts · docs |
| Phase 4 무효화 공백 | **부분 완료** — public_events→캘린더, campaign-updates·event-metrics→마케팅 perf 배선. readiness·homepage-flow 는 앱 내부 쓰기 경로가 없음을 확인하고 코드에 기록(가짜 배선 대신) |
| Phase 4 TTL 상향 | **1건만** — crm/tasks 60초→5분(무효화가 두 지점 모두 덮인 유일한 케이스). 나머지는 보류 |
| §3.5 클라이언트 지속 캐시 | **부분** — 고정 키 4개만 승격(hardware · calendar:source-health · messaging/status · marketing-intake-today). 지사는 team×period 카디널리티 때문에 보류 |
| §3.3 `crm/customers-neo` 무캐시·전량 | 응답 필드 19→11 + `scope`/`limit`/`offset` 도입으로 완화 |
| §5 Phase 5 Meta Graph 직접 조회 | Overview 쪽은 `requestIdleCallback` 지연으로 첫 화면에서 분리. 미러 전환은 여전히 조사 단계 |
| §5 Phase 5 Overview 재방문 RSC 1건 | 미해결 — 원인 미확인 그대로 |
| §5 Phase 5 화면당 fan-out | Overview 14 → 7~8(서버 프리페치 6소스 편입 + Instagram 지연) |
| §3.2 모듈 메모 4건 | 미완 — `admin-crm-customers-neo` 우선 |
| §3.4 무효화 공백 3종 | 미완 |
| §3.5 클라이언트 지속 캐시 스코프 2개 | 미완 |

### 스트리밍 전환 — 완료 (2026-09-10 2차 웨이브)

`openPrefetchLane`(즉시 반환 + Suspense 스트리밍)을 5개 page.tsx 전부에 적용했다. 이제
저장소 어디에서도 `settleWithinBudget` 를 호출하지 않는다(주석에만 이력으로 남음).

| 페이지 | 소스별 Suspense 경계 |
|---|---|
| `/admin/overview` | 8 |
| `/admin/crm` | 6 (+ 우선순위 큐 2) |
| `/admin/branch` · `/admin/branch/ledger` · `/admin/hardware` | 각 1(하위 소스가 없음) |

**실측(dev 3903, warm, curl 5회 중앙값)**: 첫 바이트가 전 페이지 25~42ms 로 떨어졌다.
전환 전에는 콜드·재검증 창에서 1,217~1,291ms 에 고정돼 있었다. 장부가 가장 선명한 증거다 —
첫 바이트 26ms / 전체 완료 898ms 로, 느린 소스가 응답 **앞**에서 **뒤**로 옮겨졌다.

**측정 주의**: `scripts/measure-admin-api.mjs` 는 `res.arrayBuffer()` 까지 기다리므로
**전체 완료 시간**을 잰다. 스트리밍 효과는 그 도구로 보이지 않는다 —
`curl -w '%{time_starttransfer}'` 로 첫 바이트를 따로 재야 한다.

부수 효과로 CRM 홈의 `OVERVIEW_PREFETCH_BUDGET_MS=700`(같은 문제의 임시 완화책)이
불필요해져 제거됐다. 계약 파일이 `server-only` 라 5개 클라이언트 컴포넌트가
`{promise, generatedAt}` 모양을 각자 다시 선언한다 — 구조적 호환이라 페이지 경계에서
타입 검사가 어긋남을 잡는다.

## 8. 완료 판정

1. `measure:admin`의 콜드 열이 웜 열에 근접한다(Phase 0 베이스라인 대비).
2. `pg_stat_statements` 상위에서 `admin_crm_business_overview`가 사라지거나 콜당 블록이 크게 줄어든다.
3. Vercel Functions 로그에서 §3.3 대상 엔드포인트의 duration이 첫 호출 이후 수십 ms로 떨어진다.
4. 쓰기 직후 화면 반영이 지연되지 않는다(Phase 4 무효화 배선의 회귀 확인).
