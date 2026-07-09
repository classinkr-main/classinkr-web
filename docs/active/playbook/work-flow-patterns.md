# 반복 함정·에러 패턴 & 기계형 표준 작업 체크리스트 — 파생 인덱스

> **이 문서는 canon/guide/코드에서 파생한 인덱스이며, 권위는 원본에 있다.** 값·규칙의 정본은 각 SSOT 파일(`lib/classin-positioning.ts`, `lib/analytics.ts`, `supabase/migrations/`, `lib/chatbot/llm.ts` 등)과 아래 출처 문서다. 충돌 시 신뢰 순서는 **실제 코드+검증 결과 > 캐논(`classin-operating-canon-2026-07-02.md`) > 파트 가이드/제품 문서 > `docs/archive/` 역사기록** (canon §8, work-application-plan §4.2). 사실이 바뀌면 원본을 먼저 갱신하고 이 인덱스는 뒤따른다.
>
> 주요 출처 약칭: **canon** = `docs/active/classin-operating-canon-2026-07-02.md` · **plan** = `docs/active/classin-work-application-plan-2026-07-03.md` · **pb0N** = `docs/active/playbook/0N-*.md` · **AGENTS** = `AGENTS.md`

---

## A. 반복 함정·에러 카탈로그

### A-1. 무음 실패(silent) 계열 — 최우선

이 계열의 공통 성질: **빌드·린트·타입체크가 잡지 못하고, 에러도 안 나며, 운영 중 데이터가 조용히 사라지거나 잘못 나간다.**

