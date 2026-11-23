/**
 * data/answer-index 자료 읽기. 파일마다 어디서 왔는지(file)를 붙여 둔다(verify 결과를 파일별로 보이고 --only 로 거르려고).
 *
 * 파일 종류(경로는 data/answer-index 기준):
 * - units.json · site-facts.json · inventory.json · manifest.json · calibration.json
 * - cards/<이름>.json(카드·nav 표시 배열) · variants/<이름>.json(카드 id → 변형) · universe/<이름>.json(우주 항목 배열)
 * - lexicon[.<조각>].json · generic-words[.<조각>].json · absent[.<조각>].json · legacy-alias[.<조각>].json
 * - audit/<묶음>.jsonl(줄마다 점검 기록) · audit/human-queue[.<조각>].json
 * - eval/calibration-set.json · eval/answer-keys/<묶음>.json
 * 이름에 점이 하나 더 있으면(account.D1-07.json) 아직 합치지 않은 조각이다(merge.ts 가 합친다).
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type {
  AbsentConcept,
  AnswerCard,
  AnswerIndexInventoryFile,
  AnswerIndexManifest,
  AnswerIndexUnitsFile,
  AnswerKeysFile,
  AnswerVariant,
  AuditRecord,
  CalibrationFile,
  CalibrationSetFile,
  CardFileEntry,
  GenericWordsFile,
  HumanQueueFile,
  LexiconConcept,
  NavMarker,
  SiteFact,
  UniverseItem,
} from "@/lib/chatbot/answer-index/types"
import { isNavMarker } from "@/lib/chatbot/answer-index/types"
import { dataDir, listFilesRecursive, toRepoPath } from "./common"

export interface Located<T> {
  /** data/answer-index 기준 경로. */
  file: string
  /** 파일 안 위치(배열 번호 또는 jsonl 줄 번호). */
  at: number | string
  value: T
}

export type DataFileKind =
  | "units"
  | "site-facts"
  | "inventory"
  | "manifest"
  | "calibration"
  | "cards"
  | "variants"
  | "universe"
  | "lexicon"
  | "generic-words"
  | "absent"
  | "legacy-alias"
  | "audit"
  | "human-queue"
  | "calibration-set"
  | "answer-keys"
  | "unknown"

export function classifyDataFile(rel: string): DataFileKind {
  if (rel === "units.json") return "units"
  if (rel === "site-facts.json") return "site-facts"
  if (rel === "inventory.json") return "inventory"
  if (rel === "manifest.json") return "manifest"
  if (rel === "calibration.json") return "calibration"
  if (/^cards\/[^/]+\.json$/.test(rel)) return "cards"
  if (/^variants\/[^/]+\.json$/.test(rel)) return "variants"
  if (/^universe\/[^/]+\.json$/.test(rel)) return "universe"
  if (/^lexicon(?:\.[^/]+)?\.json$/.test(rel)) return "lexicon"
  if (/^generic-words(?:\.[^/]+)?\.json$/.test(rel)) return "generic-words"
  if (/^absent(?:\.[^/]+)?\.json$/.test(rel)) return "absent"
  if (/^legacy-alias(?:\.[^/]+)?\.json$/.test(rel)) return "legacy-alias"
  if (/^audit\/human-queue(?:\.[^/]+)?\.json$/.test(rel)) return "human-queue"
  if (/^audit\/[^/]+\.jsonl$/.test(rel)) return "audit"
  if (rel === "eval/calibration-set.json") return "calibration-set"
  if (/^eval\/answer-keys\/[^/]+\.json$/.test(rel)) return "answer-keys"
  return "unknown"
}

/** account.D1-07.json → { base: "account", part: "D1-07" }. 조각이 아니면 part 는 null. */
export function splitPartName(rel: string) {
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : ""
  const file = rel.slice(dir.length)
  const ext = file.endsWith(".jsonl") ? ".jsonl" : file.endsWith(".json") ? ".json" : ""
  const stem = file.slice(0, file.length - ext.length)
  const dot = stem.indexOf(".")
  if (dot < 0) return { base: rel, part: null as string | null }
  return { base: `${dir}${stem.slice(0, dot)}${ext}`, part: stem.slice(dot + 1) }
}

export interface ParseProblem {
  file: string
  message: string
}

export interface AnswerIndexData {
  dir: string
  files: string[]
  units: AnswerIndexUnitsFile | null
  siteFacts: SiteFact[] | null
  inventory: AnswerIndexInventoryFile | null
  manifest: AnswerIndexManifest | null
  calibration: Located<CalibrationFile> | null
  cards: Located<AnswerCard>[]
  navs: Located<NavMarker>[]
  variants: Located<{ cardId: string; variant: AnswerVariant }>[]
  /** 변형 파일에 나온 카드 id(빈 배열 포함). */
  variantKeys: Located<string>[]
  universe: Located<UniverseItem>[]
  lexicon: Located<LexiconConcept>[]
  genericWords: Located<GenericWordsFile>[]
  absent: Located<AbsentConcept>[]
  legacyAlias: Located<{ key: string; target: string | null }>[]
  audits: Located<AuditRecord>[]
  humanQueue: Located<HumanQueueFile["items"][number]>[]
  calibrationSet: Located<CalibrationSetFile> | null
  answerKeys: Located<AnswerKeysFile>[]
  /** 파일 안의 날 값(스키마 검사용). */
  raw: Map<string, unknown>
  parseProblems: ParseProblem[]
  unknownFiles: string[]
}

