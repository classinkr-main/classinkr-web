<!-- /autoplan restore point: /Users/clmagi/.gstack/projects/classinkr-main-classinkr-web/hook_v1-autoplan-restore-20260416-163532.md -->
# Software Checkout Revamp Plan

기준 시점: 2026-04-15
문서 목적: 현재 `/checkout` 페이지를 PDF 요금제(구독형 Learning Space USD / 충전형 Business CNY)에 맞춰 재정렬하고, 어드민 소프트웨어 견적 빌더와 자연스럽게 이어지도록 실행 기준을 확정한다.

관련 문서:

- [quote-lifecycle-execution-plan.md](./quote-lifecycle-execution-plan.md)
- [quick-quote-builder-plan.md](./quick-quote-builder-plan.md)
- [repository-audit-2026-04-15.md](../archive/repository-audit-2026-04-15.md) — 역사 기록

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

---

# /autoplan Review — Software Checkout Revamp
*Generated: 2026-04-16 | Branch: hook_v1 | Mode: SELECTIVE EXPANSION*
*Status: Plan already implemented (phases 1-4 committed). This is a post-implementation audit.*

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | Mode = SELECTIVE EXPANSION | Mechanical | P3 | Feature enhancement on existing system; not greenfield | EXPANSION, REDUCTION |
| 2 | CEO | Premises: accept all 4 | Mechanical | P6 | All premises have been validated by the fact of working implementation | — |
| 3 | CEO | FX serverless cache gap: flag as concern, not auto-fix | Mechanical | P3 | Fix touches infra + cache layer; needs user decision on storage approach | — |
| 4 | CEO | .env.local.example outdated: add to NOT_IN_SCOPE for this review; flag as follow-up | Mechanical | P5 | Doc fix < 5 min but not in original plan scope | — |
| 5 | CEO | RLS on new tables: flag HIGH concern | Mechanical | P1 | Missing RLS on promo_codes/software_quote_codes exposes financial data | — |
| 6 | CEO | No tests: flag, defer test writing to TODOS | Mechanical | P3 | No test infrastructure in repo; adding now is scope expansion | — |
| 7 | Eng | CodeInputField consolidation (vs separate QuoteCodeField/PromoCodeField): accept | Mechanical | P5 | Fewer files, same behavior — explicit over clever | — |
| 8 | Eng | Google Calendar sync in same branch: flag as scope mixing concern | Mechanical | P6 | Not in this plan; mixing billing + calendar in one branch increases risk | — |

---

## Phase 1: CEO Review

### PRE-REVIEW SYSTEM AUDIT

**Git state:**
- Branch `hook_v1` — 86 files changed vs main, 7185 insertions
- All 4 phases COMMITTED (latest: "Fix TypeScript build errors" → "feat(checkout): complete phase 2-4")
- Uncommitted work: billing UI polish (CheckoutSuccessClient/Fail) + Google Calendar sync (NEW: unplanned feature)
- 1 stash: `WIP on home_v2: e633c5f` — pre-dates this work

**TODO/FIXME scan:**
- `BusinessRechargePanel.tsx`: referenced in TODO scan
- Plan doc itself has a placeholder comment (now cleaned)

**Taste references (well-designed):**
- `lib/billing/fx.ts` — clean error handling, explicit fallback chain
- `lib/server/software-checkout.ts` — redemption flow with silent-fail pattern, good isolation

**Anti-patterns noted:**
- In-memory module cache in serverless environment
- `.env.local.example` stale (KRW keys, no USD keys)

---

### Step 0A: Premise Challenge

**Premises evaluated:**

1. "기존 KRW 하드코딩 구조는 PDF 요금제를 수용할 수 없다" — **Valid.** USD per-account and CNY prepaid are structurally incompatible with KRW inline constants. Rewrite was the only path.

2. "기존 토스 결제 흐름(prepare → widget → confirm)을 재사용할 수 있다" — **Valid.** Implementation confirms this. `confirmTossPayment` in `lib/billing/toss.ts` handles both subscription and business modes via the same widget flow, with mode differentiated at the prepare layer.

3. "1차에서는 어드민 수동 코드 발급으로 충분하다" — **Valid with a caveat.** Works for controlled rollout. Risk: if quote code volume grows, admin will become a bottleneck. The plan acknowledges this in 8절 (scope out).

4. "환율은 결제 준비 시점에만 서버에서 결정하면 충분하다" — **Valid in concept, implementation has a gap.** The module-level in-memory cache (`let cached`) will not persist across Vercel serverless cold starts. In practice, every cold start triggers a live `open.er-api.com` fetch. Free tier: 1500 req/month. At moderate traffic (50+ daily visits), this could exhaust in weeks. Fallback to hardcoded 1400/190 is there but silent — user has no visibility.

**Premise verdict: 3/4 valid. #4 has a deployment gap.**

