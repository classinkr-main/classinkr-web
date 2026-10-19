import type { Metadata } from "next"

import CsInquiryDashboard from "@/components/admin/cs/CsInquiryDashboard"
import CsConsoleNav from "@/components/admin/cs/CsConsoleNav"

export const metadata: Metadata = {
  title: "CS 문의 대시보드 | Classin Admin",
  robots: { index: false, follow: false },
}

export default function AdminCsInquiriesPage() {
  return (
    <>
      <CsConsoleNav />
      <CsInquiryDashboard />
    </>
  )
}
