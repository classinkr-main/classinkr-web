# Classin Home — 파트별 운영 플레이북

이 플레이북은 작업을 어느 파트가 맡는지와 모든 파트가 공유하는 안전 규약을 정의한다. 구현 사실은 실제 코드가 우선하며, UI는 `DESIGN.md`, 어드민 운영 정책은 `docs/active/admin-os-operating-decisions-2026-07-11.md`, 어드민 내비 배치는 `components/admin/admin-nav.ts`와 `components/admin/admin-nav-access.ts`를 정본으로 삼는다.

## 1. 사용 순서

1. 아래 소유권 표에서 변경할 도메인을 정한다.
2. 해당 파트 가이드의 도메인 규칙과 실제 구현을 함께 읽는다.
3. 공용 파일을 바꾸면 영향을 받는 도메인까지 확인한다.
4. `npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npm run build` 순으로 검증한다.

에이전트 정의(`.claude/agents/`)는 이 플레이북으로 라우팅하는 얇은 진입점이다. 에이전트 파일에 운영 상태나 백로그를 복제하지 않는다.

## 2. 파트와 소유권

소유권은 "그 경로의 모든 규칙을 독점한다"는 뜻이 아니다. 도메인 파트가 화면·API·repository 구현을 소유하고, Admin Core와 Platform은 각각 공통 어드민 규약과 기반 규약을 제공한다.

| 파트 | 구현 소유권 | 가이드 |
|---|---|---|
| 홈 및 랜딩 | 공개 마케팅 화면, 공용 공개 UI, SEO·포지셔닝 | [01-home-front.md](./01-home-front.md) |
| 어드민 코어 | `/admin` 셸·로그인·공통 내비, 관리자 인증/권한, 공통 API 응답·클라이언트 규약, Overview/Ops/Settings/Users/Dev | [02-admin-core.md](./02-admin-core.md) |
| 콘텐츠 발행 | 공개 docs/blog/events/resources, 콘텐츠 어드민과 그 API, 문서·블로그·행사·리드마그넷 repository, 콘텐츠 인입 파이프라인 | [03-content-pub.md](./03-content-pub.md) |
| 마케팅/그로스/CRM | 리드·동의·추적·캠페인, CRM·Branch·Calendar 화면과 API, 해당 repository와 외부 CRM/시트 연동 | [04-growth-crm.md](./04-growth-crm.md) |
| 챗봇/CS | 공개 챗봇 API·위젯, `/admin/chatbot` CS 운영 대시보드, 내부 CS·상담 콘솔, 해당 API와 repository | [05-chatbot.md](./05-chatbot.md) |
| 플랫폼 & 데이터 | Supabase 클라이언트·마이그레이션, Portal V2 인가, 결제·cron·웹훅·알림·인증/identity, 공용 검증 기반 | [06-platform-data.md](./06-platform-data.md) |

### 경계 규칙

- Admin Core는 `app/api/admin/*`, `components/admin/*`, `lib/repositories/*` 전체를 소유하지 않는다. 인증 가드·셸·공통 규약은 Admin Core, 각 라우트·화면·repository의 비즈니스 로직은 해당 도메인 소유다.
- Platform은 테스트 도구와 공용 품질 게이트를 관리하지만 `tests/*` 전체를 소유하지 않는다. 테스트 소유권은 검증 대상 도메인을 따른다.
- 공용 설정 파일(`next.config.ts`, `vercel.json`, lint/test 설정)은 변경 목적의 도메인과 Platform이 함께 확인한다.
- `data/*.json` 듀얼모드의 저장 메커니즘은 Platform 규약을 따르고, 데이터 의미와 마이그레이션 결정은 해당 도메인이 소유한다.

## 3. 공통 철칙

### 어드민 계정·역할·인가

- 운영 계정과 프로필의 정본은 Supabase `admin_profiles`다. `ADMIN_USERS`와 `ADMIN_PASSWORD`는 로컬 개발 또는 전환기 레거시 인증 폴백이며 운영 권한 원장으로 사용하지 않는다.
- 정규 역할은 `SUPER_ADMIN`, `ADMIN`, `BRANCH`다. `EDITOR`, `VIEWER`, `PARTNER`는 기존 데이터와 세션을 위한 레거시 호환 값이며 새 권한 모델의 기준으로 확장하지 않는다.
- `nav_preset`과 `nav_overrides`는 사이드바의 상시/기타/숨김 배치를 정하는 UX 설정이다. 보안 경계가 아니다. 실제 접근은 각 `app/api/admin/*` 라우트의 role/capability 검사로 강제한다.
- 어드민 API는 `verifyAdmin()` 또는 `requireVerifiedAdminContext()`로 인증·역할을 확인하고, 필요한 동작은 capability까지 검사한다. 데이터 접근은 `createSupabaseAdminClient()`를 사용한다.

### 데이터·마이그레이션

- 타입이나 INSERT/UPDATE 계약에 컬럼을 추가하면 `supabase/migrations/YYYYMMDD_*.sql`을 함께 만들고 적용 여부를 확인한다.
- 공개 리드 저장 실패를 성공으로 숨기지 않는다. 저장과 외부 전달이 모두 실패한 요청은 즉시 재시도할 수 있어야 한다.
- Notion이 원천인 마케팅 캘린더 이벤트는 Supabase에 미러링하거나 양방향 쓰기하지 않는다. 이 규칙은 Classin이 자체 생성·관리하는 `admin_calendar_events`에는 적용되지 않는다.
- 동의 없는 마케팅 픽셀 발화와 raw PII/IP 저장을 금지한다. 추적 이벤트는 이름과 파라미터 allowlist를 함께 갱신한다.

### UI·검증

- UI 색상·상태색·어드민 예외를 포함한 디자인 정본은 `DESIGN.md` 하나다. 플레이북에 팔레트 일부를 별도 요약해 복제하지 않는다.
- 기본 품질 게이트는 다음 순서다.

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

- 스키마, 챗봇 DB 계약, 리드 저장소, cron처럼 전용 검증이 있는 변경은 해당 파트 가이드의 추가 명령도 실행한다.

## 4. 크로스컷 확인

- 콘텐츠 ↔ 챗봇: 문서 본문·청크·동기화 변경은 검색 결과, 출처 중복 제거, 공개 답변 안전성에 영향을 준다.
- 그로스 ↔ 플랫폼: 리드·CRM·결제·cron은 Supabase 스키마와 인가 위에 올라간다.
- 프론트 ↔ 그로스: 폼·CTA·랜딩 계측은 consent와 이벤트 allowlist를 따른다.
- Admin Core ↔ 모든 어드민 도메인: 셸·인증·내비 변경은 각 도메인 화면과 API 권한을 함께 확인한다.

## 5. 유지보수

- 현재 목표, 담당자 대기 사항, 완료율, 미적용 건수 같은 시점성 정보는 이 플레이북에 두지 않는다. 필요하면 날짜가 있는 실행 문서나 이슈에서 관리한다.
- 규칙이 바뀌면 정본 한 곳을 먼저 수정하고 플레이북은 링크와 소유권만 갱신한다.
- 새 도메인 화면/API/repository를 추가할 때는 같은 도메인 파트에 함께 배정한다.
