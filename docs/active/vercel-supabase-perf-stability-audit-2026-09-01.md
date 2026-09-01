# Vercel · Supabase 속도/안정성 감사 (2026-09-01)

범위: 공개 사이트 렌더링·캐싱, Supabase 데이터 접근, Vercel 런타임 구성, 장애 내성, 클라이언트 번들/자산. 5개 축을 병렬 감사하고 교차 검증했다.

관련 선행 문서: [어드민 속도·퀄리티 감사](./admin-perf-quality-audit-2026-07-23.md) — 어드민 화면 계층(Wave 1~3)은 그 문서에서 이미 처리됐다. 이 문서는 그 바깥, 즉 **공개 사이트 · 인프라 설정 · 데이터 계층 · 외부 의존성**을 다룬다.

---

## 0. 한 줄 결론

느린 원인은 기능 수도, 코드 구조도 아니다. **인프라 설정 3개(리전·미들웨어·캐시 헤더), 미디어 자산 341MB, 인덱스 누락 11종**이 대부분이다. 그리고 안정성 쪽에는 **Supabase 클라이언트에 타임아웃이 없다**는 단일 장애점이 있다.

그중에서도 가장 큰 단일 항목은 **함수가 미국 동부(iad1)에서 실행되는데 Supabase는 싱가포르(ap-southeast-1)에 있다**는 것이다. DB 왕복 1회에 약 230ms가 붙고, 어드민 경로는 이 왕복이 3회 직렬로 쌓인다. 수정은 `vercel.json` 한 줄이다 — 다만 답은 서울이 아니라 **싱가포르**다(§1.5).

가장 큰 체감 이득 6건이 전부 **한 줄~네 줄 수정**이다(Phase 0).

---

## 1. 가설 평가

작업 착수 전에 두 가설을 측정으로 검증했다. 결론은 **둘 다 지금은 아니오**이며, 근거와 조건부 예외를 아래에 남긴다.

### 가설 A — "필요 없는 기능이나 DB를 과감히 떼어내야 하나?"

**측정:**

| 항목 | 수치 |
|---|---|
| `lib/` 전체 | 106,373줄 |
| 그중 어디서도 import되지 않는 모듈 | 4개 / 약 1,121줄 (**1.05%**) |
| 마이그레이션에 정의된 테이블 | 148개 |
| 그중 코드가 한 번도 참조하지 않는 테이블 | 16개 |

**판정: 성능 레버로서는 아니다.**

쿼리되지 않는 테이블은 Postgres CPU를 0만큼 쓴다. 참조되지 않는 모듈은 번들에 들어가지 않는다. 즉 미사용 자산 16개 테이블과 1,121줄을 전부 지워도 **어떤 요청도 1ms 빨라지지 않는다.** 실제 병목은 이 감사에서 나온 인덱스 누락, `select('*')`, N+1, 리전 미설정, 미디어 자산이며, 이 중 어느 것도 기능 삭제로 해결되지 않는다.

**다만 가설의 진짜 알맹이는 따로 있다 — "많아서 느리다"가 아니라 "많아서 고장난 걸 모른다".**

이 감사에서 그 증거가 실제로 나왔다:

- `lib/repositories/lead-magnets.ts:319-322` — 운영 환경에서 **쓰기 경로가 100% 예외**를 던진다(`lib/server/runtime-persistence.ts:3-11`이 `VERCEL=1`이면 무조건 throw). 어드민의 리드마그넷 생성/수정/삭제는 **기능 자체가 상시 불능**이며, 아무도 인지하지 못한 상태다.
- `lib/server/lead-capture.ts:565-574` — 인프라 장애가 400으로 반환되어 5xx 지표에 잡히지 않는다. 리드가 조용히 유실된다.
- 관측성 SDK가 **0건**(Sentry·OTel·@vercel/analytics 전무). 유일한 채널이 `console.error`다.

**따라서 권고:** 삭제는 성능 과제가 아니라 **위생 과제**로 분류한다. 우선순위는 낮되, 하려면 아래 순서가 비용 대비 효과가 크다.