| 증상 | 원인 | 예방·체크 | 출처 |
|------|------|-----------|------|
| 어드민 API가 `{"leads":[]}` 등 빈 배열만 반환(에러 없음) | 어드민 경로에 `createSupabaseServerClient()` 사용 → Bearer 인증이라 `auth.uid()=null` → RLS `is_active_admin()` false → 전 행 차단 | 어드민 데이터 접근은 반드시 `createSupabaseAdminClient()`(service-role). 새 repo/route에 server 클라이언트 유입 여부 grep | canon §8, pb02 §5, pb06 §5, plan §4.2 |
| INSERT가 통째로 저장 안 됨(문의 접수 유실) | 타입/repo INSERT엔 컬럼이 있으나 DB엔 없어 `column does not exist`가 catch에 먹힘. 실제 `follow_up_at`/`assigned_to` 사고 | 컬럼 추가 시 `supabase/migrations/YYYYMMDD_*.sql`(`ADD COLUMN IF NOT EXISTS`) 동반+적용. 순서: 타입→repo→SQL→적용 | canon §8, pb06 §4·§5, plan §4.2, `public-auth-identity-ladder-2026-06-24.md:176` |
| 저장한 데이터가 배포 후 사라짐 | JSON 파일 저장소가 Vercel 서버리스 read-only FS에서 쓰기 유실. 현재 JSON-only: `channel-conversations`·`lead-magnets`·`event-metrics`·레거시 `settings.json`/`leads.json` | 공개 리드 제출은 JSON fallback 금지(Supabase). `cs_tickets` 영속화 대기. 저장소 모드 변경 시 `npx vitest run tests/repositories/leads-mode.test.ts` | canon §8, pb04 §7, pb06 §5, AGENTS 리드 규칙, `erp-blueprint-2026-06-22.md:83` |
| 새 추적 이벤트가 아무 데도 안 잡힘(무음 드랍) | `EventNames`(타입, `lib/analytics.ts:8`)와 `ALLOWED_EVENTS`/`ALLOWED_PARAM_KEYS`(`app/api/track/event/route.ts:6,25`) **둘 중 한쪽만** 등록 | 신규 이벤트는 양쪽 동시 등록 + 파라미터 화이트리스트 + PII redaction. `client_events` 마이그(`20260429_client_events.sql`) 적용 필수 | canon §8, pb04 §4·§8, plan §4.1 |
| 리드마그넷 새 필드가 admin 저장 순간 JSON에서 영구 유실 | `lib/lead-magnets.ts`(타입)만 고치고 `lib/repositories/lead-magnets.ts`의 `normalizeLeadMagnet` 화이트리스트를 안 고침 | `LeadMagnet` 새 필드는 타입 + `normalizeLeadMagnet` **둘 다** 갱신 | canon §6 스키마 함정, plan §3.6 |
| 챗봇이 검색 raw 청크를 그대로 노출 | Gemini가 조용히 실패했는데 폴백이 raw 청크를 뱉음 | 3중 방어선: `isUsableGeneratedAnswer`(앵커·종결어미·길이≥24) + `resolveModelChain` 폴백 + `clampAnswerToLength`. 스트리밍 경로도 동일 게이트 | pb05 §3·§5, canon §7, `chatbot-top1pct-redesign-2026-06-24.md:24` |
| 챗봇 응답이 빈/잘린 채로 나가 게이트 거부→raw 폴백 (thinking-token drain) | `gemini-2.5-flash`에 thinking을 켜면 thoughts가 `maxOutputTokens`를 소진 | `2.5-flash`는 `thinkingBudget:0` 유지(`lib/chatbot/llm.ts:255`). 모델 변경 전 운영 이력 재확인(과거 `gemini-3.1-pro` 404·`3.5-flash` 503 강행 사고) | pb05 §5, `chatbot-top1pct-redesign-2026-06-24.md:25` |
| 멀쩡한 챗봇 답이 통째로 버려짐 | `clampAnswerToLength`를 naive slice로 하면 문장 경계 안 지켜 게이트 탈락 | 문장 경계 보존 클램프 유지 | pb05 §5 |
| 프롬프트/스키마 바꿨는데 stale 답변이 5분간 노출 | `ANSWER_CACHE_VERSION`/`RETRIEVAL_CACHE_VERSION` 미bump | 답변/검색 스키마·프롬프트 변경 시 캐시 버전 bump | pb05 §5 |
| 자동화 규칙 실패가 로그·알림 없이 사라짐 | `triggerOnSubmitRules` 최상위 catch 무음 + `executeDelayQueueItem`의 `automation_logs` 미기록 갭 | 발송 전체 실패는 `emitNotificationEvent`로 에스컬레이션 승격. 규칙 channel 컬럼은 마이그레이션 동반 | `marketing-automation-design-2026-07-03.md:80,364,564,568` |
| 폼 제출 성공 UI는 뜨는데 리드가 아무 데도 안 남음(가짜 성공) | `sendToWebhook`/`Sheet`/`ChannelTalk`가 env 없으면 `return`, `Promise.allSettled`가 이를 성공(fulfilled)로 집계 → `ok:true` | 저장 실패를 성공으로 숨기지 않음. 저장·전달 모두 실패 시 502+재시도 허용, 중복 캐시에 남기지 않음. `npx vitest run tests/api/lead-capture.test.ts` | `error-fix-notes.md:28`, `prd.md`, AGENTS 리드 규칙, pb04 §5 |
| 결제는 paid인데 견적/프로모 redemption이 조용히 실패(audit 불완전) | post-payment `try { await redemption } catch { console.error }` | redemption 실패 알림/런북 필요(현재 갭). confirm 이후 실패 가시화 | `software-checkout-revamp-plan.md:525,886`, pb06 §5 |
| 프로모 사용 한도가 조용히 우회됨 | RPC 실패 시 `SELECT`+`UPDATE` 조합 race — 동시 confirm 둘 다 `used_count=5` 읽고 둘 다 `6` write | 반드시 `increment_promo_code_used_count` RPC만. 폴백 UPDATE에 `WHERE used_count < usage_limit` | `software-checkout-revamp-plan.md:969`, pb06 §5 |
| 환율이 틀린 값으로 조용히 결제됨 | module-level in-memory FX 캐시가 서버리스 cold start마다 소실 → 매번 라이브 fetch, 무료 티어 소진 시 하드코딩 폴백(무음) | FX 캐시 KV/Supabase 이전 대기. 폴백 시 사용자 가시성 필요 | `software-checkout-revamp-plan.md:339,978`, pb06 §7 |

### A-2. 통화·매출 원장 계열 (canon "최대 함정")

