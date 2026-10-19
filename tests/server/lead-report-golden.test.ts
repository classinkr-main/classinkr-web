import { afterEach, describe, expect, it, vi } from "vitest"

import recording from "./fixtures/lead-report-golden-recording.json"
import { GOLDEN_SCENARIO_IDS, runGoldenScenario } from "./fixtures/lead-report-golden-harness"

// 녹화 스냅샷 — 광고 리드 보고 3종의 **"미측정" 가드(설계 META-RECEIVER-FINAL §4-2 H9) 전** 출력.
//
// fixtures/lead-report-golden-recording.json 은 가드를 넣기 전 코드(weekly-report.ts·weekly-report-builder.ts·
// lead-morning-brief.ts·lead-digest-alerts.ts·emit-event.ts 위컴 카드)를 하네스로 돌려 만든 기록이다.
// 이 파일과 녹화본은 가드 뒤에도 바뀌지 않아야 한다. 기본 환경(전환 스위치 표가 없음 = 마이그레이션 미적용 →
// admin)에서 보고서 객체·Markdown·알림 이벤트(message·payload)·위컴 카드가 키 순서까지 같아야 한다.
// 모드별(admin 행·shadow·compass 정상/지연) 대조는 tests/server/lead-report-intake-guard.test.ts 가 한다.

const recorded = recording as Record<string, unknown>

describe("광고 리드 보고 녹화 스냅샷(미측정 가드 전 동작)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("녹화본이 시나리오 전부를 같은 순서로 담고 있다", () => {
    expect(Object.keys(recorded)).toEqual(GOLDEN_SCENARIO_IDS)
  })

  for (const id of GOLDEN_SCENARIO_IDS) {
    it(`${id} — 녹화본과 같다`, async () => {
      const transcript = JSON.parse(JSON.stringify(await runGoldenScenario(id)))

      expect(transcript).toStrictEqual(recorded[id])
      expect(JSON.stringify(transcript)).toBe(JSON.stringify(recorded[id]))
    })
  }
})