---

### Step 0B: Existing Code Leverage Map

| Sub-problem | Existing code leveraged |
|-------------|------------------------|
| Payment execution | `lib/billing/toss.ts` — `confirmTossPayment()` reused unchanged |
| Supabase writes | `createSupabaseAdminClient()` — admin pattern consistent with rest of codebase |
| UI tab switching | New `BillingModeTabs.tsx` — reasonable; no existing tab component matched this exact pattern |
| Order ID generation | New (orderId is nanoid-like in `software-checkout.ts`) — appropriate since this is a new domain |
| Quote code lookup | New `lib/billing/quote-codes.ts` — couldn't reuse HW quotes table (different schema) |

**No rebuilding of existing functionality detected.** The separation from HW quotes (`quotes` table) is correct.

---

### Step 0C: Dream State Mapping

```
CURRENT (before this plan)              THIS PLAN                    12-MONTH IDEAL
──────────────────────────────         ───────────────────────       ─────────────────────────
KRW 하드코딩 단가                  →   USD 구독 + CNY 충전형         →  자동 갱신 구독 관리
단일 플랜 (Standard/Plus)          →   코드 기반 견적/프로모션        →  파트너 자동 견적 발급
                                   →   어드민 수동 코드 발급          →  견적→결제 통합 파이프라인
수동 KRW 환산                      →   서버 실시간 환율 (30분 캐시)   →  환율 이상 알림 + 공급사 교체
결제 후 처리 없음                  →   redemption 기록               →  구독 상태 DB + 갱신 알림
```

**This plan moves solidly toward the 12-month ideal.** The main gap: subscription management (cancel, renew, payment method change) remains manual.

---

### Step 0C-bis: Implementation Alternatives

```
APPROACH A: 현재 구현 (Plan 그대로)
  Summary: KRW 파생 방식으로 토스 결제 흐름 유지, USD/CNY 단가를 서버에서 KRW로 환산
  Effort:  L (implemented)
  Risk:    Med — FX cache 서버리스 갭, RLS 미적용
  Pros:    토스 재사용으로 PG 연동 최소화; 코드 시스템으로 충전형 제어 가능
  Cons:    서버리스 캐시 이슈; RLS 미적용 테이블
  Reuses:  confirmTossPayment, createSupabaseAdminClient

APPROACH B: Stripe 또는 Paddle 전환
  Summary: 국제 결제 PG로 전환, USD/CNY 원화 환산 불필요
  Effort:  XL
  Risk:    High — PG 교체는 전체 결제 흐름 재작성
  Pros:    다중 통화 네이티브 지원; 구독 관리 내장
  Cons:    토스 KG 이니시스 계약 종료 필요; 한국 시장 간편결제(카카오페이) 커버 안됨
  Reuses:  없음

APPROACH C: 토스 다통화 API 직접 활용
  Summary: 토스 서버 API에서 USD 또는 CNY 결제를 직접 받는 방식 탐색
  Effort:  M
  Risk:    Med — 토스 다통화 지원 범위 제한 (KRW 기반이 기본)
  Pros:    PG 변경 없이 통화 문제 해결 가능할 수 있음
  Cons:    토스 다통화 정책 불명확; 현재 계약 조건 확인 필요
  Reuses:  confirmTossPayment 일부
```

**RECOMMENDATION: Approach A (현재 구현) — 토스 의존성이 이미 존재하고, FX 갭은 Redis/KV 캐시로 보완 가능.**

---

### Step 0D: SELECTIVE EXPANSION Analysis

**Complexity check:** Plan touches 20+ files and introduces 4 new tables. This is above the 8-file threshold. However, the scope is internally coherent (one feature: billing checkout), so this isn't fragmentation smell — it's inherent complexity of a payment flow.

**Minimum set:** Phases 1+2 (subscription + business skeleton) are core. Phase 3 (code system) + Phase 4 (admin) are the value-add layer. The plan is well-scoped.

**Expansion opportunities (cherry-pick candidates — for user decision):**

These are NOT auto-added. They go to TODOS.md.

1. **FX Redis/KV 캐시** (S effort) — Replace module-level cache with Vercel KV or Redis. Prevents cold-start API exhaustion. Deferred.
2. **RLS on new tables** (S effort) — Add row-level security to `software_quote_codes`, `promo_codes`, `promo_code_redemptions`. Deferred.
3. **`.env.local.example` 업데이트** (XS effort) — Add USD billing env vars + fallback rates. Deferred.
4. **결제 완료 이메일** (M effort) — Resend 연동으로 결제 확인 이메일. Deferred.
5. **어드민 구독 상태 뷰** (M effort) — `software_checkout_orders`에서 paid 상태 뷰. Deferred.

**Auto-decided: all expansions → TODOS.md.** (P3: pragmatic; each is a separate workstream)

