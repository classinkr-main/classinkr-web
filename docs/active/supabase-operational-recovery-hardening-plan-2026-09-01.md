# Supabase 운영 복구·하드닝 실행 계획

상태: Active — 운영 복구와 후속 개발이 완료될 때까지의 실행 로드맵
기준 시점: 2026-09-01
범위: Supabase 의존 경로, Admin 인증, 공개 콘텐츠 폴백, 이벤트 저장, DB 권한·성능, 운영 비밀값
연관 기준: [Admin 지침 맵](admin-guidance-map.md), [플랫폼 플레이북](playbook/06-platform-data.md),
[운영 장애·Cron·Webhook 안전 지침](operational-failure-handling-guidelines.md),
[ADR-010](../adr/ADR-010-operational-failure-containment.md), [DB 마이그레이션 런북](db-migration-runbook.md),
[Site/Admin 실행 경계 분리 계획](site-admin-separation-plan-2026-08-28.md)

이 문서는 2026-09-01 관리자 접속 장애를 복구하고 같은 종류의 장애를 더 빨리 식별·격리하기 위한 현재 실행 계획이다. 과거의 Supabase 전환 계획을 갱신하지 않으며, 아래 종료 조건을 충족하면 `docs/archive/`로 이동한다.

## 1. 결론과 인과관계

- 현재 관리자 접속 장애의 직접 원인은 Supabase API Gateway가 발급 시각을 미래로 판정한 `PGRST303 JWT issued at future` 오류다. 로그인 화면 자체와 현재 Vercel Production 배포는 정상이며, DB에도 장기 쿼리·잠금·연결 포화 증거가 없다.
- 같은 오류는 Admin 로그인만이 아니라 이벤트 추적, 챗봇 추천 질문, 문서·블로그·행사·자료실 조회에도 전파된다. 일부 경로가 HTTP 200과 정적 폴백을 반환해 장애가 정상처럼 보이는 것이 별도 신뢰성 결함이다.
- Security Advisor의 `security_definer_view` 2건과 함수 실행 권한 경고는 실제 권한 노출로 확인됐지만, 이번 로그인 장애의 직접 원인은 아니다. 서비스 복구 후 별도 마이그레이션으로 닫는다.
- CPU 경고는 연관 가능성을 배제할 수 없지만 현재 포화 증거는 없다. 누적 통계상 `external_crm_records` 조회가 가장 큰 성능 후보이므로 일일 증분 관측 후 개선한다.
- Production에 `SECURITY_TOKEN_SECRET`, `SESSION_SECRET`이 없는 것은 현재 Supabase 관리자 로그인의 원인이 아니다. 결제 토큰·수신 거부·이메일 클릭·메일 링크 경로의 잠재 장애이므로 별도 배포에서 복구한다.

따라서 장애 복구, 코드 변경, 권한 마이그레이션, 환경 변수 변경, 성능 개선을 한 번의 배포에 묶지 않는다.

## 2. 확인된 기준선

### 운영 상태

- Vercel Production 배포는 Ready다.
- `/admin`은 `/admin/login`으로 정상 리다이렉트되고 로그인 UI는 데스크톱·모바일에서 렌더링된다.
- Supabase 프로젝트는 활성 상태이며 raw DB 기준 장기 실행, blocking lock, deadlock, 연결 포화가 없다.
- 로그에서 `PGRST303`과 이에 따른 공개 경로 폴백·저장 실패가 확인됐다.
- Production 환경에는 `SECURITY_TOKEN_SECRET`, `SESSION_SECRET`이 없다.

### 저장소 상태

- `npm run typecheck`, ESLint, Production build가 통과했다.
- 전체 테스트 3,618건이 통과했다.
- `check:db`, `check:alpha-db`, `check:admin-rbac`, `check:vercel-crons`가 통과했다.
- 운영 DB는 저장소 마이그레이션 계약과 일치한다.

이 기준선 때문에 이번 장애를 미적용 migration이나 일반적인 앱 build 실패로 판단하지 않는다.

## 3. 안전 경계

다음 조치는 복구 수단으로 사용하지 않는다.

