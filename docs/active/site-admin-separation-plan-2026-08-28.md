# 홈페이지·Admin 실행 경계 분리 계획

상태: 승인된 단계형 계획

기준일: 2026-08-28

범위: 공개 홈페이지, `/admin`, `/api/admin`, 공용 데이터 계약, Vercel 배포, Cron, 외부 Webhook

## 1. 결론

홈페이지와 Admin은 즉시 별도 저장소로 나누지 않는다. 다음 목표 상태를 단계적으로 만든다.

- GitHub 저장소는 하나를 유지한다.
- Supabase 프로젝트와 데이터 정본도 하나를 유지한다.
- 먼저 현재 Next.js 앱 안에서 공개·Admin 레이아웃과 런타임 의존성을 분리한다.
- 그 다음 공용 계약을 패키지 경계로 정리하고 `apps/site`, `apps/admin` 두 앱으로 전환한다.
- 두 앱이 독립적으로 빌드·검증된 뒤에만 같은 저장소를 두 Vercel 프로젝트에 연결한다.
- Cron은 항상 한 프로젝트만 소유한다.
- 외부 Webhook URL은 초기 분리에서 변경하지 않는다.

영속적인 아키텍처 결정은 [ADR-009](../adr/ADR-009-site-admin-deployment-boundary.md)를 따른다.

## 2. 현재 기준선

2026-08-28 로컬 코드와 프로덕션 빌드 기준이다. 이후 수치는 변할 수 있으므로 마이그레이션 완료
판정에는 같은 방법으로 다시 측정한다.

- Next.js 16.2.4, React 19.2.3, Tailwind CSS 4를 사용한다.
- `app/admin`에는 `page.tsx` 63개가 있다.
- `app/api/admin`에는 `route.ts` 212개가 있다.
- `app/admin`, `app/api/admin`, `components/admin`의 TypeScript/TSX 코드는 합계 약 14.3만 줄이다.
- 전체 빌드는 485개 경로를 생성했고 `npm run build` 실측은 약 51초였다.
- 빌드 manifest상 초기 클라이언트 JS의 gzip 합계는 홈페이지 약 141KB, Admin 캘린더 약 156KB,
  CRM 약 217KB, 하드웨어 약 213KB였다. 이는 브라우저·제3자 네트워크·API 응답 시간을 포함하지
  않는 비교용 수치다.

현재 Next.js 라우트 코드 분할 때문에 Admin 코드 전체가 홈페이지 방문자에게 전달되는 구조는 아니다.
따라서 앱 또는 Vercel 프로젝트 분리만으로 홈페이지나 Admin 데이터 로딩이 급격히 빨라진다고
가정하지 않는다.

## 3. 지금 해결할 문제

### 3.1 공개 런타임이 루트에 있음

현재 `app/layout.tsx`가 공개 사이트 메타데이터, JSON-LD, Consent Mode, Google Ads와
`AppChrome`을 모든 경로의 상위에서 제공한다. `AppChrome`은 경로를 보고 공개 헤더·푸터·위젯을
숨기지만 공개 런타임과 Admin 런타임의 빌드 경계 자체를 분리하지는 않는다.

2026-08-28 빌드 HTML 확인 결과, 별도 metadata override가 없는 정적 Admin 페이지와 Admin 로그인
페이지에 Google Ads 스크립트와 `robots=index, follow`가 포함됐다. 인증 Proxy가 Admin 데이터를
보호하므로 이 사실만으로 데이터 노출을 뜻하지는 않지만 SEO·성능·동의 관리 경계는 수정해야 한다.

### 3.2 앱 추출 전 정리할 교차 의존성

- Portal의 견적 동작이 `admin-client`에 직접 의존하는 부분
- Cron이 Admin CRM 모듈에 직접 의존하는 부분
- Admin 문서·견적 화면이 Portal UI 또는 Portal 계약을 직접 소비하는 부분
- 공용 repository와 Admin 전용 응답 조립 로직이 섞인 부분

