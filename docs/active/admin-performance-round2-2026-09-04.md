# Admin 속도 2라운드 — 탭 전환 왕복 제거와 콜드 인스턴스 캐시 — 2026-09-04

기준 시점: 2026-09-04
대상: `/admin` 탭 전환(사이드바 클릭 → 화면 정착)과 그 뒤에서 도는 `/api/admin/*` 콜드 경로
목표: [1라운드(2026-09-02)](./admin-performance-plan-2026-09-02.md)가 인증 왕복·예열 정합·DB 1위 문장을 정리한 뒤, 같은 방법으로 다시 재서 탭 전환 체감을 30% 이상 더 줄인다.
관련: [1라운드 계획·§8 실측](./admin-performance-plan-2026-09-02.md), [CRM 로딩 지속·초기 속도(2026-08-28)](./crm-load-and-region-map-plan-2026-08-28.md)

---

## 0. 이번 라운드가 전제로 삼은 프로덕션 사실

| 사실 | 실측 | 의미 |
|---|---|---|
| 어드민 트래픽 | Supabase edge 로그 최근 24시간: `admin_profiles` GET 27건, `leads` GET 27건, JWKS 24건(2026-09-04 05:48 UTC 기준). `/auth/v1/user`는 상위 40개 경로에 없음(1라운드 전 1,555건/일) | 1라운드 인증 최적화가 프로덕션에서 실현됐다. 그리고 **하루 수십 요청**이라 Vercel Fluid 인스턴스는 거의 항상 콜드다 — 60~120초 **인스턴스 메모(모듈 변수)는 실제 방문의 대부분에서 비어 있다** |
| DB 시간 분포 | `pg_stat_statements` 상위 45문에 `external_crm_records`·`docs_articles` 문장 없음. 상위는 PostgREST `set_config`·Compass `crm.*`·백업 문장 | 1라운드 §8.4가 DB 1위 그룹을 실제로 지웠다. 남은 어드민 DB 비용은 `admin_crm_business_overview` RPC(366콜, 평균 969ms, 콜당 1,748블록)뿐이다 |
| 라우터 | `app/admin/layout.tsx`가 `force-dynamic`이라 어드민 63페이지 전부가 동적. Next 16 클라이언트 라우터 캐시의 `staleTimes.dynamic` 기본값 0 | **탭을 누를 때마다** 서버에 RSC 페이로드를 다시 요청하고, 도착할 때까지 `loading.tsx` 스켈레톤이 뜬다. 서버 프리페치가 있는 8페이지(Overview·CRM 홈·KR Team·장부·하드웨어·매칭·캡처·딜 KPI)는 그 왕복에 1.2초 예산의 집계가 붙는다 |

즉 남은 비용은 두 층이다. (1) 탭 전환마다 반복되는 RSC 왕복, (2) 콜드 인스턴스에서 모듈 메모가 비어 매번 다시 도는 무거운 집계.

## 1. 베이스라인 (2026-09-04, 로컬 dev 3903, 인증 우회·프로덕션 Supabase)

프로덕션 모드 로컬 측정은 인증 우회가 `NODE_ENV=development`에서만 열리도록 설계돼 있어(`lib/admin-env.ts`) 불가능하다. 우회 조건을 넓히는 패치는 만들지 않았다. 따라서 아래 수치는 dev 서버 값이고 절대값은 프로덕션과 다르지만, 같은 방법으로 전후를 비교하는 데는 충분하다. 프로덕션 실측은 §5의 절차로 운영자가 한다.

### 1.1 API (`npm run measure:admin -- --runs=5`, 콜드 = TTL 만료 뒤 첫 호출, 라우트는 컴파일 완료 상태)

