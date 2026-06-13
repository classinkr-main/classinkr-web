---
title: 한국 CRM 데이터 어드민 통합 감사 및 적용 계획
status: active
owner: KR Branch
last_updated: 2026-06-10
related:
  - ./crm-sheet-revenue-sync-plan.md
  - ./neo-crm-integration-request.md
  - ./korean-crm-operational-unblock-runbook-2026-06-10.md
---

# 한국 CRM 데이터 어드민 통합 감사 및 적용 계획

목표: 한국 CRM 데이터가 `/admin/crm` 하위 탭에서 빠짐없이 파악되고, 수정 가능한 데이터와 읽기/검수 전용 데이터가 명확히 구분되며, 외부 CRM/시트/앱 DB가 중복 집계 없이 정리되는 상태를 만든다.

운영 적용 순서와 readiness 해제 절차는 별도 runbook을 기준으로 한다: [`korean-crm-operational-unblock-runbook-2026-06-10.md`](./korean-crm-operational-unblock-runbook-2026-06-10.md)

## 1. 결론

현재 즉시 사용할 수 있는 한국 CRM 원천은 세 종류다.

| 원천 | 현재 접근 | 현재 업데이트 | 어드민 CRM 편입 상태 | 판단 |
|---|---:|---:|---|---|
| 홈페이지 리드 | 가능 | 가능 | `/admin/crm` | 리드 cockpit은 있음. 전환 대상이 V2 고객/딜이 아니라 legacy partner로 향해 수정 필요 |
| 앱 내부 CRM/포털 DB | 가능 | 가능 | `/admin/crm/partners`, `/partners/customers`, `/partners/portal`, `/revenue` | V2 `customers/deals`를 canonical CRM 모델로 삼아야 함 |
| 브랜치 REV 시트 | 가능 | 앱에서는 읽기/재동기화만 | `/admin/crm/revenue`에 비교 지표 반영 중 | `branch_rev_deals`를 통해 Phase 0 연결됨. 이름 매칭 테이블이 다음 병목 |
| 외부 Xiaoshouyi/eeoCRM | 코드상 가능 | 코드상 가능, 운영상 제한 필요 | 아직 미연동 | MCP는 라이브 조작 도구다. 앱에는 read-only snapshot부터 넣어야 함 |

운영 원칙:

- `/admin/crm`은 고객/리드/거래/매출의 운영 source of truth가 된다.
- CRM 데이터가 신뢰 가능하고 한국 관련 데이터가 충분히 들어온다는 전제에서는 Xiaoshouyi/app CRM/리드가 REV 스프레드시트보다 우선한다.
- `/admin/branch`는 팀/지역/시트 성과와 데이터 품질 검수 화면으로 둔다.
- REV 시트 금액은 matching/검수 전까지 앱 매출과 합산하지 않고, 확정 source link가 있을 때만 dedupe 근거로 사용한다.
- 외부 CRM 쓰기는 직접 실행하지 않고, 승인 큐와 감사 로그를 통과시킨다.
- source priority, fuzzy alias, Xiaoshouyi query catalog는 SQL table로 관리한다. 코드 상수만으로 운영 정책을 숨기지 않는다.

## 2. 현재 어드민 CRM 구조

| 탭 | 경로 | 실제 역할 | 주요 데이터 |
|---|---|---|---|
| 리드 | `/admin/crm` | 문의/데모/마케팅 리드, SLA, 담당자, 연락 로그 | `leads`, `lead_contact_logs`, JSON fallback |
| 운영 큐 | `/admin/crm/partners` | 계약/설치/정산/이슈 중심 legacy workspace | `partners`, legacy partner workspace tables |
| 거래 | `/admin/crm/partners/portal` | V2 거래/일정/수납 overview | `partner_accounts`, `customers`, `deals`, `payments_v2`, `receipts_v2` |
| 고객사 | `/admin/crm/partners/customers` | V2 고객/기관 목록 | `customers`, `customer_deal_summary` |
| 매출·정합성 | `/admin/crm/revenue` | legacy+V2+REV 시트 매출 비교, 소스 상태 | `quotes`, `contracts`, `receipts`, `deals`, `branch_rev_deals` |

이번 감사에서 바로 정리한 UI 위생:

- `CrmSubnav` active route가 `/admin/crm/revenue`를 제대로 인식하도록 보강.
- CRM layout에서 이미 subnav를 렌더하므로 revenue/detail 페이지의 중복 subnav 제거.
- 탭 라벨을 최종 정보구조에 맞게 `리드 / 운영 큐 / 거래 / 고객사 / 매출·정합성`으로 정리.

## 3. 데이터 원천별 상세

### 3-1. 리드

현재 상태:

