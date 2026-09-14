import { describe, expect, it } from "vitest"

import {
  COMPASS_AUTOMATED_ACTORS,
  COMPASS_HUMAN_ACTIVITY_KINDS,
  compassLeadIdsNeedingActivityCheck,
  decideLeadStatusFromCompass,
  humanTouchedCompassLeadIds,
  planCompassLeadStatusSync,
} from "@/lib/compass/lead-contact-sync"
import type { CompassOverlaySource } from "@/lib/compass/overlay"

const KEY = "01012345678"

function row(partial: Partial<CompassOverlaySource> & { id: number }): CompassOverlaySource {
  return { phone_key: KEY, stage: "new", created_at: "2026-09-01T00:00:00Z", ...partial }
}

const NONE = new Set<number>()

describe("decideLeadStatusFromCompass", () => {
  it("매칭되는 Compass 행이 없으면 바꾸지 않는다", () => {
    expect(decideLeadStatusFromCompass({ status: "new" }, [], NONE)).toBeNull()
  })

  it("신규 리드의 대표 행이 이탈이면 종료로 보낸다", () => {
    expect(decideLeadStatusFromCompass({ status: "new" }, [row({ id: 1, stage: "lost" })], NONE)).toBe("closed")
  })

  it("신규 리드의 매칭 행이 신규유입 단계를 벗어났으면 연락함이다", () => {
    for (const stage of ["contact", "consult", "demo", "quote", "bd", "won"]) {
      expect(decideLeadStatusFromCompass({ status: "new" }, [row({ id: 1, stage })], NONE)).toBe("contacted")
    }
  })

  it("단계가 전부 신규유입이어도 사람 손 활동이 있는 행이 있으면 연락함이다", () => {
    const rows = [row({ id: 1 }), row({ id: 2 })]
    expect(decideLeadStatusFromCompass({ status: "new" }, rows, new Set([2]))).toBe("contacted")
  })

  it("단계가 신규유입이고 사람 손 활동도 없으면 그대로 둔다", () => {
    expect(decideLeadStatusFromCompass({ status: "new" }, [row({ id: 1 })], new Set([99]))).toBeNull()
  })

  it("이미 연락함인 리드는 대표 행이 이탈일 때만 종료로 보낸다", () => {
    expect(decideLeadStatusFromCompass({ status: "contacted" }, [row({ id: 1, stage: "lost" })], NONE)).toBe("closed")
    expect(decideLeadStatusFromCompass({ status: "contacted" }, [row({ id: 1, stage: "demo" })], new Set([1]))).toBeNull()
  })

  it("전환·종료 리드는 어떤 경우에도 건드리지 않는다 — 전환은 딜 생성이 걸린 비가역 동작이다", () => {
    for (const status of ["converted", "closed"] as const) {
      expect(decideLeadStatusFromCompass({ status }, [row({ id: 1, stage: "lost" })], NONE)).toBeNull()
      expect(decideLeadStatusFromCompass({ status }, [row({ id: 1, stage: "demo" })], new Set([1]))).toBeNull()
    }
  })

  it("이탈 판정은 칩과 같은 대표 행 기준이다 — 옛 행이 이탈이어도 최신 행이 데모면 연락함", () => {
    const rows = [
      row({ id: 1, stage: "lost", last_inflow_at: "2026-07-01T00:00:00Z" }),
      row({ id: 2, stage: "demo", last_inflow_at: "2026-09-10T00:00:00Z" }),
    ]
    expect(decideLeadStatusFromCompass({ status: "new" }, rows, NONE)).toBe("contacted")
  })

  it("최근성이 동률이면 id가 큰 행이 대표다", () => {
    const rows = [
      row({ id: 7, stage: "contact", updated_at: "2026-09-10T00:00:00Z" }),
      row({ id: 9, stage: "lost", updated_at: "2026-09-10T00:00:00Z" }),
    ]
    expect(decideLeadStatusFromCompass({ status: "new" }, rows, NONE)).toBe("closed")
  })

  it("단계 값의 앞뒤 공백은 무시한다", () => {
    expect(decideLeadStatusFromCompass({ status: "new" }, [row({ id: 1, stage: " lost " })], NONE)).toBe("closed")
    expect(decideLeadStatusFromCompass({ status: "new" }, [row({ id: 1, stage: " new " })], NONE)).toBeNull()
  })
})

describe("COMPASS_HUMAN_ACTIVITY_KINDS", () => {
  it("사람이 남긴 기록만 연락으로 친다 — 알림톡·시스템·유입·임포트는 제외", () => {
    expect([...COMPASS_HUMAN_ACTIVITY_KINDS].sort()).toEqual(
      ["call", "meeting", "memo", "note", "sms", "stage_change"].sort()
    )
    for (const kind of ["alimtalk", "system", "inflow", "import"]) {
      expect(COMPASS_HUMAN_ACTIVITY_KINDS).not.toContain(kind)
    }
  })
})

