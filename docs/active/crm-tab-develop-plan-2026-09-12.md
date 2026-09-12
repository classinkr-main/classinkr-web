# CRM 탭 디벨롭 기획 (2026-09-12)

상태: 현재 기준 CRM 실행 로드맵
범위: `/admin/crm` 전체(현황·고객DB·기록·입력함·검수 5작업면 + 돈흐름 하위 화면), `app/api/admin/crm/**`, `lib/crm/**`, `lib/admin-crm-*.ts`, `lib/external-crm/**`, `lib/repositories/crm-*.ts`
정책 상위 문서: [Admin OS 운영 결정](admin-os-operating-decisions-2026-07-11.md) › [어드민 탭 재구성](admin-tab-restructure-2026-07-29.md) › [그로스 플레이북](playbook/04-growth-crm.md) › [네오CRM 되밀기 지침](neocrm-writeback-guide-2026-09-07.md)
조사 방식: 5개 영역(홈·큐·인사이트 / 고객DB / 기록·입력함·검수·되밀기 / 돈흐름·데이터층·품질 / 정책·IA·문서)을 병렬로 코드 대조. 근거는 파일:라인으로 남겼고, 코드로 확인 못 한 것은 "추정"으로 표시했다.

---

## 0. 한 줄 요약

CRM 탭은 5작업면 IA, 우선순위 큐, 고객 360, 입력함, 매칭 인박스, 승인 큐 API까지 골격이 다 있다. 그런데 **입력 → 검수 → 기록 → 되밀기로 이어지는 운영 루프가 중간중간 끊겨 있고**(열 매핑 확인 없음, 후보 선택 없음, 기록 수정·연결 없음, 되밀기 초안 호출자 0), **데이터 계층은 "매 요청 전량 로드 후 메모리 계산" 구조가 그대로**다. 이번 디벨롭은 새 화면을 늘리지 않고 ① 끊긴 루프를 잇고 ② 정책 위반을 해소하고 ③ 규모가 커져도 버티는 데이터 경로로 바꾸는 데 집중한다.

## 1. 현황 진단

### 1.1 작업면별 상태

| 작업면 | 라우트 | 잘 되는 것 | 끊긴 것 |
|---|---|---|---|
| 현황 | `/admin/crm` | RSC 프리페치 3종 + Data Cache + 클라 SWR 3층 캐시, 큐 쿼터 믹스(신규2·돈2·재활성1), 리포트 아코디언 분리 | 큐 `force=1`이 서버에서 무시됨, 죽은 task 분기, owner 필터 URL 미반영, 주간 패널 100건 절단 무표시 |
| 고객DB | `/customers/{unified,leads,accounts,map,[key]}` | 리드 전량 range 조회, 콘솔/보드 전환, 지도 4레이어·지역 분배표, 360 상세 | 통합 목록 offset 페이지네이션·페이지 내 정렬, 숨긴 미확인 건수 미표시, 전환 고객 360 없음, 지역 배정표가 자동 배정에 미연결, 리드 물리 삭제 |
| 기록 | `/activity` | 컴포저→`crm_customer_events`→`crm_tasks` 자동 승격, 녹음 업로드 | 수정·취소·복구 없음, 미연결 기록을 고객에 붙일 액션 없음 |
| 입력함 | `/capture` | 배치 상태머신, 파서의 `mapping/hasHeader` 지원, 행별 실패 사유 | 열 매핑 확인 UI 없음, 다중 후보 선택 UI 없음(검토 행이 미연결로 확정됨), 이벤트 일자가 적용 시각 |
| 검수 | `/matching` | 후보 확정/제외, 커버리지 밴드, HW↔REV 대사 | '제외' 되돌리기 UI 없음(서버 경로는 존재), 수동 연결이 REV 시트 한정, 승인 큐 실행 UI가 매출 탭에만 있음 |
| 돈흐름(5면 밖) | `/deals/{,rev-sheet,orders,kpi}` | revenue 조립 Data Cache 45s + 태그 무효화 12곳 | rev-sheet 태그 무효화 0곳, orders·kpi는 파트너 포털 컴포넌트 그대로, 요약 타일 통화 기호 없음, 1,526줄 단일 파일 |

