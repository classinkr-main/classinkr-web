import { afterEach, describe, expect, it, vi } from "vitest"

// 리드 상태 MKT(Compass) 매시간 반영 — 실행 모듈.
// 저장소·브리지·감사 기록만 목으로 세우고 판정 규칙(lib/compass/lead-contact-sync)은 실제 코드를 통과시킨다.

interface ApplyResult {
  contacted: string[]
  closed: Array<{ id: string; from: "new" | "contacted" }>
  stamped: string[]
  confirmedAt: string
  stoppedEarly: boolean
}

interface Fixture {
  leads: Array<{ id: string; phone: string; status: "new" | "contacted" }>
  compassRows: Array<{ id: number; phone_key: string; stage: string; created_at: string }>
  activities: Array<{ lead_id: number; kind: string; actor: string | null }>
  leadsDown?: boolean
  activitiesDown?: boolean
  applyResult?: Partial<ApplyResult>
  applyPartialError?: { message: string; partial: Partial<ApplyResult> }
  readError?: Error
  readRowsOverride?: (keys: string[]) => Array<{ id: number; phone_key: string; stage: string; created_at: string }>
}

const CONFIRMED_AT = "2026-09-14T10:00:00.000Z"

function row(id: number, phoneKey: string, stage: string) {
  return { id, phone_key: phoneKey, stage, created_at: "2026-09-01T00:00:00.000Z" }
}

function fullResult(partial: Partial<ApplyResult> = {}): ApplyResult {
  return { contacted: [], closed: [], stamped: [], confirmedAt: CONFIRMED_AT, stoppedEarly: false, ...partial }
}

async function loadSync(fixture: Fixture) {
  vi.resetModules()

  class CompassLeadStatusSyncError extends Error {
    readonly partial: ApplyResult
    constructor(message: string, partial: ApplyResult) {
      super(message)
      this.partial = partial
    }
  }

  const getLeadsForCompassContactSync = vi.fn(async () => {
    if (fixture.readError) throw fixture.readError
    return fixture.leads
  })
  const applyCompassLeadStatusSync = vi.fn(
    async (_input: unknown, _options: { now?: Date; shouldContinue?: () => boolean }) => {
      if (fixture.applyPartialError) {
        throw new CompassLeadStatusSyncError(
          fixture.applyPartialError.message,
          fullResult(fixture.applyPartialError.partial)
        )
      }
      return fullResult(fixture.applyResult)
    }
  )
  const getCompassLeadsByPhoneKeys = vi.fn(async (keys: string[]) =>
    fixture.leadsDown
      ? { rows: [], down: true, error: "bridge view missing" }
      : {
          rows: fixture.readRowsOverride
            ? fixture.readRowsOverride(keys)
            : fixture.compassRows.filter((compassRow) => keys.includes(compassRow.phone_key)),
          down: false,
        }
  )
  const getCompassActivitySignals = vi.fn(async (ids: number[]) =>
    fixture.activitiesDown
      ? { rows: [], down: true, error: "activities view missing" }
      : { rows: fixture.activities.filter((activity) => ids.includes(activity.lead_id)), down: false }
  )
  const logAudit = vi.fn(async () => undefined)

  vi.doMock("@/lib/repositories/leads", () => ({
    getLeadsForCompassContactSync,
    applyCompassLeadStatusSync,
    CompassLeadStatusSyncError,
  }))
  vi.doMock("@/lib/compass/bridge", () => ({ getCompassLeadsByPhoneKeys, getCompassActivitySignals }))
  vi.doMock("@/lib/auth/audit", () => ({ logAudit }))

  const mod = await import("@/lib/server/lead-contact-compass-sync")
  return {
    ...mod,
    getLeadsForCompassContactSync,
    applyCompassLeadStatusSync,
    getCompassLeadsByPhoneKeys,
    getCompassActivitySignals,
    logAudit,
  }
}

const BASE: Fixture = {
  leads: [
    { id: "a", phone: "010-1111-1111", status: "new" },
    { id: "b", phone: "010-2222-2222", status: "new" },
    { id: "c", phone: "+82 10-3333-3333", status: "new" },
    { id: "d", phone: "010-4444-4444", status: "new" },
    { id: "e", phone: "010-5555-5555", status: "contacted" },
    { id: "f", phone: "010-9999-9999", status: "new" },
  ],
  compassRows: [
    row(1, "01011111111", "demo"),
    row(2, "01022222222", "lost"),
    row(3, "01033333333", "new"),
    row(4, "01044444444", "new"),
    row(5, "01055555555", "lost"),
  ],
  activities: [
    { lead_id: 3, kind: "call", actor: "황찬우" },
    { lead_id: 4, kind: "note", actor: "BD시트" },
  ],
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.resetModules()
})

