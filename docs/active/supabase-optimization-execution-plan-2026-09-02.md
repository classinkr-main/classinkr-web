<!--
문서 성격: 실행 설계서(구현 명세·검증·롤백·순서). 코드 변경 없음.
작성: 2026-09-02 · 감사(supabase-shared-db-bottleneck-audit-2026-09-01.md)의 후속. 명세 조사 서브에이전트 5팀(리드 보드 필드 추적 / 하드웨어 응답 형태 / Overview·channel-talk·traffic / 인증 왕복 / 서버 메모 레이어) + 작성자 직접 교차검증
대상: classinkr-main/classinkr-web @ 60b5ec6, classinkr-main/crm @ eb39a3a
선행 정본: admin-perf-quality-audit-2026-07-23.md(Wave 1~3 적용 완료, Wave 4-A 미착수), playbook/README.md(파트 소유권), playbook/06-platform-data.md(마이그레이션 규약)
-->

# 공용 Supabase 최적화 실행 설계 (2026-09-02)

감사 문서가 "무엇이 느린가"였다면 이 문서는 "정확히 무엇을 어떻게 바꾸고, 어떻게 증명하고, 잘못되면 어떻게 되돌리는가"다. 각 트랙은 독립 PR 단위이고, 소유 파트는 [플레이북](./playbook/README.md) 소유권 표를 따른다.

근거 등급은 감사 문서와 동일하게 **[검증]**(작성자가 코드로 확인) / **[보고]**(에이전트 보고, 재검증 미수행) / **[미확인]**(대시보드 확인 필요)을 쓴다.

---

## 0. 감사 이후 바뀐 판단 — 먼저 읽을 것

명세 조사 과정에서 감사 결론 세 개가 수정됐다. 이 문서는 수정된 결론 위에 서 있다.

| 감사 결론 | 수정 | 근거 |
|---|---|---|
| `/api/admin/leads`에 `scope=board` 투영을 추가하면 payload가 크게 준다 | **무효.** 보드는 `LeadRecord` 31개 중 **30개를 실제로 읽는다**(검색이 `message`·`notes`·`utm_*`, 드로어가 `landing_page`·`referrer`, CSV 내보내기가 전부). 투영은 `anonymous_id` 하나만 뺀다. `route.ts:23` 주석이 이미 이 이유로 `*`를 유지한다고 명시. **[보고]** | 진짜 문제는 (a) 워밍과 보드가 **같은 테이블을 2번 받는** 캐시 불일치, (b) 전 행을 받아 JS에서 검색하는 구조. → T2 |
| `/api/admin/hardware`는 요청마다 DB 전량 스캔 | **부분 무효.** `unstable_cache(120s)` + 태그 무효화가 이미 있어 DB 스캔은 2분 1회. **[보고]** 낭비는 브라우저 payload — `raw` jsonb(시트 임포트 원본 행)가 2,000행 전부에 실리는데 클라이언트는 `raw.crmLink` 하나만 읽는다. | → T5-A |
| Vercel Hobby는 cron 2개 한도라 9개는 모순 | **무효.** 2026-01부터 모든 플랜 100개. 진짜 문제는 Hobby의 **시간(hour) 단위 정밀도** — `sync-branch` 08:00과 `sync-branch-insights` 08:30이 같은 시대라 순서가 보장되지 않는다. | → T11 |

그리고 새로 확인된 사실 하나: **저장소에 관측 수단이 0건이다.** `Server-Timing`·`performance.now()`·`console.time` 어느 것도 `app/`·`lib/`에 없다. **[검증]** 개선을 증명할 방법이 없으므로 T1(계측)이 모든 트랙에 선행한다.

---

## 1. 목표와 측정 (Definition of Done)

### 1.1 지표

| # | 지표 | 측정 위치 | 베이스라인 | 목표 |
|---|---|---|---|---|
| M1 | 어드민 API p50/p95 응답시간 (라우트별) | `Server-Timing` 헤더 → Vercel 로그 / 브라우저 DevTools | T1 후 1주 수집 | 상위 5개 라우트 p95 50% 감소 |
| M2 | 요청당 Supabase 왕복 수 (인증 + 데이터) | `Server-Timing`의 `db;dur`·`auth;dur` 항목 수 | 어드민 XHR 콜드 3 / 웜 1 (인증만) **[보고]** | XHR 인증 0, 페이지 콜드 1 |
| M3 | Supabase egress (일/월) | Supabase Dashboard → Usage → Egress **[미확인]** | 현재값 캡처 필수 | 30% 감소 (T2·T5가 주도) |
| M4 | 어드민 탭 진입 payload 바이트 | DevTools Network, 탭별 첫 로드 합계 | leads·hardware·overview 3개 캡처 | leads 50%, hardware 60%, overview 80% 감소 |
| M5 | DB CPU / 커넥션 수 | Supabase Dashboard → Reports **[미확인]** | 현재값 캡처 | 피크 CPU 70% 미만 유지, crm 커넥션 ≤15 |
| M6 | 크론 정합성 | `sync-branch-insights` 실행 시각 > `sync-branch` 완료 시각 | 현재 순서 보장 없음 | 100% 순서 보장 |

### 1.2 베이스라인 캡처 절차 (T0·T1 완료 직후 1회, 이후 매 트랙 배포 후 반복)

1. Supabase Dashboard → Query Performance → "Most time consuming" 상위 20개 스크린샷 + CSV. **이게 이 문서의 정적 분석보다 정본이다.** 순위가 다르면 대시보드를 믿는다.
2. Supabase → Usage → Egress 일별 그래프 최근 30일.
3. 인증된 어드민 세션에서 `/admin/overview`, `/admin/crm/customers/leads`, `/admin/hardware` 각각 하드 리로드 → DevTools Network "Transferred" 합계와 `Server-Timing` 값 기록.
4. Vercel → Functions 로그에서 `/api/admin/*` duration p95 (Pro면 Observability 탭).
5. 위 4개를 `docs/active/perf-baselines/2026-MM-DD.md`에 기록. 이 문서엔 수치를 두지 않는다(플레이북 §5 시점성 정보 규칙).

---

## 2. 트랙 총괄

| ID | 트랙 | 소유 파트 | 규모 | 의존 | 기대효과 (지표) | 위험 |
|---|---|---|---|---|---|---|
| **T0** | 대시보드 확인 5항목 | Platform | XS | — | 이후 모든 판단의 입력 | — |
| **T1** | 계측 삽입 (`Server-Timing`) | Admin Core | S | — | M1·M2 측정 가능 | Low |
| **T2** | 리드 보드 캐시 정합 (S) + 서버사이드 검색·페이징 (L) | Growth | S + L | T4(L 부분) | M3·M4 leads | Low / Med |
| **T3** | 인증 왕복 제거 | Platform + Admin Core | M | T0-④ | M2 | Med |
| **T4** | 서버 메모 레이어 + 태그 무효화 | Admin Core + Platform | M | T1 | M1·M5 | Med |
| **T5** | payload 슬림 3종 (hardware / overview / channel-talk) | Growth·Admin Core·Chatbot | S×3 | — | M3·M4 | Low |
| **T6** | traffic-summary RPC화 | Admin Core + Platform | S | — | M5 (10만 행 스캔 제거) | Low |
| **T7** | 페이징 헬퍼 count-once | Platform | S | — | M1 (neo 스냅샷 20회 COUNT 제거) | Low |
| **T8** | DB 보호장치 (롤 격리·타임아웃·인덱스·보존) | Platform | M | T0 | M5, 사고 방지 | Med |
| **T9** | crm 저장소 (인덱스·predicate·스키마 정본) | crm 소유자 | S + M | T0 | M5 (공용 CPU 간섭 제거) | Low / High(스키마) |
| **T10** | 파트너 포털 팬아웃 상한 | Platform | S | — | 포털 문서·캘린더 탭 | Low |
| **T11** | 크론 재배치 | Platform | XS | T0-① | M6 | Low |
| **T12** | 코드스플릿 (docs·recharts) | Content·Admin Core | S | — | 체감 작음, 하위 | Low |

