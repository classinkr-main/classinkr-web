import { writeFileSync } from "node:fs"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"

import {
  equivalenceHash,
  LEGACY_EQUIVALENCE_FILE,
  legacyEquivalenceCases,
  readLegacyEquivalence,
  stubLegacyEquivalenceEnv,
  type LegacyEquivalenceFile,
} from "./legacy-equivalence-lib"

/**
 * 끔 동등성 시험(사양 §11 1): 답 라우터 환경변수가 없을 때와 legacy 일 때, 평가셋 전 문항의 generateAnswer=false 답이
 * 답 색인을 서비스에 잇기 전에 남긴 해시(fixtures/legacy-equivalence.json)와 같아야 한다.
 *
 * 다시 만들기(옛 흐름을 일부러 바꾼 커밋에서만):
 *   ANSWER_INDEX_WRITE_LEGACY_EQUIVALENCE=1 npx vitest run tests/chatbot/answer-index/legacy-equivalence.test.ts
 * 그때는 바뀐 문항과 이유를 커밋 메시지에 적는다.
 */

const WRITE = process.env.ANSWER_INDEX_WRITE_LEGACY_EQUIVALENCE === "1"
const cases = legacyEquivalenceCases()

async function hashAll() {
  const hashes: Record<string, string> = {}
  for (const item of cases) {
    hashes[item.key] = equivalenceHash(await evaluateChatbotQuery(item.question, { generateAnswer: false }))
  }
  return hashes
}

function diff(expected: Record<string, string>, actual: Record<string, string>) {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
  return Array.from(keys).filter((key) => expected[key] !== actual[key]).sort()
}

describe("legacy equivalence (router off / legacy)", () => {
  const fetchSpy = vi.fn(async () => {
    throw new Error("network disabled in legacy equivalence test")
  })

  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.stubGlobal("fetch", fetchSpy)
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.runIf(WRITE)("writes the equivalence snapshot", async () => {
    stubLegacyEquivalenceEnv(null)
    const hashes = await hashAll()
    const file: LegacyEquivalenceFile = {
      _comment:
        "끔 동등성 기준(답 색인 사양 §11 1). 평가셋 data/chatbot-{first-contact,fresh-open,golden,cs-symptom,persona-eval}-set.json 전 문항의 generateAnswer=false 답(answer·answerMode·needsHandoff·unresolved·handoffIntent·출처 경로)을 sha256 앞 16자로 묶었다. 열쇠는 <묶음>/<문항 id>. 글은 담지 않는다. 다시 만드는 법은 legacy-equivalence.test.ts 머리말.",
      fields: ["answer", "answerMode", "needsHandoff", "unresolved", "handoffIntent", "sources[].urlPath"],
      hashes,
    }
    writeFileSync(LEGACY_EQUIVALENCE_FILE, `${JSON.stringify(file, null, 2)}\n`)
    expect(Object.keys(hashes)).toHaveLength(cases.length)
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 600_000)

  it.skipIf(WRITE)("covers every eval case once", () => {
    const expected = readLegacyEquivalence().hashes
    expect(new Set(cases.map((item) => item.key)).size).toBe(cases.length)
    expect(Object.keys(expected).sort()).toEqual(cases.map((item) => item.key).sort())
  })

  it.skipIf(WRITE)("matches the snapshot with no router env var", async () => {
    stubLegacyEquivalenceEnv(null)
    const actual = await hashAll()
    expect(diff(readLegacyEquivalence().hashes, actual)).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 600_000)

  it.skipIf(WRITE)("matches the snapshot with CHATBOT_ANSWER_ROUTER=legacy", async () => {
    stubLegacyEquivalenceEnv("legacy")
    const actual = await hashAll()
    expect(diff(readLegacyEquivalence().hashes, actual)).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 600_000)

  it.skipIf(WRITE)("keeps the legacy answers under shadow (the index decision only goes to the log)", async () => {
    stubLegacyEquivalenceEnv("shadow")
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    info.mockClear()
    const actual = await hashAll()
    expect(diff(readLegacyEquivalence().hashes, actual)).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
    const logs = info.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith("[chatbot] answer-index shadow "))
    expect(logs.length).toBe(cases.length)
    // 질문 글은 로그에 남지 않는다.
    for (const [position, line] of logs.entries()) {
      expect(line.includes(cases[position].question.trim())).toBe(false)
    }
  }, 600_000)
})
