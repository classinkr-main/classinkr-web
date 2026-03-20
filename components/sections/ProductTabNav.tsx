"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Monitor, Cpu } from "lucide-react"

const tabs = [
    { name: "소프트웨어", href: "/product/sw", icon: Monitor },
    { name: "하드웨어", href: "/product/hw", icon: Cpu },
]

export function ProductTabNav() {
    const pathname = usePathname()

    return (
        <div className="sticky top-[65px] z-40 bg-[#FDFCF8]/80 backdrop-blur-md border-b border-slate-200/60">
            <div className="container mx-auto px-4">
                <div className="flex items-center gap-1 py-2.5">
                    {tabs.map((tab) => {
                        const isActive = pathname === tab.href
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={cn(
                                    "inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all",
                                    isActive
                                        ? "bg-[#E05024] text-white shadow-sm"
                                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
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
    )
}
