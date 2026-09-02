# 공용 Supabase DB 최적화·통폐합 분석 — 2026-09-02

기준 시점: 2026-09-02
평가 범위: 같은 Supabase 프로젝트를 공유하는 두 앱의 DB 계층 전체
- Classin Home + Admin OS (이 저장소, `public` 스키마, supabase-js/PostgREST)
- Compass 마케팅 앱 (`classinkr-main/crm` 저장소, mkt.classin.co.kr, `crm` 스키마, raw `pg`)
평가 방식: 병렬 서브 에이전트 5개가 영역별로 읽기 전용 감사를 수행하고, 오케스트레이터가 P0·P1 주장을 코드로 재검증했다. 채점은 감점 우선이며 "동작한다"는 통과선이지 만점이 아니다. 코드로 확인한 사실과 추정을 구분해 적었다.

관련 코드(이 저장소): `supabase/migrations/20260828_compass_bridge_views.sql`, `lib/compass/*`, `lib/crm/compass-demo-signal.ts`, `lib/db/schema-contract.ts`, `scripts/check-vercel-crons.mjs`, `vercel.json`, `lib/repositories/branch-sync.ts`, `lib/repositories/meta-insights-daily.ts`
관련 코드(Compass 저장소): `scripts/schema.sql`, `scripts/migrate.mjs`, `lib/db.ts`, `lib/revenue.ts`, `app/api/cron/*`, `app/api/webhook/*`, `.github/workflows/*.yml`

관련 문서: [ADR-009](../adr/ADR-009-site-admin-deployment-boundary.md), [홈페이지·Admin 실행 경계 분리 계획](./site-admin-separation-plan-2026-08-28.md), [DB 마이그레이션 런북](./db-migration-runbook.md), [플랫폼 & 데이터 파트 가이드](./playbook/06-platform-data.md), [마케팅/그로스/CRM 파트 가이드](./playbook/04-growth-crm.md)

---

## 0. 결론 요약

1. **두 앱은 같은 Supabase Postgres를 확실히 공유한다.** Compass는 `crm` 스키마를 raw `pg`로 쓰고, 이 저장소는 2026-08-28부터 `public.compass_*_v` 브리지 뷰 7개로 그 스키마를 읽는다. 통합은 "새로 설계할 일"이 아니라 **이미 프로덕션에서 돌아가는 읽기 계약을 보강하고, 이중 미러와 무보호 쓰기를 걷어내는 일**이다.
2. **가장 급한 결함은 Compass 쪽 매출 미러다.** `crm.revenue_deals`를 하루 약 73회 트랜잭션 없이 `delete` → `insert`로 전량 교체하고, GitHub Actions 워크플로 2개가 같은 분에 같은 엔드포인트를 두 번 호출한다. 이 저장소의 Admin 매출 대조 배지가 그 테이블을 브리지 뷰로 읽으므로 "0행" 또는 "2배" 상태가 그대로 화면에 올라온다.
3. **Compass `crm` 스키마의 DDL 정본이 어느 저장소에도 없다.** 브리지 뷰가 의존하는 `crm.activities.deleted_at`, `crm.leads.meta_ad_id`, `crm.meta_ads`, `crm.meta_alias`는 Compass의 `scripts/schema.sql`에 정의가 없고, 그중 `deleted_at`은 Compass 코드에서도 참조가 0건이다. 프로덕션에만 존재하는 컬럼 위에 크로스 레포 계약이 서 있다.
4. **같은 외부 원천을 두 앱이 각각 미러하는 곳이 있다.** Meta Marketing API(이 저장소 20:50 UTC, Compass 21:00 UTC)와 매출원장 구글시트(이 저장소 08:00 UTC 1회, Compass 매시)가 대표적이다. ADR-009의 "Cron은 한 프로젝트만 소유" 원칙을 외부 원천 단위로 적용하면 절반 이상이 정리된다.
5. **저장소 토폴로지는 (a) 현행 유지 + 계약 보강이 정답이다.** Compass를 이 저장소의 `apps/compass`로 편입하는 것은 site/admin 분리조차 1단계인 지금 시기상조이고, 별도 Supabase 프로젝트로 떼는 것은 이미 만든 브리지 자산을 버리는 역행이다.

## 1. 검증된 기준선

| 항목 | Classin Home + Admin (이 저장소) | Compass (`classinkr-main/crm`) |
|---|---|---|
| DB 접근 | supabase-js, `createSupabaseAdminClient()` service role. `pg`·`DATABASE_URL` 참조 0건 | `pg` Pool(max 3) + `DATABASE_URL`(Supabase pooler), `ssl.rejectUnauthorized=false` |
| 스키마 | `public`, 분석 기준 마이그레이션 163개 파일(+레거시 SQL 3개), 테이블 154개, RLS 선언 154개 테이블(100%), 인덱스 약 380개, 함수 53개, 뷰 14개, DROP TABLE 0건. 분석 중 원격에 `20260828_crm_region_assignments.sql`, `20260829_showroom_bookings.sql`이 추가돼 테이블은 156개가 됐고 새 테이블도 RLS를 켠다 | `crm`, `scripts/schema.sql` 410줄(append-only), CREATE TABLE 21개, `scripts/migrate.mjs`가 전체 재실행(버전 테이블 없음) |
| 스키마 검증 | `lib/db/schema-contract.ts` 프로브 + `npm run check:db` | 없음 |
| 크론 | `vercel.json` 11개(모두 하루 1회 이하) | `vercel.json` 2개 + GitHub Actions 매시 호출 2개 워크플로 + 외부 POST 진입점 |
| 웹훅 | channel-talk, internal-cs, page | meta(Lead Ads), page-visit |
| 인증 | Supabase Auth + `admin_profiles` RBAC + `audit_logs` 행위자 스냅샷 | 공용 비밀번호(TEAM_PASS/BD_PASS) + HMAC 쿠키 90일, 이름 자유 선택 |
| 담당자 정본 | `admin_profiles.crm_owner_key/crm_owner_aliases/neo_owner_id` | `lib/members.ts`, `lib/neocrm.ts` 하드코딩 |
| 테스트·린트 | vitest, eslint, 디자인 토큰·크론 검사 스크립트 | 없음(`tsconfig` strict만 켜져 있음) |
| 코드 규모 | Admin만 약 14.3만 줄(분리 계획 문서 기준) | 약 1.6만 줄, 최대 파일 953줄 |
| Vercel 리전 | sin1 | sin1 |

브리지 계약(이 저장소 → Compass 읽기): `compass_leads_v`, `compass_activities_v`, `compass_ads_v`, `compass_adsets_v`, `compass_demos_v`, `compass_cal_events_v`, `compass_revenue_v`. 모두 definer 뷰이며 anon/authenticated는 REVOKE, service_role만 SELECT. `lib/compass/bridge.ts`가 유일한 소비 계층이다.

## 2. 서브 에이전트 풀 할당

난이도와 효율을 기준으로 두 티어로 나눴다. 상위 티어는 저장소 두 개를 동시에 읽고 아키텍처 판단을 내려야 하는 과제, 하위 티어는 한 저장소 안에서 명확한 채점표로 끝나는 인벤토리 과제다. 다섯 에이전트는 병렬로 실행했고 파일 수정 권한은 주지 않았다.

| ID | 티어 | 과제 | 난이도 근거 | 검증 방법 |
|---|---|---|---|---|
| O1 | 상위 | 12개 도메인 크로스 레포 중복 분류(A/B/C)와 통폐합 로드맵 | 두 저장소의 코드·마이그레이션을 교차 대조하고 정본 소유권을 판단 | 오케스트레이터가 A분류 근거 파일을 재확인 |
| O2 | 상위 | 쓰기 파이프라인·크론 이중 실행·연결 풀·브리지 뷰 권한 감사 | 트랜잭션 경계, pooler 모드, 서버리스 동시성 추론 | P0 5건 전부 코드로 재검증(§5) |
| S1 | 하위 | Compass 스키마 드리프트·누락 인덱스 DDL·N+1 인벤토리 | 단일 저장소, 채점표 명확 | 드리프트 표본 9개 컬럼 재확인 |
| S2 | 하위 | `public` 154개 테이블 도메인 분류·RLS 커버리지·사장 테이블·중복 패밀리 | 단일 저장소, grep 기반 | RLS 100%·사장 테이블 4개·인덱스 공백을 재확인 |
| S3 | 하위 | 마이그레이션 거버넌스·인증·환경변수 중복·저장소 토폴로지 옵션 | 문서와 설정 비교 위주 | 주장 2건 정정(§6) |

하위 티어가 오케스트레이터의 기준선을 정정한 것도 있다. RLS 선언 테이블 수는 초기 한 줄 grep의 123개가 아니라 154개 전부다(이 저장소의 멀티라인 SQL 포맷을 grep이 놓쳤다). 오케스트레이터가 정정한 하위 티어 주장: (1) `meta_insights_daily`에 소비 코드가 없다는 주장은 틀렸다. `lib/marketing/perf-assemble.ts`와 `lib/marketing/insights/input-builder.ts`가 읽는다. (2) 스키마 계약의 마지막 프로브가 2026-08-20이라는 주장도 틀렸다. 2026-08-27 두 건까지 등재돼 있고 빠진 것은 2026-08-28 네 건이다. 상위 티어의 P0 주장은 정정 없이 전부 확인됐다.

