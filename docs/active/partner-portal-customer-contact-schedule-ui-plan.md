# Partner Portal Customer/Contact/Schedule UI Rollout Plan

> [!WARNING]
> 이 외부 파트너 포털 UI 구축 계획은 2026-07-11 운영 결정으로 중단·폐기됐다. V2 도메인 조사 근거만 참고하며, 기능은 내부 Admin OS 통합을 우선한다. 현재 기준은 [Admin OS 운영 결정](admin-os-operating-decisions-2026-07-11.md)이다.

기준일: 2026-04-06

## 목적

`/partner`에서 이미 정리된 V2 도메인(`partner_account -> customer -> deal`)을 기준으로 아래 3가지 생성 흐름을 실제 UI에 붙인다.

1. 고객 생성
2. 신규 컨택 생성
3. 일정 생성

이 문서에서는 `신규 컨택`을 `current_stage = "contact"` 인 거래건 생성으로 해석한다.

또한 일정은 두 갈래로 나눈다.

1. 컨택/견적 단계의 후속 일정: `calendar_events.source_type = "meeting"`
2. 확정/설치 단계의 설치 일정: `installation_events` + `calendar_events.source_type = "installation"`

## 현재 상태 요약

현재 `/partner`는 조회 UI는 꽤 진행되어 있지만 생성 UI는 비어 있다.

- 홈/대시보드: [components/partner-portal/home/PartnerPortalHome.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/components/partner-portal/home/PartnerPortalHome.tsx)
- 상세 워크스페이스: [app/partner/(portal)/workspace/page.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/partner/(portal)/workspace/page.tsx)
- 캘린더 조회: [app/partner/(portal)/calendar/page.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/partner/(portal)/calendar/page.tsx)
- 고객 API: [app/api/partner/customers/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/customers/route.ts)
- 거래 API: [app/api/partner/deals/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/deals/route.ts)
- 캘린더 API: [app/api/partner/calendar/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/calendar/route.ts)

현재 확인된 갭은 아래와 같다.

- `/api/partner/customers`, `/api/partner/deals`, `/api/partner/calendar` 가 모두 조회 전용이다.
- V2 스키마에는 `customers`, `deals`, `installation_events`, `calendar_events`, `activity_logs` 가 있지만 파트너 쓰기 BFF가 없다.
- 네비게이션에는 고객/거래 생성 진입점이 없다.
- [app/partner/schedule/page.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/partner/schedule/page.tsx)는 구 `install_schedules` 기반 레거시 화면이라 V2 흐름과 분리돼 있다.
- 머지체크 워크스페이스에는 고객 목록/폼 초안이 있지만 현재 라우트 구조와 API 이름이 맞지 않는다.

## 기준 문서

이 계획은 아래 문서의 기준을 UI에 반영한다.

- [partner-portal-guidelines.md](../archive/partner-portal-guidelines.md) (아카이브)
- [partner-portal-master-spec.md](./partner-portal-master-spec.md)
- [partner-portal-product-plan.md](../archive/partner-portal-product-plan.md) (아카이브)
- [partner-portal-screen-layout.md](../archive/partner-portal-screen-layout.md) (아카이브)

특히 아래 원칙을 그대로 따른다.

- 단계 흐름은 `컨택 -> 견적 -> 계약 -> 확정 -> 설치 -> 수납`
- `확정 -> 설치` 단계에서는 설치 일정 생성 CTA를 바로 노출
- 일정 생성 시 캘린더에 즉시 반영
- 고객 생성/수정, 일정 생성/수정/확정/완료 로그를 `activity_logs` 에 남김

## 적용 범위

### 1. 고객 생성

목표는 고객만 등록하는 단순 입력이 아니라, 이후 컨택/거래 생성으로 자연스럽게 이어지는 진입점을 만드는 것이다.

필수 필드:

- `name`
- `contact_name`
- `phone`
- `region_label`

