import Link from "next/link"
import {
  ArrowRight,
  CalendarClock,
  Clock,
  FileText,
  GraduationCap,
  MapPin,
  PenLine,
  Users,
  Video,
} from "lucide-react"

import { JsonLd } from "@/components/seo/JsonLd"
import { ShowroomBookingForm } from "@/components/showroom/ShowroomBookingForm"
import offices from "@/data/offices.json"
import { createBreadcrumbJsonLd, createWebPageJsonLd } from "@/lib/seo"
import { SHOWROOM_INTERESTS } from "@/lib/showroom/bookings"
import {
  SHOWROOM_MIN_LEAD_BUSINESS_DAYS,
  SHOWROOM_SLOT_DURATION_MINUTES,
  SHOWROOM_SLOT_TIMES,
} from "@/lib/showroom/slots"

/** 오시는 길 — 주소 정본은 data/offices.json 의 한국 본사(id: "seoul") 한 곳이다. */
const SEOUL_OFFICE = offices.find((office) => office.id === "seoul")
const SHOWROOM_ADDRESS = SEOUL_OFFICE?.address ?? ""
/** 지도 질의는 도로명까지만 쓴다 — 호수를 넣으면 핀이 엉뚱한 곳에 찍힌다. */
const SHOWROOM_MAP_QUERY = SHOWROOM_ADDRESS.split(",")[0]

/**
 * 쇼룸에서 확인하는 것 — 기능 목록이 아니라 한 수업이 흘러가는 순서다.
 * 네 장면을 따로 시연하지 않고 대표 수업 한 편을 그대로 돌린다는 게 이 자리의 성격이다.
 */
const LESSON_FLOW = [
  {
    icon: FileText,
    step: "01",
    title: "EDB 교안으로 수업을 연다",
    body:
      "강사가 파일을 찾아 헤매는 시간이 없습니다. 교안을 띄우면 그 자리에서 수업이 시작됩니다. 가져오신 자료를 그대로 올려 여는 것까지 함께 해봅니다.",
  },
  {
    icon: PenLine,
    step: "02",
    title: "전자칠판에 판서한다",
    body:
      "교안 위에 바로 씁니다. 지운 판서도 사라지지 않고 페이지로 남아, 수업이 끝난 뒤 다시 꺼낼 수 있습니다.",
  },
  {
    icon: Video,
    step: "03",
    title: "누르지 않아도 녹화된다",
    body:
      "녹화 버튼을 따로 챙기지 않습니다. 수업이 끝나는 순간 화면·음성·판서가 이미 한 편으로 정리돼 있습니다.",
  },
  {
    icon: GraduationCap,
    step: "04",
    title: "복습과 LMS로 이어진다",
    body:
      "결석생 보강, 학부모 확인, 다음 차시 준비가 모두 같은 기록에서 나옵니다. 강사가 따로 만들어 붙이는 일이 없습니다.",
  },
] as const

/** 준비물 — 근거: docs/active/classin-korea-positioning-guidelines.md §9 */
const PREPARATION_POINTS = [
  "PDF · PPT · 이미지 · 한글 문서 등 형식은 무엇이든 괜찮습니다.",
  "한 차시 분량이면 충분합니다. 전체 커리큘럼을 옮겨올 필요는 없습니다.",
  "USB · 이메일 · 메신저 어느 쪽으로 가져오셔도 현장에서 바로 엽니다.",
] as const

const VISIT_FACTS = [
  {
    icon: Clock,
    label: "상담 1회",
    value: `${SHOWROOM_SLOT_DURATION_MINUTES}분`,
    note: "대표 수업 한 편을 처음부터 끝까지 돌려보는 시간",
  },
  {
    icon: CalendarClock,
    label: "운영 시간",
    value: SHOWROOM_SLOT_TIMES.join(" · "),
    note: "평일만 운영하며 점심시간은 비워둡니다",
  },
  {
    icon: Users,
    label: "예약 방식",
    value: `최소 ${SHOWROOM_MIN_LEAD_BUSINESS_DAYS}영업일 전`,
    note: "담당자 배정과 자료 준비에 필요한 시간입니다",
  },
] as const