- `/admin/crm`에서 리드 조회, 상태 변경, 메모, 팔로업, 담당자 배정, 연락 로그, 삭제 가능.
- 저장소는 `USE_SUPABASE_LEADS=true`일 때 Supabase `leads`, 아니면 JSON fallback.
- `source_detail`, `lead_magnet`, UTM 필드가 최근 확장됨.

문제:

- 리드 전환이 `/api/admin/partners`로 legacy partner 생성을 시도한다.
- 현재 payload는 `contact_name`, `pipeline_stage` 등을 보내는데 API는 `ownerName`, `ownerEmail`, `accountManager` 계열을 기대한다.
- 따라서 리드 전환은 실패하거나 원하는 V2 고객/딜 흐름이 아니다.

적용 계획:

1. 리드 전환 모달을 `기존 고객 연결`, `V2 고객사 생성`, `V2 거래 생성`, `운영 큐 생성`으로 분리.
2. 기본 전환 대상은 V2 `customers/deals`.
3. legacy partner 생성은 계약/설치 운영 큐가 필요할 때만 명시적으로 선택.

2026-06-10 반영:

- 리드 상세의 `고객·거래 등록` 액션은 legacy `/api/admin/partners`가 아니라 단일 `POST /api/admin/leads/[id]/convert-v2` endpoint를 호출한다.
- 이 endpoint는 V2 `customers`와 초기 `deals`를 만들고, 리드를 `converted`로 전환하며, `crm_source_links`에 `lead -> customer` confirmed link를 남긴다.
- 전환 notes에는 원본 리드 ID, 유입 경로, UTM, 문의 내용, 생성된 고객/거래 ID가 남아 재시도와 추적이 가능하다.
- 리드 자체도 source-link 후보 생성 대상이다. 리드의 `org/name/assigned_to`를 고객·파트너·거래 후보와 비교하고, 기존 confirmed lead link는 alias evidence로 재사용한다.

### 3-2. V2 고객/거래

현재 상태:

- `partner_accounts`, `customers`, `deals`, `deal_line_items`, `payments_v2`, `receipts_v2`, `activity_logs`가 존재.
- 고객/거래/수납을 운영 CRM의 canonical 모델로 쓰기에 가장 적합하다.
- `/api/admin/customers`와 `/api/admin/customers/[id]`는 admin 요청에서만 `crm_coverage`를 포함한다. 이 값은 고객/거래 source link, 외부 Xiaoshouyi snapshot 이름 후보, warning을 함께 보여준다.
- `/admin/crm/partners/customers` 카드와 고객 상세 slide-over에 source link 확정 수, 외부 CRM 후보 수, 검토 상태 badge가 표시된다.
- 고객별 `crm_coverage.discrepancies`는 외부 수금/거래/견적 계열 금액과 내부 계약·수납 금액, 외부 취소/완료 상태와 내부 진행·미수 상태, 내부 파트너 계정 담당자와 외부 CRM 담당자의 차이를 계산한다.
- 성능 최적화: 고객 목록은 source-link 기반 `summary` coverage만 계산하고, raw `external_crm_records` 이름 후보/깊은 discrepancy 계산은 고객 상세 `detail` 모드에서만 수행한다.

문제:

- 고객사 탭은 create disabled 상태라 가장 자연스러운 고객 관리 화면에서 신규 고객을 만들 수 없다.
- 일부 화면은 고객명을 기준으로 grouping한다. 동명이인/동일 학원 다지점 케이스에서 충돌 가능.

적용 계획:

1. CRM 고객사 탭에서 admin create를 활성화한다. (2026-06-10 반영)
2. 거래/수납/활동은 `customer_id`, `deal_id` 기준으로만 grouping한다.
3. 고객명 grouping은 표시용 fallback으로만 사용한다.

### 3-3. 브랜치 REV 시트

현재 상태:

- `GOOGLE_BRANCH_DASHBOARD_SHEET_ID`의 `'2. REV'!A1:CF400` 범위를 파싱한다.
- `branch_rev_deals`에 full-replace로 적재된다.
- `/admin/crm/revenue`에서 시트 예상 매출, 월별 납부 스케줄, 빨간 셀 리스크를 비교용으로 보여준다.
- CRM revenue 화면의 `시트 동기화` 버튼은 `POST /api/admin/branch/sync`에 `sources: ["rev"]`만 보내 HW 동기화를 건드리지 않는다.

문제:

- `branch_rev_deals.id`는 full-replace 때 재생성되므로 매칭 키로 쓰면 안 된다.
- 시트에는 `customer_name` 문자열만 있어 앱의 `customers.id` 또는 `deals.id`와 안전하게 조인할 수 없다.
- status가 자유입력이라 종료/취소 판정은 keyword 기반이다.

적용 계획:

1. `crm_source_links` 또는 `crm_sheet_matches` 테이블을 만든다.
2. 시트 row 매칭 키는 `sheet_row` 단독이 아니라 `normalized_customer_name + sheet_row + source_fingerprint`를 함께 쓴다.
3. 자동 매칭은 후보만 생성하고, admin이 확정해야 canonical 연결로 승격한다. 담당자/매니저가 같거나 alias evidence가 있으면 낮은 점수도 검수 queue에 남긴다.
4. 매칭 전 금액은 `시트 기준`으로 병기만 하고 합산하지 않는다.

### 3-4. 외부 Xiaoshouyi / eeoCRM

참조 repo: `https://github.com/Sean-xiang-dot/eeocrm-personal`

확인된 성격:

- TypeScript/Node 18 MCP server다.
- Express SSE endpoint로 AI 도구가 연결하고, 개인 OAuth 토큰 `~/.neocrm/credentials.json`로 Xiaoshouyi CRM에 접근한다.
- 주요 API는 `GET /rest/data/v2/query?q=...`, CRUD는 `/rest/data/v2.0/xobjects/{apiKey}` 계열.
- create/update/owner transfer 요청 body는 원본 필드를 그대로 보내는 것이 아니라 `{ data: { ...fields } }` envelope로 감싼다.
- 개인 OAuth token은 약 2시간 만료이고, credential 파일은 로컬 머신/사용자에 묶여 있으므로 서버 배치 credential로 쓰지 않는다.
- 기본 CRUD, metadata, 고객 360, smart find, quote/order/collection/EEO account health 도구가 있다.

핵심 객체:

| Xiaoshouyi 객체 | 의미 | 앱 매핑 후보 |
|---|---|---|
| `account` | 고객/회사 | `partner_accounts`, `customers` |
| `contact` | 연락처 | 고객 연락처, lead contact |
| `lead` | 리드 | `leads` |
| `opportunity` | 영업기회 | `deals` |
| `quote`, `quoteLine` | 견적/견적 상세 | legacy `quotes/quote_items` 또는 V2 quote documents |
| `order` | 주문 | `deals.contracted_amount` 또는 별도 order snapshot |
| `Collection__c` | 수금 | `payments_v2`, `receipts_v2` |
| `CollectionPlan__c` | 수금 계획 | 예정 납부/리스크 |
| `SalesPerformance__c` | 영업 성과 | 매출 성과 snapshot |
| `ShroffAccount__c` | EEO 계정 | 고객 360, 만료/잔액/수업 리스크 |
| `FinancialInformation__c` | 재무 흐름 | 수납/환불 상세 |

운영 제약:

- 개인 OAuth 기반이라 Vercel 서버의 안정적인 배치 credential로 바로 쓰기 어렵다.
- XOQL은 `SELECT *`, aggregate, `GROUP BY`, full fuzzy `LIKE '%x%'`가 제한된다.
- ID는 문자열로 보존해야 한다.
- date/datetime은 밀리초 timestamp이며 KST/중국시간 변환 정책이 필요하다.
- 쓰기 도구는 존재하지만 운영 앱에서는 preview/confirm/audit 없이는 위험하다.

적용 계획:

1. MCP는 당장 "조사/수동 검수 도구"로만 사용한다.
2. 프로덕션 앱 연동은 서비스 OAuth 또는 본사 API key 확보 후 별도 server-side client로 구현한다.
3. 첫 연동은 read-only snapshot: `external_crm_accounts`, `external_crm_contacts`, `external_crm_collections`, `external_crm_eeo_accounts`, `external_crm_sync_runs`.
4. `external_id + object_api_key + source_system`을 idempotency key로 둔다.
5. 쓰기 연동은 `crm_write_requests` 큐를 만들고 admin 승인 후 실행한다.

## 4. 통합 스키마 제안

### 4-1. 공통 identity/link layer

권장 테이블: `crm_source_links`

필드 초안:

| 필드 | 의미 |
|---|---|
| `id` | uuid |
| `source_system` | `lead`, `legacy_partner`, `v2`, `branch_rev_sheet`, `xiaoshouyi` |
| `source_object` | `leads`, `customers`, `branch_rev_deals`, `account`, etc |
| `source_record_key` | 외부 stable id 또는 fingerprint |
| `normalized_name` | 공백/법인명/지점명 정규화 키 |
| `target_type` | `partner_account`, `customer`, `deal`, `lead` |
| `target_id` | 앱 canonical uuid |
| `confidence` | 자동 후보 점수 |
| `status` | `candidate`, `confirmed`, `rejected`, `stale` |
| `confirmed_by`, `confirmed_at` | 수동 확정 감사 |
| `metadata` | 원천별 보조 정보 |

2026-06-10 추가 반영:

- `crm_source_priorities`: source별 trust tier, priority, read/write policy, freshness window를 SQL로 관리한다. 기본 우선순위는 `app_v2(10)`, `xiaoshouyi(20)`, `lead(30)`, `branch_rev_sheet(80)`, `legacy_partner(90)`이다.
- `crm_match_aliases`: 리드명, 시트명, 영문/한글 표기, 매니저명 기반 alias를 관리한다. 예: 영어 `academy/center/campus/classin` 계열은 한국어 토큰으로 변환해 비교하고, 같은 매니저/담당자는 보조 증거로 점수를 올린다. 확정된 source link는 이후 매칭 품질을 위해 alias로 자동 학습된다.
- `crm_xiaoshouyi_query_catalog`: Xiaoshouyi 객체별 field list, order by, where clause, page size/max pages, sync priority를 SQL로 관리한다. MCP와 서버 sync가 같은 카탈로그를 읽게 하며, DB catalog가 없으면 기존 env/default 설정으로 fallback한다.

### 4-2. 외부 CRM snapshot

권장 최소 테이블:

- `external_crm_sync_runs`: source, object, status, started/finished, rows, cursor, error.
- `external_crm_records`: object_api_key, external_id, normalized_name, payload jsonb, synced_at.
- 이후 조회 성능이 필요한 객체부터 typed view/table로 분리.

처음부터 객체별 typed table을 많이 만들면 schema drift에 취약하므로, 첫 구현은 raw snapshot + curated view가 안전하다.

2026-06-10 반영:

- `external_crm_sync_runs`, `external_crm_records` migration 추가.
- `/admin/crm/revenue` 소스 카드에서 Xiaoshouyi snapshot record/sync 상태를 읽도록 연결.
- Xiaoshouyi read-only sync client와 수동/cron API 추가.
- credential 미설정 시 sync run을 `skipped`로 남기고 라이브 호출은 하지 않는다.
- 기본 snapshot 대상은 `account`, `contact`, `opportunity`, `ShroffAccount__c`, `Collection__c`, `SalesPerformance__c`, `CollectionPlan__c`, `FinancialInformation__c`, `ResourceInformation__c`다. `ClassInformation__c`는 계정별 상세/기간성 데이터라 기본 전체 sync에는 넣지 않고 후속 drill-down 대상으로 둔다.
- `Collection__c`는 `CollectionDate__c`가 아니라 재무 확인 기준일인 `ActualTime__c`를 우선 발생일로 사용한다.
- `external_crm_records` snapshot을 `crm_source_links` 후보로 승격하는 generator 추가. `account/ShroffAccount__c` 계열은 `partner_account/customer`, `opportunity/Collection__c/SalesPerformance__c/FinancialInformation__c` 계열은 `deal/customer` 후보로 생성한다.
- `/admin/crm/revenue` 소스 카드와 수동 sync 버튼은 credential 미설정으로 skipped 된 상태를 성공처럼 숨기지 않고 표시한다.
- `vercel.json` 자동 스케줄은 서비스 credential 정책 확정 후 켠다.

### 4-3. 쓰기 큐

권장 테이블: `crm_write_requests`

필드 초안:

- `operation`: `create`, `update`, `transfer_owner`.
- `object_api_key`, `record_id`, `payload`.
- `status`: `draft`, `approved`, `sent`, `succeeded`, `failed`, `cancelled`.
- `requested_by`, `approved_by`, `executed_at`, `response_payload`.

삭제는 MVP 범위에서 제외한다.

2026-06-10 반영:

- `crm_write_requests` migration 추가.
- `crm_write_requests` 생성/list/detail/승인/취소 API 추가.
- `POST /api/admin/crm/write-requests`는 `dryRun: true`일 때 Xiaoshouyi method/path/body preview만 반환한다.
- `/admin/crm/revenue`에 외부 CRM 쓰기 승인 큐를 표시한다. MVP UI 액션은 `draft -> approved`, `draft/approved/failed -> cancelled`로 제한한다.
- Xiaoshouyi executor API는 `approved` 요청만 실행하며 `create/update/transfer_owner`만 허용한다. live 실행은 service credential과 실제 endpoint smoke 전까지 운영 절차로만 다룬다.
- Xiaoshouyi write payload는 객체별 allowlist를 통과해야 한다. 현재 허용 객체는 `account`, `contact`, `lead`, `opportunity`, `Collection__c`이고, `ShroffAccount__c`는 EEO 계정 상태 객체라 read-only로 고정한다.
- `crm_write_requests` DB guard migration을 추가했다. payload/preview/response JSON은 object만 허용하고, `update/transfer_owner`는 `external_id`가 필수다.
- executor는 외부 POST/PATCH 전에 `status = approved` 조건으로 행을 `sent`로 claim한다. 중복 실행 race를 막고 token/fetch 실패는 `failed`에 기록한다.
- `crm_write_request_events` audit table과 `attempt_count/last_attempt_at/next_retry_at/last_attempt_error` retry state를 추가했다. 실패 요청은 retry window 이후 admin `retry` 액션으로 다시 `approved` 상태가 되고, 최대 3회까지만 실행한다.
- `/admin/crm/revenue` 승인 큐는 attempt/retry state를 표시한다. 새 retry column이 운영 DB에 아직 없으면 기존 column select로 fallback해 탭 로딩을 유지한다.
- `GET /api/admin/crm/write-requests?preflight=metadata`를 추가했다. Xiaoshouyi write allowlist의 객체/필드를 `SELECT ... LIMIT 1` query probe로 검증하며, executor도 실제 POST/PATCH 전 target object metadata probe를 통과해야 한다.
- eeocrm-personal client 규약에 맞춰 live write preview/executor의 HTTP body는 `{ data: ... }` envelope로 만든다. DB의 `crm_write_requests.payload`는 admin 검수용 원본 field map으로 유지하고, `preview_payload.body`에 실제 전송 body를 남긴다.

