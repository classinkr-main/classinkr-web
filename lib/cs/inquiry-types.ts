import type { ChatbotCategory } from "@/lib/chatbot/classification"
export type { ChatbotCategory }

export type CsDashboardPeriod = "today" | "7d" | "30d" | "90d" | "all"

export interface CsCategoryInfo {
  category: ChatbotCategory
  label: string
  count: number
  percentage: number
  color: string
}

export interface CsChannelInfo {
  channel: "channel_talk" | "homepage" | "chatbot" | "call_log"
  label: string
  count: number
  percentage: number
  color: string
}

export interface CsTrendBucket {
  date: string
  label: string
  total: number
  resolved: number
  unanswered: number
  channelTalk: number
  homepage: number
  chatbot: number
  callLog?: number
}

export interface CsFrequentIssue {
  id: string
  title: string
  category: ChatbotCategory
  categoryLabel: string
  count: number
  lastAskedAt: string | null
  sampleQuestions: string[]
  source: "channel_talk" | "chatbot" | "homepage" | "call_log"
  sourceLabel: string
}

export interface CsUnansweredInquiry {
  id: string
  channel: "channel_talk" | "homepage" | "chatbot" | "call_log"
  channelLabel: string
  customerName: string
  customerOrg?: string
  customerContact?: string
  inquiryText: string
  category: ChatbotCategory
  categoryLabel: string
  createdAt: string
  waitingMinutes: number
  urgency: "normal" | "warning" | "critical"
  targetUrl: string
}

export interface CsConnectionStatus {
  channelTalk: {
    status: "connected" | "warning" | "error"
    configured: boolean
    hasPluginKey: boolean
    hasApiKey: boolean
    hasWebhook: boolean
    lastSyncedAt: string | null
    totalCount: number
    syncIntervalLabel?: string
  }
  homepage: {
    status: "connected" | "warning" | "error"
    dbConnected: boolean
    formConfigured: boolean
    smsConfigured: boolean
    lastInquiryAt: string | null
    totalCount: number
  }
  callLog?: {
    status: "connected" | "warning" | "error"
    activeToday: boolean
    todayCount: number
    lastLoggedAt: string | null
    totalCount: number
  }
  knowledgeBase?: {
    status: "connected" | "warning" | "error"
    figmaGuidesCount: number
    markdownDocsCount: number
    lastIndexedAt: string | null
    isSynced: boolean
  }
}

export interface CsUpcomingTask {
  id: string
  type: "follow_up" | "showroom" | "install" | "crm_task" | "guide_doc"
  typeLabel: string
  title: string
  description?: string
  scheduledAt: string
  scheduledDate: string
  scheduledTime?: string
  dDay: string
  urgency: "urgent" | "today" | "upcoming"
  customerName?: string
  customerOrg?: string
  ownerName?: string
  priority?: "urgent" | "high" | "normal" | "low"
  targetUrl: string
  targetUrlLabel: string
}

export interface CsInquiryDashboardData {
  period: CsDashboardPeriod
  dateRange: {
    from: string
    to: string
  }
  kpis: {
    totalInquiries: number
    unansweredCount: number
    resolvedCount: number
    inProgressCount: number
    resolutionRate: number // 0 ~ 100 (%)
    avgResponseHours: number | null
    prevPeriodDiff: {
      totalPercent: number
      resolutionRateDiff: number
    }
  }
  connections: CsConnectionStatus
  trends: CsTrendBucket[]
  genres: CsCategoryInfo[]
  channels: CsChannelInfo[]
  frequentIssues: CsFrequentIssue[]
  unansweredInquiries: CsUnansweredInquiry[]
  upcomingTasks: CsUpcomingTask[]
}

export const CS_CATEGORY_MAP: Record<
  ChatbotCategory,
  { label: string; color: string; desc: string }
> = {
  billing: { label: "결제·요금", color: "#3B82F6", desc: "가격, 견적, 세금계산서, 환불, 결제 오류" },
  hardware: { label: "하드웨어", color: "#F59E0B", desc: "전자칠판, 마이크, 카메라, 기기 연결" },
  troubleshooting: { label: "장애·오류", color: "#EF4444", desc: "녹화 중단, 접속 불가, 재생 오류, 버그" },
  classroom: { label: "수업·운영", color: "#10B981", desc: "수업 진행, 다시보기, 코스 가입, 출석, 과제" },
  onboarding: { label: "도입·온보딩", color: "#06B6D4", desc: "도입 문의, 무료 체험, 데모 신청, 초기 설정" },
  admin: { label: "계정·관리자", color: "#8B5CF6", desc: "로그인, 권한, 기관 설정, 비밀번호 재설정" },
  consultation: { label: "상담·문의", color: "#0EA5E9", desc: "활용법 컨설팅, 기능 한도 안내, 일반 문의" },
  general: { label: "일반", color: "#64748B", desc: "인사말, 기타 일반 문의" },
}