### 1.2 되밀기(네오CRM 쓰기) 루프의 실제 단계

`crm_write_requests` 상태머신(draft→approved→sent→succeeded|failed→retry)과 승인·실행 API는 동작한다. 그러나 기록·콜·데모에서 초안을 만드는 매퍼 `enqueueContactWriteback / CustomerEvent / DemoTask`의 **호출자는 테스트뿐**이다. 또 리드 출처 활동은 매퍼가 `dbcRelation26`을 빼는데 정책 `requiredCreateFields`가 그 필드를 요구해 `createCrmWriteRequest`에서 throw 된다(`lib/crm/activity-record-writeback.ts:197` vs `lib/external-crm/xiaoshouyi-write.ts:172`). 즉 "사람이 매출 탭에서 승인·실행"까지만 살아 있고, 기록에서 큐로 들어가는 입구가 없다.

### 1.3 데이터 계층

- 우선순위 큐: 소스 수집만 Data Cache 60s로 승격됐고(2026-09-04), 점수 계산·정렬·필터는 매 요청 메모리에서 재실행. `admin_crm_overview_snapshots` 마이그레이션은 있으나 코드 참조 0건.
- 인사이트 "우선 연락"은 `source:"all"`(task 포함)로 큐를 호출해 홈 큐(task 제외)와 숫자가 다르다(`lib/repositories/crm-insights.ts:86`).
- 3라운드 속도 계획에서 미승격으로 남은 CRM 경로: `crm/tasks`(3.3s 실측), `customers-neo`(60s 모듈 메모), `region-map`(단일 `.limit(5000)`), `account-master`.
- 테스트: revenue 14테이블 조립·rev-sheet 워크스페이스·partners-data·write-requests·tasks 라우트에 테스트 0건. `crm-role-matrix.test.ts`는 24개 파일만 고정.

## 2. 기획 제약 (정책 문서 발췌, 변경 불가)

1. 최상위 작업면은 현황·고객DB·기록·입력함·검수 5개 고정. 새 top-level 탭을 만들지 않는다.
2. 자체 CRM DB가 작업 정본. REV·외부 CRM은 연결 원천으로 출처·갱신 시점·매칭 상태를 상시 표시한다.
3. 외부 CRM 직접 write-back 금지. 모든 쓰기는 `crm_write_requests` 승인 큐를 거치고, 되밀기 지침을 먼저 읽는다.
4. V1→V2 마이그레이션 완료 전 양쪽 동시 쓰기·자동 추정 매핑을 새로 만들지 않는다.
5. 위험·지연·건강도는 원천 데이터 계산 신호다. 사용자가 고르는 단계가 아니다.
6. 통화(₩/$/¥)를 섞어 합산하지 않는다. 확정 `crm_source_links`만 중복 제거 후 합산한다.
7. 상태 전이는 enum + 명시 액션만. `snoozed`=미루기, 기본 재개는 다음날 09:00 KST.
8. 삭제는 취소·보관 우선. 연쇄 삭제는 강한 확인·감사·복구 없이 제공하지 않는다.
9. nav 프리셋은 UX 규칙이지 보안 경계가 아니다. 권한은 API 가드와 capability로 강제한다.
10. 전량 조회는 `range` 페이지네이션으로 끝까지 넘기고, 잘린 항목은 남은 건수를 표시한다.

## 3. 정책·설계 문서와 코드가 어긋난 지점 (총괄)

