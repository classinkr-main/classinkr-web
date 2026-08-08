import { describe, expect, it } from "vitest"

import {
  buildMetaSyncPlan,
  mapMetaStatusToCampaignStatus,
  metaTimeToDate,
  type MetaSyncSourceCampaign,
} from "@/lib/marketing/meta-sync"
import type { CampaignLink, CampaignWithLinks } from "@/lib/types/marketing-campaign"

function meta(patch: Partial<MetaSyncSourceCampaign> & { id: string }): MetaSyncSourceCampaign {
  return { name: `Meta ${patch.id}`, status: "ACTIVE", ...patch }
}

function link(refType: CampaignLink["refType"], refId: string, campaignId: string): CampaignLink {
  return { id: `l-${refType}-${refId}`, campaignId, refType, refId, createdAt: "2026-08-01" }
}

function umbrella(
  id: string,
  links: CampaignLink[],
  patch: Partial<CampaignWithLinks> = {}
): CampaignWithLinks {
  return {
    id,
    name: `캠페인 ${id}`,
    objective: null,
    status: "active",
    channels: ["meta"],
    startsAt: null,
    endsAt: null,
    budget: null,
    owner: null,
    projectId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    links,
    ...patch,
  }
}

describe("mapMetaStatusToCampaignStatus", () => {
  it("effective_status 를 status 보다 우선한다", () => {
    expect(mapMetaStatusToCampaignStatus("ACTIVE", "PAUSED")).toBe("paused")
    expect(mapMetaStatusToCampaignStatus("PAUSED", "ACTIVE")).toBe("active")
  })

  it("라이브 궤도(IN_PROCESS/WITH_ISSUES)는 진행으로 본다", () => {
    expect(mapMetaStatusToCampaignStatus("ACTIVE", "IN_PROCESS")).toBe("active")
    expect(mapMetaStatusToCampaignStatus("ACTIVE", "WITH_ISSUES")).toBe("active")
  })

  it("ARCHIVED/DELETED 는 완료", () => {
    expect(mapMetaStatusToCampaignStatus("ARCHIVED")).toBe("done")
    expect(mapMetaStatusToCampaignStatus("ACTIVE", "DELETED")).toBe("done")
  })

  it("모르는 상태는 null — 기존 상태를 덮지 않는다", () => {
    expect(mapMetaStatusToCampaignStatus("SOMETHING_NEW")).toBeNull()
    expect(mapMetaStatusToCampaignStatus("")).toBeNull()
  })
})

describe("metaTimeToDate", () => {
  it("ISO 타임스탬프에서 날짜만 남긴다", () => {
    expect(metaTimeToDate("2026-08-01T09:00:00+0900")).toBe("2026-08-01")
  })

  it("형식이 아니면 null(지어내지 않음)", () => {
    expect(metaTimeToDate(undefined)).toBeNull()
    expect(metaTimeToDate("")).toBeNull()
    expect(metaTimeToDate("not-a-date")).toBeNull()
  })
})

describe("buildMetaSyncPlan — 가져오기", () => {
  it("미링크 Meta 캠페인마다 미러 생성 플랜을 만든다(이름·상태·기간·objective 복사)", () => {
    const plan = buildMetaSyncPlan(
      [
        meta({
          id: "m-1",
          name: "여름 HW 리드",
          status: "ACTIVE",
          objective: "OUTCOME_LEADS",
          startTime: "2026-07-01T00:00:00+0900",
          stopTime: "2026-08-31T23:59:59+0900",
        }),
      ],
      []
    )
    expect(plan.toCreate).toEqual([
      {
        metaId: "m-1",
        name: "여름 HW 리드",
        input: {
          name: "여름 HW 리드",
          objective: "OUTCOME_LEADS",
          status: "active",
          channels: ["meta"],
          startsAt: "2026-07-01",
          endsAt: "2026-08-31",
        },
      },
    ])
  })

  it("이미 링크된 Meta 캠페인은 다시 가져오지 않는다(크로스채널 소속 포함)", () => {
    const plan = buildMetaSyncPlan(
      [meta({ id: "m-1" }), meta({ id: "m-2" })],
      [umbrella("c-1", [link("meta_campaign", "m-1", "c-1"), link("event", "e-1", "c-1")])]
    )
    expect(plan.toCreate.map((c) => c.metaId)).toEqual(["m-2"])
    expect(plan.crossChannelLinkedCount).toBe(1)
  })

  it("ARCHIVED/DELETED 미링크 캠페인은 만들지 않고 skipped 로 보고한다", () => {
    const plan = buildMetaSyncPlan(
      [meta({ id: "m-dead", status: "ARCHIVED", name: "지난 시즌" })],
      []
    )
    expect(plan.toCreate).toEqual([])
    expect(plan.skipped).toEqual([{ metaId: "m-dead", name: "지난 시즌", reason: "archived" }])
  })

  it("매핑 불가 상태는 planned 로 가져온다(산 캠페인을 완료로 만들지 않음)", () => {
    const plan = buildMetaSyncPlan([meta({ id: "m-1", status: "NEW_STATUS" })], [])
    expect(plan.toCreate[0].input.status).toBe("planned")
  })
})

