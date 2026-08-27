import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(process.cwd(), "lib/admin-integrations/status.ts"), "utf8")

describe("admin integration status truth contract", () => {
  it("does not keep obsolete sub-daily cron warnings", () => {
    expect(source).toContain('health: configured ? "ok" : "error"')
    expect(source).not.toContain("sync-branch 하루 3회")
    expect(source).not.toContain("sync-external-crm 하루 4회")
    expect(source).toContain("실제 최근 실행 성공은 각 동기화 run 이력")
  })

  it("does not fabricate lastSuccessAt from a configuration probe", () => {
    expect(source).not.toContain('lastSuccessAt: item.health === "ok" ? generatedAt : undefined')
    expect(source).toContain("lastSuccessAt은 각 connector가 실제 run history를 연결했을 때만 채운다")
  })
})
