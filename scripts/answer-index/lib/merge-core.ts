/**
 * 단위별로 나눠 쓴 자료 조각을 합친다(§12.2 '병렬로 나누는 법'). CLI 는 scripts/answer-index/merge.ts.
 *
 * 조각 이름: <기본 이름>.<조각>.json(l) — cards/account.D1-07.json → cards/account.json,
 * variants/account.D1-07.json → variants/account.json, universe/s003.D9-12.json → universe/s003.json,
 * audit/C-02.D3-02b.jsonl → audit/C-02.jsonl, lexicon.D6-03.json → lexicon.json, legacy-alias.D4-01.json → legacy-alias.json 등.
 *
 * 합치는 규칙(조각은 이름순):
 * - 카드: id 로 합친다. 같은 id 가 다르면 충돌(--replace 면 나중 것으로 바꿈). nav 표시는 unitId 로 하나만.
 * - 변형: 카드별로 덧붙인다. 같은 정규화 변형이 이미 있으면(다른 카드 포함) 나중 것을 버리고 알린다(V-4).
 * - 우주: id 로 합친다. 비어 있는 칸(label·label2·conf·labeler)은 조각 값으로 채우고, 이미 있는 값과 다르면 충돌.
 * - 사전: 개념 id 로 합치고 형태·상위 개념·모호 규칙을 합집합으로. kind·generic 이 다르면 충돌.
 * - 없는 개념·사람 결정 대기열·옛 id 대응·점검 기록·정답 키: id(키)로 합친다. 다르면 충돌.
 * 충돌이 하나라도 있는 기본 파일은 쓰지 않는다(조각도 지우지 않는다).
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type {
  AbsentConcept,
  AnswerKeysFile,
  AnswerVariant,
  AuditRecord,
  CardFileEntry,
  GenerationRecord,
  GenericWordsFile,
  HumanQueueFile,
  LexiconConcept,
  LexiconForm,
  UniverseItem,
} from "@/lib/chatbot/answer-index/types"
import { isNavMarker } from "@/lib/chatbot/answer-index/types"
import { dataDir, listFilesRecursive, sha16Bytes, stableJson, toRepoPath } from "./common"
import { classifyDataFile, splitPartName, type DataFileKind } from "./data"
import { updateManifest } from "./manifest"
import { normalizeForOverlap } from "./similarity"

export interface MergeOptions {
  dir?: string
  /** 합칠 조각(data/answer-index 기준). 없으면 조각 전부. */
  parts?: string[]
  replace?: boolean
  keepParts?: boolean
  dryRun?: boolean
}

export interface MergeReport {
  base: string
  parts: string[]
  added: number
  replaced: number
  dropped: string[]
  conflicts: string[]
  written: boolean
}

const MERGEABLE: DataFileKind[] = [
  "cards",
  "variants",
  "universe",
  "lexicon",
  "generic-words",
  "absent",
  "legacy-alias",
  "audit",
  "human-queue",
  "answer-keys",
]

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function readValue(abs: string, kind: DataFileKind): unknown {
  if (!existsSync(abs)) return null
  const text = readFileSync(abs, "utf8")
  if (kind === "audit") return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown)
  return JSON.parse(text) as unknown
}

/** 조각 하나에 든 항목 수(생성 기록용). */
function countItems(value: unknown, kind: DataFileKind) {
  if (Array.isArray(value)) return value.length
  if (!value || typeof value !== "object") return 0
  if (kind === "variants") return Object.values(value as Record<string, unknown[]>).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0)
  if (kind === "human-queue") return ((value as HumanQueueFile).items ?? []).length
  if (kind === "answer-keys") return ((value as AnswerKeysFile).keys ?? []).length
  if (kind === "generic-words") return Object.values(value as Record<string, unknown[]>).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0)
  return Object.keys(value).length
}

function serialize(value: unknown, kind: DataFileKind) {
  if (kind === "audit") return `${(value as unknown[]).map((record) => JSON.stringify(record)).join("\n")}\n`
  return stableJson(value)
}

