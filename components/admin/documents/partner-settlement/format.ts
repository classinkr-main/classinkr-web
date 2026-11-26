// 쿼드러닝 정산 보드 공용 — 금액 표기와 상태·경로 이름표. 금액은 모두 원.

import type { DealStatus, ReceiptKind, Route } from "@/lib/partner-settlement"

export type Tone = "danger" | "warn" | "info" | "muted" | "ok"

const MINUS = "−"

export const won = (n: number) => {
  const v = Math.round(n)
  return `${v < 0 ? MINUS : ""}${Math.abs(v).toLocaleString("ko-KR")}`
}
export const signedWon = (n: number) => (n > 0 ? `+${won(n)}` : n < 0 ? `${MINUS}${won(-n)}` : "0")
/** 329만 형태 (요약용), 음수는 −805만, 1억 이상은 1억 8,030만 */
export const man = (n: number) => {
  const v = Math.round(n / 10_000)
  const abs = Math.abs(v)
  const eok = Math.floor(abs / 10_000)
  const rest = abs % 10_000
  const body = eok ? `${eok.toLocaleString("ko-KR")}억${rest ? ` ${rest.toLocaleString("ko-KR")}만` : ""}` : `${abs.toLocaleString("ko-KR")}만`
  return `${v < 0 ? MINUS : ""}${body}`
}

/** "2026-11-05 17:44" 또는 "2026-11-05" → "11/5" */
export const mdOf = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
export const mdHm = (at: string) => `${mdOf(at)} ${at.slice(11, 16)}`
/** 스냅샷 generatedAt("2026-11-23T16:18+09:00") → "2026-11-23 16:18" */
export const snapshotTime = (generatedAt: string) => generatedAt.slice(0, 16).replace("T", " ")

export const STATUS_ORDER: DealStatus[] = ["due", "credit", "unverified", "settled"]

export const STATUS_META: Record<DealStatus, { label: string; tone: Tone; desc: string }> = {
  due: { label: "쿼드가 보낼 돈", tone: "danger", desc: "받은 돈이 공급가보다 적은 건" },
  credit: { label: "우리가 더 받은 돈", tone: "info", desc: "카드 직결제의 쿼드 몫, 또는 건별 청구보다 많이 온 이체" },
  unverified: { label: "입금 미확인", tone: "warn", desc: "입금 근거가 매출장부 빨간 글씨뿐인 건" },
  settled: { label: "끝난 건", tone: "ok", desc: "받은 돈이 공급가와 같은 건" },
}

export const ROUTE_LABEL: Record<Route, string> = { partner: "쿼드 수금", card: "카드 직결제", mixed: "카드 + 이체" }

export const KIND_META: Record<"charge" | ReceiptKind, { label: string; tone: Tone }> = {
  charge: { label: "청구", tone: "muted" },
  transfer: { label: "쿼드 이체", tone: "ok" },
  card: { label: "고객 카드", tone: "info" },
  ledger: { label: "장부 기준", tone: "warn" },
}
