# Partner Portal Implementation Roadmap

기준 시점: 2026-04-04  
최종 갱신: 2026-04-04

이 문서는 파트너 포털 구현에 바로 들어가기 위한 실전 로드맵이다.
기획 문서가 아니라 `무엇을 먼저 바꾸고, 어떤 구조로 갈지`를 결정하기 위한 개발 기준 문서다.

## 현재 진행 상황

### ✅ 완료

- **Phase 1 — 모델 교정**
  - `supabase/migrations/20260404_partner_portal_v2_domain.sql` — V2 도메인 전체 migration (17개 테이블, RLS, 뷰, 트리거, 인덱스)
  - `lib/partner-portal/types.ts` — 포털 도메인 타입 (API/컴포넌트 공용)
  - `lib/supabase/database.types.v2.ts` — Supabase DB row 타입 + Insert/Update helpers
  - `app/admin/partners/page.tsx` — 어드민 파트너 워크스페이스 UI 개선 (검색, 스테이지 시각화, 탭 패널)
  - `components/partner-portal/home/PartnerPortalHome.tsx` — 파트너 홈 전면 재설계 (파이프라인 보드, 액션 큐, KPI, 일정)

### 🔜 다음 작업 (Phase 2 — API 연결)

우선순위 순:

1. `app/api/partner/overview/route.ts` — 홈 KPI + 파이프라인 데이터 (현재 데모 데이터)
2. `app/api/partner/deals/route.ts` — 거래건 목록 + 필터
3. `app/api/partner/customers/route.ts` — 고객 목록
4. `app/api/partner/activity/route.ts` — 활동 로그
5. `app/api/partner/calendar/route.ts` — 일정 (설치 + 미팅)

> API 없이는 홈/워크스페이스가 전부 데모 데이터로 동작한다.
> Phase 2가 완료돼야 Phase 3 (워크스페이스 재구성), Phase 4 (어드민 CRUD)로 이어질 수 있다.

관련 문서:

- [partner-portal-guidelines.md](./partner-portal-guidelines.md)
- [partner-portal-product-plan.md](./partner-portal-product-plan.md)
- [partner-portal-document-hub-execution-plan.md](./partner-portal-document-hub-execution-plan.md)

메모:

- 문서 허브를 `만들기 / 발송하기 / 보기·정리` 3축으로 재구성하는 작업은 `partner-portal-document-hub-execution-plan.md`를 우선 기준으로 본다.

## 1. 가장 먼저 짚어야 할 구조 문제

현재 코드 기준의 `partner`는 실제 요구사항의 `파트너사 대표`가 아니라
사실상 `고객 기관`에 가깝다.

예:

- `partners` 테이블에 기관명, 담당자, 주소, 사업자번호가 들어가 있음
- `partner_users`는 그 기관에 속한 사용자처럼 설계돼 있음
- `/api/partner/data`는 `partner_id` 하나의 문서/수납/계약만 조회함

하지만 현재 요구사항은 다르다:

- 로그인 사용자는 `파트너사 대표 1인`
- 그 대표가 `여러 고객 기관`을 관리
- 고객 기관 아래에 `여러 거래건`이 존재

즉, 현 구조는 도메인 모델이 한 단계 부족하다.

## 2. 지금이 모델을 바로잡기 가장 좋은 시점인 이유

- 과거 데이터 이관 부담이 없음
- 고객 정보 CSV 등록은 앞으로 넣으면 됨
- 실제 운영 전에 도메인 개념을 고치지 않으면 나중에 UI/권한/API를 전부 다시 뜯어야 함

결론:

- 지금 `partners`를 억지로 연장하지 말고
- `파트너사 계정`과 `고객 기관`을 분리하는 쪽으로 가는 것이 맞다

## 3. 목표 데이터 모델

## 3-1. 상위 엔티티

### A. partner_accounts

의미:

- 총판/리셀러/파트너사 자체
- 로그인 주체

필드 예시:

- id
- name
- owner_name
- email
- phone
- business_number
- address
- status
- created_at
- updated_at

### B. partner_account_users

의미:

- 파트너사 로그인 계정
- 현재는 대표 1인만 상정

필드 예시:

- id
- user_id
- partner_account_id
- role (`owner`)
- status
- last_login_at

### C. customers

의미:

- 실제 고객 기관
- 학원, 지점, 기관 단위

필드 예시:

- id
- partner_account_id
- name
- contact_name
- email
- phone
- address
- business_number
- campus_name
- region_label
- notes
- created_at
- updated_at

### D. deals

의미:

- 고객 기관과 진행 중인 하나의 상업 거래
- 실질적인 운영 중심 엔티티

필드 예시:

