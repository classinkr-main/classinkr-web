import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("alpha DB check script", () => {
  it("provides an npm command that runs the alpha DB contract probes", () => {
    const scriptPath = join(process.cwd(), "scripts/check-alpha-db.ts")
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }

    expect(existsSync(scriptPath)).toBe(true)
    expect(packageJson.scripts?.["check:alpha-db"]).toBe("npx tsx scripts/check-alpha-db.ts")

    const source = readFileSync(scriptPath, "utf8")
    expect(source).toContain("ALPHA_DB_TABLE_PROBES")
    expect(source).toContain("ALPHA_DB_RPC_PROBES")
    expect(source).toContain("createClient")
    expect(source).toContain(".rpc(probe.functionName")
    expect(source).toContain("summarizeAlphaDbProbeResults")
    expect(source).toContain("process.exitCode = 1")
  })
})
