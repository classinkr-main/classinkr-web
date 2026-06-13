"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Pencil, Presentation } from "lucide-react"

const tabs = [
    { name: "Classin 소프트웨어", href: "/product/sw", icon: Pencil },
    { name: "Classin Board", href: "/product/hw", icon: Presentation },
]

export function ProductTabNav() {
    const pathname = usePathname()

    return (
        <>
        {/* 불투명도를 높여 스크롤 시 뒤로 비치는 섹션 제목이 지저분하게 겹쳐 보이지 않게 한다 */}
        <div className="md:hidden sticky top-[80px] z-40 bg-[#FAFAF8]/95 backdrop-blur-md border-b border-black/[0.06]">
            <div className="container mx-auto px-4">
                <div className="flex items-center gap-1 py-2.5">
                    {tabs.map((tab) => {
                        const isActive = pathname === tab.href
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={cn(
                                    "inline-flex items-center gap-2 whitespace-nowrap px-3 py-2 rounded-full text-[13px] font-semibold transition-all sm:px-5 sm:text-sm",
                                    isActive
                                        ? "bg-[#ECFDF5] text-[#084734] shadow-sm"
                                        : "text-[#615D59] hover:text-[#111110] hover:bg-[#F6F5F4]"
                                )}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.name}
                            </Link>
                        )
                    })}
                </div>
            </div>
        </div>
        </>
    )
}
