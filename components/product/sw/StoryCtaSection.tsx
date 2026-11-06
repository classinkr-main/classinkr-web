import Link from "next/link"
import { ArrowRight, Check, Video, CircleDot, Upload, MessageCircle, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Reveal } from "@/components/landing/Reveal"

// 히어로 바로 아래 문제 제기 → 답 섹션(컴팩트). 왼쪽은 카피 + CTA, 오른쪽은 '도구 4개 → Classin으로 한 번에' 대조.
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
                        <span className="underline decoration-2 underline-offset-[0.2em]">Classin으로 한 번에.</span>
                    </h2>
                    <p className="mt-4 text-body-l text-fg-body break-keep">
                        가르치는 일에만 집중할 수 있다면? 수업만을 위해 만든 플랫폼, 다음은 당신의 교실입니다.
                    </p>

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

                {/* 대조: 왼쪽은 따로 노는 도구 4행(hair로 끊김), 오른쪽은 끊김 없는 패널 하나(초록 테두리) = Classin 한 번에.
                    한 격자에 행을 명시해 좌우 행 높이를 맞추고, 패널 면은 3열 1~5행을 덮는 배경 요소가 맡는다 */}
                <div className="grid grid-cols-[1fr_auto_1fr] grid-rows-[auto_repeat(4,auto)] gap-x-3 sm:gap-x-4">
                    {/* 강조 패널: 초록은 테두리에만(면은 sheet 그대로), 아우라 = 가드 허용 shadow-deep + 옅은 초록 outline(ring 은 box-shadow 라 shadow-deep 와 겹치면 사라진다) */}
                    <div aria-hidden className="col-start-3 row-span-5 row-start-1 border-2 border-fg-accent bg-surface-sheet shadow-deep outline-[6px] outline-solid outline-fg-accent/12" />

                    <p className="col-start-1 row-start-1 self-end border-b border-line-hair pb-3 text-label text-fg-muted">지금 · 도구 4개</p>
                    <div className="relative col-start-3 row-start-1 px-4 pb-3 pt-5 sm:px-5">
                        <p className="text-label text-fg-muted">도구 1개</p>
                        <p className="mt-1 text-h3 text-fg-ink break-keep">Classin으로 <span className="whitespace-nowrap">한 번에</span></p>
                    </div>

                    {ROWS.map((row, i) => {
                        const Icon = row.icon
                        const gridRow = { gridRowStart: i + 2 }
                        return (
                            <div key={row.verb} className="contents">
                                <div style={gridRow} className="col-start-1 flex items-start gap-3 border-b border-line-hair py-4">
                                    <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" />
                                    <div>
                                        <p className="text-ui font-medium text-fg-muted break-keep">{row.verb}</p>
                                        <p className="mt-0.5 text-note text-fg-muted break-keep">{row.tool}</p>
                                    </div>
                                </div>
                                <ArrowRight aria-hidden style={gridRow} className="col-start-2 size-4 self-center text-fg-muted" />
                                <p style={gridRow} className={`relative col-start-3 flex items-center gap-2.5 self-stretch px-4 text-body-l font-semibold text-fg-ink break-keep sm:px-5 ${i === ROWS.length - 1 ? "pb-5" : ""}`}>
                                    <Check aria-hidden className="size-[18px] shrink-0" />
                                    <span>
                                        <span className="sr-only">{row.verb} 대신 </span>
                                        {row.unified}
                                    </span>
                                </p>
                            </div>
                        )
                    })}
                </div>
            </Reveal>
        </section>
    )
}
