import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { ArrowRight, ExternalLink, Film, LockKeyhole } from "lucide-react"

import { PremiumDownloadButton } from "@/components/premium/PremiumDownloadButton"
import { PremiumLoginGate } from "@/components/premium/PremiumLoginGate"
import { authorizePremiumContentAccess } from "@/lib/premium/authorize"
import { getPremiumContentBySlug } from "@/lib/premium/content"

export const dynamic = "force-dynamic"

interface PremiumDetailPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PremiumDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const content = await getPremiumContentBySlug(slug)
  if (!content || content.status !== "published") {
    return { title: "프리미엄 콘텐츠", robots: { index: false, follow: false } }
  }
  return {
    title: `${content.title} | 프리미엄 콘텐츠`,
    description: content.summary ?? undefined,
    robots: { index: false, follow: false },
  }
}

function PremiumShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <section className="px-4 pb-20 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[920px]">
          <Link
            href="/premium"
            className="mb-8 inline-flex items-center gap-2 text-sm text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            프리미엄 콘텐츠로 돌아가기
          </Link>
          {children}
        </div>
      </section>
    </div>
  )
}

export default async function PremiumDetailPage({ params }: PremiumDetailPageProps) {
  const { slug } = await params
  const headerList = await headers()
  const access = await authorizePremiumContentAccess(slug, {
    page: `/premium/${encodeURIComponent(slug)}`,
    referrer: headerList.get("referer"),
    user_agent: headerList.get("user-agent"),
  })

  if (access.status === "not_found" || access.status === "unpublished") {
    notFound()
  }

  const { content } = access
  const nextPath = `/premium/${slug}`

  // 로그인 필요 — 게이트 노출
  if (access.status === "login_required") {
    return (
      <PremiumShell>
        <div className="mb-6">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">Premium</p>
          <h1 className="mt-2 text-[1.7rem] font-bold leading-tight tracking-[-0.03em] text-[#111110] md:text-[2.1rem]">
            {content.title}
          </h1>
          {content.summary ? (
            <p className="mt-3 text-[15px] leading-7 text-[#615D59]">{content.summary}</p>
          ) : null}
        </div>
        <PremiumLoginGate nextPath={nextPath} />
      </PremiumShell>
    )
  }

  // 로그인했지만 권한 없음
  if (access.status === "forbidden") {
    return (
      <PremiumShell>
        <div className="border border-black/[0.08] bg-white p-6 md:p-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F6F5F4] text-[#615D59]">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-[#111110]">접근 권한이 없습니다</h1>
          <p className="mt-2 text-sm leading-7 text-[#615D59]">
            로그인은 확인되었지만 <span className="font-semibold text-[#111110]">{content.title}</span> 에 대한
            프리미엄 권한이 없습니다. 권한이 필요하시면 담당자에게 문의해 주세요.
          </p>
          <Link
            href="/contact#contact-form"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-[#084734] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
          >
            권한 문의하기
          </Link>
        </div>
      </PremiumShell>
    )
  }

  // 접근 허용 — 콘텐츠 렌더
  return (
    <PremiumShell>
      <article className="border border-black/[0.08] bg-white p-6 md:p-10">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">Premium</p>
        <h1 className="mt-2 text-[1.85rem] font-bold leading-tight tracking-[-0.03em] text-[#111110] md:text-[2.4rem]">
          {content.title}
        </h1>
        {content.summary ? (
          <p className="mt-4 text-[16px] leading-8 text-[#31302E]">{content.summary}</p>
        ) : null}

        <div className="mt-8 border-t border-black/[0.08] pt-8">
          {content.content_type === "file" ? (
            <PremiumDownloadButton slug={content.slug} />
          ) : null}

          {content.content_type === "link" && content.external_url ? (
            <a
              href={content.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
            >
              콘텐츠 열기
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}

          {content.content_type === "video" ? (
            content.external_url ? (
              <a
                href={content.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
              >
                <Film className="h-4 w-4" />
                영상 보기
              </a>
            ) : (
              <p className="text-sm leading-7 text-[#615D59]">영상 링크가 아직 등록되지 않았습니다.</p>
            )
          ) : null}

          {content.content_type === "article" ? (
            <p className="text-sm leading-7 text-[#615D59]">
              본문은 위 요약을 참고하세요. 추가 자료가 필요하시면 담당자에게 문의해 주세요.
            </p>
          ) : null}
        </div>
      </article>
    </PremiumShell>
  )
}
