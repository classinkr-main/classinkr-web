import { describe, expect, it } from "vitest"

import {
  buildStatusUndoPlan,
  describeStatusUndo,
  type LeadStatusChange,
} from "@/lib/crm/lead-status-undo"
import { STATUS_LABEL } from "@/components/admin/crm/leads/shared"

describe("buildStatusUndoPlan", () => {
  it("restores each id to its previous status", () => {
    const changes: LeadStatusChange[] = [
      { id: "a", previous: "new", next: "contacted" },
      { id: "b", previous: "contacted", next: "converted" },
    ]

    expect(buildStatusUndoPlan(changes)).toEqual([
      { id: "a", status: "new" },
      { id: "b", status: "contacted" },
    ])
  })

  it("excludes changes where previous and next are the same (no real change)", () => {
    const changes: LeadStatusChange[] = [
      { id: "a", previous: "new", next: "new" },
      { id: "b", previous: "new", next: "contacted" },
    ]

    expect(buildStatusUndoPlan(changes)).toEqual([{ id: "b", status: "new" }])
  })

  it("keeps only the last change when the same id appears more than once", () => {
    const changes: LeadStatusChange[] = [
      { id: "a", previous: "new", next: "contacted" },
      { id: "a", previous: "contacted", next: "converted" },
    ]

    // 마지막 변경(연락중 → 전환) 기준으로만 되돌린다 — 첫 변경(신규 → 연락중)은 무시.
    expect(buildStatusUndoPlan(changes)).toEqual([{ id: "a", status: "contacted" }])
  })

  it("drops a duplicate id entirely when its last change is a no-op", () => {
    const changes: LeadStatusChange[] = [
      { id: "a", previous: "new", next: "contacted" },
      { id: "a", previous: "contacted", next: "contacted" },
    ]

    expect(buildStatusUndoPlan(changes)).toEqual([])
  })

  it("returns an empty plan for empty input", () => {
    expect(buildStatusUndoPlan([])).toEqual([])
  })
})

describe("describeStatusUndo", () => {
  it("returns an empty string for an empty plan", () => {
    expect(describeStatusUndo([], STATUS_LABEL)).toBe("")
  })

  it("names the target status for a single-item plan", () => {
    expect(describeStatusUndo([{ id: "a", status: "new" }], STATUS_LABEL)).toBe(`"신규"로 되돌리기`)
  })

  it("counts items and names the target status when every item restores to the same status", () => {
    const plan = [
      { id: "a", status: "new" as const },
      { id: "b", status: "new" as const },
      { id: "c", status: "new" as const },
    ]

    expect(describeStatusUndo(plan, STATUS_LABEL)).toBe(`3건을 "신규"로 되돌립니다`)
  })

  it("falls back to a generic phrase when restore targets are mixed", () => {
    const plan = [
      { id: "a", status: "new" as const },
      { id: "b", status: "contacted" as const },
    ]

    expect(describeStatusUndo(plan, STATUS_LABEL)).toBe("2건을 이전 상태로 되돌립니다")
  })
})
