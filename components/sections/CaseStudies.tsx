"use client"

import { Card, CardContent } from "@/components/ui/card"

const cases = [
    "부천 정*** 학원",
    "온라인 ***에듀",
    "부산 과** 학원",
    "청주 이** 국어 학원",
]

export function CaseStudies() {
    return (
        <section className="py-16 md:py-24 bg-[#F6F5F4]">
            <div className="container mx-auto">
                <h2 className="text-3xl font-extrabold text-center text-[#111110] sm:text-4xl mb-16 break-keep" style={{ letterSpacing: '-1px' }}>
                    성공적인 도입 사례
                </h2>

                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                    {cases.map((caseName, index) => (
                        <Card key={caseName} className="border border-[rgba(0,0,0,0.08)] bg-white transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
                            <CardContent className="flex min-h-[144px] flex-col justify-between p-7">
                                <div className="text-sm font-semibold text-[#A39E98]">
                                    {String(index + 1).padStart(2, "0")}
                                </div>
                                <h3 className="mt-8 text-xl font-extrabold leading-snug text-[#111110] break-keep">
                                    {caseName}
                                </h3>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    )
}
