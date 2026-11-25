#!/usr/bin/env node
// 서버 전용 담당 표(본사 담당자 실명·위컴 멘션)가 브라우저로 가는 코드에 들어가지 않았는지 검사한다(2026-11 B2, R2).
//
// 두 가지 방식:
// 1. 모듈 그래프(기본): 'use client' 파일에서 시작해 import 를 따라가며
//    (a) `import "server-only"` 가 있는 모듈에 닿는지, (b) 닿는 파일에 서버 전용 표의 문자열이 있는지 본다.
//    type 만 가져오는 import(`import type`, 모든 이름이 `type` 인 중괄호)는 빌드에서 지워지므로 따라가지 않는다.
// 2. 빌드 산출물(--static, .next/static 이 있을 때): 정적 청크에 같은 문자열이 0건인지 본다.
//    이 저장소의 점검 환경에서는 next build 가 무거워 1번을 기본으로 쓴다. 배포 빌드 뒤에는 --static 으로 돌린다.
//
// 검사할 문자열은 이 스크립트에 적지 않는다. 서버 전용 모듈(SECRET_SOURCES)의 원문에서 담당자 칸·멘션 값을 읽어 만든다.
//
// 사용: node scripts/check-client-bundle-secrets.mjs [--static] [--root <dir>]

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** 담당자 이름이 든 서버 전용 모듈. 여기 값이 클라이언트 쪽에 나오면 실패다. */
export const SECRET_SOURCES = ["lib/internal-cs-chat/escalation-routing.ts"]

/** 사람 이름이 아닌 일반 낱말(1차 접점 계정 이름 등). 이 값만으로는 실패로 보지 않는다. */
const GENERIC_TOKENS = new Set(["小助手", "ClassIn", "ClassIn小助手", "硬件服务", "北京时间"])

const SOURCE_DIRS = ["app", "components", "lib", "hooks", "contexts"]
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"]

/** 서버 전용 모듈 원문에서 담당자 칸(primary·secondary)과 위컴 멘션 값을 읽어 검사 문자열을 만든다. */
export function collectSecretNeedles(root = SCRIPT_ROOT, sources = SECRET_SOURCES) {
  const needles = new Set()
  for (const rel of sources) {
    const text = readFileSync(path.join(root, rel), "utf8")
    const fieldPattern = /\b(primaryContact|secondaryContact|wecomMention)\s*:\s*"([^"]*)"/g
    for (const match of text.matchAll(fieldPattern)) {
      const [, field, value] = match
      if (field === "wecomMention") {
        for (const part of value.split("@")) {
          const name = part.trim()
          if (name.length >= 2 && !GENERIC_TOKENS.has(name)) needles.add(name)
        }
        continue
      }
      // 한자 이름(2~3자)은 칸 어디에 있든 이름으로 본다.
      for (const han of value.matchAll(/[一-鿿]{2,3}/g)) {
        if (!GENERIC_TOKENS.has(han[0])) needles.add(han[0])
      }
    }
  }
  return [...needles].sort()
}

function listSourceFiles(root) {
  const files = []
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (EXTENSIONS.includes(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) files.push(full)
    }
  }
  for (const dir of SOURCE_DIRS) walk(path.join(root, dir))
  return files
}

function isClientEntry(text) {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text)
}

function isServerOnly(text) {
  return /^\s*import\s+["']server-only["']/m.test(text)
}

/** 값으로 쓰이는 import 대상(빌드에 남는 것)만 돌려준다. */
export function runtimeImportSpecifiers(text) {
  const specs = []
  const staticPattern = /^\s*(import|export)\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gm
  for (const match of text.matchAll(staticPattern)) {
    const [, , clause, spec] = match
    if (/^type\b/.test(clause)) continue
    const braces = clause.match(/\{([\s\S]*)\}/)
    const beforeBraces = braces ? clause.slice(0, clause.indexOf("{")).replace(/,\s*$/, "").trim() : clause.trim()
    if (braces && !beforeBraces) {
      const names = braces[1].split(",").map((item) => item.trim()).filter(Boolean)
      if (names.length > 0 && names.every((name) => /^type\s/.test(name))) continue
    }
    specs.push(spec)
  }
  for (const match of text.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specs.push(match[1])
  for (const match of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specs.push(match[1])
  return specs
}

function resolveSpecifier(spec, fromFile, root) {
  let base
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2))
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.resolve(path.dirname(fromFile), spec)
  else return null // 패키지 — 저장소 밖
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => path.join(base, "index" + ext))]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/**
 * 'use client' 파일에서 import 를 따라간다. server-only 모듈에 닿거나 닿는 파일에 검사 문자열이 있으면 위반.
 * @returns {{ entries: number, reachable: number, violations: Array<{ kind: string, file: string, chain: string[], needle?: string }> }}
 */