describe("syncLeadContactFromCompass", () => {
  it("MKT가 처리한 리드를 연락함·종료로 반영하고, 실제로 바뀐 행·도장을 감사 기록에 남긴다", async () => {
    // e 는 판정과 쓰기 사이에 사람이 먼저 바꿔 조건부 UPDATE 에서 빠졌다고 가정한다.
    const sync = await loadSync({
      ...BASE,
      applyResult: { contacted: ["a", "c"], closed: [{ id: "b", from: "new" }], stamped: ["a", "b"] },
    })
    const now = new Date(CONFIRMED_AT)

    const report = await sync.syncLeadContactFromCompass({ now })

    const [input, options] = sync.applyCompassLeadStatusSync.mock.calls[0]
    expect(input).toEqual({ contactedIds: ["a", "c"], closedIds: ["b", "e"] })
    expect(options.now).toEqual(now)
    expect(report).toEqual({
      status: "ok",
      dryRun: false,
      scanned: 6,
      matched: 5,
      toContacted: 2,
      toClosed: 2,
      applied: { contacted: 2, closed: 1 },
    })
    expect(sync.logAudit).toHaveBeenCalledTimes(1)
    expect(sync.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: null,
        actorDisplayName: "MKT(Compass) 자동 반영",
        action: "lead.status.compass_sync",
        targetType: "lead",
        payload: {
          contacted: ["a", "c"],
          closed: [{ id: "b", from: "new" }],
          stamped: ["a", "b"],
          confirmedAt: CONFIRMED_AT,
        },
      })
    )
  })

  it("자동 기록 작성자(BD시트 등)의 메모만 있는 리드는 연락함으로 보내지 않는다", async () => {
    const sync = await loadSync(BASE)

    const report = await sync.syncLeadContactFromCompass({ dryRun: true })

    // d(Compass 4)는 'BD시트' 메모뿐이라 제외 — c(Compass 3)만 사람 콜로 연락함.
    expect(report).toMatchObject({ toContacted: 2, toClosed: 2 })
    expect(sync.getCompassActivitySignals).toHaveBeenCalledTimes(1)
    const [ids, kinds] = sync.getCompassActivitySignals.mock.calls[0] as unknown as [number[], string[]]
    expect(ids).toEqual([3, 4])
    expect(kinds).toContain("note")
    expect(kinds).not.toContain("alimtalk")
  })

  it("dryRun 이면 쓰지도 기록하지도 않고 예상 건수만 돌려준다", async () => {
    const sync = await loadSync(BASE)

    const report = await sync.syncLeadContactFromCompass({ dryRun: true })

    expect(report).toMatchObject({ status: "ok", dryRun: true, toContacted: 2, toClosed: 2, applied: { contacted: 0, closed: 0 } })
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
    expect(sync.logAudit).not.toHaveBeenCalled()
  })

  it("Compass 리드 조회가 끊기면 이번 실행 전체를 건너뛴다 — 빈 결과를 '매칭 없음'으로 보지 않는다", async () => {
    const sync = await loadSync({ ...BASE, leadsDown: true })

    const report = await sync.syncLeadContactFromCompass()

    expect(report).toMatchObject({ status: "bridge_down", error: "bridge view missing", applied: { contacted: 0, closed: 0 } })
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
  })

  it("Compass 리드 조회가 행 상한(1000)에 닿으면 잘렸을 수 있어 전체를 건너뛴다 — 대표 행이 바뀌어 잘못 종료되지 않게", async () => {
    const sync = await loadSync({
      ...BASE,
      readRowsOverride: () => Array.from({ length: 1000 }, (_, index) => row(index + 1, "01011111111", "lost")),
    })

    const report = await sync.syncLeadContactFromCompass()

    expect(report.status).toBe("bridge_down")
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
  })

  it("활동 조회가 끊겨도 전체를 건너뛴다", async () => {
    const sync = await loadSync({ ...BASE, activitiesDown: true })

    const report = await sync.syncLeadContactFromCompass()

    expect(report).toMatchObject({ status: "bridge_down", error: "activities view missing" })
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
  })

  it("바뀐 행이 없으면 감사 기록을 남기지 않는다", async () => {
    const sync = await loadSync(BASE)

    const report = await sync.syncLeadContactFromCompass()

    expect(report.applied).toEqual({ contacted: 0, closed: 0 })
    expect(sync.logAudit).not.toHaveBeenCalled()
  })

  it("반영 대상 리드가 없으면 Compass 를 조회하지 않는다", async () => {
    const sync = await loadSync({ ...BASE, leads: [] })

    const report = await sync.syncLeadContactFromCompass()

    expect(report).toMatchObject({ status: "ok", scanned: 0, matched: 0 })
    expect(sync.getCompassLeadsByPhoneKeys).not.toHaveBeenCalled()
  })

  it("리드 읽기 실패는 던지지 않고 failed 로 알린다", async () => {
    const sync = await loadSync({ ...BASE, readError: new Error("leads read timeout") })

    await expect(sync.syncLeadContactFromCompass()).resolves.toMatchObject({
      status: "failed",
      error: "leads read timeout",
    })
  })

  it("쓰기 중간 실패는 failed 로 알리되, 실패 전까지 바뀐 행은 감사 기록에 남긴다", async () => {
    const sync = await loadSync({
      ...BASE,
      applyPartialError: { message: "update denied", partial: { contacted: ["a"], stamped: ["a"] } },
    })

    const report = await sync.syncLeadContactFromCompass()

    expect(report).toMatchObject({ status: "failed", error: "update denied", applied: { contacted: 1, closed: 0 } })
    expect(sync.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ contacted: ["a"], stamped: ["a"], error: "update denied" }),
      })
    )
  })

  it("쓰기 마감이 이미 지났으면 쓰기를 시작하지 않는다", async () => {
    const sync = await loadSync(BASE)

    const report = await sync.syncLeadContactFromCompass({ writeDeadlineAt: Date.now() - 1 })

    expect(report).toMatchObject({ status: "timeout", toContacted: 2, applied: { contacted: 0, closed: 0 } })
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
  })

  it("쓰기 도중 마감으로 멈추면 timeout 으로 알리고 바뀐 행은 감사 기록에 남긴다", async () => {
    const sync = await loadSync({ ...BASE, applyResult: { contacted: ["a"], stamped: ["a"], stoppedEarly: true } })

    const report = await sync.syncLeadContactFromCompass({ writeDeadlineAt: Date.now() + 60_000 })

    const [, options] = sync.applyCompassLeadStatusSync.mock.calls[0]
    expect(options.shouldContinue?.()).toBe(true)
    expect(report).toMatchObject({ status: "timeout", applied: { contacted: 1, closed: 0 } })
    expect(sync.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ contacted: ["a"], stoppedEarly: true }) })
    )
  })
})