- Admin 인증, RLS, API 관리자 가드, service-role 경계를 우회하지 않는다.
- Production에서 `ADMIN_PASSWORD` 폴백을 활성화하지 않는다.
- `PGRST303`을 무시하거나 사용자 세션을 관리자 세션으로 간주하지 않는다.
- Supabase 프로젝트 재시작을 반복하지 않는다. 상태 확인 후 한 번 실행하고 검증한다.
- 장애 중 Advisor 수치만 보고 FK 인덱스를 일괄 추가하거나 unused index를 일괄 삭제하지 않는다.
- 오류로 생성된 빈 배열·`null`·404를 정상 캐시에 저장하지 않는다.
- 운영 비밀값을 문서, Git, 로그, 오류 응답에 남기지 않는다.
- 공개 쓰기 실패를 성공으로 가장하는 JSON fallback을 추가하지 않는다.

## 4. 실행 순서와 PR 경계

| 단계 | 목표 | 변경 단위 | 선행 조건 | 롤백 단위 |
| --- | --- | --- | --- | --- |
| Wave 0 | 현재 서비스 복구 | 운영 조치만 | 없음 | 프로젝트 상태·직전 배포 확인 |
| PR 1 | 실패 분류, Admin 안전 실패, 관측성 | 앱 코드 | Wave 0 안정 확인 | 직전 Vercel 배포 |
| PR 2 | 캐시·폴백·쓰기 응답 정합성 | 앱 코드 | PR 1 오류 코드 | 기능 플래그·직전 배포 |
| PR 3 | View/RPC 권한과 함수 `search_path` 하드닝 | DB migration | 서비스 안정, 권한 테스트 | 보상 migration |
| PR 4 | 토큰 키 운영 계약과 readiness | 환경+앱 코드 | Preview 검증 | 직전 키·직전 배포 |
| PR 5 | 이벤트 outbox와 챗봇 저장 내구성 | additive schema+앱 코드 | PR 1·2 | 기능 플래그, additive schema 유지 |
| PR 6 | External CRM·Advisor 성능 개선 | 관측 후 소규모 migration | 7일 이상 증분 데이터 | 쿼리 플래그·보상 migration |

### Wave 0 — 즉시 운영 복구

예상 소요: 운영자 30~60분

1. 장애 시작 시각을 KST와 UTC로 기록하고 Supabase 상태·프로젝트 상태·Vercel 배포 상태를 함께 캡처한다.
2. DB 부하를 만드는 동기화·집계 작업만 일시 중지한다. 로그인·RLS·공개 읽기 권한은 변경하지 않는다.
3. Supabase가 권고하는 상태라면 프로젝트를 한 번 재시작한다.
4. 재시작 후 raw DB, service-role 읽기, 공개 읽기, Admin 프로필 읽기를 순서대로 검증한다.
5. 행사·블로그·문서·자료실·sitemap의 오류 시 생성 캐시를 무효화한다.
6. Admin 로그인, DB에만 존재하는 공개 콘텐츠, 챗봇, 자료 다운로드를 smoke test한다.
7. 중지한 작업을 하나씩 재개하고 장애 구간의 이벤트·피드백·챗봇 저장 손실을 추정한다.

완료 조건:

- 신규 `PGRST303`이 15분 동안 0건이다.
- Admin 계정으로 로그인·새로고침·로그아웃이 성공한다.
- DB에만 존재하는 문서·블로그·행사·자료가 빈 목록이나 404가 아닌 실제 데이터로 보인다.
- 공개 챗봇과 추천 질문이 정상 데이터 경로를 사용한다.
- 재개한 job별 오류율과 지연이 정상 범위다.

### PR 1 — 의존성 실패 분류와 Admin 인증 복원력

예상 소요: 0.5~1일

공용 서버 오류 분류를 추가한다.

- 코드: `DEPENDENCY_JWT_REJECTED`, `DEPENDENCY_SESSION_INVALID`, `DEPENDENCY_TIMEOUT`, `DEPENDENCY_UNAVAILABLE`, `DEPENDENCY_RATE_LIMITED`, `DEPENDENCY_SCHEMA_MISMATCH`, `CONFIG_MISSING`, `PERSISTENCE_FAILED`, `UNKNOWN_DEPENDENCY_FAILURE`
- 로그 필드: `requestId`, `route`, `component`, `operation`, `code`, `retryable`, `durationMs`, `degraded`
- 토큰, 쿠키, 이메일, 전화번호, 요청 본문은 구조화 로그에 넣지 않는다.

Admin은 계속 fail closed로 동작하되 잘못된 자격 증명과 의존성 장애를 분리한다.

