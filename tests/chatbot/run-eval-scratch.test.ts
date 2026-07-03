import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"
import { runGoldenEval } from "@/lib/chatbot/eval"

describe("run golden eval scratch", () => {
  it("runs eval and writes to scratch", async () => {
    console.log("Starting golden eval in Vitest...")
    const report = await runGoldenEval({ judge: false })
    const outputPath = "C:/Users/aaaha/.gemini/antigravity/brain/b609c811-7485-4e02-9651-a39d94db0294/scratch/eval-result.json"
    writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8")
    console.log("Evaluation complete. Written to " + outputPath)
  })
})
