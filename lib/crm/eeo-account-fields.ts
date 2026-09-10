// EEO(ShroffAccount) 계정 필드 읽기 규약 — 잔액과 과금 유형의 단일 진실 원천.
//
// 두 값 모두 "연결 시 확인해야 하는 것"이고, 두 값 모두 과거에 잘못된 필드를 읽고 있었다.
// 같은 실수가 여러 호출부에서 반복되지 않도록 여기에 모은다.

/** 매출시트 J열(product_version)이 말하는 과금 유형. */
export type EeoBillingMode = "consumption" | "subscription" | "hardware" | "unknown"

export const EEO_BILLING_MODE_LABELS: Record<EeoBillingMode, string> = {
  consumption: "충전제",
  subscription: "구독제",
  hardware: "하드웨어",
  unknown: "미확인",
}

/**
 * 표시용 계정 잔액(元).
 *
 * eeoCRM 필드 규약(원 CRM 필드 정의 기준):
 * - `currencyShow__c`  잔액(元), 소수 2자리 — **표시 정본**
 * - `currency__c`      잔액(分) — `currencyShow__c = currency__c / 100`
 * - `CurrencyAmount__c` 잔액 − 미납한도, 즉 **여신을 더한 가용액**
 *
 * 과거에는 `CurrencyAmount__c`를 잔액으로 읽었다. 여신을 가진 계정에서 실제 잔액이
 * 마이너스인데도 큰 양수로 보였고(프로덕션 6곳·합계 ¥112,610 과대), 소수점도 반올림돼
 * 사라졌다. "충전제의 남은 사용량"을 판단하는 숫자이므로 여신은 섞이면 안 된다.
 */
export function readEeoBalance(payload: Record<string, unknown> | null | undefined): number | null {
  const show = toFiniteNumber(payload?.["currencyShow__c"])
  if (show != null) return show

  // 표시 필드가 비어 있으면 分 단위 원본에서 환산한다.
  const cents = toFiniteNumber(payload?.["currency__c"])
  if (cents != null) return Math.round(cents) / 100

  // 여기까지 오면 남은 건 여신이 섞인 값뿐이라, 잔액으로 쓰지 않고 모른다고 답한다.
  return null
}

/**
 * 매출시트 J열 문자열에서 과금 유형을 읽는다.
 * 시트는 이 한 칸에 제품(Hardware)과 과금방식(Consumption/Subscription)을 섞어 적으므로,
 * 판별되지 않는 값은 추측하지 않고 `unknown`으로 둔다.
 */
export function deriveEeoBillingMode(productVersion: string | null | undefined): EeoBillingMode {
  const raw = productVersion?.trim()
  if (!raw) return "unknown"
  const value = raw.toLowerCase()

  if (value.includes("consumption")) return "consumption"
  if (value.includes("subscription")) return "subscription"
  // ClassIn月享版 = 월 단위 구독 상품.
  if (raw.includes("月享")) return "subscription"
  if (value.includes("hardware")) return "hardware"

  return "unknown"
}

/** 잔액이 의미를 갖는 과금 유형인가 — 구독제 계정의 잔액 0은 소진이 아니다. */
export function billingModeUsesBalance(mode: EeoBillingMode): boolean {
  return mode === "consumption"
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
