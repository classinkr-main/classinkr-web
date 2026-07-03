import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"

import { describe, expect, it } from "vitest"

// 어드민 API 가드 존재 스냅샷 테스트.
//
// 감사 결론: app/api/admin/* 라우트는 전수 가드가 존재하지만, 미들웨어 수준의
// 심층방어가 없어 라우트 하나만 가드를 빼먹어도 그대로 외부에 노출된다.
// 이 테스트는 라우트 파일을 파일시스템에서 자동 수집하므로 (하드코딩 목록 없음)
// 새 라우트가 추가되면 즉시 검사 대상이 된다. 각 파일이
//   verifyAdmin | requireVerifiedAdminContext | getVerifiedAdminContext
// 중 하나를 "@/lib/admin-auth"에서 import(정적 또는 `await import`)하고,
// 실제로 호출(`이름(` 패턴)까지 하는지 텍스트 기반으로 검증한다.
//
// 네임스페이스 import(`import * as adminAuth`)나 다른 모듈을 경유한 재-export는
// 의도적으로 인식하지 않는다. 그런 라우트가 생기면 이 테스트가 실패하며,
// 정식 named import 패턴으로 맞추는 것이 기본 대응이다.

const ADMIN_API_ROOT = join(process.cwd(), "app", "api", "admin")

// 의도적으로 공개된 라우트만 여기에 추가한다. (로그인 · 로그아웃)
// 이 allowlist 외에는 어떤 라우트도 하드코딩하지 않는다.
const PUBLIC_ROUTE_ALLOWLIST = [
  "app/api/admin/auth/route.ts",
  "app/api/admin/auth/logout/route.ts",
] as const

const GUARD_NAMES = [
  "verifyAdmin",
  "requireVerifiedAdminContext",
  "getVerifiedAdminContext",
] as const

const GUARD_MODULE = "@/lib/admin-auth"

const ROUTE_FILE_RE = /^route\.(?:ts|tsx|js|jsx|mjs)$/

function toRepoPath(absolutePath: string): string {
  return relative(process.cwd(), absolutePath).split(sep).join("/")
}

function collectRouteFiles(dir: string): string[] {
  const collected: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name)
    if (entry.isDirectory()) {
      collected.push(...collectRouteFiles(absolute))
    } else if (entry.isFile() && ROUTE_FILE_RE.test(entry.name)) {
      collected.push(absolute)
    }
  }
  return collected.sort()
}

// `import { verifyAdmin, foo as bar } from "@/lib/admin-auth"` (정적) 및
// `const { verifyAdmin, foo: bar } = await import("@/lib/admin-auth")` (동적)
// 두 형태에서 가드의 로컬 바인딩 이름을 수집한다.
// `import type { ... }` / 인라인 `type` specifier는 런타임 가드가 아니므로 제외.
function importedGuardLocalNames(source: string): string[] {
  const localNames = new Set<string>()
  const guardModuleRe = GUARD_MODULE.replace(/[/\\]/g, "\\$&")

  const staticImportRe = new RegExp(
    `import\\s+(type\\s+)?\\{([^}]*)\\}\\s*from\\s*["']${guardModuleRe}["']`,
    "g"
  )
  for (const match of source.matchAll(staticImportRe)) {
    if (match[1]) continue // import type { ... } — 타입 전용
    for (const rawSpec of match[2].split(",")) {
      const spec = rawSpec.trim()
      if (!spec || spec.startsWith("type ")) continue
      const parsed = spec.match(/^(\w+)(?:\s+as\s+(\w+))?$/)
      if (!parsed) continue
      const [, imported, alias] = parsed
      if ((GUARD_NAMES as readonly string[]).includes(imported)) {
        localNames.add(alias ?? imported)
      }
    }
  }

  const dynamicImportRe = new RegExp(
    `(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*await\\s+import\\(\\s*["']${guardModuleRe}["']\\s*\\)`,
    "g"
  )
  for (const match of source.matchAll(dynamicImportRe)) {
    for (const rawSpec of match[1].split(",")) {
      const spec = rawSpec.trim()
      if (!spec) continue
      const parsed = spec.match(/^(\w+)(?:\s*:\s*(\w+))?$/)
      if (!parsed) continue
      const [, imported, alias] = parsed
      if ((GUARD_NAMES as readonly string[]).includes(imported)) {
        localNames.add(alias ?? imported)
      }
    }
  }

  return [...localNames]
}

function hasGuardCall(source: string, localNames: string[]): boolean {
  return localNames.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(source))
}

const routeFiles = collectRouteFiles(ADMIN_API_ROOT).map((absolute) => ({
  absolute,
  repoPath: toRepoPath(absolute),
}))

const guardedTargets = routeFiles.filter(
  ({ repoPath }) =>
    !(PUBLIC_ROUTE_ALLOWLIST as readonly string[]).includes(repoPath)
)

describe("admin API route guards", () => {
  it("어드민 라우트 파일을 자동 수집한다 (수집기 자체 무결성)", () => {
    // 수집기가 조용히 빈 목록을 돌려주면 아래 검사가 전부 무의미해진다.
    // 라우트 대량 삭제/이동 시에는 이 하한을 의도적으로 조정할 것.
    expect(routeFiles.length).toBeGreaterThanOrEqual(100)
    expect(guardedTargets.length).toBe(
      routeFiles.length - PUBLIC_ROUTE_ALLOWLIST.length
    )
  })

  it("공개 allowlist 항목은 실제로 존재하는 라우트여야 한다 (스테일 방지)", () => {
    const stale = PUBLIC_ROUTE_ALLOWLIST.filter(
      (repoPath) => !existsSync(join(process.cwd(), ...repoPath.split("/")))
    )
    expect(stale).toEqual([])
  })

  it("allowlist 밖의 모든 라우트가 어드민 가드를 import한다", () => {
    const missingImport = guardedTargets
      .filter(({ absolute }) => {
        const source = readFileSync(absolute, "utf8")
        return importedGuardLocalNames(source).length === 0
      })
      .map(({ repoPath }) => repoPath)

    expect(
      missingImport,
      `가드 import가 없는 어드민 라우트 (${GUARD_NAMES.join(" | ")} 중 하나를 "${GUARD_MODULE}"에서 import해야 함)`
    ).toEqual([])
  })

  it("import한 가드를 실제로 호출한다 (import만 있는 파일도 실패)", () => {
    const importedButNeverCalled = guardedTargets
      .filter(({ absolute }) => {
        const source = readFileSync(absolute, "utf8")
        const localNames = importedGuardLocalNames(source)
        if (localNames.length === 0) return false // import 부재는 위 테스트가 잡는다
        return !hasGuardCall(source, localNames)
      })
      .map(({ repoPath }) => repoPath)

    expect(
      importedButNeverCalled,
      "가드를 import했지만 호출하지 않는 어드민 라우트"
    ).toEqual([])
  })
})
