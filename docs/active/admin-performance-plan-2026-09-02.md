# Admin 속도 진단과 개선 계획 — 2026-09-02

기준 시점: 2026-09-02
대상: `/admin` 전 화면과 `/api/admin/*` 222개 라우트, 미들웨어(`proxy.ts`), 클라이언트 fetch 계층(`lib/admin-client.ts`)
방식: 코드 정독으로 요청 경로의 왕복 수를 세고, 사용자 가설 네 가지를 각각 판정했다. 프로덕션 실측은 이 문서에 없다. 실측 도구(`npm run measure:admin`)를 함께 추가했으므로 배포 전후 같은 방법으로 재야 한다.

관련 문서: [어드민 속도·퀄리티 감사(2026-07-23)](./admin-perf-quality-audit-2026-07-23.md), [CRM 로딩 지속·초기 속도 계획(2026-08-28)](./crm-load-and-region-map-plan-2026-08-28.md), [공용 Supabase DB 최적화·통폐합 분석](./supabase-shared-db-consolidation-analysis-2026-09-02.md), [플랫폼 & 데이터 파트 가이드](./playbook/06-platform-data.md)

---

## 0. 가설 판정

| 가설 | 판정 | 근거 |
|---|---|---|
| 백업이나 자체 로딩을 매번 해서 느리다 | 백업은 아니다. "매번 자체 로딩"은 사실에 가깝다 | 요청 경로에 백업 루틴은 없다(하드웨어 원장 임포트 때만 스냅샷). 대신 (1) 미들웨어가 쿠키 있는 모든 요청마다 GoTrue `getUser()`를 캐시 없이 호출하고, (2) API 가드의 60초 캐시는 워밍된 인스턴스 안에서만 유효하며, (3) 화면 하나가 사이드바·CRM 서브내비 프리페치까지 API를 수십 번 부르고, (4) 클라이언트 레이아웃이 첫 진입마다 브라우저에서 `getUser()`와 `admin_profiles`를 조회한다. 즉 "인증을 매번 다시 하는" 구조다 |
| DB가 꼬였거나 마이그레이션이 안 됐다 | 코드로는 판정 불가. 느림의 주원인일 가능성은 낮다 | 미적용 마이그레이션은 보통 느림이 아니라 오류·폴백으로 나타난다. 예외는 인덱스 마이그레이션이다(미적용이면 조용히 느려진다). 2026-08-28 이후 마이그레이션 6건에 프로브가 없어 적용 여부를 아무도 증명할 수 없었다. 이번에 프로브를 추가했으므로 `npm run check:db`로 확인한다 |
| Supabase Pro($25)를 사면 해결된다 | 보조 수단이다. 순서가 중요하다 | Free→Pro는 컴퓨트가 Nano에서 Micro(1GB, 2코어 공유)로 오르고 연결·MAU 여유가 생긴다. 그러나 지금 병목은 호출당 인증 왕복과 화면당 호출 수라는 구조 문제라서, 왕복을 줄이기 전에는 플랜을 올려도 체감이 제한적이다. 왕복을 줄인 뒤 측정해서 DB CPU가 상한에 닿아 있으면 그때 Pro와 컴퓨트 애드온이 답이다. 운영 앱이면 Pro는 백업·지원 측면에서 어차피 권장한다 |
| Compass와 공유하는 것을 같이 최적화하면 더 빨라진다 | 일부 맞다. 별도 트랙이다 | Admin이 브리지 뷰 `compass_leads_v`를 `phone_key`로 조회할 때 그 키가 뷰 안의 정규식 계산 컬럼이라 호출마다 `crm.leads` 전체를 스캔한다. Compass 쪽에 생성 컬럼과 인덱스를 두면 사라진다. 담당자 정본 뷰, Meta 단일 소유 같은 공용 DB 통폐합 항목은 [통폐합 분석 문서](./supabase-shared-db-consolidation-analysis-2026-09-02.md)를 따른다 |

## 1. 요청 경로에서 확인한 사실

### 1.1 인증 왕복 (변경 전)

| 경로 | 미들웨어(`proxy.ts`) | 라우트 가드(`lib/admin-auth.ts`) | 합계 |
|---|---|---|---|
| `/admin/*` 페이지 | `updateSupabaseSession()`의 `getUser()` 1회 + `hasSupabaseAdminSession()`의 `getUser()` 1회와 `admin_profiles` 1회(쿠키 키 60초 캐시, 인스턴스별) | 페이지는 클라이언트 렌더라 없음. 대신 브라우저가 `getUser()`와 `admin_profiles`를 조회 | 캐시 미스 3회 + 브라우저 2회 |
| `/api/admin/*` | `getUser()` 1회(캐시 없음) | `getUser()` 1회 + `admin_profiles` 1회(쿠키 키 60초 캐시, 진행 중 promise 공유, 인스턴스별) | 캐시 미스 3회, 히트 1회 |

Next 16의 `proxy`는 Node.js 런타임 기본이므로 함수 리전(sin1)에서 실행된다. GoTrue 왕복은 리전 간 지연이 아니라 호출 자체의 처리 시간(수십 ms)이 비용이다. 화면 하나가 API를 20번 부르면 인증 처리만 20~60회다.

