import { describe, expect, it } from "vitest"

import {
  COMPASS_AUTOMATED_ACTORS,
  COMPASS_HUMAN_ACTIVITY_KINDS,
  compassLeadIdsNeedingActivityCheck,
  compassLookupPhoneKeys,
  compassOwnerOf,
  compassRowsForLead,
  decideLeadStatusFromCompass,
  humanTouchedCompassLeadIds,
  leadInflowAtMs,
  planCompassLeadStatusSync,
  planCompassOwnerSync,
} from "@/lib/compass/lead-contact-sync"
import type { CompassOverlaySource } from "@/lib/compass/overlay"

// 자리표시 규칙(010-1234-5678 은 더미)에 걸리지 않는 실제 모양의 번호
const KEY = "01020417731"
const KEY_DASHED = "010-2041-7731"
const KEY_INTL = "+82 10-2041-7731"

function row(partial: Partial<CompassOverlaySource> & { id: number }): CompassOverlaySource {
  return { phone_key: KEY, stage: "new", created_at: "2026-09-01T00:00:00Z", ...partial }
}

const NONE = new Map<number, number>()
/** 사람 손 활동 — 시각 없이(0) 표시. 시각이 있는 경우는 touchedAt() 로. */
const touched = (...ids: number[]) => new Map(ids.map((id) => [id, 0]))
const touchedAt = (entries: Array<[number, string]>) => new Map(entries.map(([id, iso]) => [id, new Date(iso).getTime()]))

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
    expect(decideLeadStatusFromCompass({ status: "new" }, rows, touched(2))).toBe("contacted")
  })

  it("단계가 신규유입이고 사람 손 활동도 없으면 그대로 둔다", () => {
    expect(decideLeadStatusFromCompass({ status: "new" }, [row({ id: 1 })], touched(99))).toBeNull()
  })

  it("이미 연락함인 리드는 대표 행이 이탈일 때만 종료로 보낸다", () => {
    expect(decideLeadStatusFromCompass({ status: "contacted" }, [row({ id: 1, stage: "lost" })], NONE)).toBe("closed")
    expect(decideLeadStatusFromCompass({ status: "contacted" }, [row({ id: 1, stage: "demo" })], touched(1))).toBeNull()
  })

  it("전환·종료 리드는 어떤 경우에도 건드리지 않는다 — 전환은 딜 생성이 걸린 비가역 동작이다", () => {
    for (const status of ["converted", "closed"] as const) {
      expect(decideLeadStatusFromCompass({ status }, [row({ id: 1, stage: "lost" })], NONE)).toBeNull()
      expect(decideLeadStatusFromCompass({ status }, [row({ id: 1, stage: "demo" })], touched(1))).toBeNull()
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
    expect([...touched.keys()]).toEqual([1])
  })

  it("자동 기록 작성자(설명회 시트 동기화·백필 스크립트)의 활동은 연락으로 치지 않는다", () => {
    const touched = humanTouchedCompassLeadIds([
      { lead_id: 1, kind: "note", actor: "BD시트" },
      { lead_id: 2, kind: "note", actor: "Claude" },
      { lead_id: 3, kind: "note", actor: "시트" },
      { lead_id: 4, kind: "note", actor: " 시스템 " },
      { lead_id: 5, kind: "note", actor: "시트 동기화" },
    ])
    expect(touched.size).toBe(0)
    expect([...COMPASS_AUTOMATED_ACTORS].sort()).toEqual(
      ["BD시트", "Claude", "system", "시스템", "시트", "시트 동기화"].sort()
    )
  })

  it("작성자가 비어 있는 기록은 사람 기록으로 둔다 — 시트 시절 콜 메모를 옮겨 온 행이다", () => {
    const touched = humanTouchedCompassLeadIds([{ lead_id: 7, kind: "note", actor: null }])
    expect([...touched.keys()]).toEqual([7])
  })

  it("같은 리드에 자동 기록과 사람 기록이 섞여 있으면 연락함이다", () => {
    const touched = humanTouchedCompassLeadIds([
      { lead_id: 5, kind: "note", actor: "BD시트" },
      { lead_id: 5, kind: "call", actor: "진소망" },
    ])
    expect([...touched.keys()]).toEqual([5])
  })

  it("리드마다 사람 손 활동의 가장 늦은 시각을 든다 — 시각 없는 활동은 0", () => {
    const touched = humanTouchedCompassLeadIds([
      { lead_id: 1, kind: "call", actor: "황찬우", created_at: "2026-09-01T00:00:00Z" },
      { lead_id: 1, kind: "note", actor: null, created_at: "2026-09-20T00:00:00Z" },
      { lead_id: 1, kind: "note", actor: "BD시트", created_at: "2026-10-01T00:00:00Z" },
      { lead_id: 2, kind: "call", actor: "진소망" },
    ])
    expect(touched.get(1)).toBe(new Date("2026-09-20T00:00:00Z").getTime())
    expect(touched.get(2)).toBe(0)
  })
})

