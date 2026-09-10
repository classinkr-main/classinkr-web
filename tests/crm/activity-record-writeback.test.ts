import { describe, expect, it } from "vitest"

import {
  buildActivityContent,
  buildActivityRecordPayload,
  XIAOSHOUYI_ACTIVITY_ENTITY_TYPE,
  XIAOSHOUYI_ACTIVITY_FROM,
  XIAOSHOUYI_KR_DEPARTMENT_ID,
  type ContactWritebackInput,
} from "@/lib/crm/activity-record-writeback"

function input(overrides: Partial<ContactWritebackInput> = {}): ContactWritebackInput {
  return {
    type: "call",
    result: "answered",
    notes: "연장 의사 확인",
    contactedAt: "2026-08-28T02:30:00.000Z",
    externalAccountId: "4006219659975492",
    externalOwnerId: "3637136716307280",
    targetGroupId: "4374707173786001",
    ...overrides,
  }
}

describe("buildActivityContent", () => {
  it("유형·결과·메모를 한 줄로 묶고 출처를 남긴다", () => {
    expect(buildActivityContent({ type: "call", result: "answered", notes: "연장 의사 확인" })).toBe(
      "[전화] 통화 완료 — 연장 의사 확인 (ClassIn 어드민)"
    )
  })

  it("결과·메모가 없어도 유형과 출처는 남는다", () => {
    expect(buildActivityContent({ type: "kakao", result: null, notes: null })).toBe("[카카오톡] (ClassIn 어드민)")
  })

  it("공백뿐인 메모는 붙이지 않는다", () => {
    expect(buildActivityContent({ type: "sms", result: "no_answer", notes: "   " })).toBe(
      "[문자] 부재 (ClassIn 어드민)"
    )
  })
})

describe("buildActivityRecordPayload", () => {
  it("연락 기록을 활동 기록 페이로드로 바꾼다", () => {
    const result = buildActivityRecordPayload(input())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload).toMatchObject({
      dbcRelation26: "4006219659975492",
      ownerId: "3637136716307280",
      entityType: XIAOSHOUYI_ACTIVITY_ENTITY_TYPE.remoteContact,
      activityRecordFrom: XIAOSHOUYI_ACTIVITY_FROM.account,
      startTime: Date.parse("2026-08-28T02:30:00.000Z"),
    })
  })

  it("리드 단계 기록은 출처를 리드로 표시한다", () => {
    const result = buildActivityRecordPayload(input({ fromLead: true }))
    expect(result.ok && result.payload.activityRecordFrom).toBe(XIAOSHOUYI_ACTIVITY_FROM.lead)
  })

  it("외부 고객 id 가 없으면 되밀지 않는다", () => {
    const result = buildActivityRecordPayload(input({ externalAccountId: null }))
    expect(result).toEqual({ ok: false, reason: "missing_account" })
  })

  it("담당자를 모르면 ownerId 를 지어내지 않는다", () => {
    const result = buildActivityRecordPayload(input({ externalOwnerId: null }))
    expect(result.ok && "ownerId" in result.payload).toBe(false)
  })

  it("시각이 깨졌으면 보내지 않는다", () => {
    expect(buildActivityRecordPayload(input({ contactedAt: "언젠가" }))).toEqual({
      ok: false,
      reason: "invalid_time",
    })
  })

  it("네 가지 연락 유형 모두 원격 접촉으로 보낸다 — 방문은 아직 다루지 않는다", () => {
    for (const type of ["call", "sms", "kakao", "email"] as const) {
      const result = buildActivityRecordPayload(input({ type }))
      expect(result.ok && result.payload.entityType).toBe(XIAOSHOUYI_ACTIVITY_ENTITY_TYPE.remoteContact)
    }
  })

  it("허용 필드 밖의 값은 만들지 않는다", () => {
    const result = buildActivityRecordPayload(input())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const allowed = new Set([
      "content", "startTime", "endTime", "entityType", "groupId", "dimDepart", "belongId",
      "activityRecordFrom", "activityRecordFrom_data", "itemId", "dbcRelation26", "ownerId",
    ])
    for (const key of Object.keys(result.payload)) expect(allowed.has(key)).toBe(true)
  })

  it("생성이 거절되던 필수값을 빠짐없이 채운다", () => {
    // 실측으로 확인한 거절 사유 3단계를 그대로 회귀로 굳힌다:
    //   groupId 누락 → "groupId is null" / dimDepart·endTime 누락 → "param not complete"
    //   activityRecordFrom_compound 로 보냄 → "data type mismatch"
    const result = buildActivityRecordPayload(input())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.payload
    expect(p.groupId).toBe("4374707173786001")
    expect(p.dimDepart).toBe(XIAOSHOUYI_KR_DEPARTMENT_ID)
    expect(p.endTime).toBe(p.startTime)
    expect(p.belongId).toBe(1)
    expect(p.activityRecordFrom_data).toBe("4006219659975492")
    expect(p.itemId).toBe("4006219659975492")
    expect(p).not.toHaveProperty("activityRecordFrom_compound")
  })

  it("대상 피드 그룹을 모르면 만들지 않는다 — 남의 피드에 조용히 꽂히는 것 방지", () => {
    expect(buildActivityRecordPayload(input({ targetGroupId: null }))).toEqual({
      ok: false,
      reason: "missing_group",
    })
  })
})