describe("syncLeadContactFromCompassWithinBudget", () => {
  it("예산을 넘기면 기다리지 않고 timeout 을 돌려주고, 늦게 끝난 조회는 쓰기를 시작하지 않는다", async () => {
    vi.useFakeTimers()
    const sync = await loadSync({ ...BASE, applyResult: { contacted: ["a"] } })
    let releaseRead: (value: Fixture["leads"]) => void = () => undefined
    sync.getLeadsForCompassContactSync.mockImplementation(
      () => new Promise<Fixture["leads"]>((resolve) => (releaseRead = resolve))
    )

    const pending = sync.syncLeadContactFromCompassWithinBudget({ budgetMs: 20_000 })
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(pending).resolves.toMatchObject({ status: "timeout", dryRun: false })

    // 응답이 나간 뒤 조회가 풀려도 쓰기 마감(예산 − 여유)이 지났으니 쓰지 않는다.
    releaseRead(BASE.leads)
    await vi.advanceTimersByTimeAsync(1)
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
  })

  it("예산이 쓰기 여유보다 짧으면 조회도 시작하지 않는다", async () => {
    const sync = await loadSync(BASE)

    const report = await sync.syncLeadContactFromCompassWithinBudget({ budgetMs: 2_000 })

    expect(report.status).toBe("timeout")
    expect(sync.getLeadsForCompassContactSync).not.toHaveBeenCalled()
  })

  it("예산 안에 끝나면 실행 결과를 그대로 돌려준다", async () => {
    const sync = await loadSync(BASE)

    const report = await sync.syncLeadContactFromCompassWithinBudget({ budgetMs: 20_000, dryRun: true })

    expect(report).toMatchObject({ status: "ok", dryRun: true })
  })
})
