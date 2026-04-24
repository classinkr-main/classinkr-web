# Partner Portal Front-Back Contract

기준 시점: 2026-04-04

이 문서는 파트너 포털의 `프론트 구조`와 `백엔드/BFF 설계`가 어디에서 만나는지 정의한다.
목표는 화면을 먼저 만들었다가 API를 다시 뜯거나, 반대로 테이블만 만들고 UI가 엇나가는 일을 막는 것이다.

관련 문서:

- [partner-portal-master-spec.md](./partner-portal-master-spec.md)
- [partner-portal-screen-layout.md](../archive/partner-portal-screen-layout.md) (아카이브)
- [partner-portal-implementation-roadmap.md](./partner-portal-implementation-roadmap.md)

## 1. 제품 구조 한 줄 정리

같은 도메인을 `관리자 Commercial Workspace`와 `파트너 포털` 두 개의 화면 언어로 푼다.
둘 다 같은 엔티티를 보지만, 밀도와 권한만 다르다.

- 관리자 기준 중심축: `기관 탐색 + 거래 운영 + 문서/설치/수납 전역 관리`
- 파트너 기준 중심축: `오늘 할 일 + 거래 진행 + 문서 공유/서명 + 설치/수납 확인`
- 공통 운영 단위: `Customer -> Deal`
- 공통 작업 화면: `Deal Detail`

## 2. 공통 도메인-UI 규칙

### A. 화면은 기관 목록으로 시작해도 작업은 거래건에서 끝난다

- 기관 상세는 탐색 화면이다.
- 실제 문서 생성, 단계 전환, 설치 일정 생성, 수납 등록은 거래건 상세에서 수행한다.

### B. 탭은 정보 구분용이고, 단계 전환은 액션 중심이다

- 탭을 옮겨서 수동으로 다시 입력하는 구조를 피한다.
- `다음 단계 진행`, `설치 일정 생성`, `수납 등록` 같은 CTA가 후속 객체 생성을 함께 연다.

### C. 문서는 최신 링크가 아니라 버전 링크다

- 견적서와 계약서 모두 고객 공개 링크는 버전 고정이다.
- 관리자와 파트너 대표만 버전 이력을 본다.

### D. 설치와 수납은 단건이 아니라 리스트를 전제한다

- 설치 일정은 복수 일정과 시간 범위를 지원한다.
- 수납은 분할 입금을 전제로 하고, 미수금이 핵심 지표다.

## 3. 화면 체계

## 3-1. 관리자 Commercial Workspace

추천 1차 메뉴:

- `Overview`
- `기관`
- `거래건`
- `문서`
- `설치`
- `수납`
- `캘린더`

### A. Commercial Home

목적:

- 오늘 운영 병목과 우선순위를 확인하는 전역 허브

레이아웃:

- 상단 `KPI 스트립`
- 좌측 `기관별 거래 스택`
- 중앙 `단계 로드맵 보드`
- 우측 `오늘 일정 / 서명 대기 / 미수금 경고`

읽기 데이터:

- `GET /api/admin/commercial/overview`
- `GET /api/admin/calendar?scope=today`
- `GET /api/admin/deals?stage=...`

쓰기 액션:

- `POST /api/admin/deals`
- `POST /api/admin/calendar-events`
- `POST /api/admin/deals/:id/actions/advance-stage`

핵심 UI:

- KPI 카드
- 단계 칸반 보드
- 경고 레일
- 빠른 액션 도크

### B. 기관 목록 / 기관 상세

목적:

- 기관 단위 거래 이력과 위험 신호를 한 번에 탐색

레이아웃:

- 목록 화면: 좌측 필터, 중앙 리스트
- 상세 화면: 헤더 + 요약 수치 + `개요 / 거래건 / 활동` 탭

읽기 데이터:

- `GET /api/admin/customers`
- `GET /api/admin/customers/:id`

쓰기 액션:

- `POST /api/admin/customers`
- `PATCH /api/admin/customers/:id`
- `POST /api/admin/customers/:id/activity`
- `POST /api/admin/deals`

핵심 UI:

- 기관 카드 리스트
- 거래 이력 표
- 최근 활동 타임라인
- 미수금/설치 위험 배지

비고:

- 지금의 [page.tsx](../../app/admin/commercial/page.tsx) 는 이 구조의 첫 미리보기다.

