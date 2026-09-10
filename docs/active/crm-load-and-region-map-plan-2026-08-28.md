# CRM 로딩 지속·초기 속도 + 지역 지도/분배 계획

작성: 2026-08-28 · 상태: **A·B·C 완료 — 마이그레이션 프로덕션 적용까지 끝(2026-08-29)** · 미커밋 · 대상: `/admin/crm` 전 화면

## 0. 왜 이 문서인가

세 가지 요청에서 출발한다.

1. CRM 탭이 들어갈 때마다 다시 로딩된다 — 안 그랬으면 좋겠다.
2. CRM 탭 첫 로딩이 더 빨랐으면 좋겠다.
3. 지도 · 지역 분배 · 맵 디벨롭 — 장점과 이득을 계산하고 기획한다.

1·2는 원인이 코드에서 특정됐고, 3은 프로덕션 데이터로 이득을 실측했다. 실측 결과가
"고객 지역 분포 지도"라는 최초 발상을 한 번 뒤집으므로 §3을 먼저 읽는다.

---

## 1. A — 캐시가 매번 날아가는 원인과 수리

### 1.1 실측된 원인 두 가지

**(A-1) 프루너가 SWR 창을 전역 5분으로 잘라낸다.**

`lib/admin-client.ts`의 `pruneMemoryCache` / `pruneSessionCache`는 엔트리별 정책을 보지 않고
전역 상수 `DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS`(5분)만으로 삭제한다. 그런데 CRM 홈은
`CRM_HOME_STALE_WHILE_REVALIDATE_MS = 10분`을 넘긴다(`app/admin/crm/page.tsx`).
`readAdminCache`가 읽기 직전에 `pruneMemoryCache()`를 부르므로, 6분 뒤 재방문하면
SWR 고속 경로가 도달하기 전에 엔트리가 이미 지워져 있다. **요청한 10분은 실제로 5분이다.**

**(A-2) 저장 계층이 `sessionStorage`다.**

탭을 새로 열거나 브라우저를 재시작하면 무조건 콜드다. 반면 실제 인증 수명은
`admin_session` 쿠키(httpOnly · maxAge 7일 · sameSite strict, `app/api/admin/auth/route.ts`)라
**세션은 살아 있는데 캐시만 죽는다.** 재시작 후 첫 CRM 진입이 항상 풀 스켈레톤인 이유다.

### 1.2 수리

**A-1 · 엔트리별 보존창.** `AdminCacheEntry`에 `keepUntil`을 추가하고, 저장 시점에
`savedAt + min(max(ttlMs, staleWhileRevalidateMs), MAX_CACHE_RETENTION_MS)`로 계산한다.
두 프루너는 전역 상수 대신 `entry.keepUntil`을 본다. `keepUntil`이 없는 레거시 엔트리
(이전 버전이 sessionStorage에 남긴 것)는 기존 동작 그대로 `savedAt + 5분`으로 취급한다.
상한 `MAX_CACHE_RETENTION_MS = 30분`을 둬서 호출부가 창을 무한히 늘릴 수 없게 한다.

**A-2 · 지속 계층 승격.** `AdminFetchCacheOptions`에 `persistTo?: "session" | "local"`을 추가한다.
기본값은 URL로 결정한다.

| 스코프 | 계층 | 근거 |
|---|---|---|
| `/api/admin/crm/*`, `/api/admin/leads*` | `local` | CRM 작업면 — 재방문·재시작을 넘어 즉시 그려야 하는 대상 |
| 그 외 어드민 전체 | `session` | 기존 동작 유지. 이번 변경으로 회귀하지 않는다 |

`localStorage` 계층은 자체 상한(60 엔트리 · 엔트리당 350KB)을 갖고 같은 프루너를 탄다.

**안전 규약(그대로 유지 + 확장):**
- SWR이므로 화면은 캐시로 즉시 그리고 **백그라운드 갱신은 항상 돈다.** 낡은 숫자를 붙잡지 않는다.
- 뮤테이션 무효화(`clearAdminRequestCache` / 비-GET 성공)는 `localStorage`도 함께 지운다.
- `clearAdminSessionStorage`(로그아웃 · 인증 실패 · 로그인 화면 진입)가 `localStorage`도 비운다.
  `app/admin/layout.tsx`와 `app/admin/login/page.tsx`가 이미 이 함수를 부르므로 관리자가 바뀌면
  이전 캐시는 다음 어드민 진입에서 제거된다.

