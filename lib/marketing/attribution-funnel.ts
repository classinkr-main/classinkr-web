// lib/marketing/attribution-funnel.ts
// 귀속 폭포 — 리드가 "어느 광고가 데려왔나"까지 가는 길에서 **어느 단계에서 끊기는지**.
// 순수 모듈(서버 의존 없음 — 서버 전용 import 금지, LeadRecord 는 타입으로만 가져온다).
//
// 채널별 리드 수만 보면 귀속이 안 된 리드는 그냥 사라진다. "메타 40건"은 보이는데
// "채널을 아예 못 말하는 60건"은 어느 화면에도 안 뜬다. 이 폭포는 그 60건이 **어디서**
// 끊겼는지를 단계로 보여준다 — 고칠 곳이 트래킹 수집인지(신호 없음), utm 규약인지(채널 못
// 말함), 광고 네이밍인지(캠페인·소재까지 못 감)가 단계마다 다르기 때문이다.
//
// 정직 규칙(이 저장소 공통): 분모 0 은 0% 가 아니라 null. 못 세는 것과 0 은 다른 사실이다.
//
// 판정은 전부 lib/crm/lead-attribution.ts 를 재사용한다 — 같은 판정을 여기서 다시 구현하면
// 리드 보드와 이 폭포의 숫자가 갈린다(이 저장소가 실제로 겪은 사고다).

import {
  getLeadAdLabel,
  getLeadCampaignLabel,
  getLeadChannelLabel,
  getLeadSourceGroup,
  hasAdClickId,
  hasTrackingSignal,
  isTestLead,
  SOURCE_GROUP_LABEL,
  type LeadSourceGroup,
} from "@/lib/crm/lead-attribution"
import type { LeadRecord } from "@/lib/repositories/leads"

export interface AttributionFunnelStage {
  key: "total" | "tracked" | "channel" | "campaign" | "creative"
  label: string
  count: number
  /** 직전 단계 대비 잔존율(%). 첫 단계는 null. 분모 0 도 null. */
  retentionPct: number | null
  /** 직전 단계에서 빠진 건수. 첫 단계는 0. */
  drop: number
}

export interface AttributionFunnel {
  stages: AttributionFunnelStage[]
  /** 채널 식별된 리드의 채널별 건수 — 많은 순. 라벨은 getLeadChannelLabel 그대로. */
  byChannel: Array<{ channel: string; count: number }>
  /** 총 리드 대비 소재까지 이어진 비율(%). 총 0 이면 null. */
  endToEndPct: number | null
}

type StageKey = AttributionFunnelStage["key"]

// 단계 라벨은 화면이 그대로 쓴다. 판정의 이름을 그대로 적는다 — "메타·구글" 같은 예시를
// 라벨에 넣으면 폴백으로 떨어진 리드까지 포함된 것처럼 읽힌다.
const STAGE_LABEL: Record<StageKey, string> = {
  total: "총 리드",
  tracked: "트래킹 신호",
  channel: "채널 식별",
  campaign: "캠페인 연결",
  creative: "소재 연결",
}

/**
 * 유입 묶음 라벨만으로도 채널을 말할 수 있는 묶음.
 *
 * 나머지 묶음("홈페이지"·"자료실"·"뉴스레터"·"채널톡"·"챗봇"·"수기·기타")은 전부 **우리 쪽
 * 유입 표면**의 이름이다 — 그 사람이 무엇을 보고 왔는지는 한 글자도 말해 주지 않는다.
 * 반면 "메타"는 표면이 아니라 광고 플랫폼 자체다: source=meta_lead_ads 는 Meta 리드애즈
 * 웹훅이 보낸 리드라는 사실이라 추정이 아니고, 그 리드들은 캠페인·광고명까지 들고 온다.
 *
 * 이 예외를 안 두면 폭포가 거짓말을 한다: Meta 리드애즈는 사용자가 우리 사이트를 거치지
 * 않아 클릭ID 도 utm_source 도 붙을 수 없는데(붙일 방법 자체가 없다), 리드의 대다수가
 * 거기서 온다. 예외 없이 "utm_source·클릭ID 만 인정"하면 캠페인·소재 라벨이 멀쩡히 있는
 * 리드들이 채널 단계에서 몰살당하고 "광고 귀속률 1%" 같은 오경보가 나온다 — 게다가 그
 * 경보에는 고칠 방법이 없다.
 *
 * 새 묶음을 여기 넣기 전에 따져볼 것: 그 묶음 이름이 **광고 플랫폼**인가, 우리 화면인가.
 */
const CHANNEL_EVIDENT_SOURCE_GROUPS = new Set<LeadSourceGroup>(["meta"])