## 5. 실행 로드맵

### Phase 0. 현재 반영/검증

- `/admin/crm/revenue`에서 `branch_rev_deals` 비교 지표 표시.
- 월별 chart에 `sheetExpectedAmount` 병기.
- `monthly_red`를 매출 리스크로 편입.
- CRM subnav 중복 제거 및 라벨/active resolver 정리.
- 검증: `npm run typecheck`, `npm run lint`, `npm run build`.

### Phase 1. CRM 기준 모델 정리

- 리드 전환을 V2 `customers/deals` 중심으로 재설계.
- 고객사 탭에서 admin create 활성화.
- `crm_source_links` migration 추가. (2026-06-10 반영)
- REV 시트 미매칭/정합성 읽기 UI 추가. (2026-06-10 반영)
- REV 시트 자동 후보 생성 API와 `/admin/crm/revenue` 버튼 추가. (2026-06-10 반영)
- REV 시트 후보 확정/제외 API와 `/admin/crm/revenue` 액션 UI 추가. (2026-06-10 반영)
- 미매칭 행에서 임의 고객/거래를 검색해 수동 후보를 만드는 UI 추가. (2026-06-10 반영)
- `/api/admin/crm/source-links/generate`가 `branch_rev_sheet`, `xiaoshouyi_snapshot`, `all` 후보 생성을 지원. (2026-06-10 반영)
- `/api/admin/crm/source-links/generate`가 `lead` 후보 생성도 지원하고, `all`은 CRM snapshot + lead + REV를 함께 돌린다. (2026-06-10 반영)
- `/admin/crm/partners/customers`에서 admin 고객 생성 버튼 활성화. (2026-06-10 반영)
- 리드 전환을 V2 고객+초기 거래 생성으로 전환하고 `lead -> customer` source link를 자동 확정. (2026-06-10 반영)
- 수동 source-link 검색/생성 대상에 `partner_account`를 추가했다. 확정되지 않은 `candidate/stale/rejected/미매칭` 행은 대체 후보를 계속 검색해 붙일 수 있다. (2026-06-10 반영)
- 이름 매칭은 정규화 문자열만 보지 않고 영어-한국어 token translation, alias table, lead confirmed link, 매니저/담당자 일치 증거를 함께 사용한다. (2026-06-10 반영)
- source link 확정 시 `crm_match_aliases`를 자동 upsert해 다음 후보 생성의 alias evidence로 재사용한다. (2026-06-10 반영)

### Phase 2. 외부 CRM read-only ingest