| 엔드포인트 | 콜드(ms) | p50(ms) | p95(ms) | 서버 캐시 |
|---|---:|---:|---:|---|
| `/api/admin/crm/overview` | 1,078 | 5 | 11 | 모듈 메모 120초 |
| `/api/admin/crm/customers/unified?limit=50&offset=0` | 844 | 7 | 12 | 모듈 메모 60초 |
| `/api/admin/crm/revenue?months=6` | 957 | 1,100 | 9,118 | unstable_cache라고 돼 있는데 웜이 느림(원인 조사 대상) |
| `/api/admin/os-summary` | 2,490 | 385 | 486 | unstable_cache 60초 |
| `/api/admin/notifications?countOnly=1` | 1,207 | 377 | 1,410 | 없음 |
| `/api/admin/calendar?year=2026&month=9` | 296 | 262 | 267 | 없음(외부 소스만 SWR) |
| `/api/admin/crm/revenue-sheet` | 421 | 226 | 243 | unstable_cache 60초 |
| `/api/admin/leads?scope=overview` | 297 | 6 | 8 | unstable_cache 30초 |
| `/admin/crm` 문서(RSC 프리페치 포함) | 1,838 | 44 | 47 | — |

### 1.2 탭 전환 (브라우저, 사이드바 링크 click → 마지막 DOM 변경까지, 600ms 정적 판정)

| 탭 | 첫 방문(ms) | 재방문(ms) | RSC 왕복 첫/재(ms) | 첫 방문에서 가장 느린 API |
|---|---:|---:|---|---|
| CRM 홈 | 1,333 | 668 | 1,246 / 607 | (RSC 프리페치가 지배) |
| 캠페인 | 4,466 | 1,908 | 200 / 30 | `marketing/insights` 3,253 · `marketing/perf` 3,043 → 재방문에도 `perf` 1,474 |
| 캘린더 | 1,009 | 138 | 31 / 29 | `calendar/health` 875 · 범위 조회 329·260 |
| KR Team | 3,738 | 295 | 41 / 37 | `branch/pipeline` 3,547 · `branch/kpi` 3,520 · `branch/hw` 3,360 |
| 하드웨어 | 286 | 186 | 41 / 40 | `hardware/samples` 124 |
| CS 콘솔 | 512 | 73 | 32 / 35 | `chatbot/stats` 431 · `docs/gaps` 402 |
| Overview | 3,791 | 417 | 1,239 / 325 | 11건 동시 호출, `meta/instagram` 2,435 |

읽는 법: 재방문 열의 CRM 홈 668ms·Overview 417ms는 거의 전부 RSC 왕복이다(클라이언트 캐시는 이미 따뜻하다). 첫 방문 열의 캠페인·KR Team 3~4초는 콜드 집계다 — 프로덕션에서는 인스턴스가 콜드라 이쪽이 "평소" 체감에 가깝다.

## 2. 레버

### A. 탭 전환의 RSC 왕복 제거 (어드민 셸)

- `next.config.ts` `experimental.staleTimes.dynamic = 180`: 180초 안의 재방문은 클라이언트 라우터 캐시에서 즉시 그린다. 서버 왕복 0, 스켈레톤 0.
- 사이드바 hover(180ms 디바운스)·focus·pointerdown에서 `router.prefetch(href, { kind: "full" })`: 동적 페이지를 서버 프리페치까지 포함해 hover 중에 받아 두고, click은 즉시 전환한다. href당 30초 스로틀.
- **신선도 규칙**: 8개 프리페치 함수의 initialData에 `generatedAt`을 싣고, `lib/admin/prefetch-freshness.ts`의 `isPrefetchFresh`(10초)로 판정한다. 라우터 캐시에서 재사용된(오래된) 페이로드는 **즉시 그리되 마운트 시 재검증을 건너뛰지 않는다**. `seedAdminRequestCache`는 `generatedAt`을 savedAt으로 써서 더 최신인 클라이언트 캐시 엔트리를 절대 덮어쓰지 않는다(기존 가드는 `Date.now()`와 비교해 사실상 동작하지 않았다).
- 뮤테이션 후 신선도는 지금처럼 `lib/admin-client.ts`의 SWR 캐시(`mutationScopeAt`)가 소유한다. 라우터 캐시는 첫 페인트만 담당한다.
- 전역 설정이므로 공개 사이트의 동적 페이지(`/login`·`/account`·`/premium`·공유 링크 등)도 180초 재사용 대상이 된다. 로그아웃 경로가 `router.refresh()` 또는 하드 이동을 하는지 감사해 캐시된 인증 페이지가 로그아웃 뒤 클라이언트 이동으로 보이지 않게 한다.

