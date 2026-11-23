/**
 * 에이전트용 전문 검색: units.json(공개 문서 문장)·site-facts.json(공개 페이지 문장)·inventory.json(기존 정해 둔 답)을 낱말로 찾는다.
 *
 * 실행:
 *   npx tsx scripts/answer-index/search.ts "<낱말> [낱말 …]" [--in unit,site,inventory] [--area <영역>] [--any] [--limit 20] [--json]
 *   npx tsx scripts/answer-index/search.ts --unit "doc:/docs/teacher/course-members#4"   # 단위 하나를 번호 붙은 문장으로
 *   npx tsx scripts/answer-index/search.ts --site "site:app/privacy/page.tsx:575"           # 공개 페이지 문장 하나
 *
 * - 띄어쓰기·문장부호·대소문자는 무시한다. 낱말이 여러 개면 모두 든 문장만(--any 면 하나라도) 낸다. "따옴표 구"는 한 낱말이다.
 * - 기본 범위는 문서와 페이지(unit,site)다. 정해 둔 답은 --in inventory(또는 --in unit,site,inventory)로 넣는다.
 * - 결과: 출처 id, 문장 번호, 경로, 영역, 표시(flags), 문장. --json 이면 SearchHit 배열.
 */
import { join } from "node:path"
import type { AnswerIndexInventoryFile, AnswerIndexUnitsFile, SiteFact } from "@/lib/chatbot/answer-index/types"
import { argValues, dataDir, hasFlag, readJsonIfExists } from "./lib/common"
import { formatSearchHit, formatUnit, searchAnswerIndex, type SearchSource } from "./lib/search-core"

function main() {
  const argv = process.argv.slice(2)
  const dir = dataDir()
  const unitsFile = readJsonIfExists<AnswerIndexUnitsFile>(join(dir, "units.json"))
  const siteFacts = readJsonIfExists<SiteFact[]>(join(dir, "site-facts.json")) ?? []
  const inventory = readJsonIfExists<AnswerIndexInventoryFile>(join(dir, "inventory.json"))
  if (!unitsFile) {
    console.error("data/answer-index/units.json 이 없습니다. 먼저 npm run answer-index:extract 를 돌리세요.")
    process.exit(2)
  }
  const json = hasFlag(argv, "--json")

  const unitId = argValues(argv, "--unit")[0]
  if (unitId) {
    const unit = unitsFile.units.find((candidate) => candidate.unitId === unitId)
    if (!unit) {
      console.error(`단위 없음: ${unitId}`)
      process.exit(1)
    }
    console.log(json ? JSON.stringify(unit, null, 2) : formatUnit(unit))
    return
  }
  const siteId = argValues(argv, "--site")[0]
  if (siteId) {
    const fact = siteFacts.find((candidate) => candidate.id === siteId)
    if (!fact) {
      console.error(`페이지 문장 없음: ${siteId}`)
      process.exit(1)
    }
    console.log(json ? JSON.stringify(fact, null, 2) : `${fact.id}\n    ${fact.text}  [${fact.hash}]`)
    return
  }

  const valueFlags = new Set(["--in", "--area", "--limit"])
  const query = argv
    .filter((arg, index) => !arg.startsWith("--") && !valueFlags.has(argv[index - 1] ?? ""))
    .join(" ")
    .trim()
  if (!query) {
    console.error('사용법: npx tsx scripts/answer-index/search.ts "<낱말>" [--in unit,site,inventory] [--area <영역>] [--any] [--limit 20] [--json]')
    process.exit(2)
  }
  const sources = (argValues(argv, "--in")[0] ?? "unit,site")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is SearchSource => value === "unit" || value === "site" || value === "inventory")
  const limit = Number(argValues(argv, "--limit")[0] ?? 20)
  const hits = searchAnswerIndex(
    { units: unitsFile.units, siteFacts, inventory: inventory?.entries ?? [] },
    query,
    { sources, area: argValues(argv, "--area")[0] ?? null, limit: Number.isFinite(limit) && limit > 0 ? limit : 20, mode: hasFlag(argv, "--any") ? "any" : "all" }
  )
  if (json) {
    console.log(JSON.stringify(hits, null, 2))
    return
  }
  if (hits.length === 0) {
    console.log(`결과 없음: ${query} (범위 ${sources.join(",")})`)
    return
  }
  console.log(`결과 ${hits.length}건: ${query} (범위 ${sources.join(",")})`)
  for (const hit of hits) console.log(formatSearchHit(hit))
}

main()
