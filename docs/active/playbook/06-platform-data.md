# 파트 가이드 — 플랫폼 & 데이터 인프라

> 담당 에이전트: `.claude/agents/platform-data.md`

## 1. 책임 범위

모든 도메인이 공유하는 Supabase 클라이언트와 마이그레이션 기반, Portal V2 인증/인가, 결제 기반, cron·웹훅·알림·OAuth/identity, 공용 검증 설정을 소유한다.

- `lib/supabase/*`, `supabase/migrations/*`
- `lib/portal/*`, `app/api/portal/**`, 파트너 share/auth 표면
- `lib/server/software-checkout.ts`, `lib/billing/*`, `app/api/billing/**`, checkout/receipt 기반
- `app/api/cron/**`, `app/api/webhook/**`, `lib/notifications/*`
- `lib/auth/*`, `lib/identity/*`, `lib/storage/*`, `lib/regions/*`
- `next.config.ts`, `vercel.json`, `eslint.config.mjs`, `vitest.config.ts`의 공용 기반 규칙

Platform은 `lib/server/*`, `app/api/*`, `tests/*` 전체를 소유하지 않는다. 예를 들어 `lib/server/lead-capture.ts`와 리드 테스트는 Growth 소유다. 테스트의 소유권은 검증 대상 도메인을 따르며, Platform은 테스트 인프라와 공통 게이트만 관리한다.

## 2. 핵심 계약

### Supabase 클라이언트

- `createSupabaseAdminClient()`: service-role 기반 서버 작업과 어드민 API
- `createSupabaseServerClient()`: 로그인 사용자의 쿠키와 RLS를 적용하는 SSR 경로

어드민 API에서 server client를 사용하면 `auth.uid()`가 기대와 달라 빈 결과가 반환될 수 있다. 반대로 사용자 격리가 필요한 Portal SSR에서 admin client를 무비판적으로 사용하지 않는다.

### 마이그레이션

- 적용·검증 절차는 [DB 마이그레이션 런북](../db-migration-runbook.md)을 따른다. 확인은 `npm run check:db`.
- 새 migration을 추가하면 `lib/db/schema-contract.ts`의 프로브도 같은 커밋에서 추가한다.
  프로브가 없으면 적용 여부를 나중에 아무도 확신하지 못한다.
- 타입과 repository 쿼리는 실제 DB 스키마와 동시에 변경한다.
- 새 migration은 `supabase/migrations/YYYYMMDD_설명.sql` 형식과 idempotent 구문을 사용한다.
- 금융·관리자 전용 테이블은 생성 즉시 RLS를 활성화하고 정책을 명시한다.
- migration 적용 여부와 feature flag를 확인하기 전 JSON/Supabase 운영 모드를 단정하지 않는다.

### Portal V2 인가

- route는 `requirePortalContext()`로 same-origin과 인증을 확인한다.
- partner는 `authorizeForAccount()`로 대상 `partner_account_id`를 검증한다.
- write 시 body의 account ID를 신뢰하지 않고 `resolvePartnerAccountId()`로 서버 컨텍스트를 강제한다.
- 데이터 구현은 `lib/portal/repositories/`에 둔다.

### 결제·cron·웹훅

- 결제 confirm은 저장 금액, 요청 금액, 결제사 응답 금액, checkout token, 최종 상태를 교차 검증하고 멱등성을 유지한다.
- 사용 횟수처럼 경쟁 조건이 있는 카운터는 원자적 RPC/트랜잭션을 사용한다.
- cron은 `CRON_SECRET`과 Vercel cron 요청 여부를 검증한다.
- Vercel 플랜은 명시 확인 전 Hobby로 보고 각 `vercel.json` cron은 하루 1회 이하로 둔다. sub-daily 작업은 외부 스케줄러나 플랜 결정을 먼저 한다.
- 웹훅은 공급자 계약에 맞는 HMAC/서명 검증과 timing-safe 비교를 사용한다.

## 3. 도메인 경계

- Admin Core는 어드민 인증·role/capability 규약을 소유하고 Platform은 Supabase·RLS 기반을 제공한다.
- Growth는 리드/CRM/영업 repository와 워크플로를 소유한다. Platform은 스키마·클라이언트·결제 기반 규약을 제공한다.
- Content와 Chatbot은 각자의 문서/검색 데이터를 소유한다. Platform은 migration과 DB 계약 검증을 지원한다.
- `data/*.json` 듀얼모드의 파일 I/O 규약은 Platform과 함께 검토하되, 어떤 데이터가 정본인지와 전환 시점은 해당 도메인이 결정한다.
- `admin_profiles`는 운영 관리자 프로필 정본이다. `ADMIN_USERS`/`ADMIN_PASSWORD` 레거시 폴백 정책은 Admin Core 가이드를 따른다.

## 4. 검증

기본 게이트는 다른 파트와 같은 순서다.

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

변경 범위에 따라 추가한다.

```bash
npx vitest run
npm run check:vercel-crons
```

- migration 변경: 타입 → repository 쿼리 → SQL → 적용 → feature flag → smoke test 순서 확인
- Portal 변경: 다른 partner account의 직접 접근이 403인지 확인
- 결제 변경: 금액 불일치, 중복 confirm, 잘못된 token/status 회귀 확인
- cron 변경: `npm run check:vercel-crons` 필수
- 챗봇 DB/RPC 변경: `npm run check:alpha-db` 추가

## 5. 먼저 읽을 것

1. `lib/supabase/admin.ts`, `lib/supabase/server.ts`
2. `lib/portal/portal-context.ts`, `lib/portal/portal-authorize.ts`
3. 변경 대상의 repository와 관련 migration
4. 결제 변경이면 `lib/server/software-checkout.ts`, `lib/billing/*`
5. cron 변경이면 `vercel.json`과 `scripts/check-vercel-crons.mjs`
