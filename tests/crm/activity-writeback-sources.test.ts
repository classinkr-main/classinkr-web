// 방문·메모(crm_customer_events)와 데모(crm_tasks)를 외부 CRM 활동 기록으로 옮기는 변환.
// 연락 기록(lead_contact_logs) 쪽 계약은 activity-record-writeback.test.ts 가 이미 잠근다.
//
// 여기서 지키려는 것은 두 가지다.
//   1) 모르면 만들지 않는다 — groupId·방향(kind)·시각이 없으면 payload 를 안 만든다.
//      틀린 groupId 로도 생성은 "성공"하고 남의 피드에 꽂혀 사라지기 때문에, 조용한 실패가 최악이다.
//   2) 관계의 정본은 activityRecordFrom(다형 참조) + activityRecordFrom_data 쌍이고,
//      dbcRelation26 은 고객 전용이라 리드에는 넣지 않는다(2026-09-07 실측).

import { describe, expect, it } from "vitest"

import {
  buildCustomerEventContent,
  buildCustomerEventWritebackPayload,
  buildDemoContent,
  buildDemoTaskWritebackPayload,
  XIAOSHOUYI_ACTIVITY_ENTITY_TYPE,
  XIAOSHOUYI_ACTIVITY_FROM,
  XIAOSHOUYI_KR_DEPARTMENT_ID,
  type CustomerEventWritebackInput,
  type DemoTaskWritebackInput,
} from "@/lib/crm/activity-record-writeback"

const TARGET = {
  externalAccountId: "4006219659975492",
  externalOwnerId: "3637136716307280",
  targetGroupId: "4374707173786001",
}

function eventInput(overrides: Partial<CustomerEventWritebackInput> = {}): CustomerEventWritebackInput {
  return {
    ...TARGET,
    title: "학원 방문 미팅",
    summary: "3개 교실 도입 논의",
    body: null,
    occurredAt: "2026-08-28T02:30:00.000Z",
    ownerName: "문준혁",
    kind: "visit",
    ...overrides,
  }
}

function demoInput(overrides: Partial<DemoTaskWritebackInput> = {}): DemoTaskWritebackInput {
  return {
    ...TARGET,
    title: "수학 과목 데모",
    detail: "칠판·녹화 시연",
    outcome: "도입 검토하기로",
    completedAt: "2026-08-28T05:00:00.000Z",
    ownerName: "진소망",
    kind: "visit",
    ...overrides,
  }
}

describe("buildCustomerEventContent", () => {
  it("제목·요약·담당을 한 줄로 묶고 출처를 남긴다", () => {
    expect(
      buildCustomerEventContent({
        title: "학원 방문 미팅",
        summary: "3개 교실 도입 논의",
        body: null,
        ownerName: "문준혁",
      })
    ).toBe("[학원 방문 미팅] 3개 교실 도입 논의 · 문준혁 (ClassIn 어드민)")
  })

  it("요약이 없으면 본문을 쓰고, 줄바꿈은 한 줄로 접는다", () => {
    expect(
      buildCustomerEventContent({
        title: "메모",
        summary: null,
        body: "원장 통화\n예산은 다음 분기",
        ownerName: null,
      })
    ).toBe("[메모] 원장 통화 예산은 다음 분기 (ClassIn 어드민)")
  })

  it("본문이 길면 잘라낸다 — 목록에서 한 줄로 보이는 필드다", () => {
    const content = buildCustomerEventContent({
      title: "긴 메모",
      summary: "가".repeat(900),
      body: null,
      ownerName: null,
    })
    expect(content).toContain("…")
    expect(content.length).toBeLessThan(600)
  })
})

