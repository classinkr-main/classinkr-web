<!--
문서 성격: 분석·권고(읽기 전용 감사). 코드 변경 없음.
작성: 2026-09-01 · 서브에이전트 4팀 병렬 정찰(앱 쿼리 / 스키마·인덱스·RLS / crm 저장소 / 인프라·크론) + 작성자 직접 코드 교차검증
대상: classinkr-main/classinkr-web @ 60b5ec6, classinkr-main/crm @ eb39a3a
관련 문서: admin-perf-quality-audit-2026-07-23.md(선행 감사, Wave 1~3 적용 완료), admin-money-mesh-2026-07-03.md
후속 실행 설계: supabase-optimization-execution-plan-2026-09-02.md
-->

# 공용 Supabase DB 병목 감사 및 분리 여부 평가 (2026-09-01)

## 근거 등급 표기

본 문서의 모든 항목에는 근거 등급을 붙인다. 감사 결과를 그대로 신뢰하지 말고 등급을 먼저 볼 것.

- **[검증]** — 작성자가 해당 파일을 직접 열어 호출 관계까지 확인함
- **[보고]** — 서브에이전트가 `file:line`과 함께 보고했으나 작성자 재검증 미수행
- **[미확인]** — 저장소만으로는 판정 불가. Vercel/Supabase 대시보드 확인 필요

---

## 0. 결론 3줄

1. **같은 DB 맞다.** 단 `crm`은 `crm` 스키마에 완전 격리돼 있고 classinkr-web 테이블을 단 한 줄도 읽지 않는다. **논리적 분리는 이미 끝나 있다.**
2. **지금 DB를 물리적으로 분리할 이유가 없다.** 현재 느려짐의 원인은 두 앱 사이의 간섭이 아니라 **각 앱 내부의 팬아웃·캐시 부재**다. DB를 나눠도 그대로 따라온다. 대신 같은 DB 안에서 **롤 단위 격리**(전용 role + `statement_timeout` + connection limit)로 분리 효과의 대부분을 저비용으로 얻을 수 있다.
3. **가장 급한 건 성능이 아니라 요금제·리전 확인이다.** 리전 불일치는 요청당 수십 회의 PostgREST 왕복에 전부 곱해지므로, 인덱스 수십 개보다 효과가 크다. 그리고 `vercel.json`의 cron 9개는 저장소가 스스로 가정하는 Hobby 한도와 모순된다.

---

## 1. 같은 DB인가 — 확정

**[검증]** 같은 Supabase 프로젝트, 다른 접근 경로다.

| | classinkr-web | crm |
|---|---|---|
| 클라이언트 | `@supabase/supabase-js` + `@supabase/ssr` (PostgREST/HTTPS) | `pg` Pool 직결 (`crm/lib/db.ts:7-23`) |
| `DATABASE_URL` | **없음** (`crm-cockpit-graft-analysis-2026-06-30.md:338`이 명시) | 있음 (Supabase pooler) |
| 스키마 | `public` (`crm_*` 접두 테이블 ~20개 포함) | `crm` 스키마 |
| DDL 정본 | `supabase/migrations/` 145개 | `scripts/schema.sql` (불완전, §6 참조) |
| 리전 | 미지정 → Vercel 프로젝트 기본값 | `sin1` 고정 (`crm/vercel.json:2-4`) |

근거는 `crm/lib/db.ts:3-6` 주석이 직접 말한다 — *"classinkr Supabase 공용 DB, 데이터는 `crm` 스키마에 격리. 전용 DB로 옮길 땐 DATABASE_URL만 교체."*

**중요한 비대칭**: 두 앱은 **서로 다른 한도에 부딪힌다.**
- classinkr-web은 PostgREST를 통하므로 Postgres 커넥션을 직접 소비하지 않는다. 대신 DB 인스턴스의 **CPU/RAM과 PostgREST 워커**를 먹는다.
- crm은 인스턴스당 `max: 3` 커넥션을 직접 잡는다. Vercel 람다가 N개 웜이면 총 `3×N`. **[보고]**