export default function ShowroomPage() {
  return (
    <main className="bg-[#FAFAF8]">
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/showroom",
            name: "목동 쇼룸 상담 예약",
            description:
              "목동 쇼룸에서 EDB 교안 · 판서 · 녹화 · 복습이 한 흐름으로 이어지는 실제 수업 운영을 확인하고, 원하는 날짜와 시간으로 60분 상담을 예약합니다.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "목동 쇼룸 상담 예약", path: "/showroom" },
          ]),
        ]}
      />

      {/* ── 히어로 ── */}
      <section className="bg-white pb-16 pt-32 md:pb-24 md:pt-40">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-3 py-1 text-[12px] font-semibold tracking-[0.125px] text-[#084734]">
                <MapPin className="h-3.5 w-3.5" />
                목동 쇼룸 · 서울 양천구
              </span>

              <h1 className="mt-5 text-[36px] font-bold leading-[1.05] tracking-[-1.5px] text-[#111110] md:text-[48px]">
                목동 쇼룸에서
                <br />
                실제 수업 흐름 보기
              </h1>

              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[#615D59] md:text-[20px]">
                기능을 하나씩 훑는 자리가 아닙니다. 교안을 열고, 판서하고, 그대로 녹화돼
                복습으로 넘어가는 한 시간을 처음부터 끝까지 그대로 봅니다.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href="#booking"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-7 text-[15px] font-semibold text-white transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
                >
                  방문 날짜 고르기
                  <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/resources/showroom-demo-readiness-kit"
                  className="inline-flex h-12 items-center justify-center rounded-[6px] border border-black/[0.08] bg-white px-6 text-[15px] font-semibold text-[#084734] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                >
                  데모 준비 킷 보기
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-black/[0.08] bg-[#F6F5F4] p-6 md:p-8">
              <p className="text-[12px] font-semibold tracking-[0.125px] text-[#615D59]">
                방문 전에 알아두실 것
              </p>
              <dl className="mt-5 space-y-5">
                {VISIT_FACTS.map((fact) => (
                  <div key={fact.label} className="flex gap-3.5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#084734]">
                      <fact.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <dt className="text-[12px] text-[#615D59]">{fact.label}</dt>
                      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#111110]">
                        {fact.value}
                      </dd>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#A39E98]">{fact.note}</p>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ── 쇼룸에서 확인하는 것 ── */}
      <section className="bg-[#F6F5F4] py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <h2 className="text-[30px] font-bold leading-tight tracking-[-1px] text-[#111110] md:text-[40px]">
              쇼룸에서 확인하는 것
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[#615D59]">
              전자칠판 한 대를 보러 오는 자리가 아닙니다. 교안 · 판서 · 녹화 · 복습이 따로 놀지
              않고 하나의 수업 운영으로 이어지는지를 눈으로 확인하는 자리입니다.
            </p>
          </div>

          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {LESSON_FLOW.map((item) => (
              <li
                key={item.step}
                className="rounded-xl border border-black/[0.08] bg-white p-6 shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.027)_0px_2px_7.8px,rgba(0,0,0,0.02)_0px_0.8px_2.9px,rgba(0,0,0,0.01)_0px_0.175px_1px]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
                    <item.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums tracking-[0.125px] text-[#A39E98]">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-4 text-[16px] font-bold leading-snug text-[#111110]">
                  {item.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#615D59]">{item.body}</p>
              </li>
            ))}
          </ol>

          <p className="mt-8 max-w-3xl text-[15px] leading-relaxed text-[#44514A]">
            이 네 장면을 따로따로 시연하지 않습니다. 수업 한 편을 끝까지 돌리면 저절로 이어지는
            것을 보시는 게 목적이라, 중간에 끊기는 지점이 있다면 그 자리에서 그대로 드러납니다.
          </p>
        </div>
      </section>

      {/* ── 준비물 안내 ── */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <h2 className="text-[30px] font-bold leading-tight tracking-[-1px] text-[#111110] md:text-[40px]">
                대표 수업 자료 한 개만
                <br />
                가져오시면 됩니다
              </h2>
              <p className="mt-5 text-[16px] leading-relaxed text-[#615D59]">
                우리 학원 대표 수업 자료 한 개를 가져오시면 실제 EDB · 판서 · 녹화 흐름을 그대로
                시연할 수 있습니다. 남의 샘플 교안으로 보는 데모와 우리 반 자료로 보는 데모는
                판단 근거가 다릅니다.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-[#44514A]">
                원장·실장과 실제로 수업할 강사 한 분이 함께 오시면, 도입 판단과 수업 운영 판단을
                같은 자리에서 끝낼 수 있습니다.
              </p>
            </div>

            <div className="rounded-xl border border-black/[0.08] bg-[#ECFDF5] p-6 md:p-8">
              <p className="text-[12px] font-semibold tracking-[0.125px] text-[#084734]">
                준비물 체크
              </p>
              <ul className="mt-4 space-y-3">
                {PREPARATION_POINTS.map((point) => (
                  <li key={point} className="flex gap-3 text-[14px] leading-relaxed text-[#111110]">
                    <span
                      aria-hidden="true"
                      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#084734]"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[13px] leading-relaxed text-[#44514A]">
                무엇을 챙겨야 할지 감이 잡히지 않으시면 데모 준비 킷을 먼저 보세요. 현장에서 볼
                장면과 판단 기준을 미리 정리해 둔 자료입니다.
              </p>
              <Link
                href="/resources/showroom-demo-readiness-kit"
                className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#084734] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
              >
                쇼룸 데모 준비 킷
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 예약 폼 ── */}
      <section id="booking" className="scroll-mt-24 bg-[#F6F5F4] py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center">
            <h2 className="text-[30px] font-bold leading-tight tracking-[-1px] text-[#111110] md:text-[40px]">
              방문 예약
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-[#615D59]">
              원하는 날짜와 시간을 고르고 연락처를 남겨주세요. 담당자가 일정을 확인한 뒤 확정
              연락을 드립니다.
            </p>
          </div>

          <div className="mt-8">
            <ShowroomBookingForm interests={SHOWROOM_INTERESTS} />
          </div>
        </div>
      </section>

      {/* ── 오시는 길 ── */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-stretch">
            <div>
              <h2 className="text-[30px] font-bold leading-tight tracking-[-1px] text-[#111110] md:text-[40px]">
                오시는 길
              </h2>

              <dl className="mt-6 space-y-5">
                <div className="flex gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div>
                    <dt className="text-[12px] text-[#615D59]">주소</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold leading-relaxed text-[#111110]">
                      {SHOWROOM_ADDRESS}
                    </dd>
                  </div>
                </div>

                <div className="flex gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div>
                    <dt className="text-[12px] text-[#615D59]">상담 시간</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#111110]">
                      평일 {SHOWROOM_SLOT_TIMES.join(" · ")}
                    </dd>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#A39E98]">
                      1회 {SHOWROOM_SLOT_DURATION_MINUTES}분 · 주말과 공휴일은 운영하지 않습니다
                    </p>
                  </div>
                </div>
              </dl>

              <p className="mt-6 rounded-xl border border-black/[0.08] bg-[#F6F5F4] px-4 py-3 text-[13px] leading-relaxed text-[#615D59]">
                정확한 층·호수 안내와 주차 여부는 확정 연락 때 함께 알려드립니다. 방문 당일
                일정이 바뀌면 남겨주신 연락처로 미리 연락드립니다.
              </p>
            </div>

            <div className="min-h-[280px] overflow-hidden rounded-xl border border-black/[0.08] bg-[#F6F5F4]">
              <iframe
                title={`목동 쇼룸 위치 지도 — ${SHOWROOM_MAP_QUERY}`}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(SHOWROOM_MAP_QUERY)}&t=&z=17&ie=UTF8&iwloc=&output=embed`}
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: 280 }}
                allowFullScreen={false}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 데모 준비 킷 ── */}
      <section className="bg-[#ECFDF5] py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-[26px] font-bold leading-tight tracking-[-0.625px] text-[#111110] md:text-[32px]">
            방문 전에 준비할 것을 먼저 정리해 두세요
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-[#44514A]">
            어떤 자료를 가져오면 좋은지, 현장에서 무엇을 확인하고, 무엇을 기준으로 파일럿 여부를
            판단할지 한 장으로 정리한 자료입니다.
          </p>
          <Link
            href="/resources/showroom-demo-readiness-kit"
            className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-7 text-[15px] font-semibold text-white transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
          >
            쇼룸 데모 준비 킷 받기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  )
}
