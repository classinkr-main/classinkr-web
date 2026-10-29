/**
 * '2. REV' 숨김 "Row ID" 열(CG) 일괄 부여 — 장부 반영 때 시트 쓰기(ADR-011)가 행을 찾는 열쇠를 만든다.
 *
 * 실행:
 *   npm run rev:row-ids                      # 미리보기(기본) — 시트에 쓰지 않는다
 *   npm run rev:row-ids -- --apply           # 사람이 미리보기를 확인한 뒤에만
 *   npm run rev:row-ids -- --apply --keep-sort   # 기본 필터에 정렬이 있어도 그대로 다시 건다(정렬이 다시 적용될 수 있다)
 *
 * 미리보기: 대상 배너(spreadsheetId·파일·탭·gid·서비스계정·행×열), 머리 검사, Row ID 열 유무,
 * 고객 행 수, ID 있음/없음/형식 오류/중복, 필터 전·후, 보낼 요청 요약(JSON). 막는 이유가 있으면 exit 1.
 *
 * --apply:
 *   1) 대상이 허용 목록(REV_WRITE_TARGET)과 env GOOGLE_BRANCH_DASHBOARD_SHEET_ID 둘 다와 같아야 한다.
 *   2) 열이 84개면 맨 끝에 한 열(CG)을 붙이고 CG2="Row ID", CG 숨김, 기본 필터를 CG 까지 넓힌다
 *      (읽은 filterSpecs·sortSpecs 그대로), 필터 뷰는 range 만. 이미 열이 있으면 다시 쓴다(멱등).
 *   3) 고객 행 중 빈 Row ID 칸에만 새 ID 를 쓴다(형식 오류·중복이 있으면 아무것도 보내지 않는다).
 *   4) 전부 batchUpdate 한 번(원자적)으로 보내고, 다시 읽어 확인한다 — 문제가 있으면 exit 1.
 * 계획·허용 목록·사후 검증은 scripts/lib/assign-rev-row-ids-plan.ts(순수, 테스트 있음).
 * 절차는 docs/active/rev-sheet-writeback-runbook.md.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type { sheets_v4 } from "googleapis"

import { fyOf } from "../lib/branch/fiscal"
import { REV_WRITE_TARGET } from "../lib/branch/sheet-writeback/config"
import { colToA1 } from "../lib/branch/sheet-writeback/layout"
import {
  allowContextFor,
  assertApplyTarget,
  assertRowIdRequestsAllowed,
  describeRowIdRequests,
  gridRangeA1,
  gridReadRange,
  planRowIdAssignment,
  rowIdRequestsSummaryJson,
  snapshotFromResponses,
  verifyRowIdAssignment,
  type RowIdPlan,
  type RowIdSheetSnapshot,
} from "./lib/assign-rev-row-ids-plan"

const LABEL = "[rev:row-ids]"
const READ_TIMEOUT_MS = 30_000
const WRITE_TIMEOUT_MS = 60_000

const args = new Set(process.argv.slice(2))
const apply = args.has("--apply")
const keepSort = args.has("--keep-sort")
const KNOWN_ARGS = new Set(["--apply", "--keep-sort"])

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function sheetsClient(): Promise<sheets_v4.Sheets> {
  const { google } = await import("googleapis")
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      private_key: requireEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return google.sheets({ version: "v4", auth })
}

/** 메타(속성·기본 필터·필터 뷰) 한 번 + 그 그리드 크기만큼 칸 한 번. 쓰지 않는다. */
async function readSnapshot(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<RowIdSheetSnapshot> {
  const meta = await sheets.spreadsheets.get(
    {
      spreadsheetId,
      includeGridData: false,
      fields: "properties(title),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),basicFilter,filterViews)",
    },
    { timeout: READ_TIMEOUT_MS, retry: false },
  )
  const metaSheet = meta.data.sheets?.find((sheet) => sheet.properties?.title === REV_WRITE_TARGET.tabTitle)
  const rowCount = metaSheet?.properties?.gridProperties?.rowCount ?? 0
  const columnCount = metaSheet?.properties?.gridProperties?.columnCount ?? 0
  if (!metaSheet || rowCount <= 0 || columnCount <= 0) return snapshotFromResponses(spreadsheetId, meta.data, null)
  const grid = await sheets.spreadsheets.get(
    {
      spreadsheetId,
      ranges: [gridReadRange(rowCount, columnCount)],
      includeGridData: true,
      fields: "sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(formattedValue,userEnteredValue)),columnMetadata(hiddenByUser)))",
    },
    { timeout: READ_TIMEOUT_MS, retry: false },
  )
  return snapshotFromResponses(spreadsheetId, meta.data, grid.data)
}

function printPlan(plan: RowIdPlan, serviceAccount: string) {
  const { target, counts } = plan
  const lastCol = target.columnCount > 0 ? colToA1(target.columnCount - 1) : "-"
  console.log(`${LABEL} ${apply ? "적용(--apply)" : "미리보기 — 시트에 쓰지 않는다(--apply 로 보낸다)"}`)
  console.log(`  대상     spreadsheetId=${target.spreadsheetId} · 파일 "${target.spreadsheetTitle ?? "?"}"`)
  console.log(`           탭 '${target.title ?? "?"}' · gid=${target.sheetId ?? "?"} · ${target.rowCount}행 × ${target.columnCount}열(A~${lastCol})`)
  console.log(`  env      GOOGLE_BRANCH_DASHBOARD_SHEET_ID ${target.envMatches ? "= 허용 목록 id" : "≠ 허용 목록 id(또는 비어 있음)"}`)
  console.log(`  계정     ${serviceAccount}`)
  if (plan.rowIdCol != null) {
    const col = colToA1(plan.rowIdCol)
    console.log(`  머리     A2=Account · 월 블록 12개 확인 · Row ID 열 ${plan.appendColumn ? `없음 → ${col} 새로 붙임` : `있음(${col}) → 다시 씀`}${plan.hideColumn ? ` · ${col} 숨김` : ""}`)
  }
  console.log(
    `  행       고객 행 ${counts.dataRows} · ID 있음 ${counts.withId} · 없음 ${counts.missing}(새로 부여 ${plan.assignments.length}) · 형식 오류 ${counts.invalid} · 중복 ${counts.duplicate} · 고객 없는 행의 ID ${counts.orphan}`,
  )
  if (plan.basicFilter) {
    const bf = plan.basicFilter
    console.log(`  기본 필터 ${gridRangeA1(bf.before)} → ${gridRangeA1(bf.after)} · filterSpecs ${bf.filterSpecs.length}개 · sortSpecs ${bf.sortSpecs.length}개(그대로 복사)`)
    console.log(`  필터 조건(JSON) ${JSON.stringify({ filterSpecs: bf.filterSpecs, sortSpecs: bf.sortSpecs })}`)
  } else {
    console.log("  기본 필터 없음")
  }
  for (const view of plan.filterViews) {
    console.log(`  필터 뷰  '${view.title ?? view.filterViewId}' ${gridRangeA1(view.before)} → ${gridRangeA1(view.after)}${view.note ? ` (${view.note})` : ""}`)
  }
  console.log(`  요청 ${plan.requests.length}개`)
  for (const line of describeRowIdRequests(plan.requests)) console.log(`    - ${line}`)
  console.log(`  요청 요약(JSON) ${JSON.stringify(rowIdRequestsSummaryJson(plan.requests))}`)
  for (const warning of plan.warnings) console.log(`  경고: ${warning}`)
  for (const blocker of plan.blockers) console.log(`  막음: ${blocker}`)
}

function errorSummary(e: unknown): string {
  if (!e || typeof e !== "object") return String(e)
  const err = e as { code?: unknown; status?: unknown; message?: unknown }
  const status = err.status ?? err.code
  return `${status != null ? `${String(status)} ` : ""}${typeof err.message === "string" ? err.message : String(e)}`
}

async function main() {
  const unknownArgs = [...args].filter((arg) => !KNOWN_ARGS.has(arg))
  if (unknownArgs.length > 0) throw new Error(`모르는 인자: ${unknownArgs.join(" ")} (--apply · --keep-sort)`)
  loadEnvLocal()
  const serviceAccount = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL")
  const envSpreadsheetId = process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID?.trim() || null
  const spreadsheetId = REV_WRITE_TARGET.spreadsheetId
  const refFy = fyOf(new Date())

  const sheets = await sheetsClient()
  const before = await readSnapshot(sheets, spreadsheetId)
  const plan = planRowIdAssignment(before, { refFy, envSpreadsheetId, keepSort })
  printPlan(plan, serviceAccount)

  if (!plan.ok) {
    console.error(`${LABEL} 막는 이유 ${plan.blockers.length}개 — 아무것도 보내지 않는다.`)
    process.exitCode = 1
    return
  }
  if (!apply) {
    console.log(`${LABEL} 미리보기 끝 — 쓰기 0. 확인했으면 --apply 로 다시 돌린다.`)
    return
  }
  if (plan.requests.length === 0) {
    console.log(`${LABEL} 보낼 것이 없다 — Row ID 열·숨김·필터·ID 가 이미 갖춰져 있다.`)
    return
  }

  assertApplyTarget(spreadsheetId, envSpreadsheetId)
  assertRowIdRequestsAllowed(plan.requests, allowContextFor(before, plan))
  try {
    await sheets.spreadsheets.batchUpdate(
      { spreadsheetId, fields: "spreadsheetId", requestBody: { requests: plan.requests } },
      { timeout: WRITE_TIMEOUT_MS, retry: false },
    )
  } catch (e) {
    console.error(`${LABEL} batchUpdate 실패: ${errorSummary(e)}`)
    console.error(`${LABEL} batchUpdate 는 전부 아니면 전무다. 4xx 면 바뀐 것이 없다. 5xx·마감이면 결과를 모른다 — 다시 보내지 말고 미리보기로 상태를 먼저 본다.`)
    process.exitCode = 1
    return
  }
  console.log(`${LABEL} batchUpdate 완료(요청 ${plan.requests.length}개) — 다시 읽어 확인한다`)

  const after = await readSnapshot(sheets, spreadsheetId)
  const problems = verifyRowIdAssignment(before, after, plan, refFy)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  확인 실패: ${problem}`)
    console.error(`${LABEL} 사후 검증 실패 ${problems.length}건 — 시트를 사람이 확인한다(런북 §행 ID).`)
    process.exitCode = 1
    return
  }
  console.log(`${LABEL} 사후 검증 통과 — 고객 행 ${plan.counts.dataRows}개 전부 고유 ID, 필터 조건 그대로. 다음: 동기화 한 번 뒤 Row ID 경고 0 확인.`)
}

main().catch((e) => {
  console.error(`${LABEL} 실패: ${errorSummary(e)}`)
  process.exit(1)
})
