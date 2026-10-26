import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import * as sheetWriteView from "@/components/admin/branch/ledger/sheet-write-view"
import { isSheetWriteAbsorbedByMirror } from "@/lib/admin-crm-revenue-sheet"
import {
  absorptionCutoff,
  isSheetWriteAbsorbed,
  oldestSyncedAt,
  SHEET_WRITE_ATTEMPT_STATUSES,
  sheetWriteBlocksReverse,
} from "@/lib/branch/sheet-writeback/ledger-rules"
import { SHEET_WRITTEN_REVERSE_MESSAGE } from "@/lib/branch/sheet-writeback/messages"
import { SHEET_WRITE_STATUSES } from "@/lib/repositories/branch-sales-ledger-sheet-writes"

// 장부 화면 오버레이·매출시트 미반영 배너·되돌리기 가드가 같이 쓰는 판정의 정본(ledger-rules.ts).
// 서버와 화면이 같은 함수 객체를 쓰는지까지 본다 — 사본이 되살아나면 규칙이 갈라진다.

const SYNC = "2026-10-23T08:00:00.000Z"

describe("isSheetWriteAbsorbed — 시트에 쓴 정정을 미러가 이미 읽었는가", () => {
  it("written 이고 쓴 시각이 마지막 성공 REV 동기화 시작보다 이르면 true", () => {
    expect(isSheetWriteAbsorbed({ status: "written", writtenAt: "2026-10-23T07:59:59.999Z" }, SYNC)).toBe(true)
  })

  it("경계는 엄격한 < — 같은 시각·늦은 쓰기는 아직 미러에 없다", () => {
    expect(isSheetWriteAbsorbed({ status: "written", writtenAt: SYNC }, SYNC)).toBe(false)
    expect(isSheetWriteAbsorbed({ status: "written", writtenAt: "2026-10-23T08:00:00.001Z" }, SYNC)).toBe(false)
  })

  it.each(["sending", "refused", "failed", "unknown"])("status %s 는 흡수로 보지 않는다", (status) => {
    expect(isSheetWriteAbsorbed({ status, writtenAt: "2026-10-01T00:00:00.000Z" }, SYNC)).toBe(false)
  })

  it("시각이 없거나 해석되지 않으면 false(기존 동작 쪽)", () => {
    expect(isSheetWriteAbsorbed({ status: "written", writtenAt: null }, SYNC)).toBe(false)
    expect(isSheetWriteAbsorbed({ status: "written", writtenAt: "2026-10-01T00:00:00.000Z" }, null)).toBe(false)
    expect(isSheetWriteAbsorbed({ status: "written", writtenAt: "어제" }, SYNC)).toBe(false)
    expect(isSheetWriteAbsorbed({ status: "written", writtenAt: "2026-10-01T00:00:00.000Z" }, "garbage")).toBe(false)
    expect(isSheetWriteAbsorbed(null, SYNC)).toBe(false)
  })

  it("매출시트 배너(isSheetWriteAbsorbedByMirror)와 장부 화면(sheet-write-view)은 같은 함수 객체", () => {
    expect(isSheetWriteAbsorbedByMirror).toBe(isSheetWriteAbsorbed)
    expect(sheetWriteView.isSheetWriteAbsorbed).toBe(isSheetWriteAbsorbed)
  })
})

