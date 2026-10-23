import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import * as sheetWriteView from "@/components/admin/branch/ledger/sheet-write-view"
import { isSheetWriteAbsorbedByMirror } from "@/lib/admin-crm-revenue-sheet"
import {
  isSheetWriteAbsorbed,
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

describe("sheetWriteBlocksReverse — 시트에 쓴 정정은 장부에서만 상쇄하지 않는다", () => {
  it("written·sending 만 막는다", () => {
    expect(sheetWriteBlocksReverse("written")).toBe(true)
    expect(sheetWriteBlocksReverse("sending")).toBe(true)
    for (const status of ["refused", "failed", "unknown", "", null, undefined]) {
      expect(sheetWriteBlocksReverse(status)).toBe(false)
    }
  })

  it("라우트와 화면이 같은 판정·같은 문구 상수를 쓴다(사본 없음)", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/branch/ledger-drafts/[id]/route.ts"), "utf8")
    expect(route).toMatch(/\bif \(sheetWriteBlocksReverse\(sheetWrite\?\.status\)\)/)
    expect(route).toMatch(/import \{ SHEET_WRITTEN_REVERSE_MESSAGE \} from "@\/lib\/branch\/sheet-writeback\/messages"/)
    expect(route).not.toContain(`"${SHEET_WRITTEN_REVERSE_MESSAGE}"`)
    const view = readFileSync(join(process.cwd(), "components/admin/branch/ledger/sheet-write-view.ts"), "utf8")
    expect(view).not.toContain(`"${SHEET_WRITTEN_REVERSE_MESSAGE}"`)
    expect(sheetWriteView.SHEET_WRITTEN_REVERSE_MESSAGE).toBe(SHEET_WRITTEN_REVERSE_MESSAGE)
    for (const status of SHEET_WRITE_ATTEMPT_STATUSES) {
      expect(sheetWriteView.blocksLedgerReverse({ status })).toBe(sheetWriteBlocksReverse(status))
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
