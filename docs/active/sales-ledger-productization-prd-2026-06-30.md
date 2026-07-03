---
title: Classin Korea Sales Operating Ledger PRD
status: proposed
owner: KR Branch
last_updated: 2026-07-01
---

# Classin Korea Sales Operating Ledger PRD

## 1. 목적

FY26-27 Korea sales ledger를 Google Sheet 기반 시각화에서 벗어나 Classin Home Admin 안의 자체 운영 도구로 내재화한다. 초기 범위는 기존 시트의 `1. DSH`, `2. REV`, `3. KPI` 세 탭으로 제한한다.

이 제품은 새 CRM을 다시 만드는 일이 아니다. CRM은 고객, 기록, 정합성, 매출 원장 workbench를 맡고, KR Team은 목표 대비 실행 렌즈를 맡고, Overview는 경영 요약만 얇게 소비한다.

관련 문서:
- [crm-sheet-revenue-sync-plan.md](./crm-sheet-revenue-sync-plan.md)
- [erp-blueprint-2026-06-22.md](./erp-blueprint-2026-06-22.md)
- [internal-crm-backend-operating-plan-2026-06-26.md](./internal-crm-backend-operating-plan-2026-06-26.md)
- [architecture-schema-erd.md](./architecture-schema-erd.md)
- [../adr/ADR-008-korea-sales-ledger-operating-record.md](../adr/ADR-008-korea-sales-ledger-operating-record.md)

## 2. 제품 이름과 언어

문서용 정식 이름은 `Classin Korea Sales Operating Ledger`로 둔다. 화면과 운영 문구에서는 한국어 우선으로 `매출 장부`, `운영 현황`, `활동 KPI`를 사용한다.

표준 용어:

| 기존 표현 | 표준 표현 | 비고 |
|---|---|---|
| Goal | 목표 | target과 혼용하지 않는다. |
| Status | 실적 | 금액 문맥에서는 status 대신 actual/실적을 쓴다. |
| Rate | 달성률 | rate 단독 표기를 피한다. |
| Sum | 합계 | 비즈니스 화면에서는 total/합계로 쓴다. |
| Gap | Gap / 차이 | `실적 - 목표`로 정의한다. |
| New | 신규 | |
| Renew | 갱신 | Renewal과 통일한다. |
| Direct | 직접 | |
| Channel | 채널 | 파트너와 혼동될 때는 `채널 매출`로 쓴다. |
| Software / Hardware | SW / HW | 표와 필터에서는 약어 허용. |
| Lead / Acc. / opp. / Sol. / Visit | 리드 / 계정 / 기회 / 제안 / 방문 | `Acc.`, `Sol.`의 실제 의미는 원본 운영자 확인 필요. |

## 3. 초기 범위

### In scope

- `1. DSH`: FY/Q/M 목표, 실적, 달성률, Gap, SW/HW, 신규/갱신, 직접/채널 breakdown.
- `2. REV`: 매출 장부 행, 월/주차 금액, 확정/고확도/예상 분해, 담당자/팀/지역/status/type 필터.
- `3. KPI`: 담당자별 매출 및 활동 KPI 목표/실적/Gap.
- REV 신규 입력/수정 초안 큐: 서버 저장, 체크 상태, 원본 행 스냅샷, 적용 전 검토.
- 수동 sync, freshness, last good data, data-quality warnings.
- `crm_source_links`를 통한 REV 행과 CRM 고객/거래 매칭 상태 표시.
- Admin API 인증, repository 기반 데이터 접근, 기본 검증 게이트.

### Out of scope

- `SEG`, 지역 매출, 채널 정산, 목표 전략, BD Q1 Review 등 4번째 이후 탭.
- HW sheet, 캠페인, 공개 이벤트, Gemini/AI insights의 전면 통합.
- Google Sheet write-back.
- NEO/Xiaoshouyi가 최종 recognized revenue book-of-record가 되는 작업.
- Account 360 materialized model.
- 새 top-level nav 추가.
- Vercel sub-daily cron 추가. 플랜 확정 전에는 금지한다.

