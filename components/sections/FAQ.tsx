"use client"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PUBLIC_FAQ_CATEGORIES } from "@/lib/public-faq"

export function FAQ() {
    return (
        <section id="faq" className="py-16 md:py-24 bg-white relative">
            <div className="container mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-8 items-start">
                <div className="md:col-span-5 lg:col-span-4 sticky top-32">
                    <h2 className="text-4xl lg:text-5xl font-black text-[#111110] leading-[1.2] break-keep" style={{ letterSpacing: '-1.5px' }}>
                        자주 묻는 <br className="hidden md:block" />질문
                    </h2>
                    <p className="mt-6 text-lg text-[#615D59] font-medium break-keep">
                        소프트웨어와 하드웨어를 나눠 <br className="hidden lg:block" />가장 많이 여쭤보시는 질문에 답변해 드립니다.
                        <br /><br />
                        추가 문의사항이 있으시다면 언제든 솔루션 문의를 남겨주세요.
                    </p>
                </div>

                <div className="md:col-span-7 lg:col-span-8">
                    <Tabs defaultValue="software" className="w-full">
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
                            <TabsContent key={category.key} value={category.key} className="mt-8">
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

                                <Accordion type="single" collapsible className="w-full">
                                    {category.items.map((faq, index) => (
                                        <AccordionItem key={faq.question} value={`${category.key}-item-${index}`} className="border-b border-[rgba(0,0,0,0.08)]">
                                            <AccordionTrigger className="text-left text-xl lg:text-2xl font-bold text-[#111110] hover:text-[#084734] hover:no-underline py-8 transition-colors break-keep">
                                                {faq.question}
                                            </AccordionTrigger>
                                            <AccordionContent className="text-[#615D59] text-lg leading-relaxed pb-8 break-keep">
                                                {faq.answer}
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            </TabsContent>
                        ))}
                    </Tabs>
                </div>
            </div>
        </section>
    )
}
