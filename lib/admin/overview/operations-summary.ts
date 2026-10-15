import type { CompassDemoRow } from "@/lib/compass/bridge"
import type { PlannedHardwareMovement } from "@/lib/repositories/hardware-inventory"

const DAY_MS = 86_400_000

export function koreaDay(now: Date) {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10)
}

export function overviewOperationsRange(now: Date) {
  const today = koreaDay(now)
  const day = new Date(`${today}T00:00:00Z`)
  return {
    today,
    from: `${today.slice(0, 7)}-01`,
    to: new Date(day.getTime() + 30 * DAY_MS).toISOString().slice(0, 10),
    next7End: new Date(day.getTime() + 6 * DAY_MS).toISOString().slice(0, 10),
  }
}

export function summarizeOverviewDemos(rows: CompassDemoRow[], now: Date, truncated = false) {
  const { today, next7End } = overviewOperationsRange(now)
  // Compass의 회차 원장만 센다. 미팅·취소·노쇼·지난 예약을 완료로 추정하지 않는다.
  const demos = rows.filter((row) => row.kind === "demo" && row.day)
  const monthRows = demos.filter((row) => row.day!.slice(0, 7) === today.slice(0, 7))
  const upcoming = demos
    .filter((row) => row.status === "booked" && row.day!.slice(0, 10) >= today)
    .sort((a, b) => a.day!.localeCompare(b.day!) || a.id - b.id)
  return {
    truncated,
    upcomingCount: upcoming.length,
    next7Count: upcoming.filter((row) => row.day!.slice(0, 10) <= next7End).length,
    todayCount: upcoming.filter((row) => row.day!.slice(0, 10) === today).length,
    doneThisMonth: monthRows.filter((row) => row.status === "done").length,
    unrecordedThisMonth: monthRows.filter((row) => row.status === "booked" && row.day!.slice(0, 10) < today).length,
    noShowThisMonth: monthRows.filter((row) => row.status === "no_show").length,
    canceledThisMonth: monthRows.filter((row) => row.status === "canceled").length,
    upcoming: upcoming.slice(0, 4).map((row) => ({
      id: row.id, leadId: row.lead_id, date: row.day!.slice(0, 10),
      owner: row.owner, approximate: Boolean(row.day_approx),
    })),
  }
}

export function summarizeOverviewInstallations(rows: PlannedHardwareMovement[], now: Date) {
  const { today, next7End } = overviewOperationsRange(now)
  // 저장소가 동일 isPlannedStatus/void 판정을 통과시킨 전량. 행 수와 장비 수량은 분리한다.
  const dated = rows.map((row) => ({ ...row, date: row.occurred_at?.slice(0, 10) || null }))
  const upcoming = dated.slice().sort((a, b) =>
    (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.id.localeCompare(b.id))
  return {
    count: rows.length,
    units: rows.reduce((sum, row) => sum + row.quantity, 0),
    overdueCount: dated.filter((row) => row.date && row.date < today).length,
    undatedCount: dated.filter((row) => !row.date).length,
    next7Count: dated.filter((row) => row.date && row.date >= today && row.date <= next7End).length,
    upcoming: upcoming.slice(0, 4).map((row) => ({
      id: row.id, date: row.date, customer: row.to_location, product: row.product_name,
      quantity: row.quantity, owner: row.owner, overdue: Boolean(row.date && row.date < today),
    })),
  }
}

export type OverviewDemoSummary = ReturnType<typeof summarizeOverviewDemos>
export type OverviewInstallationSummary = ReturnType<typeof summarizeOverviewInstallations>
export interface OverviewOperationsSummary {
  generatedAt: string
  today: string
  demos: { status: "ready" | "error" | "forbidden"; data: OverviewDemoSummary | null }
  installations: { status: "ready" | "error"; data: OverviewInstallationSummary | null }
}
