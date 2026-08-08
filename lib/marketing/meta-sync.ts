// lib/marketing/meta-sync.ts
// Meta ↔ 마케팅 캠페인(우산) 동기화 플래너 — 순수 함수(입력 → 플랜, DB·Graph 접근 없음).
// 적용(생성·링크·패치)은 라우트(app/api/admin/marketing-campaigns/meta-sync)가 한다.
//
// ── 동기화 규칙 ──────────────────────────────────────────────
// 1) 가져오기: 어느 우산 캠페인에도 링크되지 않은 Meta 캠페인 → 우산 캠페인을 새로 만들어
//    1:1 링크한다(이름·상태·기간·objective 를 Meta 에서 복사, channels=["meta"]).
//    ARCHIVED/DELETED 는 새로 만들지 않는다 — 죽은 캠페인으로 목록을 불리지 않는다(skipped 로 보고).
// 2) 미러 갱신: 링크가 "meta_campaign 1건뿐"인 우산 캠페인은 그 Meta 캠페인의 미러로 본다.
//    미러는 이름·상태·기간이 Meta 를 따라간다 — 광고 관리자에서 이름을 바꾸거나 중지하면
//    다음 동기화 때 우산도 같이 바뀐다(달라진 필드만 패치).
// 3) 손대지 않는 것: 링크가 여러 개인 크로스채널 우산 캠페인. 이메일·행사와 함께 묶인
//    캠페인의 상태를 Meta 한 채널이 좌우하면 안 되므로 alreadyLinked 로만 센다.
//    예산(budget)·담당자(owner)도 동기화하지 않는다 — Meta 캠페인 예산은 여기서 조회하지 않고,
//    우산 예산은 KRW 배정 개념이라 계정 통화 집행과 의미가 다르다.
//
// 정직 규칙: 매핑할 수 없는 Meta 상태는 기존 상태를 덮지 않는다(모르면 안 바꾼다).

