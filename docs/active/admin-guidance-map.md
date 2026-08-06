# Admin 작업 지침 맵

상태: 현재 기준 라우팅 문서
범위: `/admin`, `app/api/admin`, 공용 관리자 인증·권한·내비게이션·데이터 접근 규약

이 문서는 Admin 작업을 시작할 때 어떤 기준을 먼저 적용할지 정한다. 제품 결정과 세부 구현을
이 문서에 복사하지 않고, 각 정본과 실행 가능한 코드 SSOT로 연결한다.

## 1. 적용 순서

1. 저장소 공통 규칙: [AGENTS.md](../../AGENTS.md)
2. Admin 역할·권한·데이터·상태 정책: [Admin OS 운영 결정](admin-os-operating-decisions-2026-07-11.md)
3. 현재 탭 배치·프리셋: [어드민 탭 재구성 스펙](admin-tab-restructure-2026-07-29.md)
4. 도메인 세부 기준: 아래 [작업 라우팅](#4-작업-라우팅)의 해당 문서와 스킬
5. 현재 동작 확인: 실제 코드와 검증 결과

문서와 코드가 다르면 둘을 억지로 섞지 않는다.

- 정책 문서가 목표 상태를 선언하고 코드가 뒤처졌다면 마이그레이션 대상으로 기록한다.
- 문서가 과거 동작을 설명하고 코드가 후속 결정을 구현했다면 문서를 갱신하거나 `docs/archive/`로 옮긴다.
- 구현 계획과 작업 로그는 현재 동작의 근거로 사용하지 않는다.

## 2. 실행 가능한 SSOT

| 관심사 | 코드 SSOT |
| --- | --- |
| 탭 목록·표시명·기본 역할 | `components/admin/admin-nav.ts` |
| 프리셋·상시/기타/차단 배치 | `components/admin/admin-nav-access.ts` |
| active 판정 | `components/admin/nav-active.ts` |
| 인증 컨텍스트·API 역할 묶음·capability | `lib/admin-auth.ts`, `lib/admin-capabilities.ts` |
| 클라이언트 요청·캐시 | `lib/admin-client.ts` |
| 관리자 API 응답 | `lib/admin-api-response.ts` |
| 관리자 계정 조회 | `lib/repositories/admin-users.ts` |

`admin_profiles.nav_preset`과 `nav_overrides`는 업무 표면 배치용 UX 설정이다. 사이드바나
커맨드 팔레트에서 보이지 않는 것만으로 데이터 접근이 차단되지는 않는다. 실제 보안 경계는 각
API의 `verifyAdmin()` 또는 `requireVerifiedAdminContext()` 역할 검사와 필요한 capability 검사다.

## 3. 계정과 권한

- 운영 계정 정본은 Supabase `admin_profiles`다.
- 목표 역할은 `SUPER_ADMIN / ADMIN / BRANCH` 세 가지다.
- `EDITOR / VIEWER / PARTNER`는 전환기·레거시 호환 값으로만 다룬다. 새 정책의 정본 역할로
  추가하지 않는다.
- `ADMIN_USERS`와 `ADMIN_PASSWORD`는 로컬 개발 또는 전환기 폴백이다. 신규 운영 기능의
  계정 정본으로 사용하지 않는다.
- 안전한 읽기, 생성·수정·삭제, 되돌리기 어려운 최종 실행은 같은 권한이 아니다. 메서드별 역할
  묶음과 `hardware.finalize` 같은 기능 capability를 함께 적용한다.
- service-role 클라이언트는 명시적 Admin 인증·권한 검사 뒤에만 사용한다. RLS 우회가 곧
  사용자 권한 검사를 대신하지는 않는다.

## 4. 작업 라우팅

| 작업면 | 소유 범위 | 먼저 볼 기준 |
| --- | --- | --- |
| Admin 코어 | 셸, 로그인, 인증·권한, nav, 공용 요청·응답 규약 | [Admin 코어 플레이북](playbook/02-admin-core.md) |
| 콘텐츠 | `/admin/docs`, 블로그, 행사, 자료 발행 | [콘텐츠 플레이북](playbook/03-content-pub.md) |
| CRM·그로스 | CRM, 캠페인, 리드, Branch, 캘린더 | [그로스 플레이북](playbook/04-growth-crm.md) |
| 공개 챗봇·CS 운영 | RAG, 공개 챗봇, 외부 CS 대시보드 | [챗봇 플레이북](playbook/05-chatbot.md), [CS 콘솔 IA](cs-admin-console-ia-2026-07-27.md) |
| 플랫폼·데이터 | Supabase, migration, cron, 알림, Portal V2 | [플랫폼 플레이북](playbook/06-platform-data.md) |
| KR Team·매출 장부 | `/admin/branch`, `/admin/branch/ledger`, 동기화·정합성 | [Classin KR Team 스킬](../../.codex/skills/classin-kr-team/SKILL.md) |

Admin 코어는 `app/api/admin/*`, `components/admin/*`, `lib/repositories/*` 전체를 소유하지 않는다.
공용 인증·응답·저장소 규약은 Admin 코어가 관리하고, 도메인 로직과 도메인 테스트는 해당 작업면이
소유한다. 플랫폼 파트도 `tests/*` 전체를 소유하지 않고 공용 기반과 검증 도구만 관리한다.

## 5. 탭과 화면 규칙

- 현재 탭 목록은 `ADMIN_NAV` 배열에서만 추가·삭제·재정렬한다.
- 사이드바, 커맨드 팔레트, 회원별 미리보기는 같은 nav access 해석 함수를 사용한다.
- `/admin/traffic`은 현재 독립 화면으로 유지되며, 사이드바 최상위 항목에서만 내려간 상태다.
  Analytics는 해당 화면으로 연결한다.
- `/admin/chatbot`은 외부 공개 챗봇의 CS 운영 대시보드다. 문서 보강과 품질 검수는
  `/admin/docs`의 해당 탭에서 수행한다.
- `/admin/branch`는 성과·탐색, `/admin/branch/ledger`는 입력·검수·마감 작업면이다.
- Notion 마케팅 캘린더 원천은 라이브 읽기 전용이다. 이 규칙은 Admin 자체 일정 엔티티의 DB
  저장을 금지하는 것이 아니라, Notion 원천 이벤트를 별도 정본으로 복제하거나 양방향 쓰기하지
  말라는 뜻이다.

## 6. UI와 검증

- UI 색·보더·상태·확도·팀·히트맵 토큰은 [DESIGN.md](../../DESIGN.md)를 그대로 따른다.
  축약 문구로 어드민 전용 예외 토큰을 다시 정의하지 않는다.
- 기본 품질 게이트는 다음 순서로 실행한다.

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

- 변경 중에는 가장 가까운 도메인 테스트를 먼저 실행한다.
- DB/RPC 계약을 바꾸면 migration 계약 테스트를 추가한다.
- `vercel.json`을 바꾸면 `npm run check:vercel-crons`를 실행한다.
- 운영 동기화·마감·대량 임포트는 승인된 계정과 환경 없이 브라우저 검증으로 실행하지 않는다.

## 7. 문서 수명주기

- 한 제품 영역에는 현재 기준 문서 하나와 실행 로드맵 하나만 둔다.
- 완료된 구현 계획, 과거 감사, 특정 시점 상태 스냅샷은 `docs/archive/`로 옮긴다.
- 플레이북과 에이전트 프롬프트에는 현재 백로그·브랜치·배포 상태를 복사하지 않는다.
- 기준 문서에는 repo-relative 링크만 사용하고 로컬 절대경로, 실제 비밀번호, 작업 브랜치명을
  남기지 않는다.
