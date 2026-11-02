import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * 시트 쓰기 표면 래칫(REV 시트 쓰기, 2026-10-23).
 *
 * 1) Google Sheets 쓰기 호출은 허용 목록 파일에만 있다 — 원본 '2. REV' 에 쓰는 런타임 경로는
 *    lib/branch/sheet-writeback/sheets-client.ts 하나이고, 일괄 행 ID 부여는 scripts/assign-rev-row-ids.ts 다.
 *    새 파일이 시트에 쓰기 시작하면 여기서 잡는다(허용 목록은 줄이기만 한다).
 * 2) 장부 반영 RPC(applyBranchSalesLedgerDraft · 시트 쓰기 전용 applyBranchSalesLedgerDraftIfUnchanged)는 반영
 *    서비스(apply-service.ts)만 부른다 — 라우트가 직접 부르면 시트 쓰기 스위치·충돌 검사를 건너뛴다.
 * 범위: app·components·lib·scripts·proxy.ts 의 .ts/.tsx/.js/.mjs/.cjs(tests·node_modules·.next 제외), 주석 제외.
 */

const ROOT = process.cwd()
const SCAN_DIRS = ["app", "components", "lib", "scripts"]
const SCAN_FILES = ["proxy.ts"]
const SOURCE_RE = /\.(ts|tsx|js|mjs|cjs)$/

const SHEETS_WRITE_RE =
  /\b(?:spreadsheets\s*\.\s*(?:batchUpdate|batchUpdateByDataFilter)|values\s*\.\s*(?:update|batchUpdate|batchUpdateByDataFilter|append|clear|batchClear|batchClearByDataFilter))\b/

const SHEETS_WRITE_ALLOWED = [
  "lib/google.ts",
  "lib/meets/attendee-sheet.ts",
  "lib/branch/sheet-writeback/sheets-client.ts",
  "scripts/assign-rev-row-ids.ts",
]

const APPLY_CALL_RE = /\bapplyBranchSalesLedgerDraft(?:IfUnchanged)?\s*\(/
const APPLY_CALL_ALLOWED = [
  "lib/branch/sheet-writeback/apply-service.ts",
  "lib/repositories/branch-sales-ledger-drafts.ts", // 정의
]

function listSources(directory: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(directory)
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    if (entry === "node_modules" || entry.startsWith(".")) return []
    const absolute = path.join(directory, entry)
    if (statSync(absolute).isDirectory()) return listSources(absolute)
    return SOURCE_RE.test(entry) ? [absolute] : []
  })
}

function repoPath(absolute: string) {
  return path.relative(ROOT, absolute).split(path.sep).join("/")
}

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

const files = [
  ...SCAN_DIRS.flatMap((dir) => listSources(path.join(ROOT, dir))),
  ...SCAN_FILES.map((file) => path.join(ROOT, file)),
].filter((file) => {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
})

function matching(re: RegExp) {
  return files.filter((file) => re.test(stripComments(readFileSync(file, "utf8")))).map(repoPath).sort()
}

describe("시트 쓰기 표면 래칫", () => {
  it("저장소 소스를 실제로 훑는다(0건이면 아무것도 지키지 못한다)", () => {
    expect(files.length).toBeGreaterThan(500)
    expect(files.map(repoPath)).toContain("lib/google.ts")
  })

  it("Sheets 쓰기 호출(batchUpdate·values.update/append/clear…)은 허용 목록 파일에만", () => {
    const offenders = matching(SHEETS_WRITE_RE).filter((file) => !SHEETS_WRITE_ALLOWED.includes(file))
    expect(offenders).toEqual([])
  })

  it("허용 목록의 런타임 쓰기 경로가 실제로 쓰기 호출을 갖는다(빈 허용은 지운다)", () => {
    const writers = matching(SHEETS_WRITE_RE)
    for (const file of ["lib/google.ts", "lib/meets/attendee-sheet.ts", "lib/branch/sheet-writeback/sheets-client.ts"]) {
      expect(writers, file).toContain(file)
    }
  })

  it("applyBranchSalesLedgerDraft(IfUnchanged)( 호출은 반영 서비스와 정의 파일에만 — 라우트는 서비스를 거친다", () => {
    const offenders = matching(APPLY_CALL_RE).filter((file) => !APPLY_CALL_ALLOWED.includes(file))
    expect(offenders).toEqual([])
  })

  it("판정 정규식이 실제 호출 꼴을 잡는다", () => {
    expect(SHEETS_WRITE_RE.test("sheets.spreadsheets.batchUpdate({")).toBe(true)
    expect(SHEETS_WRITE_RE.test("sheets.spreadsheets.values.update({")).toBe(true)
    expect(SHEETS_WRITE_RE.test("sheets.spreadsheets.values.append({")).toBe(true)
    expect(SHEETS_WRITE_RE.test("api.values.batchUpdate(")).toBe(true)
    expect(SHEETS_WRITE_RE.test("sheets.spreadsheets.values.get({")).toBe(false)
    expect(APPLY_CALL_RE.test("await applyBranchSalesLedgerDraft(id, actor)")).toBe(true)
    expect(APPLY_CALL_RE.test("await applyBranchSalesLedgerDraftIfUnchanged(id, actor, at)")).toBe(true)
    expect(APPLY_CALL_RE.test("applyBranchSalesLedgerDraftX(")).toBe(false)
  })
})
