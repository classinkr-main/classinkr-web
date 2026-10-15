import "server-only"

import { getCompassDemos } from "@/lib/compass/bridge"
import { getPlannedHardwareMovements } from "@/lib/repositories/hardware-inventory"
import {
  koreaDay, overviewOperationsRange, summarizeOverviewDemos, summarizeOverviewInstallations,
  type OverviewOperationsSummary,
} from "./operations-summary"

export async function getOverviewOperations(canReadCrm: boolean, now = new Date()): Promise<OverviewOperationsSummary> {
  const { from, to } = overviewOperationsRange(now)
  const [demos, hardware] = await Promise.allSettled([
    canReadCrm ? getCompassDemos(from, to) : Promise.resolve(null),
    getPlannedHardwareMovements(),
  ])
  const demoResult = demos.status === "fulfilled" ? demos.value : null
  return {
    generatedAt: now.toISOString(),
    today: koreaDay(now),
    demos: !canReadCrm
      ? { status: "forbidden", data: null }
      : demoResult && !demoResult.down
        ? { status: "ready", data: summarizeOverviewDemos(demoResult.rows, now, demoResult.truncated) }
        : { status: "error", data: null },
    installations: hardware.status === "fulfilled"
      ? { status: "ready", data: summarizeOverviewInstallations(hardware.value, now) }
      : { status: "error", data: null },
  }
}
