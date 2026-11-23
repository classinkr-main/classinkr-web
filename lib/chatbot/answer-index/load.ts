/**
 * 답 색인 자료 읽기와 프로세스 안 색인(사양 §3.1 load.ts, §3.10 1안).
 *
 * - data/answer-index/ 의 런타임 자료만 읽는다: cards/<영역>.json, variants/<영역>.json, universe/<샤드>.json,
 *   lexicon.json, generic-words.json, absent.json, legacy-alias.json, calibration.json, manifest.json(판 이름만).
 *   eval/·audit/·inventory.json·units.json·site-facts.json 은 읽지 않는다. 합치지 않은 조각(cards/account.D1-07.json 처럼
 *   이름에 점이 하나 더 있는 파일)도 읽지 않고 skipped 에 적는다(scripts/answer-index/merge.ts 로 합친 뒤 쓴다).
 * - 카드마다 문장 (단위, 번호, 해시)를 '지금 문서'(lib/docs 로 다시 나눈 단위)와 대조해 어긋나면 그 카드를 색인에서 뺀다.
 *   status 가 active 가 아닌 카드(review·disabled)도 뺀다. 뺀 카드는 excluded 에 이유와 함께 남는다.
 * - getAnswerIndex() 는 첫 호출에 읽고 컴파일해 프로세스에 둔다(getPublicDocOutline 과 같은 지연 생성).
 *
 * 네트워크·모델 호출 없음. 자료가 0장이어도 색인은 만들어지고 판정은 언제나 abstain 이다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { CS_FIGMA_GUIDES, INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS } from "@/lib/cs-figma-guides"
import { SYMPTOM_TOPICS } from "@/lib/chatbot/symptom-triage"
import { listDocs } from "@/lib/docs"
import { ANSWER_INDEX_COMPILER_VERSION, compileAnswerIndex, type CompiledAnswerIndex } from "./compile"
import { buildUnitsFromSources } from "./doc-units"
import { answerTextHash } from "./hash"
import {
  ANSWER_CARD_KINDS,
  isAnswerIndexArea,
  isNavMarker,
  type AbsentConcept,
  type AnswerCard,
  type AnswerIndexUnit,
  type AnswerVariant,
  type CalibrationFile,
  type CardFileEntry,
  type CuratedRef,
  type GenericWordsFile,
  type LegacyAliasFile,
  type LexiconConcept,
  type SingleSentenceRef,
  type UniverseItem,
} from "./types"

export const ANSWER_INDEX_DATA_DIR_REL = "data/answer-index"

/**
 * 자료 폴더: ANSWER_INDEX_DATA_DIR(측정·시험용, 상대 경로는 작업 폴더 기준 절대 경로로) 또는 <cwd>/data/answer-index.
 * 판정할 때마다 읽는다: 값을 바꾸면 색인 캐시(폴더가 바뀌면 다시 만듦)와 판(answerIndexVersion)도 그 폴더 것으로 바뀐다.
 */
export function answerIndexDataDir(env: Record<string, string | undefined> = process.env) {
  const configured = env.ANSWER_INDEX_DATA_DIR?.trim()
  return configured
    ? resolve(/* turbopackIgnore: true */ process.cwd(), configured)
    : join(/* turbopackIgnore: true */ process.cwd(), ANSWER_INDEX_DATA_DIR_REL)
}

/** 지금 문서 단위(문장 해시만 쓰면 되지만 respond·BM25 가 글도 쓴다). */
export type CurrentUnits = ReadonlyMap<string, AnswerIndexUnit>

