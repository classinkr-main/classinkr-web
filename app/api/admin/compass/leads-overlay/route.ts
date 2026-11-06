import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getCompassLinksForAdminLeads } from "@/lib/compass/admin-lead-links"
import { getCompassLeadsByIds, getCompassLeadsByPhoneKeys, type CompassLeadRow } from "@/lib/compass/bridge"
import { buildCompassOverlayByLeadId, buildCompassOverlayMap, type CompassOverlayMap, type CompassOverlayResponse } from "@/lib/compass/overlay"

// Compass 리드 오버레이 — 어드민 화면에 로드된 리드의 전화 키(와 리드 id)를 받아 마케팅팀 콜 상태를
// 겹쳐 그릴 최소 페이로드로 돌려준다.
//
//  * 읽기 전용 — 이 라우트는 Compass에도 우리 DB에도 아무것도 쓰지 않는다.
//  * 병합 금지 — 응답은 phone_key 키의 맵(overlay)과 어드민 리드 id 키의 맵(byLeadId — Compass 링크 home_lead, 2026-11-04)
//    두 장이다. 자체 리드 레코드를 바꾸지 않는다. 화면(use-compass-overlay)은 리드 id 를 먼저 보고 전화 키로 떨어진다.
//  * 무음 실패 금지 — 브리지가 죽으면 200 + down:true로 알린다. 빈 맵을 "매칭 없음"으로
//    위장하지 않는다(화면은 이 값으로 "Compass 연결 끊김" 배지를 띄운다).
//  * 인증은 리드 API와 같은 축(CRM 스태프 역할)을 서버에서 강제한다.

/** in(...) 목록이 길어지면 PostgREST URL이 터진다 — 나눠 던지고 합친다. */
const KEY_CHUNK = 300
/** 한 요청이 다룰 수 있는 키 상한. 실제 리드 규모(수천)를 덮으면서 폭주는 막는다. */
const MAX_KEYS = 5_000

/** 어드민 리드 id — UUID 꼴(또는 JSON 폴백의 짧은 id)만. 전화·이름이 실수로 실리지 않게 글자 집합을 좁힌다. */
const LEAD_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/

function readLeadIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return []
  const raw = (body as { leadIds?: unknown }).leadIds
  if (!Array.isArray(raw)) return []
  const ids = new Set<string>()
  for (const value of raw) {
    if (typeof value !== "string") continue
    const id = value.trim()
    if (id && LEAD_ID_SHAPE.test(id)) ids.add(id)
  }
  return Array.from(ids)
}

function readPhoneKeys(body: unknown): string[] {
  if (!body || typeof body !== "object") return []
  const raw = (body as { phoneKeys?: unknown }).phoneKeys
  if (!Array.isArray(raw)) return []
  const keys = new Set<string>()
  for (const value of raw) {
    if (typeof value !== "string") continue
    // 클라이언트가 normalizePhoneKey를 이미 적용해 보낸다. 여기서는 숫자만 남은 형태만 받아
    // 원문 전화가 실수로 실려 오는 것을 막는다(PII 최소화).
    const key = value.trim()
    if (key && /^[0-9]+$/.test(key)) keys.add(key)
  }
  return Array.from(keys)
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  const keys = readPhoneKeys(body)
  const leadIds = readLeadIds(body)
  if (keys.length === 0 && leadIds.length === 0) {
    const empty: CompassOverlayResponse = { overlay: {}, byLeadId: {}, down: false, requested: 0, matched: 0, matchedByLink: 0 }
    return NextResponse.json(empty)
  }
  if (keys.length > MAX_KEYS || leadIds.length > MAX_KEYS) {
    return NextResponse.json(
      { error: `한 번에 조회할 수 있는 전화 키·리드 id 는 각 최대 ${MAX_KEYS}개입니다.` },
      { status: 400 }
    )
  }

  const chunks: string[][] = []
  for (let index = 0; index < keys.length; index += KEY_CHUNK) {
    chunks.push(keys.slice(index, index + KEY_CHUNK))
  }

  // 전화 키 폴백과 링크(home_lead)를 같이 묻는다. 링크된 Compass 행은 id 로 읽는다 — 전화가 없거나 더미 번호인 리드도 붙는다.
  const [results, linkResult] = await Promise.all([
    Promise.all(chunks.map((chunk) => getCompassLeadsByPhoneKeys(chunk))),
    leadIds.length ? getCompassLinksForAdminLeads(leadIds) : Promise.resolve({ links: new Map<string, number[]>(), down: false }),
  ])
  const linkedIds = [...new Set([...linkResult.links.values()].flat())]
  const linkedRows = linkedIds.length ? await getCompassLeadsByIds(linkedIds) : { rows: [] as CompassLeadRow[], down: false }

  // 한 덩어리라도 실패하면 전체를 down으로 본다 — 반쪽 오버레이를 "매칭 없음"처럼 그리면
  // 이미 콜이 돌고 있는 리드를 미접촉으로 오인한다.
  const down = results.some((result) => result.down) || linkResult.down || linkedRows.down
  const rows: CompassLeadRow[] = down ? [] : results.flatMap((result) => result.rows)
  const overlay = buildCompassOverlayMap(rows)
  const byLeadId: CompassOverlayMap = down ? {} : buildCompassOverlayByLeadId(linkResult.links, linkedRows.rows)

  const payload: CompassOverlayResponse = {
    overlay,
    byLeadId,
    down,
    requested: keys.length,
    matched: Object.keys(overlay).length,
    matchedByLink: Object.keys(byLeadId).length,
  }
  return NextResponse.json(payload)
}