규모: XS < 반나절, S 1일, M 2~3일, L 1주+. 검증 게이트는 전 트랙 공통 — `npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npm run build` → 해당 도메인 `vitest`.

---

## 3. 트랙별 명세

### T0. 대시보드 확인 (코드 변경 없음)

| # | 항목 | 확인 위치 | 결과가 바꾸는 것 |
|---|---|---|---|
| ① | Vercel 플랜 (classinkr-web / crm 각각) | Vercel → Settings → General | Hobby면 T11 "시(hour) 분리" 필수, Pro면 분 단위 그대로 |
| ② | Supabase 플랜·compute 크기 | Supabase → Settings → Billing / Compute | Free면 백업 부재 → 플랜 전환이 성능보다 먼저 |
| ③ | 리전 3개 (Vercel web / Vercel crm=`sin1` / Supabase) | 각 프로젝트 Settings | 불일치 시 **리전 정렬이 이 문서 전체보다 효과가 크다.** Supabase 리전 이전은 불가하므로 Vercel 쪽을 옮긴다 |
| ④ | JWT 서명 키 방식 (HS256 vs ECC/RSA) | Supabase → Auth → JWT Signing Keys | HS256이면 T3의 `getClaims()`가 `getUser()`로 조용히 폴백. 이전 후 T3 진행 |
| ⑤ | crm이 쓰는 pooler 포트 (6543 transaction / 5432 session) | Vercel crm → Env → `DATABASE_URL` | 5432면 6543으로 전환 (T9) |

---

### T1. 계측 삽입 — 모든 트랙의 전제

**변경 명세**
- 새 파일 `lib/server/server-timing.ts`: `withServerTiming(handler)` 래퍼. 요청 스코프 `AsyncLocalStorage`에 `{name, dur}[]`를 모으고 응답에 `Server-Timing: auth;dur=12, db;dur=340;desc="leads", total;dur=380` 헤더를 붙인다.
- `lib/supabase/admin.ts`의 `createSupabaseAdminClient()`가 반환하는 클라이언트에 `fetch` 옵션을 주입해 PostgREST 호출마다 `db` 엔트리를 기록 (supabase-js `global.fetch` 훅, 요청 URL의 테이블명을 `desc`로).
- `lib/admin-auth.ts`의 `verifyAdmin`/`requireVerifiedAdminContext`에 `auth` 엔트리.
- `lib/admin-api-response.ts`의 `adminCachedJson`이 헤더를 자동 부착 → 어드민 GET 전부에 적용.

**검증**: 임의 어드민 라우트를 curl → `Server-Timing` 헤더 존재. `tests/admin/server-timing.test.ts`로 래퍼가 엔트리 수를 정확히 세는지.
**롤백**: 환경변수 `ADMIN_SERVER_TIMING=0`으로 헤더 생략. 헤더 부착만 하므로 동작 영향 없음.
**기대효과**: M1·M2가 측정 가능해짐. 그 자체로 성능 개선은 아님.
**리스크**: `AsyncLocalStorage`는 Node 런타임 전용 — edge 런타임 라우트가 있으면 제외 (현재 `runtime="edge"` 라우트 0건 **[검증]**).

---

### T2. 리드 보드

#### T2-S. 캐시 정합 (S · Low) — 즉시

**현상 [보고]**: `CrmSubnav.tsx:47-49,67`이 hover 시 `/api/admin/leads`를 `ttlMs: 60_000`으로 워밍하는데, `LeadsBoardClient.tsx:1067-1072`가 `ttlMs: 0, persist: false, staleWhileRevalidateMs: 0`으로 **캐시를 무시하고 다시 받는다.** 탭 진입 1회에 전체 테이블 2회 다운로드. 워밍은 현재 순수 낭비.

**변경 명세**
```ts
// components/admin/crm/leads/LeadsBoardClient.tsx:1067
const data = await adminFetchJsonCached<{ leads: LeadRecord[] }>("/api/admin/leads", undefined, {
  ttlMs: 30_000,                 // 0 → 30s (워밍 60s와 정합)
  force: options?.force,         // 유지 — 새로고침 버튼은 여전히 강제
  persist: false,                // 유지 — 전체 테이블을 sessionStorage에 넣지 않는다
  staleWhileRevalidateMs: 60_000,
})
```
**무효화는 추가 코드 불필요 [보고]**: `lib/admin-client.ts:127-137`이 모든 non-GET `adminFetch` 성공 시 `resourceBaseFromUrl`로 `/api/admin/leads` 프리픽스를 자동 클리어하고, 보드의 모든 뮤테이션(`handleStatus :1179`, `handleNotes :1199`, `handleFollowUp :1209`, `handleAssignedTo :1220`, 로그 `:1230-1259`, 전환 `:1263`, 삭제 `:1444`)이 `adminFetch`를 거친다. 또 보드는 뮤테이션 후 `setLeads(...)`로 로컬 상태를 직접 갱신하므로 캐시는 재마운트 때만 읽힌다.

**검증**: `tests/crm/leads-board-cache.test.tsx` 신규 — 마운트 2회에 fetch 1회. 라이브: subnav hover → 탭 클릭 시 Network에 `/api/admin/leads` 요청 0건(캐시 히트).
**롤백**: 한 줄 되돌림.
**기대효과**: 탭 진입당 다운로드 2회 → 1회, 30초 내 재진입 0회. M3·M4 leads 절반.

#### T2-L. 서버사이드 검색·페이징 (L · Med) — T4 이후

**현상**: 보드가 전 행(`LEAD_MAX_ROWS = 100_000`)을 받아 `lib/crm/lead-ranking.ts:565-591`의 검색 haystack을 JS에서 만든다. 리드가 늘수록 선형으로 나빠지고, 투영으로는 못 푼다(§0).