**통화가 객체별로 다르다 — "전부 CNY" 단정은 틀림.** 오더=**USD**(`$`, 매출과 동급·2급 격하 금지) / 매출·수금·잔액·미수·REV 목표=**CNY**(`¥` 만단위 2자리) / 딜 예상=**KRW**(`₩`).

| 증상 | 원인 | 예방·체크 | 출처 |
|------|------|-----------|------|
| HW 원장 데이터 상호 덮어씀 | 파일임포트와 라이브싱크가 둘 다 `source='sheet_import'` replace | replace/merge 두 RPC의 컬럼(`unit_price`/`amount_usd`)·`source_digest` 해시 패리티 필수. 원가 NULL 유실은 빌드가 못 잡음 → 수동 확인 | canon §8 |
| 출고 매출의 CNY가 유실 | HW 시트 `3.출고 현황`에 USD+CNY 실존하나 USD만 캡처 | 출고→딜 매출 반영 시 CNY 동반 캡처 | canon §8 |
| 홈 대시보드·매출추이 차트가 CNY를 ₩로 표기(활성 버그) | 통화 태깅 없이 원화로 렌더 | `formatCNY`/`formatKRWAbbrev`/`CRM_CURRENCY_BADGE`로 소급교정(Phase 0) | canon §5, plan §3.2 |
| 서로 다른 통화가 한 grand total로 합산 | 원장 간(USD 오더/CNY 수금/KRW REV) 매출 합산 | grand total 금지, 통화별 별도 라벨, confirmed 매출 1개만 헤드라인 | canon §5, `crm-merge-redesign-2026-06-24.md:66,208` |
| 표시 합계가 시트 합계보다 큼(정렬-표시 모순) | REV 셀/소계가 `rowMonthAmount > 0`만 통과시켜 음수 월 드랍, 정렬용 합산은 음수 포함 | 음수 월 포함 일관 처리 | `rev-tab-audit-2026-07-03.md:27` |
| 매출 이중계상 | 레거시 contracts/receipts + V2 deals 무비판 합산 | `crm_source_links` status=confirmed로만 dedupe 합산, 미확정은 "검토 대기"로만 노출 | pb04 §5 |
| 매출 절반이 조용히 누락(키스톤 리스크) | 스파인·귀속·HW→SW·리뉴얼 전부 `crm_source_links` 매칭 커버리지 의존 | **커버리지 자체를 먼저 측정**한 뒤 자동화 부착 | `erp-blueprint-2026-06-22.md:32`, plan §3.4 |

### A-3. 코드/런타임 함정

| 증상 | 원인 | 예방·체크 | 출처 |
|------|------|-----------|------|
| 브라우저에서 env 값이 `undefined` | `process.env[name]` 동적 접근 — `NEXT_PUBLIC_*`는 빌드 타임 리터럴 치환만 됨 | 항상 리터럴 접근(`process.env.NEXT_PUBLIC_X`). *현재 코드에 동적 접근 0건(규칙 유지 중)* | canon §8 |
| API 키 노출 | 키 하드코딩 | 항상 `process.env.GEMINI_API_KEY` 등. 모델: `gemini-3-pro-preview`[blog]/`gemini-2.5-pro`[marketing] | canon §8, AGENTS |
| 포털 홈 우측 탭 가로 오버플로우 | CSS Grid bare `1fr` | `minmax(0,1fr)` + `min-w-0` | canon §8 |
| 진입 애니메이션이 아무 동작 안 함(no-op) | `animate-in`/`slide-in-*` tailwind 유틸 plugin 미설치 | 애니메이션은 framer-motion으로 | canon §8 |
| sticky 요소가 안 붙음 | body `overflow-x:hidden`이 sticky 파괴 | 어드민은 app-shell 스크롤로 회피. REV 매트릭스는 max-height+overflow-y 컨테이너 | canon §8, `rev-tab-audit-2026-07-03.md:96` |
| 헤더 겹침/히어로 레이아웃 깨짐 | Hero `sticky top-[76px]` + `100svh`가 헤더 높이(76/80px)에 의존 | 헤더 높이 변경 시 동반 수정 | pb01 §5 |
| pgvector 검색 거부 | `match_docs_ai_chunks`에 임베딩 배열을 직접 전달 | `JSON.stringify`로 문자열 전달 | pb05 §5 |
| convert-v2 중복 실행 | 멱등성이 notes 텍스트 마커에 의존 | 마커 문자열 보존 | canon §8 |

