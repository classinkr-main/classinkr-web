# Admin 3.0 매출시트 워크스페이스 기획

기준 시점: 2026-06-29

상태: 실행 초안 - 별도 매출시트 탭 1차 구현 반영

관련 기준:
- [crm-sheet-revenue-sync-plan.md](./crm-sheet-revenue-sync-plan.md)
- [erp-blueprint-2026-06-22.md](./erp-blueprint-2026-06-22.md)
- [internal-crm-backend-operating-plan-2026-06-26.md](./internal-crm-backend-operating-plan-2026-06-26.md)
- [partner-portal-redistribution-plan-2026-06-26.md](./partner-portal-redistribution-plan-2026-06-26.md)

## 1. 결정

REV 시트는 계속 별도 문서로 옮겨 다니며 보는 장부가 아니라, Admin CRM 안의 별도 **매출시트** 운영 탭으로 승격한다.

단, 현재 `branch_rev_deals`는 Google Sheet에서 온 동기화본이므로 바로 최종 재무 원장으로 선언하지 않는다.

운영 순서:
1. 기존 REV 시트 동기화본을 `/admin/crm/deals/rev-sheet`에서 운영자가 직접 본다.
2. `crm_source_links`로 고객, 거래, 외부 CRM, 리드와 연결한다.
3. 커버리지와 중복 위험이 보일 때까지 앱 매출, 외부 CRM, REV 금액은 합산하지 않고 병기한다.
4. 다음 단계에서 app-owned revenue ledger를 추가해 신규 입력과 수정 책임을 Admin 쪽으로 옮긴다.

## 2. 현재 구현

1차 구현은 새 DB 테이블 없이 읽기/운영 표면만 추가한다.

| 영역 | 파일 | 역할 |
| --- | --- | --- |
| 서버 read model | [../../lib/admin-crm-revenue-sheet.ts](../../lib/admin-crm-revenue-sheet.ts) | `branch_rev_deals`와 `crm_source_links`를 묶어 매출시트 워크스페이스 데이터 생성 |
| API | [../../app/api/admin/crm/revenue-sheet/route.ts](../../app/api/admin/crm/revenue-sheet/route.ts) | 관리자 인증 후 매출시트 워크스페이스 반환 |
| UI | [../../app/admin/crm/deals/rev-sheet/page.tsx](../../app/admin/crm/deals/rev-sheet/page.tsx) | 별도 매출시트 탭, 월별 흐름, 팀/담당자 요약, 행 테이블, 동기화/매칭 액션 |
| 내비게이션 | [../../components/admin/crm/CrmSubnav.tsx](../../components/admin/crm/CrmSubnav.tsx) | 돈흐름 하위 탭에 `매출시트` 추가 |

이 탭에서 가능한 일:
- REV 동기화 실행 (`POST /api/admin/branch/sync`, `sources: ["rev"]`)
- REV 행 기준 매칭 후보 생성
- 확정, 임박, 예정, 전환 대기 금액 분리
- 팀/담당자별 매출시트 분해
- 미매칭 행을 `/admin/crm/matching`으로 보내 연결

## 3. 데이터 책임

현재:
- `branch_rev_deals`: REV 시트 동기화본, full-replace staging
- `crm_source_links`: REV 행과 고객/거래/외부 원천을 연결하는 identity layer
- `deals`, `quote_documents`, `payments_v2`, `receipts_v2`: 거래/문서/수납 원천
- `external_crm_records`: 외부 CRM snapshot

다음:
- `crm_revenue_import_runs`: 매출시트 import 실행, checksum, 원천, actor, 결과
- `crm_revenue_entries`: 앱이 소유하는 normalized revenue fact
- 선택적으로 `crm_revenue_entry_months`: 월별 스케줄을 row로 쪼개 분석 성능과 감사성을 확보

권장 `crm_revenue_entries` 필드:
- `id`
- `source_system`: `branch_rev_sheet`, `admin_manual`, `quote_document`, `payment`, `external_crm`
- `source_record_key`
- `source_row_hash`
- `import_run_id`
- `target_type`, `target_id`
- `customer_label`
- `team`, `manager`, `owner_key`
- `product_family`
- `amount_native`, `currency`
- `period_month`
- `revenue_status`: `confirmed`, `high_confidence`, `expected`, `past_unconfirmed`, `paid`, `void`
- `confidence`
- `raw`
- `created_at`, `updated_at`

## 4. 단계별 로드맵

### Phase 0 - 별도 탭 운영화

- [x] `/admin/crm/deals/rev-sheet` 별도 탭 추가
- [x] 매출시트 API/read model 추가
- [x] REV 동기화와 매칭 후보 생성 액션 연결
- [x] 월별, 팀별, 담당자별 분해와 행 테이블 노출

### Phase 1 - import 안전장치

- [ ] `crm_revenue_import_runs` 추가
- [ ] REV 동기화 시 원본 rows checksum, row count, actor, trigger 저장
- [ ] 하드웨어 시트 snapshot 패턴처럼 destructive replace 전후를 감사 가능하게 보존
- [ ] row movement에 대비해 `sheet_row`만이 아니라 row hash 기반 source key를 병행

### Phase 2 - app-owned revenue ledger

- [ ] `crm_revenue_entries` 또는 materialized read model 추가
- [ ] `branch_rev_deals`에서 월별 스케줄 row를 정규화
- [ ] 확정/임박/예정/전환 대기를 상태값으로 저장
- [ ] `crm_source_links` 확정 링크를 target ref로 복사하되, 원천 링크 변경 시 재계산 가능하게 유지

### Phase 3 - 자체 입력 UI

- [ ] 매출시트 행 생성/수정 drawer 추가
- [ ] 금액 월별 스케줄 편집
- [ ] 수정 전후 audit log 저장
- [ ] Google Sheet는 import/export-only로 강등

### Phase 4 - CRM/견적/정산 통합

- [ ] `quote_documents` accepted version과 매출 entry 연결
- [ ] `payments_v2`/`receipts_v2` 수납 상태와 과거 예정 미확정 경보 연결
- [ ] 하드웨어 `hardware_movements.reference_no`와 deal/quote ref 연결
- [ ] 소프트웨어 checkout order를 Admin 매출시트에 표시

### Phase 5 - 통계/자동화

- [ ] 커버리지: 매칭 완료 금액, 미매칭 금액, 후보 금액
- [ ] forecast: 확정, 임박, 예정, 전환 대기
- [ ] owner/team attribution
- [ ] past-month expected but unconfirmed task 자동 생성
- [ ] quote accepted but contract/order missing task 자동 생성

## 5. 리스크와 원칙

- 단일 총매출은 아직 만들지 않는다. REV, 앱 거래, 외부 CRM, 수납 금액은 dedupe와 currency 정책 전까지 병기한다.
- `branch_rev_deals`는 full-replace staging이므로 app-owned 수정값을 여기에 직접 넣지 않는다.
- 행 번호 기반 source key는 시트 행 이동에 취약하다. 다음 단계에서 row hash를 병행한다.
- CNY, KRW, USD를 한 카드로 합산하려면 dated FX policy가 먼저 필요하다.
- 모든 Admin API는 `verifyAdmin()`을 통과하고, 데이터 접근은 repository/read model로 모은다.