export function checkClientModuleGraph({ root = SCRIPT_ROOT, needles = collectSecretNeedles(root) } = {}) {
  const files = listSourceFiles(root)
  const cache = new Map()
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, readFileSync(file, "utf8"))
    return cache.get(file)
  }
  const entries = files.filter((file) => isClientEntry(read(file)))
  const parent = new Map()
  const queue = []
  for (const entry of entries) {
    parent.set(entry, null)
    queue.push(entry)
  }
  const violations = []
  const chainOf = (file) => {
    const chain = []
    for (let current = file; current; current = parent.get(current)) chain.unshift(path.relative(root, current))
    return chain
  }
  while (queue.length > 0) {
    const file = queue.shift()
    const text = read(file)
    if (isServerOnly(text)) {
      violations.push({ kind: "server-only-import", file: path.relative(root, file), chain: chainOf(file) })
      continue
    }
    for (const needle of needles) {
      if (text.includes(needle)) {
        violations.push({ kind: "secret-string", file: path.relative(root, file), chain: chainOf(file), needle })
      }
    }
    for (const spec of runtimeImportSpecifiers(text)) {
      const resolved = resolveSpecifier(spec, file, root)
      if (resolved && !parent.has(resolved)) {
        parent.set(resolved, file)
        queue.push(resolved)
      }
    }
  }
  return { entries: entries.length, reachable: parent.size, violations }
}

/** 빌드 산출물(.next/static)에 검사 문자열이 있는지. 폴더가 없으면 null. */
export function checkStaticBundle({ root = SCRIPT_ROOT, needles = collectSecretNeedles(root) } = {}) {
  const dir = path.join(root, ".next", "static")
  if (!existsSync(dir)) return null
  const hits = []
  let scanned = 0
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(?:js|mjs|json|html|txt)$/.test(entry.name)) {
        scanned += 1
        const text = readFileSync(full, "utf8")
        for (const needle of needles) {
          if (text.includes(needle)) hits.push({ file: path.relative(root, full), needle })
        }
      }
    }
  }
  walk(dir)
  return { scanned, hits }
}

function main(argv) {
  const rootIndex = argv.indexOf("--root")
  const root = rootIndex >= 0 ? path.resolve(argv[rootIndex + 1]) : SCRIPT_ROOT
  const needles = collectSecretNeedles(root)
  if (needles.length === 0) {
    console.error("[client-bundle-secrets] 서버 전용 모듈에서 검사 문자열을 하나도 읽지 못했습니다. SECRET_SOURCES 를 확인하세요.")
    return 1
  }
  // 이름 자체는 출력하지 않는다(로그에 다시 퍼뜨리지 않기 위해). 개수와 파일만 보인다.
  if (argv.includes("--static")) {
    const result = checkStaticBundle({ root, needles })
    if (!result) {
      console.error("[client-bundle-secrets] .next/static 이 없습니다. next build 뒤에 --static 으로 실행하세요.")
      return 1
    }
    if (result.hits.length > 0) {
      const files = [...new Set(result.hits.map((hit) => hit.file))]
      console.error(`[client-bundle-secrets] 정적 청크 ${files.length}개에서 서버 전용 문자열 ${result.hits.length}건:`)
      for (const file of files) console.error(`  - ${file}`)
      return 1
    }
    console.log(`[client-bundle-secrets] 정적 청크 ${result.scanned}개, 검사 문자열 ${needles.length}개 — 0건`)
    return 0
  }
  const result = checkClientModuleGraph({ root, needles })
  if (result.violations.length > 0) {
    console.error(`[client-bundle-secrets] 위반 ${result.violations.length}건 (클라이언트 시작 파일 ${result.entries}개):`)
    for (const violation of result.violations) {
      console.error(`  - ${violation.kind}: ${violation.chain.join(" -> ")}`)
    }
    return 1
  }
  console.log(
    `[client-bundle-secrets] 모듈 그래프: 클라이언트 시작 파일 ${result.entries}개, 닿는 파일 ${result.reachable}개, 검사 문자열 ${needles.length}개 — 위반 0건`
  )
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
