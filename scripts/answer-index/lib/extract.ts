/**
 * 추출 실행(extract-units·extract-site-facts·inventory CLI 와 answer-index:extract 가 함께 쓴다).
 */
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { AnswerIndexManifest } from "@/lib/chatbot/answer-index/types"
import {
  argValues,
  dataDir,
  devSetSpecs,
  listFilesRecursive,
  loadQuestionSet,
  repoRoot,
  sha16Bytes,
  splitSetSpecs,
  toRepoPath,
  writeJsonFile,
} from "./common"
import { buildInventory, INVENTORY_SOURCE_FILES, loadFailureLog, type FailureLog } from "./inventory"
import { sourceHashes, updateManifest } from "./manifest"
import { buildSiteFacts, listSiteFactFiles } from "./site-facts"
import { buildUnits, buildUnitsFile, loadUnitSources } from "./units"

export const UNITS_FILE = "units.json"
export const SITE_FACTS_FILE = "site-facts.json"
export const INVENTORY_FILE = "inventory.json"

const SCRIPT_LIB = "scripts/answer-index/lib"

function filesUnder(rel: string, root: string) {
  return listFilesRecursive(join(root, rel)).map((file) => toRepoPath(file, root))
}

export function unitSourcePaths(root = repoRoot()) {
  return [
    "lib/docs.ts",
    "lib/docs-troubleshooting.ts",
    ...filesUnder("lib/docs-troubleshooting", root),
    "lib/docs-guide-media.ts",
    ...filesUnder("lib/docs-guide-media", root),
    "lib/cs-figma-guides.ts",
    "lib/cs-figma-guides.generated.ts",
    "lib/cs-figma-guide-aliases.ts",
    "lib/cs-figma-enrichments.ts",
    "lib/cs-figma-enrichments.generated.ts",
    "lib/chatbot/source-grounding.ts",
    "lib/chatbot/doc-outline.ts",
    `${SCRIPT_LIB}/units.ts`,
    `${SCRIPT_LIB}/sentences.ts`,
    `${SCRIPT_LIB}/areas.ts`,
  ]
}

export function siteSourcePaths(root = repoRoot()) {
  return [...listSiteFactFiles(root).map((file) => toRepoPath(file, root)), `${SCRIPT_LIB}/site-facts.ts`]
}

export function inventorySourcePaths() {
  return [
    ...Object.values(INVENTORY_SOURCE_FILES),
    ...REPO_SET_PATHS,
    `${SCRIPT_LIB}/inventory.ts`,
    `${SCRIPT_LIB}/ts-extract.ts`,
    `${SCRIPT_LIB}/text-rules.ts`,
    `${SCRIPT_LIB}/areas.ts`,
  ]
}

const REPO_SET_PATHS = [
  "data/chatbot-first-contact-set.json",
  "data/chatbot-fresh-open-set.json",
  "data/chatbot-golden-set.json",
  "data/chatbot-cs-symptom-set.json",
  "data/chatbot-persona-eval-set.json",
]

export async function runExtractUnits(root = repoRoot()) {
  const file = buildUnitsFile(buildUnits(await loadUnitSources()))
  writeJsonFile(join(dataDir(root), UNITS_FILE), file)
  updateManifest({ sources: sourceHashes(unitSourcePaths(root), root) }, dataDir(root))
  return file
}

export function runExtractSiteFacts(root = repoRoot()) {
  const facts = buildSiteFacts(root)
  writeJsonFile(join(dataDir(root), SITE_FACTS_FILE), facts)
  updateManifest({ sources: sourceHashes(siteSourcePaths(root), root) }, dataDir(root))
  return facts
}

/** 실패 기록: --failure-logs 인자와 ANSWER_INDEX_FAILURE_LOGS. 이름과 해시만 manifest 에 남긴다. */
export function failureLogSpecs(argv: string[]) {
  return splitSetSpecs([...argValues(argv, "--failure-logs"), process.env.ANSWER_INDEX_FAILURE_LOGS])
}

export async function runInventory(argv: string[], root = repoRoot()) {
  const devSets = devSetSpecs(argv).map((spec) => loadQuestionSet(spec, root))
  const failureLogs: FailureLog[] = failureLogSpecs(argv).map((spec) => {
    const path = spec.replace(/^[A-Za-z0-9_.-]+=/, "")
    const content = readFileSync(resolve(root, path))
    const name = spec.includes("=") ? spec.split("=")[0] : path.split(/[\\/]/).pop() ?? path
    return loadFailureLog(name, sha16Bytes(content), JSON.parse(content.toString("utf8")))
  })
  const inventory = await buildInventory({ root, devSets, failureLogs: failureLogs.length > 0 ? failureLogs : undefined })
  writeJsonFile(join(dataDir(root), INVENTORY_FILE), inventory)
  const inputs: AnswerIndexManifest["inputs"] = {
    devSets: devSets.map((set) => ({ name: set.name, sha: set.sha })),
    failureLogs: failureLogs.map((log) => ({ name: log.name, sha: log.sha })),
  }
  updateManifest({ sources: sourceHashes(inventorySourcePaths(), root), inputs }, dataDir(root))
  return inventory
}

export function printCounts(label: string, counts: Record<string, unknown>) {
  console.log(`${label}: ${JSON.stringify(counts)}`)
}
