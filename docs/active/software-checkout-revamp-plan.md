# Software Checkout Revamp Plan

기준 시점: 2026-04-15
문서 목적: 현재 `/checkout` 페이지를 PDF 요금제(구독형 Learning Space USD / 충전형 Business CNY)에 맞춰 재정렬하고, 어드민 소프트웨어 견적 빌더와 자연스럽게 이어지도록 실행 기준을 확정한다.

관련 문서:

- [quote-lifecycle-execution-plan.md](./quote-lifecycle-execution-plan.md)
- [quick-quote-builder-plan.md](./quick-quote-builder-plan.md)
- [repository-audit-2026-04-15.md](./repository-audit-2026-04-15.md)

관련 소스:

- [app/checkout/page.tsx](../../app/checkout/page.tsx)
- [components/billing/SoftwareCheckoutClient.tsx](../../components/billing/SoftwareCheckoutClient.tsx)
- [lib/billing/plans.ts](../../lib/billing/plans.ts)
- [lib/billing/public-env.ts](../../lib/billing/public-env.ts)
- [app/api/billing/checkout/prepare/route.ts](../../app/api/billing/checkout/prepare/route.ts)
- [app/api/billing/checkout/confirm/route.ts](../../app/api/billing/checkout/confirm/route.ts)

## 1. 배경

현재 `/checkout`은 Standard/Plus 두 플랜의 KRW 하드코딩 단가로 토스 결제위젯을 돌리는 수준이다. PDF 요금제는 아래 두 구조를 전제한다.

- 구독형 Learning Space: USD 기준, 계정 × 월/연 과금
- 충전형 Business: CNY 기준, 선충전 후 사용량 차감

따라서 1차 개선의 목표는 네 가지다.

- PDF 요금제와 일치하는 모델 (USD, 계정 단위)
- 충전형 탭 신규 진입점 (선충전)
- 견적서/프로모션 코드 기반 결제 (충전형)
- 기존 토스 결제 흐름(`prepare` → widget → `confirm`) 재사용

1차 범위 밖 작업은 8절에 정리한다.

## 2. 확정 의사결정

1. 통화 표기: 화면은 USD만 노출. 결제 승인 직전 "약 XXX,XXX원으로 승인됩니다" 한 줄만 KRW 환산 안내.
2. 환율 정책: env 고정값 없이 **결제 준비 시점에만 서버가 결정**. 1차에서는 외부 환율 API를 실시간 호출(캐시 30분)하여 서버에서 토스에 전달할 KRW를 계산한다. 장애 시 마지막 성공값 유지.
3. 플랜 노출: Standard / Plus만 셀프결제. Enterprise는 현재의 "Contact Sales" 카드 유지.
4. 상단 탭: `구독형 Learning Space` / `충전형 Business`. 사각형 작은 테이블 형태 토글, 기본 탭 = 구독형.
5. Add-on 제외 (스토리지 / 공용 클라우드 / 웹라이브 & 플레이백 / 관리자 계정).
6. 충전형 금액 단위: 최초 10,000 CNY / 추가 2,000 CNY 강제. 이 외 입력은 차단.
7. 충전형 코드: **견적서 코드**(어드민 SW 견적 빌더에서 발급) + **프로모션 코드**(마케팅용). 1차에서는 충전형에만 적용. 구독형은 2차 확장 후보.

## 3. UX 구조

### 3-1. 상단 탭

- 위치: 기존 헤더 바 아래, Plan Builder 카드 위.
- 스타일: 사각형 작은 테이블. 두 셀 `구독형 Learning Space` / `충전형 Business`.
- 상태 저장: URL query `mode=subscription | business`. 새로고침 시 유지.
- 기본값: `mode=subscription`.

### 3-2. 구독형 레이아웃

왼쪽 Plan Builder:

- 월간 / 연간 토글 유지.
- 플랜 카드 2개: Standard($99/계정/월) / Plus($199/계정/월). 연간은 월가 × 10.
- Enterprise 카드: 현재의 "맞춤 도입 상담으로 이동" 스타일 유지. 가격 노출 없음. CTA 링크는 `/contact#contact-form`.
- 계정 수 stepper 신규: 기본 1, 최소 1, 최대 999. `-` / 숫자 입력 / `+`.
- 단가 표기: `$99 / 계정 / 월` 형식. 소계 `$99 × 5 = $495`.

오른쪽 Payment:

- 주문자 정보 블록 (기존 필드 유지: 기관명, 담당자명, 연락처(선택), 이메일).
- 토스 결제위젯 영역 (기존 그대로).
- Order Summary: USD 합계만 큰 숫자로 노출. 결제 버튼 위에 작은 회색 텍스트로 `오늘 환율 기준 약 ₩XXX,XXX 로 승인됩니다`. 환율 기준시각 표기.