**변경 명세**
1. 마이그레이션 `supabase/migrations/2026MMDD_leads_search_vector.sql`:
   ```sql
   alter table public.leads add column if not exists search_tsv tsvector
     generated always as (
       to_tsvector('simple',
         coalesce(name,'') || ' ' || coalesce(org,'') || ' ' || coalesce(email,'') || ' ' ||
         coalesce(phone,'') || ' ' || coalesce(message,'') || ' ' || coalesce(notes,'') || ' ' ||
         coalesce(utm_source,'') || ' ' || coalesce(utm_campaign,'') || ' ' || coalesce(source_detail,''))
     ) stored;
   create index if not exists leads_search_tsv_idx on public.leads using gin (search_tsv);
   create index if not exists leads_board_sort_idx on public.leads (created_at desc, id desc);
   ```
   `'simple'` 사전 사용 — 한국어 형태소 분석 없이 공백 토큰 매칭. 현재 JS 검색이 `includes()` 기반이라 동등 이상. 부분 문자열(`ilike '%x%'`) 폴백은 `pg_trgm` GIN을 별도 검토.
2. `lib/repositories/leads.ts`에 `searchLeads({ q, status, source, branch, assignedTo, cursor, limit=100 })` — 키셋 커서 `(created_at, id)`, `search_tsv @@ plainto_tsquery('simple', q)`.
3. `app/api/admin/leads/route.ts`에 `scope=board&q=&cursor=` 분기. 기존 무스코프 `*` 응답은 **유지**(다른 소비자 6곳 중 GET은 보드·워밍 2곳뿐 **[보고]**이므로 후속 제거 가능).
4. `LeadsBoardClient`: 검색 입력 → `useDeferredValue` 유지 + 서버 호출. 패싯 카운트(유입 칩)는 별도 `scope=facets` 집계 엔드포인트(`group by source, status`)로 분리 — 지금은 전 행에서 JS로 센다.

**검증**: `tests/crm/leads-search.test.ts` — tsquery 이스케이프, 커서 안정성, 빈 검색 시 최신순. 라이브: 리드 1만 건 시드 후 검색 응답 < 200ms.
**롤백**: `scope=board` 미사용으로 되돌리면 기존 경로 그대로. 마이그레이션은 additive(generated column + index)라 롤백 불필요.
**기대효과**: leads 탭 payload가 행수 비례 → 페이지 크기 고정(100행). 리드 1만 건 기준 ~95% 감소.
**리스크**: 검색 결과 차이(JS `includes` vs tsvector 토큰). 완화: 배포 전 2주간 `?shadow=1`로 양쪽 결과 diff 로깅.

---

### T3. 인증 왕복 제거 (M · Med)

**현상 [보고]** — 시퀀스 (a) `/admin/overview` 페이지: middleware `getUser()` → 어드민 게이트 `getUser()` + `admin_profiles` = 콜드 3회. (b) `/api/admin/leads` XHR: middleware `getUser()` + `requireVerifiedAdminContext`의 `getUser()` + `admin_profiles` = 콜드 3회, 웜 1회. **middleware의 1회는 순수 낭비** — `tests/api/admin-route-guards.test.ts`가 모든 `app/api/admin/**/route.ts`에 `verifyAdmin`/`requireVerifiedAdminContext` 호출을 강제하므로 라우트가 스스로 검증한다. (c) 쿠키 있는 공개 페이지: `getPublicUserContext()`가 `getUser()` + `user_profiles` UPSERT + `leads` 스티칭 2회 + `client_events` 백필 = **최대 7회**.

캐시 키가 **쿠키 값**(`proxy.ts:104-115`, `admin-auth.ts:318-328`)이라 토큰 회전 때마다 무효화된다.

**변경 명세** (Platform: `proxy.ts`, `lib/supabase/*`, `lib/auth/*` / Admin Core: `lib/admin-auth.ts`)

A. **`/api/*`는 middleware를 건너뛴다** — `proxy.ts:186` 직전:
```ts
if (pathname.startsWith("/api/")) return NextResponse.next({ request })
```
안전 근거: `admin-auth.ts:363-370`이 `req.cookies`로 자체 클라이언트를 만들어 검증한다. `app/api/admin/**`에서 `createSupabaseServerClient` import 0건 **[보고]**. `proxy-dev-bypass.test.ts`가 기존 줄 순서를 문자열 매칭하므로 **기존 줄은 그대로 두고 위에 삽입**.

B. **middleware의 `getUser()` → `getSession()`** (`lib/supabase/middleware.ts:41`). 쿠키 회전은 `_callRefreshToken → applyServerStorage` 경로라 `getSession`도 동일하게 트리거 **[보고]**. `session.user`는 절대 읽지 않는다(서버 측 `insecureUserWarningProxy` 경고 회피).

C. **어드민 게이트를 `getClaims()` + `sub` 키 캐시로** — 새 `lib/supabase/verify-claims.ts`:
```ts
export async function verifyAdminClaims(supabase) {
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data) return null
  return { sub: data.claims.sub as string, exp: data.claims.exp as number }
}
```
`proxy.ts:150-154`와 `admin-auth.ts:372-376`의 `getUser()`를 이걸로 교체. `admin_profiles` 조회는 유지하되 캐시 키를 `sub`로, 만료를 `min(now+60s, exp)`로. 프로젝트가 ECC/RSA 키면 JWKS 10분 캐시 후 **네트워크 0**; HS256이면 `getUser()` 폴백이라 이득 없음 → **T0-④ 선행**.

D. **공개 사용자 경로** (`lib/auth/public-user.ts:44-108`): `getPublicUserClaims()`(경량, `/api/auth/session`·`premium/authorize`·`seminars/view`용)를 분리. `upsertPublicUserProfile`의 UPSERT + 스티칭을 프로세스 `Map<userId,{emailVerified,at}>` 5분 TTL로 게이팅 — 첫 관찰 또는 `emailVerified` 변경 시만 실행. `app/api/materials/[slug]/download/route.ts:59,116`의 이중 호출을 `resolveDownloadActor()`로 호이스팅.

**검증**: `tests/auth/verify-claims.test.ts` — HS256 토큰 시 폴백 경로, 만료 토큰 거부, `sub` 캐시 히트. 기존 `admin-route-guards`·`proxy-dev-bypass`·`account-marketing-consent` 테스트 통과(시그니처 유지). 라이브: T1 `Server-Timing`에서 XHR `auth;dur` 0 확인.
**롤백**: A는 한 줄 제거. C는 `verifyAdminClaims` 내부에서 `ADMIN_LOCAL_JWT=0`이면 `getUser()` 호출로 분기.
**기대효과**: 어드민 XHR 인증 왕복 콜드 3 → **0~1**, 페이지 콜드 3 → 1. `/admin/overview` 13회 팬아웃 기준 요청당 GoTrue 13회 → 0회. M2 달성.
**리스크와 완화**:
- 로컬 JWT 검증은 `exp`(기본 1h)까지 유효 → 관리자 정지 반영 지연. 완화: 콜드 경로의 `admin_profiles.status` 검사 유지 + 정지 시 GoTrue admin `signOut(user,'global')` 호출로 다음 refresh 실패 유도.
- `admin-auth.ts:368` `setAll() {}` → 라우트 내 refresh 결과가 쿠키에 안 씌어짐. 완화: 브라우저 클라이언트가 회전 소유, 다음 페이지 내비에서 middleware가 회전. 기존과 동일 동작.

---

### T4. 서버 메모 레이어 + 태그 무효화 (M · Med)

