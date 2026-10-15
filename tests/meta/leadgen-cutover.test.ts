import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeCutoverSupabase, cutoverRow, type FakeCutoverSupabaseOptions } from "./fixtures/fake-cutover-supabase"

// 설계 META-RECEIVER-FINAL §4-2 H4 — 모드 해석 표, env 우선, 30초 메모, 증인 RPC, 원장 소유 판정.

const { adminClient } = vi.hoisted(() => ({
  adminClient: { current: null as unknown, throwOnCreate: null as Error | null },
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    if (adminClient.throwOnCreate) throw adminClient.throwOnCreate
    return adminClient.current
  }),
}))

import {
  __resetMetaLeadgenCutoverCacheForTests,
  buildMetaLeadgenReceiptRows,
  getEffectiveMetaLeadgenMode,
  isLeadgenOwnedByLedger,
  LEDGER_OWNED_STATES,
  META_LEADGEN_CUTOVER_CACHE_TTL_MS,
  META_LEADGEN_CUTOVER_READ_TIMEOUT_MS,
  META_LEADGEN_RECEIPTS_TIMEOUT_MS,
  parseMetaLeadgenCutoverRow,
  readMetaLeadgenCutover,
  recordMetaLeadgenReceipts,
  resolveMetaLeadgenCutover,
} from "@/lib/meta/leadgen-cutover"

function install(options: FakeCutoverSupabaseOptions) {
  const fake = createFakeCutoverSupabase(options)
  adminClient.current = fake.client
  adminClient.throwOnCreate = null
  return fake
}

