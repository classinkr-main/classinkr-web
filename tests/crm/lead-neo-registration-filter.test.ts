// 리드 보드 NEO 등록 필터 판정 고정 — 미등록 목록 = (전체) − (crm_source_links 확정 링크 보유).
// 판정 원천은 서버가 합쳐 내린 등록 리드 id 집합 하나다(listConfirmedLeadNeoLinks →
// /api/admin/leads neoLinks). 클라이언트가 링크 테이블을 직접 조회하지 않는다.
import { describe, expect, it } from "vitest"

import { matchesNeoRegistrationFilter } from "@/components/admin/crm/leads/shared"

describe("matchesNeoRegistrationFilter", () => {
  const registered = new Set(["lead-a", "lead-b"])

  it("'all'은 등록 여부와 무관하게 통과한다", () => {
    expect(matchesNeoRegistrationFilter("lead-a", "all", registered)).toBe(true)
    expect(matchesNeoRegistrationFilter("lead-z", "all", registered)).toBe(true)
  })

  it("'registered'는 확정 링크 보유 리드만 통과한다", () => {
    expect(matchesNeoRegistrationFilter("lead-a", "registered", registered)).toBe(true)
    expect(matchesNeoRegistrationFilter("lead-z", "registered", registered)).toBe(false)
  })

  it("'unregistered'는 확정 링크가 없는 리드만 통과한다", () => {
    expect(matchesNeoRegistrationFilter("lead-z", "unregistered", registered)).toBe(true)
    expect(matchesNeoRegistrationFilter("lead-a", "unregistered", registered)).toBe(false)
  })

  it("완료 기준: 미등록 = 전체 − 등록 (여집합이 정확히 맞아떨어진다)", () => {
    const allLeads = ["lead-a", "lead-b", "lead-c", "lead-d", "lead-e"]
    const registeredList = allLeads.filter((id) => matchesNeoRegistrationFilter(id, "registered", registered))
    const unregisteredList = allLeads.filter((id) => matchesNeoRegistrationFilter(id, "unregistered", registered))

    expect(registeredList.length + unregisteredList.length).toBe(allLeads.length)
    expect(new Set([...registeredList, ...unregisteredList]).size).toBe(allLeads.length)
    expect(unregisteredList).toEqual(["lead-c", "lead-d", "lead-e"])
  })

  it("등록 링크가 아직 0건이면(프로덕션 현재 상태) 미등록 = 전체", () => {
    const none = new Set<string>()
    const allLeads = ["l1", "l2", "l3"]
    expect(allLeads.filter((id) => matchesNeoRegistrationFilter(id, "unregistered", none))).toEqual(allLeads)
    expect(allLeads.filter((id) => matchesNeoRegistrationFilter(id, "registered", none))).toEqual([])
  })
})
