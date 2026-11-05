import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProcessAlertMovementRow } from "@/lib/hardware/process-alerts"

const NOW = new Date("2026-10-28T00:00:00.000Z")

function staleRow(id: string, overrides: Partial<ProcessAlertMovementRow> = {}): ProcessAlertMovementRow {
  return {
    id,
    product_name: '86" IFP',
    movement_type: "outbound",
    quantity: 1,
    occurred_at: "2026-08-01",
    created_at: "2026-07-20T00:00:00.000Z",
    to_location: "한빛학원",
    owner: "김담당",
    status: "배송 예정",
    memo: null,
    voided_at: null,
    ...overrides,
  }
}

// ── 원장 읽기(키셋·칸 없음 폴백) ──────────────────────────────────────────────────

type QueryResult = { data: unknown[] | null; error: { code?: string; message?: string } | null }

function fakeSupabase(handler: (state: { table: string; columns: string; afterId: string | null; filters: unknown[] }) => QueryResult) {
  const calls: Array<{ table: string; columns: string; afterId: string | null; filters: unknown[] }> = []
  const client = {
    from(table: string) {
      const state = { table, columns: "", afterId: null as string | null, filters: [] as unknown[] }
      const builder = {
        select(columns: string) {
          state.columns = columns
          return builder
        },
        in(column: string, values: unknown[]) {
          state.filters.push(["in", column, values])
          return builder
        },
        is(column: string, value: unknown) {
          state.filters.push(["is", column, value])
          return builder
        },
        eq(column: string, value: unknown) {
          state.filters.push(["eq", column, value])
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        gt(_column: string, value: string) {
          state.afterId = value
          return builder
        },
        then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
          calls.push({ ...state, filters: [...state.filters] })
          return Promise.resolve(handler(state)).then(resolve, reject)
        },
      }
      return builder
    },
  }
  return { client, calls }
}

describe("알림 원장 읽기", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  async function loadRepository(handler: Parameters<typeof fakeSupabase>[0]) {
    vi.resetModules()
    const fake = fakeSupabase(handler)
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fake.client }))
    const repository = await import("@/lib/repositories/hardware-process-alerts")
    return { ...repository, calls: fake.calls }
  }

  it("키셋으로 끝까지 읽는다(2,000건 상한 없음) — 취소 안 된 출고·회수만", async () => {
    const pageSize = 1000
    const all = Array.from({ length: 2_500 }, (_, index) => staleRow(`id-${String(index).padStart(5, "0")}`))
    const { listProcessAlertLedger, calls } = await loadRepository((state) => {
      const start = state.afterId ? all.findIndex((row) => row.id === state.afterId) + 1 : 0
      return { data: all.slice(start, start + pageSize), error: null }
    })

    const ledger = await listProcessAlertLedger()

    expect(ledger.processColumns).toBe(true)
    expect(ledger.rows).toHaveLength(2_500)
    expect(calls.length).toBeGreaterThanOrEqual(3)
    expect(calls[0].columns).toContain("expected_return_at")
    expect(calls[0].filters).toContainEqual(["in", "movement_type", ["outbound", "return"]])
    expect(calls[0].filters).toContainEqual(["is", "voided_at", null])
  })

  it("프로세스 칸이 없으면(42703) 기본 칸으로 다시 읽고 processColumns=false", async () => {
    const { listProcessAlertLedger, calls } = await loadRepository((state) =>
      state.columns.includes("expected_return_at")
        ? { data: null, error: { code: "42703", message: "column hardware_movements.expected_return_at does not exist" } }
        : { data: [staleRow("a")], error: null }
    )

    const ledger = await listProcessAlertLedger()

    expect(ledger.processColumns).toBe(false)
    expect(ledger.rows).toHaveLength(1)
    expect(calls.at(-1)?.columns).not.toContain("owner_user_id")
  })

  it("다른 오류는 그대로 던진다", async () => {
    const { listProcessAlertLedger } = await loadRepository(() => ({ data: null, error: { code: "57014", message: "timeout" } }))
    await expect(listProcessAlertLedger()).rejects.toMatchObject({ code: "57014" })
  })

  it("같은 날 발송 성공 기록이 있어야 already sent — 이벤트만 있고 발송 실패면 아니다", async () => {
    let sentRows: unknown[] = []
    const { hasProcessAlertBeenSent, calls } = await loadRepository((state) => {
      if (state.table === "notification_events") return { data: [{ id: "ev-1" }], error: null }
      return { data: sentRows, error: null }
    })
    const key = { eventType: "hardware.process.daily_alert", source: "hardware_process_alerts", sourceId: "2026-10-28" }

    expect(await hasProcessAlertBeenSent(key)).toBe(false)
    sentRows = [{ id: "log-1" }]
    expect(await hasProcessAlertBeenSent(key)).toBe(true)
    expect(calls[0].filters).toContainEqual(["eq", "source_id", "2026-10-28"])
    expect(calls[1].filters).toContainEqual(["eq", "status", "sent"])
  })
})

// ── 실행(발송·dryRun·중복 방지) ─────────────────────────────────────────────────