### 3-3. 충전형 레이아웃 (신규)

왼쪽 Recharge Builder:

- 충전 금액 입력 블록.
  - 프리셋 버튼: `10,000` / `20,000` / `50,000` / `100,000` CNY.
  - 직접 입력: number input. `onBlur`에서 단위 검증, 유효하지 않으면 가까운 허용 값으로 보정 제안.
- 단위 안내 카드: 최초 10,000 / 추가 2,000 CNY, 사용 제약 기간 없음, 30분 이하 수업은 30분 단가로 계산, 학생 10분 이하 재실은 미과금 등 PDF 기본 정책 요약.
- 단가 안내 축약 테이블: 수업 유형별 과금(1v0 / 1v1 / 1v2-12 / HD / FHD / 조교 / 녹화) 노출. 상세는 `/product/software`로 링크.
- 견적서 코드 입력 블록: 코드 input + `적용` 버튼 + 결과 배지. 성공 시 금액 프리필 + 잠금 표시(수정 불가).
- 프로모션 코드 입력 블록: 코드 input + `적용` 버튼 + 결과 배지. 성공 시 할인 라인 추가.

오른쪽 Payment:

- 주문자 정보 (구독형과 동일).
- 토스 결제위젯 (동일).
- Order Summary: CNY 원가 + 할인 + 최종 CNY + KRW 환산 안내 한 줄.

## 4. 데이터 / 가격 모델

### 4-1. plans.ts 재설계

현재 `lib/billing/plans.ts`는 KRW 하드코딩이다. 아래로 바꾼다.

- `currency: "USD"` 필드 추가.
- `pricePerAccount: { monthly: { amount: number }, yearly: { amount: number, badge?: string } }` 구조.
- `SOFTWARE_PLANS`는 Standard / Plus / Enterprise 셋 모두 유지하되 Enterprise는 `selfServe: false` 유지.
- env 키 이름 변경: `NEXT_PUBLIC_BILLING_STANDARD_MONTHLY_USD` 등. 기본값은 PDF (99, 199).
- 유틸: `formatUsd(amount)` 신설. `formatKrw`는 결제 확인 안내에서만 사용.

### 4-2. 환율 / 환산 유틸

- `lib/billing/fx.ts` 신규.
  - `getUsdKrwRate(): Promise<{ rate: number, fetchedAt: string, source: string }>`.
  - 서버 전용. 외부 환율 API 1일 1회 이상 호출, 30분 캐시.
  - 실패 시 마지막 성공값 반환, 로그 기록.
- 클라이언트 화면에는 환율 값을 직접 주지 않는다. 결제 준비 응답에 `approximateKrw` 단일 값만 포함.
- `POST /api/billing/checkout/prepare`는 최종 결제 금액을 USD → KRW로 환산한 뒤 토스에 넘길 KRW 값을 반환한다.

### 4-3. 충전 상품 모델

- `lib/billing/recharge.ts` 신규.
  - `BUSINESS_RECHARGE = { baseMinCny: 10000, incrementCny: 2000, presetsCny: [10000, 20000, 50000, 100000] }`.
  - `validateRechargeAmount(amountCny): { ok: true } | { ok: false, reason, suggested }`.
  - `buildRechargeOrderName(amountCny): string`.

### 4-4. 견적서 코드

저장 위치는 기존 `quotes`(HW 중심) 와 구조가 달라 **신규 테이블 `software_quote_codes`** 를 둔다.

- 마이그레이션: [supabase/migrations/20260416_software_quote_codes_and_promos.sql](../../supabase/migrations/20260416_software_quote_codes_and_promos.sql)
  - `software_quote_codes(id, code unique, kind, organization_name, buyer_name, buyer_email, amount_cny, amount_usd, notes, expires_at, redeemed_at, redeemed_order_id, created_by)`.
  - `kind` 는 `business_recharge | subscription` 중 하나.
- 코드 발급은 어드민 `/admin/software-quote-codes` 에서 수동 생성. 형식: `QB-YYYY-XXXX` (충전) / `QS-YYYY-XXXX` (구독).
- 검증 API: `POST /api/billing/quote-code/validate` (server only).
  - 입력: `{ code, mode: "business" }`.
  - 출력 성공: `{ ok: true, amountCny, currency, quoteId, partnerName, notes }`.
  - 출력 실패: `{ ok: false, reason: "not_found" | "expired" | "redeemed" | "wrong_mode" }`.
- 결제 완료(`/api/billing/checkout/confirm`) 시 `redeemed_at` / `redeemed_order_id` 기록.

### 4-5. 프로모션 코드

신규 테이블을 둔다. 위 4-4 와 같은 마이그레이션 파일에 함께 추가.

