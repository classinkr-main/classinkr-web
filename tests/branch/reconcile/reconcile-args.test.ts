// npm run rev:reconcile 인자 — scripts/lib/reconcile-rev-ledger-args.ts
import { describe, expect, it } from "vitest"

import { RECONCILE_REFUSAL, RECONCILE_USAGE, parseReconcileArgs } from "@/scripts/lib/reconcile-rev-ledger-args"

const SOURCES = ["--sheet=live", "--db=live"]

function fail(argv: string[], today = "2026-11-30") {
  const result = parseReconcileArgs(argv, { today })
  if (result.ok) throw new Error(`expected failure: ${argv.join(" ")}`)
  return result
}

describe("parseReconcileArgs", () => {
  it("어디서 읽을지 없으면 거절(종료 코드 2, 정해진 문구)", () => {
    expect(fail([])).toEqual({ ok: false, exitCode: 2, message: RECONCILE_REFUSAL })
    expect(fail(["--sheet=live"]).message).toBe(RECONCILE_REFUSAL)
    expect(fail(["--db=file:/tmp/x.json"]).message).toBe(RECONCILE_REFUSAL)
    expect(RECONCILE_REFUSAL).toBe("[rev:reconcile] 읽기 전용 대조 — 어디서 읽을지 꼭 적어 주세요: --sheet=live|file:<경로> --db=live|file:<경로>")
  })

  it("--help 는 종료 코드 0 으로 사용법", () => {
    expect(parseReconcileArgs(["--help"])).toEqual({ ok: false, exitCode: 0, message: RECONCILE_USAGE })
    expect(parseReconcileArgs([...SOURCES, "-h"])).toEqual({ ok: false, exitCode: 0, message: RECONCILE_USAGE })
  })

  it("기본값", () => {
    expect(parseReconcileArgs(SOURCES)).toEqual({
      ok: true,
      args: {
        sheet: { kind: "live" },
        db: { kind: "live" },
        dbSource: "screen",
        format: "md",
        asOf: null,
        fy: null,
        months: null,
        manager: null,
        tolerance: 0.5,
      },
    })
  })

  it("모든 인자 — '--flag=값' 과 '--flag 값' 둘 다", () => {
    const result = parseReconcileArgs([
      "--sheet=file:~/recon/in.json",
      "--db",
      "file:~/recon/in.json",
      "--format=csv",
      "--as-of=2026-12-01",
      "--fy",
      "2026",
      "--months=2026-11,2026-12",
      "--manager=예시A",
      "--tolerance=0",
    ])
    expect(result).toEqual({
      ok: true,
      args: {
        sheet: { kind: "file", path: "~/recon/in.json" },
        db: { kind: "file", path: "~/recon/in.json" },
        dbSource: "screen",
        format: "csv",
        asOf: "2026-12-01",
        fy: 2026,
        months: ["2026-11", "2026-12"],
        manager: "예시A",
        tolerance: 0,
      },
    })
  })

  it.each([
    [["--bogus=1"], "모르는 인자: --bogus"],
    [["extra"], "모르는 인자: extra"],
    [["--format=md", "--format=csv"], "같은 인자를 두 번"],
    [["--format=xlsx"], "--format 은 md|csv|json|inputs-json"],
    [["--db-source=api"], "--db-source 는 screen|mirror|import"],
    [["--as-of=2026-13-01"], "--as-of 는 YYYY-MM-DD"],
    [["--as-of=2026-02-30"], "--as-of 는 YYYY-MM-DD"],
    [["--as-of=12/1"], "--as-of 는 YYYY-MM-DD"],
    [["--fy=26"], "--fy 는 2020~2100"],
    [["--months=2026-1"], "달 형식은 YYYY-MM"],
    [["--months=2027-04"], "--months 는 FY2026(2026-04~2027-03) 달만"],
    [["--months=2026-11,2026-11"], "같은 달이 두 번"],
    [["--manager="], "--manager 가 비었습니다"],
    [["--tolerance=-1"], "--tolerance 는 0 이상 숫자"],
    [["--tolerance=abc"], "--tolerance 는 0 이상 숫자"],
    [["--format"], "--format 에 값이 없습니다"],
  ])("%j → 종료 코드 2", (extra, message) => {
    const result = fail([...SOURCES, ...extra])
    expect(result.exitCode).toBe(2)
    expect(result.message).toContain(message)
    expect(result.message).toContain(RECONCILE_USAGE)
  })

  it("--sheet·--db 값 형식", () => {
    expect(fail(["--sheet=sheets", "--db=live"]).message).toContain("--sheet 는 live 또는 file:<경로>")
    expect(fail(["--sheet=live", "--db=file:"]).message).toContain("--db=file: 뒤에 경로가 없습니다")
  })

  it("--db-source 는 라이브 DB 에서만", () => {
    expect(fail(["--sheet=live", "--db=file:/x.json", "--db-source=mirror"]).message).toContain("--db=live 일 때만")
    expect(parseReconcileArgs([...SOURCES, "--db-source=import"]).ok).toBe(true)
  })

  it("--months 는 --as-of(또는 오늘)의 회계연도로 검사한다", () => {
    expect(parseReconcileArgs([...SOURCES, "--as-of=2027-05-01", "--months=2027-04"]).ok).toBe(true)
    expect(fail([...SOURCES, "--months=2027-04"], "2026-11-30").message).toContain("FY2026")
    // 오늘을 모르면(today 없음) 회계연도 검사는 실행 때로 미룬다
    expect(parseReconcileArgs([...SOURCES, "--months=2027-04"]).ok).toBe(true)
  })
})
