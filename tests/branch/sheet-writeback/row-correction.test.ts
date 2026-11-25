// 시트 행(Row ID)·월당 활성 정정 1건(F-04) — 동기화마다 바뀌는 딜 id 대신 Row ID 로 겹침을 본다. 순수 함수.
import { describe, expect, it } from "vitest"

import {
  clashingEntryDraftIds,
  draftsBlockedByRowCorrection,
  snapshotRowId,
  type RowCorrectionEntry,
} from "@/lib/branch/sheet-writeback/row-correction"

const ROW = "r_0123456789ab"
const OTHER_ROW = "r_abcdefghjkmn"

function snapshot(rowId: string | null) {
  return { sheetBaseline: { v: 1, rowId, sheetRow: 3, customer: "가나학원", month: "2026-10", weeks: [], capturedAt: "2026-10-23T00:00:00Z" } }
}

function entry(partial: Partial<RowCorrectionEntry> & { draftId: string | null }): RowCorrectionEntry {
  return { entryType: "manual-edit", entryStatus: "active", month: "2026-10", sourceSnapshot: snapshot(ROW), ...partial }
}

describe("snapshotRowId", () => {
  it("형식이 맞는 sheetBaseline.rowId 만", () => {
    expect(snapshotRowId(snapshot(ROW))).toBe(ROW)
    expect(snapshotRowId(snapshot(null))).toBeNull()
    expect(snapshotRowId({ sheetBaseline: { rowId: "row-1" } })).toBeNull()
    expect(snapshotRowId({})).toBeNull()
    expect(snapshotRowId(null)).toBeNull()
  })
})

describe("draftsBlockedByRowCorrection", () => {
  const draft = { id: "new", month: "2026-10", sourceSnapshot: snapshot(ROW) }

  it("같은 Row ID·월의 활성 정정이 있으면 막는다(딜 id 가 달라도)", () => {
    expect([...draftsBlockedByRowCorrection([draft], [entry({ draftId: "old" })])]).toEqual(["new"])
  })

  it("다른 달·다른 행·되돌린 항목·새 행 항목·자기 자신은 막지 않는다", () => {
    const entries = [
      entry({ draftId: "nov", month: "2026-11" }),
      entry({ draftId: "other", sourceSnapshot: snapshot(OTHER_ROW) }),
      entry({ draftId: "reversed", entryStatus: "reversed" }),
      entry({ draftId: "manual-new", entryType: "manual-new" }),
      entry({ draftId: "new" }),
    ]
    expect(draftsBlockedByRowCorrection([draft], entries).size).toBe(0)
  })

  it("시트에 쓴 정정(다음 동기화가 흡수 — F-22 '원래 값으로 다시 입력' 길)은 세지 않는다", () => {
    expect(draftsBlockedByRowCorrection([draft], [entry({ draftId: "old" })], new Set(["old"])).size).toBe(0)
  })

  it("초안 id 가 없는 항목도 겹침으로 센다", () => {
    expect([...draftsBlockedByRowCorrection([draft], [entry({ draftId: null })])]).toEqual(["new"])
  })

  it("Row ID 가 없는 초안은 보지 않는다(기존 딜 id 검사만)", () => {
    expect(draftsBlockedByRowCorrection([{ ...draft, sourceSnapshot: snapshot(null) }], [entry({ draftId: "old" })]).size).toBe(0)
  })

  it("같은 요청 안에서 같은 Row ID·월을 노리는 두 초안은 앞의 것만 통과", () => {
    const second = { ...draft, id: "second" }
    expect([...draftsBlockedByRowCorrection([draft, second], [])]).toEqual(["second"])
  })
})

describe("clashingEntryDraftIds", () => {
  it("겹치는 항목의 초안 id(자기 자신·초안 id 없는 항목 제외) — 감사 표에서 시트에 쓴 것인지 볼 대상", () => {
    const draft = { id: "new", month: "2026-10", sourceSnapshot: snapshot(ROW) }
    expect(clashingEntryDraftIds([draft], [entry({ draftId: "old" }), entry({ draftId: "new" }), entry({ draftId: null })])).toEqual(["old"])
  })
})