### B. 콜드 인스턴스에서 비는 모듈 메모 → 공유 Data Cache

`unstable_cache`(Vercel Data Cache)는 인스턴스 간 공유되고 콜드 스타트를 넘어 살아남으며, Next 16에서는 만료 엔트리를 즉시 돌려주고 백그라운드로 재검증한다(stale-while-revalidate, `node_modules/next/dist/server/web/spec-extension/unstable-cache.js` 확인). TTL은 지금 값을 그대로 두고 저장 위치만 옮긴다. `force`/`fresh` 우회는 "새로 계산 + 태그 하드 만료(`{ expire: 0 }`)"로 보존하고, 오늘 메모를 비우던 쓰기 경로마다 `revalidateTag(태그, "max")`를 짝지운다. 엔트리 크기는 2MB 한도 대비 넉넉히 두고(리드 전량 원본 행은 옮기지 않는다), 실패는 캐시하지 않는다.

| 묶음 | 대상 | 근거(콜드) |
|---|---|---|
| B1 CRM | `getAdminCrmOverview`(모듈 메모 120초, DB 왕복 ~30) · 통합고객/헬스 스냅샷 · 우선순위 큐 스냅샷 · `crm/revenue` 웜 1.1초 원인 · 매칭 인박스 스냅샷 | 1,078 · 844 · 1,100(웜) |
| B2 마케팅·지사·캘린더 | `marketing/perf`(라우트 메모 45초)와 `insights`(별도 메모, 같은 집계를 두 번) → 단일 엔트리 · `branch/pipeline·kpi·hw` 공통 콜드 의존 조사 + 상위 엔트리 · `calendar/health`·범위 조회 · `meta/instagram`(외부 API, 300초) · `compass/ads` | 3,043·3,253 · 3,5xx×3 · 875·329 · 2,435 |
| B3 CS 콘솔 | `chatbot/stats` · `docs/gaps` (서버 캐시 없음) | 431 · 402 |

### 보류(이번 라운드 제외, 재제안 시 근거 필요)

- **CRM 개요 스코프 분리(`?scope=home`)**: 홈이 읽는 필드는 `business`·`externalSnapshots.latestSyncedAt`·`neoCrm`뿐이고 나머지 절반은 매칭 화면의 데이터 점검 패널 전용이다. 그러나 콜드 비용의 대부분은 `admin_crm_business_overview` RPC 한 문장(평균 969ms)이라 스코프를 나눠도 그 문장은 남는다. B1의 Data Cache가 그 대기를 백그라운드로 옮기므로 이번엔 미룬다.
- **RPC `admin_crm_business_overview` 자체**: 스냅샷 함수는 `p_max_age_seconds`(앱은 300초) 안이면 저장된 payload를 돌려주지만, 하루 수십 호출이 300초보다 띄엄띄엄 오므로 사실상 **호출마다 재계산**한다(366콜 평균 969ms, 콜당 1,748블록). B1의 Data Cache가 이 대기를 백그라운드 재검증으로 옮긴다. DB 쪽 max age를 늘리거나 dirty 마커 기반으로만 재계산하게 바꾸는 것은 별도 과제.
- 클라이언트 번들·하이드레이션: 탭 전환 재방문에서 RSC 왕복을 뺀 뒤 남는 것이 이 층이다. 이번 측정에서 재방문 138~295ms(캘린더·KR Team·하드웨어)가 그 하한이다.

## 3. 실행 방식

서브 에이전트 4개를 워크트리 격리로 병렬 실행했다(셸/라우터 = admin-core, CRM = growth-crm, 마케팅·지사·캘린더 = growth-crm, CS 콘솔 = chatbot; 전부 하위 티어 모델). 각자 TDD(실패 테스트 → 구현), `typecheck`·스코프 eslint·관련 vitest를 통과시킨 뒤 워크트리 브랜치에 커밋했고, 오케스트레이터가 diff를 검토해 hom_v4로 가져온 뒤 전체 게이트(typecheck·eslint·build+check:public-content·vitest 전량)를 다시 돌린다. 워크트리 베이스는 디스패치 직후 `git log -1`로 hom_v4 tip인지 확인했다(과거 origin/main 베이스 사고 재발 방지).