### A-4. 콘텐츠·PII·톤 계열

| 증상 | 원인 | 예방·체크 | 출처 |
|------|------|-----------|------|
| 문서에 중국어 한자 잔재(`特写`/`板书`/`投屏`) | channel.io/중국 원문 기반 | HW 문서(cam/mic/board-s-series) 작성·수정 후 `[一-鿿]` 스캔 필수 + 조사 깨짐(클로즈업를→클로즈업을) 점검. `lib/docs.ts`는 한국어 전용 | canon §4·§7, pb03 §4, plan §2.2·§5.2 |
| 공개 표면에 내부 메모 노출 | `TBD`/`placeholder`/`준비 중`/`확인 필요` 잔존 | 미확정은 (1)공개 안 함 (2)일반화 (3)내부 분리 중 택1 | canon §7, pb03 §4, pb01 §4, plan §2.2 |
| 어드민 수기 편집본이 덮어써짐 | `seed-docs.ts` 재실행·sync upsert가 정적 버전으로 overwrite | sync는 `updated_by=sync-channel-documents`만 대상, `updated_by=classin-admin`은 절대 안 건드림. D1(문서 Supabase 단일화)은 이 리스크로 보류 | pb03 §5, canon §7, `content-roadmap-...:17`, `docs-center-content-guidelines.md:116` |
| 학생/교사 PII 노출 | CS-Figma 합성 이미지의 로그인ID·계정명·전화 | `CS_FIGMA_PII_KEYWORD_RE` + `sanitizeGuideStep` + 이미지 블러. 단 원본 PNG PII가 git 히스토리에 잔존(history rewrite 필요) | pb03 §4·§5 |
| 챗봇이 같은 주제 출처 중복 노출 | seeded(`lib/docs.ts`)와 channel 문서가 동일 주제 | `selectDiverseSources` 중복제거 유지(`tests/chatbot/source-dedup.test.ts`) | pb03 §5 |
| 지원 표면에 공포 카피 | 홈/랜딩용 긴장·손실 카피를 문서센터/이메일/챗봇에 복붙 | 표면별 톤 분기: 홈=긴장 허용, 지원/제품/챗봇=안심·행동 안내 | canon §4, plan §2.2 |

### A-5. 인증·인가·결제·디자인 계열

