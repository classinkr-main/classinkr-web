import { spawnSync } from "child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, describe, expect, it } from "vitest"

// prebuild 크론 가드(scripts/check-vercel-crons.mjs)를 실제로 실행해 Pro 정책을 고정한다.
// 정책(AGENTS.md "배포 / Cron 안전 규칙"): 경로당 항목 하나, 경로당 하루 288회(5분 간격) 이하,
// 전체 40개 이하, 라우트 파일 존재.

const scriptPath = join(process.cwd(), "scripts/check-vercel-crons.mjs")
const tempDirs: string[] = []

interface CronEntry {
  path: string
  schedule: string
}

function runGuard(crons: CronEntry[], routeDirs: string[] = crons.map((cron) => `app${cron.path}`)) {
  const dir = mkdtempSync(join(tmpdir(), "vercel-crons-"))
  tempDirs.push(dir)
  writeFileSync(join(dir, "vercel.json"), JSON.stringify({ crons }))
  for (const routeDir of new Set(routeDirs)) {
    mkdirSync(join(dir, routeDir), { recursive: true })
    writeFileSync(join(dir, routeDir, "route.ts"), "export {}\n")
  }
  const result = spawnSync(process.execPath, [scriptPath], { cwd: dir, encoding: "utf8" })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("check-vercel-crons (Pro 정책)", () => {
  it("allows a path that runs several times a day", () => {
    const result = runGuard([{ path: "/api/cron/sync-branch", schedule: "0 0,4,8 * * *" }])
    expect(result.output).toContain("passed")
    expect(result.status).toBe(0)
  })

  it("allows the weekday business-hours lead contact schedule", () => {
    const result = runGuard([{ path: "/api/cron/lead-contact-sync", schedule: "50 0,1,4,6,8 * * 1-5" }])
    expect(result.status).toBe(0)
  })

  it("allows every five minutes, the frequency ceiling", () => {
    const result = runGuard([{ path: "/api/cron/dispatch", schedule: "*/5 * * * *" }])
    expect(result.status).toBe(0)
  })

  it("rejects a schedule that runs more often than every five minutes", () => {
    const result = runGuard([{ path: "/api/cron/tick", schedule: "* * * * *" }])
    expect(result.status).toBe(1)
    expect(result.output).toContain("runs 1440 times on a matching day; the limit is 288")
  })

  it("rejects every four minutes", () => {
    const result = runGuard([{ path: "/api/cron/tick", schedule: "*/4 * * * *" }])
    expect(result.status).toBe(1)
    expect(result.output).toContain("runs 360 times on a matching day; the limit is 288")
  })

  it("rejects the same path split across entries even when each entry is daily", () => {
    const result = runGuard([
      { path: "/api/cron/sync-branch", schedule: "0 0 * * *" },
      { path: "/api/cron/sync-branch", schedule: "0 8 * * *" },
    ])
    expect(result.status).toBe(1)
    expect(result.output).toContain("/api/cron/sync-branch: appears in 2 cron entries; keep exactly one entry per path")
  })

  it("rejects more than 40 cron entries", () => {
    const crons = Array.from({ length: 41 }, (_, index) => ({
      path: `/api/cron/job-${index}`,
      schedule: "0 0 * * *",
    }))
    const result = runGuard(crons)
    expect(result.status).toBe(1)
    expect(result.output).toContain("vercel.json has 41 cron entries; the limit is 40")
  })

  it("still rejects a cron whose route file is missing", () => {
    // 실제 저장소처럼 상위 디렉터리(app/api/cron)는 있고 라우트만 없는 경우다.
    const result = runGuard([{ path: "/api/cron/ghost", schedule: "0 0 * * *" }], ["app/api/cron/other"])
    expect(result.status).toBe(1)
    expect(result.output).toContain("/api/cron/ghost: missing route file")
  })

  it("still resolves a concrete path to a dynamic route segment", () => {
    const result = runGuard(
      [{ path: "/api/cron/dispatch/07", schedule: "0 7 * * *" }],
      ["app/api/cron/dispatch/[slot]"]
    )
    expect(result.status).toBe(0)
  })

  it("passes the repository vercel.json", () => {
    const result = spawnSync(process.execPath, [scriptPath], { cwd: process.cwd(), encoding: "utf8" })
    expect(`${result.stdout}${result.stderr}`).toContain("passed")
    expect(result.status).toBe(0)
  })
})
