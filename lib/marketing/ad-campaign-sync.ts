// lib/marketing/ad-campaign-sync.ts
// Google Ads·네이버 검색광고 캠페인 ↔ 마케팅 캠페인(우산) 자동 링크 플래너 —
// 순수 함수(입력 → 플랜, DB·플랫폼 API 접근 없음). 적용(addLink)은 라우트가 한다.
// 구조는 meta-sync.ts 를 따르되, 아래 세 지점에서 **의도적으로** 갈라진다.
//
// ── Meta 플래너와 다르게 간 지점(근거) ───────────────────────
// 1) 우산 캠페인을 새로 만들지 않는다 — "가져오기"가 없다.
//    Meta 후보는 Graph 의 캠페인 객체라 status·objective·start/stop 이 같이 온다. 그래서
//    미러를 만들어 두면 다음 동기화가 계속 따라가며 고칠 수 있다. Google·네이버 후보는
//    **일자 스냅샷(google_ads_daily / naver_ads_daily)을 접은 값**이라 이름·마지막 집행일·
//    집행액이 전부다. 상태도 기간도 없는 우산을 만들면 (a) 만든 순간 planned 로 굳어
//    다음 동기화가 고칠 수 없는 "죽은 미러"가 되고, (b) 스냅샷은 살아있는 캠페인 목록이
//    아니라 과거 원장이라 조회 창을 넓힐수록 끝난 캠페인까지 우산 목록을 불린다.
//    campaign_name 이 비어 있는 행은 raw id 이름의 우산이 되는데, 그건 campaign-labels 의
//    "라벨을 지어내지 않는다" 규약과도 어긋난다(관리 목록에 "21345678" 이 쌓인다).
//    → 이 플래너는 **이미 있는 우산에 붙이기만** 하고, 붙일 데가 없으면 skipped 로 보고한다.
//      자동 생성만 포기한 것이다 — 사람은 링크 피커에서 그대로 붙일 수 있다.
// 2) 우산의 필드를 갱신하지 않는다 — "미러 갱신"이 없다.
//    스냅샷에는 따라갈 상태·기간이 애초에 없다. channels 토큰도 넣지 않는다:
//    캠페인 폼의 COMMON_CHANNELS 에는 google·naver 토큰 자체가 없고(사람은 "search"/
//    "display" 로 쓴다), 롤업·스코어보드는 channels 가 아니라 링크 refType 으로 세므로
//    자동으로 토큰을 밀어 넣으면 사람이 고른 분류만 덮고 숫자는 하나도 달라지지 않는다.
// 3) Meta 링크가 달린 우산은 붙일 대상에서 통째로 뺀다.
//    meta-sync 는 "링크가 meta_campaign 1건뿐"인 우산만 미러로 보고 갱신한다. 거기에
//    google 링크를 하나 붙이는 순간 링크가 2개가 되어 그 우산은 **영구히** Meta 갱신
//    대상에서 빠진다(crossChannelLinkedCount 로만 세어진다). 이름이 같다는 약한 근거로
//    남의 동기화를 끊을 수는 없다. 채널을 가로지르는 동명 캠페인("9월 브랜드"가 Meta 에도
//    Google 에도 있는 경우)이 정확히 여기 걸린다 — 사람이 직접 묶으라고 보고만 한다.
//
// 정직 규칙: 건너뛴 후보는 전부 skipped 에 이유(reason)와 사람이 읽는 문장(detail)을
// 달고 남는다. 무음으로 사라지는 후보가 없도록 candidateCount 가 세 칸의 합과 같은지
// 호출부·테스트가 검증할 수 있다.

import { adCampaignLabel } from "@/lib/marketing/campaign-labels"
import type { LiveAdChannel } from "@/lib/marketing/ad-insights"
import type { CampaignRefType, CampaignWithLinks } from "@/lib/types/marketing-campaign"

/** 이 플래너가 다루는 채널. Meta 는 meta-sync 소관이라 타입에서부터 뺀다. */
export type AdSyncChannel = Extract<LiveAdChannel, "google" | "naver">

/** 자동 링크가 만들 수 있는 링크 종류 — 광고 채널 둘뿐이다. */
export type AdCampaignRefType = Extract<CampaignRefType, "google_campaign" | "naver_campaign">

// perf-assemble 의 linkRefTypeByChannel 과 값은 같지만 meta 를 의도적으로 뺐다 —
// 여기서 meta 를 매핑해 두면 "실수로 Meta 도 링크되는" 경로가 생긴다.
const REF_TYPE_BY_CHANNEL: Record<AdSyncChannel, AdCampaignRefType> = {
  google: "google_campaign",
  naver: "naver_campaign",
}

