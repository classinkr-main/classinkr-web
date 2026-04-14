"use client"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const faqCategories = [
    {
        key: "software",
        label: "소프트웨어",
        eyebrow: "Software FAQ",
        title: "플랫폼 도입과 운영에 대한 질문",
        description: "수업 운영, 접속 환경, 연동, 보안, 요금제처럼 도입 전에 가장 많이 확인하시는 내용을 정리했습니다.",
        highlights: ["웹 기반 접속", "LMS·API 연동", "데이터 보안"],
        items: [
            {
                question: "도입하는 데 얼마나 걸리나요?",
                answer: "대부분의 경우 48시간 이내에 데이터 이관과 기본 세팅을 완료합니다. 첫 주에는 강사분들을 위한 집중 교육 세션을 제공해 빠르게 적응하실 수 있도록 돕습니다.",
            },
            {
                question: "학생들에게 특정 기기가 필요한가요?",
                answer: "아니요. ClassIn은 웹 기반으로 작동하며 반응형을 지원합니다. 노트북, 태블릿, 스마트폰 등 어떤 기기에서도 별도의 설치 없이 사용 가능합니다.",
            },
            {
                question: "기존 시스템과 연동되나요?",
                answer: "네. 주요 LMS 및 CRM과의 연동을 지원하며, 자체 시스템이 있는 경우 API 기반 커스텀 연동도 검토할 수 있습니다. 도입 상담 시 현재 사용 중인 환경을 기준으로 안내해드립니다.",
            },
            {
                question: "학원의 콘텐츠와 학생 데이터는 안전한가요?",
                answer: "모든 수업 자료와 학생 데이터는 암호화되어 보관되며, 데이터 소유권은 기관에 있습니다. 접근 권한을 엄격하게 관리해 무단 유출을 방지할 수 있도록 설계했습니다.",
            },
            {
                question: "요금 체계는 어떻게 되나요?",
                answer: "기관 규모, 재원생 수, 필요한 기능에 따라 맞춤형으로 안내합니다. 강사 계정과 관리자 계정 운영 방식도 함께 검토해 실제 운영에 맞는 구성을 제안드립니다.",
            },
        ],
    },
    {
        key: "hardware",
        label: "하드웨어",
        eyebrow: "Hardware FAQ",
        title: "좋은 교실은, 도입부터 단순해야 합니다",
        description: "ClassIn Board는 판서, 기록, 공유, 복습까지 한 흐름으로 이어지도록 설계된 교육 전용 보드입니다. 모델 선택부터 설치, 온보딩, 유지보수까지 도입 전에 가장 많이 확인하시는 내용을 정리했습니다.",
        highlights: ["공간별 모델 제안", "1일 설치 · 현장 온보딩", "원격지원 · 출장 A/S"],
        items: [
            {
                question: "우리 교실에는 어떤 모델이 가장 잘 맞나요?",
                answer: "가장 많이 선택되는 구성은 75인치와 86인치입니다. 1:1·소그룹 수업이나 소규모 교실은 75인치, 일반 교실과 라이브 강의 운영은 86인치가 많이 선택됩니다. 50명 이상 대형 공간이나 설명회·강당은 110인치 모델까지 함께 검토합니다.",
            },
            {
                question: "설치에는 얼마나 걸리나요?",
                answer: "현장 환경 확인과 일정 조율 후, 대부분의 설치는 하루 안에 마무리됩니다. 수업 공백을 최소화하는 방향으로 설치 계획을 잡고, 설치 직후 바로 활용하실 수 있도록 교사 온보딩도 함께 지원합니다.",
            },
            {
                question: "별도 PC나 카메라를 따로 준비해야 하나요?",
                answer: "기본적으로는 별도 본체 없이 사용할 수 있도록 OPS PC와 AI 카메라, 마이크, 소프트웨어 흐름까지 함께 구성됩니다. 운영 방식에 따라 필요한 옵션만 추가로 검토하시면 됩니다.",
            },
            {
                question: "판서와 수업 영상은 어떻게 저장되고 공유되나요?",
                answer: "판서는 PDF로, 수업 영상은 복습 가능한 형태로 저장되어 ClassIn 흐름 안에서 바로 공유할 수 있습니다. 수업이 끝난 뒤 따로 정리하고 업로드하는 일을 줄여주는 것이 핵심입니다.",
            },
            {
                question: "기존 칠판이나 빔프로젝터를 쓰던 교실에도 설치할 수 있나요?",
                answer: "대부분 가능합니다. 벽면 상태, 전원, 네트워크, 시야 거리 같은 기본 조건을 현장 실측 단계에서 먼저 확인하고, 현재 교실 구조를 크게 흔들지 않는 방향으로 설치 구성을 제안드립니다.",
            },
            {
                question: "도입 후 A/S와 운영 지원은 어떻게 진행되나요?",
                answer: "설치 이후에도 원격 지원과 유지보수를 이어가며, 필요한 경우 출장 A/S까지 연결합니다. 처음 도입할 때만 잘 되는 장비가 아니라, 매일 수업에서 안정적으로 쓰일 수 있도록 지원 체계를 함께 제공합니다.",
            },
        ],
    },
] as const

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
                            {faqCategories.map((category) => (
                                <TabsTrigger
                                    key={category.key}
                                    value={category.key}
                                    className="rounded-full px-5 py-2.5 text-sm font-semibold text-[#615D59] data-[state=active]:bg-white data-[state=active]:text-[#084734] data-[state=active]:shadow-none"
                                >
                                    {category.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        {faqCategories.map((category) => (
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