- 서비스 credential 정책 확정.
- 외부 CRM client를 앱 서버에 별도 구현한다. MCP 서버를 production runtime dependency로 두지 않는다.
- `external_crm_sync_runs`, `external_crm_records` raw snapshot schema 추가. (2026-06-10 반영)
- `/admin/crm/revenue`에 Xiaoshouyi snapshot source 상태 표시. (2026-06-10 반영)
- `account/contact/opportunity/Collection__c/ShroffAccount__c` read-only sync client 구현. (2026-06-10 반영)
- `/api/admin/crm/external-sync`, `/api/cron/sync-external-crm` 추가. (2026-06-10 반영)
- `GET /api/admin/crm/external-sync` preflight 추가. credential/object/page 설정을 읽기만 하고 sync run은 만들지 않는다. 이 preflight도 실제 runtime catalog resolver를 사용해 `catalogSource`, `whereClause`, 객체별 page limit을 보여준다. `/admin/crm/revenue`의 외부 CRM 버튼은 preflight 통과 후에만 POST sync를 실행한다. (2026-06-10 반영)
- `GET /api/admin/crm/readiness`와 `/admin/crm/revenue` 운영 준비도 패널 추가. DB migration/table/column, Xiaoshouyi credential, write metadata probe 상태를 한 번에 점검한다. (2026-06-10 반영)
- readiness가 `crm_source_priorities`, `crm_match_aliases`, `crm_xiaoshouyi_query_catalog` schema도 점검한다. (2026-06-10 반영)
- Xiaoshouyi manual/cron sync 실행 전에 `external_crm_sync_runs`와 `external_crm_records` stale-tracking schema를 검사한다. 미적용 상태면 원격 CRM query를 시작하지 않고 `409` + actionable error를 반환한다. (2026-06-10 반영)
- 고객사 목록/상세에 source badge, external candidate count, last synced 표시. (2026-06-10 반영)
- 외부 snapshot 레코드의 이름 기반 source-link 후보 생성 및 고객 coverage 반영. (2026-06-10 반영)
- 고객사 목록/상세에 금액·상태 discrepancy count/panel 표시. (2026-06-10 반영)
- 고객사 목록 API 최적화: 목록은 summary coverage, 상세는 detail coverage로 분리하고, 목록 preview는 전체 딜 조인 대신 현재 고객 ID 범위의 최소 필드만 조회. (2026-06-10 반영)
- 소유자/담당자 discrepancy는 `partner_accounts.owner_name`과 Xiaoshouyi 확정 source link 또는 상세 snapshot의 `owner_name`을 비교한다. REV 시트의 `team · manager` 표기는 담당자 mismatch 판정에서 제외한다.
- `verified` coverage는 확정 source link와 확정 Xiaoshouyi source link가 모두 있을 때만 부여하고, fuzzy snapshot 후보만 있는 경우는 `needs_review`로 둔다.
- Xiaoshouyi snapshot query는 객체별 page size/max pages 환경변수, deterministic `ORDER BY`, sync cursor metadata, stale/deleted-record marking을 지원한다. (2026-06-10 반영)
- Xiaoshouyi snapshot sync runtime이 `crm_xiaoshouyi_query_catalog`를 우선 읽는다. 객체별 `fields/where_clause/order_by/page_size/max_pages/sync_priority`가 DB에서 운영 관리되고, sync run metadata에 catalog source가 기록된다. (2026-06-10 반영)
- `/admin/crm/revenue`의 CRM 정합성 섹션에 Xiaoshouyi source-link 후보 검수 표를 추가했다. 생성된 외부 CRM 후보는 같은 source-link PATCH API로 확정/제외할 수 있다.
- 고객 상세 slide-over에서도 admin 모드 source link 후보/재검수 항목을 바로 확정/제외할 수 있다.
- `/admin/crm/revenue`의 Xiaoshouyi source card가 최근 sync page 수, stale 처리 수, cursor/truncated 상태를 표시한다.
- `crm_write_requests`는 dry-run validator, 승인 API, executor, Xiaoshouyi write client까지 준비됐다. 단, live service credential, live metadata validation, retry 정책 확인 전까지 운영 UI에서 직접 실행 버튼은 노출하지 않는다.
- `GET /api/admin/crm/mcp-context`를 추가했다. MCP/서브에이전트는 raw CRM payload를 크게 주고받기 전에 이 compact context로 source priority, query catalog, matching threshold, 안전한 endpoint 목록을 먼저 읽는다.

### Phase 3. 승인형 write-back

- `crm_write_requests` 승인 큐 schema 추가. (2026-06-10 반영)
- `crm_write_requests` 생성/list/detail/승인/취소 API 추가. (2026-06-10 반영)
- dry-run preview와 승인 큐 UI 추가. (2026-06-10 반영)
- Xiaoshouyi write executor 골격 추가. `approved` 요청만 실행하고 성공/실패 응답을 `response_payload/error`에 기록한다. (2026-06-10 반영)
- 객체별 field allowlist validation 추가. (2026-06-10 반영)
- write request DB guardrail과 executor atomic claim 추가. (2026-06-10 반영)
- audit log 및 실패 retry 추가. `crm_write_request_events`로 create/approve/cancel/sent/failed/succeeded/retry_requested를 기록하고, failed row는 retry window/attempt limit을 적용한다. (2026-06-10 반영)
- write request create/approve/retry/execute 전에 `crm_write_requests` retry columns와 `crm_write_request_events` schema를 검사한다. 미적용 상태에서는 dry-run preview만 허용하고, persisted write action은 `409` + actionable error로 차단한다. (2026-06-10 반영)
- live metadata field validation 보강. 현재는 query-probe 방식으로 구현했고, Xiaoshouyi metadata endpoint가 확정되면 같은 preflight surface 아래에 metadata API parser를 추가한다. (2026-06-10 반영)
- live credential smoke 이후 retry delay/limit 운영값 조정.
- update/create만 허용, delete 제외.

