---
title: Sales Ledger Productization Roadmap
status: proposed
owner: KR Branch
last_updated: 2026-07-01
---

# Sales Ledger Productization Roadmap

## 1. 방향

Sales Ledger는 세 화면을 새로 늘리는 프로젝트가 아니다. 하나의 원장 read model을 만들고, 각 영역이 다른 렌즈로 소비하게 한다.

| 영역 | 역할 |
|---|---|
| CRM | 매출 원장 workbench, source-link matching, 정합성 처리, 감사/변경 이력 |
| KR Team | 목표 대비 실행 렌즈, pacing, 담당자/팀별 운영 현황 |
| Overview | 3-4개의 얇은 경영 요약 카드와 deep link |

Canonical route는 기존 흐름을 존중해 `/admin/crm/deals` 계열의 `매출 장부` workbench로 둔다. `/admin/branch`는 목표 대비 실행 화면으로 유지하고, 상세 원장 행은 CRM workbench로 deep link한다.

## 2. 현재 자산

이미 있는 기반:

- [lib/branch/parsers/dsh.ts](../../lib/branch/parsers/dsh.ts): `1. DSH` parser.
- [lib/branch/parsers/rev.ts](../../lib/branch/parsers/rev.ts): `2. REV` parser.
- [lib/branch/parsers/kpi.ts](../../lib/branch/parsers/kpi.ts): `3. KPI` parser.
- [lib/branch/sync/sync-rev.ts](../../lib/branch/sync/sync-rev.ts): REV sheet to DB sync.
- [lib/repositories/branch-deals.ts](../../lib/repositories/branch-deals.ts): `branch_rev_deals` repository.
- [lib/repositories/crm-source-links.ts](../../lib/repositories/crm-source-links.ts): REV/lead/external CRM source matching.
- [lib/admin-crm-revenue.ts](../../lib/admin-crm-revenue.ts): CRM money read model. REV는 비교용이며 앱 매출과 합산하지 않는 원칙이 이미 있다.
- [lib/crm/revenue-performance.ts](../../lib/crm/revenue-performance.ts): CRM 성과 분석. 현재는 `branch_rev_deals`를 읽으므로 자체 CRM 매출 원천으로 분리할 여지가 있다.
- [lib/external-crm/sync-chain.ts](../../lib/external-crm/sync-chain.ts): 외부 CRM sync 후 파생 snapshot을 갱신하는 선례.
- [app/api/admin/branch/summary/route.ts](../../app/api/admin/branch/summary/route.ts): DSH/KPI/REV 기반 KR Team summary.
- [app/api/admin/branch/kpi/route.ts](../../app/api/admin/branch/kpi/route.ts): KPI matrix API.
- [app/api/admin/branch/sync/route.ts](../../app/api/admin/branch/sync/route.ts): manual sync endpoint.

기존 tests:

- [tests/branch/parsers/dsh.test.ts](../../tests/branch/parsers/dsh.test.ts)
- [tests/branch/parsers/rev.test.ts](../../tests/branch/parsers/rev.test.ts)
- [tests/branch/parsers/kpi.test.ts](../../tests/branch/parsers/kpi.test.ts)
- [tests/branch/computations](../../tests/branch/computations)

## 3. Phase 0 - Contract freeze

목표: 코드 변경 전에 3개 탭의 의미, source-of-record, 합산 금지 규칙, 권한을 고정한다.

작업:

- PRD와 ADR을 확정한다.
- `DSH`, `REV`, `KPI` 용어를 `목표`, `실적`, `달성률`, `Gap`, `확정`, `고확도`, `예상`으로 통일한다.
- FY26-27 fiscal calendar를 확정한다.
- `branch_rev_sheet`는 supporting source이며 CRM canonical revenue로 자동 승격하지 않는다고 명시한다.
- DSH actual과 KPI actual의 차이를 data-quality issue로 노출할지, 둘 중 하나를 source-of-truth로 삼을지 결정한다.