**검증:** 엔트리별 보존창·계층 선택·무효화 전파를 `tests/admin/`에 단위 테스트로 고정한다.

---

## 2. B — 첫 로딩 속도

### 2.1 실측된 비용

CRM 홈은 마운트에서 **클라이언트 fetch 8개**를 동시에 띄운다.

`action-kpis` · `overview` · `compass-pipeline` · `home/priority-queue` · `tasks`(주간) ·
`owners` · `health-distribution` · `coverage`

그중 `overview` 하나가 서버에서 **DB 왕복 약 30회**다 — `lib/admin-crm-overview.ts`의
`Promise.all` 17개 + 소스링크 상태별 5 + 쓰기요청 상태별 N + 외부레코드 4. 서버 메모 TTL은
`ADMIN_CRM_OVERVIEW_CACHE_TTL_MS = 30초`뿐이라 콜드 미스가 자주 난다.

전체 경로는 `JS 번들 → 하이드레이션 → 인증 → 8왕복`이 직렬로 쌓이는 구조다.

### 2.2 수리 — 이미 있는 패턴을 CRM에도 적용

이 저장소에는 RSC 프리페치 패턴이 이미 있고 Overview · KR Team · 하드웨어 · 장부가 쓴다.
**CRM 홈만 안 쓴다.**

- `lib/admin/page-auth.ts`의 `getVerifiedAdminContextForPage()` — API 라우트와 **같은** 검증
- `lib/admin/prefetch-budget.ts`의 `settleWithinBudget()` — 1.2초 예산, 초과·실패는 `null`
- 참고 구현: `lib/admin/overview/prefetch.ts`, `app/admin/branch/page.tsx`

**작업:**

1. `lib/admin/crm/home-prefetch.ts` 신설. 대응 라우트와 **같은 lib 함수**를 직접 호출한다
   (HTTP 자기호출 없음).
   - `leadActionKpis` ← `getLeadActionStats()` (= `/api/admin/crm/action-kpis`)
   - `overview` ← `getAdminCrmOverview()` (= `/api/admin/crm/overview`)
   - `compassPipeline` ← 라우트와 같은 3뷰 조립 (= `/api/admin/crm/compass-pipeline`)
2. 역할 게이트는 라우트와 동일한 `CRM_STAFF_ADMIN_API_ROLES`. 컨텍스트가 없거나 역할이
   모자라면 `null` — 화면은 지금까지처럼 클라이언트 페치로 떨어지고 API가 401/403으로 막는다.
   **미검증 요청에는 어떤 데이터도 실리지 않는다.**
3. `app/admin/crm/page.tsx`를 서버 컴포넌트 껍데기로 바꾸고, 현재 클라이언트 본문(509줄)을
   `components/admin/crm/home/CrmHomeClient.tsx`로 옮긴다. `export const dynamic = "force-dynamic"`.
4. 클라이언트는 `initialData`로 첫 렌더 상태를 채우고 그 회차의 fetch를 건너뛴다. 동시에
   `seedAdminRequestCache(url, data, ttl)`로 클라이언트 캐시에 심어, **다른 탭에 갔다 돌아와도**
   같은 데이터를 즉시 쓴다. 이후는 기존 SWR 그대로.
5. `ADMIN_CRM_OVERVIEW_CACHE_TTL_MS` 30초 → 120초. 클라이언트 TTL(120초)과 맞춘다.
   카운트 대시보드라 2분 지연은 허용 범위이고, 새로고침 버튼은 `force=1`로 우회한다.

**기대 효과:** 첫 페인트에서 왕복 3개 제거. `overview`(가장 무거운 것)가 HTML과 함께 도착한다.
나머지 5개는 지금처럼 병렬로 붙되, A의 지속 캐시 덕에 재방문에서는 대부분 즉시 적중한다.

**회귀 방지:** 프리페치 실패·예산 초과·역할 부족은 전부 `null` = "프리페치 없음"이고,
그 경로는 현재 동작과 100% 동일하다.

---

## 3. C — 지도 · 지역 분배 (이득 계산)

### 3.1 지역을 실제로 아는 데이터는 얼마나 되나

2026-08-28 프로덕션 읽기 전용 프로브 실측.