| 증상 | 원인 | 예방·체크 | 출처 |
|------|------|-----------|------|
| 로컬은 로그인 되는데 배포본은 "비밀번호 오류" | `ADMIN_USERS`/`ADMIN_PASSWORD`가 Vercel env에 없거나 `ADMIN_USERS`(우선) JSON 오류. env 변경은 재배포 전 미반영 | 배포/Redeploy 필수, `NEXT_PUBLIC_` 접두사 금지, 실패 원인 구분형 메시지 유지 | `error_handle.md` |
| 프로덕션 로그인 전면 불가 | `encodeSession`이 `SESSION_SECRET`(또는 dev `ADMIN_PASSWORD`) 없으면 throw | 프로덕션 env 존재 확인 | pb02 §5 |
| 어드민 인증이 프로덕션에서 우회됨 | bypass는 dev+`NEXT_PUBLIC_SKIP_ADMIN_AUTH`+non-Vercel 한정인데 켜짐 | `lib/admin-env.ts`가 Vercel에서 코드로 차단 | pb02 §5, canon §8 |
| 라우트 1개 무가드 = 전체 노출 | 심층방어 부재(178 라우트 전수 가드지만 단일 실수에 취약) | 새 `app/api/admin/**`는 `verifyAdmin()`/`requireVerifiedAdminContext()`. `grep -L "verifyAdmin\|requireVerifiedAdminContext" app/api/admin/**/route.ts` (면제는 auth 진입점 2개뿐) | canon §8, pb02 §4·§8 |
| 타 파트너 데이터 노출 | Portal 라우트에서 `authorizeForAccount`/partner_account 필터 누락 | `requirePortalContext` → `authorizeForAccount`. write는 body `partnerAccountId` 불신, `resolvePartnerAccountId`로 강제 주입 | pb06 §5 |
| anon 키로 금융 테이블 노출 | 신규 금융/관리자 테이블 RLS deny-all 미설정 | 생성 즉시 RLS enable + service-role 전용 | pb06 §5 |
| 결제 위변조 | confirm 검증이 느슨 | 저장금액==요청금액==Toss응답금액 + checkout token + `status==="DONE"` 모두 통과해야 paid. 멱등(동일 paymentKey면 기존 반환) | pb06 §5 |
| 견적코드 브루트포스 | `QB-YYYY-XXXX` 4자리 | 암호학적 8자리로 강화(P1) | pb06 §7 |
| 파랑/보라 등 non-green 포화색·두꺼운 보더 | DESIGN.md 팔레트 이탈(예: VIP 보라, 인라인 신호색 26건) | 유일 포화색 그린 `#084734`(액센트만), 보더 `1px solid rgba(0,0,0,0.08)`, 섹션 배경 `#FFFFFF↔#F6F5F4↔#ECFDF5` | canon §4, pb01 §4, `crm-9.5-prd-and-plan-2026-06-30.md:177` |
| 병렬 작업이 서로 덮어씀 | 같은 브랜치에서 같은 파일 동시 수정·커밋 | 동시 편집 파일 조율, 인계 시 확정본 기준 | `crm-ia-phase3-plan-2026-06-12.md:75` |

---

## B. 기계형 표준 작업 체크리스트

각 유형은 순서대로 수행한다. 모든 유형의 **완료 게이트(공통)**:
```bash
npx eslint app components lib --max-warnings=0
npm run build   # prebuild=check:vercel-crons, postbuild=check:public-content
```

### B-1. 신규 admin API 라우트 (정석: `app/api/admin/settings/route.ts` + `lib/repositories/settings.ts`)
1. 라우트 최상단 `verifyAdmin(req, allowedRoles?)` 호출 → 반환 `NextResponse`(401/403) 즉시 return.
2. unsafe 메서드(POST/PATCH/DELETE)는 `verifySameOriginRequest()` 통과 확인.
3. 데이터 접근은 `createSupabaseAdminClient()`만 (server 클라이언트 절대 금지).
4. 로직은 `lib/repositories/<도메인>.ts`(`"server-only"` + admin 클라이언트)에 두고 route는 가드만.
5. 응답: 성공 `NextResponse.json` / 캐시형 `adminCachedJson(payload)` / 에러 `{ error, code? }`+상태코드.
6. 검증: 공통 게이트 + `grep -L "verifyAdmin\|requireVerifiedAdminContext" app/api/admin/**/route.ts`로 누락 확인.
> 출처: pb02 §4·§8, canon §8 철칙 2, plan §4.1

### B-2. 신규 공개 페이지
1. `createPublicMetadata`로 canonical/OG/twitter 부착(`lib/seo.ts`).
2. 적절한 JSON-LD 주입(`components/seo/JsonLd.tsx`).
3. `app/sitemap.ts`에 라우트 등록(canonical과 동기화).
4. 비공개면 `app/robots.ts` disallow + `noIndex:true` 확인(`/admin /api /checkout /receipt /unsubscribe` 상시 차단).
5. 팔레트/보더/섹션 배경 교차/모바일 letter-spacing 0/포커스 링·reduced-motion 준수.
6. 카피는 `lib/classin-positioning.ts` 기준(가격·국내 기관/보드 수 단정 금지→상담).
7. below-the-fold `next/dynamic`, 히어로 영상 조건부+idle.
> 출처: pb01 §4·§5·§8, canon §8 철칙 6·7, plan §4.1