describe("humanTouchedCompassLeadIds", () => {
  it("사람 손 kind 의 활동이 있는 Compass 리드 id 를 모은다", () => {
    const touched = humanTouchedCompassLeadIds([
      { lead_id: 1, kind: "call", actor: "황찬우" },
      { lead_id: 2, kind: "alimtalk", actor: null },
      { lead_id: 3, kind: "system", actor: null },
    ])
    expect([...touched]).toEqual([1])
  })

  it("자동 기록 작성자(설명회 시트 동기화·백필 스크립트)의 활동은 연락으로 치지 않는다", () => {
    const touched = humanTouchedCompassLeadIds([
      { lead_id: 1, kind: "note", actor: "BD시트" },
      { lead_id: 2, kind: "note", actor: "Claude" },
      { lead_id: 3, kind: "note", actor: "시트" },
      { lead_id: 4, kind: "note", actor: " 시스템 " },
    ])
    expect(touched.size).toBe(0)
    expect([...COMPASS_AUTOMATED_ACTORS].sort()).toEqual(["BD시트", "Claude", "system", "시스템", "시트"].sort())
  })

  it("작성자가 비어 있는 기록은 사람 기록으로 둔다 — 시트 시절 콜 메모를 옮겨 온 행이다", () => {
    const touched = humanTouchedCompassLeadIds([{ lead_id: 7, kind: "note", actor: null }])
    expect([...touched]).toEqual([7])
  })

  it("같은 리드에 자동 기록과 사람 기록이 섞여 있으면 연락함이다", () => {
    const touched = humanTouchedCompassLeadIds([
      { lead_id: 5, kind: "note", actor: "BD시트" },
      { lead_id: 5, kind: "call", actor: "진소망" },
    ])
    expect([...touched]).toEqual([5])
  })
})

describe("planCompassLeadStatusSync", () => {
  it("9자리 미만 전화 키는 매칭하지 않는다 — '0' 같은 잘못된 번호끼리 붙지 않게", () => {
    const plan = planCompassLeadStatusSync(
      [{ id: "junk", phone: "0", status: "new" }],
      [row({ id: 1, phone_key: "0", stage: "demo" })],
      NONE
    )
    expect(plan).toMatchObject({ scanned: 1, matched: 0, contacted: [], closed: [] })
  })

  it("전화 표기가 달라도 같은 정규화 키로 매칭한다", () => {
    const plan = planCompassLeadStatusSync(
      [{ id: "a", phone: "+82 10-1234-5678", status: "new" }],
      [row({ id: 1, stage: "demo" })],
      NONE
    )
    expect(plan.contacted).toEqual(["a"])
  })

  it("전화가 없거나 매칭이 없는 리드는 계획에 넣지 않고, 건수만 센다", () => {
    const plan = planCompassLeadStatusSync(
      [
        { id: "no-phone", phone: null, status: "new" },
        { id: "no-match", phone: "010-9999-0000", status: "new" },
        { id: "match", phone: "010-1234-5678", status: "new" },
      ],
      [row({ id: 1, stage: "bd" })],
      NONE
    )
    expect(plan).toMatchObject({ scanned: 3, matched: 1, contacted: ["match"], closed: [] })
  })

  it("종료 항목에는 바뀌기 전 상태를 싣는다 — 감사 기록과 복구의 근거다", () => {
    const plan = planCompassLeadStatusSync(
      [
        { id: "was-new", phone: "010-1234-5678", status: "new" },
        { id: "was-contacted", phone: "01012345678", status: "contacted" },
      ],
      [row({ id: 1, stage: "lost" })],
      NONE
    )
    expect(plan.closed).toEqual([
      { id: "was-new", from: "new" },
      { id: "was-contacted", from: "contacted" },
    ])
    expect(plan.contacted).toEqual([])
  })
})

describe("compassLeadIdsNeedingActivityCheck", () => {
  it("단계만으로 판정이 끝나지 않는 신규 리드의 Compass id만 고른다", () => {
    const ids = compassLeadIdsNeedingActivityCheck(
      [
        { id: "a", phone: "010-1234-5678", status: "new" },
        { id: "b", phone: "010-2222-3333", status: "new" },
        { id: "c", phone: "010-4444-5555", status: "contacted" },
      ],
      [
        row({ id: 1 }),
        row({ id: 2 }),
        row({ id: 3, phone_key: "01022223333", stage: "demo" }),
        row({ id: 4, phone_key: "01044445555" }),
      ]
    )
    expect(ids).toEqual([1, 2])
  })
})