---

### Step 0E: Temporal Interrogation

```
HOUR 1 (foundations):
  - Supabase 마이그레이션 실행 순서: 20260415 → 20260416 필수
  - 두 마이그레이션 사이에는 business mode 주문 불가 (plan_id NOT NULL)
  - 해결: 프로덕션 배포 시 두 마이그레이션 동시에 적용해야 함

HOUR 2-3 (core logic):
  - open.er-api.com 서버리스 캐시 갭: 각 cold start마다 API 호출
  - 1500 req/month 한도 내에서 운영 가능한지 확인 필요

HOUR 4-5 (integration):
  - 견적 코드 format은 plan에서 "QB-YYYY-XXXX"라고 했지만
    실제 admin 화면에서 auto-generate 로직이 있는지 확인 필요
  - promo 동시성: RPC fallback에서 race condition 가능

HOUR 6+ (polish/tests):
  - CheckoutSuccessClient, CheckoutFailClient 의 uncommitted UI polish
  - app/product/sw/page.tsx 182줄 변경 미커밋 — 배포 전 커밋 필요
```

---

### Step 0F: Mode = SELECTIVE EXPANSION ✓ (auto-decided)

---

## Phase 1 Sections

### Section 1: Architecture Review

```
ARCHITECTURE — SOFTWARE CHECKOUT REVAMP
═══════════════════════════════════════════════════════════════
  [CLIENT]
  /checkout?mode=subscription|business
      ↓
  SoftwareCheckoutClient.tsx (탭 분기)
      ├── SubscriptionCheckoutPanel.tsx → prepare API → TossWidget → confirm API
      └── BusinessRechargePanel.tsx    → prepare API → TossWidget → confirm API

  [SERVER — prepare]
  POST /api/billing/checkout/prepare
      ├── createSubscriptionCheckoutOrder()  ← lib/server/software-checkout.ts
      │       ├── getSelfServeSoftwarePlan()  ← lib/billing/plans.ts
      │       ├── getFxRates()               ← lib/billing/fx.ts → open.er-api.com
      │       └── INSERT software_checkout_orders
      └── createBusinessRechargeOrder()
              ├── validateRechargeAmount()   ← lib/billing/recharge.ts
              ├── validateQuoteCode()        ← lib/billing/quote-codes.ts → DB
              ├── validatePromoCode()        ← lib/billing/promo-codes.ts → DB
              ├── getFxRates()               ← lib/billing/fx.ts
              └── INSERT software_checkout_orders

  [SERVER — confirm]
  POST /api/billing/checkout/confirm
      ├── getSoftwareCheckoutOrder()
      ├── confirmTossPayment()              ← lib/billing/toss.ts → Toss API
      ├── markSoftwareCheckoutOrderPaid()
      │       ├── markQuoteCodeRedeemed()
      │       └── recordPromoRedemption()   ← lib/billing/promo-codes.ts → RPC
      └── return order

  [ADMIN]
  /admin/software-quote-codes
      └── Manual CRUD for software_quote_codes
```

**Coupling concerns:**
- `software-checkout.ts` does validation + DB write in one function. Acceptable for phase 1 scope.
- `getFxRates()` is called during both prepare and could be called multiple times per request if there are retry patterns. Cache mitigates this but cold-start issue remains.
- No circular imports detected.

**Security analysis:**
- All server code uses `createSupabaseAdminClient()` — bypasses RLS correctly.
- `paymentKey` is validated against `orderId` in confirm route — protects against key swap attacks.
- Amount re-validation in confirm (`existingOrder.amount !== amount`) — prevents amount tampering. ✅
- Idempotency: confirm checks `status === "paid" && paymentKey === paymentKey` — prevents double-confirm. ✅

**Gap: RLS not enabled on `software_quote_codes`, `promo_codes`, `promo_code_redemptions`** — If Supabase anon key is ever used (e.g., browser direct fetch), all financial data is readable. Since current code always uses admin client, this is not an active exploit vector — but it's a footgun.

---

### Section 2: Error & Rescue Registry

| Error | Where | Trigger | User sees | Silent? | Tested? |
|-------|-------|---------|-----------|---------|---------|
| FX API timeout (5s) | fx.ts:fetchRemoteRates | open.er-api.com slow/down | Continues with stale/fallback rate | ⚠️ Silent | ❌ |
| FX outlier rate (USD < 500 or > 5000) | fx.ts | Bad API response | Fallback to previous cached/default | ⚠️ Silent | ❌ |
| Quote code not found/expired/redeemed | quote-codes.ts | User enters bad code | Error message from `ok: false, reason` | No ✅ | ❌ |
| Promo RPC fails | promo-codes.ts:219 | RPC missing/DB error | Falls back to direct UPDATE (race) | ⚠️ Partial | ❌ |
| Quote code redemption fails after payment | software-checkout.ts:492 | DB error post-confirm | console.error only; order marked paid | ⚠️ Silent | ❌ |
| Promo redemption fails after payment | software-checkout.ts:534 | DB error post-confirm | console.error only; order marked paid | ⚠️ Silent | ❌ |
| Toss confirm fails | confirm/route.ts | Toss API error | HTTP 500 with error message | No ✅ | ❌ |
| Amount mismatch at confirm | confirm/route.ts | Client-side tampering | HTTP 400 | No ✅ | ❌ |
| prepare → widget timeout | Client side | User session expires | TossWidget handles natively | N/A | ❌ |

