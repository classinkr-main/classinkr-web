import Link from "next/link"
import { ArrowRight, Video, CircleDot, Upload, MessageCircle, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Reveal } from "@/components/landing/Reveal"

// 히어로 바로 아래 문제 제기 → 답 섹션(컴팩트). 왼쪽은 카피 + CTA, 오른쪽은 '지금 → Classin' 4행 대조 목록.
// 지면 paper, 장식·카운트업 없음, 왼쪽 정렬. 숫자(30+·10가지)는 바로 위 히어로와 겹쳐 두지 않는다.

type Row = { verb: string; tool: string; icon: LucideIcon; unified: string }

const ROWS: Row[] = [
    { verb: "줌 열고", tool: "화상회의 툴", icon: Video, unified: "실시간 수업" },
    { verb: "녹화 누르고", tool: "녹화 프로그램", icon: CircleDot, unified: "수업 녹화" },
    { verb: "숙제 올리고", tool: "과제 게시판·드라이브", icon: Upload, unified: "과제 제출" },
    { verb: "각각 연락하고", tool: "메신저·문자", icon: MessageCircle, unified: "학부모 소통" },
]

type StoryCtaSectionProps = {
    ctaHref: string
    ctaLabel: string
    ctaSubLabel: string
    onCtaClick: () => void
}

export function StoryCtaSection({ ctaHref, ctaLabel, ctaSubLabel, onCtaClick }: StoryCtaSectionProps) {
    return (
        <section aria-labelledby="sw-story-heading" className="bg-surface-paper py-14 md:py-20">
            <Reveal className="mx-auto grid max-w-[1040px] gap-10 px-4 sm:px-6 md:grid-cols-[1fr_1.1fr] md:items-center md:gap-16">
                <div>
                    <p className="text-label text-fg-muted">되찾은 수업 시간</p>
                    <p className="mt-4 text-body-l text-fg-muted break-keep">줌 열고, 녹화 누르고, 숙제 올리고, 각각 연락하고…</p>
                    <h2 id="sw-story-heading" className="mt-2 text-h2 text-fg-ink break-keep text-balance">
                        수업 하나에 도구만 네 개.
                        <br />
                        <span className="underline decoration-2 underline-offset-[0.2em]">가르치는 일</span>에만 <span className="whitespace-nowrap">집중할 수 있다면?</span>
                    </h2>
                    <p className="mt-4 text-body text-fg-body break-keep">수업만을 위해 만든 플랫폼, 다음은 당신의 교실입니다.</p>

                    <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
                        <Button asChild size="cta" className="w-full sm:w-auto">
                            <Link href={ctaHref} onClick={onCtaClick}>
                                {ctaLabel}
                                <ArrowRight aria-hidden className="arrow-nudge" />
                            </Link>
                        </Button>
                        <p className="text-note text-fg-muted">{ctaSubLabel}</p>
                    </div>
                </div>

                {/* 대조 목록: 따로 쓰던 도구(왼쪽, 흐림) → Classin 한 화면(오른쪽, 먹) */}
                <div className="masthead">
                    <div aria-hidden className="grid grid-cols-[1fr_auto_1fr] gap-4 pb-3 text-label">
                        <span className="text-fg-muted">지금</span>
                        <span className="w-4" />
                        <span className="text-fg-ink">Classin 한 화면</span>
                    </div>
                    <ul className="divide-y divide-line-hair border-t border-line-hair">
                        {ROWS.map((row) => {
                            const Icon = row.icon
                            return (
                                <li key={row.verb} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-4">
                                    <div className="flex items-start gap-3">
                                        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" />
                                        <div>
                                            <p className="text-ui font-medium text-fg-muted break-keep">{row.verb}</p>
                                            <p className="mt-0.5 text-note text-fg-muted break-keep">{row.tool}</p>
                                        </div>
                                    </div>
                                    <ArrowRight aria-hidden className="size-4 text-fg-muted" />
                                    <p className="text-body-l font-semibold text-fg-ink break-keep">
                                        <span className="sr-only">{row.verb} 대신 </span>
                                        {row.unified}
                                    </p>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </Reveal>
        </section>
    )
}
