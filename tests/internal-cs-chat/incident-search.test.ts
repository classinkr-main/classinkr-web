import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  evaluateChatbotQuery: vi.fn(),
  searchConsultationEvidence: vi.fn(),
}))

vi.mock("@/lib/chatbot/service", () => ({
  evaluateChatbotQuery: mocks.evaluateChatbotQuery,
}))

vi.mock("@/lib/internal-cs-chat/consultation-search", () => ({
  searchConsultationEvidence: mocks.searchConsultationEvidence,
}))

import { buildInternalCsCopilotContext } from "@/lib/internal-cs-chat/context"
import {
  formatIncidentEvidence,
  incidentSourceRefs,
  searchIncidentEvidence,
  INCIDENT_CASES,
  WORKFLOW_FLOWS,
} from "@/lib/internal-cs-chat/incident-search"

beforeEach(() => {
  mocks.searchConsultationEvidence.mockResolvedValue([])
  mocks.evaluateChatbotQuery.mockResolvedValue({
    answer: "안전 초안",
    sources: [],
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("searchIncidentEvidence", () => {
  it("finds Jeongyul B3 fixed IP conflict incident case (D-02a)", () => {
    const results = searchIncidentEvidence("정율사관 B3 네트워크 끊김 오류 원인이 뭐야?")
    expect(results.length).toBeGreaterThan(0)
    const d02a = results.find((r) => r.caseId === "D-02a")
    expect(d02a).toBeDefined()
    expect(d02a?.org).toBe("정율사관 B3")
    expect(d02a?.summary).toContain("172.17.0.52")
    expect(d02a?.resolution).toContain("DHCP")
  })

  it("finds Jeongyul B4 RAM 8GB crash and virtual memory incident case (D-02b)", () => {
    const results = searchIncidentEvidence("ClassIn 강제 종료 튕김 RAM 8GB OPS 가상메모리 설정")
    expect(results.length).toBeGreaterThan(0)
    const d02b = results.find((r) => r.caseId === "D-02b")
    expect(d02b).toBeDefined()
    expect(d02b?.resolution).toContain("12,288MB")
  })

  it("finds Changwon recording error 4001 incident case (D-21)", () => {
    const results = searchIncidentEvidence("창원 녹화 오류 4001")
    expect(results.length).toBeGreaterThan(0)
    const d21 = results.find((r) => r.caseId === "D-21")
    expect(d21).toBeDefined()
    expect(d21?.summary).toContain("4001")
  })

  it("finds Gwasaram camera RTSP port blocking incident case (D-06)", () => {
    const results = searchIncidentEvidence("과사람 학원 카메라 화면 꺼짐 RTSP")
    expect(results.length).toBeGreaterThan(0)
    const d06 = results.find((r) => r.caseId === "D-06")
    expect(d06).toBeDefined()
    expect(d06?.resolution).toContain("554")
  })

  it("finds Code 57 heartbeat client crash incident case (D-18)", () => {
    const results = searchIncidentEvidence("수업 중 교사 이탈 코드 57 하트비트")
    expect(results.length).toBeGreaterThan(0)
    const d18 = results.find((r) => r.caseId === "D-18")
    expect(d18).toBeDefined()
    expect(d18?.resolution).toContain("신규 로그인")
  })

  it("matches Flow 5-1 network interruption troubleshooting procedure", () => {
    const results = searchIncidentEvidence("네트워크 끊김 발생 시 5-1 점검 순서 및 확인 흐름")
    expect(results.length).toBeGreaterThan(0)
    const flow = results.find((r) => r.id === "workflow:flow-network-disconnection")
    expect(flow).toBeDefined()
    expect(flow?.title).toContain("5-1")
    expect(flow?.workflowSteps?.length).toBeGreaterThanOrEqual(5)
  })

  it("matches Flow 5-2 recording failure troubleshooting procedure", () => {
    const results = searchIncidentEvidence("수업 녹화 실패 파일 깨짐 5-2 확인 순서 대응 절차")
    expect(results.length).toBeGreaterThan(0)
    const flow = results.find((r) => r.id === "workflow:flow-recording-failure")
    expect(flow).toBeDefined()
    expect(flow?.title).toContain("5-2")
  })

  it("matches Flow 5-3 camera unrecognized black screen troubleshooting procedure", () => {
    const results = searchIncidentEvidence("카메라 인식 안 됨 화면 검은색일 때 5-3 확인 흐름")
    expect(results.length).toBeGreaterThan(0)
    const flow = results.find((r) => r.id === "workflow:flow-camera-connection")
    expect(flow).toBeDefined()
    expect(flow?.title).toContain("5-3")
  })
})

describe("formatIncidentEvidence and incidentSourceRefs", () => {
  it("formats evidence into structured internal guide text", () => {
    const sample = searchIncidentEvidence("정율사관 B3 네트워크 끊김")
    const formatted = formatIncidentEvidence(sample)
    expect(formatted).toContain("[선례 오류 케이스 및 점검 흐름]")
    expect(formatted).toContain("D-02a")
    expect(formatted).toContain("docs/active/cs-error-cases-index-2026-10-02.md")
  })

  it("returns empty string when no incident matches", () => {
    expect(formatIncidentEvidence([])).toBe("")
  })

  it("converts evidence entries to InternalCsSourceRef with kind internal_guide", () => {
    const sample = searchIncidentEvidence("정율사관 B3")
    const refs = incidentSourceRefs(sample)
    expect(refs.length).toBeGreaterThan(0)
    expect(refs[0].kind).toBe("internal_guide")
    expect(refs[0].label).toContain("[선례]")
  })
})

describe("buildInternalCsCopilotContext integration with incident search", () => {
  it("injects incident evidence and source refs into copilot context", async () => {
    const context = await buildInternalCsCopilotContext("정율사관 B3 고정 IP 충돌 네트워크 끊김")

    expect(context.incidentEvidence).toBeDefined()
    expect(context.incidentEvidence!.length).toBeGreaterThan(0)
    expect(context.incidentEvidence![0].caseId).toBe("D-02a")

    expect(context.internalContext).toContain("[선례 오류 케이스 및 점검 흐름]")
    expect(context.internalContext).toContain("D-02a")

    expect(context.sourceRefs.some((ref) => ref.id.includes("cs-error-cases-index-2026-10-02.md"))).toBe(true)

    expect(context.deterministicFallback).toContain("## 선례 오류 케이스 및 점검 흐름")
    expect(context.deterministicFallback).toContain("D-02a")
  })
})
