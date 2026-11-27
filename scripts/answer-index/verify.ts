/**
 * 답 색인 자료 검사 V-1~V-15(사양 §6, V-14·V-15 는 R3 카드 꼴·변형 검사). CI 필수: npm run answer-index:verify
 *
 * 실행:
 *   npx tsx scripts/answer-index/verify.ts [--only <자료 파일>]… [--strict] [--require-blind]
 *     [--dev-sets <name=path,…>] [--with-holdout <path[#key],…>] [--json] [--verbose]
 *
 * - --only: 그 파일(data/answer-index 안, 예: cards/account.D1-07.json)에 묶인 결과만 보인다. 검사는 자료 전체를 읽고 돈다.
 *   자료 에이전트는 자기 출력 파일로 이 검사를 돌려 오류 0을 확인한다.
 * - --strict: 아직 카드가 없는 영역에도 덮기(V-9)·옛 id 대응(V-10)·반례 행선을 오류로 본다(전체 자료 단계 완료 기준).
 * - --require-blind: 블라인드 변형(g=B) 최소 개수도 본다(D7 뒤).
 * - V-7 개발용 질문: 저장소 평가셋(data/chatbot-*-set.json)은 늘 쓰고, 저장소 밖 묶음(dev5·holdout1·371·dev6~8)은
 *   --dev-sets 또는 ANSWER_INDEX_DEV_SETS 로 준다.
 * - --with-holdout 또는 ANSWER_INDEX_HOLDOUT_SETS: 확정용 묶음(측정 담당만). 문장은 기계적으로만 읽고 겹친 개수만 찍는다.
 *   data/chatbot-holdout-sets.json 은 경로 뒤에 #<묶음 key> 를 붙여 묶음 하나만 읽게 한다.
 * - 종료 코드: 오류 0이면 0, 오류가 있으면 1, 사용법 오류 2.
 */
import { isAbsolute, relative, resolve } from "node:path"
import { argValues, dataDir, devSetSpecs, hasFlag, holdoutSetSpecs, loadQuestionSet, loadRepoEvalSets, repoRoot } from "./lib/common"
import { filterFindingsForFile, runVerify, VERIFY_RULES, type VerifyFinding } from "./lib/verify-core"

function toDataRelative(path: string, dir: string, root: string) {
  const candidates = [isAbsolute(path) ? path : resolve(root, path), resolve(dir, path)]
  for (const abs of candidates) {
    const rel = relative(dir, abs).split("\\").join("/")
    if (!rel.startsWith("..") && !isAbsolute(rel)) return rel
  }
  return null
}

function printFinding(finding: VerifyFinding) {
  const level = finding.level === "error" ? "오류" : finding.level === "warning" ? "경고" : "알림"
  console.log(`  [${finding.rule}] ${level}${finding.file ? ` ${finding.file}` : ""}: ${finding.message}`)
}

async function main() {
  const argv = process.argv.slice(2)
  const root = repoRoot()
  const dir = dataDir(root)
  const only = argValues(argv, "--only").map((path) => {
    const rel = toDataRelative(path, dir, root)
    if (!rel) {
      console.error(`--only 파일은 data/answer-index 안에 있어야 합니다: ${path}`)
      process.exit(2)
    }
    return rel
  })

  const devSets = [...loadRepoEvalSets(root).map((entry) => entry.set), ...devSetSpecs(argv).map((spec) => loadQuestionSet(spec, root))]
  const holdoutSets = holdoutSetSpecs(argv).map((spec) => loadQuestionSet(spec, root))

  const result = await runVerify({
    dir,
    devSets,
    holdoutSets,
    strict: hasFlag(argv, "--strict"),
    requireBlind: hasFlag(argv, "--require-blind"),
  })
  const findings = only.length > 0 ? only.flatMap((file) => filterFindingsForFile(result.findings, file)) : result.findings
  const errors = findings.filter((finding) => finding.level === "error")
  const warnings = findings.filter((finding) => finding.level === "warning")
  const infos = findings.filter((finding) => finding.level === "info")

  if (hasFlag(argv, "--json")) {
    console.log(JSON.stringify({ only, errors: errors.length, warnings: warnings.length, stats: result.stats, findings }, null, 2))
    process.exit(errors.length > 0 ? 1 : 0)
  }

  console.log(`답 색인 검사${only.length > 0 ? ` (--only ${only.join(", ")})` : ""}`)
  console.log(
    `  자료: 단위 ${result.stats.units}(문장 ${result.stats.sentences}) · 페이지 문장 ${result.stats.siteFacts} · 옛 답 ${result.stats.inventory} · 카드 ${result.stats.cards} · nav ${result.stats.navs} · 변형 ${result.stats.variants} · 우주 ${result.stats.universe} · 사전 ${result.stats.lexicon} · 점검 ${result.stats.audits}`
  )
  console.log(`  개발용 질문 ${result.stats.devQuestions}개(${devSets.length}묶음)${holdoutSets.length > 0 ? `, 확정용 묶음 ${holdoutSets.length}개(개수만)` : ""}`)
  for (const { rule, title } of VERIFY_RULES) {
    const ruleFindings = findings.filter((finding) => finding.rule === rule)
    const e = ruleFindings.filter((finding) => finding.level === "error").length
    const w = ruleFindings.filter((finding) => finding.level === "warning").length
    console.log(`${e > 0 ? "✗" : "✓"} ${rule} 오류 ${e} 경고 ${w} — ${title}`)
  }
  const loadErrors = findings.filter((finding) => finding.rule === "load" && finding.level === "error").length
  if (loadErrors > 0) console.log(`✗ 읽기 오류 ${loadErrors}`)
  const verbose = hasFlag(argv, "--verbose")
  const shown = [...errors, ...warnings, ...(verbose ? infos : [])]
  const limit = verbose ? Infinity : 200
  if (shown.length > 0) console.log("")
  shown.slice(0, limit).forEach(printFinding)
  if (shown.length > limit) console.log(`  … ${shown.length - limit}건 더(--verbose 로 전부)`)
  console.log("")
  console.log(errors.length > 0 ? `실패: 오류 ${errors.length}, 경고 ${warnings.length}` : `통과: 오류 0, 경고 ${warnings.length}${infos.length > 0 ? `, 알림 ${infos.length}(--verbose)` : ""}`)
  process.exit(errors.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
