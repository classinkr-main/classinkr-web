import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import type { AnswerIndexUnit, SiteFact } from "@/lib/chatbot/answer-index/types"
import { stableJson } from "@/scripts/answer-index/lib/common"
import { buildUnitsFile } from "@/scripts/answer-index/lib/units"
import type { CurrentSources } from "@/scripts/answer-index/lib/verify-core"

/** 임시 자료 폴더(data/answer-index 꼴). 끝나면 cleanup() 으로 지운다. */
export function makeDataDir(files: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "answer-index-test-"))
  for (const [rel, value] of Object.entries(files)) writeDataFile(dir, rel, value)
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

export function writeDataFile(dir: string, rel: string, value: unknown) {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, typeof value === "string" ? value : stableJson(value))
}

export function baseFiles(units: AnswerIndexUnit[], siteFacts: SiteFact[]) {
  return { "units.json": buildUnitsFile(units), "site-facts.json": siteFacts }
}

/** 시험용 '지금 원천'. 옛 답·증상 주제·가이드는 비워 두고 필요한 시험만 채운다. */
export function currentSources(units: AnswerIndexUnit[], siteFacts: SiteFact[], extra: Partial<CurrentSources> = {}): CurrentSources {
  return {
    units,
    siteFacts,
    inventory: new Map(),
    symptomTopics: new Set(),
    guides: new Set(),
    ...extra,
  }
}
