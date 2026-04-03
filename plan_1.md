# plan_1 — 견적/계약/HW 판매 관리 (bae_v1)

> 브랜치: `bae_v1` | 기준일: 2026-04-02

---

## 현재 상태 스냅샷

### ✅ 완료된 것 (건드리지 않아도 됨)

| 레이어 | 파일 | 내용 |
|--------|------|------|
| Types | `lib/supabase/database.types.ts` | Partner, Quote, QuoteItem, Contract, ContractVersion, Receipt 전부 정의됨 |
| Repo | `lib/repositories/partners.ts` | CRUD 완성 |
| Repo | `lib/repositories/quotes.ts` | CRUD + 품목 관리 + 채번(Q-YYYY-XXX) 완성 |
| Repo | `lib/repositories/contracts.ts` | CRUD + 버전이력 + 파트너/어드민 서명 완성 |
| Repo | `lib/repositories/receipts.ts` | CRUD + 채번(R-YYYY-XXX) 완성 |
| API | `app/api/admin/quotes/` | GET(목록) + POST(생성) + [id] GET/PATCH/DELETE |
| API | `app/api/admin/contracts/` | GET + POST + [id] CRUD + 서명 엔드포인트 |
| API | `app/api/admin/receipts/` | GET + POST + [id] CRUD |
| API | `app/api/admin/partners/` | GET + POST + [id] CRUD |

### ❌ 없는 것 (작업 대상)

1. **hw_sales 레이어 전체** — 타입, DB, repo, API, UI 없음
2. **어드민 UI 페이지** — quotes/contracts/receipts/partners 전용 페이지 없음
3. **CRM ↔ 파트너 연결** — lead → partner 전환 플로우 없음
4. **Supabase SQL 마이그레이션** — 테이블 실제 생성 스크립트 없음 (타입만 있음)

---

## 확정된 결정사항

| # | 결정 | 내용 |
|---|------|------|
| 1 | 견적-리드 연결 | `quotes`에 `lead_id` 컬럼 추가. 파트너 전환 전에도 견적 발행 가능 |
| 2 | 계약서 방식 | 템플릿 테이블(`contract_templates`) 선택 → 내용 채움 → 웹 페이지로 열람 가능 |
| 3 | 서명 방식 | 캔버스 서명 패드 → PNG 이미지 → Supabase Storage 저장 → URL 기록 |

---

## 데이터 플로우 (전체 파이프라인)

```
[리드]  ──────────────────────────────────────┐
   │  전환                                    │ (전환 전에도 견적 가능)
   ▼                                          │
[파트너(거래처)]                              │
        │                                     │
        └──────────┬───────────────────────── ▼
                   │             [견적서 Quote] lead_id or partner_id
                   │                    │ 수락 + "계약으로 전환"
                   │             [계약 템플릿 선택]
                   │                    │
                   │             [계약서 Contract]  ── C-2026-001
                   │                    │
                   │             [서명 링크 발송] → /sign/[token]
                   │                    │ 고객 서명
                   │                    │ 어드민 서명
                   │                    │ 완료
                   │             [영수증 Receipt] ── R-2026-001
                   │                    │
                   └──────────── [HW 납품 hw_sales] ── HS-2026-001
```

---

## M0 — Supabase 테이블 생성 (선행 필수)