즉 커넥션 고갈로 서로를 죽일 경로는 좁고, 실제 간섭 경로는 **공용 compute의 CPU**다.

**[검증] classinkr-web 어드민 CRM(`/admin/crm`)과 `crm` 저장소는 별개 제품이다.** 전자는 `public.crm_*` 테이블(내부 영업 CRM, `crm_deals`/`crm_tasks`/`crm_customer_events`), 후자는 `crm.*` 스키마(리드·광고·방문 트래킹). 이름만 겹치고 데이터는 안 겹친다. 분리 논의 시 이 둘을 혼동하면 안 된다.

---

## 2. 병목 랭킹 — 실제 라이브 경로 기준

### H1. 파트너 포털 문서·캘린더 탭: deal 수에 비례하는 무제한 팬아웃 **[검증]**

`lib/portal/repositories/partner-read.ts:443-447`(`loadPartnerCalendar`)과 `:503-507`(`loadPartnerDocuments`)이 **파트너의 모든 deal**에 대해 `loadPartnerDealDetail`을 돈다. 각 호출은 `getDealDetail`(`lib/portal/repositories/deals.ts:329-368`) = 1 + 9 병렬 쿼리이고, 그중 `listQuoteDocumentBundles`(`deals.ts:158-181`)와 `listContractDocumentBundles`(`deals.ts:220-244`)가 각각 3개를 더 발행한다 → **deal당 ~13 쿼리, 상한 없음.**

deal 30건인 파트너의 문서 탭 1회 = **~390 쿼리**. 캐시 없음.

같은 파일의 개요 경로(`:345-368` `loadDetailsForOverview`)는 `.slice(0, 8)`로 막혀 있다. 즉 **개요는 막고 문서/캘린더는 안 막은 일관성 결함**이다. 수정도 그만큼 싸다 — 동일한 slice + 상한.

### H2. `getLeads()`가 `leads` 전체 테이블을 `select('*')`로 끌어온다 **[보고]**

`lib/repositories/leads.ts:337` → `fetchAllLeadRows("*")`(`:262-328`), 1,000행 페이징에 상한 `LEAD_MAX_ROWS = 100_000`(`:249`), 첫 페이지에 `count: "exact"`(`:272`).

핫패스 호출자:
- `app/api/admin/leads/route.ts:32` ← `LeadsBoardClient.tsx:1067`이 **`ttlMs: 0`(캐시 없음)** 으로 마운트마다 호출
- `lib/repositories/crm-unified-customers.ts:392`, `crm-priority-queue.ts:172` — 전체 leads + 전체 Neo 고객 + 전체 포털 고객을 가져와 **JS에서 필터·정렬·페이징**

`crm-priority-queue`는 팀이 이미 `crm-knowledge-gaps-register-2026-06-27.md:81`에 "무캐시, Supabase 스캔 지연"으로 기록해 뒀고, 오늘 확인 결과 여전히 무캐시다.

부수 문제 **[보고]**: `leads.ts:894`의 `.select("source, status")`는 `.limit()`이 없다. PostgREST max-rows에서 잘리므로 **느릴 뿐 아니라 상한 초과 시 조용히 틀린 집계**를 낸다.

### H3. `fetchSupabasePages`가 페이지마다 `count: 'exact'`를 재실행 **[보고]**

`lib/supabase/pagination.ts:46-68`이 직렬 `while` 루프인데, 호출자가 `count: "exact"`를 **매 페이지에** 넘긴다.

최악은 `lib/repositories/crm-neo-customer-snapshots.ts:281-288`(`maxRows: 20_000`) — 최대 **20회 직렬 왕복, 각각 `external_crm_records` 전체 COUNT 스캔**을 동반하고, select에 원본 `payload` JSONB가 포함(`:822,:828,:834`)돼 2만 개 JSONB를 Node에서 파싱한다. 이게 `:818-840`에서 3종(account/shroff/opportunity) 병렬로 돈다.

동일 패턴: `admin-crm-duplicate-preflight.ts:103-135`, `external-crm/owner-names.ts:36-94`, `admin-crm-neo.ts:213-226`.

