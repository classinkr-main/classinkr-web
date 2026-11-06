"use client"

import Image from "next/image"
import { ArrowUpRight, Check } from "lucide-react"
import { useId, useRef, useState, type KeyboardEvent } from "react"

import { Reveal } from "@/components/landing/Reveal"
import { TrackedLink } from "@/components/TrackedLink"

/**
 * /product/sw AI 섹션 — LearningCycle(수업 전·중·후) 바로 뒤에서 "그 흐름 안에서 AI가 일한다"를 잇는다.
 * 사실 정본: public/classin-ai-feature-guide.html(3영역 20기능, ClassIn 6.0.9) ·
 * docs/active/classin-software-feature-inventory.md "AI 기능" 절. 제공 조건(기본 제공·별도 활성화)을 바꾸면 둘을 먼저 고친다.
 */

const AI_GUIDE_HREF = "/classin-ai-feature-guide.html"

type AIArea = {
    id: "ai-board" | "ai-analysis" | "ai-agent"
    stage: string
    name: string
    users: string
    title: string
    body: string
    points: string[]
    condition: string
    image: { src: string; alt: string; width: number; height: number; caption: string; dark: boolean }
}

const AI_AREAS: AIArea[] = [
    {
        id: "ai-board",
        stage: "수업 중",
        name: "AI 칠판",
        users: "강사·학생",
        title: "문항을 내면, 제출과 동시에 AI가 채점합니다",
        body: "수업 중에 낸 문항이 학생 각자의 칠판으로 배포되고, 손글씨·음성 답안을 AI가 바로 채점합니다. 반 전체 정답률과 다음 수업 지도 제안까지 수업을 멈추지 않고 이어집니다.",
        points: [
            "AI가 모범 답안과 채점 기준 작성 — 주관식·객관식·말하기",
            "손글씨 수식과 풀이 과정까지 인식해 채점",
            "점수 분포·학습 요소별 정답률·지도 제안을 한 화면에",
            "학생은 제출 직후 점수와 틀린 이유를 확인",
        ],
        condition: "별도 활성화 · 강사·학생 앱 6.0.9 이상 · AI 채점은 참고용이며 최종 판단은 강사가 합니다",
        image: {
            src: "/images/product/sw/ai/ai-blackboard-grading.webp",
            alt: "AI 칠판 답안 상세 화면. 학생 답안 옆에 AI 채점 결과로 판정, 상세 분석, 종합 제안이 표시된다",
            width: 1200,
            height: 559,
            caption: "AI 칠판 · 답안 상세 — 판정, 상세 분석, 종합 제안",
            dark: true,
        },
    },
    {
        id: "ai-analysis",
        stage: "수업 후",
        name: "AI 강의 분석",
        users: "관리자·강사",
        title: "참관하지 않아도, 모든 수업을 같은 기준으로 봅니다",
        body: "실시간 수업이 끝나면 AI가 녹화본을 4개 영역 11개 항목으로 분석해 점수와 보고서를 만듭니다. 강사는 자기 수업을 복기하고, 원장님은 강사 코칭의 근거로 씁니다.",
        points: [
            "수업 전달·수업 분위기·상호작용·언어 표현 4개 영역 진단",
            "핵심 강점·핵심 리스크와 다음 수업 개선 제안",
            "강사별 수업 품질 비교 — 관리자만 열람",
            "학원 평가표를 반영한 맞춤 분석 에이전트",
        ],
        condition: "관리자 설정에서 켜고 수업마다 선택 · 클래스인 실시간 수업 녹화본 대상 · 보고서 한국어 제공",
        image: {
            src: "/images/product/sw/ai/ai-lesson-analysis.webp",
            alt: "수업 다시보기의 AI 강의 분석 탭. 종합 점수 78점과 수업 참여 품질, 상호작용, 교수 설계, 언어 표현 영역별 점수가 표시된다",
            width: 1200,
            height: 791,
            caption: "수업 다시보기 · AI 강의 분석 — 종합 점수와 영역별 점수",
            dark: false,
        },
    },
    {
        id: "ai-agent",
        stage: "수업 전·후",
        name: "AI 에이전트",
        users: "강사·학생",
        title: "숙제 만들기와 채점, 복습 노트는 AI 에이전트에게",
        body: "목적별 AI 에이전트가 어학 연습 숙제를 만들고, 제출된 숙제의 점수·총평 초안을 쓰고, 녹화 수업을 과목에 맞게 요약합니다. 강사는 검토와 피드백에 집중합니다.",
        points: [
            "따라 읽기·받아쓰기·외워 말하기 AI 채점 — 영어·중국어",
            "서술형 숙제 점수·총평·오답 해설 초안 — 강사 확인 후 게시",
            "과목별 AI 수업 요약으로 복습 노트 자동 생성",
            "교실 안 AgentIn — 수업 중 예시·연습 문제 즉석 생성",
        ],
        condition: "어학 활동·숙제 AI 채점·수업 요약은 기본 제공 · 교실 안 AgentIn과 맞춤 에이전트는 별도 활성화",
        image: {
            src: "/images/product/sw/ai/ai-homework-grading.webp",
            alt: "숙제 읽기 화면. 학생 답안 오른쪽에 AI가 작성한 오답 분석과 해설, 점수 초안이 참고용으로 표시된다",
            width: 1200,
            height: 791,
            caption: "숙제 읽기 — AI가 쓴 점수·총평 초안(참고용)",
            dark: false,
        },
    },
]

