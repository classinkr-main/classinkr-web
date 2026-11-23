/**
 * 공개 문서 단위 추출 → data/answer-index/units.json (§4.2).
 *
 * 실행: npx tsx scripts/answer-index/extract-units.ts
 * 같은 문서면 같은 바이트를 쓴다. 문서를 바꾸면 다시 돌리고 npm run answer-index:verify 로 낡은 카드를 본다.
 */
import { runExtractUnits } from "./lib/extract"

async function main() {
  const file = await runExtractUnits()
  console.log(`units.json: 단위 ${file.counts.units}, 문장 ${file.counts.sentences}, 종류별 ${JSON.stringify(file.counts.byKind)} (${file.version})`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