| # | 규칙 | 현재 코드 | 조치 Wave |
|---|---|---|---|
| 1 | 운영결정 §4 삭제→취소·보관·복구 | 리드·연락기록 물리 삭제(`lib/repositories/leads.ts:851`, `contact-logs.ts:111`), 기록은 삭제 경로 자체가 없음 | W2 |
| 2 | 플레이북 "숨긴 리드 건수 표시" | 통합 목록은 provisional 숨김 건수 미표시(리드 보드는 준수) | W1 |
| 3 | 플레이북 "전량 조회 range" | `lib/repositories/crm-region-map.ts:51-60` 단일 `.limit(5000)` | W2 |
| 4 | 플레이북 "잘린 항목 남은 건수" | 주간 패널 `limit=100`, `summary.total` 미사용 | W0 |
| 5 | 리드 보드 설계 §4 "blur 저장 금지" | `LeadDrawer.tsx:152-156, 540-547` onBlur 저장 | W1 |
| 6 | 지도 계획 §6 배정표→자동 배정 근거 | `lead-assignment-policy.ts:157` 하드코딩 0 | W2 |
| 7 | 되밀기 지침 §2-4 필수 필드 | 정책 `requiredCreateFields`가 describe 결과와 불일치 | W1 |
| 8 | 운영결정 §3 파트너 표면은 Admin OS로 통합 | `deals/orders`·`deals/kpi`가 포털 컴포넌트를 URL만 바꿔 렌더 | W3(결정 필요) |
| 9 | 탭 재구성 §4.2 "CRM = 기타" | `admin-nav-access.ts` 전 프리셋 상시(코드가 앞섬) | W0 문서 갱신 |
| 10 | 운영결정 §3 5작업면 | 돈흐름이 6번째 실질 섹션, 인사이트는 5면 밖 독립 라우트 | W0 문서에 위치 명시 |
| 11 | 플레이북 "확정 링크 dedup 합산" vs 매출시트 플랜 "합산 않고 병기" | 두 문서가 상충. 코드는 병기 | W0 문서 정정 |
| 12 | `CLAUDE.md`·플레이북이 `.claude/agents/` 참조 | 디렉터리 없음 | W0 |
| 13 | 미루기 기본 09:00 KST | 큐 클라이언트 `tomorrowMorningIso()`가 브라우저 로컬 시각 기준(추정) | W0 |

## 4. 개선 후보 총람

우선순위 기준: P0 = 정책 위반 또는 조용한 데이터 오류, P1 = 끊긴 운영 루프, P2 = 규모 대비 구조 부채, P3 = 편의. 규모 S(반나절~1일) · M(2~4일) · L(1주 이상, 스키마 동반).

### 4.1 현황·큐·인사이트

| ID | 제목 | P | 규모 | 스키마 | 관련 파일 |
|---|---|---|---|---|---|
| H1 | 큐 `force` 서버 관통 (라우트가 `force`를 읽어 캐시 우회) | P0 | S | X | `app/api/admin/crm/home/priority-queue/route.ts`, `lib/repositories/crm-priority-queue.ts` |
| H2 | 죽은 task 분기 제거 + 인사이트·매니저리포트 큐 호출을 `source:"customer"`로 통일 | P0 | S | X | `CrmPriorityQueuePanel.tsx`, `lib/repositories/crm-insights.ts`, `lib/repositories/crm-manager-report.ts` |
| H3 | 주간 패널 `summary.total` 노출 + 담당자 전체 옵션 | P0 | S | X | `CrmWeekAheadPanel.tsx` |
| H4 | owner 필터 `?owner=` URL 반영, 큐·주간 담당자 선택 공유 | P3 | S | X | 두 패널, `CrmHomeClient.tsx` |
| H5 | 쿼터·슬롯 분류를 문자열 매칭에서 `action` enum 기반으로 | P2 | M | X | `lib/crm/today-calls.ts`, `priority.ts` |
| H6 | 처리→다음 후보 낙관 갱신(전량 재조회 대신) | P3 | M | X | `CrmPriorityQueuePanel.tsx` |
| H7 | 우선순위 점수 스냅샷 테이블 + 상위 N 읽기(큐·인사이트·리포트 3소비처 공유) | P2 | L | **O** | 새 마이그레이션, `crm-priority-queue.ts`, `lib/crm/priority.ts`, 일 1회 cron |
| H8 | 미루기 시각 KST 고정, 인사이트 이중 패딩·action-kpis 캐시 창 SSOT | P3 | S | X | `CrmPriorityQueuePanel.tsx`, `CrmInsightsClient.tsx` |

### 4.2 고객DB

