// npm run rev:reconcile 의 흐름(lib/branch/reconcile/run-reconcile.ts) — 파일 모드를 네트워크 없이 끝까지 돌린다.
// 라이브 읽기 함수는 던지게 두고 부르지 않았는지 본다(파일 모드는 .env.local 도 읽지 않는다).
import { describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))

import { parseReconcileInputs, serializeReconcileInputs } from "@/lib/branch/reconcile/rev-ledger-inputs"
import { RECONCILE_PRIVACY_NOTE, runReconcile, type ReconcileRunArgs, type ReconcileRunDeps } from "@/lib/branch/reconcile/run-reconcile"
import { parseReconcileArgs } from "@/scripts/lib/reconcile-rev-ledger-args"
import { BASE_ROWS, SYNC_AT, entry, ledgerInput, mirrorDeals, revGrid, sheetInput } from "./fixtures/rev-reconcile-fixtures"

const NOW = new Date("2026-11-30T13:05:00Z")

function inputsText(options: { sheetChange?: boolean; entries?: boolean } = {}): string {
  const dbGrid = revGrid(BASE_ROWS)
  const liveGrid = options.sheetChange
    ? revGrid([BASE_ROWS[0], BASE_ROWS[1], { ...BASE_ROWS[2], months: { "2026-12": { weeks: [450] } } }])
    : dbGrid
  return serializeReconcileInputs({
    version: 1,
    capturedAt: "2026-11-30T13:00:00Z",
    sheet: sheetInput(liveGrid),
    ledger: ledgerInput(mirrorDeals(dbGrid, { today: "2026-11-30", syncedAt: SYNC_AT }), {
      entries: options.entries ? [entry({ id: "e1", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 100 })] : [],
    }),
  })
}

function harness(files: Record<string, string>) {
  const out: string[] = []
  const err: string[] = []
  const live = { sheet: vi.fn(), ledger: vi.fn(), prepare: vi.fn() }
  const deps: ReconcileRunDeps = {
    now: NOW,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    readTextFile: (path) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`)
      return files[path]
    },
    prepareLive: live.prepare,
    readLiveSheet: async () => {
      live.sheet()
      throw new Error("라이브 시트 읽기를 부르면 안 된다")
    },
    readLiveLedger: async () => {
      live.ledger()
      throw new Error("라이브 DB 읽기를 부르면 안 된다")
    },
  }
  return { deps, out, err, live }
}

function argsOf(argv: string[]): ReconcileRunArgs {
  const parsed = parseReconcileArgs(argv, { today: "2026-11-30" })
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.args
}

describe("runReconcile — 파일 모드", () => {
  it("같으면 Markdown 을 내고 종료 코드 0 · 라이브 읽기·.env 읽기 없음", async () => {
    const { deps, out, err, live } = harness({ "/recon/in.json": inputsText() })
    const code = await runReconcile(argsOf(["--sheet=file:/recon/in.json", "--db=file:/recon/in.json"]), deps)
    expect(code).toBe(0)
    expect(out.join("")).toContain("# REV 시트 ↔ 매출 장부 대조")
    expect(out.join("")).toContain("결과 **같음 — 차이 없음**")
    expect(live.sheet).not.toHaveBeenCalled()
    expect(live.ledger).not.toHaveBeenCalled()
    expect(live.prepare).not.toHaveBeenCalled()
    expect(err.join("")).toContain(RECONCILE_PRIVACY_NOTE)
    expect(err.at(-1)).toBe("[rev:reconcile] 끝 — 쓰기 0 · 시트 읽기 0회(spreadsheets.get) · DB 조회 0회 · 결과 같음(종료 코드 0)\n")
  })

  it("동기화 뒤 시트 변경이 있으면 종료 코드 1 · stderr 에 막는 이유", async () => {
    const { deps, err } = harness({ "/recon/in.json": inputsText({ sheetChange: true }) })
    const code = await runReconcile(argsOf(["--sheet=file:/recon/in.json", "--db=file:/recon/in.json", "--format=csv"]), deps)
    expect(code).toBe(1)
    expect(err.join("")).toContain("[rev:reconcile] 막음 — 동기화 뒤 시트 변경 칸 2개(합계 −¥50)")
    expect(err.at(-1)).toContain("결과 막음(종료 코드 1)")
  })

  it("--format=csv · json 은 그 모양으로 낸다", async () => {
    const csv = harness({ "/a.json": inputsText({ entries: true }) })
    expect(await runReconcile(argsOf(["--sheet=file:/a.json", "--db=file:/a.json", "--format=csv"]), csv.deps)).toBe(0)
    expect(csv.out.join("").startsWith("﻿kind,manager,month")).toBe(true)
    const json = harness({ "/a.json": inputsText({ entries: true }) })
    expect(await runReconcile(argsOf(["--sheet=file:/a.json", "--db=file:/a.json", "--format=json"]), json.deps)).toBe(0)
    expect(JSON.parse(json.out.join(""))).toMatchObject({ status: "explained", exitCode: 0 })
  })

  it("--format=inputs-json 은 입력을 그대로 다시 남긴다(파일 → 파일 왕복)", async () => {
    const { deps, out, err } = harness({ "/a.json": inputsText({ entries: true }) })
    expect(await runReconcile(argsOf(["--sheet=file:/a.json", "--db=file:/a.json", "--format=inputs-json"]), deps)).toBe(0)
    const file = parseReconcileInputs(out.join(""), { sheet: true, ledger: true })
    expect(file.capturedAt).toBe(NOW.toISOString())
    expect(file.ledger?.entries).toHaveLength(1)
    expect(err.join("")).toContain("[rev:reconcile] 이 출력에는 고객 이름 · 금액이 들어 있다 — 저장소 밖에 두고 공유하지 않는다")
  })

  it("시트·DB 를 다른 파일에서 읽을 수 있다", async () => {
    const both = inputsText()
    const { deps } = harness({ "/sheet.json": both, "/db.json": both })
    expect(await runReconcile(argsOf(["--sheet=file:/sheet.json", "--db=file:/db.json"]), deps)).toBe(0)
  })

  it("파일을 못 읽으면 판정하지 않고 종료 코드 3", async () => {
    const { deps, err } = harness({})
    expect(await runReconcile(argsOf(["--sheet=file:/missing.json", "--db=file:/missing.json"]), deps)).toBe(3)
    expect(err.join("")).toContain("읽기 실패 — 판정하지 않았다: ENOENT: /missing.json")
    expect(err.at(-1)).toContain("결과 불완전(종료 코드 3)")
  })

  it("--months 가 그 회계연도 밖이면 종료 코드 2", async () => {
    const { deps } = harness({ "/a.json": inputsText() })
    expect(await runReconcile({ ...argsOf(["--sheet=file:/a.json", "--db=file:/a.json"]), months: ["2027-04"] }, deps)).toBe(2)
  })

  it("라이브를 적었을 때만 .env 를 읽고 라이브 함수를 부른다", async () => {
    const { deps, live } = harness({ "/a.json": inputsText() })
    expect(await runReconcile(argsOf(["--sheet=live", "--db=file:/a.json"]), deps)).toBe(3)
    expect(live.prepare).toHaveBeenCalledTimes(1)
    expect(live.sheet).toHaveBeenCalledTimes(1)
    expect(live.ledger).not.toHaveBeenCalled()
  })
})