1. **먼저 관측성을 붙인다.** 무엇이 실제로 안 쓰이는지는 코드 grep이 아니라 트래픽이 답한다. (Phase 4)
2. `public/` 미참조 자산 54MB 제거 — 이건 삭제가 **즉시 이득**인 유일한 항목이다(배포 아티팩트 축소).
3. 미사용 테이블 16개, 미참조 모듈 4개 — 정리하되 성능 기대는 하지 않는다.

### 가설 B — "홈페이지랑 어드민을 분리해야 하나? (다른 DB / 프로젝트로?)"

**측정 — 분리 가능성(결합도)은 이미 낮다:**

| 항목 | 수치 |
|---|---|
| 공개 `app/**` → `@/components/admin` import | **0건** |
| 공개 `app/**` → `@/lib/admin*` import | 2건 (cron·portal 전용, 공개 페이지 0건) |
| 최근 6개월 144커밋 중 admin+공개 동시 변경 | **2건 (1.4%)** |
| 공개 사이트가 쓰는 테이블 | 21개 |
| 전체 참조 테이블 | 140개 |

코드 결합도, 변경 결합도 모두 낮다. **기술적으로는 지금도 분리할 수 있다.** 문제는 "분리하면 빨라지는가"인데,

**판정: 속도 목적이라면 아니오.** 근거:

- **Vercel 런타임에서 이득이 없다.** Next.js는 라우트 단위로 코드 스플리팅하고 Vercel은 라우트별 서버리스 함수로 배포한다. 어드민 라우트 205개는 공개 페이지 요청 시 **로드되지도, 실행되지도 않는다.** 번들 오염도 실측으로 확인했다 — `components/admin/viz/index.ts:2-3`이 Recharts 재export를 의도적으로 제외했고, 공개 페이지의 admin 배럴 참조는 0건이다. 즉 프로젝트를 쪼개도 공개 사이트 TTFB는 그대로다.
- **빌드/배포는 개선되지만, 더 싼 대안이 있다.** 매 배포마다 107페이지 + `public/` 341MB가 함께 올라간다. 하지만 그 341MB 중 54MB는 미참조 자산이고, 135MB는 최적화 없이 서빙되는 문서 이미지다. **자산 정리가 프로젝트 분리보다 싸고 효과가 크다.**

**진짜 결합은 DB 한 곳에 있다 — 그리고 이건 실재한다.**

공개 사이트와 어드민은 같은 Supabase 프로젝트, 같은 Postgres를 쓴다. 그런데 어드민 쿼리가 무겁다:

- `lib/repositories/leads.ts:262,337` — leads 전량 `select('*')`, 상한 100,000행
- `lib/repositories/lead-activity.ts:232-241` — `client_events` 등 3개 테이블에 1,000행씩 최대 20회 **순차** 페이징(최악 60왕복)
- `lib/repositories/leads.ts:796-833` — KPI 타일용 head-count 11회, 즉 leads 테이블 11회 스캔
- `lib/admin-crm-overview.ts:620-666` — `ORDER BY updated_at DESC LIMIT 5000`을 인덱스 없이 6개 테이블에 동시 실행

이 CPU는 공개 챗봇(`/api/chatbot/query`)과 리드 폼(`/api/lead`)이 쓰는 것과 **같은 Postgres CPU**다. 즉 **어드민 사용자가 CRM 개요를 여는 것만으로 공개 사이트가 느려질 수 있다.** 가설 B의 직관은 여기서는 정확하다.

**그러나 DB 분리는 이 문제의 오답이다.** 두 쪽이 같은 데이터를 공유하기 때문이다 — 리드는 공개에서 쓰고 어드민에서 읽으며, 블로그·문서·행사는 어드민에서 쓰고 공개에서 읽는다. DB를 쪼개면 양방향 복제가 필요해지고, 이는 지금 없는 장애 유형(복제 지연, 정합성 깨짐, 이중 쓰기)을 새로 만든다.

**같은 목표를 훨씬 싸게 달성하는 순서:**