## 3. 평가 루브릭

각 발견은 다음 네 축으로 채점했다.

- 영향 H/M/L: 보고 숫자 오염, 데이터 유실, 보안 노출, 사용자 대기 시간에 미치는 크기
- 노력 S/M/L: S는 하루 안, M은 한 주 안, L은 마이그레이션 계획이 필요한 규모
- 우선순위 P0~P3: P0은 지금 화면에 잘못된 숫자를 올리고 있거나 무보호 쓰기 경로, P1은 다음 스프린트, P2는 통폐합 로드맵에 편입, P3은 기록만
- 통폐합 분류 A/B/C: A는 같은 외부 원천을 두 앱이 각각 미러, B는 의미가 다른 부분 중복, C는 별개

영역별 점수(100점 만점, 감점 우선)는 §9에 모았다.

## 4. 크로스 레포 도메인 중복·통폐합 매트릭스 (O1, A분류 근거 재검증 완료)

### 4.1 구조적 대전제

교차 쓰기는 0건이다. 이 저장소는 `crm.*`를 브리지 뷰로만 읽고, Compass는 `public.*`이나 supabase-js를 전혀 참조하지 않는다. 따라서 모든 중복은 "같은 외부 원천을 두 앱이 각각 미러"하는 형태이며, DB 레벨의 이중 쓰기 충돌은 없다. 이것이 통폐합 난이도를 크게 낮춘다.

공유 외부 원천: 매출원장 스프레드시트(Compass는 ID 하드코딩, 이 저장소는 환경변수. 탭 이름 `1. DSH`/`2. REV`/`3. KPI`, A열 고객·F열 Team·G열 담당·H열 Status·J열 Product 인덱스가 Compass `lib/revenue.ts`와 이 저장소 `lib/branch/parsers/rev.ts`에서 완전히 같다), Meta 광고 계정(이 저장소 `app/api/admin/compass/ads/route.ts` 주석이 "같은 광고 계정"이라고 명시), Meta 리드애즈 웹훅(양쪽 모두 leadgen 핸들러 보유, 실제 이중 구독 여부는 코드 밖), NeoCRM 테넌트(ownerId 값이 양쪽에서 정확히 일치).

### 4.2 도메인별 판정

| # | 도메인 | 분류 | 현재 쓰기 소유자 | 제안 정본 | 방식 | 노력 | 우선순위 |
|---|---|---|---|---|---|---|---|
| 1 | 리드/고객 | B (Meta 리드애즈 축만 A) | Compass=콜·케어 상태, 이 저장소=웹 유입·배정·SLA | 광고 리드=Compass, 웹 리드=이 저장소 | Meta 웹훅 이중 수신 확인 후 단일 수신자화. 테이블 병합 금지, `phone_key` 오버레이 유지. 역방향 뷰 `admin_leads_v` 추가 | S→M | P0(확인)/P2(역방향) |
| 2 | 활동/연락 기록 | B | Compass=콜 로그(자유 텍스트), 이 저장소=구조화 연락 결과·미팅록·되밀기 | 각자 유지 | Compass에 소프트 삭제(`deleted_at`) 실제 도입. 고객 360에 `compass_activities_v` 병기 | S~M | P1 |
| 3 | 매출원장 미러 | **A** | 없음(시트가 원천, 양쪽이 미러) | 중기 이 저장소(`branch_rev_deals` + DB-native 원장) | 관측 → 파서 공용화 → 역방향 뷰 → 크론 단일화 | S→L | P0/P1 |
| 4 | 딜 | C | 이 저장소(`crm_deals`) | 이 저장소 | Compass `crm.deals`는 참조 0건. 사장 선언 | S | P3 |
| 5 | Meta 광고 | B | Compass=광고·광고세트 레벨+크리에이티브, 이 저장소=캠페인 레벨+reach/CTR/CPC/CPM | 현행 분업 유지 | 계정 총액 대사 지표, Graph API 버전 통일(v21→v25), 미선언 DDL 기록 | S~M | P0(DDL)/P1(대사) |
| 6 | 캘린더 | B | Compass='MKT 데모일정' pull 미러, 이 저장소=팀 일정 push | 현행 유지 | `crm.ad_plans`를 Admin 캘린더 소스로 노출하는 뷰 1장 | S | P3 |
| 7 | 태스크/미션 | C | Compass=주간 미션 칸반, 이 저장소=고객 태스크·캠페인 프로젝트 | 각자 | 그대로 둔다 | — | P3 |
| 8 | 데모/행사 | B | Compass=데모 회차, 이 저장소=행사·설치 | 현행(이미 통폐합 완료 사례) | `lead_demos`에 `public_event_id` 연결키. 단 §5 R5의 쓰기 공백을 먼저 메운다 | S | P2 |
| 9 | 페이지 방문 | C | Compass=설명회 랜딩(event repo), 이 저장소=classin.co.kr | 각자 | `crm.page_visits` DDL 기록만 | S | P0(DDL) |
| 10 | NeoCRM 쓰기 | **A** | 양쪽(등록 표식이 서로 단절) | 이 저장소 `crm_write_requests` 승인 큐 | 중복 대사 → 표식 미러 → 쓰기 창구 단일화. XLSX 폴백 유지 | S→L | P0/P1 |
| 11 | 담당자 정본 | **A** | 이 저장소 DB, Compass는 하드코딩 사본 | 이 저장소(`crm_xiaoshouyi_owner_names` + `admin_profiles`) | 황찬우 ownerId 누락 수리 + `team_directory_v` 역방향 뷰 | S | P0/P1 |
| 12 | 인증/세션 | C | 각자 | 각자 | Compass actor 신뢰 등급 표기, 개인 비밀번호 전환. Supabase Auth 강제 이관은 하지 않음 | S~M | P1/P2 |

A분류(진짜 중복)는 3.5개다. 매출원장 미러, NeoCRM 쓰기, 담당자 정본, 그리고 리드 도메인 안의 Meta 리드애즈 축.

### 4.3 A분류 상세

**매출원장 미러.** 같은 시트를 Compass는 매시, 이 저장소는 하루 1회 미러한다. 이 저장소는 이미 이중 미러를 인지하고 `lib/admin-crm-revenue-sheet.ts`의 `getCompassRevenueCompare()`로 두 미러의 차액을 화면 배지로 띄운다. 그러나 두 앱은 같은 셀에서 다른 숫자를 만든다. Compass는 A열 주황(`#B45F06`)을 "마케팅 유입 고객"으로 읽어 본사 유료전환 기준으로 쓰고(7월 58,323 정확 일치로 검증됨), 이 저장소는 `lib/branch/google-sheets.ts`에서 같은 색을 명시적으로 제외한다. 확정 매출 정의도 다르다. Compass는 주간 셀 빨강 합산, 이 저장소는 `lib/branch/computations/rev-confirmed.ts`의 3단 폴백이다. 따라서 미러를 하나로 합치기 전에 파서를 하나로 만들고 동일 월 바이트 일치를 확인해야 한다. Compass의 `MKT_EXCLUDE`, `PERSON_SINCE`, `DEMO_OVERRIDE`는 사용자 확정값이므로 "더 정확하게" 고치는 대상이 아니다.

**NeoCRM 쓰기.** Compass는 XLSX 내보내기와 로컬 MCP 스크립트(`scripts/push_neocrm.mjs`, 머신 바운드)로 리드를 생성하고 `crm.leads.neocrm_registered_at/neocrm_lead_id`에만 표식을 남긴다. 이 저장소는 `crm_write_requests` 승인 큐로 쓰고 `crm_source_links(target_type='external_lead')`에 표식을 남긴다. 두 표식은 서로를 모른다. 이 저장소가 등록한 리드를 Compass가 재등록할 수 있다. 되돌리기 비용이 큰 남의 CRM 오염이므로 1회성 3자 대사(NeoCRM KR 리드 ↔ `neocrm_lead_id` ↔ `crm_source_links.target_id`)가 먼저다. 장기 목표는 승인·재시도·감사가 이미 구현된 이 저장소 큐를 유일한 쓰기 창구로 두는 것이다. XLSX 폴백은 MCP 토큰이 짧고 머신 바운드라 제거하면 안 된다.

**담당자 정본.** 같은 ownerId·EEO 코드가 Compass `lib/neocrm.ts`, `scripts/push_neocrm.mjs`, 이 저장소 `crm_xiaoshouyi_owner_names` 시드, `admin_profiles.neo_owner_id` 네 곳에 있다. 이미 드리프트가 발생했다. 황찬우가 Compass XLSX 경로에는 있고 MCP 경로 `OWNERS`에는 없다. 이 저장소는 `20260828_owner_names_add_chanwoo.sql`로 보정했다. 가장 싼 승리는 `crm_xiaoshouyi_owner_names`와 `admin_profiles`를 조인한 `team_directory_v` 뷰를 만들고 Compass가 상수 대신 이 뷰를 읽게 하는 것이다. DB 장애 시 로그인 화면이 죽지 않도록 하드코딩은 폴백으로 남긴다. Compass의 `MKT_PERSONS`는 화이트리스트이고 이 저장소의 `is_excluded`는 블랙리스트이므로 변환 방향에 주의한다.