export default function AIFeatureShowcase() {
    const [active, setActive] = useState(0)
    const baseId = useId()
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

    const focusTab = (index: number) => {
        const next = (index + AI_AREAS.length) % AI_AREAS.length
        setActive(next)
        tabRefs.current[next]?.focus()
    }

    const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (event.key === "ArrowRight") { event.preventDefault(); focusTab(index + 1) }
        else if (event.key === "ArrowLeft") { event.preventDefault(); focusTab(index - 1) }
        else if (event.key === "Home") { event.preventDefault(); focusTab(0) }
        else if (event.key === "End") { event.preventDefault(); focusTab(AI_AREAS.length - 1) }
    }

    return (
        <section id="ai" aria-labelledby={`${baseId}-heading`} className="bg-surface-paper py-20 md:py-32">
            <div className="mx-auto max-w-page px-4 sm:px-6 lg:px-12">
                {/* 섹션 머리(V12-A): 먹 masthead + 왼쪽 레일 Kicker, 제목은 본문 칸에서 왼쪽 정렬 */}
                <Reveal className="masthead grid gap-3 lg:grid-cols-12 lg:gap-6">
                    <div className="lg:col-span-3">
                        <p className="text-folio tabular-nums text-fg-muted">ClassIn 6.0.9 업데이트</p>
                        <p className="mt-3 text-label text-fg-ink">수업 흐름 속의 AI</p>
                    </div>
                    <div className="lg:col-span-9">
                        <h2 id={`${baseId}-heading`} className="max-w-[18em] text-h2 text-fg-ink break-keep text-balance">
                            채점과 진단은 AI가 돕고,
                            <br className="hidden sm:block" /> 선생님은 수업에 집중합니다
                        </h2>
                        <p className="mt-5 max-w-[34em] text-body-l text-fg-body break-keep">
                            수업 중 문항 채점, 수업 후 강의 분석, 숙제 채점 초안과 복습 요약까지.
                            클래스인의 AI는 따로 여는 도구가 아니라, 위에서 본 수업 전·중·후 흐름 안에서 일합니다.
                        </p>
                    </div>
                </Reveal>

                {/* 3영역 색인 탭 — 모든 패널을 SSR 로 그려 두고 hidden 으로만 가른다(검색·JS 없음 대비) */}
                <div
                    role="tablist"
                    aria-label="클래스인 AI 기능 영역"
                    className="mt-12 grid grid-cols-3 border-b border-line-hair md:mt-16"
                >
                    {AI_AREAS.map((area, i) => {
                        const selected = i === active
                        return (
                            <button
                                key={area.id}
                                ref={(node) => { tabRefs.current[i] = node }}
                                type="button"
                                role="tab"
                                id={`${baseId}-tab-${area.id}`}
                                aria-selected={selected}
                                aria-controls={`${baseId}-panel-${area.id}`}
                                tabIndex={selected ? 0 : -1}
                                onClick={() => setActive(i)}
                                onKeyDown={(event) => onTabKeyDown(event, i)}
                                className="index-tab flex-col items-start justify-end gap-1 pb-4 pr-2 pt-2 text-left whitespace-normal"
                            >
                                <span className="text-folio tabular-nums text-fg-muted">
                                    {String(i + 1).padStart(2, "0")} · {area.stage}
                                </span>
                                <span className="text-body font-semibold sm:text-body-l sm:font-semibold">{area.name}</span>
                            </button>
                        )
                    })}
                </div>

                {AI_AREAS.map((area, i) => (
                    <div
                        key={area.id}
                        role="tabpanel"
                        id={`${baseId}-panel-${area.id}`}
                        aria-labelledby={`${baseId}-tab-${area.id}`}
                        hidden={i !== active}
                        className="grid gap-10 pt-10 md:pt-12 lg:grid-cols-12 lg:gap-6"
                    >
                        <figure className="lg:col-span-7">
                            {/* 화면 캡처 매트(V16): sunken 지면 위에 캡처, 가장자리는 hair 한 줄 */}
                            <div className="bg-surface-sunken p-3 sm:p-5 md:p-6">
                                <div className="fig-edge relative overflow-hidden">
                                    <Image
                                        src={area.image.src}
                                        alt={area.image.alt}
                                        width={area.image.width}
                                        height={area.image.height}
                                        sizes="(min-width: 1296px) 680px, (min-width: 1024px) 55vw, 100vw"
                                        loading="lazy"
                                        className="h-auto w-full"
                                    />
                                </div>
                            </div>
                            <figcaption className="mt-3 text-note text-fg-muted">{area.image.caption}</figcaption>
                        </figure>

                        <div className="lg:col-span-5 lg:pl-6">
                            <p className="text-caption font-medium text-fg-muted">
                                {area.stage} · {area.users}
                            </p>
                            <h3 className="mt-3 text-h3 text-fg-ink break-keep text-balance">{area.title}</h3>
                            <p className="mt-5 text-body text-fg-body break-keep">{area.body}</p>

                            <ul className="mt-6 divide-y divide-line-hair border-y border-line-hair">
                                {area.points.map((point) => (
                                    <li key={point} className="flex items-start gap-2.5 py-3 text-body text-fg-ink break-keep">
                                        <Check aria-hidden className="mt-[5px] size-[18px] shrink-0 text-fg-ink" />
                                        {point}
                                    </li>
                                ))}
                            </ul>

                            <p className="mt-4 text-note text-fg-muted break-keep">{area.condition}</p>

                            <TrackedLink
                                href={`${AI_GUIDE_HREF}#${area.id}`}
                                prefetch={false}
                                target="_blank"
                                rel="noopener noreferrer"
                                ctaId={`sw_ai_guide_${area.id.replace("ai-", "")}`}
                                className="mt-6 inline-flex min-h-11 items-center gap-1 text-ui font-semibold link-body"
                            >
                                소개서에서 {area.name} 자세히 보기
                                <ArrowUpRight aria-hidden className="size-4" />
                                <span className="sr-only">(새 탭)</span>
                            </TrackedLink>
                        </div>
                    </div>
                ))}

                {/* 소개서 띠: 1px 먹 + hair 이중선. 그린 채움은 이 CTA 하나 */}
                <div className="rule-double mt-16 grid gap-6 pt-8 md:mt-20 md:grid-cols-12 md:items-center md:gap-6">
                    <div className="md:col-span-7">
                        <p className="text-h3 text-fg-ink break-keep">AI 기능 20개, 화면과 사용 조건까지 한 문서에</p>
                        <p className="mt-2 text-caption text-fg-muted break-keep">
                            AI 강의 분석·AI 칠판·AI 에이전트의 기능, 주 사용자, 지원 환경, 켜는 순서를 실제 화면으로 정리한 소개서입니다.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row md:col-span-5 md:justify-end">
                        <TrackedLink
                            href={AI_GUIDE_HREF}
                            prefetch={false}
                            target="_blank"
                            rel="noopener noreferrer"
                            ctaId="software_ai_feature_guide"
                            className="inline-flex h-12 items-center justify-center gap-2 rounded-(--radius-control) bg-fg-accent px-7 text-body font-semibold text-fg-on-accent transition-colors hover:bg-fg-accent-hover"
                        >
                            AI 기능 소개서 보기
                            <ArrowUpRight aria-hidden className="size-4" />
                            <span className="sr-only">(새 탭)</span>
                        </TrackedLink>
                        <TrackedLink
                            href="/contact#contact-form"
                            ctaId="sw_ai_consult"
                            className="inline-flex h-12 items-center justify-center rounded-(--radius-control) border border-line-control px-7 text-body font-semibold text-fg-ink transition-colors hover:border-line-ink"
                        >
                            AI 도입 상담
                        </TrackedLink>
                    </div>
                    <p className="text-note text-fg-muted break-keep md:col-span-12">
                        ClassIn 6.0.9 기준입니다. 기능 제공 범위는 계약 플랜과 지원 환경에 따라 다를 수 있으며, 별도 활성화 기능은 담당 매니저가 안내해 드립니다.
                    </p>
                </div>
            </div>
        </section>
    )
}
