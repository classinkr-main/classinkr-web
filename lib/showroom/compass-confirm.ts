/**
 * showroom/compass-confirm — 쇼룸 신청을 Compass 「쇼룸 데모」 회차로 확정하는 판정(순수 함수, I/O 없음).
 *
 * 운영 흐름(2026-11-06 설계자 "바로 확정이 아니라 신청 → compass 에서 컨펌 및 담당 지정 → 확정 → 확정 문자"):
 *  ① 고객이 /showroom 에서 신청 → showroom_bookings.status = requested, 접수 문자("확정되면 문자로 알려드립니다")
 *  ② 신청은 리드로 미러되고 Compass 로 넘어간다(lib/server/compass-lead-push.ts → crm.lead_refs home_lead)
 *  ③ 매니저가 Compass 리드에서 데모 예약 → 방식 「쇼룸 데모」, 날짜·시각, 담당을 고른다 = **컨펌 + 담당 지정**
 *  ④ 어드민 크론(lib/server/showroom-compass-confirm.ts)이 그 회차를 읽어 여기서 짝을 정하고, 예약을 confirmed 로 올린 뒤
 *     확정 문자를 한 번 보낸다.
 *
 * Compass 에 새 버튼을 두지 않고 이미 쓰는 「데모 예약」을 확정 신호로 쓴다 — 회차가 생기면 Compass 가 쇼룸 구글 캘린더에도
 * 일정을 잡는다(Compass ADR-0086). 교차 쓰기 0건 규칙(compass-integration-2026-09-14.md §0) 그대로 어드민은 뷰로 읽기만 한다.
 */

/** Compass 회차 메모에 남는 방식 라벨 — Compass lib/demoTypes.ts DEMO_TYPES 의 showroom label 과 글자 그대로 같아야 한다. */
export const COMPASS_SHOWROOM_DEMO_MEMO = "쇼룸 데모"

/** 확정 판정 대상 신청의 나이 — 이보다 오래된 신청은 Compass 회차가 생겨도 확정하지 않는다(엉뚱한 옛 신청에 문자 방지). */
export const SHOWROOM_CONFIRM_LOOKBACK_DAYS = 45

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export interface ShowroomConfirmCandidate {
  id: string
  /** 어드민 리드 id(showroom_bookings.lead_id) — Compass 링크의 열쇠 */
  leadId: string | null
  status: string
  /** 신청한 방문 일시(KST) */
  visitDate: string
  visitTime: string
  createdAt: string
}

/** compass_demos_v 한 행(필요한 칸만) */
export interface CompassShowroomDemoRound {
  id: number
  lead_id: number | null
  kind: string | null
  status: string | null
  owner: string | null
  memo: string | null
  /** 회차 시각(timestamptz) */
  at: string | null
}

export interface ShowroomConfirmPlan {
  bookingId: string
  compassDemoId: number
  compassLeadId: number
  /** 확정 방문일·시각(KST) — Compass 회차 시각 */
  visitDate: string
  visitTime: string
  /** Compass 회차 담당 */
  assignedTo: string
  /** 신청 일시와 확정 일시가 다른가 */
  moved: boolean
}

/** timestamptz → KST 날짜·HH:mm. 한국은 일광절약시간이 없어 +9시간 고정이다. 못 읽으면 null. */
export function toKstDateTime(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const shifted = new Date(ms + KST_OFFSET_MS).toISOString()
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) }
}

/** 지금의 KST 날짜(YYYY-MM-DD) */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 확정 신호로 인정하는 회차인가 — 쇼룸 데모 · 잡힘 · 담당 있음 · 시각 있음 */
export function isConfirmingShowroomRound(round: CompassShowroomDemoRound): boolean {
  return (
    (round.kind ?? "demo") === "demo" &&
    (round.memo ?? "").trim() === COMPASS_SHOWROOM_DEMO_MEMO &&
    round.status === "booked" &&
    Boolean(round.owner?.trim()) &&
    toKstDateTime(round.at) !== null
  )
}