완료 기준:

- [sales-ledger-productization-prd-2026-06-30.md](./sales-ledger-productization-prd-2026-06-30.md) 승인.
- [../adr/ADR-008-korea-sales-ledger-operating-record.md](../adr/ADR-008-korea-sales-ledger-operating-record.md) 승인 또는 보류 사유 기록.

## 4. Phase 1 - Read-only product surface

목표: 기존 sheet sync/read 기반을 유지하되, 사용자가 시트 없이 3개 탭의 의미를 Admin 안에서 볼 수 있게 한다.

현재 vertical slice:

- `/admin/branch/ledger`는 `1. DSH`, `2. REV`, `3. KPI`를 하나의 workbench로 묶는다.
- REV 검색 테이블은 시트 원본 행과 `branch_sales_ledger_drafts`에서 `applied` 처리된 장부 입력 행을 함께 보여준다.
- 적용된 draft는 `branch_sales_ledger_entries` 내부 원장 엔트리로 기록한 뒤 `장부 반영` 지표에 우선 반영한다. 이 레이어는 operator가 자체 입력/수정 결과를 즉시 확인하는 용도이며, recognized revenue 또는 `branch_rev_deals` 변형으로 간주하지 않는다.
- DB migration이 적용되지 않은 환경에서는 동일 UI가 local fallback queue로 동작한다.
- `ui-ux-pro-max` 기준으로 화면 성격은 `Data-Dense Dashboard`로 둔다. 우선순위는 접근성, 필터/표 조작성, 로딩 피드백, 모바일 테이블 처리, chart/table 연동이다.
- 자체 평가는 `독립성`, `편의성/사용성`, `디자인` 세 항목으로 나누고 각 75점 이상을 MVP 합격선으로 본다.
- `3. KPI` 렌즈는 담당자별 활동 목표/실적, 최대 병목, 매출 달성, 딜 수를 표로 보여주고 담당자 클릭 시 `2. REV` 매출 행 필터로 연결한다.

Frontend:

- `/admin/crm/deals`를 `매출 장부` workbench로 명명한다.
- 기존 deals page 내부 UI를 다음 컴포넌트로 나눈다.
  - `components/admin/crm/ledger/LedgerSummary.tsx`
  - `components/admin/crm/ledger/LedgerHealth.tsx`
  - `components/admin/crm/ledger/LedgerSourceLinks.tsx`
  - `components/admin/crm/ledger/LedgerMonthlyFlow.tsx`
  - `components/admin/crm/ledger/LedgerRiskList.tsx`
  - `components/admin/crm/ledger/LedgerDocumentsTable.tsx`
- `/admin/branch`에는 DSH 운영 현황, KPI matrix, REV filtered links를 보여준다.
- Overview에는 `이번 달 확정 매출`, `미매칭 REV`, `과거 미확정`, `source freshness` 정도만 노출한다.

Backend:

- `/api/admin/branch/summary`, `/api/admin/branch/kpi`의 response contract를 문서화한다.
- `/api/admin/branch/sync`에서 `sources` validation을 명시적으로 확장할 준비를 한다.
- `crm_source_links` confirmed 상태와 REV unmatched amount를 Sales Ledger health에 노출한다.

완료 기준:

- 기존 `/admin/branch` 수치와 새 surface 수치가 동일하다.
- REV confirmed/high-confidence/expected 분해가 화면에 표시된다.
- sync 실패 시 blank가 아니라 last sync, last error, retry state가 보인다.
- `npx vitest run tests/branch/parsers tests/branch/computations` 통과.

## 5. Phase 2 - Reliability and QA

목표: 시트 구조 변경과 색상 기반 운영 규칙이 깨져도 조용히 틀린 숫자를 보여주지 않게 한다.

DB 후보:

