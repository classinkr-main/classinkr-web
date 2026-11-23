/**
 * 공개 페이지 사실 문장 추출 → data/answer-index/site-facts.json (§4.2).
 *
 * 실행: npx tsx scripts/answer-index/extract-site-facts.ts
 * 대상 파일 목록은 scripts/answer-index/lib/site-facts.ts 의 SITE_FACT_TARGETS.
 */
import { runExtractSiteFacts } from "./lib/extract"

try {
  const facts = runExtractSiteFacts()
  const files = new Set(facts.map((fact) => fact.path))
  console.log(`site-facts.json: 문장 ${facts.length}, 파일 ${files.size}`)
} catch (error) {
  console.error(error)
  process.exit(1)
}
