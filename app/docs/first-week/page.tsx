import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { getDocsContent } from "@/lib/docs-content"
import { DocsCompactRow } from "@/components/docs/DocsListRow"

import { getAllDocsSummaries, getTroubleshootingLinks } from "../_utils"

export const metadata: Metadata = {
  title: "첫 7일 수업 준비 가이드",
  description: "관리자와 강사가 클래스인을 설치하고 첫 수업과 다시보기까지 확인하는 순서입니다.",
  alternates: { canonical: "/docs/first-week" },
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

// 첫 주에 자주 막히는 순서 — 로그인, 수업 접속, 장치, 녹화.
const HELP_TROUBLESHOOTING_ORDER = [
  "/docs/start/login-troubleshooting",
  "/docs/start/class-connection-troubleshooting",
  "/docs/start/camera-mic-troubleshooting",
  "/docs/teacher/recording-troubleshooting",
]
const HELP_TROUBLESHOOTING_LIMIT = 4

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"

export default async function FirstWeekGuidePage() {
  const docsContent = await getDocsContent()
  // 공개 목록에 있는 문서만 잇는다. 단계별 이름은 이 순서에 맞게 다시 쓰고, 읽는 시간·사진 수는 실제 문서에서 가져온다.
  const docsByHref = new Map(getAllDocsSummaries(docsContent).map((doc) => [doc.href, doc]))
  const helpLinks = getTroubleshootingLinks(docsContent, HELP_TROUBLESHOOTING_ORDER)

  return (
    <div className="min-h-screen bg-[#FAFAF8] pb-20 pt-28 text-[#111110] md:pb-24 md:pt-36">
      <div className="container mx-auto max-w-[1080px] px-5">
        <Link
          href="/docs"
          className={`inline-flex items-center gap-2 rounded-[6px] text-sm font-medium text-[#615D59] transition-colors duration-150 hover:text-[#084734] ${FOCUS_RING}`}
        >
          <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
          가이드 홈으로 돌아가기
        </Link>
        <p className="mt-8 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#084734]">
          첫 수업 준비
        </p>
        <h1 className="mt-4 max-w-3xl break-keep text-4xl font-black leading-[1.08] tracking-display md:text-6xl">
          첫 7일, 수업을 시작하는 순서
        </h1>
        <p className="mt-5 max-w-2xl break-keep text-lg leading-8 text-[#615D59]">
          관리자와 강사가 필요한 준비를 나누어 확인하고, 첫 수업과 다시보기까지 이어갑니다.
          일정은 학원의 상황에 맞게 조정하세요. 기능과 접근 권한은 계정과 설정에 따라 다를 수 있습니다.
        </p>

        <ol className="mt-12 md:mt-16">
          {stages.map((stage) => {
            const stageDocs = stage.links.flatMap((link) => {
              const doc = docsByHref.get(link.href)
              return doc ? [{ ...doc, title: link.label }] : []
            })

            return (
              <li
                key={stage.day}
                className="grid gap-6 border-t border-black/[0.08] py-10 md:grid-cols-2 md:gap-12"
              >
                <div>
                  <p className="text-[12px] font-semibold tabular-nums tracking-[0.12em] text-[#084734]">
                    {stage.day}
                  </p>
                  <h2 className="mt-3 break-keep text-xl font-bold sm:text-2xl">{stage.title}</h2>
                  <dl className="mt-5 grid gap-4 text-[14px] leading-6 sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-[#111110]">관리자</dt>
                      <dd className="mt-1 text-[#31302E]">{stage.admin}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-[#111110]">강사</dt>
                      <dd className="mt-1 text-[#31302E]">{stage.teacher}</dd>
                    </div>
                  </dl>
                </div>
                {stageDocs.length > 0 ? (
                  <ul className="-mt-4 md:mt-[-14px]" aria-label={`${stage.day} 가이드`}>
                    {stageDocs.map((doc) => (
                      <DocsCompactRow
                        key={doc.href}
                        article={doc}
                        showDate={false}
                        meta={["readTime", "images"]}
                      />
                    ))}
                  </ul>
                ) : (
                  <Link
                    href="/docs"
                    className={`self-start text-sm font-semibold text-[#084734] underline underline-offset-4 ${FOCUS_RING}`}
                  >
                    전체 가이드에서 찾아보기
                  </Link>
                )}
              </li>
            )
          })}
        </ol>

        <section
          className="border-t border-black/[0.08] pt-10"
          aria-labelledby="first-week-help"
        >
          <div className="grid gap-6 md:grid-cols-2 md:gap-12">
            <div>
              <h2 id="first-week-help" className="break-keep text-xl font-bold sm:text-2xl">
                진행 중에 막히셨나요?
              </h2>
              <p className="mt-3 text-[14px] leading-6 text-[#615D59]">
                증상별로 먼저 해 볼 것을 화면과 함께 담았습니다. 그래도 풀리지 않으면 상황을 남겨 주세요.
                담당 매니저가 연락드립니다.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-[14px] font-semibold text-[#084734]">
                <Link
                  href="/docs#troubleshooting"
                  className={`inline-flex items-center gap-1 ${FOCUS_RING}`}
                >
                  증상별 해결 모두 보기
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
                <Link href="/contact" className={`inline-flex items-center gap-1 ${FOCUS_RING}`}>
                  도움 요청하기
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </div>
            {helpLinks.length > 0 ? (
              <ul className="-mt-4 md:mt-[-14px]" aria-label="자주 막히는 증상">
                {helpLinks.slice(0, HELP_TROUBLESHOOTING_LIMIT).map((link) => (
                  <DocsCompactRow
                    key={link.href}
                    article={link.summary}
                    showDate={false}
                    meta={["category", "images"]}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