- `branch_sales_ledger_snapshots`
  - append-only 원본 감사 테이블.
  - `tab_key`, `range`, `sheet_modified_at`, `grid_checksum`, `parser_version`, `row_count`, `raw_grid`, `parsed_payload`.
- `branch_dsh_rows`
  - DSH 목표/실적 원천 캐시.
  - `fiscal_year`, `level`, `team`, `member`, `kind`, `category`, `status_type`, `channel`, `annual`, `quarters`, `months`.
- `branch_kpi_rows`
  - KPI 목표/실적 원천 캐시.
  - `fiscal_year`, `period_type`, `period_month`, `member`, `owner_key`, `metric`, `goal`, `actual`.
- `branch_rev_deals` 확장
  - `source_record_key`, `source_digest`, `snapshot_id`, `currency`.
- `crm_orders`
  - 외부 CRM 원천을 운영 성과 분석용으로 정제한 read model.
  - 초기 ingestion은 `external_crm_records.object_api_key = "SalesPerformance__c"`만 대상으로 잡아 중복 계산 위험을 줄인다.
  - 핵심 필드: `source_system`, `source_object`, `external_id`, `customer_name`, `normalized_customer_name`, `owner_id`, `owner_name`, `team`, `status_normalized`, `amount`, `currency`, `occurred_at`, `occurred_month`, `source_run_id`, `payload_hash`, `payload`, `is_stale`.
- `crm_order_import_runs`
  - `rows_scanned`, `rows_upserted`, `rows_rejected`, `stale_marked`, rejection samples, latest error를 남긴다.

Repository/API:

- `lib/repositories/branch-dsh.ts`
- `lib/repositories/branch-kpi.ts`
- 기존 `lib/repositories/branch-deals.ts` 확장.
- `lib/branch/sync/sync-dsh.ts`
- `lib/branch/sync/sync-kpi.ts`
- `lib/branch/sync/run-sales-ledger.ts`
- `lib/repositories/crm-orders.ts`
- `app/api/admin/crm/orders/import/route.ts`
- 기존 `app/api/admin/crm/performance/route.ts`는 URL을 유지하되 `crm_orders` 우선, `branch_rev_deals` fallback 메타데이터를 반환한다.

검증:

- migration text test: RLS, revoke/grant, unique/digest indexes.
- sync mapper test: fixture to DB payload.
- rollup test: DSH goal/status + REV confirmed/high/expected + KPI metrics가 같은 month/team/owner로 맞는지.
- source-link regression: REV full replace 후 confirmed link reattach 유지.
- API auth test: invalid sources, invalid month, unauthorized sync.
- CRM orders importer test: owner exclusion, unmapped status, invalid date, non-positive amount, stale marking.
- CRM performance source test: `crm_orders`가 있으면 우선 사용하고 없으면 `branch_rev_deals` fallback warning을 반환한다.

완료 기준:

- DSH/KPI direct sheet read를 repository read로 대체할 수 있다.
- sheet parser failure가 friendly error와 last good data로 처리된다.
- data-quality panel이 period close 전 blockers를 보여준다.

## 6. Phase 3 - Normalized ledger option

목표: REV wide sheet shape를 내부 source-of-truth로 유지할지, normalized ledger entries로 옮길지 결정한다.

후보 모델:

- `sales_ledger_lines`: account/branch/owner/classification 단위 행.
- `sales_ledger_period_entries`: line + fiscal period + amount + confidence state.
- `sales_ledger_adjustments`: locked period 이후 수정 이력.
- `sales_ledger_validations`: validation issue snapshot.

원칙:

- wide sheet format은 import/export view로 둔다.
- 월/분기/FY totals는 period entries에서 생성한다.
- locked actual period는 adjustment workflow로만 수정한다.
- Google Sheet는 fallback/import source로 낮춘다.

완료 기준:

- normalized model과 기존 `branch_rev_deals`의 수치 parity test.
- spreadsheet-compatible export 제공.
- 변경 이력과 actor가 기록된다.

## 7. Phase 4 - CRM/Overview/KR Team integration