선택 필드:

- `email`
- `address`
- `business_number`
- `campus_name`
- `notes`

생성 결과:

- `customers` 신규 row 생성
- `activity_logs` 에 `customer_created`

### 2. 신규 컨택 생성

신규 컨택은 고객 하위에 첫 거래건을 만드는 흐름이다.

필수 필드:

- `customer_id`
- `title`
- `expected_amount` 또는 비어 있음
- `notes`

기본값:

- `status = "active"`
- `current_stage = "contact"`
- `payment_status = "unpaid"`

생성 결과:

- `deals` 신규 row 생성
- 필요 시 `deal_code` 자동 발급
- `activity_logs` 에 `deal_created`, `deal_stage_changed(contact)`

### 3. 일정 생성

일정은 UI에서 한 모달로 시작하되 저장 시 타입에 따라 분기한다.

공통 입력:

- 일정 종류: `meeting` 또는 `installation`
- `starts_at`
- `ends_at`
- `timezone`
- `location`
- `description`

`meeting` 저장 결과:

- `calendar_events` 생성
- `source_type = "meeting"`
- 필요 시 `customer_id`, `deal_id` 연결
- `activity_logs` 에 `meeting_scheduled`

`installation` 저장 결과:

- `installation_events` 생성
- 동일 정보를 기반으로 `calendar_events` 생성 또는 동기화
- `source_type = "installation"`
- `activity_logs` 에 `installation_scheduled`

## UI 진입점 설계

### A. 홈 `/partner`

현재 홈은 KPI, 파이프라인, 일정/액션 큐 중심이다. 여기에 생성 CTA를 추가한다.

추가 CTA:

- `새 고객`
- `신규 컨택`
- `일정 추가`

배치 원칙:

- 상단 `PortalNav` 아래 또는 Today Strip 우측에 primary CTA 배치
- 빠른 액션 카드와 상세 워크스페이스 이동이 분리되지 않도록 모달/시트 오픈 우선

### B. 워크스페이스 `/partner/workspace`

이 화면이 가장 자연스러운 생성 허브다.

추가 위치:

- 좌측 고객 리스트 상단: `새 고객`
- 고객 상세 헤더: `신규 컨택`
- 거래 상세 헤더: `일정 추가`

이유:

- 고객 생성 후 바로 해당 고객을 선택 상태로 둘 수 있다
- 신규 컨택 생성 후 바로 해당 거래 상세를 우측 패널에 로드할 수 있다
- 일정 생성 후 해당 거래의 `installations` 와 `calendar_events` 를 즉시 갱신할 수 있다

### C. 캘린더 `/partner/calendar`

현재는 조회 전용이므로 아래 기능을 추가한다.

- 우측 패널 상단: `일정 추가`
- 날짜 선택 상태에서 생성 시 `starts_at`, `ends_at` 기본값 자동 채움
- meeting/installation 필터를 생성 폼에도 그대로 반영

## API/BFF 작업 계획

### 1. 고객 쓰기

대상 파일:

- [app/api/partner/customers/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/customers/route.ts)
- [app/api/partner/customers/[customerId]/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/customers/[customerId]/route.ts)

추가 메서드:

- `POST /api/partner/customers`
- `PATCH /api/partner/customers/[customerId]`

서버 처리:

- `resolvePartnerAccountContext()` 로 계정 확인
- `partnerAccountId` 를 body 에서 받지 않고 서버에서 강제 주입
- `createSupabaseAdminClient()` 로 insert/update
- 성공 시 `activity_logs` 기록

### 2. 신규 컨택 쓰기

대상 파일:

- [app/api/partner/deals/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/deals/route.ts)

추가 메서드:

- `POST /api/partner/deals`

서버 처리:

- 선택된 `customer_id` 가 현재 파트너 계정 소속인지 검증
- `deal_code` 자동 생성 helper 필요
- 기본 stage/status/payment_status 채움
- 성공 시 `activity_logs` 기록