// CAMPAIGN_REF_TYPE_LABEL 은 "Google 광고"처럼 배지용 문구라 문장에 넣으면 겹친다.
// 건너뛴 이유 문장에 쓸 짧은 채널 이름만 따로 둔다.
const CHANNEL_LABEL: Record<LiveAdChannel, string> = {
  meta: "Meta",
  google: "Google",
  naver: "네이버",
}

/** 사람이 묶은 크로스채널 우산의 표식 — 이 링크가 하나라도 있으면 자동으로 건드리지 않는다. */
const NON_AD_REF_TYPES: readonly CampaignRefType[] = ["email_campaign", "sms_campaign", "event"]

/**
 * 마지막 집행일이 오늘로부터 이 일수를 넘기면 자동 링크 대상에서 뺀다.
 * 링크 후보 라우트(link-candidates)가 90일 창으로 후보를 긁는데, 그 창 안이라도 두 달 넘게
 * 집행이 없으면 끝난 캠페인이다 — 지금 붙이면 스코어보드에 "도는 중"처럼 얹힌다.
 * 인자로 받지 않는 이유: 호출부마다 기준이 달라지면 "왜 저건 안 붙었지"를 설명할 수 없다.
 * 필요하면 사람이 링크 피커에서 직접 붙인다(후보 목록에는 90일까지 남아 있다).
 */
export const AD_SYNC_STALE_AFTER_DAYS = 60

/** 채널 스냅샷에서 접은 링크 후보 하나. */
export interface AdCampaignCandidate {
  channel: LiveAdChannel
  campaignId: string
  campaignName: string | null
  /** 이 캠페인의 기간 내 마지막 집행일(YYYY-MM-DD). 없으면 null. */
  lastActiveDate: string | null
  /** 기간 내 집행 합(계정 통화 네이티브). 통화를 모르면 null. */
  spend: number | null
  currency: string | null
}

export interface AdSyncPlanInput {
  candidates: readonly AdCampaignCandidate[]
  campaigns: readonly CampaignWithLinks[]
  /** KST 오늘(YYYY-MM-DD) — 오래된 캠페인 판정 기준. */
  today: string
}

/** 건너뛴 이유(기계 판정용). 사람이 읽는 문장은 AdSyncSkippedItem.detail. */
export type AdSyncSkipReason =
  /** Meta 후보 — meta-sync 소관이라 여기서 다루지 않는다. */
  | "unsupported-channel"
  /** 캠페인 ID 가 비어 링크 자체가 불가능. */
  | "invalid-candidate"
  /** 같은 채널·ID 가 후보 목록에 두 번 이상. */
  | "duplicate-candidate"
  /** 기간 내 집행일이 없다. */
  | "no-activity"
  /** lastActiveDate 나 today 가 YYYY-MM-DD 가 아니다 — 판정 불가라 손대지 않는다. */
  | "unreadable-date"
  /** 마지막 집행이 AD_SYNC_STALE_AFTER_DAYS 보다 오래됐다. */
  | "stale"
  /** 캠페인 이름이 없어 우산 이름과 대조할 수 없다. */
  | "unnamed"
  /** 이름이 같은 우산이 없다 — 우산을 자동으로 만들지 않는다. */
  | "no-match"
  /** 이름이 같은 우산이 둘 이상 — 어느 쪽인지 정할 수 없다. */
  | "ambiguous-name"
  /** 대상 우산에 Meta 링크가 있다 — 붙이면 meta-sync 가 그 우산을 놓는다. */
  | "meta-linked-umbrella"
  /** 대상 우산이 이메일·문자·행사와 묶인 크로스채널 우산이다. */
  | "cross-channel-umbrella"
  /** 대상 우산이 완료(done) 상태다. */
  | "umbrella-done"
  /** 대상 우산에 같은 채널 캠페인이 이미 붙어 있다(이번 플랜에서 붙인 것 포함). */
  | "channel-slot-taken"

export interface AdSyncUmbrellaRef {
  id: string
  name: string
}