/** 조각 목록: 기본 이름별로 묶는다. */
export function findPartFiles(dir = dataDir()) {
  const groups = new Map<string, string[]>()
  for (const abs of listFilesRecursive(dir)) {
    const rel = toRepoPath(abs, dir)
    const { base, part } = splitPartName(rel)
    if (!part) continue
    const kind = classifyDataFile(rel)
    if (!MERGEABLE.includes(kind)) continue
    const list = groups.get(base) ?? []
    list.push(rel)
    groups.set(base, list)
  }
  for (const list of groups.values()) list.sort()
  return groups
}

interface MergeState<T> {
  value: T
  added: number
  replaced: number
  dropped: string[]
  conflicts: string[]
}

function keyedMerge<T>(
  base: T[],
  incoming: T[],
  keyOf: (item: T) => string,
  label: string,
  replace: boolean,
  state: { added: number; replaced: number; conflicts: string[] }
) {
  const out = [...base]
  const index = new Map(out.map((item, position) => [keyOf(item), position]))
  for (const item of incoming) {
    const key = keyOf(item)
    const position = index.get(key)
    if (position === undefined) {
      index.set(key, out.length)
      out.push(item)
      state.added += 1
    } else if (!same(out[position], item)) {
      if (replace) {
        out[position] = item
        state.replaced += 1
      } else state.conflicts.push(`${label} ${key}: 이미 있는 값과 다름(--replace 면 나중 것으로 바꿈)`)
    }
  }
  return out
}

function mergeForms(a: LexiconForm[], b: LexiconForm[]) {
  const out = [...a]
  const keys = new Set(a.map((form) => JSON.stringify(typeof form === "string" ? form : [form.form, form.boundary])))
  for (const form of b) {
    const key = JSON.stringify(typeof form === "string" ? form : [form.form, form.boundary])
    if (!keys.has(key)) {
      keys.add(key)
      out.push(form)
    }
  }
  return out
}

/** 다른 변형 파일(합치는 대상 밖)의 정규화 변형 → 카드 id. */
function existingVariantOwners(dir: string, exclude: Set<string>) {
  const owners = new Map<string, string>()
  for (const abs of listFilesRecursive(join(dir, "variants"))) {
    const rel = toRepoPath(abs, dir)
    if (exclude.has(rel) || splitPartName(rel).part) continue
    const value = JSON.parse(readFileSync(abs, "utf8")) as Record<string, AnswerVariant[]>
    for (const [cardId, list] of Object.entries(value)) for (const variant of list ?? []) {
      const key = normalizeForOverlap(variant.q ?? "")
      if (key && !owners.has(key)) owners.set(key, cardId)
    }
  }
  return owners
}