### Phase 4. 매칭 자동화 및 매칭 인박스 (2026-06-10 반영)

수동 1건씩 연결하던 매칭 운영을 자동화 티어 + 일괄 검수 동선으로 전환했다.

- **자동 확정 티어**: 후보 생성기(`lib/repositories/crm-source-links.ts`)가 정책 조건을 만족하는 최상위 후보를 자동 확정한다.
  - 조건: confidence ≥ `auto_confirm_min_confidence`(기본 0.92) AND 같은 target type의 2위 후보와 점수 차 ≥ `auto_confirm_min_gap`(기본 0.15).
  - 모호하면(2위가 근접) 자동 확정하지 않고 검수 큐에 남긴다. admin이 rejected 처리한 pair는 다시 자동 확정하지 않는다.
  - 자동 확정 대상 target type은 보수적으로 `customer`/`partner_account`만. deal 링크는 수동 전용.
  - 정책은 `crm_source_priorities`의 `auto_confirm_enabled/min_confidence/min_gap` 컬럼으로 SQL 관리 (`20260611_crm_auto_confirm_policy.sql`). 기본 활성: `xiaoshouyi`, `branch_rev_sheet`. `lead`는 전환 플로우가 명시적이라 비활성.
  - 자동 확정 row는 `confirmed_by = null` + `metadata.auto_confirmed = true`로 기록되고, 매칭 인박스에서 "되돌리기"로 재검수로 보낼 수 있다. alias 학습은 수동 확정과 동일하게 동작한다.
- **싱크 체이닝**: `lib/external-crm/sync-chain.ts`가 Xiaoshouyi sync → 후보 생성/자동 확정 → admin 알림을 한 단위로 묶는다. manual 버튼과 cron이 같은 경로를 탄다. REV 시트 sync(`/api/admin/branch/sync`, `/api/cron/sync-branch`)도 성공 시 link 승계 + 후보 생성을 자동 실행한다.
- **REV 링크 승계**: `reattachBranchRevConfirmedLinks()`가 full-replace 후 고아가 된 confirmed link를 `이름+첫납부+금액` fingerprint로 이동한 행에 승계한다. 0건/복수 매칭이면 stale 처리해 인박스에 노출한다.
- **일괄 검수 API**: `PATCH /api/admin/crm/source-links/bulk` (ids ≤ 200, confirm/reject/stale).
- **매칭 인박스 탭**: `/admin/crm/matching` 신설. Neo CRM/REV 시트/리드 링크를 소스·상태 필터, 체크박스 일괄 확정/제외, 고확신(90%↑) 일괄 확정, 자동 확정 되돌리기, REV 수동 검색 연결로 처리한다. `/admin/crm/revenue`의 매칭 표 2개는 인박스로 이동했고 revenue 탭에는 요약 + 딥링크만 남았다. 단건 액션은 전체 리페치 없이 로컬 상태만 갱신한다.
- **시트 금액 dedupe 분리**: `CrmRevenueSheetSummary`에 `linkedAmount/unlinkedAmount/linkedDealCount`를 추가했다. 확정 link가 있는 시트 행 금액만 앱 매출과 대조 가능하고, 미연결 금액이 "따로 노는" 잔량으로 표시된다.
- **sync 성능**: Xiaoshouyi sync가 `payload_hash` 비교로 무변경 레코드는 full upsert 대신 `last_seen_run_id/synced_at`만 경량 갱신한다. sync run metadata에 `rowsUnchanged` 기록.
- **cron**: `vercel.json`에 `/api/cron/sync-external-crm` 일 1회(01:00 UTC) 등록. credential 미설정 시 기존대로 skipped no-op이라 안전하다.
- **알림**: sync 체인 완료 시 신규 후보/자동 확정 건수를, 실패 시 실패 객체 목록을 admin notification(`crm.external_sync.*`)으로 발행한다.
- **임시 고객 제외**: 시트의 `HW/SW/MKT` 접두 고객명은 임시 placeholder로 간주한다(`isPlaceholderCrmName`, 접두 뒤 구분자 필수 — `SW어학원` 같은 실제 상호는 매칭 대상 유지). 후보 생성/자동 확정/미매칭 KPI/매칭률에서 제외하고, 인박스에서는 `전체` 필터에서만 `임시` badge로 노출한다.
- **목록 상한**: 매칭 인박스 테이블은 한 번에 최대 50행만 렌더한다(무한 스크롤 없음). 초과분은 건수만 안내하고 소스/상태 필터로 좁혀 처리한다. 일괄 액션도 표시된 행 기준으로만 동작한다.
- **홈탭 Neo CRM 섹션**: `/admin/crm` 홈에 Neo CRM 스냅샷 기준 KPI(이번 달/30일 수금, Opportunity pipeline, account 수)와 최근 수금·성과(Collection__c/SalesPerformance__c) 고객 10건을 표시한다(`overview.neoCrm`). 스냅샷이 비었거나 schema 미적용이면 안내 문구로 degrade한다.
- **partners 스키마 드리프트 수정**: `20260611_partners_workspace_columns.sql`이 코드가 읽는 `partners.channel/region/owner_name/owner_email/account_manager_name/tags` 컬럼을 idempotent하게 추가한다.

