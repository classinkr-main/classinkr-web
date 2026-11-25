// 답 색인 자료의 함수 번들 추적(next.config.ts outputFileTracingIncludes)이 load.ts 가 실제로 읽는 파일과 맞는가.
// load.ts 의 자료 경로는 turbopackIgnore 라 빌더가 따라가지 않는다. 그래서 런타임 파일은 설정이 명시해야 하고,
// 빠지면 운영에서 색인이 0장(언제나 abstain)으로 조용히 떨어진다. 목록 정본은 load.ts, next.config.ts 는 복제본이다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  ANSWER_INDEX_DATA_DIR_REL,
  ANSWER_INDEX_NON_RUNTIME,
  ANSWER_INDEX_RUNTIME_DIRS,
  ANSWER_INDEX_RUNTIME_TOP_FILES,
  isPartFileName,
} from "@/lib/chatbot/answer-index/load"
import nextConfig from "@/next.config"

const ROOT = process.cwd()
const LOAD_FILE = path.join(ROOT, "lib/chatbot/answer-index/load.ts")

// Next 빌드(collect-build-traces)와 같은 매처·옵션으로 라우트 경로를 맞춘다.
const requireFromHere = createRequire(import.meta.url)
const picomatch = requireFromHere("next/dist/compiled/picomatch") as (
  glob: string | string[],
  options: { dot: boolean; contains?: boolean }
) => (value: string) => boolean

// webpack 빌드(collect-build-traces)는 정규화한 경로(`/api/x/[id]`)로, Turbopack 빌드는 끝에 `/route`·`/page` 가
// 붙은 이름(`/api/x/[id]/route`)으로 키를 맞춘다(실측: `…/messages/*` 키가 `…/[id]/messages/route` 함수에 걸렸다).
// 두 꼴 가운데 하나라도 맞으면 그 키가 적용된다고 본다.
function routeNames(route: string) {
  if (route.endsWith("/route") || route.endsWith("/page")) return [route]
  const base = route === "/" ? "" : route
  return [route, `${base}/route`, `${base}/page`]
}
function globsFor(map: Record<string, string[]> | undefined, route: string) {
  const names = routeNames(route)
  return Object.entries(map ?? {})
    .filter(([glob]) => {
      const isMatch = picomatch(glob, { dot: true, contains: true })
      return names.some((name) => isMatch(name))
    })
    .flatMap(([, files]) => files)
}
const includesFor = (route: string) => globsFor(nextConfig.outputFileTracingIncludes, route)
const excludesFor = (route: string) => globsFor(nextConfig.outputFileTracingExcludes, route)

/**
 * 설정 글롭이 고르는 답 색인 파일(자료 폴더 기준 상대 경로). 빌드(collect-build-traces)와 같은 규칙:
 * include 는 프로젝트 루트 기준 glob, 그 뒤 exclude 는 path.join(루트, 글롭)을 절대 경로에 contains 매칭.
 */
function tracedAnswerIndexFiles(route: string) {
  const dataDir = path.join(ROOT, ANSWER_INDEX_DATA_DIR_REL)
  const all = walk(dataDir)
  const include = includesFor(route).map((glob) => glob.replace(/\\/g, "/").replace(/^\.\//, ""))
  const exclude = excludesFor(route).map((glob) => path.join(ROOT, glob))
  const inc = include.length ? picomatch(include, { dot: true }) : () => false
  const exc = exclude.length ? picomatch(exclude, { dot: true, contains: true }) : () => false
  return all
    .filter((file) => inc(path.relative(ROOT, file).split(path.sep).join("/")) && !exc(file))
    .map((file) => path.relative(dataDir, file).split(path.sep).join("/"))
}

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/** load.ts 가 읽는 파일(자료 폴더 기준): 맨 위 파일 + 런타임 폴더의 *.json(조각 이름 제외). */
function runtimeFiles() {
  const dataDir = path.join(ROOT, ANSWER_INDEX_DATA_DIR_REL)
  const files: string[] = []
  for (const name of ANSWER_INDEX_RUNTIME_TOP_FILES) if (existsSync(path.join(dataDir, name))) files.push(name)
  for (const sub of ANSWER_INDEX_RUNTIME_DIRS) {
    const dir = path.join(dataDir, sub)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".json") && !isPartFileName(name) && statSync(path.join(dir, name)).isFile()) files.push(`${sub}/${name}`)
    }
  }
  return files.sort()
}

