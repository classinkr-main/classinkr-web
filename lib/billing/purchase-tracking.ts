import { trackEvent } from "@/lib/analytics"

/**
 * 결제 성공 화면의 purchase 발화를 브라우저당 주문 1회로 묶는 표시 키.
 * 새로고침·뒤로가기로 성공 화면이 다시 열려도 전환이 두 번 집계되지 않게 한다.
 */
export const PURCHASE_TRACKED_KEY_PREFIX = "classinkr.purchaseTracked."

export interface TrackedPurchase {
  orderId: string
  amount: number
  conversionEventId?: string
}

// localStorage 는 사이트 데이터 차단(getter 자체가 SecurityError)·용량 초과(QuotaExceededError)·
// 구형 Safari 사생활 모드에서 throw 한다. 결제 성공 effect 안에서 던지면 error boundary 가
// 성공 화면을 덮으므로, 읽기·쓰기 모두 실패를 삼킨다.
function readTrackedFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

function writeTrackedFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1")
  } catch {
    // 저장소 접근 불가 — 같은 페이지 안의 중복은 호출부(trackedOrderRef)가 막는다.
  }
}

/**
 * 주문의 purchase 이벤트를 보낸다. 이미 보낸 주문이면 건너뛰고 false 를 돌려준다.
 * 저장소가 막힌 브라우저에서는 페이지를 열 때마다 1회씩 보낸다(throw 하지 않는다).
 */
export function trackPurchaseOnce(order: TrackedPurchase): boolean {
  const key = `${PURCHASE_TRACKED_KEY_PREFIX}${order.orderId}`
  if (readTrackedFlag(key)) return false

  trackEvent("purchase", {
    transaction_id: order.orderId,
    event_id: order.conversionEventId ?? `purchase:${order.orderId}`,
    value: order.amount,
    currency: "KRW",
  })
  writeTrackedFlag(key)
  return true
}
