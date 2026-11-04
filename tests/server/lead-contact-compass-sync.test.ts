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

type CompassRow = { id: number; phone_key: string | null; stage: string; created_at: string; caller?: string | null; bd_owner?: string | null; owner?: string | null }
type DirectoryOwner = { ownerKey: string; displayName: string; ownerAliases: string[]; neoOwnerId?: string | null }

interface Fixture {
  leads: Array<{ id: string; phone: string | null; status: "new" | "contacted"; assigned_to?: string | null }>
  compassRows: CompassRow[]
  activities: Array<{ lead_id: number; kind: string; actor: string | null }>
  leadsDown?: boolean
  activitiesDown?: boolean
  applyResult?: Partial<ApplyResult>
  applyPartialError?: { message: string; partial: Partial<ApplyResult> }
  readError?: Error
  readRowsOverride?: (keys: string[]) => CompassRow[]
  /** 어드민 리드 id → 링크된 Compass 리드 id(compass_lead_refs_v home_lead) */
  links?: Record<string, number[]>
  linksDown?: boolean
  /** 링크로만 찾는 행(전화 키가 없거나 더미) — 없으면 compassRows 에서 id 로 찾는다 */
  rowsById?: CompassRow[]
  directory?: { health: { ok: boolean; message: string | null }; crmOwners: DirectoryOwner[] }
  ownerApplyResult?: Array<{ id: string; to: string }>
  ownerApplyError?: { message: string; partial: Array<{ id: string; to: string }> }
}

const CONFIRMED_AT = "2026-09-14T10:00:00.000Z"

// 리드 픽스처에 created_at 이 없으니 판정은 시각을 따지지 않는다(옛 동작) — 시각 규칙은 tests/compass/lead-contact-sync.test.ts.
// 번호는 자리표시 규칙(010-1111-1111 류는 더미)에 걸리지 않는 모양을 쓴다.
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
  class CompassLeadOwnerSyncError extends Error {
    readonly partial: { assigned: Array<{ id: string; to: string }>; stoppedEarly: boolean }
    constructor(message: string, partial: { assigned: Array<{ id: string; to: string }>; stoppedEarly: boolean }) {
      super(message)
      this.partial = partial
    }
  }
  const applyCompassLeadOwnerSync = vi.fn(async (assignments: Array<{ id: string; to: string }>) => {
    if (fixture.ownerApplyError) {
      throw new CompassLeadOwnerSyncError(fixture.ownerApplyError.message, { assigned: fixture.ownerApplyError.partial, stoppedEarly: false })
    }
    return { assigned: fixture.ownerApplyResult ?? assignments.map((a) => ({ id: a.id, to: a.to })), stoppedEarly: false }
  })
  const getCompassLinksForAdminLeads = vi.fn(async () =>
    fixture.linksDown
      ? { links: new Map<string, number[]>(), down: true, error: "refs view missing" }
      : { links: new Map(Object.entries(fixture.links ?? {})), down: false }
  )
  const getCompassLeadsByIds = vi.fn(async (ids: number[]) => ({
    rows: (fixture.rowsById ?? fixture.compassRows).filter((compassRow) => ids.includes(compassRow.id)),
    down: false,
  }))
  const listAdminUserDirectoryCached = vi.fn(async () =>
    fixture.directory ?? {
      health: { ok: true, message: null },
      crmOwners: [
        { ownerKey: "jin.somang", displayName: "진소망", ownerAliases: ["소망"], neoOwnerId: null },
        { ownerKey: "hwang.chanwoo", displayName: "황찬우", ownerAliases: [], neoOwnerId: null },
      ],
    }
  )
  const ownerLookupKeys = (owner: DirectoryOwner | null | undefined) =>
    owner ? [owner.ownerKey, owner.displayName, ...owner.ownerAliases, ...(owner.neoOwnerId ? [owner.neoOwnerId] : [])] : []

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
            : fixture.compassRows.filter((compassRow) => compassRow.phone_key != null && keys.includes(compassRow.phone_key)),
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
    applyCompassLeadOwnerSync,
    CompassLeadStatusSyncError,
    CompassLeadOwnerSyncError,
  }))
  vi.doMock("@/lib/compass/bridge", () => ({ getCompassLeadsByPhoneKeys, getCompassActivitySignals, getCompassLeadsByIds }))
  vi.doMock("@/lib/compass/admin-lead-links", () => ({ getCompassLinksForAdminLeads }))
  vi.doMock("@/lib/repositories/admin-users", () => ({ listAdminUserDirectoryCached, ownerLookupKeys }))
  vi.doMock("@/lib/auth/audit", () => ({ logAudit }))

  const mod = await import("@/lib/server/lead-contact-compass-sync")
  return {
    ...mod,
    getLeadsForCompassContactSync,
    applyCompassLeadStatusSync,
    applyCompassLeadOwnerSync,
    getCompassLeadsByPhoneKeys,
    getCompassLeadsByIds,
    getCompassLinksForAdminLeads,
    getCompassActivitySignals,
    listAdminUserDirectoryCached,
    logAudit,
  }
}

