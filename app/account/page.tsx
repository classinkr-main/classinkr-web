import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Download } from "lucide-react"

import { MarketingConsentToggle } from "@/components/account/MarketingConsentToggle"
import { AccountLogoutButton } from "@/components/account/AccountLogoutButton"
import { getPublicUserContext } from "@/lib/auth/public-user"
import { getMaterialDownloadsByUser } from "@/lib/repositories/account-downloads"
import { getLeadMagnetTitleFromStore } from "@/lib/repositories/lead-magnets"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "내 계정",
  robots: { index: false, follow: false },
}

export default async function AccountPage() {
  const context = await getPublicUserContext()
  if (!context) {
    redirect("/login?next=/account")
  }

  const downloads = await getMaterialDownloadsByUser(context.user.id)
  const items = await Promise.all(
    downloads.map(async (download) => ({
      ...download,
      title: (await getLeadMagnetTitleFromStore(download.slug)) || download.slug,
    }))
  )

  const displayName = context.profile.name?.trim() || "회원"
  const email = context.user.email ?? context.profile.email ?? null

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <section className="px-4 pb-16 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[840px]">
          <div className="flex flex-col gap-4 border border-black/[0.08] bg-white p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
                내 계정
              </p>
              <h1 className="mt-2 text-[1.6rem] font-bold tracking-[-0.03em] text-[#111110] md:text-[2rem]">
                {displayName} 님
              </h1>
              {email ? (
                <p className="mt-1 text-sm text-[#615D59]">{email}</p>
              ) : null}
            </div>
            <AccountLogoutButton />
          </div>

          <section className="mt-6 border border-black/[0.08] bg-white p-6 md:p-8">
            <h2 className="text-xl font-bold tracking-[-0.03em] text-[#111110]">
              받은 자료
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[#615D59]">
              로그인 시 받은 자료를 다시 내려받을 수 있습니다. 다운로드 링크는 보안을 위해 매번 새로 발급됩니다.
            </p>

            {items.length > 0 ? (
              <ul className="mt-6 divide-y divide-black/[0.08] border-y border-black/[0.08]">
                {items.map((item) => (
                  <li
                    key={item.slug}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold leading-6 text-[#111110]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#615D59]">
                        최근 다운로드 {new Date(item.lastDownloadedAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                    <a
                      href={`/api/materials/${item.slug}/download`}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
                    >
                      <Download className="h-4 w-4" />
                      다시 받기
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 border border-dashed border-black/[0.12] bg-[#FAFAF8] p-6 text-center text-sm text-[#615D59]">
                아직 받은 자료가 없습니다. 자료실에서 로그인 자료를 받아보세요.
              </p>
            )}
          </section>

          <section className="mt-6 border border-black/[0.08] bg-white p-6 md:p-8">
            <h2 className="text-xl font-bold tracking-[-0.03em] text-[#111110]">
              마케팅 수신 설정
            </h2>
            <div className="mt-4">
              <MarketingConsentToggle />
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
