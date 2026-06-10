---
title: 한국 CRM 운영 적용 해제 Runbook
status: active
owner: KR Branch
last_updated: 2026-06-10
related:
  - ./korean-crm-admin-integration-plan-2026-06-10.md
  - ./crm-sheet-revenue-sync-plan.md
  - ./korean-crm-operational-unblock-bundle-2026-06-10.sql
---

# 한국 CRM 운영 적용 해제 Runbook

목표: `/admin/crm/revenue`의 운영 준비도 패널이 막힘 없이 통과하고, 한국 CRM 데이터가 앱 DB, REV 시트, Xiaoshouyi snapshot, 승인형 write-back 큐 기준으로 한 화면에서 검수 가능한 상태를 만든다.

## 1. 현재 막힘

2026-06-10 smoke 기준 운영 DB에서 확인된 막힘:

| 영역 | 증상 | 영향 |
|---|---|---|
| 외부 CRM snapshot stale tracking | `external_crm_records.last_seen_run_id` 없음 | Xiaoshouyi sync가 원격 query 전에 `409`로 차단됨 |
| write-back retry state | `crm_write_requests.attempt_count` 없음 | persisted write request 생성/승인/실행이 `409`로 차단됨 |
| write-back audit | `crm_write_request_events` 없음 | 승인 큐 감사 로그가 없어 live write 차단 |
| Xiaoshouyi credential | `XIAOSHOUYI_BASE_URL` 및 token/service OAuth 없음 | live snapshot, metadata probe, write executor smoke 불가 |

현재 의도된 동작:

- DB schema가 준비되지 않으면 외부 CRM sync/write는 live Xiaoshouyi 호출 전에 중단한다.
- write-back `dryRun` preview는 DB migration 전에도 동작한다.
- `/admin/crm/revenue`는 migration 일부가 빠져도 fallback query로 로딩되어야 한다.

## 2. Supabase 적용 순서

권장 수동 적용 경로: Supabase SQL Editor에서 [`korean-crm-operational-unblock-bundle-2026-06-10.sql`](./korean-crm-operational-unblock-bundle-2026-06-10.sql)을 한 번 실행한다. 이 bundle은 아래 migration 순서를 하나의 idempotent SQL로 묶어 둔 운영 적용 파일이며, `supabase/migrations`에는 넣지 않는다.

개별 migration으로 적용해야 한다면 아래 순서를 따른다. 같은 날짜 migration이 많으므로 파일명 순서만 믿지 않는다.

| 순서 | 파일 | 목적 |
|---:|---|---|
| 1 | `supabase/migrations/20260610_external_crm_snapshots.sql` | `external_crm_sync_runs`, `external_crm_records`, 기본 `crm_write_requests` 생성 |
| 2 | `supabase/migrations/20260610_external_crm_stale_tracking.sql` | snapshot stale/deleted record 추적 column과 index 추가 |
| 3 | `supabase/migrations/20260610_crm_source_links.sql` | 리드, REV 시트, Xiaoshouyi snapshot을 앱 고객/거래와 연결하는 identity layer |
| 4 | `supabase/migrations/20260610_external_crm_write_request_guards.sql` | write request payload 구조와 update/transfer external id DB guard 추가 |
| 5 | `supabase/migrations/20260610_external_crm_write_request_retry_audit.sql` | retry state, retry index, `crm_write_request_events` audit table, CRM schema contract check RPC 추가 |
| 6 | `supabase/migrations/20260610_rev_color_amounts.sql` | REV 시트 확정/고확률 월별 금액 column. 이미 운영 DB에 있으면 재적용 불필요 |

주의:

- 2번은 1번의 `external_crm_records`와 `external_crm_sync_runs`가 먼저 있어야 한다.
- 4번과 5번은 1번의 `crm_write_requests`가 먼저 있어야 한다.
- 4번은 constraint 이름 기준으로 idempotent하게 작성되어 있다. 다만 같은 제약을 다른 이름으로 수동 생성한 DB라면 운영 반영 전 중복 제약을 확인한다.
- 5번은 `get_crm_schema_contract_status()` RPC를 만든다. `/api/admin/crm/readiness`와 `/api/admin/crm/overview`는 이 RPC로 upsert unique key, source-link confirmed unique index, write guard constraint, audit FK/check constraint까지 확인한다.
- `supabase/migrations/20260610_blog_posts_backfill_schema.sql`은 CRM 운영 적용과 무관하다.
- 이 repo에는 같은 `20260610` prefix migration이 여러 개 있다. Supabase CLI처럼 prefix를 migration version으로 보는 도구로 배포한다면, 운영 반영 전에 repo 관례에 맞게 version 충돌을 해소하거나 SQL Editor/manual apply 절차로 위 순서를 보장한다.

적용 전 중복 row preflight:

```sql
select source_system, object_api_key, external_id, count(*)
from public.external_crm_records
group by 1, 2, 3
having count(*) > 1;

select source_system, source_object, source_record_key, target_type, target_id, count(*)
from public.crm_source_links
group by 1, 2, 3, 4, 5
having count(*) > 1;

select source_system, source_object, source_record_key, count(*)
from public.crm_source_links
where status = 'confirmed'
group by 1, 2, 3
having count(*) > 1;
```

위 쿼리가 row를 반환하면 unique constraint/index 추가가 실패하고 bundle transaction 전체가 rollback될 수 있다. 먼저 중복 source link/snapshot row를 병합하거나 stale/rejected 처리한 뒤 적용한다.

## 3. 환경 변수

read-only snapshot과 metadata probe에 필요한 최소 env:

```text
XIAOSHOUYI_BASE_URL=https://...
XIAOSHOUYI_ACCESS_TOKEN=...
```

또는 service OAuth:

```text
XIAOSHOUYI_BASE_URL=https://...
XIAOSHOUYI_CLIENT_ID=...
XIAOSHOUYI_CLIENT_SECRET=...
XIAOSHOUYI_USERNAME=...
XIAOSHOUYI_PASSWORD=...
```

선택 env:

```text
XIAOSHOUYI_SYNC_OBJECTS=account,contact,opportunity,ShroffAccount__c,Collection__c
XIAOSHOUYI_SYNC_PAGE_SIZE=100
XIAOSHOUYI_SYNC_MAX_PAGES=20
```

운영 원칙:

- 개인 MCP OAuth 토큰을 Vercel 서버 배치 credential로 사용하지 않는다.
- delete 계열 write-back은 MVP 범위에서 계속 제외한다.
- service credential 연결 전에는 승인 큐 UI에 직접 전송 버튼을 노출하지 않는다.

## 4. 적용 후 검증

로컬 또는 preview 환경에서 admin auth를 통과한 뒤 확인한다.

```bash
curl -sS http://127.0.0.1:3888/api/admin/crm/readiness
```

예상 상태:

| 단계 | readiness 기대값 |
|---|---|
| migration 적용 전 | stale tracking, write retry/audit, credential 관련 blocked |
| migration 적용 후, Xiaoshouyi env 전 | DB schema/contract/REV check는 OK, credential은 blocked, metadata는 warning |
| Xiaoshouyi env 후 | sync credential OK, metadata probe는 object field 결과에 따라 OK 또는 blocked |

외부 CRM sync smoke:

```bash
curl -sS -X POST http://127.0.0.1:3888/api/admin/crm/external-sync
```

성공 기준:

- DB schema missing이면 `409`가 나와야 하고 Xiaoshouyi remote query를 시작하지 않아야 한다.
- credential missing이면 skipped 또는 blocked 상태가 UI에 숨겨지지 않아야 한다.
- credential이 있으면 object별 `rowsScanned`, `rowsUpserted`, `pagesScanned`, `cursorValue`, `staleMarked`가 기록되어야 한다.

write-back smoke:

```bash
curl -sS -X POST http://127.0.0.1:3888/api/admin/crm/write-requests \
  -H 'Content-Type: application/json' \
  -d '{"dryRun":true,"objectApiKey":"account","operation":"create","payload":{"accountName":"CRM smoke test"}}'
```

성공 기준:

- dry-run은 method/path/body preview를 반환한다.
- persisted create는 DB schema가 준비되지 않으면 `409`로 차단된다.
- schema와 credential이 준비된 뒤에도 executor는 `approved` 요청만 claim하고 실행한다.

## 5. 운영 전환 기준

운영 전환 전 체크:

- [ ] `/api/admin/crm/readiness`에서 DB schema 관련 blocked가 0개.
- [ ] `branch_rev_deals.monthly_confirmed/monthly_high_conf`가 readiness에서 OK.
- [ ] Xiaoshouyi credential은 개인 토큰이 아니라 운영용 service credential로 등록.
- [ ] `GET /api/admin/crm/write-requests?preflight=metadata`가 writable object field probe를 통과.
- [ ] `/api/admin/crm/external-sync` 수동 실행 후 `external_crm_records`에 account/contact/opportunity/Collection__c/ShroffAccount__c snapshot 적재 확인.
- [ ] `/api/admin/crm/source-links/generate`의 `xiaoshouyi_snapshot` 후보 품질을 샘플 검수.
- [ ] 고객 상세 slide-over에서 confirmed Xiaoshouyi source link와 discrepancy panel이 기대대로 표시.
- [ ] write-back은 dry-run preview, 승인, retry, audit event까지 staging에서만 먼저 검증.

## 6. 롤백/중단 기준

아래 상황에서는 live write executor를 중단하고 read-only snapshot만 유지한다.

- metadata probe가 허용 필드와 실제 Xiaoshouyi field mismatch를 보고한다.
- retry가 같은 object/operation에서 2회 이상 같은 validation error로 실패한다.
- source link 후보 false positive가 샘플 기준으로 높아 confirmed link 정책을 재조정해야 한다.
- 운영 credential이 개인 OAuth 또는 수동 브라우저 세션에 의존한다.