const BASE: Fixture = {
  leads: [
    { id: "a", phone: "010-2041-7731", status: "new" },
    { id: "b", phone: "010-2052-7732", status: "new" },
    { id: "c", phone: "+82 10-2063-7733", status: "new" },
    { id: "d", phone: "010-2074-7734", status: "new" },
    { id: "e", phone: "010-2085-7735", status: "contacted" },
    { id: "f", phone: "010-2096-7736", status: "new" },
  ],
  compassRows: [
    row(1, "01020417731", "demo"),
    row(2, "01020527732", "lost"),
    row(3, "01020637733", "new"),
    row(4, "01020747734", "new"),
    row(5, "01020857735", "lost"),
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
      linked: 0,
      toContacted: 2,
      toClosed: 2,
      toAssigned: 0,
      applied: { contacted: 2, closed: 1, assigned: 0 },
      owner: { conflicts: 0, unmapped: 0 },
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

    expect(report).toMatchObject({ status: "ok", dryRun: true, toContacted: 2, toClosed: 2, applied: { contacted: 0, closed: 0, assigned: 0 } })
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
    expect(sync.applyCompassLeadOwnerSync).not.toHaveBeenCalled()
    expect(sync.logAudit).not.toHaveBeenCalled()
  })

  it("Compass 리드 조회가 끊기면 이번 실행 전체를 건너뛴다 — 빈 결과를 '매칭 없음'으로 보지 않는다", async () => {
    const sync = await loadSync({ ...BASE, leadsDown: true })

    const report = await sync.syncLeadContactFromCompass()

    expect(report).toMatchObject({ status: "bridge_down", error: "bridge view missing", applied: { contacted: 0, closed: 0, assigned: 0 } })
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
  })

  it("링크(home_lead) 조회가 끊기면 전체를 건너뛴다 — 전화 키만으로 판정하면 링크로만 붙는 리드가 빠진다", async () => {
    const sync = await loadSync({ ...BASE, linksDown: true })

    const report = await sync.syncLeadContactFromCompass()

    expect(report).toMatchObject({ status: "bridge_down", error: "refs view missing" })
    expect(sync.getCompassLeadsByPhoneKeys).not.toHaveBeenCalled()
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
  })

  it("Compass 리드 조회가 행 상한(1000)에 닿으면 잘렸을 수 있어 전체를 건너뛴다 — 대표 행이 바뀌어 잘못 종료되지 않게", async () => {
    const sync = await loadSync({
      ...BASE,
      readRowsOverride: () => Array.from({ length: 1000 }, (_, index) => row(index + 1, "01020417731", "lost")),
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

    expect(report.applied).toEqual({ contacted: 0, closed: 0, assigned: 0 })
    expect(sync.logAudit).not.toHaveBeenCalled()
  })

  it("반영 대상 리드가 없으면 Compass 를 조회하지 않는다", async () => {
    const sync = await loadSync({ ...BASE, leads: [] })

    const report = await sync.syncLeadContactFromCompass()

    expect(report).toMatchObject({ status: "ok", scanned: 0, matched: 0 })
    expect(sync.getCompassLeadsByPhoneKeys).not.toHaveBeenCalled()
    expect(sync.getCompassLinksForAdminLeads).not.toHaveBeenCalled()
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

    expect(report).toMatchObject({ status: "failed", error: "update denied", applied: { contacted: 1, closed: 0, assigned: 0 } })
    expect(sync.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ contacted: ["a"], stamped: ["a"], error: "update denied" }),
      })
    )
  })

  it("쓰기 마감이 이미 지났으면 쓰기를 시작하지 않는다", async () => {
    const sync = await loadSync(BASE)

    const report = await sync.syncLeadContactFromCompass({ writeDeadlineAt: Date.now() - 1 })

    expect(report).toMatchObject({ status: "timeout", toContacted: 2, applied: { contacted: 0, closed: 0, assigned: 0 } })
    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
  })

  it("쓰기 도중 마감으로 멈추면 timeout 으로 알리고 바뀐 행은 감사 기록에 남긴다", async () => {
    const sync = await loadSync({ ...BASE, applyResult: { contacted: ["a"], stamped: ["a"], stoppedEarly: true } })

    const report = await sync.syncLeadContactFromCompass({ writeDeadlineAt: Date.now() + 60_000 })

    const [, options] = sync.applyCompassLeadStatusSync.mock.calls[0]
    expect(options.shouldContinue?.()).toBe(true)
    expect(report).toMatchObject({ status: "timeout", applied: { contacted: 1, closed: 0, assigned: 0 } })
    expect(sync.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ contacted: ["a"], stoppedEarly: true }) })
    )
  })
})

