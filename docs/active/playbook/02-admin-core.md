# 파트 가이드 — 어드민 코어 (Admin Core / Ops)

> 담당 에이전트: `.claude/agents/admin-core.md`(이 가이드를 SSOT로 참조) · 기준 시점: 2026-06-23
> 변경 검증: `npx eslint app components lib --max-warnings=0` + `npm run build`

## 1. 파트 한 줄 정의

운영자/지사가 매일 여는 `/admin` 셸(레이아웃·사이드바·로그인)과 그 뒤의 `app/api/admin/*` 코어 — **3중 인증(dev bypass / 레거시 HMAC 쿠키 / Supabase) → `verifyAdmin()` 가드 → admin Supabase 클라이언트 → `lib/repositories` 데이터 접근**으로 이어지는 인증·권한·데이터 파이프라인과, 그 위의 Overview/Ops/Settings/Users/Dev/Analytics 대시보드. (마케팅·CRM·챗봇·콘텐츠 어드민은 각자 파트로 분리)

## 2. 핵심 디렉토리/파일 맵

- `lib/admin-auth.ts` — 인증 코어. `verifyAdmin()`, `requireVerifiedAdminContext()`, 동일출처 검증, 세션 HMAC 인코딩/디코딩, 3-소스 컨텍스트 해석 + 60초 캐시.
- `lib/admin-env.ts` — `isAdminAuthBypassEnabled()`: dev + `NEXT_PUBLIC_SKIP_ADMIN_AUTH=true` + non-Vercel 일 때만 우회(배포 차단).
- `lib/admin-auth-errors.ts` / `lib/admin-auth-logout.ts` — 로그인 에러 매핑 / `signOutAdminSession()`.
- `lib/supabase/admin.ts` — `createSupabaseAdminClient()`: service-role 싱글톤. **RLS 우회용, 어드민 API 데이터 접근의 정답.**
- `lib/supabase/server.ts` — `createSupabaseServerClient()`: RLS 적용 SSR 클라이언트. **어드민 API에선 절대 사용 금지**(포털 SSR 전용).
- `lib/admin-client.ts` — 클라이언트 `adminFetch`/`adminFetchJsonCached`: Bearer 토큰 주입, 401시 로그인 리다이렉트, 스코프별 캐시 + SWR + mutation 무효화.
- `lib/admin-api-response.ts` — `adminCachedJson()`: 표준 GET 캐시 헤더(`private, max-age=30, stale-while-revalidate=120`).
- `lib/repositories/*.ts` — 데이터 접근 계층(대부분 admin 클라이언트 사용). 예: `settings.ts`(row↔legacy 매핑 + 캐시).
- `lib/admin-docs.ts` — 가이드 문서 admin 뷰(admin 클라이언트 + static fallback).
- `lib/site-settings-types.ts` — `SiteSettings`/`LeadRecord` 등 공유 타입.
- `app/admin/layout.tsx` — 클라이언트 셸. 세션 부트스트랩(bypass/legacy `/api/admin/auth`/Supabase `admin_profiles`), 사이드바, 라우트 전환.
- `app/admin/page.tsx` — `/admin/overview` redirect.
- `app/admin/{overview,ops,settings,users,dev,analytics,login}/page.tsx` — 코어 대시보드(전부 client, `adminFetchJsonCached` 소비).
- `app/api/admin/auth/route.ts` — 레거시 로그인(GET 세션확인 / POST 비번+rate-limit). 로그아웃은 POST `/api/admin/auth/logout`. **가드 면제 라우트(설계상).**
- `components/admin/AdminSidebar.tsx`, `AdminCommandPalette*.tsx`, `StatCard.tsx` — 셸 공용 UI.

## 3. 가장 중요한 업무

- 모든 `app/api/admin/*` 라우트가 `verifyAdmin()`(또는 `requireVerifiedAdminContext()`)로 보호되고 역할(`SUPER_ADMIN`/`ADMIN`/`BRANCH` 등)을 강제하는지 유지.
- 3-소스 인증 모델 정합성(dev bypass / 레거시 HMAC 쿠키 / Supabase `admin_profiles.status=ACTIVE`).
- 데이터 접근을 `lib/repositories`로 모으고, 어드민 경로는 항상 service-role admin 클라이언트 사용.
- 운영 대시보드(Overview/Ops/Settings) 성능·응답성(SWR 캐시, SQL 집계, 컬럼 투영).

## 4. 지침 & 규칙 (강제 위치 인용)

- **Auth 가드**(CLAUDE.md): 어드민 API는 `verifyAdmin(req, allowedRoles?)` 호출 후 반환 `NextResponse`(401/403)를 즉시 return. 정의: `lib/admin-auth.ts`. unsafe 메서드는 `verifySameOriginRequest()`가 `sec-fetch-site`/origin/referer 검사. (현재 `app/api/admin` 라우트 거의 전부 가드, 면제는 로그인 진입점 2개뿐)
- **Admin Supabase 클라이언트**(운영 철칙): 어드민 API 데이터 접근은 반드시 `createSupabaseAdminClient()`. `createSupabaseServerClient()`는 어드민 경로에서 0건이어야 함. 이유: 어드민은 Bearer 인증이라 server 클라이언트면 `auth.uid()=null` → RLS `is_active_admin()` false → 빈 배열(과거 `leads:[]` 버그).
- **API 응답 형태**: 도메인 JSON 직접 반환. 성공 `NextResponse.json(payload)` / 캐시형 `adminCachedJson(payload)` / 에러 `{ error, code? }` + 상태코드(401/403/400/429). 클라이언트 `adminFetchJson`이 `error`/`message`를 throw로 변환.
- **Repository 패턴**: `lib/repositories/<도메인>.ts`가 `"server-only"` + `createSupabaseAdminClient()`로 row↔도메인 매핑/캐시/검증. route는 가드만 하고 repo 함수 호출. 일부는 `data/*.json` 듀얼모드 폴백.