| ID | 제목 | P | 규모 | 스키마 | 관련 파일 |
|---|---|---|---|---|---|
| C1 | 통합 목록 커서 페이지네이션 + 서버 정렬 파라미터 | P0 | M | X | `lib/repositories/crm-unified-customers.ts:730-735`, `customers/unified/route.ts`, `unified/sort.tsx` |
| C2 | 통합 목록 "숨긴 미확인 N건" + 포함 토글 | P0 | S | X | `crm-unified-customers.ts:677`, `unified/CustomerSearchPanel.tsx` |
| C3 | 리드·연락기록 소프트 삭제(취소·복구·감사) | P0 | M | **O** (`leads.deleted_at` 또는 `archived` 상태) | `leads.ts`, `leads/[id]/route.ts`, `LeadsBoardClient.tsx` |
| C4 | 지역 배정표를 `automaticEvidenceReady`에 연결 | P1 | M | X | `lib/crm/lead-assignment-policy.ts`, `assignment-preview`, `bulk-assign` |
| C5 | 지도 → 통합·원천 고객 지역 드릴다운(`region` 파라미터) | P1 | S | X | `map/CrmRegionMapPanel.tsx`, `NeoCrmCustomersClient.tsx`, unified route |
| C6 | 드로어 저장 규약 정리(blur 저장 제거) | P1 | S | X | `leads/LeadDrawer.tsx` |
| C7 | 전환 고객(`customer:`) 360·태그·할 일 지원 | P2 | M | 태그 `target_type` 확인 | `crm-customer-360.ts`, `crm-customer-tags.ts`, `Customer360Drawer.tsx` |
| C8 | 보드 상태 변경 다중 경로(숫자키·카드 메뉴·DnD), 컬럼 20장 캡 문구 정정 | P2 | M | X | `leads/board/LeadsBoardView.tsx` |
| C9 | customers-neo 서버 페이지네이션, region-map range 조회 | P2 | M | X | `customers-neo/route.ts`, `crm-region-map.ts` |

### 4.3 기록·입력함·검수·되밀기

| ID | 제목 | P | 규모 | 스키마 | 외부 쓰기 | 관련 파일 |
|---|---|---|---|---|---|---|
| R1 | 되밀기 정책 필수 필드 교정(`dbcRelation26` 조건부, `ownerId/startTime/dimDepart/entityType` 필수) + 테스트 | P0 | S | X | 정책만 | `lib/external-crm/xiaoshouyi-write.ts:154-178` |
| R2 | 입력함 열 매핑 확인 단계(파서 `columnMap` 응답 노출, 사용자 확인 후 parse) | P1 | M | X | X | `CaptureInboxClient.tsx`, `capture/parse/route.ts` |
| R3 | 입력함 다중 후보 선택·수동 대상 지정(검토 행은 "전체 선택"에서 제외) | P1 | M | X | X | `CaptureInboxClient.tsx`, `CrmCustomerPicker`, `rows/[id]/route.ts` |
| R4 | 매칭 '제외' 되돌리기 버튼(→`stale`) + 리드/Neo 수동 연결 허용 | P1 | S | X | X | `matching/MatchingInboxClient.tsx:587-606`, `crm-source-links.ts` |
| R5 | 기록 편집·취소(보관)·복구 + 미연결 기록 → 고객 연결 액션 | P1 | M | `crm_customer_events.status/canceled_at` | X | `events/route.ts`(PATCH 신설), `crm-events.ts`, `CrmEventRow.tsx` |
| R6 | 기록·콜·데모에서 되밀기 초안 생성 버튼(승인 큐 경유, 실행은 관리자) | P1 | M | X | **O, 승인 큐 필수** | `lib/crm/activity-record-writeback.ts`, `events/route.ts`, `tasks/[id]/route.ts` |
| R7 | 승인 큐 패널을 검수 탭으로 이동, 출처 기록 표시 | P1 | M | `crm_write_requests.source_ref`(선택) | X | `deals/page.tsx:1062-1230`, `matching/page.tsx` |
| R8 | 입력함 이벤트 일자=행사 시작일, `sourceType` 기본 스코프 재검토 | P2 | S | X | X | `capture/apply.ts:175-176`, `crm-events.ts:34` |
| R9 | 어드민→네오 ownerId 매핑, 전화 국제표기 변환 | P2 | M | `admin_profiles` 매핑 필드 | X | `owner-names.ts`, `lib/crm/phone.ts` |
| R10 | 큐 `depends_on`·순차 실행(리드 생성→활동) | P2 | L | **O** | 실행 시 | `xiaoshouyi-write.ts`, `execute/route.ts` |

