// npm run rev:reconcile 한 번의 흐름 — 원천 고르기 → (inputs-json 이면 입력만 남김) → 대조 → 그리기 → stderr 끝 줄.
// 시트·DB·파일·출력·시각은 모두 deps 로 받는다: 스크립트(scripts/reconcile-rev-ledger.ts)가 실제 I/O 를 넘기고,
// 테스트는 파일 모드를 네트워크 없이 끝까지 돌린다. 라이브 읽기는 --sheet=live·--db=live 일 때만 부른다.

import { fiscalYearMonths, fiscalYearOfYm } from "@/lib/branch/fiscal"
import { getBusinessDateParts } from "@/lib/business-time"
import { reconcileRevLedger, type ReconcileStatus } from "./rev-ledger-reconcile"
import {
  parseReconcileInputs,
  serializeReconcileInputs,
  RECONCILE_INPUTS_VERSION,
  type ReconcileInputsFile,
  type ReconcileLedgerInput,
  type ReconcileSheetInput,
} from "./rev-ledger-inputs"
import { renderReconcileCsv, renderReconcileJson, renderReconcileMarkdown } from "./rev-ledger-render"

type RunSource = { kind: "live" } | { kind: "file"; path: string }

/** scripts/lib/reconcile-rev-ledger-args.ts ReconcileArgs 와 같은 모양(그 파일을 lib 에서 가져오지 않는다). */
export interface ReconcileRunArgs {
  sheet: RunSource
  db: RunSource
  dbSource: "screen" | "mirror" | "import"
  format: "md" | "csv" | "json" | "inputs-json"
  asOf: string | null
  fy: number | null
  months: string[] | null
  manager: string | null
  tolerance: number
}

export interface ReconcileRunDeps {
  now: Date
  stdout: (text: string) => void
  stderr: (text: string) => void
  /** 파일 모드의 유일한 파일 접근(읽기). */
  readTextFile: (path: string) => string
  /** 라이브 읽기 직전 한 번(.env.local 읽기). 파일 모드에서는 부르지 않는다. */
  prepareLive: () => void
  readLiveSheet: () => Promise<{ input: ReconcileSheetInput; spreadsheetIdTail: string }>
  readLiveLedger: (fiscalYear: number, dbSource: ReconcileRunArgs["dbSource"]) => Promise<{ input: ReconcileLedgerInput; host: string; queries: number }>
}

const LABEL = "[rev:reconcile]"

const STATUS_WORDS: Record<ReconcileStatus, string> = {
  same: "같음",
  explained: "차이 있음(설명됨)",
  blocked: "막음",
  incomplete: "불완전",
}

export const RECONCILE_PRIVACY_NOTE = `${LABEL} 이 출력에는 고객 이름 · 금액이 들어 있다 — 저장소 밖에 두고 공유하지 않는다`

/** 실행 한 번 — 종료 코드를 돌려준다(0 같음·설명됨 · 1 막음 · 2 인자 · 3 불완전·읽기 실패). */
export async function runReconcile(args: ReconcileRunArgs, deps: ReconcileRunDeps): Promise<number> {
  const asOf = args.asOf ?? getBusinessDateParts(deps.now).date
  const fiscalYear = args.fy ?? fiscalYearOfYm(asOf)
  if (args.months) {
    const allowed = fiscalYearMonths(fiscalYear)
    const outside = args.months.filter((month) => !allowed.includes(month))
    if (outside.length > 0) {
      deps.stderr(`${LABEL} --months 는 FY${fiscalYear}(${allowed[0]}~${allowed[11]}) 달만 됩니다: ${outside.join(", ")}\n`)
      return 2
    }
  }

  let sheetReads = 0
  let dbQueries = 0
  let sheet: ReconcileSheetInput
  let ledger: ReconcileLedgerInput
  try {
    if (args.sheet.kind === "live" || args.db.kind === "live") deps.prepareLive()
    const files = new Map<string, ReconcileInputsFile>()
    const fileAt = (path: string, need: { sheet: boolean; ledger: boolean }) => {
      const key = `${path}\u0000${need.sheet}\u0000${need.ledger}`
      const cached = files.get(key)
      if (cached) return cached
      const parsed = parseReconcileInputs(deps.readTextFile(path), need)
      files.set(key, parsed)
      return parsed
    }

    if (args.sheet.kind === "live") {
      const live = await deps.readLiveSheet()
      sheetReads += 1
      sheet = live.input
      deps.stderr(`${LABEL} 시트 읽음 — 스프레드시트 …${live.spreadsheetIdTail} · ${sheet.range} · ${sheet.grid.length}행\n`)
    } else {
      sheet = fileAt(args.sheet.path, { sheet: true, ledger: false }).sheet as ReconcileSheetInput
      deps.stderr(`${LABEL} 시트 = 파일 ${args.sheet.path}(읽은 시각 ${sheet.readAt})\n`)
    }
    if (args.db.kind === "live") {
      const live = await deps.readLiveLedger(fiscalYear, args.dbSource)
      dbQueries += live.queries
      ledger = live.input
      deps.stderr(`${LABEL} 장부 DB 읽음 — ${live.host} · ${ledger.source.kind === "import" ? `액티브 임포트 run ${ledger.source.runId}` : "시트 미러"} · REV 행 ${ledger.deals.length}\n`)
    } else {
      ledger = fileAt(args.db.path, { sheet: false, ledger: true }).ledger as ReconcileLedgerInput
      deps.stderr(`${LABEL} 장부 DB = 파일 ${args.db.path}\n`)
    }
  } catch (error) {
    deps.stderr(`${LABEL} 읽기 실패 — 판정하지 않았다: ${error instanceof Error ? error.message : String(error)}\n`)
    deps.stderr(`${LABEL} 끝 — 쓰기 0 · 시트 읽기 ${sheetReads}회(spreadsheets.get) · DB 조회 ${dbQueries}회 · 결과 불완전(종료 코드 3)\n`)
    return 3
  }

  if (args.format === "inputs-json") {
    deps.stdout(serializeReconcileInputs({ version: RECONCILE_INPUTS_VERSION, capturedAt: deps.now.toISOString(), sheet, ledger }))
    deps.stderr(`${RECONCILE_PRIVACY_NOTE}\n`)
    deps.stderr(`${LABEL} 끝 — 쓰기 0 · 시트 읽기 ${sheetReads}회(spreadsheets.get) · DB 조회 ${dbQueries}회 · 입력만 남김(종료 코드 0)\n`)
    return 0
  }

  const report = reconcileRevLedger(sheet, ledger, {
    fiscalYear,
    asOf,
    now: deps.now.toISOString(),
    tolerance: args.tolerance,
    months: args.months,
    manager: args.manager,
  })
  const output =
    args.format === "csv" ? renderReconcileCsv(report) : args.format === "json" ? renderReconcileJson(report) : renderReconcileMarkdown(report)
  deps.stdout(output)
  deps.stderr(`${RECONCILE_PRIVACY_NOTE}\n`)
  for (const reason of report.meta.incompleteReasons) deps.stderr(`${LABEL} 불완전 — ${reason}\n`)
  for (const reason of report.meta.blockReasons) deps.stderr(`${LABEL} 막음 — ${reason}\n`)
  deps.stderr(
    `${LABEL} 끝 — 쓰기 0 · 시트 읽기 ${sheetReads}회(spreadsheets.get) · DB 조회 ${dbQueries}회 · 결과 ${STATUS_WORDS[report.status]}(종료 코드 ${report.exitCode})\n`,
  )
  return report.exitCode
}