### C. 거래건 상세

목적:

- 문서, 설치, 수납, 활동을 묶는 단일 작업 화면

레이아웃:

- 상단 고정 헤더
- 상단 `단계 로드맵 바`
- 본문 탭
- 우측 `다음 액션 / 경고 / 최근 로그`

탭:

- `개요`
- `문서`
- `설치`
- `수납`
- `활동`

읽기 데이터:

- `GET /api/admin/deals/:id`

쓰기 액션:

- `POST /api/admin/deals/:id/actions/advance-stage`
- `POST /api/admin/deals/:id/quote-documents`
- `POST /api/admin/deals/:id/contract-documents`
- `POST /api/admin/deals/:id/installations`
- `PATCH /api/admin/installations/:id`
- `POST /api/admin/deals/:id/payments`
- `POST /api/admin/deals/:id/receipts`
- `POST /api/admin/deals/:id/activity`

핵심 UI:

- 상태 헤더
- 다음 액션 도크
- 문서 버전 아코디언
- 설치 리스트 + 미니 캘린더
- 수납 누계 / 미수금 위젯
- 활동 타임라인

## 3-2. 파트너 포털

추천 1차 메뉴:

- `홈`
- `거래`
- `문서`
- `캘린더`
- `수납`

### A. 파트너 홈

목적:

- 대표가 오늘 바로 해야 할 일을 가장 빠르게 보는 운영 홈

레이아웃:

- 상단 `요약 KPI`
- 중앙 `내 거래 단계 보드`
- 우측 `오늘 일정 / 서명 대기 / 미수 경고`

읽기 데이터:

- `GET /api/partner/overview`
- `GET /api/partner/deals`
- `GET /api/partner/calendar?scope=today`

쓰기 액션:

- `POST /api/partner/deals/:id/actions/advance-stage`
- `POST /api/partner/installations`
- `PATCH /api/partner/installations/:id`

핵심 UI:

- 오늘 액션 리스트
- 거래 카드 스택
- 서명 대기 카드
- 미수금 경고 카드

비고:

- 기존 [page.tsx](../../app/partner/dashboard/page.tsx) 는 `견적/계약/영수증 문서함` 구조다.
- V2에서는 홈과 거래 허브 중심으로 재편한다.

### B. 거래 목록 / 거래 상세

목적:

- 대표가 자기 기관 고객들의 거래를 단계별로 확인하고 바로 다음 단계로 넘기는 화면

레이아웃:

- 목록 화면: 상단 필터 + 단계별 보드 또는 리스트
- 상세 화면: 관리자 거래 상세와 유사하되 편집 범위는 좁힘

탭:

- `개요`
- `문서`
- `설치`
- `수납`
- `활동`

읽기 데이터:

- `GET /api/partner/customers`
- `GET /api/partner/customers/:customerId`
- `GET /api/partner/deals`
- `GET /api/partner/deals/:dealId`

쓰기 액션:

- `POST /api/partner/deals/:id/actions/advance-stage`
- `POST /api/partner/deals/:id/installations`
- `PATCH /api/partner/installations/:id`
- `POST /api/partner/deals/:id/activity`

제한 규칙:

- 문서 버전 생성과 가격 최종 수정은 관리자 우선
- 설치 일정 수정/확정은 파트너 포털 안에서는 강한 권한 허용
- 수납은 조회 중심으로 두고, 초기에는 등록은 관리자 위주로 시작 가능

### C. 문서 / 캘린더 / 수납 허브

목적:

- 특정 거래에 들어가기 전 전역 검색과 예외 처리를 돕는 보조 허브

읽기 데이터:

- `GET /api/partner/documents`
- `GET /api/partner/calendar`
- `GET /api/partner/payments`

쓰기 액션:

- `POST /api/partner/contracts/:id/share`
- `POST /api/partner/quotes/:id/share`
- `PATCH /api/partner/installations/:id`

원칙:

- 여기서는 탐색과 확인이 주 역할이다.
- 실제 변경은 가능한 한 거래건 상세로 다시 연결한다.

## 4. 탭별 프론트-백 계약