describe("문의보다 오래된 Compass 근거는 처리가 아니다 (2026-10-12)", () => {
  // 홈페이지 문의 10/10. Compass 의 종료·활동은 9월.
  const LEAD = { status: "new" as const, created_at: "2026-10-10T01:00:00Z", last_inflow_at: null }

  it("리드 시각을 모르면 예전처럼 시각을 따지지 않는다(옛 호출 호환)", () => {
    expect(leadInflowAtMs({ created_at: null, last_inflow_at: null })).toBeNull()
    expect(decideLeadStatusFromCompass({ status: "new" }, [row({ id: 1, stage: "lost", updated_at: "2026-09-01T00:00:00Z" })], NONE)).toBe("closed")
  })

  it("기준 시각은 max(created_at, last_inflow_at) — 재문의면 재유입 시각", () => {
    expect(leadInflowAtMs({ created_at: "2026-09-01T00:00:00Z", last_inflow_at: "2026-10-10T00:00:00Z" })).toBe(
      new Date("2026-10-10T00:00:00Z").getTime()
    )
    expect(leadInflowAtMs({ created_at: "2026-10-10T00:00:00Z", last_inflow_at: null })).toBe(new Date("2026-10-10T00:00:00Z").getTime())
  })

  it("문의 전에 종료(lost)된 Compass 행으로는 새 문의를 종료하지 않는다 — 종료된 고객의 재문의", () => {
    const stale = [row({ id: 1, stage: "lost", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" })]
    expect(decideLeadStatusFromCompass(LEAD, stale, NONE)).toBeNull()
    expect(decideLeadStatusFromCompass({ ...LEAD, status: "contacted" }, stale, NONE)).toBeNull()
  })

  it("문의 뒤에 종료된 행이면 종료한다", () => {
    const fresh = [row({ id: 1, stage: "lost", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-10-11T00:00:00Z" })]
    expect(decideLeadStatusFromCompass(LEAD, fresh, NONE)).toBe("closed")
  })

  it("문의 전에 단계를 벗어난 행·문의 전 콜만 있으면 연락함이 아니다 — 몇 달 전 콜 때문에 새 문의가 '연락중'이 되지 않는다", () => {
    const rows = [row({ id: 1, stage: "demo", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-20T00:00:00Z" })]
    expect(decideLeadStatusFromCompass(LEAD, rows, touchedAt([[1, "2026-06-15T00:00:00Z"]]))).toBeNull()
  })

  it("문의 뒤의 단계 이동 또는 사람 손 활동이 있으면 연락함이다", () => {
    const moved = [row({ id: 1, stage: "demo", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-10-11T00:00:00Z" })]
    expect(decideLeadStatusFromCompass(LEAD, moved, NONE)).toBe("contacted")
    const stillNew = [row({ id: 2, stage: "new", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-01T00:00:00Z" })]
    expect(decideLeadStatusFromCompass(LEAD, stillNew, touchedAt([[2, "2026-10-12T00:00:00Z"]]))).toBe("contacted")
  })

  it("Compass 행에 시각이 없으면(리드 시각은 있음) 근거로 쓰지 않는다 — 보수적", () => {
    expect(decideLeadStatusFromCompass(LEAD, [{ id: 1, phone_key: KEY, stage: "lost" }], NONE)).toBeNull()
  })

  it("활동 조회 대상 — 문의 뒤에 단계를 벗어난 행이 없으면 옛 단계 이동이 있어도 활동을 본다", () => {
    const ids = compassLeadIdsNeedingActivityCheck(
      [{ id: "a", phone: KEY_DASHED, status: "new", created_at: "2026-10-10T01:00:00Z" }],
      [row({ id: 1, stage: "demo", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-20T00:00:00Z" })]
    )
    expect(ids).toEqual([1])
  })
})

describe("자리표시·더미 번호는 매칭 키가 아니다 (Compass ADR-0018)", () => {
  it("010-1234-5678 같은 더미는 양쪽 다 키에서 빠진다 — 같은 더미를 친 남의 리드에 붙지 않는다", () => {
    const plan = planCompassLeadStatusSync(
      [{ id: "dummy", phone: "010-1234-5678", status: "new" }],
      [row({ id: 1, phone_key: "01012345678", stage: "lost", updated_at: "2026-10-01T00:00:00Z" })],
      NONE
    )
    expect(plan).toMatchObject({ scanned: 1, matched: 0, contacted: [], closed: [] })
    expect(compassLookupPhoneKeys([{ id: "dummy", phone: "010-0000-0000", status: "new" }])).toEqual([])
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
      [{ id: "a", phone: KEY_INTL, status: "new" }],
      [row({ id: 1, stage: "demo" })],
      NONE
    )
    expect(plan.contacted).toEqual(["a"])
  })

  it("전화가 없거나 매칭이 없는 리드는 계획에 넣지 않고, 건수만 센다", () => {
    const plan = planCompassLeadStatusSync(
      [
        { id: "no-phone", phone: null, status: "new" },
        { id: "no-match", phone: "010-9876-0012", status: "new" },
        { id: "match", phone: KEY_DASHED, status: "new" },
      ],
      [row({ id: 1, stage: "bd" })],
      NONE
    )
    expect(plan).toMatchObject({ scanned: 3, matched: 1, contacted: ["match"], closed: [] })
  })

  it("종료 항목에는 바뀌기 전 상태를 싣는다 — 감사 기록과 복구의 근거다", () => {
    const plan = planCompassLeadStatusSync(
      [
        { id: "was-new", phone: KEY_DASHED, status: "new" },
        { id: "was-contacted", phone: KEY, status: "contacted" },
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

describe("compassLookupPhoneKeys", () => {
  it("매칭에 쓸 수 있는 키만 중복 없이 뽑는다 — 9자리 미만 키로 Compass 를 조회하지 않는다", () => {
    expect(
      compassLookupPhoneKeys([
        { id: "a", phone: KEY_DASHED, status: "new" },
        { id: "b", phone: KEY_INTL, status: "contacted" },
        { id: "c", phone: "0", status: "new" },
        { id: "d", phone: null, status: "new" },
      ])
    ).toEqual([KEY])
  })
})

describe("compassLeadIdsNeedingActivityCheck", () => {
  it("단계만으로 판정이 끝나지 않는 신규 리드의 Compass id만 고른다", () => {
    const ids = compassLeadIdsNeedingActivityCheck(
      [
        { id: "a", phone: KEY_DASHED, status: "new" },
        { id: "b", phone: "010-2052-7732", status: "new" },
        { id: "c", phone: "010-2074-7734", status: "contacted" },
      ],
      [
        row({ id: 1 }),
        row({ id: 2 }),
        row({ id: 3, phone_key: "01020527732", stage: "demo" }),
        row({ id: 4, phone_key: "01020747734" }),
      ]
    )
    expect(ids).toEqual([1, 2])
  })
})

/* 링크 우선 매칭(2026-11-04) — Compass 가 홈페이지 폼 리드를 받으며 거는 lead_refs(home_lead): 어드민 리드 id → Compass 리드 id.
   전화 키와 합집합이고, 전화가 없거나 더미인 리드도 링크로 붙는다. */
describe("링크 우선 매칭 · compassRowsForLead · plan/activity 에 links 를 넘긴다", () => {
  const linkedRow = row({ id: 9, phone_key: null, stage: "demo" })
  const otherRow = row({ id: 11, phone_key: "01099990000", stage: "contact" })
  const phoneRow = row({ id: 1, stage: "new" })

  it("전화 없는 리드도 링크로 붙는다 — 링크가 없으면 빈 배열", () => {
    const links = new Map([["g", [9]]])
    expect(compassRowsForLead({ id: "g", phone: null }, [linkedRow, phoneRow], links)).toEqual([linkedRow])
    expect(compassRowsForLead({ id: "x", phone: null }, [linkedRow, phoneRow], links)).toEqual([])
    expect(compassRowsForLead({ id: "x", phone: "010-1234-5678" }, [linkedRow, phoneRow], links)).toEqual([]) // 더미 번호는 키가 아니다
  })

  it("링크 행과 전화 키 행은 합집합이고 같은 Compass 행은 한 번만", () => {
    const links = new Map([["h", [11, 1]]])
    expect(compassRowsForLead({ id: "h", phone: KEY_DASHED }, [phoneRow, otherRow, linkedRow], links)).toEqual([otherRow, phoneRow])
  })

  it("planCompassLeadStatusSync · 링크로만 붙은 신규 리드가 Compass 에서 데모면 연락함, linked 수를 센다", () => {
    const links = new Map([["g", [9]]])
    const plan = planCompassLeadStatusSync(
      [
        { id: "g", phone: null, status: "new" },
        { id: "a", phone: KEY_DASHED, status: "new" },
      ],
      [linkedRow, row({ id: 1, stage: "lost" })],
      NONE,
      links
    )
    expect(plan).toEqual({ scanned: 2, matched: 2, linked: 1, contacted: ["g"], closed: [{ id: "a", from: "new" }] })
  })

  it("links 를 안 넘기면 예전처럼 전화 키만으로 매칭한다", () => {
    const plan = planCompassLeadStatusSync([{ id: "g", phone: null, status: "new" }], [linkedRow], NONE)
    expect(plan).toEqual({ scanned: 1, matched: 0, linked: 0, contacted: [], closed: [] })
  })

  it("compassLeadIdsNeedingActivityCheck · 링크 행이 전부 신규면 그 id 의 활동을 본다", () => {
    const links = new Map([["g", [9]]])
    const stillNew = row({ id: 9, phone_key: null, stage: "new" })
    expect(compassLeadIdsNeedingActivityCheck([{ id: "g", phone: null, status: "new" }], [stillNew], links)).toEqual([9])
    expect(compassLeadIdsNeedingActivityCheck([{ id: "g", phone: null, status: "new" }], [linkedRow], links)).toEqual([])
  })
})

/* 담당 반영(2026-11-04) — Compass 담당을 어드민 담당(assigned_to)이 비어 있을 때만 채운다. */
describe("담당 반영 · compassOwnerOf · planCompassOwnerSync", () => {
  const resolve = (name: string) => ({ 진소망: "jin.somang", 황찬우: "hwang.chanwoo" } as Record<string, string>)[name] ?? null

  it("Compass 담당은 콜 담당 → BD 담당 → 오너 순 · 공백은 비운 것", () => {
    expect(compassOwnerOf({ caller: " 진소망 ", bd_owner: "박한", owner: "문준혁" })).toBe("진소망")
    expect(compassOwnerOf({ caller: "  ", bd_owner: "박한", owner: "문준혁" })).toBe("박한")
    expect(compassOwnerOf({ caller: null, bd_owner: null, owner: "문준혁" })).toBe("문준혁")
    expect(compassOwnerOf({ caller: null, bd_owner: null, owner: null })).toBeNull()
  })

  it("비어 있는 담당만 채운다 · 이미 다른 담당이면 conflicts · 같은 담당(ownerKey·대소문자 무관)이면 아무것도 아니다", () => {
    const rows = [row({ id: 1, stage: "demo", caller: "진소망" })]
    const plan = planCompassOwnerSync(
      [
        { id: "a", phone: KEY_DASHED, status: "new" },
        { id: "b", phone: KEY_INTL, status: "contacted", assigned_to: "kim.cs" },
        { id: "c", phone: KEY_DASHED, status: "new", assigned_to: "JIN.SOMANG" },
      ],
      rows,
      resolve
    )
    expect(plan).toEqual({ assign: [{ id: "a", to: "jin.somang", owner: "진소망" }], conflicts: 1, unmapped: 0 })
  })

  it("명단으로 못 푸는 이름은 unmapped · 대표 행에 담당이 없으면 아무것도 하지 않는다 · 전환·종료 리드는 건드리지 않는다", () => {
    expect(planCompassOwnerSync([{ id: "a", phone: KEY_DASHED, status: "new" }], [row({ id: 1, caller: "모르는사람" })], resolve)).toEqual({
      assign: [],
      conflicts: 0,
      unmapped: 1,
    })
    expect(planCompassOwnerSync([{ id: "a", phone: KEY_DASHED, status: "new" }], [row({ id: 1 })], resolve)).toEqual({ assign: [], conflicts: 0, unmapped: 0 })
    for (const status of ["converted", "closed"] as const) {
      expect(planCompassOwnerSync([{ id: "a", phone: KEY_DASHED, status }], [row({ id: 1, caller: "진소망" })], resolve).assign).toEqual([])
    }
  })

  it("담당은 칩·상태와 같은 대표 행(최근성 → id)에서 읽고, 링크로만 붙은 리드도 채운다", () => {
    const rows = [
      row({ id: 1, stage: "demo", caller: "황찬우", updated_at: "2026-09-01T00:00:00Z" }),
      row({ id: 2, stage: "demo", caller: "진소망", updated_at: "2026-09-10T00:00:00Z" }),
      row({ id: 9, phone_key: null, stage: "contact", bd_owner: "황찬우" }),
    ]
    const plan = planCompassOwnerSync(
      [
        { id: "a", phone: KEY_DASHED, status: "new" },
        { id: "g", phone: null, status: "new" },
      ],
      rows,
      resolve,
      new Map([["g", [9]]])
    )
    expect(plan.assign).toEqual([
      { id: "a", to: "jin.somang", owner: "진소망" },
      { id: "g", to: "hwang.chanwoo", owner: "황찬우" },
    ])
  })
})
