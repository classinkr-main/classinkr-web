import { describe, expect, it } from "vitest"

import {
  classifyCrmSourceLinkReviewValidation,
  classifyCrmSourceLinkValidation,
  getCrmSourceLinkIdentity,
  getCrmAliasEvidence,
} from "@/lib/crm/source-link-validation"

const candidate = {
  sourceSystem: "branch_rev_sheet",
  targetType: "customer",
  targetId: "customer-1",
  linkStatus: "candidate",
  metadata: {
    source_owner: "KR Team · Choi",
    match_strategy: "alias",
    match_evidence: ["name:char_overlap:0.17", "alias:Class"],
  },
}

describe("CRM source-link alias validation", () => {
  it("normalizes and deduplicates alias evidence", () => {
    expect(getCrmAliasEvidence({ match_evidence: ["alias: Class ", "alias:class", "name:exact"] })).toEqual([
      "class",
    ])
  })

  it("rejects a historical candidate whose alias belongs to another source", () => {
    expect(
      classifyCrmSourceLinkValidation(candidate, [
        {
          source_system: "lead",
          normalized_alias: "class",
          target_type: "customer",
          target_id: "customer-1",
          normalized_manager_name: null,
        },
      ])
    ).toBe("legacy_unscoped_alias")
  })

  it("accepts a candidate only when source, target and optional manager scope still match", () => {
    const alias = {
      source_system: "branch_rev_sheet",
      normalized_alias: "class",
      target_type: "customer",
      target_id: "customer-1",
      normalized_manager_name: "krteamchoi",
    }

    expect(
      classifyCrmSourceLinkValidation(
        {
          ...candidate,
          metadata: { ...candidate.metadata, match_evidence: ["alias:distinct-academy"] },
        },
        [{ ...alias, normalized_alias: "distinctacademy" }]
      )
    ).toBe("valid")
    expect(
      classifyCrmSourceLinkValidation(candidate, [{ ...alias, normalized_manager_name: "different owner" }])
    ).toBe("legacy_unscoped_alias")
  })

  it("does not apply catalog-only validation to manual or lead candidates", () => {
    expect(
      classifyCrmSourceLinkValidation(
        { ...candidate, metadata: { ...candidate.metadata, manual: true } },
        []
      )
    ).toBe("valid")
    expect(classifyCrmSourceLinkValidation({ ...candidate, sourceSystem: "lead" }, [])).toBe("valid")
  })

  it("retires candidate/stale siblings when the same source already has a confirmed link", () => {
    const source = {
      ...candidate,
      sourceObject: "branch_rev_deals",
      sourceRecordKey: "rev:1:academy:2026-01-01:100",
    }
    const confirmedSourceIdentities = new Set([getCrmSourceLinkIdentity(source)])

    expect(
      classifyCrmSourceLinkReviewValidation(source, {
        confirmedSourceIdentities,
        activeAliases: [],
        canValidateAliases: false,
      })
    ).toBe("retired_confirmed_sibling")
  })

  it("fails open only for alias catalog validation when its snapshot is incomplete", () => {
    const source = {
      ...candidate,
      sourceObject: "branch_rev_deals",
      sourceRecordKey: "rev:1:academy:2026-01-01:100",
    }

    const safeSource = {
      ...source,
      metadata: { ...source.metadata, match_evidence: ["alias:distinct-academy"] },
    }

    expect(
      classifyCrmSourceLinkReviewValidation(safeSource, {
        confirmedSourceIdentities: new Set(),
        activeAliases: [],
        canValidateAliases: false,
      })
    ).toBe("valid")
    expect(
      classifyCrmSourceLinkReviewValidation(safeSource, {
        confirmedSourceIdentities: new Set(),
        activeAliases: [],
        canValidateAliases: true,
      })
    ).toBe("legacy_unscoped_alias")
  })

  it("separates a generic alias even when that active alias still exists", () => {
    const source = {
      ...candidate,
      sourceObject: "branch_rev_deals",
      sourceRecordKey: "rev:1:academy:2026-01-01:100",
    }

    expect(
      classifyCrmSourceLinkReviewValidation(source, {
        confirmedSourceIdentities: new Set(),
        activeAliases: [
          {
            source_system: "branch_rev_sheet",
            normalized_alias: "class",
            target_type: "customer",
            target_id: "customer-1",
            normalized_manager_name: "krteamchoi",
          },
        ],
        canValidateAliases: true,
      })
    ).toBe("unsafe_matching_evidence")
  })

  it("separates internal test targets and short unowned aliases without catalog fail-open", () => {
    const base = {
      ...candidate,
      sourceObject: "Opportunity",
      sourceRecordKey: "neo-1",
      sourceSystem: "xiaoshouyi",
      metadata: {
        target_label: "Classin 내부 테스트",
        match_evidence: ["name:exact:0.96"],
      },
    }
    const context = {
      confirmedSourceIdentities: new Set<string>(),
      activeAliases: [],
      canValidateAliases: false,
    }

    expect(classifyCrmSourceLinkReviewValidation(base, context)).toBe("unsafe_matching_evidence")
    expect(
      classifyCrmSourceLinkReviewValidation(
        {
          ...base,
          metadata: { target_label: "정상 고객", match_evidence: ["alias:갈무"] },
        },
        context
      )
    ).toBe("unsafe_matching_evidence")
    expect(
      classifyCrmSourceLinkReviewValidation(
        {
          ...base,
          metadata: {
            source_label: "갈무",
            target_label: "갈무리국어학원",
            match_strategy: "alias",
            match_evidence: ["alias:갈무리국어학원"],
          },
        },
        context
      )
    ).toBe("unsafe_matching_evidence")
    expect(
      classifyCrmSourceLinkReviewValidation(
        {
          ...base,
          metadata: {
            source_label: "Math",
            target_label: "메티우스 수학",
            match_strategy: "alias",
            match_evidence: ["alias:메티우스 수학"],
          },
        },
        context
      )
    ).toBe("unsafe_matching_evidence")
  })

  it("separates candidates owned by an excluded Xiaoshouyi owner id", () => {
    expect(
      classifyCrmSourceLinkReviewValidation(
        {
          ...candidate,
          sourceObject: "Opportunity",
          sourceRecordKey: "neo-1",
          sourceSystem: "xiaoshouyi",
          metadata: { owner_name: "owner-cn", match_evidence: ["name:exact:0.96"] },
        },
        {
          confirmedSourceIdentities: new Set(),
          activeAliases: [],
          canValidateAliases: false,
          excludedXiaoshouyiOwnerIds: new Set(["owner-cn"]),
        }
      )
    ).toBe("unsafe_matching_evidence")
  })
})
