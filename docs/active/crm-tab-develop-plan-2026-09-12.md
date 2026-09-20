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
| 5 | 리드 보드 설계 §4 "blur 저장 금지" | `leads/board/LeadDrawer.tsx:152-156, 540-547` onBlur 저장 | W1 |
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
| C6 | 드로어 저장 규약 정리(blur 저장 제거) | P1 | S | X | `leads/board/LeadDrawer.tsx` |
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

## 10. 진척 기록

### Wave 0 — 2026-09-13 완료

코드 11개 항목(H1·H2·H3·H8·C2·C6·R1·R4·D1·D2·D3)과 문서 정정 4건(§3-9·10·11·12)을 모두 반영했다. 검증: `npm run typecheck` 통과, `npx eslint app components lib --max-warnings=0` 통과, `npx vitest run` 521 파일 / 4,053 케이스 통과, `npm run build` 컴파일·타입·정적 생성 통과(자격증명 없는 환경의 공개 페이지 데이터 경고는 기존과 동일).

§3 불일치 항목 상태: 4·5·7·9·10·11·12 해소, 13 해소(미루기 KST 고정). 1·2·3·6·8은 각 Wave에 그대로 남는다.

후속 작업 시 주의:

- R1로 활동 되밀기 정책이 `ownerId`를 필수로 요구한다. 어드민→네오 `ownerId` 매핑(R9)이 생기기 전까지 활동 초안은 `missing_owner`로 생성되지 않는다. 현재 매퍼 호출자가 없어 운영 영향은 없지만, R6(초안 생성 버튼)은 R9를 선행해야 한다.
- 리드 출처 활동 초안은 되밀기 지침 §8 확인 3·4(리드 groupId, 실제 생성 시험)가 끝나기 전에는 실 통과가 검증되지 않았다.
- `map-source POST`는 외부 원천 적재라 관리자 전용(`STAFF_ADMIN_API_ROLES`)으로 명시했다. `CrmNaverMapSourceClient`는 역할과 무관하게 가져오기 폼을 노출하므로 BRANCH·EDITOR는 403을 받는다(종전과 동일). 폼 노출 조건 정리는 C9와 함께 한다.
- C2의 "미확인 포함" 토글은 세션 상태로만 두었다(통합 목록은 view·account 외 필터를 URL에 싣지 않는 규약). URL 동기화가 필요하면 H4와 함께 결정한다.
- C6에서 팔로업 날짜는 완성된 값일 때만 즉시 저장한다. 브라우저의 date 입력 타이핑 동작은 수동 확인을 권한다.
- `.claude/agents/` 6종은 `.gitignore`를 `.claude/*` + `!.claude/agents/`로 바꿔 추적한다. 다른 `.claude/` 로컬 설정은 계속 무시된다.
- 역할 매트릭스 테스트는 CRM 라우트 51파일·64핸들러를 디렉터리 스캔으로 고정한다. 라우트를 추가·삭제하면 이 테스트를 함께 갱신해야 한다.

### 2026-09-14 home_v4.42 병합 반영

home_v4.42(9/10 어드민 개편 중심)를 병합했다. 이 브랜치는 Wave 0과 독립적으로 진행됐고 §4 항목을 직접 완료시키지는 않았으나 인접 인프라를 승격했다.

