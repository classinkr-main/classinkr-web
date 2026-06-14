import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const proxySource = readFileSync(join(process.cwd(), "proxy.ts"), "utf8")
const proxyFunctionSource = proxySource.slice(proxySource.indexOf("export async function proxy"))

describe("admin proxy development bypass", () => {
  it("lets the shared development admin bypass pass protected admin pages before session checks", () => {
    expect(proxySource).toContain('import { isAdminAuthBypassEnabled } from "@/lib/admin-env"')
    expect(proxySource).toContain("if (isAdminAuthBypassEnabled()) return response")

    const bypassIndex = proxyFunctionSource.indexOf("if (isAdminAuthBypassEnabled()) return response")
    const legacySessionIndex = proxyFunctionSource.indexOf("hasLegacyAdminSession")

    expect(bypassIndex).toBeGreaterThan(-1)
    expect(legacySessionIndex).toBeGreaterThan(-1)
    expect(bypassIndex).toBeLessThan(legacySessionIndex)
  })
})