## 4. 사용자와 핵심 작업

| 사용자 | 해야 하는 일 |
|---|---|
| 대표/총괄 | FY 목표 대비 현재 실적, Gap, 가장 큰 누락 영역을 빠르게 확인한다. |
| KR Team 리더 | 담당자/팀/월별 목표 대비 실적과 활동 KPI 병목을 본다. |
| 매출 운영자 | REV 장부 행을 검색하고, 금액/기간/분류 오류를 찾고, CRM 매칭 상태를 확인한다. |
| CRM 관리자 | REV를 앱 매출과 무비판적으로 합산하지 않고, confirmed source link 이후 비교/정합성 처리만 한다. |

핵심 플로우:

1. DSH 운영 현황에서 Gap이 큰 월/카테고리를 클릭한다.
2. REV 매출 장부가 같은 필터로 열리고 관련 행을 보여준다.
3. 행별 확정/고확도/예상 금액과 CRM 매칭 상태를 확인한다.
4. KPI에서 담당자별 활동 지표 병목을 보고 REV/CRM 고객으로 드릴다운한다.
5. 검증 실패가 있으면 period close 또는 확정 리포트 전에 해결한다.

## 5. 데이터 계약

### Fiscal period

FY26-27은 `2026-04-01`부터 `2027-03-31`까지다.

| Period | Months |
|---|---|
| Q1 | 4, 5, 6 |
| Q2 | 7, 8, 9 |
| Q3 | 10, 11, 12 |
| Q4 | 1, 2, 3 |

`Year = Q1 + Q2 + Q3 + Q4`로 계산한다.

### DSH

주요 지표:

- 목표: 목표 매출.
- 실적: 현재 달성 매출.
- 달성률: `실적 / 목표`.
- Gap: `실적 - 목표`.

주요 차원:

- team: `Team KR`, 필요 시 `BD`, `MKT`, `CSM`.
- owner: Han, Wangchan, Junhyuk, Gyusung, Heesung, Chanwoo/Hwang, Somang, Minjae 등.
- product_line: `software`, `hardware`.
- revenue_type: `new`, `renewal`.
- channel: `direct`, `channel`.
- period: year, quarter, month.

Rollup 규칙:

- Total = Software + Hardware.
- Software = New Direct + New Channel + Renewal Direct + Renewal Channel.
- Hardware = New Channel + Renewal Channel로 시작하되 실제 원본 규칙을 재확인한다.
- Direct = Software Direct 합계.
- Channel = Software Channel + Hardware Channel 합계.

### REV

현재 sheet grain은 `account/customer + branch/account attributes + owner + status/type + fiscal week buckets`에 가까우며 Account 단독으로 유일하지 않다. 제품화 후 canonical grain은 `ledger_line_id + fiscal_year + market`로 둔다.

MVP에서는 기존 `branch_rev_deals`를 유지한다.

기존 필드:

- `customer_name`, `branch_contact`, `team`, `manager`
- `deal_type`, `status`, `first_payment`, `product_version`, `region`, `importance`, `note`
- `contract_target`
- `monthly_payments`
- `monthly_red`
- `monthly_confirmed`
- `monthly_high_conf`
- `raw`, `synced_at`

권장 확장:

- `source_record_key`
- `source_digest`
- `snapshot_id`
- `currency`

### 입력/수정 큐

MVP의 장부 입력은 `branch_rev_deals`를 직접 수정하지 않는다. 운영자는 `branch_sales_ledger_drafts`에 신규 행 또는 수정 초안을 저장하고, 체크 완료 상태를 거친 뒤 apply 단계에서 `branch_sales_ledger_entries` 내부 원장 엔트리로 반영한다. 이 엔트리는 운영 화면의 `장부 반영` 레이어이며 recognized revenue 또는 REV 원본 캐시 변형이 아니다.

필수 계약:

- `kind`: `new-row` 또는 `edit-row`.
- `status`: `draft`, `checked`, `applied`, `cancelled`.
- `ledger_month`: `YYYY-MM`.
- `source_deal_id`, `source_sheet_row`, `source_snapshot`: REV 행이 sync 이후 이동해도 검토 맥락을 보존한다.
- `created_by`, `updated_by`, `checked_by`, `applied_by`: 관리자 actor를 남긴다.
- `applied` 전환은 `checked` 상태의 초안에 대한 명시적 apply 액션으로만 가능하다.
- `branch_sales_ledger_entries`: 적용된 초안의 독립 내부 원장. `draft_id`, `entry_type`, `entry_status`, 원본 row snapshot, 금액, 월, actor, metadata를 보존한다.

색상 기반 의미는 데이터 상태로 승격한다.

| 원본 의미 | 제품 의미 |
|---|---|
| 빨간 글자 | 확정 금액 |
| 파란 글자 | 고확도 금액 |
| 그 외 미래 금액 | 예상 금액 |
| 과거인데 미확정 | data-quality issue |

### CRM performance read model

CRM 성과 분석은 장기적으로 `branch_rev_deals`를 직접 읽지 않고, 외부 CRM 원천을 정제한 `crm_orders` read model을 우선 사용한다. 첫 구현 범위는 `external_crm_records`의 `SalesPerformance__c` 객체만 대상으로 하며, 다른 외부 객체와의 dedupe, FX conversion, recognized revenue 승격은 별도 reconciliation 이후로 둔다.

`branch_rev_deals`는 CRM 성과 숫자의 fallback/supporting source로 남기고, API는 어떤 source가 사용됐는지와 fallback warning을 명시해야 한다.

### KPI

Revenue metrics:

- 합계
- 신규
- 갱신

Activity metrics:

- 리드
- 계정
- 기회
- 제안
- 방문

KPI Gap은 `실적 - 목표`다. 값이 비어 있는 셀은 원본 보존을 위해 null로 저장하고, 합산 시에는 0처럼 처리한다.

## 6. 화면 요구사항

### DSH - 운영 현황

- 상단 KPI: FY 목표, 실적, 달성률, Gap, 신규, 갱신, SW/HW split.
- 월/분기 pacing: Q1-Q4, fiscal month 4-3.
- Breakdown table: SW/HW, 신규/갱신, 직접/채널.
- Attention panel: 가장 큰 Gap, 50% 미만 달성률, 이번 달 활동 없음, 갱신 위험.
- 셀/카드 클릭 시 REV filtered view로 이동.

### REV - 매출 장부

- dense table-first 화면.
- sticky first columns: Account, Branch, Region, Manager, Status, Type.
- fiscal months/weeks는 가로 스크롤.
- 필터: fiscal year, quarter/month, team, manager, product, type, channel, status, account search.
- row drawer: account summary, monthly history, owner, notes, change history, related KPI impact, CRM match.
- 입력/수정 rail: 선택 행 기반 수정 초안, 신규 입력, 체크 큐, 큐 검색, 상태 필터, 기존 초안 재편집, 체크 완료 초안 적용, 서버 저장 상태, 로컬 fallback 상태.
- validation status와 오류 tooltip.

### KPI - 활동 KPI

- View: 목표 / 실적 / Gap.
- Period: FY / Quarter / Month.
- Metric group: 매출 / 활동.
- matrix rows: 합계와 담당자.
- columns: 합계, 신규, 갱신, 리드, 계정, 기회, 제안, 방문.
- heatmap mode와 largest-gap sort.
- manager row 클릭 시 detail drawer와 filtered REV link.

## 7. 검증과 체크

최소 checks:

- DSH 목표/실적 합계가 기간 rollup과 일치한다.
- KPI Gap = 실적 - 목표.
- REV 월 합계가 주차 합계와 일치한다.
- REV FY 합계가 월 합계와 일치한다.
- 필수 필드 누락: account, manager, team, status, type, product, period, amount.
- manager/team mismatch.
- duplicate account-period ledger line.
- closed period에 forecast가 존재하는 경우.
- 과거 월 미확정 금액.
- CRM 매칭 없는 REV 금액과 건수.
- DSH actual과 KPI actual의 차이. 스크린샷 기준 Team KR actual 합계가 서로 다르게 보이므로 source-of-truth 규칙 확정 전까지 warning으로 노출한다.

