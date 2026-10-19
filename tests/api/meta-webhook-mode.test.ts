import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createFakeCutoverSupabase,
  cutoverRow,
  type FakeCutoverSupabaseOptions,
} from "../meta/fixtures/fake-cutover-supabase"
import recording from "./fixtures/meta-webhook-route-recording.json"
import {
  normalizeTranscript,
  ROUTE_RECORDING_SCENARIOS,
  runRouteScenario,
  type RouteRecordingScenario,
  type RouteTranscript,
} from "./fixtures/meta-webhook-route-harness"

// Meta 리드애즈 웹훅 모드 분기(설계 META-RECEIVER-FINAL §2-1, §4-2 H5).
//
// - admin: 녹화본(tests/api/fixtures/meta-webhook-route-recording.json, 분기 전 라우트)과 한 글자도
//   같다 — DB admin 행, 모드 읽기 실패(오류·예외·Supabase env 없음·모르는 값), env 비상 스위치 포함.
// - shadow: 증인 RPC(실패 무시) + 녹화본과 같은 저장.
// - compass: 증인 성공 → Graph·저장 0회 + after() 미러 등록 → 200. 증인 실패 → 인라인 저장,
//   인라인이 하나라도 실패하면 500.
// - 서명 403·JSON 400·object≠page·leadgen 없음은 모드와 무관하고 DB 를 읽지 않는다.

const hoisted = vi.hoisted(() => ({
  submitLeadCapture: vi.fn(),
  runMetaLeadMirror: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  admin: { client: null as unknown, throwOnCreate: null as Error | null },
}))

vi.mock("@/lib/server/lead-capture", () => ({ submitLeadCapture: hoisted.submitLeadCapture }))

vi.mock("@/lib/server/meta-lead-mirror", () => ({ runMetaLeadMirror: hoisted.runMetaLeadMirror }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    if (hoisted.admin.throwOnCreate) throw hoisted.admin.throwOnCreate
    return hoisted.admin.client
  }),
}))

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return {
    ...actual,
    after: vi.fn((callback: () => unknown) => {
      hoisted.afterCallbacks.push(callback)
    }),
  }
})

import { after } from "next/server"

import * as route from "@/app/api/meta/webhook/route"
import { __resetMetaLeadgenCutoverCacheForTests } from "@/lib/meta/leadgen-cutover"

const recorded = recording as Record<string, RouteTranscript>
const MIRROR_SINCE = "2026-09-15T00:00:00.000Z"

function scenarioById(id: string): RouteRecordingScenario {
  const scenario = ROUTE_RECORDING_SCENARIOS.find((item) => item.id === id)
  if (!scenario) throw new Error(`unknown scenario ${id}`)
  return scenario
}

/** 시나리오 요청이 leadgen 을 담고 서명·JSON·object 검사를 통과하는가 */
function reachesModeBranch(id: string) {
  const transcript = recorded[id]
  return transcript.status === 200 && typeof transcript.body === "object" && (transcript.body as { received?: number }).received! > 0
}

function leadgenIdsOf(scenario: RouteRecordingScenario) {
  const request = scenario.request
  if (request.method !== "POST" || typeof request.body !== "object") return []
  const body = request.body as { entry?: Array<{ changes?: Array<{ field?: string; value?: { leadgen_id?: string } }> }> }
  return (body.entry ?? []).flatMap((entry) =>
    (entry.changes ?? [])
      .filter((change) => change.field === "leadgen" && change.value?.leadgen_id)
      .map((change) => change.value!.leadgen_id!)
  )
}

type Setup = {
  name: string
  env?: Record<string, string>
  supabase?: FakeCutoverSupabaseOptions
  throwOnCreate?: Error
}

function install(setup: Setup) {
  __resetMetaLeadgenCutoverCacheForTests()
  const fake = createFakeCutoverSupabase(setup.supabase ?? {})
  hoisted.admin.client = fake.client
  hoisted.admin.throwOnCreate = setup.throwOnCreate ?? null
  return fake
}