export interface AnswerIndexLoadOptions {
  dir?: string
  /** 지금 문서 단위. 없으면 lib/docs·cs-figma-guides 로 만든다(시험은 가짜 단위를 넘긴다). */
  currentUnits?: CurrentUnits | readonly AnswerIndexUnit[]
  /** howto 카드의 증상 주제 id. 없으면 symptom-triage 의 주제 + vague-error. */
  symptomTopics?: ReadonlySet<string>
  /** howto 카드의 가이드 slug. 없으면 공개 CS_FIGMA_GUIDES. */
  guides?: ReadonlySet<string>
  /**
   * KEEP 카드(curatedRef)의 지금 옛 답 글 해시. 옛 답 함수를 부르는 respond(I7)가 넘긴다.
   * 없으면 확인하지 않고 report.curatedUnchecked 에 센다. null·undefined 를 돌려주면 그 옛 답이 없다는 뜻이라 카드를 뺀다.
   */
  curatedTextHash?: (ref: CuratedRef) => string | null | undefined
}

export interface ExcludedCard {
  id: string
  file: string
  reason: string
}

export interface LoadedAnswerIndexData {
  dir: string
  /** manifest.json 의 dataVersion(없으면 "ai-none"). */
  dataVersion: string
  /** 색인에 넣을 카드(status active, 문장 해시·답 글 해시 일치). 파일 이름순·파일 안 순서. */
  cards: AnswerCard[]
  excluded: ExcludedCard[]
  /** 색인에 넣는 카드의 변형(카드 id → 변형, 파일 이름순으로 이어 붙임). */
  variants: Map<string, AnswerVariant[]>
  universe: UniverseItem[]
  lexicon: LexiconConcept[]
  genericWords: GenericWordsFile | null
  absent: AbsentConcept[]
  legacyAlias: LegacyAliasFile
  calibration: CalibrationFile | null
  currentUnits: CurrentUnits
  /** 읽은 파일(자료 폴더 기준). */
  files: string[]
  /** 읽지 않은 파일(합치지 않은 조각, 이름 규칙 밖). */
  skipped: string[]
  problems: string[]
  report: { curatedUnchecked: number }
}

// ─── 파일 ────────────────────────────────────────────────────────────────

/** 조각 이름(cards/account.D1-07.json, lexicon.D6-03.json)인지: 파일 이름의 확장자 앞에 점이 하나 더 있다. */
export function isPartFileName(fileName: string) {
  const stem = fileName.replace(/\.jsonl?$/, "")
  return stem.includes(".")
}

function listJson(dir: string) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && statSync(join(dir, name)).isFile())
    .sort()
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"))
}

const TOP_FILES = ["lexicon.json", "generic-words.json", "absent.json", "legacy-alias.json", "calibration.json", "manifest.json"]
const RUNTIME_DIRS = ["cards", "variants", "universe"] as const
// 런타임이 읽지 않는 것(있어도 skipped 에 적지 않는다).
const NON_RUNTIME = new Set(["units.json", "site-facts.json", "inventory.json", "audit", "eval"])

// ─── 지금 문서 ───────────────────────────────────────────────────────────

let currentUnitsCache: Map<string, AnswerIndexUnit> | null = null

/** lib/docs·cs-figma-guides 로 지금 문서 단위를 만든다(영역은 런타임에 쓰지 않아 support 로 둔다). */
export function buildCurrentUnits(): Map<string, AnswerIndexUnit> {
  if (currentUnitsCache) return currentUnitsCache
  const units = buildUnitsFromSources(
    { docs: listDocs(), guides: CS_FIGMA_GUIDES.filter((guide) => !INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS.has(guide.docSlug)) },
    () => "support"
  )
  currentUnitsCache = new Map(units.map((unit) => [unit.unitId, unit]))
  return currentUnitsCache
}

function toUnitMap(units: CurrentUnits | readonly AnswerIndexUnit[]): CurrentUnits {
  if (units instanceof Map) return units
  return new Map((units as readonly AnswerIndexUnit[]).map((unit) => [unit.unitId, unit]))
}

// ─── 카드 확인 ───────────────────────────────────────────────────────────