### H4. 인증 왕복이 요청마다 1~3회, 어드민 페이지당 ×13 **[보고]**

`proxy.ts:186` → `lib/supabase/middleware.ts:41`의 `auth.getUser()`가 **모든 비정적 요청**에서 캐시 없이 돈다. `/admin/overview`는 클라이언트 팬아웃 13회(`app/admin/overview/page.tsx:228-289`)라 **페이지 1회 로드에 13회 이상의 GoTrue 왕복**이 붙는다.

페이지 가드(`proxy.ts:153-160`)와 `lib/admin-auth.ts:372-382`에는 60초 인메모리 캐시가 있지만 **람다 인스턴스별**이라 콜드 인스턴스마다 다시 지불한다.

`lib/auth/public-user.ts:97-107`은 더 나쁘다 — 호출마다 `getUser()` + **UPSERT 쓰기** + `leads` 2회 조회(`lib/identity/stitch.ts:91,101`). `app/api/materials/[slug]/download/route.ts`는 이걸 한 요청에서 **두 번**(`:59`, `:116`) 호출한다.

### H5. crm 저장소: 함수 래핑 predicate가 인덱스를 무력화 **[보고]**

`crm/app/(main)/dashboard/page.tsx:146,164,180`이 `to_char(...)` 로 감싼 조건으로 필터한다. `crm.leads`에 `leads_created_idx`/`leads_stage_idx`가 있어도(`crm/scripts/schema.sql:49-51`) **함수 래핑 때문에 전부 순차 스캔**이 된다. 그리고 `leads.meta_ad_id`(`crm/app/(main)/leads/page.tsx:96`의 조인 키)는 **인덱스가 아예 없다.**

이게 §1에서 말한 **공용 compute CPU 간섭의 실질적 원인**이다. classinkr-web을 느리게 만들 수 있는 crm 쪽 유일한 현실적 경로다.

### M1. crm 전 페이지가 `force-dynamic`, 서버 캐시 0 **[보고]**

메인 페이지 10개 전부 `export const dynamic = "force-dynamic"`. `crm/next.config.ts:7`의 `staleTimes`는 **클라이언트 소프트 내비게이션 전용**이라 서버 응답 캐시가 아니다. 즉 `leads` 페이지(쿼리 13개), `dashboard`(쿼리 10개)가 **매 요청마다 전량 재실행**된다.

### M2. 크론 시간대 밀집 **[검증]**

`vercel.json` 기준 00:15 → 01:00 → 01:10 (UTC) 55분 안에 3개, 08:00 → 08:30에 `sync-branch` → `sync-branch-insights`가 연쇄한다. 후자는 `branch_rev_deals` 전체를 1,000행씩 페이징하며(`lib/repositories/branch-deals.ts:76-96`) 팀 4개(`ALL,BD,MKT,CSM`)를 **순차** 반복한다(`lib/branch/insights/runner.ts:37-38`). 30분 전에 동기화한 데이터를 다시 전량 스캔하는 구조다. **[보고]**

crm 쪽 크론은 21:00/21:30 UTC라 겹치지 않는다. 다행.

### L1. RLS 성능 지뢰 — 지금은 안 터진다 **[검증]**

에이전트는 `is_active_admin()`가 `STABLE` 마커 없이(=VOLATILE) 116곳 RLS 정책에 쓰이는 것을 "최대 성능 이슈"로 보고했다. **이건 현재 병목이 아니다.**

직접 확인 결과 `lib/` 내 Supabase 사용 파일 134개 중 **113개가 service-role 클라이언트를 쓴다.** service role은 RLS를 통째로 우회하므로 이 정책들은 **런타임에 평가되지 않는다.** 선행 감사(`admin-perf-quality-audit-2026-07-23.md:6`)의 "어드민 라우트 전부 `createSupabaseAdminClient`"와 일치한다.

따라서 이 항목의 성격은 **성능 이슈가 아니라 (a) RLS 기반 접근으로 전환하는 순간 터지는 지뢰, (b) service role 전면 사용이라는 별도의 보안 표면**이다. 우선순위는 낮추되 삭제하지 말고 이 성격으로 기록해 둔다.

