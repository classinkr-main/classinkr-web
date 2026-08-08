# Partner Portal Redistribution Plan

기준 시점: 2026-06-26
상태: 기획안
문서 목적: 기존 파트너 포털/Portal V2/견적 문서 기능을 버리지 않고, 실제 사용 주체에 맞게 어드민, 하드웨어 운영, 공개 공유 링크, 제한형 파트너 액션 포털로 재분배한다.

관련 기준 문서:

- [repository-status-2026-06-08.md](../archive/repository-status-2026-06-08.md) — 당시 경로 상태 기록
- [partner-portal-master-spec.md](./partner-portal-master-spec.md)
- [partner-portal-front-back-contract.md](./partner-portal-front-back-contract.md)
- [partner-portal-unification.md](./partner-portal-unification.md)
- [hardware-admin-hub-integration-plan.md](./hardware-admin-hub-integration-plan.md)
- [quote-lifecycle-execution-plan.md](./quote-lifecycle-execution-plan.md)
- [quick-quote-builder-plan.md](./quick-quote-builder-plan.md)
- [erp-blueprint-2026-06-22.md](./erp-blueprint-2026-06-22.md)

## 1. 결론

파트너 포털을 작은 ERP처럼 키우지 않는다.

앞으로의 기준은 아래처럼 나눈다.

```text
Internal Admin / Hardware OS
  - 내부 운영자가 매일 쓰는 원장, 견적, 계약, 설치, 수납, 재고, CRM

Portal V2 Engine
  - /api/portal, lib/portal, components/portal의 공용 도메인/API/컴포넌트

Public Share Links
  - 고객이 로그인 없이 견적, 계약, 영수증을 보는 버전 고정 외부 면

Partner Action Portal
  - 파트너가 필요한 순간만 여는 조회, 제출, 확인, 요청 인박스
```

즉, 기존 포털 기능은 삭제 대상이 아니라 재배치 대상이다.

- `quote_documents` 계열은 하드웨어 견적의 기준 모델로 유지한다.
- `/api/portal/*`와 `lib/portal/*`은 공용 도메인 엔진으로 유지한다.
- 무거운 write 업무는 `/admin`과 향후 `/admin/hardware`로 편입한다.
- 외부 사용자는 상시 로그인 포털보다 `/share/*` 링크와 필요한 제출 폼을 우선 사용한다.

## 2. 현재 사실

현재 코드 기준으로 로그인형 `app/partner` 라우트는 없다.

실제 구현은 아래에 있다.

| 영역 | 현재 위치 | 판단 |
| --- | --- | --- |
| Portal V2 API | `app/api/portal/*` | 유지. admin/partner 공용 BFF |
| Portal 도메인 | `lib/portal/*` | 유지. 문서의 `lib/partner-portal` 표현은 구경로로 본다 |
| Portal 컴포넌트 | `components/portal/*` | 유지하되 "파트너 전용 UI"가 아니라 재사용 컴포넌트로 본다 |
| 견적 작성 | `components/portal/quotes/QuickQuoteComposer.tsx`, `components/admin/documents/HardwareQuotesPanel.tsx` | 어드민 하드웨어 견적 작성기로 승격 |
| 공개 견적 | `app/share/quote/[token]` | 유지. 고객용 버전 고정 링크 |
| 공개 계약 | `app/share/contract/[token]` | V1 기반 흔적. V2 계약 공유/서명과 정렬 필요 |
| 어드민 운영 | `app/admin/commercial`, `app/admin/crm/**`, `app/admin/quotes` | 실제 운영 화면. 하드웨어 허브로 수렴 후보 |
| 구 파트너/문서 모델 | V1 `partners`, `quotes`, `contracts`, `receipts` | 호환/마이그레이션 대상 |

[repository-status-2026-06-08.md](../archive/repository-status-2026-06-08.md)는 `app/partner`, `app/api/partner`, `components/partner-portal`, `lib/partner-portal` 표현을 히스토리로 보라고 정리한다. 이 문서도 그 기준을 따른다.

## 3. 소유 경계

도메인 기준은 아래처럼 고정한다.

