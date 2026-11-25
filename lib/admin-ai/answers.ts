// 묻기 카드의 판정 — "고객에게 그대로 말해도 되나", "담당표 확인일이 오래됐나"는 코드가 정한다.
// 모델이 문장을 다듬더라도 이 판정을 바꾸지 못하도록 카드 값에서 매번 다시 계산한다(카드에 저장하지 않는다).
import type { AnswerCard, ContactCard } from "./types"

/**
 * 고객에게 그대로 전해도 되는 답인가. 근거가 있고, 답이 확정이고, 근거가 전부 확정이며 외부 사용이 가능할 때만 true.
 * 하나라도 사내 문서·상담 사례·확인 필요가 섞이면 false — 고객 문안은 CS 코파일럿에서 만든다.
 */
export function isCustomerSafeAnswer(card: AnswerCard): boolean {
  return (
    card.confidence === "confirmed" &&
    card.sources.length > 0 &&
    card.sources.every((source) => source.status === "confirmed" && source.externalUse)
  )
}

/** 담당표 확인일이 이 일수를 넘으면 "확인 오래됨"(결정 5 추천안). */
export const CONTACT_STALE_DAYS = 90

export type ContactCheckStatus = "missing" | "invalid" | "fresh" | "stale"

const DAY_MS = 24 * 60 * 60 * 1000

/** 확인일(YYYY-MM-DD, 한국 날짜)의 상태. 날짜가 아니면 "invalid" — 오래된 것처럼 보이지도, 새것처럼 보이지도 않게 따로 둔다. */
export function contactCheckStatus(checkedAt: string | undefined, now: number): ContactCheckStatus {
  if (!checkedAt) return "missing"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt)) return "invalid"
  const time = new Date(`${checkedAt}T00:00:00+09:00`).getTime()
  if (!Number.isFinite(time)) return "invalid"
  return (now - time) / DAY_MS > CONTACT_STALE_DAYS ? "stale" : "fresh"
}

/** 담당표에 이 주제의 줄이 없다 — 1차도 대리도 없는 카드. 화면은 "담당표 미입력"을 보인다. */
export function isContactEmpty(card: ContactCard): boolean {
  return !card.primary && !card.backup
}
