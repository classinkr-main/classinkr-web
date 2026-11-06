import Link from "next/link"
import { ArrowRight, ArrowDown, Video, CircleDot, Upload, MessageCircle, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Reveal } from "@/components/landing/Reveal"

// 히어로 바로 아래 문제 제기 → 답 섹션. 흩어진 도구 넷(위 4단)이 Classin 한 화면(아래 띠)으로 모이는 구조를
// 같은 4열 격자로 맞춰 보여 준다. 지면 paper, 장식(그라데이션·파티클·글로우)·카운트업 없음, 왼쪽 정렬.

type Step = { verb: string; tool: string; icon: LucideIcon; unified: string }

const STEPS: Step[] = [
    { verb: "줌 열고", tool: "화상회의 툴", icon: Video, unified: "실시간 수업" },
    { verb: "녹화 누르고", tool: "녹화 프로그램", icon: CircleDot, unified: "수업 녹화" },
    { verb: "숙제 올리고", tool: "과제 게시판·드라이브", icon: Upload, unified: "과제 제출" },
    { verb: "각각 연락하고", tool: "메신저·문자", icon: MessageCircle, unified: "학부모 소통" },
]

const FACTS = [
    { value: "30+", label: "인터랙티브 수업 도구" },
    { value: "10가지", label: "참여형 수업 활동" },
]

type StoryCtaSectionProps = {
    ctaHref: string
    ctaLabel: string
    ctaSubLabel: string
    onCtaClick: () => void
}

export function StoryCtaSection({ ctaHref, ctaLabel, ctaSubLabel, onCtaClick }: StoryCtaSectionProps) {
    return (
        <section aria-labelledby="sw-story-heading" className="bg-surface-paper py-20 md:py-28">
            <div className="mx-auto max-w-[1040px] px-4 sm:px-6">
                {/* 머리: 나열 → 한 줄 결론 */}
                <Reveal className="masthead">
                    <p className="text-label text-fg-muted">되찾은 수업 시간</p>
                    <p className="mt-6 text-h3 font-medium text-fg-muted break-keep text-balance">
                        줌 열고, 녹화 누르고, 숙제 올리고, 각각 연락하고…
                    </p>
                    <h2 id="sw-story-heading" className="mt-3 text-h1 text-fg-ink break-keep text-balance">
                        수업 하나에 도구만 네 개.
                    </h2>
                </Reveal>

                {/* 도해: 위 4단(따로 노는 도구) → 아래 띠(Classin 한 화면). 열이 위아래로 맞물린다 */}
                <Reveal className="mt-14 md:mt-20">
                    <ol aria-label="지금의 수업 준비" className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6">
                        {STEPS.map((step, i) => {
                            const Icon = step.icon
                            return (
                                <li key={step.verb} className="border-t border-dashed border-line-strong pt-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-folio tabular-nums text-fg-muted">{String(i + 1).padStart(2, "0")}</span>
                                        <Icon aria-hidden className="size-5 text-fg-muted" />
                                    </div>
                                    <p className="mt-5 text-body-l font-semibold text-fg-ink break-keep">{step.verb}</p>
                                    <p className="mt-1 text-caption text-fg-muted break-keep">{step.tool}</p>
                                </li>
                            )
                        })}
                    </ol>

                    <p className="my-8 flex items-center gap-2 text-label text-fg-muted md:my-10">
                        <ArrowDown aria-hidden className="size-4" />
                        Classin에서는 한 화면에서
                    </p>

                    <div className="rule-double pt-7">
                        <ul aria-label="Classin 한 화면" className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4 md:gap-x-6">
                            {STEPS.map((step, i) => (
                                <li key={step.unified} className="flex items-baseline gap-3">
                                    <span aria-hidden className="text-folio tabular-nums text-fg-muted">{String(i + 1).padStart(2, "0")}</span>
                                    <span className="text-body-l font-semibold text-fg-ink break-keep">{step.unified}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Reveal>

                {/* 답 + 근거 숫자 + CTA */}
                <Reveal className="mt-16 grid gap-10 border-t border-line-hair pt-10 md:mt-20 md:grid-cols-[1.15fr_1fr] md:gap-16 md:pt-14">
                    <div>
                        <h3 className="text-h2 text-fg-ink break-keep text-balance">
                            <span className="underline decoration-2 underline-offset-[0.2em]">가르치는 일</span>에만 집중할 수 있다면?
                        </h3>
                        <p className="mt-5 max-w-measure text-body-l text-fg-body break-keep">
                            수업만을 위해 만든 플랫폼, 다음은 당신의 교실입니다.
                        </p>
                    </div>

                    <div>
                        <dl className="grid grid-cols-2 divide-x divide-line-hair">
                            {FACTS.map((fact, i) => (
                                <div key={fact.label} className={`flex flex-col-reverse ${i === 0 ? "pr-6" : "pl-6"}`}>
                                    <dt className="mt-2 text-caption text-fg-muted break-keep">{fact.label}</dt>
                                    <dd className="text-numeral tabular-nums text-fg-ink">{fact.value}</dd>
                                </div>
                            ))}
                        </dl>

                        <div className="mt-10 flex flex-col items-start gap-3">
                            <Button asChild size="cta" className="w-full sm:w-auto">
                                <Link href={ctaHref} onClick={onCtaClick}>
                                    {ctaLabel}
                                    <ArrowRight aria-hidden className="arrow-nudge" />
                                </Link>
                            </Button>
                            <p className="text-note text-fg-muted">{ctaSubLabel}</p>
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    )
}
