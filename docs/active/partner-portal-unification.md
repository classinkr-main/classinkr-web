# 파트너 포털 통합 — Admin/Partner 공용 CRUD

> 작성일: 2026-04-06
> 브랜치: `claude/mystifying-beaver` (base: `codex/backend2-admin-blog-design`)

## 배경

파트너 포털에서 Admin과 Partner는 **동일한 기능**을 공유해야 함:
견적 CRUD, 계약 CRUD, 영수증 발행, 고객 추가 등 모두 동일.
Admin만의 차이는 **마케팅/리드(홈페이지) 접근**뿐.

기존 코드는 Admin에만 CRUD(V1 Legacy 테이블), Partner는 읽기 전용(V2 테이블)으로 분리되어 있어
실제 비즈니스 흐름과 불일치했음.

## 구현 내용

### Phase 1: 통합 인증 컨텍스트

| 파일 | 설명 |
|------|------|
| `lib/partner-portal/portal-context.ts` | `PortalUserContext` 타입 + `resolvePortalContext()` — Partner 인증 시도 → Admin 인증 폴백 |
| `lib/partner-portal/portal-authorize.ts` | 권한 검증 (`authorizeForAccount`), actor 정보 (`getActorInfo`) |
| `lib/partner-portal/portal-fetch.ts` | 클라이언트 fetch 헬퍼 — admin은 Bearer 토큰, partner는 Supabase cookie 자동 |

**인증 흐름:**
```
Partner (Supabase cookie) → resolvePartnerAccountContext()
   ↓ 실패 시
Admin (cookie session / Supabase admin_profiles) → getVerifiedAdminContext()
   ↓ 둘 다 실패
401 Unauthorized
```

**데이터 스코프:**
- `admin` → `scope: "all"` (전체 데이터)
- `partner` → `scope: "account"` (자기 `partner_account_id` 데이터만)

### Phase 2: V2 Write Repositories

| 파일 | 기능 |
|------|------|
| `repositories/customers.ts` | `createCustomer()`, `updateCustomer()`, `deleteCustomer()` 추가 |
| `repositories/deals.ts` | `createDeal()`, `updateDeal()`, line item CRUD, `generateDealCode()` 추가 |
| `repositories/quote-documents.ts` | 견적 문서/버전/공유 CRUD, `generateQuoteNumber()` |
| `repositories/contract-documents.ts` | 계약 문서/버전 CRUD, `applySignature()`, `convertQuoteToContract()` |
| `repositories/payments.ts` | 결제 등록, 영수증 발행, `generateReceiptNumber()` |
| `repositories/activity.ts` | 활동 로그 기록 (`logActivity()`) |

**자동 번호 생성 규칙:**
- 딜: `D-YYYY-NNN`
- 견적: `Q-YYYY-NNN`
- 계약: `C-YYYY-NNN`
- 영수증: `R-YYYY-NNN`

### Phase 3: 통합 Portal API

`/api/portal/*` — admin/partner 모두 사용, 인증 컨텍스트로 데이터 범위 제어.

| Route | Methods | 설명 |
|-------|---------|------|
| `/api/portal/customers` | GET, POST | 고객 목록 / 생성 |
| `/api/portal/customers/[id]` | GET, PUT, DELETE | 고객 상세 / 수정 / 삭제 |
| `/api/portal/deals` | GET, POST | 딜 목록 / 생성 |
| `/api/portal/deals/[dealId]` | GET, PUT | 딜 상세 / 수정 |
| `/api/portal/deals/[dealId]/line-items` | POST, PUT, DELETE | 라인 아이템 CRUD |
| `/api/portal/quotes` | POST | 견적 문서 생성 |
| `/api/portal/quotes/[id]` | GET, PUT | 견적 상세 / 수정 |
| `/api/portal/quotes/[id]/versions` | POST | 견적 버전 추가 |
| `/api/portal/quotes/[id]/convert` | POST | 견적 → 계약 전환 |
| `/api/portal/contracts` | POST | 계약 문서 생성 |
| `/api/portal/contracts/[id]` | GET, PUT | 계약 상세 / 수정 |
| `/api/portal/contracts/[id]/sign` | POST | 서명 (partner/admin 자동 구분) |
| `/api/portal/payments` | POST | 결제 등록 |
| `/api/portal/receipts` | POST | 영수증 발행 |
| `/api/portal/receipts/[id]` | GET | 영수증 상세 |
| `/api/portal/overview` | GET | 대시보드 메트릭 |