// ─── 정적 import 그래프: 어느 app 라우트·페이지가 load.ts 를 끌어오는가 ─────────────────────

const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".jsx"]
const IMPORT_RE =
  /(?:^|[\s;])(?:import|export)\s+(?!type\s)(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/gm

function resolveSpecifier(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec)
  else return null
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`))]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const importCache = new Map<string, string[]>()
function importsOf(file: string) {
  let list = importCache.get(file)
  if (list) return list
  const text = readFileSync(file, "utf8")
  list = []
  for (const match of text.matchAll(IMPORT_RE)) {
    const spec = match[1] ?? match[2] ?? match[3]
    const target = spec ? resolveSpecifier(file, spec) : null
    if (target) list.push(target)
  }
  importCache.set(file, list)
  return list
}

const reachCache = new Map<string, boolean>()
function reachesLoad(file: string, stack = new Set<string>()): boolean {
  const known = reachCache.get(file)
  if (known !== undefined) return known
  if (file === LOAD_FILE) return true
  if (stack.has(file)) return false
  stack.add(file)
  const result = importsOf(file).some((next) => reachesLoad(next, stack))
  stack.delete(file)
  // 순환 중간 결과(false)는 다른 경로에서 다시 볼 수 있게 true 만 확정한다.
  if (result) reachCache.set(file, true)
  return result
}

/** app/ 아래 라우트·페이지 진입 파일 → 라우트 경로(Next normalizeAppPath 와 같게: 그룹 (x) 제거, route/page 떼기). */
function appEntries() {
  const entries: { file: string; route: string }[] = []
  for (const file of walk(path.join(ROOT, "app"))) {
    const rel = path.relative(path.join(ROOT, "app"), file).split(path.sep).join("/")
    const match = rel.match(/^(.*?)(?:^|\/)(route|page)\.(ts|tsx|js)$/)
    if (!match) continue
    const segments = match[1]
      .split("/")
      .filter((segment) => segment && !/^\(.*\)$/.test(segment) && !segment.startsWith("@"))
    entries.push({ file, route: `/${segments.join("/")}` })
  }
  return entries
}

describe("답 색인 함수 번들 추적", () => {
  const usingRoutes = appEntries()
    .filter(({ file }) => reachesLoad(file))
    .map(({ route }) => route)
    .sort()

  it("load.ts 를 끌어오는 라우트가 있다(그래프 스캔이 동작한다)", () => {
    expect(usingRoutes).toContain("/api/chatbot/query")
    expect(usingRoutes).toContain("/api/chatbot/query/stream")
    expect(usingRoutes).toContain("/api/mcp")
  })

  it("load.ts 의 자료 경로는 빌더가 따라가지 않는다(turbopackIgnore)", () => {
    const source = readFileSync(LOAD_FILE, "utf8")
    const body = source.slice(source.indexOf("export function answerIndexDataDir"), source.indexOf("/** 지금 문서 단위"))
    const cwdCalls = body.match(/process\.cwd\(\)/g) ?? []
    const ignored = body.match(/\/\* turbopackIgnore: true \*\/ process\.cwd\(\)/g) ?? []
    expect(cwdCalls.length).toBeGreaterThan(0)
    expect(ignored.length).toBe(cwdCalls.length)
  })

  it("런타임 자료가 실제로 있다(빈 목록과 비교하지 않는다)", () => {
    const files = runtimeFiles()
    expect(files).toContain("manifest.json")
    expect(files.some((file) => file.startsWith("cards/"))).toBe(true)
    expect(files.some((file) => file.startsWith("variants/"))).toBe(true)
    expect(files.some((file) => file.startsWith("universe/"))).toBe(true)
  })

  it("load.ts 를 끌어오는 라우트마다 런타임 자료가 전부, 그리고 그것만 들어간다", () => {
    const expected = runtimeFiles()
    const problems: string[] = []
    for (const route of usingRoutes) {
      const traced = tracedAnswerIndexFiles(route)
      const missing = expected.filter((file) => !traced.includes(file))
      const extra = traced.filter((file) => !expected.includes(file))
      if (missing.length) problems.push(`${route}: 빠짐 ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` 외 ${missing.length - 5}` : ""}`)
      if (extra.length) problems.push(`${route}: 런타임이 읽지 않는 파일 ${extra.slice(0, 5).join(", ")}`)
    }
    expect(problems).toEqual([])
  })

  it("런타임이 읽지 않는 자료(audit·eval·inventory 등)는 어느 라우트에도 넣지 않는다", () => {
    for (const route of [...usingRoutes, "/api/chatbot/recommended-questions", "/admin/campaigns", "/"]) {
      const traced = tracedAnswerIndexFiles(route)
      const nonRuntime = traced.filter((file) => (ANSWER_INDEX_NON_RUNTIME as readonly string[]).includes(file.split("/")[0]))
      expect(nonRuntime, route).toEqual([])
    }
  })

  it("답 색인 라우트에서 public/·tests/·docs/·supabase/ 를 뺀다", () => {
    for (const route of usingRoutes) {
      const exclude = excludesFor(route)
      for (const dir of ["public", "tests", "docs", "supabase"]) expect(exclude, route).toContain(`./${dir}/**`)
    }
  })

  // 라우트 키는 contains 매칭이라(앞뒤 고정이 없다) 키를 품은 더 긴 경로에도 걸린다. 그 라우트에는 답 색인 자료가
  // 더 실릴 뿐(약 22MB) 동작은 같다. 목록이 늘면 키를 좁히거나 여기 이유와 함께 더한다.
  // 아래 둘은 앞쪽을 고정할 수 없어 남긴다(키를 `/route` 로 끝맺으면 webpack 꼴과 어긋난다).
  const KNOWN_OVERMATCH = [
    "/api/admin/chatbot/recommended-questions/[id]", // "/api/admin/chatbot/recommended-questions" 키
    "/api/admin/overview/operations", // "/admin/overview" 키
  ]

  it("답 색인을 쓰지 않는 라우트에는 답 색인 자료를 명시해 넣지 않는다(알려진 키 겹침 제외)", () => {
    const using = new Set(usingRoutes)
    const others = appEntries()
      .map(({ route }) => route)
      .filter((route) => !using.has(route))
    expect(others.length).toBeGreaterThan(0)
    const leaking = others.filter((route) => includesFor(route).some((glob) => glob.includes("answer-index"))).sort()
    expect(leaking).toEqual([...KNOWN_OVERMATCH].sort())
  })

  it("Turbopack 꼴(`…/route`)로도 메시지 목록 라우트에는 답 색인 자료가 걸리지 않는다", () => {
    const list = "/api/admin/cs-chat/conversations/[id]/messages"
    expect(includesFor(list).some((glob) => glob.includes("answer-index"))).toBe(false)
    expect(includesFor(`${list}/route`).some((glob) => glob.includes("answer-index"))).toBe(false)
    expect(includesFor(`${list}/[messageId]`).some((glob) => glob.includes("answer-index"))).toBe(true)
    expect(includesFor(`${list}/[messageId]/route`).some((glob) => glob.includes("answer-index"))).toBe(true)
  })

  it("리드마그넷 PDF 라우트의 public/ 포함은 그대로다(다른 설정을 건드리지 않음)", () => {
    expect(includesFor("/api/materials/[slug]/pdf")).toContain("./public/materials/lead-magnets/*.pdf")
    expect(excludesFor("/api/materials/[slug]/pdf")).not.toContain("./public/**")
  })
})