### 4.4 돈흐름·데이터층·품질

| ID | 제목 | P | 규모 | 스키마 | 관련 파일 |
|---|---|---|---|---|---|
| D1 | REV 스냅샷 캐시 태그 무효화 배선(`REVENUE_SHEET` 태그) | P0 | S | X | `app/api/admin/branch/sync/route.ts`, `lib/admin-crm-revenue-sheet.ts`, `source-links/*` |
| D2 | 매출 요약 타일 통화 기호·출처 칩(`money-format.ts` 재사용) | P0 | S | X | `app/admin/crm/deals/page.tsx` |
| D3 | role-matrix 테스트를 CRM 63핸들러 전체로 확장, `map-source POST` 역할 명시 | P0 | S | X | `tests/admin/crm-role-matrix.test.ts`, `map-source/route.ts` |
| D4 | revenue 조립·rev-sheet 워크스페이스 단위 테스트 | P1 | M | X | `tests/admin/`, `lib/admin-crm-revenue*.ts` |
| D5 | `crm/tasks`·`customers-neo`·`partners-data`·`portal/overview` Data Cache 승격 | P1 | M | X | 해당 라우트·빌더, 3라운드 패턴 |
| D6 | `deals/page.tsx` 분할(요약/시트 대조/외부 스냅샷/쓰기 큐) | P2 | M | X | `app/admin/crm/deals/page.tsx` |
| D7 | 구경로 링크 생성기 정리 후 `partners/*`·`revenue` redirect 스텁 축소 | P2 | S | X | `lib/crm/rev-sync-health.ts:105`, `crm-route-labels.ts`, `admin-nav.ts` |
| D8 | app-owned revenue ledger Phase 2 착수 판단(`branch_sales_ledger_entries` 재사용 vs `crm_revenue_entries` 신설) | P2 | L | **O** | 결정 후 착수 |
| D9 | NEO `crm_orders` 적재 PRD 재판정(폐기 또는 착수) | P2 | L | **O** | 결정 후 착수 |

## 5. 실행 로드맵 (4 Wave)

각 Wave는 독립 배포 가능하고, Wave 안의 항목은 파일 겹침이 없도록 나눴다. 완료 조건은 §7.

### Wave 0 — 정리·저비용 수리 (스키마 없음, 약 1주)

목표: 조용한 오류와 정책 위반 중 하루 안에 닫히는 것을 먼저 닫고, 문서 기준을 하나로 만든다.

- 코드: H1, H2, H3, H8, C2, C6, R1, R4, D1, D2, D3
- 문서: §3의 9·10·11·12 정정. 탭 재구성 문서에 CRM 상시 배치 현실 반영, 운영 결정에 돈흐름·인사이트 위치 명시, 플레이북 "합산" 문구를 "확정 링크만 합산, 미확정은 병기"로 정정, `CLAUDE.md`·플레이북의 `.claude/agents/` 참조를 실제 상태에 맞춤(디렉터리 생성 또는 참조 제거).
- 문서 아카이브: §9 참고.

### Wave 1 — 입력→검수→기록→되밀기 루프 완성 (약 2~3주)

목표: 마케팅·영업이 붙여넣기부터 네오CRM 반영까지 화면 안에서 끝낼 수 있게 한다.

- 입력함: R2 → R3 → R8 (순서 의존: 열 매핑이 먼저 맞아야 후보 선택이 의미 있음)
- 기록: R5 (PATCH·상태 컬럼 마이그레이션 동반)
- 되밀기: R6 → R7 (초안 생성 입구가 생긴 뒤 큐 패널을 검수로 옮긴다)
- 고객DB: C4, C5
- 외부 쓰기 경계: R6는 초안 생성까지만. 승인·실행 권한은 현행(`STAFF_ADMIN_API_ROLES`) 유지. 되밀기 지침 §8 확인 3·4(리드 groupId, 실제 생성 시험)는 R6 배포 전 운영 환경에서 완료돼야 한다.

### Wave 2 — 고객DB·홈 구조 부채 (약 2~3주)

