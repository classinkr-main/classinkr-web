// 새로 붙인 정해 둔 답이 질문마다 제대로 나가는지 엄격하게 본다.
// 질문마다 첫 번째로 맞는 정해 둔 답의 id가 기대한 id인지, 실제 챗봇 답에 그 답의 둘째 문단이 들어 있는지 함께 본다.
// 첫 문단만 비교하면 "두 가지 답드릴게요."처럼 흔한 첫 줄 때문에 다른 답이 나가도 통과로 보인다.
//
//   node scripts/chatbot-persona-loop/route-check.mjs <질문 파일>[#id 접두사] <첫 정해 둔 답 id>
//
// 질문 순서와 정해 둔 답 순서가 같아야 한다(회차 블록을 질문 순서대로 붙인다).
// 예) 15회차: node scripts/chatbot-persona-loop/route-check.mjs "$WORK/batch-15.json" accountant-billing-only-access
//     지난 회차 재확인: node scripts/chatbot-persona-loop/route-check.mjs "data/chatbot-persona-eval-set.json#b14-" early-renewal-tax-invoice-date
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createJiti } from "jiti"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const [source, firstId] = process.argv.slice(2)
if (!source || !firstId) {
  console.error("사용법: route-check.mjs <질문 파일>[#id 접두사] <첫 정해 둔 답 id>")
  process.exit(1)
}

for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
]) {
  process.env[key] = ""
}
console.warn = () => {}

const jiti = createJiti(import.meta.url, {
  alias: { "@": repoRoot, "server-only": join(repoRoot, "scripts/mock-server-only.js") },
})
const { evaluateChatbotQuery } = await jiti.import(join(repoRoot, "lib/chatbot/service.ts"))
const { FIELD_QUICK_ANSWERS } = await jiti.import(join(repoRoot, "lib/chatbot/quick-answers-field.ts"))

const [file, prefix] = source.split("#")
const data = JSON.parse(readFileSync(resolve(file), "utf8"))
const items = (data.items ?? data.cases).filter((item) => !prefix || item.id.startsWith(prefix))
const start = FIELD_QUICK_ANSWERS.findIndex((entry) => entry.id === firstId)
if (start < 0) {
  console.error(`정해 둔 답 id를 찾지 못했다: ${firstId}`)
  process.exit(1)
}

const normalize = (value) => value.replace(/\s+/g, " ")
let ok = 0
for (let i = 0; i < items.length; i++) {
  const item = items[i]
  const expected = FIELD_QUICK_ANSWERS[start + i]
  const first = FIELD_QUICK_ANSWERS.find((entry) => entry.match(item.question.toLowerCase()))
  const result = await evaluateChatbotQuery(item.question, { generateAnswer: false })
  const marker = normalize(expected.answer[1] ?? expected.answer[0]).slice(0, 40)
  const inAnswer = normalize(result.answer).includes(marker)
  if (first?.id === expected.id && inAnswer) {
    ok += 1
  } else {
    console.log(
      `MISS ${item.id} 기대=${expected.id} 먼저 맞은 답=${first?.id ?? "-"} 답에 포함=${inAnswer} [${result.answerMode}] ${normalize(result.answer).slice(0, 70)}`
    )
  }
}
console.log(`routed ${ok}/${items.length}`)
process.exit(ok === items.length ? 0 : 1)
