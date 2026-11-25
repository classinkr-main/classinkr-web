/**
 * REV 시트 '2. REV' ↔ 매출 장부 대조(U-2 ①, E-7) — 12/1 시트 잠금 전에 담당자 × 월 × 확도로 숫자를 맞춘다. 읽기 전용.
 *
 * 실행:
 *   npm run rev:reconcile -- --sheet=live --db=live                          # Markdown 보고서(기본)
 *   npm run rev:reconcile -- --sheet=live --db=live --months=2026-11,2026-12 --manager=<이름>   # 담당자 한 명 공유용
 *   npm run rev:reconcile -- --sheet=live --db=live --format=csv > ~/recon/2026-11-30.csv
 *   npm run rev:reconcile -- --sheet=live --db=live --format=inputs-json > ~/recon/2026-11-30-inputs.json
 *   npm run rev:reconcile -- --sheet=file:~/recon/2026-11-30-inputs.json --db=file:~/recon/2026-11-30-inputs.json   # 다시 돌리기(네트워크 없음)
 *   npm run rev:reconcile -- --help
 *
 * 읽기만 한다:
 *   - 시트는 spreadsheets.get 한 번(동기화와 같은 범위), DB 는 select 만(lib/branch/reconcile/read-sources.ts).
 *   - 시트·Supabase 에 쓰지 않고, 동기화를 부르지 않고, 캐시를 만료하지 않고, 파일을 쓰지 않는다(결과는 stdout).
 *   - 라이브 읽기는 --sheet=live·--db=live 를 적었을 때만. 파일 모드는 .env.local 도 읽지 않는다.
 *   tests/branch/reconcile/reconcile-readonly.test.ts 가 이 파일과 lib/branch/reconcile/*.ts 의 쓰기 호출을 글자로 막는다.
 *
 * 종료 코드: 0 = 같음·설명된 차이만 · 1 = 잠금을 막는 차이(동기화 뒤 시트 변경, 시트 자체 점검의 설명 안 된 차이)
 *           · 2 = 인자 오류 · 3 = 불완전(목록 상한·읽기 실패·시트 머리 이상)
 * 계산은 lib/branch/reconcile/rev-ledger-reconcile.ts(순수, 테스트 있음). 절차는 docs/active/rev-sheet-writeback-runbook.md.
 * 출력에는 고객 이름·금액이 들어 있다 — 저장소 밖에 두고, 담당자에게는 --manager 로 자기 몫만 준다.
 */

import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { getBusinessDateParts } from "../lib/business-time"
import { runReconcile } from "../lib/branch/reconcile/run-reconcile"
import { parseReconcileArgs } from "./lib/reconcile-rev-ledger-args"

const LABEL = "[rev:reconcile]"

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

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path
}

async function main(): Promise<number> {
  const now = new Date()
  const parsed = parseReconcileArgs(process.argv.slice(2), { today: getBusinessDateParts(now).date })
  if (!parsed.ok) {
    if (parsed.exitCode === 0) process.stdout.write(`${parsed.message}\n`)
    else process.stderr.write(`${parsed.message}\n`)
    return parsed.exitCode
  }
  return runReconcile(parsed.args, {
    now,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    readTextFile: (path) => readFileSync(expandHome(path), "utf8"),
    prepareLive: loadEnvLocal,
    readLiveSheet: async () => {
      const { readLiveReconcileSheet } = await import("../lib/branch/reconcile/read-sources")
      return readLiveReconcileSheet()
    },
    readLiveLedger: async (fiscalYear, dbSource) => {
      const { readLiveReconcileLedger } = await import("../lib/branch/reconcile/read-sources")
      return readLiveReconcileLedger(fiscalYear, dbSource)
    },
  })
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    process.stderr.write(`${LABEL} 실패: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 3
  })
