import type { Metadata } from "next"

import CsInquiryDashboard from "@/components/admin/cs/CsInquiryDashboard"
import CsConsoleNav from "@/components/admin/cs/CsConsoleNav"

// CS 문의 통합 대시보드 — CS 콘솔 외부 축의 첫 화면.
// 기간별·장르별·해결율·최신 자주 오는 문제·답변 안된 내역·채널톡 및 홈페이지 연결 상태를 종합 대시보드로 제공한다.
export const metadata: Metadata = {
  title: "CS 문의 대시보드 | Classin Admin",
  robots: { index: false, follow: false },
}

export default function AdminChatbotPage() {
  return (
    <>
      {/* 콘솔 내비는 페이지 최상단 풀블리드 */}
      <CsConsoleNav />
      <CsInquiryDashboard />
    </>
  )
}
