// 대조 도구는 읽기만 한다 — 스크립트와 lib/branch/reconcile/*.ts 의 글자를 본다(실행하지 않는 정적 가드).
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const ROOT = process.cwd()
const SCRIPT = "scripts/reconcile-rev-ledger.ts"
const ARGS = "scripts/lib/reconcile-rev-ledger-args.ts"
const LIB_DIR = "lib/branch/reconcile"
const FILES = [SCRIPT, ARGS, ...readdirSync(join(ROOT, LIB_DIR)).filter((name) => name.endsWith(".ts")).map((name) => `${LIB_DIR}/${name}`)]

function source(file: string): string {
  return readFileSync(join(ROOT, file), "utf8")
}

// 주석을 뺀 코드(주석의 설명 글이 가드에 걸리지 않게)
function code(file: string): string {
  return source(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const FORBIDDEN: Array<[string, RegExp]> = [
  ["DB 쓰기", /\.(insert|update|upsert|delete|rpc)\s*\(/],
  ["시트 쓰기", /batchUpdate|values\.(update|append|clear|batchUpdate)/],
  [
    "쓰기·동기화·캐시 만료 함수",
    /\b(replaceBranch\w*|create\w*Draft\w*|update\w*Draft\w*|apply\w*Draft\w*|reverse\w*Entry\w*|insertSheetWriteAttempts|updateSheetWriteAttempt|recaptureActiveRevImport|captureRevDbImport|activateRevImportRun|revalidateTag|revalidatePath|runAll|syncRev|syncDshKpi|syncHw|completeBranchSync)\b/,
  ],
  ["파일 쓰기", /\b(writeFile\w*|appendFile\w*|createWriteStream|mkdir\w*|rmSync|unlink\w*|rename\w*Sync)\b/],
  ["네트워크 직접 호출", /\bfetch\s*\(/],
]

describe("대조 도구 — 읽기 전용 가드", () => {
  it("검사 대상 파일", () => {
    expect(FILES).toEqual(
      expect.arrayContaining([
        SCRIPT,
        ARGS,
        `${LIB_DIR}/read-sources.ts`,
        `${LIB_DIR}/rev-ledger-reconcile.ts`,
        `${LIB_DIR}/rev-ledger-render.ts`,
        `${LIB_DIR}/rev-ledger-inputs.ts`,
        `${LIB_DIR}/run-reconcile.ts`,
      ]),
    )
  })

  it.each(FILES)("%s 에 쓰기 호출이 없다", (file) => {
    const text = code(file)
    for (const [label, pattern] of FORBIDDEN) {
      expect(text, `${label}: ${pattern}`).not.toMatch(pattern)
    }
  })

  it("스크립트의 동적 import 는 라이브 읽기 모듈 하나뿐이고 글자 그대로 경로다", () => {
    const text = code(SCRIPT)
    const dynamic = [...text.matchAll(/import\(\s*([^)]*)\)/g)].map((match) => match[1].trim())
    expect(dynamic.length).toBeGreaterThan(0)
    expect(new Set(dynamic)).toEqual(new Set(['"../lib/branch/reconcile/read-sources"']))
  })

  it("스크립트의 정적 import 는 순수 모듈·node 내장만", () => {
    const imports = [...code(SCRIPT).matchAll(/^import .* from "([^"]+)"/gm)].map((match) => match[1])
    expect(imports.sort()).toEqual(
      ["../lib/branch/reconcile/run-reconcile", "../lib/business-time", "./lib/reconcile-rev-ledger-args", "node:fs", "node:os", "node:path"].sort(),
    )
    expect(code(SCRIPT)).not.toMatch(/import \{[^}]*\bwrite/)
  })

  it("라이브 읽기 모듈은 정해진 읽기 함수만 가져온다", () => {
    const text = code(`${LIB_DIR}/read-sources.ts`)
    const named = [...text.matchAll(/import \{([^}]*)\} from "(@\/lib\/[^"]+)"/g)].flatMap((match) =>
      match[1]
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name && !name.startsWith("type "))
        .map((name) => `${match[2]}:${name}`),
    )
    expect(named.sort()).toEqual(
      [
        "@/lib/branch/fiscal:fiscalYearMonths",
        "@/lib/branch/google-sheets:envSheetId",
        "@/lib/branch/google-sheets:readRangeWithFormat",
        "@/lib/branch/parsers/rev:REV_RANGE",
        "@/lib/repositories/branch-deals:listBranchRevDealsFresh",
        "@/lib/repositories/branch-sales-ledger-drafts:listBranchSalesLedgerDrafts",
        "@/lib/repositories/branch-sales-ledger-drafts:listBranchSalesLedgerEntries",
        "@/lib/repositories/branch-sales-ledger-sheet-writes:isSheetWritesNotReadyError",
        "@/lib/repositories/branch-sales-ledger-sheet-writes:lastSuccessfulRevSyncStartedAt",
        "@/lib/repositories/branch-sales-ledger-sheet-writes:latestSheetWritesByDraftIds",
        "@/lib/repositories/sales-ledger-imports:mapRevLineToDeal",
        "@/lib/repositories/sales-ledger-imports:REV_LINE_COLUMNS",
        "@/lib/repositories/sales-ledger-imports:REV_PERIOD_ENTRY_COLUMNS",
        "@/lib/supabase/admin:createSupabaseAdminClient",
        "@/lib/supabase/pagination:fetchSupabasePages",
        "@/lib/supabase/public-env:getSupabaseBrowserEnv",
      ].sort(),
    )
    // Supabase 는 select 로만 — from(...) 뒤에 select 가 온다
    const froms = [...text.matchAll(/\.from\("([a-z_]+)"\)\s*\.select\(/g)].map((match) => match[1])
    expect(froms.sort()).toEqual(["branch_rev_lines", "branch_rev_period_entries", "sales_ledger_active_sources"])
    expect([...text.matchAll(/\.from\(/g)]).toHaveLength(3)
  })

  it("순수 모듈은 라이브 읽기 모듈을 가져오지 않는다", () => {
    for (const file of ["rev-ledger-reconcile.ts", "rev-ledger-render.ts", "rev-ledger-inputs.ts", "run-reconcile.ts"]) {
      expect(code(`${LIB_DIR}/${file}`)).not.toMatch(/read-sources|@\/lib\/repositories\/(?!branch-deals")|@\/lib\/supabase|@\/lib\/google"/)
    }
  })

  it("package.json 에 rev:reconcile 이 react-server 조건으로 있다", () => {
    const pkg = JSON.parse(source("package.json")) as { scripts: Record<string, string> }
    expect(pkg.scripts["rev:reconcile"]).toBe("npx --node-options=--conditions=react-server tsx scripts/reconcile-rev-ledger.ts")
  })
})