### 1.2 클라이언트 팬아웃 (진단 에이전트가 오케스트레이터 가정을 정정)

처음 가정은 "사이드바와 CRM 서브내비가 마운트 시 약 12개씩 프리페치를 일괄 발사한다"였다. 코드 판독 결과는 다르다. `components/admin/AdminSidebar.tsx`의 예열 목록은 nav 항목별 URL 맵이고, 발사는 링크의 hover(180ms 디바운스)·focus·pointerdown·click에서만 일어나 "다음에 갈 탭"을 데운다. 유휴 시에는 인접 탭의 라우트 코드만 프리페치하고 API 데이터는 발사하지 않는다. 캐시가 따뜻하면 네트워크를 타지 않는다.

콜드 진입 기준 화면당 `/api/admin/*` 호출 수(RSC 프리페치 성공 가정, 실패 시 괄호):

| 화면 | 페이지 필수 | 셸(알림 벨) | 합계 |
|---|---|---|---|
| `/admin/overview` | 10(14) | 1 | 11(15) |
| `/admin/crm` 홈 | 5(8) | 1 | 6(9) |
| 리드 보드 | 5 | 1 | 6 (leads → compass 오버레이 1단 waterfall) |
| `/admin/calendar` | 4 | 1 | 5 |
| `/admin/branch` | 2 | 1 | 3 |
| `/admin/campaigns` | 2 | 1 | 3 |
| `/admin/docs` | 2 | 1 | 3 |
| `/admin/hardware` | 0(1) | 1 | 1(2) |

폴링은 알림 벨의 60초 `countOnly` 하나뿐이다. 즉 화면당 호출 수는 과하지 않고, 느림의 1차 변수는 **호출 1건의 비용**(인증 왕복 + 핸들러 비용 + 콜드 스타트)이다.

다만 예열에는 낭비가 있다. 캠페인 항목의 예열 7건은 기본 진입 탭이 하나도 쓰지 않고, branch 요약 예열은 쿼리스트링이 소비 측과 달라 캐시 슬롯이 어긋나며, CRM 홈은 click 시 RSC 프리페치와 같은 데이터를 API 라우트에서 한 번 더 계산하고, 접힌 탭 전용인 `crm/neo`를 첫 진입에 데운다. 반대로 CRM 홈과 overview가 실제로 쓰는 URL 다수는 예열 목록에 없다. 이 항목들은 이번에 고쳤다(§4).

### 1.3 서버 메모이제이션

`adminCachedJson`은 HTTP 캐시 헤더만 붙이고 서버 메모이제이션은 하지 않는다. `unstable_cache`는 36곳에 적용돼 있다. 어떤 무거운 핸들러가 아직 콜드 미스마다 재집계하는지는 §3에 있다.

## 2. 서버 핸들러 비용 (진단 에이전트 D3, 코드 추적)

2026-07-23 감사가 지적한 항목은 대부분 해결돼 있었다. `os-summary` 60초 캐시, 통합 고객 프리필터 캐시(웜 12~35ms), traffic 3중 스캔 단일화, 리드 컬럼폭 스코프 분리, `crm/overview`의 스냅샷 RPC 전환(16쿼리 → 1 RPC), `action-kpis`의 N+1 제거, `leads/activity-summary` RPC가 그것이다. `unstable_cache` 32곳은 대부분 뮤테이션의 `revalidateTag`와 짝이 맞는다.

남아 있던 것은 다음 여덟 가지였고 전부 S 규모다.

| # | 엔드포인트·모듈 | 문제 | 조치 |
|---|---|---|---|
| 1 | `/api/admin/email` | 같은 모듈에 60초 캐시 `getCachedAllCampaigns`가 있는데 이 라우트만 캐시 없는 `getAllCampaigns`(HTML 본문 포함 `select *`)를 씀 | 캐시 버전으로 교체 |
| 2 | `lib/admin-homepage-flow.ts` | Overview와 사이드바가 부르는데 매 호출 `client_events` 최대 10만 행 스캔, 캐시 없음 | `unstable_cache` 60초 |
| 3 | `/api/admin/crm/coverage` | `fetchSupabasePages` 3회 + 매출 계정 커버리지 3회, 캐시 없음. `os-summary`와 소스를 공유하는데 캐시는 공유하지 않음 | `unstable_cache` 60초 |
| 4 | `/api/admin/notifications?countOnly=1` | 전 어드민 화면 벨이 60초마다 부르는 최다 호출인데 `adminCachedJson`조차 없음 | HTTP 캐시 헤더 적용, 벨 폴링 90초 |
| 5 | `lib/admin-crm-revenue-sheet.ts` | 5개 병렬 쿼리(`.limit(2000)` 3개 포함)를 매 요청 재조합, 캐시 없음 | `unstable_cache` 60초 |
| 6 | `lib/admin-crm-readiness.ts` | 8회 이상 왕복(대부분 `limit 1`)을 매 요청, 캐시 없음 | `unstable_cache` 60초 |
| 7 | `admin-user-directory` 캐시(120초) | 역할·오너 매핑을 바꾸는 PATCH가 이 태그를 무효화하지 않음. `unified?owner=me` 매칭이 최대 120초 지연 | PATCH 성공 시 `revalidateTag` |
| 8 | `lib/repositories/rev-account-coverage.ts` | `.limit(5000)`이 PostgREST `max-rows` 1000에 걸려 조용히 절단될 수 있음(정확성) | `fetchSupabasePages`로 교체 |