두 앱을 먼저 만들고 이 의존성을 나중에 정리하지 않는다. 공용 도메인 계약과 앱 전용 UI를 먼저
구분한다.

## 4. 목표 구조

```text
classin_home/
├─ apps/
│  ├─ site/
│  └─ admin/
├─ packages/
│  ├─ database/
│  ├─ domain/
│  ├─ ui/
│  └─ config/
└─ package.json
```

- `apps/site`: 공개 홈페이지, 블로그, 문서, 행사, 리드, 공개 챗봇, Checkout, 공유 링크, Portal
- `apps/admin`: `/admin` 화면, `/api/admin`, 관리자 인증과 내부 운영 UI
- `packages/database`: 생성된 Supabase 타입, DB 클라이언트 규약
- `packages/domain`: 리드·고객·딜·견적·계약 등 공용 타입과 입력 검증
- `packages/ui`: 디자인 토큰과 실제로 양쪽에서 사용하는 기초 UI만 포함
- `packages/config`: 공용 TypeScript·ESLint 설정

앱 전용 페이지·클라이언트 상태·내비게이션·분석 스크립트는 공유 패키지로 올리지 않는다.

## 5. 실행 단계

### Phase 0 — 전용 worktree와 기준선

- 현재 기능 개발 worktree의 미커밋 변경과 섞지 않는다.
- 분리 단계마다 별도 브랜치와 worktree를 사용한다.
- 한 장기 브랜치에 전체 마이그레이션을 쌓지 않고 아래 Phase별 PR로 병합한다.
- 기준선 빌드, 역할별 인증, 주요 공개 경로, Cron 목록, Webhook 목록을 기록한다.

완료 조건:

- 분리 작업이 기존 CRM·콘텐츠 기능 변경과 파일 단위로 구분된다.
- 롤백 가능한 작은 PR 순서가 확정돼 있다.

### Phase 1 — 단일 앱 내부 레이아웃 분리

아직 Vercel 프로젝트, API 주소, DB, Webhook을 바꾸지 않는다.

- `app/layout.tsx`를 `html`, `body`, 전역 CSS 등 최소 공용 루트로 축소한다.
- 공개 경로를 route group의 공개 레이아웃 아래로 옮긴다.
- Checkout·Receipt처럼 현재 `AppChrome`이 제외하는 경로는 별도 최소 레이아웃을 사용한다.
- 현재 클라이언트 `app/admin/layout.tsx`의 동작을 `AdminShell` 계열 컴포넌트로 이동한다.
- 새 Admin 서버 레이아웃에서 `noindex`, `nofollow`, `nocache`를 일괄 선언한다.
- 공개 JSON-LD, Consent Mode, 광고·분석·채널톡·공개 챗봇은 공개 레이아웃에서만 로드한다.
- URL과 API 계약은 모두 유지한다.

완료 조건:

- `/`에는 공개 SEO와 필요한 분석 런타임이 있다.
- `/admin/login`과 대표 Admin 화면 HTML에는 공개 광고·분석 스크립트가 없다.
- 모든 `/admin` 응답은 명시적인 검색 제외 정책을 가진다.
- 로그인, `SUPER_ADMIN / ADMIN / BRANCH` 접근, 딥링크가 기존과 동일하게 동작한다.
- 기본 품질 게이트가 통과한다.

이 Phase가 현재 최우선 실행 범위다. 완료 후 속도와 운영 복잡도를 다시 측정하고, Vercel 분리의
실익이 부족하면 여기서 멈출 수 있다.

### Phase 2 — 의존성 경계와 공용 계약

- Site가 Admin UI·클라이언트 모듈을 import하지 못하게 한다.
- Admin이 Site 페이지·마케팅 컴포넌트를 import하지 못하게 한다.
- 클라이언트 코드가 server-only repository를 import하지 못하게 한다.
- Supabase 생성 타입, 공용 도메인 타입, 입력 검증, 필요한 repository 규약을 명시적으로 분리한다.
- 교차 경계를 ESLint 또는 별도 boundary 검사로 고정한다.