### B-3. 새 추적 이벤트
1. `lib/analytics.ts`의 `EventNames` 유니온에 추가(`:8`).
2. `app/api/track/event/route.ts`의 `ALLOWED_EVENTS`에 추가(`:6`).
3. 같은 파일 `ALLOWED_PARAM_KEYS`에 파라미터 화이트리스트 등록(`:25`) — PII redaction 통과.
4. CTA는 `TrackedLink`/`trackEvent`로 계측(`click_cta`/`begin_checkout`/`chatbot_*`).
5. 마케팅 픽셀 발화는 `consent.marketing` 게이팅 확인, GTM 이중태깅으로 더블카운트 주의.
6. `client_events` 마이그(`20260429_client_events.sql`) 적용(미적용 시 INSERT 무음 실패).
> 출처: pb04 §4·§8, canon §8, plan §4.1

### B-4. 스키마 컬럼 추가 (4단계 순서 엄수)
1. `lib/supabase/database.types.ts`(v2면 `.v2.ts`)에 타입 추가.
2. repository INSERT/SELECT 반영.
3. `supabase/migrations/YYYYMMDD_설명.sql` 작성(`ADD COLUMN IF NOT EXISTS`, idempotent).
4. 적용(`supabase db push` 또는 SQL Editor) → `USE_SUPABASE_*` 플래그 확인 → smoke test.
5. 금융/관리자 전용 테이블이면 생성 즉시 RLS enable(deny-all)+service-role. `CREATE POLICY` 재실행은 `drop policy if exists`.
> 출처: pb06 §4·§8, canon §8 철칙 3, plan §4.1

### B-5. DocArticle 신규/수정 저장
1. 한국어 전용 확인 → `[一-鿿]` 한자 스캔 + 조사 깨짐 점검.
2. `TBD`/`준비 중`/내부 메모 없음, 미확정 요금·SLA·릴리즈 날짜·PII 검증.
3. 어드민 수기편집본(`updated_by=classin-admin`) 덮어쓰기 금지 — `seed-docs.ts` 재실행 주의.
4. `golden-set` 케이스 추가, 임베딩 백필(`embed-docs-chunks.ts`, 누락분만 멱등).
5. 검증: 공통 게이트 + postbuild `check:public-content` + 챗봇 출처 중복(`selectDiverseSources`) 확인. `npx tsx scripts/seed-docs.ts --dry-run`.
> 출처: pb03 §4·§5·§8, canon §7, plan §4.1

### B-6. 리드 흐름 변경
1. 저장 실패를 성공으로 숨기지 않음 — `stored=false`면 중복창 클리어 후 502(재시도 허용).
2. 중복 제출 방지는 `pending`/`accepted` 구분, Supabase 저장 또는 외부 전달 중 하나 이상 성공 후에만 중복 캐시.
3. 저장·전달 모두 실패한 요청은 캐시에 남기지 말 것(즉시 재시도 가능).
4. 공개 리드는 JSON fallback 금지(read-only FS). honeypot·중복창(60s)·레이트리밋(5/min)·same-origin 가드.
5. `marketingConsent===true`일 때만 구독DB 동기화, raw IP는 sha256만.
6. 검증: `npx vitest run tests/api/lead-capture.test.ts` + 저장소 모드 바꿨으면 `tests/repositories/leads-mode.test.ts`. 마케팅 스크립트 도메인 추가 시 `next.config.ts` CSP directive별 갱신 + `/contact` 헤더 확인.
> 출처: AGENTS 리드 규칙, pb04 §3·§5, `error-fix-notes.md`, canon §8

### B-7. cron 추가
1. `vercel.json` 각 cron expression은 **하루 1회 이하** (금지: `*/5 * * * *`, `0 */6 * * *`, `0 9,18 * * *` / 허용: `15 0 * * *`, `0 4 * * 4`).
2. sub-daily 필요 시 `vercel.json`에 직접 추가 금지 → 외부 스케줄러/큐/Vercel Pro 전환 먼저.
3. 라우트에 `process.env.VERCEL && !x-vercel-cron` → 401 + `Authorization: Bearer ${CRON_SECRET}` 일치 검증.
4. 검증: `npm run check:vercel-crons`(build 전 자동 실행되나 수정 후 직접도 실행).
> 출처: AGENTS 배포/Cron 규칙, pb06 §4

