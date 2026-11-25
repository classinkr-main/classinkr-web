// 대조 입력 파일(--format=inputs-json) 읽고 쓰기 — lib/branch/reconcile/rev-ledger-inputs.ts
import { describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))

import { parseReconcileInputs, serializeReconcileInputs, type ReconcileInputsFile } from "@/lib/branch/reconcile/rev-ledger-inputs"
import { BASE_ROWS, SYNC_AT, entry, ledgerInput, mirrorDeals, revGrid, sheetInput } from "./fixtures/rev-reconcile-fixtures"

function sampleFile(): ReconcileInputsFile {
  const grid = revGrid(BASE_ROWS)
  return {
    version: 1,
    capturedAt: "2026-11-30T13:00:00Z",
    sheet: sheetInput(grid),
    ledger: ledgerInput(mirrorDeals(grid, { today: "2026-11-30", syncedAt: SYNC_AT }), {
      entries: [entry({ id: "e1", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 100 })],
    }),
  }
}

describe("parseReconcileInputs", () => {
  it("serialize → parse 왕복이 같다", () => {
    const file = sampleFile()
    const text = serializeReconcileInputs(file)
    expect(text.endsWith("\n")).toBe(true)
    expect(parseReconcileInputs(text, { sheet: true, ledger: true })).toEqual(JSON.parse(JSON.stringify(file)))
  })

  it("필요한 쪽만 요구한다 — 시트만 든 파일을 시트로 읽을 수 있다", () => {
    const { ledger: _ledger, ...sheetOnly } = sampleFile()
    void _ledger
    const text = serializeReconcileInputs(sheetOnly)
    expect(parseReconcileInputs(text, { sheet: true, ledger: false }).sheet?.range).toBe("'2. REV'!A1:CZ1000")
    expect(() => parseReconcileInputs(text, { sheet: false, ledger: true })).toThrow("입력 파일 형식이 아닙니다 — --format=inputs-json 으로 만든 파일만 읽는다 (ledger 가 없음)")
  })

  it("JSON 이 아니거나 version 이 다르거나 모양이 틀리면 한국어로 거절", () => {
    expect(() => parseReconcileInputs("{", { sheet: true, ledger: false })).toThrow(/JSON 이 아님/)
    expect(() => parseReconcileInputs(JSON.stringify({ version: 2, capturedAt: "x" }), { sheet: false, ledger: false })).toThrow(/version 2/)
    const file = sampleFile()
    const badGrid = { ...file, sheet: { ...file.sheet!, grid: [["a"]] } }
    expect(() => parseReconcileInputs(JSON.stringify(badGrid), { sheet: true, ledger: false })).toThrow(/sheet\.grid\[0\] 칸 모양이 아님/)
    const badEntry = { ...file, ledger: { ...file.ledger!, entries: [{ id: "x" }] } }
    expect(() => parseReconcileInputs(JSON.stringify(badEntry), { sheet: false, ledger: true })).toThrow(/ledger\.entries\[0\]\.entryType 없음/)
    const badSource = { ...file, ledger: { ...file.ledger!, source: { kind: "live" } } }
    expect(() => parseReconcileInputs(JSON.stringify(badSource), { sheet: false, ledger: true })).toThrow(/import\|mirror/)
    const badTruncated = { ...file, ledger: { ...file.ledger!, truncated: { entries: "no" } } }
    expect(() => parseReconcileInputs(JSON.stringify(badTruncated), { sheet: false, ledger: true })).toThrow(/truncated\.entries/)
  })
})
