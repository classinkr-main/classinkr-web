// 빌드 뒤 서버 함수 추적(.next/server/**/*.nft.json) 크기 검사. `npm run build` 다음에 `npm run check:trace-size`.
//
// - 모든 함수: 추적 파일 합계가 Vercel 함수 용량 상한(250MB, 압축 전)을 넘으면 실패.
// - 답 색인 로더(lib/chatbot/answer-index/load.ts)가 번들에 든 함수: 80MB·2000파일 이하, public/·tests/ 0개,
//   답 색인 런타임 자료(manifest.json·cards/·variants/·universe/ 등) 전부 포함, 점검용 자료(audit/·eval/ 등) 0개.
//   load.ts 의 자료 경로는 turbopackIgnore 라 런타임 자료는 next.config.ts 의 outputFileTracingIncludes 가 넣는다.
//   새 라우트가 load.ts 를 끌어오는데 그 목록에 없으면 여기서 "런타임 자료 빠짐" 으로 걸린다.
//
// 빌드 흐름(build·postbuild)에는 넣지 않았다. CI 에 넣을지는 따로 정한다.
// 상한 근거(2026-11-25 실측): 답 색인 함수는 65.3~65.5MB·1,478~1,484파일이다. 그 가운데 googleapis 가 32.8MB·904파일
// (상담 연결 → 알림 → lib/email.ts → lib/google.ts 사슬로 실제 쓰인다), 답 색인 런타임 자료가 21.6MB·57파일이다.
// 고치기 전에는 public/ 까지 실려 561MB·6,900파일이었다. 여유를 두되 그 회귀는 확실히 잡는 값으로 둔다.
// 옵션: --dir <프로젝트 루트>  --max-mb 250  --index-max-mb 80  --index-max-files 2000  --json(표 대신 JSON)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
function option(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const ROOT = path.resolve(option("--dir", process.cwd()))
const MAX_MB = Number(option("--max-mb", "250"))
const INDEX_MAX_MB = Number(option("--index-max-mb", "80"))
const INDEX_MAX_FILES = Number(option("--index-max-files", "2000"))
const AS_JSON = args.includes("--json")
const SERVER_DIR = path.join(ROOT, ".next", "server")
const DATA_REL = "data/answer-index/"
const MB = 1024 * 1024

// 답 색인 로더가 번들에 들어간 청크에 남는 문자열(load.ts ANSWER_INDEX_RUNTIME_TOP_FILES).
const LOADER_MARKERS = ["legacy-alias.json", "generic-words.json", "calibration.json"]
const RUNTIME_TOP = ["lexicon.json", "generic-words.json", "absent.json", "legacy-alias.json", "calibration.json", "manifest.json"]
const RUNTIME_DIRS = ["cards", "variants", "universe"]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith(".nft.json")) out.push(full)
  }
  return out
}

const sizeCache = new Map()
function fileSize(file) {
  if (!sizeCache.has(file)) {
    let size = null
    try {
      const stat = statSync(file)
      size = stat.isFile() ? stat.size : 0
    } catch {
      size = null
    }
    sizeCache.set(file, size)
  }
  return sizeCache.get(file)
}

const markerCache = new Map()
function hasLoader(file) {
  if (!file.endsWith(".js")) return false
  if (!markerCache.has(file)) {
    let found = false
    try {
      const text = readFileSync(file, "utf8")
      found = LOADER_MARKERS.every((marker) => text.includes(marker))
    } catch {
      found = false
    }
    markerCache.set(file, found)
  }
  return markerCache.get(file)
}

/** 지금 자료 폴더에서 런타임이 읽는 파일(load.ts 와 같은 규칙: 조각 이름 제외). */
function expectedRuntimeFiles() {
  const dataDir = path.join(ROOT, DATA_REL)
  const files = RUNTIME_TOP.filter((name) => existsSync(path.join(dataDir, name)))
  for (const sub of RUNTIME_DIRS) {
    const dir = path.join(dataDir, sub)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".json") && !name.replace(/\.json$/, "").includes(".")) files.push(`${sub}/${name}`)
    }
  }
  return files.sort()
}