- id
- customer_id
- deal_code
- title
- status
- expected_amount
- contracted_amount
- installed_amount
- paid_amount
- outstanding_amount
- current_stage
- started_at
- closed_at
- notes
- created_at
- updated_at

권장 단계:

- `contact`
- `quote`
- `contract`
- `confirmed`
- `installation`
- `payment`
- `closed`
- `cancelled`

## 3-2. 하위 엔티티

### E. deal_line_items

필요 이유:

- 거래 금액과 설치 완료 금액 산정의 기준
- 기본 단가를 쓰되 건별 수정 필요

필드 예시:

- id
- deal_id
- sku
- category (`board` / `camera` / `mount` / `install_fee`)
- product_name
- quantity
- unit_price
- amount
- sort_order

### F. quote_documents / quote_document_versions

필요 이유:

- 고객에게 공유되는 견적 링크는 버전 고정
- 관리자만 버전 이력 조회

필드 예시:

- quote_documents
  - id
  - deal_id
  - quote_number
  - current_version_id
  - status
  - created_at
- quote_document_versions
  - id
  - quote_document_id
  - version_number
  - title
  - content_html or structured_json
  - subtotal / tax / total
  - valid_until
  - created_by
  - created_at
- quote_document_shares
  - id
  - quote_document_version_id
  - token
  - access_mode
  - expires_at
  - created_at

### G. contract_documents / contract_document_versions

견적과 동일 구조를 권장한다.

추가 필드:

- sign_status
- partner_signed_at
- partner_signature_url
- admin_signed_at
- admin_signature_url

### H. installation_events

필요 이유:

- 거래건 하나에 설치 일정 여러 개
- 하루 단위가 아니라 시간 범위/서버 타임 가능성 고려

필드 예시:

- id
- deal_id
- customer_id
- scheduled_start_at
- scheduled_end_at
- timezone
- location
- assigned_team
- status (`planned`, `confirmed`, `in_progress`, `completed`, `paused`, `cancelled`)
- created_by_role
- notes
- created_at
- updated_at

### I. payments / receipts

필요 이유:

- 분할 입금이 기본
- 영수증과 입금 기록이 1:1이 아닐 수 있음

권장 분리:

- payments
  - 실제 입금 기록
- receipts
  - 외부 발행 문서 기록

필드 예시:

- payments
  - id
  - deal_id
  - amount
  - paid_at
  - payment_method
  - memo
  - created_at
- receipts
  - id
  - deal_id
  - payment_id nullable
  - receipt_number
  - total_amount
  - pdf_url
  - created_at

### J. activity_logs

필요 이유:

- 이 제품의 실제 운영 본체

필드 예시:

- id
- partner_account_id
- customer_id nullable
- deal_id nullable
- actor_user_id nullable
- actor_role
- action_type
- target_type
- target_id
- summary
- before_json
- after_json
- created_at

### K. calendar_events

필요 이유:

- 설치 일정과 미팅 일정, 내부 일정이 같은 캘린더 레이어를 공유해야 함

필드 예시:

- id
- source_type (`meeting`, `installation`, `document_due`, `internal`)
- source_id
- partner_account_id
- customer_id nullable
- deal_id nullable
- starts_at
- ends_at
- timezone
- title
- description
- status

## 4. 현재 구조에서 어떻게 옮길지

## 4-1. 현재와 목표의 대응

현재:

- `partners` = 사실상 고객 기관
- `partner_users` = 고객 기관 계정처럼 동작
- `quotes/contracts/receipts` = 고객 기관 단위 귀속

목표:

- `partner_accounts` = 파트너사 대표 로그인 주체
- `customers` = 고객 기관
- `deals` = 실제 운영 단위
- 문서/설치/수납 = 거래건 귀속

### 전략

권장 전략은 `재정의 + 신규 테이블`이다.

즉:

- `partners`를 연장하는 대신 새 모델을 만든다
- 지금 코드가 많은 이유는 이미 `partner`라는 이름이 고객기관 의미로 굳어 있기 때문
- 이름을 살려두면 앞으로 계속 혼란이 생긴다

추천:

- `partners` 테이블은 단계적으로 폐기
- 새 기준은 `partner_accounts + customers + deals`

## 4-2. 다만 현실적인 단계적 전환도 가능

바로 전체 변경이 부담이면 중간 단계로:

- 현재 `partners`를 `customers` 역할로 임시 유지
- `partner_accounts` 와 `deals` 만 먼저 추가
- UI는 거래건 중심으로 먼저 전환

이렇게도 가능하다.

하지만 최종 목적지는 `고객 기관`과 `파트너 계정`의 분리다.

## 5. 페이지 구조 제안

## 5-1. 관리자 앱

