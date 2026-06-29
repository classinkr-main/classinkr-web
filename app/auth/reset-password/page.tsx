import type { Metadata } from "next"

import { ResetPasswordPanel } from "@/components/auth/ResetPasswordPanel"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "새 비밀번호 설정",
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <section className="px-4 pb-20 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[480px]">
          <ResetPasswordPanel />
        </div>
      </section>
    </div>
  )
}