describe("lib/meta/leadgen-cutover", () => {
  beforeEach(() => {
    __resetMetaLeadgenCutoverCacheForTests()
    vi.stubEnv("META_LEADGEN_FORCE_ADMIN", "")
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    adminClient.current = null
    adminClient.throwOnCreate = null
  })

  describe("모드 해석 표", () => {
    const table: Array<{ name: string; options: FakeCutoverSupabaseOptions; mode: string; source: string }> = [
      { name: "행 admin", options: { cutover: { data: cutoverRow(), error: null } }, mode: "admin", source: "db" },
      { name: "행 shadow", options: { cutover: { data: cutoverRow({ mode: "shadow" }), error: null } }, mode: "shadow", source: "db" },
      {
        name: "행 compass",
        options: { cutover: { data: cutoverRow({ mode: "compass", mirror_since: "2026-09-15T00:00:00Z" }), error: null } },
        mode: "compass",
        source: "db",
      },
      { name: "행 없음", options: { cutover: { data: null, error: null } }, mode: "admin", source: "read_failed" },
      { name: "모르는 모드 값", options: { cutover: { data: cutoverRow({ mode: "COMPASS" }), error: null } }, mode: "admin", source: "read_failed" },
      {
        name: "PostgREST 오류(표 없음 — 마이그레이션 미적용)",
        options: { cutover: { data: null, error: { message: "relation does not exist", code: "42P01" } } },
        mode: "admin",
        source: "read_failed",
      },
      { name: "권한 오류", options: { cutover: { data: null, error: { message: "permission denied", code: "42501" } } }, mode: "admin", source: "read_failed" },
      { name: "네트워크 예외", options: { cutover: new Error("fetch failed") }, mode: "admin", source: "read_failed" },
    ]

    for (const row of table) {
      it(`${row.name} → ${row.mode} (${row.source})`, async () => {
        install(row.options)
        const resolved = await resolveMetaLeadgenCutover()
        expect(resolved.mode).toBe(row.mode)
        expect(resolved.source).toBe(row.source)
        expect(resolved.cutover === null).toBe(row.source !== "db")
        await expect(getEffectiveMetaLeadgenMode()).resolves.toBe(row.mode)
      })
    }

    it("Supabase env 가 없어 클라이언트 생성이 throw → admin", async () => {
      adminClient.throwOnCreate = new Error("Missing Supabase server env.")
      const resolved = await resolveMetaLeadgenCutover()
      expect(resolved).toMatchObject({ mode: "admin", source: "read_failed", cutover: null })
      expect(resolved.error).toContain("Missing Supabase server env")
    })

    it("읽기가 3초를 넘기면 abort 하고 admin", async () => {
      vi.useFakeTimers()
      install({ cutover: "hang" })
      const pending = resolveMetaLeadgenCutover()
      expect(META_LEADGEN_CUTOVER_READ_TIMEOUT_MS).toBe(3_000)
      await vi.advanceTimersByTimeAsync(META_LEADGEN_CUTOVER_READ_TIMEOUT_MS)
      await expect(pending).resolves.toMatchObject({ mode: "admin", source: "read_failed" })
    })

    it("스위치 한 행을 id=default 로 읽는다", async () => {
      const fake = install({ cutover: { data: cutoverRow(), error: null } })
      await readMetaLeadgenCutover()
      expect(fake.calls).toEqual([
        {
          kind: "from",
          table: "meta_leadgen_cutover",
          select:
            "mode, shadow_since, mirror_since, compass_started_at, compass_ended_at, side_effects, fallback_after_minutes, updated_at",
          filters: [["eq", "id", "default"]],
        },
      ])
    })

    it("행 파싱: 시각·토글·폴백 기한", () => {
      expect(
        parseMetaLeadgenCutoverRow(
          cutoverRow({
            mode: "compass",
            mirror_since: "2026-09-15T01:00:00Z",
            compass_ended_at: "",
            side_effects: { externalForwards: false, unknownKey: false, subscriberUpsert: "no" },
            fallback_after_minutes: 30,
          })
        )
      ).toEqual({
        mode: "compass",
        shadowSince: null,
        mirrorSince: "2026-09-15T01:00:00Z",
        compassStartedAt: null,
        compassEndedAt: null,
        sideEffects: {
          leadCreatedNotification: true,
          subscriberUpsert: true,
          automationOnSubmit: true,
          externalForwards: false,
        },
        fallbackAfterMinutes: 30,
        updatedAt: "2026-09-15T00:00:00.000Z",
      })
    })
  })

  describe("env 비상 스위치 META_LEADGEN_FORCE_ADMIN", () => {
    for (const value of ["1", " 1\n"]) {
      it(`${JSON.stringify(value)} → admin, DB 를 읽지 않는다`, async () => {
        vi.stubEnv("META_LEADGEN_FORCE_ADMIN", value)
        const fake = install({ cutover: { data: cutoverRow({ mode: "compass" }), error: null } })
        await expect(resolveMetaLeadgenCutover()).resolves.toEqual({
          mode: "admin",
          source: "env_force_admin",
          cutover: null,
        })
        expect(fake.client.from).not.toHaveBeenCalled()
        expect(fake.client.rpc).not.toHaveBeenCalled()
      })
    }

    for (const value of ["", "0", "true", "yes", "11"]) {
      it(`${JSON.stringify(value)} 는 강제하지 않는다 → DB 모드`, async () => {
        vi.stubEnv("META_LEADGEN_FORCE_ADMIN", value)
        install({ cutover: { data: cutoverRow({ mode: "shadow" }), error: null } })
        await expect(getEffectiveMetaLeadgenMode()).resolves.toBe("shadow")
      })
    }
  })

  describe("30초 인스턴스 메모", () => {
    it("30초 안에는 다시 읽지 않고, 30초가 지나면 다시 읽는다", async () => {
      vi.useFakeTimers()
      let mode = "shadow"
      const fake = install({ cutover: () => ({ data: cutoverRow({ mode }), error: null }) })

      await expect(getEffectiveMetaLeadgenMode()).resolves.toBe("shadow")
      mode = "admin" // 롤백 SQL 이 실행됐다고 치자
      expect(META_LEADGEN_CUTOVER_CACHE_TTL_MS).toBe(30_000) // 설계 §5 반영 지연
      await vi.advanceTimersByTimeAsync(29_999)
      await expect(getEffectiveMetaLeadgenMode()).resolves.toBe("shadow")
      expect(fake.client.from).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      await expect(getEffectiveMetaLeadgenMode()).resolves.toBe("admin")
      expect(fake.client.from).toHaveBeenCalledTimes(2)
    })

    it("실패는 메모하지 않는다 — 다음 호출이 바로 다시 읽는다", async () => {
      let fail = true
      const fake = install({
        cutover: () => (fail ? { data: null, error: { message: "timeout" } } : { data: cutoverRow({ mode: "compass" }), error: null }),
      })
      await expect(getEffectiveMetaLeadgenMode()).resolves.toBe("admin")
      fail = false
      await expect(getEffectiveMetaLeadgenMode()).resolves.toBe("compass")
      expect(fake.client.from).toHaveBeenCalledTimes(2)
    })

    it("동시에 들어온 호출은 읽기 하나를 공유한다", async () => {
      const fake = install({ cutover: { data: cutoverRow({ mode: "shadow" }), error: null } })
      const modes = await Promise.all([getEffectiveMetaLeadgenMode(), getEffectiveMetaLeadgenMode(), readMetaLeadgenCutover()])
      expect(modes.slice(0, 2)).toEqual(["shadow", "shadow"])
      expect(fake.client.from).toHaveBeenCalledTimes(1)
    })

    it("env 비상 스위치는 메모와 무관하게 즉시 이긴다", async () => {
      install({ cutover: { data: cutoverRow({ mode: "compass" }), error: null } })
      await expect(getEffectiveMetaLeadgenMode()).resolves.toBe("compass")
      vi.stubEnv("META_LEADGEN_FORCE_ADMIN", "1")
      await expect(getEffectiveMetaLeadgenMode()).resolves.toBe("admin")
    })
  })

  describe("recordMetaLeadgenReceipts", () => {
    const leads = [
      { leadgen_id: "9200000000000001", page_id: "100000000000001", form_id: "form-1", ad_id: "ad-1", adgroup_id: "g", created_time: 1 },
      { leadgen_id: "9200000000000002", page_id: "100000000000001" },
    ]

    it("RPC 1회 — 식별자 4개만 넘긴다", async () => {
      const fake = install({ receipts: { data: 2, error: null } })
      await expect(recordMetaLeadgenReceipts(leads, "compass")).resolves.toBe(2)
      expect(fake.calls).toEqual([
        {
          kind: "rpc",
          name: "meta_leadgen_record_receipts",
          args: {
            p_rows: [
              { leadgen_id: "9200000000000001", page_id: "100000000000001", form_id: "form-1", ad_id: "ad-1" },
              { leadgen_id: "9200000000000002", page_id: "100000000000001", form_id: null, ad_id: null },
            ],
            p_mode: "compass",
          },
        },
      ])
      expect(buildMetaLeadgenReceiptRows(leads).flatMap(Object.keys)).not.toContain("created_time")
    })

    it("RPC 오류(숫자 아닌 id check 위반 등)는 throw", async () => {
      install({ receipts: { data: null, error: { message: "violates check constraint", code: "23514" } } })
      await expect(recordMetaLeadgenReceipts(leads, "shadow")).rejects.toThrow("meta_leadgen_record_receipts 실패")
    })

    it("네트워크 예외·클라이언트 생성 실패는 throw", async () => {
      install({ receipts: new Error("fetch failed") })
      await expect(recordMetaLeadgenReceipts(leads, "compass")).rejects.toThrow("fetch failed")
      adminClient.throwOnCreate = new Error("Missing Supabase server env.")
      await expect(recordMetaLeadgenReceipts(leads, "compass")).rejects.toThrow("Missing Supabase server env.")
    })

    it("5초를 넘기면 throw", async () => {
      vi.useFakeTimers()
      install({ receipts: "hang" })
      const pending = recordMetaLeadgenReceipts(leads, "compass")
      const assertion = expect(pending).rejects.toThrow("5000ms 초과")
      await vi.advanceTimersByTimeAsync(META_LEADGEN_RECEIPTS_TIMEOUT_MS)
      await assertion
    })

    it("admin 모드로는 부르지 않는다", async () => {
      const fake = install({})
      await expect(recordMetaLeadgenReceipts(leads, "admin" as never)).rejects.toThrow("shadow·compass 만")
      expect(fake.client.rpc).not.toHaveBeenCalled()
    })
  })

  describe("isLeadgenOwnedByLedger", () => {
    const compass = parseMetaLeadgenCutoverRow(cutoverRow({ mode: "admin", mirror_since: "2026-09-15T00:00:00Z" }))

    it("mirror_since 가 없으면 조회하지 않는다", async () => {
      const fake = install({ ledger: { data: [{ leadgen_id: "9300000000000001" }], error: null } })
      const noMirror = parseMetaLeadgenCutoverRow(cutoverRow({ mode: "shadow" }))
      await expect(isLeadgenOwnedByLedger(["9300000000000001"], noMirror)).resolves.toEqual(new Set())
      await expect(isLeadgenOwnedByLedger(["9300000000000001"], null)).resolves.toEqual(new Set())
      expect(fake.client.from).not.toHaveBeenCalled()
    })

    it("mirror_since 가 있으면 소유 상태만 조회하고 id 집합을 돌려준다", async () => {
      const fake = install({
        ledger: (ids, states) => ({
          data: ids.filter((id) => id.endsWith("1")).map((leadgen_id) => ({ leadgen_id, states })),
          error: null,
        }),
      })
      const owned = await isLeadgenOwnedByLedger(["9300000000000001", "9300000000000002", "9300000000000001", ""], compass)
      expect(owned).toEqual(new Set(["9300000000000001"]))
      expect(fake.calls).toEqual([
        {
          kind: "from",
          table: "meta_lead_mirror_ledger",
          select: "leadgen_id",
          filters: [
            ["in", "leadgen_id", ["9300000000000001", "9300000000000002"]],
            ["in", "state", ["inserted", "adopted", "fallback_pending"]],
          ],
        },
      ])
      expect([...LEDGER_OWNED_STATES]).toEqual(["inserted", "adopted", "fallback_pending"])
    })

    it("200개씩 나눠 조회한다", async () => {
      const fake = install({ ledger: { data: [], error: null } })
      const ids = Array.from({ length: 401 }, (_, index) => `94${String(index).padStart(14, "0")}`)
      await isLeadgenOwnedByLedger(ids, compass)
      expect(fake.calls.map((call) => (call.kind === "from" ? (call.filters[0][2] as string[]).length : 0))).toEqual([200, 200, 1])
    })

    it("조회 실패는 빈 집합(건너뛰지 않음)", async () => {
      install({ ledger: { data: null, error: { message: "permission denied" } } })
      await expect(isLeadgenOwnedByLedger(["9300000000000001"], compass)).resolves.toEqual(new Set())
      install({ ledger: new Error("fetch failed") })
      await expect(isLeadgenOwnedByLedger(["9300000000000001"], compass)).resolves.toEqual(new Set())
    })

    it("cutover 를 넘기지 않으면 메모된 스위치를 읽고, 못 읽으면 조회하지 않는다", async () => {
      const fake = install({
        cutover: { data: cutoverRow({ mode: "compass", mirror_since: "2026-09-15T00:00:00Z" }), error: null },
        ledger: { data: [{ leadgen_id: "9300000000000009" }], error: null },
      })
      await expect(isLeadgenOwnedByLedger(["9300000000000009"])).resolves.toEqual(new Set(["9300000000000009"]))
      expect(fake.calls.map((call) => (call.kind === "from" ? call.table : call.name))).toEqual([
        "meta_leadgen_cutover",
        "meta_lead_mirror_ledger",
      ])

      __resetMetaLeadgenCutoverCacheForTests()
      const failing = install({ cutover: { data: null, error: { message: "down" } } })
      await expect(isLeadgenOwnedByLedger(["9300000000000009"])).resolves.toEqual(new Set())
      expect(failing.calls.map((call) => (call.kind === "from" ? call.table : call.name))).toEqual(["meta_leadgen_cutover"])
    })

    it("빈 id 목록이면 아무것도 읽지 않는다", async () => {
      const fake = install({})
      await expect(isLeadgenOwnedByLedger([], compass)).resolves.toEqual(new Set())
      expect(fake.client.from).not.toHaveBeenCalled()
    })
  })
})
