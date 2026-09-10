// 기존 고객 재연락 알림 — 만료·재충전·소진을 담당자별로 묶어 하루 한 번 밀어준다.
//
// 설계 원칙 셋:
// 1. 고객 단위로 쏘지 않는다. 하루 수십 건이면 아무도 안 읽는다. 담당자당 1건으로 묶는다.
// 2. 같은 고객·같은 사유는 쿨다운 안에 다시 보내지 않는다. dedupeKey 가 그 기준이다.
// 3. 최신 데이터에서만 만든다 — 동기화 체인 끝에서 호출한다. 22일 묵은 잔액으로 알림을
//    쏘면 이미 연장한 고객에게 "연장하세요"가 가고, 진짜 소진 고객은 조용하다.

export type RenewalAlertKind = "expiring" | "recharge_due" | "depleted"

export const RENEWAL_ALERT_LABELS: Record<RenewalAlertKind, string> = {
  expiring: "만료 임박",
  recharge_due: "재충전 임박",
  depleted: "잔액 소진",
}

/** 스냅샷에서 알림 판단에 필요한 최소 필드. */
export interface RenewalAlertRow {
  accountId: string
  accountName: string
  ownerId: string | null
  ownerName: string
  billingMode: string
  balance: number | null
  expireInDays: number | null
  depletionInDays: number | null
  riskReasons: Array<{ code?: string | null }> | null
}

export interface RenewalAlertItem {
  accountId: string
  accountName: string
  kind: RenewalAlertKind
  /** 만료 D-day 또는 소진 예상일. 소진 완료 건은 null. */
  dueInDays: number | null
  balance: number | null
  /** 같은 고객·같은 사유의 재발송을 막는 키. */
  dedupeKey: string
}

export interface RenewalAlertDigest {
  ownerId: string | null
  ownerName: string
  items: RenewalAlertItem[]
  counts: Record<RenewalAlertKind, number>
  /** 담당자 알림 한 줄 요약. */
  summary: string
}

export interface BuildRenewalAlertsOptions {
  /** 만료를 며칠 전부터 알릴지. */
  expiringWithinDays?: number
  /** 담당자 한 명에게 한 번에 보여줄 최대 건수. */
  maxItemsPerOwner?: number
}

const DEFAULT_EXPIRING_WITHIN_DAYS = 30
const DEFAULT_MAX_ITEMS_PER_OWNER = 20

function hasReason(row: RenewalAlertRow, code: string) {
  return (row.riskReasons ?? []).some((reason) => reason?.code === code)
}

/**
 * 한 고객이 여러 사유에 걸릴 수 있지만 알림은 가장 급한 하나만 낸다.
 * 만료 > 소진 > 재충전 임박 순 — 앞의 것일수록 서비스가 이미 멈췄거나 곧 멈춘다.
 */
function classify(row: RenewalAlertRow, expiringWithin: number): RenewalAlertItem | null {
  if (row.expireInDays != null && row.expireInDays >= 0 && row.expireInDays <= expiringWithin) {
    return {
      accountId: row.accountId,
      accountName: row.accountName,
      kind: "expiring",
      dueInDays: row.expireInDays,
      balance: row.balance,
      dedupeKey: `expiring:${row.accountId}`,
    }
  }

  // 잔액 신호는 충전제에만 의미가 있다. 위험 판정이 이미 게이트를 통과시킨 것만 신뢰한다.
  if (hasReason(row, "depleted_balance")) {
    return {
      accountId: row.accountId,
      accountName: row.accountName,
      kind: "depleted",
      dueInDays: null,
      balance: row.balance,
      dedupeKey: `depleted:${row.accountId}`,
    }
  }

  if (hasReason(row, "recharge_due") && row.depletionInDays != null) {
    return {
      accountId: row.accountId,
      accountName: row.accountName,
      kind: "recharge_due",
      dueInDays: row.depletionInDays,
      balance: row.balance,
      dedupeKey: `recharge:${row.accountId}`,
    }
  }

  return null
}

function emptyCounts(): Record<RenewalAlertKind, number> {
  return { expiring: 0, recharge_due: 0, depleted: 0 }
}

function buildSummary(counts: Record<RenewalAlertKind, number>) {
  const parts: string[] = []
  if (counts.expiring) parts.push(`만료 임박 ${counts.expiring}곳`)
  if (counts.depleted) parts.push(`잔액 소진 ${counts.depleted}곳`)
  if (counts.recharge_due) parts.push(`재충전 임박 ${counts.recharge_due}곳`)
  return parts.join(" · ")
}

/**
 * 담당자별 알림 묶음을 만든다.
 * @param suppressedKeys 쿨다운에 걸려 이번에 보내지 않을 dedupeKey 집합.
 */
export function buildRenewalAlertDigests(
  rows: RenewalAlertRow[],
  options: BuildRenewalAlertsOptions & { suppressedKeys?: Set<string> } = {}
): RenewalAlertDigest[] {
  const expiringWithin = options.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS
  const maxItems = options.maxItemsPerOwner ?? DEFAULT_MAX_ITEMS_PER_OWNER
  const suppressed = options.suppressedKeys ?? new Set<string>()

  const byOwner = new Map<string, RenewalAlertDigest>()

  for (const row of rows) {
    const item = classify(row, expiringWithin)
    if (!item || suppressed.has(item.dedupeKey)) continue

    const key = row.ownerId ?? row.ownerName
    let digest = byOwner.get(key)
    if (!digest) {
      digest = { ownerId: row.ownerId, ownerName: row.ownerName, items: [], counts: emptyCounts(), summary: "" }
      byOwner.set(key, digest)
    }
    digest.items.push(item)
    digest.counts[item.kind] += 1
  }

  const digests = [...byOwner.values()]
  for (const digest of digests) {
    // 급한 순으로 세운다 — 잘려도 위에 남는 것이 가장 급한 건이어야 한다.
    const rank: Record<RenewalAlertKind, number> = { expiring: 0, depleted: 1, recharge_due: 2 }
    digest.items.sort((a, b) => {
      if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind]
      return (a.dueInDays ?? Number.MAX_SAFE_INTEGER) - (b.dueInDays ?? Number.MAX_SAFE_INTEGER)
    })
    digest.summary = buildSummary(digest.counts)
    digest.items = digest.items.slice(0, maxItems)
  }

  // 할 일이 많은 담당자를 위로.
  digests.sort((a, b) => {
    const total = (d: RenewalAlertDigest) => d.counts.expiring + d.counts.depleted + d.counts.recharge_due
    return total(b) - total(a)
  })
  return digests
}