/**
 * "채널 식별됨" 판정 — 이 리드가 **어느 채널에서 왔는지 말할 수 있는가**.
 *
 * getLeadChannelLabel 은 절대 null 을 주지 않는다. utm·클릭ID 가 없으면 유입 묶음 라벨로
 * 떨어지므로, 그 결과를 그대로 세면 채널을 못 말하는 리드가 "홈페이지" 한 덩어리로 부풀어
 * 채널 분해가 의미를 잃는다. 그래서 **라벨이 폴백인지 아닌지**를 판정의 축으로 삼는다.
 *
 * 폴백 여부를 분기 조건을 다시 짜서 알아내지 않고 **결과를 폴백값과 맞대 본다**:
 * getLeadChannelLabel 의 분기 순서를 여기서 재현하면 정본이 둘이 되고, 저쪽에 분기가
 * 하나 늘 때(예: 새 클릭ID) 여기만 뒤처진다. 결과 비교는 그 분기를 몰라도 따라간다.
 */
export function isChannelIdentified(lead: LeadRecord): boolean {
  const group = getLeadSourceGroup(lead)
  if (getLeadChannelLabel(lead) === SOURCE_GROUP_LABEL[group]) {
    // 폴백으로 떨어졌다 — 유입 묶음 자체가 광고 플랫폼일 때만 인정한다.
    return CHANNEL_EVIDENT_SOURCE_GROUPS.has(group)
  }
  // 라벨이 폴백과 다르다 = utm_source·클릭ID·네이버 n_* 중 하나가 라벨을 만들었다.
  // 딱 하나 예외를 뺀다: utm_medium 단독("cpc")은 라벨을 바꾸지만 **매체**이지 채널이
  // 아니다. "cpc 에서 왔다"로는 어느 채널에 돈을 더 넣을지 말할 수 없다.
  return Boolean(lead.utm_source?.trim()) || hasAdClickId(lead)
}

/**
 * 잔존율(%). 분모가 0 이면 null — 0 을 돌려주면 "아무도 안 남았다"로 읽히는데 실제로는
 * "셀 대상이 없다"라서 다른 사실이다.
 *
 * 소수 한 자리까지만 남긴다: 정수로 반올림하면 300건 중 1건(0.33%)이 0% 가 되어 진짜 0 과
 * 구분이 사라지고, 그보다 더 잡으면 없는 정밀도를 흉내 내는 셈이다.
 */
function ratio(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round((current / previous) * 1000) / 10
}

/**
 * 귀속 폭포를 만든다. 단계는 전부 **직전 단계 배열에서만** 걸러낸다 — 단조 감소(폭포의
 * 불변식)를 코드 구조로 보장하기 위해서다. 원본에서 단계별로 독립 집계하면 하위 단계가
 * 상위보다 커질 수 있다: utm_campaign 만 붙어 들어온 리드는 "캠페인은 말할 수 있는데
 * 채널은 못 말하는" 상태라, 독립 집계였다면 campaign > channel 이 됐을 것이다. 그런 리드가
 * 채널 단계의 drop 으로 잡히는 게 맞다 — 거기서 고칠 것은 utm_source 다.
 */
export function buildAttributionFunnel(leads: readonly LeadRecord[]): AttributionFunnel {
  // 테스트 리드는 총 리드에서부터 뺀다 — 폭포의 분모가 "우리가 실제로 받은 리드"여야
  // 아래 모든 비율이 말이 된다. 기준은 대시보드 리드 집계 전체와 동일(isTestLead).
  const total = leads.filter((lead) => !isTestLead(lead))
  const tracked = total.filter((lead) => hasTrackingSignal(lead))
  const channel = tracked.filter((lead) => isChannelIdentified(lead))
  // 캠페인·소재는 라벨이 null 이면 "말할 수 없다" — 없는 값을 '기타'로 접지 않는다는
  // lead-attribution 롤업 규약을 그대로 따른다.
  const campaign = channel.filter((lead) => getLeadCampaignLabel(lead) !== null)
  const creative = campaign.filter((lead) => getLeadAdLabel(lead) !== null)

  const counts: Array<[StageKey, number]> = [
    ["total", total.length],
    ["tracked", tracked.length],
    ["channel", channel.length],
    ["campaign", campaign.length],
    ["creative", creative.length],
  ]

  const stages = counts.map(([key, count], index): AttributionFunnelStage => {
    const previous = index === 0 ? null : counts[index - 1][1]
    return {
      key,
      label: STAGE_LABEL[key],
      count,
      retentionPct: previous === null ? null : ratio(count, previous),
      // 첫 단계는 비교 대상이 없어 0 — "빠진 게 없다"가 아니라 "이전이 없다"는 뜻이다.
      drop: previous === null ? 0 : previous - count,
    }
  })

  // 채널 분해는 식별된 리드에서만 센다 — 미식별을 섞으면 channel 단계 수와 byChannel 합이
  // 어긋나고, 그 순간 둘 중 어느 쪽을 믿어야 할지 알 수 없게 된다.
  const perChannel = new Map<string, number>()
  for (const lead of channel) {
    const label = getLeadChannelLabel(lead)
    perChannel.set(label, (perChannel.get(label) ?? 0) + 1)
  }

  return {
    stages,
    byChannel: [...perChannel]
      .map(([label, count]) => ({ channel: label, count }))
      // 동률이면 라벨 오름차순 — 정렬이 흔들리면 같은 데이터로 화면이 매번 달라 보인다.
      .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel, "ko")),
    endToEndPct: ratio(creative.length, total.length),
  }
}