**Critical gap:** Quote/promo redemption failures after payment are silent. The order is marked paid but the redemption audit trail is incomplete. This means:
- A quote code could be used multiple times if redemption write fails
- Promo `used_count` could be understated

This is a **data integrity risk** for the business.

---

### Section 3: Test Review

**No tests exist in this repository.**

Test coverage needed for this plan:

| Flow | Test type | Status |
|------|-----------|--------|
| `validateRechargeAmount()` boundary cases (9999, 10000, 10001, 12000) | Unit | ❌ Missing |
| `validateQuoteCode()` — not_found / expired / redeemed / wrong_mode | Unit | ❌ Missing |
| `validatePromoCode()` — percent vs flat_cny discount math | Unit | ❌ Missing |
| `getFxRates()` — stale cache fallback, outlier rejection | Unit | ❌ Missing |
| `createSubscriptionCheckoutOrder()` — happy path | Integration | ❌ Missing |
| `createBusinessRechargeOrder()` with quote + promo | Integration | ❌ Missing |
| confirm route — idempotency (double confirm same paymentKey) | Integration | ❌ Missing |
| confirm route — amount mismatch rejection | Integration | ❌ Missing |
| redemption failure → order still marked paid | Integration | ❌ Missing |

**Auto-decided: defer all test writing to TODOS.md.** (P3: no test infrastructure; adding now expands scope significantly)

---

### Section 4: Performance Review

- `getFxRates()` has 30-min in-memory cache. **In serverless, module-level `let cached` resets on cold start.** With Vercel, cold start frequency depends on traffic volume. Low traffic = frequent cold starts = frequent API calls.
- N+1 risk: `createBusinessRechargeOrder()` does up to 3 sequential DB reads (quote code, promo code, order insert). Acceptable at current scale.
- `SubscriptionCheckoutPanel.tsx` is 25KB. `BusinessRechargePanel.tsx` is 33KB. Both are code-split since they're under `/checkout` — acceptable.

---

### Section 5: Security Review

**High concern — RLS missing on 3 tables:**
- `software_quote_codes` — contains buyer email, org name, amounts
- `promo_codes` — business intelligence (discount rates, usage)
- `promo_code_redemptions` — financial audit trail