### `/admin/partners`

이 페이지는 이름상 `파트너`지만 실제로는
`Commercial Workspace`로 바꾸는 것이 좋다.

구성:

- 좌측: 고객 기관 목록
- 중앙: 선택 기관의 거래건 보드
- 우측: 선택 거래건 상세 패널

보드 상태 컬럼:

- 컨택
- 견적
- 계약
- 확정
- 설치
- 수납

각 카드에 보여줄 것:

- 거래건 제목
- 현재 금액
- 최근 문서 상태
- 설치 일정 여부
- 미수 여부

### `/admin/documents`

문서 전용 허브:

- 견적서
- 계약서
- 버전 이력
- 공유 링크
- PDF

### `/admin/installs`

설치 전용 화면:

- 리스트
- 칸반
- 캘린더

### `/admin/payments`

수납/미수 전용 화면:

- 실수납 누계
- 미수금
- 미수 기관
- 영수증 발행

### `/admin/calendar`

공용 캘린더:

- 미팅
- 설치
- 내부 일정
- 문서 due

기존 [app/admin/calendar/page.tsx](../../app/admin/calendar/page.tsx) 를 베이스로 확장 가능

## 5-2. 파트너 포털

### `/partner`

홈:

- 오늘 할 일
- 서명 대기
- 설치 예정
- 미수 경고
- 최근 활동

### `/partner/deals`

거래건 메인 화면:

- 로드맵 보드
- 거래 카드
- 상태 전환 CTA

### `/partner/calendar`

공용 일정의 파트너 뷰:

- 설치 일정
- 미팅 일정

### `/partner/documents`

문서 허브:

- 견적서
- 계약서
- 발송 링크
- PDF

## 6. 거래건 상세 탭 구성

### 탭 1. Overview

- 현재 단계
- 핵심 KPI
- 최근 액션
- 다음 단계 CTA

### 탭 2. Documents

- 견적서 카드
- 계약서 카드
- 버전 이력 접기/펼치기
- 링크 복사
- PDF

### 탭 3. Installations

- 복수 일정 리스트
- 보드/타임라인 전환
- 일정 추가
- 일정 수정
- 일정 확정

### 탭 4. Payments

- 거래 금액
- 실수납액
- 미수금
- 입금 기록
- 영수증 기록

### 탭 5. Activity

- 미팅 로그
- 상태 변경 로그
- 문서 로그
- 설치 로그
- 수납 로그

## 7. UX 핵심 규칙

### A. 다음 단계 CTA는 전역 동작이어야 한다

탭마다 따로 데이터 입력을 반복하지 않는다.

예:

- 견적 완료 -> `계약으로 진행`
- 계약 완료 -> `확정 처리`
- 확정 -> `설치 일정 생성`
- 설치 완료 -> `수납 등록`

### B. 단계 전환 시 필요한 하위 객체를 바로 생성

예:

- `설치 일정 생성` 클릭 -> 설치 일정 생성 모달 + 캘린더 반영
- `수납 등록` 클릭 -> 입금 입력 모달 + 미수 계산

### C. 시각적 흐름이 중요하다

이 제품은 표 몇 개로 끝나면 안 된다.

반드시:

- 상태 흐름
- 카드 스택
- 타임라인
- 경고 배지

가 함께 보여야 한다.

## 8. 구현 단계

## Phase 1: 모델 교정

- 새 스키마 문서화
- `partner_accounts`
- `customers`
- `deals`
- 문서 버전 모델
- 설치/수납/활동 로그 모델

산출물:

- SQL migration draft
- TypeScript types draft

## Phase 2: API 교정

- `/api/partner/data` 재설계
- 거래건 중심 API 추가
- 문서 버전 공유 route 추가
- 설치 일정 공용 캘린더 연동 API 추가

산출물:

- partner API
- admin API
- calendar sync API

## Phase 3: 관리자 Workspace 재구성

- [app/admin/partners/page.tsx](../../app/admin/partners/page.tsx) 분해
- 기관 + 거래건 보드 구조 도입
- 문서 / 설치 / 수납 패널 분리

산출물:

- 상업 운영 메인 화면

## Phase 4: 파트너 포털 재구성

- [app/partner/dashboard/page.tsx](../../app/partner/dashboard/page.tsx) 를
  문서 허브에서 거래 허브로 승격
- 캘린더, 수납, 활동 로그 추가

산출물:

- 대표용 포털 메인

## Phase 5: 캘린더 통합

- 설치/미팅/내부 일정 통합
- 관리자 캘린더와 파트너 캘린더 같은 원본 사용

산출물:

- calendar_events 기반 공용 일정 계층

## 9. 권장 모듈 분해

