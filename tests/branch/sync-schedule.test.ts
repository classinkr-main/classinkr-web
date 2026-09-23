// 라운드 5 S-11 — 자동 동기화 시각 문구는 스케줄 상수(lib/branch/sync/schedule.ts)에서 계산한다.
// 상수가 vercel.json의 실제 크론 식과 어긋나면 화면이 틀린 시각을 말하므로 여기서 대조한다.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { BRANCH_SYNC_CRON_UTC, branchSyncScheduleLabel, describeDailyCronKst } from "@/lib/branch/sync/schedule"

describe("매출 시트 자동 동기화 스케줄", () => {
  it("상수가 vercel.json의 /api/cron/sync-branch 스케줄과 같다", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>
    }
    const entry = config.crons?.find((cron) => cron.path === "/api/cron/sync-branch")
    expect(entry, "vercel.json에 /api/cron/sync-branch 크론이 없다").toBeDefined()
    expect(entry!.schedule).toBe(BRANCH_SYNC_CRON_UTC)
  })

  it("UTC 매일 식을 KST 시각 문구로 바꾼다(여러 시각은 정렬해 가운뎃점으로)", () => {
    expect(describeDailyCronKst("0 8 * * *")).toBe("매일 17:00")
    expect(describeDailyCronKst("0 0,4,8 * * *")).toBe("매일 09:00·13:00·17:00")
    expect(describeDailyCronKst("30 15 * * *")).toBe("매일 00:30")
  })

  it("매일이 아니거나 해석할 수 없는 식은 null — 틀린 시각을 지어내지 않는다", () => {
    expect(describeDailyCronKst("50 0,1,4,6,8 * * 1-5")).toBeNull()
    expect(describeDailyCronKst("*/5 * * * *")).toBeNull()
    expect(describeDailyCronKst("bad")).toBeNull()
  })

  it("화면 문구", () => {
    expect(branchSyncScheduleLabel()).toBe(`${describeDailyCronKst(BRANCH_SYNC_CRON_UTC)}(KST) 자동 동기화`)
  })
})
