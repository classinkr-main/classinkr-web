"use client"

import { motion } from "framer-motion"
import { TESTIMONIALS } from "@/lib/testimonials"

export function TestimonialWall() {
    return (
        <section className="bg-white py-20 md:py-28">
            <div className="container mx-auto px-4">
                <div className="mx-auto max-w-3xl text-center">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#084734]/15 bg-[#ECFDF5] px-3 py-1 text-xs font-semibold tracking-[0.125px] text-[#084734]">
                        원장님 후기
                    </div>
                    <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-[#111110] sm:text-4xl break-keep">
                        원장님들이 직접 보내주신 한 줄
                    </h2>
                    <p className="mt-4 text-base text-[#615D59] break-keep">
                        매니저에게 카톡과 문자로 도착한 실제 후기를 옮겼습니다. 원장님과 학원명은 익명 처리했습니다.
                    </p>
                </div>

                <div className="mx-auto mt-14 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {TESTIMONIALS.map((item, index) => (
                        <motion.figure
                            key={item.id}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-80px" }}
                            transition={{ duration: 0.45, delay: Math.min(index * 0.06, 0.3) }}
                            className={`relative flex flex-col gap-4 rounded-2xl border p-6 sm:p-7 ${
                                item.highlight
                                    ? "border-[#084734]/20 bg-[#ECFDF5]"
                                    : "border-black/[0.08] bg-white"
                            } ${index === 1 ? "lg:row-span-2" : ""}`}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.125px] ${
                                        item.highlight
                                            ? "bg-[#084734] text-white"
                                            : "bg-[#F6F5F4] text-[#615D59]"
                                    }`}
                                >
                                    {item.badge}
                                </span>
                                <span className="text-xs font-medium text-[#A39E98]">{item.role}</span>
                            </div>

                            <blockquote
                                className={`text-[15px] leading-[1.7] break-keep ${
                                    item.highlight ? "text-[#111110] font-medium" : "text-[#31302E]"
                                }`}
                            >
                                <span aria-hidden className="mr-0.5 select-none text-[#084734]/40">“</span>
                                {item.quote}
                                <span aria-hidden className="ml-0.5 select-none text-[#084734]/40">”</span>
                            </blockquote>

                            <figcaption className="mt-auto flex items-center justify-between border-t border-black/[0.06] pt-3 text-xs text-[#A39E98]">
                                <span>실 사용 원장님 후기</span>
                                <span className="font-medium text-[#615D59]">ClassIn</span>
                            </figcaption>
                        </motion.figure>
                    ))}
                </div>
            </div>
        </section>
    )
}
