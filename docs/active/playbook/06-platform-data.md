# 파트 가이드 — 플랫폼 & 데이터 인프라 (Platform / Data)

> 담당 에이전트: `.claude/agents/platform-data.md`(이 가이드를 SSOT로 참조) · 기준 시점: 2026-06-23
> 변경 검증: `npx eslint app components lib --max-warnings=0` + `npm run build`

## 1. 파트 한 줄 정의

다른 모든 파트가 올라가는 **공유 데이터/플랫폼 기반층** — Supabase(service-role admin vs SSR partner 클라이언트 분리), `supabase/migrations/` 마이그레이션 규율, Portal V2 API + 통합 인증/인가(`portal-context` → `portal-authorize`), 소프트웨어 결제 백엔드(Toss), Vercel Cron 자동화, 알림 파이프라인, OAuth/identity, `data/*.json` ↔ Supabase 듀얼모드 저장소, 그리고 검증 게이트.

## 2. 핵심 디렉토리/파일 맵

- `lib/supabase/admin.ts` — service-role 싱글톤 admin 클라이언트(RLS 우회). 어드민/공개 API 표준 진입점.
- `lib/supabase/server.ts` — `@supabase/ssr` 쿠키 기반 클라이언트(RLS 적용). 로그인 파트너 SSR 전용.
- `lib/supabase/database.types.ts` / `database.types.v2.ts` — DB 타입 단일 원천(v2=partner portal V2).
- `lib/supabase/middleware.ts`, `pagination.ts`, `public-env.ts`, `server-env.ts` — 세션 동기화·페이지네이션·환경변수 게이트.
- `supabase/migrations/` — SQL 마이그레이션(`YYYYMMDD_설명.sql`). 스키마/RLS의 진실 원천.
- `lib/db.ts` — 레거시 JSON 저장소(`data/*.json`)의 leads/settings 폴백(`atomic-write` 사용).
- `lib/portal/portal-context.ts` — 통합 컨텍스트 resolver: partner(Supabase cookie) → admin(Bearer) 순서. `requirePortalContext`가 same-origin + 401 가드.
- `lib/portal/portal-authorize.ts` — 인가 핵심: `authorizeForAccount`(partner는 자기 `partner_account_id`만, admin 통과), `resolvePartnerAccountId`(write 시 partner account 강제 주입).
- `lib/portal/context.ts` — `resolvePartnerAccountContext`: Supabase 유저 → `partner_account_users`(v2)/`partner_users`(legacy) 매핑.
- `lib/portal/repositories/` — Portal V2 데이터 접근(deals, quote-documents, contract-documents, activity, payments 등).
- `app/api/portal/**/route.ts` — Portal V2 라우트. 모두 `requirePortalContext` + `authorizeForAccount` 패턴.
- `app/share/quote/[token]/page.tsx`, `app/share/contract/[token]/page.tsx` — 토큰 기반 공개 견적/계약 뷰(`force-dynamic`, noindex).
- `lib/server/software-checkout.ts` + `app/api/billing/checkout/{prepare,confirm,fail}/route.ts` + `lib/billing/{toss,promo-codes,quote-codes,fx}.ts` — Toss 결제 백엔드, 금액·토큰·멱등성 검증.
- `app/api/cron/**` + `vercel.json`(crons) + `lib/automation-engine.ts` — 일배치 cron, `Bearer CRON_SECRET` + `x-vercel-cron` 인증.
- `lib/notifications/repository.ts` + `emit-event.ts` + `app/api/webhook/channel-talk/route.ts` — 알림 이벤트(HMAC 검증 웹훅 유입), 항상 admin 클라이언트.
- `lib/auth/`(`guards.ts`, `public-user.ts`, `session-logout.ts`) + `app/auth/callback/route.ts` + `lib/identity/stitch.ts` — OAuth 콜백, public user upsert, 익명→유저 identity stitch.

## 3. 가장 중요한 업무