### 4.4 통합하면 안 되는 것

1. `public.leads` ↔ `crm.leads` 테이블 병합. PK 타입(UUID vs serial), RLS 정책, FK 그래프가 전부 다르다.
2. Compass의 사용자 확정 집계 규칙 정리. 본사 보고와 대사된 값이라 연속성이 끊긴다.
3. 캠페인 레벨과 광고 레벨 Meta 수집을 한 테이블로 병합. 이중 계상이며 이 저장소가 금지 근거를 코드에 적어 뒀다.
4. Compass Meta 리드 수와 이 저장소 leads 건수를 같은 CPL 식에 쓰는 것. `lib/marketing/compass-creative.ts`가 명시적으로 금지한다.
5. `crm_deals`(내부 영업), `deals`·`partner_deals`(파트너 포털), `branch_rev_deals`(시트 행) 병합. 이름만 같다.
6. `crm.activities` → `crm_customer_events` 이관. FK 무결성을 잃고 Compass 타임라인이 외부 조회가 된다.
7. `crm.focus_items` → `crm_tasks` 이관. 고객 없는 팀 업무가 우선순위 큐를 오염시킨다.
8. `crm.lead_demos` ↔ `install_schedules`. 계약 전후로 수명주기가 반대다.
9. Compass 데모와 Admin 캘린더 소스의 dedup. `lib/compass/calendar.ts`가 "실측 근거 없는 dedup 금지"를 이미 정했다.
10. `client_events`에 외부 사이트 트래픽 유입. same-origin 방어가 무력화된다.
11. NeoCRM XLSX 폴백 제거.
12. Compass의 Supabase Auth 강제 이관. 90일 세션이 콜 도구 UX의 핵심이다. 개인 비밀번호 + 소프트 삭제로 훨씬 싸게 해결된다.
13. `admin_calendar_events` ↔ `calendar_events`(파트너). 분리 사유가 마이그레이션에 문서화돼 있다.
14. `crm_revenue_target`(수기 목표) ↔ `crm.revenue_periods.goal`(시트 목표). 의미가 다르다.
15. `crm.lead_baseline`. 다른 스프레드시트(직전 FY 원장)를 읽는다.


## 5. 쓰기 파이프라인·동시성·연결 감사 (O2, 재검증 완료)

### 5.1 쓰기 주체 인벤토리 요약

| 구분 | 이 저장소 | Compass |
|---|---|---|
| 스케줄 쓰기 | Vercel 크론 11개(Bearer `CRON_SECRET` 단일 검증. 2026-08-28 커밋이 `x-vercel-cron` 헤더 게이트를 제거했고, 라우트 주석은 그 게이트가 Vercel 실제 요청과 맞지 않아 크론 11종이 401로 멈춰 있던 기간이 있었다고 기록한다) | Vercel 크론 2개 + GitHub Actions 매시 호출 3단계(sheet → calendar-sync → revenue) + 중복 워크플로 1개 |
| 웹훅 쓰기 | 3개. channel-talk·internal-cs는 timing-safe HMAC, page는 평문 비교 | 2개. meta는 HMAC이지만 시크릿 미설정 시 검증 생략, page-visit은 토큰 평문 비교 |
| 사용자 쓰기 | Admin API(RBAC + RLS) | 서버 액션 모듈 3개(`leads/actions.ts` 32개 액션, `tasks/actions.ts`, `ads/actions.ts`), 경로 기반 역할 제한만 |
| 로컬 쓰기 | 없음 | 백필 스크립트 18개가 노트북에서 `.env.local`의 `DATABASE_URL`로 직접 쓰기 |
| 합계 | 14 진입점 + Admin UI 그룹 | 31 진입점 |

### 5.2 위험 순위

| # | 우선순위 | 발견 | 근거(코드 확인) | 영향 | 수정안 | 노력 |
|---|---|---|---|---|---|---|
| R1 | P0 | `crm.revenue_deals` 전량 교체가 트랜잭션이 아니다 | Compass `lib/revenue.ts` 193~196행: `q("delete from crm.revenue_deals")` 뒤 별도 `q(insert … jsonb_to_recordset)`. `q()`는 `pool.query()`라 호출마다 다른 커넥션·자동 커밋. `revenue_deals`에는 serial PK 외 유니크 키 없음 | 교체 중 `compass_revenue_v`가 0행. 동시 실행 시 딜 2배. 이 저장소 `lib/admin-crm-revenue-sheet.ts`의 대조 배지가 그 값을 정상으로 표시 | 단일 커넥션 `begin/commit` + `pg_advisory_xact_lock` + 업무 유니크 인덱스. 소스 0건이면 지우지 않는 가드 추가 | S |
| R2 | P0 | 같은 분에 `/api/cron/revenue`가 두 번 호출된다 | `.github/workflows/hourly-sync.yml`과 `revenue-sync.yml` 모두 `5 * * * *`. 라우트는 `CRON_SECRET`만 인정하는데 후자는 `CRM_CRON_SECRET`을 보낸다 | R1을 매시 유발하거나, 시크릿이 다르면 매시 401 | `revenue-sync.yml` 삭제, 시크릿 이름 통일 | S |
| R3 | P0 | 60초 라우트 끝에 매출 동기화가 편승한다 | Compass `app/api/cron/sheet/route.ts`: `maxDuration = 60`, 마지막에 `await syncRevenue()` | 타임아웃 시 DELETE 커밋 후 INSERT 전에 종료 → 다음 성공까지 빈 테이블 유지. `syncRevenue` 실호출 약 73회/일, 매시 :05에 3중 | 편승 제거, 독립 크론 하루 1회 | M |
| R4 | P1 | 캘린더 미러도 150일 범위를 무트랜잭션으로 교체한다 | Compass `app/api/cron/calendar-sync/route.ts`: `delete … where day between` 후 루프 upsert | Admin 캘린더가 `compass_cal_events_v`로 빈 구간을 볼 수 있음. 매시 발생 | 단일 트랜잭션 + 집합 insert | S |
| R5 | P1 | `crm.lead_demos`를 쓰는 서버 코드가 없다 | Compass 전체에서 insert는 `scripts/backfill_demos.mjs` 한 곳. `scheduleDemo` 액션은 `leads.demo_at`과 활동만 쓴다 | 브리지 마이그레이션 주석의 "데모 추측을 실측으로 대체" 전제가 성립하지 않음. `compass_demos_v`는 마지막 수동 백필에 동결 | `scheduleDemo`에서 `lead_demos` upsert(`lead_demos_uniq` 인덱스 존재) | M |
| R6 | P1 | Meta 리드 웹훅이 시크릿 미설정 시 서명 검증을 건너뛴다 | Compass `app/api/webhook/meta/route.ts` 39~47행: 검증이 `if (secret)` 블록 안 | 환경변수 누락 배포 한 번이면 무서명 POST로 `crm.leads` 삽입 가능 | 시크릿 없으면 503 | S |
| R7 | P1 | Meta 인사이트 크론이 `maxDuration` 없이 행 단위 쿼리를 돌린다 | Compass `app/api/cron/meta/route.ts`: 루프 7곳에서 행마다 `await q(...)`, `if (…error) break;` 3곳 | 기본 함수 제한 초과 시 뒤쪽 테이블 상시 미완, 레이트리밋을 삼키고 `ok:true` | `maxDuration` 선언 + `jsonb_to_recordset` 배치 + `partial:true` 응답 | M |
| R8 | P1 | 커넥션 풀이 팬아웃을 직렬화한다 | Compass `lib/db.ts`: `max: 3`, `connectionTimeoutMillis` 미설정(무한 대기). `leads/page.tsx`는 `Promise.all` 13개, `lib/adReport.ts` 10개 | 병렬 의도가 3개씩 직렬화. 크론이 풀을 점유하면 사용자 요청 무한 대기 | `max` 상향, `connectionTimeoutMillis` 5초, `idleTimeoutMillis`, `keepAlive` | S |
| R9 | P2 | TLS 인증서 검증 비활성 | Compass `lib/db.ts`, `scripts/db.mjs` 모두 `rejectUnauthorized: false` | 중간자 공격 시 DB 비밀번호 노출 | Supabase CA 동봉 후 `true` | S |
| R10 | P2 | 월 필터가 인덱스를 타지 못한다 | Compass 대시보드·광고성과표의 `to_char(created_at at time zone 'Asia/Seoul','YYYY-MM') = any($1)`. `crm.leads` 인덱스는 phone/stage/created_at과 `stage='bd'` 부분 인덱스 4개, `crm.activities`는 lead_id 1개 | 렌더 1회에 11~13개 전량 스캔 | 범위 술어 재작성 + 표현식 인덱스. 근본책은 이 저장소 `20260613_admin_crm_overview_snapshot.sql`의 스냅샷+dirty 로그 패턴 이식 | M~L |
| R11 | P2 | 이 저장소 branch-sync의 single-flight가 check-then-act다 | `lib/repositories/branch-sync.ts` `isAnyRunning()`: count 조회 후 진행, 유니크 인덱스 없음 | 크론과 수동 실행 동시 통과 시 `replace_branch_rev_deals`의 `truncate`가 2회. 교체는 원자적이지만 ACCESS EXCLUSIVE 락으로 독자 블로킹 | `20260719_external_crm_single_flight.sql`의 부분 유니크 인덱스 패턴 이식 | S |
| R12 | P2 | Meta API를 두 앱이 10분 간격으로 각각 소비한다 | 이 저장소 `sync-meta-insights` 20:50, Compass `cron/meta` 21:00(UTC). 같은 광고 계정 여부는 추정 | 레이트리밋 시 R7의 무음 break | 외부 원천 단일 소유자화(§5.4) | M |
| R13 | P2 | Bearer 비교가 timing-safe하지 않다 | 이 저장소 크론 11개, Compass 크론 7개, 양쪽 page 웹훅 모두 `!==` 비교. `webhook/channel-talk`의 `safeEquals`는 이미 존재 | 실무 위험 낮음, 규약 불일치 | 공용 유틸화 | S |
| R14 | P2 | 브리지 뷰 권한이 롤 두 개만 회수한다 | `20260828_compass_bridge_views.sql`: REVOKE 대상이 anon/authenticated뿐, `compass_activities_v`는 통화 기록 `body`까지 노출 | 지금은 안전. 향후 `GRANT … ON ALL TABLES IN SCHEMA public`이 들어오면 Compass PII가 무음 개방 | `ALTER DEFAULT PRIVILEGES` 명시, `body` 분리, 권한 회귀 테스트 | S |
| R15 | P3 | 크론 개수 상한을 아무도 검사하지 않는다 | `scripts/check-vercel-crons.mjs`는 크론당 빈도만 검사. `vercel.json` 11개 vs AGENTS.md "Hobby 기준". Compass 워크플로 주석은 "Hobby 2개 한도"를 실제로 겪은 흔적 | Pro라면 규칙 문서가 낡은 것, Hobby라면 크론 일부가 조용히 미실행. 참고로 `sync-branch` 라우트 주석(2026-08-28)은 게이트 없는 배포에서 크론이 매일 실행됐다고 기록하므로 Vercel이 11개를 스케줄한다는 정황은 있다. 다만 같은 주석은 2026-06-24~07-02, 07-07~08-28 사이 크론 전체가 401로 멈춰 있었다고도 기록하므로, 지난 두 달의 크론 산출물(다이제스트·동기화 run)은 결손 구간이 있다고 봐야 한다 | 대시보드에서 두 프로젝트 플랜과 크론 실행 로그 확인 후 개수 assert 추가. 결손 구간의 재실행 필요 여부를 크론별로 판정 | S |
| R16 | P3 | 자동화 크론이 규칙마다 로그 전량을 읽는다 | `app/api/cron/automation/route.ts` `isDue()` | N+1 | `limit 1` 또는 `last_run_at` 컬럼 | S |
| R17 | P3 | Compass BD 계정 제한이 경로 기반이라 서버 액션에는 닿지 않는다 | Compass `proxy.ts` `BD_ALLOWED` 정규식 vs 액션 ID 디스패치 | `/leads/care` 허용 계정이 모든 액션 호출 가능 | 액션 내부 역할 게이트 | M |