콜드 미스에서 여전히 무거운 것: `crm/map-source`(5개 테이블 후보 매칭, 45초 캐시), `crm/neo`(최대 20왕복, 120초 캐시). 둘 다 캐시가 흡수하므로 이번 범위 밖이다.

## 3. 요청 경로 밖의 변수

- **콜드 스타트.** 함수 인스턴스가 새로 뜨면 모듈 캐시(60초 컨텍스트 캐시, 모듈 메모)가 비어 있다. 동시 요청이 여러 인스턴스로 흩어지면 캐시 적중률이 떨어진다. Vercel Fluid Compute가 켜져 있으면 한 인스턴스가 동시 요청을 처리해 캐시가 공유된다. 대시보드에서 확인할 항목이다.
- **JWT 서명 키.** 이번 인증 최적화는 Supabase 프로젝트가 비대칭 서명 키(ECC P-256 권장)를 쓸 때만 네트워크 왕복이 0이 된다. HS256 레거시 키면 auth-js가 내부적으로 서버 검증으로 폴백해 보안은 같고 성능 이득만 없다. Supabase 대시보드 Authentication → JWT Keys에서 확인한다.
- **Supabase 컴퓨트.** 왕복을 줄인 뒤에도 느리면 DB CPU가 상한인지 본다. Reports의 CPU·API 응답 시간, `pg_stat_statements` 상위 쿼리가 판단 근거다. Nano(Free)는 공유 CPU라 동시 집계 쿼리에 취약하다.

## 4. 이번에 적용한 조치

작업은 서브 에이전트 풀로 나눴다. 인증 경로처럼 보안 의미가 걸린 구현은 상위 티어, 인덱스·프로브·측정 스크립트·프리페치 정리·메모이제이션처럼 채점 기준이 명확한 구현은 하위 티어에 맡겼고, 진단 두 건도 하위 티어가 맡아 오케스트레이터의 초기 가정(프리페치 일괄 발사)을 정정했다. 모든 변경은 오케스트레이터가 diff를 검토하고 타입체크·ESLint·해당 테스트를 다시 돌린 뒤 커밋했다.

### 4.1 인증 왕복 제거 (상위 티어)

| 파일 | 변경 |
|---|---|
| `lib/supabase/middleware.ts` | `verifySupabaseAuthUser()` 신설. `auth.getClaims()`로 JWKS 로컬 검증을 먼저 시도하고, 없거나 실패하면 `getUser()`로 폴백한다. `updateSupabaseSession()`이 `{ response, user }`를 반환하며 세션 갱신 쿠키 기록은 그대로다 |
| `proxy.ts` | `/admin` 페이지 경로에서 `getUser()` 재호출을 없애고 미들웨어 검증 결과로 `admin_profiles`만 조회한다. 60초 캐시·역할 판정·레거시 HMAC 경로 무변경 |
| `lib/admin-auth.ts` | API 가드가 같은 검증기를 쓴다. 60초 컨텍스트 캐시·진행 중 promise 공유 무변경 |
| `tests/auth/supabase-claims-session.test.ts` | 왕복 예산·폴백·비활성 프로필 거부 16건 |

요청당 GoTrue 왕복(비대칭 서명 키 프로젝트 기준):

| 경로 | 상황 | 이전 | 이후 |
|---|---|---|---|
| `/admin/*` 페이지 | 프로필 캐시 미스 | 2 | 0 |
| `/admin/*` 페이지 | 프로필 캐시 히트 | 1 | 0 |
| `/api/admin/*` | 컨텍스트 캐시 미스 | 2 | 0 |
| `/api/admin/*` | 컨텍스트 캐시 히트 | 1 | 0 |
| 토큰 만료 시 | — | 갱신 1 | 갱신 1 |

신뢰 모델의 변화는 하나다. 사용자 삭제·차단이 토큰 만료(최대 1시간)까지 늦게 반영될 수 있다. 즉시 차단이 필요하면 `admin_profiles.status`를 바꾸는 경로(최대 60초)를 쓴다. HS256 레거시 키 프로젝트에서는 auth-js가 내부적으로 서버 검증으로 폴백하므로 보안 수준은 같고 이득만 없다.

### 4.2 인덱스·프로브·측정 도구 (하위 티어)

- `supabase/migrations/20260902_leads_dedupe_and_admin_hot_path_indexes.sql`: `leads(phone)`, `leads(email)` 부분 인덱스(리드 제출마다 도는 중복 탐지), `admin_calendar_events(end_date)` 부분 인덱스(멀티데이 spanning 분기), `crm_tasks(status, completed_at) where status='done'`(매니저 리포트). 이미 커버된 후보 3건(`lead_contact_logs`, `crm_customer_events`, `notifications`)은 근거와 함께 제외했다.
- `lib/db/schema-contract.ts`: 2026-08-28~29 마이그레이션 6건(Compass 브리지 뷰 7개 포함)과 새 인덱스 마이그레이션의 프로브 15개. 인덱스 존재는 REST로 검증할 수 없어 컬럼 존재 프로브(warning)로 두고 한계를 주석에 적었다.
- `scripts/measure-admin-api.mjs`(`npm run measure:admin`): 배포 전후 콜드/p50/p95 측정 도구. §5 참고.

