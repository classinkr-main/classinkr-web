import { describe, expect, it, vi, beforeEach } from "vitest"

import type { ChannelConversationRecord } from "@/lib/repositories/channel-conversations"
import type { LeadRecord } from "@/lib/repositories/leads"

const mocks = vi.hoisted(() => ({
  listDurableConversations: vi.fn(),
  getConversations: vi.fn(),
  getLeads: vi.fn(),
  getChatbotStats: vi.fn(),
  isChannelApiConfigured: vi.fn(),
  listShowroomBookings: vi.fn(),
  listInstallSchedules: vi.fn(),
  listCrmTasks: vi.fn(),
}))

vi.mock("@/lib/repositories/channel-conversations", () => ({
  listDurableConversations: mocks.listDurableConversations,
  getConversations: mocks.getConversations,
}))

vi.mock("@/lib/repositories/leads", () => ({
  getLeads: mocks.getLeads,
}))

vi.mock("@/lib/chatbot/service", () => ({
  getChatbotStats: mocks.getChatbotStats,
}))

vi.mock("@/lib/channel-talk-api", () => ({
  isChannelApiConfigured: mocks.isChannelApiConfigured,
}))

vi.mock("@/lib/repositories/showroom-bookings", () => ({
  listShowroomBookings: mocks.listShowroomBookings,
}))

vi.mock("@/lib/repositories/install-schedules", () => ({
  listInstallSchedules: mocks.listInstallSchedules,
}))

vi.mock("@/lib/repositories/crm-tasks", () => ({
  listCrmTasks: mocks.listCrmTasks,
}))

import {
  fetchCsInquiryDashboard,
  CS_CATEGORY_MAP,
} from "@/lib/cs/inquiry-dashboard"

function mockConversation(overrides: Partial<ChannelConversationRecord>): ChannelConversationRecord {
  return {
    id: "conv-1",
    userChatId: "conv-1",
    state: "opened",
    tags: ["billing"],
    messageCount: 1,
    firstQuestion: "결제 영수증 어떻게 발급받나요?",
    firstAskedAt: "2026-10-14T02:00:00.000Z",
    lastMessageAt: "2026-10-14T02:00:00.000Z",
    syncedAt: "2026-10-14T02:05:00.000Z",
    transcript: [],
    ...overrides,
  }
}

function mockLead(overrides: Partial<LeadRecord>): LeadRecord {
  return {
    id: "lead-1",
    source: "contact_page",
    name: "홍길동",
    org: "서울학원",
    phone: "010-1234-5678",
    email: "test@example.com",
    message: "도입 견적 및 가격 문의드립니다.",
    status: "new",
    timestamp: "2026-10-14T01:00:00.000Z",
    ...overrides,
  }
}

