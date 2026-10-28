import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { getDocPath } from "@/lib/docs"
import { getDocsContent } from "@/lib/docs-content"

export const metadata: Metadata = {
  title: "첫 7일 수업 준비 가이드",
  description: "관리자와 강사가 클래스인을 설치하고 첫 수업과 다시보기까지 확인하는 순서입니다.",
}

const stages = [
  {
    day: "DAY 1",
    title: "설치하고 계정을 확인합니다",
    admin: "기관 설정과 사용할 계정을 확인합니다.",
    teacher: "사용할 기기에 설치하고 로그인합니다.",
    links: [
      { href: "/docs/start/pc-install", label: "PC 설치 가이드" },
      { href: "/docs/start/mobile-install", label: "모바일 설치 가이드" },
      { href: "/docs/admin/institution-settings", label: "기관 설정 가이드" },
    ],
  },
  {
    day: "DAY 2–3",
    title: "사람과 수업을 준비합니다",
    admin: "강사와 학생을 추가하고 코스를 준비합니다.",
    teacher: "수업에 필요한 자료와 교실 설정을 확인합니다.",
    links: [
      { href: "/docs/admin/teacher-onboarding", label: "교사 추가하기" },
      { href: "/docs/admin/student-onboarding", label: "학생 추가하기" },
      { href: "/docs/admin/course-creation", label: "코스와 수업 개설하기" },
      { href: "/docs/teacher/classroom-basic-setup", label: "교실 기본 설정" },
    ],
  },
  {
    day: "DAY 4–5",
    title: "첫 수업을 진행합니다",
    admin: "수업을 확인할 담당자와 연락 방법을 정합니다.",
    teacher: "준비한 교실에서 수업을 시작하고 필요한 도구를 확인합니다.",
    links: [
      { href: "/docs/teacher/classroom-basic-setup", label: "교실 기본 설정 확인하기" },
      { href: "/docs/student/course-join", label: "학생 코스 참여 안내" },
    ],
  },
  {
    day: "DAY 6–7",
    title: "녹화와 다시보기를 확인합니다",
    admin: "녹화와 다시보기에 접근할 수 있는 계정과 설정을 확인합니다.",
    teacher: "수업 후 다시보기 안내가 필요한 학생에게 확인 방법을 알려줍니다.",
    links: [
      { href: "/docs/admin/web-live-playback", label: "관리자의 라이브와 다시보기" },
      { href: "/docs/student/class-join-replay", label: "학생 수업 참여와 다시보기" },
    ],
  },
] as const

export default async function FirstWeekGuidePage() {
  const { docs } = await getDocsContent()
  const publicPaths = new Set(
    docs.filter((doc) => (doc.visibility ?? "public") === "public" && !doc.noindex).map(getDocPath)
  )

  return (
    <main className="min-h-screen bg-white pb-20 pt-28 text-[#111110] md:pb-24 md:pt-36">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <Link href="/docs" className="text-sm font-medium text-[#084734] underline underline-offset-4">
          전체 가이드로 돌아가기
        </Link>
        <p className="mt-8 text-xs font-semibold tracking-[0.14em] text-[#084734]">첫 수업 준비</p>
        <h1 className="mt-4 max-w-3xl break-keep text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
          첫 7일, 수업을 시작하는 순서
        </h1>
        <p className="mt-5 max-w-2xl break-keep text-base leading-7 text-[#615D59]">
          관리자와 강사가 필요한 준비를 나누어 확인하고, 첫 수업과 다시보기까지 이어갑니다.
          일정은 학원의 상황에 맞게 조정하세요. 기능과 접근 권한은 계정과 설정에 따라 다를 수 있습니다.
        </p>

        <ol className="mt-12 space-y-5">
          {stages.map((stage) => {
            const availableLinks = stage.links.filter((link) => publicPaths.has(link.href))
            return (
              <li key={stage.day} className="rounded-[14px] border border-black/[0.08] bg-[#F6F5F4] p-6 sm:p-8">
                <p className="text-xs font-semibold tracking-[0.12em] text-[#084734]">{stage.day}</p>
                <h2 className="mt-3 break-keep text-xl font-bold sm:text-2xl">{stage.title}</h2>
                <dl className="mt-5 grid gap-4 text-sm leading-6 text-[#31302E] sm:grid-cols-2">
                  <div><dt className="font-bold">관리자</dt><dd className="mt-1">{stage.admin}</dd></div>
                  <div><dt className="font-bold">강사</dt><dd className="mt-1">{stage.teacher}</dd></div>
                </dl>
                {availableLinks.length > 0 ? (
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {availableLinks.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href} className="inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-[#084734] hover:bg-[#ECFDF5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]">
                          {link.label}<ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Link href="/docs" className="mt-5 inline-block text-sm font-semibold text-[#084734] underline underline-offset-4">전체 가이드에서 찾아보기</Link>
                )}
              </li>
            )
          })}
        </ol>

        <section className="mt-12 border-t border-black/[0.08] pt-8" aria-labelledby="first-week-help">
          <h2 id="first-week-help" className="text-2xl font-bold">진행 중에 막히셨나요?</h2>
          <p className="mt-3 text-sm leading-6 text-[#615D59]">문제가 생긴 화면과 상황을 확인한 뒤 관련 가이드를 보거나 도움을 요청하세요.</p>
          <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-[#084734]">
            {publicPaths.has("/docs/start/login-troubleshooting") && <Link href="/docs/start/login-troubleshooting" className="underline underline-offset-4">로그인이 안 될 때</Link>}
            {publicPaths.has("/docs/start/class-connection-troubleshooting") && <Link href="/docs/start/class-connection-troubleshooting" className="underline underline-offset-4">수업이 끊기거나 튕길 때</Link>}
            <Link href="/contact" className="underline underline-offset-4">도움 요청하기</Link>
          </div>
        </section>
      </div>
    </main>
  )
}