```sql
-- 1. partners
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  business_number text,
  status text not null default 'active', -- active | inactive | pending
  notes text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. quotes (lead_id 추가 — 파트너 전환 전에도 견적 가능)
create table quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  partner_id uuid references partners(id) on delete set null,  -- 전환 후 채움
  lead_id uuid references leads(id) on delete set null,        -- 전환 전 연결
  title text not null,
  status text not null default 'draft',
  valid_until date,
  subtotal numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  notes text,
  created_by text,
  sent_at timestamptz,
  accepted_at timestamptz,
  converted_to_contract_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. quote_items
create table quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id) on delete cascade,
  product_name text not null,
  description text,
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  discount_rate numeric not null default 0,
  amount numeric not null default 0,
  sort_order integer not null default 0
);

-- 4. contracts
create table contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null unique,
  quote_id uuid references quotes(id),
  partner_id uuid references partners(id) on delete cascade,
  title text not null,
  status text not null default 'draft',
  total_amount numeric not null default 0,
  content_html text,
  notes text,
  valid_from date,
  valid_until date,
  sign_token text unique,
  partner_signed_at timestamptz,
  partner_signature_url text,
  partner_signed_ip text,
  admin_signed_at timestamptz,
  admin_signature_url text,
  admin_signed_by text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. contract_versions
create table contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references contracts(id) on delete cascade,
  version_number integer not null,
  content_html text not null,
  changed_by text,
  change_reason text,
  created_at timestamptz default now()
);

-- 6. receipts
create table receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  contract_id uuid references contracts(id),
  partner_id uuid references partners(id) on delete cascade,
  amount numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  payment_method text, -- card | transfer | cash
  paid_at timestamptz,
  cash_receipt_type text, -- personal | business
  cash_receipt_id text,
  notes text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 7. hw_sales (NEW)
create table hw_sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique,           -- HS-2026-001
  contract_id uuid references contracts(id),
  partner_id uuid references partners(id) on delete cascade,
  status text not null default 'pending',     -- pending | shipped | delivered | cancelled
  delivery_date date,
  delivered_at timestamptz,
  installer text,
  delivery_address text,
  notes text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 8. hw_sale_items (NEW)
create table hw_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references hw_sales(id) on delete cascade,
  sku text not null,                          -- CB-65, CB-75, CB-86 등
  product_name text not null,
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  serial_notes text,                          -- 시리얼 번호 메모
  sort_order integer not null default 0
);

-- 9. contract_templates (NEW — 계약서 양식 관리)
create table contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,                         -- "HW 구매계약서 표준", "유지보수 계약서" 등
  category text,                              -- sales | maintenance | partner
  content_html text not null,                 -- {{partner_name}}, {{total_amount}} 등 변수 포함
  is_default boolean not null default false,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## M1 — HW Sales 레이어 추가

### 1-A. 타입 추가 (`lib/supabase/database.types.ts`)

```typescript
export type HwSaleStatus = "pending" | "shipped" | "delivered" | "cancelled";