### 5.3 연결 아키텍처 판단

- 이 저장소는 DB 커넥션을 직접 점유하지 않는다. 전부 PostgREST 경유이며 병목은 Supabase 내부 풀에서 `57014`/PostgREST 오류로 표면화된다.
- Compass는 isolate당 최대 3커넥션이다. 전 페이지가 `force-dynamic`이고 매시 :05에 크론 3개가 겹치므로 동시 isolate 10~30개면 30~90 클라이언트 커넥션이다(추정). pooler가 transaction 모드면 큐잉으로 흡수되지만 타임아웃이 없어 사용자 요청이 무한 대기하고, session 모드면 max clients 오류가 난다. `DATABASE_URL`의 포트·모드는 코드로 확인할 수 없다.
- 같은 문제를 이 저장소는 이미 풀었다. 전량 교체는 `replace_branch_rev_deals` plpgsql 안의 `truncate + insert`(단일 트랜잭션), 동시 실행 차단은 `external_crm_sync_runs` 부분 유니크 인덱스(DB 보증). Compass에 이식할 레퍼런스가 저장소 안에 있다.

### 5.4 외부 원천별 단일 소유자 모델

ADR-009의 "Cron은 항상 한 프로젝트만 소유"를 외부 원천 단위로 적용한 안이다. 반대편 앱은 읽기 전용 브리지 뷰로만 소비한다.

| 외부 원천 | 현재 | 제안 소유자 | 근거 | 반대편 소비 |
|---|---|---|---|---|
| Meta Marketing API | 양쪽(20:50 / 21:00 UTC) | Compass | 캠페인·광고세트·광고·크리에이티브 계층 전부를 적재. 이 저장소는 캠페인 레벨만 | 이 저장소 마케팅 성과 대시보드(`lib/marketing/perf-assemble.ts`)가 `meta_insights_daily`를 읽으므로 `compass_ads_v` 기반 어댑터를 먼저 만든 뒤 `sync-meta-insights` 폐지 |
| 매출원장 구글시트 | 양쪽(Compass 매시 / 이 저장소 08:00) | 이 저장소 | `replace_branch_rev_deals`가 단일 트랜잭션 RPC로 이미 올바름 | 과도기에는 Compass를 하루 1회(07:40)로 축소, 최종적으로 Compass가 `public.branch_rev_deals` 역방향 브리지 뷰를 소비 |
| 광고 리드 구글시트 | Compass 매시 | Compass 유지 | 리드 원본 소유권 | `compass_leads_v` |
| Google Calendar 'MKT 데모일정' | Compass 매시 | Compass 유지 | 워크스페이스 정책상 사람 계정 OAuth만 쓰기 가능 | `compass_cal_events_v` |
| NeoCRM(销售易) | 이 저장소 01:00 읽기 + Compass 로컬 MCP 쓰기 | 정본 결정 필요(§4) | 방향이 반대 | — |
| Channel Talk | 이 저장소 | 유지 | Compass는 라벨만 있고 API 연동 없음 | — |
| 리드 유입 웹훅 | 양쪽 | 분리 유지 | 원천이 다름(Meta Lead Ads vs 홈페이지 폼) | `compass_leads_v.phone_key`로 상호 dedupe |

제안 시간표(UTC): 매시 :05 Compass sheet(편승 제거), 매시 :20 Compass calendar-sync, 07:40 Compass revenue(신규 독립, 하루 1회), 08:00 이 저장소 sync-branch, 20:40 Compass meta(단일 소유), 이 저장소 20:50 폐지. `revenue-sync.yml`은 삭제하고 `hourly-sync.yml`은 2단계로 축소한다. Pro 확정 시 GitHub Actions는 `workflow_dispatch` 수동 백업만 남긴다.

크론 공통 규약: single-flight는 DB가 보증한다(부분 유니크 인덱스 또는 advisory lock). 전량 교체는 단일 트랜잭션이다. 소스 0건이면 아무것도 지우지 않는다. `maxDuration`을 명시한다. 행 단위 순차 쿼리 대신 `jsonb_to_recordset` 배치를 쓴다. 부분 실패는 응답에 `partial: true`로 싣는다.

### 5.5 운영 실증 (GitHub Actions 실행 이력, 2026-09-02 확인)

코드 판정을 Compass 저장소의 워크플로 실행 이력과 잡 로그로 대조했다. 이 세션은 운영 도메인에 직접 요청할 수 없어(네트워크 정책) 로그가 유일한 운영 증거다.

