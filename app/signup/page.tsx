import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { SignupPanel } from "@/components/auth/SignupPanel"
import { getPublicUserContext } from "@/lib/auth/public-user"
import { sanitizeNextPath } from "@/lib/auth/next-path"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "회원가입",
  description: "이메일로 가입하고 심화·프리미엄 자료를 받아보세요.",
  robots: { index: false, follow: false },
}

interface SignupPageProps {
  searchParams?: Promise<{ next?: string | string[] }>
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams
  const next = sanitizeNextPath(params?.next)

  const context = await getPublicUserContext()
  if (context) {
    redirect(next)
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <section className="px-4 pb-20 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[480px]">
          <SignupPanel nextPath={next} />
        </div>
      </section>
    </div>
  )
}