import type {
  CampaignStatus,
  CampaignWithLinks,
} from "@/lib/types/marketing-campaign"
import type {
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/lib/repositories/marketing-campaigns"

/** 플래너가 Meta 캠페인에서 읽는 필드만 — 대시보드 행(MetaCampaignRow)의 구조적 부분집합. */
export interface MetaSyncSourceCampaign {
  id: string
  name: string
  status: string
  effectiveStatus?: string
  objective?: string
  startTime?: string
  stopTime?: string
}

/**
 * Meta 상태 → 우산 캠페인 상태. effective_status 를 우선한다 — status 는 ACTIVE 인데
 * 계정·예산 문제로 실제 송출이 멈춘 캠페인(WITH_ISSUES 등)이 있어 "실효" 쪽이 진실에 가깝다.
 * 매핑 불가한 값(IN_PROCESS 외 신규 상태 등)은 null — 호출부가 기존 상태를 유지한다.
 */
export function mapMetaStatusToCampaignStatus(
  status: string,
  effectiveStatus?: string
): CampaignStatus | null {
  const normalized = (effectiveStatus?.trim() || status.trim()).toUpperCase()
  switch (normalized) {
    case "ACTIVE":
    // 검수 중·이슈 있음 — 라이브 궤도의 캠페인이므로 "진행"으로 본다(멈춘 게 아니다).
    case "IN_PROCESS":
    case "WITH_ISSUES":
      return "active"
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
      return "paused"
    case "ARCHIVED":
    case "DELETED":
      return "done"
    default:
      return null
  }
}

/** Meta ISO 타임스탬프 → 우산 캠페인 DATE(YYYY-MM-DD). 형식이 아니면 null(지어내지 않음). */
export function metaTimeToDate(value?: string): string | null {
  const head = value?.slice(0, 10) ?? ""
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null
}

/** ARCHIVED/DELETED — 가져오기 대상에서 제외하는 종료 상태(미러 갱신은 done 으로 반영). */
function isDeadMetaStatus(campaign: MetaSyncSourceCampaign): boolean {
  const normalized = (campaign.effectiveStatus?.trim() || campaign.status.trim()).toUpperCase()
  return normalized === "ARCHIVED" || normalized === "DELETED"
}

export interface MetaSyncCreateItem {
  metaId: string
  name: string
  input: CreateCampaignInput
}

export interface MetaSyncUpdateItem {
  campaignId: string
  metaId: string
  name: string
  patch: UpdateCampaignInput
  /** 사람이 읽는 변경 필드 목록(결과 배너용) — patch 키와 1:1. */
  changes: Array<"name" | "status" | "startsAt" | "endsAt">
}

export interface MetaSyncSkippedItem {
  metaId: string
  name: string
  reason: "archived"
}

export interface MetaSyncPlan {
  toCreate: MetaSyncCreateItem[]
  toUpdate: MetaSyncUpdateItem[]
  /** 미러인데 이번에 바뀐 게 없는 캠페인 수. */
  unchangedMirrorCount: number
  /** 링크는 있으나 미러가 아닌(크로스채널 우산 소속) Meta 캠페인 수 — 손대지 않았음을 보고. */
  crossChannelLinkedCount: number
  /** 미러의 Meta 캠페인이 이번 조회 결과에 없음(조회 지평 밖·삭제) — 덮지 않고 보고만. */
  unresolvedMirrorCount: number
  skipped: MetaSyncSkippedItem[]
}

/**
 * 우산 캠페인이 특정 Meta 캠페인의 1:1 미러인지 — 링크가 meta_campaign 하나뿐일 때만.
 * 크로스채널 우산(링크 2개 이상)은 미러가 아니다.
 */
function mirrorMetaId(campaign: CampaignWithLinks): string | null {
  if (campaign.links.length !== 1) return null
  const only = campaign.links[0]
  return only.refType === "meta_campaign" ? only.refId : null
}

export function buildMetaSyncPlan(
  metaCampaigns: MetaSyncSourceCampaign[],
  marketingCampaigns: CampaignWithLinks[]
): MetaSyncPlan {
  const metaById = new Map(metaCampaigns.map((c) => [c.id, c]))

  // 어떤 우산에든 이미 링크된 Meta id — 가져오기 중복 방지의 기준.
  const linkedMetaIds = new Set<string>()
  for (const campaign of marketingCampaigns) {
    for (const link of campaign.links) {
      if (link.refType === "meta_campaign") linkedMetaIds.add(link.refId)
    }
  }

  // ① 가져오기 — 미링크 Meta 캠페인마다 미러 생성 플랜.
  const toCreate: MetaSyncCreateItem[] = []
  const skipped: MetaSyncSkippedItem[] = []
  for (const meta of metaCampaigns) {
    if (linkedMetaIds.has(meta.id)) continue
    if (isDeadMetaStatus(meta)) {
      skipped.push({ metaId: meta.id, name: meta.name, reason: "archived" })
      continue
    }
    toCreate.push({
      metaId: meta.id,
      name: meta.name,
      input: {
        name: meta.name,
        objective: meta.objective ?? null,
        // 매핑 불가 상태는 계획으로 시작 — 산 캠페인을 완료로 만들지 않는 안전한 기본값.
        status: mapMetaStatusToCampaignStatus(meta.status, meta.effectiveStatus) ?? "planned",
        channels: ["meta"],
        startsAt: metaTimeToDate(meta.startTime),
        endsAt: metaTimeToDate(meta.stopTime),
      },
    })
  }

  // ② 미러 갱신 — 달라진 필드만 패치. 크로스채널 우산은 세기만 하고 건드리지 않는다.
  const toUpdate: MetaSyncUpdateItem[] = []
  let unchangedMirrorCount = 0
  let unresolvedMirrorCount = 0
  const crossChannelLinked = new Set<string>()

  for (const campaign of marketingCampaigns) {
    const metaId = mirrorMetaId(campaign)
    if (metaId === null) {
      for (const link of campaign.links) {
        if (link.refType === "meta_campaign") crossChannelLinked.add(link.refId)
      }
      continue
    }

    const meta = metaById.get(metaId)
    if (!meta) {
      unresolvedMirrorCount += 1
      continue
    }

    const patch: UpdateCampaignInput = {}
    const changes: MetaSyncUpdateItem["changes"] = []

    const metaName = meta.name.trim()
    if (metaName && metaName !== campaign.name) {
      patch.name = metaName
      changes.push("name")
    }

    const mappedStatus = mapMetaStatusToCampaignStatus(meta.status, meta.effectiveStatus)
    if (mappedStatus !== null && mappedStatus !== campaign.status) {
      patch.status = mappedStatus
      changes.push("status")
    }

    // 기간은 Meta 에 값이 있을 때만 따라간다 — Meta 가 비워둔 필드로 기존 입력을 지우지 않는다.
    const startsAt = metaTimeToDate(meta.startTime)
    if (startsAt !== null && startsAt !== campaign.startsAt) {
      patch.startsAt = startsAt
      changes.push("startsAt")
    }
    const endsAt = metaTimeToDate(meta.stopTime)
    if (endsAt !== null && endsAt !== campaign.endsAt) {
      patch.endsAt = endsAt
      changes.push("endsAt")
    }

    if (changes.length === 0) {
      unchangedMirrorCount += 1
      continue
    }
    toUpdate.push({ campaignId: campaign.id, metaId, name: metaName || campaign.name, patch, changes })
  }

  return {
    toCreate,
    toUpdate,
    unchangedMirrorCount,
    crossChannelLinkedCount: crossChannelLinked.size,
    unresolvedMirrorCount,
    skipped,
  }
}
