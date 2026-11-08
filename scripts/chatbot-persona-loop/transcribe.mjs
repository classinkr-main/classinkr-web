// 페르소나 질문을 챗봇에 넣어 심사용 대화 기록을 만든다. 외부 서비스(Supabase·Gemini) 없이 결정 경로로만 돈다.
// 운영에서 Gemini가 다시 쓰는 답인지(llmPathInProduction)는 가짜 키와 fetch 가로채기로 가린다.
//
//   node scripts/chatbot-persona-loop/transcribe.mjs <출력.json> <질문 파일>[#id 접두사] [<질문 파일>[#접두사] ...]
//
// 예) 6회차: 새 질문 묶음 6 + 평가셋에 들어 있는 5회차 질문(수정 후 재답변)
//   node scripts/chatbot-persona-loop/transcribe.mjs "$WORK/transcript-r6.json" "$WORK/batch-6.json" "data/chatbot-persona-eval-set.json#b5-"
//
// 질문 파일은 {"items": [...]} 또는 {"cases": [...]} 꼴이다. 각 문항: id, persona, question, intent, must, must_not.
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createJiti } from "jiti"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const [output, ...sources] = process.argv.slice(2)
if (!output || sources.length === 0) {
  console.error("사용법: transcribe.mjs <출력.json> <질문 파일>[#id 접두사] ...")
  process.exit(1)
}

for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  process.env[key] = ""
}
process.env.GEMINI_API_KEY = "offline-probe-key"
console.warn = () => {}
let geminiCalls = 0
globalThis.fetch = async (input) => {
  if (String(input).includes("generativelanguage")) geminiCalls += 1
  throw new Error("offline")
}

const jiti = createJiti(import.meta.url, {
  alias: { "@": repoRoot, "server-only": join(repoRoot, "scripts/mock-server-only.js") },
})
const { evaluateChatbotQuery } = await jiti.import(join(repoRoot, "lib/chatbot/service.ts"))

const evalSet = JSON.parse(readFileSync(join(repoRoot, "data/chatbot-persona-eval-set.json"), "utf8"))
const personas = Object.fromEntries(evalSet.personas.map((persona) => [persona.id, persona]))

const items = sources.flatMap((source) => {
  const [file, prefix = ""] = source.split("#")
  const data = JSON.parse(readFileSync(resolve(repoRoot, file), "utf8"))
  return (data.items ?? data.cases ?? []).filter((item) => item.id.startsWith(prefix))
})

const rows = []
for (const item of items) {
  geminiCalls = 0
  let result
  try {
    result = await evaluateChatbotQuery(item.question)
  } catch (error) {
    result = { answer: `[입력 오류] ${error.message}`, answerMode: "error", sources: [], suggestedQuestions: [] }
  }
  rows.push({
    id: item.id,
    persona: personas[item.persona] ?? item.persona,
    question: item.question,
    answerKey: { intent: item.intent, must: item.must, must_not: item.must_not },
    bot: {
      answerMode: result.answerMode,
      category: result.detectedCategory,
      needsHandoff: result.needsHandoff,
      handoffIntent: result.handoffIntent,
      sources: (result.sources ?? []).slice(0, 3).map((source) => ({
        title: source.title,
        heading: source.heading,
        urlPath: source.urlPath,
      })),
      answer: result.answer,
      suggestedQuestions: result.suggestedQuestions,
      llmPathInProduction: geminiCalls > 0,
    },
  })
}

writeFileSync(output, JSON.stringify({ count: rows.length, rows }, null, 1))
const modes = {}
for (const row of rows) modes[row.bot.answerMode] = (modes[row.bot.answerMode] ?? 0) + 1
console.log(output, rows.length, JSON.stringify(modes), "llmPath:", rows.filter((row) => row.bot.llmPathInProduction).length)
