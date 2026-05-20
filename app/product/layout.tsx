import { createPublicMetadata } from "@/lib/seo"
import { ProductTabNav } from "@/components/sections/ProductTabNav"

export const metadata = createPublicMetadata({
    title: "제품 소개: 소프트웨어와 전자칠판",
    description:
        "Classin 소프트웨어와 Classin Board 전자칠판 구성을 확인하고, 학원 운영에 맞는 도입 방식을 비교해 보세요.",
    path: "/product",
    keywords: ["Classin 제품", "학원 소프트웨어", "교육용 전자칠판", "Classin Board"],
})

export default function ProductLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            <ProductTabNav />
            {children}
        </>
    )
}