- `hourly-sync`와 `revenue-sync`는 둘 다 매시 실행되며 최근 실행 대부분이 성공이다. `revenue-sync`는 `curl -sf`로 200을 받아야 성공하므로 두 워크플로의 시크릿 값은 같고, 매출 동기화는 실제로 매시 3회 실행된다(sheet 크론 편승 1회 + hourly-sync 3단계 1회 + revenue-sync 1회). 다만 GitHub 스케줄 지터가 커서 같은 분에 겹치는 빈도는 확률적이다(예: 03:55와 04:02).
- 최근 성공 응답: sheet 크론 `sheetRows 671, newLeads 0`, 매출 `periods 15, kpiRows 104, revRows 33, baseline 12`, 캘린더 `events 169`(약 150일 범위). `revenue_deals`는 33행 규모라 교체 창은 짧지만, 구조적 위험(무트랜잭션 전량 교체, 동시 실행)은 규모와 무관하다.
- 2026-08-31 01:18 실행은 Google Sheets가 "The caller does not have permission"을 돌려줘 sheet 크론 응답의 `revenue.ok=false`와 revenue 단계 실패로 끝났다. 시트 공유 권한이 간헐적으로 흔들린다는 뜻이며, 이 경우 예외가 쓰기 전에 나므로 미러는 보존된다. 새 코드의 0건 가드와 트랜잭션은 이 경로를 그대로 지킨다.
- Compass P0 패치는 [classinkr-main/crm#1](https://github.com/classinkr-main/crm/pull/1)로 올렸다. 적용 순서와 롤백은 그 PR 본문과 Compass 저장소의 `docs/p0-sync-safety-2026-09-02.md`에 있다. Vercel이 이 PR 브랜치를 Ready로 빌드했고(2026-09-02 05:11 UTC) 머지 상태는 clean이다. 즉 패치 세트는 Compass의 실제 빌드 환경에서 컴파일·배포가 확인됐다.

## 6. 거버넌스·인증·연동 평가 (S3, 정정 반영)

### 6.1 마이그레이션 거버넌스

| 관점 | 이 저장소 | Compass | 격차 |
|---|---|---|---|
| DDL 정본 | 타임스탬프 마이그레이션 163개, idempotent 규칙 | `scripts/schema.sql` 1개, 전체 재실행 | Compass는 프로덕션에만 있는 테이블 5개(`meta_ads`, `meta_alias`, `page_visits`, `ad_campaign_monthly`, `meta_ad_monthly`)와 컬럼 다수(`leads.meta_ad_id`, `activities.deleted_at` 등)가 정본에 없음. 이 저장소가 `email_campaigns` 고아 테이블로 겪고 2026-08에 고친 실패 모드와 같다 |
| 적용 검증 | 프로브 + `npm run check:db` | 없음 | 브리지 뷰를 만든 2026-08-28 마이그레이션 4건이 프로브에 없음. 런북의 "마이그레이션마다 프로브" 규칙을 브리지 자체가 위반 |
| 크로스 레포 계약 테스트 | `tests/compass/*` 7개 중 3개가 브리지 모듈을 모킹 | 없음 | Compass가 컬럼을 rename하면 CI가 잡지 못하고 런타임에서 뷰가 깨진다. "사전 공유" 규약은 SQL 주석 1줄 |
| RLS/권한 | 123개 테이블 RLS, 브리지 뷰 REVOKE | `crm` 스키마 전체 RLS/POLICY/GRANT 0건 | 격리가 스키마 네임스페이스와 고권한 롤 하나에만 의존 |

### 6.2 인증·정체성

- Compass의 `activities.actor`, `leads.owner/caller`는 자유 텍스트 이름이다. 이 저장소의 `admin_profiles.crm_owner_aliases`가 "시트·레거시 리드·외부 CRM 스냅샷의 이름 변형"을 담도록 이미 설계돼 있고 `neo_owner_id`는 NeoCRM 8명 링크가 끝났다. Compass 이름 변형을 이 배열에 채우는 것만으로 정체성 매핑이 닫힌다. 새 스키마는 필요 없다.
- 세션 SSO는 인증 포맷(Supabase JWT vs 커스텀 HMAC)이 달라 재작성 없이 불가하다. Compass 인증이 더 약하므로 세션 공유를 먼저 하면 Admin 보안 기준이 내려간다. 정체성 별칭 매핑을 먼저 완성한다.

### 6.3 외부 연동 중복

| 연동 | Compass | 이 저장소 | 판정 |
|---|---|---|---|
| Meta Marketing API | 소재·광고세트 단위, 크리에이티브 포함 | 캠페인 단위 `meta_insights_daily`, 성과 대시보드가 소비 | 실질 중복. Compass 정본 + 어댑터 |
| NeoCRM(销售易) | MCP로 리드 직접 생성(로컬 반자동), 엑셀 내보내기 | REST 읽기 미러 + 승인 큐 경유 쓰기 요청 | 실질 중복이지만 방향 반대. 정본 결정 필요 |
| Google Calendar | 사람 계정 OAuth | 서비스 계정 위임 | 범주만 중복, 인증 모델이 달라 통합 실익 낮음 |
| Google Sheets 서비스 계정 | 있음 | 있음 | 범주만 중복 |
| Gemini | 태스크 파싱 | 챗봇·인사이트 | 범주만 중복, 저효용 |
| Channel Talk | 라벨만 | Open API 연동 | 중복 아님 |

### 6.4 저장소 토폴로지 옵션

| 옵션 | 노력 | 리스크 | 평가 |
|---|---|---|---|
| (a) 현행 유지 + 계약 보강 | S | 낮음 | 브리지 뷰가 8일째 프로덕션 운영 중. 되돌릴 것이 없다. **권고** |
| (b) 이 저장소 `apps/compass`로 편입 | L | 높음 | site/admin 2-앱 전환이 1단계인 상태에서 세 번째 앱은 시기상조. Compass 인증을 RBAC로 재작성해야 선행 |
| (c) 별도 Supabase 프로젝트로 완전 분리 | M | 통합 역행 | `DATABASE_URL` 교체만으로 기술적으로 쉽지만 브리지 뷰 7개와 소비 코드 전체가 무효화 |

(a)를 택하되 다음 세 가지를 계약으로 굳힌다. Compass `crm` 스키마 DDL은 Compass가 소유하지만 **정본 파일을 실제 프로덕션과 일치시키고**, 이 저장소의 스키마 계약에 브리지 뷰 프로브와 "필수 컬럼 존재" 프로브를 넣어 rename을 배포 전에 잡는다. 외부 원천은 §5.4대로 한 앱만 쓴다. 담당자 정체성은 `admin_profiles` 별칭으로 닫는다.

### 6.5 Compass 코드 품질 신호

- SQL 인젝션 표면: `buildLeadFilter()`를 포함해 사용자 입력은 전부 파라미터 바인딩이고, 문자열 보간은 컴파일 타임 상수에만 쓰인다. 라이브 취약점은 없지만 lint·테스트가 없어 관례에만 의존한다.
- `tsconfig` strict는 켜져 있다. eslint·vitest·lint 스크립트는 없다. `q<T>()`는 런타임 검증 없이 캐스팅한다.
- 약 1.6만 줄 중 `LeadDetailBody.tsx` 953줄, `BoardView.tsx` 831줄, `leads/actions.ts` 826줄. 컴포넌트 33개 중 11개가 three.js 기반 장식 효과 전용이다. 위험은 장식이 아니라 테스트 없이 953줄 컴포넌트를 운영하는 데 있다.

## 7. Compass `crm` 스키마 인벤토리 (S1, 표본 재검증 완료)

### 7.1 드리프트

| 구분 | 대상 | 근거 | 영향 | 우선순위 |
|---|---|---|---|---|
| 코드가 쓰는데 DDL 없음(테이블) | `crm.meta_ads`, `crm.meta_alias`, `crm.page_visits`, `crm.ad_campaign_monthly`, `crm.meta_ad_monthly` | `scripts/schema.sql`은 `meta_ads`에 ALTER만 걸어 둔 상태. 이 저장소 브리지 뷰가 `meta_ads.category`, `meta_alias(ref_id, alias)`에 의존 | `migrate.mjs`로 새 환경을 세우면 웹훅 리드 수집과 `/leads`, `/ads`가 즉시 깨짐 | P0 |
| 코드가 쓰는데 DDL 없음(컬럼) | `leads.meta_ad_id`, `focus_items.confirmed_at/confirmed_by`, `activities.deleted_at`(브리지 뷰만 참조) | `leads/page.tsx` 조인 4곳, `webhook/meta` insert, `tasks/data.ts` select | 동일 | P0 |
| 정의됐지만 미사용 | `crm.deals`(참조 0건), `crm.stages`의 label/sort(라벨은 `lib/stages.ts`에 이중 하드코딩, 시드의 `contact`/`consult`는 도달 불가), `leads.env/scale/timing`(코드 주석에 "미사용"), `focus_items.owner`(단일. 앱은 `owners[]`만 쓰는데 `import_kanvan.mjs`가 여전히 단일 컬럼에 씀 → 보드에 안 보이는 숨은 버그) | grep 전수 | 오해 유발, 숨은 버그 | P2/P3 |
| 죽지 않은 것 | `leads.subject`(단일). 시트 임포트 3곳이 쓰고 `/leads` 필터가 읽음 | 주석만 "레거시" | 삭제 금지 | — |

권고: 프로덕션 `crm` 스키마를 `pg_dump --schema-only`로 떠서 `schema.sql`과 대조하고 누락 객체를 append한다. 이후 "스키마 스냅샷 vs schema.sql" diff를 CI에 둔다(P1). `activities.deleted_at`은 실제 존재 여부를 먼저 확인한다. 없으면 브리지 뷰 `compass_activities_v`가 깨져 있다는 뜻이다.

### 7.2 인덱스

기존 인덱스는 15개(`leads` 4, `activities` 1, `meta_ad_daily` 1, `revenue_deals` 1, `focus_items` 4, `cal_events` 1, `lead_accounts` 1, `lead_demos` 2). 실쿼리 근거가 있는 제안 15건 중 상위:

```sql
-- meta_ads/meta_alias 조인 키(leads/page.tsx 4곳). 현재 인덱스 없음
create index concurrently leads_meta_ad_id_idx on crm.leads(meta_ad_id);
-- /leads 기본 정렬(스테이지 미필터 시 항상 이 순서)
create index concurrently leads_inflow_sort_idx on crm.leads((coalesce(last_inflow_at, created_at)) desc);
-- 상세 페이지·목록 상관 서브쿼리·케어 페이지 공통 패턴
create index concurrently activities_lead_created_idx on crm.activities(lead_id, created_at desc);
-- to_char(...,'YYYY-MM') 패턴 20곳 이상의 즉효 처방(쿼리 불변)
create index concurrently leads_inflow_ym_idx on crm.leads (to_char(coalesce(last_inflow_at, created_at) at time zone 'Asia/Seoul','YYYY-MM'));
create index concurrently activities_created_ym_idx on crm.activities (to_char(created_at at time zone 'Asia/Seoul','YYYY-MM'));
-- 중복 리드 판정(createLead, Meta 웹훅 매건)
create index concurrently leads_email_lower_idx on crm.leads(lower(email)) where email is not null;
```

나머지: `leads(owner, stage)`, `leads(caller)`, `leads(care_stage) where care_stage is not null`, `leads(callback_at) where callback_at is not null`, `leads(next_action_at)`, `leads(neocrm_registered_at) where neocrm_registered_at is null`, `leads(bd_row) where bd_row is not null`, `activities(kind, created_at)`, `revenue_deals(customer)`, `page_visits(ts desc)`.

브리핑 후보였지만 실쿼리 근거가 없어 기각한 것 9건: `leads gin(tags)`(실제 술어가 `array_to_string + ilike`), `leads gin(subjects)`(`$n = any(subjects)` 형태라 GIN이 못 탐, `@>`로 재작성 선행), `leads(campaign_id)`, `lead_demos(lead_id, day)`(기존 UNIQUE가 커버), `revenue_deals(month, is_mkt)`, `revenue_deals(team)`, `meta_ad_daily(day)`(PK 선두 컬럼), `cal_events(lead_id)`, `focus_items(product_id, status)`(전량 로드 후 JS 필터).

`to_char(... at time zone 'Asia/Seoul','YYYY-MM') = any($1)` 패턴은 `dashboard/page.tsx` 8곳, `lib/adReport.ts` 9곳 등 20곳 이상이다. 같은 파일에 `date_trunc + range`의 좋은 예가 공존하므로 팀이 패턴을 모르는 것이 아니라 `to_char`만 놓친 것이다. 표현식 인덱스를 먼저 넣고, 여력이 있으면 KST 자정 range로 재작성한다.

### 7.3 라운드트립

- `dashboard/page.tsx`: 서로 무관한 11개 쿼리를 3파 순차(`Promise.all` 3개 → 7개 → 조건부 1개)로 실행한다. 입력이 전부 searchParams에서 오므로 단일 `Promise.all`로 합치면 왕복 3회가 1회가 된다. `tasks/page.tsx`가 이미 조건부 쿼리를 `Promise.resolve([])`로 배열에 끼우는 패턴을 쓴다. P1.
- `lib/revenue.ts`의 `revenue_kpi` upsert: 월×사람 이중 루프 안 순차 insert. 20줄 아래 `revenue_deals`가 이미 `jsonb_to_recordset` 벌크 패턴이므로 그대로 재사용한다. P2.
- `scheduleDemo`/`clearDemo`: SELECT → 외부 캘린더 API → UPDATE 2~3 → INSERT 최대 7왕복. 연속 UPDATE는 `coalesce()`로 병합, "이전값 SELECT → UPDATE → 로그 INSERT" 3단은 CTE(`with upd as (update … returning …) insert into activities …`)로 1왕복화. P2.
- 문제 없는 곳: `leads/page.tsx`(13쿼리 단일 `Promise.all`), `lib/adReport.ts`(10쿼리 단일 `Promise.all`), `leads/care/page.tsx`(2파는 실제 의존관계). 서버 액션 파일의 75회·30회는 각각 32개·25개 독립 액션의 합계이며 루프 내 쿼리는 없다.

### 7.4 스키마 위생

- `updated_at`은 트리거 없이 수동 관리. 6곳의 개별 UPDATE가 안 찍지만 같은 함수의 다른 UPDATE가 찍어 줘서 지금은 괜찮다. before-update 트리거 권장(P2).
- CHECK 제약 전무. `activities.kind` 관찰값 8종, `focus_items.status` 관찰값 5종(주석은 3종), `care_stage` 5종, `lost_reason` 4종이 전부 자유 텍스트라 오타 시 필터가 조용히 0건이 된다(P2).
- 사람 식별자(`actor`, `owner`, `caller`, `bd_owner`)는 자유 텍스트이며 TS 배열·`focus_members` 테이블·자유 입력 3원화. §4.3 담당자 정본과 같은 문제다.
- text[] 4개(`leads.tags/subjects`, `focus_items.owners`, `cal_events.owners`)에 GIN이 없지만 실사용 술어가 배열 연산자를 안 써서 쿼리 재작성이 선행돼야 한다.
- 통화: 광고비는 `_usd` 접미로 명시, 매출은 bare numeric에 UI의 ¥ 하드코딩. 유일한 통화 컬럼은 안 쓰는 `deals`에 있다.
- 규모(추정): 리드 수백~수천, `focus_items` 수백 이하, `revenue_deals` 수백~2천. 인덱스 공백이 지금 당장 체감 장애는 아니지만 드리프트는 규모와 무관한 정확성 문제다.

## 8. `public` 스키마 인벤토리 (S2, 핵심 수치 재검증 완료)

### 8.1 규모와 도메인 분포

분석 기준 마이그레이션 163개 + 레거시 SQL 3개에서 테이블 154개, 인덱스 약 380개, 함수 53개(문장 77개), 뷰 14개가 만들어진다. DROP TABLE은 0건이다. 분석 중 원격에 추가된 `20260828_crm_region_assignments.sql`(테이블 1개), `20260829_showroom_bookings.sql`(테이블 1개)은 모두 RLS를 켜며, 아래 집계에는 넣지 않았다.

| 도메인 | 테이블 수 | 비고 |
|---|---|---|
| 파트너 포털 | 31 | v1(2026-04-02), v2(2026-04-04, `partner_account_id` 축), 워크스페이스(2026-07-27, `partners.id` 재사용) 3세대 공존 |
| 지사·매출원장 | 20 | `branch_*`, `sales_ledger_*`. DB-native 임포트 → 미러 캐시 → 라이브 시트 3단 폴백 |
| 리드/CRM 내부 | 20 | `leads`, `crm_*`, `lead_*`, `customers`, `deals` |
| 콘텐츠 | 18 | docs/blog/events/premium/downloads |
| 챗봇/CS | 16 | 공개 챗봇, 내부 CS, 채널톡 3개 독립 채널 |
| 마케팅/캠페인 | 12 | 2026-08-20 성과 대시보드 스파인 5개 포함 |
| 관리자/인증 | 10 | `admin_profiles`, `audit_logs`, 스냅샷, consent, identity |
| 알림/자동화 | 7 | |
| 결제/체크아웃 | 6 | |
| 하드웨어 | 6 | |
| 외부 CRM(NeoCRM) | 5 | |
| 기타 참조 | 2 | `regions`, `region_aliases` (사장 후보) |
| 분석/이벤트 | 1 | `client_events` |

### 8.2 RLS 커버리지

154개 테이블 전부에 `ENABLE ROW LEVEL SECURITY` 선언 이력이 있다. 오케스트레이터의 초기 한 줄 grep이 123개로 센 것은 이 저장소의 멀티라인 SQL 포맷을 놓친 오류였고, 멀티라인 정규식으로 재도출한 결과와 스키마 계약 파일의 자기 감사 주석("149개 테이블 중 이 둘만 RLS가 꺼져 있었다")이 일치한다.

- 과거 공백: 7개 테이블(`email_templates`, `automation_rules`, `automation_logs`, `site_settings`, `notifications`, `notification_events`, `notification_delivery_logs`)이 생성 직후 DISABLE 상태였다가 `20260423_rls_admin_only_tables.sql`로 닫혔다. 약 4주의 노출 창이 있었다(정보성). `blog_posts`, `patch_notes`는 `20260818_rls_blog_posts_patch_notes.sql`로 마지막에 닫혔다.
- 58개 테이블은 RLS는 켜져 있지만 정책이 0건이다(deny-all, service_role 전용). 브라우저 anon 키로 `.from()`을 호출하는 곳은 `admin_profiles` 자기 조회(로그인·레이아웃) 하나뿐이므로 설계대로 안전하다.
- 정책 134건 중 93건이 `TO` 절을 생략한다. `is_active_admin()`/`auth.uid()` 게이트로 기능적으로는 안전하지만 심층 방어가 약하다(P3).
- anon 공개 읽기: 공개 콘텐츠 테이블(의도됨)과 사장 테이블 `product_catalog_items`(`using(true)`, P3).
- anon 공개 쓰기: `leads` INSERT 정책 2건이 `with check (true)`다. 리드 폼의 의도된 경로지만 DB 레벨 검증이 없다(P2). `client_events` INSERT는 표준 분석 패턴이다.

### 8.3 사장·고아 객체

| 구분 | 객체 | 근거 | 우선순위 |
|---|---|---|---|
| 사장 테이블 | `product_catalog_items` | RLS·인덱스·시드까지 완비했지만 앱 참조 0건. 타입 2개도 미사용 | P2 |
| 사장 테이블 | `regions`, `region_aliases` | 소비 예정이던 `unified_companies` 뷰가 만들어진 적이 없음. 앱은 `lib/regions/korea-regions.ts` 하드코딩 사용. 시드 스크립트가 쓰기만 함 | P2 |
| 쓰기 전용 | `promo_code_redemptions` | `redeem_promo_code()` RPC 안에서만 INSERT, 읽는 화면 없음 | P3 |
| 사장 함수 | `normalize_region_code`, `increment_promo_code_used_count` | 후자는 2026-05-02 `redeem_promo_code()`가 인라인으로 대체 | P3 |
| 유령 타입 | `PartnerChangeLog` | 어느 테이블과도 컬럼이 맞지 않고 import 0건. 2026-08-18의 `hw_sales` 유령 타입 정리 때 누락 | P3 |
| 마이그레이션 내부 참조 | `admin_crm_overview_snapshots`, `admin_crm_overview_dirty_log` | 겉보기 0건이지만 `admin_crm_business_overview()` RPC가 사용. 사장 아님 | — |
| 뷰 14개 | — | 전부 실사용 확인 | — |

### 8.4 중복 패밀리

12개 패밀리를 검토한 결과 이름이 비슷한 테이블 대부분은 축이 다른 별개 개체다(`deals`/`crm_deals`/`partner_deals`/`branch_rev_deals`, `calendar_events`/`admin_calendar_events`, 채팅 3계열, 캠페인 계층, 로그 계열, 원장 3단 폴백). 드롭 가능한 것은 §8.3의 사장 테이블 3개뿐이다.

예외가 하나 있다. **파트너 포털 v1(`partners`, `partner_users`, `quotes`, `contracts`, `receipts`)과 v2(`partner_accounts`, `quote_documents`, `contract_documents`, `receipts_v2`)는 드롭 대상이 아니라 P1 데이터 정합성 리스크다.** `lib/portal/context.ts`가 로그인 시 v2를 먼저 찾고 없으면 v1로 폴백하며 결과에 `source: "legacy" | "v2"`를 태깅한다. v1 repository는 `lib/admin-crm-revenue.ts`, `lib/admin-crm-overview.ts`, 하드웨어 주문·설치 일정에서 지금도 호출된다. 두 세대 사이에 FK 연결이 없으므로 v1로 온보딩된 파트너 데이터가 v2 포털에 보이지 않는 병행 진실 원천이다. `activity_logs`(v2)와 `partner_activity_logs`(워크스페이스)의 이름 충돌도 같은 문제의 일부다(P2).

### 8.5 핫 경로 인덱스

- **공백**: `lib/repositories/leads.ts`의 리드 중복 탐지가 매 제출마다 `.in("phone", …)`, `.in("email", …)`를 실행하지만 `leads.phone`, `leads.email`에 인덱스가 없다.

```sql
create index if not exists idx_leads_phone on public.leads (phone) where phone is not null;
create index if not exists idx_leads_email_lower on public.leads (lower(email)) where email is not null;
```

- 양호: `external_crm_records`는 `20260617_external_crm_query_performance.sql`이 JSONB 표현식 인덱스까지 갖춘 모범 사례. `docs_ai_chunks`는 HNSW. `client_events`는 5차례 성능 마이그레이션으로 16개 인덱스.
- 구조적 리스크: `crm-unified-customers.ts`, `crm-priority-queue.ts`는 하위 repository를 전량 로드한 뒤 메모리에서 병합한다. 인덱스로 풀리지 않는 문제이며 `admin_crm_overview_snapshots`의 스냅샷 패턴 적용 대상이다(P2).

### 8.6 계약·타입·마이그레이션 품질

- 스키마 계약 프로브는 마이그레이션 10개(2026-08-18~08-27)만 다룬다. 2026-08 마이그레이션 25개 중 15개가 프로브 없음이고 그중 5개(`admin_calendar_events`, `lead_digest_runs`, `channel_conversation_cases`, `lead_activity_summary_rpc`, `compass_bridge_views`)는 새 객체를 만든다. 설계 목적이 "최근 드리프트 감지"라 6%가 이상은 아니지만 기준선이 8/27에 고정된 채 갱신되지 않는다(P2).
- 중앙 타입 파일 두 개는 154개 중 약 46개 테이블만 담고 수동 유지된다(`supabase gen types`는 주석으로만 존재). 나머지는 `lib/types/*`와 repository 로컬 인터페이스에 분산돼 있다. 무타입이 아니라 비중앙화다(P2).
- CREATE TABLE 165문 중 149문(90%)이 idempotent이며 비-idempotent 16문은 2026-04 초기 3개 파일에 몰려 있다. 같은 날짜 접두 파일이 36개 날짜에 2개 이상 있고(최다 2026-07-27 11개), `20260614211500_*`는 같은 날짜의 `20260614_*`보다 먼저 정렬된다. 6개 파일이 "운영 DB에는 있는데 저장소에 CREATE가 없던" 테이블을 역추적 재구성한 백필+DDL 혼합 파일이다. 운영 DB에 먼저 DDL을 적용하고 마이그레이션을 나중에 쓰는 워크플로가 반복된다는 신호이며, Compass의 드리프트(§7.1)와 같은 실패 모드다(P2).

## 9. 평가와 통합 우선순위

### 9.1 영역별 점수표

100점 만점, 감점 우선. 점수는 §4~§8의 발견을 근거로 한 판단값이며 실측 지표가 아니다. "경계"는 두 앱 사이의 계약(브리지 뷰, 크론 소유, 정체성 매핑)을 뜻한다.

| # | 영역 | Compass | Home + Admin | 경계 | 주요 감점 사유 |
|---|---|---|---|---|---|
| 1 | 스키마 정본성 | 35 | 82 | 40 | Compass: 테이블 5개·컬럼 3개 이상이 정본에 없음, 버전 테이블 없음. Admin: 백필 재구성 파일 6개, 중앙 타입 30%. 경계: 브리지가 미기록 컬럼에 의존, 프로브 없음 |
| 2 | 쓰기 원자성·멱등성 | 30 | 80 | 45 | Compass: 전량 교체 무트랜잭션 2곳, 유니크 키 없음. Admin: RPC 원자적이나 branch-sync가 check-then-act. 경계: 동기화 중간 상태가 Admin 화면에 노출 |
| 3 | 스케줄 단일 소유 | 40 | 75 | 50 | Compass: 같은 분 이중 호출, 60초 라우트 끝 편승. Admin: Meta 이중 소비. 경계: 외부 원천 2개를 양쪽이 미러 |
| 4 | 보안 경계 | 45 | 85 | 78 | Compass: `crm` 스키마 RLS 0건, 웹훅 fail-open, TLS 검증 끔, 공용 비밀번호. Admin: `leads` anon INSERT 무검증, 정책 93건 `TO` 생략. 경계: 뷰 REVOKE가 롤 2개만, 통화 기록 `body` 노출 |
| 5 | 성능·인덱스 | 55 | 80 | 70 | Compass: 비-sargable 20곳 이상, 풀 3개 직렬화, 누락 인덱스 15건(데이터는 작음). Admin: `leads.phone/email` 공백, 메모리 병합. 경계: 뷰 조인 키 인덱스 여부 미확인 |
| 6 | 정체성·감사 | 35 | 85 | 50 | Compass: 이름 자유 선택, 자유 텍스트 actor, 하드 삭제, 90일 세션. 경계: Compass actor가 신뢰 표기 없이 Admin으로 유입 |
| 7 | 관측·검증 게이트 | 20 | 78 | 45 | Compass: 테스트·린트·프로브 없음. Admin: 프로브 6%, 8/28 공백. 경계: 대조 배지는 있으나 계약 테스트 없음(테스트가 브리지를 모킹) |
| 8 | 문서화 | 15 | 80 | 30 | Compass: 템플릿 README. 경계: docs에 Compass 브리지 언급 0건 |
| | **평균** | **34** | **81** | **51** | |

읽는 법: Admin은 대부분 영역에서 통과선 위에 있고, Compass는 스키마 정본성·쓰기 원자성·관측에서 구조적으로 낮다. 경계 점수가 50대인 이유는 브리지 뷰라는 좋은 설계가 있지만 그 위에 프로브·문서·크론 단일 소유가 아직 없기 때문이다. 통폐합 작업의 목표는 Compass를 Admin 수준으로 올리는 것이 아니라 **경계 점수를 80 이상으로 올리는 것**이다. 그러면 Compass 내부 부채는 Admin 화면을 오염시키지 않는 격리 문제가 된다.

### 9.2 통합 우선순위 큐

출처 열은 발견 ID(§5 R번호, §4 도메인 번호, §7·§8)다. 소유 열은 변경이 들어가는 저장소다.

| 순위 | 항목 | 소유 | 노력 | 출처 |
|---|---|---|---|---|
| **P0 (이번 주)** | | | | |
| 1 | `crm.revenue_deals` 전량 교체를 단일 트랜잭션 + advisory lock + 업무 유니크 인덱스로. `sheet` 크론 끝의 매출 편승 제거 | Compass | S~M | R1, R3 |
| 2 | `revenue-sync.yml` 삭제, 크론 시크릿 이름 통일 | Compass | S | R2 |
| 3 | Compass `schema.sql` 정합화: 프로덕션 `pg_dump --schema-only` 대조 후 테이블 5개·컬럼(`meta_ad_id`, `confirmed_*`)을 append. `activities.deleted_at` 실재 확인 | Compass | S | §7.1, §4 도메인 2·5·9 |
| 4 | Meta 리드 웹훅 시크릿 미설정 시 503 | Compass | S | R6 |
| 5 | NeoCRM 3자 대사 리포트(NeoCRM KR 리드 ↔ `neocrm_lead_id` ↔ `crm_source_links.target_id`) + `push_neocrm.mjs` 황찬우 1줄 | Compass, Admin | S | §4 도메인 10·11 |
| 6 | 운영 확인: 두 Vercel 프로젝트 플랜과 크론 실행 로그, Meta 앱 leadgen 구독 URL 목록 | 운영 | S | R15, §4 도메인 1 |
| **P1 (다음 스프린트)** | | | | |
| 7 | 스키마 계약에 브리지 뷰 7개 프로브 + "필수 컬럼 존재" 프로브 추가. 2026-08-28 마이그레이션 4건 등재 | Admin | S | §6.1, §8.6 |
| 8 | `calendar-sync` 단일 트랜잭션 + 집합 insert | Compass | S | R4 |
| 9 | `scheduleDemo`에서 `crm.lead_demos` upsert(브리지 뷰 `compass_demos_v`를 살아 있게) | Compass | M | R5 |
| 10 | Pool 설정(`connectionTimeoutMillis`, `idleTimeoutMillis`, `keepAlive`, `max` 상향) + Meta 크론 `maxDuration`·배치 upsert·`partial` 응답 | Compass | S/M | R7, R8 |
| 11 | Compass 인덱스 상위 6개 DDL + 대시보드 11쿼리 단일 `Promise.all` | Compass | S | §7.2, §7.3 |
| 12 | Admin `leads.phone`, `lower(email)` 인덱스 | Admin | S | §8.5 |
| 13 | 매출 diff(`getCompassRevenueCompare`) 월별 로그·알림 승격 + Meta 광고비 총액 대사 리포트 | Admin | S | §4 도메인 3·5 |
| 14 | `team_directory_v` 역방향 뷰 신설 + Compass가 상수 대신 뷰 읽기(하드코딩은 폴백) | Admin, Compass | S~M | §4 도메인 11 |
| 15 | NeoCRM 표식 미러: `compass_leads_v.neocrm_*` → `crm_source_links` upsert 어댑터 | Admin | M | §4 도메인 10 |
| 16 | Compass 활동 소프트 삭제(`deleted_at` 실제 도입, 하드 삭제 제거) | Compass | S | §4 도메인 2 |
| 17 | Compass 브리지 정본 문서 작성과 docs 인덱스 등재. Compass actor "공용 계정 기록" 표기 | Admin | S | §6, §4 도메인 12 |
| 18 | 파트너 포털 v1/v2 병행 진실 원천 조사(v1 잔존 데이터 규모, v2 이관 여부) | Admin | M(조사) | §8.4 |
| 19 | `branch_sync_runs` single-flight를 부분 유니크 인덱스로 교체, `truncate` → `delete` | Admin | S | R11 |
| **P2 (로드맵 편입)** | | | | |
| 20 | 원장 파서 공용 패키지(색상 판정·열 재정렬·월/주 블록) + Admin 파서에 `is_mkt` 추가 + 동일 월 바이트 일치 검증 | Admin, Compass | M | §4 도메인 3 |
| 21 | Meta 단일 소유자화: `compass_ads_v` 기반 캠페인 롤업 어댑터 → `sync-meta-insights` 폐지. reach 포기 여부가 결정 변수 | Admin | M | §5.4, §4 도메인 5 |
| 22 | NeoCRM 쓰기 창구 단일화: Compass → Admin 서버 간 등록 요청 엔드포인트 → `crm_write_requests` 큐. XLSX 폴백 유지 | Admin, Compass | L | §4 도메인 10 |
| 23 | Compass 개인 비밀번호 + 세션 TTL 단축 | Compass | S~M | §4 도메인 12 |
| 24 | 사장 객체 정리: `crm.deals`, `product_catalog_items`, `regions`, `region_aliases`, 사장 함수 2개, `PartnerChangeLog`. DROP 전 행 수 확인 | Compass, Admin | S | §7.1, §8.3 |
| 25 | 브리지 뷰 `ALTER DEFAULT PRIVILEGES` 명시, `compass_activities_v.body` 분리, 권한 회귀 테스트 | Admin | S | R14 |
| 26 | TLS `rejectUnauthorized: true`, `to_char` 범위 재작성 또는 스냅샷 패턴 이식, Bearer timing-safe 공용 유틸 | Compass, Admin | S~L | R9, R10, R13 |
| 27 | Compass 최소 품질 게이트(typecheck·eslint·vitest 스크립트, 스키마 스냅샷 diff CI) | Compass | M | §6.5, §7.1 |
| 28 | 스키마 계약 기준선 갱신 정책(새 마이그레이션마다 프로브를 PR 체크로 강제), 중앙 타입 자동 생성 | Admin | M | §8.6 |
| 29 | `leads` anon INSERT에 DB 레벨 최소 검증(길이·형식 CHECK) | Admin | S | §8.2 |
| **P3** | | | | |
| 30 | `crm.ad_plans` 브리지 뷰, `lead_demos ↔ public_events` 연결키, 정책 `TO` 절 보강, `automation` 크론 N+1, Compass BD 액션 게이트, `LeadDetailBody.tsx` 분해 | 각자 | S~M | §4 도메인 6·8, R16, R17, §6.5 |

### 9.3 통폐합 로드맵

**1단계 위생·관측 (2주, P0 전부).** 아무 데이터도 옮기지 않는다. 무엇이 갈라지고 있는지를 먼저 숫자로 만든다. 산출물은 매출 diff·Meta 총액·NeoCRM 대사 수치 리포트 1장이다.

**2단계 계약 대칭화 (1개월, P1).** 지금은 Admin → Compass 읽기만 있다. `team_directory_v`, `admin_leads_v` 역방향 뷰를 열고, NeoCRM 표식을 미러하고, 브리지 프로브와 문서를 넣는다. 게이트: 1단계 리포트에서 매출 diff가 0으로 수렴하지 않으면 3단계로 넘어가지 않는다.

**3단계 계산 공용화 (2개월, P2 20~22).** 데이터를 옮기기 전에 계산을 하나로 만든다. 원장 파서 공용 패키지, `is_mkt` 추가, 동일 월 바이트 일치(본사 보고 7월 58,323 재현이 합격 기준), Meta Graph API 버전 통일, `compass_ads_v` 어댑터.

**4단계 원천 단일화 (3개월+, 조건부).** 3단계 검증을 통과한 것만. 매출 미러 단일화(Admin 크론 매시 승격 → Compass가 `branch_rev_deals` 역방향 뷰 소비 → Compass 매출 동기화 중단. `crm.leads.paid_*` 스냅샷 연결 UI 대체 경로 선행), NeoCRM 쓰기 창구 단일화, Meta 리드 단일 수신(이중 구독이 확인된 경우에만), GitHub Actions를 `workflow_dispatch` 백업으로 축소. 통과하지 못한 도메인은 영구히 이중 미러로 둔다. 틀린 숫자보다 낫다.

## 10. 운영에서 확인해야 할 것

코드로 확정할 수 없어 추정으로 남긴 항목이다. 값은 문서에 적지 않는다.

| 항목 | 왜 필요한가 | 확인 위치 |
|---|---|---|
| 두 Vercel 프로젝트의 플랜과 크론 실행 로그 | 이 저장소 크론은 2026-08-28까지 헤더 게이트 때문에 401로 멈춰 있던 기간이 있다. 현재 11개가 모두 실행되는지, 결손 구간 재실행이 필요한지 확인한다 | Vercel 대시보드 |
| Compass `DATABASE_URL`의 pooler 모드·포트·DB 롤 | 동시 연결 한도 판단과 역방향 뷰 GRANT 대상 결정 | Supabase 커넥션 설정 |
| `crm.activities.deleted_at` 실재 여부 | 없으면 `compass_activities_v`가 깨져 있다 | `information_schema.columns` |
| Meta 앱 leadgen 웹훅 구독 URL 목록 | 광고 리드 이중 수신 여부 | Meta for Developers |
| 두 앱의 Meta 광고 계정 ID 동일 여부 | 코드 주석은 같다고 하나 env는 미확인 | 양쪽 환경변수 |
| 이 저장소의 매출원장 시트 ID와 Compass 하드코딩 ID 동일 여부 | 구조적으로는 확정이나 값 대조는 미완 | 환경변수 |
| Compass 크론 시크릿 두 이름의 값 동일 여부 | 다르면 매시 401 | GitHub Secrets, Vercel |
| Supabase 플랜·컴퓨트 크기 | 연결 한도·풀 크기 | Supabase 대시보드 |
| `crm.deals`, 사장 테이블 3개의 실제 행 수 | DROP 전 확인 | SQL |
| `crm_source_links.target_type='external_lead'`를 쓰는 "밀어넣기 도구"의 소재 | 두 저장소 어디에도 없다 | 운영 확인 |

## 11. 방법과 한계

- 정적 분석만 수행했다. DB 접속, 실행 계획, 행 수 측정은 없었다. 규모 추정은 코드 힌트 기반이다.
- 서브 에이전트 5개의 원문 보고서는 저장소에 넣지 않았다. 이 문서는 그 보고서를 오케스트레이터가 재검증하고 정정한 뒤 통합한 결과다.
- Compass 저장소 파일은 `classinkr-main/crm` 기준 상대 경로로 적었다. 이 저장소 문서 규칙에 따라 링크는 걸지 않았다.
- 수치는 2026-09-02 기준이며 다음 마이그레이션이 들어오면 달라진다. 후속 판정에는 같은 방법으로 다시 측정한다.