**현상 [보고]**: `unstable_cache` 사이트 15곳 + 모듈 TTL 캐시 12곳이 **각자 다른 TTL·키·무효화**를 갖고, 무거운 GET 중 `/leads`·`/email`·`/blog`·`/patch-notes`·`/notifications?countOnly=1`은 서버 메모가 **없다**. `adminCachedJson`은 `private, max-age=30` 헤더뿐이라 사용자·콜드 브라우저 간 공유가 없다. 모듈 캐시 3곳(`crm-overview` 30s, `customers-neo` 60s, `crm-unified` 60s)은 람다 인스턴스별이라 무효화 불가 — `invalidateCrmUnifiedSourceSnapshot()`은 존재하나 **호출자 0**.

**API 선택**: `'use cache'`/`cacheTag`는 `cacheComponents: true`가 필요하고(`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`), 이는 앱 전체 프리렌더 의미를 바꾼다. `next.config.ts:131`에 해당 설정 없음. → **`unstable_cache`로 표준화**하되 헬퍼 한 파일로 감싸 이후 교체를 한 곳으로 국한.

**변경 명세** — 새 `lib/server/admin-memo.ts`:
```ts
import { revalidateTag, unstable_cache } from "next/cache"

export type AdminTag =
  | "leads" | "crm:deals" | "crm:neo" | "crm:overview" | "hardware"
  | "content:blog" | "content:docs" | "content:patch-notes" | "email" | "traffic"
  | `notifications:${string}`

export const MEMO_TTL = { hot: 30, aggregate: 60, snapshot: 300 } as const
const enabled = process.env.ADMIN_SERVER_MEMO !== "0"

export function memoAdminRead<A extends unknown[], R>(
  key: string,
  fn: (...args: A) => Promise<R>,
  opts: { ttl: keyof typeof MEMO_TTL | number; tags: AdminTag[] },
) {
  if (!enabled) return fn
  const revalidate = typeof opts.ttl === "number" ? opts.ttl : MEMO_TTL[opts.ttl]
  return unstable_cache(fn, ["admin-memo", key], { revalidate, tags: opts.tags })
}

export function invalidateAdminTags(...tags: AdminTag[]) {
  for (const t of new Set(tags)) revalidateTag(t, "max")
}
```
규칙: 캐시된 fn 안에서 `headers()`/`cookies()` 금지(인증은 밖에서), `ok` 결과만 캐시(`customers-neo.ts:142` 선례), `generatedAt`은 캐시 밖에서 재스탬프(`admin-crm-revenue.ts:1556` 선례). 기존 태그 문자열(`admin-crm-revenue`, `hardware-inventory`, `marketing-campaigns`)은 **그대로 유지** — 테스트 9개가 참조.

**태그 ↔ 쓰기 매트릭스**

| 태그 | 읽기 | TTL | 무효화 지점 (쓰기) |
|---|---|---|---|
| `leads` | `/leads`(스코프는 키에), `leads/activity-summary`, `crm/action-kpis` | hot 30 | **repo 레벨** `leads.ts` `saveLead:512`/`updateLead:614`/`deleteLead:687`에 넣는다 — 라우트 10곳 대신 3곳. 공개 `api/lead`·웹훅·챗봇·캡처 apply 전부 이 repo를 거침 |
| `crm:neo` | `customers-neo`, unified 스냅샷, `crm/neo` 리포트 | snapshot 300 | `cron/sync-external-crm:38`(revenue 태그 옆), `crm/external-sync` POST, `crm-neo-customer-snapshots.ts` upsert. **`invalidateCrmUnifiedSourceSnapshot` 미배선 해소** |
| `crm:overview` | `crm/overview`(모듈 캐시 대체) | hot 30 | contracts/receipts/teams/leads 쓰기(클라이언트 `CRM_SOURCE_BASES` 미러), `sync-external-crm`, `sync-branch` |
| `content:blog` / `content:docs` / `content:patch-notes` | 리스트 GET | aggregate 60 | blog POST/PUT/DELETE(`revalidatePublicBlogSurfaces` 옆), `docs/articles/_revalidate.ts:11`, patch-notes 쓰기 |
| `email` | `/email`, `marketing/stats` → `getCachedAllCampaigns`(`marketing.ts:341`, **이미 존재하나 `/email` 라우트가 안 씀**) | aggregate 60 | `marketing.ts:369,391` 이미 배선 |
| `notifications:<uid>` | `countOnly=1`, 리스트 | hot 30 | `notifications` PATCH/DELETE(자기 uid). 이미터(`lib/notifications/emit-event.ts`)는 수신자별 무효화; 역할 대상 이벤트는 `notifications:role:<ROLE>` 태그를 각 사용자 읽기에 함께 부착 |

**전환 순서**: ① `/leads` ② `/notifications?countOnly=1`(모든 페이지 로드) ③ `/crm/overview`(모듈 캐시 제거) ④ `/customers-neo` + unified(미배선 훅 해소) ⑤ `/email`→`getCachedAllCampaigns`, 이후 blog/docs/patch-notes.

**검증**: `tests/admin/admin-memo.test.ts` — `ADMIN_SERVER_MEMO=0`이면 fn 그대로 반환, 태그 무효화 후 재계산. 기존 9개 테스트의 `unstable_cache` mock(`(fn)=>fn`) 그대로 통과.
**롤백**: `ADMIN_SERVER_MEMO=0` 환경변수 — 헬퍼가 fn을 그대로 반환, `next/cache` 미호출.
**기대효과**: 사용자·인스턴스 간 계산 공유. 선행 감사의 unified 사례(콜드 732ms → 웜 12~35ms)가 다른 5개 라우트에 재현될 것으로 기대. M1·M5.
**한계 (정직하게)**: Vercel에서만 Data Cache가 태그 전파를 공유한다(`deploying-to-platforms.md:51,72`). `next start`/Docker는 인스턴스별. `revalidateTag(…, "max")`는 SWR이라 쓰기 직후 첫 요청이 stale일 수 있음 — 클라이언트가 뮤테이션 후 60초 `no-cache`(`admin-client.ts:104`)로 우회하므로 실사용엔 영향 없음.

---

### T5. payload 슬림 3종

#### T5-A. `/api/admin/hardware` (Growth/HW · S · Low)

**현상 [보고]**: `getHardwareDashboardUncached`(`hardware-inventory.ts:1342-1522`)는 all-time 위치/로트 잔고 계산에 **전체 원장이 필요**하므로 전량 읽기 자체는 정당. 낭비는 (a) `select("*")`로 미사용 6컬럼(`source_table, source_key, import_run_id, created_by, voided_by, void_reason`), (b) `raw` jsonb 전체가 응답에 실림 — 클라이언트는 `raw.crmLink`만 읽음(`HardwareInventoryClient.tsx:349-350`), (c) `recentOutbound`·`plannedMovements`가 `movements`의 순수 부분집합인데 JSON에 중복 직렬화(`:1468-1473`), (d) `items`의 `sku, active, created_at, updated_at` 클라이언트 미사용.

