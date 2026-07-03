// Mock server-only for non-Next.js CLI execution
import Module from "node:module"
const originalRequire = (Module as any).prototype.require
;(Module as any).prototype.require = function (id: string) {
  if (id === "server-only") return {}
  return originalRequire.apply(this, arguments)
}

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { runGoldenEval } from "../lib/chatbot/eval"

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return

  const envText = readFileSync(envPath, "utf8")
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match) continue

    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

async function main() {
  loadEnvLocal()

  const limitArgIndex = process.argv.indexOf("--limit")
  const limit = limitArgIndex !== -1 ? Number(process.argv[limitArgIndex + 1]) : undefined
  const useJudge = process.argv.includes("--judge")

  console.log(`🤖 Starting Chatbot Golden Set Evaluation...`)
  console.log(`- Limit: ${limit ?? "All cases"}`)
  console.log(`- LLM Judge: ${useJudge ? "Enabled" : "Disabled (Pass --judge and set GEMINI_API_KEY to enable)"}`)

  const report = await runGoldenEval({
    judge: useJudge,
    limit: limit,
  })

  console.log(`\n==================================================`)
  console.log(`📊 Chatbot Quality Report`)
  console.log(`==================================================`)
  console.log(`- Total Evaluated: ${report.total}`)
  console.log(`- Duration: ${(report.durationMs / 1000).toFixed(2)}s`)
  console.log(`\n[Deterministic Metrics]`)
  console.log(`  ✓ Category Match: ${report.deterministic.categoryMatch} / ${report.total} (${(report.deterministic.categoryMatchRate * 100).toFixed(1)}%)`)
  console.log(`  ✓ Mode Matches: ${report.deterministic.modeOk} / ${report.total} (${(report.deterministic.modeOkRate * 100).toFixed(1)}%)`)
  console.log(`  ✓ Source Coverage: ${report.deterministic.withSources} / ${report.deterministic.sourceApplicable} (${(report.deterministic.sourceRate * 100).toFixed(1)}%)`)
  
  if (report.judge.enabled) {
    console.log(`\n[LLM Judge Metrics]`)
    console.log(`  ✓ Judged Cases: ${report.judge.judged}`)
    console.log(`  ✓ Faithful Rate: ${report.judge.faithfulRate !== null ? `${(report.judge.faithfulRate * 100).toFixed(1)}%` : "N/A"}`)
    console.log(`  ✓ Hallucination Rate: ${report.judge.hallucinationRate !== null ? `${(report.judge.hallucinationRate * 100).toFixed(1)}%` : "N/A"}`)
    console.log(`  ✓ User Question Addressed Rate: ${report.judge.addressesRate !== null ? `${(report.judge.addressesRate * 100).toFixed(1)}%` : "N/A"}`)
    console.log(`  ✓ Average Quality Score: ${report.judge.avgScore !== null ? `${report.judge.avgScore.toFixed(2)} / 5` : "N/A"}`)
  }

  if (report.failures.length > 0) {
    console.log(`\n==================================================`)
    console.log(`❌ Failures (${report.failures.length})`)
    console.log(`==================================================`)
    for (const fail of report.failures) {
      console.log(`  - [ID: ${fail.id}] ${fail.question}`)
      console.log(`    Expected: ${fail.expectCategory} (${fail.flags.join(", ")})`)
      console.log(`    Detected: ${fail.detectedCategory} | Mode: ${fail.answerMode}`)
      console.log(`    Flags: ${fail.flags.join(", ")}`)
      console.log(`--------------------------------------------------`)
    }
  } else {
    console.log(`\n🎉 All golden cases passed!`)
  }
}

main().catch((error) => {
  console.error("Evaluation failed:", error)
  process.exit(1)
})