**모든 write 작업은 `activity_logs`에 자동 기록됨.**

### Phase 4: 통합 UI

#### 공용 CRUD 컴포넌트 (`components/partner-portal/crud/`)

| 컴포넌트 | 설명 |
|----------|------|
| `SignatureCanvas.tsx` | HTML5 Canvas 기반 전자 서명 (터치 지원) |
| `QuoteEditor.tsx` | 견적서 CRUD — 템플릿 선택, 라인 아이템 편집, VAT, 견적→계약 전환 |
| `ContractList.tsx` | 계약서 목록/서명 — 상태 관리, 서명 모달 |
| `ReceiptForm.tsx` | 영수증 발행 — 결제 등록 + 영수증 생성, VAT 자동계산 |
| `CustomerForm.tsx` | 고객 추가/수정 모달 폼 |

#### Partner CRUD 페이지

| 경로 | 설명 |
|------|------|
| `/partner/customers` | 고객 목록 + 검색 + 추가/편집 |
| `/partner/quotes` | 딜 선택 → 견적서 CRUD |
| `/partner/contracts` | 딜 선택 → 계약서 CRUD + 서명 |
| `/partner/receipts` | 딜 선택 → 영수증 발행/조회 |

#### PortalNav 확장

기존 3개 → 7개:
```
홈 | 고객 | 견적서 | 계약서 | 영수증 | 문서 | 캘린더
```

#### AdminSidebar 연결

파트너 포털 섹션에 `/partner` 링크 추가.
기존 `/admin/quotes`, `/admin/contracts`, `/admin/receipts`는 legacy로 표기, 향후 제거 예정.

## 아키텍처

```
Admin ──┐                    Partner ──┐
        │                             │
   AdminSidebar              PortalNav
  "파트너 포털" 클릭     로그인 후 바로 접근
        │                             │
        └──────── /partner/* ─────────┘
                      │
              portalFetch() (클라이언트)
                      │
              /api/portal/* (서버)
                      │
            resolvePortalContext()
            ┌─────────┴─────────┐
         admin                partner
       scope:all          scope:account
            │                   │
      V2 Repositories (Supabase)
```

## 기존 코드와의 관계

| 기존 | 신규 | 상태 |
|------|------|------|
| `/api/admin/quotes` (V1) | `/api/portal/quotes` (V2) | V1 삭제 완료(2026-07-02) — admin 페이지는 `/api/portal/documents` 사용 |
| `/api/admin/contracts` (V1) | `/api/portal/contracts` (V2) | 병행 |
| `/api/admin/receipts` (V1) | `/api/portal/receipts` (V2) | 병행 |
| `/api/partner/overview` | `/api/portal/overview` | 병행 — 기존 partner 페이지는 아직 `/api/partner/` 사용 |

**전환 완료 후 제거 대상:**
- ~~`/api/admin/quotes/`~~(2026-07-02 삭제 완료), `/api/admin/contracts/`, `/api/admin/receipts/`
- `/app/admin/quotes/`, `/app/admin/contracts/`, `/app/admin/receipts/`
- `lib/repositories/quotes.ts`, `contracts.ts`, `receipts.ts` (V1)

## 남은 작업

1. 기존 `/partner/workspace` 페이지에서 `/api/partner/*` → `/api/portal/*` 전환
2. 기존 `/partner/documents` 페이지도 portal API로 전환
3. 제품 카탈로그 API 연동 (현재 QuoteEditor는 하드코딩된 PRODUCT_OPTIONS 사용)
4. V1 legacy admin 페이지 제거 (전환 검증 후)
5. partner 레이아웃에 admin일 때 "어드민으로 돌아가기" 링크 추가