describe("하드웨어 일일 알림 실행", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  async function loadRunner(options: {
    rows?: ProcessAlertMovementRow[]
    processColumns?: boolean
    alreadySent?: boolean | Error
    deliveryResults?: Array<{ channel: string; status: string; errorMessage?: string }>
    enabled?: boolean
  } = {}) {
    vi.resetModules()
    // 기본은 꺼짐(2026-11-05 결정) — 발송 경로 시험은 켜고 돈다.
    vi.stubEnv("HARDWARE_PROCESS_ALERTS", options.enabled === false ? "" : "on")
    const emitNotificationEvent = vi.fn().mockResolvedValue({
      id: "event-1",
      deliveryResults: options.deliveryResults ?? [{ channel: "wecom_webhook", status: "sent" }],
    })
    const hasProcessAlertBeenSent = vi.fn(async () => {
      if (options.alreadySent instanceof Error) throw options.alreadySent
      return options.alreadySent === true
    })
    vi.doMock("@/lib/notifications/emit-event", () => ({
      emitNotificationEvent,
      WEBHOOK_DISABLED_REASON: "관리자가 끈 채널입니다.",
    }))
    vi.doMock("@/lib/repositories/hardware-process-alerts", () => ({
      listProcessAlertLedger: vi.fn().mockResolvedValue({
        rows: options.rows ?? [staleRow("a"), staleRow("b", { owner: "박담당" })],
        processColumns: options.processColumns ?? true,
      }),
      hasProcessAlertBeenSent,
    }))
    const { runHardwareProcessAlerts } = await import("@/lib/server/hardware-process-alerts")
    return { runHardwareProcessAlerts, emitNotificationEvent, hasProcessAlertBeenSent }
  }

  it("하루 한 통을 운영 WeCom 방으로 보낸다 — 날짜 키·발송 성공 필수", async () => {
    const { runHardwareProcessAlerts, emitNotificationEvent } = await loadRunner()

    const report = await runHardwareProcessAlerts({ now: NOW })

    expect(report).toMatchObject({ status: "sent", stalePlannedCount: 2, ownerCount: 2, eventId: "event-1" })
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(emitNotificationEvent.mock.calls[0][0]).toMatchObject({
      eventType: "hardware.process.daily_alert",
      source: "hardware_process_alerts",
      sourceId: "2026-10-28",
      channels: ["wecom_webhook"],
      routeUrl: "/admin/hardware",
    })
    expect(emitNotificationEvent.mock.calls[0][0].message).toContain("■ 김담당")
  })

  it("운영 방이 설정에서 꺼져 있으면 channel_off — 실패가 아니다(매일 크론이 실패로 남던 문제)", async () => {
    const { runHardwareProcessAlerts } = await loadRunner({
      deliveryResults: [{ channel: "wecom_webhook", status: "skipped", errorMessage: "관리자가 끈 채널입니다." }],
    })

    await expect(runHardwareProcessAlerts({ now: NOW })).resolves.toMatchObject({ status: "channel_off", eventId: "event-1" })
  })

  it("HTTP 실패 같은 진짜 실패는 던진다 — 잡이 failed 로 남는다", async () => {
    const { runHardwareProcessAlerts } = await loadRunner({
      deliveryResults: [{ channel: "wecom_webhook", status: "failed", errorMessage: "HTTP 500" }],
    })

    await expect(runHardwareProcessAlerts({ now: NOW })).rejects.toThrow("wecom_webhook: HTTP 500")
  })

  it("dryRun 은 미리보기만 — 보내지도, 중복 확인도 하지 않는다", async () => {
    const { runHardwareProcessAlerts, emitNotificationEvent, hasProcessAlertBeenSent } = await loadRunner()

    const report = await runHardwareProcessAlerts({ now: NOW, dryRun: true })

    expect(report.status).toBe("preview")
    expect(report.preview?.title).toContain("배송 예정 30일 경과 2건")
    expect(emitNotificationEvent).not.toHaveBeenCalled()
    expect(hasProcessAlertBeenSent).not.toHaveBeenCalled()
  })

  it("알릴 건이 없으면 empty — 보내지 않는다", async () => {
    const { runHardwareProcessAlerts, emitNotificationEvent } = await loadRunner({ rows: [staleRow("a", { occurred_at: "2026-10-27" })] })

    expect((await runHardwareProcessAlerts({ now: NOW })).status).toBe("empty")
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("그날 이미 나갔으면 already_sent", async () => {
    const { runHardwareProcessAlerts, emitNotificationEvent } = await loadRunner({ alreadySent: true })

    expect((await runHardwareProcessAlerts({ now: NOW })).status).toBe("already_sent")
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("중복 확인이 실패해도 보낸다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { runHardwareProcessAlerts, emitNotificationEvent } = await loadRunner({ alreadySent: new Error("db down") })

    expect((await runHardwareProcessAlerts({ now: NOW })).status).toBe("sent")
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
  })

  it("기본은 꺼짐 — env 를 켜지 않으면 원장도 읽지 않고 disabled(운영자 결정 2026-11-05)", async () => {
    const { runHardwareProcessAlerts, emitNotificationEvent } = await loadRunner({ enabled: false })
    const report = await runHardwareProcessAlerts({ now: NOW })
    expect(report).toMatchObject({ status: "disabled", dateKey: "2026-10-28" })
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("꺼져 있어도 dryRun 미리보기는 된다", async () => {
    const { runHardwareProcessAlerts, emitNotificationEvent } = await loadRunner({ enabled: false })
    const report = await runHardwareProcessAlerts({ now: NOW, dryRun: true })
    expect(report.status).toBe("preview")
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("프로세스 칸이 없는 DB 에서도 배송 예정은 보낸다", async () => {
    const { runHardwareProcessAlerts } = await loadRunner({ processColumns: false })

    const report = await runHardwareProcessAlerts({ now: NOW })

    expect(report).toMatchObject({ status: "sent", sampleCheckAvailable: false, stalePlannedCount: 2 })
  })
})
