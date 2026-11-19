import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { mergeParts } from "@/scripts/answer-index/lib/merge-core"
import { makeDataDir } from "./helpers"

// §12.2 병렬로 나누는 법: 단위마다 조각 파일로 나눠 쓰고 merge.ts 가 합친다.

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function fixture(files: Record<string, unknown>) {
  const made = makeDataDir(files)
  cleanups.push(made.cleanup)
  return made.dir
}

const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "gap", tier: "standard", area: "account", topic: id, answer: { template: "gap_default", handoff: null, related: [] }, status: "active", ...extra })
const variant = (q: string) => ({ q, p: "fixture", g: "A", m: "fixture" })

describe("merge", () => {
  it("카드·변형 조각을 기본 파일로 합치고 조각을 지우며 manifest 에 생성 기록을 남긴다", () => {
    const dir = fixture({
      "cards/account.json": [card("gap:account/a")],
      "cards/account.D5-01.json": [card("gap:account/b", { provenance: { unit: "D5-01", writer: "agent:x", reviewer: "agent:y", at: "2026-11-20", legacyIds: [] } }), { unitId: "doc:/docs/start/signup#0", nav: true }],
      "variants/account.D5-01.json": { "gap:account/b": [variant("계정 질문 하나"), variant("계정 질문 하나!")] },
    })
    const { reports } = mergeParts({ dir })
    expect(reports.every((report) => report.conflicts.length === 0)).toBe(true)
    const cards = JSON.parse(readFileSync(join(dir, "cards/account.json"), "utf8")) as { id?: string }[]
    expect(cards.map((entry) => entry.id ?? "nav")).toEqual(["gap:account/a", "gap:account/b", "nav"])
    const variants = JSON.parse(readFileSync(join(dir, "variants/account.json"), "utf8")) as Record<string, unknown[]>
    // 정규화하면 같은 변형은 나중 것을 버린다.
    expect(variants["gap:account/b"]).toHaveLength(1)
    expect(existsSync(join(dir, "cards/account.D5-01.json"))).toBe(false)
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"))
    expect(manifest.generation["D5-01"]).toMatchObject({ part: "D5-01", writers: ["agent:x"], reviewers: ["agent:y"] })
    expect(manifest.generation["D5-01"].files).toEqual(["cards/account.D5-01.json", "variants/account.D5-01.json"])
    expect(manifest.dataVersion).toMatch(/^ai-[0-9a-f]{12}$/)
  })

  it("다른 카드에 이미 있는 변형은 버리고 알린다", () => {
    const dir = fixture({
      "variants/account.json": { "gap:account/a": [variant("로그인 시험 변형")] },
      "variants/course.D1-02.json": { "doc:/docs/teacher/course-members#4/x": [variant("로그인  시험 변형?")] },
    })
    const { reports } = mergeParts({ dir })
    const report = reports.find((item) => item.base === "variants/course.json")
    expect(report?.dropped).toHaveLength(1)
    expect(report?.dropped[0]).toContain("gap:account/a")
  })

  it("같은 id 가 다르면 충돌로 멈추고 아무것도 쓰지 않는다(--replace 면 바꾼다)", () => {
    const dir = fixture({
      "cards/account.json": [card("gap:account/a")],
      "cards/account.D5-02.json": [card("gap:account/a", { topic: "다른 주제" })],
    })
    const first = mergeParts({ dir })
    expect(first.reports[0].conflicts).toHaveLength(1)
    expect(existsSync(join(dir, "cards/account.D5-02.json"))).toBe(true)
    const second = mergeParts({ dir, replace: true })
    expect(second.reports[0].replaced).toBe(1)
    const cards = JSON.parse(readFileSync(join(dir, "cards/account.json"), "utf8")) as { topic: string }[]
    expect(cards[0].topic).toBe("다른 주제")
  })

  it("우주 조각은 빈 라벨을 채우고 점검 기록은 줄 단위로 합친다", () => {
    const dir = fixture({
      "universe/s001.json": [{ id: "u-1", q: "질문", p: "P-1", m: "m", label: null, conf: null, labeler: null, label2: null }],
      "universe/s001.D9-01.json": [{ id: "u-1", q: "질문", p: "P-1", m: "m", label: "none", conf: 0.9, labeler: "agent:z", label2: null }],
      "audit/C-01.jsonl": `${JSON.stringify({ answerId: "field:a", disposition: "KEEP" })}\n`,
      "audit/C-01.D3-01b.jsonl": `${JSON.stringify({ answerId: "field:b", disposition: "DROP" })}\n`,
    })
    mergeParts({ dir })
    const universe = JSON.parse(readFileSync(join(dir, "universe/s001.json"), "utf8"))
    expect(universe[0]).toMatchObject({ label: "none", conf: 0.9, labeler: "agent:z" })
    const audit = readFileSync(join(dir, "audit/C-01.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line).answerId)
    expect(audit).toEqual(["field:a", "field:b"])
  })
})