- C1(커서 페이지네이션), C3(소프트 삭제, 마이그레이션 동반), C7, C8, C9
- H5, D4, D5, D6, D7
- 이 Wave부터 `LeadsBoardClient.tsx`(1,910줄)·`Customer360Drawer.tsx`(1,278줄)·`deals/page.tsx`(1,526줄)는 기능 추가 전 분할을 먼저 한다.

### Wave 3 — 데이터 계층·스키마 (결정 후 착수)

- H7 점수 스냅샷 테이블(일 1회 cron, `vercel.json` 하루 1회 규칙 준수)
- R9, R10
- D8, D9 (§6 결정 필요)
- `/deals/orders`·`/deals/kpi`의 포털 컴포넌트 의존 해소(§6 결정 필요)

## 6. 사용자 결정이 필요한 항목

아래는 코드로 답이 안 나오는 제품·운영 결정이다. 결정 전까지 해당 항목은 착수하지 않는다.

1. **돈흐름의 IA 위치**: 5작업면 밖 6번째 섹션으로 정식 인정할지, 검수 하위로 편입할지. 현재는 1차 탭 없이 홈 match에 숨어 있다.
2. **`/deals/orders`·`/deals/kpi`**: 파트너 포털 컴포넌트를 Admin OS 화면으로 재구현할지(운영 결정 §3), 당분간 임베드로 둘지.
3. **매출 원장 Phase 2**: `branch_sales_ledger_entries` 재사용 vs `crm_revenue_entries` 신설(D8).
4. **NEO `crm_orders` 적재 PRD**: 코드 0건. 폐기 선언할지 착수할지(D9).
5. **리드 삭제 정책**: 소프트 삭제 방식(`deleted_at` 컬럼 vs `archived` 상태 enum)과 복구 기간.
6. **되밀기 초안 자동 생성 범위**: 기록 저장 시 자동으로 초안을 만들지, 버튼으로만 만들지(R6). 자동이면 승인 큐가 빠르게 쌓인다.
7. **문서 아카이브 승인**: §9 목록.

## 7. 검증·완료 조건

