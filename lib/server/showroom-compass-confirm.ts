// 쇼룸 신청 → Compass 컨펌·담당 지정 → 확정 → 확정 문자 (2026-11-06).
//
// 실행 자리는 전용 크론 app/api/cron/showroom-confirm-sync 다(5분 간격, vercel.json).
//  * 신호: Compass 리드의 「쇼룸 데모」·잡힘 회차(담당·시각 있음) — 판정은 lib/showroom/compass-confirm.ts(순수 함수).
//  * 매칭: 어드민 리드 id → Compass 링크(compass_lead_refs_v system='home_lead')만 쓴다. 전화 키 추측 매칭은 하지 않는다 —
//    고객에게 문자가 나가는 경로라 "아마 같은 사람"으로 확정하지 않는다.
//  * 쓰기 범위는 public.showroom_bookings 뿐이다(조건부 UPDATE: requested 일 때만). Compass 는 뷰로 읽기만 한다(교차 쓰기 0건).
//  * 문자: 확정된 예약마다 claimShowroomConfirmationMessage 로 선점한 뒤 한 번. 방문일이 지났으면 보내지 않는다.
//  * 링크·회차 조회가 끊기면 이번 실행 전체를 건너뛴다(bridge_down) — 다음 실행이 따라잡는다.
//  * 외부 발송 안전 규칙(operational-failure-handling-guidelines.md §3):
//    - 스위치 SHOWROOM_CONFIRM_ENABLED(1·true·on) — 꺼져 있으면 판정만 하고 쓰지도 보내지도 않는다(= 상시 dry-run).
//      켜기 전에 `/api/cron/lead-contact-sync?dryRun=true` 의 showroomConfirm.planned 로 대상 수를 먼저 본다.
//    - 실행당 상한 SHOWROOM_CONFIRM_MAX_PER_RUN — 넘으면 이번 실행은 아무것도 확정·발송하지 않고 over_cap 으로 알린다.
//    - 멱등: 확정은 requested 조건부 UPDATE, 문자는 confirmation_sent_at 선점(예약) → 발송 → message_logs·감사 기록.
//  * 절대 던지지 않는다 — 실패는 보고서의 status 로 알리고, 응답 코드는 라우트가 정한다.

import "server-only"

import { logAudit } from "@/lib/auth/audit"
import { getCompassLinksForAdminLeads } from "@/lib/compass/admin-lead-links"
import { getCompassShowroomDemoRounds } from "@/lib/compass/bridge"
import { sendShowroomBookingConfirmation } from "@/lib/messaging/customer-receipt"
import {
  claimShowroomConfirmationMessage,
  confirmShowroomBookingFromCompass,
  listShowroomBookingsAwaitingConfirm,
  listUsedCompassDemoIds,
  type ShowroomBookingRecord,
} from "@/lib/repositories/showroom-bookings"
import {
  SHOWROOM_CONFIRM_LOOKBACK_DAYS,
  kstToday,
  planShowroomConfirmations,
  shouldSendShowroomConfirmation,
} from "@/lib/showroom/compass-confirm"

export type ShowroomConfirmSyncStatus = "ok" | "bridge_down" | "failed" | "over_cap"

/** 실행당 확정·발송 상한 — 평소 하루 몇 건이다. 넘으면 백로그 재생으로 보고 사람이 확인한다. */
export const SHOWROOM_CONFIRM_MAX_PER_RUN = 10

/** 확정 동기화·확정 문자 스위치. 기본 꺼짐(판정만). */
export function isShowroomConfirmEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|on)$/i.test(env.SHOWROOM_CONFIRM_ENABLED?.trim() ?? "")
}

export interface ShowroomConfirmSyncReport {
  status: ShowroomConfirmSyncStatus
  /** 스위치(SHOWROOM_CONFIRM_ENABLED) — 꺼져 있으면 dryRun 도 true 다 */
  enabled: boolean
  dryRun: boolean
  /** 판정에 넣은 신청(requested · 리드 있음 · 최근 접수) 수 */
  scanned: number
  /** Compass 링크가 있는 신청 수 */
  linked: number
  /** 확정할 짝(신청 ↔ 쇼룸 데모 회차) 수 */
  planned: number
  /** 조건부 UPDATE 로 실제 확정한 수 — 판정과 쓰기 사이에 사람이 바꾼 신청은 빠진다 */
  confirmed: number
  /** 이번 실행에서 확정한 예약 id — 라우트가 접수 큐 캐시를 무효화할지 정한다 */
  confirmedIds: string[]
  /** 확정 문자 결과 */
  messages: { sent: number; simulated: number; failed: number; skipped: number }
  error?: string
}

export type ShowroomConfirmationMessageOutcome = "sent" | "simulated" | "failed" | "skipped"

/**
 * 확정된 예약에 확정 문자를 한 번 보낸다 — 크론과 어드민 접수 큐(PATCH confirmed)가 같이 쓴다.
 * 방문일이 지났거나 이미 보냈으면(선점 실패) skipped. 던지지 않는다.
 */
