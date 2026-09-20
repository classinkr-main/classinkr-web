/**
 * 리드 드로어 인라인 저장 규칙(순수 함수) — leads-01·leads-03·leads-07·leads-08.
 */
import { describe, expect, it } from "vitest"

import {
  ASSIGNED_TO_COMMIT_DELAY_MS,
  RECENT_ASSIGNEES_MAX_STORED,
  createLatestRequestGuard,
  isRecentAssigneeEntry,
  listUnsavedDrawerFields,
  nextLogIdAfterRemoval,
  pushRecentAssignee,
  resolveStatusButtonAction,
} from "@/components/admin/crm/leads/board/lead-drawer-save"

describe("resolveStatusButtonAction (leads-03)", () => {
  it("'전환'은 어느 상태에서 눌러도 status PATCH 가 아니라 convert-v2 플로우로 간다", () => {
    expect(resolveStatusButtonAction("converted", "new")).toBe("convert")
    expect(resolveStatusButtonAction("converted", "contacted")).toBe("convert")
    expect(resolveStatusButtonAction("converted", "closed")).toBe("convert")
  })

  it("현재 상태를 다시 누르면 아무것도 하지 않는다(중복 PATCH 금지)", () => {
    expect(resolveStatusButtonAction("new", "new")).toBe("noop")
    expect(resolveStatusButtonAction("converted", "converted")).toBe("noop")
  })

  it("신규 → 연락중은 연락 기록 폼으로 유도하고, 그 외 연락중은 PATCH 다", () => {
    expect(resolveStatusButtonAction("contacted", "new")).toBe("contact-log")
    expect(resolveStatusButtonAction("contacted", "closed")).toBe("patch")
  })

  it("'종료'는 단계 이탈 확인을 거친다", () => {
    expect(resolveStatusButtonAction("closed", "new")).toBe("confirm-close")
    expect(resolveStatusButtonAction("closed", "contacted")).toBe("confirm-close")
    expect(resolveStatusButtonAction("new", "closed")).toBe("patch")
  })
})

describe("createLatestRequestGuard (leads-01 담당자 레이스)", () => {
  it("A→B→C 로 연달아 보내면 A 의 늦은 실패는 최신이 아니므로 무시된다", () => {
    const guard = createLatestRequestGuard()
    const a = guard.begin()
    const b = guard.begin()
    const c = guard.begin()
    expect(guard.isLatest(a)).toBe(false)
    expect(guard.isLatest(b)).toBe(false)
    expect(guard.isLatest(c)).toBe(true)
  })

  it("요청이 하나뿐이면 그 결과는 반영된다", () => {
    const guard = createLatestRequestGuard()
    expect(guard.isLatest(guard.begin())).toBe(true)
  })
})

describe("담당자 커밋 지연 (leads-08)", () => {
  it("화살표 탐색이 서버 배정으로 새지 않도록 400ms 뒤에 커밋한다", () => {
    expect(ASSIGNED_TO_COMMIT_DELAY_MS).toBe(400)
  })
})

describe("listUnsavedDrawerFields", () => {
  it("메모·담당자·팔로업 순서로 미저장 항목을 나열한다", () => {
    expect(listUnsavedDrawerFields({ notesDirty: true, ownerUnsaved: true, followUpUnsaved: true })).toEqual([
      "메모·행사 연결",
      "담당자",
      "팔로업 날짜",
    ])
    expect(listUnsavedDrawerFields({ notesDirty: false, ownerUnsaved: true, followUpUnsaved: false })).toEqual(["담당자"])
    expect(listUnsavedDrawerFields({ notesDirty: false, ownerUnsaved: false, followUpUnsaved: false })).toEqual([])
  })
})

describe("nextLogIdAfterRemoval (leads-07 포커스 이동)", () => {
  it("다음 기록 → 없으면 이전 기록 → 없으면 null(heading)", () => {
    expect(nextLogIdAfterRemoval(["a", "b", "c"], "a")).toBe("b")
    expect(nextLogIdAfterRemoval(["a", "b", "c"], "c")).toBe("b")
    expect(nextLogIdAfterRemoval(["a"], "a")).toBeNull()
    expect(nextLogIdAfterRemoval(["a", "b"], "zzz")).toBeNull()
  })
})

describe("pushRecentAssignee (Q4 빠른 배정 최근 목록)", () => {
  it("새 항목을 맨 앞에 추가한다", () => {
    const result = pushRecentAssignee([{ ownerKey: "owner-a", displayName: "김담당" }], {
      ownerKey: "owner-b",
      displayName: "이담당",
    })
    expect(result).toEqual([
      { ownerKey: "owner-b", displayName: "이담당" },
      { ownerKey: "owner-a", displayName: "김담당" },
    ])
  })

  it("같은 담당(ownerKey)이 이미 있으면 중복 제거하고 맨 앞으로 옮긴다", () => {
    const result = pushRecentAssignee(
      [
        { ownerKey: "owner-a", displayName: "김담당" },
        { ownerKey: "owner-b", displayName: "이담당" },
      ],
      { ownerKey: "owner-b", displayName: "이담당(개명)" }
    )
    expect(result).toEqual([
      { ownerKey: "owner-b", displayName: "이담당(개명)" },
      { ownerKey: "owner-a", displayName: "김담당" },
    ])
  })

  it(`최대 ${RECENT_ASSIGNEES_MAX_STORED}명까지만 저장한다`, () => {
    const existing = Array.from({ length: RECENT_ASSIGNEES_MAX_STORED }, (_, i) => ({
      ownerKey: `owner-${i}`,
      displayName: `담당${i}`,
    }))
    const result = pushRecentAssignee(existing, { ownerKey: "owner-new", displayName: "새 담당" })
    expect(result).toHaveLength(RECENT_ASSIGNEES_MAX_STORED)
    expect(result[0]).toEqual({ ownerKey: "owner-new", displayName: "새 담당" })
    expect(result.at(-1)).toEqual(existing.at(-2)) // 가장 오래된(마지막) 항목이 밀려 빠진다
  })

  it("ownerKey가 빈 문자열이면 추가하지 않는다(미배정을 최근 목록에 남기지 않는다)", () => {
    const existing = [{ ownerKey: "owner-a", displayName: "김담당" }]
    expect(pushRecentAssignee(existing, { ownerKey: "", displayName: "" })).toEqual(existing)
  })
})

describe("isRecentAssigneeEntry (localStorage 역직렬화 가드)", () => {
  it("ownerKey·displayName이 모두 있는 비어있지 않은 문자열일 때만 참", () => {
    expect(isRecentAssigneeEntry({ ownerKey: "owner-a", displayName: "김담당" })).toBe(true)
    expect(isRecentAssigneeEntry({ ownerKey: "", displayName: "김담당" })).toBe(false)
    expect(isRecentAssigneeEntry({ ownerKey: "owner-a" })).toBe(false)
    expect(isRecentAssigneeEntry(null)).toBe(false)
    expect(isRecentAssigneeEntry("owner-a")).toBe(false)
    expect(isRecentAssigneeEntry(42)).toBe(false)
  })
})