- `promo_codes(id, code unique, label, target_product, discount_type, discount_value, currency, usage_limit, used_count, starts_at, expires_at, is_active, notes)`.
- `promo_code_redemptions(id, promo_code_id, order_id, amount_before, amount_after, currency, redeemed_at)`.
- `increment_promo_code_used_count(p_promo_code_id uuid)` RPC: 단일 UPDATE 기반으로 used_count 원자 증가.
- 검증 API: `POST /api/billing/promo-code/validate`.
  - 입력: `{ code, mode, baseAmount }`.
  - 출력 성공: `{ ok: true, discountLine, finalAmount, codeLabel }`.
  - 출력 실패: `{ ok: false, reason }`.
- 1차에서는 어드민 UI 없이 DB에 직접 insert 한 시드 코드 몇 개만 운영. 어드민 관리 화면은 2차.

### 4-6. Prepare 서버 검증 계약

`POST /api/billing/checkout/prepare` 를 mode별로 분기한다.

- 구독형 (`mode: "subscription"`)
  - 입력: `{ mode, planId, billingCycle, accountCount, organizationName, buyerName, buyerEmail, buyerPhone }`.
  - 처리: plan 단가 × 계정수 × 주기 산출 → USD → KRW 환산 → 금액 재검증 → orderId 생성.
  - 출력: `{ orderId, orderName, amountKrw, amountUsd, fxRate, fxFetchedAt }`.
- 충전형 (`mode: "business"`)
  - 입력: `{ mode, amountCny, quoteCode?, promoCode?, organizationName, buyerName, buyerEmail, buyerPhone }`.
  - 처리: 충전 금액 단위 검증 → 견적 코드 적용(있으면 덮어쓰기) → 프로모 코드 할인 → CNY → KRW 환산 → orderId 생성.
  - 출력: `{ orderId, orderName, amountKrw, amountCny, discounts, fxRate, fxFetchedAt }`.

## 5. 파일별 변경 맵

### 수정

- [lib/billing/plans.ts](../../lib/billing/plans.ts) — USD per-account 모델, Enterprise 가격 비노출 유지.
- [lib/billing/public-env.ts](../../lib/billing/public-env.ts) — USD env 키로 재명명.
- [lib/billing/server-env.ts](../../lib/billing/server-env.ts) — 환율 API 키(있으면) 주입 지점.
- [components/billing/SoftwareCheckoutClient.tsx](../../components/billing/SoftwareCheckoutClient.tsx) — 탭 스위치 기반으로 패널 렌더 분기. 구독형 내용은 패널 컴포넌트로 이전.
- [app/api/billing/checkout/prepare/route.ts](../../app/api/billing/checkout/prepare/route.ts) — mode 분기 + 환율 적용 + 코드 검증 연결.
- [app/api/billing/checkout/confirm/route.ts](../../app/api/billing/checkout/confirm/route.ts) — 충전형 결제 승인 시 견적 코드/프로모 redemption 기록.

### 신규 (컴포넌트)

- `components/billing/BillingModeTabs.tsx` — 상단 사각형 토글.
- `components/billing/SubscriptionCheckoutPanel.tsx` — 구독형 Plan Builder + Payment.
- `components/billing/BusinessRechargePanel.tsx` — 충전형 Recharge Builder + Payment.
- `components/billing/QuoteCodeField.tsx` — 견적 코드 입력 + 검증 상태.
- `components/billing/PromoCodeField.tsx` — 프로모 코드 입력 + 검증 상태.
- `components/billing/AccountCountStepper.tsx` — 계정 수 stepper.
- `components/billing/KrwConversionNote.tsx` — 결제 버튼 위 KRW 환산 안내.

### 신규 (lib)

- `lib/billing/fx.ts` — USD↔KRW / CNY↔KRW 환율 유틸.
- `lib/billing/recharge.ts` — 충전 단위 검증.
- `lib/billing/quote-codes.ts` — 견적서 코드 조회/검증.
- `lib/billing/promo-codes.ts` — 프로모션 코드 조회/검증/redemption.

### 신규 (API)

- `app/api/billing/quote-code/validate/route.ts`
- `app/api/billing/promo-code/validate/route.ts`
- `app/api/billing/fx/route.ts` (선택, 클라이언트 프리뷰용 캐시 전용 엔드포인트)

### 신규 (DB 마이그레이션)

- `supabase/migrations/YYYYMMDD_checkout_quote_code.sql`
- `supabase/migrations/YYYYMMDD_promo_codes.sql`

## 6. 구현 순서 (Phase)

### Phase 1 — 구독형 재정렬

- `plans.ts` USD per-account 재설계.
- `BillingModeTabs` 추가, 기본은 구독 탭.
- `SubscriptionCheckoutPanel` 분리 + 계정 수 stepper.
- `KrwConversionNote`로 결제 버튼 위 환산 안내 라인.
- `prepare` 서버에서 USD → KRW 산출 및 재검증.
- Enterprise 카드는 현재 상담 분리 스타일 유지.