파트너 포털만 `auth.uid()` 기반 RLS를 실제로 쓰는데(`20260404_partner_portal_v2_domain.sql:555-714`), 여기가 3단 중첩 서브쿼리 + 미래핑 `auth.uid()`라 **여기서만은 실제 비용**이다. 그리고 §2 H1의 팬아웃과 같은 화면에서 곱해진다.

---

## 3. 오탐 정정 — 감사 결과에서 걸러낸 것

기록 목적으로 남긴다. 자동 감사 결과를 그대로 백로그에 넣지 말 것.

| 보고된 내용 | 실제 |
|---|---|
| `lib/portal/repositories/overview.ts:487-492` `getLegacyCommercialOverview`가 요청당 800~1,600 쿼리 — **저장소 최악** | **데드코드.** `grep` 결과 호출자 0개. 라이브 어드민 경로는 `getCommercialOverview`(`:301`)이고 이미 `listAllCustomerListItemsLite`(`customers.ts:910-926`, 쿼리 2개)로 최적화돼 있다. 다만 **데드코드 자체를 제거**하면 향후 감사·리팩터링의 오탐원이 사라진다. **[검증]** |
| `is_active_admin()` VOLATILE가 최대 성능 이슈 | RLS가 런타임에 평가되지 않음(§L1). 지뢰지 병목 아님. **[검증]** |
| "별도 crm 저장소는 존재하지 않는다" (인프라 감사) | 감사 범위가 classinkr-web에 한정돼 생긴 오판. `classinkr-main/crm`은 실재한다. **[검증]** |

---

## 4. 분리(별도 DB) 평가 — **권고: 지금은 분리하지 않는다**

### 분리를 지지하는 근거

- 기술적 비용이 거의 없다. crm은 cross-schema 참조가 **0건**(`public.`/`auth.`/`storage.` 참조 0, 263개 전부 `crm.` 정규화). **[보고]** `DATABASE_URL` 교체만으로 끝난다고 코드 주석이 직접 말한다.
- noisy neighbor가 실재한다(§H5). crm의 순차 스캔이 공용 compute CPU를 먹으면 classinkr-web의 PostgREST 지연으로 전이된다.

### 분리를 반대하는 근거 (더 무겁다)

1. **병목의 원인이 아니다.** §2의 H1~H4는 전부 classinkr-web 내부 문제고, H5/M1은 crm 내부 문제다. **두 앱 사이의 경합으로 인한 항목이 하나도 없다.** DB를 나눠도 모든 병목이 그대로 따라온다. 분리는 문제를 해결하지 않고 **이동만** 시킨다.
2. **운영 비용이 2배가 된다.** Supabase 프로젝트 2개 = 컴퓨트 2벌, 백업 2벌, 모니터링 2벌, 마이그레이션 파이프라인 2벌. 지금 crm 쪽은 마이그레이션 파이프라인이 **아직 1벌도 제대로 없다**(§6). 없는 걸 2벌로 만드는 셈이다.
3. **되돌리기 어렵다.** 지금은 조인이 필요 없지만, 리드→CRM 고객 연결은 이미 개념적으로 존재한다(classinkr-web의 `crm_source_links`, `identity/stitch.ts`). 나중에 crm의 리드와 classinkr-web의 고객을 조인해야 하는 순간 **애플리케이션 레벨 조인으로 후퇴**하고, 그건 지금 §H2에서 지적한 "JS에서 필터·정렬"의 재발이다.
4. **분리 효과의 대부분을 같은 DB 안에서 얻을 수 있다** (아래).

### 대안 — 같은 DB 안에서의 롤 단위 격리 (권고)

물리적 분리 없이 리소스 격리 효과를 얻는다. 전부 DDL 몇 줄이다.