1. **인덱스 11종 추가 + 컬럼 스코프화** (Phase 2). 어드민 쿼리의 CPU를 원천에서 없앤다. 마이그레이션 1개 + 파일 몇 개.
2. **어드민 전용 DB 역할에 `statement_timeout` 부여.** 한 줄 SQL로, 어드민의 폭주 쿼리가 DB를 무한 점유하지 못하게 격리한다. 프로젝트 분리의 격리 효과 대부분을 여기서 얻는다.
   ```sql
   alter role <admin_service_role> set statement_timeout = '10s';
   ```
3. 그래도 부족하면 **읽기 복제본(read replica)을 어드민 집계 전용으로.** Supabase가 지원하며, 데이터는 하나로 유지된다. 이것이 "분리"의 올바른 형태다.

**분리를 재검토할 조건:** 위 3단계를 다 하고도 어드민 부하가 공개 지표를 흔든다면, 그때는 **DB가 아니라 배포 단위**를 나눈다(어드민을 별도 Vercel 프로젝트로, DB는 공유 + 읽기 복제본). 지금 단계에서 착수할 근거는 측정상 없다.

---

## 1.5 리전 배치 — 함수는 사용자 옆이 아니라 DB 옆에 둔다

Supabase가 **ap-southeast-1(싱가포르)** 으로 확인되면서, 이 항목이 감사 전체에서 단일 최대 지연 요인이 됐다. 그리고 직관과 반대되는 결론이 나온다.

### 현재 상태

`vercel.json`에 `regions`가 없어 함수가 기본 리전 **iad1(미국 동부)** 에서 실행된다. 즉 한국 사용자의 요청이 이렇게 돈다.

```
한국 사용자 ──180ms──▶ Vercel 함수(미국 동부) ──230ms/왕복──▶ Supabase(싱가포르)
```

DB가 지구 반대편에 있다. **왕복 1회당 약 230ms**다.

### 왜 서울(icn1)이 답이 아닌가

핵심은 **사용자↔함수 지연은 요청당 1회지만, 함수↔DB 지연은 쿼리 왕복 횟수만큼 곱해진다**는 점이다. 그리고 이 저장소의 어드민 경로는 왕복이 직렬로 쌓인다 — `proxy.ts:135-155`가 `auth.getUser()` + `admin_profiles` 조회로 2왕복, 그 뒤 라우트 핸들러가 `lib/admin-auth.ts:375`에서 `getUser()`를 다시 호출해 1왕복 더, 총 3왕복이다.

세 선택지의 지연 하한(왕복 횟수별):

| 배치 | 사용자↔함수 | 함수↔DB(1회) | **DB 1왕복 총합** | **DB 3왕복 총합** |
|---|---|---|---|---|
| 현재 — iad1 | ~180ms | ~230ms | ~410ms | **~870ms** |
| icn1 (서울) | ~10ms | ~75ms | ~85ms | ~235ms |
| **sin1 (싱가포르)** | ~75ms | ~2ms | **~77ms** | **~81ms** |

(RTT는 통상적인 공개 관측 범위 기준의 근사치다. 정확한 값은 배포 후 실측해야 한다.)

**`sin1`이 어느 경우에도 나쁘지 않고, 왕복이 늘수록 격차가 벌어진다.** 왕복 1회짜리 가벼운 라우트에서는 icn1과 사실상 동률이지만, 왕복이 쌓이는 어드민·CRM 경로에서는 3배 가까이 앞선다.

### 사용자를 미국에서 싱가포르로 옮기는 것이 공개 사이트를 느리게 하지 않는가

하지 않는다. 공개 페이지 대부분은 정적/ISR이고(§0 선행 문서 기준 `app/blog`, `app/about`, `app/events`, `app/resources`, `app/updates` 등이 `revalidate` 보유), **정적·ISR 응답은 함수 리전이 아니라 사용자에게 가장 가까운 Vercel CDN 엣지에서 서빙된다.** 한국 사용자는 이미 서울 엣지에서 받고 있고, `regions` 설정은 이를 바꾸지 않는다. 리전이 결정하는 것은 **동적 함수 실행 위치**뿐이며, 그 함수들은 예외 없이 Supabase를 친다.

### 권고

1. **지금: `vercel.json`에 `regions: ["sin1"]`.** 한 줄이고, Phase 0 다음으로 큰 이득이다.
   ```json
   { "regions": ["sin1"], "crons": [ ... 기존 그대로 ... ] }
   ```
