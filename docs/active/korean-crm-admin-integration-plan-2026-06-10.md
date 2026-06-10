---
title: 한국 CRM 데이터 어드민 통합 감사 및 적용 계획
status: active
owner: KR Branch
last_updated: 2026-06-10
related:
  - ./crm-sheet-revenue-sync-plan.md
  - ./neo-crm-integration-request.md
---

# 한국 CRM 데이터 어드민 통합 감사 및 적용 계획

목표: 한국 CRM 데이터가 `/admin/crm` 하위 탭에서 빠짐없이 파악되고, 수정 가능한 데이터와 읽기/검수 전용 데이터가 명확히 구분되며, 외부 CRM/시트/앱 DB가 중복 집계 없이 정리되는 상태를 만든다.

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
- `/admin/branch`는 팀/지역/시트 성과와 데이터 품질 검수 화면으로 둔다.
- REV 시트와 외부 CRM 금액은 매칭 전까지 앱 매출과 합산하지 않는다.
- 외부 CRM 쓰기는 직접 실행하지 않고, 승인 큐와 감사 로그를 통과시킨다.

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

### 3-2. V2 고객/거래

현재 상태:

- `partner_accounts`, `customers`, `deals`, `deal_line_items`, `payments_v2`, `receipts_v2`, `activity_logs`가 존재.
- 고객/거래/수납을 운영 CRM의 canonical 모델로 쓰기에 가장 적합하다.

문제:

- 고객사 탭은 create disabled 상태라 가장 자연스러운 고객 관리 화면에서 신규 고객을 만들 수 없다.
- 일부 화면은 고객명을 기준으로 grouping한다. 동명이인/동일 학원 다지점 케이스에서 충돌 가능.

적용 계획:

1. CRM 고객사 탭에서 admin create를 활성화한다.
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
3. 자동 매칭은 후보만 생성하고, admin이 확정해야 canonical 연결로 승격한다.
4. 매칭 전 금액은 `시트 기준`으로 병기만 하고 합산하지 않는다.

### 3-4. 외부 Xiaoshouyi / eeoCRM

참조 repo: `https://github.com/Sean-xiang-dot/eeocrm-personal`

확인된 성격:

- TypeScript/Node 18 MCP server다.
- Express SSE endpoint로 AI 도구가 연결하고, 개인 OAuth 토큰 `~/.neocrm/credentials.json`로 Xiaoshouyi CRM에 접근한다.
- 주요 API는 `GET /rest/data/v2/query?q=...`, CRUD는 `/rest/data/v2.0/xobjects/{apiKey}` 계열.
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
- 아직 live write-back은 열지 않는다. 승인 큐와 감사 로그의 저장소만 선반영한다.

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

### Phase 2. 외부 CRM read-only ingest

- 서비스 credential 정책 확정.
- 외부 CRM client를 앱 서버에 별도 구현한다. MCP 서버를 production runtime dependency로 두지 않는다.
- `external_crm_sync_runs`, `external_crm_records` raw snapshot schema 추가. (2026-06-10 반영)
- `/admin/crm/revenue`에 Xiaoshouyi snapshot source 상태 표시. (2026-06-10 반영)
- `account/contact/opportunity/Collection__c/ShroffAccount__c` read-only sync client 구현. (2026-06-10 반영)
- `/api/admin/crm/external-sync`, `/api/cron/sync-external-crm` 추가. (2026-06-10 반영)
- 고객사 상세에 source badge, external last synced, discrepancy panel 표시.

### Phase 3. 승인형 write-back

- `crm_write_requests` 승인 큐 schema 추가. (2026-06-10 반영)
- field metadata validation.
- dry-run preview.
- audit log 및 실패 retry.
- update/create만 허용, delete 제외.

## 6. 남은 결정 사항

| 결정 | 선택지 | 권장 |
|---|---|---|
| 외부 CRM 인증 | 개인 OAuth MCP / 서비스 OAuth / 본사 API key | 서비스 OAuth 또는 본사 API key |
| canonical 고객 모델 | legacy partners / V2 customers | V2 customers |
| REV 시트 금액 처리 | 합산 / 병기 / 매칭 후 dedupe | 병기, 매칭 후 dedupe |
| 리드 전환 대상 | legacy partner / V2 customer+deal / 선택형 | 선택형, 기본 V2 |
| Branch 역할 | CRM 편집 / 성과 검수 | 성과 검수 및 CRM deep-link |

## 7. 즉시 확인할 운영 체크리스트

- [ ] Supabase 운영 DB에 `branch_rev_deals`, `branch_sync_runs` migration 적용 여부 확인.
- [ ] `GOOGLE_BRANCH_DASHBOARD_SHEET_ID`와 service account sheet 권한 확인.
- [ ] `/admin/crm/revenue`의 시트 동기화가 REV만 동기화하는지 smoke test.
- [ ] 리드 전환 버튼은 수정 전까지 "운영 큐 생성"으로 명확히 표시하거나 V2 전환으로 교체.
- [ ] 외부 CRM credential은 개인 토큰을 서버 배치에 사용하지 않도록 정책 확정.
- [ ] 운영 env에 `XIAOSHOUYI_BASE_URL` + `XIAOSHOUYI_ACCESS_TOKEN` 또는 서비스 계정 grant env 설정.