## 6. 남은 결정 사항

| 결정 | 선택지 | 권장 |
|---|---|---|
| 외부 CRM 인증 | 개인 OAuth MCP / 서비스 OAuth / 본사 API key | 서비스 OAuth 또는 본사 API key |
| canonical 고객 모델 | legacy partners / V2 customers | V2 customers |
| REV 시트 금액 처리 | 합산 / 병기 / 매칭 후 dedupe | 병기, 매칭 후 dedupe |
| 리드 전환 대상 | legacy partner / V2 customer+deal / 선택형 | 선택형, 기본 V2 |
| Branch 역할 | CRM 편집 / 성과 검수 | 성과 검수 및 CRM deep-link |
| MCP 사용 범위 | raw data shuttle / compact context first | compact context first, row-level은 필요 시 bounded pull |

## 7. 즉시 확인할 운영 체크리스트

- [ ] Supabase 운영 DB에 `branch_rev_deals`, `branch_sync_runs` migration 적용 여부 확인.
- [ ] `GOOGLE_BRANCH_DASHBOARD_SHEET_ID`와 service account sheet 권한 확인.
- [ ] `/admin/crm/revenue`의 시트 동기화가 REV만 동기화하는지 smoke test.
- [x] 리드 전환 버튼은 V2 고객+초기 거래 생성으로 교체.
- [ ] 외부 CRM credential은 개인 토큰을 서버 배치에 사용하지 않도록 정책 확정.
- [ ] 운영 env에 `XIAOSHOUYI_BASE_URL` + `XIAOSHOUYI_ACCESS_TOKEN` 또는 서비스 계정 grant env 설정.
- [x] 외부 CRM 수동 sync 전에 non-destructive preflight 확인 추가.
- [x] `/admin/crm/revenue`에 CRM 운영 준비도 점검 패널 추가.
- [x] 외부 CRM sync 실행 전에 DB schema readiness gate 추가.
- [ ] Supabase 운영 DB에 `external_crm_records.last_seen_run_id/is_stale/stale_at` migration 적용.
- [ ] Supabase 운영 DB에 `crm_write_requests` guardrail migration 적용.
- [ ] Supabase 운영 DB에 `crm_write_request_events`와 write retry state migration 적용.
- [ ] Supabase 운영 DB에 `crm_source_priorities`, `crm_match_aliases`, `crm_xiaoshouyi_query_catalog` migration 적용.
- [ ] Supabase 운영 DB에 `20260611_crm_auto_confirm_policy.sql` (auto-confirm 정책 컬럼) 적용. 미적용 시 자동 확정은 조용히 비활성으로 동작.
- [ ] Supabase DB에 `20260611_partners_workspace_columns.sql` 적용. `partners.channel/region/owner_*/account_manager_name/tags`는 코드가 읽지만 기존 migration에 없던 컬럼이라(수동 추가된 DB만 동작), 미적용 환경은 "column partners.channel does not exist"로 JSON fallback이 뜬다.
- [ ] 첫 자동 확정 배치 후 `/admin/crm/matching`에서 자동 확정 품질(오매칭률) 검수, 필요 시 `auto_confirm_min_confidence/min_gap` 상향.
- [ ] `/api/admin/crm/mcp-context`가 source priority와 Xiaoshouyi query catalog를 secret 없이 반환하는지 확인.
- [ ] 라이브 Xiaoshouyi snapshot 적재 후 고객사 상세의 `crm_coverage.external_records` 후보 품질과 false positive 기준 확인.
- [ ] Xiaoshouyi pagination/cursor/stale marking을 live credential로 smoke test.
- [x] `/admin/crm/revenue`에 외부 CRM 후보 승인 UI 추가.
- [x] 고객 상세 source link confirm/reject 액션 추가.
- [x] write-back dry-run/승인/executor 경로에 객체별 allowlist, DB guardrail, audit log, retry state 추가.
- [x] write-back metadata preflight와 executor 사전 field probe 추가.
- [x] write-back persisted action 전 DB schema readiness gate 추가.
- [ ] write-back은 live service credential, live metadata validation, retry 정책 확인 전까지 운영 UI에서 직접 전송 버튼을 노출하지 않음.
