import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, FileText, Film, LinkIcon, LockKeyhole, Newspaper } from "lucide-react"

import { listPublishedPremiumContent } from "@/lib/premium/content"
import type { PremiumContentType } from "@/lib/premium/types"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "프리미엄 콘텐츠",
  description: "로그인 후 권한이 확인된 회원이 열람할 수 있는 심화·프리미엄 콘텐츠",
  robots: { index: false, follow: false },
}

const CONTENT_TYPE_META: Record<PremiumContentType, { label: string; Icon: typeof FileText }> = {
  article: { label: "아티클", Icon: Newspaper },
  video: { label: "영상", Icon: Film },
  file: { label: "파일", Icon: FileText },
  link: { label: "외부 링크", Icon: LinkIcon },
}

export default async function PremiumHubPage() {
  const items = await listPublishedPremiumContent()

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <section className="px-4 pb-20 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[1120px]">
          <div className="border border-black/[0.08] bg-[#ECFDF5] p-6 md:p-10">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-[#084734]">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-5 text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/70">
              Premium
            </p>
            <h1 className="mt-2 text-[1.85rem] font-bold leading-[1.12] tracking-[-0.03em] text-[#111110] md:text-[2.4rem]">
              프리미엄 콘텐츠
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#31302E]">
              심화 운영 자료와 사례 분석은 로그인 후 권한이 확인된 회원에게만 공개됩니다.
              각 콘텐츠를 열면 로그인 여부와 접근 권한을 확인합니다.
            </p>
          </div>

          <div className="mt-8">
            <div className="mb-5 flex items-end justify-between gap-4">
              <h2 className="text-2xl font-bold tracking-[-0.03em] text-[#111110]">공개된 콘텐츠</h2>
              <p className="text-sm text-[#615D59]">{items.length}개</p>
            </div>

            {items.length === 0 ? (
              <p className="border border-black/[0.08] bg-white p-6 text-sm leading-7 text-[#615D59]">
                아직 공개된 프리미엄 콘텐츠가 없습니다. 준비되는 대로 이곳에서 안내해 드립니다.
                지금 바로 필요한 자료는 <Link href="/resources?tier=advanced" className="font-semibold text-[#084734] underline">심화 자료실</Link>에서 확인하실 수 있습니다.
              </p>
            ) : (
              <div className="grid gap-3">
                {items.map((item) => {
                  const meta = CONTENT_TYPE_META[item.content_type]
                  const Icon = meta.Icon
                  return (
                    <Link
                      key={item.slug}
                      href={`/premium/${item.slug}`}
                      prefetch={false}
                      className="group flex items-start gap-4 border border-black/[0.08] bg-white p-5 transition-colors hover:border-[#084734]/25"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#ECFDF5] text-[#084734]">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold text-[#084734]/70">
                          <span>{meta.label}</span>
                          <span className="text-[#A39E98]">·</span>
                          <span className="inline-flex items-center gap-1 text-[#A39E98]">
                            <LockKeyhole className="h-3 w-3" /> 로그인 필요
                          </span>
                        </span>
                        <span className="mt-1 block text-[16px] font-bold text-[#111110] group-hover:text-[#084734]">
                          {item.title}
                        </span>
                        {item.summary ? (
                          <span className="mt-1 block text-[14px] leading-6 text-[#615D59]">
                            {item.summary}
                          </span>
                        ) : null}
                      </span>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#084734] opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