interface CardCheckContext {
  units: CurrentUnits
  symptomTopics: ReadonlySet<string>
  guides: ReadonlySet<string>
  curatedTextHash?: AnswerIndexLoadOptions["curatedTextHash"]
  report: { curatedUnchecked: number }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function refProblem(units: CurrentUnits, unitId: string, i: number, hash: string | undefined, label: string) {
  const unit = units.get(unitId)
  if (!unit) return `${label}: 단위 없음(${unitId})`
  const sentence = unit.sentences[i]
  if (!sentence) return `${label}: 문장 번호 없음(${unitId} #${i})`
  if (hash !== undefined && sentence.hash !== hash) return `${label}: 해시 다름(${unitId} #${i})`
  return null
}

/** 카드가 지금 문서·옛 답과 맞는지. 맞지 않으면 이유(문자열), 맞으면 null. */
export function cardStaleReason(card: AnswerCard, context: CardCheckContext): string | null {
  const answer = (card as { answer?: unknown }).answer
  if (!isObject(answer)) return "schema: answer 없음"
  switch (card.kind) {
    case "doc": {
      const refs = Array.isArray(answer.sentences) ? (answer.sentences as unknown[]) : []
      if (refs.length === 0) return "schema: 답 문장 없음"
      for (const ref of refs) {
        if (!isObject(ref) || typeof ref.unit !== "string" || !Array.isArray(ref.ids) || !Array.isArray(ref.hashes)) return "schema: 답 문장 꼴"
        if (ref.ids.length !== ref.hashes.length || ref.ids.length === 0) return `schema: ids·hashes 길이(${ref.unit})`
        for (let k = 0; k < ref.ids.length; k += 1) {
          const problem = refProblem(context.units, ref.unit, Number(ref.ids[k]), String(ref.hashes[k]), "답 문장")
          if (problem) return `stale: ${problem}`
        }
      }
      const lead = answer.leadBasis as SingleSentenceRef | undefined
      if (lead && isObject(lead)) {
        const problem = refProblem(context.units, lead.unit, lead.i, lead.hash, "리드 근거")
        if (problem) return `stale: ${problem}`
      }
      return null
    }
    case "howto": {
      const topic = typeof answer.symptomTopic === "string" ? answer.symptomTopic : null
      const guide = typeof answer.guide === "string" ? answer.guide : null
      if (!topic && !guide) return "schema: symptomTopic·guide 없음"
      if (topic && !context.symptomTopics.has(topic)) return `stale: 증상 주제 없음(${topic})`
      if (guide && !context.guides.has(guide)) return `stale: 가이드 없음(${guide})`
      return null
    }
    case "fixed":
    case "policy": {
      if (isObject(answer.curatedRef)) {
        const ref = answer.curatedRef as unknown as CuratedRef
        if (!context.curatedTextHash) {
          context.report.curatedUnchecked += 1
          return null
        }
        const now = context.curatedTextHash(ref)
        if (!now) return `stale: 옛 답 없음(${ref.module}:${ref.id})`
        return now === ref.textHash ? null : `stale: 옛 답 글 해시 다름(${ref.module}:${ref.id})`
      }
      if (typeof answer.text !== "string" || typeof answer.textHash !== "string") return "schema: text·textHash 없음"
      if (answerTextHash(answer.text) !== answer.textHash) return "stale: 답 글 해시 다름"
      if (card.kind === "policy" && typeof answer.policyRef !== "string") return "schema: policyRef 없음"
      return null
    }
    case "gap": {
      for (const ref of Array.isArray(answer.related) ? (answer.related as SingleSentenceRef[]) : []) {
        if (!isObject(ref)) return "schema: related 꼴"
        const problem = refProblem(context.units, ref.unit, ref.i, ref.hash, "관련 문장")
        if (problem) return `stale: ${problem}`
      }
      return null
    }
    case "handoff":
      return typeof answer.handoffKind === "string" ? null : "schema: handoffKind 없음"
    default:
      return "schema: 알 수 없는 종류"
  }
}

function cardShapeProblem(value: unknown): string | null {
  if (!isObject(value)) return "schema: 카드가 객체가 아님"
  if (typeof value.id !== "string" || !value.id) return "schema: id 없음"
  if (!ANSWER_CARD_KINDS.includes(value.kind as AnswerCard["kind"])) return `schema: 종류(${String(value.kind)})`
  if (!isAnswerIndexArea(value.area)) return `schema: 영역(${String(value.area)})`
  if (typeof value.topic !== "string") return "schema: topic 없음"
  return null
}

// ─── 읽기 ────────────────────────────────────────────────────────────────

export function loadAnswerIndexData(options: AnswerIndexLoadOptions = {}): LoadedAnswerIndexData {
  const dir = options.dir ?? answerIndexDataDir()
  const files: string[] = []
  const skipped: string[] = []
  const problems: string[] = []
  const report = { curatedUnchecked: 0 }
  const read = (rel: string): unknown => {
    try {
      const value = readJson(join(dir, rel))
      files.push(rel)
      return value
    } catch (error) {
      problems.push(`${rel}: JSON 오류(${(error as Error).message})`)
      return null
    }
  }

  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (NON_RUNTIME.has(name) || TOP_FILES.includes(name) || (RUNTIME_DIRS as readonly string[]).includes(name)) continue
      skipped.push(name)
    }
  }
  const top = (name: string) => (existsSync(join(dir, name)) ? read(name) : null)
  const manifest = top("manifest.json") as { dataVersion?: string } | null
  const lexicon = top("lexicon.json")
  const genericWords = top("generic-words.json")
  const absent = top("absent.json")
  const legacyAlias = top("legacy-alias.json")
  const calibration = top("calibration.json")

  const listed = (sub: (typeof RUNTIME_DIRS)[number]) =>
    listJson(join(dir, sub)).filter((name) => {
      if (!isPartFileName(name)) return true
      skipped.push(`${sub}/${name}`)
      return false
    })

  // 카드: 파일 이름순, 파일 안 순서. 같은 id 는 처음 것만.
  const units = options.currentUnits ? toUnitMap(options.currentUnits) : buildCurrentUnits()
  const context: CardCheckContext = {
    units,
    symptomTopics: options.symptomTopics ?? new Set([...SYMPTOM_TOPICS.map((topic) => topic.id), "vague-error"]),
    guides: options.guides ?? new Set(CS_FIGMA_GUIDES.map((guide) => guide.slug)),
    curatedTextHash: options.curatedTextHash,
    report,
  }
  const cards: AnswerCard[] = []
  const excluded: ExcludedCard[] = []
  const seen = new Set<string>()
  for (const name of listed("cards")) {
    const rel = `cards/${name}`
    const value = read(rel)
    if (!Array.isArray(value)) {
      if (value !== null) problems.push(`${rel}: 배열이 아님`)
      continue
    }
    for (const entry of value as CardFileEntry[]) {
      if (isObject(entry) && isNavMarker(entry)) continue
      const shape = cardShapeProblem(entry)
      const id = isObject(entry) && typeof entry.id === "string" ? entry.id : "(id 없음)"
      if (shape) {
        excluded.push({ id, file: rel, reason: shape })
        continue
      }
      const card = entry as AnswerCard
      if (seen.has(card.id)) {
        excluded.push({ id: card.id, file: rel, reason: "duplicate: 같은 id 가 앞 파일에 있음" })
        continue
      }
      seen.add(card.id)
      if (card.status !== "active") {
        excluded.push({ id: card.id, file: rel, reason: `status: ${String(card.status)}` })
        continue
      }
      const stale = cardStaleReason(card, context)
      if (stale) {
        excluded.push({ id: card.id, file: rel, reason: stale })
        continue
      }
      cards.push(card)
    }
  }
  const active = new Set(cards.map((card) => card.id))

  // 변형: 색인에 넣는 카드 것만. 파일 이름순으로 이어 붙인다.
  const variants = new Map<string, AnswerVariant[]>()
  for (const name of listed("variants")) {
    const rel = `variants/${name}`
    const value = read(rel)
    if (!isObject(value)) {
      if (value !== null) problems.push(`${rel}: 객체가 아님`)
      continue
    }
    for (const [cardId, list] of Object.entries(value)) {
      if (!active.has(cardId) || !Array.isArray(list)) continue
      const target = variants.get(cardId) ?? []
      for (const variant of list as AnswerVariant[]) if (isObject(variant) && typeof variant.q === "string" && variant.q.trim()) target.push(variant)
      variants.set(cardId, target)
    }
  }

  const universe: UniverseItem[] = []
  for (const name of listed("universe")) {
    const rel = `universe/${name}`
    const value = read(rel)
    if (!Array.isArray(value)) {
      if (value !== null) problems.push(`${rel}: 배열이 아님`)
      continue
    }
    for (const item of value as UniverseItem[]) if (isObject(item) && typeof item.id === "string" && typeof item.q === "string") universe.push(item)
  }

  return {
    dir,
    dataVersion: typeof manifest?.dataVersion === "string" && manifest.dataVersion ? manifest.dataVersion : "ai-none",
    cards,
    excluded,
    variants,
    universe,
    lexicon: Array.isArray(lexicon) ? (lexicon as LexiconConcept[]).filter((concept) => isObject(concept) && typeof concept.id === "string") : [],
    genericWords: isObject(genericWords) ? (genericWords as unknown as GenericWordsFile) : null,
    absent: Array.isArray(absent) ? (absent as AbsentConcept[]).filter((item) => isObject(item) && typeof item.id === "string") : [],
    legacyAlias: isObject(legacyAlias) ? (legacyAlias as LegacyAliasFile) : {},
    calibration: isObject(calibration) ? (calibration as unknown as CalibrationFile) : null,
    currentUnits: units,
    files,
    skipped,
    problems,
    report,
  }
}