**변경 명세**
1. `listAllHardwareMovements`(`:345`)의 select를 명시 컬럼으로 — `getInboundUnitPriceBasis`(`:1553-1567`) 선례 그대로. `raw`는 서버 `recoverMoneyFromRaw`용으로 **읽되**, 응답 직전 `raw: { crmLink }`로 축소.
2. 응답에서 `recentOutbound`·`plannedMovements` 제거. 클라이언트에서 파생:
   ```ts
   const recentOutbound = movements.filter(m => m.movement_type === "outbound").slice(0, 30)
   const plannedMovements = movements.filter(m => m.movement_type === "outbound" && m.planned).slice(0, 30)
   ```
   `isPlannedStatus` 정규식(`/예정|예약|대기|planned/i`)을 클라이언트로 옮기지 말고 서버가 `planned: boolean` 플래그를 각 movement에 부착.
3. `items` 직렬화에서 4개 필드 제외(서버 `active` 필터 `:1363`는 유지).
4. 인덱스 — 표시 리스트 2,000행 정렬이 인덱스 미지원 **[보고]**:
   ```sql
   create index if not exists hardware_movements_active_date_idx
     on public.hardware_movements (occurred_at desc nulls last, created_at desc)
     where voided_at is null;
   ```

**검증**: `tests/admin/hardware-list-pagination.test.ts` 기존 + 응답 스냅샷 테스트에 `raw` 키가 `crmLink`만 갖는지. 라이브: Network "Transferred" 전후.
**롤백**: 응답 필드 추가는 additive라 클라이언트 파생 코드 남겨도 무해. 인덱스는 `drop index`.
**기대효과**: hardware 탭 payload **60%+ 감소**(raw 제거가 주도 — 시트 원본 행이 가장 큰 필드). M4.

#### T5-B. `/admin/overview` 3종 (Admin Core · S · Low)

| 소비 | 지금 받는 것 | 실제 쓰는 것 | 변경 |
|---|---|---|---|
| `page.tsx:273` `/api/admin/email` | 캠페인 200건 `select("*")` — `body`(HTML 메일 전체) 포함 | `id, subject, status, recipientCount, targetTags, sentAt, createdAt` (`insights.ts:223-237, 401-406`) | `marketing.ts` `getAllCampaigns(limit, offset, scope: "full"\|"summary")`; summary는 `id,subject,status,recipient_count,target_tags,sent_at,created_at`. 라우트 `?scope=summary`. `marketing-campaigns/link-candidates:35`·`marketing/stats:29`도 `body` 안 읽으므로 동일 스코프 적용 가능 |
| `page.tsx:289` `/api/admin/patch-notes` | 전체 `select("*")` + `changes` jsonb, limit 없음 | `[0]`의 `id, version, title, date, status` | `patch-notes.ts` `getAllPatchNotes(limit?)` — limit 시 `select("id,version,title,date,status").limit(n)`. 라우트 `?limit=1`. `app/admin/dev/page.tsx:738`은 전체 유지 |
| `page.tsx:272` `/api/admin/blog` | 전 포스트 24컬럼 | `.length` + `status` 카운트 + CTA 커버리지 + 최근 4건 | `blog.ts` `getOverviewBlogSummary()` — count 쿼리(`countPublishedPosts` 패턴) + `select("id,title,status,category,author_name,updated_at,published_at").limit(4)`. 라우트 `?scope=overview` → `{count, publishedCount, publishedWithoutCta, recent[4]}` |

**주의 [보고]**: `page.tsx:1128`의 StatCard "발행된 포스트"가 실제로는 **전체 포스트 수**(status 무관)를 표시한다. `publishedBlogPosts.length`(`insights.ts:202-221`)가 따로 있는데 안 쓴다. 이 변경에서 조용히 "고치지" 말고 의도를 확인한 뒤 결정 — 카운트 의미가 바뀌면 운영 지표가 흔들린다.

**검증**: `tests/admin/overview/*` 기존 + 스코프 응답 스냅샷. 라이브: overview Network 합계.
**롤백**: 스코프 파라미터 미전달이면 기존 응답. 완전 additive.
**기대효과**: overview payload **80%+ 감소**(HTML 메일 본문 200건 제거가 주도). M4.

#### T5-C. channel-talk `transcript` (Chatbot/CS · XS · Low)

**현상 [보고]**: `app/api/admin/channel-talk/route.ts:29-35`가 `const { transcript, ...rest } = record`로 응답 직전에 지우는데, `listDurableConversations`(`channel-conversations.ts:369-381`)는 `transcript`를 무조건 select한다. **DB egress는 이미 지불.** 두 번째 호출자 `channel-talk/mine/route.ts:35`는 `transcript`가 필요(`channel-talk-mining.ts:64`, `channel-talk-root-causes.ts:199`).

**변경 명세**: `listDurableConversations(limit = 500, { withTranscript = true } = {})` — `false`면 select 컬럼 목록에서 `transcript` 제거. 리스트 라우트만 `{ withTranscript: false }`. `getDurableConversationsByIds`(`:322-333`)의 `select("*")`는 호출자 2곳(`cases/route.ts:69`, `channel-talk-sync.ts:295`, 최대 200건 상한) 모두 `transcript` 필요 → **변경 대상 아님**.

**검증**: `tests/channel-talk/*` 기존. 라이브: T1 `db;dur` 전후.
**기대효과**: 리스트 로드당 500개 대화록 jsonb 전송 제거. M3.

---

### T6. traffic-summary RPC화 (Admin Core + Platform · S · Low)

**현상 [보고]**: `app/api/admin/traffic-summary/route.ts:100-144`가 `client_events`에서 `event_name, page, params, anonymous_id, button, created_at`을 **10만 행 상한**으로 한 번 읽고 JS에서 3개 집계(`visitorStats`, `homepageFlow`, `eventCounts`)를 만든다. 그런데 `supabase/migrations/20260618_admin_dashboard_query_performance.sql:35-68`의 `admin_event_counts(since_ts)`와 `20260624_admin_daily_visitor_counts.sql`의 `admin_daily_visitor_counts(since_ts, timezone_name)`가 **이미 존재하고 출력 형태가 정확히 일치**하는데 이 라우트는 안 부른다(`lib/admin-visitor-stats.ts:214-220`만 씀). `homepageFlow`만 RPC가 없다.

**변경 명세**
1. 새 마이그레이션 `admin_homepage_flow_agg(since_ts timestamptz, timezone_name text) returns jsonb` — `event_name in ('page_view','download_materials','page_exit')` 한정, GROUP BY (a) 일자, (b) `coalesce(params->>'path', page)` → pageViews/visitors/avgDwell(`params->>'duration_ms'`)/exits, (c) `coalesce(params->>'asset_id', params->>'lead_magnet')` × `coalesce(params->>'source', page)` → downloads. 반환은 `HomepageFlowPayload` 형태(`lib/admin-homepage-flow.ts:125,137,213-217,237` 키 기준).
2. 라우트: 단일 스캔 → `Promise.all([admin_daily_visitor_counts, admin_homepage_flow_agg, admin_event_counts])`, 각각 자기 `since_ts`(KST 일자 vs 롤링). RPC 에러 시에만 기존 행 스캔 폴백. `unstable_cache(60s, tag "admin-traffic-summary")` 래퍼(`:151-154`)는 유지 → T4 태그 `traffic`으로 통합.
3. 인덱스 확인: `client_events(created_at)` + `(event_name, created_at)` — `20260502_security_and_performance_hardening.sql` 존재 여부 확인 후 없으면 추가.