/* 링크 우선 매칭 + 담당 반영(2026-11-04, Compass ADR-0081 되받기). Compass 가 홈페이지 폼 리드를 받으며 거는 lead_refs(home_lead) 링크로
   전화 없는 리드도 붙고, Compass 담당(콜 담당 → BD 담당 → 오너)은 어드민 담당이 비어 있을 때만 채운다. */
describe("syncLeadContactFromCompass · 링크 우선 매칭과 담당 반영", () => {
  const LINKED: Fixture = {
    leads: [
      { id: "g", phone: null, status: "new" }, // 전화 없음 — 링크로만 붙는다
      { id: "h", phone: "010-2041-7731", status: "new" }, // 전화도 있고 링크도 있다(다른 Compass 행) — 합집합
      { id: "i", phone: "010-2052-7732", status: "contacted", assigned_to: "kim.cs" }, // 어드민 담당이 이미 있다
      { id: "j", phone: "010-2063-7733", status: "new" },
    ],
    compassRows: [
      row(1, "01020417731", "new"),
      { ...row(2, "01020527732", "demo"), caller: "진소망" },
      { ...row(3, "01020637733", "demo"), caller: "모르는사람" },
    ],
    rowsById: [
      { id: 9, phone_key: null, stage: "demo", created_at: "2026-09-01T00:00:00.000Z", caller: "진소망" },
      { id: 11, phone_key: "01099990000", stage: "contact", created_at: "2026-09-02T00:00:00.000Z", bd_owner: "황찬우" },
      row(1, "01020417731", "new"),
      { ...row(2, "01020527732", "demo"), caller: "진소망" },
      { ...row(3, "01020637733", "demo"), caller: "모르는사람" },
    ],
    links: { g: [9], h: [11] },
    activities: [],
  }

  it("전화 없는 리드가 링크로 붙어 연락함이 되고, 비어 있던 담당에 Compass 콜 담당이 ownerKey 로 채워진다", async () => {
    const sync = await loadSync({ ...LINKED, applyResult: { contacted: ["g", "h", "j"], stamped: ["g", "h", "j"] } })

    const report = await sync.syncLeadContactFromCompass()

    expect(sync.getCompassLeadsByIds).toHaveBeenCalledWith([9, 11])
    expect(report).toMatchObject({
      status: "ok",
      scanned: 4,
      matched: 4,
      linked: 2,
      toContacted: 3, // g(링크 데모) · h(링크 컨택) · j(전화 데모). i 는 이미 연락함
      toAssigned: 2, // g → 진소망 · h → 황찬우(BD 담당). i 는 담당이 이미 있어 conflicts, j 는 명단에 없어 unmapped
      applied: { contacted: 3, closed: 0, assigned: 2 },
      owner: { conflicts: 1, unmapped: 1 },
    })
    expect(sync.applyCompassLeadOwnerSync).toHaveBeenCalledTimes(1)
    const [assignments] = sync.applyCompassLeadOwnerSync.mock.calls[0]
    expect(assignments).toEqual([
      { id: "g", to: "jin.somang", owner: "진소망" },
      { id: "h", to: "hwang.chanwoo", owner: "황찬우" },
    ])
    expect(sync.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          assigned: [
            { id: "g", to: "jin.somang" },
            { id: "h", to: "hwang.chanwoo" },
          ],
        }),
      })
    )
  })

  it("상태 변경은 없고 담당만 채울 때도 쓰고 기록한다", async () => {
    const sync = await loadSync({
      ...LINKED,
      leads: [{ id: "g", phone: null, status: "contacted" }],
      links: { g: [9] },
    })

    const report = await sync.syncLeadContactFromCompass()

    expect(sync.applyCompassLeadStatusSync).not.toHaveBeenCalled()
    expect(sync.applyCompassLeadOwnerSync).toHaveBeenCalledWith([{ id: "g", to: "jin.somang", owner: "진소망" }], expect.anything())
    expect(report).toMatchObject({ status: "ok", toContacted: 0, toAssigned: 1, applied: { contacted: 0, closed: 0, assigned: 1 } })
    expect(sync.logAudit).toHaveBeenCalledTimes(1)
  })

  it("담당자 명단이 건강하지 않으면 담당 반영만 건너뛰고(skipped) 상태는 그대로 반영한다", async () => {
    const sync = await loadSync({
      ...LINKED,
      directory: { health: { ok: false, message: "명단 원천 불일치" }, crmOwners: [] },
    })

    const report = await sync.syncLeadContactFromCompass()

    expect(report).toMatchObject({ status: "ok", toContacted: 3, toAssigned: 0, owner: { conflicts: 0, unmapped: 0, skipped: "명단 원천 불일치" } })
    expect(sync.applyCompassLeadStatusSync).toHaveBeenCalledTimes(1)
    expect(sync.applyCompassLeadOwnerSync).not.toHaveBeenCalled()
  })

  it("담당 쓰기 실패는 failed 로 알리되 상태 쓰기 결과와 채운 담당은 감사 기록에 남긴다", async () => {
    const sync = await loadSync({
      ...LINKED,
      applyResult: { contacted: ["g", "h", "j"], stamped: ["g"] },
      ownerApplyError: { message: "owner update denied", partial: [{ id: "g", to: "jin.somang" }] },
    })

    const report = await sync.syncLeadContactFromCompass()

    expect(report).toMatchObject({ status: "failed", error: "owner update denied", applied: { contacted: 3, closed: 0, assigned: 1 } })
    expect(sync.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ contacted: ["g", "h", "j"], assigned: [{ id: "g", to: "jin.somang" }], error: "owner update denied" }),
      })
    )
  })

  it("상태 쓰기가 마감으로 멈췼으면 담당 쓰기는 시작하지 않는다", async () => {
    const sync = await loadSync({ ...LINKED, applyResult: { contacted: ["g"], stoppedEarly: true } })

    const report = await sync.syncLeadContactFromCompass()

    expect(report.status).toBe("timeout")
    expect(sync.applyCompassLeadOwnerSync).not.toHaveBeenCalled()
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
