/**
 * 나눠 쓴 자료 조각 합치기(§12.2).
 *
 * 실행: npx tsx scripts/answer-index/merge.ts [조각 경로 …] [--dry-run] [--replace] [--keep-parts]
 * - 조각 경로를 주지 않으면 data/answer-index 의 조각(이름에 점이 하나 더 있는 파일: cards/account.D1-07.json 등) 전부를 합친다.
 * - --dry-run: 쓰지 않고 결과만 보인다. --replace: 같은 id 가 다르면 나중 조각 것으로 바꾼다(기본은 충돌로 멈춤).
 * - --keep-parts: 합친 뒤 조각 파일을 지우지 않는다(기본은 지운다. 남겨 두면 verify 가 id 중복으로 잡는다).
 * - 합친 뒤 manifest.json 의 generation(조각별 생성 기록)·outputs·dataVersion 을 다시 쓴다.
 * 합친 다음 npm run answer-index:verify 를 돌린다.
 */
import { isAbsolute, relative, resolve } from "node:path"
import { dataDir, hasFlag, repoRoot } from "./lib/common"
import { mergeParts } from "./lib/merge-core"

function main() {
  const argv = process.argv.slice(2)
  const root = repoRoot()
  const dir = dataDir(root)
  const parts = argv
    .filter((arg) => !arg.startsWith("--"))
    .map((path) => {
      const abs = isAbsolute(path) ? path : resolve(root, path)
      const rel = relative(dir, abs).split("\\").join("/")
      return rel.startsWith("..") ? relative(dir, resolve(dir, path)).split("\\").join("/") : rel
    })
  const { reports, manifest, parts: count } = mergeParts({
    dir,
    parts,
    replace: hasFlag(argv, "--replace"),
    keepParts: hasFlag(argv, "--keep-parts"),
    dryRun: hasFlag(argv, "--dry-run"),
  })
  if (reports.length === 0) {
    console.log("합칠 조각이 없습니다.")
    return
  }
  let conflicts = 0
  for (const report of reports) {
    const status = report.conflicts.length > 0 ? "충돌(쓰지 않음)" : report.written ? "합침" : "확인만"
    console.log(`${status} ${report.base} ← ${report.parts.join(", ")}: 더함 ${report.added}, 바꿈 ${report.replaced}, 버림 ${report.dropped.length}`)
    for (const line of report.dropped.slice(0, 20)) console.log(`  버림: ${line}`)
    if (report.dropped.length > 20) console.log(`  … 버림 ${report.dropped.length - 20}건 더`)
    for (const line of report.conflicts) console.log(`  충돌: ${line}`)
    conflicts += report.conflicts.length
  }
  console.log(`조각 ${count}개${manifest ? `, 자료 버전 ${manifest.dataVersion}` : ""}. 다음: npm run answer-index:verify`)
  if (conflicts > 0) process.exit(1)
}

main()
