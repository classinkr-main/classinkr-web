import { afterEach, describe, expect, it, vi } from "vitest"

import {
  COMPASS_SHOWROOM_DEMO_MEMO,
  isConfirmingShowroomRound,
  kstToday,
  planShowroomConfirmations,
  shouldSendShowroomConfirmation,
  toKstDateTime,
  type CompassShowroomDemoRound,
  type ShowroomConfirmCandidate,
} from "@/lib/showroom/compass-confirm"

/**
 * 쇼룸 신청 → Compass 「쇼룸 데모」 컨펌·담당 지정 → 확정 → 확정 문자(2026-11-06).
 *
 * 지키는 규칙:
 *  - 확정 신호는 「쇼룸 데모」·잡힘·담당·시각이 모두 있는 회차뿐이다
 *  - 어드민 리드에 링크된 Compass 리드의 회차만 짝짓는다(전화 추측 없음)
 *  - 지난 회차·신청 전에 잡힌 회차로 확정하지 않는다
 *  - 한 회차가 두 신청을 확정하지 않는다
 *  - 크론은 스위치가 꺼져 있으면 판정만, 상한을 넘으면 아무것도 하지 않는다
 *  - 한 건의 실패가 다른 건의 확정·문자를 막거나 다시 보내게 하지 않는다
 */

const NOW = new Date("2026-11-06T03:00:00.000Z") // KST 11/6 12:00
const TODAY = "2026-11-06"

function booking(overrides: Partial<ShowroomConfirmCandidate> = {}): ShowroomConfirmCandidate {
  return {
    id: "booking-1",
    leadId: "lead-1",
    status: "requested",
    visitDate: "2026-11-12",
    visitTime: "14:00",
    createdAt: "2026-11-05T01:00:00.000Z",
    ...overrides,
  }
}

function round(overrides: Partial<CompassShowroomDemoRound> = {}): CompassShowroomDemoRound {
  return {
    id: 9001,
    lead_id: 101,
    kind: "demo",
    status: "booked",
    owner: "진소망",
    memo: COMPASS_SHOWROOM_DEMO_MEMO,
    at: "2026-11-12T05:00:00.000Z", // KST 11/12 14:00
    ...overrides,
  }
}

const LINKS = new Map<string, number[]>([["lead-1", [101]]])

describe("KST 변환", () => {
  it("timestamptz 를 KST 날짜·시각으로 읽는다", () => {
    expect(toKstDateTime("2026-11-12T05:00:00.000Z")).toEqual({ date: "2026-11-12", time: "14:00" })
    // UTC 자정 직전은 KST 다음 날 오전이다.
    expect(toKstDateTime("2026-11-11T23:30:00Z")).toEqual({ date: "2026-11-12", time: "08:30" })
    expect(toKstDateTime(null)).toBeNull()
    expect(toKstDateTime("not-a-date")).toBeNull()
  })

  it("오늘은 KST 날짜다", () => {
    expect(kstToday(NOW)).toBe(TODAY)
    expect(kstToday(new Date("2026-11-06T15:30:00.000Z"))).toBe("2026-11-07")
  })
})

describe("확정 신호(isConfirmingShowroomRound)", () => {
  it("쇼룸 데모·잡힘·담당·시각이 모두 있어야 한다", () => {
    expect(isConfirmingShowroomRound(round())).toBe(true)
    expect(isConfirmingShowroomRound(round({ memo: "방문 데모" }))).toBe(false)
    expect(isConfirmingShowroomRound(round({ memo: "쇼룸 데모 메모 덧붙임" }))).toBe(false)
    expect(isConfirmingShowroomRound(round({ status: "canceled" }))).toBe(false)
    expect(isConfirmingShowroomRound(round({ status: "done" }))).toBe(false)
    expect(isConfirmingShowroomRound(round({ owner: null }))).toBe(false)
    expect(isConfirmingShowroomRound(round({ owner: "  " }))).toBe(false)
    expect(isConfirmingShowroomRound(round({ at: null }))).toBe(false)
    expect(isConfirmingShowroomRound(round({ kind: "meeting" }))).toBe(false)
  })

  it("방식 라벨 앞뒤 공백은 Compass 처럼 무시한다", () => {
    expect(isConfirmingShowroomRound(round({ memo: ` ${COMPASS_SHOWROOM_DEMO_MEMO} ` }))).toBe(true)
  })
})