/** 자동 링크 1건 — 라우트는 addLink(umbrella.id, refType, adCampaignId) 만 하면 된다. */
export interface AdSyncLinkItem {
  channel: AdSyncChannel
  refType: AdCampaignRefType
  /** 광고 플랫폼의 캠페인 ID(= CampaignLink.refId). */
  adCampaignId: string
  /** 사람이 읽는 이름 — adCampaignLabel 규칙(이름이 비면 raw id). */
  label: string
  umbrella: AdSyncUmbrellaRef
  /** 매칭 근거. 지금은 정규화 이름 일치 하나뿐이지만 보고에 남긴다. */
  matchedBy: "name"
  /** 위 판정에 쓴 마지막 집행일(여기까지 온 후보는 반드시 읽을 수 있는 날짜다). */
  lastActiveDate: string
  /** 계정 통화 네이티브 — 배너 표시용. 통화가 다른 값끼리 절대 합치지 않는다. */
  spend: number | null
  currency: string | null
}

/** 이미 어느 우산엔가 붙어 있는 후보 — 멱등 보고(다시 붙이지 않는다). */
export interface AdSyncLinkedItem {
  channel: AdSyncChannel
  refType: AdCampaignRefType
  adCampaignId: string
  label: string
  /** 링크는 다대다라 한 광고 캠페인이 여러 우산에 붙어 있을 수 있다(전부 보고). */
  umbrellas: AdSyncUmbrellaRef[]
}

export interface AdSyncSkippedItem {
  channel: LiveAdChannel
  adCampaignId: string
  label: string
  reason: AdSyncSkipReason
  /** 사람이 읽는 한 줄 — 결과 배너가 그대로 쓴다. */
  detail: string
  /** 특정 우산 때문에 건너뛴 경우에만 채운다. */
  umbrella?: AdSyncUmbrellaRef
}

export interface AdSyncChannelCounts {
  candidates: number
  toLink: number
  alreadyLinked: number
  skipped: number
}

export interface AdSyncPlan {
  /** 새로 붙일 링크. */
  toLink: AdSyncLinkItem[]
  /** 이미 붙어 있어 그냥 두는 후보. */
  alreadyLinked: AdSyncLinkedItem[]
  /** 건너뛴 후보 — 전부 이유가 달려 있다. */
  skipped: AdSyncSkippedItem[]
  /** 입력 후보 수(중복 포함). toLink+alreadyLinked+skipped 와 반드시 같다. */
  candidateCount: number
  /** 채널별 요약 — 결과 배너가 "Google n건 / 네이버 m건"으로 쓴다. */
  byChannel: Record<LiveAdChannel, AdSyncChannelCounts>
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * YYYY-MM-DD 두 개의 날짜 차(to - from). 형식이 아니면 null — 지어내지 않는다.
 * UTC 로만 계산한다(DST 가 없어 "며칠 차이"가 항상 24시간의 배수다. range.ts 와 같은 이유).
 */
function daysBetweenDates(from: string, to: string): number | null {
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) return null
  const diff = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Number.isFinite(diff) ? Math.round(diff / 86_400_000) : null
}

/**
 * 이름 대조용 정규화 — 앞뒤 공백 제거 + 연속 공백 축약 + 소문자화까지만.
 * 더 세게 깎지(구두점 제거 등) 않는 이유: 정규화를 넓힐수록 "우연히 비슷한 이름"이
 * 자동으로 붙는다. 자동 링크에서 넓은 매칭은 안전한 쪽이 아니다.
 */
function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase()
}

function emptyCounts(): AdSyncChannelCounts {
  return { candidates: 0, toLink: 0, alreadyLinked: 0, skipped: 0 }
}

function umbrellaRef(campaign: CampaignWithLinks): AdSyncUmbrellaRef {
  return { id: campaign.id, name: campaign.name }
}

/**
 * 채널 스냅샷 후보 × 우산 캠페인 → 자동 링크 플랜.
 *
 * 판정 순서(먼저 걸린 이유로 보고한다):
 *   채널 → ID 유효성 → 후보 중복 → 이미 링크됨 → 집행일(없음·판독불가·오래됨)
 *   → 이름 있음 → 동명 우산(0건·2건 이상) → 우산 자격(Meta·크로스채널·완료·슬롯)
 * 앞쪽이 더 근본적인 이유라서다 — 이미 붙어 있는 캠페인을 "오래됐다"고 보고하면
 * 사람이 뭔가 잘못됐다고 오해한다.
 */