- D5: `crm-tasks`·`customers-neo` 저장소가 Data Cache로 승격됐다. `partners-data`·`portal/overview`는 미착수 → 부분 완료.
- C9: `customers-neo` 라우트에 `scope`·`limit`·`offset` 옵트인이 생겼으나 기본 동작은 전량 그대로. `region-map`은 캐시만 승격되고 단일 `.limit(5000)` 유지 → 미해결.
- H7·D6·D7·R2·R3: 관련 변경 없음 → 기존 Wave 배치 유지.
- R4·H2: 4.42도 같은 결함(제외 되돌리기, 죽은 task 분기)을 독립 수정했다. 병합 후 매칭 인박스에 도달 불가한 중복 `rejected` 분기가 남아 제거했다. 큐 패널은 Wave 0 버전(KST 미루기 포함)을 유지했다.
- §3-9: 4.42가 `admin-nav-access.ts`의 `deny` 배치 자체를 없애 전 탭 상시 노출로 바뀌었다. 탭 재구성 문서 §14(CRM 상시)는 이 상위 결정에 흡수됨을 기록했다.
- 4.42가 추가한 CRM UX: 딜 예상금액 인라인 편집, 입력함 행별 전화·이메일 수정, 활동 폼 중복 제출 이중 잠금. 이후 UX 라운드의 발견은 이 상태를 기준으로 재검증한다.

### UX 라운드 1 — 2026-09-15 완료 (디자인·사용성·편의성 집중)

기획안 밖 별도 라운드로, 4개 화면 단위(현황 홈·리드 콘솔/보드·통합 고객·고객 360)를 입출력 속도·가시성·클릭 경로 및 취소 안전성·모바일 접근성 4개 렌즈로 감사하고, 확정 40건을 구현했다. 공용 패턴 6종(`lib/crm/status-tone.ts`, `lib/crm/optimistic-update.ts`, `CrmNoticeBanner`, `SaveStateCaption`, `home/shared.tsx` 대비·터치 상수, `leads/shared.tsx` Toast 확장)을 먼저 만들고 6개 클러스터(홈 큐·홈 셸·리드 보드·리드 드로어·통합 목록·고객 360)로 병렬 구현한 뒤, 클러스터마다 적대적 코드 리뷰를 거쳐 발견을 전량 반영했다.

핵심 반영 사항:

- 리드·할 일 처리가 서버 전량 재조회 대신 낙관 갱신 + 8초 되돌리기로 바뀌었다(H6 겸 해결). 종료·완료 같은 비가역 동작은 인라인 확인 폼으로, `window.confirm`은 CRM 4개 클러스터에서 전부 제거했다.
- 실패·부분 실패·갱신 지연이 "0건"·"없음"과 시각적으로 구분된다. 코크핏 히어로가 처음으로 `overview` 상태 메타(부분 실패·스냅샷 시각)를 읽는다.
- 통합 목록·고객 360 드로어에 요청 세대 가드를 넣어, 빠른 전환 중 이전 고객·이전 질의의 응답이 화면에 섞이지 않는다. 고객 360에서는 이 문제가 리뷰 blocker였다(전환 중 로컬 patch 유출).
- 고객 360 딜 단계 변경의 낙관 갱신 override가 서버 응답 전체가 아니라 파생 필드만 반영하도록 좁혔다(다른 경로로 바뀐 담당자·제목을 되돌리던 결함).
- 통화 혼동 방지 문구 정정(리드 요약 실패 시 "0건" 노출, NEO 잔액이 "미수"와 "충전 잔액"으로 반대 해석되던 것 등).
- 고객 찾기 픽커가 combobox/listbox 접근성 계약을 갖췄고, 디바운스 중 오래된 검색 결과를 Enter로 선택하던 blocker를 없앴다.
- 모바일 44px 터치 타깃, WCAG AA 대비(`SECONDARY_TEXT_CLASS`/`INTERACTIVE_TEXT_CLASS`)로 홈·리드·통합 목록의 정보 텍스트를 통일.

검증: `npm run typecheck`·`npx eslint app components lib --max-warnings=0`·`npm run build` 통과, `npx vitest run` 598 파일 / 4,544 케이스 통과.

후속으로 남긴 것(다음 라운드 대상):