describe("planShowroomConfirmations", () => {
  it("링크된 Compass 리드의 쇼룸 데모 회차로 확정한다 — 담당·확정 시각을 회차에서 가져온다", () => {
    const plans = planShowroomConfirmations({ bookings: [booking()], links: LINKS, rounds: [round()], today: TODAY })
    expect(plans).toEqual([
      {
        bookingId: "booking-1",
        compassDemoId: 9001,
        compassLeadId: 101,
        visitDate: "2026-11-12",
        visitTime: "14:00",
        assignedTo: "진소망",
        moved: false,
      },
    ])
  })

  it("확정 시각이 신청과 다르면 moved 로 표시한다", () => {
    const [plan] = planShowroomConfirmations({
      bookings: [booking()],
      links: LINKS,
      rounds: [round({ at: "2026-11-13T06:00:00.000Z" })],
      today: TODAY,
    })
    expect(plan).toMatchObject({ visitDate: "2026-11-13", visitTime: "15:00", moved: true })
  })

  it("링크가 없으면 짝짓지 않는다(전화 추측 매칭 없음)", () => {
    expect(
      planShowroomConfirmations({ bookings: [booking()], links: new Map(), rounds: [round()], today: TODAY })
    ).toEqual([])
  })

  it("requested 가 아니거나 리드가 없는 신청은 보지 않는다", () => {
    expect(
      planShowroomConfirmations({
        bookings: [booking({ status: "confirmed" }), booking({ id: "b2", leadId: null })],
        links: LINKS,
        rounds: [round()],
        today: TODAY,
      })
    ).toEqual([])
  })

  it("지난 회차나 신청 전에 잡힌 회차로 확정하지 않는다", () => {
    const past = round({ id: 1, at: "2026-11-05T05:00:00.000Z" })
    const beforeSubmit = round({ id: 2, at: "2026-11-04T05:00:00.000Z" })
    expect(
      planShowroomConfirmations({ bookings: [booking()], links: LINKS, rounds: [past, beforeSubmit], today: TODAY })
    ).toEqual([])
  })

  it("후보가 여럿이면 신청 일시에 가장 가까운 회차", () => {
    const far = round({ id: 1, at: "2026-11-20T05:00:00.000Z" })
    const near = round({ id: 2, at: "2026-11-12T06:00:00.000Z" })
    const [plan] = planShowroomConfirmations({ bookings: [booking()], links: LINKS, rounds: [far, near], today: TODAY })
    expect(plan.compassDemoId).toBe(2)
  })

  it("한 회차는 한 신청만 확정한다 — 먼저 들어온 신청이 가져간다", () => {
    const first = booking({ id: "first", createdAt: "2026-11-05T01:00:00.000Z" })
    const second = booking({ id: "second", createdAt: "2026-11-05T02:00:00.000Z" })
    const plans = planShowroomConfirmations({ bookings: [second, first], links: LINKS, rounds: [round()], today: TODAY })
    expect(plans.map((p) => p.bookingId)).toEqual(["first"])
  })

  it("이미 다른 예약을 확정한 회차는 다시 쓰지 않는다", () => {
    expect(
      planShowroomConfirmations({
        bookings: [booking()],
        links: LINKS,
        rounds: [round()],
        usedDemoIds: new Set([9001]),
        today: TODAY,
      })
    ).toEqual([])
  })
})

describe("확정 문자 대상(shouldSendShowroomConfirmation)", () => {
  it("방문일이 오늘 이후일 때만", () => {
    expect(shouldSendShowroomConfirmation("2026-11-06", TODAY)).toBe(true)
    expect(shouldSendShowroomConfirmation("2026-11-12", TODAY)).toBe(true)
    expect(shouldSendShowroomConfirmation("2026-11-05", TODAY)).toBe(false)
    expect(shouldSendShowroomConfirmation("", TODAY)).toBe(false)
  })
})

/** 발송 레이어(SDK)는 불러오지 않는다 — 본문 조립만 본다. */
async function loadReceipt() {
  vi.resetModules()
  vi.doMock("@/lib/messaging/send", () => ({ sendSmsMessages: vi.fn(), sendKakaoAlimtalk: vi.fn() }))
  return import("@/lib/messaging/customer-receipt")
}