목표: 같은 원장 read model을 세 영역에서 중복 없이 소비한다.

CRM:

- `매출 장부` workbench에서 source health, matching, ledger rows, risks, documents를 처리한다.
- `/admin/crm/matching`과 `/admin/crm/deals` deep link를 정리한다.
- 첫 owned CRM money slice는 `external_crm_records` -> `crm_orders` -> `/api/admin/crm/performance`로 둔다.
- FX conversion, 다중 외부 객체 dedupe, 전체 revenue dashboard redesign은 별도 reconciliation 이후로 미룬다.

KR Team:

- 목표 대비 pacing과 담당자 실행만 보여준다.
- 상세 행 편집/정합성은 CRM workbench로 보낸다.

Overview:

- compact cards만 둔다.
- charts/table 전체를 복제하지 않는다.

완료 기준:

- 같은 지표가 세 곳에서 다른 숫자로 보이지 않는다.
- Overview는 3-4개 카드만 렌더링한다.
- `/api/admin/crm/performance`는 Sales Ledger read model 파생으로 바뀌거나 중복 chart로 보이지 않는다.

## 8. Phase 5 - Expansion

별도 ADR 이후 진행한다.

- `SEG`, 지역 매출, 채널 정산, 목표 전략, review archive.
- HW 매출/출고 revenue와 SW/HW 통합 원장.
- NEO/Xiaoshouyi source records의 recognized revenue 승격.
- Account 360 materialized view.
- AI insight, weekly operating brief.
- external scheduler 또는 Vercel Pro 확정 후 sub-daily sync.

## 9. 검증 명령

기본 게이트:

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

집중 게이트:

```bash
npx vitest run tests/branch/parsers tests/branch/computations
npx vitest run tests/db/crm-orders-migration.test.ts tests/crm/orders-import.test.ts tests/crm/revenue-performance.test.ts tests/crm/revenue-quality.test.ts tests/api/admin-crm-orders-import.test.ts
```

cron 변경 시:

```bash
npm run check:vercel-crons
```
## 10. 2026-07-01 Phase 1.5 - DB-native 3-tab import

목표: Google Sheet/CSV/XLSX를 매번 참조하는 구조에서 벗어나 `1. DSH`, `2. REV`, `3. KPI`를 자체 DB import 정본으로 운영한다.

완료된 기반:

- `supabase/migrations/20260701_sales_ledger_db_native_import.sql`
  - `sales_ledger_import_runs`
  - `sales_ledger_source_files`
  - `sales_ledger_import_snapshots`
  - `sales_ledger_active_sources`
  - `branch_dsh_rows`
  - `branch_kpi_rows`
  - `branch_rev_lines`
  - `branch_rev_period_entries`
  - `sales_ledger_validations`
- `scripts/import-sales-ledger-files.mjs`
  - 기본 `--dry-run`
  - `--commit` 명시 시 Supabase 적재
  - source checksum, file sha256, row counts, validation counts 생성
- `lib/repositories/sales-ledger-imports.ts`
  - active import가 있으면 DSH/KPI domain contract로 복원
  - active import가 없거나 migration 전이면 기존 Sheet fallback 유지
- `/api/admin/branch/summary`, `/api/admin/branch/kpi`
  - DB active import 우선 read
  - fallback은 기존 Google Sheet parser read

다음 작업:

- live Supabase에 migration 적용 후 `node scripts/import-sales-ledger-files.mjs --commit --actor <admin>`으로 첫 import run 생성.
- `/api/admin/branch/pipeline`도 `branch_rev_period_entries` 우선 read로 전환.
- source provenance panel에 active import id, checksum, row count, validation count를 표시.
- `edit-row`를 replacement 또는 delta adjustment로 확정하고, 수정 엔트리 합산 규칙을 DB/API/UI에 반영.
- `sales_ledger_validations`를 data-quality panel과 period close blocker로 연결.
