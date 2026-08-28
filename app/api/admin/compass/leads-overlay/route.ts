import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getCompassLeadsByPhoneKeys, type CompassLeadRow } from "@/lib/compass/bridge"
import { buildCompassOverlayMap, type CompassOverlayResponse } from "@/lib/compass/overlay"

// Compass 리드 오버레이 — 어드민 화면에 로드된 리드의 전화 키를 받아 마케팅팀 콜 상태를
// 겹쳐 그릴 최소 페이로드로 돌려준다.
//
//  * 읽기 전용 — 이 라우트는 Compass에도 우리 DB에도 아무것도 쓰지 않는다.
//  * 병합 금지 — 응답은 phone_key 키의 별도 맵이다. 자체 리드 레코드를 바꾸지 않는다.
//  * 무음 실패 금지 — 브리지가 죽으면 200 + down:true로 알린다. 빈 맵을 "매칭 없음"으로
//    위장하지 않는다(화면은 이 값으로 "Compass 연결 끊김" 배지를 띄운다).
//  * 인증은 리드 API와 같은 축(CRM 스태프 역할)을 서버에서 강제한다.

/** in(...) 목록이 길어지면 PostgREST URL이 터진다 — 나눠 던지고 합친다. */
const KEY_CHUNK = 300
/** 한 요청이 다룰 수 있는 키 상한. 실제 리드 규모(수천)를 덮으면서 폭주는 막는다. */
const MAX_KEYS = 5_000

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
  if (keys.length === 0) {
    const empty: CompassOverlayResponse = { overlay: {}, down: false, requested: 0, matched: 0 }
    return NextResponse.json(empty)
  }
  if (keys.length > MAX_KEYS) {
    return NextResponse.json(
      { error: `한 번에 조회할 수 있는 전화 키는 최대 ${MAX_KEYS}개입니다.` },
      { status: 400 }
    )
  }

  const chunks: string[][] = []
  for (let index = 0; index < keys.length; index += KEY_CHUNK) {
    chunks.push(keys.slice(index, index + KEY_CHUNK))
  }

  const results = await Promise.all(chunks.map((chunk) => getCompassLeadsByPhoneKeys(chunk)))
  // 한 덩어리라도 실패하면 전체를 down으로 본다 — 반쪽 오버레이를 "매칭 없음"처럼 그리면
  // 이미 콜이 돌고 있는 리드를 미접촉으로 오인한다.
  const down = results.some((result) => result.down)
  const rows: CompassLeadRow[] = down ? [] : results.flatMap((result) => result.rows)
  const overlay = buildCompassOverlayMap(rows)

  const payload: CompassOverlayResponse = {
    overlay,
    down,
    requested: keys.length,
    matched: Object.keys(overlay).length,
  }
  return NextResponse.json(payload)
}