모든 Wave 공통:

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
npx vitest run tests/crm tests/admin/crm-role-matrix.test.ts
```

추가 게이트:

- 리드 저장소 변경(C1·C3·C9): `npx vitest run tests/repositories/leads-pagination.test.ts tests/repositories/leads-mode.test.ts`
- 되밀기 정책·매퍼 변경(R1·R6·R9·R10): `lib/external-crm` 테스트 전체 + 되밀기 지침 §8 확인 절차. 운영 네오CRM에 실제 생성 시험은 승인된 계정으로만.
- 마이그레이션 동반(C3·R5·H7·R10): `supabase/migrations/YYYYMMDD_*.sql` + 계약 테스트, [DB 마이그레이션 런북](db-migration-runbook.md) 절차.
- cron 추가(H7): `npm run check:vercel-crons`, 하루 1회 이하.
- 캐시 변경(D1·D5): 태그 무효화 테스트(`tests/api/admin-crm-*-invalidation` 패턴), stale-first 규칙은 [Admin 속도 3라운드](admin-performance-round3-2026-09-10.md) 준수.
- UI 변경: `DESIGN.md` 팔레트, 모바일 375px, 통화 칩·출처 캡션 유지.

Wave 완료 정의: 해당 Wave의 §3 불일치 항목이 "해소"로 바뀌고, 위 명령이 전부 통과하며, 스크린샷 또는 테스트로 변경 전후를 남긴다.

## 8. 구현 시 서브 에이전트 분담안

플레이북 소유권을 따르되, 파일 겹침을 피해 Wave 안에서 병렬로 돌린다. 각 에이전트는 자기 영역의 §4 표만 받고, 공용 파일(`admin-nav.ts`, `crm-route-labels.ts`, `lib/admin-client.ts`, 마이그레이션)은 한 에이전트만 만진다.

| 에이전트 | 담당 ID | 독점 파일 | 선행 조건 |
|---|---|---|---|
| 홈·큐 | H1~H8 | `components/admin/crm/home/**`, `CrmPriorityQueuePanel.tsx`, `CrmWeekAheadPanel.tsx`, `lib/crm/today-calls.ts`, `crm-priority-queue.ts` | 없음 |
| 고객DB | C1~C9 | `app/admin/crm/customers/**`, `components/admin/crm/leads/**`, `unified/**`, `map/**`, `crm-unified-customers.ts` | C3는 마이그레이션 에이전트 선행 |
| 입력함·기록 | R2, R3, R5, R8 | `capture/**`, `CrmActivityClient.tsx`, `CrmEventRow.tsx`, `events/**`, `crm-events.ts` | R5는 마이그레이션 선행 |
| 검수·되밀기 | R1, R4, R6, R7, R9, R10 | `matching/**`, `lib/external-crm/**`, `lib/crm/activity-record-writeback.ts`, `write-requests/**` | R6 전 되밀기 지침 §8 확인 |
| 돈흐름·캐시 | D1, D2, D5, D6, D7 | `deals/**`, `lib/admin-crm-revenue*.ts`, `partners-data.ts` | 없음 |
| 테스트·권한 | D3, D4 | `tests/admin/**`, `tests/crm/**` | 없음(타 에이전트와 파일 겹침 없음) |
| 마이그레이션 | C3·R5·H7 스키마 | `supabase/migrations/**` | §6 결정 5 |
| 문서 | §3 문서 정정, §9 아카이브 | `docs/**`, `CLAUDE.md` | §6 결정 7 |

검증 순서: 각 에이전트가 자기 테스트 → 통합 에이전트 1개가 §7 공통 게이트 실행 → 그때만 커밋.

## 9. 문서 정리 제안

`docs/active`에 CRM 관련 문서가 30개(이 문서 포함 31개)다. "한 제품 영역에는 현재 기준 문서 하나와 실행 로드맵 하나" 규칙에 맞추기 위한 제안이며, 실제 이동은 §6 결정 7 이후에 한다.

- **아카이브(완료·대체)**: `crm-ia-phase3-plan-2026-06-12.md`, `crm-ia-phase3-url-migration-checklist.md`, `crm-structure-feature-adoption-plan-2026-06-27.md`, `crm-cockpit-graft-analysis-2026-06-30.md`, `sales-crm-phase0-phase1-discussion-2026-06-27.md`, `crm-load-and-region-map-plan-2026-08-28.md`(C4만 이 문서로 이관), `crm-merge-phase0-plan-2026-06-24.md`, `crm-phase0-spike-findings-2026-06-24.md`
- **이 문서로 미구현 항목 흡수 후 아카이브**: `crm-9.5-prd-and-plan-2026-06-30.md`, `crm-ui-layout-improvement-spec-2026-06-27.md`, `crm-knowledge-gaps-register-2026-06-27.md`, `crm-tab-quality-audit-2026-08-06.md` §4
- **현재 기준으로 유지**: `admin-os-operating-decisions-2026-07-11.md`(정책), `admin-tab-restructure-2026-07-29.md`(UI 구조), `internal-crm-backend-operating-plan-2026-06-26.md`(백엔드 기준), `neocrm-writeback-guide-2026-09-07.md`(실행 지침), `crm-lead-console-board-design-2026-08-21.md`(리드 화면 설계, 미구현 §1·§3·§4는 C8로 추적), 이 문서(실행 로드맵)
- **판정 보류**: `crm-neo-revenue-ingest-prd-2026-06-30.md`(D9 결정에 따름), `admin-3-revenue-sheet-workspace-plan-2026-06-29.md`·`rev-crm-sync-compat-plan-2026-07-18.md`(D8 결정에 따름)

## 10. 근거 요약 (영역별 조사 결과 원문 위치)

이 문서의 파일:라인 근거는 2026-09-12 코드 기준이다. 후속 작업 시 각 항목의 파일을 다시 열어 현재 상태를 재확인한 뒤 착수한다. 감사 문서(2026-08-06) §4에서 미해결로 남았던 3건의 현재 상태: 큐 스코어링 비용 = 부분 해결(소스 수집만 캐시) → H7, 필터 URL 소유권 = 사용처가 홈 1곳으로 줄어 선행 조건 해소 → H4, 죽은 task 분기 = 미해결 → H2. 입력함 열 매핑·매칭 제외 되돌리기·통합 목록 offset·customers-neo 1만 행 = 전부 미해결 → R2·R4·C1·C9.