`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is called for `software_checkout_orders` (migration 20260415) but not for the 3 tables above (migration 20260416). If Supabase anon key is used in any client context, these tables are readable.

**Current mitigation:** All code paths use admin client → no active exploit. But this is a single-layer defense.

**Medium concern — quote code format predictability:**
Plan mentions `QB-YYYY-XXXX` format. If the code is sequential or time-derived, it's brute-forceable. The admin page should generate cryptographically random codes.

**Low concern — promo race condition:**
The `increment_promo_code_used_count` RPC does a proper row-level lock update. The fallback in app code is racy. Since the RPC exists in the migration, the fallback should theoretically never fire — but it's dead code that could be reached if the RPC is dropped.

---

### Section 6: Deployment Review

**Migration ordering is critical:**
1. `20260415_software_checkout_orders.sql` must run first
2. `20260416_software_quote_codes_and_promos.sql` must run second

Between runs: business mode orders would fail (plan_id NOT NULL). Deploy both atomically.

**Vercel env vars needed (not in `.env.local.example`):**
- `NEXT_PUBLIC_BILLING_STANDARD_MONTHLY_USD` (99)
- `NEXT_PUBLIC_BILLING_STANDARD_YEARLY_USD` (990)
- `NEXT_PUBLIC_BILLING_PLUS_MONTHLY_USD` (199)
- `NEXT_PUBLIC_BILLING_PLUS_YEARLY_USD` (1990)
- `USD_KRW_FALLBACK_RATE` (optional, default 1400)
- `CNY_KRW_FALLBACK_RATE` (optional, default 190)

**OLD env vars to remove from Vercel:**
- `NEXT_PUBLIC_BILLING_STANDARD_MONTHLY_KRW`
- `NEXT_PUBLIC_BILLING_STANDARD_YEARLY_KRW`
- `NEXT_PUBLIC_BILLING_PLUS_MONTHLY_KRW`
- `NEXT_PUBLIC_BILLING_PLUS_YEARLY_KRW`

**Uncommitted work** — the following must be committed before deploy:
- `components/billing/CheckoutSuccessClient.tsx` (UI polish)
- `components/billing/CheckoutFailClient.tsx` (UI polish)
- `components/sections/ConditionalHeader.tsx`, `ConditionalFooter.tsx`, `Header.tsx`
- `app/product/sw/page.tsx` (182 line change)
- `lib/supabase/database.types.v2.ts`

**Google Calendar sync files are uncommitted and belong to a different feature** — do NOT commit them with the checkout revamp.

---

### Section 7: Observability Review

**What exists:** `console.error` on redemption failures.

**What's missing:**
- No structured logging for payment events
- No metric for: prepare called, widget launched, confirm called, confirm failed
- No alert for: FX API failure rate, redemption failure rate
- No runbook for: what to do when a quote code was used but redemption write failed

The `isStale: true` flag on FX rates is computed but never surfaced to operators — there's no alert when the system is operating on a stale rate.

---

### Section 8: Data Model Review

**Strengths:**
- `redeemed_at` + `redeemed_order_id` on quote codes — prevents double-redemption at DB level
- `increment_promo_code_used_count` RPC with row-level lock — concurrency safe
- `promo_code_redemptions` audit table — financial record of discounts applied

**Gaps:**
- `software_checkout_orders.plan_id` migration has a timing gap (NOT NULL in migration 1, relaxed in migration 2)
- No FK from `promo_code_redemptions.order_id` → `software_checkout_orders.order_id` (order_id is TEXT, not UUID — intentional but worth noting)
- `software_quote_codes` has no `account_count` column — subscription-kind codes can't lock in account count

---

### Section 9: API Contract Review

**`POST /api/billing/checkout/prepare` — subscription mode:**
- Input validation: planId checked against `SOFTWARE_PLANS`, billingCycle checked, accountCount clamped
- ✅ Server re-computes amount (client-provided amount ignored)
- ⚠️ `buyerPhone` is optional but Toss widget may require it — not validated

**`POST /api/billing/checkout/prepare` — business mode:**
- Input: `amountCny`, optional `quoteCode`, optional `promoCode`
- ✅ Amount unit validation via `validateRechargeAmount()`
- ✅ Quote code preFills + locks amount
- ⚠️ No rate limiting on validate endpoints — brute-force of promo codes possible

**`POST /api/billing/checkout/confirm`:**
- ✅ Amount re-verification
- ✅ Idempotency check
- ⚠️ `orderId` format not validated (any string accepted)

---

### Section 10: Plan Document Quality

**Plan vs Implementation gaps:**
- Plan says `QuoteCodeField.tsx` + `PromoCodeField.tsx` → actual: `CodeInputField.tsx` (consolidated)
- Plan says migration files `YYYYMMDD_checkout_quote_code.sql` + `YYYYMMDD_promo_codes.sql` → actual: `20260415_software_checkout_orders.sql` + `20260416_software_quote_codes_and_promos.sql`
- Plan's acceptance criteria in 7절 are complete and appear to be met by implementation

**Verdict: Plan is accurate in spirit, minor file name discrepancies only.**

---

### Section 11: Design Scope Detected ✓

*(Covered in Phase 2 below)*

---

### Phase 1 — NOT in Scope

Items explicitly deferred to TODOS.md:
1. FX Redis/Vercel KV 캐시 교체 (serverless cache gap fix)
2. RLS on `software_quote_codes`, `promo_codes`, `promo_code_redemptions`
3. `.env.local.example` USD 환경변수 추가
4. 결제 완료 이메일 (Resend 연동)
5. 어드민 구독 상태 뷰
6. 단위 테스트 + 통합 테스트
7. Rate limiting on validate API endpoints
8. 구조화 로그 + 결제 이벤트 메트릭

### Phase 1 — What Already Exists

- `lib/billing/toss.ts` — Toss PG wrapper, untouched ✅
- `createSupabaseAdminClient()` — admin DB access pattern ✅
- Admin auth pattern (`verifyAdmin()`) — used in admin quote codes page ✅
- Header/sidebar component patterns — extended, not replaced ✅

### CEO Completion Summary

| Dimension | Status | Notes |
|-----------|--------|-------|
| Premises valid? | ✅ 3/4 | FX serverless cache gap in premise #4 |
| Right problem to solve? | ✅ | PDF pricing model alignment was necessary |
| Scope calibrated? | ✅ | 4 phases, coherent scope |
| Code reuse adequate? | ✅ | Toss + Supabase patterns well-reused |
| Critical gaps? | ⚠️ 2 | RLS missing; FX cold-start issue |
| Deployment ready? | ⚠️ | Env vars not documented; uncommitted files |

**Phase 1 COMPLETE.**

---

## Phase 2: Design Review

*UI scope detected: checkout tabs, panels, stepper, code inputs*

### Design Scope Assessment: 6/10

Existing DESIGN.md palette is referenced. Components use `#084734` / `#ECFDF5` / `rgba(8,71,52,0.08)` correctly. The uncommitted `CheckoutSuccessClient` changes improve design alignment.