### Phase 2 — 충전형 뼈대

- `BusinessRechargePanel` 신규, 프리셋 4개 + 직접 입력.
- `recharge.ts` 단위 검증.
- `prepare` mode=business 분기.
- Order Summary CNY + KRW 환산 안내.

### Phase 3 — 코드 시스템

- 마이그레이션 2종 (견적 코드 컬럼, `promo_codes` + `promo_code_redemptions`).
- `quote-codes.ts`, `promo-codes.ts`.
- 검증 API 2개.
- `QuoteCodeField`, `PromoCodeField` 연결.
- `confirm` 라우트에서 redemption 기록.

### Phase 4 — 어드민 연결 (부분)

1차 구현 완료 범위:

- 신규 화면 [/admin/software-quote-codes](../../app/admin/software-quote-codes/page.tsx) 에서 수동으로 견적 코드 발급 / 리스트 / 만료 / 삭제.
- 코드별 `결제 링크 복사` 버튼으로 `/checkout?mode=business&quote=CODE` URL 을 클립보드에 저장.
- 결제 완료 시 `markSoftwareCheckoutOrderPaid` 가 `redeemed_at` / `redeemed_order_id` 를 기록.
- 사이드바 메뉴 `SW 견적 코드` 신규 추가.

향후 확장 (범위 밖):

- 기존 `/admin/quotes` HW 견적 빌더와 SW 견적 모델 통합.
- 견적 문서 발송 흐름(`quote-lifecycle-execution-plan`) 과 연결된 자동 발급.

## 7. 수용 기준

### Phase 1

- `/checkout`에서 상단 탭이 구독형/충전형 두 셀로 보이고, 기본은 구독형이다.
- 구독형 플랜 카드가 `$99 / 계정 / 월` 형식으로 표기된다.
- 계정 수 stepper를 바꾸면 소계가 즉시 갱신된다.
- 결제 버튼 위 환산 라인에 `오늘 환율 기준 약 ₩XXX,XXX 로 승인됩니다`가 노출된다.
- Enterprise 카드는 결제 버튼 없이 상담 CTA만 유지된다.
- Prepare 응답은 서버가 계산한 KRW와 USD 원가를 모두 반환한다.

### Phase 2

- 충전형 탭 전환 시 Recharge Builder가 렌더된다.
- 10,000 / 20,000 / 50,000 / 100,000 CNY 프리셋이 작동한다.
- 최초 10,000 CNY 미만 또는 2,000 CNY 단위가 아닌 값 입력은 저장되지 않고 오류 메시지가 노출된다.
- 충전 금액과 KRW 환산가가 Summary에 함께 표기된다.
- 토스 결제는 KRW 금액으로 승인된다.

### Phase 3

- 유효한 견적서 코드를 입력하면 충전 금액 input이 견적 금액으로 프리필되고 수정 불가로 전환된다.
- 만료 / 사용 완료 / 존재하지 않는 코드는 명확한 사유 메시지로 거절된다.
- 유효한 프로모션 코드는 Summary에 `할인 -X%` 또는 `-X CNY` 라인을 추가하고 최종 금액을 낮춘다.
- 결제 승인 시 `quotes.checkout_code_redeemed_at`이 기록되고 `promo_code_redemptions`가 생성된다.

## 8. 1차 범위 밖

- Add-on (스토리지, 공용 클라우드, 웹라이브 & 플레이백, 관리자 계정).
- 구독형에도 프로모션 코드 허용 (확장 여지 — `software-checkout.ts` 의 redemption 분기에 subscription 경로 예비 남김).
- 사용량 시뮬레이터 (PDF 기반 월 예상 사용액 추산).
- 어드민 프로모션 코드 관리 UI (1차는 DB 직접 insert 로만 운영).
- 다국어 체크아웃 (EN / CN).
- 구독 자동 갱신 취소 / 결제수단 변경 UI.
- 자동 환율 API 공급사 전환 / 장애 알림.
- 기존 어드민 HW 견적(`quotes` 테이블)과 SW 견적 통합 모델링.

## 9. 운영 메모

- PDF 요금제 안내본은 사내 전달 파일로 관리한다. 저장소에는 절대경로로 링크하지 않는다.
- 환율 운영은 1차에서 무인 자동이다. 이상치(예: 1 USD < 1000 KRW) 발생 시 결제 prepare에서 명시적으로 실패 응답을 낸다.
- 견적서 코드는 외부 공유된 순간부터 유출 위험이 있으므로 1회 redemption + 만료일 필수.
- 프로모션 코드는 1차에서 소수 수동 발급. 시드 스크립트 또는 SQL 스냅샷으로만 관리.