## 5. 절대 깨면 안 되는 것 / 주의점

- **RLS/admin 클라이언트 트랩**: 어드민 라우트에서 `createSupabaseServerClient()`를 쓰면 전 행 차단 → 빈 배열 무음 반환(에러 없음). 새 repo/route는 반드시 admin 클라이언트.
- **마이그레이션 규율**: `database.types.ts`/repo INSERT에 컬럼 추가 시 `supabase/migrations/YYYYMMDD_*.sql`(`ADD COLUMN IF NOT EXISTS`) 동반 필수. 누락 시 INSERT 무음 실패(과거 `follow_up_at`/`assigned_to` 버그).
- **미적용 마이그레이션 = 성능 미작동**: 대시보드/CRM 집계 마이그레이션(`20260618_*`)은 DB 적용 전엔 느린 폴백 경로 유지(코드는 안 깨지나 속도 개선 OFF).
- **세션 시크릿**: `encodeSession`은 `SESSION_SECRET`(또는 dev `ADMIN_PASSWORD`) 없으면 throw. 프로덕션 env 누락 시 로그인 불가.
- **bypass 우회**: dev 한정, Vercel에선 코드로 차단(`lib/admin-env.ts`). 프로덕션에서 절대 켜지지 않게.
- **권한 캐시 지연**: Supabase 컨텍스트 60초 TTL → 권한 회수가 최대 60초 늦게 반영(의도된 트레이드오프).
- **계정 관리**: 회원(admin/branch)은 DB가 아니라 `ADMIN_USERS`/`ADMIN_PASSWORD` 환경변수 기반(`/admin/users`는 읽기 전용 표시).

## 6. 관련 문서

- `docs/active/admin-growth-os-ia.md` — 어드민 IA/그로스 OS 정보구조.
- `docs/active/admin-settings-design.md`, `admin-implementation-inputs.md`, `admin-2.201-sales-ops-upgrade.md`, `admin-cta-tab-spec.md` — 탭별 설계/입력.
- `docs/admin-next-phase-plan.md` — Overview/Campaigns/Settings/Analytics/Blog 다음 단계 기획.
- `docs/active/erp-blueprint-2026-06-22.md` — 어드민→지사 운영 OS(ERP) 청사진.
- `docs/active/repository-audit-2026-04-15.md` / `repository-status-2026-06-08.md` — 저장소 감사/현재 상태.
- `docs/active/architecture-schema-erd.md` / `supabase-backend-masterplan.md` / `supabase-migration-checklist-2.22.md` — 스키마/백엔드/마이그레이션 기준.

## 7. 현재 목표 & 백로그 (2026-06-23 스냅샷)

- **ERP 전환(읽기 우선, 무마이그 퀵윈)**: `/admin/overview` OS 요약 스트립(`/api/admin/os-summary`), crm_source_links 커버리지 타일, 골든타임 24h 노출, Account 360 읽기 뷰.
- **CEO 거버넌스 3결정 대기**: 매출 book-of-record(시트 vs Portal), 귀속 정책(단일 오너+자문형), 목표 소스(시트→DB 단일화).
- **성능 마이그레이션 적용 필요**: `20260618_admin_dashboard_query_performance.sql`, `20260618_crm_status_counts_rpc.sql` (적용 시 대시보드/CRM 집계 1~3s→<200ms).
- **남은 성능 작업**: customers 서버 페이지네이션 보류(메모리 조인 구조), commercial customers 전체 fetch, unbounded `select("*")` 컬럼 투영+limit.
- **다음 단계**: 화면 간 연결성, 숫자→행동 보조 UX, 블로그 AI 가속.

## 8. 검증 방법

```bash
npx eslint app components lib --max-warnings=0
npm run build
```
추가: 새 admin route 가드 누락 확인 — `grep -L "verifyAdmin\|requireVerifiedAdminContext" app/api/admin/**/route.ts`(현재 면제는 auth 2개뿐). 어드민 경로에 `createSupabaseServerClient`가 들어오지 않았는지 grep. 스키마 변경 시 대응 `supabase/migrations/*.sql` 존재 확인.

## 9. 작업 시작 시 먼저 읽을 것

1. `lib/admin-auth.ts` — 인증·권한·동일출처 SSOT.
2. `lib/supabase/admin.ts` — admin 클라이언트 규칙(RLS 트랩 회피).
3. `lib/admin-client.ts` + `lib/admin-api-response.ts` — 클라/서버 캐시·응답 규약.
4. `app/admin/layout.tsx` — 셸 세션 부트스트랩(3-소스) 흐름.
5. `app/api/admin/settings/route.ts` + `lib/repositories/settings.ts` — 가드→repo→admin 클라이언트 정석 예시.