2. **이후: Phase 1-2(proxy matcher 축소)의 가치가 함께 올라간다.** 중복 `getUser()` 왕복 1회가 현재 ~230ms짜리이기 때문이다. 리전을 옮기면 그 왕복은 ~2ms가 되지만, 왕복 자체를 없애는 것이 여전히 옳다.
3. **장기 이상형: Supabase를 서울로 옮기고 Vercel도 `icn1`.** 사용자 ~10ms + DB ~2ms로 모든 항목에서 최적이 된다. 다만 Supabase 프로젝트 리전 변경은 마이그레이션 작업이므로 별도 결정 사항으로 남긴다. **이 감사에서 그 이전에 할 일이 충분히 많다.**

### 가설 B와의 관계

§1 가설 B에서 "공개/어드민 분리는 속도 목적으로 근거가 없다"고 결론지었는데, 이 항목이 그 판단을 보강한다. 공개 사이트가 느렸던 실제 이유는 어드민과 한 프로젝트에 있어서가 아니라 **함수가 DB에서 지구 반 바퀴 떨어져 있었기 때문**이다. 그리고 그 수정은 프로젝트 분리가 아니라 `vercel.json` 한 줄이다.

---

## 2. 실행 계획

### Phase 0 — 즉시 (총 약 10줄, 위험 거의 0)

체감 이득이 가장 크면서 가장 싼 6건. 이것만으로 사용자 전송량이 수십 MB 줄고 최악의 장애 유형이 막힌다.

| # | 파일 | 수정 | 효과 |
|---|---|---|---|
| 0-1 | `app/docs/_utils.tsx:302` | `unoptimized` prop 제거 | 문서 이미지 **-90~97%**. 현재 9MB PNG를 760px 표시에 원본 그대로 전송 중. `next.config.ts:98`이 이미 로컬 최적화를 열어놨는데 이 한 줄이 끄고 있다 |
| 0-2 | `next.config.ts` `headers()` | `{ source: "/l/:path*", headers: publicAssetCacheHeaders }` 추가 | `/l/kids` 재방문 **-18MB**. 현재 `/l/*`만 캐시 헤더 대상에서 빠져 있다 |
| 0-3 | `lib/supabase/admin.ts:14-19` | `global.fetch`에 `AbortSignal.timeout(5_000)` 주입 | **전 서비스 공통 단일 장애점 제거.** 현재 supabase-js에 타임아웃이 전혀 없어, Supabase가 느려지기만 해도 모든 함수가 매달리다 502/504가 되고 Vercel 동시 실행 슬롯을 점유해 정상 요청까지 큐잉된다 |
| 0-4 | `lib/billing/toss.ts:49-57` | `signal: AbortSignal.timeout(8_000)` | **유일하게 금전 손실이 확정되는 경로.** 승인은 처리됐는데 응답이 느려 함수가 죽으면 주문이 `pending`으로 남고, 재시도는 `ALREADY_PROCESSED_PAYMENT` 500으로 영구 복구 불가 |
| 0-5 | `app/api/events/route.ts:2,6` | `listPublicEvents` → `listCachedPublicEvents` + `s-maxage=300` | 같은 모듈(`lib/repositories/public-events.ts:305`)에 캐시본이 **이미 있는데** 이 라우트만 원본을 부른다. `/contact` 방문마다 Supabase 왕복 |
| 0-6 | `app/api/og/blog/[slug]/route.tsx` | `export const revalidate = 86400` | 캐시 지시자 0건. 카카오톡·슬랙 크롤러가 칠 때마다 Supabase 조회 + PNG 재렌더 |

### Phase 1 — 인프라 설정