function mergeGroup(dir: string, base: string, parts: string[], options: MergeOptions, variantOwners: Map<string, string>): MergeState<unknown> {
  const kind = classifyDataFile(base)
  const replace = Boolean(options.replace)
  const state = { added: 0, replaced: 0, dropped: [] as string[], conflicts: [] as string[] }
  let value: unknown = readValue(join(dir, base), kind)
  for (const part of parts) {
    const incoming = readValue(join(dir, part), kind)
    switch (kind) {
      case "cards": {
        const current = (value as CardFileEntry[] | null) ?? []
        const entries = (incoming as CardFileEntry[]) ?? []
        value = keyedMerge(current, entries, (entry) => (isNavMarker(entry) ? `nav:${entry.unitId}` : entry.id), "카드", replace, state)
        break
      }
      case "variants": {
        const current = { ...((value as Record<string, AnswerVariant[]> | null) ?? {}) }
        for (const [cardId, list] of Object.entries((incoming as Record<string, AnswerVariant[]>) ?? {})) {
          const target = [...(current[cardId] ?? [])]
          for (const variant of list ?? []) {
            const key = normalizeForOverlap(variant.q ?? "")
            const owner = variantOwners.get(key)
            if (owner) {
              if (owner !== cardId) state.dropped.push(`${part}: ${cardId} 변형 "${variant.q}" — 이미 ${owner} 에 있음`)
              continue
            }
            variantOwners.set(key, cardId)
            target.push(variant)
            state.added += 1
          }
          current[cardId] = target
        }
        value = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)))
        break
      }
      case "universe": {
        const current = [...((value as UniverseItem[] | null) ?? [])]
        const index = new Map(current.map((item, position) => [item.id, position]))
        for (const item of (incoming as UniverseItem[]) ?? []) {
          const position = index.get(item.id)
          if (position === undefined) {
            index.set(item.id, current.length)
            current.push(item)
            state.added += 1
            continue
          }
          const existing = { ...current[position] }
          let changed = false
          for (const field of ["label", "label2", "conf", "labeler", "m", "p", "q"] as const) {
            const next = item[field]
            if (next === null || next === undefined) continue
            const before = existing[field]
            if (before === null || before === undefined) {
              ;(existing as Record<string, unknown>)[field] = next
              changed = true
            } else if (before !== next) {
              if (replace) {
                ;(existing as Record<string, unknown>)[field] = next
                changed = true
              } else state.conflicts.push(`우주 ${item.id}.${field}: 이미 있는 값과 다름`)
            }
          }
          if (changed) {
            current[position] = existing
            state.replaced += 1
          }
        }
        value = current
        break
      }
      case "lexicon": {
        const current = [...((value as LexiconConcept[] | null) ?? [])]
        const index = new Map(current.map((concept, position) => [concept.id, position]))
        for (const concept of (incoming as LexiconConcept[]) ?? []) {
          const position = index.get(concept.id)
          if (position === undefined) {
            index.set(concept.id, current.length)
            current.push(concept)
            state.added += 1
            continue
          }
          const existing = current[position]
          if ((existing.kind !== concept.kind || existing.generic !== concept.generic) && !replace) {
            state.conflicts.push(`개념 ${concept.id}: kind·generic 이 다름`)
            continue
          }
          current[position] = {
            ...existing,
            kind: replace ? concept.kind : existing.kind,
            generic: replace ? concept.generic : existing.generic,
            parents: Array.from(new Set([...(existing.parents ?? []), ...(concept.parents ?? [])])),
            doc: mergeForms(existing.doc ?? [], concept.doc ?? []),
            visitor: mergeForms(existing.visitor ?? [], concept.visitor ?? []),
            ambiguous: keyedMerge(existing.ambiguous ?? [], concept.ambiguous ?? [], (rule) => rule.form, `개념 ${concept.id} 모호 규칙`, replace, state),
          }
          state.replaced += 1
        }
        value = current
        break
      }
      case "generic-words": {
        const current = (value as GenericWordsFile | null) ?? { function: [], predicate: [], quantity: [], demonstrative: [] }
        const next = (incoming as GenericWordsFile) ?? {}
        value = Object.fromEntries(
          (["function", "predicate", "quantity", "demonstrative"] as const).map((key) => [key, Array.from(new Set([...(current[key] ?? []), ...(next[key] ?? [])]))])
        )
        state.added += 1
        break
      }
      case "absent":
        value = keyedMerge((value as AbsentConcept[] | null) ?? [], (incoming as AbsentConcept[]) ?? [], (item) => item.id, "없는 개념", replace, state)
        break
      case "legacy-alias": {
        const current = { ...((value as Record<string, string | null> | null) ?? {}) }
        for (const [key, target] of Object.entries((incoming as Record<string, string | null>) ?? {})) {
          if (!(key in current)) {
            current[key] = target
            state.added += 1
          } else if (current[key] !== target) {
            if (replace) {
              current[key] = target
              state.replaced += 1
            } else state.conflicts.push(`옛 id ${key}: ${current[key]} ↔ ${target}`)
          }
        }
        value = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)))
        break
      }
      case "audit":
        value = keyedMerge((value as AuditRecord[] | null) ?? [], (incoming as AuditRecord[]) ?? [], (record) => record.answerId, "점검 기록", replace, state)
        break
      case "human-queue": {
        const current = (value as HumanQueueFile | null) ?? { items: [] }
        value = { items: keyedMerge(current.items ?? [], (incoming as HumanQueueFile)?.items ?? [], (item) => item.id, "대기열", replace, state) }
        break
      }
      case "answer-keys": {
        const current = (value as AnswerKeysFile | null) ?? { set: (incoming as AnswerKeysFile).set, keys: [] }
        if ((incoming as AnswerKeysFile).set !== current.set) state.conflicts.push(`정답 키 묶음 이름이 다름(${current.set} ↔ ${(incoming as AnswerKeysFile).set})`)
        value = { set: current.set, keys: keyedMerge(current.keys ?? [], (incoming as AnswerKeysFile).keys ?? [], (key) => key.id, "정답 키", replace, state) }
        break
      }
      default:
        state.conflicts.push(`합칠 수 없는 종류: ${kind}`)
    }
  }
  return { value, ...state }
}

