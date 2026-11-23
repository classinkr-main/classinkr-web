/**
 * 기존 정해 둔 답 목록 → data/answer-index/inventory.json (§7.1, 답변 사항 점검 D3 의 입력. 런타임은 읽지 않는다).
 *
 * 실행: npx tsx scripts/answer-index/inventory.ts [--dev-sets <name=path,...>] [--failure-logs <path,...>]
 * - --dev-sets / ANSWER_INDEX_DEV_SETS: 저장소 밖 개발용 묶음(dev5·holdout1·371). 걸림 수의 dev 칸에 숫자만 더한다.
 *   확정용 묶음(holdout2·3·4)은 넣지 않는다.
 * - --failure-logs / ANSWER_INDEX_FAILURE_LOGS: 개발용 실패 기록(JSON 배열). 가로채기 원인으로 이름이 나온 횟수만 센다.
 * 저장소 밖 입력은 manifest.json inputs 에 이름과 해시만 남는다.
 */
import { runInventory } from "./lib/extract"

async function main() {
  const inventory = await runInventory(process.argv.slice(2))
  console.log(`inventory.json: 답 ${inventory.counts.entries}, 모듈별 ${JSON.stringify(inventory.counts.byModule)}`)
  console.log(`  영역별 ${JSON.stringify(inventory.counts.byArea)}`)
  console.log(`  걸림 수 묶음: ${inventory.evalSets.map((set) => `${set.name}(${set.questions})`).join(", ")}`)
  if (inventory.failureLogs) console.log(`  실패 기록: ${inventory.failureLogs.length}개 파일`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