describe("buildMetaSyncPlan — 미러 갱신", () => {
  it("이름·상태·기간이 달라진 미러만 달라진 필드로 패치한다", () => {
    const plan = buildMetaSyncPlan(
      [
        meta({
          id: "m-1",
          name: "새 이름",
          status: "PAUSED",
          startTime: "2026-07-01T00:00:00+0900",
        }),
      ],
      [
        umbrella("c-1", [link("meta_campaign", "m-1", "c-1")], {
          name: "옛 이름",
          status: "active",
          startsAt: "2026-07-01",
        }),
      ]
    )
    expect(plan.toUpdate).toEqual([
      {
        campaignId: "c-1",
        metaId: "m-1",
        name: "새 이름",
        patch: { name: "새 이름", status: "paused" },
        changes: ["name", "status"],
      },
    ])
  })

  it("변화 없는 미러는 unchangedMirrorCount 로만 센다", () => {
    const plan = buildMetaSyncPlan(
      [meta({ id: "m-1", name: "캠페인 c-1", status: "ACTIVE" })],
      [umbrella("c-1", [link("meta_campaign", "m-1", "c-1")], { status: "active" })]
    )
    expect(plan.toUpdate).toEqual([])
    expect(plan.unchangedMirrorCount).toBe(1)
  })

  it("크로스채널 우산(링크 2개 이상)은 상태가 달라도 건드리지 않는다", () => {
    const plan = buildMetaSyncPlan(
      [meta({ id: "m-1", status: "PAUSED" })],
      [
        umbrella("c-1", [
          link("meta_campaign", "m-1", "c-1"),
          link("email_campaign", "e-1", "c-1"),
        ]),
      ]
    )
    expect(plan.toUpdate).toEqual([])
    expect(plan.crossChannelLinkedCount).toBe(1)
  })

  it("Meta 가 비워둔 기간으로 기존 입력을 지우지 않는다", () => {
    const plan = buildMetaSyncPlan(
      [meta({ id: "m-1", name: "캠페인 c-1", status: "ACTIVE" })],
      [
        umbrella("c-1", [link("meta_campaign", "m-1", "c-1")], {
          startsAt: "2026-07-01",
          endsAt: "2026-08-31",
        }),
      ]
    )
    expect(plan.toUpdate).toEqual([])
    expect(plan.unchangedMirrorCount).toBe(1)
  })

  it("모르는 Meta 상태는 기존 상태를 유지한다", () => {
    const plan = buildMetaSyncPlan(
      [meta({ id: "m-1", name: "캠페인 c-1", status: "MYSTERY" })],
      [umbrella("c-1", [link("meta_campaign", "m-1", "c-1")], { status: "paused" })]
    )
    expect(plan.toUpdate).toEqual([])
  })

  it("조회 결과에 없는 Meta 캠페인의 미러는 unresolvedMirrorCount 로 보고만 한다", () => {
    const plan = buildMetaSyncPlan(
      [],
      [umbrella("c-1", [link("meta_campaign", "m-gone", "c-1")])]
    )
    expect(plan.toUpdate).toEqual([])
    expect(plan.unresolvedMirrorCount).toBe(1)
  })

  it("ARCHIVED 된 미러는 완료로 전환된다(가져오기 제외와 달리 상태는 따라감)", () => {
    const plan = buildMetaSyncPlan(
      [meta({ id: "m-1", name: "캠페인 c-1", status: "ARCHIVED" })],
      [umbrella("c-1", [link("meta_campaign", "m-1", "c-1")], { status: "active" })]
    )
    expect(plan.toUpdate[0].patch).toEqual({ status: "done" })
  })
})