| 원천 | 총건 | 지역 확보 | 커버리지 |
|---|---:|---|---:|
| REV 딜(매출) | 385 | 국내 331 + 온라인 52 + 해외 2 | **86% 국내** |
| 네이버 공유지도(타깃) | 199 | 199 · 16개 시도 분포 | **100%** |
| 리드 | 231 | 원문 103 → 정규화 81 | **35%** |
| NEO 고객 | 884 | 117 | **13.2%** |

### 3.2 뒤집히는 지점 — NEO 고객 지역은 채울 수 없다

- `xiaoshouyi/account` payload 키 **전체**가 `id, phone, ownerId, createdAt, updatedAt,
  entityType, accountName` 이다. **주소·지역 필드가 존재하지 않는다.**
- 현재 채워진 117건은 `lib/repositories/crm-neo-customer-snapshots.ts`의 `revRegionHint`,
  즉 REV 시트 이름 매칭으로만 나온 값이다.
- 전화번호 지역번호 파생을 추가해도 **+53건 → 19.2%가 천장**이다. 전화 843건 중 717건(85%)이
  휴대폰 010이라 지역 정보를 담고 있지 않다. (국제표기 `0082…` 정규화 반영한 수치)

**따라서 지도의 정직한 대상은 "매출 + 타깃 + 리드"이지 "NEO 고객 전체"가 아니다.**
NEO를 레이어로 그리면 화면의 87%가 '미상'이 된다. 대신 **'지역 미상 767건'을 공백 지표로**
노출해 커버리지 문제 자체를 드러낸다.

### 3.3 지역 분배(territory)의 이득 — 여기가 가장 크다

- **리드 231건 전부 `assigned_to`가 비어 있다(배정률 0%).** 231건 모두 활성
  (new 229 · contacted 2), 모두 90일 이내 유입.
- 이유가 코드에 명시돼 있다 — `lib/crm/lead-assignment-policy.ts`:
  > "권위 있는 owner 연결이 없으므로 채널 · **지역** · 라운드로빈을 추측하지 않고 0으로 닫는다"

  그래서 `automaticEvidenceReady`가 **구조적으로 항상 0**이다.
  시도 → 담당자 배정표가 생기면 이 값이 처음으로 0이 아니게 된다.
  **지역 분배는 장식이 아니라 잠긴 자동배정을 여는 열쇠다.**
- 정규화 수율 실측: 자유텍스트 66종 → 기존 `normalizeRegionLabel`로 81/103(78.6%).
  미매칭 22건 중 13건이 로마자 시군구(`Suwon` `Changwon` `Cheongju` `Uijeongbu` `Icheon`
  `Gwangmyeong` `Siheung` `Miryang` `Gyeryong` `Youngin` 등) — 별칭 추가로 **~94건(91%)**.
  잔여는 해외(Battambang · Fergana · Detroit · Tema · Phidim) · 모호(남구 · 동구) · 무효(X).
- 담당 편중 실측(REV 기준): Han 135/385(**35%**) · Wangchan 68 · Somang 48 · Heesung 43 ·
  Junhyuk 40 · Gyusung 35 · Chanwoo 4.

### 3.4 단계 설계

각 단계가 독립적으로 쓸모 있어야 한다.

**C1 · 지역 정규화 정본화**
`lib/regions/korea-regions.ts`에 로마자 시군구 별칭을 추가한다(수율 78.6% → 91%).
리드 지역 표시·집계를 `normalizeRegionLabel` 통과값으로 통일한다. C2·C3의 전제다.

**C2 · CRM 지역 지도** — `/admin/crm/customers/map`을 "지도 원천"에서 **"지도"** 탭으로 승격.
- 상단: `lib/branch/korea-province-map.ts`의 `KOREA_PROVINCE_SHAPES`를 재사용한 시도 choropleth.
  외부 지도 API·키·비용 0.
- 레이어 토글 3장: **매출(REV)** / **타깃(네이버 199)** / **리드**.
- NEO 고객은 레이어가 아니라 "지역 미상 767건" 공백 카운터로 표기.
- 기존 네이버 가져오기·매칭 목록은 지도 아래 **'원천 검수'** 섹션으로 내린다. 탭 신설 0,
  내비 변화 없음.

**C3 · 지역 분배(territory)**
`crm_region_assignments`(시도 → 담당자 · 유효기간) 신설. 지도에서 시도를 클릭해 담당자를 배정한다.
- `lead-assignment-policy`의 자동 후보를 처음으로 열어준다.
- 담당자 없는 시도(커버리지 공백)와 편중을 지도 위에 표시한다.