## 4. 결과 (2026-09-04 오후, 병합 뒤 같은 dev 서버·같은 방법)

### 4.1 탭 전환 (레버 A + B) — 두 번 쟀다

**2차(깨끗한 조건, 17:2x KST)**: 우선순위 큐 Map 사고(§4.4) 수리 뒤 dev 서버를 재시작하고, curl 한 패스로 라우트를 컴파일·Data Cache를 채운 다음, 하드 로드 → 7탭 첫 방문 → 같은 순서로 재방문.

| 탭 | 첫 방문(ms) 전 → 후 | 재방문(ms) 전 → 후 | 재방문 RSC 요청 전 → 후 | 비고 |
|---|---:|---:|---|---|
| CRM 홈 | 1,333 → 1,371 | 668 → 3,430* | 1 → **0** | 첫 방문 API 2건이 Data Cache 적중(38·34ms). *재방문의 3.4초는 `crm/tasks`(이번 라운드 미승격, 단순 조회) 한 건이 DB 지연으로 3.3초 |
| 캠페인 | 4,466 → 3,752 | 1,908 → 3,965* | 1 → **0** | `marketing/perf` 적중 10ms. *재방문에서 perf 엔트리가 60초를 넘겨 dev 재검증 대기 2.1초 + `intake-today`(20초 메모, 미승격) 1.8초 |
| 캘린더 | 1,009 → **171** | 138 → 124 | 1 → **0** | `calendar/health`·범위 조회 3건 전부 적중(10·9·6ms) |
| KR Team | 3,738 → 4,214* | 295 → **215** | 1 → **0** | *첫 방문 `branch/hw` 엔트리가 만료돼 dev 재검증 3.1초; 재방문은 API 4건 1ms |
| 하드웨어 | 286 → 1,289* | 186 → 229 | 1 → **0** | *`hardware/samples`(미승격) 1.1초 |
| CS 콘솔 | 512 → **68** | 73 → 40 | 1 → **0** | 클라이언트 캐시·Data Cache 적중 |
| Overview | 3,791 → **167** | 417 → 128 | 1 → 1 | 첫 방문 API 2건 적중(12·9ms). 재방문 RSC 1건(511ms)은 화면 정착(128ms) 뒤에 도착 — 그리는 데 쓰이지 않는다 |

읽는 법: (1) 7탭 중 6탭에서 재방문의 서버 왕복이 0이다(라우터 캐시). (2) Data Cache 엔트리가 신선한 첫 방문은 캘린더 1,009→171, CS 콘솔 512→68, Overview 3,791→167처럼 서버 집계 없이 그려진다. (3) 남은 큰 수치는 전부 세 부류다 — 이번에 승격하지 않은 엔드포인트(`crm/tasks`·`hardware/samples`·`marketing/intake-today`), TTL이 지나 dev가 응답 전에 재검증을 기다린 경우(§4.3, 프로덕션은 백그라운드), 그리고 DB 지연 순간(`crm/tasks` 단순 조회 3.3초).

**1차(병합 직후, 16:2x KST)**: Turbopack 재컴파일·DB 504 구간(§4.4)·우선순위 큐 500이 겹쳐 비교 가치가 낮다. 재방문 RSC 0은 그때도 같았다(CRM·캠페인·캘린더·KR Team·하드웨어·CS 6탭). 병합 직후 A만 들어간 상태에서는 CRM 홈 재방문 92ms(RSC 0)·Overview 115ms였다.

### 4.2 API (`measure:admin --runs=5`, 같은 14 엔드포인트)

| 엔드포인트 | 콜드 전 → 후 | p50 전 → 후 | p95 전 → 후 |
|---|---:|---:|---:|
| `crm/overview` | 1,078 → 1,660 | 5 → 293 | 11 → 608 |
| `crm/customers/unified` | 844 → 887 | 7 → 266 | 12 → 354 |
| `crm/revenue?months=6` | 957 → 1,076 | 1,100 → 893 | 9,118 → 1,349 |
| `os-summary` | 2,490 → 974 | 385 → 339 | 486 → 480 |
| `calendar?year&month` | 296 → 261 | 262 → 183 | 267 → 2,017 |
| `notifications?countOnly=1` | 1,207 → 1,328 | 377 → 346 | 1,410 → 410 |
| `/admin/crm` 문서 | 1,838 → 1,263 | 44 → 434 | 47 → 985 |

