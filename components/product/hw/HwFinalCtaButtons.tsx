"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import { BROCHURE_URL } from "@/lib/marketing-links"

/* 최종 CTA 버튼 — trackEvent 핸들러 때문에 클라이언트로 분리 */
export default function HwFinalCtaButtons() {
    return (
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild className="h-14 rounded-full bg-[#009060] px-10 text-base font-bold text-white shadow-[0_8px_20px_rgba(0,144,96,0.24)] transition-all hover:scale-105 hover:bg-[#007A52] hover:shadow-[0_12px_25px_rgba(0,144,96,0.32)] group">
                <Link
                    href="/contact#contact-form"
                    onClick={() => trackEvent("click_cta", { button: "hw_final_inquiry", page: "/product/hw" })}
                >
                도입 문의하기
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full px-10 h-14 text-base font-bold border-slate-300 hover:border-slate-400 text-slate-700 hover:bg-slate-50 transition-all">
                <a
                    href={BROCHURE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("download_materials", { asset_id: "hw_brochure", page: "/product/hw" })}
                >
                서비스 소개서 보기
                </a>
            </Button>
        </div>
    )
}