function parseJson(abs: string) {
  return JSON.parse(readFileSync(abs, "utf8")) as unknown
}

export function loadAnswerIndexData(dir = dataDir()): AnswerIndexData {
  const data: AnswerIndexData = {
    dir,
    files: [],
    units: null,
    siteFacts: null,
    inventory: null,
    manifest: null,
    calibration: null,
    cards: [],
    navs: [],
    variants: [],
    variantKeys: [],
    universe: [],
    lexicon: [],
    genericWords: [],
    absent: [],
    legacyAlias: [],
    audits: [],
    humanQueue: [],
    calibrationSet: null,
    answerKeys: [],
    raw: new Map(),
    parseProblems: [],
    unknownFiles: [],
  }
  if (!existsSync(dir)) return data
  for (const abs of listFilesRecursive(dir)) {
    const rel = toRepoPath(abs, dir)
    data.files.push(rel)
    const kind = classifyDataFile(rel)
    if (kind === "unknown") {
      data.unknownFiles.push(rel)
      continue
    }
    try {
      if (kind === "audit") {
        const lines = readFileSync(abs, "utf8").split(/\r?\n/)
        lines.forEach((line, index) => {
          if (!line.trim()) return
          try {
            data.audits.push({ file: rel, at: index + 1, value: JSON.parse(line) as AuditRecord })
          } catch (error) {
            data.parseProblems.push({ file: rel, message: `${index + 1}번째 줄 JSON 오류: ${(error as Error).message}` })
          }
        })
        continue
      }
      const value = parseJson(abs)
      data.raw.set(rel, value)
      addParsed(data, kind, rel, value)
    } catch (error) {
      data.parseProblems.push({ file: rel, message: `JSON 오류: ${(error as Error).message}` })
    }
  }
  return data
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function addParsed(data: AnswerIndexData, kind: DataFileKind, rel: string, value: unknown) {
  switch (kind) {
    case "units":
      data.units = value as AnswerIndexUnitsFile
      return
    case "site-facts":
      data.siteFacts = value as SiteFact[]
      return
    case "inventory":
      data.inventory = value as AnswerIndexInventoryFile
      return
    case "manifest":
      data.manifest = value as AnswerIndexManifest
      return
    case "calibration":
      data.calibration = { file: rel, at: 0, value: value as CalibrationFile }
      return
    case "cards":
      asArray(value).forEach((entry, index) => {
        const item = entry as CardFileEntry
        if (item && typeof item === "object" && isNavMarker(item)) data.navs.push({ file: rel, at: index, value: item })
        else data.cards.push({ file: rel, at: index, value: item as AnswerCard })
      })
      return
    case "variants":
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [cardId, list] of Object.entries(value as Record<string, unknown>)) {
          data.variantKeys.push({ file: rel, at: cardId, value: cardId })
          asArray(list).forEach((variant, index) => {
            data.variants.push({ file: rel, at: `${cardId}[${index}]`, value: { cardId, variant: variant as AnswerVariant } })
          })
        }
      }
      return
    case "universe":
      asArray(value).forEach((item, index) => data.universe.push({ file: rel, at: index, value: item as UniverseItem }))
      return
    case "lexicon":
      asArray(value).forEach((item, index) => data.lexicon.push({ file: rel, at: index, value: item as LexiconConcept }))
      return
    case "generic-words":
      data.genericWords.push({ file: rel, at: 0, value: value as GenericWordsFile })
      return
    case "absent":
      asArray(value).forEach((item, index) => data.absent.push({ file: rel, at: index, value: item as AbsentConcept }))
      return
    case "legacy-alias":
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [key, target] of Object.entries(value as Record<string, unknown>)) {
          data.legacyAlias.push({ file: rel, at: key, value: { key, target: (target as string | null) ?? null } })
        }
      }
      return
    case "human-queue":
      asArray((value as HumanQueueFile | null)?.items).forEach((item, index) =>
        data.humanQueue.push({ file: rel, at: index, value: item as HumanQueueFile["items"][number] })
      )
      return
    case "calibration-set":
      data.calibrationSet = { file: rel, at: 0, value: value as CalibrationSetFile }
      return
    case "answer-keys":
      data.answerKeys.push({ file: rel, at: 0, value: value as AnswerKeysFile })
      return
    default:
      return
  }
}

export function dataFilePath(dir: string, rel: string) {
  return join(dir, rel)
}
