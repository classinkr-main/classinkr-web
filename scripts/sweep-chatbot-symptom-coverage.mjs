// 챗봇 증상 커버리지 검사 — 공개 문서의 증상 섹션 제목("~ 안 될 때")과 Figma CS 가이드의 증상 키워드를
// 고객 말투 질문으로 바꿔, 챗봇이 같은 문서(또는 같은 증상을 다룬 문서)로 답하는지 전수 확인한다.
// 외부 서비스(Supabase·Gemini) 없이 결정 경로로만 돈다. 새 문제 해결 문서를 추가한 뒤 실행해 빈틈을 찾는다.
//
//   node scripts/sweep-chatbot-symptom-coverage.mjs          # 실패만 출력
//   node scripts/sweep-chatbot-symptom-coverage.mjs --all    # 동등(≈) 판정까지 출력
//
// 경위와 판정 기준: docs/active/chatbot-cs-symptom-triage-2026-11-06.md
import { join } from "node:path"
import { createJiti } from "jiti"

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

const repoRoot = process.cwd()
const jiti = createJiti(import.meta.url, {
  alias: { "@": repoRoot, "server-only": join(repoRoot, "scripts/mock-server-only.js") },
})
const { evaluateChatbotQuery } = await jiti.import("../lib/chatbot/service.ts")
const { listDocs, getDocPath } = await jiti.import("../lib/docs.ts")
const { CURATED_CS_FIGMA_GUIDES, getCsFigmaGuideDocPath } = await jiti.import("../lib/cs-figma-guides.ts")
const { SYMPTOM_TOPICS } = await jiti.import("../lib/chatbot/symptom-triage.ts")

// 섹션 제목 어미 → 고객 말투
const UTTERANCE_RULES = [
  [/안 될 때$/, "안 돼요"],
  [/안 보일 때$/, "안 보여요"],
  [/안 들릴 때$/, "안 들려요"],
  [/안 갈 때$/, "안 가요"],
  [/안 올 때$/, "안 와요"],
  [/안 먹힐 때$/, "안 먹혀요"],
  [/없을 때$/, "없어요"],
  [/이상할 때$/, "이상해요"],
  [/튕길 때$/, "튕겨요"],
  [/끊길 때$/, "끊겨요"],
  [/느릴 때$/, "느려요"],
  [/같을 때$/, "같아요"],
  [/못 들어올 때$/, "못 들어와요"],
  [/사라졌을 때$/, "사라졌어요"],
  [/지워졌을 때$/, "지워졌어요"],
  [/뜰 때$/, "떠요"],
  [/나올 때$/, "나와요"],
  [/않을 때$/, "않아요"],
  [/막힐 때$/, "막혀요"],
  [/있었을 때$/, "있었어요"],
  [/나뉠 때$/, "나뉘어요"],
  [/보일 때$/, "보여요"],
  [/웅웅거릴 때$/, "웅웅거려요"],
  [/막혀 있을 때$/, "막혀 있어요"],
  [/학생일 때$/, "학생이에요"],
  [/들린다고 할 때$/, "들린다고 해요"],
]
// 증상이 아닌 '~할 때' 제목(사용 상황 설명)
const NON_SYMPTOM_HEADING_RE =
  /원인일 때|쓸 때|그만둘 때|들을 때|요청할 때|알릴 때|접수할 때|급할 때|필요한 때|고를 때|나갈 때|바꿀 때|만들 때|모를 때|열 때|줄 때|읽을 때|올릴 때|볼 때|붙여야 할 때|설치할 때/
// 같은 증상을 다룬 정본·사본 문서 쌍(앞 문서 섹션을 뒤 문서가 맡아도 정답으로 본다)
const EQUIVALENT_DOC_PAIRS = [
  ["/docs/start/pc-install", "/docs/start/pc-install-troubleshooting"],
  ["/docs/start/password-change", "/docs/start/login-troubleshooting"],
  ["/docs/start/mobile-install", "/docs/student/todo-calendar"],
  ["/docs/student/student-profile", "/docs/teacher/teacher-profile"],
  ["/docs/admin/institution-settings", "/docs/teacher/course-members"],
]
const FIGMA_SYMPTOM_KEYWORD_RE = /안\s*됨|안\s*돼|끊김|멈춤|안\s*보|안\s*나|안\s*들|오류|에러|초반만|안\s*켜|사라|안\s*와/