| # | 항목 | 근거 | 효과 |
|---|---|---|---|
| 1-1 | **`vercel.json`에 `regions: ["sin1"]`** | 현재 `crons`만 있고 `regions` 없음, `preferredRegion` 앱 전역 0건 → 기본 리전(iad1, 미국 동부) 실행. Supabase는 **ap-southeast-1(싱가포르)** 확정 | 이 감사 **단일 최대 항목**. 근거는 §1.5 |
| 1-2 | `proxy.ts:200-204` matcher 축소 | 현재 공개 페이지 전체 + `/api/**` 205개가 미들웨어를 통과. `lib/supabase/middleware.ts:41` `getUser()` 1왕복 + 라우트의 `lib/admin-auth.ts:375` `getUser()` 재호출 = 중복 | 공개 TTFB **-5~30ms**(웜)/**-100~300ms**(콜드). admin API 중복 auth 왕복 제거. **주의:** 축소 시 API만 호출하는 장기 세션의 토큰 갱신 경로를 함께 검증할 것 |
| 1-3 | 크론 9개에 `runtime`·`maxDuration` 명시 + **배치 분할** | 현재 `maxDuration` 선언은 저장소 전체 4곳뿐(전부 `= 60`), 크론은 0개. **Hobby 확정**이므로 `maxDuration=300`은 선택지가 아니다 | 절단으로 인한 동기화 유실 감소. `lib/external-crm/xiaoshouyi-sync.ts:363`이 이미 env로 페이지 상한을 읽으므로 배치 축소가 가능하다 |
| 1-4 | `lib/branch/insights/gemini-runner.ts:38-42`에 타임아웃 | 저장소 다른 Gemini 호출은 전부 타임아웃이 있는데(`lib/chatbot/llm.ts:42` 2500ms) 여기만 무제한 | hang으로 인한 크론 무한 절단 제거 |
| 1-5 | `app/api/cron/sync-branch-insights/route.ts:17-22` 병렬화 | 4개 팀 스코프를 순차 루프로 실행, 각각 Gemini 호출 | 벽시계 **~4배 단축** |
| 1-6 | `lib/google.ts:34-40` lazy 로딩 | `googleapis` 배럴 + 클라이언트 4개를 모듈 로드 시점에 생성. `lib/calendar-data.ts:19,35,36`이 3중으로 끌어와, 캘린더를 안 쓰는 라우트도 전부 파싱 | 콜드스타트 **-300~800ms** |

### Phase 2 — 데이터 계층

| # | 항목 | 근거 |
|---|---|---|
| 2-1 | **인덱스 마이그레이션 11종** (코드 변경 0) | `partner_accounts`/`customers`/`quotes`/`contracts`/`receipts`의 `updated_at desc`, `activity_logs.created_at desc`, `payments_v2.paid_at desc` — 전부 인덱스 없이 `LIMIT 5000` 정렬 중(`lib/admin-crm-overview.ts:620-666`). leads의 `phone`·`lower(email)`·`(created_at desc, id desc)`·`(status, created_at desc)` — 리드 등록 중복검사(`lib/repositories/leads.ts:484,487`)가 건당 leads 2회 풀스캔 |
| 2-2 | `getLeads()` 호출부 컬럼 스코프화 | `app/api/admin/events/signup-counts/route.ts:15`는 `lead.notes` 한 컬럼, `lib/repositories/event-attendance.ts:59`는 `id`·`status` 두 컬럼을 쓰려고 전량 `select('*')`를 긁는다 |
| 2-3 | 검색 인덱스 ↔ 쿼리 형태 불일치 해소 | `20260629_crm_neo_customer_snapshots.sql:57-63`의 tsvector GIN 인덱스는 선행 와일드카드 ILIKE(`lib/repositories/crm-neo-customer-snapshots.ts:905`)에 **절대 쓰이지 않는다.** `pg_trgm`은 이미 설치돼 있으므로(`20260421_docs_center.sql:7`) 컬럼별 trigram 인덱스 추가가 코드 변경 0으로 즉효 |
| 2-4 | `count:'exact'` → `'planned'`, KPI는 RPC 통합 | 목록 7곳이 필터 스캔 2회. leads KPI 11회 head-count는 단일 RPC로(선례: `20260618_crm_status_counts_rpc.sql`) |
| 2-5 | `/docs` 3개 라우트 캐싱 + 정적화 | `searchParams` await(`app/docs/page.tsx:39-41`) 때문에 100% SSR이고, `generateStaticParams`(`[category]/page.tsx:29`)가 무효화됨. `lib/docs-content.ts:216-224`는 목록인데 `content_markdown`+`content_json` 본문 전체를 조회. `cache()`는 요청 스코프라 요청 간 재사용 0 → `unstable_cache` + 태그 무효화(`_revalidate.ts:10-14`에 한 줄) |
| 2-6 | `lib/repositories/crm-source-links.ts:445,1873` 배치화 | 루프 안에서 건당 3~6 왕복 N+1 |

### Phase 3 — 자산 · 번들

| # | 항목 | 근거 |
|---|---|---|
| 3-1 | 히어로 비디오 재인코딩 | `public/video/home-hero.mp4` **34.0MB**, `쿼드러닝 수업_클립1.mp4` **14.9MB**. `preload="none"`은 `autoPlay`가 붙으면 무력화된다. `/product/sw`는 `loadStrategy="immediate"`라 LCP 구간과 직접 경합 → 재인코딩(1080p·CRF30·오디오 제거·faststart)으로 **-45MB** |
| 3-2 | 미참조 자산 54MB 제거 | `public/images/product/hw/` 30MB — 페이지는 `.webp`만 참조하는데 PNG 원본이 남아 있다. **단, `images/blog/imported/**`는 본문이 Supabase에 있어 grep으로 판정 불가 — 삭제 전 DB 대조 필수** |
| 3-3 | `next/font/local` 전환 | `next/font` 참조 **0건**. Pretendard를 jsDelivr에서 렌더 블로킹 로드 중이고 `size-adjust` 보정이 없다. 홈 LCP는 히어로 `<h1>` **텍스트**라 직격 → LCP **-150~400ms**, 히어로 CLS 해소 |
| 3-4 | `components/auth/SessionNavEntry.tsx:19-31` 서버 렌더 | 전 공개 페이지 헤더에서 `HTML→JS→hydration→fetch` 4단 워터폴 + 링크가 없던 자리에 삽입되어 CLS |
| 3-5 | framer-motion 정적 import 4개 제거 | `app/page.tsx:5-8`의 4개 섹션이 정적 import라 애니메이션 엔진이 홈 초기 JS에 상주. `Hero.tsx`가 이미 CSS(`hero-soft-enter`)로 같은 효과를 내는 선례가 있다 → **-40~55KB gz(추정)** |
| 3-6 | `app/layout.tsx:69-77` gtag 중복 정리 | `components/GoogleAdsScript.tsx`와 이중 선언. id dedupe로 중복 실행은 없으나 layout이 선점해 `send_page_view:false`가 무시되고, `PageViewTracker.tsx:23`이 수동 page_view를 또 보내 **GA4 페이지뷰 2배 계측** |

### Phase 4 — 안정성 · 관측성

| # | 항목 | 근거 |
|---|---|---|
| 4-1 | `lib/server/lead-capture.ts:565-574` catch-all 400 제거 | 인프라 장애까지 400이 되어 클라이언트는 재시도하지 않고 5xx 지표에도 안 잡힌다. **장애가 관측되지 않은 채 리드가 유실된다.** 검증 오류 전용 에러 클래스로 분리(선례: `ChatbotInputError`) |
| 4-2 | 리드마그넷 저장소 Supabase 이관 | `lib/repositories/lead-magnets.ts:319-322` — 운영 쓰기 경로가 **상시 500**. `lib/calendar-data.ts:8-10` 주석이 같은 사고를 기록해 뒀는데 리드마그넷만 미이관 |
| 4-3 | 챗봇 대화 로그 `after()` 배선 | `lib/chatbot/service.ts:3693,3876,3920`이 `void persistExchange(...)` — 응답 후 인스턴스 동결 시 **대화 로그 전체가 유실**된다. 리드 캡처의 `deferTask` 패턴을 주입 |
| 4-4 | 챗봇 라우트 예산 정합 | `app/api/chatbot/query/route.ts:7`의 13초 예산에 `maxDuration` 선언이 없어 플랫폼 기본값에 암묵 의존. 또 `service.ts:3637`의 `historyPromise`가 어떤 예산에도 안 감싸여 있어 0-3 이전에는 무한 대기 가능 |
| 4-5 | 발송 멱등성 | `lib/messaging/send.ts:268-276` — 문자 발송 성공 후 로그 insert 실패가 "전체 실패"로 뒤집혀 재발송 시 **2통 발송·2배 과금**. `lib/email.ts:315-326` — Gmail 타임아웃을 실패로 집계해 Resend로 전량 재발송 |
| 4-6 | 외부 호출 타임아웃 일괄 부여 | Notion(`lib/notion-marketing-calendar.ts:112-121`, `for(;;)` 커서 루프), showroom ICS(`lib/showroom-ics-calendar.ts:270`), googleapis(`lib/google.ts:36-40`), Meta Graph(`lib/meta/marketing.ts:314`), 小售易 쓰기(`lib/external-crm/xiaoshouyi-write.ts:188,438,872`). `lib/calendar-data.ts:475-483`은 이들을 `Promise.all`로 묶어, 한 소스가 매달리면 어드민 캘린더 전체가 504 |
| 4-7 | `req.json()` 미보호 6곳 | `admin/bugs:18`, `admin/patch-notes:15`, `admin/settings:42`, `admin/settings/test-webhook:36`, `admin/calendar:68`, `admin/calendar/[id]:14`. **공개 라우트는 전부 정상** — CLAUDE.md 규칙은 공개 경로에서 지켜지고 있다 |
| 4-8 | 관측성 도입 | 에러 모니터링 SDK **0건**. `app/error.tsx:14-16`·`app/global-error.tsx:12-14`가 `error.digest`를 노출하지 않아 사용자 신고를 서버 로그와 대조할 수 없다. 인시던트 알림(`emitNotificationEvent`)은 잘 갖춰져 있으나 리드 경로에만 연결돼 있다 |
| 4-9 | 인메모리 상태 이관 | `lib/server/rate-limit.ts:14` Map에 만료 정리·상한 없음(단조 증가 → OOM). `lib/server/lead-capture.ts:43-49` 중복 방지가 인스턴스별이라 다른 인스턴스 재제출은 무방비이고, 함수 타임아웃 시 `pending`이 고아로 남아 사용자가 최대 60초간 "접수 중입니다" 409를 받는다 |

---

## 3. 확정된 전제와 남은 확인 항목

### 3.1 확정 (2026-09-01 확인)

| 항목 | 값 | 영향 |
|---|---|---|
| Supabase 프로젝트 리전 | **ap-southeast-1 (싱가포르)** | Phase 1-1의 답이 `icn1`이 아니라 **`sin1`**으로 바뀐다. §1.5 참조 |
| Vercel 플랜 | **Hobby** | Phase 1-3에서 `maxDuration=300` 불가. 크론을 배치로 쪼개야 한다. 아래 3.2-a는 이 때문에 새로 생긴 최우선 확인 항목 |

### 3.2 남은 확인 항목

**a. Hobby 플랜의 cron job 개수 제한 — 최우선.**

`vercel.json`에는 크론이 **9개** 등록되어 있다. Vercel Hobby는 cron job 개수에 제한이 있으므로, **등록된 9개 중 일부가 애초에 실행되지 않고 있을 가능성**이 있다. 그렇다면 이 감사의 크론 관련 항목(1-3~1-5) 이전에 훨씬 근본적인 문제가 있는 것이다 — 주간/월간 다이제스트, 외부 CRM 동기화, 지점 동기화가 **한 번도 돌지 않았을 수 있다.**

`scripts/check-vercel-crons.mjs`는 `MAX_DAILY_RUNS_PER_CRON = 1`로 **빈도만** 검증하고 **개수는 검증하지 않는다.** 따라서 이 게이트는 통과하면서도 크론이 실행되지 않을 수 있다.

확인 방법: Vercel 대시보드 → 프로젝트 → Settings → Cron Jobs에서 실제 등록·실행 이력을 본다. 제한에 걸린다면 선택지는 (1) 필수 크론만 남기고 나머지를 하나의 디스패처 라우트로 통합, (2) 외부 스케줄러로 이관, (3) Pro 전환이다. 통합이 가장 싸다 — `AGENTS.md`의 "sub-daily 실행이 필요하면 vercel.json에 직접 추가하지 말고 외부 스케줄러·큐·Pro 전환을 먼저 확정한다" 규칙과도 맞는다.

확인 후에는 `scripts/check-vercel-crons.mjs`에 개수 상한 검증을 추가해 같은 실수가 반복되지 않게 한다.

**b. Hobby의 함수 실행 시간 상한.**

`app/api/admin/blog/ai/route.ts:8`, `app/api/admin/marketing/ai/route.ts:6`, `app/api/admin/hardware/import-ledger/route.ts:20`, `app/api/admin/cs-chat/regression-eval/route.ts:11` 네 곳이 `maxDuration = 60`을 선언하고 있다. 이 값이 Hobby에서 실제로 허용되는지 확인해야 한다. 허용되지 않으면 네 라우트 모두 선언이 무시되고 기본값에서 잘린다.

같은 확인이 **챗봇 예산에도 직결**된다. `app/api/chatbot/query/route.ts:7`의 라우트 예산은 13초인데 `maxDuration` 선언이 없다. Hobby 기본 상한이 13초보다 작으면, `lib/chatbot/service.ts`가 정교하게 만들어 둔 deterministic fallback이 **나가기 전에 504가 된다.** 즉 CLAUDE.md의 챗봇 규칙("느린 RAG/LLM 호출이 있어도 500으로 끊기지 않아야 한다")이 코드상으로는 지켜지는데 플랫폼 설정 때문에 무너지는 상태일 수 있다. 상한을 확인한 뒤 `CHATBOT_ROUTE_TIMEOUT_MS` 기본값을 그보다 확실히 작게(예: 8초) 낮추는 것이 안전하다.

**c. `images/blog/imported/**` 삭제 가부.** 본문이 Supabase `blog_posts`에 있어 코드 grep으로 판정 불가(3-2 항목).

---

## 4. 검증

기본 품질 게이트(`AGENTS.md`)를 순서대로 유지한다.

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

영역별 추가:

- `vercel.json` 수정 시 — `npm run check:vercel-crons` (prebuild에서도 자동 실행)
- 리드 저장/전달 변경 시 — `npx vitest run tests/api/lead-capture.test.ts`, `npx vitest run tests/repositories/leads-mode.test.ts`
- 챗봇 DB/RPC 계약 변경 시 — `npm run check:alpha-db`
- 번들 수치 확정 — `@next/bundle-analyzer`로 `/`, `/product/sw`, `/product/hw`, `/docs/[category]/[slug]` 4개 라우트를 before/after 비교. 이 문서의 KB 추정치는 정적 분석 기반이며 실측이 아니다.

---

## 5. 회귀 방지 — 잘 되어 있어 건드리면 안 되는 것

- `next.config.ts:48-50` — CSP nonce를 포기하고 `'unsafe-inline'`을 유지한 것은 **의도적 트레이드오프**다. nonce로 옮기면 모든 공개 페이지가 동적 렌더로 강등되어 ISR/SSG를 잃는다. 보안 개선 시 반드시 재확인.
- `lib/supabase/middleware.ts:11-17` — `sb-*` 쿠키 부재 시 조기 반환. 익명 트래픽에서 auth 왕복을 아예 없앤다.
- `lib/repositories/public-events.ts:305-333` + `app/api/admin/events/_revalidate.ts` — 태그 캐시와 무효화 훅이 짝을 이루는 모범 사례. 다른 공개 콘텐츠도 이 패턴을 복제하면 된다.
- `app/blog/rss.xml/route.ts:57-61` — 조회 실패 시 `no-store`로 전환해 "장애가 빈 피드로 1시간 고정"되는 것을 막는다.
- `lib/server/software-checkout.ts:544-572` — 조건부 UPDATE로 원자적 상태 전이를 제대로 구현했다.
- `lib/chatbot/service.ts` 시간 예산·폴백 체계 — CLAUDE.md의 챗봇 규칙이 코드상 지켜지고 있다. `withTimeoutFallback`(`:369-393`)은 다른 경로에서도 재사용할 만한 프리미티브다.
- `app/page.tsx:26-35`, `components/AppChrome.tsx:17-51`, `components/admin/viz/index.ts:2-3` — 코드 스플리팅과 배럴 오염 차단이 이미 잘 되어 있다.