- `app/admin/login/page.tsx`: `admin_profiles` 조회의 일시 실패를 “관리자 프로필 없음”으로 바꾸거나 즉시 로그아웃하지 않는다. 접근은 허용하지 않고 재시도 가능한 장애 상태를 표시한다.
- `lib/admin-auth.ts`, `proxy.ts`: unauthorized와 dependency unavailable을 내부 오류 코드·redirect reason에서 구분한다. 어느 경우에도 검증되지 않은 접근을 허용하지 않는다.
- `lib/supabase/middleware.ts`: `getUser()` 오류를 분류하고 장애 중 불필요한 refresh-token 반복을 막는다.

경보 기준:

- `DEPENDENCY_JWT_REJECTED` 5분 1건 이상: 즉시 알림
- Admin 로그인 redirect loop 또는 세션 refresh 실패: 즉시 알림
- 공개 콘텐츠 degraded 응답 5% 초과: 경고
- 추적 이벤트 `stored:false` 1% 초과: 경고
- 챗봇 `persistenceStored:false` 1% 초과: 경고

### PR 2 — 폴백·캐시·쓰기 응답의 진실성

예상 소요: 1~2일

- 공개 콘텐츠 repository 결과를 `found / not_found / unavailable`로 구분한다. PostgREST의 명시적 not-found만 404로 취급한다.
- `public-events`, 문서, 블로그, 자료실 경로에서 dependency 오류 결과를 정상 데이터 캐시에 넣지 않는다.
- 가능한 읽기는 last-known-good 또는 정적 read-only bundle을 사용하되, 응답에 degraded 상태와 요청 ID를 남긴다.
- 챗봇·추천 질문은 저장소 규칙대로 deterministic fallback과 HTTP 200을 유지하고 `degraded`, `degradationCode`, `fallbackStage`, `requestId`, `persistenceStored`를 기계 판독 가능하게 제공한다.
- `track/event`는 호환을 위해 200을 유지할 수 있지만 `stored:false`를 클라이언트가 반드시 처리하게 한다.
- 문서 피드백처럼 사용자가 명시적으로 저장을 요청한 경로는 실패 시 503과 `Retry-After`를 반환하고 성공 toast를 표시하지 않는다.
- lead magnet은 읽기 전용 bundle 폴백만 허용하며 제출·쓰기 실패는 성공으로 숨기지 않는다.

기능 플래그:

- `PUBLIC_CONTENT_RESILIENCE_ENABLED`
- `CHATBOT_DEGRADATION_METADATA_ENABLED`

완료 조건:

- 의존성 장애가 빈 배열, 정상 404, 저장 성공으로 캐시되지 않는다.
- 폴백 사용 여부를 로그와 응답에서 구분할 수 있다.
- 의존성 복구 후 5분 이내 정상 데이터가 다시 노출된다.
- 문서 피드백 저장 실패 시 UI가 성공을 표시하지 않는다.

### PR 3 — DB 권한 하드닝

예상 소요: 0.5~1일

첫 migration은 현재 확인된 노출만 좁게 닫는다.

1. `public.v_docs_ai_chunk_counts`, `public.external_crm_object_snapshot`을 `security_invoker=true`로 변경한다.
2. 두 view의 `PUBLIC`, `anon`, `authenticated` 권한을 회수하고 `service_role`만 읽게 한다.
3. 다음 service-role 전용 RPC의 `PUBLIC`, `anon`, `authenticated` 실행 권한을 회수하고 `service_role`만 허용한다.
   - `internal_cs_metrics(integer)`
   - `match_docs_ai_chunks(text, integer, boolean)`
   - `match_channel_conversation_chunks(text, integer, double precision)`
   - `match_channel_conversation_chunks(extensions.vector, integer, double precision)`
4. PostgREST schema cache를 갱신한다.

호출자는 모두 `createSupabaseAdminClient()`를 사용하는지 migration 전후에 다시 확인한다. `is_active_admin()`, `is_super_admin()`은 다수 RLS policy의 기반이므로 `anon`·`authenticated` 실행 권한을 일괄 회수하지 않는다.

두 번째 migration은 별도로 실행한다.

- `increment_campaign_open_count(uuid)`를 service-role 전용으로 만들고 빈 `search_path`를 적용한다.
- Advisor가 지적한 27개 함수는 정확한 signature별로 `search_path`를 고정하고 함수 본문의 객체 참조를 schema-qualified로 만든다.
- 기존 `TimeZone=UTC` 같은 함수 설정을 보존한다.
- 5~10개 객체 단위로 나누고 각 묶음마다 권한 매트릭스와 회귀 테스트를 실행한다.

