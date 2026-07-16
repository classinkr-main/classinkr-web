import { redirect } from "next/navigation"

// 챗봇 운영 대시보드는 문서 센터(/admin/docs)의 "보강 큐" 탭(DocsGapsPanel)으로 흡수되었습니다.
// 보강 큐 탭은 기존 챗봇 대시보드의 상위집합입니다 — 챗봇 질문 패턴 분석(질문·미해결·상담 연결·
// 응답 속도·피드백), 알파 준비도, 골든셋 품질 평가, 문서 없는 질문/결과 없는 검색어를 모두 포함합니다.
// 기존 북마크/링크 호환을 위해 해당 탭으로 리다이렉트합니다(2026-06-29 admin-ia-redesign §2-🟠3).
export default function AdminChatbotPage() {
  redirect("/admin/docs?tab=gaps")
}
