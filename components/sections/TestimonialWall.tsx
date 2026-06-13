"use client"

import { motion } from "framer-motion"
import { Quote, Star } from "lucide-react"
import { TESTIMONIALS } from "@/lib/testimonials"

const featuredTestimonials = TESTIMONIALS.filter((item) => item.highlight)
const supportingTestimonials = TESTIMONIALS.filter((item) => !item.highlight)

function StarRating({ rating = 5, light = false }: { rating?: number; light?: boolean }) {
    return (
        <div className="flex gap-0.5" aria-label={`별점 ${rating}점`}>
            {Array.from({ length: rating }).map((_, index) => (
                <Star
                    key={index}
                    className={`h-3.5 w-3.5 ${light ? "fill-[#D7B56D] text-[#D7B56D]" : "fill-[#084734] text-[#084734]"}`}
                />
            ))}
        </div>
    )
}

export function TestimonialWall() {
    const leadTestimonial = featuredTestimonials[0]
    const secondaryTestimonials = featuredTestimonials.slice(1)

    return (
        <section className="overflow-hidden bg-[#F7F8F5] py-20 md:py-28">
            <div className="container mx-auto px-4">
                <div className="mx-auto max-w-6xl">
                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.5 }}
                        className="max-w-3xl"
                    >
                        <div>
                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#084734]/15 bg-white px-3 py-1 text-xs font-semibold text-[#084734]">
                                원장님 후기
                            </div>
                            <h2 className="max-w-2xl text-3xl font-extrabold leading-tight text-[#111110] sm:text-4xl md:text-5xl break-keep">
                                실제 원장님들의 말이
                                <br className="hidden sm:block" />{" "}
                                가장 빠른 증거가 됩니다
                            </h2>
                            <p className="mt-5 max-w-2xl text-base leading-7 text-[#615D59] break-keep">
                                원문 표현은 유지하고, 어떤 경험에서 나온 말인지 함께 볼 수 있게 정리했습니다.
                            </p>
                        </div>
                    </motion.div>

                    {leadTestimonial && (
                        <motion.figure
                            initial={{ opacity: 0, y: 22 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-80px" }}
                            transition={{ duration: 0.55, delay: 0.08 }}
                            className="mt-12 grid overflow-hidden rounded-lg border border-[#084734]/20 bg-[#0B3328] shadow-[0_24px_70px_rgba(17,17,16,0.12)] lg:grid-cols-[1.05fr_0.95fr]"
                        >
                            <div className="flex min-h-[330px] flex-col justify-between p-7 text-white sm:p-9">
                                <div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#084734]">
                                            대표 후기
                                        </span>
                                        <StarRating rating={leadTestimonial.rating} light />
                                    </div>

                                    <Quote className="mt-10 h-9 w-9 fill-[#D7B56D] text-[#D7B56D]" />
                                    <blockquote className="mt-5 text-xl font-semibold leading-[1.75] sm:text-2xl break-keep">
                                        {leadTestimonial.quote}
                                    </blockquote>
                                    <p className="mt-6 rounded-[8px] bg-white/10 px-4 py-3 text-sm font-medium leading-6 text-white/72">
                                        <span className="font-bold text-white">경험 요약</span> · {leadTestimonial.summary}
                                    </p>
                                </div>

                                <figcaption className="mt-10 flex items-end justify-between gap-5 border-t border-white/15 pt-5">
                                    <div>
                                        <div className="text-sm font-bold">{leadTestimonial.role}</div>
                                        <div className="mt-1 text-xs text-white/60">{leadTestimonial.badge}</div>
                                    </div>
                                    <div className="text-xs font-semibold text-white/55">Classin</div>
                                </figcaption>
                            </div>

                            <div className="grid gap-px bg-white/10 p-px sm:grid-cols-2 lg:grid-cols-1">
                                {secondaryTestimonials.map((item, index) => (
                                    <div key={item.id} className="flex flex-col justify-between bg-[#F4FBF6] p-6 sm:p-7">
                                        <div>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="rounded-full bg-[#084734] px-2.5 py-1 text-[11px] font-bold text-white">
                                                    {item.badge}
                                                </span>
                                                <StarRating rating={item.rating} />
                                            </div>
                                            <blockquote className="mt-6 text-[15px] font-semibold leading-7 text-[#111110] break-keep">
                                                &ldquo;{item.quote}&rdquo;
                                            </blockquote>
                                            <p className="mt-4 text-[12px] font-medium leading-5 text-[#615D59]">
                                                <span className="font-bold text-[#084734]">경험 요약</span> · {item.summary}
                                            </p>
                                        </div>
                                        <figcaption className="mt-7 flex items-center justify-between border-t border-[#084734]/10 pt-4 text-xs">
                                            <span className="font-semibold text-[#084734]">{item.role}</span>
                                            <span className="text-[#615D59]">후기 {index + 2}</span>
                                        </figcaption>
                                    </div>
                                ))}
                            </div>
                        </motion.figure>
                    )}

                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {supportingTestimonials.map((item, index) => (
                            <motion.figure
                                key={item.id}
                                initial={{ opacity: 0, y: 18 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-80px" }}
                                transition={{ duration: 0.45, delay: Math.min(index * 0.06, 0.2) }}
                                className="flex min-h-[210px] flex-col rounded-lg border border-[#E3E4DC] bg-white p-5 shadow-[0_10px_30px_rgba(17,17,16,0.045)]"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="rounded-full bg-[#F0F1EB] px-2.5 py-1 text-[11px] font-bold text-[#615D59]">
                                        {item.badge}
                                    </span>
                                    <StarRating rating={item.rating} />
                                </div>

                                <blockquote className="mt-5 flex-1 text-[14px] leading-7 text-[#31302E] break-keep">
                                    &ldquo;{item.quote}&rdquo;
                                </blockquote>
                                <p className="mt-4 text-[12px] font-medium leading-5 text-[#615D59]">
                                    <span className="font-bold text-[#084734]">경험 요약</span> · {item.summary}
                                </p>

                                <figcaption className="mt-5 flex items-center justify-between border-t border-black/[0.06] pt-4 text-xs">
                                    <span className="font-semibold text-[#615D59]">{item.role}</span>
                                    <span className="text-[#A39E98]">Classin</span>
                                </figcaption>
                            </motion.figure>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}
