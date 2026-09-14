import { afterEach, describe, expect, it, vi } from "vitest"

// 리드 상태 MKT(Compass) 매시간 반영 — 실행 모듈.
// 저장소·브리지·감사 기록만 목으로 세우고 판정 규칙(lib/compass/lead-contact-sync)은 실제 코드를 통과시킨다.

interface Fixture {
  leads: Array<{ id: string; phone: string; status: "new" | "contacted" }>
  compassRows: Array<{ id: number; phone_key: string; stage: string; created_at: string }>
  touched: number[]
  leadsDown?: boolean
  activitiesDown?: boolean
  applyResult?: { contacted: string[]; closed: string[] }
  applyError?: Error
  readError?: Error
}

function row(id: number, phoneKey: string, stage: string) {
  return { id, phone_key: phoneKey, stage, created_at: "2026-09-01T00:00:00.000Z" }
}

async function loadSync(fixture: Fixture) {
  vi.resetModules()

  const getLeadsForCompassContactSync = vi.fn(async () => {
    if (fixture.readError) throw fixture.readError
    return fixture.leads
  })
  const applyCompassLeadStatusSync = vi.fn(async () => {
    if (fixture.applyError) throw fixture.applyError
    return fixture.applyResult ?? { contacted: [], closed: [] }
  })
  const getCompassLeadsByPhoneKeys = vi.fn(async (keys: string[]) =>
    fixture.leadsDown
      ? { rows: [], down: true, error: "bridge view missing" }
      : { rows: fixture.compassRows.filter((compassRow) => keys.includes(compassRow.phone_key)), down: false }
  )
  const getCompassHumanActivityLeadIds = vi.fn(async (ids: number[]) =>
    fixture.activitiesDown
      ? { rows: [], down: true, error: "activities view missing" }
      : { rows: fixture.touched.filter((id) => ids.includes(id)), down: false }
  )
  const logAudit = vi.fn(async () => undefined)

  vi.doMock("@/lib/repositories/leads", () => ({ getLeadsForCompassContactSync, applyCompassLeadStatusSync }))
  vi.doMock("@/lib/compass/bridge", () => ({ getCompassLeadsByPhoneKeys, getCompassHumanActivityLeadIds }))
  vi.doMock("@/lib/auth/audit", () => ({ logAudit }))

  const mod = await import("@/lib/server/lead-contact-compass-sync")
  return {
    ...mod,
    getLeadsForCompassContactSync,
    applyCompassLeadStatusSync,
    getCompassLeadsByPhoneKeys,
    getCompassHumanActivityLeadIds,
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
  touched: [3],
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.resetModules()
})

describe("syncLeadContactFromCompass", () => {
  it("MKT가 처리한 리드를 연락함·종료로 반영하고, 실제로 바뀐 행만 감사 기록에 남긴다", async () => {
    // e 는 판정과 쓰기 사이에 사람이 먼저 바꿔 조건부 UPDATE 에서 빠졌다고 가정한다.
    const sync = await loadSync({ ...BASE, applyResult: { contacted: ["a", "c"], closed: ["b"] } })

    const report = await sync.syncLeadContactFromCompass({ now: new Date("2026-09-14T10:00:00.000Z") })

    expect(sync.applyCompassLeadStatusSync).toHaveBeenCalledWith(
      { contactedIds: ["a", "c"], closedIds: ["b", "e"] },
      new Date("2026-09-14T10:00:00.000Z")
    )
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
        payload: { contacted: ["a", "c"], closed: [{ id: "b", from: "new" }] },
      })
    )
  })

  it("활동은 단계만으로 판정이 안 끝나는 Compass 리드만 조회한다", async () => {
    const sync = await loadSync({ ...BASE, applyResult: { contacted: [], closed: [] } })

    await sync.syncLeadContactFromCompass()

    expect(sync.getCompassHumanActivityLeadIds).toHaveBeenCalledTimes(1)
    const [ids, kinds] = sync.getCompassHumanActivityLeadIds.mock.calls[0] as unknown as [number[], string[]]
    expect(ids).toEqual([3, 4])
    expect(kinds).toContain("call")
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

  it("활동 조회가 끊겨도 전체를 건너뛴다", async () => {
    const sync = await loadSync({ ...BASE, activitiesDown: true })

    const report = await sync.syncLeadContactFromCompass()

    expect(report).toMatchObject({ status: "bridge_down", error: "activities view missing" })
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
  })

  it("바뀐 행이 없으면 감사 기록을 남기지 않는다", async () => {
    const sync = await loadSync({ ...BASE, applyResult: { contacted: [], closed: [] } })

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

  it("리드 읽기·쓰기 실패는 던지지 않고 failed 로 알린다", async () => {
    const readFail = await loadSync({ ...BASE, readError: new Error("leads read timeout") })
    await expect(readFail.syncLeadContactFromCompass()).resolves.toMatchObject({
      status: "failed",
      error: "leads read timeout",
    })

    const writeFail = await loadSync({ ...BASE, applyError: new Error("update denied") })
    await expect(writeFail.syncLeadContactFromCompass()).resolves.toMatchObject({
      status: "failed",
      error: "update denied",
      toContacted: 2,
      toClosed: 2,
    })
    expect(writeFail.logAudit).not.toHaveBeenCalled()
  })
})

describe("syncLeadContactFromCompassWithinBudget", () => {
  it("예산을 넘기면 기다리지 않고 timeout 으로 돌려준다", async () => {
    vi.useFakeTimers()
    const sync = await loadSync(BASE)
    sync.getLeadsForCompassContactSync.mockImplementation(() => new Promise(() => undefined))

    const pending = sync.syncLeadContactFromCompassWithinBudget({ budgetMs: 20_000 })
    await vi.advanceTimersByTimeAsync(20_000)

    await expect(pending).resolves.toMatchObject({ status: "timeout", dryRun: false })
  })

  it("예산 안에 끝나면 실행 결과를 그대로 돌려준다", async () => {
    const sync = await loadSync({ ...BASE, applyResult: { contacted: ["a"], closed: [] } })

    const report = await sync.syncLeadContactFromCompassWithinBudget({ budgetMs: 20_000, dryRun: true })

    expect(report).toMatchObject({ status: "ok", dryRun: true })
  })
})
