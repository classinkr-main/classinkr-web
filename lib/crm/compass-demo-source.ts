/**
 * compass-demo-source.ts — Compass 실측 데모를 우리 리드/계정에 붙이기 위한 수집 계층.
 *
 * 조인은 전화 하나뿐이다: 우리 리드/계정의 phone → normalizePhoneKey → Compass
 * `compass_leads_v.phone_key`. 이름 유사도 매칭은 쓰지 않는다(그게 폐기한 추측이었다).
 *
 * 비용 규약:
 *  - 기간 안에 데모가 0건이면 전화 조회 자체를 하지 않는다(대부분의 요청이 여기서 끝난다).
 *  - 역조회(2026-09-14): 데모가 가리키는 Compass 리드 id(수십 건)로 phone_key 를 PK 조회 1회에
 *    받고, 우리 전화 키 집합과의 교집합만 남긴다. 예전에는 우리 리드·NEO 고객 전화 전부를
 *    400개씩 phone_key 로 조회했다(청크마다 뷰 정규식 스캔, 전화 키 수천 개가 쿼리스트링에 실림).
 *    결과(phoneKeysByCompassLeadId 의 데모 리드 항목)는 같다.
 *  - 호출부(홈 큐·통합 고객)는 이미 소스 스냅샷을 60초 캐시한다 — 여기서 또 캐시하지 않는다.
 */
import "server-only"

import { getCompassDemos, getCompassLeadPhoneKeysByIds } from "@/lib/compass/bridge"
import { normalizePhoneKey } from "@/lib/compass/normalize"
import {
  EMPTY_COMPASS_DEMO_SOURCE,
  type CompassDemoLike,
  type CompassDemoSource,
} from "@/lib/crm/compass-demo-signal"

/** 조회 창 — 최근 완료(14일) 판정에 여유를 두고, 예정은 넉넉히 앞을 본다. */
const LOOKBACK_DAYS = 60
const LOOKAHEAD_DAYS = 365

function toDayString(ms: number) {
  const date = new Date(ms)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/**
 * 우리 쪽 전화 목록으로 Compass 데모 소스를 수집한다. 실패는 던지지 않고 down 으로 표시한다 —
 * 보조 축 하나가 CRM 큐 전체를 못 세우게 하지 않는다.
 */
export async function loadCompassDemoSource(
  phones: Array<string | null | undefined>,
  now: Date = new Date()
): Promise<CompassDemoSource> {
  const nowMs = now.getTime()
  const from = toDayString(nowMs - LOOKBACK_DAYS * 86_400_000)
  const to = toDayString(nowMs + LOOKAHEAD_DAYS * 86_400_000)

  const demoResult = await getCompassDemos(from, to)
  if (demoResult.down) return { ...EMPTY_COMPASS_DEMO_SOURCE, down: true }

  const demos: CompassDemoLike[] = demoResult.rows.map((row) => ({
    id: row.id,
    lead_id: row.lead_id,
    day: row.day,
    status: row.status,
    owner: row.owner,
    day_approx: row.day_approx,
  }))

  const keys = new Set(phones.map((phone) => normalizePhoneKey(phone)).filter((key): key is string => Boolean(key)))
  const demoLeadIds = [...new Set(demos.map((demo) => demo.lead_id).filter((id): id is number => id != null))]
  // 데모가 없거나(대부분의 요청) 리드에 붙은 데모가 없거나 우리 쪽 전화가 없으면 조회하지 않는다.
  if (demoLeadIds.length === 0 || keys.size === 0) {
    return { demos, phoneKeysByCompassLeadId: new Map(), down: false }
  }

  const leads = await getCompassLeadPhoneKeysByIds(demoLeadIds)
  return {
    demos,
    phoneKeysByCompassLeadId: phoneKeysForOurLeads(leads.rows, keys),
    down: leads.down,
  }
}

/**
 * Compass 리드(id·phone_key) 중 우리 전화 키 집합에 있는 것만 lead_id → 키 목록으로 모은다. 순수 함수.
 * 교집합만 남기는 이유: 스냅샷(JSON 캐시)에 우리와 무관한 Compass 고객의 전화 키를 싣지 않는다.
 */
export function phoneKeysForOurLeads(
  leads: ReadonlyArray<{ id: number; phone_key: string | null }>,
  ourKeys: ReadonlySet<string>
): Map<number, string[]> {
  const phoneKeysByCompassLeadId = new Map<number, string[]>()
  for (const lead of leads) {
    if (!lead.phone_key || !ourKeys.has(lead.phone_key)) continue
    const existing = phoneKeysByCompassLeadId.get(lead.id)
    if (existing) {
      if (!existing.includes(lead.phone_key)) existing.push(lead.phone_key)
    } else {
      phoneKeysByCompassLeadId.set(lead.id, [lead.phone_key])
    }
  }
  return phoneKeysByCompassLeadId
}
