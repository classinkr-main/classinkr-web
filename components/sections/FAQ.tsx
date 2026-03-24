"use client"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const faqs = [
    {
        question: "도입하는 데 얼마나 걸리나요?",
        answer: "대부분의 경우 48시간 이내에 데이터 이관과 세팅을 완료합니다. 첫 주에는 강사분들을 위한 집중 교육 세션을 제공하여 빠르게 적응하실 수 있도록 돕습니다.",
    },
    {
        question: "학생들에게 특정 기기가 필요한가요?",
        answer: "아니요. Classin은 웹 기반으로 작동하며 반응형을 지원합니다. 노트북, 태블릿, 스마트폰 등 어떤 기기에서도 별도의 설치 없이 사용 가능합니다.",
    },
    {
        question: "기존 결제 시스템과 연동되나요?",
        answer: "네, 주요 결제 및 CRM 플랫폼과 API 연동을 지원합니다. 데모 상담 시 사용 중인 솔루션을 말씀해 주시면 상세한 호환성을 안내해 드립니다.",
    },
    {
        question: "학원의 콘텐츠는 안전한가요?",
        answer: "물론입니다. 모든 수업 자료와 학생 데이터는 암호화되어 안전하게 보관됩니다. 데이터 소유권은 전적으로 학원에 있으며, 엄격한 접근 제어로 무단 유출을 방지합니다.",
    },
    {
        question: "요금 체계는 어떻게 되나요?",
        answer: "재원생 수에 따른 합리적인 요금제를 제공합니다. 강사 계정과 관리자 계정은 무제한으로 제공되므로 인력이 늘어나도 추가 비용이 없습니다.",
    },
]

export function FAQ() {
    return (
        <section id="faq" className="py-16 md:py-24 bg-white relative">
            <div className="container mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-8 items-start">
                <div className="md:col-span-5 lg:col-span-4 sticky top-32">
                    <h2 className="text-4xl lg:text-5xl font-black tracking-tight text-slate-900 leading-[1.2] break-keep">
                        자주 묻는 <br className="hidden md:block" />질문
                    </h2>
                    <p className="mt-6 text-lg text-slate-500 font-medium break-keep">
                        가장 많이 여쭤보시는 질문에 <br className="hidden lg:block" />답변해 드립니다. <br /><br />추가 문의사항이 있으시다면 언제든 솔루션 문의를 남겨주세요.
                    </p>
                </div>

                <div className="md:col-span-7 lg:col-span-8">
                    <Accordion type="single" collapsible className="w-full">
                        {faqs.map((faq, index) => (
                            <AccordionItem key={index} value={`item-${index}`} className="border-b border-slate-200">
                                <AccordionTrigger className="text-left text-xl lg:text-2xl font-bold text-slate-900 hover:text-emerald-600 hover:no-underline py-8 transition-colors break-keep">
                                    {faq.question}
                                </AccordionTrigger>
                                <AccordionContent className="text-slate-600 text-lg leading-relaxed pb-8 break-keep">
                                    {faq.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </div>
        </section>
    )
}
