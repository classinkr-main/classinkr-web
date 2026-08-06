# 파트 가이드 — 어드민 코어 (Admin Core)

> 담당 에이전트: `.claude/agents/admin-core.md`

## 1. 책임 범위

Admin Core는 `/admin`의 셸·로그인·공통 내비와 관리자 인증/권한, 공통 API 응답·클라이언트 규약을 소유한다. Overview/Ops/Settings/Users/Dev처럼 도메인 공통 운영 화면도 이 파트에 포함한다.

다음은 Admin Core의 독점 소유가 아니다.

- `app/api/admin/*`: 공통 가드 규약은 Admin Core, 각 라우트의 비즈니스 로직은 해당 도메인 소유
- `components/admin/*`: Sidebar·Command Palette 같은 셸은 Admin Core, CRM·콘텐츠·CS 등 화면 컴포넌트는 해당 도메인 소유
- `lib/repositories/*`: repository 패턴은 공통 규약을 따르되 구현은 데이터 의미를 가진 도메인 소유

## 2. 핵심 파일

- `app/admin/layout.tsx`, `app/admin/login/page.tsx`, `app/admin/page.tsx`
- `components/admin/AdminSidebar.tsx`, `AdminCommandPalette*.tsx`, `admin-nav.ts`, `admin-nav-access.ts`
- `lib/admin-auth.ts`, `lib/admin-capabilities.ts`, `lib/admin-env.ts`, `lib/admin-auth-errors.ts`, `lib/admin-auth-logout.ts`
- `lib/admin-client.ts`, `lib/admin-api-response.ts`
- `lib/supabase/admin.ts`
- `app/api/admin/auth/route.ts`, `app/api/admin/auth/logout/route.ts`
- `app/admin/{overview,ops,settings,users,dev}`와 직접 연결된 API/repository

## 3. 계정과 권한 정본

- 운영 계정의 정본은 Supabase Auth와 `admin_profiles`다. 활성 프로필(`status=ACTIVE`)의 role과 capabilities가 API 권한 판정의 근거다.
- `ADMIN_USERS`와 `ADMIN_PASSWORD`는 로컬 개발 또는 전환기 레거시 로그인 폴백이다. 운영 회원 목록이나 권한 원장으로 취급하지 않는다.
- 프로덕션 세션 서명은 `SESSION_SECRET`을 사용한다. `ADMIN_PASSWORD`의 세션 시크릿 폴백은 비프로덕션에만 허용한다.
- 개발 bypass는 `lib/admin-env.ts` 조건을 통과한 로컬 환경에만 허용하며 Vercel에서는 차단한다.

### 역할

- 정규 역할: `SUPER_ADMIN`, `ADMIN`, `BRANCH`
- 레거시 호환 역할: `EDITOR`, `VIEWER`, `PARTNER`

레거시 값은 기존 DB·세션과 전환기 API 목록을 깨지 않기 위해 정규화한다. 신규 정책은 정규 역할과 capability를 기준으로 설계한다.

### 내비 배치와 보안 경계

`nav_preset`과 `nav_overrides`는 `admin-nav-access.ts`가 해석하는 내비게이션 배치 정보다. 항목을 상시, 기타, 숨김으로 보이게 할 뿐 API 접근권한을 부여하지 않는다. 페이지에서 항목이 숨겨져도 API는 반드시 role/capability를 독립적으로 검증해야 한다.

## 4. 공통 구현 규약

- 모든 `app/api/admin/*` 라우트는 로그인 진입점처럼 명시적으로 예외인 경우를 제외하고 `verifyAdmin()` 또는 `requireVerifiedAdminContext()`를 호출한다.
- 역할만으로 부족한 위험 동작은 `requireAdminCapability()` 또는 동등한 capability 검사로 보호한다.
- 어드민 데이터 접근은 `createSupabaseAdminClient()`를 사용한다. 쿠키 기반 `createSupabaseServerClient()`를 어드민 API에 사용하면 RLS에 의해 빈 결과가 반환될 수 있다.
- route는 인증·입력 검증·응답 조립에 집중하고, 데이터 매핑과 쿼리는 해당 도메인의 repository에 둔다.
- 성공 응답은 `NextResponse.json()` 또는 `adminCachedJson()`, 오류는 `{ error, code? }`와 적절한 4xx/5xx 상태를 사용한다.
- 클라이언트는 `adminFetch`/`adminFetchJsonCached`의 Bearer·401 처리·캐시 무효화 규약을 재사용한다.
- 스키마 계약 변경에는 idempotent migration을 동반한다.

## 5. UI 규칙

색상, 보더, 상태색, 역할/팀 시각화와 어드민 예외는 `DESIGN.md`를 그대로 따른다. 이 문서에서 일부 팔레트를 별도 재정의하지 않는다. 내비 구조 정본은 `components/admin/admin-nav.ts`, 배치 정본은 `components/admin/admin-nav-access.ts`다.

## 6. 검증

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

변경 범위에 따라 추가 확인한다.

- 새 admin route의 가드와 role/capability 검사
- 어드민 API에 `createSupabaseServerClient()`가 유입되지 않았는지 확인
- `admin_profiles` role/capabilities와 UI 표시가 일치하는지 확인
- `nav_preset`으로 숨긴 API를 직접 호출해도 서버 권한이 강제되는지 확인
- 스키마 변경 시 대응 migration 존재 확인

## 7. 먼저 읽을 것

1. `lib/admin-auth.ts`, `lib/admin-capabilities.ts`
2. `components/admin/admin-nav.ts`, `components/admin/admin-nav-access.ts`
3. `app/admin/layout.tsx`
4. `lib/admin-client.ts`, `lib/admin-api-response.ts`
5. 변경 대상 도메인의 플레이북과 실제 route/repository