### Pass 1 — Information Hierarchy: 7/10

**Subscription mode:**
- Tab → Plan card → Stepper → Payment widget — correct hierarchy
- Enterprise card is visually de-emphasized ✅

**Business mode:**
- Tab → Preset buttons → Code inputs → Payment widget
- Code input blocks are side-by-side (quote + promo) — could be confusing if user applies both

**Gap:** Order Summary on business mode shows CNY amount. Korean users may not intuitively understand CNY. The KRW conversion note is present but small — consider making the final KRW amount more prominent.

### Pass 2 — Missing States: 6/10

| State | Subscription | Business |
|-------|-------------|---------|
| Loading (FX rate fetching) | ⚠️ KrwConversionNote shows "..." or static? | Same |
| Empty (no code applied) | ✅ Default state shown | ✅ |
| Error (invalid code) | N/A | ✅ Error badge on code field |
| Error (FX unavailable) | ⚠️ Falls back silently | Same |
| Success (code applied, locked) | N/A | ✅ Lock display |
| Payment pending | ✅ Toss widget handles | Same |

**Gap:** When FX rate is stale (fallback active), the UI shows the same KRW estimate as normal. User has no signal that the rate might be outdated. This could cause KRW amount discrepancy at payment confirm.

### Pass 3 — User Journey: 7/10

**Subscription path:** Tab → Select plan → Adjust account count → Fill buyer info → Pay. Clean.

**Business path:** Tab → Enter amount (or apply quote code) → Optionally apply promo → Fill buyer info → Pay.

**Concern:** Quote code locks the CNY amount, but the locked amount display doesn't show what plan/service it corresponds to. A user receiving a quote code might not understand what they're paying for.

### Pass 4 — Specificity of UX: 7/10

Plan specifies exact preset values (10k/20k/50k/100k CNY), min amount (10k), increment (2k), stepper min/max (1/999). These are all implemented. Good specificity.

**Gap:** Quote code format shown to users (`QB-YYYY-XXXX`) is undefined in the admin UI — the admin page generates codes, but the format logic wasn't specified in the plan.

### Pass 5 — Design System Alignment: 8/10

DESIGN.md palette used correctly in `CheckoutSuccessClient` uncommitted changes. Border `rgba(8,71,52,0.08)` present. Green gradient on success card is on-brand. Minor: font is `font-serif` in current code but uncommitted changes switch to `font-semibold tracking-tight` — the uncommitted version is more consistent with the rest of the site.

### Pass 6 — Responsive Strategy: 6/10

Plan specifies left/right column layout (Plan Builder + Payment). On mobile, this must stack. No explicit mobile breakpoint design in the plan. `SubscriptionCheckoutPanel.tsx` (25KB) likely has responsive handling but plan didn't spec mobile UX explicitly.

**Gap:** Mobile checkout flow for business mode with multiple code inputs (quote + promo) could be cramped.

### Pass 7 — Accessibility: 5/10

- `AccountCountStepper` uses `+`/`-` buttons — keyboard accessible? Need `aria-label`.
- Code input fields need `aria-describedby` for error states
- Toss widget handles its own a11y
- Focus management after code validation not specified

**Design phase — NOT in scope:**
- Full mobile UX redesign for business mode
- Accessibility audit (separate pass)
- FX stale rate visual indicator

### Design Completion Summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| Information hierarchy | 7/10 | CNY prominence could be improved |
| Missing states | 6/10 | Stale FX state unhandled in UI |
| User journey | 7/10 | Quote code context missing on lock |
| Specificity | 7/10 | Code format not defined in plan |
| Design system | 8/10 | Uncommitted changes improve alignment |
| Responsive | 6/10 | Mobile business mode not specced |
| Accessibility | 5/10 | Stepper + code inputs need aria labels |

**Phase 2 COMPLETE.**

---

## Phase 3: Engineering Review

### Scope Challenge

Plan touches: 20 new/modified files, 4 new DB tables, 3 new API routes, 1 new admin page.

Reading actual affected files confirms all planned components exist. No "zombie" files (files listed in plan but not created). The consolidation of `QuoteCodeField` + `PromoCodeField` → `CodeInputField` is a net improvement (DRY).

### Architecture ASCII (see Phase 1, Section 1)

### Test Coverage Map

