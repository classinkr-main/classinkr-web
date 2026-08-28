// 충전제 계정의 소진 예상일 — "재충전 시기가 다가온다"를 잔액이 0이 되기 전에 잡기 위한 파생.
//
// 원천은 FinancialInformation__c(입출금 원장, AmountReal__c 는 元).
// ResourceInformation__c 는 쓰지 않는다 — ServiceType 마다 단위가 다르고(같은 '课节消耗'이
// 어디선 0.38, 어디선 187.99), 절반 가까이가 0이며, 원장 Margin 이 계정 잔액과 맞지 않는다.
//
// 가장 큰 함정은 표본이 1건일 때다. 서비스 개통 같은 일회성 큰 결제 한 건을 90일로 펴면
// 일평균이 폭등해 멀쩡한 계정이 "내일 소진"으로 뜬다. 그래서 건수 하한을 둔다.

/** 원장 한 줄. amount 는 元이며 음수가 차감이다. */
export interface ConsumptionEvent {
  occurredAt: string | number | null
  amount: number | null
}

export type ConsumptionConfidence = "high" | "medium" | "none"

export interface ConsumptionForecastInput {
  /** 표시 정본 잔액(元). */
  balance: number | null
  events: ConsumptionEvent[]
  windowDays?: number
  now?: Date
}

export interface ConsumptionForecast {
  /** 창 안 차감액을 창 길이로 나눈 일평균(元/일). 산출 불가면 null. */
  dailyBurn: number | null
  /** 잔액이 0이 되기까지 남은 일수. 산출 불가면 null. */
  daysLeft: number | null
  /** 창 안에서 실제로 관측된 차감 건수. 신뢰도의 근거이므로 함께 노출한다. */
  eventCount: number
  windowDays: number
  confidence: ConsumptionConfidence
}

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_WINDOW_DAYS = 90
/** 이보다 적으면 일평균을 만들지 않는다 — 일회성 결제 한 건이 상시 소비로 둔갑한다. */
const MIN_EVENTS_FOR_FORECAST = 3
/** 이 이상이면 반복 소비로 본다. */
const MIN_EVENTS_FOR_HIGH_CONFIDENCE = 6

function toTime(value: string | number | null): number | null {
  if (value == null) return null
  const time = typeof value === "number" ? value : Date.parse(value)
  return Number.isFinite(time) ? time : null
}

export function deriveConsumptionForecast(input: ConsumptionForecastInput): ConsumptionForecast {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS
  const nowMs = (input.now ?? new Date()).getTime()
  const from = nowMs - windowDays * DAY_MS

  let spent = 0
  let eventCount = 0
  for (const event of input.events) {
    const amount = typeof event.amount === "number" && Number.isFinite(event.amount) ? event.amount : null
    if (amount == null || amount >= 0) continue
    const time = toTime(event.occurredAt)
    if (time == null || time < from || time > nowMs) continue
    spent += -amount
    eventCount += 1
  }

  const empty: ConsumptionForecast = {
    dailyBurn: null,
    daysLeft: null,
    eventCount,
    windowDays,
    confidence: "none",
  }

  if (eventCount < MIN_EVENTS_FOR_FORECAST || spent <= 0) return empty

  const dailyBurn = spent / windowDays
  const balance = typeof input.balance === "number" && Number.isFinite(input.balance) ? input.balance : null

  // 잔액을 모르거나 이미 소진된 계정은 "임박"이 아니다 — 소진은 별도 신호가 잡는다.
  if (balance == null || balance <= 0) {
    return { ...empty, dailyBurn, confidence: "none" }
  }

  return {
    dailyBurn,
    daysLeft: Math.max(0, Math.round(balance / dailyBurn)),
    eventCount,
    windowDays,
    confidence: eventCount >= MIN_EVENTS_FOR_HIGH_CONFIDENCE ? "high" : "medium",
  }
}