describe("확정 문자 본문", () => {
  it("확정·일시·담당·장소(호수)·변경 연락처를 담는다", async () => {
    const { buildShowroomConfirmationText } = await loadReceipt()
    const text = buildShowroomConfirmationText({ visitDate: "2026-11-12", visitTime: "15:00", assignedTo: "진소망" })
    expect(text).toContain("확정되었습니다")
    expect(text).toContain("11/12(목) 15:00")
    expect(text).toContain("담당: 진소망")
    expect(text).toContain("806호")
    expect(text).toContain("02-6958-8566")
  })

  it("담당이 없으면 담당 줄을 뺀다", async () => {
    const { buildShowroomConfirmationText } = await loadReceipt()
    const text = buildShowroomConfirmationText({ visitDate: "2026-11-12", visitTime: "15:00", assignedTo: null })
    expect(text).not.toContain("담당:")
  })
})

/* ─── 저장소: 조건부 확정 · 문자 선점 ─── */

type Row = Record<string, unknown>

function fakeSupabase(rows: Row[]) {
  const updates: Row[] = []
  function builder(mode: "select" | "update", patch?: Row) {
    let matched = [...rows]
    const chain = {
      eq(column: string, value: unknown) {
        matched = matched.filter((item) => item[column] === value)
        return chain
      },
      is(column: string, value: unknown) {
        matched = matched.filter((item) => (item[column] ?? null) === value)
        return chain
      },
      select() {
        return chain
      },
      async maybeSingle() {
        const target = matched[0]
        if (!target) return { data: null, error: null }
        if (mode === "update" && patch) Object.assign(target, patch)
        return { data: target, error: null }
      },
    }
    return chain
  }
  return {
    updates,
    client: {
      from: () => ({
        select: () => builder("select"),
        update: (patch: Row) => {
          updates.push(patch)
          return builder("update", patch)
        },
      }),
    },
  }
}

function bookingRow(overrides: Row = {}): Row {
  return {
    id: "booking-1",
    visit_date: "2026-11-12",
    visit_time: "14:00",
    duration_minutes: 60,
    org: "무궁화 학원",
    name: "홍길동",
    phone: "010-1234-5678",
    email: null,
    role: null,
    visitor_count: 1,
    academy_size: null,
    interests: [],
    memo: null,
    status: "requested",
    assigned_to: null,
    confirmed_at: null,
    google_calendar_event_id: null,
    lead_id: "lead-1",
    source_page: "/showroom",
    created_at: "2026-11-05T01:00:00.000Z",
    updated_at: "2026-11-05T01:00:00.000Z",
    requested_visit_date: null,
    requested_visit_time: null,
    compass_demo_id: null,
    confirmation_sent_at: null,
    ...overrides,
  }
}

async function loadRepository(rows: Row[]) {
  vi.resetModules()
  const fake = fakeSupabase(rows)
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fake.client }))
  const mod = await import("@/lib/repositories/showroom-bookings")
  return { mod, fake }
}

describe("confirmShowroomBookingFromCompass", () => {
  it("requested 를 confirmed 로 올리고 담당·회차를 남긴다. 시각이 바뀌면 처음 신청 일시를 보존한다", async () => {
    const rows = [bookingRow()]
    const { mod } = await loadRepository(rows)
    const current = (await mod.getShowroomBooking("booking-1"))!
    const confirmed = await mod.confirmShowroomBookingFromCompass(current, {
      compassDemoId: 9001,
      visitDate: "2026-11-13",
      visitTime: "15:00",
      assignedTo: "진소망",
    })
    expect(confirmed).toMatchObject({
      status: "confirmed",
      assignedTo: "진소망",
      compassDemoId: 9001,
      visitDate: "2026-11-13",
      visitTime: "15:00",
      requestedVisitDate: "2026-11-12",
      requestedVisitTime: "14:00",
    })
    expect(confirmed?.confirmedAt).toBeTruthy()
  })

  it("판정 뒤 사람이 상태를 바꿨으면(requested 아님) 덮지 않는다", async () => {
    const rows = [bookingRow()]
    const { mod } = await loadRepository(rows)
    const current = (await mod.getShowroomBooking("booking-1"))!
    rows[0].status = "canceled"
    const result = await mod.confirmShowroomBookingFromCompass(current, {
      compassDemoId: 9001,
      visitDate: "2026-11-12",
      visitTime: "14:00",
      assignedTo: "진소망",
    })
    expect(result).toBeNull()
    expect(rows[0].status).toBe("canceled")
  })
})

