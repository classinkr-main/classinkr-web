import { describe, expect, it } from "vitest"

import {
  LEGACY_ARCHIVE_TAB,
  QUEUE_STATUS_CHIPS,
  resolveInitialQueueFilter,
  WORKSPACE_TAB_VALUES,
} from "@/components/admin/cs-chat/constants"

// 옛 `아카이브` 탭은 대기열의 `종료 · 보관` 칩으로 흡수됐다.
// 착지 칩을 눈으로 확인하다 두 번 결론이 갈렸던 지점이라 순수 함수로 고정한다.
describe("resolveInitialQueueFilter", () => {
  it("옛 ?tab=archive 북마크는 종료·보관 칩으로 착지한다", () => {
    expect(resolveInitialQueueFilter(LEGACY_ARCHIVE_TAB)).toBe("closed")
  })

  it("현행 탭 값은 전부 전체 칩으로 시작한다", () => {
    for (const tab of WORKSPACE_TAB_VALUES) {
      expect(resolveInitialQueueFilter(tab)).toBe("all")
    }
  })

  it("tab이 없거나 모르는 값이면 전체 칩이다", () => {
    expect(resolveInitialQueueFilter(null)).toBe("all")
    expect(resolveInitialQueueFilter(undefined)).toBe("all")
    expect(resolveInitialQueueFilter("")).toBe("all")
    expect(resolveInitialQueueFilter("archived")).toBe("all")
    expect(resolveInitialQueueFilter("ARCHIVE")).toBe("all")
  })

  it("반환값은 언제나 실재하는 칩이다", () => {
    const values = new Set(QUEUE_STATUS_CHIPS.map((chip) => chip.value))
    for (const input of [LEGACY_ARCHIVE_TAB, null, "chat", "queue", "hq", "tools", "zzz"]) {
      expect(values.has(resolveInitialQueueFilter(input))).toBe(true)
    }
  })

  it("archive는 현행 탭 값이 아니다 — 흡수됐으므로 정규화 대상이다", () => {
    expect(WORKSPACE_TAB_VALUES).not.toContain(LEGACY_ARCHIVE_TAB)
  })
})
