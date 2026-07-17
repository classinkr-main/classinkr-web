import type { Metadata } from "next"

import ExternalChatbotOpsDashboard from "@/components/admin/chatbot/ExternalChatbotOpsDashboard"

// 외부(공개) 챗봇 운영 대시보드 — 얇은 서버 페이지. 상세 분석·초안 생성·문서 없는 질문 목록 등은
// 여전히 문서 보강 큐(/admin/docs?tab=gaps)에 남아 있고, 이 화면은 요약 지표 + 알파 준비도 +
// 품질 평가 실행 + 그 상세 화면들로의 경로만 제공한다(docs/active/cs-tab-split-plan-2026-07-17.md Task X).
export const metadata: Metadata = {
  title: "챗봇 운영 | Classin Admin",
  robots: { index: false, follow: false },
}

export default function AdminChatbotPage() {
  return <ExternalChatbotOpsDashboard />
}
