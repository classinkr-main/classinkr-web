import { afterEach, describe, expect, it, vi } from "vitest"

import recording from "./fixtures/meta-webhook-route-recording.json"
import {
  normalizeTranscript,
  ROUTE_RECORDING_SCENARIOS,
  runRouteScenario,
  type RouteTranscript,
} from "./fixtures/meta-webhook-route-harness"

// 녹화 스냅샷 — Meta 리드애즈 웹훅 라우트의 **모드 분기 전** 동작(설계 META-RECEIVER-FINAL §4-2 H5).
//
// fixtures/meta-webhook-route-recording.json 은 분기를 넣기 전 route.ts(H2 이동 뒤, 원본과 같음을
// tests/meta/lead-ads-payload.golden.test.ts 가 보장)를 하네스로 돌려 만든 기록이다.
// 이 파일과 녹화본은 분기 뒤에도 바뀌지 않아야 한다. 모드 스위치를 쓰지 않는 기본 환경
// (DB 설정을 읽을 수 없음 = admin 폴백)에서 응답·호출 순서·Graph URL·저장 payload·console.error
// 가 한 글자도 같아야 한다. 모드별 대조는 tests/api/meta-webhook-mode.test.ts 가 한다.

const { submitLeadCapture } = vi.hoisted(() => ({ submitLeadCapture: vi.fn() }))

vi.mock("@/lib/server/lead-capture", () => ({ submitLeadCapture }))

// 분기 뒤 라우트가 모드를 읽으려 할 때 실 DB 에 닿지 않도록, Supabase env 가 없을 때와 같은
// 예외를 던진다(분기 전 라우트는 이 모듈을 부르지 않는다).
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("Missing Supabase server env. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.")
  },
}))

import * as route from "@/app/api/meta/webhook/route"

const recorded = recording as Record<string, RouteTranscript>

describe("Meta 웹훅 라우트 녹화 스냅샷(모드 분기 전 동작)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("녹화본이 시나리오 전부를 담고 있다", () => {
    expect(Object.keys(recorded)).toEqual(ROUTE_RECORDING_SCENARIOS.map((scenario) => scenario.id))
  })

  for (const scenario of ROUTE_RECORDING_SCENARIOS) {
    it(`${scenario.id} — ${scenario.note}`, async () => {
      const transcript = normalizeTranscript(await runRouteScenario(route, scenario, submitLeadCapture))

      expect(transcript).toStrictEqual(recorded[scenario.id])
      // 키 순서까지(응답 본문·payload)
      expect(JSON.stringify(transcript)).toBe(JSON.stringify(recorded[scenario.id]))
    })
  }
})