**검증**: `tests/admin/traffic-summary.test.ts` — RPC 결과와 JS 폴백 결과 동일성(시드 데이터 1,000행). 라이브: Query Performance에서 `client_events` 스캔 시간 전후.
**롤백**: RPC 호출 실패 = 폴백이므로 자동. 마이그레이션은 함수 추가만.
**기대효과**: 콜드 미스당 10만 행 × `params` jsonb 전송 → 집계 행 수십 개. DB CPU·egress 모두. M5.

---

### T7. 페이징 헬퍼 count-once (Platform · S · Low)

**현상 [검증]**: `lib/supabase/pagination.ts:46-68`은 직렬 `while`이고 `count`는 첫 페이지에서만 채택(`:59`)하지만, **호출자가 `count:"exact"`를 매 페이지 `fetchPage`에 넘긴다.** `crm-neo-customer-snapshots.ts:281-288`(maxRows 20,000)은 최대 20회 직렬 왕복 × 매번 `external_crm_records` 전체 COUNT × 3종 병렬.

**변경 명세**
1. `fetchSupabasePages`의 `fetchPage` 시그니처에 `pageIndex`를 추가하고, 헬퍼가 `pageIndex > 0`이면 호출자에게 count 생략을 요구 — 또는 더 단순하게 헬퍼가 `fetchPage(from, to, { wantCount: pages === 0 })`를 넘기고 호출자 4곳(`crm-neo-customer-snapshots.ts:281`, `admin-crm-duplicate-preflight.ts:103`, `external-crm/owner-names.ts:36`, `admin-crm-neo.ts:213`)이 `wantCount ? "exact" : undefined`로 분기.
2. 첫 페이지 count로 총 페이지 수를 알면 나머지를 `Promise.all`로 병렬 — `leads.ts:262-329`의 `fetchAllLeadRows`가 **이미 이 패턴을 구현**(첫 페이지 후 잔여 range 병렬, under-delivery 시 직렬 폴백) **[보고]**. 그 로직을 헬퍼로 승격해 두 구현을 하나로.
3. `crm-neo-customer-snapshots.ts:891-898`의 3컬럼 `ORDER BY`(`risk_level, expire_at, source_synced_at`) + offset `.range()`: 인덱스 `crm_neo_customer_snapshots (risk_level, expire_at, source_synced_at)` 추가 + 키셋 커서로 전환.

**검증**: `tests/db/pagination.test.ts` — count 호출 횟수 = 1, 병렬 페이지 순서 보존, under-delivery 폴백. 기존 `fetchAllLeadRows` 테스트 통과.
**롤백**: 헬퍼 시그니처 additive(`wantCount` 옵션) — 무시하면 기존 동작.
**기대효과**: neo 스냅샷 새로고침 20회 직렬 COUNT → 1회 + 병렬. 선행 감사의 신원 미상 "Supabase 스캔 지연" 상당 부분. M1.

---

### T8. DB 보호장치 (Platform · M · Med)

전부 `supabase/migrations/2026MMDD_*.sql`로 idempotent하게. 플레이북 §2 마이그레이션 규약.

#### T8-A. 롤 격리 + 타임아웃

```sql
-- crm 앱 전용 role (현재 postgres/service role 공유 추정 — T0-⑤에서 확인)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'crm_app') then
    create role crm_app login password :'CRM_APP_PASSWORD';   -- 비밀번호는 마이그레이션 파일에 두지 않고 psql 변수로
  end if;
end $$;
grant usage on schema crm to crm_app;
grant select, insert, update, delete on all tables in schema crm to crm_app;
grant usage, select on all sequences in schema crm to crm_app;
alter default privileges in schema crm grant select, insert, update, delete on tables to crm_app;
alter default privileges in schema crm grant usage, select on sequences to crm_app;

alter role crm_app set statement_timeout = '15s';
alter role crm_app set idle_in_transaction_session_timeout = '30s';
alter role crm_app set search_path = 'crm';
alter role crm_app connection limit 15;
revoke all on schema public from crm_app;

-- classinkr-web 쪽 대칭: service role은 건드릴 수 없으므로 PostgREST 요청 단위 타임아웃
-- Dashboard → Settings → API → "Max rows" 및 DB 설정에서 authenticator role의 statement_timeout 확인
alter role authenticator set statement_timeout = '30s';   -- PostgREST가 쓰는 role. 크론의 장기 집계는 RPC 내부 set local로 개별 연장
```
**주의**: `authenticator`의 `statement_timeout`은 어드민 크론(`sync-branch-insights`의 전량 페이징 등)에 걸릴 수 있다. 적용 전 T1 `db;dur` 분포에서 30초 초과 쿼리 유무 확인. 초과가 있으면 그 쿼리를 먼저 RPC로 옮기고 `set local statement_timeout`으로 개별 연장.

#### T8-B. 인덱스 (감사 §2 + 이 문서 T5-A·T7 종합)

```sql
-- 파트너 포털 RLS 필터 컬럼 (감사: 5개 테이블 미인덱스, 실제 RLS 평가 경로)
create index if not exists installation_events_partner_idx on public.installation_events (partner_account_id);
create index if not exists payments_v2_partner_idx        on public.payments_v2 (partner_account_id);
create index if not exists receipts_v2_partner_idx        on public.receipts_v2 (partner_account_id);
create index if not exists activity_logs_partner_idx      on public.activity_logs (partner_account_id);
create index if not exists calendar_events_partner_idx    on public.calendar_events (partner_account_id);
create index if not exists quote_items_quote_idx          on public.quote_items (quote_id);
-- T5-A, T7
create index if not exists hardware_movements_active_date_idx on public.hardware_movements (occurred_at desc nulls last, created_at desc) where voided_at is null;
create index if not exists crm_neo_snapshots_sort_idx on public.crm_neo_customer_snapshots (risk_level, expire_at, source_synced_at);
```
`is_active_admin()` STABLE 마킹은 **성능 무관**(service role이 RLS 우회)이지만 정확성 차원에서 `alter function public.is_active_admin() stable;` 한 줄 추가 — RLS 전환 대비.

#### T8-C. 보존정책 — `client_events`부터

`pg_cron`은 Supabase 대시보드 Extensions에서 활성화 필요 **[미확인]**. 마이그레이션엔 없음 **[검증]**.
```sql
create extension if not exists pg_cron;
-- 90일 보존. 삭제 전 일별 집계는 admin_daily_visitor_counts 등 RPC가 이미 실시간 계산하므로 별도 롤업 불필요.
select cron.schedule('client_events_retention', '17 18 * * *',   -- 03:17 KST
  $$ delete from public.client_events where created_at < now() - interval '90 days' $$);
```
**적용 전 확인**: `lib/admin-visitor-stats.ts`·`traffic-summary`의 최대 조회 범위(`rangeDays`)가 90일 이하인지. 초과 옵션이 있으면 보존 기간을 그에 맞춘다. 보존 기간은 Growth가 결정(플레이북: 데이터 의미는 도메인 소유).
후속 대상: `chat_messages`, `chatbot_answer_events`, `docs_search_events`, `audit_logs`, `message_logs` — 각 도메인이 보존 기간 결정 후 동일 패턴.