describe("claimShowroomConfirmationMessage", () => {
  it("한 번만 선점된다 — 두 번째는 false", async () => {
    const { mod } = await loadRepository([bookingRow({ status: "confirmed" })])
    expect(await mod.claimShowroomConfirmationMessage("booking-1")).toBe(true)
    expect(await mod.claimShowroomConfirmationMessage("booking-1")).toBe(false)
  })
})

/* ─── 크론 본체: 스위치 · 상한 · 부분 실패 ─── */

interface SyncDeps {
  bookings?: Row[]
  links?: Map<string, number[]>
  rounds?: CompassShowroomDemoRound[]
  linksDown?: boolean
  confirm?: (current: Row, input: Row) => Promise<Row | null>
  claim?: (id: string) => Promise<boolean>
  sendResult?: Row
}

function record(overrides: Row = {}): Row {
  return {
    id: "booking-1",
    leadId: "lead-1",
    status: "requested",
    visitDate: "2026-11-12",
    visitTime: "14:00",
    phone: "010-1234-5678",
    assignedTo: null,
    createdAt: "2026-11-05T01:00:00.000Z",
    requestedVisitDate: null,
    confirmationSentAt: null,
    ...overrides,
  }
}

async function loadSync(deps: SyncDeps = {}) {
  vi.resetModules()
  const confirm = vi.fn(
    deps.confirm ??
      (async (current: Row, input: Row) => ({
        ...current,
        status: "confirmed",
        assignedTo: input.assignedTo,
        visitDate: input.visitDate,
        visitTime: input.visitTime,
      }))
  )
  const claim = vi.fn(deps.claim ?? (async () => true))
  const send = vi.fn(async () => deps.sendResult ?? { requested: 1, sent: 1, failed: 0, simulated: 0, results: [] })
  const logAudit = vi.fn(async () => undefined)

  vi.doMock("@/lib/repositories/showroom-bookings", () => ({
    listShowroomBookingsAwaitingConfirm: vi.fn(async () => deps.bookings ?? [record()]),
    listUsedCompassDemoIds: vi.fn(async () => new Set<number>()),
    confirmShowroomBookingFromCompass: confirm,
    claimShowroomConfirmationMessage: claim,
  }))
  vi.doMock("@/lib/compass/admin-lead-links", () => ({
    getCompassLinksForAdminLeads: vi.fn(async () =>
      deps.linksDown ? { links: new Map(), down: true, error: "down" } : { links: deps.links ?? LINKS, down: false }
    ),
  }))
  vi.doMock("@/lib/compass/bridge", () => ({
    getCompassShowroomDemoRounds: vi.fn(async () => ({ rows: deps.rounds ?? [round()], down: false })),
  }))
  vi.doMock("@/lib/messaging/customer-receipt", () => ({ sendShowroomBookingConfirmation: send }))
  vi.doMock("@/lib/auth/audit", () => ({ logAudit }))

  const mod = await import("@/lib/server/showroom-compass-confirm")
  return { mod, confirm, claim, send, logAudit }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("syncShowroomConfirmationsFromCompass", () => {
  it("스위치가 꺼져 있으면 판정만 한다 — 확정·문자 0", async () => {
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "")
    const { mod, confirm, send } = await loadSync()
    const report = await mod.syncShowroomConfirmationsFromCompass({ now: NOW })
    expect(report).toMatchObject({ status: "ok", enabled: false, dryRun: true, scanned: 1, linked: 1, planned: 1, confirmed: 0 })
    expect(confirm).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it("켜져 있으면 확정하고 확정 문자를 한 번 보낸다", async () => {
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "1")
    const { mod, confirm, claim, send, logAudit } = await loadSync()
    const report = await mod.syncShowroomConfirmationsFromCompass({ now: NOW })
    expect(report).toMatchObject({ status: "ok", enabled: true, dryRun: false, planned: 1, confirmed: 1 })
    expect(report.messages).toEqual({ sent: 1, simulated: 0, failed: 0, skipped: 0 })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(claim).toHaveBeenCalledWith("booking-1")
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "booking-1", visitDate: "2026-11-12", visitTime: "14:00", assignedTo: "진소망" })
    )
    expect(logAudit).toHaveBeenCalledTimes(1)
  })

  it("?dryRun=true 는 스위치가 켜져 있어도 쓰지 않는다", async () => {
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "true")
    const { mod, confirm } = await loadSync()
    const report = await mod.syncShowroomConfirmationsFromCompass({ now: NOW, dryRun: true })
    expect(report).toMatchObject({ enabled: true, dryRun: true, planned: 1, confirmed: 0 })
    expect(confirm).not.toHaveBeenCalled()
  })

  it("상한을 넘으면 한 건도 확정·발송하지 않고 over_cap", async () => {
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "1")
    const { SHOWROOM_CONFIRM_MAX_PER_RUN } = await import("@/lib/server/showroom-compass-confirm")
    const count = SHOWROOM_CONFIRM_MAX_PER_RUN + 1
    const bookings = Array.from({ length: count }, (_, i) => record({ id: `b${i}`, leadId: `lead-${i}` }))
    const links = new Map(bookings.map((b, i) => [b.leadId as string, [1000 + i]]))
    const rounds = bookings.map((_, i) => round({ id: 5000 + i, lead_id: 1000 + i }))
    const { mod, confirm, send } = await loadSync({ bookings, links, rounds })
    const report = await mod.syncShowroomConfirmationsFromCompass({ now: NOW })
    expect(report.status).toBe("over_cap")
    expect(report.planned).toBe(count)
    expect(confirm).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it("Compass 링크 조회가 끊기면 이번 실행 전체를 건너뛴다", async () => {
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "1")
    const { mod, confirm } = await loadSync({ linksDown: true })
    const report = await mod.syncShowroomConfirmationsFromCompass({ now: NOW })
    expect(report.status).toBe("bridge_down")
    expect(confirm).not.toHaveBeenCalled()
  })

  it("한 건의 확정 실패가 다른 건의 확정·문자를 막지 않는다", async () => {
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "1")
    const bookings = [
      record({ id: "ok-1", leadId: "lead-a", createdAt: "2026-11-05T01:00:00.000Z" }),
      record({ id: "boom", leadId: "lead-b", createdAt: "2026-11-05T02:00:00.000Z" }),
    ]
    const links = new Map([
      ["lead-a", [1]],
      ["lead-b", [2]],
    ])
    const rounds = [round({ id: 11, lead_id: 1 }), round({ id: 22, lead_id: 2 })]
    const { mod, send } = await loadSync({
      bookings,
      links,
      rounds,
      confirm: async (current, input) => {
        if (current.id === "boom") throw new Error("duplicate key value violates unique constraint")
        return { ...current, status: "confirmed", assignedTo: input.assignedTo }
      },
    })
    const report = await mod.syncShowroomConfirmationsFromCompass({ now: NOW })
    expect(report.status).toBe("failed")
    expect(report.confirmed).toBe(1)
    expect(report.confirmedIds).toEqual(["ok-1"])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("이미 선점된(보낸) 예약은 다시 보내지 않는다", async () => {
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "1")
    const { mod, send } = await loadSync({ claim: async () => false })
    const report = await mod.syncShowroomConfirmationsFromCompass({ now: NOW })
    expect(report.messages.skipped).toBe(1)
    expect(send).not.toHaveBeenCalled()
  })

  it("발송 실패는 failed 로 센다(확정은 그대로)", async () => {
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "1")
    const { mod } = await loadSync({ sendResult: { requested: 1, sent: 0, failed: 1, simulated: 0, results: [] } })
    const report = await mod.syncShowroomConfirmationsFromCompass({ now: NOW })
    expect(report.confirmed).toBe(1)
    expect(report.messages.failed).toBe(1)
  })
})

describe("sendShowroomConfirmationOnce(어드민 확정 경로)", () => {
  it("지난 방문이면 선점하지 않고 건너뛴다", async () => {
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "1")
    const { mod, claim, send } = await loadSync()
    const outcome = await mod.sendShowroomConfirmationOnce(
      { id: "b", phone: "010", visitDate: "2026-11-01", visitTime: "10:00", assignedTo: null, status: "confirmed" },
      NOW
    )
    expect(outcome).toBe("skipped")
    expect(claim).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it("스위치가 꺼져 있으면 보내지 않는다", async () => {
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "0")
    const { mod, send } = await loadSync()
    const outcome = await mod.sendShowroomConfirmationOnce(
      { id: "b", phone: "010", visitDate: "2026-11-12", visitTime: "10:00", assignedTo: null, status: "confirmed" },
      NOW
    )
    expect(outcome).toBe("skipped")
    expect(send).not.toHaveBeenCalled()
  })
})
