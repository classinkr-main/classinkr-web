#!/usr/bin/env node
// 본사(HQ) EDUtech Asia 쇼케이스 앱(classin-edutech.web.app)을 /expo 아래 한국판으로 가져온다.
//
//   node scripts/expo/import-hq.mjs                 # 본사 사이트에서 내려받아 가져오기
//   node scripts/expo/import-hq.mjs --from <dir>    # 이미 내려받은 사본에서 가져오기
//   node scripts/expo/import-hq.mjs --manifest-only # 파일은 그대로 두고 version.json 만 다시 만들기
//
// 하는 일
//  1. 본사 version.json 의 파일 목록을 받아 public/expo 로 복사한다(본사 어드민·다른 언어 팩 제외).
//  2. 루트 절대경로(/deck/…, /rooms/… 등)를 /expo/… 로 바꾼다 — 본사 앱은 도메인 루트에 올라가는 전제다.
//  3. 한국판 패치(PATCHES)를 적용한다: 기본 에디션 kr, 언어 ko·en, 에디션을 본사 Firestore 대신 정적 JSON 에서 읽기.
//  4. 오프라인 저장용 version.json 을 다시 만든다.
//
// 한국판이 직접 관리하는 파일(KR_OWNED)은 이미 있으면 덮어쓰지 않는다. 본사 갱신을 다시 가져와도
// 한국어 번역·한국 에디션이 살아남는다.

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const HQ = "https://classin-edutech.web.app"
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..")
const OUT = path.join(ROOT, "public/expo")
const BASE = "/expo"
const KEEP_LANGS = ["ko"]
// 본사 version.json 의 파일별 표식(예: "tv")을 보관한다 — 오프라인 저장 목록을 다시 만들 때 쓴다.
const FLAGS = path.join(ROOT, "scripts/expo/hq-file-flags.json")

const args = process.argv.slice(2)
const fromDir = args.includes("--from") ? path.resolve(args[args.indexOf("--from") + 1]) : null
const manifestOnly = args.includes("--manifest-only")

const EXCLUDE = [
  /^admin\//, // 본사 에디션 편집기(본사 Firestore 에 쓴다)
  /^ai\/redirect-ai-feature-zone\//,
  /^i18n\/admin\//,
  /^editions\/(?!kr\.json$)/, // 다른 나라 에디션
  /^robots\.txt$/,
]
const isOtherLang = (p) => {
  const lang = (/^i18n\/[^/]+\/([a-z]{2})\.json$/.exec(p) || /^fonts-i18n\/([a-z]{2})-\d+\.woff2$/.exec(p) || [])[1]
  return Boolean(lang) && !KEEP_LANGS.includes(lang)
}

// 한국판이 소유하는 파일: 있으면 본사 것으로 덮지 않는다.
const KR_OWNED = [/^i18n\/[^/]+\/ko\.json$/, /^editions\/kr\.json$/, /^kr\//, /^manifest\.webmanifest$/]
const krOwned = (p) => KR_OWNED.some((re) => re.test(p))

const TEXT = /\.(html|js|mjs|css|json|webmanifest|svg|txt)$/
const ROOT_DIRS = "deck|ai|rooms|i18n|fonts-i18n|icons|editions|admin|__edition|kr"
const ROOT_FILES = "sw\\.js|shell\\.js|shell\\.css|text-lang\\.js|edition\\.js|made\\.js|i18n\\.js|ipad-bridge\\.js|version\\.json|manifest\\.webmanifest"
const ABS = new RegExp(`(?<=[\`"'(=,\\s])/(?=(?:${ROOT_DIRS})/|(?:${ROOT_FILES})(?=[\`"'?#)\\s]))`, "g")

// 각 패치는 정확히 한 번 맞아야 한다. 본사 코드가 바뀌어 안 맞으면 멈추고 알린다.
const PATCHES = {
  "shell.js": [
    // 언어는 한국어·영어만 — 한국어를 맨 앞에.
    [/var LANGS=\[\[`en`,`English`,`EN`\][^;]*;/, "var LANGS=[[`ko`,`한국어`,`한국어`],[`en`,`English`,`EN`]];"],
    // 주소에 region 이 없으면 한국 에디션.
    ["region=region||`global`;", "region=region||`kr`;"],
    // 처음 여는 기기는 한국어로.
    ["setLang(q.get(`lang`)||keptLang||`en`,false)", "setLang(q.get(`lang`)||keptLang||`ko`,false)"],
    // 에디션을 본사 Firestore 대신 같은 출처의 정적 JSON 에서 읽는다(네트워크 우선, 실패 시 오프라인 사본).
    [
      /function published\(\)\{return fetch\(FS\+`\/editions\/`\+edId\)[\s\S]*?withPictures\(ed\)\.then\(function\(e\)\{return\{ok:true,ed:e\}\}\)\}\)\}\)\}/,
      "function published(){return fetch(`editions/`+edId+`.json?__net=`+Date.now(),{cache:`no-store`}).then(function(r){if(r.status===404)return{ok:true,ed:null};if(!r.ok)throw new Error(`status `+r.status);return r.json().then(function(ed){if(!ed||typeof ed!==`object`)return{ok:true,ed:null};edFound=true;ed.version=Number(ed.version)||0;return{ok:true,ed:ed}})})}",
    ],
  ],
  "i18n.js": [["location.pathname.match(/^\\/(ai|rooms)\\//)", "location.pathname.match(/^\\/expo\\/(ai|rooms)\\//)"]],
  "deck/assets/blocks-DS47Suv0.js": [["r=function(e){return`/`+e}", "r=function(e){return`/expo/`+e}"]],
  "index.html": [['<html lang="en">', '<html lang="ko">']],
}

