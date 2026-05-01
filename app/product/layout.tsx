import { createPublicMetadata } from "@/lib/seo"
import { ProductTabNav } from "@/components/sections/ProductTabNav"

export const metadata = createPublicMetadata({
    title: "제품 소개",
    description:
        "Classin의 소프트웨어와 하드웨어 제품 구성을 확인하고, 학원 운영에 맞는 도입 방식을 비교해 보세요.",
    path: "/product",
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