p50이 오른 세 줄(`crm/overview`·`unified`·`/admin/crm`)은 측정 5회가 전부 "만료된 엔트리"였기 때문이다 — 워밍업 뒤 170초를 기다려 콜드를 만들었는데 TTL(60~120초)이 그보다 짧아 5회 모두 stale이었고, dev는 stale 응답을 재검증이 끝날 때까지 붙잡는다(§4.3). 신선한 엔트리의 적중은 같은 서버에서 6회 연속 호출로 따로 쟀다: `crm/overview` 8·5·3·4·3·3ms. `crm/revenue`의 p95 9,118 → 1,349는 B1이 찾은 캐시 키 파편화(months 인자별 엔트리 10개) 수리 효과다.

### 4.3 dev에서 Data Cache 효과가 안 보이는 이유 — 프로덕션과 다른 한 줄

Next 16 라우트 템플릿(`node_modules/next/dist/esm/build/templates/app-route.js` 216~256행)은 핸들러가 남긴 재검증 promise(`pendingWaitUntil`)를 **플랫폼이 `waitUntil`을 주면 백그라운드로 넘기고 응답을 먼저 보내며**, 없으면(`next dev`·self-host) `sendResponse`가 응답을 끝내기 전에 기다린다. Vercel Fluid는 `waitUntil`을 제공한다. 그래서 같은 코드가 dev에서는 "stale 요청 = 재계산 시간"(실측 `leads?scope=overview` stale 1,068ms / fresh 6ms)이고, 프로덕션에서는 "stale 요청 = 캐시 읽기 수십 ms + 백그라운드 재계산"이다. B 레버의 프로덕션 효과는 §5의 운영자 절차로 확인한다 — 배포 뒤 `measure:admin`의 콜드 열이 웜 열에 근접하면 성립한 것이다.

### 4.4 측정 중 발견한 것

- **Supabase 504 폭주(2026-09-04 16:12~16:17 KST).** 병합 직후 워밍업·`measure:admin`·브라우저 패스가 겹친 5분 동안 REST가 504 113건·500 8건을 냈다(`external_crm_object_snapshot`·`sales_ledger_active_sources`·`compass_leads_v`·`rpc/admin_crm_business_overview`·`branch_rev_deals` 등, `postgres_logs`에는 오류 없음 = DB가 아니라 PostgREST/커넥션 층의 포화). 최근 24시간 다른 시간대에는 5xx가 없다. 어드민 한 화면이 동시에 20~30개 쿼리를 내고(CRM 홈 8요청·Overview 13요청 × 소스 fan-out) Nano 컴퓨트가 그 동시성을 못 받은 것으로, 같은 DB를 Compass 앱이 공유하므로 **측정은 한 번에 한 패스, 병렬 금지**. 프로덕션에서는 Data Cache 적중이 그 동시 쿼리 대부분을 없애므로 폭주 조건 자체가 줄어든다.
- **Overview 재방문의 RSC 1건 잔존.** CRM·캠페인·캘린더·KR Team·하드웨어·CS는 재방문 RSC 0인데 Overview만 매번 다시 받는다(342ms, 화면은 캐시로 먼저 그려져 정착 587ms). 라우터 캐시 키가 왜 갈리는지 미확인 — 후속.
- **신선도 규칙 작동 확인.** 10초보다 오래된 시드로 마운트한 Overview는 즉시 그리고 14개 소스를 재검증했다(전부 클라이언트 SWR 캐시 적중).
- **Data Cache는 JSON이다 — 우선순위 큐 500.** 재시작한 dev 서버의 첫 요청에서 `/api/admin/crm/home/priority-queue`가 500을 냈다: 스냅샷의 `CompassDemoSource.phoneKeysByCompassLeadId`(Map)가 캐시 적중 뒤 `{}`로 돌아와 `.get is not a function`. 서브 에이전트는 "JSON 직렬화 가능"이라고 보고했지만 타입을 끝까지 따라가지 않았고, 단위 테스트는 `unstable_cache`를 통과 함수로 모킹해 왕복을 거치지 않는다. 수리: 캐시 경계에서 Map을 엔트리 배열로 바꾸고 읽는 쪽이 복원(`serializeCompassDemoSource`/`hydrateCompassDemoSource`), 깨진 옛 엔트리를 피하도록 키에 `json-v2`. 재발 방지: `lib/server/json-safe.ts`의 `assertJsonSafeInDev`를 17개 캐시 빌더 전부에 배선(dev·vitest에서 Map/Set/Date/클래스 인스턴스를 경로와 함께 던짐, 프로덕션은 생략). 실데이터로 18개 엔드포인트를 다시 쳐 전부 200 확인. 교훈은 §4.6 후속과 세션 메모리에 남긴다.
- **인스턴스 내 동시 계산.** Data Cache로 옮기면서 옛 모듈 메모의 in-flight 공유가 사라져 `customers/unified`와 `health-distribution`(같은 스냅샷)이 콜드에서 두 번 돌 수 있었다. `lib/server/share-in-flight.ts`로 12개 빌더(CRM 5·마케팅 1·지사 3·캘린더 3)에 복원했다.