**검증**: 스테이징 DB에 적용 → `explain analyze`로 인덱스 사용 확인 → 앱 스모크. `crm_app` 롤로 crm 앱 기동 → 모든 페이지 정상.
**롤백**: 각 항목 `drop index` / `alter role … reset` / `cron.unschedule`. 삭제된 이벤트는 복구 불가 → 보존정책은 **첫 실행 전 백업 확인** 필수.
**기대효과**: CPU 폭주 차단, 커넥션 상한, 파트너 포털 RLS 경로 seq scan 제거, 무한 성장 테이블 첫 벽 제거. M5.

---

### T9. crm 저장소 (crm 소유자 · S + M)

#### T9-A. 인덱스 + predicate 재작성 (S · Low)

**현상 [검증]**: `crm/app/(main)/dashboard/page.tsx:141,165,183,195,205,212`가 `to_char(coalesce(last_inflow_at, created_at) at time zone 'Asia/Seoul','YYYY-MM') = any($1)`로 월 필터. `to_char(timestamptz)`는 STABLE이라 **표현식 인덱스 불가** — 인덱스만으로는 못 푼다. `crm/app/(main)/leads/page.tsx:96`의 `l.meta_ad_id` 조인 키는 인덱스 없음.

**변경 명세**
```sql
-- crm/scripts/schema.sql 에 추가 (idempotent)
create index if not exists leads_inflow_ts_idx on crm.leads ((coalesce(last_inflow_at, created_at)));
create index if not exists leads_meta_ad_idx   on crm.leads (meta_ad_id) where meta_ad_id is not null;
create index if not exists ad_created_idx      on crm.activities (created_at);   -- :195 predicate용, 테이블명 확인
```
predicate: 앱이 선택 월 배열 `['2026-08','2026-09']`을 `[start, end)` timestamptz 쌍 배열로 변환해 넘긴다.
```sql
-- before
where ($1::text[] is null or to_char(coalesce(last_inflow_at, created_at) at time zone 'Asia/Seoul','YYYY-MM') = any($1))
-- after  ($1 = 시작 배열, $2 = 종료 배열, 둘 다 null이면 전체)
where ($1::timestamptz[] is null or exists (
  select 1 from unnest($1::timestamptz[], $2::timestamptz[]) r(s, e)
  where coalesce(l.last_inflow_at, l.created_at) >= r.s and coalesce(l.last_inflow_at, l.created_at) < r.e))
```
JS 헬퍼 `monthsToRanges(months: string[], tz = 'Asia/Seoul'): [Date[], Date[]]` 하나로 6곳 공통 적용. `to_char`가 **SELECT 절**(표시용, `:141,149,152,202,210,218`)에 남는 건 무관 — WHERE에서만 제거.

**검증**: `explain analyze`로 `Index Scan using leads_inflow_ts_idx` 확인. 대시보드 수치가 변경 전후 동일(월 경계 KST 처리가 핵심 — 테스트에 월말 23:59 KST 리드 포함).
**롤백**: 인덱스 drop, predicate는 git revert.
**기대효과**: crm 대시보드 로드당 `crm.leads` 순차 스캔 ~6회 → 인덱스 스캔. **공용 compute CPU 간섭의 실질 원인 제거.** M5.

#### T9-B. 커넥션 설정 (XS)

`crm/lib/db.ts` Pool 옵션에 `connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000, statement_timeout: 15_000` 추가(후자는 T8-A 롤 설정과 중복이나 클라이언트 측 방어). T0-⑤가 5432(session)면 6543(transaction)으로 전환 — 코드는 named prepared statement 미사용이라 호환 **[보고]**. 전환 후 `max: 3`은 5~10으로 상향 가능(롤 `connection limit 15` 안에서).

#### T9-C. 스키마 정본 복구 (M · **High**, 성능 무관 P0)

**현상 [보고]**: 앱이 쿼리하는 `crm.ad_campaign_monthly, meta_ad_monthly, meta_ads, meta_alias, page_visits` 5개가 `scripts/schema.sql`에 없다. classinkr-web 마이그레이션에도 `crm` 스키마 0건 **[검증]**. **운영 DB의 `crm` 스키마는 어느 저장소로도 재현 불가.**

**변경 명세**
1. `pg_dump --schema-only --schema=crm --no-owner --no-privileges $DATABASE_URL > crm/scripts/schema.dump.sql` (T8-A 이전에 실행 — 롤 변경 전 상태 보존).
2. 누락 5개 테이블의 `create table if not exists` + 인덱스 + 제약을 `scripts/schema.sql`에 병합. 나머지는 diff로 대조해 drift 목록화.
3. `scripts/migrate.mjs`를 Vercel build command에 연결하거나(`"build": "node scripts/migrate.mjs && next build"`), 최소한 README에 "배포 전 수동 실행 필수" + 마지막 적용 일자 기록.

**검증**: 빈 스키마에 `schema.sql` 적용 → crm 앱 전 페이지 기동. 이게 "재현 가능"의 정의.
**롤백**: 해당 없음(문서·DDL 추가만).

---

### T10. 파트너 포털 팬아웃 상한 (Platform · S · Low)

**현상 [검증]**: `lib/portal/repositories/partner-read.ts:443-447`(`loadPartnerCalendar`)과 `:503-507`(`loadPartnerDocuments`)이 **모든 deal**에 `loadPartnerDealDetail`(deal당 ~13쿼리). 같은 파일 `:345-368` `loadDetailsForOverview`는 `.slice(0, 8)`로 막혀 있음. `:373-374`의 `loadPartnerCustomers`·`loadPartnerDeals`는 독립인데 직렬 await.

**변경 명세**
1. `:373-374` → `const [{...customers}, {...deals}] = await Promise.all([loadPartnerCustomers(context), loadPartnerDeals(context)])`.
2. 캘린더·문서 탭: deal 상세를 전부 도는 대신 **전용 리스트 쿼리** — 캘린더는 `calendar_events where partner_account_id = $1 and starts_at >= now() - 30d order by starts_at limit 100`, 문서는 `quote_documents`/`contract_documents`/`receipts_v2`를 `partner_account_id`로 직접 조회(T8-B 인덱스가 전제). deal 상세 팬아웃 자체를 제거.
3. 과도기: 2번 전까지 `.slice(0, 20)` 상한 + 초과 시 "더 보기".

**검증**: `tests/portal/*` 기존 + deal 50건 파트너 시드로 쿼리 수 ≤ 5 확인(T1 `db` 엔트리 카운트).
**롤백**: slice 제거.
**기대효과**: deal 30건 파트너 문서 탭 ~390쿼리 → ≤5. 파트너 포털만 실제 RLS 평가 경로(감사 §L1)라 T8-B 인덱스와 곱해진다.

---

### T11. 크론 재배치 (Platform · XS · Low)