### 4.3 탭 예열 정합 (하위 티어)

- `components/admin/AdminSidebar.tsx`: 캠페인 항목의 예열 7건은 기본 진입 탭(요약)이 하나도 쓰지 않았다. 요약 탭이 실제로 쓰는 `marketing/perf`·`marketing/insights`로 교체하고, 소비 측이 쓰는 커스텀 cacheKey와 맞췄다. branch 요약 예열 URL에 `&view=overview`를 붙여 캐시 키를 소비 측과 일치시켰다. 접힌 팀 KPI 탭 전용인 `crm/neo` 예열을 제거했다. CRM 홈·overview·branch가 첫 화면에서 무조건 부르는 URL 11건을 예열 목록에 추가했다.
- 그 화면의 RSC 프리페치가 이미 계산하는 URL(overview 3건, CRM 홈 2건, branch·ledger·hardware 각 1건)은 `CLICK_SKIP_WARMUP_URLS`(href 스코프)로 click에서만 건너뛴다. click은 곧 네비게이션이라 RSC가 같은 데이터를 계산하므로 클릭 시점 예열은 서버 이중 계산이었다. hover·focus·pointerdown 예열은 유지한다.
- `lib/admin-client.ts`에 동시성 3의 예열 큐를 추가했고, `components/admin/crm/CrmSubnav.tsx`는 사이드바와 같은 180ms 디바운스·href당 1회 규약을 따른다. 알림 벨 유휴 폴링은 60초에서 90초로.
- `tests/admin/nav-warmup-contract.test.ts`가 캠페인·branch의 예열 URL과 소비 측 캐시 키 정합을 고정한다.

### 4.4 서버 메모이제이션과 정확성 (하위 티어 + 오케스트레이터 보강)

§2 표의 8건을 그대로 적용했다. 새 캐시는 전부 60초 TTL이며 태그와 무효화 짝을 갖는다.

| 캐시 | 키 | 태그 | 무효화 지점 |
|---|---|---|---|
| `getAdminHomepageFlow` | `admin-homepage-flow` + rangeDays | `admin-homepage-flow` | 분석성 집계, TTL 전용 |
| coverage 번들 | `admin-crm-coverage` | `admin-crm-coverage`, `admin-os-summary` | 소스 링크 확정/해제/생성 라우트 4곳 |
| `getAdminCrmRevenueSheetWorkspace` | `admin-crm-revenue-sheet` | 동일 | TTL 전용(시트 미러 원천) |
| `getAdminCrmReadinessReport` | `admin-crm-readiness` | 동일 | TTL 전용 |
| `admin-user-directory`(기존 120초) | — | 동일 | 사용자 PATCH에 무효화 추가 |

오케스트레이터가 보강한 것: 캐시 태그 상수를 `lib/admin/crm/cache-tags.ts`로 모으고, 이전에는 어떤 태그도 무효화하지 않던 `source-links/[id]`·`bulk` PATCH와 `manual`·`generate` POST가 coverage·os-summary·매출 집계 태그를 함께 무효화하게 했다. `rev-account-coverage`의 페이지네이션 전환으로 깨진 브랜치 테스트의 목도 갱신했다.

바꾸지 않은 것: `lib/repositories/leads.ts`의 `revalidateTag(tag, { expire: 0 })`를 `"max"`로 통일하는 항목. Next 16 런타임에서 전자는 즉시 하드 만료, 후자는 SWR이라 "쓰기 직후 다음 읽기가 반드시 새 값"이라는 그 자리의 요구를 깨뜨린다.

### 4.5 Compass P0 안전성 패치 세트 (상위 티어, 로컬 브랜치, 푸시 대기)

Compass 저장소(`classinkr-main/crm`)에는 이 세션에 푸시 권한이 없다. 통폐합 분석의 P0 6건을 로컬 브랜치 `perf/p0-sync-safety`에 커밋 11개로 준비했고, 패치 파일도 함께 남겼다. 푸시와 PR은 승인 뒤 진행한다.