| Codepath | Test type needed | Gap |
|----------|-----------------|-----|
| `validateRechargeAmount(10000)` → ok | Unit | ❌ |
| `validateRechargeAmount(9999)` → fail + suggestion | Unit | ❌ |
| `validateRechargeAmount(10001)` → fail (not 2k increment) | Unit | ❌ |
| `validateQuoteCode("expired")` → reason: expired | Unit | ❌ |
| `validateQuoteCode("redeemed")` → reason: redeemed | Unit | ❌ |
| `validateQuoteCode("wrong_mode")` → reason: wrong_mode | Unit | ❌ |
| `getFxRates()` → cache hit (no API call) | Unit | ❌ |
| `getFxRates()` → API returns invalid rate → fallback | Unit | ❌ |
| `createBusinessRechargeOrder()` → quote code preFill | Integration | ❌ |
| `createBusinessRechargeOrder()` → promo + quote combined | Integration | ❌ |
| `markSoftwareCheckoutOrderPaid()` → redemption fail silent | Integration | ❌ |
| confirm route → idempotent on paid+same key | Integration | ❌ |

**Test plan artifact written to:** `~/.gstack/projects/classinkr-main-classinkr-web/hook_v1-test-plan.md` *(see below)*

### Section 1: Architecture — see Phase 1

### Section 2: Code Quality

- `software-checkout.ts` is ~550 lines — approaching the limit before it should be split. Not a problem now.
- `BusinessRechargePanel.tsx` is 33KB — very large client component. Should be reviewed for dead code.
- `SubscriptionCheckoutPanel.tsx` is 25KB — same concern.
- `CodeInputField.tsx` is properly generic (handles both quote and promo) ✅
- Error messages are in Korean — consistent with rest of app ✅
- `normalizeString()` utility usage is consistent ✅

### Section 3: Performance

- FX serverless cache gap: covered in CEO/Section 4
- DB query pattern in `createBusinessRechargeOrder`: 3 sequential reads (quote, promo, order) — N+1 mitigated by fact that at most 2 code lookups happen
- No pagination on admin quote codes page — will degrade at 1000+ codes

### Section 4: Security (see CEO Section 5)

**Critical items:**
1. RLS missing on 3 tables
2. Promo code brute-force possible on `/api/billing/promo-code/validate`
3. Quote code format may be predictable

### Failure Modes Registry

| # | Failure mode | Probability | Impact | Detection | Mitigation in plan |
|---|-------------|-------------|--------|-----------|-------------------|
| 1 | FX API down at payment time | Low | Med | None | Fallback to stale/default ✅ |
| 2 | Quote code used after expiry (clock drift) | Very Low | Med | None | Server-side expiry check ✅ |
| 3 | Promo `used_count` overflow (race) | Low | Low | None | RPC with row lock ✅ |
| 4 | Redemption fails after payment | Low | High | console.error only | ⚠️ Gap |
| 5 | Migration 1+2 applied non-atomically | Very Low | High | NOT NULL fail | Deploy procedure needed |
| 6 | Toss webhook retry (double confirm) | Low | Med | Idempotency check ✅ | ✅ |
| 7 | FX outlier rate (API bug) | Very Low | High | Range validation ✅ | ✅ |
| 8 | Stale FX rate served (>30min cold start) | Med | Low | None | isStale flag (unused) ⚠️ |

**Critical gap flag:** Failure mode #4 (redemption fails silently after payment) requires an operational recovery runbook. Currently: no runbook, no alert.

### Eng Completion Summary

| Dimension | Status | Notes |
|-----------|--------|-------|
| Architecture sound? | ✅ | Clean separation, good reuse |
| Test coverage? | ❌ | 0 tests; full gap |
| Performance risks? | ⚠️ | FX cold-start; large panel components |
| Security threats? | ⚠️ | RLS missing; brute-force possible |
| Error paths handled? | ⚠️ | Post-payment redemption failures silent |
| Deployment risk? | ⚠️ | Migration atomicity; env vars not updated |

**Phase 3 COMPLETE.**

---

## Cross-Phase Themes

