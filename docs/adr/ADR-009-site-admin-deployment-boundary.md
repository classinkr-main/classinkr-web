# ADR-009: 홈페이지와 Admin은 한 저장소에서 단계적으로 실행 경계를 분리한다

Status: accepted

Date: 2026-08-28

## 1. Context

공개 홈페이지와 Admin OS는 현재 하나의 Next.js 앱, 하나의 GitHub 저장소, 하나의 배포 단위에서
동작한다. Admin은 다수의 운영 화면과 API를 가진 별도 제품 표면으로 성장했지만 Supabase 데이터,
리드·고객·견적·계약 도메인, 콘텐츠 발행, Portal 계약을 공개 앱과 공유한다.

현재 루트 레이아웃은 공개 SEO·동의·광고·분석 런타임을 모든 경로의 상위에 둔다. 반대로 앱을 즉시
별도 저장소로 나누면 공용 DB 타입과 도메인 계약의 원자적 변경이 어려워지고, Cron·Webhook·인증
이전 위험이 커진다.

## 2. Decision

- GitHub 저장소와 Supabase 데이터 정본은 하나를 유지한다.
- 공개 홈페이지와 Admin의 레이아웃·메타데이터·클라이언트 런타임을 현재 앱 안에서 먼저 분리한다.
- 공용 DB·도메인·UI 기반은 명시적인 패키지 경계로 이동한다.
- 이후 npm workspaces의 `apps/site`, `apps/admin` 두 Next.js 앱으로 전환한다.
- 두 앱이 독립적으로 빌드·검증된 뒤 같은 저장소를 서로 다른 Vercel 프로젝트에 연결한다.
- Admin UI와 `/api/admin`은 같은 origin을 사용한다.
- Cron은 항상 한 프로젝트만 소유하며 Webhook은 별도 전환 결정 전까지 기존 공개 URL을 유지한다.
- Next.js·React·Tailwind 업그레이드, 별도 GitHub 저장소, 별도 Supabase 프로젝트 도입은 이 결정의
  범위에 포함하지 않는다.

## 3. Consequences

### Positive

- 공개 사이트와 Admin의 SEO·분석·보안·클라이언트 런타임 경계가 명확해진다.
- Site와 Admin을 독립 배포·롤백할 수 있다.
- 공용 데이터 계약은 한 저장소에서 원자적으로 변경할 수 있다.
- AI와 사람 모두 앱별 검색·검증 범위를 좁힐 수 있다.
- 별도 저장소보다 코드 복제와 계약 불일치 위험이 낮다.

### Negative

- 두 Vercel 프로젝트의 환경변수·CSP·로그·알림을 관리해야 한다.
- 공용 DB migration은 두 앱 버전과의 하위 호환성을 유지해야 한다.
- Admin 서브도메인 전환 시 쿠키·Supabase Auth·OAuth redirect를 검증해야 한다.
- 앱 추출 전에 Portal·Cron·Admin 사이의 현재 교차 의존성을 정리해야 한다.
- Vercel 분리 자체는 DB·외부 API·AI 호출 시간을 줄이지 않는다.

### Risks

- 같은 Cron이 두 프로젝트에서 실행되는 중복 실행
- Admin UI와 API를 다른 origin에 둘 때 생기는 CORS·쿠키·CSRF 오류
- Webhook URL 조기 변경으로 인한 이벤트 유실
- 공용 패키지가 앱 전용 UI와 로직을 다시 끌어안는 경계 붕괴
- 두 앱이 호환되지 않는 DB migration을 서로 다른 시점에 배포하는 문제

이 위험은 단계별 PR, 단일 Cron 소유자, Webhook URL 유지, additive migration, import boundary 검사로
통제한다.

## 4. Related docs/code

- [홈페이지·Admin 실행 경계 분리 계획](../active/site-admin-separation-plan-2026-08-28.md)
- [문서 인덱스](../README.md)
- [Admin 작업 지침 맵](../active/admin-guidance-map.md)
- [Admin OS 운영 결정](../active/admin-os-operating-decisions-2026-07-11.md)
- `app/layout.tsx`
- `app/admin/layout.tsx`
- `components/AppChrome.tsx`
- `proxy.ts`
- `vercel.json`