function sh(cmd, argv) {
  return execFileSync(cmd, argv, { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 28 })
}

function download(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const ver = JSON.parse(sh("curl", ["-sSf", `${HQ}/version.json?__net=${Date.now()}`]).toString())
  fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify(ver))
  const todo = ver.files.map((f) => f[0]).filter((p) => !EXCLUDE.some((re) => re.test(p)) && !isOtherLang(p))
  for (const extra of ["sw.js"]) todo.push(extra)
  let n = 0
  for (const p of todo) {
    const dest = path.join(dir, p)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    sh("curl", ["-sSf", "-o", dest, `${HQ}/${p}`])
    if (++n % 50 === 0) console.log(`  내려받음 ${n}/${todo.length}`)
  }
  return dir
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join("/")]
  })
}

function applyPatches(rel, text) {
  for (const [from, to] of PATCHES[rel] || []) {
    const hits = typeof from === "string" ? text.split(from).length - 1 : (text.match(new RegExp(from.source, "g")) || []).length
    if (hits !== 1) throw new Error(`패치가 ${rel} 에 ${hits}번 맞음(1번이어야 함): ${String(from).slice(0, 80)}`)
    text = typeof from === "string" ? text.replace(from, () => to) : text.replace(from, () => to)
  }
  return text
}

function importFiles(src) {
  const hqVer = JSON.parse(fs.readFileSync(path.join(src, "version.json"), "utf8"))
  const flags = new Map(hqVer.files.map((f) => [f[0], f.slice(3)]))
  const files = walk(src).filter((p) => p !== "version.json" && !EXCLUDE.some((re) => re.test(p)) && !isOtherLang(p))
  let copied = 0,
    kept = 0
  for (const rel of files) {
    const dest = path.join(OUT, rel)
    if (krOwned(rel) && fs.existsSync(dest)) {
      kept++
      continue
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    if (TEXT.test(rel)) {
      let text = fs.readFileSync(path.join(src, rel), "utf8").replace(/\r\n/g, "\n")
      text = applyPatches(rel, text)
      text = text.replace(ABS, `${BASE}/`)
      fs.writeFileSync(dest, text)
    } else {
      fs.copyFileSync(path.join(src, rel), dest)
    }
    copied++
  }
  for (const rel of Object.keys(PATCHES)) if (!files.includes(rel)) throw new Error(`패치 대상이 없음: ${rel}`)
  fs.writeFileSync(FLAGS, JSON.stringify(Object.fromEntries(flags), null, 1) + "\n")
  console.log(`가져옴 ${copied}개, 한국판 파일 유지 ${kept}개 (본사 버전 ${hqVer.version})`)
}

// shell.js 의 오프라인 저장은 version.json 의 [경로, 해시, 크기, 표식…] 목록을 읽는다.
function writeManifest() {
  const flags = fs.existsSync(FLAGS) ? JSON.parse(fs.readFileSync(FLAGS, "utf8")) : {}
  const skip = new Set(["version.json", "sw.js"])
  const files = walk(OUT)
    .filter((p) => !skip.has(p) && !p.startsWith("."))
    .sort()
    .map((p) => {
      const buf = fs.readFileSync(path.join(OUT, p))
      return [p, createHash("sha256").update(buf).digest("hex").slice(0, 12), buf.length, ...(flags[p] || [])]
    })
  const version = createHash("sha256").update(JSON.stringify(files)).digest("hex").slice(0, 12)
  fs.writeFileSync(path.join(OUT, "version.json"), JSON.stringify({ version, files }))
  const mb = files.reduce((s, f) => s + f[2], 0) / 1e6
  console.log(`version.json: ${files.length}개 파일, ${mb.toFixed(1)}MB, 버전 ${version}`)
}

if (!manifestOnly) {
  const src = fromDir || download(fs.mkdtempSync(path.join(os.tmpdir(), "classin-hq-")))
  importFiles(src)
}
writeManifest()
