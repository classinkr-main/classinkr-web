/**
 * manifest.json: 원천 해시, 자료 버전(ANSWER_INDEX_VERSION), 자료 파일 해시, 조각별 생성 기록.
 *
 * dataVersion 은 런타임 자료(units·site-facts·cards·variants·universe·lexicon·generic-words·absent·legacy-alias·calibration)의
 * 내용 해시다. inventory.json·audit/·eval/·manifest.json 은 런타임이 읽지 않으므로 넣지 않는다.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { AnswerIndexManifest } from "@/lib/chatbot/answer-index/types"
import { dataDir, fileSha16, listFilesRecursive, readJsonFile, repoRoot, sha16Bytes, toRepoPath, writeJsonFile } from "./common"

export const MANIFEST_FILE = "manifest.json"

/** dataVersion 에서 빼는 자료 경로(data/answer-index 기준). */
export function isNonRuntimeDataPath(relPath: string) {
  return relPath === MANIFEST_FILE || relPath === "inventory.json" || relPath.startsWith("audit/") || relPath.startsWith("eval/")
}

export function emptyManifest(): AnswerIndexManifest {
  return { schema: 1, dataVersion: "", sources: {}, outputs: {}, inputs: { devSets: [], failureLogs: [] }, generation: {} }
}

export function readManifest(dir = dataDir()): AnswerIndexManifest {
  const path = join(dir, MANIFEST_FILE)
  if (!existsSync(path)) return emptyManifest()
  return { ...emptyManifest(), ...readJsonFile<Partial<AnswerIndexManifest>>(path) } as AnswerIndexManifest
}

/** 자료 파일(data/answer-index 기준 경로, 정렬). */
export function listDataFiles(dir = dataDir()) {
  return listFilesRecursive(dir).map((file) => toRepoPath(file, dir))
}

export function computeDataVersion(dir = dataDir()) {
  const parts = listDataFiles(dir)
    .filter((rel) => !isNonRuntimeDataPath(rel))
    .map((rel) => `${rel}:${fileSha16(join(dir, rel))}`)
  return `ai-${sha16Bytes(parts.join("\n")).slice(0, 12)}`
}

function countOf(rel: string, value: unknown) {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    if (Array.isArray(obj.units)) return obj.units.length
    if (Array.isArray(obj.entries)) return obj.entries.length
    if (Array.isArray(obj.items)) return obj.items.length
    if (Array.isArray(obj.keys)) return obj.keys.length
    return Object.keys(obj).length
  }
  return rel.endsWith(".jsonl") ? 0 : 1
}

/** 원천 파일 해시를 manifest.sources 에 넣는다(저장소 기준 경로). */
export function sourceHashes(paths: string[], root = repoRoot()) {
  const out: Record<string, string> = {}
  for (const rel of Array.from(new Set(paths)).sort()) {
    const abs = join(root, rel)
    if (existsSync(abs)) out[rel] = fileSha16(abs)
  }
  return out
}

/**
 * manifest 를 다시 쓴다: sources 를 합치고, outputs 를 지금 자료 파일로 다시 세고, dataVersion 을 다시 계산한다.
 * generation·inputs 는 patch 로 받은 것만 바꾼다.
 */
export function updateManifest(patch: Partial<Pick<AnswerIndexManifest, "sources" | "inputs" | "generation">>, dir = dataDir()) {
  const manifest = readManifest(dir)
  const sources = { ...manifest.sources, ...(patch.sources ?? {}) }
  const sortedSources = Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b)))
  const outputs: AnswerIndexManifest["outputs"] = {}
  for (const rel of listDataFiles(dir)) {
    if (rel === MANIFEST_FILE) continue
    const abs = join(dir, rel)
    let count = 0
    try {
      if (rel.endsWith(".jsonl")) {
        count = readFileSync(abs, "utf8").split(/\r?\n/).filter((line) => line.trim()).length
      } else if (rel.endsWith(".json")) {
        count = countOf(rel, readJsonFile<unknown>(abs))
      }
    } catch {
      count = -1
    }
    outputs[rel] = { sha: fileSha16(abs), count }
  }
  const generation = { ...manifest.generation, ...(patch.generation ?? {}) }
  const next: AnswerIndexManifest = {
    schema: 1,
    dataVersion: computeDataVersion(dir),
    sources: sortedSources,
    outputs,
    inputs: patch.inputs ?? manifest.inputs,
    generation: Object.fromEntries(Object.entries(generation).sort(([a], [b]) => a.localeCompare(b))),
  }
  writeJsonFile(join(dir, MANIFEST_FILE), next)
  return next
}
