"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PUBLIC_FAQ_CATEGORIES, type PublicFaqCategoryKey } from "@/lib/public-faq"

// 답변은 전부 HTML 에 실린다. Radix 아코디언은 닫힌 항목의 자식을 렌더하지 않아(forceMount 로도 안 됨)
// JS 를 실행하지 않는 검색·AI 크롤러가 질문만 읽었다. 그래서 네이티브 <details> 를 쓰고, 탭도 전부 마운트한 뒤 CSS 로만 숨긴다.
const DEFAULT_TAB: PublicFaqCategoryKey = "software"

function findCategoryByItemId(id: string) {
    return PUBLIC_FAQ_CATEGORIES.find((category) => category.items.some((item) => item.id === id))
}

// 숨은 탭(display:none) 안의 질문은 scrollIntoView 가 듣지 않으니, 보일 때까지 대상을 남겨 둔다.
function revealPendingItem(pendingIdRef: RefObject<string | null>) {
    const id = pendingIdRef.current
    const el = id ? document.getElementById(id) : null
    if (!(el instanceof HTMLDetailsElement) || el.offsetParent === null) return
    pendingIdRef.current = null
    el.open = true
    el.scrollIntoView({ block: "center" })
}

export function FAQ() {
    const [tab, setTab] = useState<string>(DEFAULT_TAB)
    const pendingIdRef = useRef<string | null>(null)

    // /faq#<질문 id> 로 들어오면 그 질문의 탭으로 바꾸고 펼친다.
    useEffect(() => {
        const readHash = () => {
            const id = decodeURIComponent(window.location.hash.slice(1))
            const category = id ? findCategoryByItemId(id) : undefined
            if (!category) return
            pendingIdRef.current = id
            setTab(category.key)
            revealPendingItem(pendingIdRef)
        }
        readHash()
        window.addEventListener("hashchange", readHash)
        return () => window.removeEventListener("hashchange", readHash)
    }, [])

    // 다른 탭의 질문이면 탭 전환이 화면에 반영된 뒤에야 펼치고 스크롤할 수 있다.
    useEffect(() => {
        revealPendingItem(pendingIdRef)
    }, [tab])

    return (
        <section id="faq" className="py-16 md:py-24 bg-white relative">
            <div className="container mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-8 items-start">
                <div className="md:col-span-5 lg:col-span-4 md:sticky md:top-32">
                    <h2 className="text-4xl lg:text-5xl font-black text-[#111110] leading-[1.2] break-keep" style={{ letterSpacing: '-1.5px' }}>
                        자주 묻는 <br className="hidden md:block" />질문
                    </h2>
                    <p className="mt-6 text-lg text-[#615D59] font-medium break-keep">
                        소프트웨어, 하드웨어, 사용법을 나눠 <br className="hidden lg:block" />가장 많이 여쭤보시는 질문에 답변해 드립니다.
                        <br /><br />
                        추가 문의사항이 있으시다면 언제든 솔루션 문의를 남겨주세요.
                    </p>
                </div>

                <div className="md:col-span-7 lg:col-span-8">
                    <Tabs value={tab} onValueChange={setTab} className="w-full">
                        <TabsList className="h-auto w-full justify-start rounded-full bg-[#F6F5F4] p-1">
                            {PUBLIC_FAQ_CATEGORIES.map((category) => (
                                <TabsTrigger
                                    key={category.key}
                                    value={category.key}
                                    className="rounded-full px-5 py-2.5 text-sm font-semibold text-[#615D59] data-[state=active]:bg-white data-[state=active]:text-[#084734] data-[state=active]:shadow-none"
                                >
                                    {category.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        {PUBLIC_FAQ_CATEGORIES.map((category) => (
                            <TabsContent
                                key={category.key}
                                value={category.key}
                                forceMount
                                className="mt-8 data-[state=inactive]:hidden"
                            >
                                <div className="mb-8 rounded-[28px] border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-6 md:p-8">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.125px] text-[#084734]">
                                        {category.eyebrow}
                                    </div>
                                    <h3 className="mt-3 text-2xl md:text-3xl font-bold leading-tight text-[#111110] break-keep" style={{ letterSpacing: "-0.8px" }}>
                                        {category.title}
                                    </h3>
                                    <p className="mt-4 max-w-2xl text-[16px] leading-[1.7] text-[#615D59] break-keep">
                                        {category.description}
                                    </p>
                                    <div className="mt-5 flex flex-wrap gap-2.5">
                                        {category.highlights.map((highlight) => (
                                            <span
                                                key={highlight}
                                                className="inline-flex items-center rounded-full border border-[#084734]/10 bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#084734]"
                                            >
                                                {highlight}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="w-full">
                                    {category.items.map((faq) => (
                                        <details
                                            key={faq.id}
                                            id={faq.id}
                                            name={`faq-${category.key}`}
                                            className="group scroll-mt-32 border-b border-[rgba(0,0,0,0.08)]"
                                        >
                                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-8 text-left text-xl lg:text-2xl font-bold text-[#111110] hover:text-[#084734] transition-colors break-keep [&::-webkit-details-marker]:hidden">
                                                {faq.question}
                                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-180" />
                                            </summary>
                                            <div className="text-[#615D59] text-lg leading-relaxed pb-8 break-keep">
                                                {faq.answer}
                                                {faq.guideHref ? (
                                                    <div className="mt-5">
                                                        <Link
                                                            href={faq.guideHref}
                                                            className="inline-flex items-center rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-4 py-2 text-sm font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5]"
                                                        >
                                                            3단계 가이드 보기
                                                        </Link>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>
                </div>
            </div>
        </section>
    )
}