function main() {
  if (!existsSync(SERVER_DIR)) {
    console.error(`[trace-size] ${path.relative(process.cwd(), SERVER_DIR) || SERVER_DIR} 없음 — 먼저 next build 를 돌린다.`)
    process.exit(2)
  }
  const expected = expectedRuntimeFiles()
  const rows = []
  for (const nft of walk(SERVER_DIR).sort()) {
    const fn = path.relative(SERVER_DIR, nft).split(path.sep).join("/").replace(/\.nft\.json$/, "")
    const base = path.dirname(nft)
    const trace = JSON.parse(readFileSync(nft, "utf8"))
    let files = 0
    let bytes = 0
    let usesIndex = hasLoader(nft.replace(/\.nft\.json$/, ""))
    const topDirs = { public: 0, tests: 0 }
    const indexFiles = new Set()
    for (const entry of trace.files ?? []) {
      const abs = path.resolve(base, entry)
      const size = fileSize(abs)
      if (size === null) continue
      files += 1
      bytes += size
      const rel = path.relative(ROOT, abs).split(path.sep).join("/")
      const top = rel.split("/")[0]
      if (top in topDirs) topDirs[top] += 1
      if (rel.startsWith(DATA_REL)) indexFiles.add(rel.slice(DATA_REL.length))
      if (!usesIndex && rel.startsWith(".next/server/") && hasLoader(abs)) usesIndex = true
    }
    const problems = []
    if (bytes > MAX_MB * MB) problems.push(`${(bytes / MB).toFixed(1)}MB > ${MAX_MB}MB`)
    if (usesIndex) {
      if (bytes > INDEX_MAX_MB * MB) problems.push(`답 색인 함수 ${(bytes / MB).toFixed(1)}MB > ${INDEX_MAX_MB}MB`)
      if (files > INDEX_MAX_FILES) problems.push(`답 색인 함수 파일 ${files}개 > ${INDEX_MAX_FILES}`)
      if (topDirs.public) problems.push(`public/ ${topDirs.public}개`)
      if (topDirs.tests) problems.push(`tests/ ${topDirs.tests}개`)
      const missing = expected.filter((file) => !indexFiles.has(file))
      if (missing.length) problems.push(`답 색인 런타임 자료 빠짐 ${missing.length}개(${missing.slice(0, 3).join(", ")}${missing.length > 3 ? " …" : ""}) — next.config.ts answerIndexRoutes`)
      const extra = [...indexFiles].filter((file) => !expected.includes(file))
      if (extra.length) problems.push(`런타임이 읽지 않는 답 색인 자료 ${extra.length}개(${extra.slice(0, 3).join(", ")})`)
    }
    rows.push({ fn, usesIndex, files, mb: Number((bytes / MB).toFixed(1)), public: topDirs.public, tests: topDirs.tests, indexFiles: indexFiles.size, problems })
  }

  const failed = rows.filter((row) => row.problems.length)
  const indexRows = rows.filter((row) => row.usesIndex)
  if (AS_JSON) {
    console.log(JSON.stringify({ expectedRuntimeFiles: expected.length, functions: rows.length, failed: failed.length, rows }, null, 1))
  } else {
    console.log(`[trace-size] 함수 ${rows.length}개, 가장 큰 함수 ${Math.max(0, ...rows.map((row) => row.mb))}MB, 답 색인 로더 포함 ${indexRows.length}개(런타임 자료 ${expected.length}개 기대)`)
    for (const row of indexRows.sort((a, b) => b.mb - a.mb)) {
      console.log(`  ${row.problems.length ? "FAIL" : "ok  "} ${row.fn}: ${row.files}파일 ${row.mb}MB 답색인 ${row.indexFiles} public ${row.public} tests ${row.tests}`)
    }
    for (const row of failed) console.error(`[trace-size] 실패 ${row.fn}: ${row.problems.join("; ")}`)
  }
  if (indexRows.length === 0) {
    // 로더를 못 찾으면(표식 문자열이 바뀌는 등) 검사가 아무것도 안 본 채 통과하지 않게 한다.
    console.error("[trace-size] 답 색인 로더가 든 함수를 하나도 찾지 못했다 — LOADER_MARKERS 를 load.ts 와 맞춘다.")
    process.exit(1)
  }
  if (failed.length) process.exit(1)
  console.log("[trace-size] 통과")
}

main()