- Supabase 클라이언트 선택 규율 강제(admin vs server) — 잘못 쓰면 빈 배열/무음 차단.
- 모든 스키마/타입 변경에 마이그레이션 파일 동반(silent INSERT 실패 방지).
- Portal V2 인가 게이트(`authorizeForAccount`) — partner 데이터 격리 보장.
- 결제 confirm 경로의 금액·토큰·Toss 응답 교차검증 + 멱등성.
- Cron 인증 + 듀얼모드(JSON↔Supabase) 저장소 일관성.
- 검증 게이트(eslint 0 warning + build) 통과.

## 4. 지침 & 규칙

- **마이그레이션 규율**: `database.types.ts`/repo INSERT에 컬럼 추가 시 반드시 `supabase/migrations/YYYYMMDD_설명.sql`(`ADD COLUMN IF NOT EXISTS`)를 함께. 순서: 타입 → repo INSERT → migration SQL → 적용(`supabase db push` 또는 대시보드 SQL Editor). 빠뜨리면 "column does not exist"로 INSERT가 catch에 먹혀 무음 실패.
- **RLS + admin 클라이언트**: 어드민/service API는 항상 `createSupabaseAdminClient()`. `createSupabaseServerClient()`는 `auth.uid()` null → `is_active_admin()` false → 전 행 차단, 로그인 파트너 SSR에서만 사용.
- **Portal 인가**: 라우트는 `requirePortalContext`(same-origin + 인증) → partner면 `authorizeForAccount(ctx, resource.partner_account_id)`로 403 가드. write는 `resolvePartnerAccountId`로 partner account 강제 주입(클라이언트 값 신뢰 금지).
- **듀얼모드 저장소**: `USE_SUPABASE_*` 플래그(`USE_SUPABASE_LEADS`, `USE_SUPABASE_DOCS`, `USE_SUPABASE_BLOG`)로 JSON↔Supabase 전환. `lib/repositories/leads.ts`가 패턴 표준. 운영은 모두 `true`.
- **RLS deny-all 기본**: 금융/관리자 전용 테이블은 생성 즉시 RLS enable + service-role 전용(예: `20260423_rls_admin_only_tables.sql`, `20260416_rls_financial_tables.sql`).
- **검증 게이트**: `npx eslint app components lib --max-warnings=0` + `npm run build`(prebuild `check:vercel-crons`, postbuild `check:public-content`).
- **Cron 인증**: `process.env.VERCEL && !x-vercel-cron` → 401, 추가로 `Authorization: Bearer ${CRON_SECRET}` 일치 필수.
- **웹훅 인증**: HMAC-SHA256 + `timingSafeEqual` 서명 검증.

## 5. 절대 깨면 안 되는 것 / 주의점

- **누락 마이그레이션 = 무음 INSERT 실패**: 실제로 `follow_up_at`/`assigned_to`가 타입엔 있고 DB엔 없어서 문의 접수가 통째로 저장 안 된 사고 발생. 컬럼 추가 시 migration 절대 누락 금지.
- **RLS 차단 = 빈 배열**: 어드민 경로에서 server 클라이언트 쓰면 SELECT/UPDATE/DELETE 전부 막혀 `{"leads":[]}`. admin 클라이언트 고정.
- **Portal authz 우회**: partner 라우트에서 `authorizeForAccount` 또는 partner_account 필터를 빠뜨리면 타 파트너 데이터 노출. write는 body의 `partnerAccountId`를 믿지 말고 `resolvePartnerAccountId`로 덮어쓸 것.
- **JSON↔DB drift**: `USE_SUPABASE_*` 플래그 환경별 불일치 시 데이터가 두 곳으로 갈림. 여전히 JSON-only(폴백)인 엔티티 다수(예: `channel-conversations`, `event-metrics`, `lead-magnets`, 레거시 `settings.json`/`leads.json`) — 마이그레이션 여부 개별 확인.
- **결제 검증**: confirm 라우트에서 저장 금액 == 요청 금액 == Toss 응답 금액 + checkout token + status==="DONE" 모두 통과해야 paid 마킹. 멱등(paid+동일 paymentKey면 기존 반환). 느슨해지면 결제 위변조.
- **promo used_count**: 반드시 RPC(`increment_promo_code_used_count`)만(SELECT+UPDATE 조합은 race).
- **신규 금융 테이블**: 생성 즉시 RLS enable(deny-all) 안 하면 anon 키로 노출.

