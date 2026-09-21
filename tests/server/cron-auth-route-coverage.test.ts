import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 크론 라우트 인증 커버리지(AGENTS.md "배포 / Cron 안전 규칙").
 *
 * 인증 판정은 lib/server/cron-auth 의 checkCronAuth(timing-safe) 하나로 통일한다. 헬퍼를 도입한 브랜치가
 * 갈라져 있는 동안 다른 브랜치에서 새 크론 라우트가 생기면, 그 라우트는 예전처럼 시크릿을 직접 `!==` 로
 * 비교한 채 합쳐진다 — 2026-09-21 통합에서 실제로 네 라우트(dispatch/[slot], lead-contact-sync,
 * sync-google-ads, sync-naver-ads)가 그렇게 빠져 있었다. 새 라우트가 들어올 때 여기서 잡는다.
 */

const CRON_ROOT = path.join(process.cwd(), "app", "api", "cron")

function listRouteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry)
    if (statSync(absolute).isDirectory()) return listRouteFiles(absolute)
    return entry === "route.ts" ? [absolute] : []
  })
}

/** 저장소 기준 "/" 경로 — Windows 의 "\" 구분자가 실패 메시지·비교에 새지 않게. */
function repoPath(absolute: string) {
  return path.relative(process.cwd(), absolute).split(path.sep).join("/")
}

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

describe("app/api/cron/** 인증 커버리지", () => {
  const routes = listRouteFiles(CRON_ROOT)

  it("크론 라우트를 실제로 수집한다(0건이면 이 테스트가 아무것도 지키지 못한다)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(14)
  })

  it("모든 크론 라우트가 checkCronAuth 로 인증한다", () => {
    const missing = routes
      .filter((file) => !/\bcheckCronAuth\s*\(/.test(stripComments(readFileSync(file, "utf8"))))
      .map(repoPath)
    expect(missing).toEqual([])
  })

  it("어느 크론 라우트도 CRON_SECRET 을 직접 읽어 비교하지 않는다", () => {
    const handRolled = routes
      .filter((file) => /process\.env\.CRON_SECRET/.test(stripComments(readFileSync(file, "utf8"))))
      .map(repoPath)
    expect(handRolled).toEqual([])
  })

  it("x-vercel-cron 헤더를 인증·실행 조건으로 쓰지 않는다", () => {
    const usesHeader = routes
      .filter((file) => /x-vercel-cron/i.test(stripComments(readFileSync(file, "utf8"))))
      .map(repoPath)
    expect(usesHeader).toEqual([])
  })
})
