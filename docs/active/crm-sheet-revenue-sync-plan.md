---
title: CRM 시트 ↔ 어드민 예상 매출 싱크 기획
status: active
owner: KR Branch
last_updated: 2026-06-10
---

# CRM 시트 ↔ 어드민 예상 매출 싱크 기획

> 목적: `/admin/crm/revenue` 대시보드와 회사 CRM 시트가 실제로 어느 정도 연결되어 있는지 진단하고,
> 예상 매출(시트) ↔ 앱 기록(견적/계약/수납/딜)을 어디까지 싱크·구성할 수 있는지 단계별로 정의한다.
>
> 관련 문서: [architecture-schema-erd.md](architecture-schema-erd.md), [neo-crm-integration-request.md](neo-crm-integration-request.md), [branch-dashboard-development-log.md](branch-dashboard-development-log.md)

---

## 1. 현재 연결 상태 진단 (As-Is)

> 2026-06-10 업데이트: Phase 0 읽기 연결은 현재 작업 트리에 반영되어 있다. 이 문서의 1장은 최초 진단 기록으로 보존하고,
> 실제 현황 판단은 아래 "작업 항목 체크리스트"와 [korean-crm-admin-integration-plan-2026-06-10.md](korean-crm-admin-integration-plan-2026-06-10.md)를 함께 본다.

### 1-1. `/admin/crm/revenue`의 "회사 시트" 소스 = 플레이스홀더 (연결 0%)

- [lib/admin-crm-revenue.ts](../../lib/admin-crm-revenue.ts)의 `crm_sheet` 소스는 `CRM_SHEET_ID` 또는
  `GOOGLE_SHEETS_CRM_SPREADSHEET_ID` 환경변수 존재 여부만 검사해 상태 카드를 표시한다.
- 두 변수 모두 현재 미설정이며, **설정하더라도 시트를 읽는 코드가 없다.** `mode: "planned"` 고정,
  `recordCount: 0`. 즉 UI상 상태 표시용 자리만 잡아둔 상태.
- `company_crm`(회사 CRM API) 소스도 동일한 플레이스홀더. Neo CRM 연동은
  [neo-crm-integration-request.md](neo-crm-integration-request.md) 협의안 단계.

### 1-2. 그런데 시트 데이터는 이미 다른 경로로 DB에 들어오고 있음 (브랜치 파이프라인)

- [lib/branch/sync/sync-rev.ts](../../lib/branch/sync/sync-rev.ts)가 브랜치 대시보드 시트의
  `'2. REV'` 탭(A1:CF400)을 파싱해 Supabase `branch_rev_deals` 테이블로 **full-replace 동기화** 중.