```sql
-- crm 앱 전용 role. 현재는 아마 postgres/service role 공유 중일 것 → 확인 필요
CREATE ROLE crm_app LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA crm TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crm TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;

-- 폭주 쿼리가 공용 CPU를 무한정 먹지 못하게 한다 (§H5 방어)
ALTER ROLE crm_app SET statement_timeout = '15s';
ALTER ROLE crm_app SET idle_in_transaction_session_timeout = '30s';

-- 커넥션 상한을 롤 단위로 못박는다 (§1의 3×N 문제 방어)
ALTER ROLE crm_app CONNECTION LIMIT 15;

-- 실수로라도 public을 못 읽게 한다 (현재 코드는 안 읽지만 규약을 강제)
ALTER ROLE crm_app SET search_path = 'crm';
REVOKE ALL ON SCHEMA public FROM crm_app;
```

이 5줄이 분리로 얻으려던 것 — **CPU 폭주 차단, 커넥션 고갈 차단, 데이터 접근 경계 강제** — 를 비용 증가 없이 제공한다. classinkr-web 쪽에도 동일하게 `statement_timeout`을 걸어야 대칭이 맞는다.

### 분리 트리거 (이 중 하나라도 발생하면 재평가)

- compute를 한 단계 올렸는데도 CPU 사용률이 지속 70% 이상
- 한쪽 앱의 배포·마이그레이션이 다른 쪽 장애를 유발한 사례 1건 이상
- crm이 별도 팀/외주 소유가 되어 접근 권한 경계가 조직적으로 필요해짐
- 데이터 소유권·컴플라이언스 요구(고객사 데이터 분리 등)

트리거 전까지는 **스키마 격리 + 롤 격리로 충분**하다.

---

## 5. 현재 요금제로 괜찮은가

### 먼저 — 저장소만으로 알 수 없는 것 **[미확인]**

정직하게 말하면 **요금제를 저장소에서 판정할 수 없다.** 다음 3개는 대시보드 확인이 필요하고, 이게 다른 모든 판단의 입력값이다.

**① Vercel 플랜 — Hobby와 일관되지만, Hobby의 시간 정밀도가 정합성 버그를 만든다.**

> **정정(2026-09-02):** 초판은 "cron 9개가 Hobby 한도 2개를 초과"라고 썼으나 틀렸다. Vercel은 2026-01부터 모든 플랜에서 프로젝트당 cron 100개를 허용한다. `scripts/check-vercel-crons.mjs:5`가 강제하는 "1일 1회" 제약이 현행 Hobby 규칙과 정확히 일치하며, 저장소는 일관돼 있다.

`docs/active/admin-settings-design.md:812`는 *"Vercel 플랜은 명시 확인 전까지 Hobby 기준으로 본다"*고 적었다. 문제는 개수가 아니라 **정밀도**다. Hobby는 지정 시각이 아니라 **그 시(hour) 안 임의 시점**에 실행한다.

- `sync-branch` 08:00과 `sync-branch-insights` 08:30은 **둘 다 08시대** → **실행 순서가 보장되지 않는다.** insights가 먼저 돌면 전날 데이터로 인사이트를 생성하고 Gemini 비용을 쓴 뒤 틀린 값을 저장한다.
- `sync-external-crm` 01:00과 `lead-response-alerts` 01:10도 같은 01시대 → 임의 겹침.

이건 성능이 아니라 **데이터 정합성 버그**이고, Vercel Pro의 분 단위 정밀도 또는 서로 다른 시(hour)로의 재배치가 해결한다(실행 계획 T11 참조).

또한 Hobby는 약관상 상업적 사용이 불가하다. 회사 제품이 Hobby에 올라가 있다면 성능과 무관하게 정리해야 한다.

**② Supabase 플랜과 compute 크기.** 저장소에 근거 0건. Free라면 DB 500MB 한도와 **7일 무활동 시 자동 일시정지**가 걸리는데, 어드민·크론이 도는 운영 시스템에는 부적합하다. §2의 부하 프로필(전체 테이블 스캔 + 2만 행 JSONB 파싱 + pgvector HNSW)은 Nano/Micro compute에서 확실히 아프다.

**③ 리전 — 성능상 가장 큰 단일 변수.** crm은 `sin1`(싱가포르) 고정, classinkr-web은 미지정(Vercel 프로젝트 기본값, 보통 `iad1` 미국). Supabase 프로젝트 리전은 저장소에 근거가 없다. **셋 중 최소 하나는 반드시 크로스리전이다.**