## 6. 관련 문서

- `docs/active/supabase-backend-masterplan.md` — Supabase 백엔드 마스터플랜.
- `docs/active/architecture-schema-erd.md` — 스키마 ERD.
- `docs/active/supabase-migration-checklist-2.22.md` — 배포 순서·미적용 마이그레이션·smoke test(가장 실용적).
- `docs/active/partner-portal-master-spec.md`, `partner-portal-front-back-contract.md`, `partner-portal-document-hub-execution-plan.md`, `partner-portal-unification.md` — Portal V2 스펙·계약·통합.
- `docs/active/notification-architecture-plan.md` — 알림 아키텍처.
- `docs/active/software-checkout-revamp-plan.md`, `quote-lifecycle-execution-plan.md` — 결제 개편·견적 라이프사이클.
- `docs/adr/README.md` — ADR 규칙(본문 미작성, 후보만 나열).

## 7. 현재 목표 & 백로그 (2026-06-23 스냅샷)

- **결제 개편 잔여**: P0 — 미커밋 파일 정리, Vercel 환경변수(KRW→USD) 교체, 마이그레이션 3종(20260415/20260416/rls_financial) 순서 적용. P1 — 구매 주체 한국 법인 확인(중국 기관 직결 시 Toss KRW 부적합 → Alipay/WeChat), 견적코드 `QB-YYYY-XXXX`(4자리=브루트포스 가능) → 암호학적 8자리. P2 — FX 캐시 in-memory → KV/Supabase, validate 엔드포인트 rate limiting, 결제완료 이메일, 어드민 구독 뷰, redemption 실패 알림.
- **Supabase 마이그레이션 체크리스트(2.22)**: base 스키마 재현, `blog_posts.visibility` 선택 적용, quote approval enum 보강. 배포 후 docs/blog/quote smoke test.
- **Portal 통합**: legacy `partner_users` ↔ v2 `partner_account_users` 통합. `context.ts`에 아직 이중 경로 존재.
- **성능**: 어드민 SQL 집계 마이그(`20260618_*`) 적용, commercial/CRM 라운드트립 축소 완료.

## 8. 검증 방법

```bash
# 품질 게이트
npx eslint app components lib --max-warnings=0
npm run build      # prebuild=check:vercel-crons, postbuild=check:public-content

# 타입체크 / 테스트
npm run typecheck  # tsc --noEmit
npx vitest run     # tests/ (db/, api/, regions/ 등)
npm run check:vercel-crons   # vercel.json cron 스케줄 검증
```

**마이그레이션 적용 절차**: 1) 타입(`database.types.ts`) → 2) repository INSERT → 3) `supabase/migrations/YYYYMMDD_설명.sql`(`IF NOT EXISTS`로 idempotent) → 4) 적용(`supabase db push` 또는 SQL Editor) → 5) `USE_SUPABASE_*` 확인 → 6) smoke test. 재실행 시 `CREATE POLICY` 중복 에러 주의(`drop policy if exists`). 의존 마이그레이션은 순서대로 동시 배포.

## 9. 작업 시작 시 먼저 읽을 것

1. `CLAUDE.md` — 코드 규칙·검증 게이트.
2. `lib/supabase/admin.ts` + `lib/supabase/server.ts` — 두 클라이언트의 차이(빈 배열/무음 INSERT 함정의 근원).
3. `lib/portal/portal-context.ts` + `lib/portal/portal-authorize.ts` — Portal V2 인증/인가 전체 흐름.
4. `docs/active/supabase-migration-checklist-2.22.md` — 실제 배포 순서·적용 상태.
5. `lib/repositories/leads.ts`(듀얼모드 표준) + `lib/server/software-checkout.ts` — 저장소 패턴 및 결제 백엔드.