| 탭 | 보여줘야 하는 것 | 읽기 계약 | 쓰기 계약 | 비고 |
| --- | --- | --- | --- | --- |
| `개요` | 단계, 금액, 품목 요약, 다음 액션, 최근 이벤트 | `GET /deals/:id` 안에 모두 포함 | `POST /deals/:id/actions/*` | 탭 전환 없이 핵심 판단 |
| `문서` | 견적/계약 최신 버전, 이전 버전, 공유 링크, PDF | `GET /deals/:id` 안의 document bundles | `POST /deals/:id/quote-documents`, `POST /deals/:id/contract-documents`, `POST /shares` | 버전 고정 링크 |
| `설치` | 일정 리스트, 상태, 시간 범위, 장소, 담당팀 | `GET /deals/:id` 안의 installations | `POST /deals/:id/installations`, `PATCH /installations/:id` | 복수 일정 전제 |
| `수납` | 계약 금액, 실수납 누계, 미수금, 영수 기록 | `GET /deals/:id` 안의 payments/receipts | `POST /deals/:id/payments`, `POST /deals/:id/receipts` | 분할 입금 전제 |
| `활동` | 미팅 로그, 문서 발송 로그, 단계 변경 로그 | `GET /deals/:id` 안의 activity logs | `POST /deals/:id/activity` | 기관 활동과 거래 활동 연결 |

## 5. 프론트 컴포넌트 분해 기준

### A. 화면 Shell

- `CommercialShell`
- `PartnerPortalShell`
- `DealWorkspaceLayout`

### B. 공통 도메인 컴포넌트

- `DealStageRoadmap`
- `DealActionDock`
- `CustomerSummaryCard`
- `DealStackCard`
- `DocumentVersionList`
- `InstallationTimeline`
- `PaymentStatusCard`
- `ActivityTimeline`
- `CalendarRail`

### C. BFF 기준 훅 또는 데이터 모듈

- `useCommercialOverview`
- `useCustomerList`
- `useCustomerDetail`
- `useDealDetail`
- `usePartnerOverview`
- `usePartnerDeals`
- `useCalendarEvents`

원칙:

- 탭마다 개별 REST를 난사하지 않는다.
- 목록 화면은 목록용 BFF, 상세 화면은 상세용 BFF를 쓴다.
- 화면이 필요한 shape를 BFF에서 먼저 맞추고, 프론트는 렌더링과 상호작용에 집중한다.

## 6. 현재 상태와 목표 상태

### A. 현재

- [page.tsx](../../app/admin/commercial/page.tsx)
  - 새 V2 미리보기
  - `customer list -> customer detail -> deal detail` 흐름
  - fallback 포함
- [page.tsx](../../app/admin/partners/page.tsx)
  - 구형 모놀리식 운영 화면
  - `partner == customer` 가정
- [page.tsx](../../app/partner/dashboard/page.tsx)
  - 구형 문서함 구조
  - `/api/partner/data` 의존

### B. 목표

- `admin/commercial` 를 관리자용 표준 Commercial Workspace로 승격
- `admin/partners` 의 UX 자산을 필요한 만큼 분해 이식
- `partner/dashboard` 를 홈 + 거래 허브 구조로 재편
- `/api/*/deals/:id` 를 표준 상세 BFF로 고정

## 7. 구현 순서

### Phase 1. BFF 기준선 고정

- `overview / customers / deals / calendar / payments` 읽기 BFF 완성
- `deal actions / installations / payments / activity` 쓰기 BFF 설계

### Phase 2. 관리자 UI 전환

- `admin/commercial` 에 탭형 거래 상세 추가
- 기관 상세와 거래 상세를 분리된 컴포넌트로 재구성
- 구형 `admin/partners` 기능을 단계적으로 이식

### Phase 3. 파트너 UI 전환

- `partner/dashboard` 를 홈 허브로 교체
- `partner/deals` 와 `partner/deals/[id]` 신설
- 문서/캘린더/수납 허브를 보조 화면으로 추가

### Phase 4. 공용 캘린더와 KPI

- 관리자 캘린더와 파트너 캘린더를 `calendar_events` 원본으로 통합
- KPI는 전역 대시보드와 홈 화면에서 같은 계산식을 공유

## 8. 이번 기준에서 특히 지켜야 할 것

- 프론트는 기관보다 거래건 중심으로 본다.
- 백엔드는 거래 상세 BFF 하나에 문서/설치/수납/활동을 묶는다.
- 탭 이동보다 `다음 액션`을 강하게 둔다.
- 파트너 포털은 문서함이 아니라 운영 허브로 간다.