describe("buildCustomerEventWritebackPayload", () => {
  it("방문을 线下拜访 유형으로 만든다", () => {
    const result = buildCustomerEventWritebackPayload(eventInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.payload.entityType).toBe(XIAOSHOUYI_ACTIVITY_ENTITY_TYPE.visit)
    expect(result.payload.dimDepart).toBe(XIAOSHOUYI_KR_DEPARTMENT_ID)
    expect(result.payload.belongId).toBe(1)
    // 시작과 끝이 같은 값 — 비우면 생성이 거절된다.
    expect(result.payload.endTime).toBe(result.payload.startTime)
    expect(result.payload.startTime).toBe(Date.parse("2026-08-28T02:30:00.000Z"))
  })

  it("고객이 온 경우는 公司参访 유형이다", () => {
    const result = buildCustomerEventWritebackPayload(eventInput({ kind: "inbound_visit" }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.entityType).toBe(XIAOSHOUYI_ACTIVITY_ENTITY_TYPE.inboundVisit)
  })

  it("고객이면 다형 참조 쌍 + 고객 참조를 함께 쓴다 — 복합 필드로 보내면 타입 불일치로 거절된다", () => {
    const result = buildCustomerEventWritebackPayload(eventInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.payload.activityRecordFrom).toBe(XIAOSHOUYI_ACTIVITY_FROM.account)
    expect(result.payload.activityRecordFrom_data).toBe(TARGET.externalAccountId)
    expect(result.payload.dbcRelation26).toBe(TARGET.externalAccountId)
    expect(result.payload).not.toHaveProperty("activityRecordFrom_compound")
  })

  // 2026-09-07 실측: activityRecordFrom = 11 인 실제 레코드는 dbcRelation26 이 전부 null 이다.
  // describe 에서도 dbcRelation26 은 referObjectApiKey = "account" 로 고객 전용이다.
  it("리드면 dbcRelation26 을 넣지 않는다 — 고객 참조에 리드 id 가 들어가면 안 된다", () => {
    const lead = buildCustomerEventWritebackPayload(eventInput({ fromLead: true }))
    expect(lead.ok).toBe(true)
    if (!lead.ok) return

    expect(lead.payload.activityRecordFrom).toBe(XIAOSHOUYI_ACTIVITY_FROM.lead)
    expect(lead.payload.activityRecordFrom_data).toBe(TARGET.externalAccountId)
    expect(lead.payload).not.toHaveProperty("dbcRelation26")
  })

  // ownerId 는 describe 필수(되밀기 지침 §2-4·§5) — 실행 계정에 맡기면 전부 실행 계정 소유로 쌓인다.
  it("담당자를 모르면 만들지 않는다", () => {
    expect(buildCustomerEventWritebackPayload(eventInput({ externalOwnerId: null }))).toEqual({
      ok: false,
      reason: "missing_owner",
    })
  })

  it("groupId 가 없으면 만들지 않는다 — 틀린 그룹은 조용히 안 보이는 곳에 꽂힌다", () => {
    expect(buildCustomerEventWritebackPayload(eventInput({ targetGroupId: null }))).toEqual({
      ok: false,
      reason: "missing_group",
    })
  })

  it("대상 id 가 없으면 만들지 않는다", () => {
    expect(buildCustomerEventWritebackPayload(eventInput({ externalAccountId: null }))).toEqual({
      ok: false,
      reason: "missing_account",
    })
  })

  it("방향을 모르면 만들지 않는다 — 외부 CRM 에는 방향 없는 방문 유형이 없다", () => {
    expect(buildCustomerEventWritebackPayload(eventInput({ kind: null }))).toEqual({
      ok: false,
      reason: "unknown_kind",
    })
  })

  it("시각이 깨져 있으면 만들지 않는다", () => {
    expect(buildCustomerEventWritebackPayload(eventInput({ occurredAt: "언젠가" }))).toEqual({
      ok: false,
      reason: "invalid_time",
    })
  })

  it("제목·요약·본문이 모두 비면 만들지 않는다 — 내용 없는 활동은 남길 이유가 없다", () => {
    expect(
      buildCustomerEventWritebackPayload(
        eventInput({ title: "   ", summary: null, body: null, ownerName: null })
      )
    ).toEqual({ ok: false, reason: "missing_content" })
  })
})

describe("buildDemoContent", () => {
  it("결과가 있으면 결과를 쓴다", () => {
    expect(
      buildDemoContent({
        title: "수학 과목 데모",
        detail: "칠판·녹화 시연",
        outcome: "도입 검토하기로",
        ownerName: "진소망",
      })
    ).toBe("[데모] 수학 과목 데모 — 도입 검토하기로 · 진소망 (ClassIn 어드민)")
  })

  it("결과가 없으면 상세로 대신한다", () => {
    expect(
      buildDemoContent({ title: "데모", detail: "칠판 시연", outcome: null, ownerName: null })
    ).toBe("[데모] 데모 — 칠판 시연 (ClassIn 어드민)")
  })
})

describe("buildDemoTaskWritebackPayload", () => {
  it("완료 시각을 기록 시각으로 쓴다", () => {
    const result = buildDemoTaskWritebackPayload(demoInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.startTime).toBe(Date.parse("2026-08-28T05:00:00.000Z"))
    expect(result.payload.entityType).toBe(XIAOSHOUYI_ACTIVITY_ENTITY_TYPE.visit)
  })

  it("아직 안 끝난 데모는 밀지 않는다 — 활동 기록은 예정표가 아니다", () => {
    expect(buildDemoTaskWritebackPayload(demoInput({ completedAt: null }))).toEqual({
      ok: false,
      reason: "invalid_time",
    })
  })

  it("방향을 모르면 만들지 않는다", () => {
    expect(buildDemoTaskWritebackPayload(demoInput({ kind: null }))).toEqual({
      ok: false,
      reason: "unknown_kind",
    })
  })
})