완료 조건:

- 두 앱으로 옮길 파일 목록에 순환·역방향 import가 없다.
- DB 타입과 도메인 계약에는 단일 정본만 존재한다.
- 앱 전용 UI가 공용 패키지에 유입되지 않는다.

### Phase 3 — npm workspaces와 두 Next.js 앱

- Next.js·React·Tailwind의 메이저 또는 마이너 업그레이드와 앱 분리를 같은 PR에서 하지 않는다.
- 루트에 npm workspaces를 도입하고 `apps/site`, `apps/admin`, 필요한 `packages/*`를 만든다.
- 앱별 `next.config.ts`, `proxy.ts`, 환경변수 계약, 빌드·typecheck·test 명령을 둔다.
- Tailwind CSS 4가 `packages/ui` 소스를 스캔하도록 각 앱의 CSS source 경계를 명시한다.
- Turborepo·Nx는 도입하지 않는다. 실제 빌드 캐시 문제가 확인될 때 별도 결정한다.

완료 조건:

- 두 앱이 로컬과 Preview에서 독립적으로 빌드된다.
- 한 앱의 페이지 코드가 다른 앱의 배포 산출물에 포함되지 않는다.
- 공용 패키지 변경 시 양쪽 계약 테스트가 함께 실행된다.

### Phase 4 — Vercel 프로젝트 분리

- 같은 GitHub 저장소의 `apps/site`, `apps/admin`을 서로 다른 Vercel 프로젝트에 연결한다.
- Site는 공개 도메인, Admin은 Admin 전용 서브도메인을 사용한다.
- Admin UI와 `/api/admin`은 같은 origin에 둔다. Admin UI만 분리하고 API를 공개 도메인에 남겨
  CORS·쿠키·CSRF 문제를 만들지 않는다.
- 환경변수, CSP, 로그, 알림을 앱별 최소 권한으로 분리한다.
- 기존 `/admin/**`은 안정화 기간 동안 새 Admin 도메인으로 딥링크를 보존해 리디렉트한다.

완료 조건:

- Site와 Admin이 독립 배포·롤백된다.
- Admin 로그인 쿠키와 Supabase 세션이 Admin origin에서 정상 동작한다.
- 공개 배포 실패와 Admin 배포 실패의 영향 범위가 분리된다.
- Cron 중복 실행이 없다.

### Phase 5 — Cron과 Webhook 개별 이전

Cron과 Webhook을 앱 디렉터리 이동에 묶어 일괄 전환하지 않는다.

- 각 Cron에는 단 하나의 소유 프로젝트를 지정한다.
- 기존 Cron을 끄지 않은 채 새 프로젝트에서 같은 스케줄을 활성화하지 않는다.
- Vercel Hobby 기준 하루 1회 이하 규칙을 계속 적용한다.
- 외부 Webhook은 초기에는 기존 공개 URL을 유지한다.
- Webhook 이전은 서명 검증, idempotency, 재전송, 관찰 로그, 공급자 URL 전환과 롤백을 포함한
  별도 작업으로 수행한다.

## 6. API와 런타임 소유권

| 영역 | 초기 소유 | 목표 소유 |
| --- | --- | --- |
| `/admin/**` | 단일 앱 | Admin |
| `/api/admin/**` | 단일 앱 | Admin |
| 홈페이지·블로그·문서·행사 | 단일 앱 | Site |
| 리드·공개 챗봇·뉴스레터 API | 단일 앱 | Site |
| Checkout·공개 견적·공유 링크 | 단일 앱 | Site |
| Portal API | 단일 앱 | Site, 별도 결정 전까지 유지 |
| 내부 CRM·매출 동기화 Cron | 단일 앱 | Admin 후보, 개별 이전 |
| Meta·채널톡·내부 CS Webhook | 공개 URL | 공개 URL 유지, 별도 결정 |
| Supabase DB·생성 타입 | 공용 | 공용 패키지·단일 DB |