- 트리거: `POST /api/admin/branch/sync` (수동), `verifyAdmin` 가드, 동시 실행 잠금 + sync run 기록.
- 들어오는 필드 ([lib/branch/parsers/rev.ts](../../lib/branch/parsers/rev.ts)):
  - `customer_name`, `branch_contact`, `team`(BD/MKT/CSM 정규화), `manager`
  - `deal_type`, `status`, `first_payment`, `product_version`, `region`, `importance`, `note`
  - **`contract_target`** — 계약 목표 금액 (예상 매출의 핵심 소스)
  - **`monthly_payments`** — `{ "YYYY-MM": 금액 }` 월별 납부/예상 스케줄
  - **색 규칙 (2026-06-10 실측 검증)** — 색 글자는 월 합계 칸이 아니라 **주차(w1~w5) 칸**에 있다.
    글자색 빨강(#FF0000/#EB4336) = 확정 매출, 글자색 파랑(#0000FF) = 클로징 임박(90%+).
    월 합계는 주차 합 수식이라 한 달 안에 확정/임박/예상이 섞인다 → boolean이 아닌 **월별 금액 맵**으로 저장:
    - **`monthly_confirmed`** — `{ "YYYY-MM": 확정 금액 }` (주차 빨간 글자 합)
    - **`monthly_high_conf`** — `{ "YYYY-MM": 임박 금액 }` (주차 파란 글자 합)
    - **`monthly_red`** — 호환용 boolean (해당 월에 확정분 존재 여부). 기존 브랜치 집계가 사용
    - 색 데이터가 전혀 없는 행은 과거~당월분 전액 확정으로 간주하는 fallback 적용
    - 적용 조건: 마이그레이션 `20260610_rev_color_amounts.sql` + 시트 재동기화.
      검증 도구: `node --env-file=.env.local scripts/verify-rev-colors.mjs` (읽기 전용)
  - `raw` — 원본 행 보존
- **이 데이터가 사실상 회사 CRM 시트의 매출 데이터다.** 즉 "시트 → DB" 인프라는 이미 완성되어 있고,
  `/admin/branch` 쪽 대시보드만 소비 중이다.

### 1-3. CRM 매출 대시보드는 앱 내부 데이터만 집계

`getAdminCrmRevenueDashboard()`가 집계하는 7개 테이블 (모두 Supabase, admin client):

| 소스 | 금액 필드 | 집계 결과 |
|---|---|---|
| `quotes` (V1) | `total_amount` | quotedAmount, acceptedQuoteAmount |
| `contracts` (V1) | `total_amount` | contractedAmount |
| `receipts` (V1) | `total_amount` | paidAmount |
| `partners` (V1) | `deal_amount` | 파트너 그룹핑용 |
| `deals` (V2) | **`expected_amount`**, contracted/paid/outstanding | **expectedPipelineAmount** (active 딜 합) |
| `partner_accounts`, `customers` (V2) | — | 이름 매핑/카운트 |

- 현재 "예상 매출" = **active 상태 V2 `deals.expected_amount` 합** 단 하나.
- 월별 차트의 `expectedAmount`는 `deal.updated_at` 월에 귀속 → **시점 귀속이 부정확** (수정한 달에 잡힘).
- V1 계약/수납과 V2 딜이 동시에 존재하면 중복 집계 경고가 이미 뜨는 상태 — 시트 금액을 단순 합산하면 3중 카운팅 위험.

### 1-4. 그 외 시트 관련 연결

- 리드 캡처 → `GOOGLE_SHEET_WEBHOOK_URL` / `appendSheetRow`(`GOOGLE_SHEET_ID`): **단방향 append 전용**, 매출과 무관.
- 브랜치 KPI/인사이트 API들은 시트를 직접 읽지만 CRM 대시보드와 분리되어 있음.

### 진단 요약

> **"CRM 시트 ↔ 어드민 CRM 매출" 직접 연결은 0%.**
> 하지만 시트 데이터는 이미 `branch_rev_deals`로 DB 안에 들어와 있어,
> **새 Google API 연동 없이 DB 조인만으로 1차 싱크가 가능**한 상태다.
> 빠진 것은 (1) CRM 대시보드에서 `branch_rev_deals`를 읽는 코드, (2) 시트 고객 ↔ 앱 파트너/딜 매칭 키.

---

## 2. 싱크 가능성 평가 (얼마나 구성할 수 있는가)

| 항목 | 가능성 | 근거 |
|---|---|---|
| 시트의 고객/팀/담당/상태/계약목표/월별 스케줄을 CRM 대시보드에 표시 | **즉시 가능** | 이미 `branch_rev_deals`에 존재. 읽기 쿼리 1개 추가 |
| 월별 예상 매출 시계열 | **즉시 가능 + 품질 향상** | `monthly_payments`가 이미 `YYYY-MM` 키 → 현행 `updated_at` 귀속보다 정확 |
| 확정/예상 매출 구분 | **즉시 가능** | `monthly_red`(빨간 셀=확정) 기준으로 확정 vs 예상·목표 분리 집계 |
| 확정 전환 대기 리스크 | **즉시 가능** | 과거 월의 비확정 예정액을 risks 배열에 합류 |
| 시트 고객 ↔ 앱 파트너/딜 매칭 | **매핑 테이블 필요** | 시트는 `customer_name` 문자열, 앱은 uuid. 이름 정규화 자동 후보 + 수동 확정 필요 |
| 예상(시트) vs 실적(앱 수납) 갭 분석 | **매칭 후 가능** | 매칭률에 비례해 커버리지 증가 |
| 시트 ↔ 앱 양방향 쓰기 | **비권장(현 단계)** | 기존 원칙 유지: "앱 DB가 기준, 시트는 보조 소스" — full-replace 싱크 구조상 역방향 쓰기는 충돌 위험 |

핵심 정책 (기존 코드 주석의 원칙 유지):
- **앱 DB = source of truth, 시트 = 운영팀 입력/검수 보조 소스.**
- 시트 금액과 앱 금액은 **합산하지 않고 나란히 비교**한다 (중복 집계 방지).

---

## 3. 단계별 실행 계획 (To-Be)

### Phase 0 — 읽기 연결 (코드만, 마이그레이션 불필요)

1. `getAdminCrmRevenueDashboard()`에 `branch_rev_deals` 쿼리 추가 (기존 `runQuery` 패턴 재사용).
2. `crm_sheet` 플레이스홀더 소스를 실데이터 소스로 교체:
   - `recordCount` = branch_rev_deals 행 수, `lastSyncedAt` = 최근 sync run 시각 (`branch-sync` 저장소 재사용).
3. 요약 카드 추가: 시트 확정 매출(빨간 글자 합) / 확정 임박 90%+(파란 글자 합) /
   시트 예상·목표(당월~미래 무표시 합) / 확정 전환 대기(과거 월 무표시 합).
   계약 목표 총액(Σ `contract_target`)은 섹션 캡션에 표기.
   기존 `expectedPipelineAmount`(앱 파이프라인 기준)와 **별도 카드로 병기** — 합산 금지.
4. 월별 차트에 `sheetConfirmedAmount`(확정) / `sheetHighConfidenceAmount`(임박) / `sheetExpectedAmount`(예상) 라인 추가.
5. 과거 월 비확정 예정액을 risks 패널에 합류 ("시트 과거 예정액 미확정" 사유).
6. CRM 매출 페이지에 "시트 동기화" 버튼 노출 → 기존 `POST /api/admin/branch/sync` (`sources: ["rev"]`) 호출.

검증: `npx eslint app components lib --max-warnings=0` + `npm run build`.

### Phase 1 — 매칭 레이어 (마이그레이션 1개)

1. 마이그레이션: `crm_sheet_matches` 테이블
   - `sheet_customer_name (정규화 키)` ↔ `partner_account_id | customer_id | partner_id(V1)` + `confirmed_by`, `confirmed_at`
   - **DB 스키마 변경이므로 마이그레이션 파일 필수 작성** (`supabase/migrations/`).
2. 자동 후보 생성: 이름 정규화(공백/법인 접미사 제거) 후 exact/부분 일치 → "후보" 상태로 저장.
3. 어드민 확정 UI: `/admin/crm/revenue` 하단에 "미매칭 시트 고객 N건" 패널 → 드롭다운으로 파트너/고객 연결.
4. 매칭된 건에 대해 **정합성 패널**: 시트 `contract_target` vs 앱 deal `expected_amount` / contracted 차이 표시
   → 어느 쪽 입력 누락인지 바로 식별.

### Phase 2 — 예상 매출 고도화

1. 월별 예상 매출의 기준을 시트 `monthly_payments`로 승격 (앱 딜은 보조 라인).
2. (옵션) 단계 가중 파이프라인: V2 딜 `current_stage`별 가중치(contact 10% → contract 60% → confirmed 90%)를
   적용한 가중 예상 매출 카드. 가중치는 설정에서 조정 가능하게.
3. 예상 vs 실수납 갭 추적: 매칭 건에 한해 `monthly_payments[과거 월]` − receipts/deal paid 비교 → 미수 경보.

### Phase 3 — 외부 연동 (별도 트랙)

- Neo CRM API 연동은 [neo-crm-integration-request.md](neo-crm-integration-request.md) 협의 결과에 따라 진행.
- `external_crm_sync_runs`, `external_crm_records`, `crm_write_requests` 스키마는 2026-06-10 선반영.
- `/admin/crm/revenue`의 `Xiaoshouyi CRM Snapshot` 소스 카드는 snapshot 테이블 상태를 읽는다.
- `/api/admin/crm/external-sync` 수동 sync와 `/api/cron/sync-external-crm` cron endpoint가 준비됐다.
- credential이 없으면 `skipped` sync run만 남기고 외부 호출은 하지 않는다.
- 시트 역방향 쓰기(앱 → 시트)는 full-replace 싱크와 충돌하므로 도입하지 않음. 필요 시 별도 export 탭으로 분리.

---

## 4. 작업 항목 체크리스트

### Phase 0
- [x] `lib/admin-crm-revenue.ts`: `branch_rev_deals` 쿼리 + 시트 요약/월별/리스크 집계
- [x] `lib/admin-crm-revenue-types.ts`: `sheetExpectedAmount`, 시트 소스 필드 추가
- [x] `app/admin/crm/revenue/page.tsx`: 카드/차트 라인/동기화 버튼
- [x] 소스 카드: planned 플레이스홀더 → 실데이터 상태로 교체
- [x] `app/api/admin/branch/sync/route.ts`: `sources: ["rev"]` 부분 동기화 지원
- [x] CRM shell: revenue subnav 중복 제거 및 active route 정리

### Phase 1
- [x] `supabase/migrations/`: `crm_source_links` identity/link 테이블 (마이그레이션 필수)
- [x] `/admin/crm/revenue`: `crm_source_links` 상태 카드 + REV 정합성 패널
- [x] `lib/repositories/crm-source-links.ts` (admin client 사용)
- [x] 자동 매칭 후보 생성 로직 + API (`app/api/admin/crm/source-links/generate` + `verifyAdmin`)
- [x] 후보 row 확정/제외 처리 API + `/admin/crm/revenue` 액션 UI
- [x] 미매칭 행에서 임의 고객/거래 검색 후 수동 후보 생성 UI

### Phase 2
- [ ] 월별 예상 매출 기준 전환 + 가중 파이프라인(옵션)
- [ ] 예상 vs 실수납 갭 경보

---

## 5. 추가 싱크 후보 — HW 시트 및 REV 잔여 항목 (2026-06-10 분석)

HW 시트는 `sync-hw`가 이미 4종 테이블로 동기화 중이다 ([lib/branch/sync/sync-hw.ts](../../lib/branch/sync/sync-hw.ts),
[lib/branch/parsers/hw.ts](../../lib/branch/parsers/hw.ts)):

| 테이블 | 원본 탭 | 주요 필드 | 현재 소비처 |
|---|---|---|---|
| `branch_hw_inbound` | 2.입고 현황 | 일자, 제품, 수량, **단가, 매입금액**, 시리얼, 보관처, 수입자 | `/api/admin/branch/hw` (수량만) |
| `branch_hw_outbound` | 3.출고 현황 | 일자, 담당, 제품, 수량, **`revenue`(출고 매출)**, **`destination`(납품처)**, 시리얼, `progress`(배송 예정 색 감지), 유형 | 진행상태 카운트·설치 고객만 |

> 2026-06-10 재고 해석 수정: `/api/admin/branch/hw`가 "예정" 출고 행을 완료 출고와 분리해서
> **실재고(입고−완료출고) / 출고 예정 / 가용 재고(실재고−예정)** 3단으로 반환하도록 변경.
> 재고 부족 판정도 가용 재고 기준으로 전환 (출고 예정 물량이 재고처럼 보이던 문제 해결).
| `branch_hw_stock` | 재고현황 | 제품, 카테고리, 수량(+물류처별) | 재고 부족 알림 |
| `branch_hw_sales_monthly` | 판매대시보드 | 회계연도/월, 제품, 판매 수량 | 월별 판매량 |

### CRM 매출 대시보드로 끌어올 가치가 있는 것 (UI/UX 판단 포함)

1. **출고 `revenue` = 실제 HW 매출 — 현재 아무 화면에도 금액으로 표시되지 않음.** (우선순위 1)
   - 월별 차트에 "HW 출고" 라인 1개 추가 또는 시트 섹션에 "HW 출고 매출(기간)" 카드.
   - `destination`(납품처)이 REV 시트 `customer_name`·앱 고객과 텍스트로 겹치므로 Phase 1 매칭 테이블을
     셋이 공유하면 고객별 SW+HW 통합 매출 뷰가 가능해진다.
2. **`progress` = "배송 예정" 출고 건** — 단기 확정 직전 매출 신호. (우선순위 2)
   - "예정 출고 N건 · 금액" 카드 또는 리스크/예정 패널에 합류. 색 감지(`planned_by_color`)가 이미 파서에 있음.
3. **입고 단가/금액(매입)** — 매출이 아니라 원가. CRM 매출 페이지에는 **비권장**.
   마진 분석이 필요해지면 별도 "수익성" 뷰로 분리 (출고 revenue − 입고 amount, 제품 매칭 필요).
4. **재고/판매수량** — `/admin/branch`가 이미 담당. CRM 페이지에 중복 표시하지 않는다 (수량 지표는 매출 대시보드의
   정보 밀도만 해친다).
5. **REV 잔여 컬럼 (team/manager/region/importance/deal_type/product_version)** — 이미 DB에 있음.
   - 추천: "팀별 확정/예상" 미니 분해(BD/MKT/CSM 3행) 정도만 CRM에 추가, 담당자·지역 드릴다운은
     `/admin/branch` 파이프라인 뷰에 위임.

### UI/UX 원칙

- CRM 매출 페이지는 **금액 단위 지표만** (수량·물류·활동 지표는 `/admin/branch`).
- 시트 유래 금액은 항상 "시트" 라벨로 구분하고 앱 집계와 합산하지 않는다 (매칭 완료 전까지).
- 한 섹션에 카드 4개 그리드 유지, 차트 라인은 7개를 상한으로 본다 (현재 6개: 견적/계약/입금/예상/시트확정/시트예상).

## 6. 리스크 / 결정 필요 사항

| 항목 | 내용 | 제안 |
|---|---|---|
| 중복 집계 | 시트 금액 + 앱 V1 + V2 딜 3원천 | 합산 금지, 병기·비교만. 단일 "총 예상 매출"은 매칭 완료 후 dedupe 기준으로만 산출 |
| 시트 구조 변경 | `'2. REV'` 탭 열 이동 시 파서 깨짐 | 기존 parser 단위 테스트 + data-quality 경고 활용 |
| 이름 매칭 한계 | 동명 고객/지점 표기 차이 | 자동 매칭은 후보까지만, 확정은 항상 수동 |
| 예상 매출 정의 | contract_target vs monthly 합 vs 딜 expected | 카드에 산출 기준 라벨 명시, 운영팀과 단일 정의 합의 필요 |
| 시트 sync 주기 | 현재 수동 트리거 | Phase 0에서는 수동 유지, 이후 cron(`CRON_SECRET`) 검토 |