### A. 도메인 / 마이그레이션

- `lib/supabase/database.types.ts`
- `supabase/migrations/*`

여기서 먼저 아래 엔티티를 정의한다.

- `partner_accounts`
- `partner_account_users`
- `customers`
- `deals`
- `deal_line_items`
- 문서 version/share
- `installation_events`
- `payments`
- `receipts`
- `activity_logs`
- `calendar_events`

### B. 인증 / 세션 컨텍스트

권장 공통 helper:

- `resolvePartnerAccountContext()`

적용 대상:

- `app/api/partner/session`
- `app/api/partner/data`
- `app/api/partner/schedules`

원칙:

- `partner_id` 단일 키에서 멈추지 않고
- `partnerAccountId / customerId / dealId` 기준으로 맥락을 올린다

### C. 상업 도메인 repository / service

권장 경로:

- `lib/partner-portal/types.ts`
- `lib/partner-portal/repositories/customers.ts`
- `lib/partner-portal/repositories/deals.ts`
- `lib/partner-portal/repositories/quote-documents.ts`
- `lib/partner-portal/repositories/contract-documents.ts`
- `lib/partner-portal/repositories/payments.ts`
- `lib/partner-portal/repositories/installations.ts`
- `lib/partner-portal/repositories/activity-logs.ts`
- `lib/partner-portal/repositories/calendar-events.ts`
- `lib/partner-portal/services/deal-transitions.ts`
- `lib/partner-portal/services/calendar-projection.ts`

### D. Partner / Admin BFF API

권장 분해:

- `app/api/partner/overview/route.ts`
- `app/api/partner/deals/route.ts`
- `app/api/partner/documents/route.ts`
- `app/api/partner/payments/route.ts`
- `app/api/partner/activity/route.ts`
- `app/api/partner/calendar/route.ts`

원칙:

- 기존 `app/api/partner/sign`은 유지
- 기존 `app/api/partner/data`는 점진적으로 축소
- 관리자용도 같은 도메인 모델 위에서 별도 commercial BFF로 정리

### E. 관리자 Commercial Workspace UI

권장 분해:

- `components/admin/commercial/CustomerList.tsx`
- `components/admin/commercial/DealsBoard.tsx`
- `components/admin/commercial/DealDetailPanel.tsx`
- `components/admin/commercial/tabs/OverviewTab.tsx`
- `components/admin/commercial/tabs/DocumentsTab.tsx`
- `components/admin/commercial/tabs/InstallationsTab.tsx`
- `components/admin/commercial/tabs/PaymentsTab.tsx`
- `components/admin/commercial/tabs/ActivityTab.tsx`
- `components/admin/commercial/modals/*`

원칙:

- [app/admin/partners/page.tsx](../../app/admin/partners/page.tsx) 는 shell만 남기고 분해한다
- 좌측 고객 목록 + 중앙 거래 보드 + 우측 거래 상세 패널 구조를 기준으로 한다

### F. 파트너 포털 UI

권장 경로:

- `app/partner/page.tsx`
- `app/partner/deals/page.tsx`
- `app/partner/documents/page.tsx`
- `app/partner/calendar/page.tsx`
- `app/partner/payments/page.tsx`

원칙:

- 현재 `app/partner/dashboard/page.tsx`는 문서 허브 성격으로 축소하거나 새 구조로 흡수
- 관리자와 같은 BFF, 같은 캘린더 원본을 재사용

### G. 공용 캘린더

원칙:

- `lib/calendar-data.ts`는 제거 대상
- `calendar_events`를 원본으로 두고
- 설치 / 문서 due / 내부 일정을 projection service로 올린다

### H. 기관 상세 조회 최적화

기관 상세는 거래 이력과 세부 내역을 바로 봐야 하므로,
아래 집계 뷰를 먼저 활용하는 쪽이 좋다.

- `customer_deal_summary`
- `customer_deal_history`

## 10. 현재 코드 기준에서 가장 먼저 건드릴 파일

1. `lib/supabase/database.types.ts`
2. `supabase/migrations/*`
3. `app/api/partner/data/route.ts`
4. `app/api/partner/schedules/route.ts`
5. `app/admin/partners/page.tsx`
6. `app/partner/dashboard/page.tsx`
7. `app/admin/calendar/page.tsx`
8. `components/admin/AdminSidebar.tsx`

## 11. 가장 중요한 한 줄 결론

지금 구현의 핵심은 화면 꾸미기가 아니라
`partner = 고객기관`으로 굳어진 현재 모델을
`partner account -> customer -> deal` 구조로 바로잡는 것이다.

이걸 먼저 해결하면, 이후 문서/설치/수납/캘린더는 자연스럽게 정리된다.