export async function sendShowroomConfirmationOnce(
  booking: Pick<ShowroomBookingRecord, "id" | "phone" | "visitDate" | "visitTime" | "assignedTo" | "status">,
  now: Date = new Date()
): Promise<ShowroomConfirmationMessageOutcome> {
  if (!isShowroomConfirmEnabled()) return "skipped"
  if (booking.status !== "confirmed") return "skipped"
  if (!shouldSendShowroomConfirmation(booking.visitDate, kstToday(now))) return "skipped"
  try {
    const claimed = await claimShowroomConfirmationMessage(booking.id)
    if (!claimed) return "skipped"
    const result = await sendShowroomBookingConfirmation({
      bookingId: booking.id,
      phone: booking.phone,
      visitDate: booking.visitDate,
      visitTime: booking.visitTime,
      assignedTo: booking.assignedTo,
    })
    // SendResult 는 건수로 말한다 — dry-run·키 미설정은 simulated, 접수 실패는 failed(message_logs 에 상세).
    if (result.failed > 0 || result.error) return "failed"
    if (result.simulated > 0) return "simulated"
    return result.sent > 0 ? "sent" : "failed"
  } catch (error) {
    // 번호·이름이 섞일 수 있는 원문은 남기지 않는다.
    console.error("[showroom-confirm] confirmation message failed:", error instanceof Error ? error.name : "Error")
    return "failed"
  }
}

function emptyReport(
  enabled: boolean,
  dryRun: boolean,
  status: ShowroomConfirmSyncStatus = "ok",
  error?: string
): ShowroomConfirmSyncReport {
  return {
    status,
    enabled,
    dryRun,
    scanned: 0,
    linked: 0,
    planned: 0,
    confirmed: 0,
    confirmedIds: [],
    messages: { sent: 0, simulated: 0, failed: 0, skipped: 0 },
    ...(error ? { error } : {}),
  }
}

export async function syncShowroomConfirmationsFromCompass(
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<ShowroomConfirmSyncReport> {
  const enabled = isShowroomConfirmEnabled()
  const dryRun = options.dryRun === true || !enabled
  const now = options.now ?? new Date()
  const today = kstToday(now)
  const createdSince = new Date(now.getTime() - SHOWROOM_CONFIRM_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()

  let bookings: ShowroomBookingRecord[]
  try {
    bookings = await listShowroomBookingsAwaitingConfirm(createdSince)
  } catch (error) {
    // 마이그레이션 미적용(42703)도 여기로 온다 — 확정 칸 없이 확정하면 문자 중복을 막을 수 없다.
    return emptyReport(enabled, dryRun, "failed", error instanceof Error ? error.message.slice(0, 200) : "list failed")
  }

  const report = emptyReport(enabled, dryRun)
  report.scanned = bookings.length
  if (bookings.length === 0) return report

  const links = await getCompassLinksForAdminLeads(bookings.map((b) => b.leadId ?? ""))
  if (links.down) return { ...report, status: "bridge_down", error: links.error }
  report.linked = bookings.filter((b) => b.leadId && (links.links.get(b.leadId)?.length ?? 0) > 0).length
  if (report.linked === 0) return report

  const compassLeadIds = [...new Set([...links.links.values()].flat())]
  const rounds = await getCompassShowroomDemoRounds(compassLeadIds, today)
  if (rounds.down) return { ...report, status: "bridge_down", error: rounds.error }

  let usedDemoIds: Set<number>
  try {
    usedDemoIds = await listUsedCompassDemoIds(rounds.rows.map((r) => r.id))
  } catch (error) {
    return { ...report, status: "failed", error: error instanceof Error ? error.message.slice(0, 200) : "used ids failed" }
  }

  const plans = planShowroomConfirmations({
    bookings: bookings.map((b) => ({
      id: b.id,
      leadId: b.leadId,
      status: b.status,
      visitDate: b.visitDate,
      visitTime: b.visitTime,
      createdAt: b.createdAt,
    })),
    links: links.links,
    rounds: rounds.rows,
    usedDemoIds,
    today,
  })
  report.planned = plans.length
  if (plans.length > SHOWROOM_CONFIRM_MAX_PER_RUN) {
    // 백로그 재생 차단 — 한 건도 확정·발송하지 않고 요약만 돌려준다(운영자 확인 후 상한·대상을 정리).
    return { ...report, status: "over_cap", error: `planned ${plans.length} > ${SHOWROOM_CONFIRM_MAX_PER_RUN}` }
  }
  if (dryRun || plans.length === 0) return report

  const byId = new Map(bookings.map((b) => [b.id, b]))
  for (const plan of plans) {
    const current = byId.get(plan.bookingId)
    if (!current) continue
    let confirmed: ShowroomBookingRecord | null = null
    try {
      confirmed = await confirmShowroomBookingFromCompass(current, plan)
    } catch (error) {
      // 23505(같은 회차가 다른 예약을 이미 확정) 등 — 이 건만 건너뛰고 다음으로.
      console.error("[showroom-confirm] confirm failed:", error instanceof Error ? error.message.slice(0, 120) : "Error")
      report.status = "failed"
      report.error = "confirm failed"
      continue
    }
    if (!confirmed) continue
    report.confirmed += 1
    report.confirmedIds.push(confirmed.id)

    const outcome = await sendShowroomConfirmationOnce(confirmed, now)
    report.messages[outcome] += 1

    await logAudit({
      actorUserId: null,
      actorDisplayName: "Compass 쇼룸 확정 동기화",
      action: "showroom_booking.confirm_from_compass",
      targetType: "showroom_booking",
      targetId: confirmed.id,
      payload: {
        compassDemoId: plan.compassDemoId,
        compassLeadId: plan.compassLeadId,
        assignedTo: plan.assignedTo,
        visit: `${plan.visitDate} ${plan.visitTime}`,
        moved: plan.moved,
        message: outcome,
      },
    })
  }

  return report
}