describe("absorptionCutoff — 이중 집계 제외 기준은 화면이 가진 행의 시각까지 본다", () => {
  const OLD_DATA = "2026-10-23T07:00:00.000Z"
  const FRESH_DATA = "2026-10-23T08:00:30.000Z"

  it("행이 마지막 동기화 뒤의 것이면 동기화 시작 시각", () => {
    expect(absorptionCutoff(SYNC, FRESH_DATA)).toBe(SYNC)
  })

  it("행이 마지막 동기화보다 오래됐으면(다른 화면이 동기화·SWR·재캡처 실패) 행 시각", () => {
    expect(absorptionCutoff(SYNC, OLD_DATA)).toBe(OLD_DATA)
    // 07:30 에 쓴 정정은 08:00 동기화가 읽었지만, 07:00 행을 든 화면에는 아직 없다 — 빼지 않는다.
    const sw = { status: "written", writtenAt: "2026-10-23T07:30:00.000Z" }
    expect(isSheetWriteAbsorbed(sw, SYNC)).toBe(true)
    expect(isSheetWriteAbsorbed(sw, absorptionCutoff(SYNC, OLD_DATA))).toBe(false)
    expect(isSheetWriteAbsorbed(sw, absorptionCutoff(SYNC, FRESH_DATA))).toBe(true)
  })

  it("둘 중 하나라도 모르면 null(빼지 않음)", () => {
    expect(absorptionCutoff(null, FRESH_DATA)).toBeNull()
    expect(absorptionCutoff(SYNC, null)).toBeNull()
    expect(absorptionCutoff("garbage", FRESH_DATA)).toBeNull()
    expect(absorptionCutoff(SYNC, "garbage")).toBeNull()
  })

  it("oldestSyncedAt — 가장 오래된 행 시각, 시각 없는 행이 있거나 행이 없으면 null", () => {
    expect(oldestSyncedAt([{ syncedAt: FRESH_DATA }, { syncedAt: OLD_DATA }, { syncedAt: FRESH_DATA }])).toBe(OLD_DATA)
    expect(oldestSyncedAt([{ syncedAt: FRESH_DATA }, {}])).toBeNull()
    expect(oldestSyncedAt([{ syncedAt: "어제" }])).toBeNull()
    expect(oldestSyncedAt([])).toBeNull()
  })

  it("화면과 매출시트 배너가 같은 함수 객체를 쓴다", () => {
    expect(sheetWriteView.absorptionCutoff).toBe(absorptionCutoff)
    expect(sheetWriteView.oldestSyncedAt).toBe(oldestSyncedAt)
    const workbench = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8")
    expect(workbench).toMatch(/sheetAbsorbedDraftIds\(sheetWrites, absorptionCutoff\(sheetWrite\.lastRevSyncStartedAt, sheetRowsSyncedAt\)\)/)
    expect(workbench).toMatch(/const sheetRowsSyncedAt = useMemo\(\(\) => oldestSyncedAt\(sheetRows\), \[sheetRows\]\)/)
    const banner = readFileSync(join(process.cwd(), "lib/admin-crm-revenue-sheet.ts"), "utf8")
    expect(banner).toMatch(/const cutoff = absorptionCutoff\(lastRevSyncStartedAt, mirrorSyncedAt\)/)
    expect(banner).toMatch(/isSheetWriteAbsorbedByMirror\(record, cutoff\)/)
  })
})

describe("sheetWriteBlocksReverse — 시트에 쓴 정정은 장부에서만 상쇄하지 않는다", () => {
  it("written·sending 만 막는다", () => {
    expect(sheetWriteBlocksReverse("written")).toBe(true)
    expect(sheetWriteBlocksReverse("sending")).toBe(true)
    for (const status of ["refused", "failed", "unknown", "", null, undefined]) {
      expect(sheetWriteBlocksReverse(status)).toBe(false)
    }
  })

  it("시트에서 바뀌는 칸이 없던 반영(no_change)은 막지 않는다 — 시트에 쓴 것이 없다", () => {
    expect(sheetWriteBlocksReverse("written", "no_change")).toBe(false)
    expect(sheetWriteBlocksReverse("sending", "no_change")).toBe(false)
    expect(sheetWriteBlocksReverse("written", "written")).toBe(true)
    expect(sheetWriteBlocksReverse("written", "already_written")).toBe(true)
    expect(sheetWriteBlocksReverse("sending", "written")).toBe(true)
  })

  it("라우트와 화면이 같은 판정·같은 문구 상수를 쓴다(사본 없음)", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/branch/ledger-drafts/[id]/route.ts"), "utf8")
    expect(route).toMatch(/\bif \(sheetWriteBlocksReverse\(sheetWrite\?\.status, sheetWrite\?\.code\)\)/)
    expect(route).toMatch(/import \{ SHEET_WRITTEN_REVERSE_MESSAGE \} from "@\/lib\/branch\/sheet-writeback\/messages"/)
    expect(route).not.toContain(`"${SHEET_WRITTEN_REVERSE_MESSAGE}"`)
    const view = readFileSync(join(process.cwd(), "components/admin/branch/ledger/sheet-write-view.ts"), "utf8")
    expect(view).not.toContain(`"${SHEET_WRITTEN_REVERSE_MESSAGE}"`)
    expect(sheetWriteView.SHEET_WRITTEN_REVERSE_MESSAGE).toBe(SHEET_WRITTEN_REVERSE_MESSAGE)
    for (const status of SHEET_WRITE_ATTEMPT_STATUSES) {
      for (const code of ["written", "already_written", "no_change", "db_apply_failed"]) {
        expect(sheetWriteView.blocksLedgerReverse({ status, code })).toBe(sheetWriteBlocksReverse(status, code))
      }
    }
  })
})

describe("감사 status 닫힌 목록", () => {
  it("저장소 목록은 정본 배열이고, 마이그레이션 CHECK 제약과 순서까지 같다", () => {
    expect(SHEET_WRITE_STATUSES).toBe(SHEET_WRITE_ATTEMPT_STATUSES)
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261023_branch_rev_sheet_writes.sql"), "utf8")
    const match = /CHECK \(status IN \(([^)]*)\)\)/.exec(sql)
    expect(match).not.toBeNull()
    const listed = (match?.[1] ?? "").split(",").map((part) => part.trim().replace(/^'|'$/g, ""))
    expect(listed).toEqual([...SHEET_WRITE_ATTEMPT_STATUSES])
  })
})