function kstMinutes(date: string, time: string): number {
  const ms = Date.parse(`${date}T${time}:00+09:00`)
  return Number.isFinite(ms) ? ms / 60_000 : Number.NaN
}

/**
 * 신청 ↔ Compass 회차 짝짓기.
 *
 *  * 신청은 requested 이고 어드민 리드가 있어야 한다. 그 리드에 링크된 Compass 리드의 회차만 본다(전화 추측 매칭 없음).
 *  * 회차는 확정 신호(isConfirmingShowroomRound)이고, 회차 날짜가 오늘(KST) 이후이며 신청 접수일 이후여야 한다 —
 *    지난 방문이나 신청 전에 잡힌 옛 회차로 확정 문자를 보내지 않는다.
 *  * 이미 다른 예약을 확정한 회차(usedDemoIds)와 이번 판정에서 먼저 짝지은 회차는 다시 쓰지 않는다.
 *  * 후보가 여럿이면 신청 일시에 가장 가까운 회차, 같으면 이른 회차.
 */
export function planShowroomConfirmations(input: {
  bookings: readonly ShowroomConfirmCandidate[]
  /** 어드민 리드 id → 링크된 Compass 리드 id 들 */
  links: ReadonlyMap<string, readonly number[]>
  rounds: readonly CompassShowroomDemoRound[]
  usedDemoIds?: ReadonlySet<number>
  today: string
}): ShowroomConfirmPlan[] {
  const used = new Set(input.usedDemoIds ?? [])
  const roundsByLead = new Map<number, CompassShowroomDemoRound[]>()
  for (const round of input.rounds) {
    if (round.lead_id == null || !isConfirmingShowroomRound(round)) continue
    const list = roundsByLead.get(round.lead_id)
    if (list) list.push(round)
    else roundsByLead.set(round.lead_id, [round])
  }

  // 먼저 들어온 신청부터 회차를 가져간다.
  const ordered = [...input.bookings].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const plans: ShowroomConfirmPlan[] = []

  for (const booking of ordered) {
    if (booking.status !== "requested" || !booking.leadId) continue
    const compassLeadIds = input.links.get(booking.leadId) ?? []
    const submittedDay = toKstDateTime(booking.createdAt)?.date ?? input.today
    const requestedAt = kstMinutes(booking.visitDate, booking.visitTime)

    let best: { round: CompassShowroomDemoRound; when: { date: string; time: string }; distance: number; at: number } | null = null
    for (const compassLeadId of compassLeadIds) {
      for (const round of roundsByLead.get(compassLeadId) ?? []) {
        if (used.has(round.id)) continue
        const when = toKstDateTime(round.at)
        if (!when || when.date < input.today || when.date < submittedDay) continue
        const at = kstMinutes(when.date, when.time)
        const distance = Number.isFinite(requestedAt) ? Math.abs(at - requestedAt) : 0
        if (!best || distance < best.distance || (distance === best.distance && at < best.at)) {
          best = { round, when, distance, at }
        }
      }
    }
    if (!best) continue

    used.add(best.round.id)
    plans.push({
      bookingId: booking.id,
      compassDemoId: best.round.id,
      compassLeadId: best.round.lead_id as number,
      visitDate: best.when.date,
      visitTime: best.when.time,
      assignedTo: (best.round.owner ?? "").trim(),
      moved: best.when.date !== booking.visitDate || best.when.time !== booking.visitTime,
    })
  }

  return plans
}

/**
 * 확정 문자를 보내도 되는 방문인가 — 방문일이 오늘(KST) 이후일 때만.
 * 어드민에서 지난 신청을 정리하느라 확정으로 바꿀 때 고객에게 문자가 나가지 않게 한다.
 */
export function shouldSendShowroomConfirmation(visitDate: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(visitDate) && visitDate >= today
}