export function buildAdCampaignSyncPlan(input: AdSyncPlanInput): AdSyncPlan {
  const { candidates, campaigns, today } = input

  const toLink: AdSyncLinkItem[] = []
  const alreadyLinked: AdSyncLinkedItem[] = []
  const skipped: AdSyncSkippedItem[] = []
  const byChannel: Record<LiveAdChannel, AdSyncChannelCounts> = {
    meta: emptyCounts(),
    google: emptyCounts(),
    naver: emptyCounts(),
  }

  /* ── ① 색인 ────────────────────────────────────────────────
     - linkedUmbrellas: `${refType}:${refId}` → 그 광고 캠페인이 붙어 있는 우산들(멱등 판정)
     - umbrellasByName: 정규화 이름 → 동명 우산들(매칭·모호 판정)
     - occupiedSlots: `${umbrellaId}:${refType}` → 그 우산의 해당 채널 칸이 찼는지
       이번 플랜에서 붙인 것도 여기 넣는다 — 안 그러면 동명 후보 둘이 같은 우산에
       동시에 붙는 플랜이 나온다(적용 순서에 따라 결과가 달라지는 플랜은 플랜이 아니다). */
  const linkedUmbrellas = new Map<string, AdSyncUmbrellaRef[]>()
  const umbrellasByName = new Map<string, CampaignWithLinks[]>()
  const occupiedSlots = new Set<string>()

  for (const campaign of campaigns) {
    for (const link of campaign.links) {
      const key = `${link.refType}:${link.refId}`
      const list = linkedUmbrellas.get(key)
      if (list) list.push(umbrellaRef(campaign))
      else linkedUmbrellas.set(key, [umbrellaRef(campaign)])
      if (link.refType === "google_campaign" || link.refType === "naver_campaign") {
        occupiedSlots.add(`${campaign.id}:${link.refType}`)
      }
    }
    // 이름이 빈 우산은 대조 대상이 아니다 — 빈 이름끼리 서로 매칭되면 안 된다.
    const name = normalizeName(campaign.name)
    if (!name) continue
    const sameName = umbrellasByName.get(name)
    if (sameName) sameName.push(campaign)
    else umbrellasByName.set(name, [campaign])
  }

  /* ── ② 후보별 판정 ─────────────────────────────────────── */
  const seenCandidates = new Set<string>()

  for (const candidate of candidates) {
    const label = adCampaignLabel({
      campaignId: candidate.campaignId,
      campaignName: candidate.campaignName,
    })
    byChannel[candidate.channel].candidates += 1

    const skip = (reason: AdSyncSkipReason, detail: string, umbrella?: AdSyncUmbrellaRef) => {
      skipped.push({
        channel: candidate.channel,
        adCampaignId: candidate.campaignId,
        label,
        reason,
        detail,
        ...(umbrella ? { umbrella } : {}),
      })
      byChannel[candidate.channel].skipped += 1
    }

    // Meta 는 meta-sync 가 생성·갱신까지 책임진다. 두 플래너가 같은 캠페인을 두고
    // 다투면 한쪽이 만든 링크를 다른 쪽이 크로스채널로 보고 멈추는 교착이 생긴다.
    if (candidate.channel === "meta") {
      skip("unsupported-channel", "Meta 캠페인은 meta-sync 가 담당한다 — 여기서 링크하지 않는다.")
      continue
    }
    const channel: AdSyncChannel = candidate.channel
    const refType = REF_TYPE_BY_CHANNEL[channel]

    // ID 는 "비었는가"만 trim 으로 보고, 링크에는 **스냅샷이 들고 있는 값 그대로** 쓴다.
    // 롤업·스코어보드가 link.refId 를 스냅샷의 campaign_id 와 문자열로 대조하므로,
    // 여기서 다듬어 저장하면 링크는 생겼는데 집행이 영영 안 잡히는 링크가 된다.
    if (!candidate.campaignId.trim()) {
      skip("invalid-candidate", "캠페인 ID 가 비어 있어 링크할 수 없다.")
      continue
    }

    const candidateKey = `${channel}:${candidate.campaignId}`
    if (seenCandidates.has(candidateKey)) {
      skip("duplicate-candidate", "같은 캠페인이 후보 목록에 두 번 들어왔다 — 첫 건만 처리했다.")
      continue
    }
    seenCandidates.add(candidateKey)

    // 멱등: 어느 우산에든 이미 붙어 있으면 아무것도 하지 않는다.
    const existing = linkedUmbrellas.get(`${refType}:${candidate.campaignId}`)
    if (existing) {
      alreadyLinked.push({ channel, refType, adCampaignId: candidate.campaignId, label, umbrellas: existing })
      byChannel[channel].alreadyLinked += 1
      continue
    }

    if (candidate.lastActiveDate === null) {
      skip("no-activity", "기간 내 집행일이 없어 지금 붙일 근거가 없다.")
      continue
    }
    const age = daysBetweenDates(candidate.lastActiveDate, today)
    if (age === null) {
      // 날짜를 못 읽으면 오래됐는지 알 수 없다 → 안전한 쪽(안 건드림).
      skip(
        "unreadable-date",
        `날짜를 읽을 수 없어 판정을 보류했다(마지막 집행 "${candidate.lastActiveDate}", 오늘 "${today}").`,
      )
      continue
    }
    if (age > AD_SYNC_STALE_AFTER_DAYS) {
      // spend 가 아니라 lastActiveDate 로만 판정한다 — spend 는 통화를 모르면 null 이고,
      // 0 원 집행("노출만 있고 과금 없음")과 "집행 없음"을 금액으로는 구분할 수 없다.
      skip(
        "stale",
        `마지막 집행이 ${candidate.lastActiveDate}(${age}일 전)이라 자동 링크에서 제외했다(기준 ${AD_SYNC_STALE_AFTER_DAYS}일).`,
      )
      continue
    }

    const normalized = normalizeName(candidate.campaignName)
    if (!normalized) {
      // 이름이 없으면 대조할 축이 없다. ID 로 우산 이름을 유추하지 않는다.
      skip("unnamed", "캠페인 이름이 없어 우산 이름과 대조할 수 없다.")
      continue
    }

    const matches = umbrellasByName.get(normalized) ?? []
    if (matches.length === 0) {
      skip("no-match", "이름이 같은 우산 캠페인이 없다 — 우산을 자동으로 만들지 않는다.")
      continue
    }
    if (matches.length > 1) {
      // 동명 우산이 둘 이상이면 사람도 어느 쪽인지 모른다. 찍지 않는다.
      skip(
        "ambiguous-name",
        `이름이 같은 우산이 ${matches.length}개다 — 어디에 붙일지 정할 수 없다.`,
      )
      continue
    }

    const target = matches[0]
    const ref = umbrellaRef(target)

    // Meta 링크가 있는 우산: 붙이는 순간 meta-sync 가 그 우산을 미러에서 놓는다(파일 헤더 ③).
    if (target.links.some((l) => l.refType === "meta_campaign")) {
      skip(
        "meta-linked-umbrella",
        `"${target.name}" 은 Meta 링크가 있는 우산이다 — 여기에 붙이면 meta-sync 가 그 우산을 더 이상 갱신하지 않는다. 필요하면 사람이 직접 붙인다.`,
        ref,
      )
      continue
    }
    // 사람이 이메일·문자·행사를 묶어 둔 우산은 손대지 않는다 — 자동으로 광고를 더하면
    // 롤업(linkedCounts)과 스코어보드 채널 집행이 조용히 바뀐다.
    if (target.links.some((l) => NON_AD_REF_TYPES.includes(l.refType))) {
      skip(
        "cross-channel-umbrella",
        `"${target.name}" 은 이메일·문자·행사가 묶인 크로스채널 우산이다 — 자동으로 광고를 더하지 않는다.`,
        ref,
      )
      continue
    }
    // 완료된 우산은 닫힌 기록이다. 지금 집행을 붙이면 이미 보고한 숫자가 뒤늦게 움직인다.
    if (target.status === "done") {
      skip(
        "umbrella-done",
        `"${target.name}" 은 완료된 캠페인이다 — 닫힌 기록에 새 집행을 붙이지 않는다.`,
        ref,
      )
      continue
    }
    // 같은 채널 칸이 이미 찼다(기존 링크이거나 이번 플랜에서 붙인 동명 후보).
    if (occupiedSlots.has(`${target.id}:${refType}`)) {
      skip(
        "channel-slot-taken",
        `"${target.name}" 에는 ${CHANNEL_LABEL[channel]} 캠페인이 이미 링크돼 있다 — 같은 이름이라도 자동으로 겹쳐 붙이지 않는다.`,
        ref,
      )
      continue
    }

    // 여기까지 온 후보만 붙인다. 다른 채널(google↔naver) 링크가 이미 있는 우산은 통과시킨다 —
    // 그 링크들은 어떤 자동 갱신의 근거도 아니고(롤업은 개수만 센다) "9월 브랜드에 Google 과
    // 네이버를 같이 묶는다"는 가장 흔한 사용을 막을 이유가 없다.
    occupiedSlots.add(`${target.id}:${refType}`)
    toLink.push({
      channel,
      refType,
      adCampaignId: candidate.campaignId,
      label,
      umbrella: ref,
      matchedBy: "name",
      lastActiveDate: candidate.lastActiveDate,
      spend: candidate.spend,
      currency: candidate.currency,
    })
    byChannel[channel].toLink += 1
  }

  return {
    toLink,
    alreadyLinked,
    skipped,
    candidateCount: candidates.length,
    byChannel,
  }
}