// ─── 프로세스 안 색인 ────────────────────────────────────────────────────

function readManifestVersion(dir: string) {
  try {
    const value = readJson(join(dir, "manifest.json")) as { dataVersion?: unknown }
    return typeof value.dataVersion === "string" && value.dataVersion ? value.dataVersion : "ai-none"
  } catch {
    return "ai-none"
  }
}

const versionByDir = new Map<string, string>()

/**
 * 답 색인 판(답 캐시 열쇠·흔적용): 그 자료 폴더의 자료 판(manifest dataVersion) + 계산 규칙 판(ANSWER_INDEX_COMPILER_VERSION).
 * 자료 폴더(ANSWER_INDEX_DATA_DIR)·자료·계산 규칙이 바뀌면 바뀐다. 폴더마다 manifest 를 한 번만 읽는다(색인과 같이
 * resetAnswerIndexCache 로 버린다). 색인 판(answerIndexVersionOf)과 같은 값이다: load 도 manifest 의 dataVersion 을 쓴다.
 */
export function answerIndexVersion(dir: string = answerIndexDataDir()) {
  let version = versionByDir.get(dir)
  if (version === undefined) {
    version = `${readManifestVersion(dir)}+c${ANSWER_INDEX_COMPILER_VERSION}`
    versionByDir.set(dir, version)
  }
  return version
}

/** 모듈을 처음 읽을 때의 자료 폴더 판. 폴더를 바꿔 가며 쓰는 곳(답 캐시 열쇠·흔적)은 answerIndexVersion() 을 부른다. */
export const ANSWER_INDEX_VERSION = answerIndexVersion()

let cached: { dir: string; index: CompiledAnswerIndex } | null = null

/**
 * 프로세스 안 색인. 첫 호출에 자료를 읽고 컴파일해 둔다(같은 자료 폴더면 다시 만들지 않는다).
 * options 를 주면(시험·측정) 매번 새로 만들고 캐시에 넣지 않는다.
 */
export function getAnswerIndex(options?: AnswerIndexLoadOptions): CompiledAnswerIndex {
  if (options) return compileAnswerIndex(loadAnswerIndexData(options))
  const dir = answerIndexDataDir()
  if (cached && cached.dir === dir) return cached.index
  const index = compileAnswerIndex(loadAnswerIndexData({ dir }))
  cached = { dir, index }
  return index
}

/** 시험용: 프로세스 안 색인과 폴더별 판을 버린다. */
export function resetAnswerIndexCache() {
  cached = null
  versionByDir.clear()
}