**현상 [검증]**: Hobby 가정 하에 같은 시(hour) 안의 두 크론은 순서·간격이 보장되지 않는다.

**변경 명세** — `vercel.json`, 각 크론을 **다른 시(hour)** 로:
```
channel-talk-sync      15 0 * * *   (유지)
sync-external-crm       0 1 * * *   (유지)
lead-response-alerts   10 2 * * *   ← 01:10 → 02:10  (external-crm과 시 분리)
sync-branch             0 8 * * *   (유지)
sync-branch-insights   30 9 * * *   ← 08:30 → 09:30  (branch sync 완료 후 최소 1시간)
```
Pro 확정 시(T0-①) 원래 시각으로 되돌려도 되지만, **의존 관계가 있는 크론은 Pro에서도 시 분리를 유지**하는 게 안전하다(sync가 30분 넘게 걸리는 날 대비). 더 확실한 방법: `sync-branch-insights`가 시작 시 `branch_sync_runs`의 최신 성공 시각이 오늘인지 확인하고 아니면 skip + 알림 — 크론 순서에 의존하지 않는 **자기 방어**. `lib/repositories/branch-sync.ts:47`에 조회 함수 이미 있음 **[보고]**.

**검증**: `npm run check:vercel-crons` 통과. 배포 후 Vercel 크론 로그에서 실행 시각 확인.
**기대효과**: M6. 잘못된 인사이트 생성 + Gemini 비용 낭비 제거.

---

### T12. 코드스플릿 (Content · S · Low) — 하위

체감·자원 영향 작음(gzip 후 전체 3.0MB, immutable 캐시). 다른 트랙 뒤에.
- `app/admin/docs/page.tsx:31-36`의 탭 패널 5개(`DocsCategoryManager`, `DocsGapsPanel`, `DocsQualityPanel`, `DocsRecommendedQuestionsManager`, `DocsRedirectManager`) → `next/dynamic()`. `HardwareInventoryClient`의 `dynamic()` 패턴 그대로.
- recharts 23청크 2.2MB(gzip 613KB): 차트 래퍼를 `components/admin/viz/LazyChart.tsx` 하나로 모아 청크 공유 유도. 측정 후 이득 없으면 중단.

---

## 4. 순서와 의존

```
주차 1  T0 ─┬─ T1(계측) ─── 베이스라인 캡처 ①
           ├─ T2-S, T5-A/B/C, T10, T11     (독립·소규모, 병렬 PR)
           └─ T9-C(스키마 덤프 — T8-A 이전 필수)
주차 2  T4(메모 레이어) ── T7(페이징) ── T6(RPC)
        T3(인증) ← T0-④ 확인 후
        T9-A/B ← T0-⑤ 확인 후
주차 3  T8(DB 보호장치) ← 스테이징 검증 후 운영
        베이스라인 캡처 ② → 지표 비교
주차 4+ T2-L(서버사이드 검색) ← T4 태그 인프라 위에
        T12
```

**리전 정렬(T0-③)은 주차에 안 넣는다** — 확인 즉시 실행. 코드 변경 0이고 효과가 가장 크다.

---

## 5. 기대효과 종합 (계획 수치 — 베이스라인 ② 후 실측으로 대체)

| 화면/경로 | 지금 | 후 | 주도 트랙 |
|---|---|---|---|
| 어드민 XHR 인증 왕복 | 콜드 3 / 웜 1 | 0~1 / 0 | T3 |
| `/admin/overview` 페이지 로드 | GoTrue 13회 + email 200건 HTML 본문 + 전 블로그 + 전 패치노트 | GoTrue 0 + 5필드 200건 + 요약 1건 + 최신 1건 | T3·T5-B |
| `/admin/crm/customers/leads` 진입 | 전 테이블 ×2 (hover + 마운트) | ×1, 30초 내 재진입 0 → (T2-L 후) 100행 | T2-S → T2-L |
| `/admin/hardware` 진입 | 2,000행 × 24필드 + raw 전체 + 부분집합 중복 | 2,000행 × 18필드 + `{crmLink}` | T5-A |
| `traffic-summary` 콜드 미스 | `client_events` 10만 행 + params jsonb 전송 | RPC 집계 행 수십 개 | T6 |
| neo 스냅샷 새로고침 | 20회 직렬 COUNT × 3 | 1회 COUNT + 병렬 | T7 |
| 파트너 문서 탭 (deal 30) | ~390 쿼리 | ≤5 | T10 |
| crm 대시보드 | `crm.leads` seq scan ×6 | index scan | T9-A |
| `sync-branch-insights` 정합성 | 순서 미보장 | 보장 + 자기 방어 | T11 |

---

## 6. 하지 않는 것 (Non-goals)

- **DB 물리 분리** — 감사 §4. 위 트랙 중 두 앱 간 경합에서 비롯된 항목이 0건. T8-A 롤 격리가 대체.
- **읽기 복제본** — 팬아웃 횟수를 못 줄임. T2-L·T10 후에도 CPU가 안 내려갈 때만.
- **PITR** — Pro 일 단위 백업으로 충분한 단계. 매출 장부를 회계 마감에 쓰는 시점에 재검토.
- **`'use cache'` 전환** — `cacheComponents` 앱 전체 영향. T4 헬퍼가 교체 지점을 한 곳으로 만들어 두므로 이후 별도 결정.
- **`is_active_admin()` RLS 최적화** — service role 우회로 런타임 미평가. STABLE 마킹 한 줄만(T8-B).
- **리드 보드 컬럼 투영** — §0. 무효.

---

## 7. 리스크 레지스터

| 리스크 | 트랙 | 확률 | 영향 | 완화 |
|---|---|---|---|---|
| Supabase가 HS256이라 `getClaims()` 이득 없음 | T3 | Med | T3-C 효과 0 (A·B는 유효) | T0-④ 선행. HS256이면 키 이전을 먼저 요청 |
| `authenticator` `statement_timeout`이 크론 장기 쿼리를 끊음 | T8-A | Med | 동기화 실패 | T1 분포 확인 후 적용, 초과 쿼리는 RPC + `set local` |
| 보존정책이 조회 범위보다 짧음 | T8-C | Low | 트래픽 리포트 공백 | `rangeDays` 최대값 확인, Growth 승인 후 |
| 서버사이드 검색 결과가 JS 검색과 다름 | T2-L | Med | 운영자 혼란 | 2주 shadow diff 로깅 |
| overview 블로그 카운트 의미 변경 | T5-B | Med | 운영 지표 흔들림 | 의도 확인 전 카운트 로직 불변 |
| 태그 무효화 누락으로 stale 데이터 | T4 | Med | 편집 직후 옛 값 | 클라이언트 60초 `no-cache` 우회 유지, 매트릭스 체크리스트로 PR 리뷰 |
| `crm_app` 권한 누락으로 crm 앱 장애 | T8-A | Med | crm 전면 장애 | 스테이징에서 전 페이지 스모크 후 운영, `DATABASE_URL` 롤백 1분 |
| 스키마 덤프 전 롤 변경으로 원본 소실 | T9-C/T8-A | Low | 재현 불가 영구화 | T9-C를 T8-A **이전**에 고정 |