| 커밋 | 내용 |
|---|---|
| 매출 미러 원자화 | `lib/revenue.ts`를 "시트 읽기·파싱 먼저, DB 쓰기는 단일 커넥션 `begin…commit`"으로 재구성. 진입부 `pg_advisory_xact_lock`으로 동시 실행 직렬화. 원장 딜 0건이면 delete 없이 조기 반환. `revenue_kpi`는 `jsonb_to_recordset` 단일 문. `schema.sql`에 업무 유니크 인덱스(`month, week, customer, person, team, status, product, is_mkt`) |
| 편승 제거 | `sheet` 크론 끝의 `syncRevenue()` 호출과 응답 필드 삭제 |
| 중복 워크플로 삭제 | `revenue-sync.yml` 삭제. `hourly-sync.yml` 3단계가 유일한 시간당 트리거 |
| 웹훅 fail-closed | `META_APP_SECRET` 없으면 503, 서명 검증 항상 수행, 바이트 길이 비교 |
| Pool 설정 | `connectionTimeoutMillis` 5초, `idleTimeoutMillis` 10초, `keepAlive`, `max` 5, 유휴 에러 핸들러 |
| 캘린더 미러 원자화 | delete + upsert 단일 트랜잭션, `jsonb_to_recordset` 단일 문, 0건 가드 유지 |
| Meta 크론 | `maxDuration` 선언, 부분 실패를 `partial`/`partialAt`로 응답에 노출 |
| 담당자 1줄 | `push_neocrm.mjs` OWNERS에 황찬우 |
| 스키마 정합 도구 | `scripts/schema-diff.mjs`(읽기 전용), `schema.sql`에 `activities.deleted_at`, 코드에서 추론한 누락 DDL은 `scripts/schema.missing.sql`로 분리(실물 대조 후 이관) |
| 문서 | `docs/p0-sync-safety-2026-09-02.md`: 적용 순서와 롤백 |

적용 순서: `node scripts/migrate.mjs`(멱등 추가분 2개) → 배포 → `/api/cron/revenue`·`calendar-sync` 수동 1회로 `skipped`·행 수 확인 → Actions에서 `revenue-sync` 소멸 확인 → `META_APP_SECRET` 존재 확인. 유니크 인덱스 생성이 실패하면 실물에 중복 행이 있다는 뜻이므로 문서의 진단 쿼리로 먼저 확인한다. 코드는 인덱스 없이도 동작한다.

### 4.6 셸 세션 서버 부트스트랩 (상위 티어)

`app/admin/layout.tsx`는 클라이언트 컴포넌트라 프록시가 이미 검증한 요청인데도 마운트 후 브라우저에서 `getUser()`와 `admin_profiles`를 다시 왕복했고, 그동안 사이드바는 스켈레톤이었다. 레이아웃을 서버 컴포넌트로 바꾸고 `lib/admin-auth.ts`의 `resolveAdminShellSession()`이 쿠키로 세션을 확정해 `components/admin/AdminShell.tsx`에 넘긴다. 토큰 검증은 미들웨어와 같은 검증기(`getClaims` 로컬 검증)라 셸 왕복은 `admin_profiles` 1회이며 쿠키 키 60초 캐시를 탄다. 첫 하드 진입의 브라우저 왕복은 2회에서 0회가 됐고 사이드바가 첫 페인트부터 완성형이다.

`initialSession`이 있으면 클라이언트 셸은 네트워크 조회를 건너뛰고 sessionStorage 키를 렌더 단계에서 채운다. 자식 컴포넌트의 첫 fetch와 lazy initializer가 그 키를 먼저 읽기 때문이다. 사이드바가 SSR되므로 "기타" 펼침 상태(localStorage)는 마운트 후에만 반영하도록 고쳐 하이드레이션 불일치를 막았다. 남은 주의점: 셸보다 위에서 렌더되며 sessionStorage를 읽는 컴포넌트가 생기면 같은 레이스가 재발한다. 이 레이아웃은 업무 표면 가드이지 보안 경계가 아니다.

### 4.7 무거운 의존성 지연 로딩 (하위 티어)

`lib/google.ts`의 top-level `googleapis` import는 이 모듈을 간접 import하는 서버 라우트·페이지 74개(크론 9종, 어드민 대부분, 결제, 웹훅)의 번들에 패키지 전체를 실었다. `sheets`·`calendar`·`gmail`·`drive`를 "메서드가 실제로 호출될 때만 `import("googleapis")`를 실행하는 지연 Proxy"로 바꿔 export 시그니처와 타입을 유지했고, 호출부 6곳과 모킹 테스트는 무변경이다. `lib/branch/parsers/xlsx-grid.ts`의 `exceljs`도 함수 내부 동적 import로 옮겼다. 회귀 테스트 2개가 "import만으로는 미로드, 첫 호출에 1회 로드, 이후 캐시"를 고정한다.

`next.config.ts`의 `serverExternalPackages`에 두 패키지를 추가하면 번들링 대상에서 빠져 빌드와 콜드 스타트가 더 가벼워진다. 이 변경은 전체 빌드 게이트와 함께 적용했다(§4.9).

### 4.8 Compass 브리지 조회 메모 (하위 티어)

`compass_leads_v.phone_key`는 뷰 안의 정규식 계산 컬럼이라 `.in("phone_key", …)` 조회마다 Compass의 `crm.leads` 전체를 스캔한다. 근본 해결은 Compass 쪽 생성 컬럼과 인덱스이고(별도 트랙), Admin 쪽에서는 같은 인자로 반복되는 조회를 60초 재사용하도록 `lib/compass/bridge.ts`에 모듈 메모를 넣었다. 진행 중 promise를 공유하고, `down` 결과는 10초, 브리지 상태 점검은 15초만 캐시하며, 예외는 캐시하지 않는다. 반환마다 행 배열을 얕은 복사해 호출부의 변형이 캐시를 오염시키지 않는다. 낡은 데이터 창은 최대 60초이며, 인스턴스별 캐시라 인스턴스가 많을수록 절감 폭은 줄어든다.

### 4.9 품질 게이트