| 개념 | 기준 |
| --- | --- |
| Tenant/security owner | `partner_accounts.id` |
| 고객/기관 | `customers` |
| 운영 단위 | `deals` |
| 견적 | `quote_documents` + `quote_document_versions` + `quote_document_shares` |
| 계약 | `contract_documents` + `contract_document_versions` + `contract_document_shares` |
| 수납/영수 | `payments`, `receipts` |
| 감사 로그 | `activity_logs` |

신규 설계에서 `partner`라는 단어는 사람/역할 표현으로만 쓰고, 데이터 소유 단위는 `partner_accounts`로 부른다.

## 4. 기능 재배치

| 기능 | 보존할 엔진 | 새 제품 면 | 정책 |
| --- | --- | --- | --- |
| 고객/기관 관리 | `/api/portal/customers`, `lib/portal/repositories/customers.ts` | Admin CRM/Hardware | 내부는 full CRUD, 파트너는 제출/수정 요청 중심 |
| 딜/운영 케이스 | `/api/portal/deals`, `lib/portal/repositories/deals.ts` | Admin CRM/Hardware | `deal`이 문서/설치/수납의 중심 |
| 빠른 견적 작성 | `QuickQuoteComposer`, `HardwareQuotesPanel` | `/admin/hardware`의 견적/문서 탭 | `/admin/quotes`는 당분간 alias 또는 유지 |
| 견적 버전/공유 | `quote_documents` 계열, `/api/portal/quotes/*` | Admin 문서 허브 + `/share/quote/[token]` | 고객 발송 견적은 V2 문서형 견적만 새 기준 |
| 견적 검토 확인 | `/share/quote/[token]`, `activity_logs` | Public share | 현재 유지 |
| 견적 진행 요청 | `public_quote_accepted` 로그 모델 | Public share -> Admin follow-up queue | 다음 P0 기능 |
| 계약 전환 | `/api/portal/quotes/[id]/convert` | Admin 문서 상세 | accepted version 우선 원칙 유지 |
| 계약 공유/서명 | `/api/portal/contracts/*` | V2 `/share/contract/[token]` | legacy 공개 계약 페이지와 정렬 필요 |
| 수납/영수증 | `/api/portal/payments`, `/api/portal/receipts` | Admin Hardware settlement | partner/public은 조회 중심. write는 admin-only |
| 설치/캘린더 | deal detail의 installation/calendar 데이터 | Admin Hardware ops + partner 제출/확인 | 파트너는 일정 후보/확정 요청 중심 |
| 파일/현장 정보 제출 | 새 제출 폼 또는 token link | Public/Partner action | 원장 직접 수정이 아니라 제출 이벤트 |
| 문서센터/매뉴얼 | `/docs`, `/admin/docs` | Content/Admin Docs | 파트너 포털에 흡수하지 않는다 |
| 모바일 AI 실행기 | 계획 문서 | 보류 | partner 상시 포털을 키운 뒤가 아니라, 액션 인박스 검증 후 판단 |

## 5. 권한 매트릭스

| 작업 | Admin | Partner | Public token |
| --- | --- | --- | --- |
| 고객/기관 생성 | 가능 | 요청 또는 제한 생성 | 불가 |
| 고객/기관 삭제 | 가능하되 archive 우선 | 불가 | 불가 |
| 딜 생성/단계 전환 | 가능 | 요청 또는 제한 액션 | 불가 |
| 라인아이템/가격 수정 | 가능 | 불가 또는 초안 요청 | 불가 |
| 견적 버전 생성 | 가능 | 제한 또는 불가 | 불가 |
| 견적 링크 열람 | 가능 | 가능 | 가능 |
| 견적 검토 확인 | 확인 가능 | 가능 | 가능 |
| 견적 진행 요청 | 후속 처리 | 가능 | 가능 |
| 계약 전환 | 가능 | 불가 또는 요청 | 불가 |
| 계약 서명 | 가능 | 가능 | 가능 |
| 수납 등록 | 가능 | 불가 | 불가 |
| 영수증 발행 | 가능 | 불가 | 불가 |
| 설치 일정 확정 | 가능 | 확인/변경 요청 | token 폼 가능 |
| 재고 예약/출고 | 가능 | 불가 | 불가 |

구현 원칙:

