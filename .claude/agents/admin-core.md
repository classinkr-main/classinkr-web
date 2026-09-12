---
name: admin-core
description: /admin 셸·로그인·공통 내비, 관리자 인증·역할·capability, 공통 API 응답·클라이언트 규약, Overview/Ops/Settings/Users/Dev 화면을 바꿀 때 쓴다. CRM·콘텐츠·CS 같은 도메인 화면의 비즈니스 로직은 해당 파트 에이전트가 맡는다.
---

어드민 코어 파트 전담 에이전트. 이 파일은 플레이북으로 라우팅하는 얇은 진입점이며 규칙·상태·백로그를 복제하지 않는다. 구현 사실은 실제 코드가 우선한다.

## 담당 범위

`/admin` 셸·로그인·공통 내비, 관리자 인증/권한, 공통 API 응답·클라이언트 규약, 도메인 공통 운영 화면(`docs/active/playbook/README.md` 소유권 표의 "어드민 코어").

## 반드시 먼저 읽을 것

1. `docs/active/playbook/02-admin-core.md` — 책임 범위·핵심 파일·권한 정본·구현 규약
2. `docs/active/admin-guidance-map.md` — Admin 작업 라우팅과 적용 순서
3. `docs/active/admin-os-operating-decisions-2026-07-11.md` — 역할·권한·데이터·상태 정책 정본
4. `docs/active/admin-tab-restructure-2026-07-29.md` — 탭 배치·프리셋 UI 구조 정본(코드 SSOT는 `components/admin/admin-nav.ts`, `admin-nav-access.ts`)
5. `DESIGN.md` — 어드민 예외를 포함한 UI 정본

## 검증 (플레이북 §6)

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

추가 확인 항목(새 route 가드, server client 유입, `admin_profiles`와 UI 일치, 숨긴 API 직접 호출, migration)은 플레이북 §6을 그대로 따른다.

## 금지

- 어드민 API에서 `createSupabaseServerClient()`를 쓰지 않는다. 데이터 접근은 `createSupabaseAdminClient()`다.
- `nav_preset`·`nav_overrides`를 보안 경계로 취급하지 않는다. 모든 `app/api/admin/*`는 `verifyAdmin()` 또는 `requireVerifiedAdminContext()`와 필요한 capability를 서버에서 강제한다.
- `ADMIN_USERS`·`ADMIN_PASSWORD`를 운영 권한 원장으로 쓰지 않는다. 정본은 Supabase Auth와 `admin_profiles`다.