Auth 설정 변경은 장애 복구·DB 권한 migration과 분리한다. 서비스 안정 후 Preview에서 유출 비밀번호 차단 기능과 최소 비밀번호 길이 8자를 검증하고 Production에 순차 적용한다. 기존 사용자의 로그인·비밀번호 변경 영향과 플랜 지원 여부를 먼저 확인하며, 사용자에게는 공급자 원문 대신 일관된 한국어 오류 메시지를 제공한다.

완료 조건:

- 두 view는 invoker view이며 service-role만 읽을 수 있다.
- 내부 RPC와 campaign counter RPC는 service-role만 실행할 수 있다.
- 27개 함수의 mutable search path 경고가 해소된다.
- `is_active_admin()`, `is_super_admin()` 기반 RLS 결과가 그대로 유지된다.
- anon, authenticated non-admin, Admin, partner 역할별 권한 테스트가 통과한다.
- 유출 비밀번호 차단과 최소 길이 정책의 Preview 회귀 결과·Production 적용 여부가 기록된다.

롤백은 [DB 마이그레이션 런북](db-migration-runbook.md)의 보상 migration을 사용한다. 기능 복구가 필요해도 anon 권한을 다시 열지 않고 service-role 호출 경로를 복구한다.

### PR 4 — 토큰 키 계약과 readiness

예상 소요: 0.5일

1. Preview에 서로 다른 32바이트 이상 랜덤 값의 `SECURITY_TOKEN_SECRET`, `SESSION_SECRET`을 설정한다.
2. 관리자 테스트 메일, 클릭 redirect·count, 수신 거부, 정상·변조 토큰을 검증한다.
3. Preview와 다른 값으로 Production 두 키를 설정하고 재배포한다.
4. 운영 내부 테스트 계정 1건으로 같은 smoke test를 반복한다.
5. `lib/admin-integrations/status.ts`에 값 자체를 노출하지 않는 `configured / missing` readiness를 추가한다.
6. 키 미설정은 generic 400이 아니라 안정적인 서버 오류 코드와 503으로 구분한다.

결제 활성화 플래그는 이 작업으로 변경하지 않는다. 첫 설정 이후의 회전은 단일 키 덮어쓰기가 아니라 `current + previous` 또는 `kid` 기반 keyring으로 구현한다. verifier가 새·이전 키를 먼저 수용하고 signer를 새 키로 바꾸는 순서로 배포한다.

완료 조건:

- Preview와 Production의 두 키가 각각 설정되고 환경 간·용도 간 값이 다르다.
- 정상 토큰만 통과하며 비밀값이 로그·문서·Git에 노출되지 않는다.
- 메일, 클릭 추적, 수신 거부 E2E가 통과한다.
- `Missing SECURITY_TOKEN_SECRET or SESSION_SECRET` 운영 로그가 0건이다.

첫 설정 후 코드만 롤백할 때 키를 제거하지 않는다. 이미 발급에 사용한 키를 회전할 때는 직전 키를 복구할 수 있어야 한다.

### PR 5 — 이벤트 outbox와 챗봇 저장 내구성

예상 소요: 2~3일

- 추적 이벤트에 `event_id`를 추가하고 nullable partial unique index로 멱등 저장을 보장한다.
- consent-aware IndexedDB outbox를 추가한다. 서버가 `stored:true`를 확인한 이벤트만 삭제한다.
- 재시도는 1초, 5초, 30초, 120초 backoff와 24시간 TTL·개수·용량 상한을 둔다.
- 동의 철회 시 보관 중인 이벤트를 삭제한다.
- 챗봇은 답변의 `answerMode`와 저장의 `persistenceStored`를 분리한다.
- 서버리스 후속 저장은 fire-and-forget `Promise.allSettled()` 대신 framework의 수명주기 API 또는 짧은 bounded await를 사용한다.

기능 플래그: `NEXT_PUBLIC_ANALYTICS_OUTBOX_ENABLED`

완료 조건:

- 네트워크·Supabase 장애 후 중복 없이 이벤트가 재전송된다.
- 동의 전 이벤트를 저장하지 않고 동의 철회 시 outbox가 비워진다.
- 챗봇 fallback과 저장 실패를 각각 관측할 수 있다.
- additive schema를 남긴 상태에서 플래그만 꺼도 기존 경로로 복귀한다.

### PR 6 — External CRM와 Advisor 성능 개선

예상 소요: 관측 7일 이상 + 구현 1~2일