- 모든 `/api/portal/*` write는 `requirePortalContext -> resource load -> authorizeForAccount` 순서를 지킨다.
- partner write는 body의 `partner_account_id`를 믿지 않고 서버에서 강제 주입한다.
- admin-only 금융/정산/CRM 원장 작업은 장기적으로 `/api/admin/*`로 명확히 분리한다.

## 6. 견적 문서 라이프사이클

앞으로 하드웨어 견적은 아래 흐름으로 본다.

| 단계 | 기준 위치 | 비고 |
| --- | --- | --- |
| 1. 딜/운영 케이스 생성 | Admin CRM/Hardware | `deal` 생성 |
| 2. 견적 작성 | Admin Hardware 견적/문서 | `QuickQuoteComposer` 재사용 |
| 3. 버전 생성 | `quote_document_versions` | 외부 전달 가능한 스냅샷 |
| 4. 내부 검토/승인 | Admin 문서 상세 | `pending_approval` 등 상태 UX 보강 |
| 5. 공유 링크 생성 | `/api/portal/quotes/[id]/share` | 버전 고정 token |
| 6. 고객 열람 | `/share/quote/[token]` | 조회 로그, 만료 처리 |
| 7. 고객 확인/진행 요청 | `/share/quote/[token]` | `public_quote_review_confirmed`, `public_quote_accepted` |
| 8. 계약 전환 | `/api/portal/quotes/[id]/convert` | accepted version 우선 |
| 9. 계약 공유/서명 | V2 `/share/contract/[token]` | 현재 legacy 공개 페이지와 정렬 필요 |
| 10. 수납/영수 | Admin Hardware settlement | 분할 입금, 미수금, 영수증 |

핵심 결정:

- 고객에게 발송되는 새 견적은 `quotes / quote_items`가 아니라 `quote_documents` 계열을 기준으로 한다.
- legacy `quotes / quote_items`는 즉시 삭제하지 않고 조회/호환/마이그레이션 대상으로 둔다.
- 계약 전환 기준은 최신 초안이 아니라 accepted version을 우선한다.
- 공개 견적 페이지에는 `검토 완료`와 `이 견적으로 진행 요청`을 모두 둔다.

## 7. 목표 IA

### 7-1. Admin / Hardware OS

추천 최종 구조:

```text
/admin/hardware
  - 개요
  - 영업/딜
  - 견적/문서
  - 재고/설치
  - 수납/정산
```

단기에는 `/admin/quotes`, `/admin/commercial`, `/admin/crm/**`를 바로 제거하지 않는다.

- `/admin/quotes`: 견적/문서 탭 alias 또는 기존 진입점 유지
- `/admin/commercial`: Customer -> Deal 상세 운영 화면으로 활용
- `/admin/crm/**`: Account 360, 리드, 매출, 외부 CRM 연결 유지

### 7-2. Partner Action Portal

로그인형 파트너 화면을 다시 만들 경우에도 아래 정도로 제한한다.

```text
/partner
  - 액션 인박스
  - 거래 조회
  - 문서 조회
  - 일정/설치 확인
  - 프로필/회사 정보
```

파트너 포털의 1차 목표는 원장 편집이 아니라 다음 행동이다.

- 확인 필요
- 서명 필요
- 정보 제출 필요
- 일정 후보 제출
- 설치 정보 확인
- 문서 링크 복사/공유

### 7-3. Public Share

고객과 외부 사용자는 로그인하지 않는다.

```text
/share/quote/[token]
/share/contract/[token]
/share/receipt/[token]   (필요 시)
/share/forms/[token]     (설치/파일/납품 정보 제출 필요 시)
```

공개 링크는 모두 아래 속성을 가져야 한다.

- version-fixed
- noindex
- token 만료
- activity log
- 이전 링크 불변

## 8. 실행 단계

### Phase 0. 결정 고정

- 이 문서를 기준으로 `partner portal = external action layer`, `admin/hardware = operational owner`를 합의한다.
- `partner_accounts`가 tenant, `deals`가 운영 단위라는 ADR을 만든다.
- 문서의 `lib/partner-portal`, `app/partner`, `app/api/partner` 표현은 현재 구현 기준으로 `lib/portal`, `app/api/portal`, `app/share`에 맞춰 정리한다.

완료 조건:

- 새 개발자가 파트너 포털을 작은 ERP로 오해하지 않는다.
- 새 견적 개발의 기준 모델이 `quote_documents` 계열임을 문서에서 찾을 수 있다.

### Phase 1. 견적 링크 완성

- `/share/quote/[token]`에 `이 견적으로 진행 요청` 액션을 추가한다.
- `public_quote_accepted` 로그를 실제 UI/API에서 생성한다.
- Admin 문서 목록에서 확인/진행 요청 상태를 표시한다.
- 계약 전환은 accepted version을 우선 사용한다는 현재 로직을 회귀 테스트한다.

완료 조건:

- 고객이 견적 링크에서 검토 완료와 진행 요청을 모두 할 수 있다.
- 내부 운영자는 어떤 버전이 진행 기준인지 볼 수 있다.

### Phase 2. Admin Hardware 견적/문서 허브

- `/admin/hardware` 껍데기를 만들거나, 우선 `/admin/quotes`를 하드웨어 견적/문서 허브로 명확히 재정의한다.
- `QuickQuoteComposer`를 canonical 작성기로 둔다.
- `HardwareQuotesPanel`에 계약 전환, 공유 링크, 고객 반응 상태를 모은다.
- 기존 `/admin/quotes` 링크는 깨지지 않게 유지한다.

완료 조건:

- 내부 팀은 하드웨어 견적 업무를 하나의 진입점에서 시작할 수 있다.
- 새 하드웨어 견적은 V2 문서형 견적으로 생성된다.

### Phase 3. V2 계약 공유/서명 정렬

- V2 `contract_documents` 기준 공개 계약 링크를 정리한다.
- legacy `contracts.sign_token` 기반 공개 페이지와 병행 또는 adapter를 설계한다.
- 서명 상태, 서명자, 서명 시각, 원본 견적 버전을 계약 상세에서 볼 수 있게 한다.

완료 조건:

- V2 견적에서 전환된 계약이 공개 링크/서명 흐름까지 끊기지 않는다.

### Phase 4. 수납/영수증과 설치/재고 연결

- 수납/영수증 write는 admin-only로 유지한다.
- deal 기준으로 `paid_amount`, `outstanding_amount`, `payment_status` 계산 방식을 고정한다.
- 견적 품목과 하드웨어 SKU, 재고 예약, 설치 일정 연결을 설계한다.

완료 조건:

- 견적 -> 계약 -> 설치 -> 수납이 하나의 deal timeline으로 보인다.

### Phase 5. Partner Action Portal 검증

- 실제 파트너 사용 빈도와 필요성을 확인한 뒤 `/partner`를 만든다.
- 첫 버전은 full CRUD가 아니라 액션 인박스와 읽기/제출 중심으로 제한한다.
- hard delete, 가격 수정, 수납 등록, 재고 조정은 제공하지 않는다.

완료 조건:

- 파트너가 해야 하는 일만 보이고, 내부 원장은 흔들리지 않는다.

### Phase 6. Legacy 정리

- V1 `quotes`, `contracts`, `receipts`, `partners` 사용처를 목록화한다.
- read fallback, one-time migration, adapter 유지 중 하나로 결정한다.
- 사용성이 검증된 뒤에만 구 탭을 숨기거나 redirect한다.

완료 조건:

- V1/V2 split-brain이 새 기능 개발을 막지 않는다.

## 9. 당장 하지 말 것

- 기존 `/api/portal/*`를 삭제하지 않는다.
- 기존 `/admin/quotes`를 바로 없애지 않는다.
- 파트너용 full ERP를 새로 만들지 않는다.
- 견적 데이터 모델을 세 번째로 늘리지 않는다.
- 수납/영수증/가격 승인 같은 내부 원장 write를 파트너에게 열지 않는다.
- legacy 데이터를 한 PR에서 전부 마이그레이션하지 않는다.

## 10. 검증 기준

문서 변경만이면 별도 테스트는 필요하지 않다.

구현에 들어가면 최소 아래를 실행한다.

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

견적/계약 구현을 건드리면 추가로 확인한다.

- 공개 견적 링크 열람
- 견적 검토 완료
- 견적 진행 요청
- accepted version 기준 계약 전환
- 계약 공개 링크/서명
- partner/admin 권한 분리
- `authorizeForAccount` 누락 여부