function toUtterance(heading) {
  const plain = heading.replace(/\s*\([^)]*\)\s*$/, "")
  for (const [pattern, replacement] of UTTERANCE_RULES) {
    if (pattern.test(plain)) return plain.replace(pattern, replacement)
  }
  return null
}

function headingWords(text) {
  return new Set(
    text
      .replace(/\([^)]*\)/g, "")
      .split(/\s+/)
      .map((word) => word.replace(/(이|가|을|를|은|는|에|만|도|나)$/, ""))
      .filter((word) => word.length >= 2 && !/^(때|있을|없을)$/.test(word))
  )
}

const cases = []
for (const doc of listDocs()) {
  if ((doc.visibility ?? "public") !== "public" || doc.noindex) continue
  for (const section of doc.sections) {
    if (!/때(?:\s*\([^)]*\))?$/.test(section.heading) || NON_SYMPTOM_HEADING_RE.test(section.heading)) continue
    const question = toUtterance(section.heading)
    if (question) cases.push({ source: "doc", question, heading: section.heading, path: getDocPath(doc) })
  }
}
for (const guide of CURATED_CS_FIGMA_GUIDES) {
  for (const keyword of guide.keywords) {
    if (!FIGMA_SYMPTOM_KEYWORD_RE.test(keyword) || !keyword.includes(" ")) continue
    cases.push({ source: "figma", question: keyword, heading: guide.title, path: getCsFigmaGuideDocPath(guide) })
  }
}
for (const question of new Set(SYMPTOM_TOPICS.flatMap((topic) => topic.suggestedQuestions))) {
  cases.push({ source: "suggest", question, heading: "", path: null })
}

let strict = 0
let equivalent = 0
const rows = []
const bySource = {}
for (const testCase of cases) {
  const result = await evaluateChatbotQuery(testCase.question, { generateAnswer: false })
  const top = result.sources[0]
  let ok
  if (testCase.source === "suggest") {
    ok = result.answerMode === "direct_answer" || result.answerMode === "clarifying_question"
  } else if (testCase.source === "figma") {
    ok = result.answerMode === "direct_answer" && Boolean(top) && !/pre-adoption|board-lineup/.test(top.urlPath)
  } else {
    ok = Boolean(top) && top.urlPath === testCase.path
  }

  let isEquivalent = false
  if (!ok && testCase.source === "doc" && top && result.answerMode === "direct_answer") {
    const expected = headingWords(testCase.heading)
    const actual = [...headingWords(top.heading ?? "")]
    const overlap = [...expected].filter((word) => actual.some((other) => other.slice(0, 2) === word.slice(0, 2))).length
    isEquivalent =
      overlap >= 2 ||
      EQUIVALENT_DOC_PAIRS.some(([from, to]) => testCase.path.startsWith(from) && top.urlPath.startsWith(to))
  }

  if (ok) strict += 1
  if (isEquivalent) equivalent += 1
  bySource[testCase.source] ??= { pass: 0, total: 0 }
  bySource[testCase.source].total += 1
  if (ok || isEquivalent) bySource[testCase.source].pass += 1
  const mark = ok ? "✓" : isEquivalent ? "≈" : "✗"
  const expected = testCase.source === "doc" ? `   (기대 ${testCase.path} · ${testCase.heading})` : ""
  rows.push(`${mark} [${testCase.source}] ${testCase.question} → ${result.answerMode} ${top?.urlPath ?? "-"} · ${top?.heading ?? ""}${expected}`)
}

const showAll = process.argv.includes("--all")
console.log(rows.filter((row) => row.startsWith("✗") || (showAll && row.startsWith("≈"))).join("\n"))
const total = cases.length
console.log(
  `\n=== 엄격 ${strict}/${total} (${((strict / total) * 100).toFixed(1)}%) · 동등 포함 ${strict + equivalent}/${total} (${(((strict + equivalent) / total) * 100).toFixed(1)}%) ===`
)
console.log(Object.entries(bySource).map(([source, { pass, total: count }]) => `${source} ${pass}/${count}`).join(" · "))