export function mergeParts(options: MergeOptions = {}) {
  const dir = options.dir ?? dataDir()
  const groups = findPartFiles(dir)
  if (options.parts && options.parts.length > 0) {
    const wanted = new Set(options.parts)
    for (const [base, list] of groups) {
      const kept = list.filter((rel) => wanted.has(rel))
      if (kept.length === 0) groups.delete(base)
      else groups.set(base, kept)
    }
  }
  const allParts = new Set(Array.from(groups.values()).flat())
  const variantOwners = existingVariantOwners(dir, new Set(Array.from(groups.keys()).filter((base) => base.startsWith("variants/"))))
  // 합칠 변형 파일의 기존 내용도 소유자 표에 넣는다(기존 것이 먼저다).
  for (const base of groups.keys()) {
    if (!base.startsWith("variants/") || !existsSync(join(dir, base))) continue
    const value = JSON.parse(readFileSync(join(dir, base), "utf8")) as Record<string, AnswerVariant[]>
    for (const [cardId, list] of Object.entries(value)) for (const variant of list ?? []) {
      const key = normalizeForOverlap(variant.q ?? "")
      if (key && !variantOwners.has(key)) variantOwners.set(key, cardId)
    }
  }

  const reports: MergeReport[] = []
  const generation: Record<string, GenerationRecord> = {}
  for (const [base, parts] of Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const kind = classifyDataFile(base)
    const partInfo = new Map(
      parts.map((part) => {
        const content = readFileSync(join(dir, part))
        return [part, { sha: sha16Bytes(content), items: countItems(readValue(join(dir, part), kind), kind) }] as const
      })
    )
    const merged = mergeGroup(dir, base, parts, options, variantOwners)
    const ok = merged.conflicts.length === 0
    if (ok && !options.dryRun) {
      writeFileSync(join(dir, base), serialize(merged.value, kind))
      if (!options.keepParts) for (const part of parts) unlinkSync(join(dir, part))
    }
    reports.push({ base, parts, added: merged.added, replaced: merged.replaced, dropped: merged.dropped, conflicts: merged.conflicts, written: ok && !options.dryRun })
    if (!ok || options.dryRun) continue
    for (const part of parts) {
      const name = splitPartName(part).part ?? part
      const record = generation[name] ?? { part: name, files: [], counts: {}, writers: [], reviewers: [], sha: "" }
      record.files.push(part)
      record.counts[kind] = (record.counts[kind] ?? 0) + (partInfo.get(part)?.items ?? 0)
      record.sha = [record.sha, `${part}:${partInfo.get(part)?.sha ?? ""}`].filter(Boolean).join("\n")
      if (kind === "cards") {
        const entries = merged.value as CardFileEntry[]
        for (const entry of entries) {
          if (isNavMarker(entry) || !entry.provenance || entry.provenance.unit !== name) continue
          if (!record.writers.includes(entry.provenance.writer)) record.writers.push(entry.provenance.writer)
          if (entry.provenance.reviewer && !record.reviewers.includes(entry.provenance.reviewer)) record.reviewers.push(entry.provenance.reviewer)
        }
      }
      generation[name] = record
    }
  }
  for (const record of Object.values(generation)) {
    record.files.sort()
    record.writers.sort()
    record.reviewers.sort()
    record.sha = sha16Bytes(record.sha.split("\n").sort().join("\n"))
  }
  const manifest = !options.dryRun && reports.some((report) => report.written) ? updateManifest({ generation }, dir) : null
  return { reports, manifest, parts: allParts.size }
}
