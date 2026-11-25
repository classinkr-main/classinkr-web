import { describe, expect, it } from "vitest"

import {
  INCIDENT_CASES,
  isPlaceholderCustomer,
  maskOrgNames,
  searchIncidentEvidence,
} from "@/lib/internal-cs-chat/incident-search"

const realCases = INCIDENT_CASES.filter((c) => !isPlaceholderCustomer(c.customer))
const placeholderCases = INCIDENT_CASES.filter((c) => isPlaceholderCustomer(c.customer))

describe("incident search precision (IC-07)", () => {
  it("does not hand a recording complaint the placeholder-customer cases and finds the recording flow", () => {
    const results = searchIncidentEvidence("고객이 녹화가 안 된다고 합니다")
    const caseIds = results.map((r) => r.caseId)
    for (const placeholder of placeholderCases) expect(caseIds).not.toContain(placeholder.id)
    expect(results.map((r) => r.id)).toContain("workflow:flow-recording-failure")
  })

  it("never scores a placeholder customer name, however the question is worded", () => {
    expect(placeholderCases.length).toBeGreaterThan(0)
    for (const placeholder of placeholderCases) {
      const results = searchIncidentEvidence(`${placeholder.customer} 환불 결제 문의가 들어왔어요`)
      expect(results.map((r) => r.caseId)).not.toContain(placeholder.id)
    }
    expect(searchIncidentEvidence("고객 미상")).toEqual([])
    expect(searchIncidentEvidence("고객이 화가 나서 상담원 연결하라고 해요")).toEqual([])
  })

  it("does not match on a customer name alone or on a name fragment", () => {
    for (const c of realCases) {
      expect(searchIncidentEvidence(c.customer).map((r) => r.caseId)).not.toContain(c.id)
    }
    // 이름 조각(두 글자 이상 토큰)만 있는 질문도 통과하지 못한다.
    for (const c of realCases) {
      const fragment = c.customer.split(/\s+/).find((token) => token.length >= 2)
      if (fragment) expect(searchIncidentEvidence(`${fragment} 문의`).map((r) => r.caseId)).not.toContain(c.id)
    }
  })

  it("matches a case by its case id even when the question has no other keyword", () => {
    expect(searchIncidentEvidence("D-21 케이스 알려줘").map((r) => r.caseId)).toContain("D-21")
  })

  it("keeps customer names out of every evidence field it returns", () => {
    const names = new Set<string>()
    for (const c of realCases) {
      for (const token of c.customer.replace(/[()]/g, " ").split(/\s+/)) {
        if (token.length >= 4 && /\p{L}/u.test(token)) names.add(token)
      }
    }
    expect(names.size).toBeGreaterThan(0)
    for (const c of INCIDENT_CASES) {
      for (const entry of searchIncidentEvidence(`${c.id} ${c.symptom}`, { limit: 5 })) {
        const text = [entry.title, entry.summary, entry.resolution ?? "", ...(entry.workflowSteps ?? [])].join("\n")
        for (const name of names) expect(text).not.toContain(name)
      }
    }
    expect(maskOrgNames(`${realCases[0].customer} 현장`)).not.toContain(realCases[0].customer)
  })
})
