import type { Metadata } from "next"

import ExternalChatbotOpsDashboard from "@/components/admin/chatbot/ExternalChatbotOpsDashboard"
import CsConsoleNav from "@/components/admin/cs/CsConsoleNav"

// 외부(공개) 챗봇 운영 대시보드 — CS 콘솔 외부 축의 첫 화면.
// 정본: docs/active/cs-admin-console-ia-2026-07-27.md §2.
// 지표 6카드만 남은 순수 대시보드다. 알파 준비도·품질 평가는 AI 품질 검수
// (/admin/docs?tab=quality)로, 상세 분석·초안 생성·문서 없는 질문 목록은
// 미해결 큐(/admin/docs?tab=gaps)로 간다 — 둘 다 콘솔 가로 메뉴에 있다.
export const metadata: Metadata = {
  title: "챗봇 운영 | Classin Admin",
  robots: { index: false, follow: false },
}

export default function AdminChatbotPage() {
  return (
    <>
      {/* 콘솔 내비는 페이지 최상단 풀블리드 — 대시보드 본문(max-w-[1240px])과 기본 컨테이너가 같다. */}
      <CsConsoleNav />
      <ExternalChatbotOpsDashboard />
    </>
  )
}