### B-8. 챗봇 계약(DB/RPC/프롬프트/모델) 변경
1. `2.5-flash`는 `thinkingBudget:0` 유지(`lib/chatbot/llm.ts:255`). env 모델은 `UNSUPPORTED_GEMINI_MODELS` 폴백 확인.
2. 답변/검색 스키마·프롬프트 변경 시 `ANSWER_CACHE_VERSION`/`RETRIEVAL_CACHE_VERSION` bump.
3. 민감 분기(가격/계약/환불/계정/장애) 단정 금지 가드 유지, 큐레이션 직답=최종본(Gemini 재작성 스킵) 핵심 문구 보존.
4. 공개 답변 sanitize(URL/마크다운/출처/이미지 0) — `sanitizePublicAnswerText` + 클라이언트 재정제.
5. 임베딩은 `gemini-embedding-001` 1536d, pgvector 인자는 `JSON.stringify`.
6. 검증: 공통 게이트 + `tests/chatbot/`(순수함수) + `/admin/chatbot` 골든셋 평가. DB/RPC 계약 건드리면 `npm run check:alpha-db`.
> 출처: pb05 §4·§5·§8, canon §7, AGENTS 챗봇 규칙

---

## C. 판단형 경계 (에이전트/스킬은 제안·플래그까지만, 확정은 사람)

canon이 "항상 수동/어드민 검토"로 못박은 지점. 자동 확정 금지 항목이다.

| 항목 | 자동 금지 이유 / 규칙 | 출처 |
|------|----------------------|------|
| **deal 매칭 자동확정** | 매칭 자동확정 티어(confidence≥0.92 AND 2위 갭≥0.15)는 **customer/partner_account만** 적용. **deal은 항상 수동** — `/admin/crm/matching` 인박스에서 사람이 확정 | canon §5, plan §3.6·§4.1 |
| **AI 생성 초안 게시** | FAQ 추천질문·`chatbot_recommended_questions`·doc-gaps 초안은 **어드민 검토 후 게시, 자동게시 금지** | canon §7, pb05 §3, plan §4.1 |
| **미확정 수치 단정** | 국내 도입 기관·보드 수, 가격·할인·환불, 스토리지 용량, 서버 위치, 펜 팁 가격 등은 단정 금지 → 상담 확인. "$30B/30조원" 절대 금지, 미확정 회사 수치는 "EEO 공식 소개 기준" 캡션 | canon §1·§2, plan §2.2 |
| **22문항 4레벨 판별** | 즉답/조건부/확인 필요/쇼룸 검증은 질문마다 재판별 — 특히 "확인 필요" 항목의 단정 회피, "가능"이라도 "누가 볼 수 있는가" 병기 | canon §2, plan §4.1 |
| **매출 정본·이중계상 판단** | 어느 레코드가 confirmed인지, 정본 소스가 무엇인지 사람 판단. `crm_source_links` confirmed 기준. CEO 거버넌스 3결정(book-of-record/귀속/목표 소스) 대기 | canon §8, pb04 §3, plan §3.3·§4.1 |
| **챗봇 민감 분기 "가능/지원" 완화** | Gemini가 안전 초안의 "미지원/확인 필요"를 "가능/지원"으로 바꾸면 안 됨(`FINAL_SYSTEM_INSTRUCTION`) | pb05 §5, plan §4.1 |
| **표면별 톤 재작성** | 홈/랜딩(긴장 허용) vs 지원/제품/챗봇(안심 필수)은 자동 치환 불가, 문맥 판단 필요 | canon §4, plan §4.1 |

> **공통 설계 원칙:** 스킬/자동화는 판단형 업무를 대체하지 않는다. 위 지점에서 스킬은 **제안·플래그**까지만, **확정은 사람**이 한다 (plan §6 공통 설계 원칙).

---

*파생 인덱스 끝. 권위는 원본(canon/guide/코드/AGENTS)에 있으며, 사실이 바뀌면 원본을 먼저 갱신한다.*
