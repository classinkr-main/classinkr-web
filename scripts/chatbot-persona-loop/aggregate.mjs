// 심사관 A·B 결과를 합친다: 심사관별 통과 수, 일치율·카파, 이견 목록, 상호 검토 뒤 최종(둘 다 통과해야 통과).
//
//   node scripts/chatbot-persona-loop/aggregate.mjs <작업 폴더> <태그>
//
// 작업 폴더에 transcript-<태그>.json, judge-A-<태그>.json, judge-B-<태그>.json이 있어야 한다.
// 상호 검토 결과(judge-A-<태그>-final.json, judge-B-<태그>-final.json)가 있으면 그 판정으로 덮어쓴다.
// 결과는 summary-<태그>.json으로 저장하고 표준 출력에도 낸다. id 접두사(b6, b5 …)별 최종 통과 수도 함께 낸다.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [dir, tag] = process.argv.slice(2)
if (!dir || !tag) {
  console.error("사용법: aggregate.mjs <작업 폴더> <태그>")
  process.exit(1)
}

const load = (name) => {
  const path = join(dir, name)
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).results : null
}
const byId = (rows) => Object.fromEntries((rows ?? []).map((row) => [row.id, row]))

const a = byId(load(`judge-A-${tag}.json`))
const b = byId(load(`judge-B-${tag}.json`))
const af = byId(load(`judge-A-${tag}-final.json`))
const bf = byId(load(`judge-B-${tag}-final.json`))
const transcript = JSON.parse(readFileSync(join(dir, `transcript-${tag}.json`), "utf8")).rows

let agree = 0
let aPass = 0
let bPass = 0
let finalPass = 0
const disagreements = []
const perBatch = {}
const persona = {}
const tags = {}
for (const row of transcript) {
  const ra = a[row.id]
  const rb = b[row.id]
  if (!ra || !rb) {
    console.log("판정 없음:", row.id)
    continue
  }
  if (ra.pass) aPass++
  if (rb.pass) bPass++
  if (ra.pass === rb.pass) agree++
  else disagreements.push(row.id)
  const fa = af[row.id] ?? ra
  const fb = bf[row.id] ?? rb
  const ok = fa.pass && fb.pass
  if (ok) finalPass++
  const batch = row.id.split("-")[0]
  perBatch[batch] ??= [0, 0]
  perBatch[batch][1]++
  if (ok) perBatch[batch][0]++
  const personaId = row.persona?.id ?? row.persona
  persona[personaId] ??= [0, 0]
  persona[personaId][1]++
  if (ok) persona[personaId][0]++
  if (!ok) {
    for (const failureTag of new Set([
      ...(fa.pass ? [] : (fa.failure_tags ?? [])),
      ...(fb.pass ? [] : (fb.failure_tags ?? [])),
    ])) {
      tags[failureTag] = (tags[failureTag] ?? 0) + 1
    }
  }
}

const n = transcript.length
const pa = aPass / n
const pb = bPass / n
const po = agree / n
const pe = pa * pb + (1 - pa) * (1 - pb)
const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe)
const summary = {
  tag,
  n,
  judgeA: aPass,
  judgeB: bPass,
  agreement: Number((po * 100).toFixed(1)),
  kappa: Number(kappa.toFixed(2)),
  disagreements,
  finalPass,
  perBatch,
  persona,
  tags,
}
writeFileSync(join(dir, `summary-${tag}.json`), JSON.stringify(summary, null, 1))

// 상호 검토용 목록: 심사관 A에게는 B의 판정을, B에게는 A의 판정을 보여 준다.
const crossLine = (row) =>
  `- ${row.id}: 판정 pass=${row.pass} 점수 ${Object.values(row.scores ?? {}).join(",")} 합계 ${row.total} / 근거: ${row.issue || "문제 없음"}`
writeFileSync(join(dir, `cross-A-${tag}.txt`), disagreements.map((id) => crossLine(b[id])).join("\n") + "\n")
writeFileSync(join(dir, `cross-B-${tag}.txt`), disagreements.map((id) => crossLine(a[id])).join("\n") + "\n")

console.log(JSON.stringify(summary))