async function run(setup: Setup, scenario: RouteRecordingScenario) {
  // 모드 env 는 하네스 env 뒤에 덮어야 하므로 시나리오 env 에 합친다
  const merged: RouteRecordingScenario = {
    ...scenario,
    env: { META_LEADGEN_FORCE_ADMIN: "", ...(scenario.env ?? {}), ...(setup.env ?? {}) },
  }
  return normalizeTranscript(await runRouteScenario(route, merged, hoisted.submitLeadCapture))
}

describe("Meta 웹훅 모드 분기", () => {
  beforeEach(() => {
    hoisted.afterCallbacks.length = 0
    vi.mocked(after).mockClear()
    hoisted.runMetaLeadMirror.mockReset()
    hoisted.runMetaLeadMirror.mockResolvedValue({ status: "not_implemented" })
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    hoisted.admin.client = null
    hoisted.admin.throwOnCreate = null
  })

  it("라우트 설정: maxDuration 30, runtime·dynamic 유지, 내보내기는 라우트 규칙 이름뿐", () => {
    expect(route.maxDuration).toBe(30)
    expect(route.runtime).toBe("nodejs")
    expect(route.dynamic).toBe("force-dynamic")
    expect(Object.keys(route).sort()).toEqual(["GET", "POST", "dynamic", "maxDuration", "runtime"])
  })

  describe("admin 모드 = 녹화본(분기 전 라우트)과 같다", () => {
    const setups: Array<Setup & { readsDb: boolean }> = [
      { name: "DB admin 행(mirror_since 없음)", supabase: { cutover: { data: cutoverRow(), error: null } }, readsDb: true },
      {
        name: "DB admin 행 + mirror_since(롤백 뒤) + 원장에 소유 없음",
        supabase: { cutover: { data: cutoverRow({ mirror_since: MIRROR_SINCE }), error: null }, ledger: { data: [], error: null } },
        readsDb: true,
      },
      {
        name: "DB admin 행 + mirror_since + 원장 조회 실패",
        supabase: {
          cutover: { data: cutoverRow({ mirror_since: MIRROR_SINCE }), error: null },
          ledger: { data: null, error: { message: "permission denied", code: "42501" } },
        },
        readsDb: true,
      },
      {
        name: "모드 읽기 실패 — 표 없음(마이그레이션 미적용 42P01)",
        supabase: { cutover: { data: null, error: { message: "relation does not exist", code: "42P01" } } },
        readsDb: true,
      },
      { name: "모드 읽기 실패 — 네트워크 예외", supabase: { cutover: new Error("fetch failed") }, readsDb: true },
      { name: "모드 읽기 실패 — 행 없음", supabase: { cutover: { data: null, error: null } }, readsDb: true },
      { name: "모드 읽기 실패 — 모르는 모드 값", supabase: { cutover: { data: cutoverRow({ mode: "mirror" }), error: null } }, readsDb: true },
      {
        name: "모드 읽기 실패 — Supabase env 없음(클라이언트 생성 throw)",
        throwOnCreate: new Error("Missing Supabase server env. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."),
        readsDb: false,
      },
      {
        name: "env META_LEADGEN_FORCE_ADMIN=1 + DB 는 compass",
        env: { META_LEADGEN_FORCE_ADMIN: "1" },
        supabase: { cutover: { data: cutoverRow({ mode: "compass", mirror_since: MIRROR_SINCE }), error: null } },
        readsDb: false,
      },
      {
        name: "env META_LEADGEN_FORCE_ADMIN=1 + DB 는 shadow",
        env: { META_LEADGEN_FORCE_ADMIN: "1" },
        supabase: { cutover: { data: cutoverRow({ mode: "shadow" }), error: null } },
        readsDb: false,
      },
    ]

    for (const setup of setups) {
      describe(setup.name, () => {
        for (const scenario of ROUTE_RECORDING_SCENARIOS) {
          it(scenario.id, async () => {
            const fake = install(setup)
            const transcript = await run(setup, scenario)

            expect(transcript).toStrictEqual(recorded[scenario.id])
            expect(JSON.stringify(transcript)).toBe(JSON.stringify(recorded[scenario.id]))
            expect(fake.client.rpc).not.toHaveBeenCalled()
            expect(after).not.toHaveBeenCalled()
            expect(hoisted.runMetaLeadMirror).not.toHaveBeenCalled()

            const tables = fake.calls.map((call) => (call.kind === "from" ? call.table : call.name))
            if (!setup.readsDb || !reachesModeBranch(scenario.id)) {
              expect(tables).toEqual([])
            } else {
              expect(tables[0]).toBe("meta_leadgen_cutover")
              expect(tables.filter((table) => table === "meta_leadgen_cutover")).toHaveLength(1)
            }
          })
        }
      })
    }

    it("mirror_since 가 없으면 원장을 읽지 않는다", async () => {
      const setup: Setup = { name: "admin", supabase: { cutover: { data: cutoverRow(), error: null } } }
      const fake = install(setup)
      await run(setup, scenarioById("two-leads-one-capture-400"))
      expect(fake.calls.map((call) => (call.kind === "from" ? call.table : call.name))).toEqual(["meta_leadgen_cutover"])
    })
  })

  describe("admin·shadow + mirror_since: 원장 소유 leadgen 은 건너뛴다(롤백 경합 차단)", () => {
    for (const mode of ["admin", "shadow"] as const) {
      it(`${mode}: 소유 1건은 Graph·저장 없이 건너뛰고 나머지는 지금 경로`, async () => {
        const setup: Setup = {
          name: mode,
          supabase: {
            cutover: { data: cutoverRow({ mode, mirror_since: MIRROR_SINCE }), error: null },
            ledger: (ids) => ({ data: ids.filter((id) => id === "9100000000000061").map((leadgen_id) => ({ leadgen_id })), error: null }),
          },
        }
        const fake = install(setup)
        const scenario = scenarioById("mixed-changes-and-entries")
        const transcript = await run(setup, scenario)
        const expected = recorded[scenario.id]

        expect(transcript.status).toBe(200)
        expect(transcript.body).toEqual({ ok: true, received: 2, processed: 1, failed: 0, skipped: 1 })
        expect(transcript.events).toEqual(["graph:9100000000000062", "capture:9100000000000062"])
        expect(transcript.capturePayloads).toEqual([expected.capturePayloads[1]])
        expect(transcript.graphUrls).toEqual([expected.graphUrls[1]])

        const ledgerCall = fake.calls.find((call) => call.kind === "from" && call.table === "meta_lead_mirror_ledger")
        expect(ledgerCall).toMatchObject({
          filters: [
            ["in", "leadgen_id", ["9100000000000061", "9100000000000062"]],
            ["in", "state", ["inserted", "adopted", "fallback_pending"]],
          ],
        })
        expect(fake.client.rpc).toHaveBeenCalledTimes(mode === "shadow" ? 1 : 0)
      })
    }

    it("전부 소유면 저장 0회, received 유지·skipped 전부", async () => {
      const setup: Setup = {
        name: "admin",
        supabase: {
          cutover: { data: cutoverRow({ mirror_since: MIRROR_SINCE }), error: null },
          ledger: (ids) => ({ data: ids.map((leadgen_id) => ({ leadgen_id })), error: null }),
        },
      }
      install(setup)
      const transcript = await run(setup, scenarioById("duplicate-leadgen-in-one-payload"))
      expect(transcript.body).toEqual({ ok: true, received: 2, processed: 0, failed: 0, skipped: 2 })
      expect(transcript.events).toEqual([])
    })
  })

  describe("shadow 모드 = 증인 RPC + 녹화본과 같은 저장", () => {
    const setups: Setup[] = [
      { name: "증인 RPC 성공", supabase: { cutover: { data: cutoverRow({ mode: "shadow" }), error: null }, receipts: { data: 1, error: null } } },
      {
        name: "증인 RPC 오류(무시)",
        supabase: {
          cutover: { data: cutoverRow({ mode: "shadow" }), error: null },
          receipts: { data: null, error: { message: "violates check constraint", code: "23514" } },
        },
      },
      { name: "증인 RPC 예외(무시)", supabase: { cutover: { data: cutoverRow({ mode: "shadow" }), error: null }, receipts: new Error("fetch failed") } },
      {
        name: "증인 RPC 성공 + mirror_since + 원장 소유 없음",
        supabase: {
          cutover: { data: cutoverRow({ mode: "shadow", mirror_since: MIRROR_SINCE }), error: null },
          ledger: { data: [], error: null },
        },
      },
    ]

    for (const setup of setups) {
      describe(setup.name, () => {
        for (const scenario of ROUTE_RECORDING_SCENARIOS) {
          it(scenario.id, async () => {
            const fake = install(setup)
            const transcript = await run(setup, scenario)

            expect(transcript).toStrictEqual(recorded[scenario.id])
            expect(JSON.stringify(transcript)).toBe(JSON.stringify(recorded[scenario.id]))
            expect(after).not.toHaveBeenCalled()

            if (reachesModeBranch(scenario.id)) {
              expect(fake.client.rpc).toHaveBeenCalledTimes(1)
              expect(fake.client.rpc).toHaveBeenCalledWith("meta_leadgen_record_receipts", {
                p_rows: leadgenIdsOf(scenario).map((leadgenId) => expect.objectContaining({ leadgen_id: leadgenId })),
                p_mode: "shadow",
              })
            } else {
              expect(fake.client.rpc).not.toHaveBeenCalled()
              expect(fake.calls).toEqual([])
            }
          })
        }
      })
    }
  })

  describe("compass 모드 — 증인 성공", () => {
    const setup: Setup = {
      name: "compass",
      supabase: {
        cutover: { data: cutoverRow({ mode: "compass", mirror_since: MIRROR_SINCE }), error: null },
        receipts: { data: 2, error: null },
      },
    }

    for (const id of ["single-lead-ok", "two-leads-one-capture-400", "mixed-changes-and-entries", "duplicate-leadgen-in-one-payload", "graph-500-still-captures"]) {
      it(`${id}: Graph·저장 0회, after() 미러 등록, 200`, async () => {
        const fake = install(setup)
        const scenario = scenarioById(id)
        const transcript = await run(setup, scenario)
        const ids = leadgenIdsOf(scenario)

        expect(transcript).toStrictEqual({
          status: 200,
          contentType: "application/json",
          body: { ok: true, mode: "compass", received: ids.length },
          events: [],
          graphUrls: [],
          capturePayloads: [],
          consoleErrors: [],
        })
        expect(fake.client.rpc).toHaveBeenCalledTimes(1)
        expect(fake.client.rpc).toHaveBeenCalledWith("meta_leadgen_record_receipts", {
          p_rows: ids.map((leadgenId) => expect.objectContaining({ leadgen_id: leadgenId })),
          p_mode: "compass",
        })
        // 원장 조회도 하지 않는다(미러가 판정한다)
        expect(fake.calls.map((call) => (call.kind === "from" ? call.table : call.name))).toEqual([
          "meta_leadgen_cutover",
          "meta_leadgen_record_receipts",
        ])

        expect(after).toHaveBeenCalledTimes(1)
        expect(hoisted.runMetaLeadMirror).not.toHaveBeenCalled()
        await hoisted.afterCallbacks[0]()
        expect(hoisted.runMetaLeadMirror).toHaveBeenCalledTimes(1)
        expect(hoisted.runMetaLeadMirror).toHaveBeenCalledWith({
          trigger: "webhook",
          leadgenIds: [...new Set(ids)],
          waitForCompassMs: 20_000,
        })
      })
    }

    it("after() 미러가 실패해도 삼키고 로그만 남긴다", async () => {
      install(setup)
      hoisted.runMetaLeadMirror.mockRejectedValue(new Error("mirror boom"))
      const transcript = await run(setup, scenarioById("single-lead-ok"))
      expect(transcript.status).toBe(200)

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      await expect(hoisted.afterCallbacks[0]()).resolves.toBeUndefined()
      expect(consoleError).toHaveBeenCalledWith("[meta/webhook] after() 미러 시도 실패:", "mirror boom")
    })

    it("모드 메모 30초 — 두 번째 전달은 스위치를 다시 읽지 않는다", async () => {
      const fake = install(setup)
      await run(setup, scenarioById("single-lead-ok"))
      await run(setup, scenarioById("two-leads-one-capture-400"))
      expect(fake.calls.filter((call) => call.kind === "from" && call.table === "meta_leadgen_cutover")).toHaveLength(1)
      expect(fake.client.rpc).toHaveBeenCalledTimes(2)
    })
  })

  describe("compass 모드 — 증인 실패 → 인라인 저장", () => {
    function compassSetup(receipts: FakeCutoverSupabaseOptions["receipts"], ledger?: FakeCutoverSupabaseOptions["ledger"]): Setup {
      return {
        name: "compass-inline",
        supabase: {
          cutover: { data: cutoverRow({ mode: "compass", mirror_since: MIRROR_SINCE }), error: null },
          receipts,
          ledger: ledger ?? { data: [], error: null },
        },
      }
    }

    const receiptFailures: Array<[string, FakeCutoverSupabaseOptions["receipts"]]> = [
      ["RPC 오류(숫자 아닌 id check 위반)", { data: null, error: { message: "violates check constraint", code: "23514" } }],
      ["RPC 예외", new Error("fetch failed")],
    ]

    for (const [label, receipts] of receiptFailures) {
      it(`${label}: 지금 경로와 같은 Graph 조회·payload 로 저장 → 200`, async () => {
        const setup = compassSetup(receipts)
        install(setup)
        const scenario = scenarioById("mixed-changes-and-entries")
        const transcript = await run(setup, scenario)
        const expected = recorded[scenario.id]

        expect(transcript.status).toBe(200)
        expect(transcript.body).toEqual({ ok: true, mode: "compass", inline: true, received: 2, processed: 2, failed: 0 })
        expect(transcript.events).toEqual(expected.events)
        expect(transcript.graphUrls).toEqual(expected.graphUrls)
        expect(transcript.capturePayloads).toEqual(expected.capturePayloads)
        expect(transcript.consoleErrors).toEqual([
          [
            "[meta/webhook] compass 수신 증인 기록 실패 — 옛 경로로 인라인 저장:",
            expect.stringMatching(/violates check constraint|fetch failed/),
          ],
        ])
        expect(after).not.toHaveBeenCalled()
        expect(hoisted.runMetaLeadMirror).not.toHaveBeenCalled()
      })
    }

    const inlineFailures: Array<{ id: string; captureCalls: number; processed: number; failed: number; reason: string }> = [
      { id: "graph-500-still-captures", captureCalls: 0, processed: 0, failed: 1, reason: "Meta lead fetch failed: 500" },
      { id: "graph-network-error-still-captures", captureCalls: 0, processed: 0, failed: 1, reason: "합성 socket hang up" },
      { id: "no-token-captures-without-detail", captureCalls: 0, processed: 0, failed: 1, reason: "META_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN is required." },
      { id: "two-leads-one-capture-400", captureCalls: 2, processed: 1, failed: 1, reason: "submitLeadCapture 400" },
      { id: "capture-throws", captureCalls: 1, processed: 0, failed: 1, reason: "합성 저장 예외" },
      { id: "capture-502-not-stored", captureCalls: 1, processed: 0, failed: 1, reason: "submitLeadCapture 502" },
    ]

    for (const failure of inlineFailures) {
      it(`${failure.id}: 인라인이 하나라도 실패하면 500(상세 없이 저장하지 않음)`, async () => {
        const setup = compassSetup(new Error("fetch failed"))
        install(setup)
        const scenario = scenarioById(failure.id)
        const transcript = await run(setup, scenario)

        expect(transcript.status).toBe(500)
        expect(transcript.body).toEqual({
          ok: false,
          mode: "compass",
          inline: true,
          received: leadgenIdsOf(scenario).length,
          processed: failure.processed,
          failed: failure.failed,
        })
        expect(hoisted.submitLeadCapture).toHaveBeenCalledTimes(failure.captureCalls)
        for (const payload of transcript.capturePayloads) {
          // 저장한 것은 상세가 있는 payload 뿐이다(Graph 광고 계층이 실림)
          expect(String((payload as { message: string }).message)).toContain("campaign=")
        }
        expect(transcript.consoleErrors.at(-1)).toEqual(["[meta/webhook] compass 인라인 저장 실패:", expect.stringContaining(failure.reason)])
        expect(after).not.toHaveBeenCalled()
      })
    }

    it("Graph 가 빈 상세를 돌려주면 실패로 친다", async () => {
      const setup = compassSetup(new Error("fetch failed"))
      install(setup)
      const scenario: RouteRecordingScenario = {
        ...scenarioById("single-lead-ok"),
        graph: { "9100000000000011": { kind: "ok", json: null as unknown as Record<string, unknown> } },
      }
      const transcript = await run(setup, scenario)
      expect(transcript.status).toBe(500)
      expect(hoisted.submitLeadCapture).not.toHaveBeenCalled()
      expect(transcript.consoleErrors.at(-1)).toEqual(["[meta/webhook] compass 인라인 저장 실패:", "Meta lead detail is empty."])
    })

    it("원장이 이미 가진 leadgen(미러 뒤 재전송)은 인라인에서도 건너뛴다", async () => {
      const setup = compassSetup(new Error("fetch failed"), (ids) => ({
        data: ids.filter((id) => id === "9100000000000021").map((leadgen_id) => ({ leadgen_id })),
        error: null,
      }))
      install(setup)
      const scenario: RouteRecordingScenario = { ...scenarioById("two-leads-one-capture-400"), capture: {} }
      const transcript = await run(setup, scenario)
      expect(transcript.status).toBe(200)
      expect(transcript.body).toEqual({ ok: true, mode: "compass", inline: true, received: 2, processed: 1, failed: 0, skipped: 1 })
      expect(transcript.events).toEqual(["graph:9100000000000022", "capture:9100000000000022"])
    })

    it("원장 조회도 실패하면 전부 인라인 저장한다", async () => {
      const setup = compassSetup(new Error("fetch failed"), new Error("fetch failed"))
      install(setup)
      const scenario = scenarioById("single-lead-ok")
      const transcript = await run(setup, scenario)
      expect(transcript.status).toBe(200)
      expect(transcript.events).toEqual(recorded[scenario.id].events)
    })
  })

  describe("모드 무관 — 서명 403·JSON 400·object≠page·leadgen 없음·GET 은 DB 를 읽지 않는다", () => {
    const modes: Setup[] = [
      { name: "admin", supabase: { cutover: { data: cutoverRow(), error: null } } },
      { name: "shadow", supabase: { cutover: { data: cutoverRow({ mode: "shadow" }), error: null } } },
      { name: "compass", supabase: { cutover: { data: cutoverRow({ mode: "compass", mirror_since: MIRROR_SINCE }), error: null } } },
    ]
    const ids = ["invalid-signature", "missing-signature", "invalid-json", "object-not-page", "object-missing", "page-without-leadgen", "page-empty-entry", "get-verify-ok", "get-verify-fail"]

    for (const setup of modes) {
      for (const id of ids) {
        it(`${setup.name}: ${id}`, async () => {
          const fake = install(setup)
          const transcript = await run(setup, scenarioById(id))
          expect(transcript).toStrictEqual(recorded[id])
          expect(fake.calls).toEqual([])
          expect(after).not.toHaveBeenCalled()
        })
      }
    }
  })
})