**핀 지도는 범위 밖.** 장소별 위경도가 DB에 없고 지도 API 키도 없다. 필요해지면 지오코딩
파이프라인과 키 발급을 선행 과제로 별도 판단한다.

### 3.5 C 구현 결과 (2026-08-28)

**C1** — `lib/regions/korea-regions.ts`에 로마자 시군구 표(`SIGUNGU_ROMAN_GROUPS`)를 추가해
한글 표와 같은 항목을 덮었다. 영문 행정 접미사(`District`·`-gu`·`-si`·`-gun`)를 벗기고,
영/용을 둘 다 `Young`으로 적는 표기 이형도 대체 키로 시도한다. 모호 토큰은 로마자로 써도
막는다(`Jung-gu` → null). **실측 수율 78.6% → 91.3%**(94/103), 회귀는
`tests/regions/korea-regions.test.ts`에 실제 유입값 66종으로 고정.

**C2** — `/admin/crm/customers/map`을 "지도" 탭으로 승격했다(라벨 정본은
`components/admin/crm-route-labels.ts`). 화면은 세 층이다: 시도 choropleth →
지역 분배 → 원천 검수. 지도는 레이어 4장(거래·타깃·리드·고객)이고 **레이어마다
`located / unknown / coverage`를 항상 함께** 표기한다 — 커버리지 50% 미만이면
"분포가 아니라 표본입니다" 경고가 붙는다. 집계 규칙은
`lib/crm/region-map-summary.ts`(순수 함수)로 분리해 테스트로 고정했다:
`located`(시도로 접힘) / `nonGeo`(온라인·해외 — 정당한 값) / `unknown`(미상) 세 갈래를
섞지 않는다. 라벨 오프셋 표는 KR Team 히트맵에서 `lib/branch/korea-province-map.ts`로
승격해 두 지도가 같은 표를 본다.

실화면 실측: 거래 331/385(86%) · 타깃 199/199(100%) · **리드 94/231(40.7%)** ·
고객 117/883(13.3%). 리드 수치가 35% → 40.7%로 오른 것이 C1의 효과다.

**C3** — `crm_region_assignments`(시도 1 : 담당자 1, 부분 유니크 인덱스로 활성 배정 단일화).
교체는 파괴적이지 않다 — 이전 행의 `effective_to`를 닫고 새 행을 넣는다. 저장소는
마이그레이션 미적용을 예외가 아니라 `available=false`로 내려보내 화면이
"아무도 안 맡음"과 "표가 아직 없음"을 구분한다.

화면은 시도별로 `리드 / 거래 / 담당자`를 한 줄에 둔다 — **리드가 있는데 담당이 없는 줄**이
이 화면의 결론이다. 현재 실측: 배정 0/17, **담당 없는 지역 리드 94건**.

---

## 4. 실행 순서

1. ~~**A** — 엔트리별 보존창 + CRM 스코프 `localStorage` 승격 + 테스트~~ **완료**
2. ~~**B** — CRM 홈 RSC 프리페치 + 클라이언트 분리 + 캐시 시드 + 서버 메모 TTL 정렬~~ **완료**
3. ~~**C1** — 로마자 시군구 표 + 영문 접미사·표기 이형~~ **완료** (수율 78.6% → 91.3%)
4. ~~**C2** — 지도 탭 승격 + 시도 choropleth 4레이어~~ **완료**
5. ~~**C3** — 지역 분배 표·저장소·API·UI~~ **코드 완료** · **마이그레이션 프로덕션 적용만 남음**

## 5. 검증 결과 (실측, 2026-08-28)

게이트: `tsc --noEmit` 0 · `eslint` 0 · `vitest run` 3,499/3,499 · `npm run build` 성공
(+ `check:public-content` 통과). `/admin/crm`은 이제 `ƒ`(동적)으로 빌드된다.

신규 테스트 16건: `tests/admin/admin-client-cache-persistence.test.ts`(11) ·
`tests/admin/crm-home-prefetch.test.ts`(5).

### 실화면 (dev 3888, 어드민 컨텍스트)

