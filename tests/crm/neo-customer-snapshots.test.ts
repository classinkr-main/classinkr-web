import { describe, expect, it } from "vitest"

import { normalizeCrmName } from "@/lib/crm-source-linking"
import { buildCrmNeoCustomerSnapshotInserts } from "@/lib/repositories/crm-neo-customer-snapshots"

const NOW = new Date("2026-06-26T09:00:00.000Z")

describe("CRM NEO customer snapshot read model", () => {
  it("folds account, service balance, expiry, owner, region, and order data into one local row", () => {
    const rows = buildCrmNeoCustomerSnapshotInserts({
      now: NOW,
      accounts: [
        {
          external_id: "acc-1",
          display_name: "대치스파르타",
          owner_name: "owner-1",
          occurred_at: "2026-06-25T00:00:00.000Z",
          synced_at: "2026-06-26T08:00:00.000Z",
          last_seen_run_id: "run-account",
          payload: {
            accountName: "대치스파르타",
            phone: "010-1111-2222",
            province: "서울",
          },
        },
      ],
      shroffAccounts: [
        {
          external_id: "eeo-1",
          synced_at: "2026-06-26T08:10:00.000Z",
          last_seen_run_id: "run-shroff",
          payload: {
            Account__c: "acc-1",
            CurrencyAmount__c: 0,
            expireTime__c: "2026-07-20T00:00:00.000Z",
            LastClassDate__c: "2026-06-10T00:00:00.000Z",
            uid__c: "uid-1",
            serviceState__c: "1",
          },
        },
      ],
      opportunities: [
        {
          external_id: "opp-1",
          amount: 1200,
          synced_at: "2026-06-26T08:20:00.000Z",
          last_seen_run_id: "run-opportunity",
          payload: { accountId: "acc-1" },
        },
      ],
      ownerNames: new Map([["owner-1", "김담당"]]),
      excludedOwnerIds: new Set(),
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      source_system: "xiaoshouyi",
      account_id: "acc-1",
      account_name: "대치스파르타",
      owner_id: "owner-1",
      owner_name: "김담당",
      phone: "010-1111-2222",
      uid: "uid-1",
      balance: 0,
      order_amount: 1200,
      order_count: 1,
      has_eeo: true,
      risk_level: "soon",
      risk_confidence: "high",
      shroff_synced_at: "2026-06-26T08:10:00.000Z",
      opportunity_synced_at: "2026-06-26T08:20:00.000Z",
      source_synced_at: "2026-06-26T08:20:00.000Z",
    })
    expect(rows[0]?.region_label).toBeTruthy()
    expect(rows[0]?.risk_reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "subscription_expiring" }),
        expect.objectContaining({ code: "depleted_balance" }),
      ])
    )
  })

  it("excludes owners curated out of the Korea CRM read model", () => {
    const rows = buildCrmNeoCustomerSnapshotInserts({
      now: NOW,
      accounts: [
        {
          external_id: "acc-cn",
          display_name: "중국팀 고객",
          owner_name: "owner-cn",
          occurred_at: null,
          synced_at: "2026-06-26T08:00:00.000Z",
          last_seen_run_id: "run-account",
          payload: {},
        },
      ],
      shroffAccounts: [],
      opportunities: [],
      ownerNames: new Map([["owner-cn", "CN Owner"]]),
      excludedOwnerIds: new Set(["owner-cn"]),
    })

    expect(rows).toEqual([])
  })

  it("stores region from a confirmed REV sheet mapping on the CRM-owned snapshot", () => {
    const rows = buildCrmNeoCustomerSnapshotInserts({
      now: NOW,
      accounts: [
        {
          external_id: "acc-1",
          display_name: "대치스파르타",
          owner_name: "owner-1",
          occurred_at: "2026-06-25T00:00:00.000Z",
          synced_at: "2026-06-26T08:00:00.000Z",
          last_seen_run_id: "run-account",
          payload: {},
        },
      ],
      shroffAccounts: [],
      opportunities: [],
      ownerNames: new Map([["owner-1", "김담당"]]),
      excludedOwnerIds: new Set(),
      regionHints: {
        byAccountId: new Map([
          [
            "acc-1",
            {
              label: "부산",
              source: "branch_rev_confirmed_link",
              sourceRecordKey: "rev:12:대치스파르타:2026-06-01:1000",
              customerName: "대치스파르타",
            },
          ],
        ]),
        byNormalizedName: new Map(),
      },
    })

    expect(rows[0]?.region_label).toBe("부산")
    expect(rows[0]?.source_refs).toMatchObject({
      regionSource: "branch_rev_confirmed_link",
      regionSourceCustomerName: "대치스파르타",
    })
  })

  it("falls back to a unique exact REV customer-name region when no confirmed link exists", () => {
    const rows = buildCrmNeoCustomerSnapshotInserts({
      now: NOW,
      accounts: [
        {
          external_id: "acc-1",
          display_name: "일산수학학원",
          owner_name: "owner-1",
          occurred_at: "2026-06-25T00:00:00.000Z",
          synced_at: "2026-06-26T08:00:00.000Z",
          last_seen_run_id: "run-account",
          payload: {},
        },
      ],
      shroffAccounts: [],
      opportunities: [],
      ownerNames: new Map([["owner-1", "김담당"]]),
      excludedOwnerIds: new Set(),
      regionHints: {
        byAccountId: new Map(),
        byNormalizedName: new Map([
          [
            normalizeCrmName("일산수학학원"),
            {
              label: "경기",
              source: "branch_rev_exact_name",
              sourceRecordKey: "rev:20:일산수학:2026-06-01:1000",
              customerName: "일산수학학원",
            },
          ],
        ]),
      },
    })

    expect(rows[0]?.region_label).toBe("경기")
    expect(rows[0]?.source_refs).toMatchObject({
      regionSource: "branch_rev_exact_name",
    })
  })
})
