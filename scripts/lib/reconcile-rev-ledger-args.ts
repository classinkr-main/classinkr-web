// npm run rev:reconcile 인자 해석 — 순수 모듈(테스트 있음: tests/branch/reconcile/reconcile-args.test.ts).
// 읽기 전용 대조라 "어디서 읽을지"(--sheet·--db)를 늘 적게 한다. 라이브 읽기는 --sheet=live·--db=live 로만 켠다.

import { fiscalYearMonths, fiscalYearOfYm, parseYmMonth } from "../../lib/branch/fiscal"

export type SourceSpec = { kind: "live" } | { kind: "file"; path: string }

export type ReconcileDbSourceChoice = "screen" | "mirror" | "import"
export type ReconcileFormat = "md" | "csv" | "json" | "inputs-json"

export interface ReconcileArgs {
  sheet: SourceSpec
  db: SourceSpec
  dbSource: ReconcileDbSourceChoice
  format: ReconcileFormat
  /** 읽는 날(KST 'YYYY-MM-DD'). null 이면 실행하는 날 */
  asOf: string | null
  /** 회계연도. null 이면 읽는 날의 회계연도 */
  fy: number | null
  months: string[] | null
  manager: string | null
  tolerance: number
}

export type ReconcileArgsResult = { ok: true; args: ReconcileArgs } | { ok: false; exitCode: 0 | 2; message: string }

const LABEL = "[rev:reconcile]"

export const RECONCILE_REFUSAL = `${LABEL} 읽기 전용 대조 — 어디서 읽을지 꼭 적어 주세요: --sheet=live|file:<경로> --db=live|file:<경로>`

export const RECONCILE_USAGE = `REV 시트 '2. REV' ↔ 매출 장부 대조(읽기 전용 — 시트·DB 에 쓰지 않는다)

  npm run rev:reconcile -- --sheet=live --db=live
  npm run rev:reconcile -- --sheet=live --db=live --months=2026-11,2026-12 --manager=<이름>
  npm run rev:reconcile -- --sheet=live --db=live --format=csv > ~/recon/2026-11-30.csv
  npm run rev:reconcile -- --sheet=live --db=live --format=inputs-json > ~/recon/2026-11-30-inputs.json
  npm run rev:reconcile -- --sheet=file:~/recon/2026-11-30-inputs.json --db=file:~/recon/2026-11-30-inputs.json

필수
  --sheet=live|file:<경로>   시트 원천(라이브 = spreadsheets.get 한 번)
  --db=live|file:<경로>      장부 DB 원천(라이브 = select 만)
선택
  --db-source=screen|mirror|import   REV 행 원천(기본 screen = 액티브 임포트, 없으면 미러 — 화면과 같다)
  --format=md|csv|json|inputs-json   출력(기본 md). inputs-json 은 입력을 파일로 남긴다(고객 이름·금액 포함)
  --as-of=YYYY-MM-DD                 읽는 날(KST, 기본 오늘) — 확정·예정 판정 기준일
  --fy=2026                          회계연도(기본 읽는 날의 회계연도)
  --months=YYYY-MM,...               볼 달(그 회계연도 달만)
  --manager=<이름>                   이 담당만(별칭·대소문자 무시). 0절은 개수만 보인다
  --tolerance=0.5                    같다고 보는 차이(¥)
  --help

종료 코드: 0 = 같음·설명된 차이만 · 1 = 잠금을 막는 차이 · 2 = 인자 오류 · 3 = 불완전(상한·읽기 실패)`

const KNOWN_FLAGS = new Set(["--sheet", "--db", "--db-source", "--format", "--as-of", "--fy", "--months", "--manager", "--tolerance"])
const YMD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function usageError(message: string): ReconcileArgsResult {
  return { ok: false, exitCode: 2, message: `${LABEL} ${message}\n\n${RECONCILE_USAGE}` }
}