이 세션에서 실행한 게이트와 결과다. 이 환경에는 Supabase 접근 권한과 환경변수가 없어 실제 데이터에 닿는 단계는 통과시킬 수 없었고, 그 항목은 그렇게 적었다.

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npx eslint app components lib --max-warnings=0` | 통과 |
| `npm run build`(`next build`) | 통과. 자리표시자 Supabase env로 실행했고 정적 페이지 443개 생성. 어드민 레이아웃 `force-dynamic` 반영 전에는 490개 중 `/admin/blog/new` 사전 렌더가 Supabase 서버 키 부재로 실패했다 |
| `postbuild` 공개 콘텐츠 검사(`check:public-content`) | 이 환경에서 실패. 최신 공개 글을 실제 Supabase에서 읽는 검사라 네트워크 없이는 통과할 수 없다. 배포 파이프라인에서는 env가 있으므로 별도 확인 |
| `npx vitest run --dir tests` | 473 파일 / 3,722 테스트 통과 |

빌드 과정에서 발견해 함께 고친 것: `resolveAdminShellSession()`이 `await cookies()`를 try/catch 안에 두고 있어 정적 사전 렌더 중 Next가 던지는 "동적 렌더 전환" 신호를 삼킬 수 있었다. `cookies()`를 try 밖으로 옮겼고, 어드민 레이아웃에 `export const dynamic = "force-dynamic"`을 선언해 인증 뒤의 어드민 페이지가 빌드 시점에 사전 렌더되지 않게 했다. 어드민 페이지는 사용자별 데이터라 사전 렌더가 무의미했고, 빌드가 운영 DB 접근 가능 여부에 결합되는 문제도 함께 사라진다. `next.config.ts`에는 `serverExternalPackages: ["googleapis", "exceljs"]`를 등록했다.

## 5. 측정 방법

배포 전후를 같은 방법으로 잰다. 값은 문서가 아니라 실행 로그에 남긴다.

```bash
# 브라우저 개발자 도구에서 어드민 세션의 Cookie 헤더를 복사해 환경변수로 넣는다. 값은 출력되지 않는다.
ADMIN_BASE_URL=https://<배포 도메인> ADMIN_COOKIE='<cookie>' npm run measure:admin -- --runs=5
```

- 첫 실행(콜드)과 이후 실행의 p50·p95를 엔드포인트별로 보여 준다. 콜드와 웜의 차이가 크면 캐시 적중 문제, 둘 다 느리면 핸들러·DB 문제다.
- Vercel Functions 로그의 duration과 Supabase Reports의 API 응답 시간을 같은 시간대에 대조한다.
- `npm run check:db`로 인덱스·프로브 마이그레이션 적용 여부를 확인한다. 미적용이면 인덱스 효과가 없다.

## 6. 운영에서 확인할 것

| 항목 | 왜 | 어디서 |
|---|---|---|
| Supabase JWT 서명 키가 비대칭인지 | 인증 최적화의 이득 실현 조건 | Supabase → Authentication → JWT Keys |
| Vercel Fluid Compute 활성 여부, 함수 리전 sin1 유지 | 모듈 캐시 공유와 DB 지연 | Vercel → Project Settings → Functions |
| Vercel 플랜과 크론 실행 로그 | 크론 11개 실행 여부, 2026-06-24~08-28 결손 구간 | Vercel → Cron Jobs |
| Supabase 플랜·컴퓨트, CPU·API 지연 리포트 | Pro 전환 판단 근거 | Supabase → Reports |
| 2026-09-02 마이그레이션 적용 | 인덱스·프로브 | `npm run check:db` |

이 세션에서 직접 확인한 것과 못 한 것: Compass GitHub Actions 실행 이력과 잡 로그는 확인했다(공용 DB 분석 문서 §5.5). 운영 도메인(classin.co.kr, mkt.classin.co.kr, Supabase)으로의 요청은 이 실행 환경의 네트워크 정책이 차단해 `measure:admin` 실측과 JWKS 조회를 수행하지 못했고, Vercel·Supabase 대시보드는 자격증명이 없어 열지 못했다. 위 표의 항목은 운영자 로그인으로 확인해야 한다.

## 7. 다음 단계

1. 배포 후 `measure:admin`으로 실측하고 이 문서에 날짜별 결과 파일 경로를 링크한다.
2. 실측에서 여전히 느린 엔드포인트가 콜드 스타트 지배면 Fluid Compute와 함수 메모리, 무거운 의존성(`googleapis`, `exceljs`)의 동적 import를 검토한다.
3. DB CPU가 상한이면 Supabase Pro와 컴퓨트 애드온을 올린다. 그 전에 올리는 것은 비용만 늘린다.
4. Compass 공유 항목은 통폐합 분석 문서의 로드맵을 따른다. 브리지 `phone_key`는 Compass 쪽 생성 컬럼과 인덱스로 옮기는 것이 정답이다.
5. 클라이언트 레이아웃의 첫 진입 `getUser()` + `admin_profiles` 브라우저 조회는 서버 컴포넌트 레이아웃으로 옮기면 사라진다. site/admin 분리 계획의 레이아웃 단계와 함께 다룬다.

## 8. 후속 — 2026-09-02 오후, 프로덕션 실측과 hom_v4 병합

§6이 "운영자가 확인해야 한다"고 남긴 항목을 같은 날 오후에 Supabase Management API(읽기 전용 SQL)와 Vercel API로 직접 실측했고, 이 문서의 브랜치(home_v3-3 = origin/home_v3)를 로컬 작업 브랜치 hom_v4에 병합했다. 아래 수치는 코드 추정이 아니라 실측이다.

### 8.1 실측 결과

| 항목 | 실측 | 판정 |
|---|---|---|
| JWT 서명 키 | ES256 `in_use`, HS256 `previously_used` | §4.1 인증 최적화의 이득 조건 충족. 최근 24시간 최다 API 경로가 `/auth/v1/user`(1,555건, 2위 leads 396건)라 효과가 가장 큰 축이다 |
| Vercel | 팀 플랜 Hobby, Fluid Compute ON, 프로덕션 regions `sin1`(프로젝트 기본값은 iad1이지만 vercel.json이 이긴다), 크론 11개 등록 | 모듈 메모 공유 전제 성립 |
| Supabase | ap-southeast-1, PG 17.6, 컴퓨트 애드온 없음(Nano), 커넥션 24/60, DB 209MB | Pro 전환은 아직 근거 없음(§0 순서 유지) |
| 20260902 인덱스 4종 | 미적용. 대상 행 수 leads 271, admin_calendar_events 1, crm_tasks 0 | 무해하지만 현재 규모에서는 효과 0. 운영자 스크립트로 함께 적용 |
| `showroom_bookings` | 프로덕션에 테이블 없음(20260829 마이그 미적용). `/api/showroom/availability` 500 실측, `/showroom` 페이지는 200 | **P0.** `npm run check:db`가 이번 프로브 추가 덕에 이 누락을 잡는다 |
| DB 시간 1위 그룹(pg_stat_statements 3/23~) | `external_crm_records` 페이지당 exact count 재실행·`ORDER BY synced_at` 전량 정렬 7문, 평균 0.35~2.5초, 합계 약 5,000초 | 이 문서 범위 밖이었다 → §8.2 |
| 단일 문장 1위 | `docs_articles` 전문 20컬럼 로드(`lib/docs-content.ts` getDocsContent) 12,359콜 × 138ms = 1,710초, 콜당 1,696블록 | 공개 문서·챗봇 폴백 경로. 요청 스코프 cache()뿐이었다 → §8.2 |
| 이상 이력 | 롤백 트랜잭션 30,002,074건 ≈ `public.leads` 순차 스캔 30,006,815회(전체 트랜잭션의 75.6%). 실패 문장은 pg_stat_statements에 남지 않아 원인 문장 미상. 현재는 정지(25분간 +1, 최근 24시간 leads API 396건) | 재발 시 postgres_logs(보존 1일)를 즉시 조회 |

### 8.2 이번 후속에서 적용한 것

- **병합** `d876325f`: home_v3-3 → hom_v4. 충돌 4파일(AdminSidebar·CrmSubnav·nav-warmup 계약 테스트·next.config)은 "로컬의 {url, cacheKey} SSOT 표 + 원격의 CLICK_SKIP_WARMUP_URLS·동시성 3 큐"로 합쳤다. 양쪽이 각자 추가한 `overviewChatbotStatsUrl` 중복 정의 1건 제거. 게이트: typecheck·eslint·build(+check:public-content)·vitest 3,748 통과.
- **문서 콘텐츠 메모** `257cf087`: `lib/docs-content.ts`에 인스턴스 메모(TTL 60초, 진행 중 promise 공유, 실패 미캐시, 무효화 세대). 관리자 발행·수정 경로(`_revalidate.ts`)가 `invalidateDocsContentCache()`를 함께 호출. Data Cache를 쓰지 않은 이유는 발행 본문 합계가 실측 1,082kB라 항목당 2MB 절벽이 가깝기 때문. 테스트 7건(RED→GREEN).
- **마이그레이션 파일** `9e0a0f3c`: 보안 하드닝 1차(`20260902_security_definer_access_hardening.sql`, 운영 하드닝 계획 §PR 3)와 `compass_leads_v`의 phone_key 컬럼 전환(`20260902_compass_leads_v_phone_key_column.sql`, Compass 컬럼이 있을 때만 뷰 교체).
- **external_crm_records·리뷰 브랜치 재적용**: 별도 브랜치에서 진행한 결과를 아래 8.4에 기록한다.

### 8.3 운영자가 실행할 것(이 세션이 실행하지 못한 것)

프로덕션 DDL·배포·외부 저장소 push는 실행 환경의 자동 승인 정책이 차단했다. 전부 스크립트로 준비했고 실행은 한 줄이다.

| 순서 | 명령 | 하는 일 |
|---|---|---|
| 1 | `node tmp/apply-db-2026-09-02.mjs` | 쇼룸 테이블 → 인덱스 4종 → 보안 하드닝 → compass 뷰(컬럼 없으면 NOTICE만) 순으로 멱등 적용 후 검증 쿼리 출력. `--verify`면 확인만 |
| 2 | `node tmp/deploy-production.mjs` | hom_v4 HEAD를 Vercel 프로덕션으로 빌드·배포하고 READY까지 폴링 |
| 3 | `ADMIN_COOKIE=… npm run measure:admin -- --runs=5` | §5의 실측. 배포 전 값이 없으므로 이번 값이 베이스라인이다 |
| 4 | Compass 저장소에서 `git apply tmp/compass-leads-phone-key.patch` → PR → `node scripts/migrate.mjs` → 1번 스크립트 재실행 | crm.leads.phone_key 생성 컬럼 + 인덱스, 그 뒤 브리지 뷰 교체 |

### 8.4 별도 브랜치에서 진행해 병합한 것

**external_crm_records(84,937행, 113MB) DB 시간 제거** — 커밋 `1da959a1`, 서브 에이전트 워크트리(TDD, 신규 테스트 6파일).

| 파일 | 변경 | DB에서 사라지는 것 |
|---|---|---|
| `lib/admin-crm-duplicate-preflight.ts` | external_crm_records 페이지 스캔과 무필터 exact count 삭제. UNIQUE 제약 `external_crm_records_unique_source`가 그 검사를 이미 보증하므로 `ok`로 보고(검사 key·label 유지) | preflight당 84K행 `synced_at, id` 정렬 5회(문장 1,347ms × 5) + exact count 1회(2.5초). 이 스캔은 애초에 중복을 찾을 수 없었다 |
| `lib/repositories/crm-neo-customer-snapshots.ts` | `fetchExternalRows`가 첫 페이지에만 `count: "exact"` | 객체당 (페이지 수 − 1)회의 84K행 집계 |
| `lib/external-crm/latest-synced-at.ts` 신규 + `lib/admin-crm-neo.ts` | 테이블 전체 `ORDER BY synced_at` 대신 객체 키별 `LIMIT 1` 병렬 → 최댓값(`external_crm_records_object_idx`) | 리포트당 85K 인덱스 엔트리 정렬 + 힙 1만 회(2,421ms) → 1.4ms 프로브 10회 |
| `lib/external-crm/object-snapshot.ts` 신규 + `lib/admin-crm-overview.ts` | `getExternalSnapshotOverview`가 `external_crm_object_snapshot` 뷰 1회를 읽고 요청 키만 합산. 뷰 오류 시 이전 3쿼리로 폴백 | 개요당 84K행 스캔 3회(약 4.7초) → 뷰 1회(약 614ms) |

하지 않은 것: `lib/external-crm/owner-names.ts`의 User 이름 맵 페이징(문장 D, 1,703콜 × 552ms)은 60초 메모와 NEO 리포트 캐시 뒤에 있어 하루 약 2.6회 빌드라 그대로 둔다. 후속으로 하려면 `is_stale` 무필터 keyset(UNIQUE 인덱스 경로)이 맞다 — `is_stale=false`로 좁히면 퇴사 담당자의 이름을 잃는다.

**리뷰 브랜치(`claude/supabase-optimization-review-yestaz`) perf 커밋 재적용** — 병합 `96dab0c0`(4커밋).

| 원본 | 결과 |
|---|---|
| T5-A 하드웨어 payload 슬림 | 적응 적용 `f99d2d9a`. hom_v4에 병렬 구현이 이미 있어 잔여분(6컬럼 제외 원장 select, `raw`→`{crmLink}`, 서버 `planned` 플래그)만 얹고 클라이언트 타입을 정리. 마이그 `20260902_hardware_movements_active_date_idx.sql` 포함(운영자 스크립트 5번째 항목) |
| T5-B overview 스코프 | 부분 적용 `a47faf6c`. `/api/admin/email?scope=summary`(본문 제외 7컬럼, 60초 캐시 인자별 엔트리)·`/api/admin/patch-notes?limit=1&summary=1`. 소비처(OverviewClient)·예열 표(AdminSidebar) URL을 문자 단위로 함께 바꿨다. blog는 hom_v4가 이미 `?scope=overview` 서버 투영을 제공해 미적용 |
| T5-C 채널톡 transcript 제외 | 스킵 — 목록 라우트가 이미 `listDurableConversationsLite`로 더 강한 형태를 구현 |
| T10 파트너 포털 팬아웃 상한 | 그대로 적용 `5547f4be`(deal 상세 20건 상한 + 개요 병렬) |
| T11 크론 시(hour) 분리 | 적용 `0fb5d4b2`. sync-branch-insights 08:30→09:30, lead-response-alerts 01:10→02:10(UTC) + insights 라우트가 24시간 내 성공 런이 없으면 200 `skipped`로 자기 방어. `check:vercel-crons` 11건 통과 |
| T2-S 리드 보드 TTL | 스킵 — 현재 보드는 이미 ttl 30초·SWR 120초 |

Compass P0 PR(`classinkr-main/crm#1`)은 mergeable이지만 두 가지를 먼저 확인해야 한다. `crm.revenue_deals`에 업무 유니크 키 중복 그룹이 1건(초과 행 1) 있어 PR의 유니크 인덱스 생성이 그대로는 실패한다(코드는 인덱스 없이도 동작). Meta 리드 웹훅이 fail-closed로 바뀌므로 Compass Vercel 프로젝트에 `META_APP_SECRET`이 있어야 한다 — 없으면 머지 직후 광고 리드가 503으로 유실된다.