describe("CS Inquiry Dashboard Service (fetchCsInquiryDashboard)", () => {
  beforeEach(() => {
    mocks.listDurableConversations.mockReset()
    mocks.getConversations.mockReset()
    mocks.getLeads.mockReset()
    mocks.getChatbotStats.mockReset()
    mocks.isChannelApiConfigured.mockReset()
    mocks.listShowroomBookings.mockReset()
    mocks.listInstallSchedules.mockReset()
    mocks.listCrmTasks.mockReset()

    mocks.isChannelApiConfigured.mockReturnValue(true)
    mocks.listShowroomBookings.mockResolvedValue([])
    mocks.listInstallSchedules.mockResolvedValue([])
    mocks.listCrmTasks.mockResolvedValue({ rows: [], summary: { total: 0 } })
    mocks.getChatbotStats.mockResolvedValue({
      totals: {
        questionCount: 10,
        unresolvedCount: 2,
        handoffCount: 3,
        directAnswerCount: 5,
      },
      latency: { avgMs: 1200 },
      categories: {
        billing: 4,
        classroom: 6,
      },
      topQuestions: [
        {
          canonicalQuestion: "다시보기 녹화본은 어디서 확인하나요?",
          clusterId: "cluster-1",
          questionCount: 8,
          sampleQuestions: ["다시보기 어디서 보나요?"],
        },
      ],
    })
  })

  it("calculates total inquiries, resolution rate and period metrics correctly", async () => {
    // Current time: 2026-10-14 14:00:00 KST (05:00:00 UTC)
    const fixedNow = new Date("2026-10-14T05:00:00.000Z")

    mocks.listDurableConversations.mockResolvedValue([
      // 1 resolved Channel Talk
      mockConversation({
        id: "ct-1",
        state: "closed",
        firstAskedAt: "2026-10-14T02:00:00.000Z",
        lastMessageAt: "2026-10-14T02:30:00.000Z",
      }),
      // 1 unanswered Channel Talk
      mockConversation({
        id: "ct-2",
        state: "opened",
        messageCount: 1,
        firstAskedAt: "2026-10-14T01:00:00.000Z",
        lastMessageAt: "2026-10-14T01:00:00.000Z",
      }),
    ])

    mocks.getLeads.mockResolvedValue([
      // 1 new (unanswered) lead
      mockLead({
        id: "lead-1",
        status: "new",
        timestamp: "2026-10-14T02:00:00.000Z",
      }),
      // 1 converted (resolved) lead
      mockLead({
        id: "lead-2",
        status: "converted",
        timestamp: "2026-10-14T01:30:00.000Z",
      }),
    ])

    const result = await fetchCsInquiryDashboard({ period: "7d", now: fixedNow })

    expect(result.period).toBe("7d")
    // Total inquiries: 2 chats + 2 leads + 10 chatbot = 14
    expect(result.kpis.totalInquiries).toBe(14)
    // Resolved: 1 closed chat + 1 converted lead + 5 direct answers = 7
    expect(result.kpis.resolvedCount).toBe(7)
    // Unanswered: 1 opened chat + 1 new lead + 2 chatbot unresolved = 4
    expect(result.kpis.unansweredCount).toBe(4)
    // Resolution rate: (7 / 14) * 100 = 50%
    expect(result.kpis.resolutionRate).toBe(50)
  })

  it("categorizes inquiries into appropriate genres with labels and colors", async () => {
    const fixedNow = new Date("2026-10-14T05:00:00.000Z")

    mocks.listDurableConversations.mockResolvedValue([
      mockConversation({
        id: "ct-billing",
        firstQuestion: "결제 카드 변경 및 영수증 발행 요청",
      }),
      mockConversation({
        id: "ct-hw",
        firstQuestion: "전자칠판 터치 센서 하드웨어 연결 오류",
        tags: ["hardware"],
      }),
    ])

    mocks.getLeads.mockResolvedValue([
      mockLead({
        id: "lead-class",
        message: "수업 중 학생 과제 제출 및 다시보기 기능 문의",
      }),
    ])

    const result = await fetchCsInquiryDashboard({ period: "7d", now: fixedNow })

    expect(result.genres.length).toBeGreaterThan(0)
    const billingGenre = result.genres.find((g) => g.category === "billing")
    expect(billingGenre).toBeDefined()
    expect(billingGenre?.label).toBe("결제·요금")
    expect(billingGenre?.count).toBeGreaterThan(0)

    const hardwareGenre = result.genres.find((g) => g.category === "hardware")
    expect(hardwareGenre).toBeDefined()
    expect(hardwareGenre?.label).toBe("하드웨어")
  })

  it("extracts unanswered inquiries with accurate wait time and urgency", async () => {
    // Current time: 2026-10-14 12:00:00 UTC
    const fixedNow = new Date("2026-10-14T12:00:00.000Z")

    mocks.listDurableConversations.mockResolvedValue([
      // Critical: 26 hours old
      mockConversation({
        id: "ct-urgent",
        state: "opened",
        messageCount: 1,
        firstAskedAt: "2026-10-13T10:00:00.000Z",
        lastMessageAt: "2026-10-13T10:00:00.000Z",
        name: "김철수",
      }),
      // Normal: 30 minutes old
      mockConversation({
        id: "ct-recent",
        state: "opened",
        messageCount: 1,
        firstAskedAt: "2026-10-14T11:30:00.000Z",
        lastMessageAt: "2026-10-14T11:30:00.000Z",
        name: "이영희",
      }),
    ])

    mocks.getLeads.mockResolvedValue([
      // Warning: 4 hours old
      mockLead({
        id: "lead-warn",
        status: "new",
        timestamp: "2026-10-14T08:00:00.000Z",
        name: "박지성",
      }),
    ])

    const result = await fetchCsInquiryDashboard({ period: "7d", now: fixedNow })

    expect(result.unansweredInquiries.length).toBe(3)

    const criticalInquiry = result.unansweredInquiries.find((i) => i.customerName === "김철수")
    expect(criticalInquiry?.urgency).toBe("critical")
    expect(criticalInquiry?.waitingMinutes).toBeGreaterThan(1400)

    const warningInquiry = result.unansweredInquiries.find((i) => i.customerName === "박지성")
    expect(warningInquiry?.urgency).toBe("warning")

    const normalInquiry = result.unansweredInquiries.find((i) => i.customerName === "이영희")
    expect(normalInquiry?.urgency).toBe("normal")
  })

  it("reports connection status for Channel Talk and Homepage", async () => {
    mocks.listDurableConversations.mockResolvedValue([])
    mocks.getLeads.mockResolvedValue([])
    mocks.isChannelApiConfigured.mockReturnValue(true)

    const result = await fetchCsInquiryDashboard({ period: "7d" })

    expect(result.connections.channelTalk).toBeDefined()
    expect(result.connections.homepage).toBeDefined()
    expect(result.connections.channelTalk.configured).toBe(true)
    expect(result.connections.homepage.formConfigured).toBe(true)
  })

  it("accurately aggregates and prioritizes upcoming tasks (leads, showroom, installs, and FAQ enhancement)", async () => {
    // Current time: 2026-10-14 05:00:00 UTC (14:00 KST)
    const fixedNow = new Date("2026-10-14T05:00:00.000Z")

    mocks.listDurableConversations.mockResolvedValue([])
    mocks.getLeads.mockResolvedValue([
      // Lead created 3 hours ago -> needs customer follow-up task
      mockLead({
        id: "lead-fup",
        status: "new",
        timestamp: "2026-10-14T02:00:00.000Z",
        name: "강감찬",
        org: "고려학원",
        follow_up_at: "2026-10-15T15:00:00+09:00",
      }),
    ])

    mocks.listShowroomBookings.mockResolvedValue([
      {
        id: "sr-100",
        name: "이순신",
        org: "해군사관아카데미",
        visitDate: "2026-10-15",
        visitTime: "14:00",
        durationMinutes: 60,
        status: "confirmed",
        interests: ["전자칠판 86인치"],
        assignedTo: "담당자A",
      },
    ])

    mocks.listInstallSchedules.mockResolvedValue([
      {
        id: "inst-200",
        scheduled_date: "2026-10-16",
        status: "confirmed",
        quote_item: { product_name: "Classin Board 86", quantity: 2 },
        team: { name: "설치 1팀" },
      },
    ])

    mocks.listCrmTasks.mockResolvedValue({
      rows: [
        {
          id: "crm-1",
          taskType: "cs_checkin",
          title: "수업 음성 끊김 이슈 후속 확인",
          dueAt: "2026-10-14T09:00:00.000Z", // today
          priority: "high",
          targetLabel: "대치수학",
          ownerNameSnapshot: "CS팀장",
        },
      ],
      summary: { total: 1 },
    })

    const result = await fetchCsInquiryDashboard({ period: "7d", now: fixedNow })

    expect(result.upcomingTasks.length).toBeGreaterThanOrEqual(4)

    // Check Showroom task
    const showroomTask = result.upcomingTasks.find((t) => t.type === "showroom")
    expect(showroomTask).toBeDefined()
    expect(showroomTask?.customerName).toBe("이순신")
    expect(showroomTask?.dDay).toBe("D-1 내일")

    // Check Install task
    const installTask = result.upcomingTasks.find((t) => t.type === "install")
    expect(installTask).toBeDefined()
    expect(installTask?.title).toContain("Classin Board 86")
    expect(installTask?.dDay).toBe("D-2")

    // Check Lead follow-up task
    const followUpTask = result.upcomingTasks.find((t) => t.type === "follow_up")
    expect(followUpTask).toBeDefined()
    expect(followUpTask?.customerName).toBe("강감찬")

    // Check CRM task
    const crmTask = result.upcomingTasks.find((t) => t.type === "crm_task")
    expect(crmTask).toBeDefined()
    expect(crmTask?.title).toContain("수업 음성 끊김 이슈")
  })
})