이게 왜 결정적인가: classinkr-web은 PostgREST 전용이라 **모든 쿼리가 HTTPS 왕복**이다. §H4의 어드민 페이지당 13회 팬아웃, §H3의 20회 직렬 페이징에 리전 왕복 지연(150~250ms)이 **그대로 곱해진다.** 20회 직렬 × 200ms = **4초**가 인덱스와 무관하게 발생한다. 인덱스 수십 개보다 리전 정렬이 먼저다.

### 판정

**현재 구성은 "지금 규모에서는 돌아가지만, 안전마진이 없다."**

- 스키마 격리·쿼리 위생(crm 쪽 `SELECT *` 0건, N+1 0건, `Promise.all` 적극 사용)은 실제로 좋다. 팀이 선행 감사 3라운드를 돌린 흔적도 분명하다(unified 콜드 732ms → 웜 12~35ms).
- 그러나 **보호장치가 없다**: `statement_timeout` 없음, 커넥션 상한 롤 단위 없음, 이벤트 테이블 보존정책 없음, 크론 실행 여부 모니터링 없음.
- 그리고 **무한 성장 테이블에 대한 계획이 전혀 없다** **[보고]**: `client_events`, `chat_messages`, `chatbot_answer_events`, `external_crm_records`, `audit_logs` 등이 INSERT 전용인데 마이그레이션 145개 전체에 `pg_cron`·retention·파티셔닝이 **0건**. 지금은 작아서 안 아프지만, 첫 번째로 벽에 부딪힐 곳이다.

---

## 6. 스키마 정본 드리프트 — 별도 P0

성능과 무관하지만 더 위험해서 따로 뺀다.

- **crm 저장소** **[보고]**: 앱이 실제로 쿼리하는 테이블 5개(`crm.ad_campaign_monthly`, `crm.meta_ad_monthly`, `crm.meta_ads`, `crm.meta_alias`, `crm.page_visits`)가 `scripts/schema.sql`에 **없다.** 수동 psql/SQL 에디터로 만들어졌다는 뜻이고, 그 테이블들의 인덱스·제약이 **소스 컨트롤에 존재하지 않는다.** 이 저장소만으로 재구축하면 앱이 깨진다. 게다가 `scripts/migrate.mjs`는 CI/배포에 연결돼 있지 않아 **수동 실행**이다.
- **classinkr-web** **[보고]**: `blog_posts`, `email_campaigns`, `bug_reports`, `roadmap_items`가 원본 `CREATE TABLE` 없이 "backfill" 마이그레이션으로 사후 복원됐다(각 파일 헤더에 자체 기록됨). 또 `20260613_docs_chunk_embedding_768.sql`은 889행의 1536차원 임베딩을 파괴할 뻔해서 **파일 안에서 통째로 주석 처리된 채 남아 있다** — 재실행 가능해 보이는 죽은 코드다. 삭제하거나 `.disabled` 확장자로 옮기는 게 안전하다.
- **`crm` 스키마 DDL이 어느 저장소에도 완전히 없다.** classinkr-web 마이그레이션에 `CREATE SCHEMA` 0건, `crm.` 참조 0건. crm 저장소의 schema.sql은 5개 테이블 누락. → **운영 DB의 `crm` 스키마는 현재 어떤 저장소로도 재현 불가.**

---

## 7. 실행 순서

### Phase 0 — 확인 (코드 변경 0, 반나절)

1. Vercel 플랜 확인 + **cron 9개가 실제로 실행되는지 로그 확인**. 안 돌고 있으면 데이터 정합성 사고로 에스컬레이션.
2. Supabase 플랜·compute 크기·**리전** 확인. 3개 리전(Vercel classinkr-web / Vercel crm `sin1` / Supabase) 정렬.
3. Supabase Dashboard → Query Performance에서 실제 상위 쿼리 확인. 본 문서의 랭킹과 대조. **정적 분석보다 이쪽이 정본이다.**