`external_crm_records`는 84,332행·약 118MB이며, 누적 `pg_stat_statements`에서 관련 쿼리가 전체 추적 실행시간의 42.3%를 차지했다. 이 수치는 약 5개월 누적이고 과거 구현도 포함하므로 현재 CPU 경고의 단독 원인으로 사용하지 않는다.

1. `pg_stat_statements`를 즉시 reset하지 않고 queryid별 일일 delta를 수집한다.
2. `external_crm_object_snapshot` 성공·폴백과 각 조회 지연을 구조화 로그로 남긴다.
3. exact count를 화면별로 분류한다. 근삿값이 가능한 곳은 planned count, 정확값이 필요한 곳은 동기화 완료 시 갱신되는 summary table 또는 RPC를 사용한다.
4. 한 화면에서 동일 원시 snapshot을 반복 조회하지 않도록 짧은 서버 캐시를 검토한다.
5. Production 유사 데이터에서 `EXPLAIN (ANALYZE, BUFFERS)`를 저장한 뒤에만 쿼리, RPC, index를 결정한다.
6. 기존 인덱스가 약 41.7MB이므로 새 index는 마지막 수단으로 둔다.

목표:

- 주요 External CRM DB 쿼리 P95 500ms 이하, 최대 1초 이하
- 같은 화면 요청의 중복 exact count 0건
- active, stale, object별 집계가 기존 결과와 일치
- 안정 트래픽 구간의 추적 실행시간 점유율 15% 이하
- CPU 15분 평균 60% 이하, 80%가 5분 지속되면 경고
- 일반 연결 수 42/60 이하를 정상 운영 상한으로 관찰

Advisor는 숫자 제거가 아니라 검증된 keep/drop 명세를 목표로 한다.

- unindexed FK 83건: 성장, delete cascade, 실제 join 빈도로 선별한다. 첫 검토 후보는 `docs_ai_chunks.article_version_id`, `notification_delivery_logs.notification_id`, `chatbot_answer_events.user_message_id`, `docs_article_relations.related_article_id`다.
- auth RLS initplan 22건: `(select auth.uid())` 패턴으로 바꾸되 `admin_profiles`, Portal V1, Portal V2, chatbot handoff 묶음으로 분리한다.
- multiple permissive policies 24건: `admin_profiles`, `regions`, `region_aliases`의 역할별 의미를 보존한다. 공개 SELECT와 관리자 쓰기 policy의 command 분리를 우선 검토한다.
- duplicate index 3건: repo 정본 이름과 DB drift를 확정한 뒤에만 제거한다.
- unused index 180건: PK, UNIQUE, HNSW, GIN, 미래 기능 인덱스를 자동 삭제하지 않는다. 충분한 통계 기간과 query plan을 통과한 일반 보조 index만 대상으로 한다.

각 migration은 5~10개 객체 단위로 제한하고 변경 전후 EXPLAIN, 역할별 권한 매트릭스, FK parent update/delete, write latency, index size를 기록한다.

## 5. 구현 후보 파일

| 영역 | 후보 파일 |
| --- | --- |
| 오류 분류 | `lib/server/dependency-failure.ts`, `lib/admin-auth-errors.ts` |
| Admin 인증 | `app/admin/login/page.tsx`, `lib/admin-auth.ts`, `lib/supabase/middleware.ts`, `proxy.ts` |
| 공개 콘텐츠·캐시 | `lib/repositories/public-events.ts`, 문서·블로그·자료실 repository와 route error boundary |
| 쓰기 응답 | `app/api/track/event/route.ts`, 문서 feedback API와 UI |
| 챗봇 | `app/api/chatbot/recommended-questions/route.ts`, `lib/chatbot/service.ts`, 챗봇 stream route |
| DB 권한 | `supabase/migrations/20260901_security_definer_access_hardening.sql`, `supabase/migrations/20260901_function_search_path_hardening.sql`, 대응 rollback migration |
| DB 계약 | `lib/db/schema-contract.ts`, `scripts/check-db-schema.ts`, `tests/db/` |
| 토큰 키 | `lib/server/security-tokens.ts`, `lib/admin-integrations/status.ts`, 결제·수신 거부·클릭·메일 route |
| 이벤트 내구성 | analytics client outbox, `app/api/track/event/route.ts`, additive event migration |
| CRM 성능 | `lib/admin-crm-overview.ts`, `lib/admin-crm-revenue.ts`, `lib/admin-crm-neo.ts`, `lib/admin-crm-customers-neo.ts` |