### 4.5 게이트

병합 뒤 hom_v4에서 순서대로 실행했다(dev 서버를 내린 뒤). 1차 16:4x KST(510/3,911), 최종 17:4x KST(아래 표).

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npx eslint app components lib --max-warnings=0` | 통과(경고 0) |
| `npm run build` (+`check:vercel-crons`·`check:design-tokens`·`check:public-content`) | 통과, 정적 페이지 448개, 공개 콘텐츠 가시성 검사 통과 |
| `npx vitest run --dir tests` | 512 파일 / 3,919 테스트 통과(라운드 시작 시 498 / 3,858 → 신규 테스트 61건). 우선순위 큐 Map 수리·JSON 가드까지 포함한 최종 트리 기준 |

### 4.6 후속(이번 라운드 밖)

- Overview 재방문 RSC 1건의 원인.
- `lib/admin-crm-customers-neo.ts`의 60초 모듈 메모(개요·통합고객·os-summary가 함께 읽는 하위 소스) — 같은 방식으로 승격.
- `crm/revenue` 조립 안에서 `sales-ledger-imports`의 unstable_cache가 중첩 호출이라 우회된다(Next의 중첩 캐시 규칙, B1 보고) — 상위 캐시가 결과를 잡으므로 당장 문제는 없다.
- `public_events` 쓰기(콘텐츠 파트)가 캘린더 이벤트 태그를 무효화하지 않는다(≤60초 지연). `campaign-updates`·`event-metrics` 쓰기도 마케팅 perf 태그를 무효화하지 않는다(≤60초).
- TTL 상향 검토: 하루 수십 방문이라 60~120초 TTL은 대부분 stale 적중이다. 프로덕션 실측에서 stale 응답이 수십 ms로 확인되면 그대로 두고, 아니면 태그 무효화가 있는 엔트리부터 5~10분으로 올린다.

## 5. 프로덕션 검증 절차 (운영자)

1. 배포 뒤 브라우저 개발자 도구 Network에서 사이드바 탭을 hover → `?_rsc=` 요청이 hover 시점에 뜨고, click 시점에는 새 `_rsc` 요청이 없어야 한다. 180초 안에 같은 탭으로 돌아오면 `_rsc`·`/api/admin/*` 요청 없이 즉시 그려져야 한다(그 뒤 백그라운드 재검증 요청은 있을 수 있다).
2. `ADMIN_BASE_URL=https://<도메인> ADMIN_COOKIE='<cookie>' npm run measure:admin -- --runs=5`로 §1.1 표와 같은 엔드포인트를 잰다. 콜드 열이 웜 열에 가까워졌으면 Data Cache가 적중하는 것이다.
3. Vercel Functions 로그에서 `/api/admin/crm/overview`·`/api/admin/marketing/perf`·`/api/admin/branch/*`의 duration이 첫 호출 이후 수십 ms로 떨어지는지 본다.
