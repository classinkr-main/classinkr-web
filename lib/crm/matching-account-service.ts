// 매칭(연결 확정) 화면에서 후보를 확정하기 전에 확인해야 하는 EEO 계정 두 값 —
// 서비스 기간(만료일)과 계정 잔액 — 을 소스 링크에서 되짚는 해석기.
//
// 연결 확정은 되돌리기 번거로운 조작이라, 확정 직전에 "이 계정이 곧 만료되는지",
// "충전 잔액이 남아 있는지"를 같은 줄에서 보게 하는 것이 목적이다.
// 링크가 EEO 계정까지 이어지지 않는 행(시트·리드 단독 행)은 null 을 돌려주고,
// 화면은 값을 지어내지 않는다.

/** crm_neo_customer_snapshots 에서 읽어오는 최소 필드. */
export interface MatchingAccountServiceRow {
  account_id: string
  balance: number | string | null
  expire_at: string | null
  source_synced_at: string | null
  source_refs: Record<string, unknown> | null
}

export interface MatchingAccountServiceSnapshot {
  accountId: string
  balance: number | null
  expireAt: string | null
  syncedAt: string | null
}

export interface MatchingAccountServiceIndex {
  byAccountId: Map<string, MatchingAccountServiceSnapshot>
  byShroffAccountId: Map<string, MatchingAccountServiceSnapshot>
}

/** 링크 한 건에서 계정을 되짚는 데 필요한 식별자. */
export interface MatchingAccountServiceLookup {
  sourceSystem: string
  sourceObject: string | null
  sourceRecordKey: string | null
  targetType: string | null
  targetId: string | null
}

export type MatchingAccountServiceResolution =
  | "source_account"
  | "source_shroff_account"
  | "target_external_account"

export interface MatchingAccountService {
  balance: number | null
  expireAt: string | null
  syncedAt: string | null
  resolvedVia: MatchingAccountServiceResolution
}

function toNumber(value: number | string | null): number | null {
  if (value == null) return null
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function readShroffIds(refs: Record<string, unknown> | null): string[] {
  const raw = refs?.["shroffAccountExternalIds"]
  if (!Array.isArray(raw)) return []
  return raw.filter((value): value is string => typeof value === "string" && value.length > 0)
}

export function buildMatchingAccountServiceIndex(
  rows: MatchingAccountServiceRow[]
): MatchingAccountServiceIndex {
  const byAccountId = new Map<string, MatchingAccountServiceSnapshot>()
  const byShroffAccountId = new Map<string, MatchingAccountServiceSnapshot>()

  for (const row of rows) {
    if (!row.account_id) continue
    const snapshot: MatchingAccountServiceSnapshot = {
      accountId: row.account_id,
      balance: toNumber(row.balance),
      expireAt: row.expire_at,
      syncedAt: row.source_synced_at,
    }
    byAccountId.set(row.account_id, snapshot)
    // 한 EEO(ShroffAccount)가 두 고객에 매달리는 일은 없어야 하지만, 데이터가 그렇게
    // 들어오면 먼저 본 계정을 유지한다 — 뒤엣것으로 조용히 덮어써 다른 고객의 잔액을
    // 보여주는 편이 더 위험하다.
    for (const shroffId of readShroffIds(row.source_refs)) {
      if (!byShroffAccountId.has(shroffId)) byShroffAccountId.set(shroffId, snapshot)
    }
  }

  return { byAccountId, byShroffAccountId }
}

export function resolveMatchingAccountService(
  index: MatchingAccountServiceIndex,
  lookup: MatchingAccountServiceLookup
): MatchingAccountService | null {
  const attempts: Array<[MatchingAccountServiceResolution, MatchingAccountServiceSnapshot | undefined]> = [
    // 링크가 이미 EEO 계정을 직접 가리키는 경우가 가장 확실하다.
    [
      "target_external_account",
      lookup.targetType === "external_account" && lookup.targetId
        ? index.byAccountId.get(lookup.targetId)
        : undefined,
    ],
    [
      "source_account",
      lookup.sourceSystem === "xiaoshouyi" && lookup.sourceObject === "account" && lookup.sourceRecordKey
        ? index.byAccountId.get(lookup.sourceRecordKey)
        : undefined,
    ],
    [
      "source_shroff_account",
      lookup.sourceSystem === "xiaoshouyi" &&
      lookup.sourceObject === "ShroffAccount__c" &&
      lookup.sourceRecordKey
        ? index.byShroffAccountId.get(lookup.sourceRecordKey)
        : undefined,
    ],
  ]

  for (const [resolvedVia, snapshot] of attempts) {
    if (!snapshot) continue
    // 잔액·만료가 둘 다 비어 있으면 "계정은 찾았지만 아는 게 없다"는 뜻이라
    // 빈 값을 확정값처럼 보이게 하지 않고 미해결로 남긴다.
    if (snapshot.balance == null && !snapshot.expireAt) return null
    return {
      balance: snapshot.balance,
      expireAt: snapshot.expireAt,
      syncedAt: snapshot.syncedAt,
      resolvedVia,
    }
  }

  return null
}