## 8. 권한

- Read: 기존 `BRANCH_READ_ADMIN_API_ROLES` 범위(`SUPER_ADMIN`, `ADMIN`, `BRANCH`)를 따른다.
- Sync / source-link confirm / import: 별도 결정 전까지 `SUPER_ADMIN`, `ADMIN`만 허용한다.
- DB write: 서버에서 `createSupabaseAdminClient()`를 통해 수행한다.
- Admin API는 `verifyAdmin()` 또는 `requireVerifiedAdminContext()`를 사용한다.
- 사람의 판단이 남는 mutation은 actor를 기록한다.

## 9. 품질 게이트

기본:

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

집중 검증:

```bash
npx vitest run tests/branch/parsers tests/branch/computations
```

DB/계약을 건드릴 때 추가:

- migration에 RLS, revoke/grant, service role RPC 권한 포함.
- REV full replace 후 confirmed source link reattach 유지.
- `/api/admin/branch/sync` invalid sources, invalid month, unauthorized sync 테스트.
- `crm_orders` importer와 `/api/admin/crm/performance` source fallback 테스트.
- cron 변경 시 `npm run check:vercel-crons`.

## 10. 열린 결정

1. FY26-27 금액 통화가 CNY인지 KRW인지 확정해야 한다. 기존 코드와 문서에는 CNY 표현이 섞여 있다.
2. `Acc.`, `Sol.`의 정확한 의미를 운영자에게 확인해야 한다.
3. DSH와 KPI actual 차이의 원천과 포함/제외 규칙을 정해야 한다.
4. DSH/KPI를 언제 DB-backed table로 승격할지 결정해야 한다.
5. Branch role에게 manual sync 권한을 줄지 결정해야 한다.
6. REV 장부의 장기 grain을 normalized ledger entries로 옮길지, `branch_rev_deals` wide snapshot을 계속 유지할지 결정해야 한다.
## 11. 2026-07-01 DB-native amendment

핵심 결정: `1. DSH`, `2. REV`, `3. KPI`는 더 이상 매 요청마다 Google Sheet를 참고하는 read-through 구조가 아니라, import source를 DB에 적재한 뒤 최신 성공 import를 운영 정본으로 읽는다. Google Sheet/CSV/XLSX는 source input이고, Admin 화면의 권위 있는 숫자는 DB active import에서 온다.

추가된 MVP 산출물:

- `sales_ledger_import_runs`: import 1회 단위, parser version, checksum, row counts, validation counts, actor, status.
- `sales_ledger_source_files`: DSH/REV/KPI 파일별 sha256, row count, header hash.
- `sales_ledger_import_snapshots`: normalized payload append-only audit.
- `sales_ledger_active_sources`: fiscal year + tab별 최신 active import pointer.
- `branch_dsh_rows`, `branch_kpi_rows`, `branch_rev_lines`, `branch_rev_period_entries`: 3개 탭의 DB-native typed row tables.
- `sales_ledger_validations`: parity, duplicate, missing owner, CSV format gap 같은 data-quality issue.
- `scripts/import-sales-ledger-files.mjs`: 첨부 CSV 3개를 dry-run payload로 만들고, `--commit` 명시 시 Supabase DB에 적재하는 importer.

운영 규칙:

- DB read 우선순위는 active DB import -> last known compatible fallback -> Sheet/file import source다. fallback이 사용되면 화면에 명시한다.
- 로컬 fallback draft는 임시 보관일 뿐 `장부 반영` 금액에 포함하지 않는다.
- `edit-row`는 additive row가 아니다. replacement/delta 계약이 구현되기 전까지 확정 매출 합계에 더하지 않는다.
- `applied` draft와 ledger entry는 불변이다. 수정은 reversal/new entry workflow로만 처리한다.
- `SECURITY DEFINER` RPC는 `service_role` 전용으로 제한한다.