| 시나리오 | 결과 |
|---|---|
| CRM 홈 → 다른 탭 → CRM 홈 복귀 | **스켈레톤 0개**. 배경 갱신 3건만(priority-queue·coverage·tasks), 나머지 5개는 캐시 적중 |
| **새 탭**에서 CRM 홈 열기 | **스켈레톤 0개**. `localStorage` 엔트리 8개 · `sessionStorage` 0개 |
| 캐시 보존창 실측 | CRM 엔트리 `keepUntil` = 저장 후 10분(요청한 창 그대로) |
| 웜 프리페치 HTML | TTFB **0.04~0.06초** · 총 0.38초 · 첫 화면 3섹션 값 채워짐 |
| 콜드 메모 프리페치 HTML | TTFB 0.13초 · 총 1.31초 — 예산(1.2초)에 걸려 overview만 클라이언트 폴백 |

### C 화면 실측 (dev, 어드민 컨텍스트)

| 확인 | 결과 |
|---|---|
| 지도 4레이어 커버리지 | 거래 86% · 타깃 100% · 리드 40.7% · 고객 13.3% |
| 지도 종횡비 | 420×393(viewBox 1.07 일치) — 그리드 `items-start`로 늘어남 제거 |
| 지역 분배 폴백 | 배정 0/17 · "담당 없는 지역 리드 94건" · 마이그 안내 배너 · select 17개 비활성 |

### 서버 집계 비용 (dev 실측)

`/api/admin/crm/overview` — **웜 0.06초 vs 콜드 11.55초**.
콜드일 때 병렬 10개 소스의 개별 소요(한 회차 계측):

| 소스 | ms | 홈 첫 화면에 필요한가 |
|---|---:|---|
| duplicatePreflight | 2,719 | ✗ 검수 전용 |
| neoCrm | 1,866 | ✓ 콕핏 NEO 타일 |
| **business** | **1,860** | ✓ 매출·일정·자주 접촉 |
| schemaContract | 1,168 | ✗ 검수 전용 |
| externalSnapshots | 1,033 | ✗ 검수 전용 |
| syncSchema | 876 | ✗ 검수 전용 |
| sourceLinkCounts | 506 | ✗ 검수 전용 |
| writeSchema | 453 | ✗ 검수 전용 |
| writeQueueCounts | 236 | ✗ 검수 전용 |
| syncPreflight | 2 | ✗ |

**다음 레버(미착수):** 홈 첫 화면은 `business` + `neoCrm` 둘만 쓴다. overview를 스코프로
쪼개면 콜드 경로가 10개 중 최대값(11.5초)에서 2개 중 최대값(~1.9초)으로 떨어져 1.2초 예산에
들어올 여지가 생긴다. 다만 `overview.status`가 검수 체크 결과에서 파생되므로 부분 객체를
그대로 내려보낼 수 없다 — 별도 스코프 타입이 필요하다. 이번 범위 밖으로 남긴다.

## 6. 남은 운영 작업

- ~~`supabase/migrations/20260828_crm_region_assignments.sql` 프로덕션 적용~~ **완료(2026-08-29)**.
  테이블·인덱스 3(활성 부분 유니크 포함)·RLS·정책 확인. 배정 → 교체 → 해제 3경로를 실화면에서
  왕복 검증했고 활성 배정은 0으로 되돌렸다. 검증 흔적으로 제주 이력 2행이 남아 있다
  (`created_by="Dev"`, 둘 다 `effective_to` 닫힘 — 활성 상태에 영향 없음).
- **실제 지역 배정은 팀이 정할 몫이다.** 현재 배정 0/17 · 담당 없는 지역 리드 101건.
- 배정이 채워지면 `lib/crm/lead-assignment-policy.ts`의 `automaticEvidenceReady`가 이 표를
  근거로 삼도록 연결한다(현재는 여전히 구조적 0).

## 7. 근거 프로브 (읽기 전용, 재실행 가능)

`tmp/`는 git 추적 대상이 아니다 — 아래는 로컬 재현용 스크립트다.

- `tmp/db-probe-region-map-20260828.mjs` — 테이블 형태·건수
- `tmp/db-probe-region-dist-20260828.mjs` — 지역·담당자 분포
- `tmp/db-probe-neo-region-payload-20260828.mjs` — NEO payload에 지역 필드 부재 확인
- `tmp/db-probe-neo-phone-region2-20260828.mjs` — 전화 지역번호 파생 천장(19.2%)
- `tmp/db-probe-lead-status-region-20260828.mjs` — 리드 상태 × 지역 교차
