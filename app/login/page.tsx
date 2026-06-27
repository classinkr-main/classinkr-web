import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PublicLoginPanel } from "@/components/auth/PublicLoginPanel"
import { getPublicUserContext } from "@/lib/auth/public-user"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "로그인",
  description: "심화·프리미엄 자료 열람을 위한 공개 사용자 로그인",
  robots: { index: false, follow: false },
}

interface LoginPageProps {
  searchParams?: Promise<{ next?: string | string[] }>
}

/**
 * 외부 리다이렉트를 막기 위해 앱 내부 경로만 허용한다.
 * `//host` 같은 프로토콜-상대 URL과 빈 값은 기본 경로로 떨어뜨린다.
 */
function sanitizeNext(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/account"
  return raw
}

const RETURN_LABELS: Record<string, string> = {
  "/account": "내 계정",
  "/resources": "자료실",
}

function resolveReturnLabel(next: string): string | undefined {
  if (RETURN_LABELS[next]) return RETURN_LABELS[next]
  if (next.startsWith("/resources/")) return "자료 상세"
  if (next.startsWith("/account")) return "내 계정"
  return undefined
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const next = sanitizeNext(params?.next)

  // 이미 로그인한 사용자는 로그인 화면을 거치지 않고 바로 복귀시킨다.
  const context = await getPublicUserContext()
  if (context) {
    redirect(next)
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <section className="px-4 pb-20 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[1000px]">
          <PublicLoginPanel nextPath={next} returnLabel={resolveReturnLabel(next)} />
        </div>
      </section>
    </div>
  )
}