function isCalendarDate(value: string): boolean {
  if (!YMD_RE.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function parseSource(value: string, flag: string): SourceSpec | string {
  if (value === "live") return { kind: "live" }
  if (value.startsWith("file:")) {
    const path = value.slice("file:".length).trim()
    return path ? { kind: "file", path } : `${flag}=file: 뒤에 경로가 없습니다`
  }
  return `${flag} 는 live 또는 file:<경로> 입니다: ${value}`
}

/**
 * argv(npm run 뒤 인자) → 대조 인자. today(KST 'YYYY-MM-DD')를 주면 --as-of 가 없을 때 --months 를 그 회계연도로 검사한다.
 * --flag=값 과 --flag 값 둘 다 받는다. 모르는 인자·같은 인자 두 번·형식 오류는 종료 코드 2.
 */
export function parseReconcileArgs(argv: readonly string[], options?: { today?: string }): ReconcileArgsResult {
  const values = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") return { ok: false, exitCode: 0, message: RECONCILE_USAGE }
    if (!arg.startsWith("--")) return usageError(`모르는 인자: ${arg}`)
    const eq = arg.indexOf("=")
    const flag = eq >= 0 ? arg.slice(0, eq) : arg
    if (!KNOWN_FLAGS.has(flag)) return usageError(`모르는 인자: ${flag}`)
    let value: string
    if (eq >= 0) value = arg.slice(eq + 1)
    else {
      const next = argv[i + 1]
      if (next == null || next.startsWith("--")) return usageError(`${flag} 에 값이 없습니다`)
      value = next
      i += 1
    }
    if (values.has(flag)) return usageError(`같은 인자를 두 번 적었습니다: ${flag}`)
    values.set(flag, value.trim())
  }

  const sheetRaw = values.get("--sheet")
  const dbRaw = values.get("--db")
  if (!sheetRaw || !dbRaw) return { ok: false, exitCode: 2, message: RECONCILE_REFUSAL }
  const sheet = parseSource(sheetRaw, "--sheet")
  if (typeof sheet === "string") return usageError(sheet)
  const db = parseSource(dbRaw, "--db")
  if (typeof db === "string") return usageError(db)

  const dbSourceRaw = values.get("--db-source") ?? "screen"
  if (dbSourceRaw !== "screen" && dbSourceRaw !== "mirror" && dbSourceRaw !== "import") {
    return usageError(`--db-source 는 screen|mirror|import 입니다: ${dbSourceRaw}`)
  }
  if (values.has("--db-source") && db.kind !== "live") return usageError("--db-source 는 --db=live 일 때만 씁니다(파일은 담긴 원천 그대로 읽는다)")
  const formatRaw = values.get("--format") ?? "md"
  if (formatRaw !== "md" && formatRaw !== "csv" && formatRaw !== "json" && formatRaw !== "inputs-json") {
    return usageError(`--format 은 md|csv|json|inputs-json 입니다: ${formatRaw}`)
  }

  const asOfRaw = values.get("--as-of")
  if (asOfRaw != null && !isCalendarDate(asOfRaw)) return usageError(`--as-of 는 YYYY-MM-DD(KST 날짜)입니다: ${asOfRaw}`)
  const asOf = asOfRaw ?? null

  const fyRaw = values.get("--fy")
  let fy: number | null = null
  if (fyRaw != null) {
    if (!/^\d{4}$/.test(fyRaw) || Number(fyRaw) < 2020 || Number(fyRaw) > 2100) return usageError(`--fy 는 2020~2100 정수입니다: ${fyRaw}`)
    fy = Number(fyRaw)
  }

  const monthsRaw = values.get("--months")
  let months: string[] | null = null
  if (monthsRaw != null) {
    const parts = monthsRaw.split(",").map((part) => part.trim()).filter(Boolean)
    if (parts.length === 0) return usageError("--months 가 비었습니다")
    const parsed: string[] = []
    for (const part of parts) {
      const month = parseYmMonth(part)
      if (!month) return usageError(`--months 의 달 형식은 YYYY-MM 입니다: ${part}`)
      if (parsed.includes(month)) return usageError(`--months 에 같은 달이 두 번 있습니다: ${month}`)
      parsed.push(month)
    }
    const refDay = asOf ?? options?.today ?? null
    const checkFy = fy ?? (refDay ? fiscalYearOfYm(refDay) : null)
    if (checkFy != null) {
      const allowed = fiscalYearMonths(checkFy)
      const outside = parsed.filter((month) => !allowed.includes(month))
      if (outside.length > 0) return usageError(`--months 는 FY${checkFy}(${allowed[0]}~${allowed[11]}) 달만 됩니다: ${outside.join(", ")}`)
    }
    months = parsed
  }

  const managerRaw = values.get("--manager")
  if (managerRaw != null && !managerRaw) return usageError("--manager 가 비었습니다")
  const manager = managerRaw ?? null

  const toleranceRaw = values.get("--tolerance")
  let tolerance = 0.5
  if (toleranceRaw != null) {
    const parsedTolerance = Number(toleranceRaw)
    if (!toleranceRaw || !Number.isFinite(parsedTolerance) || parsedTolerance < 0) return usageError(`--tolerance 는 0 이상 숫자입니다: ${toleranceRaw}`)
    tolerance = parsedTolerance
  }

  return { ok: true, args: { sheet, db, dbSource: dbSourceRaw, format: formatRaw, asOf, fy, months, manager, tolerance } }
}
