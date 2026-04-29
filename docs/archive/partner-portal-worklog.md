# Partner Portal Worklog

기준 시점: 2026-04-04

이 문서는 파트너 포털 관련 `작업 내역`, `현재 산출물`, `우선순위 To-do`를 한 번에 관리하기 위한 작업 로그다.
세부 규칙은 마스터 스펙과 연결하고, 이 문서는 실제 진행 상황을 추적하는 용도로 쓴다.

관련 문서:

- [partner-portal-master-spec.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-master-spec.md)
- [partner-portal-guidelines.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-guidelines.md)
- [partner-portal-product-plan.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-product-plan.md)
- [partner-portal-screen-layout.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-screen-layout.md)
- [partner-portal-implementation-roadmap.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-implementation-roadmap.md)

## 1. 이번 라운드에서 정리한 핵심 판단

- `plan_1.md`는 초기안으로 두고, 최신 기준은 새 파트너 포털 문서 체계를 따른다.
- 포털의 로그인 주체는 `파트너사 대표 1인`이다.
- 고객은 로그인 사용자가 아니라 `링크/PDF 기반 열람/서명 사용자`다.
- 견적서와 계약서 모두 `버전 고정 링크` 원칙을 따른다.
- 도메인 중심은 `기관(Customer)`이 아니라 `거래건(Deal)`이다.
- 설치 일정은 `복수 일정 + 시간 범위`를 기본으로 한다.
- 수납은 `분할 입금 + 미수금`을 전제로 한다.
- 관리자와 파트너는 같은 상업 데이터 원본을 공유하되, 화면 맥락만 다르게 간다.

## 2. 정리된 문서 구조

### A. 기준 문서

- [partner-portal-master-spec.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-master-spec.md)
  - 단일 진입 문서
  - 제품 정의, IA, 화면 구조, 상태 전환, 구현 순서 요약

### B. 규칙 문서

- [partner-portal-guidelines.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-guidelines.md)
  - 사용자/권한
  - 문서 규칙
  - 로그 원칙
  - KPI 원칙

### C. 화면/UX 문서

- [partner-portal-product-plan.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-product-plan.md)
- [partner-portal-screen-layout.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-screen-layout.md)

### D. 구현 문서

- [partner-portal-implementation-roadmap.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-implementation-roadmap.md)

## 3. 이번에 추가한 실물 산출물

### 문서

- [partner-portal-master-spec.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-master-spec.md)
- [partner-portal-screen-layout.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-screen-layout.md)
- [partner-portal-implementation-roadmap.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-implementation-roadmap.md)
- [partner-portal-worklog.md](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/docs/active/partner-portal-worklog.md)

### 도메인 초안

- [20260404_partner_portal_v2_domain.sql](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/supabase/migrations/20260404_partner_portal_v2_domain.sql)
  - `partner_accounts -> customers -> deals`
  - 문서 버전/공유 링크
  - 설치 일정
  - 수납/영수증
  - 활동 로그
  - 캘린더 이벤트
  - 기관 상세용 요약/이력 view

### 타입/리포지토리 초안

- [types.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/lib/partner-portal/types.ts)
- [customers.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/lib/partner-portal/repositories/customers.ts)

## 4. 현재까지 완료된 작업

### 완료

- 파트너 포털의 최신 운영 기준 합의
- 관리자/파트너 포털 IA 재정의
- 기관 상세, 거래건 상세, 문서 허브, 설치 캘린더, 수납 허브 레이아웃 정리
- 단계 전환 CTA 원칙 정리
- 문서 버전 고정 링크 원칙 정리
- 기관 상세에서 `거래 이력 + 세부 내역`을 보도록 기준 반영
- 새 도메인 migration 초안 작성
- 새 도메인 TypeScript 타입 초안 작성
- 기관 상세 조회용 repository 초안 작성

### 아직 미완료

- 실제 DB migration 적용
- `database.types.ts`를 새 도메인 기준으로 재생성/정리
- 파트너 세션 컨텍스트 분리
- Partner/Admin BFF API 분해
- 관리자 화면/파트너 화면 실제 리팩터링

## 5. 현재 남아 있는 핵심 리스크

- 현재 코드의 `partner` 의미가 여전히 `고객 기관`에 가깝다.
- `app/api/partner/data`가 구형 모델에 묶여 있다.
- `app/admin/partners/page.tsx`가 단일 대형 파일 + 더미 모드 상태다.
- `app/admin/calendar/page.tsx`와 [calendar-data.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/lib/calendar-data.ts)는 아직 공용 `calendar_events` 구조가 아니다.
- 문서/설치/수납은 운영 규칙이 정리됐지만, 실제 API와 UI는 아직 그 규칙을 따르지 않는다.

## 6. 우선순위 To-do

### P0. 모델 기준선 고정

- [ ] [database.types.ts](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/lib/supabase/database.types.ts) 를 새 도메인과 맞추기
- [ ] [20260404_partner_portal_v2_domain.sql](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/supabase/migrations/20260404_partner_portal_v2_domain.sql) 검토 후 실제 적용 준비
- [ ] 기존 `partners`를 임시 `customers` adapter로 볼지 결정

### P1. 세션 / BFF 정리

- [ ] `resolvePartnerAccountContext()` helper 만들기
- [ ] `/api/partner/data`를 `overview / deals / documents / payments / activity / calendar`로 분해
- [ ] 기관 상세용 고객 조회 API 추가
- [ ] 거래건 상세용 deal payload API 추가

### P2. Repository / Service 확장

- [ ] `deals.ts`
- [ ] `quote-documents.ts`
- [ ] `contract-documents.ts`
- [ ] `payments.ts`
- [ ] `installations.ts`
- [ ] `activity-logs.ts`
- [ ] `calendar-events.ts`
- [ ] `deal-transitions.ts`
- [ ] `calendar-projection.ts`

### P3. 관리자 UI 리팩터링

- [ ] [page.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/admin/partners/page.tsx) 를 Commercial Workspace shell로 축소
- [ ] 고객 목록 / 거래 보드 / 거래 상세 패널 분리
- [ ] 기관 상세에서 거래 이력/세부 내역 패널 구현
- [ ] 문서/설치/수납/활동 탭 컴포넌트 분리

### P4. 파트너 포털 리팩터링

- [ ] [page.tsx](C:/Projects/PUBLIC_Classin/Classin_Home_bae_v1/app/partner/dashboard/page.tsx) 역할 재정의
- [ ] `/partner`, `/partner/deals`, `/partner/documents`, `/partner/calendar`, `/partner/payments` 구조 분리
- [ ] 홈 운영판, 거래건 상세, 수납 현황 연결

### P5. 캘린더 통합

- [ ] `calendar_events` 원본 기반으로 일정 구조 전환
- [ ] 설치 일정과 관리자 캘린더 연결
- [ ] 파트너 수정과 관리자 수정이 같은 원본을 보도록 통합

## 7. 바로 다음 추천 작업

가장 다음에 바로 들어갈 일:

1. `database.types.ts` 초안 업데이트
2. `resolvePartnerAccountContext()` 추가
3. 기관 상세 API와 거래건 상세 API 추가

이 세 가지가 되면 이후 UI 구현은 훨씬 덜 흔들린다.

## 8. 한 줄 상태 요약

지금은 `설계와 도메인 기준선`은 정리됐고,
다음부터는 `세션/BFF/실제 화면`으로 넘어가는 단계다.
