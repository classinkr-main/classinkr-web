/**
 * check:db 의 meta_leadgen_cutover 영향 문구가 실제 동작과 같아야 한다(2026-10-19 09-mooni 병합 검토 후속).
 * 스위치 표가 없으면 runMetaLeadMirrorCycle 이 스위치 읽기 실패로 미러를 failed 로 끝내고(tests/server/meta-lead-mirror.test.ts
 * '스위치를 못 읽으면 failed'), 크론 라우트는 failed 를 500 으로 낸다 — "건너뛴다"(200 skipped)가 아니다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SCHEMA_PROBES } from "@/lib/db/schema-contract"

describe("schema-contract — meta_leadgen_cutover 영향 문구", () => {
  it("미러·폴백 크론은 건너뛰지 않고 failed(500)로 끝난다고 말한다", () => {
    const probe = SCHEMA_PROBES.find((item) => item.kind === "table" && item.table === "meta_leadgen_cutover")
    expect(probe).toBeDefined()
    const impact = probe?.impact ?? ""
    expect(impact).toContain("스위치 읽기 실패로 매 실행 failed(500)로 끝난다")
    expect(impact).not.toContain("크론은 건너뛴다")
  })

  it("근거: 크론 라우트가 failed 사이클을 500 으로 낸다", () => {
    const route = readFileSync(join(process.cwd(), "app/api/cron/meta-lead-mirror/route.ts"), "utf8")
    const start = route.indexOf("const HTTP_STATUS")
    expect(start).toBeGreaterThan(-1)
    const block = route.slice(start, route.indexOf("}", start))
    expect(block).toMatch(/\bfailed: 500\b/)
    expect(block).toMatch(/\bskipped: 200\b/)
  })
})
