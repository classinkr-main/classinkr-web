import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { compileAnswerIndex, type CompiledAnswerIndex } from "@/lib/chatbot/answer-index/compile"
import { loadAnswerIndexData, type AnswerIndexLoadOptions } from "@/lib/chatbot/answer-index/load"
import type { AnswerIndexUnitsFile } from "@/lib/chatbot/answer-index/types"

/**
 * 답 색인 시험용 가짜 자료(fixtures/basic): merge.ts 결과 꼴(cards/<영역>.json, variants/<영역>.json, universe/<샤드>.json,
 * lexicon·generic-words·absent·legacy-alias·calibration·manifest). units.json 은 런타임이 읽지 않는 '지금 문서' 대신이다.
 * 확인용으로 review 카드·낡은 카드·합치지 않은 조각·깨진 eval 파일이 들어 있다.
 */
export const FIXTURE_DIR = join(__dirname, "fixtures", "basic")

export function fixtureUnits(dir = FIXTURE_DIR) {
  return (JSON.parse(readFileSync(join(dir, "units.json"), "utf8")) as AnswerIndexUnitsFile).units
}

export function fixtureLoadOptions(dir = FIXTURE_DIR, extra: AnswerIndexLoadOptions = {}): AnswerIndexLoadOptions {
  return { dir, currentUnits: fixtureUnits(), symptomTopics: new Set(), guides: new Set(), ...extra }
}

export function compileFixture(dir = FIXTURE_DIR, extra: AnswerIndexLoadOptions = {}): CompiledAnswerIndex {
  return compileAnswerIndex(loadAnswerIndexData(fixtureLoadOptions(dir, extra)))
}

/** 가짜 자료를 임시 폴더로 복사한다(고쳐 보는 시험용). */
export function copyFixture() {
  const dir = mkdtempSync(join(tmpdir(), "answer-index-fixture-"))
  cpSync(FIXTURE_DIR, dir, { recursive: true })
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

export const CARDS = {
  chat: "doc:/docs/fake/chat#0/chat-ban",
  kick: "doc:/docs/fake/kick#0/kick",
  remove: "doc:/docs/fake/members#0/remove",
  replay: "doc:/docs/fake/recording#0/replay",
  download: "doc:/docs/fake/recording#1/download",
  count: "doc:/docs/fake/students#0/student-count",
  edit: "doc:/docs/fake/edit#0/board-edit",
  price: "fixed:fake-price",
  gapCert: "gap:trust/security-certification",
  gapHours: "gap:support/phone-hours",
  handoff: "handoff:support",
} as const