### 3. 일정 쓰기

대상 파일:

- [app/api/partner/calendar/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/calendar/route.ts)
- 신규 후보: `app/api/partner/installations/route.ts`

권장 방향:

- meeting 일정은 `calendar` route 에서 처리
- installation 일정은 `installations` route 에서 처리하고 저장 후 calendar projection 을 같이 수행

이유:

- 설치는 `installation_events` 와 `calendar_events` 두 엔티티를 같이 다뤄야 해서 route 분리가 더 안전하다
- meeting 은 캘린더 단일 레이어에 머물기 때문에 `calendar` route 가 자연스럽다

## Repository/Service 분리

읽기 레이어는 이미 존재하므로 쓰기 레이어를 분리한다.

권장 신규 파일:

- `lib/partner-portal/repositories/customers-write.ts`
- `lib/partner-portal/repositories/deals-write.ts`
- `lib/partner-portal/repositories/calendar-write.ts`
- `lib/partner-portal/repositories/installations-write.ts`
- `lib/partner-portal/services/activity-log-write.ts`
- `lib/partner-portal/services/calendar-projection.ts`

핵심 역할:

- customers-write: customer insert/update
- deals-write: deal insert 및 deal code 생성
- calendar-write: meeting/internal/document_due create/update
- installations-write: installation create/update/status change
- activity-log-write: action_type, target_type, summary 표준화
- calendar-projection: installation event를 공용 calendar event로 반영

## UI 컴포넌트 분해안

권장 신규 컴포넌트:

- `components/partner-portal/crud/CustomerSheet.tsx`
- `components/partner-portal/crud/DealQuickCreateSheet.tsx`
- `components/partner-portal/crud/ScheduleSheet.tsx`
- `components/partner-portal/crud/PartnerCrudToast.tsx`

권장 공통 패턴:

- 모달보다 우측 시트 우선
- 생성 성공 후 현재 뷰를 덮어쓰지 말고 대상 엔티티를 선택 상태로 전환
- optimistic UI 는 최소화하고 저장 후 리페치 우선

폼 UX 원칙:

- 고객 생성 후 `바로 신규 컨택 만들기` 체크박스 제공
- 신규 컨택 생성 후 `후속 일정 바로 만들기` 체크박스 제공
- 일정 생성 폼에서 `meeting / installation` 전환 시 필드 그룹만 바뀌고 모달은 유지

## 상태 전환 연결

이 기능은 단순 CRUD 로 끝내지 않고 단계 CTA 와 이어져야 한다.

1. `새 고객`
   고객 등록 후 워크스페이스 좌측 리스트에서 즉시 선택
2. `신규 컨택`
   거래 생성 후 우측 상세 패널을 해당 deal 로 전환
3. `일정 추가`
   meeting 이면 캘린더와 활동 로그 갱신
   installation 이면 설치 탭과 캘린더를 동시 갱신

추가로 확정 단계 CTA 와도 연결한다.

- 거래 단계가 `confirmed` 일 때 헤더 1차 CTA 는 `설치 일정 생성`
- 해당 CTA 는 `ScheduleSheet(type=installation)` 를 바로 연다

## 로그/감사 기준

반드시 남길 action_type 초안:

- `customer_created`
- `customer_updated`
- `deal_created`
- `deal_stage_changed`
- `meeting_scheduled`
- `meeting_rescheduled`
- `installation_scheduled`
- `installation_updated`
- `installation_confirmed`
- `installation_completed`

로그 summary 예시:

- `강남메가스터디학원 고객이 생성됨`
- `강남메가스터디학원 / 본관 추가 계약 컨택 거래가 생성됨`
- `본관 2층 설치 미팅 일정이 등록됨`
- `본관 2층 설치 일정이 4월 20일로 확정됨`

## 단계별 구현 순서

### Phase 1. 쓰기 API 열기

목표:

- 고객/거래/일정 생성 API 추가
- activity_logs 기록

완료 기준:

- POST/PATCH 호출이 실제 DB row 를 만든다
- 잘못된 account/customer/deal 참조는 4xx 로 막힌다

### Phase 2. 워크스페이스 생성 UI

목표:

- `/partner/workspace` 에서 `새 고객`, `신규 컨택`, `일정 추가` 가능

완료 기준:

- 생성 후 선택 상태가 즉시 바뀐다
- 새로고침 없이 목록/상세가 갱신된다

### Phase 3. 홈 CTA 연결

목표:

- `/partner` 홈에서도 동일한 시트를 열 수 있게 연결

완료 기준:

- 홈에서 생성 후 `/partner/workspace` 로 이동하거나 상태가 반영된다

### Phase 4. 캘린더 생성/수정 UI

목표:

- `/partner/calendar` 에서 meeting/installation 일정 생성 및 수정 가능

완료 기준:

- 날짜 셀 선택 기반 일정 생성
- 생성 즉시 리스트/월간 뷰 반영

### Phase 5. 레거시 일정 화면 정리

대상:

- [app/partner/schedule/page.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/partner/schedule/page.tsx)
- [app/api/partner/schedules/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/schedules/route.ts)

방향:

- V2 설치/캘린더 UI 가 안정화되면 `/partner/schedule` 는 `/partner/calendar` 또는 `/partner/workspace` 로 통합
- 구 `install_schedules` 는 신규 기능 추가 없이 유지 또는 제거 판단

## 바로 구현할 파일 우선순위

1. [app/api/partner/customers/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/customers/route.ts)
2. [app/api/partner/customers/[customerId]/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/customers/[customerId]/route.ts)
3. [app/api/partner/deals/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/deals/route.ts)
4. [app/api/partner/calendar/route.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/api/partner/calendar/route.ts)
5. [app/partner/(portal)/workspace/page.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/partner/(portal)/workspace/page.tsx)
6. [components/partner-portal/home/PartnerPortalHome.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/components/partner-portal/home/PartnerPortalHome.tsx)
7. [app/partner/(portal)/calendar/page.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/partner/(portal)/calendar/page.tsx)
8. [components/partner-portal/PortalNav.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/components/partner-portal/PortalNav.tsx)

## 리스크

### 1. V2/legacy 이중 구조

`partner-read` 가 `v2 -> legacy -> demo` fallback 구조라서 생성은 V2에만 쓰고 조회는 legacy/demo 로 떨어질 수 있다.

대응:

- 생성 성공 후 해당 계정은 가능하면 V2 데이터가 우선 조회되도록 유지
- 생성 UI 는 `context.source === "legacy"` 인 계정에서 비활성화하거나 경고 노출 검토

### 2. 일정 엔티티 이원화

현재 설치 일정은 레거시 `install_schedules` 와 V2 `installation_events/calendar_events` 가 공존한다.

대응:

- 신규 UI 는 V2만 사용
- 레거시 화면은 migration bridge 전까지 읽기 전용 또는 유지보수 최소화

### 3. 로그 누락

생성/수정 기능을 빠르게 붙이면 `activity_logs` 누락 가능성이 크다.

대응:

- API route 에서 직접 insert 하지 말고 write service 로 통일
- customer/deal/schedule 저장과 log 저장을 같은 흐름에서 처리

## 추천 실행 순서

이번 작업은 아래 순서가 가장 안전하다.

1. partner write API 추가
2. workspace 에 고객/컨택/일정 시트 추가
3. 홈 CTA 연결
4. 캘린더 편집 기능 연결
5. 레거시 `/partner/schedule` 정리

이 순서로 가면 사용자는 가장 먼저 `/partner/workspace` 에서 end-to-end 생성이 가능해지고, 이후 홈/캘린더는 같은 시트를 재사용하는 구조로 확장할 수 있다.