### Phase 1 — 무료·저위험 (요금제 무관)

4. **리전 정렬.** Supabase 리전에 양쪽 Vercel 프로젝트를 맞춘다. 단일 변경으로 가장 큰 효과.
5. **롤 격리 5줄**(§4) 적용 — `statement_timeout` + connection limit + `search_path`.
6. `loadPartnerCalendar`/`loadPartnerDocuments`에 `.slice()` 상한 (§H1). `loadPortalOverview:373-374`의 직렬 await → `Promise.all`.
7. crm 인덱스 2개: `crm.leads(meta_ad_id)`, 그리고 `to_char()` 래핑 제거 → 범위 조건(`created_at >= ... AND < ...`)으로 교체해 기존 인덱스 활성화 (§H5).
8. 크론 시간 분산 (00:15/01:00/01:10 → 최소 1시간 간격).
9. 데드코드 제거: `getLegacyCommercialOverview`, 주석 처리된 `20260613_docs_chunk_embedding_768.sql`.

### Phase 2 — 스키마 정본 복구 (P0, 성능과 별개)

10. 운영 DB에서 `crm` 스키마를 덤프(`pg_dump --schema-only --schema=crm`)해 저장소에 커밋. 누락 5개 테이블의 인덱스·제약 포함.
11. `scripts/migrate.mjs`를 배포 파이프라인에 연결하거나, 최소한 "수동 실행 필수"를 README에 명시.

### Phase 3 — 업그레이드한다면

Supabase 쪽 (플랜 확인 후 조정):
- **Free → Pro가 필요한 조건**: 자동 일시정지 제거, 일 단위 백업, DB 500MB 초과, compute 선택권. 운영 시스템이면 사실상 필수다.
- **compute는 RAM 기준으로 고른다.** 현재 부하 프로필(2만 행 JSONB 파싱, pgvector HNSW, 전체 테이블 스캔 후 JS 집계)은 CPU보다 **RAM에 민감**하다. Micro(1GB)에서 Small(2GB)이 첫 단계. 올리기 전에 Phase 1의 6~7번을 먼저 하면 한 단계를 아낄 수 있다.
- **읽기 복제본은 아직 이르다.** 복제본은 §H1~H3의 팬아웃 횟수를 줄이지 못하고 왕복 비용만 분산한다. Phase 1·4를 끝낸 뒤에도 CPU가 안 내려갈 때 검토한다.
- 커넥션은 **Supavisor transaction 모드(6543)** 로 통일. crm의 `pg` 코드는 named prepared statement를 쓰지 않아 transaction 모드와 호환된다 **[보고]** — 지금 세션 모드(5432)를 쓰고 있다면 전환 이득이 크다. 전환 후 `crm/lib/db.ts`의 `max: 3`은 오히려 올릴 수 있다.
- `crm/lib/db.ts`에 `connectionTimeoutMillis`·`idleTimeoutMillis` 추가. 현재 없어서 행 걸린 쿼리가 3슬롯 중 하나를 무한 점유한다.

Vercel 쪽:
- Pro 전환 시 cron 빈도 제약이 풀리므로 `scripts/check-vercel-crons.mjs`의 `MAX_DAILY_RUNS_PER_CRON`을 함께 조정하고, `admin-settings-design.md:812`의 "Hobby 기준" 가정도 갱신한다. **플랜 전환과 이 두 파일 수정은 한 세트다.**
- 무거운 크론에 `maxDuration` 명시. 현재 `vercel.json`에 `functions` 블록이 아예 없다.

### Phase 4 — 구조 (선행 감사의 미착수분)

`admin-perf-quality-audit-2026-07-23.md`의 **Wave 4-A(RSC 프리페치)** 가 여전히 열려 있다. §H4의 "어드민 페이지당 13회 팬아웃 × 인증 왕복"은 이걸 해야 사라진다. 본 감사는 그 결론을 뒤집지 않고 재확인한다.

무한 성장 테이블(§5)에 보존정책을 세운다. `client_events`부터 — `pg_cron`으로 90일 이전 삭제하거나 월 파티셔닝.
