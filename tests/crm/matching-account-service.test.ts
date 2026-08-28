import { describe, expect, it } from "vitest"

import {
  buildMatchingAccountServiceIndex,
  resolveMatchingAccountService,
  type MatchingAccountServiceLookup,
  type MatchingAccountServiceRow,
} from "@/lib/crm/matching-account-service"

const SYNCED_AT = "2026-08-05T08:55:10.172+00:00"

function row(overrides: Partial<MatchingAccountServiceRow> = {}): MatchingAccountServiceRow {
  return {
    account_id: "4006219659975492",
    balance: 5135,
    expire_at: "2026-12-30T16:00:00+00:00",
    source_synced_at: SYNCED_AT,
    source_refs: { shroffAccountExternalIds: ["4003673471861377"] },
    ...overrides,
  }
}

function lookup(overrides: Partial<MatchingAccountServiceLookup> = {}): MatchingAccountServiceLookup {
  return {
    sourceSystem: "xiaoshouyi",
    sourceObject: "account",
    sourceRecordKey: "4006219659975492",
    targetType: "customer",
    targetId: "cust-1",
    ...overrides,
  }
}

describe("buildMatchingAccountServiceIndex", () => {
  it("계정 id 와 ShroffAccount id 양쪽으로 색인한다", () => {
    const index = buildMatchingAccountServiceIndex([row()])
    expect(index.byAccountId.get("4006219659975492")?.balance).toBe(5135)
    expect(index.byShroffAccountId.get("4003673471861377")?.balance).toBe(5135)
  })

  it("문자열 잔액을 숫자로 정규화하고, 숫자가 아니면 null 로 둔다", () => {
    const index = buildMatchingAccountServiceIndex([
      row({ account_id: "a", balance: "1594.65", source_refs: null }),
      row({ account_id: "b", balance: "n/a", source_refs: null }),
    ])
    expect(index.byAccountId.get("a")?.balance).toBeCloseTo(1594.65)
    expect(index.byAccountId.get("b")?.balance).toBeNull()
  })

  it("한 ShroffAccount 가 두 계정에 매달리면 먼저 본 계정을 유지한다", () => {
    const shared = { shroffAccountExternalIds: ["shroff-1"] }
    const index = buildMatchingAccountServiceIndex([
      row({ account_id: "first", balance: 100, source_refs: shared }),
      row({ account_id: "second", balance: 999, source_refs: shared }),
    ])
    expect(index.byShroffAccountId.get("shroff-1")?.accountId).toBe("first")
  })

  it("source_refs 가 없거나 형태가 다르면 ShroffAccount 색인을 만들지 않는다", () => {
    const index = buildMatchingAccountServiceIndex([
      row({ source_refs: null }),
      row({ account_id: "x", source_refs: { shroffAccountExternalIds: "not-an-array" } }),
    ])
    expect(index.byShroffAccountId.size).toBe(0)
  })
})

describe("resolveMatchingAccountService", () => {
  const index = buildMatchingAccountServiceIndex([row()])

  it("xiaoshouyi account 소스 행을 계정 id 로 되짚는다", () => {
    const result = resolveMatchingAccountService(index, lookup())
    expect(result).toMatchObject({ balance: 5135, resolvedVia: "source_account", syncedAt: SYNCED_AT })
  })

  it("ShroffAccount 소스 행을 source_refs 매핑으로 되짚는다", () => {
    const result = resolveMatchingAccountService(
      index,
      lookup({ sourceObject: "ShroffAccount__c", sourceRecordKey: "4003673471861377" })
    )
    expect(result?.resolvedVia).toBe("source_shroff_account")
    expect(result?.expireAt).toBe("2026-12-30T16:00:00+00:00")
  })

  it("external_account 를 직접 가리키는 링크를 우선한다", () => {
    const result = resolveMatchingAccountService(
      index,
      lookup({
        sourceSystem: "naver_shared_map",
        sourceObject: "saved_place",
        sourceRecordKey: "place-1",
        targetType: "external_account",
        targetId: "4006219659975492",
      })
    )
    expect(result?.resolvedVia).toBe("target_external_account")
  })

  it("EEO 계정으로 이어지지 않는 시트·리드 행은 null 을 준다", () => {
    expect(
      resolveMatchingAccountService(
        index,
        lookup({ sourceSystem: "branch_rev_sheet", sourceObject: "deal", sourceRecordKey: "row:12" })
      )
    ).toBeNull()
  })

  it("계정은 찾았지만 잔액·만료가 둘 다 비면 값을 지어내지 않고 null 을 준다", () => {
    const empty = buildMatchingAccountServiceIndex([
      row({ account_id: "empty", balance: null, expire_at: null, source_refs: null }),
    ])
    expect(
      resolveMatchingAccountService(empty, lookup({ sourceRecordKey: "empty" }))
    ).toBeNull()
  })

  it("잔액만 있고 만료가 없어도(충전제 무기한) 값을 보여준다", () => {
    const balanceOnly = buildMatchingAccountServiceIndex([
      row({ account_id: "bal", balance: 0, expire_at: null, source_refs: null }),
    ])
    expect(resolveMatchingAccountService(balanceOnly, lookup({ sourceRecordKey: "bal" }))).toMatchObject({
      balance: 0,
      expireAt: null,
    })
  })
})
