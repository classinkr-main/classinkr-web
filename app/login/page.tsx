import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PublicLoginPanel } from "@/components/auth/PublicLoginPanel"
import { getPublicUserContext } from "@/lib/auth/public-user"
import { resolveReturnLabel, sanitizeNextPath } from "@/lib/auth/next-path"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "로그인",
  description: "심화·프리미엄 자료 열람을 위한 공개 사용자 로그인",
  robots: { index: false, follow: false },
}

interface LoginPageProps {
  searchParams?: Promise<{ next?: string | string[] }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const next = sanitizeNextPath(params?.next)

  // 이미 로그인한 사용자는 로그인 화면을 거치지 않고 바로 복귀시킨다.
  const context = await getPublicUserContext()
  if (context) {
    redirect(next)
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <section className="px-4 pb-20 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[480px]">
          <PublicLoginPanel nextPath={next} returnLabel={resolveReturnLabel(next)} />
        </div>
      </section>
    </div>
  )
}
