import { PageHeader } from "@/components/ui/PageHeader"
import { PricingCalculator } from "@/components/sections/PricingCalculator"

export default function PricingPage() {
    return (
        <>
            <PageHeader
                heading="직관적이고 투명한 요금제"
                text="복잡한 계산은 저희가 할게요. 학원 운영 패턴에 맞춰 최적의 요금제를 추천해 드립니다."
            />
            {/* 이 블록이 페이지 전체의 배경이 됩니다 (약간 어두운 톤) */}
            <div className="w-full bg-[#f4f6f8]">
                <section className="container py-12 md:py-20 lg:py-24">
                    <PricingCalculator />
                </section>
            </div>
        </>
    )
}
