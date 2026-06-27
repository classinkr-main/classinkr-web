// 고객 스캔성 플래그 — 시안(ClassIn CRM) 어휘를 기존 데이터에서 파생.
// 모든 신호는 이미 보유한 필드(점수·생애주기·만료일·잔액·미수·최근활동)에서 규칙 기반으로 도출한다.

export type CustomerFlag = "vip" | "hot" | "new" | "expiring" | "due" | "dormant" | "upsell"

export const FLAG_META: Record<CustomerFlag, { label: string; bg: string; color: string; border: string }> = {
  vip: { label: "VIP", bg: "#f4f3ff", color: "#4338ca", border: "#e4e2fb" },
  hot: { label: "핫", bg: "#FEF3EE", color: "#B85C33", border: "#f3ddd0" },
  new: { label: "신규", bg: "#ECFDF5", color: "#084734", border: "#D7EBDD" },
  expiring: { label: "만료임박", bg: "#FBF1E0", color: "#7A520F", border: "#ECD29C" },
  due: { label: "미수", bg: "#FEF3EE", color: "#B85C33", border: "#f3ddd0" },
  dormant: { label: "휴면", bg: "#f0f0ec", color: "#6f6f6a", border: "#e8e8e4" },
  upsell: { label: "업셀", bg: "#ECFDF5", color: "#084734", border: "#D7EBDD" },
}

// 표시 우선순위(중요·긴급 먼저).
const FLAG_ORDER: CustomerFlag[] = ["vip", "expiring", "due", "hot", "upsell", "new", "dormant"]

export interface CustomerFlagInput {
  source: "lead" | "neo_account"
  lifecycle?: string | null
  score?: number | null
  expireAt?: string | null
  balance?: number | null
  outstanding?: number | null
  updatedAt?: string | null
  vip?: boolean
  nowMs?: number
}

function daysFromNow(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return (t - nowMs) / 86_400_000
}

export function deriveCustomerFlags(input: CustomerFlagInput): CustomerFlag[] {
  const now = input.nowMs ?? Date.now()
  const set = new Set<CustomerFlag>()

  if (input.vip) set.add("vip")
  if ((input.score ?? 0) >= 68) set.add("hot")
  if (input.lifecycle === "new_lead") set.add("new")

  const expDays = daysFromNow(input.expireAt, now)
  if (expDays != null && expDays <= 30) set.add("expiring")

  if ((input.outstanding ?? 0) > 0) set.add("due")

  const updDays = daysFromNow(input.updatedAt, now)
  if (updDays != null && updDays <= -30) set.add("dormant")

  if (input.source === "neo_account" && input.lifecycle !== "account_risk" && (input.balance ?? 0) > 0) {
    set.add("upsell")
  }

  return FLAG_ORDER.filter((flag) => set.has(flag))
}