## 7. 속도 기대치와 측정

### 기대할 수 있는 것

- Admin 첫 진입에서 공개 동의·광고·분석 클라이언트 코드와 제3자 요청 제거
- Site와 Admin의 변경 범위 축소로 개발 서버, CI, Preview, 배포 작업 단위 개선
- 독립 배포 이후 공개 사이트와 Admin의 배포 실패 영향 분리
- 앱별 의존성 최적화와 Admin 전용 bundle 분석이 쉬워짐

### 기대하면 안 되는 것

- Vercel 프로젝트만 두 개 만든다고 Admin API나 Supabase 쿼리가 빨라지지는 않는다.
- 현재도 라우트 코드 분할이 적용되므로 저장소를 나누는 것만으로 홈페이지 bundle이 절반이 되지 않는다.
- CRM·하드웨어·외부 동기화·AI 호출의 응답 시간은 데이터 쿼리와 외부 서비스 최적화가 별도로 필요하다.
- Admin 내부 페이지 이동 속도는 Admin 공용 셸과 각 페이지 bundle을 최적화하지 않으면 크게 변하지 않는다.

### Phase 1 전후 필수 측정

- `/`, `/admin/login`, `/admin/calendar`, `/admin/crm`, `/admin/hardware`의 초기 JS gzip 합계
- Admin HTML의 공개 제3자 스크립트 포함 여부
- 첫 콘텐츠 표시와 hydration 완료 시점
- Admin 주요 API의 서버 응답 시간과 클라이언트 로딩 시간
- 전체 빌드 시간과 앱별 빌드 시간

속도 개선 판정은 위 수치로 하고, 구조 분리 자체를 성능 개선으로 간주하지 않는다.

## 8. AI와 작업 지침

- AI 작업 범위는 Phase와 앱 소유권을 프롬프트에 명시한다.
- 분리 전에는 이 문서와 Admin 지침 맵을 함께 읽는다.
- `apps/site`, `apps/admin`이 생기면 각 디렉터리에 범위가 좁은 `AGENTS.md`를 둔다.
- 공용 패키지 변경은 Site와 Admin 양쪽 소비자를 검색하고 검증한다.
- 기계적인 이동·import 수정은 AI를 사용하되 인증·쿠키·도메인·Cron·Webhook 운영 검수는 사람이 승인한다.
- 서로 다른 worktree에서 같은 공용 레이아웃·설정 파일을 동시에 수정하지 않는다.

## 9. 변경하지 않는 것

이번 분리와 동시에 다음을 수행하지 않는다.

- 별도 GitHub 저장소 생성
- Supabase 프로젝트 또는 DB 정본 분리
- Next.js·React·Tailwind 업그레이드
- 대규모 UI 리디자인
- 모든 API·Cron·Webhook 일괄 이동
- Turborepo·Nx 도입
- 공개·Admin 데이터 모델 복제

## 10. 검증과 롤백

각 Phase는 독립적으로 배포·되돌릴 수 있어야 한다.

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

workspaces 전환 후에는 위 검증을 Site와 Admin 앱별 명령으로 분리하고, 루트 명령은 양쪽을 모두
검증하도록 유지한다.

운영 전환 중에는 파괴적 DB migration을 함께 배포하지 않는다. 공용 DB 계약 변경이 필요하면 이전
Site·Admin 버전과 호환되는 additive migration을 먼저 배포한다. Admin 도메인 전환은 기존
`/admin` 진입점을 유지한 상태에서 Preview → 전용 도메인 → 리디렉트 순으로 진행한다.

## 11. 관련 기준

- [문서 인덱스](../README.md)
- [Admin 작업 지침 맵](admin-guidance-map.md)
- [Admin OS 운영 결정](admin-os-operating-decisions-2026-07-11.md)
- [어드민 탭 재구성](admin-tab-restructure-2026-07-29.md)
- [아키텍처·스키마·ERD](architecture-schema-erd.md)
- [ADR 작성 규칙](../adr/README.md)