export interface HwSale {
  id: string;
  sale_number: string;
  contract_id: string | null;
  partner_id: string;
  status: HwSaleStatus;
  delivery_date: string | null;
  delivered_at: string | null;
  installer: string | null;
  delivery_address: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HwSaleItem {
  id: string;
  sale_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  serial_notes: string | null;
  sort_order: number;
}
```

### 1-B. Repository (`lib/repositories/hw-sales.ts`)

- `generateSaleNumber()` → HS-YYYY-XXX
- `listHwSales(partnerId?, contractId?)` → 목록
- `getHwSale(id)` → 품목 포함
- `createHwSale(input, items[])` → 생성
- `updateHwSale(id, input, items?)` → 수정
- `deleteHwSale(id)` → 삭제
- `getHwSaleStats()` → SKU별 총 판매 댓수 집계

### 1-C. API Route (`app/api/admin/hw-sales/route.ts` + `[id]/route.ts`)

---

## M2 — 어드민 UI

### 2-A. 파트너 관리 페이지 (`app/admin/partners/page.tsx`)

```
[거래처 목록] 테이블
  - 이름, 담당자, 연락처, 상태 배지, 총 계약금액
  - 신규 등록 버튼
  - 행 클릭 → 사이드 패널

[파트너 상세 패널] 탭
  ├── 기본정보 (이름, 사업자번호, 주소 등)
  ├── 견적서 탭  (파트너의 견적 목록)
  ├── 계약서 탭  (파트너의 계약 목록)
  ├── 납품 탭    (파트너의 HW 납품 이력)
  └── 영수증 탭  (파트너의 수납 이력)
```

### 2-B. 견적서 탭 내 기능

- 견적 목록 카드 (번호, 제목, 금액, 상태 배지, 유효기간)
- [+ 새 견적] → 인라인 폼
  - 제목 입력
  - 품목 행 추가/삭제 (품목명, 수량, 단가, 할인율, 소계 자동계산)
  - 소계 / 부가세(10%) / 합계 자동 표시
  - 상태: 초안 → 발송 → 수락/거절
- 견적 수락 시 "계약으로 전환" 버튼 → 계약 자동 생성

### 2-C. 계약서 탭 내 기능

- 계약 목록 (번호, 제목, 금액, 서명 상태 배지)
- [+ 새 계약] or 견적에서 자동 전환된 계약
  - **템플릿 선택** → content_html 자동 채움
  - 변수 치환: `{{partner_name}}`, `{{total_amount}}`, `{{valid_from}}` 등
  - 미리보기 버튼 → 웹 렌더링 확인
- 서명 현황 표시
  - 파트너 서명: ○ 미서명 / ✓ 서명완료 (서명일시 + IP)
  - 어드민 서명: ○ 미서명 / ✓ 서명완료
- **서명 링크 복사** 버튼 → `/sign/[token]` URL 클립보드 복사

### 2-F. 공개 서명 페이지 (`app/(public)/sign/[token]/page.tsx`)

```
URL: classin.co.kr/sign/C-xxxx-token

화면 구성:
┌────────────────────────────────┐
│  ClassIn 전자계약서            │
│  C-2026-001                    │
├────────────────────────────────┤
│  [계약서 내용 HTML 렌더링]     │
│  스크롤 가능                   │
├────────────────────────────────┤
│  서명란                        │
│  ┌──────────────────────────┐  │
│  │  캔버스 서명 패드         │  │
│  │  (react-signature-canvas) │  │
│  └──────────────────────────┘  │
│  [지우기]  [서명 완료 및 제출] │
└────────────────────────────────┘
```

흐름:
1. `sign_token`으로 계약 조회 (만료/취소 체크)
2. 계약 내용 렌더링
3. 서명 캔버스 → PNG blob → Supabase Storage `signatures/` 업로드
4. `applyPartnerSignature(contractId, imageUrl, ip)` 호출
5. "서명 완료" 화면 표시 + 어드민에 알림(이메일)

### 2-D. HW 납품 탭 내 기능

- 납품 목록 (납품번호, 납품일, 상태, 총 수량)
- [+ 새 납품] → 품목 행 추가
  - SKU 선택 (CB-65 / CB-75 / CB-86 / 기타)
  - 수량, 단가, 시리얼 메모
- 상태 변경: 대기 → 출고 → 납품완료

### 2-E. 사이드바 메뉴 추가 (`components/admin/AdminSidebar.tsx`)

```
기존: CRM (리드 관리)
추가: 거래처 (파트너 관리)  ← 새 메뉴
추가: HW 납품 현황          ← overview용 집계 페이지
```

---

## M3 — CRM 연결 (리드 → 파트너 전환)

- CRM 리드 패널에 "거래처 전환" 버튼 추가
  - 클릭 시 lead 정보 → partner 자동 채움
  - lead.status → "converted" 변경
  - partner 생성 후 파트너 상세 페이지로 이동

---

## M4 — 대시보드 집계 (Overview)

```
Overview 카드 추가:
  - 이번 달 계약 금액 합계
  - SKU별 누적 판매 댓수 (CB-65: 12대, CB-75: 8대, CB-86: 3대)
  - 미서명 계약 건수
  - 이번 달 수납 합계
```

---

## 작업 순서 (의존성 고려)

```
[선행]
  M0-A  Supabase 테이블 SQL 실행 (leads 포함 9개 테이블)
  M0-B  quotes 타입에 lead_id 추가 (database.types.ts + quotes.ts repo)
  M0-C  contract_templates repo + API 작성
  M0-D  hw_sales / hw_sale_items 타입 + repo + API 작성

[UI — 파트너 페이지]
  M2-A  파트너 목록 + 사이드 패널 뼈대
  M2-B  견적서 탭 (품목 계산 포함)
  M2-C  계약서 탭 (템플릿 선택 + 서명 링크)
  M2-D  HW 납품 탭
  M2-E  영수증 탭

[공개 서명 페이지]
  M2-F  /sign/[token] — 계약 열람 + 서명 캔버스 + Storage 업로드

[연결]
  M3    CRM 리드 패널 → "거래처 전환" 버튼
  M3-B  CRM 리드 패널 → "견적 발행" 버튼 (lead_id로 quote 생성)

[집계]
  M4    Overview 카드 (계약금액, HW 판매 댓수, 미서명 건수)
```

## 필요한 패키지

```bash
npm install react-signature-canvas   # 서명 캔버스
# @types/react-signature-canvas 도 같이
```

Supabase Storage 버킷: `signatures` (public read, auth write)
