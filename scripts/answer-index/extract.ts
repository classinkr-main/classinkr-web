/**
 * answer-index:extract — units.json, site-facts.json, inventory.json 과 manifest.json 을 한 번에 다시 만든다.
 *
 * 실행: npm run answer-index:extract [-- --dev-sets <...> --failure-logs <...>]
 * 인자는 inventory.ts 와 같다.
 */
import { runExtractSiteFacts, runExtractUnits, runInventory } from "./lib/extract"

async function main() {
  const units = await runExtractUnits()
  console.log(`units.json: 단위 ${units.counts.units}, 문장 ${units.counts.sentences}`)
  const facts = runExtractSiteFacts()
  console.log(`site-facts.json: 문장 ${facts.length}`)
  const inventory = await runInventory(process.argv.slice(2))
  console.log(`inventory.json: 답 ${inventory.counts.entries}, 모듈별 ${JSON.stringify(inventory.counts.byModule)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
