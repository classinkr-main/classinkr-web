import { ProductTabNav } from "@/components/sections/ProductTabNav"

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
