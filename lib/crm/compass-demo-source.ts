/**
 * compass-demo-source.ts — Compass 실측 데모를 우리 리드/계정에 붙이기 위한 수집 계층.
 *
 * 조인은 전화 하나뿐이다: 우리 리드/계정의 phone → normalizePhoneKey → Compass
 * `compass_leads_v.phone_key`. 이름 유사도 매칭은 쓰지 않는다(그게 폐기한 추측이었다).
 *
 * 비용 규약:
 *  - 기간 안에 데모가 0건이면 전화 조회 자체를 하지 않는다(대부분의 요청이 여기서 끝난다).
 *  - 전화키는 URL 길이 한계 때문에 청크로 나눠 조회한다.
 *  - 호출부(홈 큐·통합 고객)는 이미 소스 스냅샷을 60초 캐시한다 — 여기서 또 캐시하지 않는다.
 */
import "server-only"

import { getCompassDemos, getCompassLeadsByPhoneKeys } from "@/lib/compass/bridge"
import { normalizePhoneKey } from "@/lib/compass/normalize"
import {
  EMPTY_COMPASS_DEMO_SOURCE,
  type CompassDemoLike,
  type CompassDemoSource,
} from "@/lib/crm/compass-demo-signal"

/** 조회 창 — 최근 완료(14일) 판정에 여유를 두고, 예정은 넉넉히 앞을 본다. */
const LOOKBACK_DAYS = 60
const LOOKAHEAD_DAYS = 365
/** `.in()` 한 번에 넣는 전화키 수. PostgREST GET 쿼리스트링 길이 한계를 넘지 않게. */
const PHONE_KEY_CHUNK = 400

function toDayString(ms: number) {
  const date = new Date(ms)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
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

  const keys = [...new Set(phones.map((phone) => normalizePhoneKey(phone)).filter((key): key is string => Boolean(key)))]
  if (demos.length === 0 || keys.length === 0) {
    return { demos, phoneKeysByCompassLeadId: new Map(), down: false }
  }

  const chunks = await Promise.all(chunk(keys, PHONE_KEY_CHUNK).map((part) => getCompassLeadsByPhoneKeys(part)))
  const down = chunks.some((result) => result.down)

  const phoneKeysByCompassLeadId = new Map<number, string[]>()
  for (const result of chunks) {
    for (const lead of result.rows) {
      if (!lead.phone_key) continue
      const existing = phoneKeysByCompassLeadId.get(lead.id)
      if (existing) {
        if (!existing.includes(lead.phone_key)) existing.push(lead.phone_key)
      } else {
        phoneKeysByCompassLeadId.set(lead.id, [lead.phone_key])
      }
    }
  }

  return { demos, phoneKeysByCompassLeadId, down }
}