파일명은 구현 시 저장소 현황을 다시 확인해 확정한다. 이 표는 소유 범위와 review 경계를 지정하며 실제 코드 SSOT를 대체하지 않는다.

## 6. 검증 매트릭스

### 가까운 회귀 테스트

- Admin: 잘못된 비밀번호, 프로필 없음, Supabase timeout, `PGRST303`, 새로고침, redirect loop
- 공개 콘텐츠: found, true not-found, timeout, stale cache, 복구 후 cache refresh
- 쓰기: analytics `stored:false`, feedback 503, lead 저장 실패, 중복 재전송
- 챗봇: 정상 RAG, 단계별 fallback, route budget, 저장 성공·실패 분리
- 권한: anon, authenticated non-admin, Admin, partner, service-role의 view·RPC 접근
- 토큰: 정상, 만료, 변조, current key, previous key
- 성능: 결과 동등성, query plan, P50/P95/max, write 회귀

### 저장소 품질 게이트

변경 중에는 가장 가까운 테스트를 먼저 실행하고 최종적으로 다음 순서를 지킨다.

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

추가 게이트:

- DB·RPC 변경: `npm run check:db`, `npm run check:alpha-db`, migration 계약·권한 테스트
- Admin 권한 변경: `npm run check:admin-rbac`
- `vercel.json` 변경: `npm run check:vercel-crons`
- 공개 리드 변경: `npx vitest run tests/api/lead-capture.test.ts tests/repositories/leads-mode.test.ts`

## 7. 배포와 롤백 원칙

- Wave 0 복구가 끝나고 기준선이 안정된 뒤 PR 1부터 순서대로 배포한다.
- 각 PR은 Preview smoke test와 좁은 Production canary 관측을 거친다.
- 앱 변경은 직전 Vercel 배포 또는 기능 플래그로 되돌린다.
- DB 변경은 destructive down migration 대신 명시적 보상 migration을 사용한다.
- additive column·index는 앱 롤백 시 유지해도 안전하도록 설계한다.
- 보안 migration 롤백은 service-role 호출 복구까지만 허용하며 anon 권한을 다시 열지 않는다.
- 새 index는 장애 중 즉시 삭제하지 않는다. 구 쿼리로 먼저 복귀한 뒤 유지보수 시간에 판단한다.
- 토큰 키는 발급에 사용한 뒤 삭제하거나 임의 값으로 덮지 않는다. 직전 verifier 호환성을 먼저 복구한다.

## 8. 책임과 의사결정 게이트

| 결정 | 책임 | 승인 전 필요한 근거 |
| --- | --- | --- |
| 프로젝트 재시작·job 재개 | 운영 | 공급자 상태, DB health, smoke 결과 |
| Admin 오류 UX·로그 계약 | Admin 코어 | fail-closed 회귀 테스트 |
| 공개 폴백·캐시 정책 | 콘텐츠·플랫폼 | found/not-found/unavailable 테스트 |
| view/RPC 권한 변경 | 플랫폼·보안 | 실제 ACL, 호출자, 역할 매트릭스 |
| 운영 키 설정·회전 | 운영·플랫폼 | Preview E2E, rollback key 보관 절차 |
| CRM query/RPC/index | CRM·플랫폼 | 일일 delta, EXPLAIN, 결과 동등성 |
| RLS·index Advisor 정리 | 플랫폼·도메인 소유자 | keep/drop 명세, 권한·write 회귀 |

## 9. 문서 종료 조건

다음을 모두 충족하면 이 문서를 완료 처리하고 장애 결과·실제 수치·남은 장기 항목만 남겨 `docs/archive/`로 이동한다.

- Wave 0 복구 기록과 데이터 손실 추정이 남아 있다.
- Admin 인증이 dependency 장애를 안전하게 구분하며 우회 없이 복구 가능하다.
- 공개 콘텐츠가 dependency 장애를 빈 데이터나 정상 404로 캐시하지 않는다.
- 명시적 쓰기 실패가 성공 UI로 표시되지 않고 이벤트 재전송이 멱등하다.
- 확인된 view·RPC 권한 노출과 함수 search path 경고가 해소됐다.
- 토큰 키 readiness와 안전한 회전 계약이 운영에 적용됐다.
- External CRM 목표가 안정 트래픽에서 충족됐거나 측정 근거와 함께 후속 백로그로 분리됐다.
- Advisor 각 항목에 검증된 keep/drop·fix/defer 결정이 있다.
- 전체 품질 게이트와 Production smoke test가 통과했다.
