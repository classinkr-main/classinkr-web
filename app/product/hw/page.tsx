"use client"

import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import { Cpu, Wifi, ShieldCheck, Fingerprint, ArrowRight } from "lucide-react"

const products = [
    {
        name: "Classin Gate",
        desc: "학생 등·하원 시 자동 출결 처리 및 학부모 실시간 알림을 제공하는 스마트 게이트 시스템",
        icon: Fingerprint,
        color: "bg-blue-50 text-blue-600 border-blue-100",
        iconBg: "bg-blue-100",
    },
    {
        name: "Classin Kiosk",
        desc: "학생증 태그 또는 QR 스캔으로 출결을 기록하고 공지사항을 표시하는 멀티터치 키오스크",
        icon: Cpu,
        color: "bg-purple-50 text-purple-600 border-purple-100",
        iconBg: "bg-purple-100",
    },
    {
        name: "Classin Beacon",
        desc: "교실 내 BLE 비콘을 통한 자동 위치 인식으로 수업 참여 여부를 정밀하게 추적",
        icon: Wifi,
        color: "bg-green-50 text-green-600 border-green-100",
        iconBg: "bg-green-100",
    },
    {
        name: "Classin ID Card",
        desc: "NFC 내장 스마트 학생증으로 출결, 도서 대출, 결제까지 하나로 통합",
        icon: ShieldCheck,
        color: "bg-orange-50 text-orange-600 border-orange-100",
        iconBg: "bg-orange-100",
    },
]

export default function ProductHWPage() {
    return (
        <div className="bg-[#FDFCF8] min-h-screen text-slate-900 font-sans selection:bg-orange-200 pt-20">

            {/* Hero */}
            <section className="container mx-auto px-4 lg:px-8 pt-12 md:pt-20 pb-20">
                <div className="max-w-3xl">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100/50 text-purple-600 text-sm font-semibold mb-8 border border-purple-200/50">
                            <Cpu className="w-3.5 h-3.5" />
                            하드웨어 솔루션
                        </div>
                        <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-[4rem] font-serif leading-[1.15] tracking-tight mb-6 text-[#1a1a19]">
                            소프트웨어와 완벽히
                            <br />
                            연동되는 스마트 기기
                        </h1>
                        <p className="text-xl text-slate-500 leading-relaxed font-medium max-w-2xl">
                            Classin 하드웨어는 SW 플랫폼과 실시간으로 연동되어 출결 관리, 보안, 결제를 자동화합니다. 설치부터 유지보수까지 원스톱으로 지원합니다.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Products Grid */}
            <section className="pb-24">
                <div className="container mx-auto px-4 lg:px-8">
                    <div className="grid md:grid-cols-2 gap-6 max-w-5xl">
                        {products.map((product, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className={`p-8 rounded-2xl border ${product.color} group hover:shadow-lg transition-all cursor-pointer`}
                            >
                                <div className={`w-14 h-14 rounded-2xl ${product.iconBg} flex items-center justify-center mb-6`}>
                                    <product.icon className="w-7 h-7" />
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900 mb-3">{product.name}</h3>
                                <p className="text-slate-600 leading-relaxed font-medium">{product.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-20 bg-white border-t border-slate-100">
                <div className="container mx-auto px-4 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-3xl md:text-4xl font-serif text-[#1a1a19] mb-4">
                            하드웨어 도입 상담
                        </h2>
                        <p className="text-lg text-slate-500 mb-8 max-w-xl mx-auto">
                            학원 규모와 환경에 맞는 최적의 하드웨어 구성을 제안해드립니다.
                        </p>
                        <Button className="bg-[#E05024] hover:bg-[#C9431A] text-white rounded-full px-10 h-14 text-base font-bold shadow-[0_8px_20px_rgba(224,80,36,0.3)] hover:shadow-[0_12px_25px_rgba(224,80,36,0.4)] transition-all hover:scale-105 group">
                            도입 문의하기
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </motion.div>
                </div>
            </section>
        </div>
    )
}