**Theme 1: FX in-memory cache in serverless** — Flagged in CEO (premise #4), Eng (Section 3, Failure mode #8), Design (missing state: stale FX in UI). High-confidence signal: this is an operational risk that needs addressing before heavy traffic.

**Theme 2: Post-payment redemption silent failures** — Flagged in CEO (Error Registry), Eng (Failure Modes #4). Both phases independently identified this. The pattern `try { await redemption } catch { console.error }` means a failed redemption is invisible to operators.

**Theme 3: Missing RLS on new tables** — Flagged in CEO (Section 5), Eng (Section 4). Single-layer defense (admin client only). Should be hardened.

---

## Deferred to TODOS.md

1. FX Redis/Vercel KV 캐시 교체 — prevents cold-start exhaustion of open.er-api.com free tier
2. RLS on `software_quote_codes`, `promo_codes`, `promo_code_redemptions` — security hardening
3. `.env.local.example` 업데이트 — new USD env vars + fallback rate vars
4. 결제 완료 이메일 발송 (Resend 연동) — user confirmation
5. 어드민 구독 상태 뷰 — monitor paid orders
6. 단위/통합 테스트 스위트 — billing domain tests
7. Rate limiting on `/api/billing/quote-code/validate` + `/api/billing/promo-code/validate`
8. 구조화 로그 + 결제 이벤트 메트릭
9. Post-payment redemption failure alert + runbook
10. Mobile UX for business checkout (quote + promo inputs cramped on small screens)


---

## CEO DUAL VOICES — CONSENSUS TABLE

*Source: Claude subagent (independent) | Codex: unavailable [subagent-only]*

```
CEO DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   ⚠️ 3/4  N/A    [subagent-only]
  2. Right problem to solve?           ⚠️ Yes*  N/A    [subagent-only]
  3. Scope calibration correct?        ⚠️ High  N/A    [subagent-only]
  4. Alternatives sufficiently explored?⚠️ Med  N/A    [subagent-only]
  5. Competitive/market risks covered? ⚠️ Med  N/A    [subagent-only]
  6. 6-month trajectory sound?         ⚠️ High  N/A    [subagent-only]
═══════════════════════════════════════════════════════════════
*Subagent raised: buyer identity (who holds card) as CRITICAL concern
 and fapiao/invoice gap as HIGH. These are USER CHALLENGE territory.
```

### CLAUDE SUBAGENT (CEO — strategic independence)

**Finding 1 [CRITICAL]: Buyer identity — who holds the card?**
The plan assumes a Korean operator will complete USD checkout via Toss. If the actual paying entity is a Chinese institution, Toss's KRW-based flow is structurally wrong regardless of UX polish.

**Finding 2 [HIGH]: Admin-gated quote codes limit self-serve conversion**
If >80% of Business revenue flows through manually-issued quote codes, the checkout revamp optimizes a path that requires a human touchpoint anyway. Self-serve conversion should be validated before investing in Phase 3.

**Finding 3 [HIGH]: 6-month regret — no fapiao/invoice path, no auto-renewal**
Chinese institutional buyers often require fapiao (Chinese VAT invoice). The plan has no invoice generation. Standard/Plus subscribers have no auto-renewal, no payment method management. These will be the first support complaints.

**Finding 4 [MEDIUM]: Stripe for subscription lifecycle dismissed too quickly**
Stripe provides auto-renewal, proration, dunning, invoice generation out of the box. The plan's dismissal ("Korean cards not covered") is valid only for Toss's home market. A hybrid (Stripe for USD subscriptions, Toss for KRW) may be worth a 2-week spike.

**Finding 5 [MEDIUM]: Competitive moat is thin**
ClassIn (the underlying platform) could add Korean-language self-serve checkout in a localization sprint. The checkout revamp is only defensible if bundled with non-replicable local services.


---

## ENG DUAL VOICES — CONSENSUS TABLE

*Source: Claude subagent (independent) | Codex: unavailable [subagent-only]*

```
ENG DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               ✅ Yes   N/A    [subagent-only]
  2. Test coverage sufficient?         ❌ No    N/A    [subagent-only]
  3. Performance risks addressed?      ⚠️ FX   N/A    [subagent-only]
  4. Security threats covered?         ❌ No    N/A    [subagent-only]
  5. Error paths handled?              ⚠️ Gap  N/A    [subagent-only]
  6. Deployment risk manageable?       ⚠️ Med  N/A    [subagent-only]
═══════════════════════════════════════════════════════════════
```

### CLAUDE SUBAGENT (Eng — independent review)

**NEW finding [Critical]: Promo `used_count` fallback is live race condition**
`promo-codes.ts:225-234` — when the RPC fails, SELECT+UPDATE without atomic guard. Two concurrent confirms can both read `used_count=5`, both write `6`. Promo limit silently bypassed. Fix: add `WHERE used_count < usage_limit` to fallback UPDATE.

**NEW finding [High]: Subscription promo scaffolding writes CORRUPT redemption rows**
`lib/server/software-checkout.ts:510-515` — `before = after = raw.amountUsd` records zero-discount redemption. If subscription promo support is ever added without reading this comment, all redemption rows will show $0 discount. Fix: delete or `if (false)` guard this branch until prepare side supports `amountUsdBeforeDiscount`.

**NEW finding [High]: `accountCount` not re-verified at confirm**
Only `amountKrw` is re-verified. A race between two prepare calls could result in the wrong order being confirmed. Fix: store and re-verify `accountCount` + `planId` at confirm.

**Confirmed gaps (also in Phase 1/3 above):**
- FX stale rate served silently → customer pays wrong KRW
- RLS missing on 3 financial tables
- No rate limiting on validate endpoints
- Migration atomicity gap