- 남은 6개 화면 단위(원천 고객·지도, 기록, 입력함, 검수, 돈흐름·인사이트, 공통 셸)는 이번 라운드에서 감사하지 않았다.
- `lib/repositories/crm-priority-queue.ts`의 `invalidateCrmPrioritySourceSnapshot()`가 정의만 되고 리드·할 일 쓰기 경로에서 호출되지 않아, force 없는 재조회는 최대 60초 낡은 스냅샷을 돌려줄 수 있다(120초 suppress 창으로 화면상 가려짐).
- `app/api/admin/crm/tasks/[id]/route.ts`의 `update` 액션이 `dueAt: null`을 받지 않아, 기한 없던 할 일의 "내일로" 되돌리기가 기한을 정확히 지우지 못한다.
- `lib/admin-client.ts`의 `invalidationScopesForUrl`이 리드 PATCH 하나로 CRM 집계 캐시 전체(overview·action-kpis·compass·coverage·owners·tasks·health)를 지운다 — 범위가 넓다.
- `components/admin/crm/unified/shared.ts`의 `customerSourceTone()`이 여전히 팔레트 밖 리터럴(#B85C33 계열)을 쓴다. 소비처(`CustomerSearchPanel.tsx`)가 이번 라운드 클러스터 밖이라 그대로 두었다.

### §11 1단계 — 2026-09-18 완료 (M1·M3·A2·A3·A5·T2·T3·P2)

§11.5의 1단계 8개 항목을 스키마 변경 없이 구현했다. 공용 조각 2종(`components/admin/crm/FreshnessCaption.tsx` 신선도 캡션, `components/admin/crm/ScoreKind.tsx` 점수 3종 정의 SSOT)을 먼저 커밋한 뒤, 파일 소유권을 겹치지 않게 나눈 5개 클러스터(360 매출 / 기록 컴포저 / 기록 화면 / 인사이트·360 개요 / 통합·리드 목록)로 병렬 구현하고 클러스터별로 커밋했다.

핵심 반영 사항:

- M1·M3: 고객 360 매출 탭이 $/¥/¥/¥ 타일 나열 대신 USD·CNY·KRW 그룹(통화 배지·출처 칩)으로 바뀌고 "통화별 합계 · 서로 더하지 않음" 캡션을 상시 표시한다. 빈 통화는 숨기지 않고 "해당 없음"으로 둔다. `lib/crm/money-timeline.ts`가 NEO 오더·수금·딜을 하나의 타임라인(월 그룹, kind 텍스트 라벨, 통화별 포맷, 상태 점+텍스트, 20행+더 보기)으로 병합한다. 기존 4개 원천 목록은 접이식으로 유지. `Customer360DetailClient`가 `deals`를 매출 탭에 전달한다.
- A2·A3: `lib/crm/activity-templates.ts` 템플릿 6종 칩이 모드·본문·감정을 프리필하고, 본문이 있으면 인라인 확인(바깥 클릭·Esc 취소)을 거친다. 고객 미선택 저장은 더 이상 조용히 미연결로 저장되지 않고 `role=alert` 경고 + 최근 고객 5명 원클릭 연결 + "미연결로 저장" 명시 확인을 요구한다. ⌘/Ctrl+Enter 저장 추가(IME 조합 중 무시). `lockTarget`(드로어)에서는 게이트를 건너뛴다.
- A5: 기록 화면 우측(xl)·모바일 접힘 요약 패널 — 이번 주(월 00:00 KST) 건수·콜/회의·위험 신호·미연결(클릭 시 대상 필터) + `/api/admin/crm/tasks?status=open&dueBefore=<이번 주 일요일>` 미완 8건. 집계는 현재 필터·불러온 페이지 기준이며 다음 페이지가 이번 주에 걸치면 "(더 있음)"으로 하한값임을 표기한다.
- T2·T3: `getCrmUnifiedHealthDistribution`이 한 번 순회로 `byOwner`(미배정 맨 뒤)를 함께 집계하고 라우트가 `byOwner`·`generatedAt`을 내려준다. 인사이트에 담당별 안전/주의/위험 수평 스택바(범례·직접 건수·2px 간격·툴팁)와 접이식 점수 3종 정의표를 추가했다. 360 개요의 "점수" 타일은 "우선순위" 라벨로 바뀌고 기존 고객에는 "건강도" 타일이 생겼다. 리드 보드·드로어의 `★82`는 "리드 점수 82"로 바뀌었다.
- P2: 기록·통합 고객·리드 보드의 로컬 TTL 리터럴(30/60/90초)을 전부 제거하고 `lib/crm/client-cache.ts`의 `CRM_CACHE_TTL_MS`/`CRM_CACHE_SWR_MS`만 쓴다(`tests/crm/crm-cache-ttl-ssot.test.ts`가 unified/leads 범위를 grep으로 고정). 세 목록 상단에 같은 위치·같은 문구의 신선도 캡션(기준 HH:MM · 갱신 N초 전 · 갱신 중 · 갱신 실패)을 두고, 헤더의 별도 새로고침 버튼은 캡션 버튼으로 일원화했다.

검증: `npm run typecheck` 통과, 변경 파일 `eslint --max-warnings=0` 통과(저장소 전체 `npm run lint`의 오류 6건은 이번 변경과 무관한 `scripts/`·`tests/repositories/hardware-*` 기존 항목), `npx vitest run` 608 파일 / 4,633 케이스 통과, `npm run build` 통과.

후속으로 남긴 것:

- M3 타임라인에 HW 출고가 없다 — `Customer360Money`에 출고 데이터가 없어 M2(품목·수량 읽기 모델)를 선행해야 한다. NEO 상태 문자열의 톤 매핑은 어휘 기반 보수 휴리스틱이라 실제 상태 값 목록 확인 후 `resolveMoneyStatusTone`을 정확한 매핑으로 바꾼다.
- 리드 보드는 `/api/admin/leads` 응답에 `generatedAt`이 없어 캡션의 "기준 HH:MM"이 생략된다. 통합 고객 화면은 신선한 캐시 적중 시 `adminFetchJsonCachedWithMeta`가 저장 시각을 주지 않아 "갱신 N초 전"이 최대 TTL만큼 낙관적이다 — `lib/admin-client.ts`가 fresh 적중의 `savedAt`을 실어주면 해소된다.
- 인사이트 담당별 분포 행에서 통합 고객 화면으로 가는 링크는 생략했다. 통합 화면이 `?owner=` 딥링크를 받지 않아(담당 필터가 로컬 state) 착지해도 필터가 걸리지 않기 때문이다.
- 360 개요의 건강도는 드로어 헤더와 같은 입력(`buildDrawerHealthInput`)이라 통합 목록·도넛의 `rowHealthBand` 입력 매핑과 다르다 — 기존 드로어와 같은 불일치이며 통일하지 않았다.
- unified/leads 밖에 남은 TTL 사본: `CrmInsightsClient.tsx`(90초 — 이번에 담당별 분포 조회는 SSOT로 했으나 도넛 쪽 상수는 남음), `CrmNaverMapSourceClient.tsx`(60초), `CrmSubnav.tsx` warm(60초). P2 후속에서 정리한다.
- 기록 화면 요약의 "다음 액션 미완"은 `listCrmTasks`가 `due_at <= dueBefore`로 거르므로 기한 없는 할 일은 보이지 않는다(헤더에 "이번 주 마감 N건"으로 명시). 할 일 클릭은 기록 화면에 360 드로어가 없어 대상별 타임라인 딥링크로 이동한다.
- DOM 테스트 환경(jsdom/@testing-library)이 없어 컴포저·캡션의 클릭 상호작용은 순수 함수 분리 + `renderToStaticMarkup` + 소스 계약 테스트로 고정했다. jsdom 도입 결정이 나면 같은 파일에 클릭 케이스를 추가한다.

## 11. 2026-09-17 우선순위 재정의 — "기존보다 편리·정확·편의 기능"

운영자가 정한 네 가지 우선순위와, 코드에서 확인한 현재 공백, 그에 대응하는 작업 항목이다. 이 절은 Wave 1 이후의 판단 기준이며 §4의 ID보다 우선한다. 목업은 [고객별 매출·기록·세그먼트 목업](https://claude.ai/artifact/SXDZ9UDHuC6qmQEjKVu7hy)과 [우선순위 큐 3방향 목업](https://claude.ai/artifact/2c61KxVoNus84UhfECsQHM)에 있다.

### 11.1 고객별 매출(주문) 모아보기 — 금액과 품목별 대수

현재: `Customer360DetailMoney`는 오더($)·수금/성과/잔액(¥)·딜(₩)을 타일 4개와 단순 목록으로 보여주며 통화 혼용을 주석으로만 경고한다. 품목별 수량은 `crm-account-money.ts`의 `hwBoardCount` 하나뿐이고 제품명 정규식으로 "칠판"만 추정한다(스탠드·카메라 탈락). `deal_line_items`(sku·product_name·quantity·unit_price·amount)와 `HwOutbound`(product·quantity·serials)가 있지만 360에 연결되지 않고 하드웨어 재고 모달의 후보 매칭에서만 쓰인다. 조인 키는 고객명 문자열이라 미매칭이면 전부 "-"다.

| ID | 항목 | 규모 | 스키마 |
|---|---|---|---|
| M1 | 360 매출 탭에 통화별 분리 합계 타일(₩ 딜 / $ 오더 / ¥ 수금·잔액) + 출처 칩 + "합산 없음" 캡션. 기존 4타일을 대체 | S | X |
| M2 | 고객 단위 품목별 대수 표: `deal_line_items`·`HwOutbound`를 고객 키로 합산해 품목·카테고리·수량·단가·금액·최근 출고·근거(확정/추정) 열. 행 펼침으로 시리얼·주문 번호 | M | X(읽기 모델만) |
| M3 | 주문 타임라인(HW 출고·NEO 오더·딜을 한 축에, 상태 칩) | S | X |
| M4 | 미매칭 출고를 360 안에서 바로 연결(후보 제시 + `crm_source_links` 생성), 연결 후 즉시 재집계 | M | X |
| M5 | 품목·주문 CSV 내보내기 | S | X |

### 11.2 기록 — 빠르게 모아보기, 빠르고 편리하게 입력

현재: `ActivityQuickForm` 컴포저는 모드 칩→고객 피커→본문→저장으로 2~3클릭이지만 회의록·녹음 모드에서 필수 필드가 9개로 늘어 한 줄 이점이 사라진다. 고객을 고르지 않으면 조용히 "미연결 기록"으로 저장돼 360 타임라인에 붙지 않는다. `CrmActivityClient`는 필터 4축과 스코프를 개별 select로 나열하고 정렬·그룹이 없다. `crm_customer_events.source_type`은 DB CHECK 7종, 코드 10종으로 어긋난다(추정).

| ID | 항목 | 규모 | 스키마 |
|---|---|---|---|
| A1 | 한 줄 컴포저: 유형 칩 + 최근/오늘 연락 고객 한 번에 연결 + 본문 + ⌘↵ 저장. 회의록도 요지 한 줄이 기본, 결정·차단·참석자는 "+상세"로 | M | X |
| A2 | 템플릿 칩(부재중·재통화 / 견적 발송 / 데모 예약 / 재계약 논의)이 유형·본문·감정을 채움. 팀별 템플릿은 후속 | S | X |
| A3 | 고객 미연결 상태를 저장 전에 경고하고 최근 고객 원클릭 연결. 미연결 저장은 명시 확인 뒤에만 | S | X |
| A4 | 기록 목록을 날짜로 그룹(스티키 헤더), 기간·유형·감정 칩 필터, 행 펼침, 다음 액션 칩 표시 | M | X |
| A5 | 우측 요약(이번 주 건수·콜/회의·위험 신호·다음 액션 미완 목록) | S | X |
| A6 | `source_type` DB CHECK와 코드 enum 동기화 마이그레이션 | S | **O** |

### 11.3 태깅·스코어링·단계 — 시각화와 관리

현재: 차트는 `CrmHealthDonut` 하나(conic-gradient)다. `CrmInsightsClient`는 KPI 7개와 목록만, `CrmPerformanceCharts`는 매출 추이만 그린다. 단계(리드 4·딜 7·라이프사이클 5)와 태그 분포 차트가 없다. 태그는 `crm_customer_tags`의 자유 텍스트 40자로 색·범주·집계·자동 부여가 없고 행에 3개까지만 칩으로 보인다. 점수 3종(건강도 0–100 감점식, 리드 점수 가중 상대값, 우선순위 버킷+심각도)이 화면에서 구분되지 않는다.

| ID | 항목 | 규모 | 스키마 |
|---|---|---|---|
| T1 | 단계 퍼널 차트(리드 상태→딜 단계, 단일 색, 전환율·병목 표시) — `/admin/crm/insights` 또는 고객DB 상단 | M | X |
| T2 | 담당별 건강도 분포 스택바(안전/주의/위험, 범례+직접 라벨, 상태색은 라벨과 함께) | S | X |
| T3 | 점수 3종 정의표를 화면에 상시 노출하고 각 숫자 옆에 어떤 점수인지 표기 | S | X |
| T4 | 태그 관리 패널: 전체 태그·건수, 클릭 필터, 추가, 이름 변경·병합(일괄 반영), 필터 결과 고객 목록 | M | X |
| T5 | 자동 태그 규칙(만료 30일 이내→재계약, 건강도 위험→이탈위험) — 규칙 테이블 + 일 1회 cron | M | **O** |
| T6 | 태그 색·범주 컬럼 추가 여부 결정(DESIGN.md는 카테고리 색을 제한하므로 범주만) | S | O(결정 후) |

### 11.4 디자인 시각성과 로딩 속도

현재: 클라이언트 캐시 SSOT는 TTL 120초/SWR 10분이지만 기록 화면은 30초, 통합 목록은 90초로 제각각이다. RSC 프리페치는 홈에만 있고 `/admin/crm/activity`·`/customers/unified`는 클라이언트 마운트 뒤 fetch 0부터 시작한다. 360 상세만 서버에서 1회 조회한다.

| ID | 항목 | 규모 |
|---|---|---|
| P1 | 기록·통합 목록에 홈과 같은 `openPrefetchLane` 스트리밍 프리페치 + 클라이언트 캐시 시드 | M |
| P2 | 화면별 TTL을 `lib/crm/client-cache.ts` SSOT로 통일하고 모든 목록 상단에 "기준 HH:MM · 갱신 N초 전" 캡션 | S |
| P3 | 360 매출 탭·기록 탭을 탭 전환 시 재조립하지 않도록 클라이언트 캐시(UX 라운드 1 c360-01과 같은 패턴) | S |
| P4 | 목업의 시각 규약(통화 칩, 근거 배지, 상태색+라벨, 스켈레톤)을 DESIGN.md 어드민 절에 추가 | S |

### 11.5 실행 순서 제안

1. 즉시(스키마 없음): M1·M3·A2·A3·A5·T2·T3·P2
2. 다음(읽기 모델·프리페치): M2·M4·A1·A4·T1·T4·P1·P3
3. 결정 후(스키마): A6·T5·T6

## 13. 2026-09-20 Compass 정리 라운드 — 시각·대시보드·작업, 칩 입력, 세그먼트 필터·검색

방향(사용자 지시): 이 라운드는 Compass(mkt.classin.co.kr, 마케팅팀 외부 CRM)의 내용을 **정리해 보여주는 시각·대시보드·작업 큐**에 치중한다. 입력은 **칩(버튼) 한 번으로도** 추가되게 하고, **메타 광고 리드 / 인계 리드 / 기존 리드 / 고객** 같은 필터와 검색이 빠르게 되게 한다. 구현은 하위 모델 서브에이전트를 적극 쓴다.

### 13.1 조사 요약 (2026-09-20 코드 기준)

- Compass 브리지(`lib/compass/bridge.ts`)는 리드(48필드)·활동·광고 일간·광고세트·데모·캘린더·매출·다음 액션·BD인계 건수를 읽을 수 있지만, CRM 화면에 나오는 것은 홈 밴드의 숫자 3개(오늘 데모·다음 액션 임박·BD인계 진행)와 리드 보드의 오버레이 칩뿐이다. 단계(new/contact/consult/demo/quote/bd/won/lost) 분포, 케어 사다리, 유입 플랫폼, 담당별 진행, 이탈 사유, 다음 액션 **목록**은 전부 미노출.
- 리드 보드 필터 축은 상태(10)·유입 그룹(7)·렌즈(전체/마케팅)·정렬·검색·미확인 토글이며 URL 은 `filter·group·lens·sort·q·unconfirmed·view·lead` 를 쓴다. 검색은 전량 로드 후 클라 순수 함수(`lib/crm/lead-ranking.ts` tokenizeLeadSearch/matchesLeadSearch, 300ms 디바운스)이고 Compass 오버레이는 `useCompassOverlay`(전화 키 POST 배치)로 리드별 단계·BD 담당·NeoCRM 등록을 준다. "메타 광고 / 인계 / 기존 / 고객" 을 한 줄로 고르는 축은 없다.
- 입력 표면: 리드 상태(칩 4)·연락 채널/결과(칩)·기록 모드/템플릿(칩)은 이미 칩이다. 팔로업 날짜는 date input, 할 일은 폼 없이 API 만, 태그는 **UI 자체가 없다**(POST/DELETE `/api/admin/crm/customers/[key]/tags` 만 존재). 담당 배정은 select(400ms 지연 커밋). 외부 CRM(NeoCRM) 쓰기는 큐 정책만 있고 호출자가 없으므로 이번 칩은 전부 로컬(Supabase) 대상이다.

### 13.2 항목

공용 계약 2종을 먼저 커밋한다: `lib/crm/lead-segments.ts`(세그먼트 SSOT — 정의·판정·카운트·딥링크), `lib/compass/summary-contract.ts`(Compass 요약 응답 타입·기간·퍼널 순서·상한).

| ID | 항목 | 규모 | 파일 |
|---|---|---|---|
| S1 | 리드 보드 상단 **세그먼트 칩**(전체·메타 광고·인계·기존·고객) + 건수, `?segment=` URL, Compass 끊김이면 인계·기존 칩은 "연결 끊김"으로 비활성(0 아님) | M | `leads/LeadsBoardClient.tsx`, `leads/board/*` |
| S2 | 검색 강화: `/` 단축키로 검색창 포커스, Compass 매칭 리드는 Compass 학원명·이름도 검색 대상, 결과 건수 캡션, 세그먼트와 AND | S | 위와 동일 + `lib/crm/lead-ranking.ts` 검색 haystack 확장 |
| S3 | 커맨드 팔레트에 세그먼트 이동 명령 4개("메타 광고 리드 보기" 등) | S | `CrmCommandPalette.tsx` |
| S4 | 통합 고객 저장 뷰 2개 추가: "메타 광고 리드"(origin=ad) · "NEO 등록 리드"(crmRegistered) — 서버 viewCounts 포함 | S | `lib/crm/unified-view-rules.ts`, `unified/shared.ts`, 저장소 viewCounts |
| D1 | **Compass 요약 API** `GET /api/admin/crm/compass-summary?period=7d|30d|90d`: 브리지에 range 페이지네이션 슬라이스 조회(금액 컬럼 제외, 상한 5,000 → truncated) 추가, 기간 내 유입·플랫폼·단계 누적 퍼널·이탈·NeoCRM 등록·결제·케어 사다리·담당별·이탈 사유·다음 액션 목록·BD인계·오늘 데모를 한 응답으로 | M | `lib/compass/bridge.ts`(추가만), 신규 `lib/compass/summary.ts`, 신규 라우트 |
| D2 | 홈 **Compass 밴드 확장**: 기존 숫자 3개 유지 + 기간 칩 + 단계 퍼널(MiniFunnel) + 유입 플랫폼(메타/기타) 막대 + **다음 액션 임박 목록**(담당·학원·액션·D-시간·새 탭 딥링크) + 세그먼트 타일 4개(메타 광고 유입·BD인계 진행·NeoCRM 등록·결제 → 리드 보드 `?segment=` 링크). down 이면 전부 걷어내고 "연결 끊김" 한 줄 | M | `home/CompassPipelineBand.tsx`, `home/CrmHomeClient.tsx`(props 배선만) |
| D3 | 인사이트 **Compass 파이프라인 섹션**: 기간 칩, 담당별 표(콜·데모·BD·결제·이탈), 케어 사다리 막대, 유입 플랫폼, 이탈 사유 상위 5 | M | `CrmInsightsClient.tsx` |
| Q1 | 리드 드로어 **팔로업 칩**(오늘·내일·3일 뒤·다음 주 월·지우기) 즉시 저장 + 연락 결과가 부재중/재통화면 저장 직후 "팔로업 내일/3일 뒤" 제안 칩 | S | `leads/board/LeadDrawer.tsx`, `ContactLogForm.tsx` |
| Q2 | 고객 360 **할 일 칩**(내일 재통화·이번 주 견적 발송·다음 주 데모 준비·재계약 논의) 낙관 추가 + 되돌리기 | S | `Customer360DetailTasks.tsx` |
| Q3 | 고객 360 **태그 칩**: 제안 태그(재계약·데모 요청·VIP·이탈 위험·하드웨어) 원클릭 추가, 직접 입력, × 제거 — 태그 UI 최초 도입 | S | `Customer360DetailOverview.tsx` |
| Q4 | 리드 드로어 **빠른 배정 칩**(최근 배정 3명 · 나) | S | `leads/board/LeadDrawer.tsx` |

세그먼트 정의(SSOT `lib/crm/lead-segments.ts`): 메타 광고 = source 그룹 meta 또는 fbclid/Meta UTM · 인계 = Compass 단계 bd 또는 BD 담당 지정(결제·이탈 제외) · 기존 = Compass 전화 키 매칭 또는 NeoCRM 등록 · 고객 = converted 또는 Compass won. 한 리드가 여러 세그먼트에 속할 수 있다.

### 13.3 실행

1. 계약 2종 커밋 → 6개 클러스터 병렬(S1+S2 / S3+S4 / D1 / D2 / D3 / Q1–Q4) → 클러스터별 게이트·커밋 → 전체 게이트 → §10 기록.
2. 후속 후보: Compass 활동 타임라인을 고객 360 기록 탭에 병합(브리지 `getCompassActivitiesByLeadIds` 준비됨), 광고세트 성과는 캠페인 허브(`/admin/campaigns`)가 정본이라 CRM 에 중복하지 않는다.

## 12. 근거 요약 (영역별 조사 결과 원문 위치)

이 문서의 파일:라인 근거는 2026-09-12 코드 기준이다. 후속 작업 시 각 항목의 파일을 다시 열어 현재 상태를 재확인한 뒤 착수한다. 감사 문서(2026-08-06) §4에서 미해결로 남았던 3건의 현재 상태: 큐 스코어링 비용 = 부분 해결(소스 수집만 캐시) → H7, 필터 URL 소유권 = 사용처가 홈 1곳으로 줄어 선행 조건 해소 → H4, 죽은 task 분기 = 미해결 → H2. 입력함 열 매핑·매칭 제외 되돌리기·통합 목록 offset·customers-neo 1만 행 = 전부 미해결 → R2·R4·C1·C9.
